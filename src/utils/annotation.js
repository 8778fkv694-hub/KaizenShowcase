/**
 * 视频标注坐标转换工具
 * 使用归一化坐标（0-1）存储，确保在任何缩放下位置正确
 */

/**
 * 计算视频在容器中的实际渲染区域
 * 处理 object-fit: contain 导致的黑边问题
 * @param {HTMLVideoElement} videoEl - 视频元素
 * @returns {Object|null} - 渲染区域信息
 */
export function getVideoRenderRect(videoEl) {
  if (!videoEl) return null;

  const containerWidth = videoEl.clientWidth;
  const containerHeight = videoEl.clientHeight;
  const videoWidth = videoEl.videoWidth;
  const videoHeight = videoEl.videoHeight;

  if (!videoWidth || !videoHeight) return null;

  const videoRatio = videoWidth / videoHeight;
  const containerRatio = containerWidth / containerHeight;

  let renderWidth, renderHeight, offsetX, offsetY;

  if (videoRatio > containerRatio) {
    // 视频更宽 → 上下有黑边
    renderWidth = containerWidth;
    renderHeight = containerWidth / videoRatio;
    offsetX = 0;
    offsetY = (containerHeight - renderHeight) / 2;
  } else {
    // 视频更高 → 左右有黑边
    renderHeight = containerHeight;
    renderWidth = containerHeight * videoRatio;
    offsetX = (containerWidth - renderWidth) / 2;
    offsetY = 0;
  }

  return {
    renderWidth,
    renderHeight,
    offsetX,
    offsetY,
    containerWidth,
    containerHeight
  };
}

/**
 * 归一化坐标 → 像素坐标（用于渲染）
 * @param {Object} normalized - 归一化坐标 {x, y, width?, height?, endX?, endY?}
 * @param {Object} videoRect - 视频渲染区域信息
 * @returns {Object} - 像素坐标
 */
export function toPixel(normalized, videoRect) {
  if (!videoRect) return normalized;

  const result = {
    x: videoRect.offsetX + normalized.x * videoRect.renderWidth,
    y: videoRect.offsetY + normalized.y * videoRect.renderHeight
  };

  if (normalized.width !== undefined && normalized.width !== null) {
    result.width = normalized.width * videoRect.renderWidth;
  }
  if (normalized.height !== undefined && normalized.height !== null) {
    result.height = normalized.height * videoRect.renderHeight;
  }
  if (normalized.endX !== undefined && normalized.endX !== null) {
    result.endX = videoRect.offsetX + normalized.endX * videoRect.renderWidth;
  }
  if (normalized.endY !== undefined && normalized.endY !== null) {
    result.endY = videoRect.offsetY + normalized.endY * videoRect.renderHeight;
  }

  return result;
}

/**
 * 像素坐标 → 归一化坐标（用于存储）
 * @param {Object} pixel - 像素坐标 {x, y, width?, height?, endX?, endY?}
 * @param {Object} videoRect - 视频渲染区域信息
 * @returns {Object} - 归一化坐标
 */
export function toNormalized(pixel, videoRect) {
  if (!videoRect) return pixel;

  const result = {
    x: (pixel.x - videoRect.offsetX) / videoRect.renderWidth,
    y: (pixel.y - videoRect.offsetY) / videoRect.renderHeight
  };

  // 限制在 0-1 范围内
  result.x = Math.max(0, Math.min(1, result.x));
  result.y = Math.max(0, Math.min(1, result.y));

  if (pixel.width !== undefined && pixel.width !== null) {
    result.width = pixel.width / videoRect.renderWidth;
  }
  if (pixel.height !== undefined && pixel.height !== null) {
    result.height = pixel.height / videoRect.renderHeight;
  }
  if (pixel.endX !== undefined && pixel.endX !== null) {
    result.endX = Math.max(0, Math.min(1, (pixel.endX - videoRect.offsetX) / videoRect.renderWidth));
  }
  if (pixel.endY !== undefined && pixel.endY !== null) {
    result.endY = Math.max(0, Math.min(1, (pixel.endY - videoRect.offsetY) / videoRect.renderHeight));
  }

  return result;
}

/**
 * 检查点击位置是否在视频区域内
 * @param {number} x - 点击 X 坐标（相对于容器）
 * @param {number} y - 点击 Y 坐标（相对于容器）
 * @param {Object} videoRect - 视频渲染区域信息
 * @returns {boolean}
 */
export function isPointInVideoArea(x, y, videoRect) {
  if (!videoRect) return false;

  return (
    x >= videoRect.offsetX &&
    x <= videoRect.offsetX + videoRect.renderWidth &&
    y >= videoRect.offsetY &&
    y <= videoRect.offsetY + videoRect.renderHeight
  );
}

/**
 * 标注类型常量
 */
export const ANNOTATION_TYPES = {
  ARROW: 'arrow',
  CIRCLE: 'circle',
  RECTANGLE: 'rectangle',
  TEXT: 'text'
};

/**
 * 默认标注颜色
 */
export const ANNOTATION_COLORS = [
  '#FF0000', // 红色
  '#00FF00', // 绿色
  '#0000FF', // 蓝色
  '#FFFF00', // 黄色
  '#FF00FF', // 品红
  '#00FFFF', // 青色
  '#FF8000', // 橙色
  '#FFFFFF'  // 白色
];

/**
 * 默认描边宽度选项
 */
export const STROKE_WIDTHS = [2, 3, 4, 5, 6];
