# Ginkgo Engine · Visual Novel Editor — User Guide

Welcome! This guide will take you from zero to building your own visual novel step by step.

> 📂 **Doc Index**: [English README](README.md) · [Player Guide](Player_Guide_EN.md) · [Epilogue Docs](EPILOGUE_README_EN.md) · [中文文档](README_CN.md#文档导航)

---

## Table of Contents

1. [Layout: Three-Column Workbench](#1-layout-three-column-workbench)
2. [Left Panel: Asset Library](#2-left-panel-asset-library)
3. [Middle Top: Scene List](#3-middle-top-scene-list)
4. [Middle Bottom: Live Preview](#4-middle-bottom-live-preview)
5. [Right Panel: Scene Editor](#5-right-panel-scene-editor)
6. [BBCode: Adding Magic to Text](#6-bbcode-adding-magic-to-text)
7. [Multi-Sprite System](#7-multi-sprite-system)
8. [Screen Effects — Filters, Shake, Flash](#8-screen-effects--filters-shake-flash)
9. [Branch Choices — Giving the Story Options](#9-branch-choices--giving-the-story-options)
10. [Conditional Branching & Variables (Advanced)](#10-conditional-branching--variables-advanced)
11. [Scene Transition Effects](#11-scene-transition-effects)
12. [CG, Video & Voice](#12-cg-video--voice)
13. [Endings & Affinity](#13-endings--affinity)
14. [AI Co-Writing (New Feature)](#14-ai-co-writing-new-feature)
15. [Character Profiles — Character Cards for Epilogue AI (New)](#15-character-profiles--character-cards-for-epilogue-ai-new)
16. [Route Flowchart (New Feature)](#16-route-flowchart-new-feature)
17. [Project Diagnostics — Pre-Export Validation (New)](#17-project-diagnostics--pre-export-validation-new)
18. [Undo & Redo (New Feature)](#18-undo--redo-new-feature)
19. [Keyboard Shortcuts](#19-keyboard-shortcuts)
20. [Import, Export & Save](#20-import-export--save)
21. [ImgBB Image Hosting](#21-imgbb-image-hosting)
22. [Complete Workflow Example](#22-complete-workflow-example)
23. [FAQ](#23-faq)

---

## 1. Layout: Three-Column Workbench

When you open the editor, you'll see three vertical areas:

```
+----------------+------------------------+------------------+
| Left: Assets    | Middle Top: Scene List  | Right: Edit      |
|                |                        |                  |
|  Sprites       | [Idx][Speaker][Text].. | ⏪Undo ⏩Redo    |
|  BG            | 0  Hero  Tomorrow...   | Speaker________ |
|  Music         | 1  Heroine  Hi...      | Dialogue_______ |
|  SE            |                        | [🤖 AI Rewrite] |
|  CG            | Middle Bottom: Preview | BG Key_________ |
|  Voice         | +------------------+   | BGM____________ |
|  Video         | | Game Preview      |  | ...More fields |
|  ImgBB Host    | | Dialog Preview    |  |                |
|                | | [🔄] [🎞️] [🗺️]  |  | Update Scene  |
|                | +------------------+   | Export Project |
+----------------+------------------------+ 🔍Diagnose 📦Chunk|
                                  +--------+-----------------+
                                  | 🎭 Character Profiles      |
                                  +----------------------------+
```

- **Left**: Manage all game assets + ImgBB image hosting
- **Middle Top**: Scene list table — search, navigate, add/delete scenes
- **Middle Bottom**: Live preview of current scene + flowchart button
- **Right**: Edit all properties of the selected scene + character profiles

---

## 2. Left Panel: Asset Library

Eight asset categories from top to bottom:

| Category | Description |
|----------|-------------|
| 🎨 Sprites | Character expressions |
| 🌄 BG | Scene backgrounds |
| 🎵 Music (bgm) | Looping background music |
| 🔊 SFX (se) | Short sound effects |
| 🖼️ CG | Full-screen illustrations |
| 🎙️ Voice | Character voice lines |
| 🎬 Video | Cutscene videos |
| ☁️ ImgBB Hosting | Cloud image hosting (see §21) |

### Adding Assets

Click any category's **"+ Upload XXX"** button and select a file. The system will ask you to give it a **key name**, e.g.:

- Sprites: `hero_smile`, `hero_sad`, `hero_angry`
- Backgrounds: `classroom`, `park`
- Music: `theme_main`, `theme_sad`

> **Tip**: The key name is what you'll use to reference the asset in your script. Use lowercase_underscore, short and memorable.

### Previewing Assets

**Click** on any asset name in the list to preview it. Music and SFX will play for audition.

### Replacing Assets

Each asset has a **"Replace"** button — select a new file to swap it (key name stays the same).

---

## 3. Middle Top: Scene List

A table showing all your scenes. Each row is one scene (one line of dialogue / one performance event).

### Table Columns

| Column | Content |
|--------|---------|
| Index | Scene number (starting from 0) |
| Speaker | Who is speaking |
| Text (short) | First 30 characters of dialogue |
| BG | Background key name |
| Sprite | Character sprite (multi-sprite comma-separated, 🎥=video, 🧹=clear) |
| CG | Associated full-screen CG (🎬=transition) |
| Branch | Choice count (🔀=conditional branch) |
| Subtitle | Chapter subtitle (transition scenes only) |

### Operations

- **Click a row** → Select it, right panel loads automatically
- **"+ Add Scene"** → Append a blank scene at the end (`Ctrl+N`)
- **"Insert Before Current"** → Insert before selected (`Ctrl+Shift+N`)
- **"Delete Selected"** → Delete current scene (minimum 1) (`Delete`)
- **"Locate Next Chapter"** → Jump to next chapter transition scene

### Search

Enter keywords in the search bar (speaker, dialogue text, background, sprite, location, etc.):
- **"Find Next"** — Search forward from current
- **"Previous"** — Search backward from current
- Enter key = Find Next, `Ctrl+F` focuses search box

Search wraps around — reaches the end, continues from the beginning.

---

## 4. Middle Bottom: Live Preview

When a scene is selected, the preview area shows it as it would appear in the game: background, sprites, speaker, dialogue text, choice buttons, affinity bar, effects, location hint, and summary of CG/video/transition/variable info.

Three buttons:
- **"🔄 Refresh Preview"** — Manual re-render (`Ctrl+R`)
- **"🎞️ Preview CG"** — Open CG image in new tab
- **"🗺️ Route Flowchart"** — Open interactive flowchart panel (see §16)

---

## 5. Right Panel: Scene Editor

### Core Fields

| Field | Description | Example |
|-------|-------------|---------|
| Speaker | Who says this line | `Hero`, `Heroine` |
| Dialogue Text | Main text (supports BBCode) | `Hello, I'm…` |
| BG Key | Background image key | `classroom` |
| BGM Key | Background music key | `main_theme` |
| Next Index | Jump target (-1 = end) | `5`, `-1` |

### Sprite Configuration

| Field | Description |
|-------|-------------|
| Multi-sprites (array) | Multiple characters on screen (see §7), leave empty for old single mode |
| Sprite Key (single) | Single sprite, used when multi-sprites is empty |

### Scene Controls

| Field | Description |
|-------|-------------|
| Location Hint | Top-left corner label, e.g. `Classroom` |
| Clear Stage | Yes = all sprites slide out and disappear |
| Chapter Transition | true/false — trigger chapter change here |
| Chapter Subtitle | Chapter name (shown when transition=true) |

### Special Features

| Field | Description |
|-------|-------------|
| Scene Transition | Switch animation (see §11) |
| Insert Video (videoKey) | Play a video clip |
| Set Variable (setVar) | Set game variables (see §10) |
| Conditional Jump (conditionNext) | Auto-branch based on variables (see §10) |
| Insert CG (cgKey) | Full-screen illustration |
| Screen Effects | Filters/shake/flash (see §8) |
| Has Choices | Whether there are player choices (see §9) |

### Endings & Affinity

| Field | Description |
|-------|-------------|
| Ending Key (endingKey) | Ending identifier, e.g. `good_ending` |
| Ending Title (endingTitle) | Displayed ending title, e.g. `Farewell` |
| Affinity | 0–100, -1 = hide bar |
| Affinity Label | Bar label, e.g. `Heroine Affinity` |

### Action Buttons

| Button | Description |
|--------|-------------|
| ⏪ Undo | Undo last action (`Ctrl+Z`), see §18 |
| ⏩ Redo | Redo undone action (`Ctrl+Y`), see §18 |
| 💾 Update Scene | Save edit (`Ctrl+S`) |
| 📦 Export Full Project | Export JSON (`Ctrl+E`) |
| 🔍 Diagnose | Check for issues, see §17 |
| 📂 Import Full Project | Restore from JSON |
| 🔄 Reset Default Data | Restore sample data |
| 📦 Chunked Export | Split by chapters, see §20 |

---

## 6. BBCode: Adding Magic to Text

### Colored Text

```
[c=red]Red text[/c] [c=blue]Blue[/c] [c=gold]Gold[/c] [c=green]Green[/c] [c=pink]Pink[/c]
```

### Style

```
[i]Italic[/i]  [b]Bold[/b]
```

### Animation Effects

```
[shake]This text shakes![/shake]
```

### Font Size

```
[big]Large emphasis[/big]  [small]Whisper quietly[/small]
```

The row of color buttons above the text area let you wrap selected text with a single click.

---

## 7. Multi-Sprite System

Click **"+ Add Sprite Slot"** to add a character:

| Setting | Options |
|---------|---------|
| Sprite | Any sprite key from asset library |
| Position | Left / Center / Right |
| Breathing | Check = gentle floating animation |
| Opacity | 0~1 (0 = fully transparent) |

> If multi-sprite area has content, the old single-sprite field is ignored. Clear multi-sprites to fall back to single.

---

## 8. Screen Effects

### One-shot Filters
Sepia / Grayscale / Blur / Bright / Dark / Saturate-High / Saturate-Low

### Instant Triggers
Shake / Flash / Zoom-In

### Persistent Mood
Warm / Cool / Dramatic / Vignette / Letterbox

### Cleanup
Check "Clear All Effects" to remove everything at once.

Duration: `0` = persistent, milliseconds (e.g. `3000` = 3 seconds) = one-shot.

---

## 9. Branch Choices

Set "Has Choices" to **yes** — the choice editor appears below:

| Field | Description |
|-------|-------------|
| Choice Text | Button display text |
| Jump Index | Scene number to jump to |

Click **"+ Add Choice"** to add, trash icon to delete.

```
Choice 1: Accept invitation → Jump to 5
Choice 2: Decline       → Jump to 8
```

---

## 10. Conditional Branching & Variables (Advanced)

### Variable Assignment (setVar)

Click **"+ Add Variable"** to add key-value pairs:
- Numeric values auto-stored as number type, others as string
- Reference in dialogue with `{varName}`: `We've met {count} times now.`

### Conditional Jump (conditionNext)

Supports `>=` `<=` `>` `<` `==` `!=` operators:
- `affection>=50` → Jump to scene 8
- `metTeacher==true` → Jump to scene 12
- `default` → Fallback when nothing matches

Checked top-to-bottom in order; first match wins.

---

## 11. Scene Transition Effects

| Option | Effect | Best For |
|--------|--------|----------|
| Fade Black | Fade to black then back | Time passage |
| Fade White | Fade to white then back | Flashbacks |
| Slide Right/Left/Up/Down | Mask slides in | Spatial movement |
| Curtain Open/Close | Split from center / close to center | Opening/ending |
| Blinds | Horizontal stripe fade | Interrogation, fragments |
| Zoom In | Circular expand from center | Dreams, imagination |

---

## 12. CG, Video & Voice

- **CG**: Full-screen static illustration, select from cgKey dropdown
- **Video**: Dynamic cutscene, select from videoKey dropdown
- **Voice**: Voice clip file, select from voice key dropdown

---

## 13. Endings & Affinity

- **endingKey**: Ending identifier (`good_ending`, etc.). Auto-recorded when triggered — **the Epilogue AI perceives the ending**.
- **endingTitle**: Ending screen title
- **affinity**: 0–100, -1 = hidden
- **affinityLabel**: Affinity bar label

---

## 14. AI Co-Writing (New Feature)

The editor integrates DeepSeek AI to help polish your dialogue.

### Steps
1. Enter dialogue in the text field
2. Choose a rewrite style: **Gentler / Livelier / More Literary / More Concise / More Emotional**
3. Click **"🤖 AI Rewrite"**
4. AI returns the rewritten text, auto-filled into the text field

### Prerequisites
Requires DeepSeek API Key (shared with Epilogue). A prompt will appear if not set.

### Tips
- Rewrites preserve the original meaning and character identity
- Click again if unsatisfied
- Use **Ctrl+Z** to revert to original at any time

---

## 15. Character Profiles — Character Cards for Epilogue AI (New)

The "🎭 Character Profiles" panel at the bottom of the right column. Exported JSON includes the `characters` field; the Epilogue AI loads it automatically.

### Fields

| Field | Description |
|-------|-------------|
| Character Name | Display name |
| Personality | Character traits |
| Background | Backstory |
| Speech Style | Tone and mannerisms |
| Extra Notes | Other info the AI should know |

### Data Flow

```
Editor fill in → Export JSON (characters) → Place as epilogue_characters.json
→ Epilogue loads → Inject into AI system prompt → AI stays in character
```

The architecture already supports multiple characters for future multi-character AI Epilogue.

---

## 16. Route Flowchart (New Feature)

Click the **"🗺️ Route Flowchart"** button below the preview area to open an interactive panel:

| Color | Meaning |
|-------|---------|
| 🔵 Blue | Normal scene |
| 🟢 Green | Chapter start |
| 🟡 Yellow | Branch choice |
| 🔴 Red | Ending scene |
| ⬜ White border | Currently selected |

Controls: **Scroll to zoom**, **drag to pan**, **Ctrl+scroll** for fine zoom.

---

## 17. Project Diagnostics — Pre-Export Validation (New)

Click **"🔍 Diagnose"** to auto-scan:

| Level | What it checks |
|-------|---------------|
| ❌ Error | All jump indices in bounds |
| ⚠️ Warning | BFS reachability (orphan scenes) |
| ⚠️ Warning | All asset references exist in library |

Diagnostics **run automatically before export** — a confirmation dialog appears if issues are found.

---

## 18. Undo & Redo (New Feature)

| Operation | Shortcut |
|-----------|----------|
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` or `Ctrl+Shift+Z` |

Supports: update scene, add/insert/delete scene, import project, reset defaults.
Up to 50 steps; new actions clear the redo stack. Also available via right-click menu.

---

## 19. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Update scene |
| `Ctrl+E` | Export full project (with auto-diag) |
| `Ctrl+N` | Add scene |
| `Ctrl+Shift+N` | Insert before current |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Delete` | Delete selected scene |
| `Ctrl+R` | Refresh preview |
| `Ctrl+F` | Focus search box |
| `↑` `↓` | Navigate scenes |
| `Space` | Next scene |
| `Esc` | Close popup |
| `Enter` | Search next in search box |

> Inside input fields, only `Ctrl+S`, `Ctrl+Z`, `Ctrl+Y`, and `Esc` are active.

---

## 20. Import, Export & Save

### Full Project Export
`Ctrl+E` exports a single JSON (scenes + assets + characters + image hosting map).

### Chunked Export (New)
Click "📦 Chunked Export" to split by chapters into:
- `galgame_index.json` — Index file
- `chapter_0.json`, `chapter_1.json`… — Each chapter's scenes

**Advantage**: The game engine auto-enables **lazy loading** — loads chapter 0 to start, fetches later chapters in the background as the player approaches. Dramatically reduces initial load time.

### Import
Select a JSON file to import (overwrites current data — back up first).

### Load in Game
Export JSON → Open `index.html` → Title screen "Load Project File" → Select file.

---

## 21. ImgBB Image Hosting

The "☁️ ImgBB Hosting" panel at the bottom of the left column:

1. Get an API Key from [api.imgbb.com](https://api.imgbb.com/)
2. Enter Key → "📁 Select Image Folder" → "🚀 Batch Upload"
3. Upload complete → "📎 Apply to Assets" to replace local paths with CDN URLs

Exported JSON automatically includes `imgbbUrls` mapping; the engine auto-detects them.

---

## 22. Complete Workflow Example

Building "Hero meets Heroine in the classroom":

1. **Prepare assets**: Upload classroom BG, hero_smile/heroine_normal sprites, daily BGM
2. **Set character profiles**: Add hero and heroine character cards
3. **Write scenes**: Fill in speaker, text, background, sprite for each scene
4. **AI polish**: Select dialogue → choose style → click AI Rewrite
5. **Preview & check**: ↑↓ navigate, open flowchart, run diagnostics
6. **Export**: Short project → Ctrl+E; long project → Chunked export

---

## 23. FAQ

### Q: Sprite not showing?
A: Check asset key consistency; check if multi-sprites accidentally filled, overriding single mode.

### Q: Accidentally deleted a scene?
A: Press **Ctrl+Z** to undo — supports up to 50 steps.

### Q: AI Rewrite not responding?
A: Requires DeepSeek API Key (shared with Epilogue). A prompt will appear if not set.

### Q: Branch choices not working?
A: Check "Has Choices" is set to "yes" and each choice's jump index is valid.

### Q: Conditional branching not working?
A: Expression format correct (no spaces), variable name matches setVar, conditions checked in order.

### Q: Export gives errors in game?
A: Run "Diagnose" first to find specific issues (out-of-bounds jumps, missing asset references).

### Q: Chunked export vs. full export?
A: Full export = one large JSON, good for short projects. Chunked = multiple small JSONs with lazy loading, recommended for long projects (200+ scenes).

---

Happy creating!
