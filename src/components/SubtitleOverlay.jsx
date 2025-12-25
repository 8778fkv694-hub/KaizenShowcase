import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';

/**
 * 悬浮字幕组件 (V6 完整版)
 * - 支持卡拉OK式字级变色和旧版估算模式
 * - 支持完整的样式设置（字号、颜色、背景、行数）
 * - 设置持久化到数据库
 */

// 默认设置
const DEFAULT_SETTINGS = {
  fontSize: 24,
  textColor: '#FFFFFF',
  highlightColor: '#FFD700',
  bgColor: '#000000',
  bgOpacity: 0.7,
  maxLines: 2,
  positionX: 50,
  positionY: 85
};

// 预设颜色选项
const COLOR_PRESETS = {
  text: ['#FFFFFF', '#F0F0F0', '#CCCCCC', '#FFFF00', '#00FF00', '#00FFFF'],
  highlight: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'],
  bg: ['#000000', '#1a1a2e', '#16213e', '#0f3460', '#533483', '#2c3e50']
};

function SubtitleOverlay({
    text,
    isPlaying,
    currentTime,
    isActive,
    timingData = [],
    narrationSpeed = 5.0
}) {
    // 设置状态
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [position, setPosition] = useState({ x: DEFAULT_SETTINGS.positionX, y: DEFAULT_SETTINGS.positionY });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const containerRef = useRef(null);
    const settingsLoadedRef = useRef(false);

    // 加载保存的设置
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const saved = await window.electronAPI.getSubtitleSettings();
                if (saved) {
                    const loadedSettings = {
                        fontSize: saved.font_size || DEFAULT_SETTINGS.fontSize,
                        textColor: saved.text_color || DEFAULT_SETTINGS.textColor,
                        highlightColor: saved.highlight_color || DEFAULT_SETTINGS.highlightColor,
                        bgColor: saved.bg_color || DEFAULT_SETTINGS.bgColor,
                        bgOpacity: saved.bg_opacity ?? DEFAULT_SETTINGS.bgOpacity,
                        maxLines: saved.max_lines || DEFAULT_SETTINGS.maxLines,
                        positionX: saved.position_x ?? DEFAULT_SETTINGS.positionX,
                        positionY: saved.position_y ?? DEFAULT_SETTINGS.positionY
                    };
                    setSettings(loadedSettings);
                    setPosition({ x: loadedSettings.positionX, y: loadedSettings.positionY });
                }
                settingsLoadedRef.current = true;
            } catch (err) {
                console.error('加载字幕设置失败:', err);
            }
        };
        loadSettings();
    }, []);

    // 保存设置到数据库
    const saveSettings = useCallback(async (newSettings) => {
        if (!settingsLoadedRef.current) return;
        try {
            await window.electronAPI.updateSubtitleSettings(newSettings);
        } catch (err) {
            console.error('保存字幕设置失败:', err);
        }
    }, []);

    // 更新设置
    const updateSetting = useCallback((key, value) => {
        setSettings(prev => {
            const newSettings = { ...prev, [key]: value };
            saveSettings(newSettings);
            return newSettings;
        });
    }, [saveSettings]);

    // 判断是否使用卡拉OK模式
    const useKaraokeMode = useMemo(() => {
        return Array.isArray(timingData) && timingData.length > 0;
    }, [timingData]);

    // 格式化兼容性检查
    const segments = useMemo(() => {
        if (!useKaraokeMode) return [];
        if (timingData[0] && !timingData[0].tokens) {
            return [{
                tokens: timingData,
                start: timingData[0].start,
                end: timingData[timingData.length - 1].end
            }];
        }
        return timingData;
    }, [timingData, useKaraokeMode]);

    // 卡拉OK模式：计算当前 Segment
    const currentSegment = useMemo(() => {
        if (!useKaraokeMode || segments.length === 0) return null;
        const segment = segments.find(seg => currentTime >= seg.start && currentTime < seg.end);
        if (segment) return segment;

        const lastSeg = segments[segments.length - 1];
        if (currentTime >= lastSeg.end && currentTime <= lastSeg.end + 2) {
            return lastSeg;
        }
        return null;
    }, [segments, currentTime, useKaraokeMode]);

    // 旧版模式：估算字幕显示
    const [displayedText, setDisplayedText] = useState('');

    useEffect(() => {
        if (useKaraokeMode || !isActive || !text) {
            setDisplayedText('');
            return;
        }

        const cleanText = text.replace(/[\r\n]+/g, ' ').trim();
        const minLength = 10;
        const rawParts = cleanText.split(/([，。！？,.;；! ?])/);
        const chunks = [];
        let currentText = "";

        for (let i = 0; i < rawParts.length; i += 2) {
            const sentence = rawParts[i];
            const punctuation = rawParts[i + 1] || "";
            const combined = sentence + punctuation;

            currentText += combined;

            if (currentText.trim().length >= minLength || i + 2 >= rawParts.length) {
                if (currentText.trim().length > 0) {
                    const startIdx = chunks.length > 0 ? chunks[chunks.length - 1].endIdx : 0;
                    chunks.push({
                        text: currentText.trim(),
                        startIdx: startIdx,
                        endIdx: startIdx + currentText.length
                    });
                }
                currentText = "";
            }
        }

        const anticipationOffset = 0.5;
        const adjustedTime = currentTime + anticipationOffset;

        const currentChunk = chunks.find(chunk => {
            const startTime = chunk.startIdx / narrationSpeed;
            const endTime = chunk.endIdx / narrationSpeed;
            return adjustedTime >= startTime && adjustedTime < endTime;
        });

        if (currentChunk) {
            setDisplayedText(currentChunk.text);
        } else if (currentTime >= cleanText.length / narrationSpeed) {
            setDisplayedText('');
        } else if (chunks.length > 0 && adjustedTime < chunks[0].startIdx / narrationSpeed) {
            setDisplayedText('');
        }
    }, [text, currentTime, isActive, narrationSpeed, useKaraokeMode]);

    // 拖拽处理
    const handleMouseDown = (e) => {
        if (e.button !== 0 || showSettingsPanel) return;
        setIsDragging(true);
        const rect = containerRef.current.getBoundingClientRect();
        setDragStart({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
    };

    const handleMouseMove = useCallback((e) => {
        if (!isDragging) return;
        const parentRect = containerRef.current.parentElement.getBoundingClientRect();
        const newX = ((e.clientX - parentRect.left - dragStart.x) / parentRect.width) * 100;
        const newY = ((e.clientY - parentRect.top - dragStart.y) / parentRect.height) * 100;
        const clampedX = Math.max(0, Math.min(newX, 100));
        const clampedY = Math.max(0, Math.min(newY, 100));
        setPosition({ x: clampedX, y: clampedY });
    }, [isDragging, dragStart]);

    const handleMouseUp = useCallback(() => {
        if (isDragging) {
            // 保存位置
            const newSettings = { ...settings, positionX: position.x, positionY: position.y };
            setSettings(newSettings);
            saveSettings(newSettings);
        }
        setIsDragging(false);
    }, [isDragging, position, settings, saveSettings]);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    // 不显示的情况
    if (!isActive || !text) return null;
    if (useKaraokeMode && !currentSegment) return null;
    if (!useKaraokeMode && !displayedText) return null;

    // 背景样式
    const bgStyle = {
        backgroundColor: `${settings.bgColor}${Math.round(settings.bgOpacity * 255).toString(16).padStart(2, '0')}`
    };

    return (
        <div
            ref={containerRef}
            className={`subtitle-overlay ${useKaraokeMode ? 'subtitle-overlay-v2' : ''} ${isDragging ? 'dragging' : ''}`}
            style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
                fontSize: `${settings.fontSize}px`,
                position: 'absolute',
                zIndex: 1000,
                transform: 'translateX(-50%)',
                '--subtitle-text-color': settings.textColor,
                '--subtitle-highlight-color': settings.highlightColor,
            }}
            onMouseDown={handleMouseDown}
        >
            {useKaraokeMode ? (
                <div className="subtitle-content-v2" style={bgStyle}>
                    <div className="karaoke-wrapper">
                        {currentSegment.tokens.map((token, index) => (
                            <KaraokeUnit
                                key={index}
                                unit={token}
                                currentTime={currentTime}
                                textColor={settings.textColor}
                                highlightColor={settings.highlightColor}
                            />
                        ))}
                    </div>
                </div>
            ) : (
                <div className="subtitle-content" style={{ ...bgStyle, color: settings.textColor }}>
                    {displayedText}
                </div>
            )}

            {/* 控制按钮区 */}
            <div className="subtitle-controls" onMouseDown={e => e.stopPropagation()}>
                <button onClick={() => updateSetting('fontSize', Math.max(12, settings.fontSize - 2))} title="减小字号">A-</button>
                <button onClick={() => updateSetting('fontSize', Math.min(72, settings.fontSize + 2))} title="增大字号">A+</button>
                <button
                    className={`settings-btn ${showSettingsPanel ? 'active' : ''}`}
                    onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                    title="字幕设置"
                >
                    ⚙
                </button>
            </div>

            {/* 设置面板 */}
            {showSettingsPanel && (
                <div className="subtitle-settings-panel" onMouseDown={e => e.stopPropagation()}>
                    <div className="settings-header">
                        <span>字幕设置</span>
                        <button className="close-btn" onClick={() => setShowSettingsPanel(false)}>×</button>
                    </div>

                    <div className="settings-body">
                        {/* 字号设置 */}
                        <div className="setting-row">
                            <label>字号</label>
                            <div className="setting-control">
                                <input
                                    type="range"
                                    min="12"
                                    max="72"
                                    value={settings.fontSize}
                                    onChange={e => updateSetting('fontSize', parseInt(e.target.value))}
                                />
                                <span className="value">{settings.fontSize}px</span>
                            </div>
                        </div>

                        {/* 文字颜色 */}
                        <div className="setting-row">
                            <label>文字颜色</label>
                            <div className="color-picker">
                                {COLOR_PRESETS.text.map(color => (
                                    <button
                                        key={color}
                                        className={`color-btn ${settings.textColor === color ? 'active' : ''}`}
                                        style={{ backgroundColor: color }}
                                        onClick={() => updateSetting('textColor', color)}
                                    />
                                ))}
                                <input
                                    type="color"
                                    value={settings.textColor}
                                    onChange={e => updateSetting('textColor', e.target.value)}
                                    title="自定义颜色"
                                />
                            </div>
                        </div>

                        {/* 高亮颜色（卡拉OK模式） */}
                        <div className="setting-row">
                            <label>高亮颜色</label>
                            <div className="color-picker">
                                {COLOR_PRESETS.highlight.map(color => (
                                    <button
                                        key={color}
                                        className={`color-btn ${settings.highlightColor === color ? 'active' : ''}`}
                                        style={{ backgroundColor: color }}
                                        onClick={() => updateSetting('highlightColor', color)}
                                    />
                                ))}
                                <input
                                    type="color"
                                    value={settings.highlightColor}
                                    onChange={e => updateSetting('highlightColor', e.target.value)}
                                    title="自定义颜色"
                                />
                            </div>
                        </div>

                        {/* 背景颜色 */}
                        <div className="setting-row">
                            <label>背景颜色</label>
                            <div className="color-picker">
                                {COLOR_PRESETS.bg.map(color => (
                                    <button
                                        key={color}
                                        className={`color-btn ${settings.bgColor === color ? 'active' : ''}`}
                                        style={{ backgroundColor: color }}
                                        onClick={() => updateSetting('bgColor', color)}
                                    />
                                ))}
                                <input
                                    type="color"
                                    value={settings.bgColor}
                                    onChange={e => updateSetting('bgColor', e.target.value)}
                                    title="自定义颜色"
                                />
                            </div>
                        </div>

                        {/* 背景透明度 */}
                        <div className="setting-row">
                            <label>背景透明度</label>
                            <div className="setting-control">
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={Math.round(settings.bgOpacity * 100)}
                                    onChange={e => updateSetting('bgOpacity', parseInt(e.target.value) / 100)}
                                />
                                <span className="value">{Math.round(settings.bgOpacity * 100)}%</span>
                            </div>
                        </div>

                        {/* 最大行数 */}
                        <div className="setting-row">
                            <label>最大行数</label>
                            <div className="setting-control buttons">
                                {[1, 2, 3, 4].map(n => (
                                    <button
                                        key={n}
                                        className={settings.maxLines === n ? 'active' : ''}
                                        onClick={() => updateSetting('maxLines', n)}
                                    >
                                        {n}行
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 重置按钮 */}
                        <div className="setting-row reset">
                            <button
                                className="reset-btn"
                                onClick={() => {
                                    setSettings(DEFAULT_SETTINGS);
                                    setPosition({ x: DEFAULT_SETTINGS.positionX, y: DEFAULT_SETTINGS.positionY });
                                    saveSettings(DEFAULT_SETTINGS);
                                }}
                            >
                                恢复默认设置
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const KaraokeUnit = memo(({ unit, currentTime, textColor, highlightColor }) => {
    let progress = 0;
    if (currentTime >= unit.end) progress = 100;
    else if (currentTime > unit.start) progress = ((currentTime - unit.start) / unit.duration) * 100;

    if (unit.text === ' ' || !unit.text.trim()) {
        return <span className="karaoke-space">&nbsp;</span>;
    }

    return (
        <span className="karaoke-unit" data-text={unit.text}>
            <span className="karaoke-base" style={{ color: textColor }}>{unit.text}</span>
            <span
                className="karaoke-fill"
                style={{
                    color: highlightColor,
                    clipPath: `inset(0 ${100 - progress}% 0 0)`,
                    WebkitClipPath: `inset(0 ${100 - progress}% 0 0)`
                }}
            >
                {unit.text}
            </span>
        </span>
    );
});

export default memo(SubtitleOverlay);
