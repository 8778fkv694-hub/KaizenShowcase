/**
 * 视频导出：标注 → 透明 PNG 的画布绘制逻辑（渲染进程侧）。
 *
 * 主进程的 ffmpeg 只负责按时间区间 overlay 整幅 PNG，不理解标注坐标语义；
 * 坐标换算和图形绘制全部在这里完成，绘制规则 1:1 复刻 AnnotationLayer 的 SVG 渲染，
 * 保证导出画面和播放器里看到的一致。
 */

/**
 * 复刻 ffmpeg `scale=-2:720` / `scale=1280:-2` 的取整规则（-2 = 就近取偶），
 * 算出合成画面的总尺寸和两侧画面的摆放区域。
 * 这里的取整必须和 ffmpeg 完全一致，否则标注会整体偏移几个像素。
 */
export function computeExportLayout({ beforeWidth, beforeHeight, afterWidth, afterHeight, layoutMode, exportMode }) {
  if (exportMode === 'alternating') {
    return {
      width: 1280,
      height: 720,
      before: { x: 0, y: 0, w: 1280, h: 720 },
      after: { x: 0, y: 0, w: 1280, h: 720 },
    };
  }

  const evenRound = (v) => Math.round(v / 2) * 2;
  const isHorizontal = layoutMode !== 'vertical';

  if (isHorizontal) {
    const h = 720;
    const bw = evenRound((beforeWidth / beforeHeight) * h);
    const aw = evenRound((afterWidth / afterHeight) * h);
    return {
      width: bw + aw,
      height: h,
      before: { x: 0, y: 0, w: bw, h },
      after: { x: bw, y: 0, w: aw, h },
    };
  }

  const w = 1280;
  const bh = evenRound((beforeHeight / beforeWidth) * w);
  const ah = evenRound((afterHeight / afterWidth) * w);
  return {
    width: w,
    height: bh + ah,
    before: { x: 0, y: 0, w, h: bh },
    after: { x: 0, y: bh, w, h: ah },
  };
}

/**
 * 把一条标注画到 ctx 上（sideRect 为该标注所属侧画面在合成画布里的区域）。
 * 归一化坐标(0-1) × 侧区域尺寸 + 侧区域偏移 = 画布绝对坐标。
 * 线宽/箭头头部/字号按「导出高度 vs 播放器典型渲染高度(约480px)」等比放大，
 * 使观感与播放器接近。
 */
export function drawAnnotationOnContext(ctx, annotation, sideRect) {
  const scale = Math.max(1, sideRect.h / 480);
  const color = annotation.color || '#FF0000';
  const strokeWidth = (annotation.stroke_width || 3) * scale;

  const px = (nx) => sideRect.x + nx * sideRect.w;
  const py = (ny) => sideRect.y + ny * sideRect.h;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';

  switch (annotation.annotation_type) {
    case 'arrow': {
      const x1 = px(annotation.x);
      const y1 = py(annotation.y);
      const x2 = px(annotation.end_x);
      const y2 = py(annotation.end_y);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLength = 15 * scale;
      const headAngle = Math.PI / 6;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLength * Math.cos(angle - headAngle), y2 - headLength * Math.sin(angle - headAngle));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLength * Math.cos(angle + headAngle), y2 - headLength * Math.sin(angle + headAngle));
      ctx.stroke();
      break;
    }
    case 'circle': {
      // 与 AnnotationLayer 一致：半径 = 归一化 width × 侧画面宽
      const r = (annotation.width || 0.05) * sideRect.w;
      ctx.beginPath();
      ctx.arc(px(annotation.x), py(annotation.y), r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'rectangle': {
      ctx.strokeRect(
        px(annotation.x),
        py(annotation.y),
        (annotation.width || 0.1) * sideRect.w,
        (annotation.height || 0.1) * sideRect.h
      );
      break;
    }
    case 'text': {
      const fontSize = 16 * ((annotation.stroke_width || 3) / 3) * scale;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowOffsetX = 1 * scale;
      ctx.shadowOffsetY = 1 * scale;
      ctx.shadowBlur = 2 * scale;
      ctx.fillText(annotation.text || '', px(annotation.x), py(annotation.y));
      break;
    }
    default:
      break;
  }

  ctx.restore();
}

/**
 * 把前/后两侧的标注各画成一张合成画布全尺寸的透明 PNG，产出主进程需要的
 * [{ dataUrl, start, end }] 列表。
 *
 * 时间语义：标注 start/end 相对所属工序片段起点，与导出视频 t=0 对齐。
 * 片段播完定格期间播放器会保持显示「时间区间覆盖到片段末尾」的标注，
 * 这里将这类标注的 end 延长到 totalDuration 以保持一致。
 */
export function buildAnnotationOverlays({
  beforeAnnotations = [],
  afterAnnotations = [],
  layout,
  beforeDuration,
  afterDuration,
  totalDuration,
  exportMode = 'compare',
  createCanvas = () => document.createElement('canvas'),
}) {
  const FREEZE_EPSILON = 0.05;
  const overlays = [];

  // 改善前标注
  beforeAnnotations.forEach((a) => {
    const canvas = createCanvas();
    canvas.width = layout.width;
    canvas.height = layout.height;
    const ctx = canvas.getContext('2d');
    drawAnnotationOnContext(ctx, a, layout.before);

    const start = Math.max(0, a.start_time || 0);
    const maxEnd = exportMode === 'alternating' ? beforeDuration : totalDuration;
    
    let end = a.end_time === null || a.end_time === undefined ? beforeDuration : a.end_time;
    if (end >= beforeDuration - FREEZE_EPSILON) end = maxEnd;
    
    overlays.push({
      dataUrl: canvas.toDataURL('image/png'),
      start,
      end: Math.min(end, maxEnd)
    });
  });

  // 改善后标注
  afterAnnotations.forEach((a) => {
    const canvas = createCanvas();
    canvas.width = layout.width;
    canvas.height = layout.height;
    const ctx = canvas.getContext('2d');
    drawAnnotationOnContext(ctx, a, layout.after);

    const offset = exportMode === 'alternating' ? beforeDuration : 0;
    const start = Math.max(0, a.start_time || 0) + offset;
    
    let end = a.end_time === null || a.end_time === undefined ? (afterDuration + offset) : (a.end_time + offset);
    if (end >= (afterDuration + offset) - FREEZE_EPSILON) end = totalDuration;

    overlays.push({
      dataUrl: canvas.toDataURL('image/png'),
      start,
      end: Math.min(end, totalDuration)
    });
  });

  return overlays;
}
