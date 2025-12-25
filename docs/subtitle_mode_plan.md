# AI讲解字幕模式升级改善清单

## 1. 核心功能变更
- [x] **新增模式切换**：在"AI讲解词/字幕"区域增加"整合模式"与"改善前/后分离模式"的切换按钮。
- [x] **双输入框支持**：在分离模式下，提供两个独立的讲解词输入框。
  - 输入框A：对应改善前视频播放时段。
  - 输入框B：对应改善后视频播放时段。
- [x] **分段播放逻辑**：
  - 播报改善前台词时：改善后视频自动暂停，改善前视频播放。
  - 播报改善后台词时：改善前视频自动暂停，改善后视频播放。
- [x] **UI联动切换**：在全屏/大屏幕播放模式下，字幕播报重心转移时，通过 `window.onSubtitleModeChange` 回调通知父组件（已预留接口）。

## 2. 数据库与API层 (Backend)
- [x] `processes` 表增加 `subtitle_mode` (TEXT: integrated | separate)。
- [x] `processes` 表增加 `subtitle_after` (TEXT) 存储改善后的讲解词。
- [x] 更新 `DatabaseManager` 的保存与读取逻辑。
- [x] 更新 `main.js` 中的 TTS 处理逻辑，支持根据模式生成两段语音（通过合并文本 + 停顿符号实现）。

## 3. 前端逻辑层 (Frontend)
- [x] **State管理**：在 `ProcessEditor` 中增加对模式 (`subtitleMode`) 和分离字幕 (`subtitleAfter`) 的状态维护。
- [x] **播放器控制**：修改 `ComparePlayer` 的 `handleTimeUpdate` 监听，根据当前播报的时间锚点强制控制视频的 `play/pause`。
- [x] **样式更新**：在 `App.css` 中增加分离模式下的输入框样式（`.subtitle-mode-selector`、`.mode-tab`、`.separate-subtitles`、`.sub-input-box` 等）。

## 4. 自动化与优化
- [x] **自动切换Tab**：通过 `window.onSubtitleModeChange` 回调实时通知 UI 切换状态（接口已实现，父组件可按需监听）。
- [x] **兼容性处理**：旧有的单字幕项目默认使用 `integrated` 模式，平滑过渡。

---

## 实现说明

### TTS 合并策略
在分离模式下，改善前和改善后的讲解词会被合并为一个文本，中间添加停顿符号 `……`：
```javascript
textToGenerate = `${currentProc.subtitle_text || ''} …… ${currentProc.subtitle_after || ''}`;
```

### 分割点检测
在 `ComparePlayer.handleTimeUpdate` 中，通过检测 `timingData` 中第一个包含 `subtitle_after` 开头字符的条目来确定分割时间点：
```javascript
const afterTextStartIdx = timingData.findIndex(t => t.text.includes(currentProc.subtitle_after?.substring(0, 3) || 'NOTFOUND'));
const splitTime = afterTextStartIdx >= 0 ? timingData[afterTextStartIdx].startTime : 9999;
```

### 视频控制逻辑
- 当 `currentElapsed < splitTime` 时：播放改善前视频，暂停改善后视频
- 当 `currentElapsed >= splitTime` 时：播放改善后视频，暂停改善前视频

---

**状态**：✅ 全部完成 (2025-12-25)

## 待实施的修复方案 (Pending Fixes) - Recorded on 2025-12-25

### 1. 修复分离模式下的 UI Tab 切换
由于 `App.jsx` 中未实现 `onSubtitleModeChange` 的监听，且原有代码中缺失 Tab 按钮，需要在 `ComparePlayer.jsx` 中直接实现：
- **添加状态**: `const [activeTab, setActiveTab] = useState('before');`
- **添加 UI**: 在控制栏（语速选择器后）添加 [改善前][改善后] 两个按钮，绑定 `activeTab`。
- **逻辑联动**: 
  - 在分离模式的自动切换逻辑中，调用 `setActiveTab('after')` 或 `before`。
  - 工序切换时重置为 `before`。

### 2. 优化分离模式的智能同步逻辑 (Intelligent Sync)
解决“语音快视频慢”或“视频快语音慢”导致的不同步或循环错误。

**核心原则**:
- **前半段 (改善前)**:
  - 如果 **语音先讲完** (到达分割点)，但视频还没播完这一轮 -> **暂停语音**，让视频继续自然播放直到终点 (不要循环)。
  - 当视频到达终点时 -> 恢复语音，切换到后半段。
  - 如果 **语音没讲完**，视频播完了 -> 视频循环播放。

- **后半段 (改善后)**:
  - 如果 **语音先讲完**，视频还没播完 -> 视频继续播放直到终点。
  - 只有当 **语音结束 && 视频播完** 时，才判定当前工序完成 (进入下一工序)。
  - 如果 **语音没讲完**，视频播完了 -> 视频循环播放。

**实现细节**:
- 引入 `hasSwitchedToAfterRef` 来标记是否已安全完成前半段的视频播放。
- 在 `handleTimeUpdate` 中检测：
  ```javascript
  // 阻挡逻辑
  if (audioReachedSplitPoint && !videoFinished && !hasSwitched) {
      audio.pause(); // 等待视频
  } else if (audioReachedSplitPoint && videoFinished) {
      hasSwitched = true;
      audio.play(); // 恢复
  }
  ```
