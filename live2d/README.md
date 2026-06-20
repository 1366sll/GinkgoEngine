# Live2D 技术验证

## 📦 下载资源

### 1. Cubism Core（必需）

从 Live2D 官网下载 Cubism SDK for Web：
https://www.live2d.com/download/cubism-sdk/

注册后下载 `CubismSdkForWeb-5.x.x.zip`，解压后找到：
```
Core/live2dcubismcore.min.js
```
将其复制到 `live2d/core/` 目录。

### 2. 模型文件（必需）

从 Live2D 官网下载免费示例模型：
https://www.live2d.com/en/download/sample-data/

推荐下载 **Haru**（はる）——免费、表情丰富、动作齐全。

将模型解压到 `live2d/models/haru/`，确保目录结构如下：
```
live2d/models/haru/
├── haru.model3.json        ← 模型定义文件
├── haru.moc3               ← 二进制模型
├── haru.1024/
│   └── texture_00.png      ← 纹理图集
├── motions/                ← 动作文件
│   ├── idle_01.motion3.json
│   └── ...
└── expressions/            ← 表情文件
    ├── angry.exp3.json
    ├── happy.exp3.json
    └── ...
```

### 3. 更换模型路径

编辑 `epilogue.html`，找到 boot() 函数中的这行：
```javascript
EpilogueLive2D.init('live2d/models/haru/haru.model3.json')
```
改为你自己的模型路径。

## 🚀 运行方式

直接打开 `epilogue.html` 即可。

Live2D 初始化是**异步且非阻塞**的：
- 页面立即可用，先显示静态 PNG 立绘
- Live2D 加载完成后自动接管角色渲染
- 加载失败时静默降级，不影响游戏体验

## 🎮 功能

| 功能 | 状态 |
|------|------|
| 模型加载与渲染 | ✓ |
| 呼吸动画 | ✓ |
| 眨眼 | ✓ |
| 鼠标/触摸追踪（头部跟随） | ✓ |
| 表情切换（随AI情绪联动） | ✓ |
| 动作播放 | ✓ |
| 待机动作循环 | ✓ |

## ⚠️ 许可证

Cubism SDK 对年收入小于 1000 万日元的个人开发者免费。
详细条款：https://www.live2d.com/eula/
