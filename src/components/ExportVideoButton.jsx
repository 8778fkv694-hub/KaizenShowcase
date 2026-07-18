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
function ExportVideoButton({ stage, process, processes, globalMode, layoutMode, aiNarratorActive, narrationSpeed, defaultSwitchOnSpeechEnd }) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [exportSubtitles, setExportSubtitles] = useState(true);
  const [localExportMode, setLocalExportMode] = useState('compare'); // 'compare' or 'alternating'
  const [switchOnSpeechEnd, setSwitchOnSpeechEnd] = useState(defaultSwitchOnSpeechEnd || false);
  
  const { addToast } = useToast();
  const unsubscribeRef = useRef(null);

  // 当外部默认属性改变时，同步更新本地状态
  useEffect(() => {
    setSwitchOnSpeechEnd(defaultSwitchOnSpeechEnd || false);
  }, [defaultSwitchOnSpeechEnd]);

  useEffect(() => () => unsubscribeRef.current?.(), []);

  // 为一个工序组装主进程需要的合成参数（配音/字幕/标注）
  const buildSegmentPayload = async (proc, layout, exportMode, subtitlesActive, switchOnSpeechActive) => {
    const beforeDuration = proc.before_end_time - proc.before_start_time;
    const afterDuration = proc.after_end_time - proc.after_start_time;

    const narrationAudioPaths = [];
    const subtitleTracks = [];
    let narrationDuration = 0;
    let d1 = 0;
    let d2 = 0;

    if (aiNarratorActive && proc.subtitle_text?.trim()) {
      if (proc.subtitle_mode === 'separate') {
        const text1 = proc.subtitle_text;
        const text2 = proc.subtitle_after || '';
        const path1 = await window.electronAPI.generateSpeech(text1, 'zh-CN-XiaoxiaoNeural', narrationSpeed);
        d1 = await probeAudioDuration(path1);
        narrationAudioPaths.push(path1);
        
        if (subtitlesActive) {
          subtitleTracks.push({ segments: generateTimingMap(text1, d1), offsetSeconds: 0 });
        }
        
        narrationDuration = d1;
        if (text2.trim()) {
          const path2 = await window.electronAPI.generateSpeech(text2, 'zh-CN-XiaoxiaoNeural', narrationSpeed);
          d2 = await probeAudioDuration(path2);
          narrationAudioPaths.push(path2);
          
          if (subtitlesActive) {
            // 在轮流播放大屏模式下，第二段字幕的 offset 应等于前段视频的实际播放时长
            const beforePlayDuration = switchOnSpeechActive && d1 > 0 ? Math.min(beforeDuration, d1) : beforeDuration;
            subtitleTracks.push({
              segments: generateTimingMap(text2, d2),
              offsetSeconds: exportMode === 'alternating' ? beforePlayDuration : d1
            });
          }
          narrationDuration = d1 + d2;
        }
      } else {
        const audioPath = await window.electronAPI.generateSpeech(proc.subtitle_text, 'zh-CN-XiaoxiaoNeural', narrationSpeed);
        d1 = await probeAudioDuration(audioPath);
        narrationAudioPaths.push(audioPath);
        
        if (subtitlesActive) {
          subtitleTracks.push({ segments: generateTimingMap(proc.subtitle_text, d1), offsetSeconds: 0 });
        }
        narrationDuration = d1;
      }
    }

    // 计算实际的视频裁剪截止时间点
    let beforeEnd = proc.before_end_time;
    let afterEnd = proc.after_end_time;

    if (switchOnSpeechActive && aiNarratorActive && proc.subtitle_text?.trim()) {
      if (proc.subtitle_mode === 'separate') {
        const targetBefore = d1 > 0 ? d1 : beforeDuration;
        const targetAfter = d2 > 0 ? d2 : afterDuration;
        beforeEnd = proc.before_start_time + Math.min(beforeDuration, targetBefore);
        afterEnd = proc.after_start_time + Math.min(afterDuration, targetAfter);
      } else {
        const target = d1 > 0 ? d1 : Math.max(beforeDuration, afterDuration);
        beforeEnd = proc.before_start_time + Math.min(beforeDuration, target);
        afterEnd = proc.after_start_time + Math.min(afterDuration, target);
      }
    }

    const effectiveBeforeDuration = beforeEnd - proc.before_start_time;
    const effectiveAfterDuration = afterEnd - proc.after_start_time;

    const totalDuration = exportMode === 'alternating'
      ? (effectiveBeforeDuration + effectiveAfterDuration)
      : Math.max(effectiveBeforeDuration, effectiveAfterDuration, narrationDuration);

    const [beforeAnnotations, afterAnnotations] = await Promise.all([
      window.electronAPI.getAnnotationsByProcess(proc.id, 'before'),
      window.electronAPI.getAnnotationsByProcess(proc.id, 'after'),
    ]);
    
    const annotationOverlays = buildAnnotationOverlays({
      beforeAnnotations: beforeAnnotations || [],
      afterAnnotations: afterAnnotations || [],
      layout,
      beforeDuration: effectiveBeforeDuration,
      afterDuration: effectiveAfterDuration,
      totalDuration,
      exportMode,
    });

    return {
      beforeVideoPath: stage.before_video_path,
      afterVideoPath: stage.after_video_path,
      beforeStart: proc.before_start_time,
      beforeEnd,
      afterStart: proc.after_start_time,
      afterEnd,
      layoutMode,
      exportMode,
      narrationAudioPaths,
      narrationDuration,
      subtitleTracks,
      annotationOverlays,
    };
  };

  const startExportProcess = async (subtitlesActive, exportMode, switchOnSpeechActive) => {
    if (!stage?.before_video_path || !stage?.after_video_path) return;

    const targetProcesses = globalMode ? processes || [] : process ? [process] : [];
    if (targetProcesses.length === 0) return;

    try {
      const baseName = globalMode
        ? `${stage.name || '阶段'}_全程对比讲解`
        : `${targetProcesses[0].name || '工序'}_对比讲解`;
      const suffix = exportMode === 'alternating' ? '_轮流大屏' : '_双画面对比';
      const safeName = String(baseName + suffix).replace(/[\\/:*?"<>|]/g, '_');
      const outputPath = await window.electronAPI.selectVideoExportPath(`${safeName}.mp4`);
      if (!outputPath) return;

      setExporting(true);
      setProgress(0);
      unsubscribeRef.current = window.electronAPI.onExportVideoProgress((p) => setProgress(p));

      // 布局取整规则与 ffmpeg 完全一致，两侧视频全阶段共用
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
        exportMode,
      });

      const subtitleSettings = await window.electronAPI.getSubtitleSettings();

      const segments = [];
      for (const proc of targetProcesses) {
        const payload = await buildSegmentPayload(proc, layout, exportMode, subtitlesActive, switchOnSpeechActive);
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

  const handleClick = async () => {
    if (exporting) {
      await window.electronAPI.cancelVideoExport();
      return;
    }
    if (!stage?.before_video_path || !stage?.after_video_path) return;

    const targetProcesses = globalMode ? processes || [] : process ? [process] : [];
    if (targetProcesses.length === 0) return;

    // 打开配置弹窗
    setShowSettingsModal(true);
  };

  const idleLabel = globalMode ? '🎞 导出全程视频' : '🎞 导出视频';
  return (
    <>
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

      {/* 视频导出设置弹窗 */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal video-export-settings-modal" onClick={(e) => e.stopPropagation()} style={{ width: '450px' }}>
            <div className="modal-header">
              <h3>🎥 视频导出配置</h3>
              <button className="close-btn" onClick={() => setShowSettingsModal(false)}>✕</button>
            </div>
            
            <div className="modal-body" style={{ padding: '20px 0' }}>
              {/* 字幕配置项 */}
              <div className="setting-group" style={{ marginBottom: '24px' }}>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '10px', fontSize: '14px', color: 'var(--text-color)' }}>
                  是否烧录字幕
                </label>
                <div style={{ display: 'flex', gap: '24px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="radio"
                      name="exportSubtitles"
                      checked={exportSubtitles}
                      onChange={() => setExportSubtitles(true)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>是 (视频画面中包含字幕)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="radio"
                      name="exportSubtitles"
                      checked={!exportSubtitles}
                      onChange={() => setExportSubtitles(false)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>否 (导出纯净无字幕画面)</span>
                  </label>
                </div>
              </div>

              {/* 画面播放模式配置项 */}
              <div className="setting-group" style={{ marginBottom: '24px' }}>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '10px', fontSize: '14px', color: 'var(--text-color)' }}>
                  视频排版模式
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="radio"
                      name="localExportMode"
                      checked={localExportMode === 'compare'}
                      onChange={() => setLocalExportMode('compare')}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>对比播放模式 (左右双画面并排展示)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="radio"
                      name="localExportMode"
                      checked={localExportMode === 'alternating'}
                      onChange={() => setLocalExportMode('alternating')}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>轮流大屏模式 (先播放改善前大屏，再播放改善后大屏)</span>
                  </label>
                </div>
              </div>

              {/* 视频剪辑时长控制 */}
              <div className="setting-group" style={{ marginBottom: '10px' }}>
                <label style={{ fontWeight: '600', display: 'block', marginBottom: '10px', fontSize: '14px', color: 'var(--text-color)' }}>
                  视频剪辑时长控制
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="radio"
                      name="switchOnSpeechEnd"
                      checked={switchOnSpeechEnd}
                      onChange={() => setSwitchOnSpeechEnd(true)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>语音完即切换 (以配音时长为准，自动剪辑)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="radio"
                      name="switchOnSpeechEnd"
                      checked={!switchOnSpeechEnd}
                      onChange={() => setSwitchOnSpeechEnd(false)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>播放至视频结束 (继续播放直至原视频画面放完)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
              <button className="btn-secondary" onClick={() => setShowSettingsModal(false)}>
                取消
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  setShowSettingsModal(false);
                  startExportProcess(exportSubtitles, localExportMode, switchOnSpeechEnd);
                }}
              >
                确认并保存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

ExportVideoButton.propTypes = {
  stage: PropTypes.object.isRequired,
  process: PropTypes.object,
  processes: PropTypes.array,
  layoutMode: PropTypes.string,
  aiNarratorActive: PropTypes.bool,
  narrationSpeed: PropTypes.number,
  globalMode: PropTypes.bool,
  defaultSwitchOnSpeechEnd: PropTypes.bool,
};

export default ExportVideoButton;
