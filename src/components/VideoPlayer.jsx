import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { formatTime, formatTimeSaved, calculateNarrationDuration } from '../utils/time';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import AnnotationLayer from './AnnotationLayer';
import SubtitleOverlay from './SubtitleOverlay';

function VideoPlayer({ process, stage, aiNarratorActive = false, narrationSpeed = 5.0 }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [elapsedSinceStart, setElapsedSinceStart] = useState(0); // 累计播放时间
  const [duration, setDuration] = useState(0);
  const [viewMode, setViewMode] = useState('before'); // before, after
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isAnnotationEditing, setIsAnnotationEditing] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const audioRef = useRef(new Audio());
  const [audioPath, setAudioPath] = useState(null);
  const playStartTimeRef = useRef(0);
  const elapsedAtPauseRef = useRef(0);

  useEffect(() => {
    if (videoRef.current && process) {
      videoRef.current.pause();
      setIsPlaying(false);
      const startTime = viewMode === 'before' ? process.before_start_time : process.after_start_time;

      // 安全检查：确保 startTime 是有限数值，防止浏览器报错
      if (Number.isFinite(startTime)) {
        videoRef.current.currentTime = startTime;
        setCurrentTime(startTime);
      } else {
        videoRef.current.currentTime = 0;
        setCurrentTime(0);
      }
      setElapsedSinceStart(0);
      elapsedAtPauseRef.current = 0;
    }
  }, [process?.id, viewMode]);

  // 播放暂停逻辑记录时间
  useEffect(() => {
    if (isPlaying) {
      playStartTimeRef.current = Date.now() - (elapsedAtPauseRef.current * 1000);
    } else {
      elapsedAtPauseRef.current = elapsedSinceStart;
    }
  }, [isPlaying]);

  // 监听 AI 讲解开关，从关闭到开启时重置讲解进度
  useEffect(() => {
    if (aiNarratorActive) {
      setElapsedSinceStart(0);
      elapsedAtPauseRef.current = 0;
    }
  }, [aiNarratorActive]);

  // 预加载/切换 TTS 语音
  useEffect(() => {
    const loadTTS = async () => {
      if (aiNarratorActive && process?.subtitle_text) {
        try {
          const path = await window.electronAPI.generateSpeech(
            process.subtitle_text,
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

    // 组件卸载时停止音频
    return () => {
      audioRef.current.pause();
      audioRef.current.src = "";
    };
  }, [process?.id, aiNarratorActive, narrationSpeed]);

  // 监听标注模式切换，进入标注模式时自动暂停
  useEffect(() => {
    if (isAnnotationEditing && isPlaying) {
      handlePause();
    }
  }, [isAnnotationEditing]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // 键盘快捷键
  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  }, [isPlaying]);

  const setSpeed = useCallback((speed) => {
    setPlaybackRate(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, []);

  useKeyboardShortcuts({
    'Space': togglePlayPause,
    'KeyL': () => setIsLooping(prev => !prev),
    'Digit1': () => setSpeed(1),
    'Digit2': () => setSpeed(2),
    'Digit3': () => setSpeed(3),
    'Digit5': () => setSpeed(5),
  }, !!process);

  const handleSpeedChange = (e) => {
    const newRate = parseFloat(e.target.value);
    setPlaybackRate(newRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = newRate;
    }
  };

  const handlePlay = () => {
    if (!videoRef.current || !process) return;

    const startTime = viewMode === 'before' ? process.before_start_time : process.after_start_time;

    if (Number.isFinite(startTime)) {
      videoRef.current.currentTime = startTime;
    }
    videoRef.current.playbackRate = playbackRate;

    // 重新开启讲解
    setElapsedSinceStart(0);
    elapsedAtPauseRef.current = 0;
    playStartTimeRef.current = Date.now();

    // 播放 AI 语音
    if (aiNarratorActive && audioRef.current.src) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.warn('音频播放中断:', e));
    }

    videoRef.current.play().then(() => {
      // 再次确认倍速（防止 play() 重置）
      if (videoRef.current) videoRef.current.playbackRate = playbackRate;
    }).catch(error => {
      console.error('播放失败:', error);
    });
    setIsPlaying(true);
  };

  const handlePause = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      if (audioRef.current) audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);

      if (!process) return;

      const startTime = viewMode === 'before' ? process.before_start_time : process.after_start_time;
      const endTime = viewMode === 'before' ? process.before_end_time : process.after_end_time;

      if (isPlaying) {
        const now = Date.now();
        const elapsed = (now - playStartTimeRef.current) / 1000;
        setElapsedSinceStart(elapsed);
      }

      if (videoRef.current.currentTime >= endTime - 0.1) {
        // AI 讲解模式下的同步循环逻辑 (技术同步层)
        // 只要语音没读完，视频就强制回到当前环节起点重播，此逻辑不依赖用户是否勾选"连续播放"
        const narrationDuration = calculateNarrationDuration(process.subtitle_text, narrationSpeed);
        const speechFinished = !aiNarratorActive || elapsedSinceStart >= narrationDuration;

        if (aiNarratorActive && !speechFinished) {
          if (Number.isFinite(startTime)) {
            videoRef.current.currentTime = startTime;
          }
          return;
        }

        // 环节播放结束后的行为决策 (用户意图层)
        if (isLooping) {
          handlePlay();
        } else {
          handlePause();
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.playbackRate = playbackRate;
    }
  };

  const getVideoPath = () => {
    const path = viewMode === 'before' ? stage.before_video_path : stage.after_video_path;
    // 使用自定义协议加载本地视频
    return path ? `local-video://${path}` : '';
  };

  const getProgress = () => {
    if (!process) return 0;
    const startTime = viewMode === 'before' ? process.before_start_time : process.after_start_time;
    const endTime = viewMode === 'before' ? process.before_end_time : process.after_end_time;
    const segmentDuration = endTime - startTime;
    const elapsed = currentTime - startTime;
    return Math.min(Math.max((elapsed / segmentDuration) * 100, 0), 100);
  };

  if (!process) {
    return (
      <div className="video-player-empty">
        <div className="empty-icon">▶️</div>
        <h3>请从左侧选择一个工序</h3>
        <p>选择工序后可以单独播放改善前或改善后的视频片段</p>
      </div>
    );
  }

  return (
    <div className="video-player">
      <div className="video-header">
        <h3>{process.name}</h3>
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
          <div className="view-toggle">
            <button
              className={`toggle-btn ${viewMode === 'before' ? 'active' : ''}`}
              onClick={() => setViewMode('before')}
            >
              改善前
            </button>
            <button
              className={`toggle-btn ${viewMode === 'after' ? 'active' : ''}`}
              onClick={() => setViewMode('after')}
            >
              改善后
            </button>
          </div>
        </div>
      </div>

      {process.description && (
        <div className="process-info">
          <p className="info-label">工序描述：</p>
          <p>{process.description}</p>
        </div>
      )}

      {process.improvement_note && (
        <div className="process-info improvement">
          <p className="info-label">改善说明：</p>
          <p>{process.improvement_note}</p>
        </div>
      )}

      <div className="video-wrapper">
        <video
          ref={videoRef}
          src={getVideoPath()}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          muted={isMuted}
          className="video-element"
        />

        {/* 标注层 */}
        <AnnotationLayer
          videoRef={videoRef}
          processId={process?.id}
          videoType={viewMode}
          currentTime={currentTime}
          isEditing={isAnnotationEditing}
        />

        {/* 标注编辑按钮 */}
        <button
          className={`annotation-edit-btn ${isAnnotationEditing ? 'active' : ''}`}
          onClick={() => setIsAnnotationEditing(!isAnnotationEditing)}
          title={isAnnotationEditing ? '退出标注编辑' : '编辑标注'}
        >
          {isAnnotationEditing ? '✕ 退出标注' : '✏ 添加标注'}
        </button>

        {/* 字幕层 */}
        <SubtitleOverlay
          text={process.subtitle_text}
          isPlaying={isPlaying}
          currentTime={elapsedSinceStart}
          isActive={aiNarratorActive}
          narrationSpeed={narrationSpeed}
        />

        <div className="video-overlay">
          <div className="video-controls-overlay">
            {!isPlaying ? (
              <button className="play-btn-large" onClick={handlePlay}>
                ▶
              </button>
            ) : (
              <button className="pause-btn-large" onClick={handlePause}>
                ⏸
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="video-controls">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${getProgress()}%` }} />
        </div>
        <div className="controls-row">
          <button
            className="control-button"
            onClick={isPlaying ? handlePause : handlePlay}
          >
            {isPlaying ? '⏸ 暂停' : '▶ 播放'}
          </button>
          <button
            className={`control-button ${isMuted ? 'muted' : ''}`}
            onClick={() => setIsMuted(!isMuted)}
            title={isMuted ? "打开声音" : "关闭声音"}
          >
            {isMuted ? '🔇 静音' : '🔊 声音'}
          </button>
          <div className="time-display">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
          <div className="segment-info">
            片段时长：{formatTime(
              (viewMode === 'before'
                ? process.before_end_time - process.before_start_time
                : process.after_end_time - process.after_start_time)
            )}
          </div>
        </div>
      </div>

      <div className="time-comparison">
        <div className="comparison-item">
          <span className="label">改善前时长：</span>
          <span className="value">
            {formatTime(process.before_end_time - process.before_start_time)}
          </span>
        </div>
        <div className="comparison-item">
          <span className="label">改善后时长：</span>
          <span className="value">
            {formatTime(process.after_end_time - process.after_start_time)}
          </span>
        </div>
        <div className={`comparison-item highlight ${(process.time_saved || 0) < 0 ? 'time-increased' : ''}`}>
          <span className="value saved">
            {formatTimeSaved(process.time_saved)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(VideoPlayer);
