import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { formatTime, formatTimeSaved, calculateNarrationDuration } from '../utils/time';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import ProcessTimeChart from './ProcessTimeChart';
import AnnotationLayer from './AnnotationLayer';
import SubtitleOverlay from './SubtitleOverlay';
import { generateTimingMap } from '../utils/timing';

function ComparePlayer({ process, processes, stage, layoutMode, globalMode = false, onProcessChange, aiNarratorActive = false, narrationSpeed = 5.0 }) {
  const beforeVideoRef = useRef(null);
  const afterVideoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [elapsedSinceStart, setElapsedSinceStart] = useState(0);
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false);
  const [beforeProgress, setBeforeProgress] = useState(0);
  const [afterProgress, setAfterProgress] = useState(0);
  const [currentProcessIndex, setCurrentProcessIndex] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [isAnnotationEditing, setIsAnnotationEditing] = useState(false);
  const [editingVideoType, setEditingVideoType] = useState(null);
  const [isMuted, setIsMuted] = useState(true);
  const isPlayingRef = useRef(isPlaying);
  const audioRef = useRef(new Audio());
  const [audioPath, setAudioPath] = useState(null);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [timingData, setTimingData] = useState([]);
  const [ttsStatus, setTtsStatus] = useState('idle'); // 'idle' | 'generating' | 'ready'
  const playStartTimeRef = useRef(0);
  const elapsedAtPauseRef = useRef(0);

  const getCurrentProcess = () => {
    if (globalMode && processes) {
      return processes[currentProcessIndex];
    }
    if (!globalMode && processes && processes.length > 0) {
      return processes[currentProcessIndex] || process;
    }
    return process;
  };

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!globalMode && process) {
      const idx = processes.findIndex(p => p.id === process.id);
      setCurrentProcessIndex(idx >= 0 ? idx : 0);
    }
  }, [process, processes, globalMode]);

  useEffect(() => {
    if (isPlaying) {
      playStartTimeRef.current = Date.now() - (elapsedAtPauseRef.current * 1000);
    } else {
      elapsedAtPauseRef.current = elapsedSinceStart;
    }
  }, [isPlaying]);

  useEffect(() => {
    if (stage.before_video_path || stage.after_video_path) {
      if (beforeVideoRef.current) beforeVideoRef.current.pause();
      if (afterVideoRef.current) afterVideoRef.current.pause();
      setIsPlaying(false);
      setCurrentTime(0);
      setBeforeProgress(0);
      setAfterProgress(0);
      setElapsedSinceStart(0);
      elapsedAtPauseRef.current = 0;
      setHasPlayedOnce(false);
    }
  }, [stage.id, globalMode, process?.id]);

  useEffect(() => {
    if (aiNarratorActive) {
      setElapsedSinceStart(0);
      elapsedAtPauseRef.current = 0;
    }
  }, [aiNarratorActive]);

  // 预加载 TTS 语音和生成时间戳
  const loadTTS = useCallback(async (forceRegenerate = false) => {
    const currentProc = getCurrentProcess();

    // 没有字幕文本时，保持 idle 状态，不阻止播放
    if (!aiNarratorActive || !currentProc?.subtitle_text?.trim()) {
      setAudioPath(null);
      setTimingData([]);
      setIsAudioReady(false);
      setTtsStatus('idle');
      audioRef.current.src = "";
      return;
    }

    try {
      setTtsStatus('generating');
      setIsAudioReady(false);

      // 如果强制重新生成，先删除缓存
      if (forceRegenerate) {
        const hash = btoa(unescape(encodeURIComponent(`${currentProc.subtitle_text}_${narrationSpeed}`))).substring(0, 32);
        await window.electronAPI.deleteSpeechCache(hash);
      }

      const path = await window.electronAPI.generateSpeech(
        currentProc.subtitle_text,
        "zh-CN-XiaoxiaoNeural",
        narrationSpeed
      );
      setAudioPath(path);
      audioRef.current.src = `local-video://${path}`;

      // 等待音频加载完成后生成时间戳
      audioRef.current.onloadedmetadata = () => {
        const duration = audioRef.current.duration;
        if (duration > 0) {
          const timing = generateTimingMap(currentProc.subtitle_text, duration);
          setTimingData(timing);
        }
        setIsAudioReady(true);
        setTtsStatus('ready');
      };
      audioRef.current.load();
    } catch (err) {
      console.error('TTS 加载失败:', err);
      setIsAudioReady(false);
      setTtsStatus('idle');
    }
  }, [aiNarratorActive, narrationSpeed, getCurrentProcess]);

  useEffect(() => {
    loadTTS();

    return () => {
      audioRef.current.pause();
      audioRef.current.src = "";
    };
  }, [getCurrentProcess()?.id, aiNarratorActive, narrationSpeed]);

  useEffect(() => {
    if (isAnnotationEditing && isPlaying) {
      handlePause();
    }
  }, [isAnnotationEditing]);

  useEffect(() => {
    if (beforeVideoRef.current) beforeVideoRef.current.playbackRate = playbackRate;
    if (afterVideoRef.current) afterVideoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  const handlePlay = async (targetProc = null) => {
    const currentProc = targetProc || getCurrentProcess();
    if (!beforeVideoRef.current || !afterVideoRef.current || !currentProc) return;

    if (Number.isFinite(currentProc.before_start_time)) {
      beforeVideoRef.current.currentTime = currentProc.before_start_time;
    }
    if (Number.isFinite(currentProc.after_start_time)) {
      afterVideoRef.current.currentTime = currentProc.after_start_time;
    }

    beforeVideoRef.current.playbackRate = playbackRate;
    afterVideoRef.current.playbackRate = playbackRate;

    setElapsedSinceStart(0);
    elapsedAtPauseRef.current = 0;
    playStartTimeRef.current = Date.now();
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

    if (!playBefore && beforeVideoRef.current) beforeVideoRef.current.pause();
    if (!playAfter && afterVideoRef.current) afterVideoRef.current.pause();

    try {
      await Promise.all(plays);
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
      setCurrentTime(Math.max(beforeElapsed, afterElapsed));

      // 高精度累计播放总时间（用于字幕进度）
      if (isPlayingRef.current) {
        // 如果有真实音频，使用音频时间；否则用计时器
        if (aiNarratorActive && audioRef.current.src && !audioRef.current.paused) {
          setElapsedSinceStart(audioRef.current.currentTime);
        } else {
          const now = Date.now();
          const elapsed = (now - playStartTimeRef.current) / 1000;
          setElapsedSinceStart(elapsed);
        }
      }

      // 快慢等待逻辑
      const beforeAtEnd = beforeVideoRef.current.currentTime >= currentProc.before_end_time - 0.05;
      const afterAtEnd = afterVideoRef.current.currentTime >= currentProc.after_end_time - 0.05;

      if (beforeAtEnd && !afterAtEnd && !beforeVideoRef.current.paused) {
        beforeVideoRef.current.pause();
      }
      if (afterAtEnd && !beforeAtEnd && !afterVideoRef.current.paused) {
        afterVideoRef.current.pause();
      }

      const beforeFinished = beforeAtEnd || beforeVideoRef.current.currentTime >= currentProc.before_end_time;
      const afterFinished = afterAtEnd || afterVideoRef.current.currentTime >= currentProc.after_end_time;

      if (beforeFinished && afterFinished && isPlayingRef.current) {
        setHasPlayedOnce(true);

        // AI 讲解模式：判断语音是否完成
        let speechFinished = true;
        if (aiNarratorActive) {
          if (audioRef.current.src && isAudioReady) {
            // 使用真实音频时长
            speechFinished = audioRef.current.ended || audioRef.current.currentTime >= audioRef.current.duration - 0.1;
          } else {
            // 使用估算时长
            const narrationDuration = calculateNarrationDuration(currentProc.subtitle_text, narrationSpeed);
            speechFinished = elapsedSinceStart >= narrationDuration;
          }
        }

        if (aiNarratorActive && !speechFinished) {
          // 语音没完，视频重新循环
          if (Number.isFinite(currentProc.before_start_time)) {
            beforeVideoRef.current.currentTime = currentProc.before_start_time;
            if (currentProc.process_type !== 'new_step') beforeVideoRef.current.play();
          }
          if (Number.isFinite(currentProc.after_start_time)) {
            afterVideoRef.current.currentTime = currentProc.after_start_time;
            if (currentProc.process_type !== 'cancelled') afterVideoRef.current.play();
          }
          return;
        }

        // 环节播放结束后的行为决策
        if (isLooping) {
          if (globalMode) {
            if (currentProcessIndex < processes.length - 1) {
              playNextProcess();
            } else {
              handleRestart();
            }
          } else {
            handlePlay(currentProc);
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

    if (!globalMode && onProcessChange) {
      onProcessChange(nextProcess);
    }

    await new Promise(resolve => setTimeout(resolve, 150));
    handlePlay(nextProcess);
  };

  const playPrevProcess = async () => {
    if (!processes || processes.length === 0) return;

    const prevIndex = currentProcessIndex - 1;
    if (prevIndex < 0) return;

    setCurrentProcessIndex(prevIndex);
    const prevProcess = processes[prevIndex];

    if (!globalMode && onProcessChange) {
      onProcessChange(prevProcess);
    }

    await new Promise(resolve => setTimeout(resolve, 150));
    handlePlay(prevProcess);
  };

  const getAccumulatedTimeSaved = () => {
    if (!processes || !globalMode) return 0;
    return processes.slice(0, currentProcessIndex + 1).reduce((sum, p) => sum + (p.time_saved || 0), 0);
  };

  const handleRestart = async () => {
    if (!processes || processes.length === 0) return;
    setCurrentProcessIndex(0);
    await new Promise(resolve => setTimeout(resolve, 150));
    handlePlay(processes[0]);
  };

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
        <div className="header-title-row">
          <h3>
            {globalMode ? '全局对比播放' : `工序对比 - ${currentProc.name}`}
            {currentProc.process_type === 'new_step' && <span className="type-badge badge-new">新增步骤</span>}
            {currentProc.process_type === 'cancelled' && <span className="type-badge badge-cancelled">减少步骤</span>}
          </h3>
          {aiNarratorActive && currentProc?.subtitle_text && (
            <div className={`ai-status-tag ${ttsStatus === 'ready' ? 'ready' : 'processing'}`}>
              <span className="dot"></span>
              {ttsStatus === 'generating' ? '生成中...' : ttsStatus === 'ready' ? '已就绪' : '等待中'}
              {ttsStatus === 'ready' && (
                <button className="regenerate-btn" onClick={() => loadTTS(true)} title="重新生成">↻</button>
              )}
            </div>
          )}
        </div>
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
            连续播放
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
              muted={isMuted}
              className="video-element"
            />
            <AnnotationLayer
              videoRef={beforeVideoRef}
              processId={currentProc?.id}
              videoType="before"
              currentTime={currentTime}
              isEditing={isAnnotationEditing && editingVideoType === 'before'}
            />
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
              muted={isMuted}
              className="video-element"
            />
            <AnnotationLayer
              videoRef={afterVideoRef}
              processId={currentProc?.id}
              videoType="after"
              currentTime={currentTime}
              isEditing={isAnnotationEditing && editingVideoType === 'after'}
            />
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

      {/* 字幕层 - 使用真实音频时间戳数据 */}
      <SubtitleOverlay
        text={currentProc.subtitle_text}
        isPlaying={isPlaying}
        currentTime={elapsedSinceStart}
        isActive={aiNarratorActive}
        timingData={timingData}
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
          className={`nav-button mute-btn ${isMuted ? 'muted' : ''}`}
          onClick={() => setIsMuted(!isMuted)}
          title={isMuted ? "打开视频音轨" : "关闭视频音轨"}
          style={{ margin: '0 8px' }}
        >
          {isMuted ? '🔇 静音' : '🔊 声音'}
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
