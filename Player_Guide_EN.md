# Ginkgo Engine · Player's Guide

Welcome to the world of Ginkgo Engine. This guide will walk you through all the game's operations and new features.

> 📂 **Doc Index**: [English README](README.md) · [Editor Guide](Editor_Guide_EN.md) · [Epilogue Docs](EPILOGUE_README_EN.md) · [中文文档](README_CN.md#文档导航)

---

## Table of Contents

1. [Launch & Main Menu](#1-launch--main-menu)
2. [Playing the Game — Reading the Story](#2-playing-the-game--reading-the-story)
3. [Save & Load](#3-save--load)
4. [Save Sharing Code (New Feature)](#4-save-sharing-code-new-feature)
5. [Settings & Personalization](#5-settings--personalization)
6. [Gallery Mode](#6-gallery-mode)
7. [Epilogue — AI Character Chat (New Feature)](#7-epilogue--ai-character-chat-new-feature)
8. [Keyboard Shortcuts](#8-keyboard-shortcuts)
9. [Gamepad Support](#9-gamepad-support)
10. [Progressive Preloading (New Feature)](#10-progressive-preloading-new-feature)
11. [Lazy Loading / Chunked Projects (New Feature)](#11-lazy-loading--chunked-projects-new-feature)
12. [FAQ](#12-faq)

---

## 1. Launch & Main Menu

Open `index.html` (Chrome or Edge recommended). You'll see the main menu:

```
+----------------------------------+
|         Ginkgo Engine            |
|                                  |
|   [Start Game]      [Settings]   |
|   [Gallery]         [Epilogue]   |
|   [Exit Game]                    |
+----------------------------------+
```

| Button | Function |
|--------|----------|
| **Start Game** | New game / Load save / Chapter select |
| **Settings** | Volume, speed, hotkeys, project management |
| **Gallery** | CG, sprites, music, endings, achievements, flowchart |
| **Epilogue** | AI character chat (always available) |
| **Exit Game** | Close the page |

> If you've played before, a "Continue" button lets you resume from where you left off.

---

## 2. Playing the Game — Reading the Story

### Screen Layout

```
+----------------------------------+
|  Location hint (top-left)         |
|      Background image             |
|         [Sprite]                 |
|                                  |
|  Dialog area (bottom)             |
|  [Speaker]                       |
|  Dialogue text...................|
|  [Skip] [Skip Read] [Auto] [Next]|
+----------------------------------+
```

### Controls

- **Left click** / **Space** / **Enter** → Next line
- **↑ Arrow** → Go back to previous line (needs rollback enabled in settings)
- **Number keys 1/2/3** → Quick choice selection

### Skip & Auto Modes

| Button | Effect |
|--------|--------|
| **Skip** | Fast-forward dialogue (stops at choices and CG) |
| **Skip Read** | Only skip previously read text; new text displays normally |
| **Auto** | Auto-play with adjustable pause between lines |

---

## 3. Save & Load

### Manual Save
- Bottom toolbar **"Quick Save"** button
- Press **F5** or **Q** for quick save
- Save page offers 10 manual save slots

### Auto Save
- Auto-saves at each chapter transition
- Main menu "Continue" loads the latest auto save

### Save Location
Saves are stored in your browser's local storage. Clearing cache will delete saves.

### Loading Project Files
Main Menu **"Settings → Project Management → Load Project File"** to load a `.json` script.

---

## 4. Save Sharing Code (New Feature)

Click **"Share"** and **"Import"** buttons on the save page to transfer game state between players.

### Sharing Your Progress

1. Open the save page during gameplay
2. Click the **"Share"** button
3. A popup shows a share code + QR code
4. Copy the code to send to a friend, or let them scan the QR

### Importing Someone Else's Progress

1. Click **"Import"** on the save page
2. Paste the received share code
3. Click "Jump" — the game jumps to that exact scene and state

### What the Share Code Contains

- Current scene position
- All game variables (affinity, flags, etc.)
- Current BGM
- ~200–500 characters, easy to copy and share

### Right-Click Menu

In-game **right click** → select "Share Current State" for quick sharing.

---

## 5. Settings & Personalization

Main menu "Settings" or in-game right-click → Settings:

### Volume

| Option | Function |
|--------|----------|
| BGM Volume | Background music level |
| SFX Volume | Sound effect level |
| Voice Volume | Character voice level |
| Voice Ducking | How much BGM lowers during speech |

### Playback Behavior

| Option | Function |
|--------|----------|
| Text Speed | Typing effect speed (15~120 ms/char) |
| **Adaptive Speed** ⭐ New | Auto-adjusts text speed based on your reading rhythm (see below) |
| Auto-Play Speed | Pause per character in auto mode |
| Minimum Interval | Minimum wait between lines in auto mode |

### Adaptive Reading Speed (New Feature)

When enabled (default: on), the engine learns your reading rhythm and auto-adjusts text display speed:

- The faster you click "Continue", the faster text appears
- The slower you read, the slower text appears
- Range: 15~120 ms/char
- When you manually drag the speed slider, auto-learning pauses
- Can be toggled off anytime in settings

### Sprite Transition

- **Crossfade** → Smooth fade when sprites change
- **Instant** → Sprites change instantly

### Rollback

- When enabled, use **↑ Arrow** to review previous lines
- Adjustable rollback animation speed

---

## 6. Gallery Mode

Click **"Gallery"** on the main menu to view unlocked content:

| Tab | Content |
|-----|---------|
| **CG** | Full-screen illustrations |
| **Sprites** | All character expressions |
| **Backgrounds** | Scene backgrounds |
| **Music** | BGM audition |
| **Endings** | Reached endings list |
| **Achievements** | Earned achievements |
| **Flowchart** | Interactive route map |

### How to Unlock
- CG: First appearance in the story
- Sprites: First display in-game
- Music: First playback
- Endings: Reaching the corresponding ending

### Cover Settings
In gallery mode, you can customize the main menu cover image and music: Last CG / Random from candidates / Fully random.

---

## 7. Epilogue — AI Character Chat (New Feature)

The **"Epilogue"** button on the main menu opens AI-powered free conversation mode.

### What is it?

The Epilogue is a free chat mode after the main story. You play as the protagonist and freely converse with a character through AI-generated responses. The character has a full personality profile (personality, backstory, speech style), and responses come with emotion-driven sprite changes and screen effects.

### Ending Awareness

The Epilogue knows which ending you reached; the AI character will show different attitudes and memories depending on the outcome.

### Conversation Features

| Feature | Description |
|---------|-------------|
| Type to chat | Type in the input box at the bottom, press Enter to send |
| Quick topics | Click 💬 to choose preset topics |
| Regenerate | Not happy with the AI's reply? Click 🔄 to regenerate |
| Export chat | Click 📥 to download chat history (TXT + beautiful HTML) |
| Voice reading | AI replies auto-spoken via TTS (can be toggled off) |

### Screen Effects

When AI replies contain BBCode tags, screen effects are triggered:
- `[shake]` screen shake, `[flash]` white flash
- `[sepia]` vintage filter, `[warm]` warm tone
- Character sprites auto-switch expressions based on detected emotion
- Live2D dynamic character model supported

### Settings Panel

Click ⚙️ to adjust:
- Typing speed
- BGM / Voice volume
- Live2D / Static sprite toggle
- DeepSeek API Key management

### API Key

The Epilogue requires a DeepSeek API Key. Enter a `sk-...` format key in the settings panel. The key is stored only in your local browser, encrypted with a browser fingerprint.

### Multi-Character Future

The architecture already supports multiple characters. When the editor exports JSON with multiple character profiles, the Epilogue can load and switch between conversation targets.

---

## 8. Keyboard Shortcuts

| Key | Function |
|-----|----------|
| Space / Enter / Left Click | Next line / Confirm |
| Right Click | Quick menu (save/load/share/settings/title) |
| ↑ Arrow | Previous line (needs rollback enabled) |
| Ctrl | Fast-forward |
| Alt | Auto-play |
| F5 or Q | Quick save |
| 1 / 2 / 3 | Select branch choice |
| Esc | Close popup / Return |

---

## 9. Gamepad Support

Supports Xbox / PlayStation controllers (browser must support Gamepad API):

| Button | Function |
|--------|----------|
| **A / Cross** | Next line / Confirm |
| **B / Circle** | Back / Menu |
| **X / Square** | Auto-play |
| **Y / Triangle** | Fast-forward |
| **LB / L1** | Previous choice |
| **RB / R1** | Next choice |
| **D-pad** | Navigate choices |
| **Menu button** | Open game menu |
| **View button** | Backlog |

A gamepad icon appears in the bottom-right corner when connected.

---

## 10. Progressive Preloading (New Feature)

After loading a project, the game engine automatically performs layered preloading:

```
Phase 0 → Cover image + Cover BGM (display immediately)
Phase 1 → Scene BG → Sprites → CG → BGM (in appearance order)
Phase 2 → SFX + Voice (background idle)
```

### What This Means

- **Title screen loads instantly**: Cover image and music load first
- **No white screen on first line**: The BG and sprites needed for scene 0 are already cached while you're on the title screen
- **Progress visible**: Bottom-left shows "Preloading XX%" progress
- **Doesn't block gameplay**: Clicking "New Game" aborts preloading automatically

---

## 11. Lazy Loading / Chunked Projects (New Feature)

If your script was **chunk-exported** from the editor (multiple JSON files), the game engine auto-enables lazy loading mode:

- Load chapter 0 (prologue) first → game is playable immediately
- Later chapters are auto-downloaded in the background as the player approaches
- Initial load time is dramatically reduced

---

## 12. FAQ

### Q: The game is stuck, nothing responds to clicks?
A: Press **Esc** to close any popup, or refresh the page (unsaved progress will be lost).

### Q: No sound?
A: Check if the browser tab is muted (speaker icon on the tab), and check game settings volume.

### Q: Saves lost?
A: Saves are in browser local storage. Clearing cache or switching computers will lose them. Use the **Save Sharing Code** to back up key progress.

### Q: Epilogue not responding after typing?
A: Check that the DeepSeek API Key is set correctly (Settings panel → API Key). The key should start with `sk-`.

### Q: How to load someone else's script?
A: Main menu → Settings → Project Management → Load Project File → select `.json`.

### Q: How to load a share code?
A: In-game save page → click "Import" → paste share code → Jump.

### Q: Adaptive speed not working?
A: Check that the "Adaptive Speed" toggle is on in settings (default: on). Manually dragging the speed slider pauses learning — toggle off and back on to reset learning.

### Q: Gamepad not responding?
A: Make sure the controller is connected and recognized by the browser. You may need to click anywhere on the page first to activate gamepad support.

### Q: Mouse disappears in fullscreen?
A: Move your mouse to the bottom of the screen and it will reappear. Press **F11** to exit fullscreen.

---

Enjoy the game! For more details, see `Editor_Guide_EN.md` or contact the developers.
