import { useState, useCallback } from 'react';

/**
 * 拖拽排序Hook
 * @param {Array} items - 要排序的数组
 * @param {Function} onReorder - 排序完成回调
 * @returns {Object} - 拖拽相关的属性和方法
 */
export function useDragSort(items, onReorder) {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleDragStart = useCallback((e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
    // 添加拖拽效果
    e.target.classList.add('dragging');
  }, []);

  const handleDragEnd = useCallback((e) => {
    e.target.classList.remove('dragging');
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (index !== draggedIndex) {
      setDragOverIndex(index);
    }
  }, [draggedIndex]);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);

    if (sourceIndex !== dropIndex && !isNaN(sourceIndex)) {
      const newItems = [...items];
      const [removed] = newItems.splice(sourceIndex, 1);
      newItems.splice(dropIndex, 0, removed);

      // 更新排序序号
      const reorderedItems = newItems.map((item, idx) => ({
        ...item,
        sort_order: idx + 1
      }));

      onReorder(reorderedItems);
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [items, onReorder]);

  const getDragProps = useCallback((index) => ({
    draggable: true,
    onDragStart: (e) => handleDragStart(e, index),
    onDragEnd: handleDragEnd,
    onDragOver: (e) => handleDragOver(e, index),
    onDragLeave: handleDragLeave,
    onDrop: (e) => handleDrop(e, index),
    className: `${draggedIndex === index ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`
  }), [draggedIndex, dragOverIndex, handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop]);

  return {
    draggedIndex,
    dragOverIndex,
    getDragProps
  };
}
