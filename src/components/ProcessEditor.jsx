import React, { useState, useRef, useEffect, memo } from 'react';
import { useToast } from './Toast';
import { formatTimeDetailed } from '../utils/time';

/**
 * 工序编辑器 - 带视频预览，方便设置时间点
 */
function ProcessEditor({ stage, process, onSave, onCancel, narrationSpeed = 5.0 }) {
  const isEditing = !!process;
  const beforeVideoRef = useRef(null);
  const afterVideoRef = useRef(null);
  const { addToast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    improvementNote: '',
    beforeStart: 0,
    beforeEnd: 0,
    afterStart: 0,
    afterEnd: 0,
    processType: 'normal',
    subtitleText: ''
  });

  const [beforeCurrentTime, setBeforeCurrentTime] = useState(0);
  const [afterCurrentTime, setAfterCurrentTime] = useState(0);
  const [activeVideo, setActiveVideo] = useState('before'); // before 或 after

  // 初始化表单数据
  useEffect(() => {
    if (process) {
      setFormData({
        name: process.name,
        description: process.description || '',
        improvementNote: process.improvement_note || '',
        beforeStart: process.before_start_time,
        beforeEnd: process.before_end_time,
        afterStart: process.after_start_time,
        afterEnd: process.after_end_time,
        processType: process.process_type || 'normal',
        subtitleText: process.subtitle_text || ''
      });
      // 跳转到工序开始位置
      setTimeout(() => {
        if (beforeVideoRef.current) {
          beforeVideoRef.current.currentTime = process.before_start_time;
        }
        if (afterVideoRef.current) {
          afterVideoRef.current.currentTime = process.after_start_time;
        }
      }, 100);
    }
  }, [process]);

  const handleTimeUpdate = (type) => {
    if (type === 'before' && beforeVideoRef.current) {
      setBeforeCurrentTime(beforeVideoRef.current.currentTime);
    } else if (type === 'after' && afterVideoRef.current) {
      setAfterCurrentTime(afterVideoRef.current.currentTime);
    }
  };

  // 获取当前时间并填入表单
  const captureTime = (field) => {
    const time = field.includes('before') ? beforeCurrentTime : afterCurrentTime;
    setFormData(prev => ({ ...prev, [field]: parseFloat(time.toFixed(1)) }));
    addToast(`已设置: ${time.toFixed(1)}秒`, 'success');
  };

  // 跳转到指定时间
  const seekTo = (field) => {
    const time = parseFloat(formData[field]) || 0;
    if (field.includes('before') && beforeVideoRef.current) {
      beforeVideoRef.current.currentTime = time;
      setActiveVideo('before');
    } else if (field.includes('after') && afterVideoRef.current) {
      afterVideoRef.current.currentTime = time;
      setActiveVideo('after');
    }
  };

  // 处理步骤类型切换
  const handleTypeChange = (e) => {
    const newType = e.target.value;
    const updates = { processType: newType };

    if (newType === 'new_step') {
      updates.beforeStart = 0;
      updates.beforeEnd = 0;
    } else if (newType === 'cancelled') {
      updates.afterStart = 0;
      updates.afterEnd = 0;
    }

    setFormData(prev => ({ ...prev, ...updates }));
  };

  const isBeforeDisabled = formData.processType === 'new_step';
  const isAfterDisabled = formData.processType === 'cancelled';

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      addToast('请输入工序名称', 'error');
      return;
    }

    const data = {
      name: formData.name,
      description: formData.description,
      improvementNote: formData.improvementNote,
      beforeStart: parseFloat(formData.beforeStart) || 0,
      beforeEnd: parseFloat(formData.beforeEnd) || 0,
      afterStart: parseFloat(formData.afterStart) || 0,
      afterEnd: parseFloat(formData.afterEnd) || 0,
      processType: formData.processType,
      subtitleText: formData.subtitleText
    };

    // 验证时间
    if (data.processType !== 'new_step' && data.beforeEnd <= data.beforeStart) {
      addToast('改善前结束时间必须大于开始时间', 'error');
      return;
    }
    if (data.processType !== 'cancelled' && data.afterEnd <= data.afterStart) {
      addToast('改善后结束时间必须大于开始时间', 'error');
      return;
    }

    try {
      await onSave(data, process?.id);
    } catch (error) {
      console.error('保存失败:', error);
      addToast('保存失败', 'error');
    }
  };

  const formatTime = formatTimeDetailed;

  return (
    <div className="process-editor">
      <div className="editor-header">
        <h2>{isEditing ? `编辑工序 - ${process.name}` : '创建新工序'}</h2>
        <button className="close-btn" onClick={onCancel}>×</button>
      </div>

      <div className="editor-content">
        {/* 视频预览区 */}
        <div className="video-preview-section">
          <div className={`video-preview ${activeVideo === 'before' ? 'active' : ''} ${isBeforeDisabled ? 'disabled' : ''}`}>
            <div className="preview-header">
              <span className="preview-label">改善前视频 {isBeforeDisabled ? '(无)' : ''}</span>
              <span className="current-time">{formatTime(beforeCurrentTime)}</span>
            </div>
            <video
              ref={beforeVideoRef}
              src={stage.before_video_path ? `local-video://${stage.before_video_path}` : ''}
              onTimeUpdate={() => handleTimeUpdate('before')}
              onClick={() => !isBeforeDisabled && setActiveVideo('before')}
              controls={!isBeforeDisabled}
              style={{ opacity: isBeforeDisabled ? 0.3 : 1, pointerEvents: isBeforeDisabled ? 'none' : 'auto' }}
            />
            <div className="time-capture-btns">
              <button
                type="button"
                onClick={() => captureTime('beforeStart')}
                className="capture-btn start"
                disabled={isBeforeDisabled}
              >
                设为开始时间
              </button>
              <button
                type="button"
                onClick={() => captureTime('beforeEnd')}
                className="capture-btn end"
                disabled={isBeforeDisabled}
              >
                设为结束时间
              </button>
            </div>
          </div>

          <div className={`video-preview ${activeVideo === 'after' ? 'active' : ''} ${isAfterDisabled ? 'disabled' : ''}`}>
            <div className="preview-header">
              <span className="preview-label">改善后视频 {isAfterDisabled ? '(无)' : ''}</span>
              <span className="current-time">{formatTime(afterCurrentTime)}</span>
            </div>
            <video
              ref={afterVideoRef}
              src={stage.after_video_path ? `local-video://${stage.after_video_path}` : ''}
              onTimeUpdate={() => handleTimeUpdate('after')}
              onClick={() => !isAfterDisabled && setActiveVideo('after')}
              controls={!isAfterDisabled}
              style={{ opacity: isAfterDisabled ? 0.3 : 1, pointerEvents: isAfterDisabled ? 'none' : 'auto' }}
            />
            <div className="time-capture-btns">
              <button
                type="button"
                onClick={() => captureTime('afterStart')}
                className="capture-btn start"
                disabled={isAfterDisabled}
              >
                设为开始时间
              </button>
              <button
                type="button"
                onClick={() => captureTime('afterEnd')}
                className="capture-btn end"
                disabled={isAfterDisabled}
              >
                设为结束时间
              </button>
            </div>
          </div>
        </div>

        {/* 表单区 */}
        <form className="editor-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>工序名称 *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如：物料准备"
              required
            />
          </div>

          <div className="form-group">
            <label>步骤类型</label>
            <select
              value={formData.processType}
              onChange={handleTypeChange}
            >
              <option value="normal">正常对比</option>
              <option value="new_step">新增步骤 (改善前无)</option>
              <option value="cancelled">减少步骤 (改善后无)</option>
            </select>
          </div>

          <div className="time-inputs-section">
            <div className={`time-group ${isBeforeDisabled ? 'disabled' : ''}`}>
              <label>改善前时间段 {isBeforeDisabled ? '(无需编辑)' : ''}</label>
              <div className="time-inputs">
                <div className="time-input-wrapper">
                  <input
                    type="number"
                    step="0.1"
                    value={formData.beforeStart}
                    onChange={(e) => setFormData({ ...formData, beforeStart: e.target.value })}
                    placeholder="开始"
                    disabled={isBeforeDisabled}
                  />
                  <button
                    type="button"
                    onClick={() => seekTo('beforeStart')}
                    className="seek-btn"
                    title="跳转"
                    disabled={isBeforeDisabled}
                  >
                    ▶
                  </button>
                </div>
                <span className="time-separator">→</span>
                <div className="time-input-wrapper">
                  <input
                    type="number"
                    step="0.1"
                    value={formData.beforeEnd}
                    onChange={(e) => setFormData({ ...formData, beforeEnd: e.target.value })}
                    placeholder="结束"
                    disabled={isBeforeDisabled}
                  />
                  <button
                    type="button"
                    onClick={() => seekTo('beforeEnd')}
                    className="seek-btn"
                    title="跳转"
                    disabled={isBeforeDisabled}
                  >
                    ▶
                  </button>
                </div>
              </div>
              <span className="duration">
                时长: {formatTime(Math.max(0, formData.beforeEnd - formData.beforeStart))}
              </span>
            </div>

            <div className={`time-group ${isAfterDisabled ? 'disabled' : ''}`}>
              <label>改善后时间段 {isAfterDisabled ? '(无需编辑)' : ''}</label>
              <div className="time-inputs">
                <div className="time-input-wrapper">
                  <input
                    type="number"
                    step="0.1"
                    value={formData.afterStart}
                    onChange={(e) => setFormData({ ...formData, afterStart: e.target.value })}
                    placeholder="开始"
                    disabled={isAfterDisabled}
                  />
                  <button
                    type="button"
                    onClick={() => seekTo('afterStart')}
                    className="seek-btn"
                    title="跳转"
                    disabled={isAfterDisabled}
                  >
                    ▶
                  </button>
                </div>
                <span className="time-separator">→</span>
                <div className="time-input-wrapper">
                  <input
                    type="number"
                    step="0.1"
                    value={formData.afterEnd}
                    onChange={(e) => setFormData({ ...formData, afterEnd: e.target.value })}
                    placeholder="结束"
                    disabled={isAfterDisabled}
                  />
                  <button
                    type="button"
                    onClick={() => seekTo('afterEnd')}
                    className="seek-btn"
                    title="跳转"
                    disabled={isAfterDisabled}
                  >
                    ▶
                  </button>
                </div>
              </div>
              <span className="duration">
                时长: {formatTime(Math.max(0, formData.afterEnd - formData.afterStart))}
              </span>
            </div>
          </div>

          <div className="form-group">
            <label>改善说明</label>
            <textarea
              value={formData.improvementNote}
              onChange={(e) => setFormData({ ...formData, improvementNote: e.target.value })}
              placeholder="说明改善内容（文字描述）"
              rows="2"
            />
          </div>

          <div className="form-group subtitle-group">
            <div className="label-with-hint">
              <label>AI 讲解词 / 字幕</label>
              <span className="hint">用于语音讲解和底部字幕展示</span>
            </div>
            <textarea
              value={formData.subtitleText}
              onChange={(e) => setFormData({ ...formData, subtitleText: e.target.value })}
              placeholder="输入讲解词，默认语速为 5字/秒"
              rows="3"
            />
            <div className="subtitle-info">
              <span>字数: {formData.subtitleText.length}</span>
              <span className="divider">|</span>
              <span>预计讲解时长: <span className="highlight">{(formData.subtitleText.length / narrationSpeed).toFixed(1)}s</span></span>
              <span className="divider">|</span>
              <span className="hint">({narrationSpeed}字/秒)</span>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="btn-primary">
              {isEditing ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default memo(ProcessEditor);
