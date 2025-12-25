const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const DatabaseManager = require('./database');
// 我们将根据需要在 ipcHandler 中按需 require edge-tts-universal

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
    title: '改善效果展示系统',
    icon: app.isPackaged ? path.join(__dirname, '../dist/icon.png') : path.join(__dirname, '../public/icon.png')
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
  // 注册自定义 protocol 来处理本地视频文件和图片
  protocol.registerFileProtocol('local-video', (request, callback) => {
    let url = request.url.replace('local-video://', '');
    // 去掉查询参数（如 ?t=xxx）
    const queryIndex = url.indexOf('?');
    if (queryIndex !== -1) {
      url = url.substring(0, queryIndex);
    }
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
          "default-src 'self' blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; media-src 'self' local-video:; img-src 'self' data: local-video: blob:;"
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
    const val = Math.round(((rate / 4.0) - 1) * 100);
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
      const safeText = String(text || '');
      const safeVoice = String(voice || "zh-CN-XiaoxiaoNeural");

      console.log('[TTS] 正在准备合成:', safeText.substring(0, 20), '语速:', speedRate, '音色:', safeVoice);

      const lib = require('edge-tts-universal');
      // 更加稳健的类查找逻辑，适配不同的模块导出系统
      let CommunicateClass = lib.Communicate;
      if (!CommunicateClass && lib.default) CommunicateClass = lib.default.Communicate;
      if (!CommunicateClass && typeof lib === 'function') CommunicateClass = lib;

      if (!CommunicateClass) {
        throw new Error('无法从 edge-tts-universal 中加载 Communicate 类，请检查依赖安装');
      }

      const communicate = new CommunicateClass(safeText, {
        voice: safeVoice,
        rate: speedRate
      });

      const chunks = [];
      for await (const chunk of communicate.stream()) {
        if (chunk && chunk.type === "audio" && chunk.data) {
          // 彻底确保是 Buffer 类型
          chunks.push(Buffer.from(chunk.data));
        }
      }

      if (chunks.length === 0) {
        throw new Error('TTS 引擎未返回任何音频数据块，请检查网络或音色设置');
      }

      const combinedBuffer = Buffer.concat(chunks);
      console.log('[TTS] 合成成功, 总字节:', combinedBuffer.length);

      fs.writeFileSync(filePath, combinedBuffer);
      return filePath;
    } catch (error) {
      console.error('[TTS] 合成详细错误:', error);
      throw error;
    }
  });

  // 获取字幕对齐数据缓存
  ipcMain.handle('get-speech-timing', async (event, hash) => {
    const ttsCacheDir = path.join(app.getPath('userData'), 'tts_cache');
    const filePath = path.join(ttsCacheDir, `timing_${hash}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  // 保存字幕对齐数据缓存
  ipcMain.handle('save-speech-timing', async (event, hash, timingData) => {
    const ttsCacheDir = path.join(app.getPath('userData'), 'tts_cache');
    if (!fs.existsSync(ttsCacheDir)) {
      fs.mkdirSync(ttsCacheDir, { recursive: true });
    }
    const filePath = path.join(ttsCacheDir, `timing_${hash}.json`);
    fs.writeFileSync(filePath, JSON.stringify(timingData));
    return true;
  });

  // 删除缓存以支持重新处理
  ipcMain.handle('delete-speech-cache', async (event, hash) => {
    const ttsCacheDir = path.join(app.getPath('userData'), 'tts_cache');
    const mp3Path = path.join(ttsCacheDir, `tts_${hash}.mp3`);
    const jsonPath = path.join(ttsCacheDir, `timing_${hash}.json`);

    if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    return true;
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

  // 保存截图
  ipcMain.handle('save-screenshot', async (event, processId, dataUrl) => {
    try {
      const thumbnailDir = path.join(app.getPath('userData'), 'thumbnails');
      if (!fs.existsSync(thumbnailDir)) {
        fs.mkdirSync(thumbnailDir, { recursive: true });
      }

      // 从 data URL 中提取 base64 数据
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // 生成文件名
      const fileName = `thumb_${processId}_${Date.now()}.png`;
      const filePath = path.join(thumbnailDir, fileName);

      // 写入文件
      fs.writeFileSync(filePath, buffer);

      // 更新数据库
      db.updateProcessThumbnail(processId, filePath);

      console.log('[Screenshot] 保存成功:', filePath);
      return filePath;
    } catch (error) {
      console.error('[Screenshot] 保存失败:', error);
      throw error;
    }
  });

  // 更新工序缩略图
  ipcMain.handle('update-process-thumbnail', async (event, id, thumbnailPath) => {
    return db.updateProcessThumbnail(id, thumbnailPath);
  });

  // 字幕设置操作
  ipcMain.handle('get-subtitle-settings', async () => {
    return db.getSubtitleSettings();
  });

  ipcMain.handle('update-subtitle-settings', async (event, settings) => {
    return db.updateSubtitleSettings(settings);
  });
}
