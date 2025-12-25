# 卡拉OK式字幕与音画强同步技术解决方案 (V2 强化版)

本文档补充了持久化存储、GPU加速渲染及复杂交互下的强同步逻辑，旨在彻底解决 KaizenShowcase 项目中的音画不同步问题。

## 1. 核心问题诊断

目前系统存在的音画/字幕不同步主要源于以下几点：
- **计时器偏差**：使用 JavaScript 的 `Date.now()` 进行计时，受 CPU 调度影响产生累计误差。
- **状态不一致**：视频进度、音频进度、字幕进度相互独立，缺乏主时钟。
- **重渲染压力**：React 状态驱动的高频（毫秒级）字幕更新会导致主线程卡顿。

## 2. 核心技术路线

### 2.1 硬件级授时：音频主时钟 (Physical Audio Clock)
- **机制**：由 `<audio>` 元素的 `currentTime` 作为唯一真实的信号源。
- **同步**：视频播放器（VideoPlayer）作为追随者，通过 `requestAnimationFrame` 实时对比视频与音频的时间戳。
- **纠偏**：若偏差 `> 150ms`，强制 `video.currentTime = audio.currentTime`。

### 2.2 离线预计算与持久化 (Pre-computation & Persistence)
- **预计算**：在 TTS 语音生成阶段，同步生成一份“字级时间映射表 (Character Timing Map)”。
- **算法**：采用加权聚类算法，将文本切分为“执行单元”（汉字、单词、数字串、标点），根据总时长动态按权重分配毫秒级起止点。
- **持久化**：将计算好的 JSON 时间表与音频文件（MP3）同步缓存到本地，文件名为 `tts_[hash].json`。二次加载时实现“零计算”直接渲染。

### 2.3 GPU 驱动的渲染引擎 (CSS Variable Offloading)
- **双层文本结构**：
  - **Base Layer**: 灰色文本内容。
  - **Karaoke Layer**: 高亮色文本，覆盖于 Base 之上，通过 `clip-path: inset(0 100% 0 0)` 或 `mask-image` 裁剪。
- **渲染加速**：不再由 React State 驱动每个字的颜色，而是由 JS 实时更新父容器的 CSS 全局变量 `--karaoke-progress-total`。
- **单字级平滑**：每个字的组件监听此变量，根据自己的预计算起止时间，自动在 CSS 层执行平滑的 `width` 过渡。

### 2.4 健壮性保障：Seeking & Interaction
- **跳转同步**：用户拖拽视频进度条时，触发 `onSeeking` 事件，计算进度比例，同步瞬时 `audio.currentTime`，并静默更新 JSON 时间表索引。
- **加载缓冲**：播放前增加 `Ready` 检查机制，确保 `audio` 和 `video` 均处于 `canplaythrough` 状态再统一触发 `play()`。

## 3. 实施细节剖析

### 3.1 文本加权权重表
| 类型 | 权重权重 (Weight) | 说明 |
| :--- | :--- | :--- |
| 中文字符 | 1.0 | 基准时长 |
| 英文单词 | 长度 * 0.4 | 单词越长读得越久 |
| 连续数字 | 长度 * 0.5 | 模拟快速读数 |
| 短标点 (，、) | 0.6 | 模拟轻微停顿 (不占色块，仅占时间) |
| 长标点 (。！？) | 1.2 | 模拟明显停顿 |

## 4. 实施计划 (Roadmap)

| 阶段 | 核心任务 | 涉及模块 |
| :--- | :--- | :--- |
| **Phase 1: 数据层** | 编写 `TimingGenerator` 类，支持 JSON 序列化与本地缓存读写。 | `main.js`, `utils/timing.js` |
| **Phase 2: UI渲染层** | 使用 CSS 变量与 `clip-path` 重构 `SubtitleOverlay`。 | `SubtitleOverlay.jsx`, `App.css` |
| **Phase 3: 同步控制** | 实现 `SyncManager` 逻辑，处理 `requestAnimationFrame` 同步与纠偏。 | `VideoPlayer.jsx` |
| **Phase 4: 预取优化** | 在播放前加入 Loading 状态，确保预计算数据与流媒体就绪。 | `VideoPlayer.jsx` |

## 5. 预期指标
- **音画偏差**：< 50ms。
- **主线程占用**：渲染开销降低 80% (由 GPU 承担)。
- **体验感**：字幕变色与语速完全线性一致，具备 KTV 级视觉。

---
*方案版本：2.0*
*更新日期：2025-12-25*
