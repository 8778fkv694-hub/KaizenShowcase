import { describe, it, expect } from 'vitest';
import { computeExportLayout, buildAnnotationOverlays } from '../exportCanvas';

// vitest 跑在 node 环境无真实 canvas，注入一个记录调用的假 canvas
const makeFakeCanvas = () => {
  const noop = () => {};
  const ctx = {
    save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop,
    stroke: noop, arc: noop, strokeRect: noop, fillText: noop,
  };
  return { width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,FAKE' };
};

describe('computeExportLayout', () => {
  it('横排：两侧各自等比缩放到高720，宽度就近取偶（与 ffmpeg scale=-2:720 一致）', () => {
    const layout = computeExportLayout({
      beforeWidth: 640, beforeHeight: 480, afterWidth: 800, afterHeight: 600, layoutMode: 'horizontal',
    });
    // 640/480 → 960 宽；800/600 → 960 宽
    expect(layout.before).toEqual({ x: 0, y: 0, w: 960, h: 720 });
    expect(layout.after).toEqual({ x: 960, y: 0, w: 960, h: 720 });
    expect(layout.width).toBe(1920);
    expect(layout.height).toBe(720);
  });

  it('横排：非整除宽高比就近取偶（720*1080/1920=405 → 406，已用真实 ffmpeg 实测确认）', () => {
    const layout = computeExportLayout({
      beforeWidth: 1080, beforeHeight: 1920, afterWidth: 1080, afterHeight: 1920, layoutMode: 'horizontal',
    });
    expect(layout.before.w).toBe(406);
    expect(layout.width).toBe(812);
  });

  it('竖排：两侧各自等比缩放到宽1280，高度就近取偶，后侧下移', () => {
    const layout = computeExportLayout({
      beforeWidth: 1920, beforeHeight: 1080, afterWidth: 1280, afterHeight: 720, layoutMode: 'vertical',
    });
    expect(layout.before).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
    expect(layout.after).toEqual({ x: 0, y: 720, w: 1280, h: 720 });
    expect(layout.height).toBe(1440);
  });
});

describe('buildAnnotationOverlays', () => {
  const layout = computeExportLayout({
    beforeWidth: 640, beforeHeight: 480, afterWidth: 640, afterHeight: 480, layoutMode: 'horizontal',
  });
  const base = { annotation_type: 'rectangle', x: 0.1, y: 0.1, width: 0.2, height: 0.2 };

  it('产出与标注数量一致的 overlay，时间原样保留', () => {
    const overlays = buildAnnotationOverlays({
      beforeAnnotations: [{ ...base, start_time: 1, end_time: 3 }],
      afterAnnotations: [{ ...base, start_time: 0.5, end_time: 2 }],
      layout, beforeDuration: 6, afterDuration: 4, totalDuration: 6,
      createCanvas: makeFakeCanvas,
    });
    expect(overlays).toHaveLength(2);
    expect(overlays[0]).toMatchObject({ start: 1, end: 3 });
    expect(overlays[1]).toMatchObject({ start: 0.5, end: 2 });
  });

  it('end_time 为 null 时显示到导出结束', () => {
    const overlays = buildAnnotationOverlays({
      beforeAnnotations: [{ ...base, start_time: 1, end_time: null }],
      afterAnnotations: [],
      layout, beforeDuration: 6, afterDuration: 4, totalDuration: 6,
      createCanvas: makeFakeCanvas,
    });
    expect(overlays[0].end).toBe(6);
  });

  it('时间区间覆盖到片段末尾的标注，在定格期间保持显示（延长到 totalDuration）', () => {
    // 改善后片段 4s，标注到 4s 结束；总长 6s（改善后定格 2s），播放器定格期间仍显示该标注
    const overlays = buildAnnotationOverlays({
      beforeAnnotations: [],
      afterAnnotations: [{ ...base, start_time: 1, end_time: 4 }],
      layout, beforeDuration: 6, afterDuration: 4, totalDuration: 6,
      createCanvas: makeFakeCanvas,
    });
    expect(overlays[0].end).toBe(6);
  });
});
