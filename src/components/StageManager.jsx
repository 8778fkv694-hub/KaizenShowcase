import React, { useState, useEffect } from 'react';

function StageManager({ projectId, currentStage, onStageSelect }) {
  const [stages, setStages] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageDesc, setNewStageDesc] = useState('');
  const [editingStage, setEditingStage] = useState(null);

  useEffect(() => {
    loadStages();
  }, [projectId]);

  const loadStages = async () => {
    const allStages = await window.electronAPI.getStagesByProject(projectId);
    setStages(allStages);
  };

  const handleCreateStage = async (e) => {
    e.preventDefault();
    if (!newStageName.trim()) return;

    const stageId = await window.electronAPI.createStage(
      projectId,
      newStageName.trim(),
      newStageDesc.trim()
    );

    setNewStageName('');
    setNewStageDesc('');
    setShowCreateModal(false);
    await loadStages();

    // 自动选择新建的阶段
    const stage = await window.electronAPI.getStage(stageId);
    onStageSelect(stage);
  };

  const handleDeleteStage = async (e, stageId) => {
    e.stopPropagation();
    if (confirm('确定要删除这个阶段吗？这将删除所有相关的工序数据。')) {
      await window.electronAPI.deleteStage(stageId);
      if (currentStage?.id === stageId) {
        onStageSelect(null);
      }
      await loadStages();
    }
  };

  const handleSelectVideoFile = async (type) => {
    const filePath = await window.electronAPI.selectVideoFile();
    if (filePath && editingStage) {
      const updateData = {
        name: editingStage.name,
        description: editingStage.description || '',
        beforeVideoPath: type === 'before' ? filePath : editingStage.before_video_path,
        afterVideoPath: type === 'after' ? filePath : editingStage.after_video_path
      };

      await window.electronAPI.updateStage(editingStage.id, updateData);
      await loadStages();

      // 更新当前阶段
      const updatedStage = await window.electronAPI.getStage(editingStage.id);
      setEditingStage(updatedStage);
      if (currentStage?.id === editingStage.id) {
        onStageSelect(updatedStage);
      }
    }
  };

  const openEditModal = (stage) => {
    setEditingStage(stage);
    setShowEditModal(true);
  };

  return (
    <div className="stage-manager">
      <div className="section-header">
        <h3>📁 改善阶段</h3>
        <button
          className="add-btn"
          onClick={() => setShowCreateModal(true)}
          title="新建阶段"
        >
          +
        </button>
      </div>

      <div className="stage-list">
        {stages.length === 0 ? (
          <div className="empty-hint">
            <p>暂无阶段</p>
          </div>
        ) : (
          stages.map((stage) => (
            <div
              key={stage.id}
              className={`stage-item ${currentStage?.id === stage.id ? 'active' : ''}`}
              onClick={() => onStageSelect(stage)}
            >
              <div className="stage-info">
                <div className="stage-name">{stage.name}</div>
                <div className="stage-status">
                  {stage.before_video_path && stage.after_video_path ? (
                    <span className="status-complete">✓ 已配置</span>
                  ) : (
                    <span className="status-incomplete">⚠ 待配置</span>
                  )}
                </div>
              </div>
              <div className="stage-actions">
                <button
                  className="edit-btn-small"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditModal(stage);
                  }}
                  title="编辑"
                >
                  ✎
                </button>
                <button
                  className="delete-btn-small"
                  onClick={(e) => handleDeleteStage(e, stage.id)}
                  title="删除"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 创建阶段模态框 */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>创建改善阶段</h3>
              <button
                className="modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateStage}>
              <div className="form-group">
                <label>阶段名称 *</label>
                <input
                  type="text"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  placeholder="例如：阶段1 - 初步改善"
                  autoFocus
                  required
                />
              </div>
              <div className="form-group">
                <label>阶段描述</label>
                <textarea
                  value={newStageDesc}
                  onChange={(e) => setNewStageDesc(e.target.value)}
                  placeholder="描述这个阶段的改善内容"
                  rows="3"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
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

      {/* 编辑阶段模态框 */}
      {showEditModal && editingStage && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>编辑阶段 - {editingStage.name}</h3>
              <button
                className="modal-close"
                onClick={() => setShowEditModal(false)}
              >
                ×
              </button>
            </div>
            <div className="form-content">
              <div className="form-group">
                <label>改善前视频</label>
                <div className="file-input-group">
                  <input
                    type="text"
                    value={editingStage.before_video_path || ''}
                    readOnly
                    placeholder="点击选择视频文件"
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleSelectVideoFile('before')}
                  >
                    选择文件
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>改善后视频</label>
                <div className="file-input-group">
                  <input
                    type="text"
                    value={editingStage.after_video_path || ''}
                    readOnly
                    placeholder="点击选择视频文件"
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleSelectVideoFile('after')}
                  >
                    选择文件
                  </button>
                </div>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowEditModal(false)}
                >
                  完成
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StageManager;
