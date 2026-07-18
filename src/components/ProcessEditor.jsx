import React, { useState, useRef, useEffect, memo } from 'react';
import { useToast } from './Toast';
import { formatTimeDetailed } from '../utils/time';
import ProcessTimelineMarker from './ProcessTimelineMarker';

/**
 * 工序编辑器 - 带视频预览，方便设置时间点
 */
function ProcessEditor({ stage, process, processes = [], onSave, onCancel, onThumbnailUpdate, narrationSpeed = 5.0 }) {
  const isEditing = !!process;
  const beforeVideoRef = useRef(null);
  const afterVideoRef = useRef(null);
  const { addToast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    improvementNote: '',
    beforeStart: 0,
    beforeEnd: 0,
    afterStart: 0,
    afterEnd: 0,
    processType: 'normal',
    subtitleText: '',
    subtitleMode: 'integrated', // integrated (整合) or separate (分离)
    subtitleAfter: '',
    improverName: '',
    improverAvatar: '',
    summaryEnabled: false,
    summaryType: 'layout',
    summaryImagePath: '',
    summaryEffects: '',
    summaryBenefits: '',
    summarySpeech: ''
  });

  const [beforeCurrentTime, setBeforeCurrentTime] = useState(0);
  const [afterCurrentTime, setAfterCurrentTime] = useState(0);
  const [activeVideo, setActiveVideo] = useState('before'); // before 或 after
  const [beforeDuration, setBeforeDuration] = useState(0);
  const [afterDuration, setAfterDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  // 初始化表单数据
  useEffect(() => {
    if (process) {
      setFormData({
        name: process.name,
        description: process.description || '',
        improvementNote: process.improvement_note || '',
        beforeStart: process.before_start_time,
        beforeEnd: process.before_end_time,
        afterStart: process.after_start_time,
        afterEnd: process.after_end_time,
        processType: process.process_type || 'normal',
        subtitleText: process.subtitle_text || '',
        subtitleMode: process.subtitle_mode || 'integrated',
        subtitleAfter: process.subtitle_after || '',
        improverName: process.improver_name || '',
        improverAvatar: process.improver_avatar || '',
        summaryEnabled: !!process.summary_enabled,
        summaryType: process.summary_type || 'layout',
        summaryImagePath: process.summary_image_path || '',
        summaryEffects: process.summary_effects || '',
        summaryBenefits: process.summary_benefits || '',
        summarySpeech: process.summary_speech || ''
      });
      // 跳转到工序开始位置
      setTimeout(() => {
        if (beforeVideoRef.current && Number.isFinite(process.before_start_time)) {
          beforeVideoRef.current.currentTime = process.before_start_time;
        }
        if (afterVideoRef.current && Number.isFinite(process.after_start_time)) {
          afterVideoRef.current.currentTime = process.after_start_time;
        }
      }, 100);
    }
  }, [process]);

  const handleTimeUpdate = (type) => {
    if (type === 'before' && beforeVideoRef.current) {
      setBeforeCurrentTime(beforeVideoRef.current.currentTime);
    } else if (type === 'after' && afterVideoRef.current) {
      setAfterCurrentTime(afterVideoRef.current.currentTime);
    }
  };

  // 获取当前时间并填入表单
  const captureTime = (field) => {
    const time = field.includes('before') ? beforeCurrentTime : afterCurrentTime;
    setFormData(prev => ({ ...prev, [field]: parseFloat(time.toFixed(1)) }));
    addToast(`已设置: ${time.toFixed(1)}秒`, 'success');
  };

  // 跳转到指定时间
  const seekTo = (field) => {
    let time = parseFloat(formData[field]);
    if (!Number.isFinite(time)) time = 0;

    if (field.includes('before') && beforeVideoRef.current) {
      beforeVideoRef.current.currentTime = time;
      setActiveVideo('before');
    } else if (field.includes('after') && afterVideoRef.current) {
      afterVideoRef.current.currentTime = time;
      setActiveVideo('after');
    }
  };

  // 从时间轴标记跳转
  const handleSeekBefore = (time) => {
    if (beforeVideoRef.current) {
      beforeVideoRef.current.currentTime = time;
      setActiveVideo('before');
    }
  };

  const handleSeekAfter = (time) => {
    if (afterVideoRef.current) {
      afterVideoRef.current.currentTime = time;
      setActiveVideo('after');
    }
  };

  // 视频元数据加载
  const handleBeforeMetadataLoaded = () => {
    if (beforeVideoRef.current) {
      setBeforeDuration(beforeVideoRef.current.duration);
    }
  };

  const handleAfterMetadataLoaded = () => {
    if (afterVideoRef.current) {
      setAfterDuration(afterVideoRef.current.duration);
    }
  };

  // 截取视频当前帧作为缩略图
  const captureScreenshot = async (videoRef, videoType) => {
    if (!videoRef.current || !process?.id) {
      addToast('请先保存工序后再截图', 'error');
      return;
    }

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');

      // 设置缩略图尺寸（保持宽高比，宽度固定为320px）
      const aspectRatio = video.videoWidth / video.videoHeight;
      canvas.width = 320;
      canvas.height = Math.round(320 / aspectRatio);

      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // 转换为 data URL
      const dataUrl = canvas.toDataURL('image/png');

      // 保存到文件系统
      const filePath = await window.electronAPI.saveScreenshot(process.id, dataUrl);

      addToast(`缩略图已保存 (${videoType === 'before' ? '改善前' : '改善后'})`, 'success');

      // 刷新工序列表以显示新缩略图
      if (onThumbnailUpdate) {
        onThumbnailUpdate();
      }
    } catch (error) {
      console.error('截图失败:', error);
      addToast('截图保存失败', 'error');
    }
  };

  // 处理步骤类型切换
  const handleTypeChange = (e) => {
    const newType = e.target.value;
    const updates = { processType: newType };

    if (newType === 'new_step') {
      updates.beforeStart = 0;
      updates.beforeEnd = 0;
    } else if (newType === 'cancelled') {
      updates.afterStart = 0;
      updates.afterEnd = 0;
    }

    setFormData(prev => ({ ...prev, ...updates }));
  };

  const isBeforeDisabled = formData.processType === 'new_step';
  const isAfterDisabled = formData.processType === 'cancelled';

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      addToast('请输入工序名称', 'error');
      return;
    }

    const data = {
      name: formData.name,
      description: formData.description,
      improvementNote: formData.improvementNote,
      beforeStart: parseFloat(formData.beforeStart) || 0,
      beforeEnd: parseFloat(formData.beforeEnd) || 0,
      afterStart: parseFloat(formData.afterStart) || 0,
      afterEnd: parseFloat(formData.afterEnd) || 0,
      processType: formData.processType,
      subtitleText: formData.subtitleText,
      subtitleMode: formData.subtitleMode,
      subtitleAfter: formData.subtitleAfter,
      improverName: formData.improverName,
      improverAvatar: formData.improverAvatar,
      summaryEnabled: formData.summaryEnabled ? 1 : 0,
      summaryType: formData.summaryType,
      summaryImagePath: formData.summaryImagePath,
      summaryEffects: formData.summaryEffects,
      summaryBenefits: formData.summaryBenefits,
      summarySpeech: formData.summarySpeech
    };

    // 验证时间
    if (data.processType !== 'new_step' && data.beforeEnd <= data.beforeStart) {
      addToast('改善前结束时间必须大于开始时间', 'error');
      return;
    }
    if (data.processType !== 'cancelled' && data.afterEnd <= data.afterStart) {
      addToast('改善后结束时间必须大于开始时间', 'error');
      return;
    }

    try {
      await onSave(data, process?.id);
    } catch (error) {
      console.error('保存失败:', error);
      addToast('保存失败', 'error');
    }
  };

  const formatTime = formatTimeDetailed;

  return (
    <div className="process-editor">
      <div className="editor-header">
        <h2>{isEditing ? `编辑工序 - ${process.name}` : '创建新工序'}</h2>
        <button className="close-btn" onClick={onCancel}>×</button>
      </div>

      <div className="editor-content">
        {/* 视频预览区 */}
        <div className="video-preview-section">
          <div className={`video-preview ${activeVideo === 'before' ? 'active' : ''} ${isBeforeDisabled ? 'disabled' : ''}`}>
            <div className="preview-header">
              <span className="preview-label">改善前视频 {isBeforeDisabled ? '(无)' : ''}</span>
              <div className="preview-header-right">
                <button
                  type="button"
                  className="screenshot-btn"
                  onClick={() => captureScreenshot(beforeVideoRef, 'before')}
                  disabled={isBeforeDisabled || !isEditing}
                  title="截取当前画面作为缩略图"
                >
                  📷
                </button>
                <button
                  type="button"
                  className="screenshot-btn"
                  onClick={() => setIsMuted(!isMuted)}
                  title={isMuted ? "打开声音" : "关闭声音"}
                  style={{ marginLeft: '4px' }}
                >
                  {isMuted ? '🔇' : '🔊'}
                </button>
                <span className="current-time">{formatTime(beforeCurrentTime)}</span>
              </div>
            </div>
            <video
              ref={beforeVideoRef}
              src={stage.before_video_path ? `local-video://${stage.before_video_path}` : ''}
              onTimeUpdate={() => handleTimeUpdate('before')}
              onLoadedMetadata={handleBeforeMetadataLoaded}
              onClick={() => !isBeforeDisabled && setActiveVideo('before')}
              muted={isMuted}
              controls={!isBeforeDisabled}
              style={{ opacity: isBeforeDisabled ? 0.3 : 1, pointerEvents: isBeforeDisabled ? 'none' : 'auto' }}
            />
            <div className="time-capture-btns">
              <button
                type="button"
                onClick={() => captureTime('beforeStart')}
                className="capture-btn start"
                disabled={isBeforeDisabled}
              >
                设为开始时间
              </button>
              <button
                type="button"
                onClick={() => captureTime('beforeEnd')}
                className="capture-btn end"
                disabled={isBeforeDisabled}
              >
                设为结束时间
              </button>
            </div>
            {/* 工序时间轴标记 - 增加间距容器 */}
            <div className="editor-timeline-container">
              <ProcessTimelineMarker
                processes={processes}
                currentProcessId={process?.id}
                videoDuration={beforeDuration}
                videoType="before"
                onSeek={handleSeekBefore}
              />
            </div>
          </div>

          <div className={`video-preview ${activeVideo === 'after' ? 'active' : ''} ${isAfterDisabled ? 'disabled' : ''}`}>
            <div className="preview-header">
              <span className="preview-label">改善后视频 {isAfterDisabled ? '(无)' : ''}</span>
              <div className="preview-header-right">
                <button
                  type="button"
                  className="screenshot-btn"
                  onClick={() => captureScreenshot(afterVideoRef, 'after')}
                  disabled={isAfterDisabled || !isEditing}
                  title="截取当前画面作为缩略图"
                >
                  📷
                </button>
                <button
                  type="button"
                  className="screenshot-btn"
                  onClick={() => setIsMuted(!isMuted)}
                  title={isMuted ? "打开声音" : "关闭声音"}
                  style={{ marginLeft: '4px' }}
                >
                  {isMuted ? '🔇' : '🔊'}
                </button>
                <span className="current-time">{formatTime(afterCurrentTime)}</span>
              </div>
            </div>
            <video
              ref={afterVideoRef}
              src={stage.after_video_path ? `local-video://${stage.after_video_path}` : ''}
              onTimeUpdate={() => handleTimeUpdate('after')}
              onLoadedMetadata={handleAfterMetadataLoaded}
              onClick={() => !isAfterDisabled && setActiveVideo('after')}
              muted={isMuted}
              controls={!isAfterDisabled}
              style={{ opacity: isAfterDisabled ? 0.3 : 1, pointerEvents: isAfterDisabled ? 'none' : 'auto' }}
            />
            <div className="time-capture-btns">
              <button
                type="button"
                onClick={() => captureTime('afterStart')}
                className="capture-btn start"
                disabled={isAfterDisabled}
              >
                设为开始时间
              </button>
              <button
                type="button"
                onClick={() => captureTime('afterEnd')}
                className="capture-btn end"
                disabled={isAfterDisabled}
              >
                设为结束时间
              </button>
            </div>
            {/* 工序时间轴标记 - 增加间距容器 */}
            <div className="editor-timeline-container">
              <ProcessTimelineMarker
                processes={processes}
                currentProcessId={process?.id}
                videoDuration={afterDuration}
                videoType="after"
                onSeek={handleSeekAfter}
              />
            </div>
          </div>
        </div>

        {/* 表单区 */}
        <form className="editor-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>工序名称 *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如：物料准备"
              required
            />
          </div>

          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
              <label>改善人</label>
              <input
                type="text"
                value={formData.improverName}
                onChange={(e) => setFormData({ ...formData, improverName: e.target.value })}
                placeholder="例如：张三"
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>改善人头像</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {formData.improverAvatar && (
                  <img
                    src={`local-video://${formData.improverAvatar}`}
                    alt="头像"
                    style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #d1d5db' }}
                  />
                )}
                <button
                  type="button"
                  className="control-btn"
                  onClick={async () => {
                    try {
                      addToast('正在打开图片选择器...', 'info');
                      const path = await window.electronAPI.selectImageFile();
                      if (path) {
                        setFormData(prev => ({ ...prev, improverAvatar: path }));
                        addToast('头像选择成功', 'success');
                      }
                    } catch (err) {
                      console.error('选择头像失败:', err);
                      addToast('选择头像失败: ' + err.message, 'error');
                    }
                  }}
                  style={{ flex: 1, height: '38px', padding: '0 8px', fontSize: '13px', whiteSpace: 'nowrap', border: '1px solid #ccc', borderRadius: '4px', background: '#f9f9f9', cursor: 'pointer' }}
                >
                  {formData.improverAvatar ? '更换' : '上传'}
                </button>
                {formData.improverAvatar && (
                  <button
                    type="button"
                    className="control-btn danger"
                    onClick={() => setFormData(prev => ({ ...prev, improverAvatar: '' }))}
                    style={{ height: '38px', padding: '0 8px', border: '1px solid #ff4d4f', borderRadius: '4px', color: '#ff4d4f', background: 'none', cursor: 'pointer' }}
                    title="删除头像"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>步骤类型</label>
            <select
              value={formData.processType}
              onChange={handleTypeChange}
            >
              <option value="normal">正常对比</option>
              <option value="new_step">新增步骤 (改善前无)</option>
              <option value="cancelled">减少步骤 (改善后无)</option>
            </select>
          </div>

          <div className="time-inputs-section">
            <div className={`time-group ${isBeforeDisabled ? 'disabled' : ''}`}>
              <label>改善前时间段 {isBeforeDisabled ? '(无需编辑)' : ''}</label>
              <div className="time-inputs">
                <div className="time-input-wrapper">
                  <input
                    type="number"
                    step="0.1"
                    value={formData.beforeStart}
                    onChange={(e) => setFormData({ ...formData, beforeStart: e.target.value })}
                    placeholder="开始"
                    disabled={isBeforeDisabled}
                  />
                  <button
                    type="button"
                    onClick={() => seekTo('beforeStart')}
                    className="seek-btn"
                    title="跳转"
                    disabled={isBeforeDisabled}
                  >
                    ▶
                  </button>
                </div>
                <span className="time-separator">→</span>
                <div className="time-input-wrapper">
                  <input
                    type="number"
                    step="0.1"
                    value={formData.beforeEnd}
                    onChange={(e) => setFormData({ ...formData, beforeEnd: e.target.value })}
                    placeholder="结束"
                    disabled={isBeforeDisabled}
                  />
                  <button
                    type="button"
                    onClick={() => seekTo('beforeEnd')}
                    className="seek-btn"
                    title="跳转"
                    disabled={isBeforeDisabled}
                  >
                    ▶
                  </button>
                </div>
              </div>
              <span className="duration">
                时长: {formatTime(Math.max(0, formData.beforeEnd - formData.beforeStart))}
              </span>
            </div>

            <div className={`time-group ${isAfterDisabled ? 'disabled' : ''}`}>
              <label>改善后时间段 {isAfterDisabled ? '(无需编辑)' : ''}</label>
              <div className="time-inputs">
                <div className="time-input-wrapper">
                  <input
                    type="number"
                    step="0.1"
                    value={formData.afterStart}
                    onChange={(e) => setFormData({ ...formData, afterStart: e.target.value })}
                    placeholder="开始"
                    disabled={isAfterDisabled}
                  />
                  <button
                    type="button"
                    onClick={() => seekTo('afterStart')}
                    className="seek-btn"
                    title="跳转"
                    disabled={isAfterDisabled}
                  >
                    ▶
                  </button>
                </div>
                <span className="time-separator">→</span>
                <div className="time-input-wrapper">
                  <input
                    type="number"
                    step="0.1"
                    value={formData.afterEnd}
                    onChange={(e) => setFormData({ ...formData, afterEnd: e.target.value })}
                    placeholder="结束"
                    disabled={isAfterDisabled}
                  />
                  <button
                    type="button"
                    onClick={() => seekTo('afterEnd')}
                    className="seek-btn"
                    title="跳转"
                    disabled={isAfterDisabled}
                  >
                    ▶
                  </button>
                </div>
              </div>
              <span className="duration">
                时长: {formatTime(Math.max(0, formData.afterEnd - formData.afterStart))}
              </span>
            </div>
          </div>

          <div className="form-group">
            <label>改善说明</label>
            <textarea
              value={formData.improvementNote}
              onChange={(e) => setFormData({ ...formData, improvementNote: e.target.value })}
              placeholder="说明改善内容（文字描述）"
              rows="2"
            />
          </div>

          <div className="form-group subtitle-group">
            <div className="label-with-hint">
              <label>AI 讲解词 / 字幕</label>
              <div className="subtitle-mode-selector">
                <button
                  type="button"
                  className={`mode-tab ${formData.subtitleMode === 'integrated' ? 'active' : ''}`}
                  onClick={() => setFormData({ ...formData, subtitleMode: 'integrated' })}
                >
                  整合模式
                </button>
                <button
                  type="button"
                  className={`mode-tab ${formData.subtitleMode === 'separate' ? 'active' : ''}`}
                  onClick={() => setFormData({ ...formData, subtitleMode: 'separate' })}
                >
                  前后分离
                </button>
              </div>
            </div>

            {formData.subtitleMode === 'integrated' ? (
              <>
                <textarea
                  value={formData.subtitleText}
                  onChange={(e) => setFormData({ ...formData, subtitleText: e.target.value })}
                  placeholder="输入讲解词，两段视频将同步播放"
                  rows="6"
                />
                <div className="subtitle-info">
                  <span>字数: {formData.subtitleText.length}</span>
                  <span className="divider">|</span>
                  <span>预计时长: <span className="highlight">{(formData.subtitleText.length / narrationSpeed).toFixed(1)}s</span></span>
                  <span className="divider">|</span>
                  <span className="hint">({narrationSpeed}字/秒)</span>
                </div>
              </>
            ) : (
              <div className="separate-subtitles">
                <div className="sub-input-box">
                  <div className="box-header">改善前讲解词</div>
                  <textarea
                    value={formData.subtitleText}
                    onChange={(e) => setFormData({ ...formData, subtitleText: e.target.value })}
                    placeholder="输入改善前对应的讲解词"
                    rows="3"
                  />
                  <div className="subtitle-info micro">
                    <span>{formData.subtitleText.length}字</span>
                    <span className="divider">|</span>
                    <span>{(formData.subtitleText.length / narrationSpeed).toFixed(1)}s</span>
                  </div>
                </div>
                <div className="sub-input-box">
                  <div className="box-header">改善后讲解词</div>
                  <textarea
                    value={formData.subtitleAfter}
                    onChange={(e) => setFormData({ ...formData, subtitleAfter: e.target.value })}
                    placeholder="输入改善后对应的讲解词"
                    rows="3"
                  />
                  <div className="subtitle-info micro">
                    <span>{formData.subtitleAfter.length}字</span>
                    <span className="divider">|</span>
                    <span>{(formData.subtitleAfter.length / narrationSpeed).toFixed(1)}s</span>
                  </div>
                </div>
                <div className="subtitle-info total">
                  <span>总预计时长: <span className="highlight">{((formData.subtitleText.length + formData.subtitleAfter.length) / narrationSpeed).toFixed(1)}s</span></span>
                </div>
              </div>
            )}
          </div>
          {/* 改善总结页面 */}
          <div className="form-group" style={{ borderTop: '1px solid #eee', paddingTop: '16px', marginTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <input
                type="checkbox"
                id="summaryEnabled"
                checked={formData.summaryEnabled}
                onChange={(e) => setFormData({ ...formData, summaryEnabled: e.target.checked })}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="summaryEnabled" style={{ fontWeight: '600', fontSize: '14px', margin: 0, cursor: 'pointer' }}>
                启用改善总结页面 (在改善前和改善后视频播完后显示)
              </label>
            </div>

            {formData.summaryEnabled && (
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontWeight: '500', fontSize: '13px' }}>展示内容来源</label>
                  <div style={{ display: 'flex', gap: '20px', marginTop: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 'normal' }}>
                      <input
                        type="radio"
                        name="summaryType"
                        value="layout"
                        checked={formData.summaryType === 'layout'}
                        onChange={(e) => setFormData({ ...formData, summaryType: e.target.value })}
                        style={{ cursor: 'pointer' }}
                      />
                      自动标准版式 (标题、头像、改善效果与收益等)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 'normal' }}>
                      <input
                        type="radio"
                        name="summaryType"
                        value="image"
                        checked={formData.summaryType === 'image'}
                        onChange={(e) => setFormData({ ...formData, summaryType: e.target.value })}
                        style={{ cursor: 'pointer' }}
                      />
                      上传总结图片/幻灯片
                    </label>
                  </div>
                </div>

                {formData.summaryType === 'layout' ? (
                  <>
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label style={{ fontSize: '12px', color: '#4b5563' }}>改善效果 (多条以分号或换行分隔)</label>
                        <textarea
                          value={formData.summaryEffects}
                          onChange={(e) => setFormData({ ...formData, summaryEffects: e.target.value })}
                          placeholder="例如：1. 缩短取料动作路径；&#10;2. 取消不必要转身动作"
                          rows="3"
                          style={{ fontSize: '13px' }}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label style={{ fontSize: '12px', color: '#4b5563' }}>改善收益 (多条以分号或换行分隔)</label>
                        <textarea
                          value={formData.summaryBenefits}
                          onChange={(e) => setFormData({ ...formData, summaryBenefits: e.target.value })}
                          placeholder="例如：1. 效率提升 12.5%；&#10;2. 节省人工成本"
                          rows="3"
                          style={{ fontSize: '13px' }}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '12px', color: '#4b5563' }}>上传总结图片 *</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                      {formData.summaryImagePath && (
                        <img
                          src={`local-video://${formData.summaryImagePath}`}
                          alt="总结幻灯片"
                          style={{ width: '80px', height: '45px', objectFit: 'contain', border: '1px solid #d1d5db', borderRadius: '4px', background: '#000' }}
                        />
                      )}
                      <button
                        type="button"
                        className="control-btn"
                        onClick={async () => {
                          try {
                            addToast('正在打开图片选择器...', 'info');
                            const path = await window.electronAPI.selectImageFile();
                            if (path) {
                              setFormData(prev => ({ ...prev, summaryImagePath: path }));
                              addToast('图片选择成功', 'success');
                            }
                          } catch (err) {
                            console.error('选择图片失败:', err);
                            addToast('选择图片失败: ' + err.message, 'error');
                          }
                        }}
                        style={{ height: '36px', padding: '0 12px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}
                      >
                        {formData.summaryImagePath ? '重新上传图片' : '上传总结图片'}
                      </button>
                      {formData.summaryImagePath && (
                        <button
                          type="button"
                          className="control-btn danger"
                          onClick={() => setFormData(prev => ({ ...prev, summaryImagePath: '' }))}
                          style={{ height: '36px', padding: '0 8px', border: '1px solid #ff4d4f', borderRadius: '4px', color: '#ff4d4f', background: 'none', cursor: 'pointer' }}
                          title="删除"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '12px', color: '#4b5563' }}>总结配音台词 / 字幕 (由 AI 语音朗读)</label>
                  <textarea
                    value={formData.summarySpeech}
                    onChange={(e) => setFormData({ ...formData, summarySpeech: e.target.value })}
                    placeholder="输入在显示改善总结页面时由 AI 读出来的台词..."
                    rows="3"
                    style={{ fontSize: '13px' }}
                  />
                  {formData.summarySpeech && (
                    <div className="subtitle-info micro" style={{ marginTop: '4px' }}>
                      <span>{formData.summarySpeech.length}字</span>
                      <span className="divider">|</span>
                      <span>预计时长: <span className="highlight">{(formData.summarySpeech.length / narrationSpeed).toFixed(1)}s</span></span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="btn-primary">
              {isEditing ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default memo(ProcessEditor);
