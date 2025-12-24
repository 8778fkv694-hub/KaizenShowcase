import React, { useRef, useEffect, useState } from 'react';

function ComparePlayer({ process, processes, stage, layoutMode, globalMode = false, onProcessChange }) {
  const beforeVideoRef = useRef(null);
  const afterVideoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [beforeProgress, setBeforeProgress] = useState(0);
  const [afterProgress, setAfterProgress] = useState(0);
  const [currentProcessIndex, setCurrentProcessIndex] = useState(0);

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

    if (!globalMode && process) {
      setCurrentProcessIndex(getCurrentIndexFromProcess());
    } else {
      setCurrentProcessIndex(0);
    }
  }, [process, processes, globalMode]);

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

    // 同时播放两个视频
    try {
      await Promise.all([
        beforeVideoRef.current.play(),
        afterVideoRef.current.play()
      ]);
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

  const handleTimeUpdate = () => {
    const currentProc = getCurrentProcess();
    if (!currentProc) return;

    if (beforeVideoRef.current) {
      const beforeElapsed = beforeVideoRef.current.currentTime - currentProc.before_start_time;
      const beforeDuration = currentProc.before_end_time - currentProc.before_start_time;
      setBeforeProgress(Math.min(Math.max((beforeElapsed / beforeDuration) * 100, 0), 100));

      // 检查是否到达结束时间
      if (beforeVideoRef.current.currentTime >= currentProc.before_end_time) {
        if (globalMode && currentProcessIndex < processes.length - 1) {
          // 全局模式下，播放下一个工序
          playNextProcess();
        } else {
          handlePause();
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
        <div className="global-progress">
          工序进度：{currentProcessIndex + 1} / {processes?.length || 1}
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
          <span className="stat-label">当前工序：</span>
          <span className="stat-value">{currentProc.name}</span>
        </div>
        <div className={`stat-item highlight ${(currentProc.time_saved || 0) < 0 ? 'time-increased' : ''}`}>
          <span className="stat-value saved">
            {formatTimeSaved(currentProc.time_saved)}
          </span>
        </div>
        {globalMode && (
          <div className={`stat-item ${processes.reduce((sum, p) => sum + (p.time_saved || 0), 0) < 0 ? 'time-increased' : ''}`}>
            <span className="stat-value saved">
              {formatTimeSaved(processes.reduce((sum, p) => sum + (p.time_saved || 0), 0))}
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

