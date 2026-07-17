import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useToast } from './Toast';
import { generateTimingMap } from '../utils/timing';
import { computeExportLayout, buildAnnotationOverlays } from '../utils/exportCanvas';

const probeVideoDimensions = (path) =>
  new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight });
    v.onerror = () => reject(new Error('无法读取视频信息'));
    v.src = `local-video://${path}`;
  });

const probeAudioDuration = (path) =>
  new Promise((resolve) => {
    const a = new Audio(`local-video://${path}`);
    a.onloadedmetadata = () => resolve(a.duration);
    a.onerror = () => resolve(0);
  });

/**
 * 「导出视频」按钮：把当前工序的对比演示（画面+标注+配音+字幕）合成为 MP4。
 * 数据口径与播放器一致：配音走同一 TTS 缓存，字幕时间轴用同一 generateTimingMap。
 */
function ExportVideoButton({ stage, process, layoutMode, aiNarratorActive, narrationSpeed }) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const { addToast } = useToast();
  const unsubscribeRef = useRef(null);

  useEffect(() => () => unsubscribeRef.current?.(), []);

  const handleExport = async () => {
    if (exporting || !process || !stage?.before_video_path || !stage?.after_video_path) return;

    try {
      const safeName = String(process.name || '工序').replace(/[\\/:*?"<>|]/g, '_');
      const outputPath = await window.electronAPI.selectVideoExportPath(`${safeName}_对比讲解.mp4`);
      if (!outputPath) return;

      setExporting(true);
      setProgress(0);
      unsubscribeRef.current = window.electronAPI.onExportVideoProgress((p) => setProgress(p));

      const beforeDuration = process.before_end_time - process.before_start_time;
      const afterDuration = process.after_end_time - process.after_start_time;

      // 1. 配音与字幕（与播放器 loadTTS 同一套生成逻辑和缓存）
      const narrationAudioPaths = [];
      const subtitleTracks = [];
      let narrationDuration = 0;

      if (aiNarratorActive && process.subtitle_text?.trim()) {
        if (process.subtitle_mode === 'separate') {
          const text1 = process.subtitle_text;
          const text2 = process.subtitle_after || '';
          const path1 = await window.electronAPI.generateSpeech(text1, 'zh-CN-XiaoxiaoNeural', narrationSpeed);
          const d1 = await probeAudioDuration(path1);
          narrationAudioPaths.push(path1);
          subtitleTracks.push({ segments: generateTimingMap(text1, d1), offsetSeconds: 0 });
          narrationDuration = d1;
          if (text2.trim()) {
            const path2 = await window.electronAPI.generateSpeech(text2, 'zh-CN-XiaoxiaoNeural', narrationSpeed);
            const d2 = await probeAudioDuration(path2);
            narrationAudioPaths.push(path2);
            subtitleTracks.push({ segments: generateTimingMap(text2, d2), offsetSeconds: d1 });
            narrationDuration = d1 + d2;
          }
        } else {
          const audioPath = await window.electronAPI.generateSpeech(process.subtitle_text, 'zh-CN-XiaoxiaoNeural', narrationSpeed);
          const duration = await probeAudioDuration(audioPath);
          narrationAudioPaths.push(audioPath);
          subtitleTracks.push({ segments: generateTimingMap(process.subtitle_text, duration), offsetSeconds: 0 });
          narrationDuration = duration;
        }
      }

      const totalDuration = Math.max(beforeDuration, afterDuration, narrationDuration);

      // 2. 标注 → 透明 PNG（布局取整规则与 ffmpeg 完全一致，保证不错位）
      const [beforeDims, afterDims] = await Promise.all([
        probeVideoDimensions(stage.before_video_path),
        probeVideoDimensions(stage.after_video_path),
      ]);
      const layout = computeExportLayout({
        beforeWidth: beforeDims.width,
        beforeHeight: beforeDims.height,
        afterWidth: afterDims.width,
        afterHeight: afterDims.height,
        layoutMode,
      });
      const [beforeAnnotations, afterAnnotations] = await Promise.all([
        window.electronAPI.getAnnotationsByProcess(process.id, 'before'),
        window.electronAPI.getAnnotationsByProcess(process.id, 'after'),
      ]);
      const annotationOverlays = buildAnnotationOverlays({
        beforeAnnotations: beforeAnnotations || [],
        afterAnnotations: afterAnnotations || [],
        layout,
        beforeDuration,
        afterDuration,
        totalDuration,
      });

      const subtitleSettings = await window.electronAPI.getSubtitleSettings();

      // 3. 交给主进程 ffmpeg 合成
      await window.electronAPI.exportCompareVideo({
        beforeVideoPath: stage.before_video_path,
        afterVideoPath: stage.after_video_path,
        outputPath,
        beforeStart: process.before_start_time,
        beforeEnd: process.before_end_time,
        afterStart: process.after_start_time,
        afterEnd: process.after_end_time,
        layoutMode,
        narrationAudioPaths,
        narrationDuration,
        subtitleTracks,
        subtitleSettings,
        annotationOverlays,
      });

      addToast(`视频已导出：${outputPath}`, 'success');
    } catch (error) {
      console.error('视频导出失败:', error);
      addToast(`视频导出失败: ${error.message}`, 'error');
    } finally {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setExporting(false);
      setProgress(0);
    }
  };

  return (
    <button
      className="control-btn export-video-btn"
      onClick={handleExport}
      disabled={exporting || !process}
      title="将当前工序的对比演示导出为 MP4 视频（含配音、字幕、标注）"
    >
      {exporting ? `导出中 ${progress}%` : '🎞 导出视频'}
    </button>
  );
}

ExportVideoButton.propTypes = {
  stage: PropTypes.object.isRequired,
  process: PropTypes.object,
  layoutMode: PropTypes.string,
  aiNarratorActive: PropTypes.bool,
  narrationSpeed: PropTypes.number,
};

export default ExportVideoButton;
