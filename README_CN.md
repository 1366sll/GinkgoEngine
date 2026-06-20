# 🍂 Ginkgo Engine · 开源 Web Galgame 引擎

Ginkgo Engine 是一个**零依赖、纯 Web** 的视觉小说引擎。你只需要一个浏览器和一个文本编辑器，就能创作、测试和发布你自己的 Galgame。引擎得名于首发项目《银杏落雨时》中贯穿始终的银杏意象——象征着记忆、时间与温柔的力量。

---

## 目录

1. [文档导航](#文档导航)
2. [快速开始](#快速开始)
3. [功能特性](#功能特性)
4. [文件结构](#文件结构)
5. [如何创作你自己的游戏](#如何创作你自己的游戏)
6. [JSON 项目格式](#json-项目格式)
7. [AI 后日谈配置](#ai-后日谈配置)
8. [部署发布](#部署发布)
9. [技术栈](#技术栈)
10. [许可证](#许可证)

---

## 文档导航

| 文档 | 说明 |
|------|------|
| 📝 **[编辑器使用指南](编辑器使用指南.md)** | 剧本编辑器的完整操作手册（23 章） |
| 🎮 **[游戏使用指南](显示器使用指南.md)** | 游戏播放器的玩家操作手册 |
| 💬 **[后日谈技术文档](EPILOGUE_README.md)** | AI 后日谈架构、API 参考、Live2D 渲染管线 |
| 🌐 **[English README](README.md)** | README in English |

> 英文副本：[Editor Guide](Editor_Guide_EN.md) · [Player Guide](Player_Guide_EN.md) · [Epilogue Docs](EPILOGUE_README_EN.md)

---

## 快速开始

**3 步启动：**

```bash
# 1. 启动本地服务器
node server.js

# 2. 打开浏览器
# 游戏播放器: http://localhost:3000
# 剧本编辑器: http://localhost:3000/editor.html
# AI 后日谈:  http://localhost:3000/epilogue.html

# 3. 在游戏标题画面 → 设置 → 项目管理 → 加载项目文件
# 选择 demo-project.json 即可体验引擎功能演示
```

> **需要 Node.js**（仅用于本地开发服务器）。部署到线上后不需要 Node.js——只需静态文件托管。

---

## 功能特性

### 🎮 核心引擎

| 功能 | 说明 |
|------|------|
| 📝 JSON 驱动 | 所有剧情、资源、分支全部由 JSON 定义，无需编程 |
| 🎨 BBCode 标记 | 文字颜色、斜体、粗体、大小、震动等效果 |
| 👥 多立绘系统 | 同一场景最多 3 个角色同屏，各自可调位置/透明/呼吸动画 |
| 💾 存档系统 | 10 个手动存档位 + 快速存档 + 自动存档 |
| ⚡ 自适应阅读速度 | 引擎自动学习玩家的阅读节奏，动态调整文字显示速度 |
| 📦 懒加载 | 长篇项目可分章导出，引擎自动后台加载后续章节 |
| 🔗 存档分享码 | 将游戏状态压缩为短码 + QR 码，分享给其他玩家跳转 |
| 🎬 演出效果 | 震动、白闪、暗角、电影黑条、暖/冷色调、模糊等 15+ 滤镜 |
| 🌿 粒子系统 | 银杏叶飘落粒子（可自定义 SVG 形状） |
| 🎥 视频/CG/语音 | 支持 MP4 视频、全屏 CG 插画、角色配音 |
| 🔀 分支选项 | 玩家选择驱动剧情分支 |
| 🔧 条件跳转 | 变量驱动的自动分支（好感度判定等） |
| 📖 章节系统 | 章节过渡动画、章节选择、锁定/解锁 |
| 🎮 手柄支持 | Xbox / PlayStation 手柄（Gamepad API） |
| ⌨️ 快捷键 | 空格/Enter 继续，Ctrl 快进，Alt 自动，F5 存档… |
| 🖱️ 右键菜单 | 存档/读档/分享/设置/返回标题 一键操作 |
| 🌐 PWA 离线 | Service Worker 缓存，可安装到桌面，离线游玩 |

### 📝 内置编辑器

| 功能 | 说明 |
|------|------|
| 🖼️ 实时预览 | 选中场景即显示游戏画面效果 |
| 🤖 AI 协同写作 | 选中对白 → 选风格 → AI 改写润色（需要 DeepSeek Key） |
| 🗺️ 流程图 | 交互式路线图可视化，拖拽平移/滚轮缩放 |
| ⏪ 撤销/重做 | Ctrl+Z / Ctrl+Y，支持最近 50 步 |
| 🔍 项目诊断 | 导出前自动检查：越界跳转、孤立场景、缺失资源 |
| 🎭 角色档案 | 设定角色 personality/background/speechStyle，自动同步到后日谈 AI |
| ☁️ ImgBB 图床 | 批量上传图片到云端，导出 JSON 自动替换为 CDN 链接 |
| 📦 分章导出 | 按章节分割 JSON，配合引擎懒加载模式 |
| 🎬 画面效果 | 可视化勾选滤镜/震动/白闪等效果 |
| 🔀 分支编辑 | 可视化编辑选项和条件跳转 |

### 💬 AI 后日谈

| 功能 | 说明 |
|------|------|
| 🧠 DeepSeek 流式对话 | AI 实时生成角色回复（流式输出，逐字显示） |
| 🎭 Live2D 角色 | Cubism 5 动态模型：呼吸、眨眼、口型同步、物理模拟 |
| 🗣️ TTS 语音朗读 | Web Speech API 朗读 AI 回复 |
| 😊 情绪检测 | AI 回复内容 → 自动匹配角色表情和画面滤镜 |
| 📝 双层记忆 | 短期记忆（最近 8 轮）+ AI 摘要长期记忆 |
| 🏁 结局感知 | AI 知道玩家达成的结局，呈现不同对话态度 |
| 🎬 画面演出联动 | AI 回复中的 BBCode 触发画面特效 |
| 📥 对话导出 | 下载 TXT + 精美 HTML 对话记录 |
| 🔑 Key 加密 | API Key 浏览器指纹加密存储 |

---

## 文件结构

```
GinkgoEngine/
├── index.html                  # 🎮 游戏播放器
├── editor.html                 # 📝 剧本编辑器
├── epilogue.html               # 💬 AI 后日谈
├── server.js                   # 本地开发服务器
├── sw.js                       # PWA Service Worker
├── manifest.json               # PWA 清单
├── demo-project.json           # 最小示例项目（快速体验）
├── epilogue_topics.json        # 后日谈快捷话题
├── imgbb-urls.json             # 图床映射（游戏运行时加载）
│
├── css/
│   ├── gal-core.css            # 播放器核心样式
│   ├── gal-beautify.css        # 播放器界面美化
│   └── epilogue.css            # 后日谈样式
│
├── js/
│   ├── config.js               # 资源配置 + 常量 + 内置彩蛋
│   ├── core.js                 # ★ 核心引擎（场景调度/演出/存档/预加载/分享码）
│   ├── storage.js              # 存储管理（IndexedDB/localStorage/存档缩略图）
│   ├── gamepad.js              # 手柄 + 鉴赏 + 封面 + 项目加载
│   ├── main.js                 # UI 绑定 + 设置 + 鉴赏渲染 + 主线入口
│   ├── epilogue-entry.js       # 后日谈主菜单入口按钮
│   └── epilogue/               # AI 后日谈模块
│       ├── ep-api.js           #   DeepSeek API 客户端（流式 + Key 加密）
│       ├── ep-engine.js        #   ★ 主状态机 + 结局感知 + 角色档案
│       ├── ep-ui.js            #   聊天面板 + BBCode + 设置 + 导出
│       ├── ep-tts.js           #   语音合成
│       ├── ep-emotion.js       #   情感检测 → 表情映射
│       ├── ep-memory.js        #   对话记忆（短期 + 长期摘要）
│       ├── ep-effects.js       #   画面演出效果
│       ├── ep-customize.js     #   场景自定义面板（背景/音乐/立绘）
│       ├── ep-live2d.js        #   Live2D 渲染适配层
│       └── ep-gaze.js          #   注视追踪
│
├── live2d/                     # Live2D Cubism 5 SDK
│   ├── core/                   #   运行时核心
│   ├── live2dcubismframework.js #  官方框架
│   ├── models/Haru/            #   Haru 免费示例模型
│   └── shaders/                #   GLSL 着色器 (13 个)
│
├── assets/                     # 📁 资源目录（占位 README）
│   ├── bg/                     #   背景图片
│   ├── sprites/                #   角色立绘
│   ├── bgm/                    #   背景音乐
│   ├── cg/                     #   全屏插图
│   ├── se/                     #   音效
│   ├── voice/                  #   角色配音
│   └── video/                  #   过场视频
│
└── characters/template/        # 角色 Prompt 模板
    └── prompt_template.txt
```

---

## 如何创作你自己的游戏

### 第一步：准备素材

把图片、音乐放到 `assets/` 对应的文件夹中：

```
assets/bg/教室.png
assets/sprites/主角_微笑.png
assets/bgm/日常.mp3
assets/cg/结局图.jpg
```

### 第二步：打开编辑器

```
http://localhost:3000/editor.html
```

在左侧把素材**上传/注册**到资源库（给每个文件起一个键名）：

| 素材文件 | 键名 |
|----------|------|
| `assets/bg/教室.png` | `classroom` |
| `assets/sprites/主角_微笑.png` | `hero_smile` |
| `assets/bgm/日常.mp3` | `bgm_daily` |

### 第三步：编写场景

1. 在中间场景列表点击 **"+ 新增场景"** 或按 `Ctrl+N`
2. 在右侧编辑面板填写：
   - **说话人**：角色名
   - **对话文本**：对白（可加 BBCode 如 `[c=red]重要的话[/c]`）
   - **背景键**：`classroom`
   - **立绘键**：`hero_smile`
   - **BGM键**：`bgm_daily`
3. 点击 **"💾 更新场景"** 或按 `Ctrl+S` 保存
4. 按 `↑` `↓` 键切换场景，中间预览区实时显示效果

### 第四步：添加分支

1. 在某个场景中将 **"是否含有分支选项"** 设为"是"
2. 添加选项和跳转目标：
   ```
   选项1: 接受邀请 → 跳转到场景 5
   选项2: 婉拒     → 跳转到场景 8
   ```

### 第五步：使用流程图

点击预览区下方 **"🗺️ 路线流程图"** 查看你的故事分支结构。用滚轮缩放、拖拽平移来检查所有路线是否完整。

### 第六步：诊断与导出

1. 点击 **"🔍 项目诊断"** 检查问题
2. 点击 **"📦 导出完整项目"**（`Ctrl+E`）导出 `galgame_full_project.json`
3. （可选）点击 **"📦 分章导出"** 分割长篇

### 第七步：测试游玩

在游戏播放器中加载导出的 JSON 文件，测试完整流程。

### 可选：AI 协同写作

- 选中一句对白 → 选择改写风格（更温柔/更活泼/更文艺/更简洁/更深情）
- 点击 **"🤖 AI 改写"**
- 需要 DeepSeek API Key（与后日谈共用）

### 可选：配置角色档案

在编辑器底部 **"🎭 角色设定档案"** 面板填写角色信息。导出 JSON 后，将这些信息放到 `epilogue_characters.json` 中。后日谈 AI 会自动加载角色设定，让对话更符合人设。

---

## JSON 项目格式

导出的 `galgame_full_project.json` 结构：

```json
{
  "scenes": [
    {
      "speaker": "旁白",
      "text": "新学期第一天，他走进了教室。",
      "bg": "classroom",
      "sprite": null,
      "sprites": [],
      "bgm": "bgm_daily",
      "seKey": null,
      "voice": null,
      "locationHint": "教学楼",
      "next": 1,
      "triggerChapterTransition": false,
      "subtitle": "",
      "cgKey": null,
      "videoKey": null,
      "clearStage": false,
      "hasChoices": false,
      "choices": [],
      "effects": [{ "type": "vignette", "duration": 3000 }],
      "transition": "",
      "endingKey": null,
      "endingTitle": null,
      "affinity": null,
      "affinityLabel": "",
      "setVar": null,
      "conditionNext": null
    }
  ],
  "assets": {
    "bg": { "classroom": "assets/bg/教室.png" },
    "sprites": { "hero_smile": "assets/sprites/主角_微笑.png" },
    "bgm": { "bgm_daily": "assets/bgm/日常.mp3" },
    "cg": {},
    "se": {},
    "voice": {},
    "video": {}
  },
  "characters": {
    "hero": {
      "name": "主角",
      "personality": "温柔善良，有点害羞……",
      "background": "从小在南方小镇长大……",
      "speechStyle": "说话温柔，常用"……"停顿",
      "extraNotes": ""
    }
  },
  "imgbbUrls": {}
}
```

### 场景字段完整参考

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `speaker` | string | 说话人名称（`" "` 表示不显示） | - |
| `text` | string | 对话正文（支持 BBCode + `{变量}` 插值） | `""` |
| `bg` | string | 背景图键名 | - |
| `sprite` | string\|null | 单选立绘键名（sprites 为空时生效） | `null` |
| `sprites` | array | 多立绘数组 `[{key, position, breathing, opacity}]` | `[]` |
| `bgm` | string\|null | BGM 键名 | `null` |
| `seKey` | string\|null | 音效键名 | `null` |
| `voice` | string\|null | 语音键名 | `null` |
| `locationHint` | string | 画面左上角地点提示 | `""` |
| `next` | number | 默认跳转场景索引（-1=结束） | - |
| `triggerChapterTransition` | bool | 是否在此处切章节 | `false` |
| `subtitle` | string | 章节副标题（切章节时显示） | `""` |
| `cgKey` | string\|null | 全屏 CG 键名 | `null` |
| `videoKey` | string\|null | 视频键名 | `null` |
| `clearStage` | bool | 是否清空所有立绘 | `false` |
| `hasChoices` | bool | 是否含有分支选项 | `false` |
| `choices` | array | 选项列表 `[{text, nextIdx}]` | `[]` |
| `effects` | array | 画面效果列表 `[{type, duration}]` | `[]` |
| `transition` | string | 场景过渡效果（fade/slideLeft/zoomIn…） | `""` |
| `endingKey` | string\|null | 结局标识符 | `null` |
| `endingTitle` | string\|null | 结局标题 | `null` |
| `affinity` | number\|undefined | 好感度 0-100（-1=隐藏） | `undefined` |
| `affinityLabel` | string | 好感度标签 | `""` |
| `setVar` | object\|null | 变量赋值 `{name: value}` | `null` |
| `conditionNext` | object\|null | 条件跳转 `{expression: nextIdx, default: idx}` | `null` |

---

## AI 后日谈配置

### 1. 获取 DeepSeek API Key

访问 [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) 注册并获取 Key（格式：`sk-xxxxxxxx`）。

### 2. 配置 Key

打开后日谈页面，点击 ⚙️ 设置 → 输入 API Key。Key 会使用浏览器指纹加密存储在本地。

### 3. 配置角色 Prompt（可选）

如果你在编辑器中填写了角色档案，将导出的 `characters` 字段保存为项目目录下的 `epilogue_characters.json`。后日谈会自动加载。

或者直接编辑 `characters/template/prompt_template.txt` 创建角色设定模板。

### 4. 配置 Live2D（可选）

1. 从 [Live2D 官网](https://www.live2d.com/download/cubism-sdk/) 下载 Cubism 5 SDK for Web
2. 将 `Core/live2dcubismcore.min.js` 放入 `live2d/core/`
3. 将你的角色模型文件放入 `live2d/models/`
4. 修改 `epilogue.html` 中的 `EpilogueLive2D.init()` 路径

> **注意**：Live2D Cubism SDK 有独立的许可条款。年收入低于 1000 万日元的个人开发者免费使用。

---

## 部署发布

### 方式一：静态托管（推荐）

将整个 `GinkgoEngine/` 文件夹上传到任意静态文件服务：

| 平台 | 说明 |
|------|------|
| **GitHub Pages** | 免费，上传后自动部署 |
| **Netlify** | 拖拽文件夹即可，支持自定义域名 |
| **Vercel** | 同上，全球 CDN |
| **Cloudflare Pages** | 免费 500 次/月构建 |

**注意**：线上部署时加上 `https://` 才能启用 PWA 离线缓存。

### 方式二：自托管

```bash
# 方式 A: 用内置 server.js
node server.js

# 方式 B: 用 npx serve
npx serve . -p 3000

# 方式 C: 用 nginx
# 将 root 指向 GinkgoEngine 目录即可
```

### 方式三：Docker（可选）

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### 离线模式

部署后，玩家首次访问时 Service Worker 会自动缓存核心文件（HTML/CSS/JS）。后续访问即使断网也能游玩。但以下情况需要在线：

- CDN 外部资源（Google Fonts、Font Awesome）首次加载
- AI 后日谈（需要访问 DeepSeek API）
- 图床图片（如果使用了 ImgBB）

---

## 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 语言 | 纯 JavaScript (ES5+) | 零构建工具，浏览器原生运行 |
| 样式 | CSS3 | 动画、滤镜、过渡、Grid/Flexbox |
| 音频 | Howler.js | 外部音频引擎（CDN 加载） |
| 动画 | GSAP 3 | 外部动画引擎（CDN 加载） |
| 粒子 | tsParticles 2 | 银杏叶等粒子特效（CDN 加载） |
| Live2D | Cubism 5 SDK | 动态角色渲染（本地文件） |
| AI | DeepSeek Chat API | 流式对话生成 |
| TTS | Web Speech API | 浏览器内置语音合成 |
| 存储 | localStorage + IndexedDB | 存档/设置/解锁/记忆 |
| PWA | Service Worker | 离线缓存 + 桌面安装 |
| 图标 | Font Awesome 6 | 外部矢量图标（CDN 加载） |
| 字体 | Google Fonts | Noto Serif SC 等（CDN 加载） |

---

## 许可证

```
MIT License

Copyright (c) 2025-2026 Ginkgo Engine Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

**第三方组件许可**：

| 组件 | 许可 |
|------|------|
| Live2D Cubism SDK | [Live2D 专有许可](https://www.live2d.com/eula/) — 年收入 < 1000 万日元免费 |
| Howler.js | MIT |
| GSAP | 标准许可（免费用于非商业项目） |
| tsParticles | MIT |
| Font Awesome 6 | [CC BY 4.0 + SIL OFL 1.1](https://fontawesome.com/license/free) |

---

**🍂 银杏叶飘落的季节，属于你自己的故事，从这里开始。**
