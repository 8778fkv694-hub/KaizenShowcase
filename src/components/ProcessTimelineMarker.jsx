import React, { memo } from 'react';
import { formatTimeDetailed } from '../utils/time';

/**
 * 进度条工序标记组件 - 在视频进度条上显示所有工序的时间段
 */
function ProcessTimelineMarker({
  processes = [],
  currentProcessId = null,
  videoDuration,
  videoType, // 'before' 或 'after'
  onSeek
}) {
  if (!processes || processes.length === 0 || !videoDuration) {
    return null;
  }

  // 工序颜色方案（8种颜色循环）
  const colors = [
    '#4A90E2', // 蓝色
    '#50C878', // 绿色
    '#F39C12', // 橙色
    '#9B59B6', // 紫色
    '#E74C3C', // 红色
    '#1ABC9C', // 青色
    '#F1C40F', // 黄色
    '#E67E22', // 深橙色
  ];

  // 获取工序在进度条上的位置和宽度
  const getProcessStyle = (process, index) => {
    const startTime = videoType === 'before' ? process.before_start_time : process.after_start_time;
    const endTime = videoType === 'before' ? process.before_end_time : process.after_end_time;

    // 跳过无效工序（新增步骤或减少步骤）
    if (videoType === 'before' && process.process_type === 'new_step') return null;
    if (videoType === 'after' && process.process_type === 'cancelled') return null;
    if (startTime >= endTime) return null;

    const left = (startTime / videoDuration) * 100;
    const width = ((endTime - startTime) / videoDuration) * 100;
    const color = colors[index % colors.length];
    const isCurrent = process.id === currentProcessId;

    return {
      left: `${left}%`,
      width: `${width}%`,
      backgroundColor: color,
      border: isCurrent ? '3px solid #FFD700' : 'none',
      boxShadow: isCurrent ? '0 0 8px rgba(255, 215, 0, 0.8)' : 'none',
      zIndex: isCurrent ? 10 : 1,
    };
  };

  // 点击工序标记跳转
  const handleProcessClick = (process) => {
    const seekTime = videoType === 'before' ? process.before_start_time : process.after_start_time;
    if (onSeek && typeof onSeek === 'function') {
      onSeek(seekTime);
    }
  };

  return (
    <div className="process-timeline-marker">
      <div className="timeline-track">
        {processes.map((process, index) => {
          const style = getProcessStyle(process, index);
          if (!style) return null;

          const startTime = videoType === 'before' ? process.before_start_time : process.after_start_time;
          const endTime = videoType === 'before' ? process.before_end_time : process.after_end_time;
          const isCurrent = process.id === currentProcessId;

          return (
            <div
              key={process.id}
              className={`timeline-segment ${isCurrent ? 'current' : ''}`}
              style={style}
              onClick={() => handleProcessClick(process)}
              title={`${index + 1}. ${process.name}\n${formatTimeDetailed(startTime)} - ${formatTimeDetailed(endTime)}\n点击跳转`}
            >
              <span className="segment-label">{index + 1}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(ProcessTimelineMarker);
