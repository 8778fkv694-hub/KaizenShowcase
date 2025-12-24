import React, { memo, useMemo } from 'react';
import { formatTime } from '../utils/time';

/**
 * 工序时间对比柱状图 - 竖向柱状图展示线平衡状态
 */
function ProcessTimeChart({ processes, currentProcessIndex }) {
  // 计算最大时间，用于柱状图比例
  const { maxTime, beforeTimes, afterTimes } = useMemo(() => {
    if (!processes || processes.length === 0) {
      return { maxTime: 1, beforeTimes: [], afterTimes: [] };
    }

    const beforeTimes = processes.map(p => p.before_end_time - p.before_start_time);
    const afterTimes = processes.map(p => p.after_end_time - p.after_start_time);
    const maxTime = Math.max(...beforeTimes, ...afterTimes, 1);

    return { maxTime, beforeTimes, afterTimes };
  }, [processes]);

  if (!processes || processes.length === 0) {
    return null;
  }

  // 只显示到当前工序为止
  const visibleProcesses = processes.slice(0, currentProcessIndex + 1);

  return (
    <div className="process-time-chart">
      {visibleProcesses.map((process, index) => {
        const beforeHeight = (beforeTimes[index] / maxTime) * 100;
        const afterHeight = (afterTimes[index] / maxTime) * 100;
        const isCurrent = index === currentProcessIndex;

        return (
          <div
            key={process.id}
            className={`chart-bar-group ${isCurrent ? 'current' : ''}`}
            title={`${process.name}\n改善前: ${formatTime(beforeTimes[index])}\n改善后: ${formatTime(afterTimes[index])}`}
          >
            <div
              className="bar bar-before"
              style={{ height: `${beforeHeight}%` }}
            />
            <div
              className="bar bar-after"
              style={{ height: `${afterHeight}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default memo(ProcessTimeChart);
