# Epilogue · Ginkgo Engine — Technical Documentation

> 📂 **Doc Index**: [English README](README.md) · [Editor Guide](Editor_Guide_EN.md) · [Player Guide](Player_Guide_EN.md) · [中文文档](README_CN.md#文档导航)

## Overview

The Epilogue is an AI conversation mode unlocked after completing the main story. The player takes on the role of the protagonist and freely chats with a character. The system uses the DeepSeek API for response generation, combined with Live2D character model real-time rendering.

### New Features (2026-06)

| Feature | Description |
|---------|-------------|
| **Multi-ending Awareness** | URL parameter passes endingKey; AI character adapts their attitude accordingly |
| **Character Profile Sync** | Loads character settings from editor-exported `epilogue_characters.json` |
| **Enhanced Chat Export** | Downloads both TXT + beautifully styled HTML, with conversation statistics |
| **Choice History Awareness** | AI knows what key choices the player made during the main game |
| **Multi-character Architecture** | Supports loading multiple character profiles, ready for multi-character conversations |
| **Lazy Loading Compatible** | Works seamlessly with chunked project loading from the main engine |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Character Rendering | Live2D Cubism 5 SDK (Core + Framework) |
| AI Chat | DeepSeek Chat API (streaming) |
| TTS Voice | Web Speech API (SpeechSynthesisUtterance) |
| Particle Effects | tsParticles.js |
| Audio | Howler.js (BGM playback) |
| 3D Rendering | WebGL 2.0 |

---

## File Structure

```
├── epilogue.html                  # Entry page
├── EPILOGUE_README.md             # This document
├── epilogue_characters.json       # ★ Character profiles (editor export)
├── characters/template/
│   └── prompt_template.txt        # AI character prompt template
├── live2d/
│   ├── core/live2dcubismcore.min.js
│   ├── live2dcubismframework.js
│   ├── models/Haru/               # Haru character model
│   └── shaders/                   # GLSL shaders (13 files)
├── js/epilogue/
│   ├── ep-api.js                  # DeepSeek API client (streaming + key encryption)
│   ├── ep-engine.js               # ★ Main state machine + ending awareness + profile loading
│   ├── ep-ui.js                   # Chat panel, BBCode, settings, chat export
│   ├── ep-tts.js                  # Text-to-speech synthesis
│   ├── ep-emotion.js              # Emotion detection → expression mapping
│   ├── ep-memory.js               # Conversation memory (short-term + long-term summary)
│   ├── ep-effects.js              # Screen effects
│   ├── ep-customize.js            # Scene customization panel
│   ├── ep-live2d.js               # Live2D rendering adapter
│   └── ep-gaze.js                 # Gaze tracking
├── css/
│   ├── gal-core.css               # Core game styles
│   └── epilogue.css               # Epilogue styles
├── assets/                        # Asset directories
└── BGM/                           # Background music
```

---

## Architecture

```
Browser Events
    │
    ▼
┌─ ep-engine.js ──────────────────────────────────────┐
│ State Machine: IDLE → WAITING → THINKING → SPEAKING │
│                                                     │
│  init()                                             │
│    ├→ readUrlContext()       ★ Read ending/choices   │
│    ├→ loadSystemPrompt()     ★ Merge character profile│
│    ├→ loadCharacterProfiles() ★ Load external profiles│
│    ├→ EpilogueMemory.init()                         │
│    ├→ EpilogueTTS.init()                            │
│    └→ EpilogueUI.init()                             │
│                                                     │
│  sendMessage(text)                                  │
│    ├→ EpilogueAPI.chatStream({...})                 │
│    │   onToken → EpilogueUI.appendToken()            │
│    │   onComplete                                  │
│    │     ├→ EpilogueEmotion.detect() → expression    │
│    │     ├→ EpilogueUI.updateSprite()               │
│    │     ├→ EpilogueLive2D.setEmotion()             │
│    │     ├→ EpilogueTTS.speak() → voice             │
│    │     └→ EpilogueMemory.addTurn() → memory       │
│    └→ Return to IDLE                                │
└─────────────────────────────────────────────────────┘
```

---

## New Features in Detail

### 1. Multi-Ending Awareness

The Epilogue receives ending info via URL parameters:

```
epilogue.html?ending=good_ending&choices=[...]
```

**Data sources**:
- `ending` — stored to `galgame_last_ending` when `unlockEnding(key, title)` fires in the main game
- `choices` — recorded to `galgame_choice_history` each time the player makes a choice (last 20 entries)

**System prompt injection**:

```javascript
function buildEndingContext() {
  // Inject different ending background text based on endingKey
  // good_ending / normal_ending / true_ending each have dedicated text
  // Unrecognized endingKeys use a generic fallback
}
```

**Effect**: The same topic across different endings will elicit different attitudes and memories from the AI character.

### 2. Character Profile Sync

**Editor → Epilogue data flow**:

```
Editor Character Profile Panel
  ↓ Fill in name/personality/background/speechStyle
Export JSON (characters field)
  ↓ Place in project folder
epilogue_characters.json
  ↓ Loaded by ep-engine.js
mergeCharacterProfile(systemPrompt, profile)
  ↓
Injected into AI system prompt
```

`mergeCharacterProfile()` supports two modes:
- **Full replacement**: when profile has `systemPrompt` field, replace entire prompt
- **Field append**: append personality/background/speech style to existing prompt

```json
{
  "character_id": {
    "name": "Character Name",
    "personality": "Quiet and thoughtful, speaks in short sentences…",
    "background": "Grew up in a small town…",
    "speechStyle": "Often uses '...' to pause, says 'maybe' a lot",
    "extraNotes": "Afraid of thunder, loves autumn leaves"
  }
}
```

### 3. Enhanced Chat Export

Click 📥 export button:
- **TXT file**: Plain text record with timestamp and conversation statistics
- **HTML file**: Beautifully styled page, dark theme, user messages with blue left border, character messages with gold left border
- Confirmation toast appears after export completes

### 4. Multi-Character Architecture

The engine already supports loading multiple character profiles. `loadCharacterProfiles()` loads all characters from the JSON. The current UI converses with one character, but the architecture is ready for multi-character switching:
- `_characterProfiles` stores all character data
- `mergeCharacterProfile()` can extract specific characters on demand
- Switching conversation target only requires resetting the system prompt + switching the Live2D model/Sprite

---

## Live2D Subsystem

### Render Pipeline (per frame)

```
beginFrameProcess(gl)           # Offscreen management
  → model.loadParameters()      # Restore saved parameters
  → motionManager.updateMotion() # Motion interpolation
  → model.saveParameters()      # Save parameters
  → breath.updateParameters()   # Breathing (5 parameters)
  → updateMouseTrack()          # Mouse tracking (6 parameters)
  → updateEyeBlink()            # Blink state machine
  → updateLipSync()             # Lip sync (TTS-linked)
  → physics.evaluate()          # Hair/cloth physics
  → pose.updateParameters()     # Arm part exclusivity
  → wind.updateParameters()     # Wind system
  → model.update()              # Vertex deformation
  → renderer.drawModel()        # WebGL draw
  → endFrameProcess(gl)         # Offscreen cleanup
```

### Implemented Features

| Feature | Status |
|---------|--------|
| Model Rendering (CubismRenderer_WebGL) | ✅ |
| Motion Animation (28 motion files) | ✅ |
| Idle Loop (2~3s interval auto-switch) | ✅ |
| Expression Switching (8 × F01-F08) | ✅ |
| Breathing Animation (5 parameters) | ✅ |
| Eye Blink (custom state machine) | ✅ |
| Lip Sync (TTS-linked) | ✅ |
| Physics Simulation (hair/cloth) | ✅ |
| Wind System (random breeze/gust) | ✅ |
| Mouse Tracking (6 parameters) | ✅ |
| Touch Support | ✅ |
| Tap Interaction (TapBody random motion) | ✅ |
| HiDPI | ✅ |
| PNG ↔ Live2D Toggle | ✅ |

---

## BBCode Tag System

The AI can use the following tags in replies (taught via the system prompt).

### Text Effects

| Tag | Effect | TTS | Expression |
|-----|--------|-----|------------|
| `[b]text[/b]` | Bold | Reads | Affects |
| `[i]text[/i]` | Italic light | Reads | Affects |
| `[big]text[/big]` | Enlarged | Reads | Affects |
| `[small]text[/small]` | Small grey | Reads | Affects |
| `[c=red]text[/c]` | Colored | Reads | Affects |
| `[inner]text[/inner]` | Grey italic | **Skips** | **No effect** |

### Screen Effects (max 1 per message)

| Tag | Effect |
|-----|--------|
| `[flash]` | White flash |
| `[shake]` | Screen shake |
| `[sepia]` | Sepia filter (memory) |
| `[vignette]` | Vignette focus |
| `[warm]` | Warm tone |
| `[cool]` | Cool tone |
| `[dark]` | Darken |
| `[blur]` | Blur |
| `[bright]` | Brighten |

---

## Settings Panel (⚙️)

| Item | Description |
|------|-------------|
| Typing Speed | 15~120 ms/char |
| BGM Volume | 0~100% |
| Voice Volume | 0~100% |
| Character Rendering | Live2D / Static Sprite toggle |
| API Key | DeepSeek API Key management (browser-fingerprint encrypted) |

---

## Scene Panel (🎨)

| Tab | Content |
|-----|---------|
| Background | Scene backgrounds |
| Music | BGM preview and switch |
| Sprite | Character sprite selection |

---

## API Reference

### EpilogueEngine

```javascript
EpilogueEngine.init()                            // Initialize
EpilogueEngine.sendMessage('Hello!')             // Send message
EpilogueEngine.regenerate()                      // Regenerate last reply
EpilogueEngine.reset()                           // Reset conversation
EpilogueEngine.getState()                        // Get current state
EpilogueEngine.getQuickTopics()                  // Get quick topics
```

### EpilogueAPI

```javascript
EpilogueAPI.hasKey()                             // Check if key is set
EpilogueAPI.saveKey('sk-xxx')                    // Save key (encrypted)
EpilogueAPI.getKey()                             // Get key (decrypted)
EpilogueAPI.chatStream({...})                    // Stream chat
EpilogueAPI.getUsage()                           // Get token usage
EpilogueAPI.resetUsage()                         // Reset usage stats
```

### EpilogueLive2D

```javascript
EpilogueLive2D.init('live2d/models/Haru/Haru.model3.json')
EpilogueLive2D.setEmotion('happy')               // happy|sad|surprised|shy|thinking|angry
EpilogueLive2D.startLipSync()                    // Start lip sync
EpilogueLive2D.stopLipSync()                     // Stop lip sync
EpilogueLive2D.startDialogue()                   // Dialogue start (suppress motion SFX)
EpilogueLive2D.endDialogue()                     // Dialogue end (restore motion SFX)
EpilogueLive2D.destroy()                         // Destroy
EpilogueLive2D.isReady()                         // Check readiness
```

---

## Boot Sequence

1. Browser loads `epilogue.html`
2. Splash screen displayed; click to begin
3. `readUrlContext()` — reads ending and choice history parameters
4. `loadSystemPrompt()` — loads external prompt file + merges character profile + injects ending context
5. `loadCharacterProfiles()` — loads `epilogue_characters.json`
6. Async Live2D initialization (non-blocking)
7. Static PNG sprite shown first; Live2D takes over automatically when ready
8. Silent degradation to PNG on failure

---

## Local Development

```bash
node server.js
# Open http://localhost:3000/epilogue.html
# With ending: http://localhost:3000/epilogue.html?ending=good_ending
```

> ⚠️ Cannot use `file://` protocol — requires HTTP server for JSON/texture/shader loading.

---

## Lessons Learned

| Issue | Root Cause | Solution |
|-------|-----------|----------|
| Four arms | Pose not loaded → arm exclusivity broken | `CubismPose.create()` + per-frame `updateParameters()` |
| All-black textures | Missing `UNPACK_PREMULTIPLY_ALPHA` | Align with Demo approach |
| Texture misalignment | Normalized UV divided by texture size again | Use raw UV directly |
| Inverted textures | WebGL default no Y-flip | `UNPACK_FLIP_Y_WEBGL = true` |
| Motion crash | `setEffectIds([], [])` not called | Call immediately after creation with empty arrays |
| Frozen motion | `updateMotion` read-only, missing `saveParameters` | Add load→update→save cycle |
| Frame rate stutter | New Float32Array(73) per frame | Pool reuse |
| Canvas invisible | `width:auto` collapses to 0 when img hidden | JS calculates width from height |
| `pointer-events:none` | CSS blocks all clicks | JS overrides to `auto` |
| Head tracking infinite spin | `addParameterValueById` mistaken as set | Changed to delta-based add |
| Idle during speech | `isSpeaking` not checked | Guard added at `tryIdle()` start |
| HiDPI blur | Canvas not scaled by DPR | `canvas.width × devicePixelRatio` |
| Cubism 4 vs 5 | API changed from OOP to namespaces | Adapted to Cubism 5 Core |

---

## Dependencies

| Dependency | Source | Notes |
|-----------|--------|-------|
| `live2dcubismcore.min.js` | Live2D Cubism 5 SDK | Must download |
| `live2dcubismframework.js` | SDK Framework/src/ esbuild | Included in project |
| `live2d/shaders/` | SDK Framework/Shaders/WebGL/ | 13 .vert/.frag files |
| tsParticles | CDN | Particle effects |
| Font Awesome 6 | CDN | Icons |
| Animate.css | CDN | Animations |
| Noto Serif SC | Google Fonts CDN | Chinese font |

---

## License

- Live2D Cubism SDK: Free for individual developers with annual revenue < 10M JPY. See [Live2D EULA](https://www.live2d.com/eula/)
- Haru character model: Live2D official free sample model
