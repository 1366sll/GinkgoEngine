    // ========== 资源预加载系统 ==========
    const imageCache = new Map();       // url → 已加载的HTMLImageElement
    const pendingLoads = new Map();     // url → Promise<HTMLImageElement>
    let preloadInProgress = 0;          // 当前正在预加载的数量

    function preloadImage(url) {
        if (!url) return Promise.resolve(null);
        if (imageCache.has(url)) return Promise.resolve(imageCache.get(url));
        if (pendingLoads.has(url)) return pendingLoads.get(url);
        preloadInProgress++;
        updateLoadingIndicator();
        const promise = new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                imageCache.set(url, img);
                pendingLoads.delete(url);
                preloadInProgress--;
                updateLoadingIndicator();
                resolve(img);
            };
            img.onerror = () => {
                pendingLoads.delete(url);
                preloadInProgress--;
                updateLoadingIndicator();
                resolve(null);
            };
            img.src = url;
        });
        pendingLoads.set(url, promise);
        return promise;
    }

    function preloadSceneAssets(sceneIndex) {
        if (sceneIndex < 0 || sceneIndex >= currentScenes.length) return;
        const scene = currentScenes[sceneIndex];
        if (!scene) return;
        if (scene.bg && assetConfig.bg?.[scene.bg]) {
            preloadImage(assetConfig.bg[scene.bg]).catch(() => {});
        }
        if (scene.sprite && assetConfig.sprites?.[scene.sprite]) {
            preloadImage(assetConfig.sprites[scene.sprite]).catch(() => {});
        }
        if (scene.sprites && Array.isArray(scene.sprites)) {
            scene.sprites.forEach(spr => {
                if (spr.key && assetConfig.sprites?.[spr.key]) {
                    preloadImage(assetConfig.sprites[spr.key]).catch(() => {});
                }
            });
        }
        if (scene.cgKey && assetConfig.cg?.[scene.cgKey]) {
            preloadImage(assetConfig.cg[scene.cgKey]).catch(() => {});
        }
    }

    function preloadAhead(fromIndex, count = 5) {
        for (let i = 1; i <= count; i++) {
            preloadSceneAssets(fromIndex + i);
        }
    }

    function preloadAllProjectAssets() {
        // 预加载项目中所有已知图片
        Object.values(assetConfig.bg || {}).forEach(url => preloadImage(url).catch(() => {}));
        Object.values(assetConfig.sprites || {}).forEach(url => preloadImage(url).catch(() => {}));
        Object.values(assetConfig.cg || {}).forEach(url => preloadImage(url).catch(() => {}));
        // 预加载所有视频和音频到浏览器缓存（低优先级，后台静默下载）
        preloadAllMedia();
    }

    // ========== 视频/音频预加载 ==========
    const _mediaCache = new Map(); // url → true（下载过了就跳过）

    function preloadMedia(url) {
        if (!url || _mediaCache.has(url)) return Promise.resolve();
        // 使用 fetch 将文件送入浏览器 HTTP 缓存
        // Howler.js 和 <video> 后续请求同一 URL 时直接命中缓存，无网络延迟
        return fetch(url, { mode: 'cors', cache: 'force-cache' })
            .then(function(res) {
                if (res.ok) _mediaCache.set(url, true);
                return res.blob().then(function() {});  // 消耗 body 完成下载
            })
            .catch(function() { /* 静默失败，不影响游戏 */ });
    }

    function preloadAllMedia() {
        // 预加载所有 BGM（音频文件通常较小）
        Object.values(assetConfig.bgm || {}).forEach(function(url) {
            preloadMedia(url);
        });
        // 预加载所有视频（文件大，但不阻塞 —— 浏览器会按优先级下载）
        Object.values(assetConfig.video || {}).forEach(function(url) {
            preloadMedia(url);
        });
        // 预加载语音
        Object.values(assetConfig.voice || {}).forEach(function(url) {
            preloadMedia(url);
        });
    }

    function preloadMediaAhead(fromIndex, count) {
        // 预加载后续场景可能用到的音频/视频
        if (fromIndex < 0 || !currentScenes || !currentScenes.length) return;
        var seenBgm = {}, seenVideo = {}, seenVoice = {};
        for (var i = 1; i <= count; i++) {
            var idx = fromIndex + i;
            if (idx >= currentScenes.length) break;
            var scene = currentScenes[idx];
            if (!scene) continue;
            // BGM
            if (scene.bgm && assetConfig.bgm && assetConfig.bgm[scene.bgm] && !seenBgm[scene.bgm]) {
                seenBgm[scene.bgm] = true;
                preloadMedia(assetConfig.bgm[scene.bgm]);
            }
            // Video
            if (scene.videoKey && assetConfig.video && assetConfig.video[scene.videoKey] && !seenVideo[scene.videoKey]) {
                seenVideo[scene.videoKey] = true;
                preloadMedia(assetConfig.video[scene.videoKey]);
            }
            // Voice
            if (scene.voice && assetConfig.voice && assetConfig.voice[scene.voice] && !seenVoice[scene.voice]) {
                seenVoice[scene.voice] = true;
                preloadMedia(assetConfig.voice[scene.voice]);
            }
        }
    }

    function updateLoadingIndicator() {
        const indicator = document.getElementById('loadingIndicator');
        if (!indicator) return;
        if (preloadInProgress > 0) {
            indicator.classList.add('show');
        } else {
            indicator.classList.remove('show');
        }
    }

    function waitForImage(url) {
        // 等待图片加载完毕（如果已在缓存则立即返回）
        return preloadImage(url);
    }

    let isSkipRead = false;      // 已读跳过模式
    let skipReadTimer = null;
    let _readSceneProjectId = ''; // 当前项目的指纹，用于隔离不同项目的已读记录
    function _getReadSceneKey() { return 'galgame_read_' + (_readSceneProjectId || 'default'); }
    function _initReadSceneSet(scenes) {
        if (scenes) _setProjectFingerprint(scenes);
        readSceneSet = new Set(JSON.parse(localStorage.getItem(_getReadSceneKey()) || '[]'));
        lastChosenBranch.clear();
    }
    function _setProjectFingerprint(scenes) {
        if (!scenes || !scenes.length) { _readSceneProjectId = ''; return; }
        var sample = scenes.length + '|' +
            (scenes[0] && scenes[0].text ? scenes[0].text.slice(0, 30) : '') + '|' +
            (scenes[scenes.length - 1] && scenes[scenes.length - 1].text ? scenes[scenes.length - 1].text.slice(0, 30) : '');
        var hash = 0;
        for (var i = 0; i < sample.length; i++) { hash = ((hash << 5) - hash + sample.charCodeAt(i)) | 0; }
        _readSceneProjectId = 'p' + Math.abs(hash).toString(36);
    }
    let readSceneSet = new Set(); // 由 _initReadSceneSet() 填充
    let lastChosenBranch = new Map(); // 记录每个分支场景上次选择的选项索引，供已读跳过使用
    let cgNavKeys = [];          // 当前 CG 导航列表
    let cgNavIndex = -1;         // 当前 CG 在列表中的索引
    let musicPlaylistTimer = null;
    let isMusicContinuous = false;
    let spriteTransitionMode = localStorage.getItem('galgame_sprite_transition') || 'crossfade'; // 'crossfade' | 'instant'
    // 音乐名称映射（全局共享，避免重复定义）
    const MUSIC_NAME_MAP = {};
    // Auto-generate from asset keys
    (function() {
        Object.keys(assetConfig.bgm || {}).forEach(function(k) {
            MUSIC_NAME_MAP[k] = (typeof getAssetDisplayName === 'function')
                ? getAssetDisplayName('bgm', k)
                : k.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
        });
    })();

    // DOM 元素
    const bgLayer = document.getElementById('bgLayer');
    const hotkeySettingsBtn = document.getElementById('hotkeySettingsBtn');
    const hotkeySubmenu = document.getElementById('hotkeySubmenu');
    const backToSettingsBtn = document.getElementById('backToSettingsBtn');
    const musicHint = document.getElementById('musicHint');
    const choicesContainer = document.getElementById('choicesContainer');
    const actionBar = document.getElementById('actionBar');   // 如果要对 action-bar 做显隐控制
    const spriteWrapper = document.getElementById('spriteWrapper');
    const spriteImg = document.getElementById('characterSprite');
    const spriteImg2 = document.getElementById('characterSprite2');
    const speakerEl = document.getElementById('speakerName');
    const dialogTextEl = document.getElementById('dialogText');
    const nextBtn = document.getElementById('nextBtn');
    const titleMenu = document.getElementById('titleMenu');
    const galleryPage = document.getElementById('galleryPage');
    const chapterTransition = document.getElementById('chapterTransition');
    const locationHintEl = document.getElementById('locationHint');
    const fastForwardBtn = document.getElementById('fastForwardBtn');
    const skipChapterBtn = document.getElementById('skipChapterBtn');
    const settingsIcon = document.getElementById('settingsIcon');
    const settingsModal = document.getElementById('settingsModal');
    const bgmToggleBtn = document.getElementById('bgmToggleBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    const settingsSaveBtn = document.getElementById('settingsSaveBtn');
    const settingsReturnTitleBtn = document.getElementById('settingsReturnTitleBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const continueBtn = document.getElementById('continueBtn');
    const startGameMainBtn = document.getElementById('startGameMainBtn');
    const settingsMainBtn = document.getElementById('settingsMainBtn');
    const startGameSubmenu = document.getElementById('startGameSubmenu');
    const settingsSubmenu = document.getElementById('settingsSubmenu');
    const backBtns = document.querySelectorAll('.back-btn');
    const menuVolumeSlider = document.getElementById('menuVolumeSlider');
    const projectSettingsBtn = document.getElementById('projectSettingsBtn');
    const autoPlaySettingsBtn = document.getElementById('autoPlaySettingsBtn');
    const autoPlaySubmenu = document.getElementById('autoPlaySubmenu');
    const backToSettingsFromAutoPlay = document.getElementById('backToSettingsFromAutoPlayBtn');
    const gamepadSettingsBtn = document.getElementById('gamepadSettingsBtn');
    const gamepadSubmenu = document.getElementById('gamepadSubmenu');
    const backToSettingsFromGamepad = document.getElementById('backToSettingsFromGamepadBtn');
    const gamepadEnabledCheckbox = document.getElementById('gamepadEnabledCheckbox');
    const minDelaySlider = document.getElementById('minDelaySlider');
    const minDelayValue = document.getElementById('minDelayValue');
    const menuMinDelaySlider = document.getElementById('menuMinDelaySlider');
    const menuMinDelayValue = document.getElementById('menuMinDelayValue');
    const currentMusicDisplay = document.getElementById('currentMusicDisplay');
    const bgLayer2 = document.getElementById('bgLayer2');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const skipReadBtn = document.getElementById('skipReadBtn');
    const backlogOverlay = document.getElementById('backlogOverlay');
    const backlogList = document.getElementById('backlogList');
    const backlogCloseBtn = document.getElementById('backlogCloseBtn');
    const cgPrevBtn = document.getElementById('cgPrevBtn');
    const cgNextBtn = document.getElementById('cgNextBtn');
    const textSpeedSlider = document.getElementById('textSpeedSlider');
    const textSpeedValue = document.getElementById('textSpeedValue');
    const menuTextSpeedSlider = document.getElementById('menuTextSpeedSlider');
    const menuTextSpeedValue = document.getElementById('menuTextSpeedValue');
    const galleryNowPlaying = document.getElementById('galleryNowPlaying');

    function showAutoPlaySubmenu() {
        settingsSubmenu.style.display = 'none';
        autoPlaySubmenu.style.display = 'flex';
    }

    if (autoPlaySettingsBtn) autoPlaySettingsBtn.onclick = showAutoPlaySubmenu;
    if (backToSettingsFromAutoPlay) backToSettingsFromAutoPlay.onclick = showSettingsMain;
    function showGamepadSubmenu() {
        settingsSubmenu.style.display = 'none';
        if (gamepadSubmenu) gamepadSubmenu.style.display = 'flex';
        if (gamepadEnabledCheckbox) gamepadEnabledCheckbox.checked = gamepadEnabled;
    }
    if (gamepadSettingsBtn) gamepadSettingsBtn.onclick = showGamepadSubmenu;
    if (backToSettingsFromGamepad) backToSettingsFromGamepad.onclick = showSettingsMain;
    if (gamepadEnabledCheckbox) {
        gamepadEnabledCheckbox.checked = gamepadEnabled;
        gamepadEnabledCheckbox.addEventListener('change', function() {
            gamepadEnabled = this.checked;
            saveGamepadSetting();
            updateGamepadIndicator();
            if (!gamepadEnabled) {
                gamepadConnected = false;
                gamepadIndex = -1;
                prevGamepadButtons = [];
                gpRepeatState = {};
            }
            showToast(gamepadEnabled ? '手柄已启用' : '手柄已禁用');
        });
    }
    const volumeSettingsBtn = document.getElementById('volumeSettingsBtn');
    const projectSubmenu = document.getElementById('projectSubmenu');
    const volumeSubmenu = document.getElementById('volumeSubmenu');
    const backToSettingsFromProject = document.getElementById('backToSettingsFromProjectBtn');
    const backToSettingsFromVolume = document.getElementById('backToSettingsFromVolumeBtn');
    const menuVolumeValue = document.getElementById('menuVolumeValue');

    function showToast(msg) {
        const toast = document.getElementById('saveToast');
        toast.innerText = msg;
        toast.style.opacity = '1';
        setTimeout(() => toast.style.opacity = '0', 2000);
    }

    // ========== IndexedDB 存储系统 ==========
    const DB_NAME = 'galgame_storage_v2';
    const DB_VERSION = 1;
    let dbInstance = null;

    function openDB() {
        if (dbInstance) return Promise.resolve(dbInstance);
        return new Promise(function(resolve, reject) {
            if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB not supported')); return; }
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('project')) db.createObjectStore('project', { keyPath: 'id' });
            };
            req.onsuccess = function(e) { dbInstance = e.target.result; resolve(dbInstance); };
            req.onerror = function(e) { reject(e.target.error); };
        });
    }

    function dbPut(storeName, data) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readwrite');
                tx.objectStore(storeName).put(data);
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    function dbGet(storeName, id) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readonly');
                var req = tx.objectStore(storeName).get(id);
                req.onsuccess = function() { resolve(req.result); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    function dbDelete(storeName, id) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readwrite');
                tx.objectStore(storeName).delete(id);
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    function dbClearStore(storeName) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(storeName, 'readwrite');
                tx.objectStore(storeName).clear();
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    // 旧版 localStorage key
    const SAVE_SLOTS_KEY = 'galgame_save_slots';
    const AUTOSAVE_KEY = 'galgame_autosave';
    const SAVE_SLOT_COUNT = 5;

    // 内存缓存（同步读取，异步写入 IndexedDB）
    let saveSlotsCache = null;
    let autoSaveCache = null;
    let storageReady = false;

    // 初始化：从 IndexedDB 加载（失败则回退 localStorage）
    async function initStorage() {
        try {
            var slotsData = await dbGet('saves', 'slots');
            if (slotsData && Array.isArray(slotsData.slots)) {
                saveSlotsCache = slotsData.slots.concat(Array(SAVE_SLOT_COUNT - slotsData.slots.length).fill(null)).slice(0, SAVE_SLOT_COUNT);
            } else {
                // 尝试从 localStorage 迁移
                saveSlotsCache = _loadSlotsLegacy();
                if (saveSlotsCache.some(function(s) { return !!s; })) {
                    await dbPut('saves', { id: 'slots', slots: saveSlotsCache });
                }
            }

            var autoData = await dbGet('saves', 'autosave');
            if (autoData && autoData.data) {
                autoSaveCache = autoData.data;
            } else {
                autoSaveCache = _loadAutoLegacy();
                if (autoSaveCache) {
                    await dbPut('saves', { id: 'autosave', data: autoSaveCache });
                }
            }

            storageReady = true;
        } catch(e) {
            console.warn('IndexedDB 不可用，回退到 localStorage:', e.message);
            saveSlotsCache = _loadSlotsLegacy();
            autoSaveCache = _loadAutoLegacy();
            storageReady = true;
        }
    }

    function _loadSlotsLegacy() {
        var raw = localStorage.getItem(SAVE_SLOTS_KEY);
        if (!raw) return Array(SAVE_SLOT_COUNT).fill(null);
        try {
            var slots = JSON.parse(raw);
            if (Array.isArray(slots)) return slots.concat(Array(SAVE_SLOT_COUNT - slots.length).fill(null)).slice(0, SAVE_SLOT_COUNT);
        } catch(e) {}
        return Array(SAVE_SLOT_COUNT).fill(null);
    }

    function _loadAutoLegacy() {
        try { return JSON.parse(localStorage.getItem(AUTOSAVE_KEY)); } catch(e) {}
        return null;
    }

    function _writeSlotsLegacy(slots) {
        try { localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(slots.slice(0, SAVE_SLOT_COUNT))); } catch(e) {}
    }

    function _writeAutoLegacy(save) {
        try {
            if (save === null) localStorage.removeItem(AUTOSAVE_KEY);
            else localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(save));
        } catch(e) {}
    }

    function getSaveSlots() {
        if (!storageReady) return _loadSlotsLegacy();
        return saveSlotsCache || Array(SAVE_SLOT_COUNT).fill(null);
    }

    function setSaveSlots(slots) {
        saveSlotsCache = slots.slice(0, SAVE_SLOT_COUNT);
        _writeSlotsLegacy(saveSlotsCache);
        dbPut('saves', { id: 'slots', slots: saveSlotsCache }).catch(function(){});
        updateContinueButtonState();
    }

    function getAutoSave() {
        if (!storageReady) return _loadAutoLegacy();
        return autoSaveCache;
    }

    function setAutoSave(save) {
        autoSaveCache = save;
        _writeAutoLegacy(save);
        dbPut('saves', { id: 'autosave', data: save }).catch(function(){});
        updateContinueButtonState();
    }

    function hasAnySave() {
        return !!getAutoSave() || getSaveSlots().some(function(slot) { return slot && typeof slot.sceneIndex === 'number'; });
    }

    // 项目数据存储到 IndexedDB
    function dbStoreProject(scenes, assets) {
        var data = { id: 'current', scenes: scenes, assets: assets, updatedAt: Date.now() };
        dbPut('project', data).catch(function(){});
        // 同时保留 localStorage 备份（裁剪后，防止超限）
        try {
            localStorage.setItem('galgame_full_project', JSON.stringify({ scenes: scenes, assets: assets }));
        } catch(e) {
            // localStorage 满了，只保留 IndexedDB 版本
        }
    }

    async function dbLoadProject() {
        try {
            var data = await dbGet('project', 'current');
            if (data && data.scenes && Array.isArray(data.scenes)) {
                return { scenes: data.scenes, assets: data.assets || {} };
            }
        } catch(e) {}
        // 回退到 localStorage
        var stored = localStorage.getItem('galgame_full_project');
        if (stored) {
            try {
                var proj = JSON.parse(stored);
                if (proj.scenes && Array.isArray(proj.scenes)) {
                    // 迁移到 IndexedDB
                    dbStoreProject(proj.scenes, proj.assets || {});
                    return proj;
                }
            } catch(e) {}
        }
        return null;
    }

    function clearLegacySave() {
        saveSlotsCache = Array(SAVE_SLOT_COUNT).fill(null);
        autoSaveCache = null;
        localStorage.removeItem('galgame_save');
        localStorage.removeItem(SAVE_SLOTS_KEY);
        localStorage.removeItem(AUTOSAVE_KEY);
        dbClearStore('saves').catch(function(){});
        updateContinueButtonState();
    }

    // 页面加载时初始化存储
    initStorage();

    function showSettingsMain() {
        startGameSubmenu.style.display = 'none';
        settingsSubmenu.style.display = 'flex';
        hotkeySubmenu.style.display = 'none';
        projectSubmenu.style.display = 'none';
        volumeSubmenu.style.display = 'none';
        autoPlaySubmenu.style.display = 'none';
        if (gamepadSubmenu) gamepadSubmenu.style.display = 'none';
        document.querySelector('.menu-buttons').style.display = 'none';
    }

    function showHotkeySubmenu() {
        settingsSubmenu.style.display = 'none';
        hotkeySubmenu.style.display = 'flex';
    }

    function clearChoices() {
        if (!choicesContainer) return;
        choicesContainer.innerHTML = '';
        choicesContainer.style.display = 'none';
        actionBar.style.display = 'flex';
        gamepadFocusIdx = 0;
    }

    function showSubmenu(which) {
        var mainBtns = document.querySelector('.menu-buttons');
        mainBtns.style.transition = 'opacity 0.2s';
        mainBtns.style.opacity = '0';
        setTimeout(function() { mainBtns.style.display = 'none'; mainBtns.style.opacity = '1'; }, 200);
        if (which === 'start') {
            startGameSubmenu.style.display = 'flex';
            startGameSubmenu.style.animation = 'fadeIn 0.2s';
        } else if (which === 'settings') {
            settingsSubmenu.style.display = 'flex';
            startGameSubmenu.style.display = 'none';
            hotkeySubmenu.style.display = 'none';
            projectSubmenu.style.display = 'none';
            volumeSubmenu.style.display = 'none';
            autoPlaySubmenu.style.display = 'none';
            if (gamepadSubmenu) gamepadSubmenu.style.display = 'none';
            settingsSubmenu.style.animation = 'fadeIn 0.2s';
        }
    }

    function showMainMenu() {
        document.querySelector('.menu-buttons').style.display = 'flex';
        startGameSubmenu.style.display = 'none';
        settingsSubmenu.style.display = 'none';
        hotkeySubmenu.style.display = 'none';
        if (projectSubmenu) projectSubmenu.style.display = 'none';
        if (volumeSubmenu) volumeSubmenu.style.display = 'none';
    }

    function displayChoices(choices) {
        if (!choicesContainer || !actionBar) return;
        if (typingTimer) clearInterval(typingTimer);
        isTyping = false;
        var arrow = document.querySelector('#dialogText .typing-arrow');
        if (arrow) arrow.remove();
        choicesContainer.innerHTML = '';
        choices.forEach(function(choice, idx) {
            // 条件过滤：如果 choice 有 condition 且不满足，跳过该选项
            if (choice.condition && !evalCondition(choice.condition)) return;
            var btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.innerText = interpolateVars(choice.text);
            btn.addEventListener('click', function() {
                lastChosenBranch.set(currentIndex, idx);
                _recordChoiceHistory(choice);
                // 成就追踪：累计选择次数
                setVar("_total_choices", (getVar("_total_choices") || 0) + 1);
                checkAchievements();
                var wasFFPaused = resumeFastForwardAfterCG;
                var wasAutoPaused = resumeAutoPlayAfterPause;
                resumeFastForwardAfterCG = false;
                resumeAutoPlayAfterPause = false;
                if (isFastForwarding) stopFastForward();
                if (autoPlayEnabled) stopAutoPlay();
                var nextIdx = choice.nextIdx;
                if (nextIdx === -1 || nextIdx >= currentScenes.length) {
                    endPrologue();
                } else {
                    currentIndex = nextIdx;
                    updateScene();
                    if (wasFFPaused && gameActive) {
                        var scn = currentScenes[currentIndex];
                        if (scn && !scn.cgKey && !(scn.choices && scn.choices.length > 0)) startFastForward(true);
                    }
                    if (wasAutoPaused && gameActive) {
                        var scn2 = currentScenes[currentIndex];
                        if (scn2 && !scn2.cgKey && !(scn2.choices && scn2.choices.length > 0)) startAutoPlay();
                    }
                }
                clearChoices();
            });
            choicesContainer.appendChild(btn);
        });
        choicesContainer.style.display = 'flex';
        actionBar.style.display = 'none';
        gamepadFocusIdx = 0;
        setGamepadChoiceFocus(0);
    }

    function _recordChoiceHistory(choice) {
        try {
            var hist = [];
            var raw = localStorage.getItem('galgame_choice_history');
            if (raw) hist = JSON.parse(raw);
            hist.push({
                scene: currentIndex,
                text: (choice.text || '').substring(0, 80),
                nextIdx: choice.nextIdx,
                time: Date.now()
            });
            // 只保留最近 20 个选择
            if (hist.length > 20) hist = hist.slice(-20);
            localStorage.setItem('galgame_choice_history', JSON.stringify(hist));
        } catch(e) {}
    }

    function simulateChoiceClick(choice) {
        lastChosenBranch.set(currentIndex, currentScenes[currentIndex].choices.indexOf(choice));
        // ★ 记录选择历史供后日谈使用
        _recordChoiceHistory(choice);
        var wasFFPaused = resumeFastForwardAfterCG;
        var wasAutoPaused = resumeAutoPlayAfterPause;
        resumeFastForwardAfterCG = false;
        resumeAutoPlayAfterPause = false;
        if (isFastForwarding) stopFastForward();
        if (autoPlayEnabled) stopAutoPlay();
        var nextIdx = choice.nextIdx;
        if (nextIdx === -1 || nextIdx >= currentScenes.length) {
            endPrologue();
        } else {
            currentIndex = nextIdx;
            updateScene();
            if (wasFFPaused && gameActive) {
                var scn = currentScenes[currentIndex];
                if (scn && !scn.cgKey && !(scn.choices && scn.choices.length > 0)) startFastForward(true);
            }
            if (wasAutoPaused && gameActive) {
                var scn2 = currentScenes[currentIndex];
                if (scn2 && !scn2.cgKey && !(scn2.choices && scn2.choices.length > 0)) startAutoPlay();
            }
        }
        clearChoices();
    }

    function formatSaveTimestamp(ts) {
        if (!ts) return '';
        var date = new Date(ts);
        return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0') + ' ' + String(date.getHours()).padStart(2,'0') + ':' + String(date.getMinutes()).padStart(2,'0');
    }

    function toChineseNumeral(n) {
        if (n <= 0) return String(n);
        if (n <= 10) {
            const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
            return digits[n];
        }
        if (n < 20) return '十' + (n % 10 === 0 ? '' : toChineseNumeral(n % 10));
        if (n < 100) {
            const tens = Math.floor(n / 10);
            const ones = n % 10;
            return toChineseNumeral(tens) + '十' + (ones === 0 ? '' : toChineseNumeral(ones));
        }
        const hundreds = Math.floor(n / 100);
        const rest = n % 100;
        let result = toChineseNumeral(hundreds) + '百';
        if (rest === 0) return result;
        if (rest < 10) result += '零';
        return result + toChineseNumeral(rest);
    }

    function getChapterNumber(sceneIndex) {
        if (!currentScenes.length) return 1;
        var chapter = 1;
        for (var i = 0; i <= sceneIndex; i++) {
            if (currentScenes[i] && currentScenes[i].triggerChapterTransition) chapter++;
        }
        return chapter;
    }

    function getChapterNumberForTransition(idx) {
        var cnt = 0;
        for (var i = 0; i <= idx; i++) {
            if (currentScenes[i] && currentScenes[i].triggerChapterTransition) cnt++;
        }
        return cnt;
    }

    function createSaveSnapshot() {
        var scene = currentScenes[currentIndex] || {};
        var thumbnail = captureSaveThumbnail(scene);
        return {
            sceneIndex: currentIndex, bgm: currentBgm, timestamp: Date.now(), note: '',
            gameVars: JSON.parse(JSON.stringify(gameVars)),
            preview: { speaker: scene.speaker || '', text: scene.text || '', bg: scene.bg || '', sprite: scene.sprite || '', thumbnail: thumbnail || '' },
            meta: { chapter: getChapterNumber(currentIndex), totalChapters: countTotalChapters(), sceneLabel: (currentIndex + 1) + '/' + currentScenes.length }
        };
    }

    /** 捕获存档缩略图：将当前背景 + 立绘合成为 320×180 的 canvas 截图 */
    function captureSaveThumbnail(scene) {
        try {
            var canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 180;
            var ctx = canvas.getContext('2d');
            if (!ctx) return '';

            // 1. 绘制背景
            var bgKey = scene.bg || '';
            var bgUrl = assetConfig.bg?.[bgKey] || '';
            var bgImg = bgUrl ? (imageCache.get(bgUrl) || null) : null;
            if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
                ctx.drawImage(bgImg, 0, 0, 320, 180);
            } else {
                // 背景未加载完成时使用渐变色兜底
                var grad = ctx.createLinearGradient(0, 0, 0, 180);
                grad.addColorStop(0, '#2e3f2c');
                grad.addColorStop(1, '#1d2a1a');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, 320, 180);
                // 异步重试：图片加载完成后不会更新本次存档，但以后的读取预览会用到
                if (bgUrl) {
                    preloadImage(bgUrl).catch(function() {});
                }
            }

            // 2. 绘制立绘（右下角，按比例缩放）
            var spriteKey = scene.sprite || '';
            if (!spriteKey && scene.sprites && scene.sprites.length > 0) {
                spriteKey = scene.sprites[0].key || '';
            }
            var spriteUrl = assetConfig.sprites?.[spriteKey] || '';
            var spriteImg = spriteUrl ? (imageCache.get(spriteUrl) || null) : null;
            if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
                var sprH = 160;
                var sprW = spriteImg.naturalWidth * (sprH / spriteImg.naturalHeight);
                var sprX = 320 - sprW - 16;
                var sprY = 180 - sprH;
                ctx.drawImage(spriteImg, sprX, sprY, sprW, sprH);
            } else if (spriteUrl) {
                preloadImage(spriteUrl).catch(function() {});
            }

            // 3. 暗角效果
            var vignetteGrad = ctx.createRadialGradient(160, 90, 120, 160, 90, 240);
            vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
            vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.45)');
            ctx.fillStyle = vignetteGrad;
            ctx.fillRect(0, 0, 320, 180);

            return canvas.toDataURL('image/jpeg', 0.7);
        } catch (e) {
            console.warn('[Thumbnail] 截图失败:', e.message);
            return '';
        }
    }

    function countTotalChapters() {
        var count = 1;
        for (var i = 0; i < currentScenes.length; i++) {
            if (currentScenes[i] && currentScenes[i].triggerChapterTransition) count++;
        }
        return count;
    }

    function createPreviewText(save) {
        if (!save) return '当前无存档';
        var p = save.preview || {};
        var spk = p.speaker ? p.speaker + ': ' : '';
        return (spk + (p.text || '（无对话预览）')).slice(0, 180);
    }

    function getPreviewImageUrl(save) {
        if (!save) return '';
        var p = save.preview || {};
        if (p.bg && assetConfig.bg && assetConfig.bg[p.bg]) return assetConfig.bg[p.bg];
        if (p.sprite && assetConfig.sprites && assetConfig.sprites[p.sprite]) return assetConfig.sprites[p.sprite];
        return '';
    }

    function createPreviewHtml(save) {
        // ★ 优先使用截图缩略图
        var thumbnail = (save && save.preview && save.preview.thumbnail) || '';
        if (thumbnail) {
            return '<div class="preview-canvas"><div class="preview-bg" style="background-image: url(\'' + thumbnail + '\'); background-size: cover; background-position: center;"></div></div>';
        }
        // 降级：背景图 + 立绘 + 文字合成预览
        var imageUrl = getPreviewImageUrl(save);
        var text = createPreviewText(save);
        var spriteUrl = (save && save.preview && save.preview.sprite && assetConfig.sprites && assetConfig.sprites[save.preview.sprite]) ? assetConfig.sprites[save.preview.sprite] : '';
        return '<div class="preview-canvas"><div class="preview-bg" style="background-image: url(\'' + (imageUrl || '') + '\')"></div>' +
            (spriteUrl ? '<img class="preview-sprite" src="' + spriteUrl + '" alt="sprite">' : '') +
            '<div class="preview-text-overlay"><div class="preview-text-box">' + text + '</div></div></div>';
    }

    function updateContinueButtonState() {
        if (!continueBtn) return;
        continueBtn.disabled = !hasAnySave();
    }

    function renderSaveSlots() {
        const autoSave = getAutoSave();
        const autoPreview = document.getElementById('autoSavePreview');
        const autoInfo = document.getElementById('autoSaveInfo');
        if (autoPreview) autoPreview.innerHTML = autoSave ? createPreviewHtml(autoSave) : '当前无存档';
        if (autoInfo) autoInfo.innerText = autoSave ? `第 ${toChineseNumeral(autoSave.meta.chapter)}/${autoSave.meta.totalChapters ? toChineseNumeral(autoSave.meta.totalChapters) : '?'} 章 · 场景 ${autoSave.meta.sceneLabel} · ${formatSaveTimestamp(autoSave.timestamp)}` : '暂无自动存档';
        const slotsGrid = document.getElementById('saveSlotsGrid');
        if (!slotsGrid) return;
        const slots = getSaveSlots();
        slotsGrid.innerHTML = slots.map((slot, index) => {
            const label = slot && slot.note ? `存档栏 ${index + 1} · ${slot.note}` : `存档栏 ${index + 1}`;
            const previewHtml = createPreviewHtml(slot);
            const info = slot ? `第 ${toChineseNumeral(slot.meta.chapter)}/${slot.meta.totalChapters ? toChineseNumeral(slot.meta.totalChapters) : '?'} 章 · 场景 ${slot.meta.sceneLabel} · ${formatSaveTimestamp(slot.timestamp)}` : '空存档栏';
            const loadDisabled = slot ? '' : 'disabled';
            const saveLabel = slot ? '覆盖' : '保存';
            return `
                <div class="save-slot save-slot-card">
                    <div class="save-slot-label">${label}</div>
                    <div class="save-slot-preview">${previewHtml}</div>
                    <input class="save-note-input" placeholder="输入备注名称（可选）" value="${slot && slot.note ? slot.note : ''}" data-slot-index="${index}" onchange="updateSaveNote(${index}, this.value)">
                    <div class="save-slot-meta" style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:8px;">
                        <div class="save-slot-info">${info}</div>
                        <div class="save-slot-actions">
                            <button class="load-slot-btn" data-slot-index="${index}" ${loadDisabled}>读取</button>
                            <button class="overwrite-slot-btn" data-slot-index="${index}">${saveLabel}</button>
                        </div>
                    </div>
                </div>`;
        }).join('');
        slotsGrid.querySelectorAll('.load-slot-btn').forEach(btn => btn.onclick = () => loadSaveSlot(parseInt(btn.dataset.slotIndex, 10)));
        slotsGrid.querySelectorAll('.overwrite-slot-btn').forEach(btn => btn.onclick = () => saveToSlot(parseInt(btn.dataset.slotIndex, 10)));
    }

    function openSavePage() {
        const savePage = document.getElementById('savePage');
        if (!savePage) return;
        titleMenu.classList.add('hide');
        document.getElementById('dialogArea').style.opacity = '0';
        document.getElementById('dialogArea').style.pointerEvents = 'none';
        settingsIcon.classList.remove('show');
        savePage.classList.add('show');
        renderSaveSlots();
    }

    function closeSavePage() {
        const savePage = document.getElementById('savePage');
        if (!savePage) return;
        savePage.classList.remove('show');
        if (gameActive) {
            document.getElementById('dialogArea').style.opacity = '1';
            document.getElementById('dialogArea').style.pointerEvents = 'auto';
            settingsIcon.classList.add('show');
        } else {
            titleMenu.classList.remove('hide');
        }
    }

    function saveToSlot(slotIndex) {
        if (!gameActive || !currentScenes.length) { showToast('游戏未开始，无法存档'); return; }
        // 成就追踪
        setVar("_manual_saved", (getVar("_manual_saved") || 0) + 1); checkAchievements();
        const slots = getSaveSlots();
        const snapshot = createSaveSnapshot();
        // 保留已有备注
        if (slots[slotIndex] && slots[slotIndex].note) snapshot.note = slots[slotIndex].note;
        slots[slotIndex] = snapshot;
        setSaveSlots(slots);
        renderSaveSlots();
        showToast(`已保存至存档栏 ${slotIndex + 1}`);
    }
    function updateSaveNote(slotIndex, note) {
        const slots = getSaveSlots();
        if (slots[slotIndex]) {
            slots[slotIndex].note = note;
            setSaveSlots(slots);
        }
    }

    function saveToAutoSlot() {
        if (!gameActive || !currentScenes.length) { showToast('游戏未开始，无法快速存档'); return; }
        setAutoSave(createSaveSnapshot());
        renderSaveSlots();
        showToast('已覆盖快速存档');
    }

    function loadSavedState(save) {
        if (!save || !currentScenes.length || save.sceneIndex < 0 || save.sceneIndex >= currentScenes.length) { showToast('存档无效或与当前项目不符'); return; }
        if (isFastForwarding) stopFastForward();
        // 恢复变量状态
        if (save.gameVars && typeof save.gameVars === 'object') {
            gameVars = JSON.parse(JSON.stringify(save.gameVars));
        }
        clearRollbackStack();
        const bgmSame = save.bgm && currentBgm === save.bgm;
        // 暂停当前BGM（但不清除 currentBgm 变量，避免 updateScene 误判）
        if (!bgmSame && audioElement) {
            audioElement.pause();
            audioElement.currentTime = 0;
        }
        currentIndex = save.sceneIndex;
        gameActive = true;
        titleMenu.classList.add('hide');
        document.getElementById('dialogArea').style.opacity = '1';
        document.getElementById('dialogArea').style.pointerEvents = 'auto';
        updateScene();
        if (!bgmSame && save.bgm) playBgm(save.bgm, true);
        if (typingTimer) clearInterval(typingTimer);
        isTyping = false;
        pendingNext = false;
        showToast('读档成功');
        fixSpritePosition();
        closeSavePage();
        stopAutoPlay();
    }

    function startAutoPlay() {
        if (!gameActive) return;
        if (chapterTransitionTimer) return;
        autoPlayEnabled = true;
        updateAutoPlayUI();
        // 如果当前没有正在打字，则立即调度
        if (!isTyping) {
            scheduleNextAutoPlay();
        }
    }

    let _voiceAutoEndHandler = null;  // 跟踪语音自动推进的事件处理器
    function cleanupVoiceAutoAdvance() {
        if (voiceAutoTimer) { clearTimeout(voiceAutoTimer); voiceAutoTimer = null; }
        voiceAutoVoiceDone = false;
        voiceAutoTextDone = false;
        if (voiceAudio && _voiceAutoEndHandler) {
            voiceAudio.off('end', _voiceAutoEndHandler);
            _voiceAutoEndHandler = null;
        }
    }

    function tryAutoAdvance() {
        if (!autoPlayEnabled || !gameActive || isTyping) return;
        if (voiceAutoVoiceDone && voiceAutoTextDone) {
            cleanupVoiceAutoAdvance();
            if (autoPlayTimeout) { clearTimeout(autoPlayTimeout); autoPlayTimeout = null; }
            // 短暂缓冲，让玩家看清最后一帧
            voiceAutoTimer = setTimeout(() => {
                voiceAutoTimer = null;
                autoPlayTimeout = null;
                if (autoPlayEnabled && gameActive && !isTyping) {
                    performNextDialogue();
                }
            }, 200);
            autoPlayTimeout = voiceAutoTimer;
        }
    }

    function scheduleNextAutoPlay() {
        if (!autoPlayEnabled || !gameActive || isTyping) {
            return;
        }
        if (autoPlayTimeout) return;

        const scene = currentScenes[currentIndex];
        if (!scene) return;

        // 遇到 CG 时暂停自动播放
        if (scene.cgKey) {
            stopAutoPlay();
            resumeAutoPlayAfterPause = true;
            return;
        }
        // 遇到选项时暂停自动播放，标记选项后恢复
        if (scene.choices && scene.choices.length > 0) {
            stopAutoPlay();
            resumeAutoPlayAfterPause = true;
            return;
        }

        // 重置双条件状态
        cleanupVoiceAutoAdvance();

        // 条件1：文字等待时间
        let delay = getDelayForText(scene.text || "");
        if (scene.bg && scene.bg !== lastRenderedBgKey) {
            delay += 1200;
        }
        voiceAutoTimer = setTimeout(() => {
            voiceAutoTimer = null;
            voiceAutoTextDone = true;
            tryAutoAdvance();
        }, delay);

        // 条件2：语音播放完毕（Howler不支持onended属性赋值，需用on('end')）
        if (voiceAudio && voiceAudio.playing()) {
            _voiceAutoEndHandler = () => {
                _voiceAutoEndHandler = null;
                voiceAutoVoiceDone = true;
                tryAutoAdvance();
            };
            voiceAudio.on('end', _voiceAutoEndHandler);
        } else {
            voiceAutoVoiceDone = true;
        }

        // 保留 autoPlayTimeout 引用以兼容旧代码
        autoPlayTimeout = voiceAutoTimer;
    }

    function stopAutoPlay() {
        cleanupVoiceAutoAdvance();
        if (autoPlayTimeout) {
            clearTimeout(autoPlayTimeout);
            autoPlayTimeout = null;
        }
        autoPlayEnabled = false;
        updateAutoPlayUI();
    }

    function toggleAutoPlay() {
        if (autoPlayEnabled) {
            stopAutoPlay();
            showToast("自动播放已关闭");
        } else {
            startAutoPlay();
            showToast("自动播放已开启");
        }
    }

    function updateAutoPlayUI() {
        const btn = document.getElementById('autoPlayBtn');
        if (btn) {
            btn.innerText = autoPlayEnabled ? "⏸ 自动" : "▶ 自动";
            btn.classList.toggle('active', autoPlayEnabled);
        }
    }


    function loadSaveSlot(slotIndex) {
        const slots = getSaveSlots();
        const save = slots[slotIndex];
        if (!save) { showToast('该存档栏为空'); return; }
        loadSavedState(save);
    }

    function loadAutoSaveSlot() {
        const save = getAutoSave();
        if (!save) { showToast('没有快速存档'); return; }
        loadSavedState(save);
    }

    function loadLatestSaveFromLocal() {
        const autoSave = getAutoSave();
        if (autoSave) return loadSavedState(autoSave);
        const slots = getSaveSlots().filter(slot => slot && typeof slot.sceneIndex === 'number');
        if (slots.length) {
            slots.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            return loadSavedState(slots[0]);
        }
        showToast('无存档可继续');
    }

    function clearVisuals() {
        // 清除所有视觉元素，防止场景切换时闪现旧画面
        clearVisualFilter();
        bgLayer.style.backgroundImage = '';
        bgLayer.style.opacity = '1';
        bgLayer.style.transition = '';
        if (bgLayer2) {
            bgLayer2.style.backgroundImage = '';
            bgLayer2.classList.remove('show');
        }
        spriteWrapper.style.opacity = '0';
        undimSprite();
        hasActiveSprite = false;
        spriteImg.src = '';
        spriteImg.style.opacity = '0';
        spriteImg.style.transition = 'none';
        spriteImg2.src = '';
        spriteImg2.style.opacity = '0';
        spriteImg2.style.transition = 'none';
        if (spriteFadeTimer) { clearTimeout(spriteFadeTimer); spriteFadeTimer = null; }
        updateMultiSprites(null);
        currentMultiSprites = [];
        const multiContainer = document.getElementById('multiSpriteContainer');
        if (multiContainer) multiContainer.innerHTML = '';
        document.getElementById('cgLayer').classList.remove('show');
        const vignette = document.getElementById('vignetteOverlay');
        if (vignette) vignette.classList.remove('active');
        const flash = document.getElementById('flashOverlay');
        if (flash) flash.classList.remove('active');
        const sto = document.getElementById('sceneTransitionOverlay');
        if (sto) { sto.className = 'scene-transition-overlay'; sto.style.transition = ''; }
        if (visualArea) {
            visualArea.style.filter = '';
            visualArea.classList.remove('shake-active');
        }
        updateSkipIndicator(null);
        const affinityDisplay = document.getElementById('affinityDisplay');
        if (affinityDisplay) affinityDisplay.classList.remove('show');
    }

