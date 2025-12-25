const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const DatabaseManager = require('./database');
const { EdgeTTS } = require('edge-tts-universal');

let mainWindow;
let db;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true  // 保持安全设置开启，使用自定义协议加载本地视频
    },
    title: '改善效果展示系统'
  });

  // 开发环境加载Vite服务器，生产环境加载打包文件
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:8547');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  // 注册自定义 protocol 来处理本地视频文件
  protocol.registerFileProtocol('local-video', (request, callback) => {
    const url = request.url.replace('local-video://', '');
    const decodedPath = decodeURIComponent(url);
    callback({ path: decodedPath });
  });

  // 设置CSP
  const { session } = require('electron');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; media-src 'self' local-video:; img-src 'self' data:;"
        ]
      }
    });
  });

  // 初始化数据库
  db = new DatabaseManager();

  // 注册IPC处理器
  registerIpcHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    db.close();
    app.quit();
  }
});

app.on('before-quit', () => {
  if (db) {
    db.close();
  }
});

function registerIpcHandlers() {
  // 项目操作
  ipcMain.handle('create-project', async (event, name, description) => {
    return db.createProject(name, description);
  });

  ipcMain.handle('get-all-projects', async () => {
    return db.getAllProjects();
  });

  ipcMain.handle('get-project', async (event, id) => {
    return db.getProject(id);
  });

  ipcMain.handle('update-project', async (event, id, name, description, narrationSpeed) => {
    console.log('[IPC] 更新项目:', id, '语速:', narrationSpeed);
    return db.updateProject(id, name, description, narrationSpeed);
  });

  ipcMain.handle('delete-project', async (event, id) => {
    return db.deleteProject(id);
  });

  // 阶段操作
  ipcMain.handle('create-stage', async (event, projectId, name, description) => {
    return db.createStage(projectId, name, description);
  });

  ipcMain.handle('get-stages-by-project', async (event, projectId) => {
    return db.getStagesByProject(projectId);
  });

  ipcMain.handle('get-stage', async (event, id) => {
    return db.getStage(id);
  });

  ipcMain.handle('update-stage', async (event, id, data) => {
    return db.updateStage(id, data);
  });

  ipcMain.handle('delete-stage', async (event, id) => {
    return db.deleteStage(id);
  });

  // 工序操作
  ipcMain.handle('create-process', async (event, stageId, data) => {
    return db.createProcess(stageId, data);
  });

  ipcMain.handle('get-processes-by-stage', async (event, stageId) => {
    return db.getProcessesByStage(stageId);
  });

  ipcMain.handle('get-process', async (event, id) => {
    return db.getProcess(id);
  });

  ipcMain.handle('update-process', async (event, id, data) => {
    return db.updateProcess(id, data);
  });

  // TTS 语音合成
  ipcMain.handle('generate-speech', async (event, text, voice = "zh-CN-XiaoxiaoNeural", rate = 5.0) => {
    if (!text) return null;

    // 格式化语速 (edge-tts 使用百分比或浮点数，这里需要转换)
    // 我们的 UI 5.0 是基准，假设 +0% 对应 5.0 字/秒（其实 edge-tts 的 rate 是相对值）
    // 为了简单，我们先固定 +0%，因为前端已经处理了字数和进度的匹配。
    // 如果要调节语速，可以换算：rate = ((speed / 5.0) - 1) * 100
    const val = Math.round(((rate / 5.0) - 1) * 100);
    const speedRate = `${val >= 0 ? '+' : ''}${val}%`;

    const ttsCacheDir = path.join(app.getPath('userData'), 'tts_cache');
    if (!fs.existsSync(ttsCacheDir)) {
      fs.mkdirSync(ttsCacheDir, { recursive: true });
    }

    const hash = crypto.createHash('md5').update(`${text}_${voice}_${speedRate}`).digest('hex');
    const fileName = `tts_${hash}.mp3`;
    const filePath = path.join(ttsCacheDir, fileName);

    if (fs.existsSync(filePath)) {
      console.log('[TTS] 命中缓存:', filePath);
      return filePath;
    }

    try {
      console.log('[TTS] 正在合成:', text.substring(0, 20) + '...', '语速:', speedRate);
      const tts = new EdgeTTS(text, voice, { rate: speedRate });
      const { audioData } = await tts.synthesize();
      fs.writeFileSync(filePath, audioData);
      return filePath;
    } catch (error) {
      console.error('[TTS] 合成失败:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-process', async (event, id) => {
    return db.deleteProcess(id);
  });

  ipcMain.handle('update-process-order', async (event, id, order) => {
    return db.updateProcessOrder(id, order);
  });

  ipcMain.handle('get-stage-total-time-saved', async (event, stageId) => {
    return db.getStageTotalTimeSaved(stageId);
  });

  // 文件选择
  ipcMain.handle('select-video-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: '视频文件', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('open-path', async (event, filePath) => {
    return filePath;
  });

  // 标注操作
  ipcMain.handle('create-annotation', async (event, processId, data) => {
    return db.createAnnotation(processId, data);
  });

  ipcMain.handle('get-annotations-by-process', async (event, processId, videoType) => {
    return db.getAnnotationsByProcess(processId, videoType);
  });

  ipcMain.handle('get-annotation', async (event, id) => {
    return db.getAnnotation(id);
  });

  ipcMain.handle('update-annotation', async (event, id, data) => {
    return db.updateAnnotation(id, data);
  });

  ipcMain.handle('delete-annotation', async (event, id) => {
    return db.deleteAnnotation(id);
  });
}
