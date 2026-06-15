import { describe, it, expect } from 'vitest';
import {
  getVideoRenderRect,
  toPixel,
  toNormalized,
  isPointInVideoArea,
} from '../annotation';

// 构造一个模拟视频元素
const mockVideo = ({ cw, ch, vw, vh }) => ({
  clientWidth: cw,
  clientHeight: ch,
  videoWidth: vw,
  videoHeight: vh,
});

describe('getVideoRenderRect', () => {
  it('元素缺失或无尺寸时返回 null', () => {
    expect(getVideoRenderRect(null)).toBeNull();
    expect(getVideoRenderRect(mockVideo({ cw: 100, ch: 100, vw: 0, vh: 0 }))).toBeNull();
  });

  it('宽视频在高容器中上下留黑边', () => {
    // 视频 16:9 放进 100x100 容器
    const rect = getVideoRenderRect(mockVideo({ cw: 100, ch: 100, vw: 1600, vh: 900 }));
    expect(rect.renderWidth).toBe(100);
    expect(rect.renderHeight).toBeCloseTo(56.25, 2);
    expect(rect.offsetX).toBe(0);
    expect(rect.offsetY).toBeCloseTo(21.875, 2);
  });

  it('高视频在宽容器中左右留黑边', () => {
    const rect = getVideoRenderRect(mockVideo({ cw: 200, ch: 100, vw: 100, vh: 100 }));
    expect(rect.renderHeight).toBe(100);
    expect(rect.renderWidth).toBe(100);
    expect(rect.offsetX).toBe(50);
    expect(rect.offsetY).toBe(0);
  });
});

describe('toPixel / toNormalized 互逆', () => {
  const rect = getVideoRenderRect(mockVideo({ cw: 100, ch: 100, vw: 1600, vh: 900 }));

  it('归一化 → 像素 → 归一化 还原', () => {
    const norm = { x: 0.5, y: 0.5, width: 0.2, height: 0.3, endX: 0.8, endY: 0.9 };
    const px = toPixel(norm, rect);
    const back = toNormalized(px, rect);
    expect(back.x).toBeCloseTo(norm.x, 5);
    expect(back.y).toBeCloseTo(norm.y, 5);
    expect(back.width).toBeCloseTo(norm.width, 5);
    expect(back.height).toBeCloseTo(norm.height, 5);
    expect(back.endX).toBeCloseTo(norm.endX, 5);
    expect(back.endY).toBeCloseTo(norm.endY, 5);
  });

  it('toNormalized 将越界坐标钳制到 [0,1]', () => {
    const px = { x: -1000, y: 1e6 };
    const norm = toNormalized(px, rect);
    expect(norm.x).toBe(0);
    expect(norm.y).toBe(1);
  });

  it('无 videoRect 时原样返回', () => {
    const p = { x: 1, y: 2 };
    expect(toPixel(p, null)).toBe(p);
    expect(toNormalized(p, null)).toBe(p);
  });
});

describe('isPointInVideoArea', () => {
  const rect = getVideoRenderRect(mockVideo({ cw: 200, ch: 100, vw: 100, vh: 100 }));
  // renderWidth=100, offsetX=50 → 视频区 x ∈ [50,150]

  it('区域内返回 true', () => {
    expect(isPointInVideoArea(100, 50, rect)).toBe(true);
  });

  it('黑边区域返回 false', () => {
    expect(isPointInVideoArea(10, 50, rect)).toBe(false);
  });

  it('无 videoRect 返回 false', () => {
    expect(isPointInVideoArea(100, 50, null)).toBe(false);
  });
});
