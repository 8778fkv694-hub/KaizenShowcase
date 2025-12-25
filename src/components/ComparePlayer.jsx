import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { formatTime, formatTimeSaved, calculateNarrationDuration } from '../utils/time';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import ProcessTimeChart from './ProcessTimeChart';
import AnnotationLayer from './AnnotationLayer';
import SubtitleOverlay from './SubtitleOverlay';

function ComparePlayer({ process, processes, stage, layoutMode, globalMode = false, onProcessChange, aiNarratorActive = false, narrationSpeed = 5.0 }) {
  const beforeVideoRef = useRef(null);
  const afterVideoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [elapsedSinceStart, setElapsedSinceStart] = useState(0); // 累计播放时间（用于字幕进度）
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false); // 是否至少播放完一次
  const [beforeProgress, setBeforeProgress] = useState(0);
  const [afterProgress, setAfterProgress] = useState(0);
  const [currentProcessIndex, setCurrentProcessIndex] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [isAnnotationEditing, setIsAnnotationEditing] = useState(false);
  const [editingVideoType, setEditingVideoType] = useState(null); // 'before' | 'after' | null
  const isPlayingRef = useRef(isPlaying);
  const audioRef = useRef(new Audio());
  const [audioPath, setAudioPath] = useState(null);

  const getCurrentProcess = () => {
    if (globalMode && processes) {
      return processes[currentProcessIndex];
    }
    if (!globalMode && processes && processes.length > 0) {
      return processes[currentProcessIndex] || process;
    }
    return process;
  };

  // 保持 isPlaying 引用同步
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // 修改：获取当前工序索引
  useEffect(() => {
    if (!globalMode && process) {
      const idx = processes.findIndex(p => p.id === process.id);
      setCurrentProcessIndex(idx >= 0 ? idx : 0);
    }
  }, [process, processes, globalMode]);

  // 当视频发生实质性变化时（过程路径切换等）暂停
  useEffect(() => {
    if (stage.before_video_path || stage.after_video_path) {
      if (beforeVideoRef.current) beforeVideoRef.current.pause();
      if (afterVideoRef.current) afterVideoRef.current.pause();
      setIsPlaying(false);
      setCurrentTime(0);
      setBeforeProgress(0);
      setAfterProgress(0);
      setElapsedSinceStart(0);
      setHasPlayedOnce(false);
    }
  }, [stage.id, globalMode, process?.id]);

  // 监听 AI 讲解开关，从关闭到开启时重置讲解进度
  useEffect(() => {
    if (aiNarratorActive) {
      setElapsedSinceStart(0);
    }
  }, [aiNarratorActive]);

  // 预加载/切换 TTS 语音
  useEffect(() => {
    const loadTTS = async () => {
      const currentProc = getCurrentProcess();
      if (aiNarratorActive && currentProc?.subtitle_text) {
        try {
          const path = await window.electronAPI.generateSpeech(
            currentProc.subtitle_text,
            "zh-CN-XiaoxiaoNeural",
            narrationSpeed
          );
          setAudioPath(path);
          audioRef.current.src = `local-video://${path}`;
          audioRef.current.load();
        } catch (err) {
          console.error('TTS 加载失败:', err);
        }
      } else {
        setAudioPath(null);
        audioRef.current.src = "";
      }
    };
    loadTTS();

    return () => {
      audioRef.current.pause();
      audioRef.current.src = "";
    };
  }, [getCurrentProcess()?.id, aiNarratorActive, narrationSpeed]);

  // 监听标注模式切换，进入标注模式时自动暂停
  useEffect(() => {
    if (isAnnotationEditing && isPlaying) {
      handlePause();
    }
  }, [isAnnotationEditing]);

  useEffect(() => {
    if (beforeVideoRef.current) beforeVideoRef.current.playbackRate = playbackRate;
    if (afterVideoRef.current) afterVideoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  const handlePlay = async () => {
    const currentProc = getCurrentProcess();
    if (!beforeVideoRef.current || !afterVideoRef.current || !currentProc) return;

    // 设置起始时间
    beforeVideoRef.current.currentTime = currentProc.before_start_time;
    afterVideoRef.current.currentTime = currentProc.after_start_time;

    // 初始设置倍速
    beforeVideoRef.current.playbackRate = playbackRate;
    afterVideoRef.current.playbackRate = playbackRate;

    // 重新开启讲解
    setElapsedSinceStart(0);
    setHasPlayedOnce(false);

    const playBefore = currentProc.process_type !== 'new_step';
    const playAfter = currentProc.process_type !== 'cancelled';

    const plays = [];
    if (playBefore && beforeVideoRef.current) plays.push(beforeVideoRef.current.play());
    if (playAfter && afterVideoRef.current) plays.push(afterVideoRef.current.play());

    // 播放 AI 语音
    if (aiNarratorActive && audioRef.current.src) {
      audioRef.current.currentTime = 0;
      plays.push(audioRef.current.play().catch(e => console.warn('音频播放中断:', e)));
    }

    // 如果不播放，确保视频在起始时间
    if (!playBefore && beforeVideoRef.current) beforeVideoRef.current.pause();
    if (!playAfter && afterVideoRef.current) afterVideoRef.current.pause();

    try {
      await Promise.all(plays);

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
    if (audioRef.current) audioRef.current.pause();
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

    if (beforeVideoRef.current && afterVideoRef.current) {
      const beforeDuration = currentProc.before_end_time - currentProc.before_start_time;
      const afterDuration = currentProc.after_end_time - currentProc.after_start_time;

      const beforeElapsed = beforeVideoRef.current.currentTime - currentProc.before_start_time;
      const afterElapsed = afterVideoRef.current.currentTime - currentProc.after_start_time;

      setBeforeProgress(beforeDuration > 0 ? Math.min(Math.max((beforeElapsed / beforeDuration) * 100, 0), 100) : 100);
      setAfterProgress(afterDuration > 0 ? Math.min(Math.max((afterElapsed / afterDuration) * 100, 0), 100) : 100);

      // 使用较慢的视频时间作为主时间显示（单片段内）
      setCurrentTime(Math.max(beforeElapsed, afterElapsed));

      // 累计播放总时间（用于字幕进度，不受循环影响）
      if (isPlayingRef.current) {
        setElapsedSinceStart(prev => prev + 0.05); // 按 update 间隔粗略累加，或者更精确些
      }

      // 同步校正（仅针对正常对比步骤，减少累积误差）
      if (currentProc.process_type === 'normal' && isPlayingRef.current) {
        const drift = Math.abs(beforeElapsed - afterElapsed);
        if (drift > 0.15) { // 偏差超过150ms则校正
          const newAfterTime = currentProc.after_start_time + beforeElapsed;
          if (Number.isFinite(newAfterTime)) {
            afterVideoRef.current.currentTime = newAfterTime;
          }
        }
      }

      // 检查是否到达结束时间
      const beforeFinished = beforeVideoRef.current.currentTime >= currentProc.before_end_time - 0.1;
      const afterFinished = afterVideoRef.current.currentTime >= currentProc.after_end_time - 0.1;

      if (beforeFinished && afterFinished && isPlayingRef.current) {
        setHasPlayedOnce(true);

        // AI 讲解模式下的智能循环逻辑
        const narrationDuration = calculateNarrationDuration(currentProc.subtitle_text, narrationSpeed);
        const speechFinished = !aiNarratorActive || elapsedSinceStart >= narrationDuration;

        if (aiNarratorActive && !speechFinished) {
          // 语音没读完，强制循环
          if (Number.isFinite(currentProc.before_start_time)) {
            beforeVideoRef.current.currentTime = currentProc.before_start_time;
          }
          if (Number.isFinite(currentProc.after_start_time)) {
            afterVideoRef.current.currentTime = currentProc.after_start_time;
          }
          return;
        }

        // 修改点：讲解完成后，视频完成当前这一轮播放后停止
        if (aiNarratorActive && speechFinished) {
          handlePause();
          return;
        }

        // 原有循环播放逻辑
        if (isLooping) {
          if (globalMode) {
            if (currentProcessIndex < processes.length - 1) {
              playNextProcess();
            } else {
              handleRestart();
            }
          } else {
            beforeVideoRef.current.currentTime = currentProc.before_start_time;
            afterVideoRef.current.currentTime = currentProc.after_start_time;
          }
        } else {
          if (globalMode && currentProcessIndex < processes.length - 1) {
            playNextProcess();
          } else {
            handlePause();
          }
        }
      }
    }
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

      if (isPlayingRef.current) {
        const playBefore = nextProcess.process_type !== 'new_step';
        const playAfter = nextProcess.process_type !== 'cancelled';
        const plays = [];

        if (playBefore) plays.push(beforeVideoRef.current.play());
        if (playAfter) plays.push(afterVideoRef.current.play());

        try {
          await Promise.all(plays);
          // 确保 UI 状态同步
          setIsPlaying(true);
          // 切换工序时重置讲解进度
          setElapsedSinceStart(0);
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

      if (isPlayingRef.current) {
        const playBefore = prevProcess.process_type !== 'new_step';
        const playAfter = prevProcess.process_type !== 'cancelled';
        const plays = [];

        if (playBefore) plays.push(beforeVideoRef.current.play());
        if (playAfter) plays.push(afterVideoRef.current.play());

        try {
          await Promise.all(plays);
          // 确保 UI 状态同步
          setIsPlaying(true);
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
        const playBefore = firstProcess.process_type !== 'new_step';
        const playAfter = firstProcess.process_type !== 'cancelled';
        const plays = [];

        if (playBefore) plays.push(beforeVideoRef.current.play());
        if (playAfter) plays.push(afterVideoRef.current.play());

        await Promise.all(plays);

        // 再次确认倍速
        if (beforeVideoRef.current) beforeVideoRef.current.playbackRate = playbackRate;
        if (afterVideoRef.current) afterVideoRef.current.playbackRate = playbackRate;

        setIsPlaying(true);
      } catch (error) {
        console.error('从头播放失败:', error);
      }
    }
  };

  // 键盘快捷键
  const togglePlayPause = useCallback(() => {
    if (isPlayingRef.current) {
      handlePause();
    } else {
      handlePlay();
    }
  }, []);

  const setSpeed = useCallback((speed) => {
    setPlaybackRate(speed);
    if (beforeVideoRef.current) beforeVideoRef.current.playbackRate = speed;
    if (afterVideoRef.current) afterVideoRef.current.playbackRate = speed;
  }, []);

  useKeyboardShortcuts({
    'Space': togglePlayPause,
    'ArrowLeft': () => canGoPrev && playPrevProcess(),
    'ArrowRight': () => canGoNext && playNextProcess(),
    'KeyL': () => setIsLooping(prev => !prev),
    'Digit1': () => setSpeed(1),
    'Digit2': () => setSpeed(2),
    'Digit3': () => setSpeed(3),
    'Digit5': () => setSpeed(5),
  }, !!processes && processes.length > 0);

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
          {currentProc.process_type === 'new_step' && <span className="type-badge badge-new">新增步骤</span>}
          {currentProc.process_type === 'cancelled' && <span className="type-badge badge-cancelled">减少步骤</span>}
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
              checked={aiNarratorActive || isLooping}
              disabled={aiNarratorActive}
              onChange={(e) => setIsLooping(e.target.checked)}
              style={{ marginRight: '4px', cursor: aiNarratorActive ? 'not-allowed' : 'pointer' }}
            />
            {aiNarratorActive ? '讲解模式循环' : '循环播放'}
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
            {/* 标注层 - 改善前 */}
            <AnnotationLayer
              videoRef={beforeVideoRef}
              processId={currentProc?.id}
              videoType="before"
              currentTime={currentTime}
              isEditing={isAnnotationEditing && editingVideoType === 'before'}
            />
            {/* 标注编辑按钮 */}
            <button
              className={`annotation-edit-btn ${isAnnotationEditing && editingVideoType === 'before' ? 'active' : ''}`}
              onClick={() => {
                if (isAnnotationEditing && editingVideoType === 'before') {
                  setIsAnnotationEditing(false);
                  setEditingVideoType(null);
                } else {
                  setIsAnnotationEditing(true);
                  setEditingVideoType('before');
                }
              }}
              title={isAnnotationEditing && editingVideoType === 'before' ? '退出标注' : '标注'}
            >
              {isAnnotationEditing && editingVideoType === 'before' ? '✕' : '✏'}
            </button>
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
            {/* 标注层 - 改善后 */}
            <AnnotationLayer
              videoRef={afterVideoRef}
              processId={currentProc?.id}
              videoType="after"
              currentTime={currentTime}
              isEditing={isAnnotationEditing && editingVideoType === 'after'}
            />
            {/* 标注编辑按钮 */}
            <button
              className={`annotation-edit-btn ${isAnnotationEditing && editingVideoType === 'after' ? 'active' : ''}`}
              onClick={() => {
                if (isAnnotationEditing && editingVideoType === 'after') {
                  setIsAnnotationEditing(false);
                  setEditingVideoType(null);
                } else {
                  setIsAnnotationEditing(true);
                  setEditingVideoType('after');
                }
              }}
              title={isAnnotationEditing && editingVideoType === 'after' ? '退出标注' : '标注'}
            >
              {isAnnotationEditing && editingVideoType === 'after' ? '✕' : '✏'}
            </button>
            {currentProc.process_type === 'cancelled' && (
              <div className="video-mask mask-cancelled">
                <div className="mask-content">
                  <div className="mask-icon">🚫</div>
                  <div className="mask-text">减少步骤/已取消</div>
                </div>
              </div>
            )}
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${afterProgress}%` }} />
          </div>
        </div>
      </div>

      {/* 字幕层 */}
      <SubtitleOverlay
        text={currentProc.subtitle_text}
        isPlaying={isPlaying}
        currentTime={elapsedSinceStart}
        isActive={aiNarratorActive}
        narrationSpeed={narrationSpeed}
      />

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

        {/* 柱状图 */}
        {processes && processes.length > 1 && (
          <ProcessTimeChart
            processes={processes}
            currentProcessIndex={currentProcessIndex}
          />
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

export default memo(ComparePlayer);

