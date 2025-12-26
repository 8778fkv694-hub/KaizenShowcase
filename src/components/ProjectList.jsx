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
  const [appSettings, setAppSettings] = useState({ main_title: '改善效果展示系统', subtitle: '' });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [isEditingSubtitle, setIsEditingSubtitle] = useState(false);
  const [editSubtitle, setEditSubtitle] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);
  const { addToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    loadProjects();
    loadAppSettings();

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

  const loadAppSettings = async () => {
    try {
      const settings = await window.electronAPI.getAppSettings();
      if (settings) {
        setAppSettings(settings);
      }
    } catch (error) {
      console.error('加载应用设置失败:', error);
    }
  };

  const handleSaveSubtitle = async () => {
    try {
      await window.electronAPI.updateAppSettings({
        mainTitle: appSettings.main_title,
        subtitle: editSubtitle
      });
      setAppSettings(prev => ({ ...prev, subtitle: editSubtitle }));
      setIsEditingSubtitle(false);
      addToast('保存成功', 'success');
    } catch (error) {
      console.error('保存失败:', error);
      addToast('保存失败', 'error');
    }
  };

  const handleSaveTitle = async () => {
    if (!editTitle.trim()) {
      addToast('标题不能为空', 'error');
      return;
    }
    try {
      await window.electronAPI.updateAppSettings({
        mainTitle: editTitle.trim(),
        subtitle: appSettings.subtitle
      });
      setAppSettings(prev => ({ ...prev, main_title: editTitle.trim() }));
      setIsEditingTitle(false);
      addToast('保存成功', 'success');
    } catch (error) {
      console.error('保存失败:', error);
      addToast('保存失败', 'error');
    }
  };

  const startEditTitle = () => {
    setEditTitle(appSettings.main_title || '');
    setIsEditingTitle(true);
  };

  const startEditSubtitle = () => {
    setEditSubtitle(appSettings.subtitle || '');
    setIsEditingSubtitle(true);
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
      <div className="app-hero">
        <button className="help-btn" onClick={() => setShowHelpModal(true)} title="操作说明">
          ?
        </button>
        <div className="app-title-row">
          {isEditingTitle ? (
            <div className="title-edit-form">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="输入主标题..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
              />
              <button className="save-btn" onClick={handleSaveTitle}>保存</button>
              <button className="cancel-btn" onClick={() => setIsEditingTitle(false)}>取消</button>
            </div>
          ) : (
            <h1 className="app-main-title" onClick={startEditTitle}>
              {appSettings.main_title}
              <span className="edit-icon">✏️</span>
            </h1>
          )}
        </div>
        <div className="app-subtitle-row">
          {isEditingSubtitle ? (
            <div className="subtitle-edit-form">
              <input
                type="text"
                value={editSubtitle}
                onChange={(e) => setEditSubtitle(e.target.value)}
                placeholder="输入副标题描述..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveSubtitle();
                  if (e.key === 'Escape') setIsEditingSubtitle(false);
                }}
              />
              <button className="save-btn" onClick={handleSaveSubtitle}>保存</button>
              <button className="cancel-btn" onClick={() => setIsEditingSubtitle(false)}>取消</button>
            </div>
          ) : (
            <p className="app-subtitle" onClick={startEditSubtitle}>
              {appSettings.subtitle || '点击添加副标题描述...'}
              <span className="edit-icon">✏️</span>
            </p>
          )}
        </div>
      </div>

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

      {showHelpModal && (
        <div className="modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>操作说明</h3>
              <button className="modal-close" onClick={() => setShowHelpModal(false)}>×</button>
            </div>
            <div className="help-content">
              <section>
                <h4>项目管理</h4>
                <ul>
                  <li><strong>新建项目</strong> - 点击右上角"+ 新建项目"按钮创建新的改善项目</li>
                  <li><strong>导入/导出</strong> - 支持项目数据的备份与迁移</li>
                  <li><strong>编辑标题</strong> - 点击主标题或副标题可直接编辑</li>
                </ul>
              </section>
              <section>
                <h4>阶段与工序</h4>
                <ul>
                  <li><strong>创建阶段</strong> - 进入项目后，点击"新建阶段"添加改善阶段</li>
                  <li><strong>添加工序</strong> - 在阶段中添加具体工序，上传改善前后视频</li>
                  <li><strong>拖拽排序</strong> - 支持拖拽调整工序顺序</li>
                </ul>
              </section>
              <section>
                <h4>视频播放</h4>
                <ul>
                  <li><strong>对比模式</strong> - 改善前后视频同步播放对比</li>
                  <li><strong>AI讲解</strong> - 开启后自动朗读字幕内容</li>
                  <li><strong>循环播放</strong> - 支持单曲循环、列表循环等模式</li>
                </ul>
              </section>
              <section>
                <h4>快捷键</h4>
                <ul>
                  <li><strong>空格</strong> - 播放/暂停视频</li>
                  <li><strong>Enter</strong> - 保存编辑内容</li>
                  <li><strong>Esc</strong> - 取消编辑</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectList;
