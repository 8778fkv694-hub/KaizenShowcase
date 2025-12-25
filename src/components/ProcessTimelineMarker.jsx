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

  // 按时间顺序对工序进行排序，确保标签（1, 2, 3）在视觉上是连续的
  const sortedProcesses = React.useMemo(() => {
    return [...processes].sort((a, b) => {
      const startA = videoType === 'before' ? a.before_start_time : a.after_start_time;
      const startB = videoType === 'before' ? b.before_start_time : b.after_start_time;
      return startA - startB;
    });
  }, [processes, videoType]);

  // 获取工序在进度条上的位置和宽度
  const getProcessStyle = (proc, index) => {
    const startTime = videoType === 'before' ? proc.before_start_time : proc.after_start_time;
    const endTime = videoType === 'before' ? proc.before_end_time : proc.after_end_time;

    // 跳过无效工序
    if (videoType === 'before' && proc.process_type === 'new_step') return null;
    if (videoType === 'after' && proc.process_type === 'cancelled') return null;
    if (startTime >= endTime) return null;

    const left = (startTime / videoDuration) * 100;
    const width = ((endTime - startTime) / videoDuration) * 100;
    const color = colors[index % colors.length];
    const isCurrent = proc.id === currentProcessId;

    return {
      left: `${left}%`,
      width: `${width}%`,
      backgroundColor: color,
      border: isCurrent ? '2px solid #fff' : 'none',
      boxShadow: isCurrent ? '0 0 8px rgba(255, 255, 255, 0.5)' : 'none',
      zIndex: isCurrent ? 10 : 1,
    };
  };

  // 点击工序标记跳转到结束位置
  const handleProcessClick = (proc) => {
    let seekTime = videoType === 'before' ? proc.before_end_time : proc.after_end_time;

    // 安全检查：防止非有限数值导致浏览器报错
    if (!Number.isFinite(seekTime)) {
      console.warn(`[Timeline] Invalid seekTime for ${videoType}:`, seekTime);
      seekTime = 0;
    }

    console.log(`[Timeline] Seeking to ${videoType} end time: ${seekTime}`);
    if (onSeek && typeof onSeek === 'function') {
      onSeek(seekTime);
    }
  };

  return (
    <div className="process-timeline-marker">
      <div className="timeline-track">
        {sortedProcesses.map((proc, index) => {
          const style = getProcessStyle(proc, index);
          if (!style) return null;

          const startTime = videoType === 'before' ? proc.before_start_time : proc.after_start_time;
          const endTime = videoType === 'before' ? proc.before_end_time : proc.after_end_time;
          const isCurrent = proc.id === currentProcessId;

          return (
            <div
              key={proc.id}
              className={`timeline-segment ${isCurrent ? 'current' : ''}`}
              style={style}
              onClick={(e) => {
                e.stopPropagation();
                handleProcessClick(proc);
              }}
              title={`${index + 1}. ${proc.name}\n${formatTimeDetailed(startTime)} - ${formatTimeDetailed(endTime)}\n点击跳转到起点`}
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
