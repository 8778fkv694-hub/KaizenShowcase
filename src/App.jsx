import React, { useState, useEffect } from 'react';
import ProjectList from './components/ProjectList';
import StageManager from './components/StageManager';
import ProcessList from './components/ProcessList';
import VideoPlayer from './components/VideoPlayer';
import ComparePlayer from './components/ComparePlayer';
import ExportButton from './components/ExportButton';
import ProcessEditor from './components/ProcessEditor';
import { useToast } from './components/Toast';

function App() {
  const [currentProject, setCurrentProject] = useState(null);
  const [currentStage, setCurrentStage] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [playMode, setPlayMode] = useState('single'); // single, compare, global
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [layoutMode, setLayoutMode] = useState('horizontal'); // horizontal, vertical
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // 侧边栏收纳状态
  const [showProcessEditor, setShowProcessEditor] = useState(false);
  const [editingProcess, setEditingProcess] = useState(null);
  const { addToast } = useToast();

  // 加载工序列表
  const loadProcesses = async () => {
    if (!currentStage) {
      setProcesses([]);
      return;
    }
    try {
      const procs = await window.electronAPI.getProcessesByStage(currentStage.id);
      setProcesses(procs);
    } catch (error) {
      console.error('加载工序失败:', error);
      addToast('加载工序列表失败', 'error');
    }
  };

  useEffect(() => {
    loadProcesses();
  }, [currentStage]);

  const handleProjectSelect = (project) => {
    setCurrentProject(project);
    setCurrentStage(null);
    setSelectedProcess(null);
  };

  const handleStageSelect = (stage) => {
    setCurrentStage(stage);
    setSelectedProcess(null);
  };

  const handleProcessSelect = (process) => {
    setSelectedProcess(process);
    setPlayMode('single');
  };

  // 对比播放模式下导航工序时使用，不改变播放模式
  const handleNavigateProcess = (process) => {
    setSelectedProcess(process);
  };

  const handleComparePlay = () => {
    if (selectedProcess) {
      setPlayMode('compare');
    }
  };

  const handleGlobalPlay = () => {
    setPlayMode('global');
  };

  // 打开工序编辑器
  const handleOpenEditor = (process = null) => {
    setEditingProcess(process);
    setShowProcessEditor(true);
  };

  // 保存工序
  const handleSaveProcess = async (data, processId) => {
    try {
      if (processId) {
        await window.electronAPI.updateProcess(processId, data);
        addToast('工序更新成功', 'success');
      } else {
        await window.electronAPI.createProcess(currentStage.id, data);
        addToast('工序创建成功', 'success');
      }
      setShowProcessEditor(false);
      setEditingProcess(null);
      loadProcesses();
    } catch (error) {
      console.error('保存失败:', error);
      addToast('保存失败', 'error');
    }
  };

  return (
    <div className="app">


      <div className="app-content">
        {!currentProject ? (
          <div className="welcome-screen">
            <ProjectList onProjectSelect={handleProjectSelect} />
          </div>
        ) : (
          <>
            <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
              {!sidebarCollapsed && (
                <>
                  <div className="sidebar-section">
                    <button
                      className="back-button"
                      onClick={() => {
                        setCurrentProject(null);
                        setCurrentStage(null);
                      }}
                    >
                      ← 返回项目列表
                    </button>
                  </div>

                  <StageManager
                    projectId={currentProject.id}
                    currentStage={currentStage}
                    onStageSelect={handleStageSelect}
                  />

                  {currentStage && (
                    <ProcessList
                      processes={processes}
                      selectedProcess={selectedProcess}
                      onProcessSelect={handleProcessSelect}
                      onProcessUpdate={loadProcesses}
                      stage={currentStage}
                      onEditProcess={handleOpenEditor}
                    />
                  )}
                </>
              )}

              <button
                className="sidebar-toggle"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
              >
                {sidebarCollapsed ? '»' : '«'}
              </button>
            </aside>

            <main className="main-content">
              {currentProject && currentStage && (
                <div className="floating-project-info">
                  <span className="project-name">{currentProject.name}</span>
                  <span className="separator">/</span>
                  <span className="stage-name">{currentStage.name}</span>
                </div>
              )}
              {!currentStage ? (
                <div className="empty-state">
                  <div className="empty-icon">📂</div>
                  <h2>请选择或创建一个改善阶段</h2>
                  <p>从左侧选择一个阶段，或创建新的改善阶段开始工作</p>
                </div>
              ) : !currentStage.before_video_path || !currentStage.after_video_path ? (
                <div className="empty-state">
                  <div className="empty-icon">🎬</div>
                  <h2>请上传视频文件</h2>
                  <p>需要上传改善前和改善后的视频才能继续</p>
                </div>
              ) : (
                <>
                  <div className="player-controls">
                    <div className="control-group">
                      <button
                        className={`control-btn ${playMode === 'compare' ? 'active' : ''}`}
                        onClick={handleComparePlay}
                        disabled={!selectedProcess}
                      >
                        ⚖️ 对比播放
                      </button>
                      <button
                        className={`control-btn ${playMode === 'global' ? 'active' : ''}`}
                        onClick={handleGlobalPlay}
                      >
                        🎬 全局播放
                      </button>
                      <ExportButton
                        project={currentProject}
                        stage={currentStage}
                        processes={processes}
                      />
                    </div>
                    {playMode === 'compare' && (
                      <div className="layout-toggle">
                        <button
                          className={`layout-btn ${layoutMode === 'horizontal' ? 'active' : ''}`}
                          onClick={() => setLayoutMode('horizontal')}
                          title="左右布局"
                        >
                          ⬌
                        </button>
                        <button
                          className={`layout-btn ${layoutMode === 'vertical' ? 'active' : ''}`}
                          onClick={() => setLayoutMode('vertical')}
                          title="上下布局"
                        >
                          ⬍
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="video-container">
                    {playMode === 'compare' && selectedProcess ? (
                      <ComparePlayer
                        process={selectedProcess}
                        processes={processes}
                        stage={currentStage}
                        layoutMode={layoutMode}
                        onProcessChange={handleNavigateProcess}
                      />
                    ) : playMode === 'global' ? (
                      <ComparePlayer
                        processes={processes}
                        stage={currentStage}
                        layoutMode={layoutMode}
                        globalMode={true}
                      />
                    ) : (
                      <VideoPlayer
                        process={selectedProcess}
                        stage={currentStage}
                      />
                    )}
                  </div>
                </>
              )}
            </main>
          </>
        )}
      </div>

      {/* 工序编辑器 */}
      {showProcessEditor && currentStage && (
        <ProcessEditor
          stage={currentStage}
          process={editingProcess}
          onSave={handleSaveProcess}
          onCancel={() => {
            setShowProcessEditor(false);
            setEditingProcess(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
