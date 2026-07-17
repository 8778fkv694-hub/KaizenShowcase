import React, { useState, useEffect } from 'react';
import Loading from './Loading';

function DataTransferModal({ type, projects, onClose, onRefresh, addToast }) {
    const [selectedProjectIds, setSelectedProjectIds] = useState([]);
    const [importMode, setImportMode] = useState('merge'); // 'merge' or 'overwrite'
    const [isProcessing, setIsProcessing] = useState(false);

    const handleToggleProject = (id) => {
        setSelectedProjectIds(prev =>
            prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
        );
    };

    const handleExport = async () => {
        if (selectedProjectIds.length === 0) {
            addToast('请至少选择一个项目', 'warning');
            return;
        }

        try {
            const exportDir = await window.electronAPI.selectExportDirectory();
            if (!exportDir) return;

            setIsProcessing(true);
            const result = await window.electronAPI.exportProjects({
                projectIds: selectedProjectIds,
                exportDir
            });

            if (result.success) {
                addToast(`导出成功！路径: ${result.path}`, 'success');
                onClose();
            }
        } catch (error) {
            console.error('导出失败:', error);
            addToast('导出失败: ' + error.message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleImport = async () => {
        try {
            const importDir = await window.electronAPI.selectImportDirectory();
            if (!importDir) return;

            setIsProcessing(true);
            const result = await window.electronAPI.importProjects({
                importDir,
                mode: importMode
            });

            if (result.success) {
                addToast('导入成功！', 'success');
                onRefresh();
                onClose();
            }
        } catch (error) {
            console.error('导入失败:', error);
            addToast('导入失败: ' + error.message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal data-transfer-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{type === 'export' ? '📤 导出项目' : '📥 导入项目'}</h3>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div className="modal-body">
                    {isProcessing ? (
                        <Loading text={type === 'export' ? '正在复制文件并生成数据...' : '正在导入数据并同步媒体文件...'} />
                    ) : (
                        <>
                            {type === 'export' ? (
                                <div className="export-selection">
                                    <p className="description-text">请选择要导出的项目：</p>
                                    <div className="project-selection-list">
                                        {projects.map(project => (
                                            <label key={project.id} className="project-selection-item">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedProjectIds.includes(project.id)}
                                                    onChange={() => handleToggleProject(project.id)}
                                                />
                                                <span className="name">{project.name}</span>
                                                <span className="date">{new Date(project.updated_at).toLocaleDateString()}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="import-config">
                                    <p className="description-text">选择导入模式：</p>
                                    <div className="mode-options">
                                        <label className={`mode-option ${importMode === 'merge' ? 'active' : ''}`}>
                                            <input
                                                type="radio"
                                                name="importMode"
                                                value="merge"
                                                checked={importMode === 'merge'}
                                                onChange={e => setImportMode(e.target.value)}
                                            />
                                            <div className="option-content">
                                                <span className="title">合并导入</span>
                                                <span className="desc">如果存在同名项目，将创建一个新项目而不删除旧的。</span>
                                            </div>
                                        </label>
                                        <label className={`mode-option ${importMode === 'overwrite' ? 'active' : ''}`}>
                                            <input
                                                type="radio"
                                                name="importMode"
                                                value="overwrite"
                                                checked={importMode === 'overwrite'}
                                                onChange={e => setImportMode(e.target.value)}
                                            />
                                            <div className="option-content">
                                                <span className="title">覆盖导入</span>
                                                <span className="desc">仅当这是你之前导入过的同一项目的更新版本时，才会替换旧数据；不同人恰好项目同名不会互相覆盖。</span>
                                            </div>
                                        </label>
                                    </div>
                                    <div className="import-notice">
                                        <span className="icon">ℹ️</span>
                                        <p>请选择包含 data.json 和 media 文件夹的导出目录。</p>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="modal-actions">
                    <button className="btn-secondary" onClick={onClose} disabled={isProcessing}>
                        取消
                    </button>
                    {type === 'export' ? (
                        <button className="btn-primary" onClick={handleExport} disabled={isProcessing || selectedProjectIds.length === 0}>
                            导出到目录
                        </button>
                    ) : (
                        <button className="btn-primary" onClick={handleImport} disabled={isProcessing}>
                            选择目录并导入
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default DataTransferModal;
