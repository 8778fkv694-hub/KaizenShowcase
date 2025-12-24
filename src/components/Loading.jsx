import React from 'react';

function Loading({ text = '加载中...', size = 'medium' }) {
  const sizeClass = `loading-${size}`;

  return (
    <div className={`loading-container ${sizeClass}`}>
      <div className="loading-spinner"></div>
      {text && <span className="loading-text">{text}</span>}
    </div>
  );
}

export default Loading;
