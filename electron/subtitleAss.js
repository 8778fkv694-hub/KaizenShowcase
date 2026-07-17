const fs = require('fs');
const path = require('path');
const os = require('os');

// 打包时把中文字体放这里（如 NotoSansSC-Regular.otf）。
// 找不到时退回系统字体名——能跑，但不同系统渲染效果和是否有该字体不可控，
// 这是「远期可靠」意义上真正需要补齐的一块，不是本函数能兜底的。
const BUNDLED_FONT_DIR = path.join(__dirname, 'assets', 'fonts');

function resolveFontConfig() {
  if (fs.existsSync(BUNDLED_FONT_DIR) && fs.readdirSync(BUNDLED_FONT_DIR).length > 0) {
    return { fontsDir: BUNDLED_FONT_DIR, fontName: 'Noto Sans SC' };
  }

  const platform = os.platform();
  if (platform === 'darwin') {
    console.warn('[字幕导出] 未找到内置字体，回退使用系统字体 Heiti SC（仅 macOS 可靠，Windows/Linux 打包前必须内置字体）');
    return { fontsDir: '/System/Library/Fonts', fontName: 'Heiti SC' };
  }
  if (platform === 'win32') {
    console.warn('[字幕导出] 未找到内置字体，回退使用系统字体 Microsoft YaHei（未内置字体时打包分发不可靠）');
    return { fontsDir: 'C\\:\\\\Windows\\\\Fonts', fontName: 'Microsoft YaHei' };
  }
  console.warn('[字幕导出] 未找到内置字体，回退使用系统字体 Noto Sans CJK SC（Linux 系统若未安装此字体将无法正确显示中文）');
  return { fontsDir: '/usr/share/fonts', fontName: 'Noto Sans CJK SC' };
}

function escapeAssText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\N')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
}

function formatAssTime(seconds) {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const cs = Math.round((clamped - Math.floor(clamped)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// ASS 颜色是 &HAABBGGRR，且 alpha 与直觉相反：00=不透明，FF=全透明
function hexToAssColor(hex, opacity = 1) {
  const clean = (hex || '#FFFFFF').replace('#', '').padEnd(6, 'F');
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  const alphaHex = Math.round((1 - opacity) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `&H${alphaHex}${b}${g}${r}`.toUpperCase();
}

/**
 * 把 generateTimingMap() 产出的分段数组（每段 {tokens, start, end}）转成 ASS 字幕内容。
 * segments 的时间戳以「配音自身」为原点；offsetSeconds 用于分离模式下「改善后」那段
 * 配音相对整段导出视频的起始偏移（改善前配音先播完，改善后配音紧接其后）。
 */
function buildAssContent({ segments, videoWidth, videoHeight, settings = {}, offsetSeconds = 0, fontName }) {
  const {
    font_size: fontSize = 24,
    text_color: textColor = '#FFFFFF',
    bg_color: bgColor = '#000000',
    bg_opacity: bgOpacity = 0.7,
    position_y: positionY = 85,
  } = settings;

  // 字幕层设计时按 720 高的画布定字号，导出分辨率变化时等比缩放，避免字幕显得过小/过大
  const scaledFontSize = Math.max(12, Math.round(fontSize * (videoHeight / 720)));
  const marginV = Math.max(0, Math.round(videoHeight * (1 - positionY / 100)));
  const primaryColor = hexToAssColor(textColor, 1);
  const backColor = hexToAssColor(bgColor, bgOpacity);

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${videoWidth}`,
    `PlayResY: ${videoHeight}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${fontName},${scaledFontSize},${primaryColor},&H00FFFFFF,&H00000000,${backColor},0,0,0,0,100,100,0,0,3,0,0,2,20,20,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const lines = segments
    .filter((seg) => seg.tokens && seg.tokens.length > 0)
    .map((seg) => {
      const text = escapeAssText(seg.tokens.map((t) => t.text).join(''));
      const start = formatAssTime(seg.start + offsetSeconds);
      const end = formatAssTime(seg.end + offsetSeconds);
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    });

  return `${header}\n${lines.join('\n')}\n`;
}

/**
 * 写入临时 .ass 文件，返回文件路径 + ffmpeg subtitles 滤镜需要的 fontsdir/字体名。
 */
function writeAssFile(assContent, tmpDir) {
  const filePath = path.join(tmpDir, `subs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.ass`);
  fs.writeFileSync(filePath, assContent, 'utf8');
  return filePath;
}

module.exports = { resolveFontConfig, buildAssContent, writeAssFile, hexToAssColor, formatAssTime, escapeAssText };
