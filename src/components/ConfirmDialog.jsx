import React, { createContext, useContext, useState, useCallback } from 'react';

const ConfirmContext = createContext();

export function ConfirmProvider({ children }) {
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '确认',
    cancelText: '取消',
    type: 'danger', // danger, warning, info
    onConfirm: null
  });

  const confirm = useCallback(({ title, message, confirmText = '确认', cancelText = '取消', type = 'danger' }) => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        title,
        message,
        confirmText,
        cancelText,
        type,
        onConfirm: resolve
      });
    });
  }, []);

  const handleConfirm = () => {
    confirmState.onConfirm?.(true);
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  };

  const handleCancel = () => {
    confirmState.onConfirm?.(false);
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {confirmState.isOpen && (
        <div className="modal-overlay" onClick={handleCancel}>
          <div className="modal confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{confirmState.title}</h3>
            </div>
            <div className="confirm-content">
              <p>{confirmState.message}</p>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={handleCancel}>
                {confirmState.cancelText}
              </button>
              <button
                className={`btn-${confirmState.type === 'danger' ? 'danger' : 'primary'}`}
                onClick={handleConfirm}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context.confirm;
}
