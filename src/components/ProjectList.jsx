import React, { useState, useEffect } from 'react';

function ProjectList({ onProjectSelect }) {
  const [projects, setProjects] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    const allProjects = await window.electronAPI.getAllProjects();
    setProjects(allProjects);
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

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
  };

  const handleDeleteProject = async (e, projectId) => {
    e.stopPropagation();
    if (confirm('确定要删除这个项目吗？这将删除所有相关的阶段和工序数据。')) {
      await window.electronAPI.deleteProject(projectId);
      await loadProjects();
    }
  };

  return (
    <div className="project-list-container">
      <div className="project-list-header">
        <h2>📋 项目列表</h2>
        <button
          className="create-btn"
          onClick={() => setShowCreateModal(true)}
        >
          + 新建项目
        </button>
      </div>

      {projects.length === 0 ? (
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
    </div>
  );
}

export default ProjectList;
