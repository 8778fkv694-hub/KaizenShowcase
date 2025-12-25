const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 项目操作
  createProject: (name, description) => ipcRenderer.invoke('create-project', name, description),
  getAllProjects: () => ipcRenderer.invoke('get-all-projects'),
  getProject: (id) => ipcRenderer.invoke('get-project', id),
  updateProject: (id, name, description, narrationSpeed) => ipcRenderer.invoke('update-project', id, name, description, narrationSpeed),
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

  // TTS 语音合成
  generateSpeech: (text, voice, rate) => ipcRenderer.invoke('generate-speech', text, voice, rate),
  updateProcessOrder: (id, order) => ipcRenderer.invoke('update-process-order', id, order),
  getStageTotalTimeSaved: (stageId) => ipcRenderer.invoke('get-stage-total-time-saved', stageId),

  // 文件操作
  selectVideoFile: () => ipcRenderer.invoke('select-video-file'),
  openPath: (path) => ipcRenderer.invoke('open-path', path),

  // 标注操作
  createAnnotation: (processId, data) => ipcRenderer.invoke('create-annotation', processId, data),
  getAnnotationsByProcess: (processId, videoType) => ipcRenderer.invoke('get-annotations-by-process', processId, videoType),
  getAnnotation: (id) => ipcRenderer.invoke('get-annotation', id),
  updateAnnotation: (id, data) => ipcRenderer.invoke('update-annotation', id, data),
  deleteAnnotation: (id) => ipcRenderer.invoke('delete-annotation', id),

  // 截图操作
  saveScreenshot: (processId, dataUrl) => ipcRenderer.invoke('save-screenshot', processId, dataUrl),
  updateProcessThumbnail: (id, thumbnailPath) => ipcRenderer.invoke('update-process-thumbnail', id, thumbnailPath)
});
