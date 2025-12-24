import React, { useState, memo } from 'react';
import { useToast } from './Toast';
import {
  exportToCSV,
  exportToJSON,
  exportToMarkdown,
  downloadFile
} from '../utils/export';

function ExportButton({ project, stage, processes }) {
  const [showMenu, setShowMenu] = useState(false);
  const { addToast } = useToast();

  if (!project || !stage || !processes || processes.length === 0) {
    return null;
  }

  const handleExport = (format) => {
    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      const baseName = `${project.name}-${stage.name}-${timestamp}`;

      switch (format) {
        case 'csv': {
          const content = exportToCSV(stage, processes);
          downloadFile(content, `${baseName}.csv`, 'text/csv;charset=utf-8');
          addToast('CSV文件已导出', 'success');
          break;
        }
        case 'json': {
          const content = exportToJSON(project, stage, processes);
          downloadFile(content, `${baseName}.json`, 'application/json');
          addToast('JSON文件已导出', 'success');
          break;
        }
        case 'markdown': {
          const content = exportToMarkdown(project, stage, processes);
          downloadFile(content, `${baseName}.md`, 'text/markdown');
          addToast('Markdown报告已导出', 'success');
          break;
        }
        default:
          break;
      }
    } catch (error) {
      console.error('导出失败:', error);
      addToast('导出失败', 'error');
    }

    setShowMenu(false);
  };

  return (
    <div className="export-button-container">
      <button
        className="export-button"
        onClick={() => setShowMenu(!showMenu)}
        title="导出数据"
      >
        📥 导出
      </button>

      {showMenu && (
        <>
          <div className="export-menu-overlay" onClick={() => setShowMenu(false)} />
          <div className="export-menu">
            <button onClick={() => handleExport('csv')}>
              📊 导出为 CSV
            </button>
            <button onClick={() => handleExport('json')}>
              📋 导出为 JSON
            </button>
            <button onClick={() => handleExport('markdown')}>
              📝 导出为 Markdown
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default memo(ExportButton);
