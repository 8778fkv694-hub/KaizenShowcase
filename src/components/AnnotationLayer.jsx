import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  getVideoRenderRect,
  toPixel,
  toNormalized,
  isPointInVideoArea,
  ANNOTATION_TYPES,
  ANNOTATION_COLORS,
  STROKE_WIDTHS
} from '../utils/annotation';

// 防抖函数
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function AnnotationLayer({
  videoRef,
  processId,
  videoType,
  currentTime,
  isEditing,
  onAnnotationsChange
}) {
  const [annotations, setAnnotations] = useState([]);
  const [videoRect, setVideoRect] = useState(null);
  const [selectedTool, setSelectedTool] = useState(ANNOTATION_TYPES.ARROW);
  const [isSelectMode, setIsSelectMode] = useState(false); // 框选模式
  const [selectBox, setSelectBox] = useState(null); // 框选区域 {startX, startY, endX, endY}
  const [selectedColor, setSelectedColor] = useState(ANNOTATION_COLORS[0]);
  const [selectedStrokeWidth, setSelectedStrokeWidth] = useState(3);
  const [selectedDuration, setSelectedDuration] = useState(3); // 默认显示3秒
  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [drawEnd, setDrawEnd] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [textPosition, setTextPosition] = useState(null);
  const [toolbarPosition, setToolbarPosition] = useState({ x: null, y: null });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [undoStack, setUndoStack] = useState([]); // 撤销栈，存储最近创建的标注ID

  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const toolbarRef = useRef(null);

  // 加载标注数据
  useEffect(() => {
    if (processId && videoType) {
      loadAnnotations();
    } else {
      setAnnotations([]);
    }
  }, [processId, videoType]);

  const loadAnnotations = async () => {
    try {
      const data = await window.electronAPI.getAnnotationsByProcess(processId, videoType);
      setAnnotations(data || []);
    } catch (error) {
      console.error('加载标注失败:', error);
    }
  };

  // 监听视频尺寸变化
  useEffect(() => {
    const updateRect = () => {
      if (videoRef?.current) {
        const rect = getVideoRenderRect(videoRef.current);
        setVideoRect(rect);
      }
    };

    const video = videoRef?.current;
    if (video) {
      video.addEventListener('loadedmetadata', updateRect);
      video.addEventListener('resize', updateRect);
      window.addEventListener('resize', updateRect);
      updateRect();
    }

    return () => {
      if (video) {
        video.removeEventListener('loadedmetadata', updateRect);
        video.removeEventListener('resize', updateRect);
      }
      window.removeEventListener('resize', updateRect);
    };
  }, [videoRef]);

  // 过滤当前时间应该显示的标注
  const visibleAnnotations = useMemo(() => {
    return annotations.filter(a =>
      currentTime >= a.start_time &&
      (a.end_time === null || currentTime <= a.end_time)
    );
  }, [annotations, currentTime]);

  // 自动保存标注（防抖）
  const debouncedSave = useMemo(
    () => debounce(async (annotation) => {
      try {
        await window.electronAPI.updateAnnotation(annotation.id, {
          startTime: annotation.start_time,
          endTime: annotation.end_time,
          x: annotation.x,
          y: annotation.y,
          width: annotation.width,
          height: annotation.height,
          endX: annotation.end_x,
          endY: annotation.end_y,
          text: annotation.text,
          color: annotation.color,
          strokeWidth: annotation.stroke_width
        });
      } catch (error) {
        console.error('保存标注失败:', error);
      }
    }, 500),
    []
  );

  // 获取鼠标在容器中的位置
  const getMousePosition = useCallback((e) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, []);

  // 开始绘制
  const handleMouseDown = useCallback((e) => {
    if (!isEditing || !videoRect) return;

    const pos = getMousePosition(e);
    if (!pos || !isPointInVideoArea(pos.x, pos.y, videoRect)) return;

    // 框选模式
    if (isSelectMode) {
      setSelectBox({ startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y });
      setIsDrawing(true);
      return;
    }

    if (selectedTool === ANNOTATION_TYPES.TEXT) {
      // 文字标注特殊处理
      setTextPosition(pos);
      setShowTextInput(true);
      return;
    }

    setIsDrawing(true);
    setDrawStart(pos);
    setDrawEnd(pos);
    setSelectedAnnotation(null);
  }, [isEditing, videoRect, selectedTool, isSelectMode, getMousePosition]);

  // 绘制中
  const handleMouseMove = useCallback((e) => {
    if (!isDrawing || !videoRect) return;

    const pos = getMousePosition(e);
    if (pos) {
      // 框选模式
      if (isSelectMode && selectBox) {
        setSelectBox(prev => ({ ...prev, endX: pos.x, endY: pos.y }));
        return;
      }
      setDrawEnd(pos);
    }
  }, [isDrawing, videoRect, isSelectMode, selectBox, getMousePosition]);

  // 检测标注是否在选择框内
  const isAnnotationInSelectBox = useCallback((annotation, box) => {
    if (!videoRect || !box) return false;

    const boxMinX = Math.min(box.startX, box.endX);
    const boxMaxX = Math.max(box.startX, box.endX);
    const boxMinY = Math.min(box.startY, box.endY);
    const boxMaxY = Math.max(box.startY, box.endY);

    // 将标注坐标转换为像素
    const pixelCoords = toPixel({
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
      endX: annotation.end_x,
      endY: annotation.end_y
    }, videoRect);

    // 根据标注类型判断是否在框内
    switch (annotation.annotation_type) {
      case ANNOTATION_TYPES.ARROW:
        // 箭头：起点或终点在框内
        return (pixelCoords.x >= boxMinX && pixelCoords.x <= boxMaxX &&
                pixelCoords.y >= boxMinY && pixelCoords.y <= boxMaxY) ||
               (pixelCoords.endX >= boxMinX && pixelCoords.endX <= boxMaxX &&
                pixelCoords.endY >= boxMinY && pixelCoords.endY <= boxMaxY);
      case ANNOTATION_TYPES.CIRCLE:
        // 圆形：圆心在框内
        return pixelCoords.x >= boxMinX && pixelCoords.x <= boxMaxX &&
               pixelCoords.y >= boxMinY && pixelCoords.y <= boxMaxY;
      case ANNOTATION_TYPES.RECTANGLE:
        // 矩形：任意角落在框内或中心在框内
        const rectCenterX = pixelCoords.x + (pixelCoords.width || 0) / 2;
        const rectCenterY = pixelCoords.y + (pixelCoords.height || 0) / 2;
        return (rectCenterX >= boxMinX && rectCenterX <= boxMaxX &&
                rectCenterY >= boxMinY && rectCenterY <= boxMaxY) ||
               (pixelCoords.x >= boxMinX && pixelCoords.x <= boxMaxX &&
                pixelCoords.y >= boxMinY && pixelCoords.y <= boxMaxY);
      case ANNOTATION_TYPES.TEXT:
        // 文字：起点在框内
        return pixelCoords.x >= boxMinX && pixelCoords.x <= boxMaxX &&
               pixelCoords.y >= boxMinY && pixelCoords.y <= boxMaxY;
      default:
        return false;
    }
  }, [videoRect]);

  // 结束绘制
  const handleMouseUp = useCallback(async () => {
    // 框选模式处理
    if (isSelectMode && selectBox) {
      // 查找选择框内的标注
      const selectedAnnotations = visibleAnnotations.filter(a => isAnnotationInSelectBox(a, selectBox));
      if (selectedAnnotations.length > 0) {
        // 选中第一个找到的标注
        setSelectedAnnotation(selectedAnnotations[0]);
      } else {
        setSelectedAnnotation(null);
      }
      setSelectBox(null);
      setIsDrawing(false);
      return;
    }

    if (!isDrawing || !drawStart || !drawEnd || !videoRect) {
      setIsDrawing(false);
      return;
    }

    // 计算归一化坐标
    const startNorm = toNormalized(drawStart, videoRect);
    const endNorm = toNormalized(drawEnd, videoRect);

    // 计算结束时间：0 表示持续显示，其他值表示持续秒数
    const endTime = selectedDuration === 0 ? null : currentTime + selectedDuration;

    let annotationData = {
      videoType,
      annotationType: selectedTool,
      startTime: currentTime,
      endTime: endTime,
      color: selectedColor,
      strokeWidth: selectedStrokeWidth
    };

    switch (selectedTool) {
      case ANNOTATION_TYPES.ARROW:
        annotationData.x = startNorm.x;
        annotationData.y = startNorm.y;
        annotationData.endX = endNorm.x;
        annotationData.endY = endNorm.y;
        break;
      case ANNOTATION_TYPES.CIRCLE:
        const centerX = (startNorm.x + endNorm.x) / 2;
        const centerY = (startNorm.y + endNorm.y) / 2;
        const radius = Math.sqrt(
          Math.pow(endNorm.x - startNorm.x, 2) + Math.pow(endNorm.y - startNorm.y, 2)
        ) / 2;
        annotationData.x = centerX;
        annotationData.y = centerY;
        annotationData.width = radius;
        break;
      case ANNOTATION_TYPES.RECTANGLE:
        annotationData.x = Math.min(startNorm.x, endNorm.x);
        annotationData.y = Math.min(startNorm.y, endNorm.y);
        annotationData.width = Math.abs(endNorm.x - startNorm.x);
        annotationData.height = Math.abs(endNorm.y - startNorm.y);
        break;
    }

    try {
      const newId = await window.electronAPI.createAnnotation(processId, annotationData);
      // 添加到撤销栈
      setUndoStack(prev => [...prev, newId]);
      await loadAnnotations();
      onAnnotationsChange?.();
    } catch (error) {
      console.error('创建标注失败:', error);
    }

    setIsDrawing(false);
    setDrawStart(null);
    setDrawEnd(null);
  }, [isDrawing, drawStart, drawEnd, videoRect, selectedTool, currentTime, selectedColor, selectedStrokeWidth, selectedDuration, processId, videoType, onAnnotationsChange, isSelectMode, selectBox, visibleAnnotations, isAnnotationInSelectBox]);

  // 添加文字标注
  const handleAddText = async () => {
    if (!textInput.trim() || !textPosition || !videoRect) {
      setShowTextInput(false);
      setTextInput('');
      return;
    }

    const posNorm = toNormalized(textPosition, videoRect);
    const endTime = selectedDuration === 0 ? null : currentTime + selectedDuration;

    try {
      const newId = await window.electronAPI.createAnnotation(processId, {
        videoType,
        annotationType: ANNOTATION_TYPES.TEXT,
        startTime: currentTime,
        endTime: endTime,
        x: posNorm.x,
        y: posNorm.y,
        text: textInput.trim(),
        color: selectedColor,
        strokeWidth: selectedStrokeWidth
      });
      // 添加到撤销栈
      setUndoStack(prev => [...prev, newId]);
      await loadAnnotations();
      onAnnotationsChange?.();
    } catch (error) {
      console.error('创建文字标注失败:', error);
    }

    setShowTextInput(false);
    setTextInput('');
    setTextPosition(null);
  };

  // 删除选中的标注
  const handleDeleteSelected = async () => {
    if (!selectedAnnotation) return;

    try {
      await window.electronAPI.deleteAnnotation(selectedAnnotation.id);
      // 从撤销栈中移除
      setUndoStack(prev => prev.filter(id => id !== selectedAnnotation.id));
      await loadAnnotations();
      setSelectedAnnotation(null);
      onAnnotationsChange?.();
    } catch (error) {
      console.error('删除标注失败:', error);
    }
  };

  // 撤销最近的标注
  const handleUndo = async () => {
    if (undoStack.length === 0) return;

    const lastId = undoStack[undoStack.length - 1];

    try {
      await window.electronAPI.deleteAnnotation(lastId);
      setUndoStack(prev => prev.slice(0, -1));
      if (selectedAnnotation?.id === lastId) {
        setSelectedAnnotation(null);
      }
      await loadAnnotations();
      onAnnotationsChange?.();
    } catch (error) {
      console.error('撤销标注失败:', error);
    }
  };

  // 修改选中标注的持续时间
  const handleUpdateAnnotationDuration = async (newDuration) => {
    if (!selectedAnnotation) return;

    const newEndTime = newDuration === 0 ? null : selectedAnnotation.start_time + newDuration;

    try {
      await window.electronAPI.updateAnnotation(selectedAnnotation.id, {
        startTime: selectedAnnotation.start_time,
        endTime: newEndTime,
        x: selectedAnnotation.x,
        y: selectedAnnotation.y,
        width: selectedAnnotation.width,
        height: selectedAnnotation.height,
        endX: selectedAnnotation.end_x,
        endY: selectedAnnotation.end_y,
        text: selectedAnnotation.text,
        color: selectedAnnotation.color,
        strokeWidth: selectedAnnotation.stroke_width
      });

      // 更新本地状态
      setSelectedAnnotation({
        ...selectedAnnotation,
        end_time: newEndTime
      });
      await loadAnnotations();
      onAnnotationsChange?.();
    } catch (error) {
      console.error('更新标注持续时间失败:', error);
    }
  };

  // 点击标注选中
  const handleAnnotationClick = (e, annotation) => {
    if (!isEditing) return;
    e.stopPropagation();
    setSelectedAnnotation(annotation);
  };

  // 工具栏拖动
  const handleToolbarMouseDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') {
      return; // 不拦截输入控件
    }
    e.preventDefault();
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const rect = toolbar.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDraggingToolbar(true);
  };

  const handleToolbarMouseMove = useCallback((e) => {
    if (!isDraggingToolbar || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newX = e.clientX - containerRect.left - dragOffset.x;
    const newY = e.clientY - containerRect.top - dragOffset.y;

    setToolbarPosition({
      x: Math.max(0, Math.min(newX, containerRect.width - 200)),
      y: Math.max(0, Math.min(newY, containerRect.height - 50))
    });
  }, [isDraggingToolbar, dragOffset]);

  const handleToolbarMouseUp = useCallback(() => {
    setIsDraggingToolbar(false);
  }, []);

  // 监听拖动事件
  useEffect(() => {
    if (isDraggingToolbar) {
      document.addEventListener('mousemove', handleToolbarMouseMove);
      document.addEventListener('mouseup', handleToolbarMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleToolbarMouseMove);
      document.removeEventListener('mouseup', handleToolbarMouseUp);
    };
  }, [isDraggingToolbar, handleToolbarMouseMove, handleToolbarMouseUp]);

  // 渲染时间角标
  const renderTimeBadge = (annotation, x, y, color) => {
    if (!annotation.id) return null; // 预览不显示角标
    if (!isEditing) return null; // 播放时隐藏角标

    const duration = annotation.end_time !== null
      ? Math.round((annotation.end_time - annotation.start_time) * 10) / 10
      : null;
    const badgeText = duration !== null ? `${duration}s` : '∞';

    return (
      <g className="time-badge">
        <rect
          x={x - 2}
          y={y - 12}
          width={badgeText.length * 7 + 6}
          height={14}
          rx={3}
          fill="rgba(0,0,0,0.75)"
        />
        <text
          x={x + 1}
          y={y - 2}
          fill={color}
          fontSize={10}
          fontWeight="bold"
          style={{ userSelect: 'none' }}
        >
          {badgeText}
        </text>
      </g>
    );
  };

  // 渲染单个标注
  const renderAnnotation = (annotation, isPreview = false) => {
    if (!videoRect) return null;

    const pixelCoords = toPixel({
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
      endX: annotation.end_x,
      endY: annotation.end_y
    }, videoRect);

    const isSelected = selectedAnnotation?.id === annotation.id;
    const color = annotation.color || '#FF0000';
    const strokeWidth = annotation.stroke_width || 3;
    const opacity = isPreview ? 0.6 : 1;

    const commonProps = {
      stroke: color,
      strokeWidth: strokeWidth,
      fill: 'none',
      opacity,
      style: { cursor: isEditing ? 'pointer' : 'default' },
      onClick: (e) => handleAnnotationClick(e, annotation)
    };

    switch (annotation.annotation_type) {
      case ANNOTATION_TYPES.ARROW:
        const dx = pixelCoords.endX - pixelCoords.x;
        const dy = pixelCoords.endY - pixelCoords.y;
        const angle = Math.atan2(dy, dx);
        const headLength = 15;
        const headAngle = Math.PI / 6;

        return (
          <g key={annotation.id || 'preview'}>
            <line
              x1={pixelCoords.x}
              y1={pixelCoords.y}
              x2={pixelCoords.endX}
              y2={pixelCoords.endY}
              {...commonProps}
            />
            {/* 箭头头部 */}
            <line
              x1={pixelCoords.endX}
              y1={pixelCoords.endY}
              x2={pixelCoords.endX - headLength * Math.cos(angle - headAngle)}
              y2={pixelCoords.endY - headLength * Math.sin(angle - headAngle)}
              {...commonProps}
            />
            <line
              x1={pixelCoords.endX}
              y1={pixelCoords.endY}
              x2={pixelCoords.endX - headLength * Math.cos(angle + headAngle)}
              y2={pixelCoords.endY - headLength * Math.sin(angle + headAngle)}
              {...commonProps}
            />
            {/* 时间角标 */}
            {renderTimeBadge(annotation, pixelCoords.endX + 5, pixelCoords.endY - 5, color)}
            {isSelected && (
              <>
                <circle cx={pixelCoords.x} cy={pixelCoords.y} r={6} fill={color} />
                <circle cx={pixelCoords.endX} cy={pixelCoords.endY} r={6} fill={color} />
              </>
            )}
          </g>
        );

      case ANNOTATION_TYPES.CIRCLE:
        const radius = (pixelCoords.width || 0.05) * videoRect.renderWidth;
        return (
          <g key={annotation.id || 'preview'}>
            <circle
              cx={pixelCoords.x}
              cy={pixelCoords.y}
              r={radius}
              {...commonProps}
            />
            {/* 时间角标 - 右上角 */}
            {renderTimeBadge(annotation, pixelCoords.x + radius * 0.7, pixelCoords.y - radius * 0.7, color)}
            {isSelected && (
              <circle cx={pixelCoords.x} cy={pixelCoords.y} r={6} fill={color} />
            )}
          </g>
        );

      case ANNOTATION_TYPES.RECTANGLE:
        return (
          <g key={annotation.id || 'preview'}>
            <rect
              x={pixelCoords.x}
              y={pixelCoords.y}
              width={pixelCoords.width || 50}
              height={pixelCoords.height || 50}
              {...commonProps}
            />
            {/* 时间角标 - 右上角 */}
            {renderTimeBadge(annotation, pixelCoords.x + (pixelCoords.width || 50) - 20, pixelCoords.y - 2, color)}
            {isSelected && (
              <>
                <circle cx={pixelCoords.x} cy={pixelCoords.y} r={6} fill={color} />
                <circle cx={pixelCoords.x + (pixelCoords.width || 50)} cy={pixelCoords.y + (pixelCoords.height || 50)} r={6} fill={color} />
              </>
            )}
          </g>
        );

      case ANNOTATION_TYPES.TEXT:
        return (
          <g key={annotation.id || 'preview'} onClick={(e) => handleAnnotationClick(e, annotation)}>
            <text
              x={pixelCoords.x}
              y={pixelCoords.y}
              fill={color}
              fontSize={16 * (strokeWidth / 3)}
              fontWeight="bold"
              style={{
                cursor: isEditing ? 'pointer' : 'default',
                textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                userSelect: 'none'
              }}
            >
              {annotation.text}
            </text>
            {/* 时间角标 - 文字右侧 */}
            {renderTimeBadge(annotation, pixelCoords.x + (annotation.text?.length || 1) * 9, pixelCoords.y - 14, color)}
            {isSelected && (
              <rect
                x={pixelCoords.x - 4}
                y={pixelCoords.y - 16}
                width={annotation.text.length * 10 + 8}
                height={24}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeDasharray="4 2"
              />
            )}
          </g>
        );

      default:
        return null;
    }
  };

  // 渲染正在绘制的预览
  const renderDrawingPreview = () => {
    if (!isDrawing || !drawStart || !drawEnd || !videoRect) return null;

    const startNorm = toNormalized(drawStart, videoRect);
    const endNorm = toNormalized(drawEnd, videoRect);

    let previewAnnotation = {
      annotation_type: selectedTool,
      color: selectedColor,
      stroke_width: selectedStrokeWidth
    };

    switch (selectedTool) {
      case ANNOTATION_TYPES.ARROW:
        previewAnnotation.x = startNorm.x;
        previewAnnotation.y = startNorm.y;
        previewAnnotation.end_x = endNorm.x;
        previewAnnotation.end_y = endNorm.y;
        break;
      case ANNOTATION_TYPES.CIRCLE:
        previewAnnotation.x = (startNorm.x + endNorm.x) / 2;
        previewAnnotation.y = (startNorm.y + endNorm.y) / 2;
        previewAnnotation.width = Math.sqrt(
          Math.pow(endNorm.x - startNorm.x, 2) + Math.pow(endNorm.y - startNorm.y, 2)
        ) / 2;
        break;
      case ANNOTATION_TYPES.RECTANGLE:
        previewAnnotation.x = Math.min(startNorm.x, endNorm.x);
        previewAnnotation.y = Math.min(startNorm.y, endNorm.y);
        previewAnnotation.width = Math.abs(endNorm.x - startNorm.x);
        previewAnnotation.height = Math.abs(endNorm.y - startNorm.y);
        break;
    }

    return renderAnnotation(previewAnnotation, true);
  };

  if (!processId) return null;

  return (
    <div
      ref={containerRef}
      className="annotation-layer-container"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: isEditing ? 'auto' : 'none'
      }}
    >
      {/* SVG 标注层 */}
      <svg
        ref={svgRef}
        className="annotation-svg"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* 定义箭头标记 */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={selectedColor} />
          </marker>
        </defs>

        {/* 渲染已有标注 */}
        {visibleAnnotations.map(annotation => renderAnnotation(annotation))}

        {/* 渲染绘制预览 */}
        {renderDrawingPreview()}

        {/* 渲染选择框 */}
        {selectBox && (
          <rect
            x={Math.min(selectBox.startX, selectBox.endX)}
            y={Math.min(selectBox.startY, selectBox.endY)}
            width={Math.abs(selectBox.endX - selectBox.startX)}
            height={Math.abs(selectBox.endY - selectBox.startY)}
            fill="rgba(0, 120, 255, 0.15)"
            stroke="#0078FF"
            strokeWidth={2}
            strokeDasharray="5 3"
            className="selection-box"
          />
        )}
      </svg>

      {/* 文字输入框 */}
      {showTextInput && textPosition && (
        <div
          className="text-input-popup"
          style={{
            position: 'absolute',
            left: textPosition.x,
            top: textPosition.y,
            zIndex: 1000
          }}
        >
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddText();
              if (e.key === 'Escape') {
                setShowTextInput(false);
                setTextInput('');
              }
            }}
            placeholder="输入文字..."
            autoFocus
          />
          <button onClick={handleAddText}>确定</button>
          <button onClick={() => { setShowTextInput(false); setTextInput(''); }}>取消</button>
        </div>
      )}

      {/* 编辑工具栏 - 可拖动 */}
      {isEditing && (
        <div
          ref={toolbarRef}
          className={`annotation-toolbar ${isDraggingToolbar ? 'dragging' : ''}`}
          style={toolbarPosition.x !== null ? {
            left: toolbarPosition.x,
            top: toolbarPosition.y,
            bottom: 'auto',
            transform: 'none'
          } : {}}
          onMouseDown={handleToolbarMouseDown}
        >
          <div className="toolbar-drag-handle" title="拖动移动工具栏">⋮⋮</div>
          <div className="toolbar-section">
            <button
              className={`tool-btn ${selectedTool === ANNOTATION_TYPES.ARROW && !isSelectMode ? 'active' : ''}`}
              onClick={() => { setSelectedTool(ANNOTATION_TYPES.ARROW); setIsSelectMode(false); }}
              title="箭头"
            >
              ➔
            </button>
            <button
              className={`tool-btn ${selectedTool === ANNOTATION_TYPES.CIRCLE && !isSelectMode ? 'active' : ''}`}
              onClick={() => { setSelectedTool(ANNOTATION_TYPES.CIRCLE); setIsSelectMode(false); }}
              title="圆圈"
            >
              ○
            </button>
            <button
              className={`tool-btn ${selectedTool === ANNOTATION_TYPES.RECTANGLE && !isSelectMode ? 'active' : ''}`}
              onClick={() => { setSelectedTool(ANNOTATION_TYPES.RECTANGLE); setIsSelectMode(false); }}
              title="矩形"
            >
              □
            </button>
            <button
              className={`tool-btn ${selectedTool === ANNOTATION_TYPES.TEXT && !isSelectMode ? 'active' : ''}`}
              onClick={() => { setSelectedTool(ANNOTATION_TYPES.TEXT); setIsSelectMode(false); }}
              title="文字"
            >
              T
            </button>
            <span className="toolbar-divider">|</span>
            <button
              className={`tool-btn select-btn ${isSelectMode ? 'active' : ''}`}
              onClick={() => setIsSelectMode(!isSelectMode)}
              title="框选工具 - 拖动框选标注"
            >
              ⊡
            </button>
          </div>

          <div className="toolbar-section">
            <span className="toolbar-label">颜色:</span>
            {ANNOTATION_COLORS.map(color => (
              <button
                key={color}
                className={`color-btn ${selectedColor === color ? 'active' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => setSelectedColor(color)}
              />
            ))}
          </div>

          <div className="toolbar-section">
            <span className="toolbar-label">粗细:</span>
            <select
              value={selectedStrokeWidth}
              onChange={(e) => setSelectedStrokeWidth(Number(e.target.value))}
            >
              {STROKE_WIDTHS.map(w => (
                <option key={w} value={w}>{w}px</option>
              ))}
            </select>
          </div>

          <div className="toolbar-section">
            <span className="toolbar-label">持续:</span>
            <input
              type="number"
              min="0"
              max="60"
              step="0.5"
              value={selectedDuration}
              onChange={(e) => setSelectedDuration(Math.max(0, Number(e.target.value)))}
              title="标注显示持续时间(秒)，0=持续显示"
              className="duration-input"
            />
            <span className="toolbar-hint">秒</span>
          </div>

          {selectedAnnotation && (
            <div className="toolbar-section selected-annotation-controls">
              <span className="toolbar-label">选中:</span>
              <input
                type="number"
                min="0"
                max="60"
                step="0.5"
                value={selectedAnnotation.end_time !== null
                  ? Math.round((selectedAnnotation.end_time - selectedAnnotation.start_time) * 10) / 10
                  : 0}
                onChange={(e) => handleUpdateAnnotationDuration(Number(e.target.value))}
                title="修改选中标注的持续时间"
                className="duration-input"
              />
              <span className="toolbar-hint">秒</span>
              <button
                className="delete-btn"
                onClick={handleDeleteSelected}
                title="删除选中标注"
              >
                删除
              </button>
            </div>
          )}

          <div className="toolbar-section">
            <button
              className={`tool-btn undo-btn ${undoStack.length === 0 ? 'disabled' : ''}`}
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              title={undoStack.length > 0 ? `撤销 (${undoStack.length})` : '无可撤销'}
            >
              ↩
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnnotationLayer;
