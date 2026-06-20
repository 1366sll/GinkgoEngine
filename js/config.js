    // ---------- 资源配置（引擎内置示例）----------
    let assetConfig = {
        bg: { campus: "assets/bg/campus.png" },
        sprites: { char_default: "assets/sprites/character_default.png" },
        bgm: { theme: "assets/bgm/theme.mp3" },
        cg: {},
        se: {},
        voice: {},
        video: {}
    };

    // ———— 可选的资源显示名映射 ————
    // 项目可通过 window.assetDisplayNames 自定义资源显示名
    // 不设置则自动生成：key 下划线→空格 + 首字母大写
    var assetDisplayNames = window.assetDisplayNames || {
        bg: {}, sprites: {}, bgm: {}, cg: {}, se: {}, voice: {}, video: {}
    };
    function getAssetDisplayName(category, key) {
        var map = (assetDisplayNames && assetDisplayNames[category]) || {};
        if (map[key]) return map[key];
        return key.replace(/_/g, " ").replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    }

    // 内置彩蛋 — 展示引擎全部画面演出能力
    // 可用效果: shake vignette vignette_off flash sepia blur bright dark
    //           grayscale saturate-high saturate-low letterbox letterbox_off
    //           zoom-in zoom-out mood-warm mood-cool mood-dramatic mood-clear clear
    const DEFAULT_EGG_SCENES = [
        {
            bg: "campus",
            speaker: "Ginkgo Engine",
            text: "Welcome! [b]No project file loaded.[/b]",
            sprite: "char_default",
            bgm: "theme",
            locationHint: "Engine Demo",
            next: 1,
            triggerChapterTransition: false,
            effects: [
                { type: "zoom-in" },
                { type: "vignette", duration: 2500 }
            ]
        },
        {
            bg: "campus",
            speaker: "Quick Start",
            text: "Load a project JSON in [b]Settings → Project → Load Project File[/b], or place [i]galgame_full_project.json[/i] beside index.html to auto-load.\n\n[right-click] for the context menu — [shake]try it![/shake]",
            sprites: [{ key: "char_default", position: "right", breathing: true }],
            bgm: "theme",
            locationHint: "Quick Start",
            next: 2,
            triggerChapterTransition: false,
            effects: [
                { type: "clear" },
                { type: "flash" }
            ]
        },
        {
            bg: "campus",
            speaker: "Editor",
            text: "Open [b]editor.html[/b] to build your visual novel. Features: visual scene editing, real-time preview, AI co-writing, flowchart, project diagnostics, undo/redo, and more.",
            sprite: null,
            bgm: "theme",
            next: -1,
            triggerChapterTransition: false,
            effects: [
                { type: "mood-warm" },
                { type: "letterbox" }
            ]
        }
    ];
    // 解锁存储 key
    const UNLOCKED_CGS_KEY = 'galgame_unlocked_cgs';
    const UNLOCKED_SPRITES_KEY = 'galgame_unlocked_sprites';
    const UNLOCKED_BGMS_KEY = 'galgame_unlocked_bgms';
    const UNLOCKED_BGS_KEY = 'galgame_unlocked_bgs';
    const UNLOCKED_ENDINGS_KEY = 'galgame_unlocked_endings';
    const ENDING_TIMESTAMPS_KEY = 'galgame_ending_timestamps';
    const ACHIEVEMENTS_KEY = 'galgame_achievements';

    // 初始化/读取解锁列表
    let unlockedCgs = JSON.parse(localStorage.getItem(UNLOCKED_CGS_KEY) || '[]');
    let unlockedSprites = JSON.parse(localStorage.getItem(UNLOCKED_SPRITES_KEY) || '[]');
    let unlockedBgms = JSON.parse(localStorage.getItem(UNLOCKED_BGMS_KEY) || '[]');
    let unlockedBgs = JSON.parse(localStorage.getItem(UNLOCKED_BGS_KEY) || '[]');
    let unlockedEndings = JSON.parse(localStorage.getItem(UNLOCKED_ENDINGS_KEY) || '[]');
    let endingTimestamps = JSON.parse(localStorage.getItem(ENDING_TIMESTAMPS_KEY) || '{}');

    function saveUnlocked() {
        localStorage.setItem(UNLOCKED_CGS_KEY, JSON.stringify(unlockedCgs));
        localStorage.setItem(UNLOCKED_SPRITES_KEY, JSON.stringify(unlockedSprites));
        localStorage.setItem(UNLOCKED_BGMS_KEY, JSON.stringify(unlockedBgms));
        localStorage.setItem(UNLOCKED_BGS_KEY, JSON.stringify(unlockedBgs));
    }

    function unlockEnding(endingKey, endingTitle) {
        if (!unlockedEndings.includes(endingKey)) {
            unlockedEndings.push(endingKey);
            endingTimestamps[endingKey] = Date.now();
            localStorage.setItem(UNLOCKED_ENDINGS_KEY, JSON.stringify(unlockedEndings));
            localStorage.setItem(ENDING_TIMESTAMPS_KEY, JSON.stringify(endingTimestamps));
            showToast('🏆 新结局解锁: ' + (endingTitle || endingKey));
        }
    }

    // 通用解锁函数
    function unlockItem(type, key) {
        if (type === 'cg') {
            if (!unlockedCgs.includes(key)) {
                unlockedCgs.push(key);
                saveUnlocked();
            }
        } else if (type === 'sprite') {
            if (!unlockedSprites.includes(key)) {
                unlockedSprites.push(key);
                saveUnlocked();
            }
        } else if (type === 'bgm') {
            if (!unlockedBgms.includes(key)) {
                unlockedBgms.push(key);
                saveUnlocked();
            }
        } else if (type === 'bg') {
            if (!unlockedBgs.includes(key)) {
                unlockedBgs.push(key);
                saveUnlocked();
            }
        }
    }
    let currentScenes = [];
    let currentIndex = 0;
    let isTyping = false;           // 是否正在打字中
    let typingTimer = null;         // 打字定时器
    let currentTypingText = "";     // 当前正在打字的完整文本
    let typingIndex = 0;            // 已打出字符数
    let pendingNext = false;        // 是否有待执行的下一句（用于自动播放）
    let audioElement = null;                 // BGM Howl 实例 (兼容旧API, 实为 Howler.js Howl 对象)
    let bgmHowl = null;                     // 同 audioElement, 别名
    let currentBgm = null;
    let gameActive = false;
    let userInteracted = false;
    let fastForwardTimer = null;
    let isFastForwarding = false;
    let fastForwardScenePauseUntil = 0;  // 快进时换场景的短暂停顿截止时间戳
    // 手柄支持
    let gamepadEnabled = localStorage.getItem('galgame_gamepad_enabled') !== 'false';
    let gamepadConnected = false;
    let gamepadIndex = -1;
    let prevGamepadButtons = [];
    let gamepadFocusIdx = 0; // 当前聚焦的选项/菜单索引
    const GP_DEADZONE = 0.3;
    const GP_REPEAT_INITIAL = 280;
    const GP_REPEAT_RATE = 90;
    let gpRepeatState = {}; // { buttonIndex: { timer, count, nextTime } }
    const GP_BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, L3: 10, R3: 11, DPAD_UP: 12, DPAD_DOWN: 13, DPAD_LEFT: 14, DPAD_RIGHT: 15 };
    let lastRenderedBgKey = null;        // 上一个已渲染的背景 key
    let resumeFastForwardAfterCG = false;  // CG/选项后自动恢复快进
    let resumeAutoPlayAfterPause = false;  // CG/选项后自动恢复自动播放
    // 热键
    let customFastForwardKey = localStorage.getItem('customFastForwardKey') || 'Control'; // 默认Ctrl
    let customQuickSaveKey = localStorage.getItem('customQuickSaveKey') || 'q';
    let customAutoPlayKey = localStorage.getItem('customAutoPlayKey') || 'Alt'; // 默认Alt
    let lastTriggeredCGUrl = localStorage.getItem('lastTriggeredCGUrl') || null;
    // 封面设置
    let coverImageMode = localStorage.getItem('coverImageMode') || 'lastCG';
    if (coverImageMode === 'randomCG') coverImageMode = 'randomCandidates';
    let coverBgmMode = localStorage.getItem('coverBgmMode') || 'lastBGM';
    if (coverBgmMode === 'randomBGM') coverBgmMode = 'randomCandidates';
    let coverCGCandidates = JSON.parse(localStorage.getItem('galgame_cover_cg_candidates') || '[]');
    let coverBGMCandidates = JSON.parse(localStorage.getItem('galgame_cover_bgm_candidates') || '[]');
    function saveCoverCandidates() {
        localStorage.setItem('galgame_cover_cg_candidates', JSON.stringify(coverCGCandidates));
        localStorage.setItem('galgame_cover_bgm_candidates', JSON.stringify(coverBGMCandidates));
    }
    function toggleCoverCGCandidate(cgKey) {
        const idx = coverCGCandidates.indexOf(cgKey);
        if (idx >= 0) { coverCGCandidates.splice(idx, 1); }
        else { coverCGCandidates.push(cgKey); }
        saveCoverCandidates();
        return idx < 0;
    }
    function toggleCoverBGMCandidate(bgmKey) {
        const idx = coverBGMCandidates.indexOf(bgmKey);
        if (idx >= 0) { coverBGMCandidates.splice(idx, 1); }
        else { coverBGMCandidates.push(bgmKey); }
        saveCoverCandidates();
        return idx < 0;
    }
    let musicProgressInterval = null;
    let currentGalleryMusicKey = null;
    let progressDragKey = null;
    let progressDragBar = null;
    let lastTriggeredBGM = localStorage.getItem('lastTriggeredBGM') || null;
    // 自动播放
    let autoPlayEnabled = false;
    let autoPlayTimer = null;
    let autoPlaySpeed = parseFloat(localStorage.getItem('autoPlaySpeed') || '0.06');
    let minAutoPlayDelay = parseFloat(localStorage.getItem('minAutoPlayDelay') || '1.0');
    let autoPlayTimeout = null;
    let voiceAutoVoiceDone = false;   // 语音是否已播放完毕（auto模式下）
    let voiceAutoTextDone = false;    // 文字等待时间是否已到（auto模式下）
    let voiceAutoTimer = null;        // 语音/文字双条件等待计时器
    let chapterHistory = [];     // 存储本章已过的剧情 { speaker, text, sprite, bg }
    let fullBacklog = [];        // 全部对话历史（回溯用）
    let currentChapterStartIndex = 0;   // 本章开始时的 scene 索引
    let seVolume = 0.8;  // 默认0.8 (80%)
    const SE_VOLUME_KEY = 'galgame_se_volume';
    let voiceVolume = 0.8;  // 语音音量，默认0.8 (80%)
    const VOICE_VOLUME_KEY = 'galgame_voice_volume';
    let textSpeed = parseInt(localStorage.getItem('galgame_text_speed') || '40'); // 打字速度 ms/字
    let adaptiveSpeedEnabled = localStorage.getItem('galgame_adaptive_speed') !== 'false'; // 自适应阅读速度，默认开启
    let _adaptiveSpeedEMA = null;       // 玩家阅读速度的 EMA (ms/字)
    let _textReadyTime = 0;             // 当前句文字完整显示的时间戳
    const ADAPTIVE_MIN = 15;            // 自适应速度下限 (ms/字)
    const ADAPTIVE_MAX = 120;           // 自适应速度上限 (ms/字)
    const ADAPTIVE_ALPHA = 0.35;        // EMA 平滑系数（越大越灵敏）

    // ========== 变量系统 ==========
    let gameVars = {};  // 全局变量存储 { name: value }

    function setVar(name, value) {
        gameVars[name] = value;
    }

    function getVar(name) {
        return gameVars[name];
    }

    // 求值简单条件表达式，支持: >, <, >=, <=, ==, !=
    function evalCondition(condStr) {
        if (!condStr || typeof condStr !== 'string') return true;
        condStr = condStr.trim();
        // 替换变量名为其值
        var expr = condStr.replace(/\b[a-zA-Z_]\w*\b/g, function(match) {
            if (match === 'true') return true;
            if (match === 'false') return false;
            if (match === 'null' || match === 'undefined') return 'null';
            var val = gameVars.hasOwnProperty(match) ? gameVars[match] : match;
            if (typeof val === 'string') return JSON.stringify(val);
            return val;
        });
        try {
            var result = eval('(' + expr + ')');
            return !!result;
        } catch(e) {
            console.warn('[银杏] evalCondition 求值失败:', condStr, e.message);
            return false;
        }
    }

    function resetGameVars() {
        gameVars = {};
        // 重置自动追踪变量
        gameVars._total_scenes = 0;
        gameVars._total_choices = 0;
    }

    // ========== 成就系统 ==========
    const ACHIEVEMENTS = [
        { id: "story_begin",   name: "故事的开端",   desc: "完成第一段剧情对话",           icon: "fa-book-open",       hint: "开始新游戏即可" },
        { id: "first_choice",  name: "命运的岔路",   desc: "第一次面对分支选择",           icon: "fa-code-fork",       hint: "在剧情分支中做出选择" },
        { id: "collector_cg",  name: "记忆收藏家",   desc: "解锁第一张 CG",               icon: "fa-image",           hint: "剧情中触发 CG 展示" },
        { id: "bgm_lover",     name: "旋律旅人",     desc: "听过 3 首不同的 BGM",          icon: "fa-music",           hint: "推进剧情以切换 BGM" },
        { id: "scenes_10",     name: "沉浸读者",     desc: "累计阅读 10 幕场景",           icon: "fa-book",            hint: "持续推进剧情" },
        { id: "scenes_30",     name: "银杏树下的居民", desc: "累计阅读 30 幕场景",          icon: "fa-tree",            hint: "深入探索剧情" },
        { id: "affection_50",  name: "初绽的好感",   desc: "单次好感度变动超过 50",        icon: "fa-heart",           hint: "选择对角色的好感选项" },
        { id: "variable_master",name: "变量操控者",   desc: "使用条件跳转或变量赋值",        icon: "fa-code",            hint: "场景 setVar 或 conditionNext" },
        { id: "backlog_user",  name: "回忆之书",     desc: "打开对话记录回看剧情",          icon: "fa-scroll",          hint: "按 B 键或右键菜单打开" },
        { id: "save_user",     name: "保存记忆",     desc: "首次手动存档",                icon: "fa-floppy-disk",     hint: "在存档页面保存" },
        { id: "ending_first",  name: "第一个结局",   desc: "抵达任意一个结局",             icon: "fa-flag-checkered",  hint: "完成任意路线" },
        { id: "all_endings",   name: "全结局制霸",   desc: "解锁所有结局",                icon: "fa-crown",           hint: "完成全部结局" },
        { id: "rollback_user", name: "时光倒流",     desc: "使用滚轮回溯查看过往剧情",      icon: "fa-rotate-left",     hint: "设置中开启后上滑滚轮" },
        { id: "video_watcher", name: "影像记录",     desc: "观看一段过场视频",             icon: "fa-film",            hint: "触发场景中的视频播放" }
    ];

    let unlockedAchievements = JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY) || '[]');
    let _lastCheckedAchSet = new Set(unlockedAchievements);

    function isAchievementUnlocked(id) {
        return unlockedAchievements.includes(id);
    }

    function unlockAchievement(id) {
        if (!unlockedAchievements.includes(id)) {
            unlockedAchievements.push(id);
            _lastCheckedAchSet.add(id);
            localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(unlockedAchievements));
            var ach = ACHIEVEMENTS.find(function(a) { return a.id === id; });
            if (ach) showToast('\u{1F3C6} 成就解锁: ' + ach.name);
        }
    }

    function checkAchievements() {
        ACHIEVEMENTS.forEach(function(ach) {
            if (_lastCheckedAchSet.has(ach.id)) return;
            var cond = achCondition(ach.id);
            if (cond) unlockAchievement(ach.id);
        });
    }

    function achCondition(id) {
        switch (id) {
            case "story_begin":   return (getVar("_total_scenes") || 0) >= 2;
            case "first_choice":  return (getVar("_total_choices") || 0) >= 1;
            case "collector_cg":  return unlockedCgs.length >= 1;
            case "bgm_lover":     return unlockedBgms.length >= 3;
            case "scenes_10":     return (getVar("_total_scenes") || 0) >= 10;
            case "scenes_30":     return (getVar("_total_scenes") || 0) >= 30;
            case "affection_50":  return (getVar("_max_affinity_delta") || 0) >= 50;
            case "variable_master":return (getVar("_used_variable") || 0) >= 1;
            case "backlog_user":  return (getVar("_opened_backlog") || 0) >= 1;
            case "save_user":     return (getVar("_manual_saved") || 0) >= 1;
            case "ending_first":  return unlockedEndings.length >= 1;
            case "all_endings":   return currentScenes.length > 0 && (function() {
                var map = new Map();
                for (var i = 0; i < currentScenes.length; i++) {
                    var s = currentScenes[i];
                    if (s && s.endingKey) map.set(s.endingKey, true);
                }
                var allKeys = Array.from(map.keys());
                return allKeys.length > 0 && allKeys.every(function(k) { return unlockedEndings.includes(k); });
            })();
            case "rollback_user": return (getVar("_used_rollback") || 0) >= 1;
            case "video_watcher": return (getVar("_watched_video") || 0) >= 1;
            default: return false;
        }
    }

    function resetAchievements() {
        unlockedAchievements = [];
        _lastCheckedAchSet = new Set();
        localStorage.removeItem(ACHIEVEMENTS_KEY);
    }

    // ========== 回溯系统 ==========
    let rollbackStack = [];
    let rollbackPos = -1;  // -1 表示未回溯，>=0 表示回溯到栈中位置
    const MAX_ROLLBACK = 80;
    let isRollingBack = false;  // 正在执行回溯操作，避免重复入栈
    let rollbackEnabled = localStorage.getItem('galgame_rollback_enabled') === 'true'; // 默认关闭
    // 回溯速度：值越小越灵敏（ms 冷却），默认 300ms
    let rollbackCooldown = parseInt(localStorage.getItem('galgame_rollback_cooldown') || '300');
    let lastRollbackTime = 0;

    function clearRollbackStack() {
        rollbackStack = [];
        rollbackPos = -1;
        isRollingBack = false;
        // 同步清除显示状态追踪，避免旧 bg key 残留在下次 pushRollbackState 中被当作有效状态
        currentDisplayBg = '';
        var dialogText = document.getElementById('dialogText');
        if (dialogText) dialogText.innerText = '';
        var speakerName = document.getElementById('speakerName');
        if (speakerName) { speakerName.innerText = '　'; speakerName.classList.add('empty'); }
    }

    function pushRollbackState() {
        if (isRollingBack) return;
        // 如果用户之前回溯过，截断向前历史
        if (rollbackPos >= 0 && rollbackPos < rollbackStack.length - 1) {
            rollbackStack = rollbackStack.slice(0, rollbackPos + 1);
        }
        rollbackPos = -1;
        const state = captureDisplayState();
        // 跳过空状态（首次进入时还没有内容）
        // 用 speakerEmpty 而非 speakerHTML，因为空角色名 innerHTML 含语音指示器 span
        if (state && (state.text || !state.speakerEmpty || state.bg)) {
            rollbackStack.push(state);
            if (rollbackStack.length > MAX_ROLLBACK) rollbackStack.shift();
        }
    }

    function captureDisplayState() {
        // 从 DOM 捕获当前显示状态
        const dialogText = document.getElementById('dialogText');
        const speakerName = document.getElementById('speakerName');
        const spriteImg = document.getElementById('characterSprite');
        const spriteImg2 = document.getElementById('characterSprite2');
        const mcContainer = document.getElementById('multiSpriteContainer');
        const locHint = document.getElementById('locationHint');
        const cgLayer = document.getElementById('cgLayer');
        if (!dialogText) return null;
        // 捕获多角色立绘状态
        let multiSpritesState = null;
        if (mcContainer && mcContainer.children.length > 0) {
            multiSpritesState = [];
            for (let i = 0; i < mcContainer.children.length; i++) {
                const el = mcContainer.children[i];
                multiSpritesState.push({
                    key: el.dataset.spriteKey || '',
                    src: el.src || '',
                    position: el.dataset.spritePosition || 'right',
                    opacity: el.style.opacity || '1'
                });
            }
        }
        // 角色名 HTML 去掉语音指示器，避免空场景的 innerHTML 仍为 truthy
        let cleanSpeakerHTML = '';
        let speakerEmpty = true;
        if (speakerName) {
            speakerEmpty = speakerName.classList.contains('empty');
            if (!speakerEmpty) {
                var clone = speakerName.cloneNode(true);
                var vi = clone.querySelector('#voiceIndicator');
                if (vi) vi.remove();
                cleanSpeakerHTML = clone.innerHTML;
            }
        }
        // 判断 sprite src 是否有效（src="" 时浏览器会返回页面 URL）
        function _validSpriteSrc(el) {
            if (!el || !el.src) return '';
            var s = el.src;
            // 排除浏览器将空 src 解析为页面 URL 的情况
            if (s === window.location.href || s.endsWith('.html') || s.endsWith('/')) return '';
            return s;
        }
        return {
            bg: currentDisplayBg || '',
            bgm: currentBgm || '',
            speakerHTML: cleanSpeakerHTML,
            speakerEmpty: speakerEmpty,
            text: dialogText.innerText || '',
            sprite1Src: _validSpriteSrc(spriteImg),
            sprite2Src: _validSpriteSrc(spriteImg2),
            sprite2Opacity: spriteImg2 ? spriteImg2.style.opacity : '0',
            hasActiveSprite: hasActiveSprite || false,
            multiSprites: multiSpritesState,
            locationHint: locHint ? locHint.innerText : '',
            locationHintVisible: locHint ? locHint.classList.contains('show') : false,
            cgVisible: cgLayer ? cgLayer.classList.contains('show') : false,
            sceneIndex: currentIndex
        };
    }

    let currentDisplayBg = '';

    function setCurrentDisplayBg(bgKey) {
        currentDisplayBg = bgKey;
    }
