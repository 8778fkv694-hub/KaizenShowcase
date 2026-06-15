import { describe, it, expect } from 'vitest';
import {
  computeProgress,
  isAudioEnded,
  shouldSwitchPhase,
  buildNarrationPlaylist,
} from '../narration';

describe('computeProgress', () => {
  it('正常进度按比例换算', () => {
    expect(computeProgress(5, 10)).toBe(50);
    expect(computeProgress(0, 10)).toBe(0);
    expect(computeProgress(10, 10)).toBe(100);
  });

  it('超出范围被钳制到 [0,100]', () => {
    expect(computeProgress(-3, 10)).toBe(0);
    expect(computeProgress(15, 10)).toBe(100);
  });

  it('时长非正视为已完成', () => {
    expect(computeProgress(5, 0)).toBe(100);
    expect(computeProgress(5, -1)).toBe(100);
  });
});

describe('isAudioEnded', () => {
  it('null 返回 false', () => {
    expect(isAudioEnded(null)).toBe(false);
  });

  it('ended 标志为真直接结束', () => {
    expect(isAudioEnded({ ended: true })).toBe(true);
  });

  it('接近结尾（容差内）判定为结束', () => {
    expect(isAudioEnded({ ended: false, currentTime: 9.9, duration: 10 })).toBe(true);
  });

  it('距结尾较远判定为未结束', () => {
    expect(isAudioEnded({ ended: false, currentTime: 5, duration: 10 })).toBe(false);
  });

  it('无时长信息判定为未结束', () => {
    expect(isAudioEnded({ ended: false, currentTime: 0, duration: 0 })).toBe(false);
  });
});

describe('shouldSwitchPhase', () => {
  it('立即切换模式：仅看音频是否讲完', () => {
    expect(shouldSwitchPhase({ switchOnSpeechEnd: true, beforeVideoDone: false, audioEnded: true })).toBe(true);
    expect(shouldSwitchPhase({ switchOnSpeechEnd: true, beforeVideoDone: true, audioEnded: false })).toBe(false);
  });

  it('普通模式：视频播完且音频讲完才切', () => {
    expect(shouldSwitchPhase({ switchOnSpeechEnd: false, beforeVideoDone: true, audioEnded: true })).toBe(true);
    expect(shouldSwitchPhase({ switchOnSpeechEnd: false, beforeVideoDone: true, audioEnded: false })).toBe(false);
    expect(shouldSwitchPhase({ switchOnSpeechEnd: false, beforeVideoDone: false, audioEnded: true })).toBe(false);
  });
});

describe('buildNarrationPlaylist', () => {
  it('分离模式始终产出两个轨道，索引固定', () => {
    const { playlist, splitDuration } = buildNarrationPlaylist({
      mode: 'separate',
      text1: '改善前讲解',
      text2: '改善后讲解',
      path1: '/a.mp3',
      path2: '/b.mp3',
      d1: 3,
      d2: 4,
    });
    expect(playlist).toHaveLength(2);
    expect(playlist[0].src).toBe('/a.mp3');
    expect(playlist[1].src).toBe('/b.mp3');
    expect(splitDuration).toBe(3);
  });

  it('分离模式下改善后文本为空时仍保留第二轨道（不过滤，防索引错位）', () => {
    const { playlist } = buildNarrationPlaylist({
      mode: 'separate',
      text1: '只有前段',
      text2: '',
      path1: '/a.mp3',
      path2: null,
      d1: 3,
      d2: 0,
    });
    expect(playlist).toHaveLength(2);
    expect(playlist[1].text).toBe('');
    expect(playlist[1].timing).toEqual([]);
  });

  it('整合模式只产出一个轨道，splitDuration 为该段总长', () => {
    const { playlist, splitDuration } = buildNarrationPlaylist({
      mode: 'integrated',
      text1: '整段讲解文本',
      path1: '/a.mp3',
      d1: 6,
    });
    expect(playlist).toHaveLength(1);
    expect(splitDuration).toBe(6);
    expect(playlist[0].timing.length).toBeGreaterThan(0);
  });
});
