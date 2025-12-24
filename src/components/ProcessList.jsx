import React, { useState } from 'react';

function ProcessList({ processes, selectedProcess, onProcessSelect, onProcessUpdate, stage }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProcess, setEditingProcess] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    improvementNote: '',
    beforeStart: 0,
    beforeEnd: 0,
    afterStart: 0,
    afterEnd: 0,
    processType: 'normal'  // normal, new_step, cancelled
  });

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;
  };

  const formatTimeSaved = (timeSaved) => {
    if (!timeSaved || timeSaved === 0) return '无变化';
    const absTime = Math.abs(timeSaved);
    const timeStr = formatTime(absTime);
    if (timeSaved > 0) {
      return `节省 ${timeStr}`;
    } else {
      return `增加 ${timeStr}`;
    }
  };

  const handleCreateProcess = async (e) => {
    e.preventDefault();
    await window.electronAPI.createProcess(stage.id, {
      name: formData.name,
      description: formData.description,
      improvementNote: formData.improvementNote,
      beforeStart: parseFloat(formData.beforeStart),
      beforeEnd: parseFloat(formData.beforeEnd),
      afterStart: parseFloat(formData.afterStart),
      afterEnd: parseFloat(formData.afterEnd),
      processType: formData.processType
    });

    resetForm();
    setShowCreateModal(false);
    onProcessUpdate();
  };

  const handleUpdateProcess = async (e) => {
    e.preventDefault();
    await window.electronAPI.updateProcess(editingProcess.id, {
      name: formData.name,
      description: formData.description,
      improvementNote: formData.improvementNote,
      beforeStart: parseFloat(formData.beforeStart),
      beforeEnd: parseFloat(formData.beforeEnd),
      afterStart: parseFloat(formData.afterStart),
      afterEnd: parseFloat(formData.afterEnd),
      processType: formData.processType
    });

    resetForm();
    setShowEditModal(false);
    setEditingProcess(null);
    onProcessUpdate();
  };

  const handleDeleteProcess = async (e, processId) => {
    e.stopPropagation();
    if (confirm('确定要删除这个工序吗？')) {
      await window.electronAPI.deleteProcess(processId);
      onProcessUpdate();
    }
  };

  const openEditModal = (process) => {
    setEditingProcess(process);
    setFormData({
      name: process.name,
      description: process.description || '',
      improvementNote: process.improvement_note || '',
      beforeStart: process.before_start_time,
      beforeEnd: process.before_end_time,
      afterStart: process.after_start_time,
      afterEnd: process.after_end_time,
      processType: process.process_type || 'normal'
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      improvementNote: '',
      beforeStart: 0,
      beforeEnd: 0,
      afterStart: 0,
      afterEnd: 0,
      processType: 'normal'
    });
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
          onClick={() => setShowCreateModal(true)}
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
          processes.map((process, index) => (
            <div
              key={process.id}
              className={`process-item ${selectedProcess?.id === process.id ? 'active' : ''}`}
              onClick={() => onProcessSelect(process)}
            >
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
                    openEditModal(process);
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
          ))
        )}
      </div>

      {/* 创建工序模态框 */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>创建工序</h3>
              <button
                className="modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateProcess}>
              <div className="form-group">
                <label>工序名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：物料准备"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>步骤类型 *</label>
                <select
                  value={formData.processType}
                  onChange={(e) => setFormData({ ...formData, processType: e.target.value })}
                  className="process-type-select"
                >
                  <option value="normal">正常对比（改善前后都有）</option>
                  <option value="new_step">新增步骤（仅改善后有）</option>
                  <option value="cancelled">取消步骤（仅改善前有）</option>
                </select>
              </div>
              <div className="form-group">
                <label>工序描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="描述这个工序的内容"
                  rows="2"
                />
              </div>
              <div className="form-group">
                <label>改善说明</label>
                <textarea
                  value={formData.improvementNote}
                  onChange={(e) => setFormData({ ...formData, improvementNote: e.target.value })}
                  placeholder="说明这个工序的改善内容和效果"
                  rows="2"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>改善前开始时间（秒）*</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.beforeStart}
                    onChange={(e) => setFormData({ ...formData, beforeStart: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>改善前结束时间（秒）*</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.beforeEnd}
                    onChange={(e) => setFormData({ ...formData, beforeEnd: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>改善后开始时间（秒）*</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.afterStart}
                    onChange={(e) => setFormData({ ...formData, afterStart: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>改善后结束时间（秒）*</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.afterEnd}
                    onChange={(e) => setFormData({ ...formData, afterEnd: e.target.value })}
                    required
                  />
                </div>
              </div>
              {formData.beforeStart && formData.beforeEnd && formData.afterStart && formData.afterEnd && (
                <div className="time-preview">
                  <p>
                    改善前时长：{formatTime(formData.beforeEnd - formData.beforeStart)} →
                    改善后时长：{formatTime(formData.afterEnd - formData.afterStart)}
                  </p>
                  <p className="saved-preview">
                    {formatTimeSaved((formData.beforeEnd - formData.beforeStart) - (formData.afterEnd - formData.afterStart))}
                  </p>
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                >
                  取消
                </button>
                <button type="submit" className="btn-primary">
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 编辑工序模态框 */}
      {showEditModal && editingProcess && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>编辑工序 - {editingProcess.name}</h3>
              <button
                className="modal-close"
                onClick={() => setShowEditModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleUpdateProcess}>
              <div className="form-group">
                <label>工序名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>步骤类型 *</label>
                <select
                  value={formData.processType}
                  onChange={(e) => setFormData({ ...formData, processType: e.target.value })}
                  className="process-type-select"
                >
                  <option value="normal">正常对比（改善前后都有）</option>
                  <option value="new_step">新增步骤（仅改善后有）</option>
                  <option value="cancelled">取消步骤（仅改善前有）</option>
                </select>
              </div>
              <div className="form-group">
                <label>工序描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows="2"
                />
              </div>
              <div className="form-group">
                <label>改善说明</label>
                <textarea
                  value={formData.improvementNote}
                  onChange={(e) => setFormData({ ...formData, improvementNote: e.target.value })}
                  rows="2"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>改善前开始时间（秒）*</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.beforeStart}
                    onChange={(e) => setFormData({ ...formData, beforeStart: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>改善前结束时间（秒）*</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.beforeEnd}
                    onChange={(e) => setFormData({ ...formData, beforeEnd: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>改善后开始时间（秒）*</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.afterStart}
                    onChange={(e) => setFormData({ ...formData, afterStart: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>改善后结束时间（秒）*</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.afterEnd}
                    onChange={(e) => setFormData({ ...formData, afterEnd: e.target.value })}
                    required
                  />
                </div>
              </div>
              {formData.beforeStart && formData.beforeEnd && formData.afterStart && formData.afterEnd && (
                <div className="time-preview">
                  <p>
                    改善前时长：{formatTime(formData.beforeEnd - formData.beforeStart)} →
                    改善后时长：{formatTime(formData.afterEnd - formData.afterStart)}
                  </p>
                  <p className="saved-preview">
                    {formatTimeSaved((formData.beforeEnd - formData.beforeStart) - (formData.afterEnd - formData.afterStart))}
                  </p>
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingProcess(null);
                    resetForm();
                  }}
                >
                  取消
                </button>
                <button type="submit" className="btn-primary">
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProcessList;
