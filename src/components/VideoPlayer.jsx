import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { formatTime, formatTimeSaved, calculateNarrationDuration } from '../utils/time';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import AnnotationLayer from './AnnotationLayer';
import SubtitleOverlay from './SubtitleOverlay';
import { generateTimingMap } from '../utils/timing';

function VideoPlayer({ process, stage, aiNarratorActive = false, narrationSpeed = 5.0, presentationMode = false }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [autoSwitch, setAutoSwitch] = useState(false);
  const [switchOnSpeechEnd, setSwitchOnSpeechEnd] = useState(false); // 语音完即切换
  const [currentTime, setCurrentTime] = useState(0);
  const [elapsedSinceStart, setElapsedSinceStart] = useState(0);
  const [duration, setDuration] = useState(0);
  const [viewMode, setViewMode] = useState('before');
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isAnnotationEditing, setIsAnnotationEditing] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const audioRef = useRef(new Audio());
  const [audioPath, setAudioPath] = useState(null);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [timingData, setTimingData] = useState([]);
  const [ttsStatus, setTtsStatus] = useState('idle'); // 'idle' | 'generating' | 'ready'
  const playStartTimeRef = useRef(0);
  const elapsedAtPauseRef = useRef(0);

  useEffect(() => {
    if (videoRef.current && process) {
      videoRef.current.pause();
      setIsPlaying(false);
      const startTime = viewMode === 'before' ? process.before_start_time : process.after_start_time;

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

  useEffect(() => {
    if (isPlaying) {
      playStartTimeRef.current = Date.now() - (elapsedAtPauseRef.current * 1000);
    } else {
      elapsedAtPauseRef.current = elapsedSinceStart;
    }
  }, [isPlaying]);

  useEffect(() => {
    if (aiNarratorActive) {
      setElapsedSinceStart(0);
      elapsedAtPauseRef.current = 0;
    }
  }, [aiNarratorActive]);

  // 预加载 TTS 语音和生成时间戳
  const loadTTS = useCallback(async (forceRegenerate = false) => {
    // 根据 viewMode 和 subtitle_mode 决定使用哪个文本
    let targetText = process?.subtitle_text || '';
    if (process?.subtitle_mode === 'separate' && viewMode === 'after') {
      targetText = process?.subtitle_after || '';
    }

    // 没有字幕文本时，保持 idle 状态，不阻止播放
    if (!aiNarratorActive || !targetText.trim()) {
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

      const path = await window.electronAPI.generateSpeech(
        targetText,
        "zh-CN-XiaoxiaoNeural",
        narrationSpeed,
        forceRegenerate
      );
      setAudioPath(path);
      audioRef.current.src = `local-video://${path}`;

      audioRef.current.onloadedmetadata = () => {
        const duration = audioRef.current.duration;
        if (duration > 0) {
          const timing = generateTimingMap(targetText, duration);
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
  }, [aiNarratorActive, narrationSpeed, process?.subtitle_text, process?.subtitle_after, process?.subtitle_mode, viewMode]);

  useEffect(() => {
    loadTTS();

    return () => {
      audioRef.current.pause();
      audioRef.current.src = "";
    };
  }, [process?.id, aiNarratorActive, narrationSpeed, viewMode]);

  useEffect(() => {
    if (isAnnotationEditing && isPlaying) {
      handlePause();
    }
  }, [isAnnotationEditing]);

  // 进入演示模式时强制退出标注编辑，避免入口按钮隐藏后编辑态卡住
  useEffect(() => {
    if (presentationMode) setIsAnnotationEditing(false);
  }, [presentationMode]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

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

  // 从头播放
  const handlePlayFromStart = () => {
    if (!videoRef.current || !process) return;

    const startTime = viewMode === 'before' ? process.before_start_time : process.after_start_time;

    if (Number.isFinite(startTime)) {
      videoRef.current.currentTime = startTime;
    }
    videoRef.current.playbackRate = playbackRate;

    setElapsedSinceStart(0);
    elapsedAtPauseRef.current = 0;
    playStartTimeRef.current = Date.now();

    // 播放 AI 语音
    if (aiNarratorActive && audioRef.current.src) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.warn('音频播放中断:', e));
    }

    videoRef.current.play().then(() => {
      if (videoRef.current) videoRef.current.playbackRate = playbackRate;
    }).catch(error => {
      console.error('播放失败:', error);
    });
    setIsPlaying(true);
  };

  // 继续播放（从暂停位置）
  const handleResume = () => {
    if (!videoRef.current || !process) return;

    videoRef.current.playbackRate = playbackRate;
    playStartTimeRef.current = Date.now() - (elapsedAtPauseRef.current * 1000);

    // 继续 AI 语音
    if (aiNarratorActive && audioRef.current.src) {
      audioRef.current.play().catch(e => console.warn('音频播放中断:', e));
    }

    videoRef.current.play().then(() => {
      if (videoRef.current) videoRef.current.playbackRate = playbackRate;
    }).catch(error => {
      console.error('播放失败:', error);
    });
    setIsPlaying(true);
  };

  // 智能播放：判断是从头还是继续
  const handlePlay = () => {
    if (!videoRef.current || !process) return;

    const startTime = viewMode === 'before' ? process.before_start_time : process.after_start_time;
    const endTime = viewMode === 'before' ? process.before_end_time : process.after_end_time;
    const currentPos = videoRef.current.currentTime;

    // 如果在有效范围内且有进度，则继续播放；否则从头开始
    const hasProgress = currentPos > startTime + 0.1 && currentPos < endTime - 0.1;

    if (hasProgress) {
      handleResume();
    } else {
      handlePlayFromStart();
    }
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
        // 如果有真实音频，使用音频时间；否则用计时器
        if (aiNarratorActive && audioRef.current.src && !audioRef.current.paused) {
          setElapsedSinceStart(audioRef.current.currentTime);
        } else {
          const now = Date.now();
          const elapsed = (now - playStartTimeRef.current) / 1000;
          setElapsedSinceStart(elapsed);
        }
      }

      // AI 讲解模式：判断语音是否完成
      let speechFinished = true;
      if (aiNarratorActive) {
        if (audioRef.current.src && isAudioReady) {
          speechFinished = audioRef.current.ended || audioRef.current.currentTime >= audioRef.current.duration - 0.1;
        } else {
          // 分离模式下根据 viewMode 选择正确的文本
          const targetText = (process.subtitle_mode === 'separate' && viewMode === 'after')
            ? (process.subtitle_after || '')
            : (process.subtitle_text || '');
          const narrationDuration = calculateNarrationDuration(targetText, narrationSpeed);
          speechFinished = elapsedSinceStart >= narrationDuration;
        }
      }

      // 语音完即切换模式：音频结束就切换，不管视频
      const videoAtEnd = videoRef.current.currentTime >= endTime - 0.1;
      const shouldProceed = switchOnSpeechEnd ? (aiNarratorActive && speechFinished) : videoAtEnd;

      if (shouldProceed) {
        // 非立即切换模式下，如果视频到了但音频没完，视频循环
        if (!switchOnSpeechEnd && aiNarratorActive && !speechFinished) {
          if (Number.isFinite(startTime)) {
            videoRef.current.currentTime = startTime;
          }
          return;
        }

        // 环节播放结束后的行为决策
        // 四种模式：
        // 自动切换=关, 循环=关: 单次播放 → 停止
        // 自动切换=关, 循环=开: 单曲循环
        // 自动切换=开, 循环=关: 顺序播放（前→后→停）
        // 自动切换=开, 循环=开: 列表循环（前→后→前→...）

        if (autoSwitch) {
          if (viewMode === 'before') {
            // 切换到改善后继续播放
            setViewMode('after');
            // viewMode 变化会触发 useEffect 重置位置，然后调用 handlePlayFromStart
            setTimeout(() => handlePlayFromStart(), 100);
          } else {
            // 改善后播放完成
            if (isLooping) {
              // 列表循环：回到改善前
              setViewMode('before');
              setTimeout(() => handlePlayFromStart(), 100);
            } else {
              // 顺序播放：停止
              handlePause();
            }
          }
        } else {
          if (isLooping) {
            // 单曲循环
            handlePlayFromStart();
          } else {
            // 单次播放
            handlePause();
          }
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

  // 处理视频 ended 事件，确保循环逻辑能够执行
  const handleVideoEnded = () => {
    if (!isPlaying || !process) return;

    const startTime = viewMode === 'before' ? process.before_start_time : process.after_start_time;

    // 检查音频是否结束
    if (aiNarratorActive && audioRef.current.src && isAudioReady) {
      const audioEnded = audioRef.current.ended ||
        (audioRef.current.duration > 0 && Math.abs(audioRef.current.currentTime - audioRef.current.duration) < 0.2);

      if (!audioEnded) {
        // 音频还没结束，视频需要循环
        if (videoRef.current && Number.isFinite(startTime)) {
          videoRef.current.currentTime = startTime;
          videoRef.current.play();
        }
      }
    }
  };

  const getVideoPath = () => {
    const path = viewMode === 'before' ? stage.before_video_path : stage.after_video_path;
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
        <div className="header-title-row">
          <h3>{process.name}</h3>
          {aiNarratorActive && (process?.subtitle_text || process?.subtitle_after) && (
            <div className={`ai-status-tag ${ttsStatus === 'ready' ? 'ready' : 'processing'}`}>
              <span className="dot"></span>
              {ttsStatus === 'generating' ? '生成中...' : ttsStatus === 'ready' ? '已就绪' : '等待中'}
              {ttsStatus === 'ready' && !presentationMode && (
                <button className="regenerate-btn" onClick={(e) => { e.stopPropagation(); loadTTS(true); }} title="重新生成">↻</button>
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
              checked={autoSwitch}
              onChange={(e) => setAutoSwitch(e.target.checked)}
              style={{ marginRight: '4px', cursor: 'pointer' }}
            />
            自动切换
          </label>
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
            循环
          </label>
          {aiNarratorActive && (
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
                checked={switchOnSpeechEnd}
                onChange={(e) => setSwitchOnSpeechEnd(e.target.checked)}
                style={{ marginRight: '4px', cursor: 'pointer' }}
              />
              语音完即切换
            </label>
          )}
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

      <div className="video-wrapper" onClick={togglePlayPause} style={{ cursor: 'pointer' }}>
        <video
          ref={videoRef}
          src={getVideoPath()}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleVideoEnded}
          muted={isMuted}
          className="video-element"
        />

        <AnnotationLayer
          videoRef={videoRef}
          processId={process?.id}
          videoType={viewMode}
          currentTime={currentTime}
          isEditing={isAnnotationEditing}
        />

        {!presentationMode && (
          <button
            className={`annotation-edit-btn ${isAnnotationEditing ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setIsAnnotationEditing(!isAnnotationEditing); }}
            title={isAnnotationEditing ? '退出标注编辑' : '编辑标注'}
          >
            {isAnnotationEditing ? '✕ 退出标注' : '✏ 添加标注'}
          </button>
        )}

        {/* 字幕层 - 使用真实音频时间戳数据 */}
        <SubtitleOverlay
          key={`${process.id}-${viewMode}`}
          text={process.subtitle_mode === 'separate' && viewMode === 'after'
            ? (process.subtitle_after || '')
            : process.subtitle_text}
          isPlaying={isPlaying}
          currentTime={elapsedSinceStart}
          isActive={aiNarratorActive}
          timingData={timingData}
          narrationSpeed={narrationSpeed}
        />

        {!isPlaying && (
          <div className="video-overlay" onClick={(e) => e.stopPropagation()}>
            <div className="video-controls-overlay">
              <button className="play-btn-large" onClick={handlePlay}>
                ▶
              </button>
            </div>
          </div>
        )}
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
