import React, { memo } from 'react';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { formatTimeDetailed, formatTimeSavedDetailed } from '../utils/time';
import { useDragSort } from '../hooks/useDragSort';

function ProcessList({ processes, selectedProcess, onProcessSelect, onProcessUpdate, stage, onEditProcess }) {
  const { addToast } = useToast();
  const confirm = useConfirm();

  // 使用工具函数
  const formatTime = formatTimeDetailed;
  const formatTimeSaved = formatTimeSavedDetailed;

  // 拖拽排序
  const handleReorder = async (reorderedItems) => {
    try {
      // 更新每个工序的排序
      for (const item of reorderedItems) {
        await window.electronAPI.updateProcessOrder(item.id, item.sort_order);
      }
      onProcessUpdate();
      addToast('排序已更新', 'success');
    } catch (error) {
      console.error('更新排序失败:', error);
      addToast('更新排序失败', 'error');
    }
  };

  const { getDragProps } = useDragSort(processes, handleReorder);

  const handleDeleteProcess = async (e, processId) => {
    e.stopPropagation();
    const confirmed = await confirm({
      title: '删除工序',
      message: '确定要删除这个工序吗？',
      confirmText: '确认删除',
      type: 'danger'
    });

    if (confirmed) {
      try {
        await window.electronAPI.deleteProcess(processId);
        onProcessUpdate();
        addToast('工序已删除', 'success');
      } catch (error) {
        console.error('删除工序失败:', error);
        addToast('删除工序失败', 'error');
      }
    }
  };

  const getTotalTimeSaved = () => {
    return processes.reduce((sum, p) => sum + (p.time_saved || 0), 0);
  };

  return (
    <div className="process-list">
      <div className="section-header">
        <h3>⚙️ 工序列表</h3>
        <button
          className="add-btn"
          onClick={() => onEditProcess(null)}
          title="新建工序"
        >
          +
        </button>
      </div>

      {processes.length > 0 && (
        <div className={`time-saved-summary ${getTotalTimeSaved() < 0 ? 'time-increased' : ''}`}>
          <span className="summary-value">{formatTimeSaved(getTotalTimeSaved())}</span>
        </div>
      )}

      <div className="process-items">
        {processes.length === 0 ? (
          <div className="empty-hint">
            <p>暂无工序</p>
          </div>
        ) : (
          processes.map((process, index) => {
            const dragProps = getDragProps(index);
            return (
              <div
                key={process.id}
                className={`process-item ${selectedProcess?.id === process.id ? 'active' : ''} ${dragProps.className}`}
                onClick={() => onProcessSelect(process)}
                draggable={dragProps.draggable}
                onDragStart={dragProps.onDragStart}
                onDragEnd={dragProps.onDragEnd}
                onDragOver={dragProps.onDragOver}
                onDragLeave={dragProps.onDragLeave}
                onDrop={dragProps.onDrop}
              >
                <div className="process-content">
                  <div className="process-left">
                    <span className="drag-handle" title="拖拽排序">⋮⋮</span>
                    <div className="process-info">
                      <div className="process-header">
                        <span className="process-index">{index + 1}</span>
                        <span className="process-name">{process.name}</span>
                      </div>
                      <div className="process-details">
                        <div className="time-info">
                          <span className="time-label">改善前：</span>
                          <span className="time-value">
                            {formatTime(process.before_end_time - process.before_start_time)}
                          </span>
                        </div>
                        <div className="time-info">
                          <span className="time-label">改善后：</span>
                          <span className="time-value">
                            {formatTime(process.after_end_time - process.after_start_time)}
                          </span>
                        </div>
                        <div className={`time-saved ${(process.time_saved || 0) < 0 ? 'time-increased' : ''}`}>
                          <span className="saved-value">
                            {formatTimeSaved(process.time_saved)}
                          </span>
                        </div>
                      </div>
                      <div className="process-actions">
                        <button
                          className="play-btn-small"
                          onClick={(e) => {
                            e.stopPropagation();
                            onProcessSelect(process);
                          }}
                          title="播放"
                        >
                          ▶
                        </button>
                        <button
                          className="edit-btn-small"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditProcess(process);
                          }}
                          title="编辑"
                        >
                          ✎
                        </button>
                        <button
                          className="delete-btn-small"
                          onClick={(e) => handleDeleteProcess(e, process.id)}
                          title="删除"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* 右侧缩略图 */}
                  {process.thumbnail_path && (
                    <div className="process-thumbnail">
                      <img
                        src={`local-video://${process.thumbnail_path}?t=${Date.now()}`}
                        alt={process.name}
                        onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}

export default memo(ProcessList);
