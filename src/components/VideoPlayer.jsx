import React, { useRef, useEffect, useState } from 'react';

function VideoPlayer({ process, stage }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [viewMode, setViewMode] = useState('before'); // before, after
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
      setCurrentTime(0);
      // 保持倍速 setPlaybackRate(1);
    }
  }, [process, viewMode]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

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
    // const endTime = viewMode === 'before' ? process.before_end_time : process.after_end_time; // Unused now

    videoRef.current.currentTime = startTime;
    videoRef.current.playbackRate = playbackRate;
    videoRef.current.play().then(() => {
      // 再次确认倍速（防止 play() 重置）
      if (videoRef.current) videoRef.current.playbackRate = playbackRate;
    });
    setIsPlaying(true);
  };

  const handlePause = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);

      if (!process) return;

      const startTime = viewMode === 'before' ? process.before_start_time : process.after_start_time;
      const endTime = viewMode === 'before' ? process.before_end_time : process.after_end_time;

      if (videoRef.current.currentTime >= endTime) {
        if (isLooping) {
          videoRef.current.currentTime = startTime;
        } else {
          videoRef.current.pause();
          setIsPlaying(false);
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
          className="video-element"
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

export default VideoPlayer;
