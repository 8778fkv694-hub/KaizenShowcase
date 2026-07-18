const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const DatabaseManager = require('./database');
// 我们将根据需要在 ipcHandler 中按需 require edge-tts-universal

let mainWindow;
let db;

// 仅开发环境输出调试日志，生产环境静默（错误/警告仍走 console.error/warn）
const dlog = (...args) => {
  if (!app.isPackaged) console.log(...args);
};

// TTS 缓存内容寻址、可被多个工序共享，无法按工序删除关联项，
// 因此改用启动时按文件年龄兜底清理，避免无限增长
const MAX_TTS_CACHE_AGE_DAYS = 30;
function cleanupOldTtsCache() {
  try {
    const ttsCacheDir = path.join(app.getPath('userData'), 'tts_cache');
    if (!fs.existsSync(ttsCacheDir)) return;
    const cutoff = Date.now() - MAX_TTS_CACHE_AGE_DAYS * 24 * 60 * 60 * 1000;
    let cleaned = 0;
    for (const file of fs.readdirSync(ttsCacheDir)) {
      const filePath = path.join(ttsCacheDir, file);
      try {
        if (fs.statSync(filePath).mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch { /* 忽略单个文件清理失败 */ }
    }
    if (cleaned > 0) dlog(`[TTS] 已清理 ${cleaned} 个超过 ${MAX_TTS_CACHE_AGE_DAYS} 天的缓存文件`);
  } catch (e) {
    console.error('[TTS] 缓存清理失败:', e);
  }
}

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
    try {
      let url = request.url.replace('local-video://', '');
      // 去掉查询参数（如 ?t=xxx）
      const queryIndex = url.indexOf('?');
      if (queryIndex !== -1) {
        url = url.substring(0, queryIndex);
      }
      const decodedPath = decodeURIComponent(url);

      // 防御纵深：拒绝空字节、非绝对路径、不存在或非常规文件的请求
      // 注意：合法路径可能含空格（如「改善对比」目录），只拒空字节、不拒空格
      if (!decodedPath || decodedPath.includes('\0')) {
        console.warn('[Protocol] 拒绝非法路径');
        return callback({ error: -6 }); // FILE_NOT_FOUND
      }
      const normalized = path.normalize(decodedPath);
      if (!path.isAbsolute(normalized)) {
        console.warn('[Protocol] 拒绝相对路径:', normalized);
        return callback({ error: -6 });
      }
      let stat;
      try {
        stat = fs.statSync(normalized);
      } catch {
        console.warn('[Protocol] 文件不存在:', normalized);
        return callback({ error: -6 });
      }
      if (!stat.isFile()) {
        console.warn('[Protocol] 非常规文件:', normalized);
        return callback({ error: -6 });
      }

      callback({ path: normalized });
    } catch (e) {
      console.error('[Protocol] 处理失败:', e);
      callback({ error: -2 }); // FAILED
    }
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

  // 清理过期 TTS 缓存
  cleanupOldTtsCache();

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
  // 设置防污染公网 DNS，避免 Edge TTS 在国内遭遇 DNS 劫持和域名污染
  try {
    const dns = require('dns');
    dns.setServers(['223.5.5.5', '119.29.29.29', '8.8.8.8', '1.1.1.1']);
    dlog('[TTS] 防污染公网 DNS 解析器初始化成功');
  } catch (dnsErr) {
    console.warn('[TTS] 初始化防污染 DNS 失败:', dnsErr.message);
  }

  // 项目操作
  ipcMain.handle('create-project', async (event, name, description, ownerName) => {
    return db.createProject(name, description, ownerName);
  });

  ipcMain.handle('get-all-projects', async () => {
    return db.getAllProjects();
  });

  ipcMain.handle('get-project', async (event, id) => {
    return db.getProject(id);
  });

  ipcMain.handle('update-project', async (event, id, name, description, narrationSpeed) => {
    dlog('[IPC] 更新项目:', id, '语速:', narrationSpeed);
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

  // 自动嗅探本地 VPN 代理端口，确保各种网络环境下 Node.js 都能连上
  async function autoDetectProxy() {
    // 1. 优先读取系统环境变量代理
    const envProxy = process.env.HTTP_PROXY || process.env.http_proxy || process.env.HTTPS_PROXY || process.env.https_proxy;
    if (envProxy) return envProxy;

    // 2. 如果没有环境变量，嗅探本地常见 VPN 代理端口（Clash, Shadowsocks, v2ray, NekoRay 等）
    const commonPorts = [7890, 1080, 10809, 10808, 1082, 1081, 20811];
    const net = require('net');

    const probe = (port) => {
      return new Promise((resolve) => {
        const socket = net.connect({ host: '127.0.0.1', port, timeout: 80 });
        socket.on('connect', () => {
          socket.end();
          resolve('http://127.0.0.1:' + port);
        });
        socket.on('error', () => resolve(null));
        socket.on('timeout', () => {
          socket.destroy();
          resolve(null);
        });
      });
    };

    try {
      const results = await Promise.all(commonPorts.map(probe));
      const activeProxy = results.find(p => p !== null);
      if (activeProxy) {
        dlog('[TTS] 自动嗅探到本地可用代理服务:', activeProxy);
      }
      return activeProxy || undefined;
    } catch (err) {
      return undefined;
    }
  }

  // TTS 语音合成：在线服务子函数（完全原生的 WebSocket 客户端，带防劫持、代理穿透与 Sec-MS-GEC 安全校验）
  async function synthesizeOnline(safeText, voice, speedRate, ttsCacheDir, hash) {
    const fileName = "tts_online_" + hash + ".mp3";
    const filePath = path.join(ttsCacheDir, fileName);
    if (fs.existsSync(filePath)) {
      return filePath;
    }

    const systemProxy = await autoDetectProxy();
    const WebSocket = require('ws');
    const { createHash, randomBytes } = require('crypto');

    // 1. 生成 Sec-MS-GEC Token
    const generateSecMsGecToken = () => {
      const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
      const WIN_EPOCH = 11644473600;
      let ticks = Date.now() / 1000;
      ticks += WIN_EPOCH;
      ticks -= ticks % 300;
      ticks *= 10000000;
      const strToHash = `${Math.floor(ticks)}${TRUSTED_CLIENT_TOKEN}`;
      return createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();
    };

    // 2. 生成 MUID
    const muid = randomBytes(16).toString('hex').toUpperCase();
    const gec = generateSecMsGecToken();
    const gecVersion = '1-143.0.3650.75';
    const trustedClientToken = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

    const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${trustedClientToken}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${gecVersion}`;

    return new Promise((resolve, reject) => {
      const wsOptions = {
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
          'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
          'Cookie': `muid=${muid};`,
        }
      };

      if (systemProxy) {
        try {
          const HttpsProxyAgent = require('https-proxy-agent');
          const agentClass = typeof HttpsProxyAgent === 'function' ? HttpsProxyAgent : HttpsProxyAgent.HttpsProxyAgent;
          wsOptions.agent = new agentClass(systemProxy);
          dlog('[TTS] 已成功启用代理隧道进行合成:', systemProxy);
        } catch (proxyErr) {
          console.warn('[TTS] 加载代理 Agent 失败:', proxyErr.message);
        }
      }

      dlog('[TTS] 正在建立 WebSocket 连接:', url);
      const ws = new WebSocket(url, wsOptions);
      const audioChunks = [];
      let hasError = false;

      ws.on('open', () => {
        dlog('[TTS] WebSocket 已连通，正在发送请求数据包...');
        const timestamp = new Date().toString();
        
        // 发送配置
        const configMsg = `X-Timestamp:${timestamp}\r\n` +
                          `Content-Type:application/json; charset=utf-8\r\n` +
                          `Path:speech.config\r\n\r\n` +
                          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`;
        ws.send(configMsg);

        // 发送 SSML 合成文本
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='${voice}'><prosody rate='${speedRate}' volume='+0%' pitch='+0Hz'>${safeText}</prosody></voice></speak>`;
        const requestId = randomBytes(16).toString('hex').toUpperCase();
        const requestMsg = `X-RequestId:${requestId}\r\n` +
                           `Content-Type:application/ssml+xml\r\n` +
                           `X-Timestamp:${timestamp}\r\n` +
                           `Path:ssml\r\n\r\n` +
                           `${ssml}`;
        ws.send(requestMsg);
      });

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          try {
            const headerLength = data.readInt16BE(0);
            const audioPayload = data.slice(2 + headerLength);
            if (audioPayload.length > 0) {
              audioChunks.push(audioPayload);
            }
          } catch (err) {
            console.error('[TTS] 解析二进制音频包异常:', err);
          }
        } else {
          const textMsg = data.toString('utf8');
          if (textMsg.includes('Path:turn.end')) {
            dlog('[TTS] 收到 turn.end，音频接收完毕，准备写入磁盘');
            ws.close();
          }
        }
      });

      ws.on('error', (err) => {
        console.error('[TTS] WebSocket 连接发生错误:', err.message || err);
        hasError = true;
        reject(err);
      });

      ws.on('close', (code, reason) => {
        dlog(`[TTS] WebSocket 连接断开，代码: ${code}, 原因: ${reason.toString()}`);
        if (hasError) return;
        if (audioChunks.length === 0) {
          reject(new Error('未从服务器收到任何音频片段，请检查网络或音色支持情况'));
          return;
        }

        try {
          const combinedBuffer = Buffer.concat(audioChunks);
          fs.writeFileSync(filePath, combinedBuffer);
          dlog('[TTS] 在线合成音频文件保存成功:', filePath);
          resolve(filePath);
        } catch (writeErr) {
          reject(writeErr);
        }
      });

      // 10秒超时退出
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.terminate();
          reject(new Error('TTS 合成超时 (10秒)，请检查代理或网络解析'));
        }
      }, 10000);
    });
  }

  // TTS 语音合成：本地离线服务子函数
  async function synthesizeLocal(safeText, ttsCacheDir, hash, activeVoice = 'Tingting') {
    if (process.platform === 'darwin') {
      const fallbackFileName = "tts_local_" + hash + ".m4a";
      const fallbackFilePath = path.join(ttsCacheDir, fallbackFileName);
      if (fs.existsSync(fallbackFilePath)) {
        return fallbackFilePath;
      }

      const { execFile } = require('child_process');
      await new Promise((resolve, reject) => {
        // 优先使用用户选择的本地发音人（若传入的是在线音色名如 Xiaoxiao 则 say 命令会报错，此时进入 catch 回退到 Tingting）
        execFile('say', ['-v', activeVoice, safeText, '-o', fallbackFilePath], (err) => {
          if (err) {
            dlog('[TTS] 尝试使用本地音色 ' + activeVoice + ' 失败，回退至 Tingting...');
            execFile('say', ['-v', 'Tingting', safeText, '-o', fallbackFilePath], (err2) => {
              if (err2) {
                dlog('[TTS] 回退 Tingting 也失败，尝试系统默认音色...');
                execFile('say', [safeText, '-o', fallbackFilePath], (err3) => {
                  if (err3) reject(err3);
                  else resolve();
                });
              } else {
                resolve();
              }
            });
          } else {
            resolve();
          }
        });
      });
      return fallbackFilePath;
    } else if (process.platform === 'win32') {
      const fallbackFileName = "tts_local_" + hash + ".wav";
      const fallbackFilePath = path.join(ttsCacheDir, fallbackFileName);
      if (fs.existsSync(fallbackFilePath)) {
        return fallbackFilePath;
      }

      // 通过 PowerShell 调用 System.Speech 离线生成 WAV 文件。
      // PS 双引号字符串里 ` 是转义符、$ 会变量插值——必须先转义 ` 再转义 " 和 $，
      // 否则字幕文本含这些字符时轻则合成失败、重则被当命令解释
      const escapedText = safeText
        .replace(/`/g, '``')
        .replace(/"/g, '`"')
        .replace(/\$/g, '`$');
      const psCommand = "Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.SetOutputToWaveFile('" + fallbackFilePath + "'); try { $synth.SelectVoice('" + activeVoice + "') } catch {}; $synth.Speak(\"" + escapedText + "\"); $synth.Dispose();";

      const { exec } = require('child_process');
      await new Promise((resolve, reject) => {
        exec("powershell -Command \"" + psCommand + "\"", (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return fallbackFilePath;
    } else {
      throw new Error('不支持当前操作系统的本地离线语音合成');
    }
  }

  ipcMain.handle('generate-speech', async (event, text, voice = "zh-CN-XiaoxiaoNeural", rate = 5.0, forceRegenerate = false) => {
    if (!text) return null;

    // 把 UI 的「字/秒」语速换算成 edge-tts 的相对百分比。
    // edge-tts 的 rate 是相对默认语速的增减量，这里以 4.0 字/秒为 0% 基准（经验校准值）：
    //   rate=4 → +0%，rate=5 → +25%，rate=8 → +100%。
    const val = Math.round(((rate / 4.0) - 1) * 100);
    const speedRate = (val >= 0 ? '+' : '') + val + '%';

    const ttsCacheDir = path.join(app.getPath('userData'), 'tts_cache');
    if (!fs.existsSync(ttsCacheDir)) {
      fs.mkdirSync(ttsCacheDir, { recursive: true });
    }

    // 从数据库获取当前的配音引擎与发音人设置
    const subtitleSettings = db.getSubtitleSettings();
    const ttsEngine = (subtitleSettings && subtitleSettings.tts_engine) || 'local';
    const activeVoice = (subtitleSettings && subtitleSettings.tts_voice) || voice || 'zh-CN-XiaoxiaoNeural';

    const hash = crypto.createHash('md5').update(text + "_" + activeVoice + "_" + speedRate).digest('hex');
    const safeText = String(text || '');

    // 强制重生成时清除对应的缓存文件
    if (forceRegenerate) {
      try {
        const localFileName = process.platform === 'darwin' ? "tts_local_" + hash + ".m4a" : "tts_local_" + hash + ".wav";
        const localPath = path.join(ttsCacheDir, localFileName);
        const onlinePath = path.join(ttsCacheDir, "tts_online_" + hash + ".mp3");
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        if (fs.existsSync(onlinePath)) fs.unlinkSync(onlinePath);
      } catch (e) {
        dlog('[TTS] 缓存文件清理失败:', e.message);
      }
    }

    // 缓存命中检查
    if (!forceRegenerate) {
      const localFileName = process.platform === 'darwin' ? "tts_local_" + hash + ".m4a" : "tts_local_" + hash + ".wav";
      const localPath = path.join(ttsCacheDir, localFileName);
      const onlinePath = path.join(ttsCacheDir, "tts_online_" + hash + ".mp3");

      // 命中即触摸 mtime：30 天老化按「最近使用」而非「生成时间」计，
      // 防止常用配音被清后断网环境无法在线重合成（回退本地会中途变声）
      const touchAndReturn = (p, label) => {
        dlog(`[TTS] 命中${label}缓存:`, p);
        try {
          const now = new Date();
          fs.utimesSync(p, now, now);
        } catch { /* 触摸失败不影响返回缓存 */ }
        return p;
      };
      if (ttsEngine === 'local' && fs.existsSync(localPath)) {
        return touchAndReturn(localPath, '本地离线');
      } else if (ttsEngine === 'online' && fs.existsSync(onlinePath)) {
        return touchAndReturn(onlinePath, '在线');
      }
    }

    if (ttsEngine === 'local') {
      // 本地优先模式
      try {
        dlog('[TTS] 本地默认模式：正在本地合成...');
        return await synthesizeLocal(safeText, ttsCacheDir, hash, activeVoice);
      } catch (localError) {
        console.error('[TTS] 本地离线合成失败，尝试回退在线合成:', localError.message || localError);
        try {
          return await synthesizeOnline(safeText, activeVoice, speedRate, ttsCacheDir, hash);
        } catch (onlineError) {
          console.error('[TTS] 在线和本地合成均已失败:', onlineError.message || onlineError);
          throw onlineError;
        }
      }
    } else {
      // 在线优先模式
      try {
        dlog('[TTS] 在线首选模式：正在在线合成...');
        return await synthesizeOnline(safeText, activeVoice, speedRate, ttsCacheDir, hash);
      } catch (onlineError) {
        console.error('[TTS] 在线合成失败，尝试回退本地离线合成:', onlineError.message || onlineError);
        try {
          return await synthesizeLocal(safeText, ttsCacheDir, hash, activeVoice);
        } catch (localError) {
          console.error('[TTS] 在线和本地合成均已失败:', localError.message || localError);
          throw localError;
        }
      }
    }
  });

  // 注：曾有 get/save-speech-timing 与 delete-speech-cache 三个 IPC，
  // 字幕时间轴改为运行时 generateTimingMap 实算、强制重生成改由 generate-speech
  // 自带 forceRegenerate 后，渲染进程已无调用方，作为死代码移除。

  ipcMain.handle('delete-process', async (event, id) => {
    return db.deleteProcess(id);
  });

  ipcMain.handle('update-process-order', async (event, id, order) => {
    return db.updateProcessOrder(id, order);
  });

  ipcMain.handle('get-stage-total-time-saved', async (event, stageId) => {
    return db.getStageTotalTimeSaved(stageId);
  });

  ipcMain.handle('get-global-summary', async () => {
    return db.getGlobalSummary();
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

      dlog('[Screenshot] 保存成功:', filePath);
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

  // 应用设置操作
  ipcMain.handle('get-app-settings', async () => {
    return db.getAppSettings();
  });

  ipcMain.handle('update-app-settings', async (event, settings) => {
    return db.updateAppSettings(settings);
  });

  // 导入/导出项目
  ipcMain.handle('select-export-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择导出目录',
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('select-import-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择导入目录',
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('export-projects', async (event, { projectIds, exportDir }) => {
    try {
      const exportPath = path.join(exportDir, `Kaizen_Export_${Date.now()}`);
      if (!fs.existsSync(exportPath)) {
        fs.mkdirSync(exportPath, { recursive: true });
      }

      const mediaPath = path.join(exportPath, 'media');
      const thumbsPath = path.join(exportPath, 'thumbnails');
      fs.mkdirSync(mediaPath, { recursive: true });
      fs.mkdirSync(thumbsPath, { recursive: true });

      const exportData = [];
      let fileSeq = 0; // 单调递增序号，保证同次导出内文件名唯一（避免同毫秒碰撞）

      for (const id of projectIds) {
        const project = db.getFullProjectData(id);
        if (!project) continue;

        // 处理媒体文件路径并进行物理复制
        for (const stage of project.stages) {
          if (stage.before_video_path) {
            const fileName = `video_${fileSeq++}_${path.basename(stage.before_video_path)}`;
            const destPath = path.join(mediaPath, fileName);
            try {
              fs.copyFileSync(stage.before_video_path, destPath);
              stage.before_video_path = path.join('media', fileName); // 转为相对路径
            } catch (e) { console.error('复制视频失败:', e); }
          }
          if (stage.after_video_path) {
            const fileName = `video_${fileSeq++}_${path.basename(stage.after_video_path)}`;
            const destPath = path.join(mediaPath, fileName);
            try {
              fs.copyFileSync(stage.after_video_path, destPath);
              stage.after_video_path = path.join('media', fileName);
            } catch (e) { console.error('复制视频失败:', e); }
          }

          for (const proc of stage.processes) {
            if (proc.thumbnail_path) {
              const fileName = `thumb_${fileSeq++}_${path.basename(proc.thumbnail_path)}`;
              const destPath = path.join(thumbsPath, fileName);
              try {
                fs.copyFileSync(proc.thumbnail_path, destPath);
                proc.thumbnail_path = path.join('thumbnails', fileName);
              } catch (e) { console.error('复制缩略图失败:', e); }
            }
          }
        }
        exportData.push(project);
      }

      fs.writeFileSync(path.join(exportPath, 'data.json'), JSON.stringify(exportData, null, 2));
      return { success: true, path: exportPath };
    } catch (error) {
      console.error('导出失败:', error);
      throw error;
    }
  });

  // 数据库备份恢复（backupDatabase 每次启动滚动备份，这里补上「恢复」入口）
  ipcMain.handle('list-db-backups', async () => {
    const backupDir = path.join(app.getPath('userData'), 'db_backups');
    if (!fs.existsSync(backupDir)) return [];
    return fs.readdirSync(backupDir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => {
        const stat = fs.statSync(path.join(backupDir, f));
        return { fileName: f, size: stat.size, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  });

  ipcMain.handle('restore-db-backup', async (event, fileName) => {
    const backupDir = path.join(app.getPath('userData'), 'db_backups');
    // 只接受该目录下的裸文件名，防路径穿越
    const safeName = path.basename(String(fileName));
    const backupPath = path.join(backupDir, safeName);
    if (safeName !== fileName || !fs.existsSync(backupPath)) {
      throw new Error('备份文件不存在');
    }

    const dbPath = path.join(app.getPath('userData'), 'improvement.db');
    // 恢复前把当前库另存一份，误恢复也能救回来
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, path.join(backupDir, `prerestore_${stamp}.db`));
    }

    db.close();
    fs.copyFileSync(backupPath, dbPath);
    // 重启应用以干净地重新初始化数据库连接和渲染进程状态
    app.relaunch();
    app.exit(0);
  });

  // 视频导出（对比讲解视频）
  ipcMain.handle('select-video-export-path', async (event, defaultFileName) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出对比视频',
      defaultPath: defaultFileName,
      filters: [{ name: 'MP4 视频', extensions: ['mp4'] }],
    });
    return result.canceled ? null : result.filePath;
  });

  // segments 数组：单工序传 1 段，全局模式按工序顺序传多段（主进程逐段导出后拼接）
  ipcMain.handle('export-compare-video', async (event, { segments, outputPath }) => {
    const { exportStageCompareVideo, ExportCancelledError } = require('./videoExport');
    const sender = event.sender;
    try {
      return await exportStageCompareVideo({ segments, outputPath }, (percent) => {
        if (!sender.isDestroyed()) sender.send('export-video-progress', percent);
      });
    } catch (error) {
      if (error instanceof ExportCancelledError) {
        dlog('[VideoExport] 用户取消导出');
      } else {
        console.error('[VideoExport] 导出失败:', error);
      }
      throw error;
    }
  });

  ipcMain.handle('cancel-video-export', async () => {
    const { cancelCurrentExport } = require('./videoExport');
    cancelCurrentExport();
    return true;
  });

  ipcMain.handle('import-projects', async (event, { importDir, mode }) => {
    try {
      const dataFile = path.join(importDir, 'data.json');
      if (!fs.existsSync(dataFile)) {
        throw new Error('所选目录不含 data.json');
      }

      const exportData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      const userDataPath = app.getPath('userData');
      const localMediaPath = path.join(userDataPath, 'imported_media');
      const localThumbsPath = path.join(userDataPath, 'thumbnails'); // 复用原有的 thumbnails 目录

      if (!fs.existsSync(localMediaPath)) fs.mkdirSync(localMediaPath, { recursive: true });
      if (!fs.existsSync(localThumbsPath)) fs.mkdirSync(localThumbsPath, { recursive: true });

      for (const project of exportData) {
        // 重写路径为本地绝对路径
        for (const stage of project.stages) {
          if (stage.before_video_path) {
            const src = path.join(importDir, stage.before_video_path);
            const fileName = path.basename(stage.before_video_path);
            const dest = path.join(localMediaPath, fileName);
            if (fs.existsSync(src)) {
              fs.copyFileSync(src, dest);
              stage.before_video_path = dest;
            }
          }
          if (stage.after_video_path) {
            const src = path.join(importDir, stage.after_video_path);
            const fileName = path.basename(stage.after_video_path);
            const dest = path.join(localMediaPath, fileName);
            if (fs.existsSync(src)) {
              fs.copyFileSync(src, dest);
              stage.after_video_path = dest;
            }
          }

          for (const proc of stage.processes) {
            if (proc.thumbnail_path) {
              const src = path.join(importDir, proc.thumbnail_path);
              const fileName = path.basename(proc.thumbnail_path);
              const dest = path.join(localThumbsPath, fileName);
              if (fs.existsSync(src)) {
                fs.copyFileSync(src, dest);
                proc.thumbnail_path = dest;
              }
            }
          }
        }
        db.importProjectData(project, mode);
      }

      return { success: true };
    } catch (error) {
      console.error('导入失败:', error);
      throw error;
    }
  });
}
