const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 项目操作
  createProject: (name, description) => ipcRenderer.invoke('create-project', name, description),
  getAllProjects: () => ipcRenderer.invoke('get-all-projects'),
  getProject: (id) => ipcRenderer.invoke('get-project', id),
  updateProject: (id, name, description) => ipcRenderer.invoke('update-project', id, name, description),
  deleteProject: (id) => ipcRenderer.invoke('delete-project', id),

  // 阶段操作
  createStage: (projectId, name, description) => ipcRenderer.invoke('create-stage', projectId, name, description),
  getStagesByProject: (projectId) => ipcRenderer.invoke('get-stages-by-project', projectId),
  getStage: (id) => ipcRenderer.invoke('get-stage', id),
  updateStage: (id, data) => ipcRenderer.invoke('update-stage', id, data),
  deleteStage: (id) => ipcRenderer.invoke('delete-stage', id),

  // 工序操作
  createProcess: (stageId, data) => ipcRenderer.invoke('create-process', stageId, data),
  getProcessesByStage: (stageId) => ipcRenderer.invoke('get-processes-by-stage', stageId),
  getProcess: (id) => ipcRenderer.invoke('get-process', id),
  updateProcess: (id, data) => ipcRenderer.invoke('update-process', id, data),
  deleteProcess: (id) => ipcRenderer.invoke('delete-process', id),
  updateProcessOrder: (id, order) => ipcRenderer.invoke('update-process-order', id, order),
  getStageTotalTimeSaved: (stageId) => ipcRenderer.invoke('get-stage-total-time-saved', stageId),

  // 文件操作
  selectVideoFile: () => ipcRenderer.invoke('select-video-file'),
  openPath: (path) => ipcRenderer.invoke('open-path', path)
});
