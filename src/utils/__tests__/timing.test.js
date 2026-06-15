import { describe, it, expect } from 'vitest';
import { tokenize, generateTimingMap, UNIT_TYPES } from '../timing';

describe('tokenize', () => {
  it('切分中文为单字', () => {
    const tokens = tokenize('你好');
    expect(tokens).toHaveLength(2);
    expect(tokens.every((t) => t.type === UNIT_TYPES.HAN)).toBe(true);
  });

  it('识别英文单词、数字与标点', () => {
    const tokens = tokenize('abc123，');
    expect(tokens.map((t) => t.type)).toEqual([
      UNIT_TYPES.WORD,
      UNIT_TYPES.NUMBER,
      UNIT_TYPES.PUNCT_SHORT,
    ]);
  });

  it('长标点权重高于短标点', () => {
    const long = tokenize('。')[0];
    const short = tokenize('，')[0];
    expect(long.weight).toBeGreaterThan(short.weight);
  });
});

describe('generateTimingMap', () => {
  it('空文本或非正时长返回空数组', () => {
    expect(generateTimingMap('', 10)).toEqual([]);
    expect(generateTimingMap('你好', 0)).toEqual([]);
  });

  it('时间戳连续且总时长守恒', () => {
    const segments = generateTimingMap('一二三四五六七八九十', 10);
    expect(segments.length).toBeGreaterThan(0);

    const flat = segments.flatMap((s) => s.tokens);
    // 首 token 从 0 开始
    expect(flat[0].start).toBeCloseTo(0, 5);
    // 末 token 在总时长结束
    expect(flat[flat.length - 1].end).toBeCloseTo(10, 5);
    // 相邻 token 首尾相接
    for (let i = 1; i < flat.length; i++) {
      expect(flat[i].start).toBeCloseTo(flat[i - 1].end, 5);
    }
  });

  it('遇句末标点分段', () => {
    const segments = generateTimingMap('你好。世界。', 6);
    expect(segments.length).toBe(2);
  });

  it('每个分段的 start/end 与其首尾 token 对齐', () => {
    const segments = generateTimingMap('你好世界，再见。', 8);
    segments.forEach((seg) => {
      expect(seg.start).toBeCloseTo(seg.tokens[0].start, 5);
      expect(seg.end).toBeCloseTo(seg.tokens[seg.tokens.length - 1].end, 5);
    });
  });
});
