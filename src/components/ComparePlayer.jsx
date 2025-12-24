import React, { useRef, useEffect, useState } from 'react';

function ComparePlayer({ process, processes, stage, layoutMode, globalMode = false, onProcessChange }) {
  const beforeVideoRef = useRef(null);
  const afterVideoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [beforeProgress, setBeforeProgress] = useState(0);
  const [afterProgress, setAfterProgress] = useState(0);
  const [currentProcessIndex, setCurrentProcessIndex] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(false);

  // 获取当前工序索引
  const getCurrentIndexFromProcess = () => {
    if (!processes || !process) return 0;
    const idx = processes.findIndex(p => p.id === process.id);
    return idx >= 0 ? idx : 0;
  };

  useEffect(() => {
    if (beforeVideoRef.current) beforeVideoRef.current.pause();
    if (afterVideoRef.current) afterVideoRef.current.pause();
    setIsPlaying(false);
    setCurrentTime(0);
    setBeforeProgress(0);
    setAfterProgress(0);
    // 保持用户选择的倍速，不重置 setPlaybackRate(1);

    if (!globalMode && process) {
      setCurrentProcessIndex(getCurrentIndexFromProcess());
    } else {
      setCurrentProcessIndex(0);
    }
  }, [process, processes, globalMode]);

  useEffect(() => {
    if (beforeVideoRef.current) beforeVideoRef.current.playbackRate = playbackRate;
    if (afterVideoRef.current) afterVideoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  const getCurrentProcess = () => {
    if (globalMode && processes) {
      return processes[currentProcessIndex];
    }
    if (!globalMode && processes && processes.length > 0) {
      return processes[currentProcessIndex] || process;
    }
    return process;
  };

  const handlePlay = async () => {
    const currentProc = getCurrentProcess();
    if (!beforeVideoRef.current || !afterVideoRef.current || !currentProc) return;

    // 设置起始时间
    beforeVideoRef.current.currentTime = currentProc.before_start_time;
    afterVideoRef.current.currentTime = currentProc.after_start_time;

    // 初始设置倍速
    beforeVideoRef.current.playbackRate = playbackRate;
    afterVideoRef.current.playbackRate = playbackRate;

    // 同时播放两个视频
    try {
      await Promise.all([
        beforeVideoRef.current.play(),
        afterVideoRef.current.play()
      ]);

      // 再次确认倍速（防止 play() 重置）
      if (beforeVideoRef.current) beforeVideoRef.current.playbackRate = playbackRate;
      if (afterVideoRef.current) afterVideoRef.current.playbackRate = playbackRate;

      setIsPlaying(true);
    } catch (error) {
      console.error('播放失败:', error);
    }
  };

  const handlePause = () => {
    if (beforeVideoRef.current) beforeVideoRef.current.pause();
    if (afterVideoRef.current) afterVideoRef.current.pause();
    setIsPlaying(false);
  };

  const handleSpeedChange = (e) => {
    const newRate = parseFloat(e.target.value);
    setPlaybackRate(newRate);
    // 直接设置 DOM，确保立即生效
    if (beforeVideoRef.current) beforeVideoRef.current.playbackRate = newRate;
    if (afterVideoRef.current) afterVideoRef.current.playbackRate = newRate;
  };

  const handleLoadedMetadata = () => {
    if (beforeVideoRef.current) beforeVideoRef.current.playbackRate = playbackRate;
    if (afterVideoRef.current) afterVideoRef.current.playbackRate = playbackRate;
  };

  const handleTimeUpdate = () => {
    const currentProc = getCurrentProcess();
    if (!currentProc) return;

    if (beforeVideoRef.current) {
      const beforeElapsed = beforeVideoRef.current.currentTime - currentProc.before_start_time;
      const beforeDuration = currentProc.before_end_time - currentProc.before_start_time;
      setBeforeProgress(Math.min(Math.max((beforeElapsed / beforeDuration) * 100, 0), 100));

      // 检查是否到达结束时间
      if (beforeVideoRef.current.currentTime >= currentProc.before_end_time) {
        if (isLooping) {
          if (globalMode) {
            if (currentProcessIndex < processes.length - 1) {
              playNextProcess();
            } else {
              handleRestart();
            }
          } else {
            if (beforeVideoRef.current) beforeVideoRef.current.currentTime = currentProc.before_start_time;
            if (afterVideoRef.current) afterVideoRef.current.currentTime = currentProc.after_start_time;
          }
        } else {
          if (globalMode && currentProcessIndex < processes.length - 1) {
            // 全局模式下，播放下一个工序
            playNextProcess();
          } else {
            handlePause();
          }
        }
      }
    }

    if (afterVideoRef.current) {
      const afterElapsed = afterVideoRef.current.currentTime - currentProc.after_start_time;
      const afterDuration = currentProc.after_end_time - currentProc.after_start_time;
      setAfterProgress(Math.min(Math.max((afterElapsed / afterDuration) * 100, 0), 100));
    }

    // 使用较慢的视频时间作为主时间
    const maxTime = Math.max(
      beforeVideoRef.current?.currentTime || 0,
      afterVideoRef.current?.currentTime || 0
    );
    setCurrentTime(maxTime);
  };

  const playNextProcess = async () => {
    if (!processes || processes.length === 0) return;

    const nextIndex = currentProcessIndex + 1;
    if (nextIndex >= processes.length) {
      handlePause();
      return;
    }

    setCurrentProcessIndex(nextIndex);
    const nextProcess = processes[nextIndex];

    // 通知父组件切换（仅对比播放模式）
    if (!globalMode && onProcessChange) {
      onProcessChange(nextProcess);
    }

    // 暂停当前播放
    if (beforeVideoRef.current) beforeVideoRef.current.pause();
    if (afterVideoRef.current) afterVideoRef.current.pause();

    // 等待一小段时间
    await new Promise(resolve => setTimeout(resolve, 100));

    // 设置新的时间并播放
    if (beforeVideoRef.current && afterVideoRef.current) {
      beforeVideoRef.current.currentTime = nextProcess.before_start_time;
      afterVideoRef.current.currentTime = nextProcess.after_start_time;

      if (isPlaying) {
        try {
          await Promise.all([
            beforeVideoRef.current.play(),
            afterVideoRef.current.play()
          ]);
        } catch (error) {
          console.error('播放下一个工序失败:', error);
        }
      }
    }
  };

  const playPrevProcess = async () => {
    if (!processes || processes.length === 0) return;

    const prevIndex = currentProcessIndex - 1;
    if (prevIndex < 0) return;

    setCurrentProcessIndex(prevIndex);
    const prevProcess = processes[prevIndex];

    // 通知父组件切换（仅对比播放模式）
    if (!globalMode && onProcessChange) {
      onProcessChange(prevProcess);
    }

    // 暂停当前播放
    if (beforeVideoRef.current) beforeVideoRef.current.pause();
    if (afterVideoRef.current) afterVideoRef.current.pause();

    // 等待一小段时间
    await new Promise(resolve => setTimeout(resolve, 100));

    // 设置新的时间并播放
    if (beforeVideoRef.current && afterVideoRef.current) {
      beforeVideoRef.current.currentTime = prevProcess.before_start_time;
      afterVideoRef.current.currentTime = prevProcess.after_start_time;

      if (isPlaying) {
        try {
          await Promise.all([
            beforeVideoRef.current.play(),
            afterVideoRef.current.play()
          ]);
        } catch (error) {
          console.error('播放上一个工序失败:', error);
        }
      }
    }
  };

  const getAccumulatedTimeSaved = () => {
    if (!processes || !globalMode) return 0;
    return processes.slice(0, currentProcessIndex + 1).reduce((sum, p) => sum + (p.time_saved || 0), 0);
  };

  const handleRestart = async () => {
    if (!processes || processes.length === 0) return;

    setCurrentProcessIndex(0);
    const firstProcess = processes[0];

    // 如果处于全局模式，也应该通知父组件更新选中状态（如果需要）


    // 暂停当前播放
    if (beforeVideoRef.current) beforeVideoRef.current.pause();
    if (afterVideoRef.current) afterVideoRef.current.pause();

    // 立即设置新的时间并播放
    if (beforeVideoRef.current && afterVideoRef.current) {
      beforeVideoRef.current.currentTime = firstProcess.before_start_time;
      afterVideoRef.current.currentTime = firstProcess.after_start_time;
      // 确保倍速正确
      beforeVideoRef.current.playbackRate = playbackRate;
      afterVideoRef.current.playbackRate = playbackRate;

      try {
        await Promise.all([
          beforeVideoRef.current.play(),
          afterVideoRef.current.play()
        ]);
        // 再次确认倍速
        if (beforeVideoRef.current) beforeVideoRef.current.playbackRate = playbackRate;
        if (afterVideoRef.current) afterVideoRef.current.playbackRate = playbackRate;

        setIsPlaying(true);
      } catch (error) {
        console.error('从头播放失败:', error);
      }
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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

  const currentProc = getCurrentProcess();
  const canGoPrev = processes && currentProcessIndex > 0;
  const canGoNext = processes && currentProcessIndex < processes.length - 1;

  if (!currentProc) {
    return (
      <div className="compare-player-empty">
        <div className="empty-icon">⚖️</div>
        <h3>请选择要对比的工序</h3>
        <p>点击左侧的工序，然后使用对比播放功能查看改善效果</p>
      </div>
    );
  }



  return (
    <div className={`compare-player layout-${layoutMode}`}>
      <div className="compare-header">
        <h3>
          {globalMode ? '全局对比播放' : `工序对比 - ${currentProc.name}`}
        </h3>
        <div className="header-controls">
          <label style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: '13px',
            color: '#333',
            cursor: 'pointer',
            marginRight: '12px',
            userSelect: 'none'
          }}>
            <input
              type="checkbox"
              checked={isLooping}
              onChange={(e) => setIsLooping(e.target.checked)}
              style={{ marginRight: '4px', cursor: 'pointer' }}
            />
            循环播放
          </label>
          <select
            className="speed-selector"
            value={playbackRate}
            onChange={handleSpeedChange}
            title="播放速度"
          >
            <option value="0.5">0.5x</option>
            <option value="1">1.0x</option>
            <option value="2">2.0x</option>
            <option value="3">3.0x</option>
            <option value="5">5.0x</option>
          </select>
          <div className="global-progress">
            工序进度：{currentProcessIndex + 1} / {processes?.length || 1}
          </div>
        </div>
      </div>

      <div className="videos-container">
        <div className="video-section">
          <div className="video-label">
            <h4>
              改善前
              {globalMode && <span className="process-badge">{currentProc.name}</span>}
            </h4>
            <span className="duration">
              {formatTime(currentProc.before_end_time - currentProc.before_start_time)}
            </span>
          </div>
          <div className="video-wrapper">
            <video
              ref={beforeVideoRef}
              src={stage.before_video_path ? `local-video://${stage.before_video_path}` : ''}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              className="video-element"
            />
            {currentProc.process_type === 'new_step' && (
              <div className="video-mask mask-new-step">
                <div className="mask-content">
                  <div className="mask-icon">🆕</div>
                  <div className="mask-text">改善前无此步骤</div>
                </div>
              </div>
            )}
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${beforeProgress}%` }} />
          </div>
        </div>

        <div className="video-section">
          <div className="video-label">
            <h4>
              改善后
              {globalMode && <span className="process-badge">{currentProc.name}</span>}
            </h4>
            <span className="duration">
              {formatTime(currentProc.after_end_time - currentProc.after_start_time)}
            </span>
          </div>
          <div className="video-wrapper">
            <video
              ref={afterVideoRef}
              src={stage.after_video_path ? `local-video://${stage.after_video_path}` : ''}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              className="video-element"
            />
            {currentProc.process_type === 'cancelled' && (
              <div className="video-mask mask-cancelled">
                <div className="mask-content">
                  <div className="mask-icon">🚫</div>
                  <div className="mask-text">步骤已取消</div>
                </div>
              </div>
            )}
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${afterProgress}%` }} />
          </div>
        </div>
      </div>

      <div className="compare-controls">
        {globalMode && (
          <button
            className="nav-button restart"
            onClick={handleRestart}
            title="从头开始播放"
            style={{ marginRight: '8px' }}
          >
            ↻ 从头开始
          </button>
        )}

        <button
          className="nav-button prev"
          onClick={playPrevProcess}
          disabled={!canGoPrev}
          title="上一步"
        >
          ← 上一步
        </button>

        <button
          className="control-button-large"
          onClick={isPlaying ? handlePause : handlePlay}
        >
          {isPlaying ? '⏸ 暂停' : '▶ 同步播放'}
        </button>

        <button
          className="nav-button next"
          onClick={playNextProcess}
          disabled={!canGoNext}
          title="下一步"
        >
          下一步 →
        </button>
      </div>

      <div className="compare-stats">
        <div className="stat-item">
          <span className="stat-label">当前工序</span>
          <span className="stat-value name">{currentProc.name}</span>
        </div>

        <div className={`stat-item highlight ${(currentProc.time_saved || 0) < 0 ? 'time-increased' : ''}`}>
          <span className="stat-label">此工序节省</span>
          <span className="stat-value saved">
            {formatTimeSaved(currentProc.time_saved)}
          </span>
        </div>

        {globalMode && (
          <div className={`stat-item highlight total ${getAccumulatedTimeSaved() < 0 ? 'time-increased' : ''}`}>
            <span className="stat-label">累计总节省</span>
            <span className="stat-value saved">
              {formatTimeSaved(getAccumulatedTimeSaved())}
            </span>
          </div>
        )}
      </div>

      {currentProc.improvement_note && (
        <div className="improvement-note">
          <p className="note-label">改善说明：</p>
          <p>{currentProc.improvement_note}</p>
        </div>
      )}
    </div>
  );
}

export default ComparePlayer;

