const { app } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveFontConfig, buildAssContent, writeAssFile } = require('./subtitleAss');

function getFfmpegPath() {
  let ffmpegPath = require('ffmpeg-static');
  // ffmpeg-static 返回的路径指向 node_modules，打包后会落在 app.asar 里——
  // 但二进制文件不能从 asar 内部直接执行，需配合 package.json 的 asarUnpack 改到解包目录
  if (app.isPackaged) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
  }
  return ffmpegPath;
}

const OUTPUT_FPS = 30;

// ffmpeg filter 参数里的文件路径需要转义反斜杠/冒号（Windows 路径的盘符冒号尤其容易踩坑）
function escapeFilterPath(p) {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "'\\''");
}

/**
 * 构建「双视频对比」裁剪+缩放+拼接+配音混音+字幕烧录的 filter_complex 图。
 *
 * 画面：改善前后视频常来自不同设备，帧率大概率不一致（如 30fps vs 25fps）。
 * stack 类滤镜按各自时间基对齐会导致极细公共时间基、帧数爆炸（实测卡死/耗时暴涨），
 * 必须先统一到同一帧率再拼接。改善后通常更快播完，短的一侧定格最后一帧直到长的一侧
 * 播完——这正是「改善后更省时间」在视频里最直观的证明，不是需要绕开的边界情况。
 *
 * 配音：整合模式传 1 段音频、分离模式传 2 段（改善前/改善后依次播报，与实际播放器里
 * activeTab 只切字幕不切画面的行为一致——两侧视频画面在两种模式下都是全程并排显示）。
 * 总时长取「视频」与「配音」中更长的一个，避免配音被视频提前截断；配音较短时用静音补齐。
 *
 * 字幕：宽高只有一边是固定的（横排固定高720，竖排固定宽1280），另一边取决于源视频宽高比，
 * 事先不可知（不引入 ffprobe 探测）。ASS 的 PlayRes 只是「参照分辨率」，libass 会按实际画面
 * 等比缩放，这里给一个 16:9 假设的合理估算即可，不影响居中对齐类的定位正确性。
 */
function buildCompareFilterGraph({
  beforeStart,
  beforeEnd,
  afterStart,
  afterEnd,
  layoutMode,
  narrationCount = 0,
  narrationDuration = 0,
  assFilePath = null,
  fontsDir = null,
  overlayTimes = [],
}) {
  const beforeDuration = beforeEnd - beforeStart;
  const afterDuration = afterEnd - afterStart;
  const totalDuration = Math.max(beforeDuration, afterDuration, narrationDuration);
  const beforePad = totalDuration - beforeDuration;
  const afterPad = totalDuration - afterDuration;

  const isHorizontal = layoutMode !== 'vertical';
  // hstack 要求等高，vstack 要求等宽；-2 让 ffmpeg 自动算出满足偶数要求的另一边
  const scaleExpr = isHorizontal ? 'scale=-2:720' : 'scale=1280:-2';
  const stackFilter = isHorizontal ? 'hstack=inputs=2' : 'vstack=inputs=2';
  const estimatedDims = isHorizontal
    ? { width: Math.round(720 * (16 / 9)) * 2, height: 720 }
    : { width: 1280, height: Math.round(1280 * (9 / 16)) * 2 };

  const filters = [];
  filters.push(`[0:v]trim=start=${beforeStart}:end=${beforeEnd},setpts=PTS-STARTPTS,${scaleExpr},fps=${OUTPUT_FPS}[bv0]`);
  filters.push(`[1:v]trim=start=${afterStart}:end=${afterEnd},setpts=PTS-STARTPTS,${scaleExpr},fps=${OUTPUT_FPS}[av0]`);

  let beforeLabel = '[bv0]';
  let afterLabel = '[av0]';
  if (beforePad > 0.001) {
    filters.push(`[bv0]tpad=stop_mode=clone:stop_duration=${beforePad.toFixed(3)}[bvp]`);
    beforeLabel = '[bvp]';
  }
  if (afterPad > 0.001) {
    filters.push(`[av0]tpad=stop_mode=clone:stop_duration=${afterPad.toFixed(3)}[avp]`);
    afterLabel = '[avp]';
  }

  // 图层顺序与播放器一致：画面 → 标注 overlay → 字幕（字幕在最上层）
  const hasOverlays = overlayTimes.length > 0;
  const stackedLabel = hasOverlays || assFilePath ? '[vbase]' : '[outv]';
  filters.push(`${beforeLabel}${afterLabel}${stackFilter}${stackedLabel}`);

  // 标注 PNG 输入排在配音输入之后（输入索引 = 2 + narrationCount + i）。
  // 单帧图片流会立即 EOF，overlay 默认 eof_action=repeat 会一直保留该帧，
  // 实际显隐完全由 enable=between(t,...) 控制。
  let currentLabel = stackedLabel;
  overlayTimes.forEach(({ start, end }, i) => {
    const inputIdx = 2 + narrationCount + i;
    const isLastFilter = i === overlayTimes.length - 1 && !assFilePath;
    const outLabel = isLastFilter ? '[outv]' : `[ov${i}]`;
    filters.push(
      `${currentLabel}[${inputIdx}:v]overlay=0:0:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'${outLabel}`
    );
    currentLabel = outLabel;
  });

  if (assFilePath) {
    const subOpts = [`subtitles='${escapeFilterPath(assFilePath)}'`];
    if (fontsDir) subOpts.push(`fontsdir='${escapeFilterPath(fontsDir)}'`);
    filters.push(`${currentLabel}${subOpts.join(':')}[outv]`);
  }

  // 配音输入紧跟在两路视频输入之后（ffmpeg 输入索引 2 开始）。
  // 无配音时用 anullsrc 生成静音轨——保证每段导出都有一致的音轨，
  // 多工序拼接（concat -c copy）要求所有分段流结构一致，缺音轨的段会让拼接失败。
  if (narrationCount > 0) {
    const segmentLabels = Array.from({ length: narrationCount }, (_, i) => `[${i + 2}:a]`).join('');
    const preAudioLabel = narrationCount === 1 ? '[2:a]' : '[acat]';
    if (narrationCount > 1) {
      filters.push(`${segmentLabels}concat=n=${narrationCount}:v=0:a=1[acat]`);
    }
    // apad 补静音、atrim 卡死总时长，避免配音比视频画面短时结尾出现意外长度
    filters.push(`${preAudioLabel}apad,atrim=0:${totalDuration.toFixed(3)}[outa]`);
  } else {
    filters.push(`anullsrc=r=44100:cl=mono,atrim=0:${totalDuration.toFixed(3)}[outa]`);
  }

  return { filterComplex: filters.join(';'), totalDuration, hasAudio: true, estimatedDims };
}

// 取消机制：同一时刻只有一个导出会话（UI 侧按钮互斥），模块级状态即可
let currentFfmpegProc = null;
let cancelRequested = false;

function cancelCurrentExport() {
  cancelRequested = true;
  if (currentFfmpegProc) {
    try { currentFfmpegProc.kill('SIGKILL'); } catch { /* 进程可能已退出 */ }
  }
}

class ExportCancelledError extends Error {
  constructor() {
    super('导出已取消');
    this.name = 'ExportCancelledError';
  }
}

function runFfmpeg(ffmpegPath, args, onProgress, totalDuration) {
  return new Promise((resolve, reject) => {
    if (cancelRequested) return reject(new ExportCancelledError());
    const proc = spawn(ffmpegPath, args);
    currentFfmpegProc = proc;
    let stderrTail = '';

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      const match = text.match(/out_time_ms=(\d+)/);
      if (match && totalDuration > 0 && onProgress) {
        const currentSec = parseInt(match[1], 10) / 1000000;
        onProgress(Math.min(100, Math.round((currentSec / totalDuration) * 100)));
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000);
    });

    proc.on('error', (err) => { currentFfmpegProc = null; reject(err); });
    proc.on('close', (code) => {
      currentFfmpegProc = null;
      if (cancelRequested) {
        reject(new ExportCancelledError());
      } else if (code === 0) {
        if (onProgress) onProgress(100);
        resolve();
      } else {
        reject(new Error(`ffmpeg 退出码 ${code}：${stderrTail.slice(-800)}`));
      }
    });
  });
}

/**
 * 导出单个工序的对比视频：画面 + 标注叠加 + 配音 + 字幕烧录。
 *
 * narrationAudioPaths: 整合模式传 1 个路径，分离模式传 [改善前音频, 改善后音频]；无配音传空数组。
 * narrationDuration: 上述音频段总时长（秒），由调用方基于已生成的音频得出。
 * subtitleTracks: 可选，[{ segments, offsetSeconds }, ...]——segments 是
 *   generateTimingMap() 的原始输出（保证和播放器里看到的时间轴完全一致）；
 *   分离模式下"改善后"那段的 offsetSeconds 应等于"改善前"配音的总时长。
 * subtitleSettings: 可选，对应 subtitle_settings 表的样式配置。
 * annotationOverlays: 可选，[{ dataUrl, start, end }, ...]——渲染进程按输出画布
 *   全尺寸画好的透明 PNG（含该标注在所属侧画面里的正确位置），主进程只负责按
 *   时间区间 overlay，不理解标注坐标语义。
 */
async function exportCompareVideo(options, onProgress) {
  const {
    beforeVideoPath, afterVideoPath, outputPath,
    narrationAudioPaths = [], subtitleTracks, subtitleSettings,
    annotationOverlays = [],
  } = options;

  let assFilePath = null;
  let fontsDir = null;
  const overlayFiles = [];
  const tmpDir = os.tmpdir();

  try {
    let filterComplex, totalDuration, hasAudio;

    if (subtitleTracks && subtitleTracks.length > 0) {
      // 先用不带字幕的图算出总时长/预估分辨率，用来生成 ASS，再重新构建带字幕的完整图
      const pre = buildCompareFilterGraph({ ...options, narrationCount: narrationAudioPaths.length });
      const fontConfig = resolveFontConfig();
      fontsDir = fontConfig.fontsDir;

      const allSegments = subtitleTracks.flatMap((track) =>
        (track.segments || []).map((seg) => ({
          ...seg,
          start: seg.start + (track.offsetSeconds || 0),
          end: seg.end + (track.offsetSeconds || 0),
        }))
      );

      const assContent = buildAssContent({
        segments: allSegments,
        videoWidth: pre.estimatedDims.width,
        videoHeight: pre.estimatedDims.height,
        settings: subtitleSettings,
        fontName: fontConfig.fontName,
      });
      assFilePath = writeAssFile(assContent, tmpDir);
    }

    // 标注 dataUrl 落成临时 PNG 文件
    const overlayTimes = [];
    for (const [i, ov] of annotationOverlays.entries()) {
      const base64 = String(ov.dataUrl || '').replace(/^data:image\/png;base64,/, '');
      if (!base64) continue;
      const p = path.join(tmpDir, `kaizen_ov_${Date.now()}_${i}.png`);
      fs.writeFileSync(p, Buffer.from(base64, 'base64'));
      overlayFiles.push(p);
      overlayTimes.push({ start: ov.start, end: ov.end });
    }

    ({ filterComplex, totalDuration, hasAudio } = buildCompareFilterGraph({
      ...options,
      narrationCount: narrationAudioPaths.length,
      assFilePath,
      fontsDir,
      overlayTimes,
    }));

    const args = ['-y', '-i', beforeVideoPath, '-i', afterVideoPath];
    narrationAudioPaths.forEach((p) => args.push('-i', p));
    overlayFiles.forEach((p) => args.push('-i', p));

    args.push('-filter_complex', filterComplex, '-map', '[outv]');
    if (hasAudio) args.push('-map', '[outa]');

    args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p');
    if (hasAudio) args.push('-c:a', 'aac', '-b:a', '128k');

    args.push('-progress', 'pipe:1', '-nostats', outputPath);

    await runFfmpeg(getFfmpegPath(), args, onProgress, totalDuration);
    return outputPath;
  } finally {
    for (const p of [assFilePath, ...overlayFiles]) {
      if (p) {
        try { fs.unlinkSync(p); } catch { /* 临时文件清理失败不影响导出结果 */ }
      }
    }
  }
}

/**
 * 导出整条阶段：segments 为按工序顺序排列的 exportCompareVideo 选项数组。
 * 单段直接落到 outputPath；多段先各自导出到临时文件，再用 concat demuxer
 * 无重编码拼接（各段编码参数一致 + anullsrc 统一音轨，-c copy 成立）。
 * 进度按段数线性折算：第 i 段的 p% → (i + p/100) / n。
 */
async function exportStageCompareVideo({ segments, outputPath }, onProgress) {
  cancelRequested = false;
  if (!segments || segments.length === 0) throw new Error('没有可导出的工序');

  if (segments.length === 1) {
    return exportCompareVideo({ ...segments[0], outputPath }, onProgress);
  }

  const tmpDir = os.tmpdir();
  const stamp = Date.now();
  const segmentFiles = [];
  const listPath = path.join(tmpDir, `kaizen_concat_${stamp}.txt`);

  try {
    for (let i = 0; i < segments.length; i++) {
      const segPath = path.join(tmpDir, `kaizen_seg_${stamp}_${i}.mp4`);
      await exportCompareVideo({ ...segments[i], outputPath: segPath }, (p) => {
        if (onProgress) onProgress(Math.min(99, Math.round(((i + p / 100) / segments.length) * 100)));
      });
      segmentFiles.push(segPath);
    }

    const listContent = segmentFiles
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join('\n');
    fs.writeFileSync(listPath, listContent, 'utf8');

    await runFfmpeg(getFfmpegPath(), [
      '-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath,
    ], null, 0);

    if (onProgress) onProgress(100);
    return outputPath;
  } finally {
    for (const p of [listPath, ...segmentFiles]) {
      try { fs.unlinkSync(p); } catch { /* 临时文件清理失败不影响导出结果 */ }
    }
  }
}

module.exports = {
  getFfmpegPath,
  buildCompareFilterGraph,
  exportCompareVideo,
  exportStageCompareVideo,
  cancelCurrentExport,
  ExportCancelledError,
  runFfmpeg,
};
