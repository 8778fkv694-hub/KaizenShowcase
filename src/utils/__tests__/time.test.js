import { describe, it, expect } from 'vitest';
import {
  formatTime,
  formatTimeDetailed,
  formatTimeSaved,
  formatTimeSavedDetailed,
  formatDurationLong,
  formatTimeSavedLong,
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

describe('formatDurationLong', () => {
  it('不足一分钟只显示秒', () => {
    expect(formatDurationLong(45)).toBe('45秒');
  });

  it('不足一小时显示分和秒', () => {
    expect(formatDurationLong(125)).toBe('2分5秒');
  });

  it('超过一小时显示小时和分，不再折算成三位数分钟', () => {
    expect(formatDurationLong(3661)).toBe('1小时1分');
  });

  it('整小时不遗留多余的0分0秒', () => {
    expect(formatDurationLong(7200)).toBe('2小时0分');
  });
});

describe('formatTimeSavedLong', () => {
  it('0 或假值返回无变化', () => {
    expect(formatTimeSavedLong(0)).toBe('无变化');
    expect(formatTimeSavedLong(null)).toBe('无变化');
  });

  it('正值表示节省，跨小时用长格式', () => {
    expect(formatTimeSavedLong(3661)).toBe('节省 1小时1分');
  });

  it('负值表示增加，使用绝对值', () => {
    expect(formatTimeSavedLong(-125)).toBe('增加 2分5秒');
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
