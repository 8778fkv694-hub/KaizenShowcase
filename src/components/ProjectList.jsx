import React, { useState, useEffect, memo } from 'react';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import Loading from './Loading';
import DataTransferModal from './DataTransferModal';

function ProjectList({ onProjectSelect }) {
  const [projects, setProjects] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const { addToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    loadProjects();

    // 监听项目更新事件，实现跨组件同步
    const handleUpdate = () => loadProjects();
    window.addEventListener('project-updated', handleUpdate);
    return () => window.removeEventListener('project-updated', handleUpdate);
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const allProjects = await window.electronAPI.getAllProjects();
      setProjects(allProjects);
    } catch (error) {
      console.error('加载项目失败:', error);
      addToast('加载项目列表失败', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      const projectId = await window.electronAPI.createProject(
        newProjectName.trim(),
        newProjectDesc.trim()
      );

      setNewProjectName('');
      setNewProjectDesc('');
      setShowCreateModal(false);
      await loadProjects();

      // 自动选择新建的项目
      const project = await window.electronAPI.getProject(projectId);
      onProjectSelect(project);
      addToast('项目创建成功', 'success');
    } catch (error) {
      console.error('创建项目失败:', error);
      addToast('创建项目失败', 'error');
    }
  };

  const handleDeleteProject = async (e, projectId) => {
    e.stopPropagation();
    const confirmed = await confirm({
      title: '删除项目',
      message: '确定要删除这个项目吗？这将删除所有相关的阶段和工序数据。',
      confirmText: '确认删除',
      type: 'danger'
    });

    if (confirmed) {
      try {
        await window.electronAPI.deleteProject(projectId);
        await loadProjects();
        addToast('项目已删除', 'success');
      } catch (error) {
        console.error('删除项目失败:', error);
        addToast('删除项目失败', 'error');
      }
    }
  };

  return (
    <div className="project-list-container">
      <div className="project-list-header">
        <h2>📋 项目列表</h2>
        <div className="header-actions">
          <button
            className="transfer-btn export-btn"
            onClick={() => setShowExportModal(true)}
            disabled={projects.length === 0}
          >
            📤 导出项目
          </button>
          <button
            className="transfer-btn import-btn"
            onClick={() => setShowImportModal(true)}
          >
            📥 导入项目
          </button>
          <button
            className="create-btn"
            onClick={() => setShowCreateModal(true)}
          >
            + 新建项目
          </button>
        </div>
      </div>

      {isLoading ? (
        <Loading text="加载项目列表..." />
      ) : projects.length === 0 ? (
        <div className="empty-projects">
          <p>还没有项目，点击上方按钮创建第一个项目吧！</p>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((project) => (
            <div
              key={project.id}
              className="project-card"
              onClick={() => onProjectSelect(project)}
            >
              <div className="project-card-header">
                <h3>{project.name}</h3>
                <button
                  className="delete-btn-small"
                  onClick={(e) => handleDeleteProject(e, project.id)}
                  title="删除项目"
                >
                  ×
                </button>
              </div>
              {project.description && (
                <p className="project-description">{project.description}</p>
              )}
              <div className="project-meta">
                <span className="project-date">
                  {new Date(project.updated_at).toLocaleDateString('zh-CN')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>创建新项目</h3>
              <button
                className="modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateProject}>
              <div className="form-group">
                <label>项目名称 *</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="例如：生产线A改善项目"
                  autoFocus
                  required
                />
              </div>
              <div className="form-group">
                <label>项目描述</label>
                <textarea
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="简要描述这个项目的目标和内容"
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

      {showExportModal && (
        <DataTransferModal
          type="export"
          projects={projects}
          onClose={() => setShowExportModal(false)}
          addToast={addToast}
        />
      )}

      {showImportModal && (
        <DataTransferModal
          type="import"
          onRefresh={loadProjects}
          onClose={() => setShowImportModal(false)}
          addToast={addToast}
        />
      )}
    </div>
  );
}

export default ProjectList;
