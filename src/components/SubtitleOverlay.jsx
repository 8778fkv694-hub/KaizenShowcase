import React, { useState, useEffect, useRef, useCallback, memo } from 'react';

/**
 * 悬浮字幕组件
 * 支持拖拽、调整大小、模拟打字机效果
 */
function SubtitleOverlay({
    text,
    isPlaying,
    currentTime,
    isActive,
    onTimeUpdate,
    narrationSpeed = 5.0
}) {
    const [position, setPosition] = useState({ x: 50, y: 85 }); // 百分比位置
    const [fontSize, setFontSize] = useState(20);
    const [displayedText, setDisplayedText] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const containerRef = useRef(null);

    // 电影字幕效果逻辑 - 按句子/短句展示，且提前出现
    useEffect(() => {
        if (!isActive || !text) {
            setDisplayedText('');
            return;
        }

        // 去掉所有换行符和段落符号，将其视为连续文本
        const cleanText = text.replace(/[\r\n]+/g, ' ').trim();

        // 1. 将文本拆分为短句并合并过短的句子 (至少 10 个字)
        const minLength = 10;
        const rawParts = cleanText.split(/([，。！？,.;；! ?])/);
        const chunks = [];
        let currentText = "";
        let currentStartIdx = 0;

        for (let i = 0; i < rawParts.length; i += 2) {
            const sentence = rawParts[i];
            const punctuation = rawParts[i + 1] || "";
            const combined = sentence + punctuation;

            if (currentText.length === 0) {
                currentStartIdx = i === 0 ? 0 : currentStartIdx;
            }

            currentText += combined;

            // 如果当前累积的字数达到阈值，或者已经是最后一片，则存入 chunks
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

        // 2. 提前 0.5 秒展示 (Anticipation Offset)
        const anticipationOffset = 0.5;
        const adjustedTime = currentTime + anticipationOffset;

        // 3. 找到当前时间点对应的句子
        const currentChunk = chunks.find(chunk => {
            const startTime = chunk.startIdx / narrationSpeed;
            const endTime = chunk.endIdx / narrationSpeed;
            return adjustedTime >= startTime && adjustedTime < endTime;
        });

        if (currentChunk) {
            setDisplayedText(currentChunk.text);
        } else if (currentTime >= cleanText.length / narrationSpeed) {
            // 讲解完成，显示特定提示（不读出来）
            setDisplayedText('【本节讲解完毕】');
        } else if (chunks.length > 0 && adjustedTime < chunks[0].startIdx / narrationSpeed) {
            setDisplayedText('');
        }
    }, [text, currentTime, isActive, narrationSpeed]);

    // 拖拽处理
    const handleMouseDown = (e) => {
        if (e.button !== 0) return; // 仅左键
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

        // 限制范围
        setPosition({
            x: Math.max(0, Math.min(newX, 90)),
            y: Math.max(0, Math.min(newY, 95))
        });
    }, [isDragging, dragStart]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

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

    if (!isActive || !text) return null;

    return (
        <div
            ref={containerRef}
            className={`subtitle-overlay ${isDragging ? 'dragging' : ''}`}
            style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
                fontSize: `${fontSize}px`,
                position: 'absolute',
                zIndex: 1000,
                transform: 'translateX(-50%)', // 水平居中锚点
            }}
            onMouseDown={handleMouseDown}
        >
            <div className="subtitle-content">
                {displayedText}
            </div>
            <div className="subtitle-controls" onMouseDown={e => e.stopPropagation()}>
                <button onClick={() => setFontSize(s => Math.max(12, s - 2))} title="减小字号">A-</button>
                <button onClick={() => setFontSize(s => Math.min(48, s + 2))} title="增大字号">A+</button>
            </div>
        </div>
    );
}

export default memo(SubtitleOverlay);
