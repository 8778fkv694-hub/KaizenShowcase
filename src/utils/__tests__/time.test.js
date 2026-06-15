import { describe, it, expect } from 'vitest';
import {
  formatTime,
  formatTimeDetailed,
  formatTimeSaved,
  formatTimeSavedDetailed,
  calculateNarrationDuration,
} from '../time';

describe('formatTime', () => {
  it('补零到 mm:ss', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(5)).toBe('00:05');
    expect(formatTime(65)).toBe('01:05');
  });

  it('向下取整秒数', () => {
    expect(formatTime(9.9)).toBe('00:09');
  });

  it('超过一小时仍以分钟累计', () => {
    expect(formatTime(3661)).toBe('61:01');
  });
});

describe('formatTimeDetailed', () => {
  it('不足一分钟只显示秒（保留一位小数）', () => {
    expect(formatTimeDetailed(5.25)).toBe('5.3秒');
  });

  it('超过一分钟显示分和秒', () => {
    expect(formatTimeDetailed(65)).toBe('1分5.0秒');
  });
});

describe('formatTimeSaved', () => {
  it('0 或假值返回无变化', () => {
    expect(formatTimeSaved(0)).toBe('无变化');
    expect(formatTimeSaved(null)).toBe('无变化');
    expect(formatTimeSaved(undefined)).toBe('无变化');
  });

  it('正值表示节省', () => {
    expect(formatTimeSaved(65)).toBe('节省 01:05');
  });

  it('负值表示增加，使用绝对值', () => {
    expect(formatTimeSaved(-65)).toBe('增加 01:05');
  });
});

describe('formatTimeSavedDetailed', () => {
  it('正负值分别为节省/增加', () => {
    expect(formatTimeSavedDetailed(5)).toBe('节省 5.0秒');
    expect(formatTimeSavedDetailed(-5)).toBe('增加 5.0秒');
  });
});

describe('calculateNarrationDuration', () => {
  it('空文本返回 0', () => {
    expect(calculateNarrationDuration('')).toBe(0);
    expect(calculateNarrationDuration(null)).toBe(0);
  });

  it('按字数除以语速估算时长', () => {
    expect(calculateNarrationDuration('一二三四五', 5)).toBe(1);
    expect(calculateNarrationDuration('一二三四五六', 3)).toBe(2);
  });

  it('默认语速 5 字/秒', () => {
    expect(calculateNarrationDuration('一二三四五六七八九十')).toBe(2);
  });
});
