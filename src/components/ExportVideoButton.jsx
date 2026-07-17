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
 * 「导出视频」按钮：把对比演示（画面+标注+配音+字幕）合成为 MP4。
 * 单工序模式导出当前工序；全局模式把整条阶段的所有工序按顺序串成一个视频。
 * 数据口径与播放器一致：配音走同一 TTS 缓存，字幕时间轴用同一 generateTimingMap。
 * 导出过程中再次点击按钮即取消（主进程会终止 ffmpeg 并清理临时文件）。
 */
function ExportVideoButton({ stage, process, processes, globalMode, layoutMode, aiNarratorActive, narrationSpeed }) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const { addToast } = useToast();
  const unsubscribeRef = useRef(null);

  useEffect(() => () => unsubscribeRef.current?.(), []);

  // 为一个工序组装主进程需要的合成参数（配音/字幕/标注）
  const buildSegmentPayload = async (proc, layout) => {
    const beforeDuration = proc.before_end_time - proc.before_start_time;
    const afterDuration = proc.after_end_time - proc.after_start_time;

    const narrationAudioPaths = [];
    const subtitleTracks = [];
    let narrationDuration = 0;

    if (aiNarratorActive && proc.subtitle_text?.trim()) {
      if (proc.subtitle_mode === 'separate') {
        const text1 = proc.subtitle_text;
        const text2 = proc.subtitle_after || '';
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
        const audioPath = await window.electronAPI.generateSpeech(proc.subtitle_text, 'zh-CN-XiaoxiaoNeural', narrationSpeed);
        const duration = await probeAudioDuration(audioPath);
        narrationAudioPaths.push(audioPath);
        subtitleTracks.push({ segments: generateTimingMap(proc.subtitle_text, duration), offsetSeconds: 0 });
        narrationDuration = duration;
      }
    }

    const totalDuration = Math.max(beforeDuration, afterDuration, narrationDuration);

    const [beforeAnnotations, afterAnnotations] = await Promise.all([
      window.electronAPI.getAnnotationsByProcess(proc.id, 'before'),
      window.electronAPI.getAnnotationsByProcess(proc.id, 'after'),
    ]);
    const annotationOverlays = buildAnnotationOverlays({
      beforeAnnotations: beforeAnnotations || [],
      afterAnnotations: afterAnnotations || [],
      layout,
      beforeDuration,
      afterDuration,
      totalDuration,
    });

    return {
      beforeVideoPath: stage.before_video_path,
      afterVideoPath: stage.after_video_path,
      beforeStart: proc.before_start_time,
      beforeEnd: proc.before_end_time,
      afterStart: proc.after_start_time,
      afterEnd: proc.after_end_time,
      layoutMode,
      narrationAudioPaths,
      narrationDuration,
      subtitleTracks,
      annotationOverlays,
    };
  };

  const handleClick = async () => {
    if (exporting) {
      await window.electronAPI.cancelVideoExport();
      return;
    }
    if (!stage?.before_video_path || !stage?.after_video_path) return;

    const targetProcesses = globalMode ? processes || [] : process ? [process] : [];
    if (targetProcesses.length === 0) return;

    try {
      const baseName = globalMode
        ? `${stage.name || '阶段'}_全程对比讲解`
        : `${targetProcesses[0].name || '工序'}_对比讲解`;
      const safeName = String(baseName).replace(/[\\/:*?"<>|]/g, '_');
      const outputPath = await window.electronAPI.selectVideoExportPath(`${safeName}.mp4`);
      if (!outputPath) return;

      setExporting(true);
      setProgress(0);
      unsubscribeRef.current = window.electronAPI.onExportVideoProgress((p) => setProgress(p));

      // 布局取整规则与 ffmpeg 完全一致（exportCanvas 已实测锁定），两侧视频全阶段共用
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

      const subtitleSettings = await window.electronAPI.getSubtitleSettings();

      const segments = [];
      for (const proc of targetProcesses) {
        const payload = await buildSegmentPayload(proc, layout);
        segments.push({ ...payload, subtitleSettings });
      }

      await window.electronAPI.exportCompareVideo({ segments, outputPath });
      addToast(`视频已导出：${outputPath}`, 'success');
    } catch (error) {
      if (String(error.message).includes('导出已取消')) {
        addToast('已取消导出', 'info');
      } else {
        console.error('视频导出失败:', error);
        addToast(`视频导出失败: ${error.message}`, 'error');
      }
    } finally {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setExporting(false);
      setProgress(0);
    }
  };

  const idleLabel = globalMode ? '🎞 导出全程视频' : '🎞 导出视频';
  return (
    <button
      className="control-btn export-video-btn"
      onClick={handleClick}
      disabled={!exporting && !globalMode && !process}
      title={
        exporting
          ? '点击取消导出'
          : globalMode
            ? '把本阶段所有工序按顺序合成为一个 MP4（含配音、字幕、标注）'
            : '将当前工序的对比演示导出为 MP4 视频（含配音、字幕、标注）'
      }
    >
      {exporting ? `✕ 取消 (${progress}%)` : idleLabel}
    </button>
  );
}

ExportVideoButton.propTypes = {
  stage: PropTypes.object.isRequired,
  process: PropTypes.object,
  processes: PropTypes.array,
  globalMode: PropTypes.bool,
  layoutMode: PropTypes.string,
  aiNarratorActive: PropTypes.bool,
  narrationSpeed: PropTypes.number,
};

export default ExportVideoButton;
