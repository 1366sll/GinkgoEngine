    // ========== 手柄支持 ==========
    function updateGamepadIndicator() {
        const ind = document.getElementById('gamepadIndicator');
        if (!ind) return;
        if (gamepadConnected && gamepadEnabled) {
            ind.classList.add('connected');
            ind.title = '游戏手柄已连接';
        } else {
            ind.classList.remove('connected');
            ind.title = gamepadEnabled ? '未检测到手柄' : '手柄已禁用';
        }
    }

    function saveGamepadSetting() {
        localStorage.setItem('galgame_gamepad_enabled', gamepadEnabled ? 'true' : 'false');
    }

    // 清除所有选项按钮的手柄聚焦样式
    function clearGamepadChoiceFocus() {
        if (!choicesContainer) return;
        choicesContainer.querySelectorAll('.choice-btn').forEach(function(b) {
            b.classList.remove('gamepad-focused');
        });
    }

    // 设置选项按钮的手柄聚焦
    function setGamepadChoiceFocus(idx) {
        if (!choicesContainer) return;
        if (!gamepadConnected || !gamepadEnabled) return;
        var btns = choicesContainer.querySelectorAll('.choice-btn');
        clearGamepadChoiceFocus();
        if (btns.length > 0) {
            var i = Math.max(0, Math.min(idx, btns.length - 1));
            btns[i].classList.add('gamepad-focused');
            gamepadFocusIdx = i;
        }
    }

    // 手柄按键处理
    function handleGamepadButton(btnIdx) {
        if (!gamepadEnabled) return;

        var settingsModal = document.getElementById('settingsModal');
        var settingsOpen = settingsModal && settingsModal.classList.contains('show');
        var savePage = document.getElementById('savePage');
        var saveOpen = savePage && savePage.classList.contains('show');
        var galleryPage = document.getElementById('galleryPage');
        var galleryOpen = galleryPage && galleryPage.style.display === 'block';
        var backlogOpen = backlogOverlay && backlogOverlay.classList.contains('show');
        var choicesVisible = choicesContainer && choicesContainer.style.display === 'flex';
        var titleVisible = titleMenu && !titleMenu.classList.contains('hide');
        var cgOpen = document.getElementById('cgLayer') && document.getElementById('cgLayer').classList.contains('show');

        // B button — back/close (highest priority)
        if (btnIdx === GP_BTN.B) {
            if (backlogOpen) { closeBacklog(); return; }
            if (cgOpen) { document.getElementById('cgLayer').classList.remove('show'); return; }
            if (settingsOpen) {
                var cb = document.getElementById('closeSettingsBtn');
                if (cb) cb.click();
                return;
            }
            if (saveOpen) { closeSavePage(); return; }
            if (galleryOpen) {
                galleryPage.style.display = 'none';
                if (!gameActive) titleMenu.classList.remove('hide');
                return;
            }
            // Check submenus
            var submenus = ['startGameSubmenu','settingsSubmenu','hotkeySubmenu','projectSubmenu','volumeSubmenu','autoPlaySubmenu','gamepadSubmenu'];
            for (var si = 0; si < submenus.length; si++) {
                var sm = document.getElementById(submenus[si]);
                if (sm && sm.style.display === 'flex') {
                    if (submenus[si] === 'gamepadSubmenu' || submenus[si] === 'autoPlaySubmenu' ||
                        submenus[si] === 'hotkeySubmenu' || submenus[si] === 'projectSubmenu' || submenus[si] === 'volumeSubmenu') {
                        showSettingsMain();
                    } else {
                        showMainMenu();
                    }
                    if (titleMenu) titleMenu.classList.remove('hide');
                    return;
                }
            }
            if (gameActive) {
                var si2 = document.getElementById('settingsIcon');
                if (si2) si2.click();
                return;
            }
            return;
        }

        // A button — confirm/advance
        if (btnIdx === GP_BTN.A) {
            if (backlogOpen) { closeBacklog(); return; }
            if (cgOpen) { nextDialogue(); return; }
            if (choicesVisible) {
                var btns = choicesContainer.querySelectorAll('.choice-btn');
                var fIdx = gamepadFocusIdx;
                if (fIdx >= 0 && fIdx < btns.length) {
                    btns[fIdx].click();
                    gamepadFocusIdx = 0;
                }
                return;
            }
            if (settingsOpen) { return; } // handled by specific settings
            if (saveOpen) { return; } // handled by navigation
            if (galleryOpen) { return; }
            if (titleVisible) {
                // Find focused menu button and click it
                var menuBtns = titleMenu.querySelectorAll('.menu-buttons > button');
                var subBtns = [];
                var submenus2 = titleMenu.querySelectorAll('.submenu[style*="display: flex"], .submenu[style*="display:flex"]');
                submenus2.forEach(function(sm) {
                    sm.querySelectorAll('button').forEach(function(b) { subBtns.push(b); });
                });
                var allTgt = menuBtns.length > 0 ? Array.from(menuBtns) : subBtns;
                if (allTgt.length > 0) {
                    var fi2 = Math.max(0, Math.min(gamepadFocusIdx, allTgt.length - 1));
                    // Remove focus styling from all
                    allTgt.forEach(function(b) { b.style.outline = ''; });
                    var target = allTgt[fi2];
                    target.click();
                    gamepadFocusIdx = 0;
                }
                return;
            }
            if (gameActive) { nextDialogue(); return; }
            return;
        }

        // X button — toggle auto play
        if (btnIdx === GP_BTN.X && gameActive && !choicesVisible && !cgOpen && !backlogOpen && !settingsOpen && !saveOpen) {
            toggleAutoPlay();
            return;
        }

        // Y button — toggle fast forward
        if (btnIdx === GP_BTN.Y && gameActive && !choicesVisible && !cgOpen && !backlogOpen && !settingsOpen && !saveOpen) {
            toggleFastForward();
            return;
        }

        // START button — settings / menu
        if (btnIdx === GP_BTN.START) {
            if (gameActive && !settingsOpen && !saveOpen && !galleryOpen) {
                var si3 = document.getElementById('settingsIcon');
                if (si3) si3.click();
                return;
            }
            return;
        }

        // SELECT button — backlog
        if (btnIdx === GP_BTN.SELECT && gameActive && !settingsOpen && !saveOpen && !galleryOpen && !choicesVisible && !cgOpen) {
            if (backlogOpen) { closeBacklog(); } else { openBacklog(); }
            return;
        }

        // LB — previous choice
        if (btnIdx === GP_BTN.LB && gameActive && !settingsOpen && !saveOpen && !galleryOpen && !choicesVisible && !cgOpen && !backlogOpen) {
            jumpToPreviousChoice();
            return;
        }

        // RB — next choice
        if (btnIdx === GP_BTN.RB && gameActive && !settingsOpen && !saveOpen && !galleryOpen && !choicesVisible && !cgOpen && !backlogOpen) {
            jumpToNextChoice();
            return;
        }

        // DPAD UP/DOWN — navigate choices or menus
        if (btnIdx === GP_BTN.DPAD_UP || btnIdx === GP_BTN.DPAD_DOWN) {
            var dir = (btnIdx === GP_BTN.DPAD_UP) ? -1 : 1;

            if (choicesVisible) {
                var cbtns = choicesContainer.querySelectorAll('.choice-btn');
                if (cbtns.length > 0) {
                    var newIdx = gamepadFocusIdx + dir;
                    if (newIdx < 0) newIdx = cbtns.length - 1;
                    if (newIdx >= cbtns.length) newIdx = 0;
                    setGamepadChoiceFocus(newIdx);
                }
                return;
            }

            if (titleVisible && !gameActive) {
                // Navigate menu buttons
                var mBtns = titleMenu.querySelectorAll('.menu-buttons > button');
                var subBtns2 = [];
                var submenus3 = titleMenu.querySelectorAll('.submenu[style*="display: flex"], .submenu[style*="display:flex"]');
                submenus3.forEach(function(sm) {
                    sm.querySelectorAll('button').forEach(function(b) { subBtns2.push(b); });
                });
                var allTgt2 = subBtns2.length > 0 ? subBtns2 : Array.from(mBtns);
                if (allTgt2.length > 0) {
                    allTgt2.forEach(function(b) { b.style.outline = ''; });
                    gamepadFocusIdx = Math.max(0, Math.min(gamepadFocusIdx, allTgt2.length - 1));
                    var newFIdx = gamepadFocusIdx + dir;
                    if (newFIdx < 0) newFIdx = allTgt2.length - 1;
                    if (newFIdx >= allTgt2.length) newFIdx = 0;
                    gamepadFocusIdx = newFIdx;
                    allTgt2[gamepadFocusIdx].style.outline = '2px solid #dba541';
                    allTgt2[gamepadFocusIdx].style.outlineOffset = '2px';
                    allTgt2[gamepadFocusIdx].scrollIntoView({ block: 'nearest' });
                }
                return;
            }

            if (saveOpen) {
                // Navigate save slots — simplified: move by row
                return;
            }
            return;
        }

        // DPAD LEFT/RIGHT — navigate settings or choices horizontally
        if (btnIdx === GP_BTN.DPAD_LEFT || btnIdx === GP_BTN.DPAD_RIGHT) {
            if (choicesVisible) {
                var cbtns2 = choicesContainer.querySelectorAll('.choice-btn');
                if (cbtns2.length > 0) {
                    var nIdx = gamepadFocusIdx + (btnIdx === GP_BTN.DPAD_RIGHT ? 1 : -1);
                    if (nIdx < 0) nIdx = cbtns2.length - 1;
                    if (nIdx >= cbtns2.length) nIdx = 0;
                    setGamepadChoiceFocus(nIdx);
                }
                return;
            }
            return;
        }
    }

    function pollGamepad() {
        if (!gamepadEnabled) return;
        if (typeof navigator.getGamepads !== 'function') return;

        var gamepads = navigator.getGamepads();
        var found = false;

        for (var i = 0; i < gamepads.length; i++) {
            var gp = gamepads[i];
            if (gp && gp.connected) {
                found = true;

                if (!gamepadConnected || gamepadIndex !== i) {
                    gamepadConnected = true;
                    gamepadIndex = i;
                    prevGamepadButtons = [];
                    for (var b = 0; b < gp.buttons.length; b++) {
                        prevGamepadButtons.push({ pressed: gp.buttons[b].pressed, value: gp.buttons[b].value });
                    }
                    updateGamepadIndicator();
                    return; // Wait for next frame to process
                }

                // Process button edge detection
                var btns = gp.buttons;
                for (var j = 0; j < btns.length; j++) {
                    var pressed = btns[j].pressed;
                    var wasPressed = (j < prevGamepadButtons.length) ? prevGamepadButtons[j].pressed : false;

                    if (pressed && !wasPressed) {
                        // Initial press
                        handleGamepadButton(j);
                        // Set up repeat
                        gpRepeatState[j] = { count: 0, nextTime: Date.now() + GP_REPEAT_INITIAL };
                    } else if (pressed && wasPressed && gpRepeatState[j]) {
                        // Check for repeat
                        var now = Date.now();
                        if (now >= gpRepeatState[j].nextTime) {
                            handleGamepadButton(j);
                            gpRepeatState[j].count++;
                            gpRepeatState[j].nextTime = now + GP_REPEAT_RATE;
                        }
                    } else if (!pressed && wasPressed) {
                        // Released
                        delete gpRepeatState[j];
                    }
                }

                // Process analog stick for DPAD emulation (axis 0 = LX, axis 1 = LY)
                var now2 = Date.now();
                if (gp.axes.length >= 2) {
                    var lx = gp.axes[0];
                    var ly = gp.axes[1];

                    // Left stick Y for up/down navigation
                    if (Math.abs(ly) > GP_DEADZONE) {
                        var stickBtn = ly < -0.3 ? GP_BTN.DPAD_UP : GP_BTN.DPAD_DOWN;
                        if (!gpRepeatState['axis_y']) {
                            handleGamepadButton(stickBtn);
                            gpRepeatState['axis_y'] = { count: 0, nextTime: now2 + GP_REPEAT_INITIAL };
                        } else if (now2 >= gpRepeatState['axis_y'].nextTime) {
                            handleGamepadButton(stickBtn);
                            gpRepeatState['axis_y'].count++;
                            gpRepeatState['axis_y'].nextTime = now2 + GP_REPEAT_RATE;
                        }
                    } else {
                        delete gpRepeatState['axis_y'];
                    }

                    // Left stick X for left/right navigation
                    if (Math.abs(lx) > GP_DEADZONE) {
                        var stickBtnX = lx > 0.3 ? GP_BTN.DPAD_RIGHT : GP_BTN.DPAD_LEFT;
                        if (!gpRepeatState['axis_x']) {
                            handleGamepadButton(stickBtnX);
                            gpRepeatState['axis_x'] = { count: 0, nextTime: now2 + GP_REPEAT_INITIAL };
                        } else if (now2 >= gpRepeatState['axis_x'].nextTime) {
                            handleGamepadButton(stickBtnX);
                            gpRepeatState['axis_x'].count++;
                            gpRepeatState['axis_x'].nextTime = now2 + GP_REPEAT_RATE;
                        }
                    } else {
                        delete gpRepeatState['axis_x'];
                    }
                }

                // Update previous state
                prevGamepadButtons = [];
                for (var k = 0; k < btns.length; k++) {
                    prevGamepadButtons.push({ pressed: btns[k].pressed, value: btns[k].value });
                }
                break; // Only process first connected gamepad
            }
        }

        if (!found && gamepadConnected) {
            gamepadConnected = false;
            gamepadIndex = -1;
            prevGamepadButtons = [];
            gpRepeatState = {};
            updateGamepadIndicator();
        }
    }

    // Start gamepad polling loop
    function startGamepadPolling() {
        function loop() {
            pollGamepad();
            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
    }
    startGamepadPolling();

    // 修改原有的键盘事件（原为 F5 存档，现在添加自定义下一句）
    document.addEventListener('keydown', (e) => {
        // ESC 键处理：智能打开/关闭
        if (e.key === 'Escape') {
            e.preventDefault();

            // 1. 关闭 Backlog 界面
            if (backlogOverlay && backlogOverlay.classList.contains('show')) {
                closeBacklog();
                return;
            }
            // 1b. 关闭旧的章节回顾模态框（兼容）
            const reviewModal = document.querySelector('div[style*="z-index:1000"]');
            if (reviewModal && reviewModal.innerHTML.includes('本章剧情回顾')) {
                reviewModal.remove();
                return;
            }
            // 2. 关闭 CG 浮层
            const cgLayerDiv = document.getElementById('cgLayer');
            if (cgLayerDiv && cgLayerDiv.classList.contains('show')) {
                cgLayerDiv.classList.remove('show');
                return;
            }
            // 3. 关闭选项浮层（分支选项）
            if (choicesContainer && choicesContainer.style.display === 'flex') {
                clearChoices();
                return;
            }
            // 4. 关闭存档页面
            const savePage = document.getElementById('savePage');
            if (savePage && savePage.classList.contains('show')) {
                closeSavePage();
                return;
            }
            // 5. 关闭鉴赏页面
            const galleryPage = document.getElementById('galleryPage');
            if (galleryPage && galleryPage.style.display === 'block') {
                galleryPage.style.display = 'none';
                if (!gameActive) titleMenu.classList.remove('hide');
                return;
            }
            // 6. 关闭齿轮设置模态框（并恢复快进/自动播放状态）
            const settingsModal = document.getElementById('settingsModal');
            if (settingsModal && settingsModal.classList.contains('show')) {
                const closeBtn = document.getElementById('closeSettingsBtn');
                if (closeBtn) closeBtn.click();
                return;
            }
            // 7. 处理标题菜单中的子菜单：优先返回上一级，而不是直接回主菜单
            const startGameSubmenu = document.getElementById('startGameSubmenu');
            const settingsSubmenu = document.getElementById('settingsSubmenu');
            const hotkeySubmenu = document.getElementById('hotkeySubmenu');
            const projectSubmenu = document.getElementById('projectSubmenu');
            const volumeSubmenu = document.getElementById('volumeSubmenu');
            const autoPlaySubmenu = document.getElementById('autoPlaySubmenu');

            // 设置相关的子菜单（热键、项目管理、音量、自动播放）-> 返回设置母菜单
            if (hotkeySubmenu && hotkeySubmenu.style.display === 'flex') {
                showSettingsMain();   // 这个函数会隐藏所有子菜单并显示 settingsSubmenu
                return;
            }
            if (projectSubmenu && projectSubmenu.style.display === 'flex') {
                showSettingsMain();
                return;
            }
            if (volumeSubmenu && volumeSubmenu.style.display === 'flex') {
                showSettingsMain();
                return;
            }
            if (autoPlaySubmenu && autoPlaySubmenu.style.display === 'flex') {
                showSettingsMain();
                return;
            }
            if (gamepadSubmenu && gamepadSubmenu.style.display === 'flex') {
                showSettingsMain();
                return;
            }
            // 如果设置母菜单自身打开，则关闭它回到主菜单
            if (settingsSubmenu && settingsSubmenu.style.display === 'flex') {
                showMainMenu();
                if (titleMenu) titleMenu.classList.remove('hide');
                return;
            }
            // 如果开始游戏子菜单打开，直接返回主菜单
            if (startGameSubmenu && startGameSubmenu.style.display === 'flex') {
                showMainMenu();
                if (titleMenu) titleMenu.classList.remove('hide');
                return;
            }
            // 8. 没有模态框和子菜单打开，且游戏活跃，则呼出齿轮设置
            if (gameActive) {
                const settingsIcon = document.getElementById('settingsIcon');
                if (settingsIcon) settingsIcon.click();  // 触发齿轮图标点击，打开设置面板
            }
            return;
        }
        // 如果齿轮设置模态框可见，则屏蔽所有游戏热键（ESC 已处理完毕，直接返回）
        if (settingsModal.classList.contains('show')) {
            return;
        }
        // 自定义下一句热键
        if (gameActive && (e.key === customNextKey || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            nextDialogue();
        }
        // 快进热键
        if (gameActive && e.key === customFastForwardKey) {
            e.preventDefault();
            toggleFastForward();
        }
        // 自动播放热键
        if (gameActive && e.key === customAutoPlayKey) {
            e.preventDefault();
            toggleAutoPlay();
        }
        // 快速存档热键（自定义）
        if (gameActive && (e.key.toLowerCase() === customQuickSaveKey.toLowerCase())) {
            e.preventDefault();
            saveToAutoSlot();
            showToast("已快速存档");
        }
        // 快速读档热键 L
        if (gameActive && e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            loadLatestSaveFromLocal();
        }
        // Backlog 热键（滚轮上滑 或 B键）
        if (gameActive && e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            openBacklog();
        }
        // 选项跳转热键 PageUp / PageDown
        if (gameActive && e.key === 'PageUp') {
            e.preventDefault();
            jumpToPreviousChoice();
        }
        if (gameActive && e.key === 'PageDown') {
            e.preventDefault();
            jumpToNextChoice();
        }
        // 全屏热键 F12
        if (e.key === 'F12') {
            e.preventDefault();
            toggleFullscreen();
        }
    });

    function exportFullProject() {
        const projectData = { scenes: currentScenes, assets: assetConfig };
        const dataStr = JSON.stringify(projectData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = "galgame_project.json";
        a.click();
        URL.revokeObjectURL(blob);
        showToast("完整项目已导出");
    }

    function loadStoredOrEgg() {
        // ① 优先：同目录下的 galgame_full_project.json（部署环境）
        var http = new XMLHttpRequest();
        http.open('GET', 'galgame_full_project.json', false); // sync — 必须阻塞
        http.send();
        if (http.status === 200) {
            try {
                var proj = JSON.parse(http.responseText);
                if (proj && proj.scenes && Array.isArray(proj.scenes)) {
                    currentScenes = proj.scenes;
                    _initReadSceneSet(currentScenes);
                    if (proj.assets) {
                        assetConfig = proj.assets;
                        if (!assetConfig.se) assetConfig.se = {};
                        if (!assetConfig.voice) assetConfig.voice = {};
                        if (!assetConfig.video) assetConfig.video = {};
                    }
                    if (proj.imgbbUrls && typeof proj.imgbbUrls === 'object') {
                        window._imgbbReverse = window._imgbbReverse || {};
                        for (var _rkey in proj.imgbbUrls) window._imgbbReverse[proj.imgbbUrls[_rkey]] = _rkey;
                        var _pch = function(obj) { if (!obj) return; for (var k in obj) { if (typeof obj[k] === 'string' && proj.imgbbUrls[obj[k]]) obj[k] = proj.imgbbUrls[obj[k]]; } };
                        _pch(assetConfig.bg); _pch(assetConfig.sprites); _pch(assetConfig.cg);
                        _pch(assetConfig.se); _pch(assetConfig.voice); _pch(assetConfig.video);
                    }
                    preloadAllProjectAssets();
                    console.log('[银杏] 已加载 galgame_full_project.json (' + currentScenes.length + ' 场景)');
                    return;
                }
            } catch(e) { console.warn('[银杏] JSON 解析失败:', e.message); }
        }

        // ② 回退：IndexedDB
        return dbLoadProject().then(function(dbProj) {
            if (dbProj && dbProj.scenes && Array.isArray(dbProj.scenes)) {
                currentScenes = dbProj.scenes;
                _initReadSceneSet(currentScenes);
                if (dbProj.assets) assetConfig = dbProj.assets;
                preloadAllProjectAssets();
                console.log('[银杏] 已加载 IndexedDB 缓存项目');
                return;
            }
            loadBuiltinEasterEgg();
        }).catch(function() {
            // ③ 回退：localStorage
            var stored = localStorage.getItem('galgame_full_project');
            if (stored) {
                try {
                    var p = JSON.parse(stored);
                    if (p.scenes && Array.isArray(p.scenes)) {
                        currentScenes = p.scenes;
                        _initReadSceneSet(currentScenes);
                        if (p.assets) assetConfig = p.assets;
                        preloadAllProjectAssets();
                        console.log('[银杏] 已加载 localStorage 缓存项目');
                        return;
                    }
                } catch(e2) {}
            }
            // ④ 兜底：内置彩蛋
            loadBuiltinEasterEgg();
        });
    }

    // 内置彩蛋 — 仅在 galgame_full_project.json 不存在时触发
    function loadBuiltinEasterEgg() {
        currentScenes = JSON.parse(JSON.stringify(DEFAULT_EGG_SCENES));
        _initReadSceneSet(currentScenes);
        preloadAllProjectAssets();
        console.log('🍂 彩蛋模式 — 将 galgame_full_project.json 放入目录即可加载正式项目');
    }

    // 作弊控制台指令：手动加载彩蛋
    window.loadEggScenes = function() {
        if (isFastForwarding) stopFastForward();
        clearChoices();
        loadBuiltinEasterEgg();
        startNewGameFromCurrent();
        showToast('🥚 已加载开发者彩蛋场景');
    };

    function clearAllUnlocks() {
        localStorage.removeItem(UNLOCKED_CGS_KEY);
        localStorage.removeItem(UNLOCKED_SPRITES_KEY);
        localStorage.removeItem(UNLOCKED_BGMS_KEY);
        localStorage.removeItem(UNLOCKED_BGS_KEY);
        localStorage.removeItem(UNLOCKED_ENDINGS_KEY);
        localStorage.removeItem(ENDING_TIMESTAMPS_KEY);
        unlockedCgs = [];
        unlockedSprites = [];
        unlockedBgms = [];
        unlockedBgs = [];
        unlockedEndings = [];
        endingTimestamps = {};
    }

    function renderCoverSettingsPage() {
        const container = document.getElementById('galleryGridContainer');
        const coverPage = document.getElementById('coverSettingsPage');
        if (!container || !coverPage) return;
        container.style.display = 'none';
        coverPage.style.display = 'block';
        const imgMode = document.getElementById('coverImageMode');
        const bgmMode = document.getElementById('coverBgmMode');
        if (imgMode) imgMode.value = coverImageMode;
        if (bgmMode) bgmMode.value = coverBgmMode;
        // 渲染CG候选列表
        const cgList = document.getElementById('coverCGCandidatesList');
        if (cgList) {
            const unlockedCgsArr = Object.entries(assetConfig.cg || {}).filter(([k]) => unlockedCgs.includes(k));
            if (unlockedCgsArr.length === 0) {
                cgList.innerHTML = '<div class="no-candidates">暂无已解锁CG。请先在游戏中解锁CG，然后在CG页面点击☆标记候选。</div>';
            } else if (coverCGCandidates.length === 0) {
                cgList.innerHTML = '<div class="no-candidates">尚未标记任何候选CG。切换到CG页面，点击CG右下角的☆按钮即可添加候选。当前"从候选随机"模式将使用默认封面。</div>';
            } else {
                cgList.innerHTML = '<div style="color:#f0e8da; margin-bottom:8px;">当前候选列表（在CG页面点击☆管理）：</div>' +
                    coverCGCandidates.map(key => {
                        const url = assetConfig.cg[key];
                        return `<div style="display:flex; align-items:center; gap:12px; padding:6px 0; color:#f5da8c;">
                            <span>⭐ ${key}</span>
                            ${url ? `<img src="${url}" style="height:40px; border-radius:6px; border:1px solid rgba(219,165,65,0.3);">` : ''}
                        </div>`;
                    }).join('');
            }
        }
        // 渲染BGM候选列表
        const bgmList = document.getElementById('coverBGMCandidatesList');
        if (bgmList) {
            const unlockedBgmArr = Object.entries(assetConfig.bgm || {}).filter(([k]) => unlockedBgms.includes(k));
            if (unlockedBgmArr.length === 0) {
                bgmList.innerHTML = '<div class="no-candidates">暂无已解锁BGM。请先在游戏中解锁BGM，然后在音乐页面点击☆标记候选。</div>';
            } else if (coverBGMCandidates.length === 0) {
                bgmList.innerHTML = '<div class="no-candidates">尚未标记任何候选BGM。切换到音乐页面，点击曲目旁的☆按钮即可添加候选。当前"从候选随机"模式将使用默认BGM。</div>';
            } else {
                bgmList.innerHTML = '<div style="color:#f0e8da; margin-bottom:8px;">当前候选列表（在音乐页面点击☆管理）：</div>' +
                    coverBGMCandidates.map(key => {
                        const displayName = MUSIC_NAME_MAP[key] || key;
                        return `<div style="display:flex; align-items:center; gap:12px; padding:6px 0; color:#f5da8c;">⭐ 🎵 ${displayName}</div>`;
                    }).join('');
            }
        }
        // 模式选择器事件
        if (imgMode) {
            imgMode.onchange = () => {
                coverImageMode = imgMode.value;
                localStorage.setItem('coverImageMode', coverImageMode);
            };
        }
        if (bgmMode) {
            bgmMode.onchange = () => {
                coverBgmMode = bgmMode.value;
                localStorage.setItem('coverBgmMode', coverBgmMode);
            };
        }
    }
    function populateCoverSettings() {
        // 封面设置已移至子页面，此函数仅初始化模式选择器值
        const coverImageModeSelect = document.getElementById('coverImageMode');
        const coverBgmModeSelect = document.getElementById('coverBgmMode');
        if (coverImageModeSelect) coverImageModeSelect.value = coverImageMode;
        if (coverBgmModeSelect) coverBgmModeSelect.value = coverBgmMode;
    }

    function toggleSpecifiedSelects() {
        // 保留兼容，但新系统不再使用 dropdown
    }

    function updateCoverBackground() {
        const titleInner = document.getElementById('titleBgInner');
        if (!titleInner) return;
        let bgUrl = null;
        if (coverImageMode === 'lastCG' && lastTriggeredCGUrl) {
            bgUrl = lastTriggeredCGUrl;
        } else if (coverImageMode === 'randomCandidates') {
            if (coverCGCandidates.length > 0) {
                const randomKey = coverCGCandidates[Math.floor(Math.random() * coverCGCandidates.length)];
                if (assetConfig.cg[randomKey]) bgUrl = assetConfig.cg[randomKey];
            }
        } else if (coverImageMode === 'randomAll') {
            const allKeys = Object.keys(assetConfig.cg || {});
            if (allKeys.length > 0) {
                const randomKey = allKeys[Math.floor(Math.random() * allKeys.length)];
                if (assetConfig.cg[randomKey]) bgUrl = assetConfig.cg[randomKey];
            }
        }
        if (!bgUrl) {
            // 没有封面图片可用时使用纯色背景
            titleInner.style.background = 'linear-gradient(135deg, #1a1612, #2e2a22)';
            return;
        }
        titleInner.style.backgroundImage = `url('${bgUrl}')`;
    }
    function returnToTitle() {
        if (isFastForwarding) stopFastForward();
        if (isSkipRead) stopSkipRead();
        if (sceneTransitionTimer) { clearTimeout(sceneTransitionTimer); sceneTransitionTimer = null; }
        if (chapterTransitionTimer) { clearTimeout(chapterTransitionTimer); chapterTransitionTimer = null; chapterTransitionCallback = null; }
        if (musicProgressInterval) { clearInterval(musicProgressInterval); musicProgressInterval = null; }
        currentGalleryMusicKey = null;
        persistReadScenes();
        gameActive = false;
        stopAllBgm();
        stopVoice();
        stopVideo();
        clearChoices();
        clearVisuals();
        // 根据封面音乐模式选择BGM
        let bgmToPlay = null;
        if (coverBgmMode === 'lastBGM' && lastTriggeredBGM && assetConfig.bgm[lastTriggeredBGM]) {
            bgmToPlay = lastTriggeredBGM;
        } else if (coverBgmMode === 'randomCandidates') {
            if (coverBGMCandidates.length > 0) {
                bgmToPlay = coverBGMCandidates[Math.floor(Math.random() * coverBGMCandidates.length)];
            }
        } else if (coverBgmMode === 'randomAll') {
            const allKeys = Object.keys(assetConfig.bgm || {});
            if (allKeys.length > 0) bgmToPlay = allKeys[Math.floor(Math.random() * allKeys.length)];
        }
        if (!bgmToPlay) bgmToPlay = 'fm';
        playBgm(bgmToPlay, true);
        showMainMenu();
        titleMenu.classList.remove('hide');
        document.getElementById('dialogArea').style.opacity = "0";
        document.getElementById('dialogArea').style.pointerEvents = "none";
        settingsIcon.classList.remove('show');
        document.getElementById('cgLayer').classList.remove('show');
        updateContinueButtonState();
        fixSpritePosition();
        if (galleryPage) galleryPage.style.display = 'none';
        if (typingTimer) clearInterval(typingTimer);
        isTyping = false;
        pendingNext = false;
        stopAutoPlay();
        updateCoverBackground();
        // ★ 返回标题时重启渐进式预加载（内部有 active 守卫，不会重复运行）
        if (typeof restartProgressivePreload === 'function') {
            restartProgressivePreload();
        }
    }

    function setVolume(value) { if (audioElement) { audioElement.volume = value / 100; volumeValue.innerText = value + '%'; } }
    function toggleBgmMute() {
        if (!audioElement) { if (currentBgm && assetConfig.bgm?.[currentBgm]) playBgm(currentBgm, true); else return; }
        if (audioElement.paused) audioElement.play();
        else audioElement.pause();
        updateBgmToggleUI();
    }
    function showChapterTransition(name, sub, callback) {
        const transEl = document.getElementById('chapterTransition');
        if (chapterTransitionTimer) {
            clearTimeout(chapterTransitionTimer);
            chapterTransitionTimer = null;
            chapterTransitionCallback = null;
            gsap.set(transEl, { opacity: 0 });
            transEl.classList.remove('show');
        }
        document.getElementById('transChapterName').innerText = name;
        document.getElementById('transChapterSub').innerText = sub;
        transEl.classList.add('show');
        gsap.fromTo(transEl, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power2.out" });
        chapterTransitionCallback = callback;
        chapterTransitionTimer = setTimeout(() => {
            const cb = chapterTransitionCallback;
            chapterTransitionCallback = null;
            gsap.to(transEl, { opacity: 0, duration: 0.5, ease: "power2.in", onComplete: () => {
                chapterTransitionTimer = null;
                transEl.classList.remove('show');
                if (cb) cb();
            }});
        }, 2200);
    }

    function buildFlowChartData() {
        const N = currentScenes.length;
        if (N === 0) return null;

        // 标记重要节点：起点、选项、结局、章节过渡、已存档场景
        const isImportant = new Array(N).fill(false);
        const savedSceneSet = new Set();
        const autoSave = getAutoSave();
        if (autoSave && typeof autoSave.sceneIndex === 'number') savedSceneSet.add(autoSave.sceneIndex);
        const slots = getSaveSlots();
        for (const slot of slots) {
            if (slot && typeof slot.sceneIndex === 'number') savedSceneSet.add(slot.sceneIndex);
        }
        isImportant[0] = true;
        for (let i = 0; i < N; i++) {
            const s = currentScenes[i];
            if (!s) continue;
            if (s.triggerChapterTransition || s.endingKey || (s.choices && s.choices.length > 0) || savedSceneSet.has(i)) {
                isImportant[i] = true;
            }
        }
        // Mark direct choice destinations as important so branches have visible nodes
        for (let i = 0; i < N; i++) {
            if (!isImportant[i]) continue;
            const s = currentScenes[i];
            if (!s || !s.choices) continue;
            for (const c of s.choices) {
                if (c.nextIdx >= 0 && c.nextIdx < N) isImportant[c.nextIdx] = true;
            }
        }

        // 从重要节点出发，沿链路找到下一个重要节点，建立精简边
        const simpEdges = [];
        const simpEdgeSet = new Set();
        const simpAdj = Array.from({ length: N }, () => []);

        for (let i = 0; i < N; i++) {
            if (!isImportant[i]) continue;
            const visited = new Set();
            const queue = [];
            const s = currentScenes[i];
            if (!s) continue;

            // 正常路径 (skip if node has choices — the choices ARE the paths)
            if (!s.choices || s.choices.length === 0) {
                if (s.next !== undefined && s.next !== null && s.next >= 0 && s.next < N) {
                    queue.push({ to: s.next, type: 'normal', label: '' });
                } else if (i + 1 < N) {
                    queue.push({ to: i + 1, type: 'normal', label: '' });
                }
            }
            // 分支选项
            if (s.choices) {
                for (let ci = 0; ci < s.choices.length; ci++) {
                    const c = s.choices[ci];
                    if (c.nextIdx !== undefined && c.nextIdx !== null && c.nextIdx >= 0 && c.nextIdx < N) {
                        const lbl = (c.text || '').replace(/\[[^\]]*\]/g, '').trim().substring(0, 14);
                        queue.push({ to: c.nextIdx, type: 'choice', label: lbl, tag: 'c' + ci });
                    }
                }
            }

            while (queue.length > 0) {
                const item = queue.shift();
                const to = item.to, type = item.type, label = item.label, tag = item.tag;
                if (visited.has(to + ':' + (tag || type))) continue;
                visited.add(to + ':' + (tag || type));

                if (isImportant[to]) {
                    const key = i + '->' + to + ':' + type + (tag ? '|' + tag : '');
                    if (!simpEdgeSet.has(key)) {
                        simpEdgeSet.add(key);
                        simpEdges.push({ from: i, to: to, type: type, label: label });
                        if (simpAdj[i].indexOf(to) === -1) simpAdj[i].push(to);
                    }
                    continue;
                }

                // 非重要节点：继续追踪下一跳
                const ts = currentScenes[to];
                if (!ts) continue;
                // Skip normal next for intermediate choice nodes too
                if (!ts.choices || ts.choices.length === 0) {
                    if (ts.next !== undefined && ts.next !== null && ts.next >= 0 && ts.next < N) {
                        queue.push({ to: ts.next, type: type, label: label, tag: tag });
                    } else if (to + 1 < N) {
                        queue.push({ to: to + 1, type: type, label: label, tag: tag });
                    }
                }
                if (ts.choices) {
                    for (let ci = 0; ci < ts.choices.length; ci++) {
                        const c = ts.choices[ci];
                        if (c.nextIdx !== undefined && c.nextIdx !== null && c.nextIdx >= 0 && c.nextIdx < N) {
                            const clbl = (c.text || '').replace(/\[[^\]]*\]/g, '').trim().substring(0, 14);
                            queue.push({ to: c.nextIdx, type: 'choice', label: clbl, tag: tag || ('c' + ci) });
                        }
                    }
                }
            }
        }

        // --- Insert virtual choice nodes ---
        // Transform:  source --choice(label)--> dest
        // Into:       source --> [V-label] --> dest
        // Virtual nodes participate in layer/track layout, giving choices
        // their own visual position on the route map.
        var virtChoiceNodes = [];
        var newSimpEdges = [];
        var totalN = N;
        for (var ei = 0; ei < simpEdges.length; ei++) {
            var se = simpEdges[ei];
            if (se.type === 'choice' && se.label) {
                var vId = totalN++;
                virtChoiceNodes.push({id: vId, text: se.label, parentId: se.from, childId: se.to});
                newSimpEdges.push({from: se.from, to: vId, type: 'normal', label: '', viaChoice: true, choiceIdx: virtChoiceNodes.length - 1});
                newSimpEdges.push({from: vId, to: se.to, type: 'normal', label: '', viaChoice: true, choiceIdx: virtChoiceNodes.length - 1});
            } else {
                newSimpEdges.push(se);
            }
        }
        // Repopulate simpEdges (const array — clear and refill)
        simpEdges.length = 0;
        for (var ei = 0; ei < newSimpEdges.length; ei++) simpEdges.push(newSimpEdges[ei]);

        // Extend isImportant for virtual nodes
        for (var vi = 0; vi < virtChoiceNodes.length; vi++) isImportant[virtChoiceNodes[vi].id] = true;

        // Rebuild simpAdj with virtual nodes
        simpAdj.length = 0;
        for (var i = 0; i < totalN; i++) simpAdj[i] = [];
        for (var ei = 0; ei < simpEdges.length; ei++) {
            var f2 = simpEdges[ei].from, t2 = simpEdges[ei].to;
            if (f2 === t2) continue;
            if (simpAdj[f2].indexOf(t2) === -1) simpAdj[f2].push(t2);
        }

        // Topological sort & layer assignment (Kahn's algorithm)
        var layer = new Array(totalN).fill(-1);
        var topoIn = {};
        for (var ii = 0; ii < totalN; ii++) {
            if (!isImportant[ii]) continue;
            if (topoIn[ii] === undefined) topoIn[ii] = 0;
            var out = simpAdj[ii] || [];
            for (var vi = 0; vi < out.length; vi++) {
                var vv = out[vi];
                topoIn[vv] = (topoIn[vv] || 0) + 1;
            }
        }
        var kahnQueue = [];
        for (var key in topoIn) {
            if (topoIn[key] === 0) kahnQueue.push(parseInt(key));
        }
        if (kahnQueue.length === 0 && topoIn[0] !== undefined) kahnQueue = [0];
        var topoOrder = [];
        while (kahnQueue.length > 0) {
            var uu = kahnQueue.shift();
            topoOrder.push(uu);
            var out2 = simpAdj[uu] || [];
            for (var vi = 0; vi < out2.length; vi++) {
                var vv2 = out2[vi];
                topoIn[vv2]--;
                if (topoIn[vv2] === 0) kahnQueue.push(vv2);
            }
        }
        for (var oi = 0; oi < topoOrder.length; oi++) {
            var uu2 = topoOrder[oi];
            if (layer[uu2] === -1) layer[uu2] = 0;
            var out3 = simpAdj[uu2] || [];
            for (var vi = 0; vi < out3.length; vi++) {
                var vv3 = out3[vi];
                if (layer[vv3] < layer[uu2] + 1) layer[vv3] = layer[uu2] + 1;
            }
        }
        for (var i = 0; i < totalN; i++) {
            if (isImportant[i] && layer[i] === -1) layer[i] = 999;
        }

        var maxLayer = 0;
        for (var i = 0; i < totalN; i++) {
            if (isImportant[i] && layer[i] < 999 && layer[i] > maxLayer) maxLayer = layer[i];
        }

        // 章节信息
        const chapters = [];
        let chIdx = -1;
        for (let i = 0; i < N; i++) {
            const s = currentScenes[i];
            if (s && s.triggerChapterTransition) {
                if (chIdx >= 0 && chapters[chIdx]) chapters[chIdx].endLayer = maxLayer;
                chIdx++;
                chapters.push({
                    index: chIdx,
                    label: s.chapterName || s.subtitle || s.locationHint || ('第' + toChineseNumeral(chIdx + 1) + '章'),
                    startLayer: layer[i] >= 0 && layer[i] < 999 ? layer[i] : 0,
                    endLayer: maxLayer
                });
            }
        }
        if (chapters.length > 0 && chapters[chapters.length - 1]) {
            chapters[chapters.length - 1].endLayer = maxLayer;
        }

        // 入度统计（判断汇合点）
        const inCount = {};
        for (const e of simpEdges) inCount[e.to] = (inCount[e.to] || 0) + 1;

        // 精简节点列表 (包括虚拟选择节点)
        const nodes = [];
        // Build lookup map for virtual choice nodes
        var virtMap = {};
        for (var vi = 0; vi < virtChoiceNodes.length; vi++) {
            virtMap[virtChoiceNodes[vi].id] = virtChoiceNodes[vi];
        }
        for (let i = 0; i < totalN; i++) {
            if (!isImportant[i] || layer[i] < 0 || layer[i] > maxLayer) continue;

            if (i >= N) {
                // Virtual choice node
                var vcn = virtMap[i];
                if (!vcn) continue;
                nodes.push({
                    id: i,
                    layer: layer[i],
                    isVirtualChoice: true,
                    choiceText: vcn.text,
                    parentId: vcn.parentId,
                    childId: vcn.childId,
                    isChoice: false,
                    isEnding: false,
                    endingKey: null,
                    endingTitle: null,
                    endingUnlocked: false,
                    speaker: '',
                    text: vcn.text.substring(0, 28),
                    isMainPath: true,
                    isMerge: false,
                    isTransition: false,
                    isSaved: false,
                    chapter: -1
                });
                continue;
            }

            const s = currentScenes[i];
            if (!s) continue;
            // Fork-point scenes no longer marked isChoice — the virtual
            // choice nodes below them carry the diamond shape instead.
            const hasChoices = !!(s.choices && s.choices.length > 0);
            const cleanText = (s.text || '').replace(/\[[^\]]*\]/g, '').trim();
            const cleanSpeaker = (s.speaker || '').replace(/\[[^\]]*\]/g, '').trim();

            nodes.push({
                id: i,
                layer: layer[i],
                isVirtualChoice: false,
                isChoice: false,
                isForkPoint: hasChoices,
                isEnding: !!s.endingKey,
                endingKey: s.endingKey || null,
                endingTitle: s.endingTitle || null,
                endingUnlocked: s.endingKey ? unlockedEndings.includes(s.endingKey) : false,
                speaker: cleanSpeaker,
                text: cleanText.substring(0, 28),
                isMainPath: true,
                isMerge: (inCount[i] || 0) > 1,
                isTransition: !!s.triggerChapterTransition,
                isSaved: savedSceneSet.has(i),
                chapter: chapters.findIndex(function(c) { return layer[i] >= c.startLayer && layer[i] <= c.endLayer; })
            });
        }

        // --- Branch track computation ---
        var fwd = {}, rev = {};
        for (var ei = 0; ei < simpEdges.length; ei++) {
            var fromE = simpEdges[ei].from, toE = simpEdges[ei].to;
            if (fromE === toE) continue; // skip self-references
            (fwd[fromE] = fwd[fromE] || []);
            (rev[toE] = rev[toE] || []);
            if (fwd[fromE].indexOf(toE) === -1) fwd[fromE].push(toE);
            if (rev[toE].indexOf(fromE) === -1) rev[toE].push(fromE);
        }

        // Propagate tracks from root. Merge nodes lock their first-assigned
        // track so fork edges stay visually separated by track. But when a
        // merge node is revisited via a better track (closer to 0), that
        // better track propagates *downstream* to its children — keeping
        // the main path centered after the merge without collapsing the
        // fork edges into the same track column.
        var track = {};
        function propagateTrack(nodeId, currentTrack) {
            var existing = track[nodeId];
            var isMerge = (rev[nodeId] && rev[nodeId].length > 1);
            // Always revisit merge nodes so both incoming branches can
            // influence the merge position (centering logic below).
            var isBetter = existing === undefined ||
                           currentTrack === 0 ||
                           (existing !== 0 && Math.abs(currentTrack) < Math.abs(existing)) ||
                           isMerge;
            if (!isBetter) return;
            // First visit always sets the track. Re-visits centre the
            // merge node when the two incoming branches arrive from
            // opposite sides.
            if (!isMerge || existing === undefined) {
                track[nodeId] = currentTrack;
            } else if (currentTrack === 0 ||
                       (existing > 0 && currentTrack < 0) ||
                       (existing < 0 && currentTrack > 0)) {
                track[nodeId] = 0; // converging from both sides → centre
            }
            // Propagate the (possibly improved) track downstream.
            var eff = (isMerge && existing !== undefined) ? currentTrack : track[nodeId];
            var children = fwd[nodeId] || [];
            if (children.length <= 1) {
                for (var ci = 0; ci < children.length; ci++) {
                    propagateTrack(children[ci], eff);
                }
            } else {
                // Center children symmetrically around parent track.
                // 2 children → [-1, 1]; 3 → [-1, 0, 1]; 4 → [-1.5, -0.5, 0.5, 1.5]
                var halfSpan = (children.length - 1) / 2;
                for (var ci = 0; ci < children.length; ci++) {
                    propagateTrack(children[ci], eff + (ci - halfSpan));
                }
            }
        }
        propagateTrack(0, 0);

        // Ensure every node has a track and update path status
        for (var ni = 0; ni < nodes.length; ni++) {
            var nid = nodes[ni].id;
            if (track[nid] === undefined) track[nid] = 0;
            nodes[ni].branchTrack = track[nid];
            nodes[ni].isMainPath = (track[nid] === 0);
            if (rev[nid] && rev[nid].length > 1) nodes[ni].isMerge = true;
        }

        // Map layers to active track sets
        var tracksInLayer = {};
        var forkNodeIds = [];
        var mergeNodeIds = [];
        for (var ni = 0; ni < nodes.length; ni++) {
            var nid2 = nodes[ni].id;
            var l = nodes[ni].layer;
            if (!tracksInLayer[l]) tracksInLayer[l] = {};
            tracksInLayer[l][track[nid2]] = true;
            if (fwd[nid2] && fwd[nid2].length > 1) forkNodeIds.push(nid2);
            if (rev[nid2] && rev[nid2].length > 1) mergeNodeIds.push(nid2);
        }

        return { nodes: nodes, edges: simpEdges, chapters: chapters, maxLayer: maxLayer, layer: layer, tracksInLayer: tracksInLayer, forkNodeIds: forkNodeIds, mergeNodeIds: mergeNodeIds, fwd: fwd, rev: rev };
    }

