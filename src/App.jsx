import React, { useState, useEffect } from 'react';
import ProjectList from './components/ProjectList';
import StageManager from './components/StageManager';
import ProcessList from './components/ProcessList';
import VideoPlayer from './components/VideoPlayer';
import ComparePlayer from './components/ComparePlayer';

function App() {
  const [currentProject, setCurrentProject] = useState(null);
  const [currentStage, setCurrentStage] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [playMode, setPlayMode] = useState('single'); // single, compare, global
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [layoutMode, setLayoutMode] = useState('horizontal'); // horizontal, vertical
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // 侧边栏收纳状态

  // 加载工序列表
  const loadProcesses = async () => {
    if (!currentStage) {
      setProcesses([]);
      return;
    }
    const procs = await window.electronAPI.getProcessesByStage(currentStage.id);
    setProcesses(procs);
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>🔧 改善效果展示系统</h1>
        {currentProject && (
          <div className="header-info">
            <span className="project-name">{currentProject.name}</span>
            {currentStage && (
              <>
                <span className="separator">›</span>
                <span className="stage-name">{currentStage.name}</span>
              </>
            )}
          </div>
        )}
      </header>

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
    </div>
  );
}

export default App;
