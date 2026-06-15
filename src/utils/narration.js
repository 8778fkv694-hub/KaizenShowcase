/**
 * AI 配音播放的纯逻辑工具
 *
 * 从 ComparePlayer 的双音轨状态机中抽离出的、无副作用的决策/计算函数，
 * 便于单元测试锁定行为（尤其是「播放列表索引固定」这一历史易错点）。
 */

import { generateTimingMap } from './timing';

/**
 * 计算播放进度百分比，钳制到 [0, 100]
 * @param {number} elapsed - 已播放时长（秒）
 * @param {number} duration - 总时长（秒）
 * @returns {number} 0~100 的百分比；duration 非正时视为已完成（100）
 */
export function computeProgress(elapsed, duration) {
  if (!(duration > 0)) return 100;
  return Math.min(Math.max((elapsed / duration) * 100, 0), 100);
}

/**
 * 判断 HTMLAudioElement 是否已播放到结尾（含 0.2s 容差，兼容 timeupdate 抖动）
 * @param {{ended?: boolean, currentTime?: number, duration?: number}} audio
 * @returns {boolean}
 */
export function isAudioEnded(audio) {
  if (!audio) return false;
  if (audio.ended) return true;
  return audio.duration > 0 && Math.abs(audio.currentTime - audio.duration) < 0.2;
}

/**
 * 分离模式「阶段一（改善前）」是否应切换到「阶段二（改善后）」
 * - 「台词说完立即切换」开启时：只看音频是否讲完
 * - 否则：视频播完且音频讲完才切
 * @param {{switchOnSpeechEnd: boolean, beforeVideoDone: boolean, audioEnded: boolean}} args
 * @returns {boolean}
 */
export function shouldSwitchPhase({ switchOnSpeechEnd, beforeVideoDone, audioEnded }) {
  return switchOnSpeechEnd ? audioEnded : beforeVideoDone && audioEnded;
}

/**
 * 构建配音播放列表，保证结构固定：索引 [0] 永远是改善前、[1] 永远是改善后，
 * 即便改善后文本为空也不过滤，避免索引错位（历史 bug 根源）。
 *
 * 时长（d1/d2）需由调用方先异步测得后传入，以保持本函数为纯函数。
 *
 * @param {Object} args
 * @param {'separate'|'integrated'} args.mode - 配音模式
 * @param {string} args.text1 - 改善前 / 整合文本
 * @param {string} [args.text2] - 改善后文本（仅分离模式）
 * @param {string} args.path1 - 改善前 / 整合音频路径
 * @param {string|null} [args.path2] - 改善后音频路径（仅分离模式）
 * @param {number} [args.d1] - 第一段时长（秒）
 * @param {number} [args.d2] - 第二段时长（秒）
 * @returns {{playlist: Array, splitDuration: number}}
 *   splitDuration：第一段时长，用于在第二段播放时换算累计时间轴
 */
export function buildNarrationPlaylist({
  mode,
  text1,
  text2 = '',
  path1,
  path2 = null,
  d1 = 0,
  d2 = 0,
}) {
  if (mode === 'separate') {
    const playlist = [
      { src: path1, duration: d1, text: text1, timing: generateTimingMap(text1, d1) },
      { src: path2, duration: d2, text: text2, timing: generateTimingMap(text2, d2) },
    ];
    return { playlist, splitDuration: d1 };
  }

  const playlist = [
    { src: path1, duration: d1, text: text1, timing: generateTimingMap(text1, d1) },
  ];
  return { playlist, splitDuration: d1 };
}
