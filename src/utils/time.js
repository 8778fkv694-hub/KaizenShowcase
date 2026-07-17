/**
 * 格式化秒数为 mm:ss 格式
 * @param {number} seconds - 秒数
 * @returns {string} 格式化后的时间字符串
 */
export const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * 格式化秒数为详细中文格式
 * @param {number} seconds - 秒数
 * @returns {string} 格式化后的时间字符串
 */
export const formatTimeDetailed = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;
};

/**
 * 格式化节省时间
 * @param {number} timeSaved - 节省的秒数（正值表示节省，负值表示增加）
 * @returns {string} 格式化后的字符串
 */
export const formatTimeSaved = (timeSaved) => {
  if (!timeSaved || timeSaved === 0) return '无变化';
  const absTime = Math.abs(timeSaved);
  const timeStr = formatTime(absTime);
  if (timeSaved > 0) {
    return `节省 ${timeStr}`;
  } else {
    return `增加 ${timeStr}`;
  }
};

/**
 * 格式化节省时间（详细版本）
 * @param {number} timeSaved - 节省的秒数
 * @returns {string} 格式化后的字符串
 */
export const formatTimeSavedDetailed = (timeSaved) => {
  if (!timeSaved || timeSaved === 0) return '无变化';
  const absTime = Math.abs(timeSaved);
  const timeStr = formatTimeDetailed(absTime);
  if (timeSaved > 0) {
    return `节省 ${timeStr}`;
  } else {
    return `增加 ${timeStr}`;
  }
};
/**
 * 格式化较长时长为「X小时Y分」/「X分Y秒」/「X秒」，用于跨项目汇总等大数值场景
 * @param {number} seconds - 秒数（非负）
 * @returns {string} 格式化后的字符串
 */
export const formatDurationLong = (seconds) => {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}小时${mins}分`;
  if (mins > 0) return `${mins}分${secs}秒`;
  return `${secs}秒`;
};

/**
 * 格式化汇总节省时间（长格式，跨项目汇总场景使用，不做 mm:ss 强行折算）
 * @param {number} timeSaved - 节省的秒数
 * @returns {string} 格式化后的字符串
 */
export const formatTimeSavedLong = (timeSaved) => {
  if (!timeSaved || timeSaved === 0) return '无变化';
  const absTime = Math.abs(timeSaved);
  const timeStr = formatDurationLong(absTime);
  return timeSaved > 0 ? `节省 ${timeStr}` : `增加 ${timeStr}`;
};

/**
 * 根据字数估算播报时长 (默认 5字/秒)
 * @param {string} text - 文本
 * @param {number} wordsPerSecond - 每秒字数
 * @returns {number} 预计秒数
 */
export const calculateNarrationDuration = (text, wordsPerSecond = 5.0) => {
  if (!text) return 0;
  return text.length / wordsPerSecond;
};
