import React, { useState, useEffect } from 'react';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';

function StageManager({ projectId, currentStage, onStageSelect }) {
  const [stages, setStages] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageDesc, setNewStageDesc] = useState('');
  const [editingStage, setEditingStage] = useState(null);
  const [showVideoSelector, setShowVideoSelector] = useState(false);
  const [videoSelectorType, setVideoSelectorType] = useState('before'); // 'before' | 'after'
  const { addToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    loadStages();
  }, [projectId]);

  const loadStages = async () => {
    try {
      const allStages = await window.electronAPI.getStagesByProject(projectId);
      setStages(allStages);
    } catch (error) {
      console.error('加载阶段失败:', error);
      addToast('加载阶段列表失败', 'error');
    }
  };

  const handleCreateStage = async (e) => {
    e.preventDefault();
    if (!newStageName.trim()) return;

    try {
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
      addToast('阶段创建成功', 'success');
    } catch (error) {
      console.error('创建阶段失败:', error);
      addToast('创建阶段失败', 'error');
    }
  };

  const handleDeleteStage = async (e, stageId) => {
    e.stopPropagation();
    const confirmed = await confirm({
      title: '删除阶段',
      message: '确定要删除这个阶段吗？这将删除所有相关的工序数据。',
      confirmText: '确认删除',
      type: 'danger'
    });

    if (confirmed) {
      try {
        await window.electronAPI.deleteStage(stageId);
        if (currentStage?.id === stageId) {
          onStageSelect(null);
        }
        await loadStages();
        addToast('阶段已删除', 'success');
      } catch (error) {
        console.error('删除阶段失败:', error);
        addToast('删除阶段失败', 'error');
      }
    }
  };

  const handleSelectVideoFile = async (type) => {
    try {
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
        addToast('视频已更新', 'success');
      }
    } catch (error) {
      console.error('选择视频失败:', error);
      addToast('选择视频失败', 'error');
    }
  };

  const openEditModal = (stage) => {
    setEditingStage(stage);
    setShowEditModal(true);
  };

  // 获取当前阶段之前的所有阶段的可用视频
  const getAvailableVideos = () => {
    if (!editingStage) return [];

    const videos = [];
    const editingIndex = stages.findIndex(s => s.id === editingStage.id);

    // 遍历当前阶段之前的所有阶段
    for (let i = 0; i < editingIndex; i++) {
      const stage = stages[i];
      if (stage.before_video_path) {
        videos.push({
          stageId: stage.id,
          stageName: stage.name,
          type: 'before',
          label: `${stage.name} - 改善前`,
          path: stage.before_video_path
        });
      }
      if (stage.after_video_path) {
        videos.push({
          stageId: stage.id,
          stageName: stage.name,
          type: 'after',
          label: `${stage.name} - 改善后`,
          path: stage.after_video_path
        });
      }
    }

    return videos;
  };

  // 获取推荐的默认视频（上一阶段的改善后视频）
  const getRecommendedVideo = () => {
    if (!editingStage) return null;

    const editingIndex = stages.findIndex(s => s.id === editingStage.id);
    if (editingIndex <= 0) return null;

    // 从后往前找，找到第一个有改善后视频的阶段
    for (let i = editingIndex - 1; i >= 0; i--) {
      if (stages[i].after_video_path) {
        return {
          stageId: stages[i].id,
          stageName: stages[i].name,
          type: 'after',
          label: `${stages[i].name} - 改善后`,
          path: stages[i].after_video_path
        };
      }
    }
    return null;
  };

  // 打开视频选择器
  const openVideoSelector = (type) => {
    setVideoSelectorType(type);
    setShowVideoSelector(true);
  };

  // 选择已有视频
  const handleSelectExistingVideo = async (videoPath) => {
    if (!editingStage) return;

    try {
      const updateData = {
        name: editingStage.name,
        description: editingStage.description || '',
        beforeVideoPath: videoSelectorType === 'before' ? videoPath : editingStage.before_video_path,
        afterVideoPath: videoSelectorType === 'after' ? videoPath : editingStage.after_video_path
      };

      await window.electronAPI.updateStage(editingStage.id, updateData);
      await loadStages();

      const updatedStage = await window.electronAPI.getStage(editingStage.id);
      setEditingStage(updatedStage);
      if (currentStage?.id === editingStage.id) {
        onStageSelect(updatedStage);
      }
      setShowVideoSelector(false);
      addToast('视频已更新', 'success');
    } catch (error) {
      console.error('更新视频失败:', error);
      addToast('更新视频失败', 'error');
    }
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
                  {getAvailableVideos().length > 0 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => openVideoSelector('before')}
                      title="从已有阶段选择视频"
                    >
                      选择已有
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleSelectVideoFile('before')}
                  >
                    上传文件
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
                    上传文件
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

      {/* 视频选择器弹窗 */}
      {showVideoSelector && (
        <div className="modal-overlay" onClick={() => setShowVideoSelector(false)}>
          <div className="modal video-selector-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>选择{videoSelectorType === 'before' ? '改善前' : '改善后'}视频</h3>
              <button
                className="modal-close"
                onClick={() => setShowVideoSelector(false)}
              >
                ×
              </button>
            </div>
            <div className="video-selector-content">
              <p className="selector-hint">从已有阶段中选择视频：</p>
              <div className="video-options">
                {getAvailableVideos().map((video, index) => {
                  const recommended = getRecommendedVideo();
                  const isRecommended = recommended && recommended.path === video.path;
                  const isSelected = (videoSelectorType === 'before'
                    ? editingStage?.before_video_path
                    : editingStage?.after_video_path) === video.path;

                  return (
                    <div
                      key={index}
                      className={`video-option ${isSelected ? 'selected' : ''} ${isRecommended ? 'recommended' : ''}`}
                      onClick={() => handleSelectExistingVideo(video.path)}
                    >
                      <div className="video-option-info">
                        <span className="video-option-label">{video.label}</span>
                        {isRecommended && <span className="recommended-badge">推荐</span>}
                      </div>
                      <span className="video-option-path" title={video.path}>
                        {video.path.split('/').pop()}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="selector-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowVideoSelector(false);
                    handleSelectVideoFile(videoSelectorType);
                  }}
                >
                  上传新文件
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowVideoSelector(false)}
                >
                  取消
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
