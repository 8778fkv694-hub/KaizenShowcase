import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Loading from './Loading';
import { useConfirm } from './ConfirmDialog';

const formatSize = (bytes) => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
};

/**
 * 数据恢复弹窗：列出启动时自动滚动备份的数据库快照，选择一份恢复。
 * 恢复前主进程会把当前库另存为 prerestore_*.db，误恢复可再救回；
 * 恢复后应用自动重启以重新初始化数据库连接。
 */
function BackupRestoreModal({ onClose, addToast }) {
  const [backups, setBackups] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    window.electronAPI.listDbBackups()
      .then(setBackups)
      .catch((error) => {
        console.error('读取备份列表失败:', error);
        addToast('读取备份列表失败', 'error');
        onClose();
      });
  }, [addToast, onClose]);

  const handleRestore = async (backup) => {
    const confirmed = await confirm({
      title: '恢复数据备份',
      message: `确定要恢复到 ${new Date(backup.mtime).toLocaleString('zh-CN')} 的备份吗？\n当前数据会先另存一份，恢复后应用将自动重启。`,
      confirmText: '恢复并重启',
      type: 'danger',
    });
    if (!confirmed) return;

    try {
      setIsRestoring(true);
      await window.electronAPI.restoreDbBackup(backup.fileName);
      // 正常情况下应用已经重启，走不到这里
    } catch (error) {
      console.error('恢复失败:', error);
      addToast(`恢复失败: ${error.message}`, 'error');
      setIsRestoring(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🛟 数据恢复</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {isRestoring ? (
            <Loading text="正在恢复，应用即将重启..." />
          ) : backups === null ? (
            <Loading text="读取备份列表..." />
          ) : backups.length === 0 ? (
            <p className="description-text">暂无备份。应用每次启动时会自动备份数据库。</p>
          ) : (
            <>
              <p className="description-text">
                应用每次启动会自动备份数据库。选择一份快照恢复（视频文件不受影响）：
              </p>
              <div className="backup-list">
                {backups.map((b) => (
                  <div key={b.fileName} className="backup-item">
                    <div className="backup-info">
                      <span className="backup-date">{new Date(b.mtime).toLocaleString('zh-CN')}</span>
                      <span className="backup-size">{formatSize(b.size)}</span>
                    </div>
                    <button className="btn-secondary backup-restore-btn" onClick={() => handleRestore(b)}>
                      恢复
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

BackupRestoreModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  addToast: PropTypes.func.isRequired,
};

export default BackupRestoreModal;
