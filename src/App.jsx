import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const [playMode, setPlayMode] = useState('single'); // single, compare, global, fullscreen
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [layoutMode, setLayoutMode] = useState('horizontal'); // horizontal, vertical
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // 侧边栏收纳状态
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false); // 顶栏收纳状态
  const [showProcessEditor, setShowProcessEditor] = useState(false);
  const [editingProcess, setEditingProcess] = useState(null);
  const [aiNarratorActive, setAiNarratorActive] = useState(false);
  const [narrationSpeed, setNarrationSpeed] = useState(5.0); // 默认 5字/秒
  const [presentationMode, setPresentationMode] = useState(false); // 演示模式：隐藏编辑类UI，面向观众
  const lastSavedSpeedRef = useRef(5.0);
  const { addToast } = useToast();

  const [showAiSettings, setShowAiSettings] = useState(false);
  const [subtitleSettings, setSubtitleSettings] = useState({
    ttsEngine: 'local',
    ttsVoice: 'zh-CN-XiaoxiaoNeural'
  });
  const aiSettingsRef = useRef(null);

  // 加载系统离线/在线 TTS 设置
  useEffect(() => {
    const loadSubtitleSettings = async () => {
      try {
        const saved = await window.electronAPI.getSubtitleSettings();
        if (saved) {
          setSubtitleSettings({
            ttsEngine: saved.tts_engine || 'local',
            ttsVoice: saved.tts_voice || 'zh-CN-XiaoxiaoNeural'
          });
        }
      } catch (err) {
        console.error('加载配音设置失败:', err);
      }
    };
    loadSubtitleSettings();
  }, []);

  // 监听点击外部关闭 popover 弹窗
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (aiSettingsRef.current && !aiSettingsRef.current.contains(event.target)) {
        setShowAiSettings(false);
      }
    };
    if (showAiSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAiSettings]);

  // 更新配音设置，合并现有设置以防覆盖其他属性（支持批量更新以避免竞争条件）
  const updateTtsSettings = async (newFields) => {
    try {
      const saved = await window.electronAPI.getSubtitleSettings();
      const newSettings = {
        ...subtitleSettings,
        ...newFields
      };
      const merged = {
        fontSize: saved?.font_size || 24,
        textColor: saved?.text_color || '#FFFFFF',
        highlightColor: saved?.highlight_color || '#FFD700',
        bgColor: saved?.bg_color || '#000000',
        bgOpacity: saved?.bg_opacity ?? 0.7,
        maxLines: saved?.max_lines || 2,
        positionX: saved?.position_x ?? 50,
        positionY: saved?.position_y ?? 85,
        ttsEngine: saved?.tts_engine || 'local',
        ttsVoice: saved?.tts_voice || 'zh-CN-XiaoxiaoNeural',
        ...newSettings
      };
      await window.electronAPI.updateSubtitleSettings(merged);
      setSubtitleSettings(newSettings);
      window.dispatchEvent(new CustomEvent('tts-engine-changed'));
    } catch (err) {
      console.error('保存配音设置失败:', err);
      addToast('保存配音设置失败', 'error');
    }
  };

  // 加载工序列表
  const loadProcesses = useCallback(async () => {
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
  }, [currentStage, addToast]);

  useEffect(() => {
    loadProcesses();
  }, [loadProcesses]);

  // 当语速改变时自动保存到项目设置
  useEffect(() => {
    // 只有当速度真的变化且不是由于切换项目引起的变化时才保存
    const speedNum = Number(narrationSpeed);
    if (currentProject && speedNum && speedNum !== lastSavedSpeedRef.current) {
      console.log('触发自动保存, 语速:', speedNum);

      window.electronAPI.updateProject(
        currentProject.id,
        currentProject.name,
        currentProject.description || '',
        speedNum
      ).then(() => {
        lastSavedSpeedRef.current = speedNum;

        // 发送自定义事件，通知 ProjectList 刷新数据，解决缓存导致的回弹问题
        window.dispatchEvent(new CustomEvent('project-updated'));

        // 更新本地副本
        setCurrentProject(prev => {
          if (prev?.id === currentProject.id) {
            return { ...prev, narration_speed: speedNum };
          }
          return prev;
        });

        console.log('语速保存成功:', speedNum);
        addToast(`语速已保存: ${speedNum}字/秒`, 'success');
      }).catch(err => {
        console.error('保存语速失败:', err);
        addToast('保存语速设置失败', 'error');
      });
    }
  }, [narrationSpeed, currentProject?.id]);

  const handleProjectSelect = (project) => {
    setCurrentProject(project);
    const speed = project?.narration_speed || 5.0;
    setNarrationSpeed(speed);
    lastSavedSpeedRef.current = speed;
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

  const handleFullscreenPlay = () => {
    setPlayMode('fullscreen');
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
      await loadProcesses();

      // 如果编辑的是当前选中的工序，同步更新选中状态
      if (processId && selectedProcess?.id === processId) {
        const updated = await window.electronAPI.getProcess(processId);
        setSelectedProcess(updated);
      }
    } catch (error) {
      console.error('保存失败:', error);
      addToast('保存失败', 'error');
    }
  };

  // 演示模式：一键收起侧边栏和工具栏并进入全屏，面向观众展示时用
  const togglePresentationMode = useCallback(() => {
    if (presentationMode) {
      setPresentationMode(false);
      setSidebarCollapsed(false);
      setToolbarCollapsed(false);
      if (document.fullscreenElement) document.exitFullscreen();
    } else {
      setPresentationMode(true);
      setSidebarCollapsed(true);
      setToolbarCollapsed(true);
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, [presentationMode]);

  // 用户通过 Esc/系统手势退出全屏时，同步退出演示模式，避免UI状态和实际全屏状态错位
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && presentationMode) {
        setPresentationMode(false);
        setSidebarCollapsed(false);
        setToolbarCollapsed(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [presentationMode]);

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
                  {!presentationMode && (
                    <>
                      <span className="project-name">{currentProject.name}</span>
                      <span className="separator">/</span>
                      <span className="stage-name">{currentStage.name}</span>
                      <span className="separator">|</span>
                    </>
                  )}
                  <button
                    className="presentation-mode-btn"
                    onClick={togglePresentationMode}
                    title={presentationMode ? '退出演示模式' : '进入演示模式（隐藏编辑界面，全屏展示）'}
                  >
                    {presentationMode ? '⤢ 退出演示' : '🖥 演示模式'}
                  </button>
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
                  <div className={`player-controls ${toolbarCollapsed ? 'collapsed' : ''}`}>
                    <button
                      className="toolbar-toggle-btn"
                      onClick={() => setToolbarCollapsed(!toolbarCollapsed)}
                      title={toolbarCollapsed ? '展开工具栏' : '收起工具栏'}
                    >
                      {toolbarCollapsed ? '▼' : '▲'}
                    </button>
                    {!toolbarCollapsed && (
                      <>
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
                          <button
                            className={`control-btn ${playMode === 'fullscreen' ? 'active' : ''}`}
                            onClick={handleFullscreenPlay}
                          >
                            🖥️ 大屏轮播
                          </button>
                          <div className="ai-narrator-group">
                            <button
                              className={`control-btn ai-narrator-btn ${aiNarratorActive ? 'active' : ''}`}
                              onClick={() => {
                                const newState = !aiNarratorActive;
                                setAiNarratorActive(newState);
                                addToast(newState ? 'AI 讲解模式已开启' : 'AI 讲解模式已关闭', 'info');
                              }}
                            >
                              🎙️ AI 讲解
                            </button>
                            <button
                              className={`ai-settings-trigger-btn ${showAiSettings ? 'active' : ''}`}
                              onClick={() => setShowAiSettings(!showAiSettings)}
                              title="AI 配音与音色设置"
                            >
                              ⚙️
                            </button>

                            {showAiSettings && (
                              <div className="ai-settings-popover" ref={aiSettingsRef} onMouseDown={e => e.stopPropagation()}>
                                <div className="popover-header">
                                  <h4>AI 讲解配音设置</h4>
                                  <button className="close-btn" onClick={() => setShowAiSettings(false)}>×</button>
                                </div>
                                <div className="popover-body">
                                  {/* 引擎选择 */}
                                  <div className="setting-item">
                                    <label>配音引擎</label>
                                    <div className="engine-select">
                                      <button
                                        className={subtitleSettings.ttsEngine === 'local' ? 'active' : ''}
                                        onClick={() => {
                                          // 自动切换默认本地发音人
                                          const isMac = navigator.userAgent.includes('Mac');
                                          const defaultVoice = isMac ? 'Tingting' : 'Microsoft HuiHui Desktop';
                                          updateTtsSettings({ ttsEngine: 'local', ttsVoice: defaultVoice });
                                        }}
                                      >
                                        本地离线
                                      </button>
                                      <button
                                        className={subtitleSettings.ttsEngine === 'online' ? 'active' : ''}
                                        onClick={() => {
                                          updateTtsSettings({ ttsEngine: 'online', ttsVoice: 'zh-CN-XiaoxiaoNeural' });
                                        }}
                                      >
                                        在线 Edge
                                      </button>
                                    </div>
                                  </div>

                                  {/* 发音人/音色选择 */}
                                  <div className="setting-item">
                                    <label>发音人 / 音色</label>
                                    <select
                                      value={subtitleSettings.ttsVoice}
                                      onChange={(e) => updateTtsSettings({ ttsVoice: e.target.value })}
                                      className="voice-select"
                                    >
                                      {subtitleSettings.ttsEngine === 'local' ? (
                                        navigator.userAgent.includes('Mac') ? (
                                          <>
                                            <option value="Tingting">婷婷 (系统普通话 - 女)</option>
                                            <option value="Sinji">讪讪 (系统粤语 - 女)</option>
                                            <option value="Meijia">美佳 (系统闽南语 - 女)</option>
                                          </>
                                        ) : (
                                          <>
                                            <option value="Microsoft HuiHui Desktop">慧慧 (系统普通话 - 女)</option>
                                            <option value="Microsoft YaoYao Desktop">瑶瑶 (系统普通话 - 女)</option>
                                            <option value="Default">系统默认发音人</option>
                                          </>
                                        )
                                      ) : (
                                        <>
                                          <option value="zh-CN-XiaoxiaoNeural">晓晓 (Edge 活泼女声 - 荐)</option>
                                          <option value="zh-CN-YunxiNeural">云希 (Edge 阳光男声 - 荐)</option>
                                          <option value="zh-CN-YunjianNeural">云健 (Edge 稳重男声)</option>
                                          <option value="zh-CN-YunyaNeural">云雅 (Edge 温柔女声)</option>
                                          <option value="zh-CN-liaoning-XiaobeiNeural">小北 (Edge 辽宁女声)</option>
                                          <option value="zh-CN-Sichuan-YunxiNeural">云希 (Edge 四川男声)</option>
                                        </>
                                      )}
                                    </select>
                                  </div>

                                  {/* 语速选择 */}
                                  <div className="setting-item">
                                    <label>朗读语速</label>
                                    <select
                                      value={narrationSpeed.toString()}
                                      onChange={(e) => setNarrationSpeed(parseFloat(e.target.value))}
                                      className="voice-select"
                                    >
                                      <option value="3">3字/秒 (较慢)</option>
                                      <option value="4">4字/秒</option>
                                      <option value="5">5字/秒 (推荐)</option>
                                      <option value="6">6字/秒</option>
                                      <option value="7">7字/秒 (较快)</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

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
                      </>
                    )}
                  </div>

                  <div className={`video-container${playMode === 'fullscreen' ? ' fullscreen-fit' : ''}`}>
                    {playMode === 'compare' && selectedProcess ? (
                      <ComparePlayer
                        process={selectedProcess}
                        processes={processes}
                        stage={currentStage}
                        layoutMode={layoutMode}
                        onProcessChange={handleNavigateProcess}
                        aiNarratorActive={aiNarratorActive}
                        narrationSpeed={narrationSpeed}
                        presentationMode={presentationMode}
                      />
                    ) : playMode === 'global' ? (
                      <ComparePlayer
                        processes={processes}
                        stage={currentStage}
                        layoutMode={layoutMode}
                        globalMode={true}
                        aiNarratorActive={aiNarratorActive}
                        narrationSpeed={narrationSpeed}
                        presentationMode={presentationMode}
                      />
                    ) : playMode === 'fullscreen' ? (
                      <ComparePlayer
                        processes={processes}
                        stage={currentStage}
                        layoutMode={layoutMode}
                        globalMode={true}
                        fullscreenMode={true}
                        aiNarratorActive={aiNarratorActive}
                        narrationSpeed={narrationSpeed}
                        presentationMode={presentationMode}
                      />
                    ) : (
                      <VideoPlayer
                        process={selectedProcess}
                        stage={currentStage}
                        aiNarratorActive={aiNarratorActive}
                        narrationSpeed={narrationSpeed}
                        presentationMode={presentationMode}
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
          processes={processes}
          onSave={handleSaveProcess}
          onCancel={() => {
            setShowProcessEditor(false);
            setEditingProcess(null);
          }}
          onThumbnailUpdate={loadProcesses}
          narrationSpeed={narrationSpeed}
        />
      )}
    </div>
  );
}

export default App;
