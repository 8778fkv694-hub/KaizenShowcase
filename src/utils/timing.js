/**
 * 字幕字级时间戳生成工具 (V4 强化版)
 * 支持自动分段逻辑，确保单次显示的字幕不超过 2 行（约 40 个字符）
 */

export const UNIT_TYPES = {
  HAN: 'han', // 汉字
  WORD: 'word', // 英文单词
  NUMBER: 'number', // 数字
  PUNCT_SHORT: 'punct_short', // 短标点
  PUNCT_LONG: 'punct_long', // 长标点
  SPACE: 'space' // 空格
};

/**
 * 将文本切分为执行单元
 */
export function tokenize(text) {
  const tokens = [];
  const regex = /([\u4e00-\u9fa5])|([a-zA-Z]+)|(\d+)|([，、；：])|([。！？…])|(\s+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) tokens.push({ text: match[1], type: UNIT_TYPES.HAN, weight: 1.0 });
    else if (match[2]) tokens.push({ text: match[2], type: UNIT_TYPES.WORD, weight: Math.max(0.5, match[2].length * 0.4) });
    else if (match[3]) tokens.push({ text: match[3], type: UNIT_TYPES.NUMBER, weight: Math.max(0.4, match[3].length * 0.3) });
    else if (match[4]) tokens.push({ text: match[4], type: UNIT_TYPES.PUNCT_SHORT, weight: 0.6 });
    else if (match[5]) tokens.push({ text: match[5], type: UNIT_TYPES.PUNCT_LONG, weight: 1.2 });
    else if (match[6]) tokens.push({ text: match[6], type: UNIT_TYPES.SPACE, weight: 0.2 });
  }

  return tokens;
}

/**
 * 为单元分配绝对时间戳，并进行智能分段
 */
export function generateTimingMap(text, totalDuration) {
  if (!text || totalDuration <= 0) return [];

  const tokens = tokenize(text);
  const totalWeight = tokens.reduce((sum, t) => sum + t.weight, 0);
  const timePerWeight = totalDuration / totalWeight;

  let currentTime = 0;
  const timedTokens = tokens.map(token => {
    const duration = token.weight * timePerWeight;
    const start = currentTime;
    const end = currentTime + duration;
    currentTime = end;

    return {
      ...token,
      start,
      end,
      duration
    };
  });

  // --- 分段逻辑：确保不刷屏 (最多2行) ---
  const segments = [];
  let currentSegment = [];
  let charCount = 0;
  const MAX_CHARS_PER_SEGMENT = 32; // 约2行（每行16字）

  timedTokens.forEach((token, index) => {
    currentSegment.push(token);

    // 统计逻辑字符数（中文字符计1，单词计1）
    if (token.type !== UNIT_TYPES.PUNCT_LONG && token.type !== UNIT_TYPES.PUNCT_SHORT && token.type !== UNIT_TYPES.SPACE) {
      charCount++;
    }

    // 触发分段的条件：
    // 1. 遇到句末标点
    // 2. 字数超过阈值且当前是标点或空格
    // 3. 已经是最后一个 token
    const isPunct = token.type === UNIT_TYPES.PUNCT_LONG;
    const isTooLong = charCount >= MAX_CHARS_PER_SEGMENT;
    const isLast = index === timedTokens.length - 1;

    if (isPunct || (isTooLong && (token.type === UNIT_TYPES.PUNCT_SHORT || token.type === UNIT_TYPES.SPACE)) || isLast) {
      if (currentSegment.length > 0) {
        segments.push({
          tokens: [...currentSegment],
          start: currentSegment[0].start,
          end: currentSegment[currentSegment.length - 1].end
        });
        currentSegment = [];
        charCount = 0;
      }
    }
  });

  return segments;
}
