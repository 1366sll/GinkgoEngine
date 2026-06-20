# Ginkgo Engine

An open-source, web-based Galgame (Visual Novel) engine built with vanilla HTML/CSS/JavaScript. Write your story, package it as JSON, and play it in any modern browser -- no installation, no runtime dependencies, no platform lock-in.

Named after the ginkgo trees that frame the campus setting of its debut project "银杏落雨时" (When Ginkgo Leaves Fall), the engine is designed to be approachable for writers and artists while offering enough depth for ambitious multi-branch novels.


## Documentation

| Document | Description |
|----------|-------------|
| 📝 **[Editor Guide](Editor_Guide_EN.md)** | Full editor manual — 23 chapters covering every feature |
| 🎮 **[Player Guide](Player_Guide_EN.md)** | Player's handbook — controls, settings, tips |
| 💬 **[Epilogue Docs](EPILOGUE_README_EN.md)** | AI Epilogue architecture, API reference, Live2D pipeline |
| 🌐 **[中文 README](README_CN.md)** | README in Chinese |

> Chinese originals: [编辑器指南](编辑器使用指南.md) · [播放器指南](显示器使用指南.md) · [后日谈文档](EPILOGUE_README.md)


## Quick Start

Three steps from zero to playing:

```bash
# 1. Start the local dev server
node server.js

# 2. Open your browser
#    Player:  http://localhost:3000
#    Editor:  http://localhost:3000/editor.html
#    Epilogue chat:  http://localhost:3000/epilogue.html

# 3. Load a project JSON through the in-player file picker,
#    or drop galgame_full_project.json into the project root.
```

> **Note:** The engine ships with built-in easter-egg scenes that demonstrate visual effects, branching, and multi-sprite staging. If no project JSON is loaded, those scenes play automatically so you can evaluate the engine immediately.


## Features

### Core Engine
- :video_game: **JSON-driven** -- All story content (scenes, choices, branches, effects) lives in a single portable JSON file
- :art: **Rich visual effects** -- Vignette, sepia, zoom-in/out, flash, shake, letterbox, mood filters (warm/cool/dramatic), real-time crossfade backgrounds, particle systems (ginkgo leaves)
- :speech_balloon: **BBCode text markup** -- `[b]`bold`[/b]`, `[i]`italic`[/i]`, `[c=color]`colored`[/c]`, `[shake]`shake`[/shake]`, `[big]`large`[/big]`, and more
- :globe_with_meridians: **Full Unicode support** -- Chinese, Japanese, Korean, and any script; Font Awesome icons via CDN
- :busts_in_silhouette: **Multi-sprite staging** -- Up to multiple characters on screen simultaneously with independent positions, breathing animation, and transitions
- :bookmark: **Save/Load system** -- localStorage-based with import/export; save sharing via QR code
- :hourglass_flowing_sand: **Adaptive reading speed** -- Text display speed adapts to sentence length and player habits
- :fast_forward: **Skip & auto modes** -- Fast-forward, skip-read (jump over already-seen text), and auto-play
- :memo: **Chapter review** -- Scroll back through the current chapter's dialogue history
- :heart: **Affinity system** -- Track character relationships with on-screen gauge
- :video_camera: **CG gallery & video playback** -- Unlockable CGs and embedded video cutscenes
- :musical_note: **BGM & sound effects** -- Background music with crossfade, per-scene SE triggers, voice lines
- :zzz: **Lazy loading** -- Large novels load assets progressively; preloader keeps the next few scenes ready
- :video_game: **Gamepad support** -- Navigate and select with standard game controllers (D-pad, A/B buttons), visual indicator in UI
- :keyboard: **Keyboard shortcuts** -- Space/Enter to advance, Esc for menu, and more
- :computer_mouse: **Right-click context menu** -- Quick access to settings, save, and navigation

### PWA & Offline
- :signal_strength: **Progressive Web App** -- Service Worker (`sw.js`) pre-caches core assets on first visit
- :floppy_disk: **Offline-ready** -- Play anywhere after the first load; CDN resources are cached separately (Cache-First), local resources use Network-First strategy
- :iphone: **Installable** -- Add to home screen on mobile/desktop via `manifest.json`

### Built-in Editor
- :pencil2: **Visual scenario editor** (`editor.html`) -- Write, preview, and manage your entire novel in one interface
- :eye: **Real-time preview** -- See exactly how each scene renders as you edit, matching the game player's output
- :chart_with_upwards_trend: **Interactive flowchart** -- Visualize branching narrative structure; click nodes to navigate, see choice paths, toggle branch visibility
- :robot: **AI co-writing** -- Generate scene text, dialogue, or choices with LLM assistance (DeepSeek API)
- :leftwards_arrow_with_hook: **Undo/Redo** -- Full history support for safe editing
- :mag: **Project diagnostics** -- Scan for broken asset references, missing scenes, orphaned branches, and structural issues
- :link: **ImgBB integration** -- Upload assets directly to ImgBB image hosting and get URLs without leaving the editor
- :card_file_box: **Resource management** -- Organize backgrounds, sprites, BGM, CG, SE, voice, and video assets with key-based references
- :floppy_disk: **Export to JSON** -- Save your project as a standalone `.json` file ready to play

### AI Epilogue (Post-Game Chat)
- :speech_balloon: **DeepSeek-powered character chat** -- Talk freely with characters after completing the game
- :japanese_ogre: **Live2D Cubism 5 support** -- Animated characters with breathing, blinking, head tracking, and expression changes that react to conversation mood
- :microphone: **TTS (Text-to-Speech)** -- Characters speak their responses aloud via browser Speech Synthesis API
- :brain: **Character memory** -- Characters remember past conversations within a session
- :performing_arts: **Emotion detection** -- AI responses carry emotional metadata that drives Live2D expressions and visual effects
- :sparkles: **Atmospheric effects** -- Particles, mood filters, and ambient transitions in the chat backdrop
- :eye: **Gaze tracking** -- Live2D model follows mouse/touch position for natural interaction
- :art: **Customizable UI** -- Tweak chat panel position, font size, and themes
- :lock: **Unlock mechanism** -- Epilogue becomes available after reaching any game ending


## File Structure

```
GinkgoEngine/
├── index.html                    # Game player (loads .json project files)
├── editor.html                   # Visual scenario editor with resource mgmt
├── epilogue.html                 # AI character chat (requires DeepSeek API key)
├── server.js                     # Local dev server (Node.js, port 3000)
├── sw.js                         # PWA Service Worker for offline support
├── manifest.json                 # PWA manifest
│
├── css/
│   ├── gal-core.css              # Core game player styles
│   ├── gal-beautify.css          # Visual polish and animations
│   └── epilogue.css              # Epilogue chat UI styles
│
├── js/
│   ├── config.js                 # Asset registry + built-in easter egg scenes
│   ├── core.js                   # Core engine (rendering, effects, transitions)
│   ├── storage.js                # Image preloading, caching, persistence
│   ├── gamepad.js                # Game controller support
│   ├── main.js                   # Game loop, flowchart logic, branch system
│   └── epilogue-entry.js         # Epilogue unlock gate & mode switcher
│
├── js/epilogue/
│   ├── ep-api.js                 # DeepSeek API integration
│   ├── ep-engine.js              # Chat logic & conversation flow
│   ├── ep-ui.js                  # Chat UI rendering & controls
│   ├── ep-tts.js                 # Text-to-speech output
│   ├── ep-emotion.js             # Emotion detection from AI responses
│   ├── ep-memory.js              # Short-term conversation memory
│   ├── ep-effects.js             # Visual effects for chat backdrop
│   ├── ep-customize.js           # UI customization panel
│   ├── ep-gaze.js                # Mouse/touch gaze tracking
│   └── ep-live2d.js              # Live2D Cubism 5 renderer wrapper
│
├── live2d/
│   ├── live2dcubismframework.js  # Cubism 5 Framework
│   ├── core/
│   │   └── live2dcubismcore.min.js  # Cubism Core (obtain from Live2D SDK)
│   ├── models/Haru/              # Free sample model (Haru by Live2D Inc.)
│   │   ├── Haru.model3.json
│   │   ├── Haru.moc3
│   │   ├── expressions/          # 8 expression presets
│   │   ├── motions/              # 27 motion clips + idle loop
│   │   └── sounds/               # Voice samples for motions
│   └── shaders/                  # WebGL shaders
│
├── assets/                       # Placeholder directories for game assets
│   ├── bg/                       #   Background images
│   ├── sprites/                  #   Character sprites / standing pictures
│   ├── bgm/                      #   Background music
│   ├── cg/                       #   CG illustrations
│   ├── se/                       #   Sound effects
│   ├── voice/                    #   Voice lines
│   └── video/                    #   Video cutscenes
│
└── characters/
    └── template/                 # Character prompt template for AI epilogue
```


## How to Create Your Own Game

### 1. Open the Editor

Start the dev server and navigate to `http://localhost:3000/editor.html`.

### 2. Build Your Scenes

Each scene is a row in the editor table. Fill in:

- **Speaker** -- Character name (leave empty for narration)
- **Text** -- Dialogue or narration (supports BBCode markup)
- **Background** -- Asset key from your bg library
- **Sprite(s)** -- Character sprite key and position
- **BGM** -- Background music key
- **Effects** -- Visual filters and transitions
- **Choices** -- Branching options that lead to different scenes
- **Ending Key** -- Mark a scene as an ending (unlocks CG gallery + epilogue)

### 3. Use the Flowchart

Click the flowchart button to see your branching structure. Drag to pan, scroll to zoom, click nodes to jump to that scene. Toggle branch visibility to focus on specific storylines.

### 4. Preview in Real Time

The preview panel updates as you edit. Toggle effects, test choices, and verify sprite positioning without leaving the editor.

### 5. Export and Play

Click **Export JSON** to download your project file. Load it into `index.html` to play. Share the JSON file with others -- they only need a browser and the engine.

### 6. Optional: AI Co-writing

Set your DeepSeek API key in the editor settings. Select a scene and use the AI panel to generate next lines, alternative dialogue, or branch ideas.


## JSON Project Format

A project file is a single JSON object containing a `scenes` array. Here is a minimal three-scene example:

```json
{
  "scenes": [
    {
      "speaker": "",
      "text": "The classroom is empty. Sunlight slants through dusty windows.",
      "bg": "classroom",
      "sprite": null,
      "bgm": "quiet_theme",
      "locationHint": "Classroom",
      "next": 1,
      "triggerChapterTransition": false,
      "effects": [],
      "hasChoices": false,
      "choices": []
    },
    {
      "speaker": "",
      "text": "A girl looks up from her book.",
      "bg": "classroom",
      "sprite": "heroine_neutral",
      "bgm": "quiet_theme",
      "locationHint": "Classroom",
      "next": 2,
      "triggerChapterTransition": false,
      "effects": [],
      "hasChoices": false,
      "choices": []
    },
    {
      "speaker": "Xia",
      "text": "Oh, you're still here? I thought everyone left.",
      "bg": "classroom",
      "sprites": [{ "key": "heroine_smile", "position": "right", "breathing": true }],
      "bgm": "quiet_theme",
      "locationHint": "Classroom",
      "next": 3,
      "triggerChapterTransition": false,
      "effects": [{ "type": "mood-warm" }],
      "hasChoices": true,
      "choices": [
        { "text": "\"I was waiting for you.\"", "target": 4 },
        { "text": "\"Just lost track of time.\"", "target": 10 }
      ]
    }
  ]
}
```

### Key scene fields

| Field | Type | Description |
|-------|------|-------------|
| `speaker` | string | Character name (empty for narration) |
| `text` | string | Dialogue or narration text (BBCode supported) |
| `bg` | string/null | Asset key for background image |
| `sprite` | string/null | Legacy single-sprite key |
| `sprites` | array/null | Multi-sprite array `[{ key, position, breathing }]` |
| `bgm` | string/null | Asset key for background music |
| `locationHint` | string | Location name shown in UI overlay |
| `next` | number | Index of the next scene |
| `triggerChapterTransition` | boolean | Show chapter title card before this scene |
| `effects` | array | Visual effects: `shake`, `flash`, `sepia`, `vignette`, `zoom-in`, `mood-warm`, `mood-cool`, `mood-dramatic`, `letterbox`, `clear`, etc. |
| `hasChoices` | boolean | Whether this scene presents choices |
| `choices` | array | `[{ text, target }]` -- choice text and target scene index |
| `cgKey` | string/null | CG illustration key to display |
| `endingKey` | string/null | Marks this scene as an ending; unlocks CG + epilogue |
| `voice` | string/null | Voice line asset key |
| `videoKey` | string/null | Video cutscene asset key |
| `setVar` | object/null | Set a named variable for conditional branching |
| `conditionNext` | object/null | Conditional next-scene routing based on variable values |

### Asset configuration

Asset keys in scenes are resolved through an asset config object inside `config.js`. Map friendly names to file paths:

```javascript
let assetConfig = {
    bg: {
        classroom: "assets/bg/classroom.jpg",
        dorm: "assets/bg/dorm.png"
    },
    sprites: {
        heroine_neutral: "assets/sprites/heroine/neutral.png",
        heroine_smile: "assets/sprites/heroine/smile.png"
    },
    bgm: {
        quiet_theme: "assets/bgm/quiet.mp3"
    },
    cg: {},
    se: {},
    voice: {},
    video: {}
};
```


## AI Epilogue Setup

The epilogue (`epilogue.html`) is an AI-powered chat mode where players converse with game characters after completing the story.

### Requirements

1. **DeepSeek API key** -- Get one at [platform.deepseek.com](https://platform.deepseek.com)
2. **Live2D Cubism Core** -- Download from [Live2D](https://www.live2d.com/download/cubism-sdk/), place `live2dcubismcore.min.js` into `live2d/core/`
3. A character model (the free Haru sample model is included)

### Configuration

1. Open `epilogue.html` or `js/epilogue/ep-api.js`
2. Find the API key setting and paste your DeepSeek key
3. Customize the character prompt in `characters/template/` -- define the character's personality, speaking style, backstory, and relationship to the player

### How it works

- The epilogue unlocks automatically when the player reaches any scene with an `endingKey`
- An "Epilogue" button appears in the settings menu
- Clicking it pauses the game, loads epilogue modules, and transitions to the chat interface
- Each AI response is parsed for emotional tone, which drives Live2D expressions
- Conversations are stored in-session memory for continuity
- TTS reads responses aloud (can be toggled on/off)
- Exit returns to the main game seamlessly

### Character Prompt Template

Create a system prompt that defines who the character is:

```
你是[角色名]，[年龄/身份]。你的性格是[性格描述]。
说话风格：[口头禅/语气/句式特征]。
背景故事：[简要背景]。
与玩家的关系：[关系描述]。

规则：
- 始终保持角色人设，不要跳出角色
- 回答简洁自然，像真实对话
- 可以用一些语气词和表情动作描述
- 情绪可以变化，但要符合角色性格
```


## Deployment

The entire engine is static HTML/CSS/JS. You can deploy it anywhere that serves static files.

### Option A: Static hosting (simplest)

Upload the entire directory to any static host. No build step needed.

### Option B: Netlify / Vercel

Drag the project folder onto Netlify or point Vercel at your repo. Set the publish directory to the project root. That's it -- no configuration needed.

### Option C: GitHub Pages

Push the project to a GitHub repository, enable Pages from the main branch. Access it at `https://<username>.github.io/<repo>`.

### Option D: Self-host with Node.js

Use the included `server.js` (or any HTTP server like nginx, Caddy, Python's `http.server`):

```bash
node server.js
# Serving at http://localhost:3000
```

### Offline notes

- The Service Worker (`sw.js`) pre-caches core engine files on first visit
- External CDN resources (fonts, Font Awesome, Animate.css) are cached separately with Cache-First strategy
- Once cached, the entire engine works without internet access
- Game project JSON and assets must also be loaded while online for first-time caching


## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | HTML5, CSS3, JavaScript (ES6+) |
| Game engine | Vanilla JS (zero framework dependency) |
| Visual effects | CSS animations, Web Animations API, CSS filters |
| Audio | HTML5 `<audio>` with Howler.js compatibility |
| Offline | Service Worker API (PWA) |
| Live2D | Cubism SDK for Web 5 (WebGL) |
| AI | DeepSeek API (OpenAI-compatible chat completions) |
| TTS | Web Speech API (`SpeechSynthesis`) |
| Persistence | `localStorage` + `IndexedDB` |
| Font icons | Font Awesome 6 (via CDN) |
| Animations | Animate.css (via CDN) |
| Fonts | Google Fonts: Noto Serif SC, ZCOOL XiaoWei, Ma Shan Zheng |
| Dev server | Node.js `http` module (zero npm dependencies) |

The engine has **zero npm dependencies** -- `package.json` is purely for the optional dev server. Everything runs in the browser.


## License

MIT License

Copyright (c) 2025 张文杰, 邹奕鸣

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

> **Note:** The Live2D Cubism SDK (`live2d/`) is distributed under the [Live2D Proprietary License](https://www.live2d.com/eula/). It is free for individual developers and small businesses (annual revenue under 10 million JPY). The included Haru model is a free sample model provided by Live2D Inc.


## Acknowledgements

- **Live2D Inc.** for the Cubism SDK and the free Haru sample model
- **DeepSeek** for the AI chat API
- **Font Awesome** for the icon set
- **Google Fonts** for Noto Serif SC, ZCOOL XiaoWei, and Ma Shan Zheng typefaces
- The visual novel community for decades of inspiration
