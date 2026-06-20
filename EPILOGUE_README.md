# 后日谈 · Ginkgo Engine — 技术文档

> 📂 **文档索引**：[中文 README](README_CN.md) · [编辑器使用指南](编辑器使用指南.md) · [游戏使用指南](显示器使用指南.md) · [English Guides](../../#文档导航)

## 概述

后日谈是《银杏落雨时》主线剧情结束后的 AI 对话模式。玩家扮演「林辰」与角色「文小管」自由聊天。系统使用 DeepSeek API 生成回复，配合 Live2D 角色模型实时渲染。

### 新增功能 (2026-06)

| 功能 | 说明 |
|------|------|
| **多结局感知** | URL 参数传入 endingKey，AI 角色呈现不同态度 |
| **角色档案同步** | 从编辑器导出的 `epilogue_characters.json` 加载角色设定 |
| **对话导出增强** | 同时下载 TXT + 精美 HTML，含对话统计 |
| **选择历史感知** | AI 知道玩家在主游戏中做过哪些关键选择 |
| **多角色架构预留** | 支持加载多个角色档案，为多角色对话做准备 |
| **懒加载兼容** | 分章项目加载方式与主引擎协同 |

---

## 技术栈

| 层 | 技术 |
|---|------|
| 角色渲染 | Live2D Cubism 5 SDK (Core + Framework) |
| AI 对话 | DeepSeek Chat API (streaming) |
| TTS 语音 | Web Speech API (SpeechSynthesisUtterance) |
| 粒子特效 | tsParticles.js (银杏叶飘落) |
| 音频 | Howler.js (BGM 播放) |
| 3D 渲染 | WebGL 2.0 |

---

## 文件结构

```
├── epilogue.html                  # 入口页面
├── EPILOGUE_README.md             # 本文档
├── epilogue_characters.json       # ★ 角色档案（编辑器导出）
├── characters/文小管/
│   └── prompt_文小管.txt          # AI 角色 Prompt（外部文件优先）
├── live2d/
│   ├── core/live2dcubismcore.min.js
│   ├── live2dcubismframework.js
│   ├── models/Haru/               # Haru 角色模型
│   └── shaders/                   # GLSL 着色器 (13 个)
├── js/epilogue/
│   ├── ep-api.js                  # DeepSeek API 调用（含流式 + API Key 加密）
│   ├── ep-engine.js               # 主状态机 + 结局感知 + 角色档案加载
│   ├── ep-ui.js                   # 聊天面板、BBCode、设置、对话导出
│   ├── ep-tts.js                  # 语音合成
│   ├── ep-emotion.js              # 情感检测 → 立绘表情映射
│   ├── ep-memory.js               # 对话记忆（短期 + 长期摘要）
│   ├── ep-effects.js              # 画面演出效果
│   ├── ep-customize.js            # 场景自定义面板
│   ├── ep-live2d.js               # Live2D 渲染适配层
│   └── ep-gaze.js                 # 注视追踪
├── css/
│   ├── gal-core.css               # 主游戏样式
│   └── epilogue.css               # 后日谈样式
├── lhcf/                          # 静态立绘素材
├── bj/                            # 背景素材
└── BGM/                           # 背景音乐
```

---

## 架构

```
浏览器事件
    │
    ▼
┌─ ep-engine.js ──────────────────────────────────────┐
│ 状态机: IDLE → WAITING → THINKING → SPEAKING        │
│                                                     │
│  init()                                             │
│    ├→ readUrlContext()       ★ 读取 ending/choices   │
│    ├→ loadSystemPrompt()     ★ 合并角色档案          │
│    ├→ loadCharacterProfiles() ★ 加载外部档案          │
│    ├→ EpilogueMemory.init()                         │
│    ├→ EpilogueTTS.init()                            │
│    └→ EpilogueUI.init()                             │
│                                                     │
│  sendMessage(text)                                  │
│    ├→ EpilogueAPI.chatStream({...})                 │
│    │   onToken → EpilogueUI.appendToken()            │
│    │   onComplete                                  │
│    │     ├→ EpilogueEmotion.detect() → 表情          │
│    │     ├→ EpilogueUI.updateSprite()               │
│    │     ├→ EpilogueLive2D.setEmotion()             │
│    │     ├→ EpilogueTTS.speak() → 朗读              │
│    │     └→ EpilogueMemory.addTurn() → 记忆          │
│    └→ 回到 IDLE                                     │
└─────────────────────────────────────────────────────┘
```

---

## 新功能详解

### 1. 多结局感知

后日谈通过 URL 参数获取结局信息：

```
epilogue.html?ending=good_ending&choices=[...]
```

**数据来源**：
- `ending` — 主游戏中 `unlockEnding(key, title)` 触发时存储到 `galgame_last_ending`
- `choices` — 主游戏每次做选择时记录到 `galgame_choice_history`（最近 20 条）

**系统 prompt 注入**：

```javascript
function buildEndingContext() {
  // 根据 endingKey 注入不同的结局背景文案
  // good_ending / normal_ending / true_ending 各有专门文案
  // 未匹配的 endingKey 使用通用文案
}
```

**效果**：同一话题在不同结局下，AI 角色会呈现不同的对话态度和记忆。

### 2. 角色档案同步

**编辑器 → 后日谈 数据流**：

```
编辑器 角色档案面板
  ↓ 填写 name/personality/background/speechStyle
导出 JSON (characters 字段)
  ↓ 放置到项目文件夹
epilogue_characters.json
  ↓ ep-engine.js 加载
mergeCharacterProfile(systemPrompt, profile)
  ↓
注入 AI system prompt
```

`mergeCharacterProfile()` 支持两种模式：
- **完整替换**：档案中有 `systemPrompt` 字段时直接替换整个 prompt
- **字段追加**：在现有 prompt 末尾追加性格/背景/说话风格

```javascript
// 示例：epilogue_characters.json
{
  "文小管": {
    "name": "文小管",
    "personality": "内向细腻，说话偏短句……",
    "background": "内蒙古长大，会拉马头琴……",
    "speechStyle": "偶尔用……表示沉默",
    "extraNotes": "怕打雷，喜欢银杏叶"
  },
  "苏晚": {
    "name": "苏晚",
    "personality": "温和坚定，支教老师……",
    "background": "曾在内蒙古支教……"
  }
}
```

### 3. 对话导出增强

点击 📥 导出按钮：
- **TXT 文件**：纯文本记录，含时间戳和对话统计（"你: N 条，文小管: M 条"）
- **HTML 文件**：精美排版页面，深色主题 + 银杏色 UI，玩家消息蓝色左边框，角色消息金色左边框
- 导出完成后屏幕底部弹出确认提示

### 4. 多角色架构预留

引擎已支持加载多个角色档案。`loadCharacterProfiles()` 加载 JSON 中所有角色。当前 UI 只与"文小管"对话，但架构已为多角色切换做好准备：
- `_characterProfiles` 存储所有角色数据
- `mergeCharacterProfile()` 可按需提取特定角色
- 切换对话对象只需重设 system prompt + 切换 Live2D 模型/Sprite

---

## Live2D 子系统

### 渲染管线 (每帧)

```
beginFrameProcess(gl)           # offscreen 管理
  → model.loadParameters()      # 恢复保存的参数
  → motionManager.updateMotion() # 动作插值
  → model.saveParameters()      # 保存参数
  → breath.updateParameters()   # 呼吸 (5 参数)
  → updateMouseTrack()          # 鼠标追踪 (6 参数)
  → updateEyeBlink()            # 眨眼状态机
  → updateLipSync()             # 口型 (TTS 联动)
  → physics.evaluate()          # 头发/衣物物理
  → pose.updateParameters()     # 手臂互斥
  → wind.updateParameters()     # 风系统
  → model.update()              # 顶点变形
  → renderer.drawModel()        # WebGL 绘制
  → endFrameProcess(gl)         # offscreen 清理
```

### 已实现功能

| 功能 | 状态 |
|------|------|
| 模型渲染 (CubismRenderer_WebGL) | ✅ |
| 动作动画 (28 motion 文件) | ✅ |
| 待机循环 (2~3s 间隔自动切换) | ✅ |
| 表情切换 (8 F01-F08) | ✅ |
| 呼吸动画 (5 参数) | ✅ |
| 眨眼（手写状态机） | ✅ |
| 口型同步 (TTS 联动) | ✅ |
| 物理模拟（头发/衣物） | ✅ |
| 风系统（随机微风/阵风） | ✅ |
| 鼠标追踪 (6 参数) | ✅ |
| 触摸支持 | ✅ |
| 点击交互 (TapBody 随机动作) | ✅ |
| HiDPI | ✅ |
| PNG ↔ Live2D 切换 | ✅ |

---

## BBCode 标签系统

AI 回复中可使用以下标签（已通过 system prompt 教给 AI）。

### 文字效果

| 标签 | 效果 | TTS | 表情 |
|------|------|-----|------|
| `[b]文字[/b]` | 加粗 | 朗读 | 影响 |
| `[i]文字[/i]` | 斜体浅色 | 朗读 | 影响 |
| `[big]文字[/big]` | 放大 | 朗读 | 影响 |
| `[small]文字[/small]` | 缩小变灰 | 朗读 | 影响 |
| `[c=red]文字[/c]` | 着色 | 朗读 | 影响 |
| `[inner]内容[/inner]` | 灰色斜体 | **不读** | **不影响** |

### 画面演出 (每段最多 1 个)

| 标签 | 效果 |
|------|------|
| `[flash]` | 闪白 |
| `[shake]` | 画面抖动 |
| `[sepia]` | 深褐滤镜（回忆） |
| `[vignette]` | 暗角聚焦 |
| `[warm]` | 暖色调 |
| `[cool]` | 冷色调 |
| `[dark]` | 变暗 |
| `[blur]` | 模糊 |
| `[bright]` | 变亮 |

---

## 设置面板 (⚙️)

| 项目 | 说明 |
|------|------|
| 打字速度 | 15~120 ms/字 |
| BGM 音量 | 0~100% |
| 语音音量 | 0~100% |
| 角色渲染 | Live2D / 静态立绘 切换 |
| API Key | DeepSeek API Key 管理（浏览器指纹加密存储） |

---

## 场景面板 (🎨)

| 标签 | 内容 |
|------|------|
| 背景 | 场景背景 |
| 音乐 | BGM 试听和切换 |
| 立绘 | 角色立绘选择 |

---

## API 参考

### EpilogueEngine

```javascript
EpilogueEngine.init()                            // 初始化
EpilogueEngine.sendMessage('今天天气真好')        // 发送消息
EpilogueEngine.regenerate()                      // 重新生成回复
EpilogueEngine.reset()                           // 重置对话
EpilogueEngine.getState()                        // 获取状态
EpilogueEngine.getQuickTopics()                  // 获取快捷话题
```

### EpilogueAPI

```javascript
EpilogueAPI.hasKey()                             // 是否已配置 Key
EpilogueAPI.saveKey('sk-xxx')                    // 保存 Key（加密）
EpilogueAPI.getKey()                             // 获取 Key（解密）
EpilogueAPI.chatStream({...})                    // 流式对话
EpilogueAPI.getUsage()                           // 获取 token 用量
EpilogueAPI.resetUsage()                         // 重置用量统计
```

### EpilogueLive2D

```javascript
EpilogueLive2D.init('live2d/models/Haru/Haru.model3.json')
EpilogueLive2D.setEmotion('happy')               // happy|sad|surprised|shy|thinking|angry
EpilogueLive2D.startLipSync()                    // 开始口型
EpilogueLive2D.stopLipSync()                     // 停止口型
EpilogueLive2D.startDialogue()                   // 对话开始（抑制动作音效）
EpilogueLive2D.endDialogue()                     // 对话结束（恢复动作音效）
EpilogueLive2D.destroy()                         // 销毁
EpilogueLive2D.isReady()                         // 是否就绪
```

---

## 启动流程

1. 浏览器加载 `epilogue.html`
2. 显示启动遮罩，点击开始
3. `readUrlContext()` — 读取结局和选择历史参数
4. `loadSystemPrompt()` — 加载外部 Prompt 文件 + 合并角色档案 + 注入结局背景
5. `loadCharacterProfiles()` — 加载 `epilogue_characters.json`
6. 异步初始化 Live2D（非阻塞）
7. 静态 PNG 立绘先显示，Live2D 就绪后自动接管
8. 失败时静默降级到 PNG

---

## 本地运行

```bash
node server.js
# 打开 http://localhost:3000/epilogue.html
# 携带结局: http://localhost:3000/epilogue.html?ending=good_ending
```

> ⚠️ 不能直接用 `file://` 协议——需要 HTTP 服务器加载 JSON/贴图/shader。

---

## 踩坑记录

| 问题 | 根因 | 解决 |
|------|------|------|
| 四只手 | 未加载 Pose → 手臂互斥失效 | `CubismPose.create()` + 每帧 `updateParameters()` |
| 贴图全黑 | 纹理未用 `UNPACK_PREMULTIPLY_ALPHA` | 对齐 Demo 做法 |
| 贴图错位 | 误将已归一化 UV 再除以贴图尺寸 | 直接使用原始 UV |
| 贴图倒置 | WebGL 默认不翻转 Y | `UNPACK_FLIP_Y_WEBGL = true` |
| Motion 崩溃 | 未调 `setEffectIds([], [])` | 创建后立即调用传入空数组 |
| 动作静止 | `updateMotion` 只读不写 | 加 load→update→save 循环 |
| 帧率卡顿 | 每帧 new Float32Array(73 份) | 池化复用 |
| Canvas 不显示 | `width:auto` 在 img 隐藏后塌为 0 | JS 根据高度反推宽度 |
| pointer-events:none | CSS 屏蔽所有点击 | JS 覆盖为 auto |
| 头部追踪无限旋转 | `addParameterValueById` 误解为 set | 改为增量 add |
| 说话时切 idle | `isSpeaking` 未检查 | `tryIdle()` 开头守卫 |
| 高分屏模糊 | canvas 未乘 DPR | `canvas.width × devicePixelRatio` |
| Cubism 4 vs 5 差异 | API 从 OOP 变为命名空间 | 适配 Cubism 5 Core |

---

## 依赖说明

| 依赖 | 来源 | 说明 |
|------|------|------|
| `live2dcubismcore.min.js` | Live2D Cubism 5 SDK | 必须下载 |
| `live2dcubismframework.js` | SDK Framework/src/ esbuild | 已包含 |
| `live2d/shaders/` | SDK Framework/Shaders/WebGL/ | 13 个 .vert/.frag |
| tsParticles | CDN | 银杏叶粒子 |
| Font Awesome 6 | CDN | 图标 |
| Animate.css | CDN | 动画 |
| Noto Serif SC | Google Fonts CDN | 中文字体 |

---

## 许可证

- Live2D Cubism SDK: 年收入 < 1000 万日元的个人开发者免费使用。详见 [Live2D EULA](https://www.live2d.com/eula/)
- Haru 角色模型: Live2D 官方免费示例模型
