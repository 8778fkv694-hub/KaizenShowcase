import { useEffect, useCallback } from 'react';

/**
 * 键盘快捷键Hook
 * @param {Object} shortcuts - 快捷键映射对象 { key: handler }
 * @param {boolean} enabled - 是否启用快捷键
 */
export function useKeyboardShortcuts(shortcuts, enabled = true) {
  const handleKeyDown = useCallback((event) => {
    if (!enabled) return;

    // 如果焦点在输入框中，忽略快捷键
    const tagName = event.target.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      return;
    }

    const key = event.code;
    const ctrl = event.ctrlKey || event.metaKey;
    const shift = event.shiftKey;

    // 构建快捷键标识
    let shortcutKey = '';
    if (ctrl) shortcutKey += 'Ctrl+';
    if (shift) shortcutKey += 'Shift+';
    shortcutKey += key;

    // 检查是否有匹配的快捷键
    if (shortcuts[shortcutKey]) {
      event.preventDefault();
      shortcuts[shortcutKey](event);
    } else if (shortcuts[key]) {
      // 也检查无修饰键的快捷键
      event.preventDefault();
      shortcuts[key](event);
    }
  }, [shortcuts, enabled]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// 预定义的快捷键常量
export const SHORTCUTS = {
  PLAY_PAUSE: 'Space',
  PREV: 'ArrowLeft',
  NEXT: 'ArrowRight',
  SPEED_1: 'Digit1',
  SPEED_2: 'Digit2',
  SPEED_3: 'Digit3',
  SPEED_5: 'Digit5',
  LOOP: 'KeyL',
  FULLSCREEN: 'KeyF'
};
