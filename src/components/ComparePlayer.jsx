import React, { useRef, useEffect, useState, useCallback, memo, useMemo } from 'react';
import { formatTime, formatTimeSaved, calculateNarrationDuration } from '../utils/time';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import ProcessTimeChart from './ProcessTimeChart';
import AnnotationLayer from './AnnotationLayer';
import SubtitleOverlay from './SubtitleOverlay';
import { generateTimingMap } from '../utils/timing';

const getAudioDuration = (path) => {
  return new Promise((resolve) => {
    const a = new Audio(`local-video://${path}`);
    a.onloadedmetadata = () => resolve(a.duration);
    a.onerror = () => resolve(0);
  });
};

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
  const [activeTab, setActiveTab] = useState('before');
  const playStartTimeRef = useRef(0);
  const elapsedAtPauseRef = useRef(0);
  const audioPlaylistRef = useRef([]);
  const currentAudioIndexRef = useRef(0);
  const [splitDuration, setSplitDuration] = useState(0);

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
    // 切换工序或者切换 AI 模式时，暂停并重置播放状态
    if (beforeVideoRef.current) {
      beforeVideoRef.current.pause();
      const proc = getCurrentProcess();
      if (proc && Number.isFinite(proc.before_start_time)) {
        beforeVideoRef.current.currentTime = proc.before_start_time;
      }
    }
    if (afterVideoRef.current) {
      afterVideoRef.current.pause();
      const proc = getCurrentProcess();
      if (proc && Number.isFinite(proc.after_start_time)) {
        afterVideoRef.current.currentTime = proc.after_start_time;
      }
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setElapsedSinceStart(0);
    elapsedAtPauseRef.current = 0;
    setActiveTab('before');
    currentAudioIndexRef.current = 0;
    setBeforeProgress(0);
    setAfterProgress(0);
  }, [aiNarratorActive, currentProcessIndex]);

  // 监听 activeTab 变化，更新 timingData (用于分离模式)
  useEffect(() => {
    const currentProc = getCurrentProcess();
    if (currentProc?.subtitle_mode === 'separate' && audioPlaylistRef.current.length > 0) {
      const idx = activeTab === 'after' ? 1 : 0;
      const track = audioPlaylistRef.current[idx];
      // 只有当 track 存在且有 timing 数据时才更新
      if (track && track.timing) {
        setTimingData(track.timing);
      }
    }
  }, [activeTab, getCurrentProcess]);

  // 预加载 TTS 语音和生成时间戳
  const loadTTS = useCallback(async (forceRegenerate = false) => {
    const currentProc = getCurrentProcess();

    // 没有字幕文本时，保持 idle 状态
    if (!aiNarratorActive || !currentProc?.subtitle_text?.trim()) {
      setAudioPath(null);
      setTimingData([]);
      setIsAudioReady(false);
      setTtsStatus('idle');
      audioRef.current.src = "";
      audioPlaylistRef.current = [];
      return;
    }

    try {
      setTtsStatus('generating');
      setIsAudioReady(false);

      let playlist = [];

      if (currentProc.subtitle_mode === 'separate') {
        // --- 分离模式：生成两段音频 ---
        // 1. 生成两段音频
        // 注意：分离模式需要 subtitle_after，如果没有 subtitle_after 依然退化为单段？
        // 用户明确要求分离模式两段。
        const text1 = currentProc.subtitle_text;
        const text2 = currentProc.subtitle_after || "";

        // 即使没有 text2，也生成，防止逻辑断裂
        const p1Promise = window.electronAPI.generateSpeech(
          text1, "zh-CN-XiaoxiaoNeural", narrationSpeed
        );
        let p2Promise = Promise.resolve(null);
        if (text2) {
          p2Promise = window.electronAPI.generateSpeech(
            text2, "zh-CN-XiaoxiaoNeural", narrationSpeed
          );
        }

        const [path1, path2] = await Promise.all([p1Promise, p2Promise]);

        // 2. 获取确切时长
        const d1 = await getAudioDuration(path1);
        let d2 = 0;
        if (path2) {
          d2 = await getAudioDuration(path2);
        }

        playlist = [
          { src: path1, duration: d1, text: text1 },
          { src: path2, duration: d2, text: text2 }
        ];
        // 不再过滤，确保 [1] 索引永远对应改善后，即便 path2 为空

        setSplitDuration(d1); // 第一段的确切时长

        // 生成 timing data
        if (playlist[0]) playlist[0].timing = generateTimingMap(text1, d1);
        if (playlist[1]) playlist[1].timing = generateTimingMap(text2, d2);

      } else {
        // --- 整合模式：生成一段音频 ---
        const path = await window.electronAPI.generateSpeech(
          currentProc.subtitle_text, "zh-CN-XiaoxiaoNeural", narrationSpeed
        );
        const duration = await getAudioDuration(path);

        playlist = [
          { src: path, duration: duration, text: currentProc.subtitle_text }
        ];

        setSplitDuration(duration); // 整合模式下这就是总长
        const timing = generateTimingMap(currentProc.subtitle_text, duration);
        playlist[0].timing = timing;
      }

      // 设置播放列表状态
      audioPlaylistRef.current = playlist;
      currentAudioIndexRef.current = 0;

      // 初始化播放器
      if (playlist.length > 0) {
        const firstTrack = playlist[0];
        setAudioPath(firstTrack.src);
        // 只有 src 不同才需要重新赋值，避免不必要的重置？
        // 但 loadTTS 是在切换工序时调用的，所以总是新的。
        audioRef.current.src = `local-video://${firstTrack.src}`;
        setTimingData(firstTrack.timing);

        setIsAudioReady(true);
        setTtsStatus('ready');
      } else {
        setIsAudioReady(false);
        setTtsStatus('idle');
      }

    } catch (error) {
      console.error('TTS生成失败:', error);
      setTtsStatus('idle');
      setAudioPath(null);
    }
  }, [narrationSpeed, getCurrentProcess, aiNarratorActive]);

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

    const isResuming = !targetProc && !isPlayingRef.current && elapsedSinceStart > 0;

    if (!isResuming) {
      // --- Restart Logic ---
      if (Number.isFinite(currentProc.before_start_time)) {
        beforeVideoRef.current.currentTime = currentProc.before_start_time;
      }
      if (Number.isFinite(currentProc.after_start_time)) {
        afterVideoRef.current.currentTime = currentProc.after_start_time;
      }

      if (currentProc.subtitle_mode === 'separate') {
        currentAudioIndexRef.current = 0;
        if (audioPlaylistRef.current[0]) {
          audioRef.current.src = `local-video://${audioPlaylistRef.current[0].src}`;
          setTimingData(audioPlaylistRef.current[0].timing);
        }
        setActiveTab('before');
      }

      setElapsedSinceStart(0);
      elapsedAtPauseRef.current = 0;
      playStartTimeRef.current = Date.now();
      setHasPlayedOnce(false);

      if (aiNarratorActive && audioRef.current.src) {
        audioRef.current.currentTime = 0;
      }
    }

    beforeVideoRef.current.playbackRate = playbackRate;
    afterVideoRef.current.playbackRate = playbackRate;

    const plays = [];

    // Decide what to play based on phase and process type
    const playBefore = currentProc.process_type !== 'new_step';
    const playAfter = currentProc.process_type !== 'cancelled';

    // 分离模式 + AI开启：先播改善前，后播改善后
    // 其他情况（整合模式 或 AI关闭）：两个视频同时播放
    if (aiNarratorActive && currentProc.subtitle_mode === 'separate') {
      if (currentAudioIndexRef.current === 0) {
        if (playBefore) plays.push(beforeVideoRef.current.play());
        if (afterVideoRef.current) afterVideoRef.current.pause();
      } else {
        if (playAfter) plays.push(afterVideoRef.current.play());
        if (beforeVideoRef.current) beforeVideoRef.current.pause();
      }
    } else {
      if (playBefore) plays.push(beforeVideoRef.current.play());
      if (playAfter) plays.push(afterVideoRef.current.play());
    }

    if (aiNarratorActive && audioRef.current.src) {
      plays.push(audioRef.current.play().catch(e => console.warn('音频播放中断:', e)));
    }

    try {
      await Promise.all(plays);
      setIsPlaying(true);
    } catch (error) {
      console.error('播放失败:', error);
    }
  };

  const handleTabClick = (tab) => {
    const currentProc = getCurrentProcess();
    if (!currentProc) return;

    if (currentProc.subtitle_mode === 'separate' && audioPlaylistRef.current.length >= 2) {
      if (tab === 'before') {
        currentAudioIndexRef.current = 0;
        audioRef.current.src = `local-video://${audioPlaylistRef.current[0].src}`;
        setTimingData(audioPlaylistRef.current[0].timing);
        if (beforeVideoRef.current) beforeVideoRef.current.currentTime = currentProc.before_start_time || 0;
        if (afterVideoRef.current) afterVideoRef.current.pause();
        setElapsedSinceStart(0);
      } else {
        currentAudioIndexRef.current = 1;
        audioRef.current.src = `local-video://${audioPlaylistRef.current[1].src}`;
        setTimingData(audioPlaylistRef.current[1].timing);
        if (afterVideoRef.current) afterVideoRef.current.currentTime = currentProc.after_start_time || 0;
        if (beforeVideoRef.current) beforeVideoRef.current.pause();
        setElapsedSinceStart(splitDuration);
      }
      setActiveTab(tab);
      if (isPlaying) {
        audioRef.current.play().catch(() => { });
        if (tab === 'before' && beforeVideoRef.current) beforeVideoRef.current.play();
        if (tab === 'after' && afterVideoRef.current) afterVideoRef.current.play();
      }
    } else {
      setActiveTab(tab);
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

      // 高精度累计播放总时间（支持两段音频）
      if (isPlayingRef.current) {
        if (aiNarratorActive && audioRef.current.src && !audioRef.current.paused) {
          let currentTrackTime = audioRef.current.currentTime;
          // 如果正在播放第二段，加上第一段的时长
          if (currentAudioIndexRef.current === 1) {
            currentTrackTime += splitDuration;
          }
          setElapsedSinceStart(currentTrackTime);
        } else {
          const now = Date.now();
          const elapsed = (now - playStartTimeRef.current) / 1000;
          setElapsedSinceStart(elapsed);
        }
      }

      // UI Tab 同步
      if (currentProc.subtitle_mode === 'separate') {
        if (currentAudioIndexRef.current === 1 && activeTab !== 'after') setActiveTab('after');
        if (currentAudioIndexRef.current === 0 && activeTab !== 'before') setActiveTab('before');
      }

      let processComplete = false;
      let speechFinished = true; // 默认 true (如果没有 AI)

      // --- 分离模式逻辑 (双音频文件) ---
      if (aiNarratorActive && currentProc.subtitle_mode === 'separate') {
        const currentIndex = currentAudioIndexRef.current;
        const currentTrack = audioPlaylistRef.current[currentIndex];

        // 判断当前音频是否结束
        const audioEnded = audioRef.current.ended ||
          (audioRef.current.duration > 0 && Math.abs(audioRef.current.currentTime - audioRef.current.duration) < 0.2);

        speechFinished = audioEnded; // 当前段落结束

        if (currentIndex === 0) {
          // --- 阶段一：改善前 ---
          if (afterVideoRef.current && !afterVideoRef.current.paused) afterVideoRef.current.pause();
          const beforeVideoDone = beforeVideoRef.current.ended ||
            beforeVideoRef.current.currentTime >= currentProc.before_end_time - 0.05;

          if (beforeVideoDone) {
            if (audioEnded) {
              // 音频和视频都结束 -> 切换到下一阶段
              if (audioPlaylistRef.current[1]) {
                if (!audioRef.current.paused) audioRef.current.pause();

                // 切换音轨
                currentAudioIndexRef.current = 1;
                const nextTrack = audioPlaylistRef.current[1];
                audioRef.current.src = `local-video://${nextTrack.src}`;
                audioRef.current.play().catch(() => {}); // 播放第二段

                // 启动改善后视频
                if (afterVideoRef.current) {
                  afterVideoRef.current.currentTime = currentProc.after_start_time || 0;
                  afterVideoRef.current.play();
                }

                // 确保改善前视频停止
                beforeVideoRef.current.pause();
                setActiveTab('after');
              } else {
                // 异常：没有第二段音频，视作结束
                processComplete = true;
              }
            } else {
              // 视频太快，音频没讲完 -> 视频循环
              if (beforeVideoRef.current.paused) {
                beforeVideoRef.current.currentTime = currentProc.before_start_time || 0;
                beforeVideoRef.current.play();
              } else {
                // 如果正在播且到了终点，seek 回起点
                beforeVideoRef.current.currentTime = currentProc.before_start_time || 0;
                beforeVideoRef.current.play();
              }
            }
          } else {
            // 视频还在播
            if (audioEnded) {
              // 音频太快，讲完了 -> 暂停音频，等待视频
              if (!audioRef.current.paused) audioRef.current.pause();
            } else {
              // 都在播，正常
              if (audioRef.current.src && audioRef.current.paused && isPlayingRef.current) {
                audioRef.current.play().catch(() => {});
              }
            }
          }

        } else {
          // --- 阶段二：改善后 ---
          if (beforeVideoRef.current && !beforeVideoRef.current.paused) beforeVideoRef.current.pause();
          const afterVideoDone = afterVideoRef.current.ended ||
            afterVideoRef.current.currentTime >= currentProc.after_end_time - 0.05;

          if (afterVideoDone) {
            if (audioEnded) {
              // 都结束了 -> 完成
              processComplete = true;
            } else {
              // 视频太快，音频没讲完 -> 视频循环
              if (afterVideoRef.current.paused) {
                afterVideoRef.current.currentTime = currentProc.after_start_time || 0;
                afterVideoRef.current.play();
              } else {
                afterVideoRef.current.currentTime = currentProc.after_start_time || 0;
                afterVideoRef.current.play();
              }
            }
          } else {
            // 视频还在播
            if (audioEnded) {
              if (!audioRef.current.paused) audioRef.current.pause();
            } else {
              if (audioRef.current.src && audioRef.current.paused && isPlayingRef.current) {
                audioRef.current.play().catch(() => {});
              }
            }
          }
        }

      } else {
        // --- 整合模式 (原有逻辑) ---
        // 重新获取 speechFinished 状态 (单文件)
        if (aiNarratorActive && audioRef.current.src && isAudioReady) {
          speechFinished = audioRef.current.ended || audioRef.current.currentTime >= audioRef.current.duration - 0.1;
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
          } else {
            processComplete = true;
          }
        }
      }

      // 统一的完成处理
      if (processComplete) {
        setHasPlayedOnce(true);
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
          {aiNarratorActive && (currentProc?.subtitle_text || currentProc?.subtitle_after) && (
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

          <div className="mode-tabs" style={{ display: 'flex', gap: '8px', marginLeft: '12px' }}>
            <button
              className={`control-btn ${activeTab === 'before' ? 'active' : ''}`}
              style={{ padding: '4px 12px', fontSize: '13px', height: '28px' }}
              onClick={() => handleTabClick('before')}
            >
              改善前
            </button>
            <button
              className={`control-btn ${activeTab === 'after' ? 'active' : ''}`}
              style={{ padding: '4px 12px', fontSize: '13px', height: '28px' }}
              onClick={() => handleTabClick('after')}
            >
              改善后
            </button>
          </div>
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
      {/* 计算显示的字幕文本：分离模式下合并前后文本，确保 Overlay 能正确处理 */}
      <SubtitleOverlay
        key={`${currentProc.id}-${activeTab}`} // 最小改动：依靠 key 强制重绘，彻底解决字幕不匹配和残留
        text={useMemo(() => {
          if (currentProc.subtitle_mode === 'separate') {
            return activeTab === 'after' ? (currentProc.subtitle_after || "") : (currentProc.subtitle_text || "");
          }
          return currentProc.subtitle_text;
        }, [currentProc.subtitle_mode, currentProc.subtitle_text, currentProc.subtitle_after, activeTab])}
        currentTime={currentProc.subtitle_mode === 'separate' && activeTab === 'after' ? Math.max(0, elapsedSinceStart - splitDuration) : elapsedSinceStart}
        isPlaying={isPlaying}
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
