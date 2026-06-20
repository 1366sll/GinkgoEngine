    // ========== 滤镜效果 helpers（作用在子元素上，避免 filter 在 visualArea 创建包含块导致立绘错位）==========
    function _getVisualTargets() {
        // 返回需要施加滤镜的子元素（bg层 + 立绘容器），spriteWrapper/multiSpriteContainer 不直接加滤镜给 img 以保留 drop-shadow
        const targets = [bgLayer, bgLayer2, spriteWrapper];
        const multi = document.getElementById('multiSpriteContainer');
        if (multi && multi.children.length > 0) targets.push(multi);
        return targets.filter(Boolean);
    }
    function applyVisualFilter(filterStr) {
        _getVisualTargets().forEach(el => {
            // 已经在动画到同一目标滤镜，跳过，避免快速点击时反复取消重启
            if (el._filterAnim && el._filterTarget === filterStr) return;
            if (el._filterAnim) { el._filterAnim.cancel(); el._filterAnim = null; }
            const fromVal = getComputedStyle(el).filter;
            if (fromVal === filterStr) { el.style.filter = filterStr; el._filterTarget = null; return; }
            el._filterTarget = filterStr;
            const anim = el.animate(
                { filter: [fromVal, filterStr] },
                { duration: 800, easing: 'ease', fill: 'forwards' }
            );
            anim.onfinish = () => { el.style.filter = filterStr; el._filterAnim = null; el._filterTarget = null; };
            el._filterAnim = anim;
        });
    }
    function clearVisualFilter() {
        _getVisualTargets().forEach(el => {
            // 已经在清除滤镜的动画中，跳过，避免快速点击时反复重启
            if (el._filterAnim && el._filterTarget === 'none') return;
            if (el._filterAnim) { el._filterAnim.cancel(); el._filterAnim = null; }
            const fromVal = getComputedStyle(el).filter;
            if (fromVal === 'none' || fromVal === '') { el.style.filter = ''; el._filterTarget = null; return; }
            el._filterTarget = 'none';
            const anim = el.animate(
                { filter: [fromVal, 'none'] },
                { duration: 800, easing: 'ease', fill: 'forwards' }
            );
            anim.onfinish = () => { el.style.filter = ''; el._filterAnim = null; el._filterTarget = null; };
            el._filterAnim = anim;
        });
    }

    function fixSpritePosition() {
        const wrapper = document.getElementById('gameWrapper');
        const spriteDiv = spriteWrapper;
        if (!wrapper || !spriteDiv) return;
        if (getComputedStyle(wrapper).position !== 'relative') wrapper.style.position = 'relative';
        const visual = document.querySelector('.visual-area');
        if (visual && getComputedStyle(visual).position === 'relative') visual.style.position = 'static';
        spriteDiv.style.position = 'absolute';
        spriteDiv.style.bottom = '0';
        spriteDiv.style.right = '5%';
        spriteDiv.style.height = '94%';
    }

    let bgFadeTimer = null;
    function setBackground(bgKey) {
        if (bgKey) unlockItem('bg', bgKey);
        setCurrentDisplayBg(bgKey || '');
        let url = assetConfig.bg?.[bgKey];
        let bgVal = url ? `url(${url})` : "linear-gradient(135deg, #2e3f2c, #1d2a1a)";
        const currentBg = bgLayer.style.backgroundImage;
        // 如果上一次交叉淡化还在进行中，立即终止并直接切到新背景
        if (bgFadeTimer) {
            clearTimeout(bgFadeTimer);
            bgFadeTimer = null;
            bgLayer.style.transition = 'filter 0.8s ease';
            bgLayer.style.backgroundImage = bgVal;
            bgLayer.style.backgroundSize = "cover";
            bgLayer.style.backgroundPosition = "center";
            bgLayer.style.opacity = '1';
            bgLayer2.style.transition = 'none';
            bgLayer2.style.opacity = '0';
            if (url) preloadImage(url).catch(() => {});
            return;
        }
        // 首次设置，直接显示
        if (!currentBg || currentBg === 'none') {
            bgLayer.style.backgroundImage = bgVal;
            bgLayer.style.backgroundSize = "cover";
            bgLayer.style.backgroundPosition = "center";
            if (url) preloadImage(url).catch(() => {});
            return;
        }
        // 同一张图，跳过（精确匹配URL，避免子串误判）
        if (url) {
            const currentUrl = currentBg.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
            if (currentUrl === url) return;
        }
        // 先预加载图片，避免切换时白屏
        if (url) {
            preloadImage(url).then(() => doBgSwap(bgVal)).catch(() => doBgSwap(bgVal));
        } else {
            doBgSwap(bgVal);
        }
    }
    function doBgSwap(bgVal) {
        // 清除可能残留的旧定时器，避免快速切背景时闪现错误画面
        if (bgFadeTimer) { clearTimeout(bgFadeTimer); bgFadeTimer = null; }
        // 使用 bgLayer2 实现平滑交叉淡化
        bgLayer2.style.transition = 'none';
        bgLayer2.style.backgroundImage = bgVal;
        bgLayer2.style.backgroundSize = 'cover';
        bgLayer2.style.backgroundPosition = 'center';
        bgLayer2.style.opacity = '0';
        void bgLayer2.offsetWidth; // 强制回流
        bgLayer2.style.transition = 'opacity 0.7s ease, filter 0.8s ease';
        bgLayer2.style.opacity = '1';
        bgFadeTimer = setTimeout(function() {
            bgLayer.style.transition = 'filter 0.8s ease';
            bgLayer.style.backgroundImage = bgVal;
            bgLayer.style.backgroundSize = 'cover';
            bgLayer.style.backgroundPosition = 'center';
            bgLayer.style.opacity = '1';
            bgLayer2.style.transition = 'opacity 0.3s ease, filter 0.8s ease';
            bgLayer2.style.opacity = '0';
        }, 700);
    }

    let spriteFadeTimer = null;
    let spriteGeneration = 0;      // 防止立绘异步加载的竞态条件
    let hasActiveSprite = false;   // 当前是否有立绘在场（用于灰化判断）

    const DIM_FILTER = 'grayscale(0.5) brightness(0.5) drop-shadow(0 8px 14px rgba(0,0,0,0.4))';
    const NORMAL_FILTER = 'grayscale(0) brightness(1) drop-shadow(0 8px 14px rgba(0,0,0,0.4))';

    function dimSprite() {
        [spriteImg, spriteImg2].forEach(function(el) {
            // ★ 精确判断：naturalWidth>0 说明图片真正加载了（忽略浏览器将空 src 解析为页面 URL 的情况）
            if (!el || !el.naturalWidth) return;
            if (el._filterAnim) { el._filterAnim.cancel(); el._filterAnim = null; }
            var fromVal = getComputedStyle(el).filter;
            if (fromVal === 'none' || fromVal === '') fromVal = NORMAL_FILTER;
            el._filterAnim = el.animate(
                { filter: [fromVal, DIM_FILTER] },
                { duration: 500, easing: 'ease', fill: 'forwards' }
            );
            el._filterAnim.onfinish = function() { el.style.filter = DIM_FILTER; el._filterAnim = null; };
        });
    }
    function undimSprite() {
        [spriteImg, spriteImg2].forEach(function(el) {
            if (!el || !el.naturalWidth) return;
            if (el._filterAnim) { el._filterAnim.cancel(); el._filterAnim = null; }
            var fromVal = getComputedStyle(el).filter;
            if (fromVal === 'none' || fromVal === '') fromVal = NORMAL_FILTER;
            el._filterAnim = el.animate(
                { filter: [fromVal, NORMAL_FILTER] },
                { duration: 500, easing: 'ease', fill: 'forwards' }
            );
            el._filterAnim.onfinish = function() { el.style.filter = NORMAL_FILTER; el._filterAnim = null; };
        });
    }
    function dimMultiSprites() {
        var container = document.getElementById('multiSpriteContainer');
        if (!container) return;
        var imgs = container.querySelectorAll('.sprite-slot img');
        imgs.forEach(function(img) {
            if (!img.naturalWidth) return;
            if (img._filterAnim) { img._filterAnim.cancel(); img._filterAnim = null; }
            var fromVal = getComputedStyle(img).filter;
            if (fromVal === 'none' || fromVal === '') fromVal = NORMAL_FILTER;
            img._filterAnim = img.animate(
                { filter: [fromVal, DIM_FILTER] },
                { duration: 500, easing: 'ease', fill: 'forwards' }
            );
            img._filterAnim.onfinish = function() { img.style.filter = DIM_FILTER; img._filterAnim = null; };
        });
    }
    function undimMultiSprites() {
        // 只恢复 main 立绘，非 main 立绘保持灰化
        var container = document.getElementById('multiSpriteContainer');
        if (!container) return;
        currentMultiSprites.forEach(function(spr) {
            if (!spr.main) return;
            var slot = container.querySelector('[data-sprite-key="' + spr.key + '"]');
            if (!slot) return;
            var img = slot.querySelector('img');
            if (!img || !img.src) return;
            if (img._filterAnim) { img._filterAnim.cancel(); img._filterAnim = null; }
            var fromVal = getComputedStyle(img).filter;
            if (fromVal === 'none' || fromVal === '') fromVal = DIM_FILTER;
            img._filterAnim = img.animate(
                { filter: [fromVal, NORMAL_FILTER] },
                { duration: 500, easing: 'ease', fill: 'forwards' }
            );
            img._filterAnim.onfinish = function() { img.style.filter = NORMAL_FILTER; img._filterAnim = null; };
        });
    }

    function setSprite(type) {
        if (spriteFadeTimer) clearTimeout(spriteFadeTimer);
        if (!type) {
            spriteWrapper.style.opacity = "0";
            spriteImg2.style.opacity = "0";
            undimSprite();
            hasActiveSprite = false;
            return;
        }
        let url = assetConfig.sprites?.[type];
        if (!url) {
            spriteWrapper.style.opacity = "0";
            spriteImg2.style.opacity = "0";
            undimSprite();
            hasActiveSprite = false;
            return;
        }
        hasActiveSprite = true;
        // 有立绘要显示，移除灰化滤镜
        undimSprite();
        const endsWith = (full, suffix) => {
            try { return new URL(full).pathname === new URL(suffix, location.href).pathname; } catch(e) { return full.endsWith(suffix); }
        };
        // 同一立绘，跳过（但已移除灰化）
        if (spriteImg.src && endsWith(spriteImg.src, url)) return;

        spriteGeneration++;
        const gen = spriteGeneration;

        // 缓存命中：直接显示
        if (imageCache.has(url)) {
            applySpriteWithUrl(url, type);
            return;
        }
        // 未缓存：预加载后再显示，期间保持旧立绘（不闪白）
        preloadImage(url).then(() => {
            if (gen !== spriteGeneration) return; // 已被更新的调用覆盖，丢弃
            applySpriteWithUrl(url, type);
        }).catch(() => {
            if (gen !== spriteGeneration) return;
            applySpriteWithUrl(url, type);
        });
    }
    function getSpriteCharDir(url) {
        if (!url) return null;
        var m = url.match(/lhcf\/([^/]+)\//);
        return m ? m[1] : null;
    }
    function applySpriteWithUrl(url, type) {
        if (spriteTransitionMode === 'instant') {
            spriteImg.style.transition = 'none';
            spriteImg.src = url;
            spriteImg.style.opacity = "1";
            spriteWrapper.style.opacity = "1";
            spriteImg2.style.opacity = "0";
            unlockItem('sprite', type);
            return;
        }
        var oldUrl = spriteImg.src;
        var oldDir = getSpriteCharDir(oldUrl);
        var newDir = getSpriteCharDir(url);
        // 不同角色之间直接切换，同一角色差分之间交叉淡化（GSAP 驱动）
        if (oldDir && newDir && oldDir !== newDir) {
            if (spriteFadeTimer) { clearTimeout(spriteFadeTimer); spriteFadeTimer = null; }
            spriteImg.src = url;
            gsap.set(spriteImg, { opacity: 1 });
            gsap.set(spriteImg2, { opacity: 0 });
            spriteWrapper.style.opacity = "1";
            spriteWrapper.classList.remove('slide-in-right', 'slide-in-left', 'slide-out');
            unlockItem('sprite', type);
            return;
        }
        // 立绘进场动画：GSAP 驱动的交叉淡化
        // 仅首次出现时播放入场滑入效果，同一角色差分切换只做交叉淡化
        var isNewSprite = !oldUrl;
        spriteWrapper.classList.remove('slide-in-right', 'slide-in-left', 'slide-out');
        if (isNewSprite) {
            gsap.fromTo(spriteWrapper, { x: 60, opacity: 0.5 }, { x: 0, opacity: 1, duration: 0.4, ease: "power2.out" });
        }
        spriteImg2.src = url;
        gsap.set(spriteImg2, { opacity: 0 });
        gsap.to(spriteImg2, { opacity: 1, duration: 0.25, ease: "power2.out" });
        spriteWrapper.style.opacity = '1';
        spriteFadeTimer = setTimeout(function() {
            spriteImg.src = url;
            gsap.set(spriteImg, { opacity: 1 });
            gsap.set(spriteImg2, { opacity: 0 });
        }, 300);
        unlockItem('sprite', type);
    }

    function buildCgNavList(currentKey) {
        cgNavKeys = Object.keys(assetConfig.cg || {});
        cgNavIndex = cgNavKeys.indexOf(currentKey);
        if (cgNavKeys.length > 1) {
            cgPrevBtn.style.display = 'flex';
            cgNextBtn.style.display = 'flex';
        } else {
            cgPrevBtn.style.display = 'none';
            cgNextBtn.style.display = 'none';
        }
    }
    function navigateCg(direction) {
        if (cgNavKeys.length === 0) return;
        cgNavIndex = (cgNavIndex + direction + cgNavKeys.length) % cgNavKeys.length;
        const key = cgNavKeys[cgNavIndex];
        const url = assetConfig.cg[key];
        document.getElementById('cgImage').src = url;
        unlockItem('cg', key);
        lastTriggeredCGUrl = url;
        localStorage.setItem('lastTriggeredCGUrl', url);
    }

    // ========== Howler.js BGM 音频引擎 ==========
    // 创建兼容 Audio API 的 Howl 实例 (如何ler通过html5模式替换原生Audio)
    function _createBgmHowl(url, vol) {
        // ★ 旧实例由 playBgm 负责淡出 + 卸载，这里不再 unload
        // （避免打断交叉淡化动画）
        audioElement = new Howl({
            src: [url],
            loop: true,
            volume: vol || 0.5,
            html5: true,
            preload: true
        });
        audioElement._paused = true;
        audioElement._src = url;
        audioElement._duration = 0;
        audioElement._onended = null;
        audioElement._loop = true;
        audioElement._endListenerFn = null;
        // 保存原始方法引用（Object.defineProperty 会覆盖同名属性）
        var _origDuration = audioElement.duration.bind(audioElement);
        var _origSeek = audioElement.seek.bind(audioElement);
        var _origLoop = audioElement.loop.bind(audioElement);
        // onload 时更新缓存时长
        audioElement._origOn = audioElement.on.bind(audioElement);
        audioElement._origOn('load', function() {
            audioElement._duration = _origDuration();
        });
        // 补丁: Audio兼容属性
        audioElement._origPlay = audioElement.play.bind(audioElement);
        audioElement.play = function() { this._paused = false; return this._origPlay(); };
        audioElement._origPause = audioElement.pause.bind(audioElement);
        audioElement.pause = function() { this._paused = true; return this._origPause(); };
        Object.defineProperty(audioElement, 'paused', { get: function() { return this._paused || !this.playing(); } });
        Object.defineProperty(audioElement, 'volume', {
            get: function() { return Howl.prototype.volume.call(this); },
            set: function(v) { Howl.prototype.volume.call(this, Math.max(0, Math.min(1, v))); }
        });
        Object.defineProperty(audioElement, 'currentTime', {
            get: function() { return _origSeek() || 0; },
            set: function(v) { _origSeek(v); }
        });
        Object.defineProperty(audioElement, 'duration', { get: function() { return this._duration || 0; } });
        Object.defineProperty(audioElement, 'loop', {
            get: function() { return this._loop; },
            set: function(v) { this._loop = v; _origLoop(v); }
        });
        Object.defineProperty(audioElement, 'onended', {
            get: function() { return this._onended; },
            set: function(fn) {
                if (this._endListenerFn) { this.off('end', this._endListenerFn); this._endListenerFn = null; }
                this._onended = fn;
                if (fn) { this._endListenerFn = fn; this.on('end', fn); }
            }
        });
        Object.defineProperty(audioElement, 'src', {
            get: function() { return this._src; },
            set: function(v) { this._src = v; }
        });
        audioElement.load = function() {};
        audioElement.addEventListener = function() {};
        audioElement.removeEventListener = function() {};
        bgmHowl = audioElement;
        return audioElement;
    }

    let _bgmFadingOut = null; // 正在淡出的旧 BGM 实例

    function playBgm(trackId, force = false) {
        if (!trackId || !assetConfig.bgm?.[trackId]) return;
        let vol = audioElement ? audioElement.volume : 0.5;
        if (!force && currentBgm === trackId && audioElement && !audioElement.paused) return;
        let displayName = MUSIC_NAME_MAP[trackId] || trackId;
        showMusicHint(displayName);
        if (trackId && assetConfig.bgm[trackId]) unlockItem('bgm', trackId);
        forceStopBgmDucking();

        // ★ BGM 交叉淡化：旧曲 fade out + 新曲 fade in
        var oldHowl = audioElement;
        if (oldHowl && typeof oldHowl.playing === 'function' && oldHowl.playing()) {
            // 旧曲播放中：淡出。用局部变量作为令牌，闭包异步检查，防止快速切歌泄露。
            try { oldHowl.fade(oldHowl.volume(), 0, 600); } catch(e) {}
            var token = oldHowl;
            _bgmFadingOut = token;
            setTimeout(function() {
                // ★ 不依赖全局 _bgmFadingOut 来判定（快速切多曲时会被覆盖），
                //    直接检查这个 Howl 实例是否仍是"即将卸载的那个"
                if (_bgmFadingOut === token) { _bgmFadingOut = null; }
                try { token.unload(); } catch(e) {}
            }, 700);
        } else if (oldHowl) {
            // ★ 旧曲未播放（暂停/停止），直接卸载防止内存泄漏
            if (_bgmFadingOut === oldHowl) _bgmFadingOut = null;
            try { oldHowl.unload(); } catch(e) {}
        }

        currentBgm = trackId;
        lastTriggeredBGM = trackId;
        localStorage.setItem('lastTriggeredBGM', trackId);
        // 新曲从 0 音量开始，淡入到目标音量
        _createBgmHowl(assetConfig.bgm[trackId], 0);
        if (userInteracted || force) {
            audioElement.play();
            audioElement._paused = false;
            // 淡入到目标音量
            audioElement.fade(0, vol, 600);
        } else {
            audioElement._paused = true;
            audioElement.volume(vol);
        }
        updateCurrentBgmDisplay();
        updateBgmToggleUI();
    }

    function playSe(seKey) {
        if (!seKey) return;
        const seUrl = assetConfig.se?.[seKey];
        if (!seUrl) { console.warn(`音效未找到: ${seKey}`); return; }
        new Howl({ src: [seUrl], volume: seVolume, html5: true, onend: function() { this.unload(); } }).play();
    }

    function stopAllBgm() {
        forceStopBgmDucking();
        if (audioElement) { audioElement.pause(); audioElement.seek(0); }
        currentBgm = null;
        updateCurrentBgmDisplay();
        updateBgmToggleUI();
    }

    function updateBgmToggleUI() {
        if (bgmToggleBtn) bgmToggleBtn.innerText = (audioElement && !audioElement.paused && currentBgm) ? "播放中" : "已暂停";
        if (volumeSlider && audioElement) volumeSlider.value = audioElement.volume * 100;
        if (volumeValue) volumeValue.innerText = Math.round(((audioElement && audioElement.volume) || 0.5) * 100) + '%';
    }
    function updateCurrentBgmDisplay() {
        if (!currentMusicDisplay) return;
        if (!currentBgm || !assetConfig.bgm?.[currentBgm]) { currentMusicDisplay.innerText = '(无)'; return; }
        currentMusicDisplay.innerText = MUSIC_NAME_MAP[currentBgm] || currentBgm;
    }
    function enableAudioOnInteraction() {
        if (userInteracted) return;
        userInteracted = true;
        if (audioElement && currentBgm && audioElement.paused && gameActive) audioElement.play();
        updateBgmToggleUI();
    }
    document.body.addEventListener('click', enableAudioOnInteraction);
    document.body.addEventListener('touchstart', enableAudioOnInteraction);

    // 核心推进
    let chapterTransitionTimer = null;
    let chapterTransitionCallback = null;
    let sceneAdvanceCooldown = 0;  // 场景推进冷却时间戳，防止按键重复导致连续跳过
    function performNextDialogue() {
        if (isTyping) return false;
        if (!gameActive) return false;
        if (chapterTransitionTimer) return false;
        if (sceneTransitionTimer) return false;
        if (!isFastForwarding && Date.now() < sceneAdvanceCooldown) return false;
        const scene = currentScenes[currentIndex];
        if (scene && scene.choices && scene.choices.length > 0) {
            if (autoPlayEnabled) { stopAutoPlay(); resumeAutoPlayAfterPause = true; }
            if (isFastForwarding) { stopFastForward(); resumeFastForwardAfterCG = true; }
            return false;
        }
        if (!scene) { endPrologue(); return false; }
        let nxt = (scene.next !== undefined && scene.next !== null) ? scene.next : currentIndex + 1;
        if (nxt === -1 || nxt >= currentScenes.length) {
            endPrologue();
            return false;
        }
        currentIndex = nxt;
        updateScene();
        sceneAdvanceCooldown = Date.now() + 350;
        return true;
    }

    function debounce(func, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => func.apply(this, args), delay);
        };
    }

    function nextDialogue() {
        if (chapterTransitionTimer) return;
        // 视频覆盖层可见时：先停止视频，然后继续推进（与点击跳过行为一致）
        const videoOverlayEl = document.getElementById('videoOverlay');
        if (videoOverlayEl && videoOverlayEl.classList.contains('show')) {
            stopVideo();
            // 继续走下面的推进逻辑，一次按键 = 停止视频 + 推进到下一场景
        }
        // CG 覆盖层可见时：先关闭 CG，然后继续推进
        const cgLayerEl = document.getElementById('cgLayer');
        if (cgLayerEl && cgLayerEl.classList.contains('show')) {
            cgLayerEl.classList.remove('show');
            // 继续走下面的推进逻辑
        }
        // 回溯中点击继续：退出回溯并直接推进到下一句
        if (rollbackPos >= 0) {
            rollbackPos = -1;
            rollbackStack = [];
            // 跳过 pushRollbackState，因为 DOM 上是回溯态的旧画面
            isRollingBack = true;
            performNextDialogue();
            isRollingBack = false;
            return;
        }
        const wasAutoRunning = autoPlayEnabled;
        const wasFFRunning = isFastForwarding;
        const curScene = currentScenes[currentIndex];
        const hasCG = curScene && (curScene.cgKey || curScene.videoKey);
        if (autoPlayEnabled) {
            if (curScene && (curScene.cgKey || curScene.videoKey || (curScene.choices && curScene.choices.length > 0))) {
                resumeAutoPlayAfterPause = true;
            }
            stopAutoPlay();
        }
        if (isFastForwarding) {
            const shouldResume = curScene && (curScene.cgKey || curScene.videoKey || (curScene.choices && curScene.choices.length > 0));
            stopFastForward();
            if (shouldResume) resumeFastForwardAfterCG = true;
        }
        if (isSkipRead) stopSkipRead();
        // CG 场景：自动/快进刚停止时，完成打字后等待用户手动空格推进，不自动跳过 CG
        if (hasCG && (wasAutoRunning || wasFFRunning)) {
            if (isTyping) completeCurrentTyping();
            return;
        }
        // 两段式交互：如果正在打字，先立即完成打字；否则进入下一句
        if (isTyping) {
            completeCurrentTyping();
        } else {
            const wasCGResume = resumeFastForwardAfterCG;
            const wasAutoResume = resumeAutoPlayAfterPause;
            resumeFastForwardAfterCG = false;
            resumeAutoPlayAfterPause = false;
            // ★ 自适应阅读速度：采样玩家阅读当前句子的节奏
            if (adaptiveSpeedEnabled && _textReadyTime > 0) {
                var curSceneText = (currentScenes[currentIndex] && currentScenes[currentIndex].text) || '';
                var plainLen = curSceneText.replace(/\[[^\]]*\]/g, '').length;
                _updateAdaptiveSpeed(plainLen);
            }
            performNextDialogue();
            // CG/选项结束后自动恢复快进
            if (wasCGResume && gameActive) {
                const scene = currentScenes[currentIndex];
                if (scene && !scene.cgKey && !scene.videoKey && !(scene.choices && scene.choices.length > 0)) {
                    startFastForward(true);
                }
            }
            // CG/选项结束后自动恢复自动播放
            if (wasAutoResume && gameActive) {
                const scene = currentScenes[currentIndex];
                if (scene && !scene.cgKey && !scene.videoKey && !(scene.choices && scene.choices.length > 0)) {
                    startAutoPlay();
                }
            }
        }
    }

    let seVolumeDebounceTimer = null;
    let voiceDebounceTimer = null;
    function setSeVolume(value) {
        let newVol = value / 100;
        seVolume = Math.min(1, Math.max(0, newVol));
        // 更新所有滑块显示（立即响应）
        const seSliders = document.querySelectorAll('#seVolumeSlider, #menuSeVolumeSlider');
        seSliders.forEach(slider => { if (slider) slider.value = seVolume * 100; });
        const seValues = document.querySelectorAll('#seVolumeValue, #menuSeVolumeValue');
        seValues.forEach(span => { if (span) span.innerText = Math.round(seVolume * 100) + '%'; });
        
        // 防抖保存到 localStorage（停止滑动 300ms 后保存）
        if (seVolumeDebounceTimer) clearTimeout(seVolumeDebounceTimer);
        seVolumeDebounceTimer = setTimeout(() => {
            localStorage.setItem(SE_VOLUME_KEY, Math.round(seVolume * 100));
        }, 300);
    }

    function getDelayForText(text) {
        const charCount = (text || '').length;
        // 基础延迟0.5秒，每个字增加0.06秒，最大延迟5秒，最小minAutoPlayDelay秒
        let delay = 0.5 + charCount * autoPlaySpeed;
        delay = Math.min(5, Math.max(minAutoPlayDelay, delay));
        return delay * 1000; // 毫秒
    }

    // ========== 场景切换过渡效果系统 ==========
    let sceneTransitionTimer = null;
    let _transitionOverlayReady = false;

    function _getTransitionOverlay() {
        var el = document.getElementById('sceneTransitionOverlay');
        if (!el) return null;
        if (!_transitionOverlayReady) {
            _transitionOverlayReady = true;
            el.addEventListener('transitionend', function(e) {
                // 仅响应 opacity 的 transitionend，避免 transform 误触发
                if (e.propertyName === 'opacity' && el._onRevealEnd) {
                    var cb = el._onRevealEnd;
                    el._onRevealEnd = null;
                    cb();
                }
            });
        }
        return el;
    }

    // 支持的过渡类型及默认时长(ms)
    var TRANSITION_DEFAULTS = {
        fade: 500, fadeWhite: 500,
        slideLeft: 550, slideRight: 550, slideUp: 500, slideDown: 500,
        curtainOpen: 650, curtainClose: 700,
        blinds: 600, zoomIn: 550
    };

    function playSceneTransition(type, callback) {
        if (!type || type === 'none') { callback(); return; }
        var overlay = _getTransitionOverlay();
        if (!overlay) { callback(); return; }
        if (sceneTransitionTimer) {
            clearTimeout(sceneTransitionTimer);
            sceneTransitionTimer = null;
            overlay.className = 'scene-transition-overlay';
            overlay.style.transition = '';
            overlay._onRevealEnd = null;
        }

        var duration = TRANSITION_DEFAULTS[type] || 500;

        // 清除旧 class，设置过渡类型
        overlay.className = 'scene-transition-overlay trans-' + type;
        // 强制回流
        void overlay.offsetWidth;

        // 阶段1：覆盖屏幕（in）
        overlay.classList.add('in');
        overlay.style.transition = 'opacity ' + (duration * 0.45) + 'ms ease-in, transform ' + (duration * 0.45) + 'ms ease-in';

        sceneTransitionTimer = setTimeout(function() {
            var timerBeforeCallback = sceneTransitionTimer;
            // 阶段2：执行场景更新
            callback();
            // 如果递归调用（如 conditionNext→updateScene）修改了 sceneTransitionTimer，
            // 说明内层过渡已接管，放弃外层清理，避免破坏内层过渡状态
            if (sceneTransitionTimer !== timerBeforeCallback) return;

            // 阶段3：揭开屏幕（out）
            // 强制回流确保 callback 中的 DOM 变更已提交
            void overlay.offsetWidth;
            overlay.classList.remove('in');
            overlay.style.transition = 'opacity ' + (duration * 0.55) + 'ms ease-out, transform ' + (duration * 0.55) + 'ms ease-out';

            overlay._onRevealEnd = function() {
                overlay.className = 'scene-transition-overlay';
                overlay.style.transition = '';
                sceneTransitionTimer = null;
            };

            // 兜底定时器（防止 transitionend 未触发）
            setTimeout(function() {
                if (sceneTransitionTimer === null) return;
                if (overlay._onRevealEnd) {
                    var cb = overlay._onRevealEnd;
                    overlay._onRevealEnd = null;
                    cb();
                }
            }, duration + 100);
        }, duration * 0.45);
    }

    // 是否应该跳过过渡（回溯/快进/首场景）
    function _shouldSkipTransition(scene) {
        if (isRollingBack) return true;
        if (isFastForwarding) return true;
        if (isSkipRead) return true;
        if (chapterTransitionTimer) return true;
        if (!scene || !scene.transition || scene.transition === 'none') return true;
        if (scene.videoKey) return true;
        return false;
    }

    function updateScene() {
        if (!gameActive || !currentScenes.length) return;
        if (currentIndex < 0 || currentIndex >= currentScenes.length) { endPrologue(); return; }
        const scene = currentScenes[currentIndex];
        if (!scene) { endPrologue(); return; }

        // 场景过渡效果：在画面更新前先播过渡动画
        if (!_shouldSkipTransition(scene)) {
            var transType = scene.transition;
            playSceneTransition(transType, function() {
                _renderScene(scene);
            });
            return;
        }

        _renderScene(scene);
    }

    // 解析 conditionNext 路由：匹配条件 → default → scene.next → currentIndex+1
    function resolveConditionalNext(scene) {
        if (!scene.conditionNext || typeof scene.conditionNext !== 'object') {
            if (scene.next !== undefined && scene.next !== null) currentIndex = scene.next;
            else currentIndex++;
            if (currentIndex < 0 || currentIndex >= currentScenes.length) { endPrologue(); }
            return;
        }
        var matched = false;
        var condKeys = Object.keys(scene.conditionNext);
        for (var ci = 0; ci < condKeys.length; ci++) {
            var condKey = condKeys[ci];
            if (condKey === 'default') continue;
            if (evalCondition(condKey)) {
                currentIndex = scene.conditionNext[condKey];
                matched = true;
                break;
            }
        }
        if (!matched && scene.conditionNext['default'] !== undefined) {
            currentIndex = scene.conditionNext['default'];
        } else if (!matched) {
            console.warn('[银杏] conditionNext 未匹配且无 default，使用 scene.next 推进');
            var fallback = (scene.next !== undefined && scene.next !== null) ? scene.next : currentIndex + 1;
            if (fallback < 0 || fallback >= currentScenes.length) { endPrologue(); return; }
            currentIndex = fallback;
        }
        // 统一边界检查
        if (currentIndex < 0 || currentIndex >= currentScenes.length) { endPrologue(); }
    }

    // 实际渲染场景内容（背景、立绘、文本等）
    function _renderScene(scene) {
        if (!gameActive) return;
        // 变量系统：设置变量
        if (scene.setVar && typeof scene.setVar === 'object') {
            Object.keys(scene.setVar).forEach(function(k) {
                setVar(k, scene.setVar[k]);
            });
            setVar("_used_variable", (getVar("_used_variable") || 0) + 1);
            checkAchievements();
        }

        // 过章动画：优先处理，确保切章标志场景不被 conditionNext 吞掉
        if (scene.triggerChapterTransition) {
            markSceneRead();
            var autoSave = getAutoSave();
            if (!autoSave || getChapterNumber(autoSave.sceneIndex) < getChapterNumber(currentIndex)) {
                saveToAutoSlot();
            }
            if (isFastForwarding) { fastForwardScenePauseUntil = Date.now() + 1600; }
            if (autoPlayEnabled) { stopAutoPlay(); resumeAutoPlayAfterPause = true; }
            let chapterNum = getChapterNumberForTransition(currentIndex);
            let chapterTitle = `第${toChineseNumeral(chapterNum)}章`;
            let subTitle = scene.subtitle || scene.text || "Ginkgo Engine";
            showChapterTransition(chapterTitle, subTitle, () => {
                // ★ 懒加载：过章后预加载下一个章节
                _preloadNextChapter(currentIndex);
                // 过章后路由：优先用 conditionNext，其次 scene.next，否则 +1
                resolveConditionalNext(scene);
                updateScene();
                if (resumeAutoPlayAfterPause && gameActive) {
                    const nextScene = currentScenes[currentIndex];
                    if (nextScene && !nextScene.cgKey && !nextScene.videoKey && !(nextScene.choices && nextScene.choices.length > 0)) {
                        resumeAutoPlayAfterPause = false;
                        startAutoPlay();
                    }
                }
            });
            chapterHistory = [];
            return;
        }

        // 条件跳转：纯路由场景（无切章动画）
        if (scene.conditionNext && typeof scene.conditionNext === 'object') {
            resolveConditionalNext(scene);
            updateScene();
            return;
        }

        // 回溯：在当前场景即将改变画面前，保存上一个场景的显示状态
        if (!scene.triggerChapterTransition && !isRollingBack) {
            pushRollbackState();
        }

        // 画面演出效果（null/undefined 时也要清除残留滤镜）
        applySceneEffects(scene.effects || []);

        if (scene.bg) {
            if (isFastForwarding && lastRenderedBgKey && scene.bg !== lastRenderedBgKey) {
                fastForwardScenePauseUntil = Date.now() + 700;
            }
            setBackground(scene.bg);
            lastRenderedBgKey = scene.bg;
        }

        // --- 清场：立绘从右侧滑出离场 ---
        if (scene.clearStage) {
            undimSprite();
            // 多角色立绘也全部离场
            if (currentMultiSprites.length > 0) {
                var mcContainer = document.getElementById('multiSpriteContainer');
                currentMultiSprites.forEach(function(spr) {
                    var el = mcContainer ? mcContainer.querySelector('[data-sprite-key="' + spr.key + '"]') : null;
                    if (el) _animateSlotExit(el, spr.position || 'right');
                });
                currentMultiSprites = [];
            }
            if (scene.sprite || scene.sprites) {
                // 有新立绘要上场，立即清除旧立绘（新立绘自带入场动画）
                spriteImg.src = '';
                spriteImg2.src = '';
                hasActiveSprite = false;
                gsap.set(spriteWrapper, { x: 0, opacity: 1 });
            } else if (hasActiveSprite) {
                // 无新立绘，旧立绘滑出离场
                hasActiveSprite = false;
                gsap.to(spriteWrapper, {
                    x: 150, opacity: 0, duration: 0.45, ease: "power2.in",
                    onComplete: () => {
                        spriteImg.src = '';
                        spriteImg2.src = '';
                        gsap.set(spriteWrapper, { x: 0 });
                    }
                });
            }
        }

        // 清除可能残留的单立绘淡入淡出定时器
        if (spriteFadeTimer) { clearTimeout(spriteFadeTimer); spriteFadeTimer = null; }

        // 多角色立绘 (优先) 或单立绘 (回退)
        if (scene.sprites && Array.isArray(scene.sprites)) {
            undimSprite();
            undimMultiSprites();
            hasActiveSprite = true;
            updateMultiSprites(scene.sprites);
        } else if (scene.sprite) {
            // 多→单立绘降级：同角色立绘静默迁移到单立绘系统，不播离场动画
            if (currentMultiSprites.length > 0) {
                var singleCharDir = getSpriteCharDir(assetConfig.sprites?.[scene.sprite]);
                if (singleCharDir) {
                    var demoted = currentMultiSprites.find(function(s) {
                        return getSpriteCharDir(_getSpriteUrl(s.key)) === singleCharDir;
                    });
                    if (demoted) {
                        var demoteEl = document.getElementById('multiSpriteContainer');
                        demoteEl = demoteEl ? demoteEl.querySelector('[data-sprite-key="' + demoted.key + '"]') : null;
                        if (demoteEl) demoteEl.remove();
                        currentMultiSprites = currentMultiSprites.filter(function(s) { return s.key !== demoted.key; });
                    }
                }
                updateMultiSprites(null);
            }
            setSprite(scene.sprite);
        } else if (!scene.clearStage && hasActiveSprite) {
            // 没有立绘变化：保持立绘在场但灰化
            if (currentMultiSprites.length > 0) {
                dimMultiSprites();
            } else {
                spriteWrapper.style.opacity = '1';
                dimSprite();
            }
        }

        if (scene.speaker && scene.speaker !== " ") {
            // 支持角色名颜色标记: [c=gold]角色名[/c] 格式 + 变量插值
            const parsedName = parseTextMarkup(interpolateVars(scene.speaker));
            speakerEl.innerHTML = parsedName;
            speakerEl.classList.remove("empty");
        } else {
            speakerEl.innerText = "　";
            speakerEl.classList.add("empty");
        }
        startTypingAnimation(interpolateVars(scene.text || ""));

        if (scene.locationHint) { locationHintEl.innerText = scene.locationHint; locationHintEl.classList.add('show'); }
        else locationHintEl.classList.remove('show');

        if (scene.bgm && scene.bgm !== currentBgm) playBgm(scene.bgm);
        handleCgDisplayEnhanced(scene.cgKey);
        if (scene.videoKey) playSceneVideo(scene.videoKey);

        // 结局解锁检测
        if (scene.endingKey) {
            unlockEnding(scene.endingKey, scene.endingTitle || scene.endingKey);
        }

        if (scene.seKey) playSe(scene.seKey);

        // 语音播放
        if (scene.voice) playVoice(scene.voice);
        else stopVoice();

        // 好感度
        updateAffinity(scene);

        // 跳过预览指示器
        updateSkipIndicator(scene);

        if (scene.choices && scene.choices.length > 0) {
            if (isFastForwarding) { stopFastForward(); resumeFastForwardAfterCG = true; }
            if (autoPlayEnabled) { stopAutoPlay(); resumeAutoPlayAfterPause = true; }
            displayChoices(scene.choices);
        } else {
            clearChoices();
        }

        if (scene.text && scene.text.trim() !== "" && !scene.triggerChapterTransition) {
            chapterHistory.push({
                speaker: scene.speaker || "",
                text: scene.text,
                sprite: scene.sprite,
                bg: scene.bg
            });
        }
        if (scene.speaker || (scene.text && scene.text.trim())) {
            fullBacklog.push({
                speaker: scene.speaker || "",
                text: scene.text || "",
                index: currentIndex,
                voice: scene.voice || null
            });
        }
        markSceneRead();
        // 成就追踪：累计场景数
        setVar("_total_scenes", (getVar("_total_scenes") || 0) + 1);
        checkAchievements();
        // 后台预加载后续场景的资源（图片 + 音频/视频）
        preloadAhead(currentIndex);
        preloadMediaAhead(currentIndex, 3);  // 提前 3 个场景偷跑音频/视频
    }

    function startFastForward(skipInitialAdvance = false) {
        if (!gameActive) { showToast("游戏未开始"); return; }
        if (chapterTransitionTimer) return;
        if (fastForwardTimer) clearInterval(fastForwardTimer);
        if (isTyping) completeCurrentTyping();
        isFastForwarding = true;
        fastForwardBtn.classList.add('active');
        if (!skipInitialAdvance) {
            // 立即推进一句，消除打字完成后到 interval 第一 tick 之间的停顿感
            const curScene = currentScenes[currentIndex];
            if (curScene && curScene.choices && curScene.choices.length > 0) {
                stopFastForward();
                resumeFastForwardAfterCG = true;
                return;
            }
            if (curScene && curScene.cgKey) {
                stopFastForward();
                resumeFastForwardAfterCG = true;
                return;
            }
            if (!performNextDialogue()) {
                stopFastForward();
                return;
            }
        }
        fastForwardTimer = setInterval(() => {
            if (!gameActive || !isFastForwarding) { stopFastForward(); return; }
            if (Date.now() < fastForwardScenePauseUntil) return;
            if (isTyping) { completeCurrentTyping(); return; }
            const scene = currentScenes[currentIndex];
            // 过章时暂停，等过渡动画播完（2000ms）
            if (scene && scene.triggerChapterTransition) {
                fastForwardScenePauseUntil = Date.now() + 2000;
                return;
            }
            if (scene && scene.cgKey) { stopFastForward(); resumeFastForwardAfterCG = true; return; }
            if (scene && scene.videoKey) { stopFastForward(); resumeFastForwardAfterCG = true; return; }
            // 遇到选项时快进暂停，标记选项后恢复
            if (scene && scene.choices && scene.choices.length > 0) {
                stopFastForward();
                resumeFastForwardAfterCG = true;
                return;
            }
            const success = performNextDialogue();
            if (!success) stopFastForward();
        }, 180);
        showToast("快进模式已开启");
    }
    function _escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function renderBacklogList() {
        if (!backlogList) return;
        if (fullBacklog.length === 0) {
            backlogList.innerHTML = '<div class="backlog-hint">暂无对话记录</div>';
            return;
        }
        backlogList.innerHTML = fullBacklog.map((entry, idx) => {
            const isNarration = !entry.speaker || entry.speaker === ' ';
            const speakerHtml = isNarration
                ? '<span class="backlog-speaker" style="color:#a09888; font-style:italic;">旁白</span>'
                : `<span class="backlog-speaker">${_escapeHtml(entry.speaker)}</span>`;
            const safeVoice = _escapeHtml(entry.voice || '');
            const voiceBtn = entry.voice
                ? `<button class="voice-replay-btn" onclick="event.stopPropagation(); replayBacklogVoice('${safeVoice.replace(/'/g,"\\'")}', this)" title="重播语音">🔊</button>`
                : '';
            return `<div class="backlog-entry ${isNarration ? 'narration' : ''}" data-index="${idx}" onclick="jumpToBacklogScene(${entry.index})">
                ${speakerHtml}
                <span class="backlog-text">${_escapeHtml(entry.text || '(无文本)')}</span>${voiceBtn}
            </div>`;
        }).join('');
        // 滚动到底部
        backlogList.scrollTop = backlogList.scrollHeight;
    }
    function replayBacklogVoice(voiceKey, btn) {
        if (!voiceKey) return;
        const url = assetConfig.voice?.[voiceKey] || voiceKey;
        if (!url) return;
        stopVoice();
        stopBgmDucking();
        voiceAudio = new Howl({
            src: [url], volume: voiceVolume, html5: true,
            onend: function() { stopBgmDucking(); showVoiceIndicator(false); }
        });
        voiceAudio.play();
        startBgmDucking();
        showVoiceIndicator(true);
        if (btn) { btn.style.background = '#dba541'; btn.style.color = '#1e1a10'; setTimeout(() => { btn.style.background = ''; btn.style.color = ''; }, 600); }
    }
    function openBacklog() {
        if (!gameActive) return;
        // 成就追踪
        setVar("_opened_backlog", (getVar("_opened_backlog") || 0) + 1); checkAchievements();
        if (isFastForwarding) stopFastForward();
        if (isSkipRead) stopSkipRead();
        if (autoPlayEnabled) stopAutoPlay();
        if (isTyping) completeCurrentTyping();
        renderBacklogList();
        backlogOverlay.classList.add('show');
    }
    function closeBacklog() {
        backlogOverlay.classList.remove('show');
    }
    // 从 startIndex 往前扫描，找到最近的含有立绘的场景，返回其 sprite key
    function _getContextualSpriteKey(startIndex) {
        for (var i = startIndex - 1; i >= 0; i--) {
            var s = currentScenes[i];
            if (!s) continue;
            if (s.sprite && typeof s.sprite === 'string') return s.sprite;
            if (s.sprites && Array.isArray(s.sprites) && s.sprites.length > 0) {
                var main = s.sprites.find(function(sp) { return sp.main; });
                return main ? main.key : s.sprites[0].key;
            }
            if (s.clearStage) break;
        }
        return null;
    }
    // 跳转前准备立绘上下文：目标场景无立绘时静默加载回溯找到的立绘，交给 updateScene 灰化
    function _prepareJumpSprite(targetIndex) {
        undimSprite();
        hasActiveSprite = false;
        spriteImg.src = '';
        spriteImg.style.opacity = '0';
        if (spriteFadeTimer) { clearTimeout(spriteFadeTimer); spriteFadeTimer = null; }
        // 静默清除多立绘
        if (currentMultiSprites.length > 0) {
            currentMultiSprites = [];
            var mc = document.getElementById('multiSpriteContainer');
            if (mc) mc.innerHTML = '';
        }
        var scene = currentScenes[targetIndex];
        if (!scene || scene.clearStage) return;
        if (scene.sprite || (scene.sprites && scene.sprites.length > 0)) return;
        var ctxKey = _getContextualSpriteKey(targetIndex);
        if (!ctxKey) return;
        var ctxUrl = _getSpriteUrl(ctxKey);
        if (!ctxUrl) return;
        spriteImg.src = ctxUrl;
        spriteImg.style.opacity = '1';
        spriteWrapper.style.opacity = '1';
        hasActiveSprite = true;
    }
    function jumpToBacklogScene(sceneIndex) {
        if (chapterTransitionTimer) return;
        if (!currentScenes.length || sceneIndex < 0 || sceneIndex >= currentScenes.length) return;
        if (isFastForwarding) stopFastForward();
        if (isSkipRead) stopSkipRead();
        if (autoPlayEnabled) stopAutoPlay();
        if (typingTimer) clearInterval(typingTimer);
        isTyping = false;
        // 目标场景无立绘时，往前回溯查找上下文立绘并灰化
        _prepareJumpSprite(sceneIndex);
        currentIndex = sceneIndex;
        updateScene();
        closeBacklog();
        showToast(`已跳转至场景 ${sceneIndex + 1}`);
    }
    function jumpToFlowChartScene(sceneId) {
        if (chapterTransitionTimer) return;
        if (!currentScenes.length || sceneId < 0 || sceneId >= currentScenes.length) return;
        if (isFastForwarding) stopFastForward();
        if (isSkipRead) stopSkipRead();
        if (autoPlayEnabled) stopAutoPlay();
        if (typingTimer) clearInterval(typingTimer);
        isTyping = false;
        clearChoices();
        // 如果游戏未激活则激活
        if (!gameActive) {
            gameActive = true;
            titleMenu.style.transition = 'none';
            titleMenu.classList.add('hide');
            titleMenu.offsetHeight;
            titleMenu.style.transition = '';
            document.getElementById('dialogArea').style.opacity = '1';
            document.getElementById('dialogArea').style.pointerEvents = 'auto';
        }
        // 关闭鉴赏页面
        var gp = document.getElementById('galleryPage');
        if (gp) gp.style.display = 'none';
        if (musicProgressInterval) { clearInterval(musicProgressInterval); musicProgressInterval = null; }
        currentGalleryMusicKey = null;
        _prepareJumpSprite(sceneId);
        currentIndex = sceneId;
        updateScene();
        showToast(`已跳转至路线图场景 #${sceneId + 1}`);
    }
    function showChapterReview() {
        // 现在使用完整的Backlog系统
        openBacklog();
    }
    function stopFastForward() {
        if (fastForwardTimer) { clearInterval(fastForwardTimer); fastForwardTimer = null; }
        isFastForwarding = false;
        fastForwardScenePauseUntil = 0;
        resumeFastForwardAfterCG = false;
        fastForwardBtn.classList.remove('active');
        updateSkipIndicator(null);
    }
    function toggleFastForward() { isFastForwarding ? stopFastForward() : startFastForward(); if (autoPlayEnabled) stopAutoPlay();}
    // ========== 全屏切换 ==========
    function toggleFullscreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const el = document.documentElement;
            if (el.requestFullscreen) el.requestFullscreen();
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            showToast("已进入全屏模式");
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            showToast("已退出全屏模式");
        }
    }
    // ========== 已读跳过模式 ==========
    function startSkipRead() {
        if (!gameActive) { showToast("游戏未开始"); return; }
        if (chapterTransitionTimer) return;
        if (isFastForwarding) stopFastForward();
        if (autoPlayEnabled) stopAutoPlay();
        isSkipRead = true;
        skipReadBtn.classList.add('active');
        showToast("已读跳过模式已开启（遇到未读文本自动停止）");
        skipReadTimer = setInterval(() => {
            if (!gameActive || !isSkipRead) { stopSkipRead(); return; }
            // 正在打字中则立即完成，下一 tick 再推进
            if (isTyping) { completeCurrentTyping(); return; }
            // 过章动画播放中，等待完成后下一 tick 继续
            if (chapterTransitionTimer) return;
            const scene = currentScenes[currentIndex];
            if (!scene) { stopSkipRead(); return; }
            // 遇到选项时——自动选择上一次的选择（如果有记录）
            if (scene.choices && scene.choices.length > 0) {
                var prevChoice = lastChosenBranch.get(currentIndex);
                if (prevChoice !== undefined && prevChoice >= 0 && prevChoice < scene.choices.length) {
                    var idxBeforeChoice = currentIndex;
                    simulateChoiceClick(scene.choices[prevChoice]);
                    // 如果选项跳转导致索引回退，停止跳过
                    if (currentIndex < idxBeforeChoice) stopSkipRead();
                } else {
                    stopSkipRead();
                }
                return;
            }
            // 检查下一个要进入的场景是否在本次跳过前就已标记为已读
            // 如果下一个是切章标记场景，则穿透检查切章后的第一个内容场景
            let nxt = (scene.next !== undefined && scene.next !== null) ? scene.next : currentIndex + 1;
            var nxtScene = currentScenes[nxt];
            if (nxtScene && nxtScene.triggerChapterTransition) {
                nxt = (nxtScene.next !== undefined && nxtScene.next !== null) ? nxtScene.next : nxt + 1;
            }
            if (nxt === -1 || nxt >= currentScenes.length || !readSceneSet.has(nxt)) {
                stopSkipRead();
                return;
            }
            var idxBefore = currentIndex;
            const success = performNextDialogue();
            // 如果条件跳转导致索引回退（传送回已读的旧剧情），停止跳过
            if (!success || currentIndex < idxBefore) { stopSkipRead(); return; }
        }, 400);
    }
    function stopSkipRead() {
        if (skipReadTimer) { clearInterval(skipReadTimer); skipReadTimer = null; }
        isSkipRead = false;
        skipReadBtn.classList.remove('active');
        updateSkipIndicator(null);
    }
    function toggleSkipRead() {
        isSkipRead ? stopSkipRead() : startSkipRead();
    }
    function markSceneRead() {
        if (readSceneSet.has(currentIndex)) return;
        readSceneSet.add(currentIndex);
        // 定期持久化（每标记5个场景存一次）
        if (readSceneSet.size % 5 === 0) {
            localStorage.setItem(_getReadSceneKey(), JSON.stringify([...readSceneSet]));
        }
    }
    function persistReadScenes() {
        localStorage.setItem(_getReadSceneKey(), JSON.stringify([...readSceneSet]));
    }

    function findNextChapterStartIndex(fromIdx) {
        for (let i = fromIdx + 1; i < currentScenes.length; i++) {
            if (currentScenes[i].triggerChapterTransition === true) {
                let target = currentScenes[i].next;
                if (target !== undefined && target >= 0 && target < currentScenes.length) return target;
                else return i + 1;
            }
        }
        for (let i = fromIdx + 1; i < currentScenes.length; i++) {
            let text = currentScenes[i].text || "";
            if (text.startsWith("【") && text.includes("】")) return i;
        }
        return -1;
    }
    function skipToNextChapter() {
        if (chapterTransitionTimer) return;
        if (!gameActive) { showToast("游戏未开始"); return; }
        const target = findNextChapterStartIndex(currentIndex);
        if (target === -1 || target >= currentScenes.length) { showToast("已是最后一章"); return; }
        if (isFastForwarding) stopFastForward();
        currentIndex = target;
        updateScene();
        chapterHistory = [];
        showToast(`已跳转至后续章节`);
    }

    // ========== 选项跳转系统 ==========
    function findPreviousChoiceIndex(fromIndex) {
        for (let i = fromIndex - 1; i >= 0; i--) {
            const s = currentScenes[i];
            if (s && s.choices && s.choices.length > 0) return i;
        }
        return -1;
    }
    function findNextChoiceIndex(fromIndex) {
        for (let i = fromIndex + 1; i < currentScenes.length; i++) {
            const s = currentScenes[i];
            if (s && s.choices && s.choices.length > 0) return i;
        }
        return -1;
    }
    function jumpToPreviousChoice() {
        if (chapterTransitionTimer) return;
        if (!gameActive || !currentScenes.length) { showToast("游戏未开始"); return; }
        const target = findPreviousChoiceIndex(currentIndex);
        if (target === -1) { showToast("没有更早的选项了"); return; }
        if (isFastForwarding) stopFastForward();
        if (isSkipRead) stopSkipRead();
        if (autoPlayEnabled) stopAutoPlay();
        if (typingTimer) clearInterval(typingTimer);
        isTyping = false;
        currentIndex = target;
        updateScene();
        chapterHistory = [];
        showToast("已跳转到上一选项");
    }
    function jumpToNextChoice() {
        if (chapterTransitionTimer) return;
        if (!gameActive || !currentScenes.length) { showToast("游戏未开始"); return; }
        const target = findNextChoiceIndex(currentIndex);
        if (target === -1) { showToast("没有后续选项了"); return; }
        if (isFastForwarding) stopFastForward();
        if (isSkipRead) stopSkipRead();
        if (autoPlayEnabled) stopAutoPlay();
        if (typingTimer) clearInterval(typingTimer);
        isTyping = false;
        currentIndex = target;
        clearChoices();
        updateScene();
        chapterHistory = [];
        showToast("已跳转到下一选项");
    }

    function endPrologue() {
        if (isFastForwarding) stopFastForward();
        if (isSkipRead) stopSkipRead();
        if (sceneTransitionTimer) { clearTimeout(sceneTransitionTimer); sceneTransitionTimer = null; }
        if (chapterTransitionTimer) { clearTimeout(chapterTransitionTimer); chapterTransitionTimer = null; chapterTransitionCallback = null; }
        // 确保过渡叠加层被清理，防止遮挡结局CG
        var sto = document.getElementById('sceneTransitionOverlay');
        if (sto) { sto.className = 'scene-transition-overlay'; sto.style.transition = ''; sto._onRevealEnd = null; }
        stopVideo();
        persistReadScenes();
        document.getElementById('dialogArea').style.opacity = "0";
        document.getElementById('dialogArea').style.pointerEvents = "none";

        const cgLayer = document.getElementById('cgLayer');
        const cgImg = document.getElementById('cgImage');
        const lastScene = currentScenes[currentScenes.length - 1];
        if (lastScene && lastScene.cgKey && assetConfig.cg[lastScene.cgKey]) cgImg.src = assetConfig.cg[lastScene.cgKey];
        else if (assetConfig.cg?.ending) cgImg.src = assetConfig.cg.ending;
        else { returnToTitle(); return; }

        cgLayer.classList.add('show');
        saveGameToLocal();
        gameActive = false;
        showToast("剧情结束，已自动存档");
        clearChoices();
        stopAutoPlay();
        stopVoice();
        stopParticles();
        if (visualArea) visualArea.style.filter = '';
        clearVisualFilter();
        const vignette = document.getElementById('vignetteOverlay');
        if (vignette) vignette.classList.remove('active');
        updateMultiSprites(null);

        const endGameHandler = () => {
            cgLayer.classList.remove('show');
            cgLayer.removeEventListener('click', endGameHandler);
            returnToTitle();
        };
        setTimeout(() => { cgLayer.addEventListener('click', endGameHandler, { once: true }); }, 100);
    }

    let musicHintTimer = null;

    function showMusicHint(musicName) {
        if (!musicHint) return;
        // 清除之前的定时器，避免提前隐藏
        if (musicHintTimer) clearTimeout(musicHintTimer);
        musicHint.innerText = `🎵 ${musicName}`;
        musicHint.classList.add('show');
        // 3秒后自动隐藏
        musicHintTimer = setTimeout(() => {
            musicHint.classList.remove('show');
        }, 3000);
    }

    // 开始打字效果
    function startTypingAnimation(fullText) {
        // 解析文字标记，获取纯文本用于逐字显示
        const parsedHtml = parseTextMarkup(fullText || "");
        const plainText = (fullText || "").replace(/\[[^\]]*\]/g, ''); // 去除标记，用于计算长度
        if (isFastForwarding || isSkipRead) {
            currentTypingText = fullText || "";
            typingIndex = plainText.length;
            const dialogTextEl = document.getElementById('dialogText');
            dialogTextEl.innerHTML = parsedHtml;
            finishTyping();
            return;
        }
        if (typingTimer) clearInterval(typingTimer);
        isTyping = true;
        currentTypingText = fullText || "";
        typingIndex = 0;
        const dialogTextEl = document.getElementById('dialogText');
        dialogTextEl.innerHTML = "";
        dialogTextEl.classList.remove('text-reveal');
        void dialogTextEl.offsetWidth;
        const existingArrow = document.querySelector('#dialogText .typing-arrow');
        if (existingArrow) existingArrow.remove();

        if (!fullText || fullText.length === 0) {
            finishTyping();
            return;
        }

        // 逐字显示：每次取纯文本的子串并重新解析标记
        typingTimer = setInterval(() => {
            if (typingIndex < plainText.length) {
                typingIndex++;
                // 从原始文本中截取对应长度的纯文本，再重新应用标记
                const visiblePortion = extractVisiblePortion(fullText, typingIndex);
                dialogTextEl.innerHTML = parseTextMarkup(visiblePortion);
                dialogTextEl.scrollTop = dialogTextEl.scrollHeight;
            } else {
                finishTyping();
            }
        }, textSpeed);
    }
    // 从带标记的文本中提取前N个可见字符
    function extractVisiblePortion(markedText, charCount) {
        let result = '';
        let visible = 0;
        let i = 0;
        while (i < markedText.length && visible < charCount) {
            if (markedText[i] === '[') {
                const close = markedText.indexOf(']', i);
                if (close === -1) { result += markedText[i]; visible++; i++; continue; }
                const tag = markedText.substring(i + 1, close);
                const endTag = '[/' + tag.split('=')[0] + ']';
                const endIdx = markedText.indexOf(endTag, close + 1);
                if (endIdx === -1) { result += markedText[i]; visible++; i++; continue; }
                const inner = markedText.substring(close + 1, endIdx);
                const innerPlain = inner.replace(/\[[^\]]*\]/g, '');
                if (visible + innerPlain.length <= charCount) {
                    // 整个标记块都包含
                    result += '[' + tag + ']' + inner + endTag;
                    visible += innerPlain.length;
                    i = endIdx + endTag.length;
                } else {
                    // 只包含部分内文
                    const needed = charCount - visible;
                    const partialInner = extractVisiblePortion(inner, needed);
                    result += '[' + tag + ']' + partialInner + endTag;
                    visible = charCount;
                    i = endIdx + endTag.length;
                }
            } else {
                result += markedText[i];
                visible++;
                i++;
            }
        }
        return result;
    }

    function finishTyping() {
        if (typingTimer) {
            clearInterval(typingTimer);
            typingTimer = null;
        }
        isTyping = false;
        const dialogTextEl = document.getElementById('dialogText');
        if (typingIndex < (currentTypingText || '').replace(/\[[^\]]*\]/g, '').length) {
            dialogTextEl.innerHTML = parseTextMarkup(currentTypingText || '');
        }
        const existingArrow = document.querySelector('#dialogText .typing-arrow');
        if (!existingArrow) {
            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'typing-arrow';
            arrowSpan.innerHTML = ' ▼';
            dialogTextEl.appendChild(arrowSpan);
        }
        dialogTextEl.classList.add('text-reveal');
        // ★ 自适应阅读速度：记录文字完整显示的时间点
        _textReadyTime = Date.now();
        if (autoPlayEnabled) {
            scheduleNextAutoPlay();
        }
    }

    // ★ 自适应阅读速度：根据玩家阅读节奏动态调整打字速度
    function _updateAdaptiveSpeed(plainTextLen) {
        if (!adaptiveSpeedEnabled || !_textReadyTime || plainTextLen <= 0) return;
        var now = Date.now();
        var elapsed = now - _textReadyTime; // ms since text was fully displayed
        _textReadyTime = 0;
        // 只在对白有一定长度时采样（过短对白噪音大）
        if (plainTextLen < 4) return;
        // 排除异常值：太快（<200ms，可能是连点）或太慢（>10s，可能是挂机）
        if (elapsed < 200 || elapsed > 10000) return;
        var playerSpeed = elapsed / plainTextLen; // ms/字 — 玩家实际阅读速度
        if (_adaptiveSpeedEMA === null) {
            _adaptiveSpeedEMA = playerSpeed;
        } else {
            _adaptiveSpeedEMA = ADAPTIVE_ALPHA * playerSpeed + (1 - ADAPTIVE_ALPHA) * _adaptiveSpeedEMA;
        }
        // 将 typing 速度调整到略快于玩家阅读速度（约 80%），让文字刚好在玩家读完前显示完
        var targetSpeed = Math.round(_adaptiveSpeedEMA * 0.8);
        targetSpeed = Math.max(ADAPTIVE_MIN, Math.min(ADAPTIVE_MAX, targetSpeed));
        // 只有当调整幅度 >= 3 时才更新，避免过于频繁的微小波动
        if (Math.abs(targetSpeed - textSpeed) >= 3) {
            textSpeed = targetSpeed;
            localStorage.setItem('galgame_text_speed', textSpeed);
            // 同步更新 UI 滑块
            try {
                var tsSlider = document.getElementById('textSpeedSlider');
                var tsValue = document.getElementById('textSpeedValue');
                var mtsSlider = document.getElementById('menuTextSpeedSlider');
                var mtsValue = document.getElementById('menuTextSpeedValue');
                if (tsSlider) tsSlider.value = textSpeed;
                if (tsValue) tsValue.innerText = textSpeed + ' ms/字';
                if (mtsSlider) mtsSlider.value = textSpeed;
                if (mtsValue) mtsValue.innerText = textSpeed + ' ms/字';
            } catch(e) {}
        }
    }

    function completeCurrentTyping() {
        if (isTyping) {
            if (typingTimer) clearInterval(typingTimer);
            const dialogTextEl = document.getElementById('dialogText');
            dialogTextEl.innerHTML = parseTextMarkup(currentTypingText || '');
            finishTyping();
        }
    }

    function saveGameToLocal() {
        if (!gameActive || !currentScenes.length) { showToast("游戏未激活，无法存档"); return; }
        saveToAutoSlot();
    }

    function loadGameFromLocal() {
        loadLatestSaveFromLocal();
    }

    function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    // ═══════ 存档分享码 ═══════
    function generateShareCode() {
        if (!gameActive || !currentScenes.length) { showToast('游戏未开始，无法生成分享码'); return null; }
        var scene = currentScenes[currentIndex] || {};
        // 最小化状态：只存 sceneIndex + gameVars + currentBgm
        var state = {
            i: currentIndex,        // scene index
            b: currentBgm || '',    // bgm key
            v: gameVars || {}       // variables
        };
        // 精简 gameVars：只保留非空/非零的键
        var slimVars = {};
        var keys = Object.keys(state.v);
        for (var k = 0; k < keys.length; k++) {
            var val = state.v[keys[k]];
            if (val !== undefined && val !== null && val !== 0 && val !== '' && val !== false) {
                slimVars[keys[k]] = val;
            }
        }
        state.v = slimVars;
        if (Object.keys(slimVars).length === 0) delete state.v;
        if (!state.b) delete state.b;
        try {
            var json = JSON.stringify(state);
            var code = btoa(unescape(encodeURIComponent(json)));
            showToast('📋 分享码已复制到剪贴板（' + code.length + ' 字符）');
            return code;
        } catch(e) {
            showToast('生成分享码失败');
            return null;
        }
    }

    function loadFromShareCode(code) {
        if (!code || typeof code !== 'string') { showToast('无效的分享码'); return false; }
        try {
            var json = decodeURIComponent(escape(atob(code.trim())));
            var state = JSON.parse(json);
            if (typeof state.i !== 'number') { showToast('分享码格式无效'); return false; }
            if (state.i < 0 || state.i >= currentScenes.length) { showToast('分享码场景索引越界（可能项目版本不同）'); return false; }
            if (state.v && typeof state.v === 'object') {
                var vk = Object.keys(state.v);
                for (var k = 0; k < vk.length; k++) {
                    gameVars[vk[k]] = state.v[vk[k]];
                }
            }
            if (state.b && typeof state.b === 'string') {
                // 不强制切换 BGM，由 updateScene 根据场景决定
            }
            if (isFastForwarding) stopFastForward();
            if (autoPlayEnabled) stopAutoPlay();
            if (sceneTransitionTimer) { clearTimeout(sceneTransitionTimer); sceneTransitionTimer = null; }
            if (chapterTransitionTimer) { clearTimeout(chapterTransitionTimer); chapterTransitionTimer = null; }
            stopAllBgm();
            stopVideo();
            clearChoices();
            clearVisuals();
            currentIndex = state.i;
            gameActive = true;
            titleMenu.style.transition = 'none';
            titleMenu.classList.add('hide');
            titleMenu.offsetHeight;
            titleMenu.style.transition = '';
            document.getElementById('dialogArea').style.opacity = '1';
            document.getElementById('dialogArea').style.pointerEvents = 'auto';
            updateScene();
            showToast('✅ 已跳转到分享位置（场景 ' + state.i + '）');
            return true;
        } catch(e) {
            showToast('分享码解析失败: ' + e.message);
            return false;
        }
    }

    function showShareCodeUI() {
        if (!gameActive || !currentScenes.length) { showToast('游戏未开始，无法分享'); return; }
        var code = generateShareCode();
        if (!code) return;
        // Build a modal UI
        var existing = document.getElementById('shareCodeModal');
        if (existing) existing.remove();
        var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(code);
        var scene = currentScenes[currentIndex] || {};
        var preview = (scene.speaker || '') + ': ' + ((scene.text || '').substring(0, 40));
        var html = '<div id="shareCodeModal" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:10000;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;">';
        html += '<div style="background:#1a1612;border:2px solid #dba541;border-radius:16px;padding:24px;max-width:420px;text-align:center;">';
        html += '<h3 style="color:#dba541;margin:0 0 4px;">📋 存档分享码</h3>';
        html += '<div style="color:#887860;font-size:0.75rem;margin-bottom:12px;">' + _esc(preview) + '</div>';
        html += '<img src="' + qrUrl + '" alt="QR" style="width:200px;height:200px;border-radius:8px;margin-bottom:8px;" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><rect fill=%22%23333%22 width=%22200%22 height=%22200%22/><text fill=%22%23dba541%22 font-size=%2214%22 x=%2230%22 y=%22100%22>QR生成失败</text></svg>\'">';
        html += '<div style="display:flex;gap:8px;margin-bottom:8px;">';
        html += '<input id="shareCodeInput" value="' + escHtml(code) + '" readonly style="flex:1;background:#0d1117;border:1px solid #dba541;border-radius:8px;padding:8px;color:#f0e0b0;font-size:0.7rem;font-family:monospace;text-align:center;">';
        html += '<button id="shareCodeCopyBtn" style="background:#dba541;color:#1a1a2e;border:none;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer;">复制</button>';
        html += '</div>';
        html += '<button id="shareCodeCloseBtn" style="background:rgba(255,255,255,0.06);border:1px solid rgba(219,165,65,0.3);border-radius:8px;padding:6px 20px;color:#b0a890;cursor:pointer;margin-top:6px;">关闭</button>';
        html += '</div></div>';
        document.body.insertAdjacentHTML('beforeend', html);
        document.getElementById('shareCodeCloseBtn').addEventListener('click', function() {
            document.getElementById('shareCodeModal').remove();
        });
        document.getElementById('shareCodeCopyBtn').addEventListener('click', function() {
            var inp = document.getElementById('shareCodeInput');
            inp.select();
            document.execCommand('copy');
            showToast('📋 已复制到剪贴板');
        });
        // Click outside to close
        document.getElementById('shareCodeModal').addEventListener('click', function(e) {
            if (e.target === this) this.remove();
        });
    }

    function showLoadShareCodeUI() {
        var existing = document.getElementById('shareCodeModal');
        if (existing) existing.remove();
        var html = '<div id="shareCodeModal" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:10000;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;">';
        html += '<div style="background:#1a1612;border:2px solid #dba541;border-radius:16px;padding:24px;max-width:420px;text-align:center;">';
        html += '<h3 style="color:#dba541;margin:0 0 12px;">📥 导入分享码</h3>';
        html += '<textarea id="shareCodeLoadInput" placeholder="粘贴分享码到此处..." style="width:100%;height:80px;background:#0d1117;border:1px solid #dba541;border-radius:8px;padding:10px;color:#f0e0b0;font-size:0.75rem;font-family:monospace;resize:none;"></textarea>';
        html += '<div style="display:flex;gap:8px;margin-top:10px;justify-content:center;">';
        html += '<button id="shareCodeLoadBtn" style="background:#dba541;color:#1a1a2e;border:none;border-radius:8px;padding:8px 20px;font-weight:700;cursor:pointer;">跳转</button>';
        html += '<button id="shareCodeLoadCloseBtn" style="background:rgba(255,255,255,0.06);border:1px solid rgba(219,165,65,0.3);border-radius:8px;padding:8px 20px;color:#b0a890;cursor:pointer;">取消</button>';
        html += '</div></div></div>';
        document.body.insertAdjacentHTML('beforeend', html);
        document.getElementById('shareCodeLoadCloseBtn').addEventListener('click', function() {
            document.getElementById('shareCodeModal').remove();
        });
        document.getElementById('shareCodeLoadBtn').addEventListener('click', function() {
            var code = document.getElementById('shareCodeLoadInput').value.trim();
            if (code) {
                loadFromShareCode(code);
                document.getElementById('shareCodeModal').remove();
            }
        });
        document.getElementById('shareCodeModal').addEventListener('click', function(e) {
            if (e.target === this) this.remove();
        });
        setTimeout(function() {
            var ta = document.getElementById('shareCodeLoadInput');
            if (ta) ta.focus();
        }, 200);
    }

    function startNewGameFromCurrent() {
        showMainMenu();
        if (!currentScenes.length) { showToast("无剧情数据，请先加载项目"); return; }
        if (isFastForwarding) stopFastForward();
        if (autoPlayEnabled) stopAutoPlay();
        if (isSkipRead) stopSkipRead();
        if (sceneTransitionTimer) { clearTimeout(sceneTransitionTimer); sceneTransitionTimer = null; }
        if (chapterTransitionTimer) { clearTimeout(chapterTransitionTimer); chapterTransitionTimer = null; chapterTransitionCallback = null; }
        stopAllBgm();
        stopVideo();
        clearChoices();
        clearVisuals();
        document.getElementById('transChapterName').innerText = "序章";
        document.getElementById('transChapterSub').innerText = "A new chapter begins";
        currentIndex = 0;
        gameActive = true;
        // 标题瞬间消失（跳过 CSS transition），避免残影叠在游戏界面上
        titleMenu.style.transition = 'none';
        titleMenu.classList.add('hide');
        titleMenu.offsetHeight;
        titleMenu.style.transition = '';
        // 对话框先保持隐藏，等章节过渡动画结束后由 updateScene 自然显示
        var startDialog = document.getElementById('dialogArea');
        chapterTransition.classList.add('show');
        gsap.fromTo(chapterTransition, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power2.out" });
        chapterHistory = [];
        fullBacklog = [];
        resetGameVars();
        clearRollbackStack();
        chapterTransitionTimer = setTimeout(() => {
            gsap.to(chapterTransition, { opacity: 0, duration: 0.5, ease: "power2.in", onComplete: () => {
                chapterTransitionTimer = null;
                chapterTransition.classList.remove('show');
                startDialog.classList.add('slide-in');
                startDialog.style.opacity = "1";
                startDialog.style.pointerEvents = "auto";
                updateScene();
                fixSpritePosition();
            }});
        }, 2200);
        updateContinueButtonState();
        if (typingTimer) clearInterval(typingTimer);
        isTyping = false;
        pendingNext = false;
        stopAutoPlay();
    }

    // 加载完整项目（核心修复：清除旧存档，避免章节混乱）
    // ═══════ 懒加载 / 分章加载 ═══════
    var _chunkedIndex = null;      // 分章索引 { chapters: [{file, title, startIdx, sceneCount}], assets, characters, imgbbUrls }
    var _chunkedLoaded = [];       // 已加载的章节号 Set
    var _chunkedBasePath = '';     // 章节文件的基础路径
    var _chunkedLoading = false;   // 是否正在加载章节

    function _isChunkedProject() { return _chunkedIndex !== null && _chunkedIndex.chapters && _chunkedIndex.chapters.length > 0; }

    async function _loadChapterChunk(chapterIdx) {
        if (!_isChunkedProject() || _chunkedLoaded[chapterIdx] || _chunkedLoading) return;
        if (chapterIdx < 0 || chapterIdx >= _chunkedIndex.chapters.length) return;
        _chunkedLoading = true;
        var chInfo = _chunkedIndex.chapters[chapterIdx];
        var filePath = _chunkedBasePath + chInfo.file;
        console.log('[LazyLoad] 加载章节 ' + chapterIdx + ': ' + filePath);
        try {
            var resp = await fetch(filePath);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var data = await resp.json();
            if (!data.scenes || !Array.isArray(data.scenes)) throw new Error('章节文件格式错误');
            // Append scenes to currentScenes, adjusting all scene indices
            var baseIdx = currentScenes.length;
            for (var i = 0; i < data.scenes.length; i++) {
                var s = data.scenes[i];
                // Adjust next index
                if (s.next !== undefined && s.next >= 0) s.next += baseIdx;
                // Adjust choice indices
                if (s.choices) {
                    s.choices.forEach(function(c) {
                        if (c.nextIdx >= 0) c.nextIdx += baseIdx;
                    });
                }
                // Adjust conditionNext indices
                if (s.conditionNext && typeof s.conditionNext === 'object') {
                    Object.keys(s.conditionNext).forEach(function(k) {
                        if (s.conditionNext[k] >= 0) s.conditionNext[k] += baseIdx;
                    });
                }
                currentScenes.push(s);
            }
            _initReadSceneSet(currentScenes);
            _chunkedLoaded[chapterIdx] = true;
            console.log('[LazyLoad] 章节 ' + chapterIdx + ' 加载完成 (' + data.scenes.length + ' 场景, 总场景 ' + currentScenes.length + ')');
        } catch(e) {
            console.warn('[LazyLoad] 章节 ' + chapterIdx + ' 加载失败:', e.message);
        } finally {
            _chunkedLoading = false;
        }
    }

    function _findChapterForScene(sceneIndex) {
        if (!_isChunkedProject()) return -1;
        for (var i = 0; i < _chunkedIndex.chapters.length; i++) {
            var ch = _chunkedIndex.chapters[i];
            if (sceneIndex >= ch.startIdx && sceneIndex < ch.startIdx + ch.sceneCount) return i;
        }
        return -1;
    }

    function _preloadNextChapter(sceneIndex) {
        if (!_isChunkedProject()) return;
        var currentCh = _findChapterForScene(sceneIndex);
        if (currentCh < 0) return;
        var nextCh = currentCh + 1;
        if (nextCh < _chunkedIndex.chapters.length && !_chunkedLoaded[nextCh]) {
            _loadChapterChunk(nextCh);
        }
    }

    function _applyImgbbMappings(imgbbUrls) {
        window._imgbbReverse = window._imgbbReverse || {};
        for (var _rkey in imgbbUrls) {
            window._imgbbReverse[imgbbUrls[_rkey]] = _rkey;
        }
        var _patch = function(obj) {
            if (!obj) return;
            for (var key in obj) {
                if (typeof obj[key] === 'string' && imgbbUrls[obj[key]]) {
                    obj[key] = imgbbUrls[obj[key]];
                }
            }
        };
        _patch(assetConfig.bg);
        _patch(assetConfig.sprites);
        _patch(assetConfig.cg);
        _patch(assetConfig.se);
        _patch(assetConfig.voice);
        _patch(assetConfig.video);
    }

    // ═══════ 渐进式资源预加载 ═══════
    // 策略：Phase 0 → 封面资源(封面图+封面BGM)
    //       Phase 1 → 按场景出现顺序预加载 BG → 立绘 → CG → BGM
    //       Phase 2 → 背景闲时预加载 SE / Voice / Video
    var _progressivePreloadActive = false;
    var _progressivePreloadAborted = false;
    var _progressiveTotal = 0;
    var _progressiveDone = 0;
    var _preloadedAudioFiles = {};  // url → true (已触发预缓冲的音频)

    function _abortProgressivePreload() {
        _progressivePreloadActive = false;
        _progressivePreloadAborted = true;
    }

    function _collectSceneAssetOrder() {
        // 按场景出场顺序收集所有资源 URL（去重）
        var bgOrder = [], spriteOrder = [], cgOrder = [], bgmOrder = [];
        var bgSeen = {}, spriteSeen = {}, cgSeen = {}, bgmSeen = {};
        if (!currentScenes || !currentScenes.length) return { bgOrder: [], spriteOrder: [], cgOrder: [], bgmOrder: [] };
        for (var i = 0; i < currentScenes.length; i++) {
            var s = currentScenes[i];
            // BG
            if (s.bg && assetConfig.bg && assetConfig.bg[s.bg]) {
                var bgUrl = assetConfig.bg[s.bg];
                if (bgUrl && !bgSeen[bgUrl]) { bgSeen[bgUrl] = true; bgOrder.push(bgUrl); }
            }
            // 多立绘
            if (s.sprites && s.sprites.length > 0) {
                s.sprites.forEach(function(spr) {
                    if (spr.key && assetConfig.sprites && assetConfig.sprites[spr.key]) {
                        var url = assetConfig.sprites[spr.key];
                        if (url && !spriteSeen[url]) { spriteSeen[url] = true; spriteOrder.push(url); }
                    }
                });
            }
            // 单立绘
            if (s.sprite && assetConfig.sprites && assetConfig.sprites[s.sprite]) {
                var sprUrl = assetConfig.sprites[s.sprite];
                if (sprUrl && !spriteSeen[sprUrl]) { spriteSeen[sprUrl] = true; spriteOrder.push(sprUrl); }
            }
            // CG
            if (s.cgKey && assetConfig.cg && assetConfig.cg[s.cgKey]) {
                var cgUrl = assetConfig.cg[s.cgKey];
                if (cgUrl && !cgSeen[cgUrl]) { cgSeen[cgUrl] = true; cgOrder.push(cgUrl); }
            }
            // BGM
            if (s.bgm && assetConfig.bgm && assetConfig.bgm[s.bgm]) {
                var bgmUrl = assetConfig.bgm[s.bgm];
                if (bgmUrl && !bgmSeen[bgmUrl]) { bgmSeen[bgmUrl] = true; bgmOrder.push(bgmUrl); }
            }
        }
        return { bgOrder: bgOrder, spriteOrder: spriteOrder, cgOrder: cgOrder, bgmOrder: bgmOrder };
    }

    function _getCoverAssets() {
        // 确定当前封面图和封面 BGM
        var coverImg = null, coverBgmUrl = null;

        // 封面图
        if (typeof coverImageMode !== 'undefined') {
            if (coverImageMode === 'lastCG' && lastTriggeredCGUrl) {
                coverImg = lastTriggeredCGUrl;
            } else if (coverImageMode === 'randomCandidates' && typeof coverCGCandidates !== 'undefined' && coverCGCandidates.length > 0) {
                var rk = coverCGCandidates[0];
                if (assetConfig.cg && assetConfig.cg[rk]) coverImg = assetConfig.cg[rk];
            }
        }
        if (!coverImg) {
            // fallback: 取第一张 CG 或默认封面
            var allCg = Object.keys(assetConfig.cg || {});
            if (allCg.length > 0) coverImg = assetConfig.cg[allCg[0]];
        }

        // 封面 BGM
        if (typeof coverBgmMode !== 'undefined') {
            if (coverBgmMode === 'lastBGM' && lastTriggeredBGM && assetConfig.bgm && assetConfig.bgm[lastTriggeredBGM]) {
                coverBgmUrl = assetConfig.bgm[lastTriggeredBGM];
            } else if (coverBgmMode === 'randomAll') {
                var allBgm = Object.keys(assetConfig.bgm || {});
                if (allBgm.length > 0) coverBgmUrl = assetConfig.bgm[allBgm[0]];
            }
        }
        if (!coverBgmUrl && assetConfig.bgm) {
            var keys = Object.keys(assetConfig.bgm);
            if (keys.length > 0) coverBgmUrl = assetConfig.bgm[keys[0]];
        }
        return { coverImg: coverImg, coverBgmUrl: coverBgmUrl };
    }

    function _preloadAudio(url) {
        if (!url || _preloadedAudioFiles[url]) return Promise.resolve();
        _preloadedAudioFiles[url] = true;
        return new Promise(function(resolve) {
            var a = new Audio();
            a.preload = 'auto';
            a.src = url;
            // preload 后不播放，只让浏览器缓冲
            a.load();
            // 短时间内能加载到元数据说明网络通了
            var done = false;
            var finish = function() { if (!done) { done = true; resolve(); } };
            a.addEventListener('loadedmetadata', finish, { once: true });
            a.addEventListener('error', finish, { once: true });
            a.addEventListener('canplaythrough', finish, { once: true });
            // fallback: 3 秒后无论如何 resolve
            setTimeout(finish, 3000);
        });
    }

    function _updateProgressiveProgress() {
        _progressiveDone++;
        var indicator = document.getElementById('loadingIndicator');
        var textEl = indicator && indicator.querySelector('.loading-text');
        if (indicator && _progressiveTotal > 0) {
            var pct = Math.round((_progressiveDone / _progressiveTotal) * 100);
            indicator.classList.add('show');
            if (textEl) textEl.textContent = '预加载 ' + pct + '% (' + _progressiveDone + '/' + _progressiveTotal + ')';
        }
    }

    async function _preloadBatch(urls, concurrency) {
        if (!urls || !urls.length) return;
        concurrency = concurrency || 2;
        for (var i = 0; i < urls.length; i += concurrency) {
            if (_progressivePreloadAborted) return;
            var batch = urls.slice(i, i + concurrency);
            var promises = batch.map(function(url) {
                return preloadImage(url).then(function() {
                    _updateProgressiveProgress();
                }).catch(function() {
                    _updateProgressiveProgress();
                });
            });
            await Promise.allSettled ? await Promise.allSettled(promises) : await Promise.all(promises.map(function(p) { return p.catch(function() {}); }));
        }
    }

    async function _preloadAudioBatch(urls, concurrency) {
        if (!urls || !urls.length) return;
        concurrency = concurrency || 2;
        for (var i = 0; i < urls.length; i += concurrency) {
            if (_progressivePreloadAborted) return;
            var batch = urls.slice(i, i + concurrency);
            await Promise.all(batch.map(function(url) {
                return _preloadAudio(url).then(function() { _updateProgressiveProgress(); });
            }));
        }
    }

    async function startProgressivePreload() {
        if (_progressivePreloadActive) return;
        _progressivePreloadActive = true;
        _progressivePreloadAborted = false;
        _progressiveDone = 0;
        _progressiveTotal = 0;
        console.log('[Preload] 🚀 启动渐进式预加载');

        // ── Phase 0: 封面资源（立即、串行、优先级最高） ──
        var cover = _getCoverAssets();
        var phase0 = [];
        if (cover.coverImg && !imageCache.has(cover.coverImg)) phase0.push(cover.coverImg);
        if (cover.coverBgmUrl && !_preloadedAudioFiles[cover.coverBgmUrl]) phase0.push(cover.coverBgmUrl);
        if (phase0.length > 0) {
            console.log('[Preload] 🎨 Phase 0 — 封面资源 (' + phase0.length + ' 项)');
            _progressiveTotal += phase0.length;
            // 先加载封面图
            if (cover.coverImg && !imageCache.has(cover.coverImg)) {
                await preloadImage(cover.coverImg);
                _updateProgressiveProgress();
                // 图片加载完立即应用到标题背景
                var titleInner = document.getElementById('titleBgInner');
                if (titleInner && cover.coverImg) {
                    titleInner.style.backgroundImage = "url('" + cover.coverImg + "')";
                }
            }
            // 再预缓冲封面BGM
            if (cover.coverBgmUrl && !_preloadedAudioFiles[cover.coverBgmUrl]) {
                await _preloadAudio(cover.coverBgmUrl);
                _updateProgressiveProgress();
            }
        }

        if (_progressivePreloadAborted) return;

        // ── Phase 1: 场景资源（按出场顺序，分类分批） ──
        var order = _collectSceneAssetOrder();
        var phase1Total = order.bgOrder.length + order.spriteOrder.length + order.cgOrder.length + order.bgmOrder.length;
        if (phase1Total > 0) {
            _progressiveTotal += phase1Total;
            console.log('[Preload] 🖼️ Phase 1 — 场景资源 (BG×' + order.bgOrder.length + ' 立绘×' + order.spriteOrder.length + ' CG×' + order.cgOrder.length + ' BGM×' + order.bgmOrder.length + ')');

            // 1a. BG（最先出现，最重要）
            if (order.bgOrder.length > 0 && !_progressivePreloadAborted) {
                await _preloadBatch(order.bgOrder, 3);
            }
            // 1b. 立绘（角色出场需要）
            if (order.spriteOrder.length > 0 && !_progressivePreloadAborted) {
                await _preloadBatch(order.spriteOrder, 3);
            }
            // 1c. CG
            if (order.cgOrder.length > 0 && !_progressivePreloadAborted) {
                await _preloadBatch(order.cgOrder, 2);
            }
            // 1d. BGM（音频，较慢，放在图片之后）
            if (order.bgmOrder.length > 0 && !_progressivePreloadAborted) {
                await _preloadAudioBatch(order.bgmOrder, 2);
            }
        }

        if (_progressivePreloadAborted) return;

        // ── Phase 2: 闲时预加载（SE / Voice / Video） ──
        var seUrls = Object.values(assetConfig.se || {}).filter(function(u) { return typeof u === 'string'; });
        var voiceUrls = Object.values(assetConfig.voice || {}).filter(function(u) { return typeof u === 'string'; });
        var phase2Total = seUrls.length + voiceUrls.length;
        if (phase2Total > 0) {
            _progressiveTotal += phase2Total;
            console.log('[Preload] 🔇 Phase 2 — 闲时预加载 (SE×' + seUrls.length + ' Voice×' + voiceUrls.length + ')');
            if (seUrls.length > 0 && !_progressivePreloadAborted) {
                await _preloadAudioBatch(seUrls, 3);
            }
            if (voiceUrls.length > 0 && !_progressivePreloadAborted) {
                await _preloadAudioBatch(voiceUrls, 2);
            }
        }

        // 清理加载指示器
        var indicator = document.getElementById('loadingIndicator');
        if (indicator) {
            indicator.classList.remove('show');
            var textEl = indicator.querySelector('.loading-text');
            if (textEl) textEl.textContent = '加载中...';
        }
        console.log('[Preload] ✅ 预加载完成 (' + _progressiveDone + '/' + _progressiveTotal + ' 项)');
        _progressivePreloadActive = false;
    }

    // 供 gamepad.js 在返回标题时调用
    function restartProgressivePreload() {
        _progressivePreloadAborted = false;
        startProgressivePreload();
    }

    function loadFullProject(projectJson) {
        // ★ 检测是否为分章索引（chunked project）
        if (projectJson.chapters && Array.isArray(projectJson.chapters) && !projectJson.scenes) {
            console.log('[LazyLoad] 检测到分章项目，共 ' + projectJson.chapters.length + ' 个章节');
            _chunkedIndex = projectJson;
            _chunkedLoaded = [];
            _chunkedBasePath = '';
            // 先加载资源
            if (_chunkedIndex.assets) {
                assetConfig = {
                    bg: { ...(_chunkedIndex.assets.bg || {}) },
                    sprites: { ...(_chunkedIndex.assets.sprites || {}) },
                    bgm: { ...(_chunkedIndex.assets.bgm || {}) },
                    cg: { ...(_chunkedIndex.assets.cg || {}) },
                    se: { ...(_chunkedIndex.assets.se || {}) },
                    voice: { ...(_chunkedIndex.assets.voice || {}) },
                    video: { ...(_chunkedIndex.assets.video || {}) }
                };
            }
            // 应用 ImgBB 映射
            if (_chunkedIndex.imgbbUrls && typeof _chunkedIndex.imgbbUrls === 'object') {
                _applyImgbbMappings(_chunkedIndex.imgbbUrls);
            }
            // 重置引擎状态
            clearLegacySave();
            clearAllUnlocks();
            fullBacklog = [];
            chapterHistory = [];
            readSceneSet.clear();
            lastChosenBranch.clear();
            localStorage.setItem(_getReadSceneKey(), '[]');
            lastTriggeredCGUrl = null;
            localStorage.removeItem('lastTriggeredCGUrl');
            updateCoverBackground();
            if (isFastForwarding) stopFastForward();
            if (sceneTransitionTimer) { clearTimeout(sceneTransitionTimer); sceneTransitionTimer = null; }
            stopAllBgm();
            stopVideo();
            gameActive = false;
            // 初始化空的场景数组，稍后异步加载
            currentScenes = [];
            _initReadSceneSet(currentScenes);
            // 异步加载第0章
            _loadChapterChunk(0).then(function() {
                dbStoreProject(currentScenes, assetConfig);
                resetGameVars();
                startNewGameFromCurrent();
                // ★ 渐进式预加载（第0章加载完成后开始）
                startProgressivePreload();
                // 预加载第1章
                if (_chunkedIndex.chapters.length > 1) _loadChapterChunk(1);
            });
            showToast('📦 分章项目已就绪 (懒加载模式)');
            return;
        }
        // ★ 原有完整项目加载
        if (!projectJson.scenes || !Array.isArray(projectJson.scenes)) throw new Error("缺少 scenes 数组");
        _chunkedIndex = null;
        _chunkedLoaded = [];
        // 清除旧存档，防止跨项目读取脏数据
        clearLegacySave();
        clearAllUnlocks();
        fullBacklog = [];
        chapterHistory = [];
        readSceneSet.clear();
        lastChosenBranch.clear();
        localStorage.setItem(_getReadSceneKey(), '[]');
        lastTriggeredCGUrl = null;
        localStorage.removeItem('lastTriggeredCGUrl');
        updateCoverBackground(); // 立即恢复默认封面
        if (isFastForwarding) stopFastForward();
        if (sceneTransitionTimer) { clearTimeout(sceneTransitionTimer); sceneTransitionTimer = null; }
        stopAllBgm();
        stopVideo();
        gameActive = false;
        currentScenes = projectJson.scenes;
        _initReadSceneSet(currentScenes);
        if (projectJson.assets) {
            assetConfig = {
                bg: { ...(projectJson.assets.bg || {}) },
                sprites: { ...(projectJson.assets.sprites || {}) },
                bgm: { ...(projectJson.assets.bgm || {}) },
                cg: { ...(projectJson.assets.cg || {}) },
                se: { ...(projectJson.assets.se || {}) },
                voice: { ...(projectJson.assets.voice || {}) },
                video: { ...(projectJson.assets.video || {}) }
            };
        } else {
            // 如果没有提供 assets，则清空所有资源（避免残留）
            assetConfig = { bg: {}, sprites: {}, bgm: {}, cg: {}, se: {}, voice: {}, video: {} };
        }
        // 应用图床链接映射（如果导出的 JSON 中包含 imgbbUrls）
        if (projectJson.imgbbUrls && typeof projectJson.imgbbUrls === 'object') {
            _applyImgbbMappings(projectJson.imgbbUrls);
        }
        dbStoreProject(currentScenes, assetConfig);
        resetGameVars();
        startNewGameFromCurrent();
        populateCoverSettings();
        // ★ 启动渐进式预加载（封面→场景资源顺序→闲时资源）
        startProgressivePreload();
        // 如果鉴赏页面当前是打开的，重新渲染当前标签页
        const galleryPage = document.getElementById('galleryPage');
        if (galleryPage && galleryPage.style.display === 'block') {
            const activeTab = document.querySelector('.gallery-tab.active');
            if (activeTab) {
                const tabName = activeTab.dataset.tab;
                renderGalleryPage(tabName);
            } else {
                renderGalleryPage('cg');
            }
        }
        clearChoices();
        preloadAllProjectAssets();
        showToast("项目加载成功！旧存档已清除，章节已重置");
    }

    function resetToEggDefault() {
        lastTriggeredCGUrl = null;
        localStorage.removeItem('lastTriggeredCGUrl');
        clearLegacySave();
        clearChoices();
        clearAllUnlocks();
        fullBacklog = [];
        chapterHistory = [];
        readSceneSet.clear();
        lastChosenBranch.clear();
        localStorage.setItem(_getReadSceneKey(), '[]');
        if (isFastForwarding) stopFastForward();
        if (isSkipRead) stopSkipRead();
        stopAllBgm();
        currentScenes = JSON.parse(JSON.stringify(DEFAULT_EGG_SCENES));
        _initReadSceneSet(currentScenes);
        assetConfig = {
            bg: { campus: "assets/bg/campus.png" },
            sprites: { char_default: "assets/sprites/character_default.png" },
            bgm: { theme: "assets/bgm/theme.mp3" },
            cg: {},
            se: {},
            voice: {},
            video: {}
        };
        dbStoreProject(currentScenes, assetConfig);
        startNewGameFromCurrent();
        populateCoverSettings();
        var galleryPage = document.getElementById('galleryPage');
        if (galleryPage && galleryPage.style.display === 'block') {
            var activeTab = document.querySelector('.gallery-tab.active');
            if (activeTab) { renderGalleryPage(activeTab.dataset.tab || 'cg'); }
            else { renderGalleryPage('cg'); }
        }
        preloadAllProjectAssets();
        showToast("🥚 已加载开发者彩蛋场景");
    }

    function showProjectSubmenu() {
        settingsSubmenu.style.display = 'none';
        projectSubmenu.style.display = 'flex';
    }

    function showVolumeSubmenu() {
        settingsSubmenu.style.display = 'none';
        volumeSubmenu.style.display = 'flex';
    }

    let customNextKey = localStorage.getItem('customNextKey') || ' '; // 默认空格

    function setHotkey(key) {
        customNextKey = key;
        localStorage.setItem('customNextKey', key);
        showToast(`热键已设为: ${key === ' ' ? '空格' : key}`);
    }


    function setupHotkeyInput(inputId, storageKey, defaultKey, setterCallback) {
        const input = document.getElementById(inputId);
        if (!input) return;
        let currentKey = localStorage.getItem(storageKey) || defaultKey;
        setterCallback(currentKey);
        input.value = (currentKey === 'Control' ? 'Ctrl' : (currentKey === 'Alt' ? 'Alt' : currentKey));
        let waiting = false;
        input.addEventListener('click', (e) => {
            e.stopPropagation();
            if (waiting) return;
            waiting = true;
            input.value = '按下任意键...';
            input.style.backgroundColor = '#3e3528';
            const onKeyDown = (e) => {
                e.preventDefault();
                e.stopPropagation();
                let key = e.key;
                if (key === 'Control' || key === 'Alt') {
                } else if (key.length === 1) {
                    // 单字符
                } else {
                    // 其他忽略
                    waiting = false;
                    input.value = (currentKey === 'Control' ? 'Ctrl' : (currentKey === 'Alt' ? 'Alt' : currentKey));
                    input.style.backgroundColor = '#2a2418';
                    document.removeEventListener('keydown', onKeyDown);
                    showToast('仅支持单键或Ctrl/Alt/Shift');
                    return;
                }
                currentKey = key;
                localStorage.setItem(storageKey, key);
                setterCallback(key);
                input.value = (key === 'Control' ? 'Ctrl' : (key === 'Alt' ? 'Alt' : key));
                waiting = false;
                input.style.backgroundColor = '#2a2418';
                document.removeEventListener('keydown', onKeyDown);
                showToast(`热键已设为 ${input.value}`);
            };
            document.addEventListener('keydown', onKeyDown, { once: true });
            setTimeout(() => {
                if (waiting) {
                    document.removeEventListener('keydown', onKeyDown);
                    waiting = false;
                    input.value = (currentKey === 'Control' ? 'Ctrl' : (currentKey === 'Alt' ? 'Alt' : currentKey));
                    input.style.backgroundColor = '#2a2418';
                    showToast('热键设置超时');
                }
            }, 10000);
        });
    }

    // 调用
    setupHotkeyInput('fastForwardHotkeyInput', 'customFastForwardKey', 'Control', (key) => { customFastForwardKey = key; showToast(`快进热键已设为 ${key === ' ' ? '空格' : key}`);});
    setupHotkeyInput('autoPlayHotkeyInput', 'customAutoPlayKey', 'Alt', (key) => { customAutoPlayKey = key; showToast(`自动播放热键已设为 ${key === ' ' ? '空格' : key}`); });
    setupHotkeyInput('quickSaveHotkeyInput', 'customQuickSaveKey', 'q', (key) => { 
        customQuickSaveKey = key; 
        showToast(`快速存档热键已设为 ${key === ' ' ? '空格' : key}`);
    });

    // ========== tsParticles 银杏叶粒子系统 ==========
    let tsparticlesInstance = null;

    function initParticleSystem() {
        // tsParticles 实例在 startParticles() 中按需创建
    }

    function _getGinkgoLeafSvg() {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">'
            + '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
            + '<stop offset="0%" stop-color="#f5da8c"/>'
            + '<stop offset="50%" stop-color="#e8c44a"/>'
            + '<stop offset="100%" stop-color="#dba541"/>'
            + '</linearGradient></defs>'
            + '<path d="M40 4 C66 16 68 44 56 56 C48 64 40 66 40 66 C40 66 32 64 24 56 C12 44 14 16 40 4 Z" fill="url(#g)"/>'
            + '<line x1="40" y1="18" x2="40" y2="60" stroke="#b87d1e" stroke-width="0.8" opacity="0.35"/>'
            + '</svg>';
    }

    function startParticles() {
        if (tsparticlesInstance) return;
        const container = document.getElementById('particleContainer');
        if (!container) return;
        container.style.display = 'block';

        const ginkgoDataUrl = 'data:image/svg+xml;base64,' + btoa(_getGinkgoLeafSvg());

        tsParticles.load("particleContainer", {
            fullScreen: false,
            fpsLimit: 60,
            particles: {
                number: { value: 28, density: { enable: true } },
                color: { value: ["#f5da8c", "#e8c44a", "#dba541"] },
                shape: {
                    type: "image",
                    images: [{ src: ginkgoDataUrl, width: 80, height: 80 }]
                },
                opacity: {
                    value: { min: 0.25, max: 0.6 },
                    animation: {
                        enable: true,
                        speed: 0.3,
                        minimumValue: 0,
                        sync: false,
                        startValue: "random"
                    }
                },
                size: {
                    value: { min: 10, max: 28 }
                },
                move: {
                    enable: true,
                    speed: { min: 0.15, max: 0.6 },
                    direction: "bottom",
                    straight: false,
                    outModes: { default: "destroy", bottom: "destroy" },
                    random: true,
                    angle: { value: 180, offset: 25 }
                },
                rotate: {
                    value: { min: 0, max: 360 },
                    animation: { enable: true, speed: { min: 0.3, max: 1.5 }, sync: false }
                }
            },
            detectRetina: true
        }).then(instance => {
            tsparticlesInstance = instance;
        }).catch(() => {});
    }

    function stopParticles() {
        if (tsparticlesInstance) {
            tsparticlesInstance.destroy();
            tsparticlesInstance = null;
        }
        const container = document.getElementById('particleContainer');
        if (container) container.style.display = 'none';
    }

    // ========== 标题封面交互（鼠标视差 + 边缘倾斜） ==========
    let titleMouseX = 0, titleMouseY = 0;      // 当前插值位置 (-1~1)
    let titleTargetX = 0, titleTargetY = 0;    // 目标位置 (-1~1)
    let titleParallaxId = null;
    let titleHovered = false;                   // 鼠标是否在封面区域内
    let menuFloatStart = Date.now();
    function updateTitleParallax() {
        const outer = document.getElementById('titleBgOuter');
        if (!outer) { titleParallaxId = null; return; }
        // 仅在标题菜单可见时运行
        if (titleMenu.classList.contains('hide') || galleryPage.style.display === 'block') {
            // 回到中心
            titleTargetX = 0; titleTargetY = 0;
        }
        // 鼠标离开后用更小的 lerp 因子，让复位过程更柔和
        const lerpFactor = titleHovered ? 0.06 : 0.025;
        titleMouseX += (titleTargetX - titleMouseX) * lerpFactor;
        titleMouseY += (titleTargetY - titleMouseY) * lerpFactor;
        // 背景偏移量映射
        const moveX = titleMouseX * 14;
        const moveY = titleMouseY * 10;
        const tiltX = titleMouseY * 2.5;
        const tiltY = titleMouseX * -3.0;
        outer.style.transform =
            `translate(${moveX}px, ${moveY}px) perspective(600px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
        // 菜单栏悬浮 + 跟随鼠标倾斜
        const menuContainer = document.querySelector('.menu-container');
        if (menuContainer && !titleMenu.classList.contains('hide') && galleryPage.style.display !== 'block') {
            const elapsed = (Date.now() - menuFloatStart) / 1000;
            const floatY = Math.sin(elapsed * 1.05) * 8;
            const menuTiltX = titleMouseY * 4;
            const menuTiltY = titleMouseX * -5;
            const shadowX = titleMouseX * 8;
            const shadowY = titleMouseY * 6;
            menuContainer.style.transform =
                `translateY(${floatY}px) perspective(500px) rotateX(${menuTiltX}deg) rotateY(${menuTiltY}deg)`;
            menuContainer.style.boxShadow =
                `${shadowX}px ${shadowY}px 40px rgba(0,0,0,0.5), 0 0 30px rgba(219,165,65,${0.08 + Math.abs(titleMouseX) * 0.12})`;
        } else if (menuContainer) {
            menuContainer.style.transform = '';
            menuContainer.style.boxShadow = '';
        }
        titleParallaxId = requestAnimationFrame(updateTitleParallax);
    }
    function startTitleParallax() {
        if (titleParallaxId) return;
        updateTitleParallax();
    }
    // 鼠标在标题菜单上移动时更新目标
    titleMenu.addEventListener('mousemove', (e) => {
        titleHovered = true;
        const rect = titleMenu.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        // 归一化到 -1 ~ 1
        titleTargetX = ((e.clientX - cx) / (rect.width / 2));
        titleTargetY = ((e.clientY - cy) / (rect.height / 2));
        // 钳制
        titleTargetX = Math.max(-1, Math.min(1, titleTargetX));
        titleTargetY = Math.max(-1, Math.min(1, titleTargetY));
    });
    titleMenu.addEventListener('mouseleave', () => {
        titleHovered = false;
        titleTargetX = 0; titleTargetY = 0;
    });
    // 标题页点击涟漪
    titleMenu.addEventListener('click', (e) => {
        const ripple = document.createElement('span');
        ripple.className = 'title-ripple';
        const rect = titleMenu.getBoundingClientRect();
        const size = 100 + Math.random() * 60;
        ripple.style.cssText = `left:${e.clientX - rect.left}px;top:${e.clientY - rect.top}px;width:${size}px;height:${size}px;`;
        titleMenu.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
    });

    // ========== 文字标记解析器 ==========
    // 变量插值：替换文本中的 {varName} 为变量值
    function interpolateVars(text) {
        if (!text || typeof text !== 'string') return text || '';
        return text.replace(/\{(\w+)\}/g, function(match, varName) {
            return gameVars.hasOwnProperty(varName) ? gameVars[varName] : match;
        });
    }
    function parseTextMarkup(text) {
        // 支持: [c=colorname]text[/c] [b]text[/b] [i]text[/i] [shake]text[/shake] [big]text[/big] [small]text[/small]
        if (!text) return '';
        const colorMap = {
            red: '#f06060', pink: '#f590b0', blue: '#60a0f0', green: '#60d080',
            yellow: '#f5da8c', gold: '#dba541', purple: '#b080e0', white: '#fff',
            gray: '#a09888', orange: '#f0a040'
        };
        let result = '';
        let i = 0;
        while (i < text.length) {
            if (text[i] === '[') {
                const close = text.indexOf(']', i);
                if (close === -1) { result += text[i]; i++; continue; }
                const tag = text.substring(i + 1, close);
                const endTag = '[/' + tag.split('=')[0] + ']';
                const endIdx = text.indexOf(endTag, close + 1);
                if (endIdx === -1) { result += text[i]; i++; continue; }
                const inner = text.substring(close + 1, endIdx);
                const tagName = tag.split('=')[0];
                if (tagName === 'b') {
                    result += '<span class="text-b">' + parseTextMarkup(inner) + '</span>';
                } else if (tagName === 'i') {
                    result += '<span class="text-i">' + parseTextMarkup(inner) + '</span>';
                } else if (tagName === 'shake') {
                    result += '<span class="text-shake">' + parseTextMarkup(inner) + '</span>';
                } else if (tagName === 'big') {
                    result += '<span class="text-big">' + parseTextMarkup(inner) + '</span>';
                } else if (tagName === 'small') {
                    result += '<span class="text-small">' + parseTextMarkup(inner) + '</span>';
                } else if (tagName === 'c') {
                    const color = colorMap[tag.split('=')[1]] || tag.split('=')[1] || '#f5da8c';
                    result += '<span class="text-c" style="color:' + color + '">' + parseTextMarkup(inner) + '</span>';
                } else {
                    result += parseTextMarkup(inner);
                }
                i = endIdx + endTag.length;
            } else {
                result += text[i];
                i++;
            }
        }
        return result;
    }

    // ========== 画面演出效果系统 ==========
    const visualArea = document.querySelector('.visual-area');
    let _pendingFilterTimers = [];  // 跟踪所有待执行的滤镜清除定时器
    function applySceneEffects(effects) {
        // 清除上一场景残留的定时滤镜清除器，防止在新场景中意外触发
        _pendingFilterTimers.forEach(t => clearTimeout(t));
        _pendingFilterTimers = [];
        if (!effects || !Array.isArray(effects)) { clearVisualFilter(); return; }
        const vignette = document.getElementById('vignetteOverlay');
        const flash = document.getElementById('flashOverlay');
        // 如果当前场景没有任何滤镜/氛围效果，动画清除残留滤镜
        const filterTypes = ['sepia','blur','bright','dark','grayscale','saturate-high','saturate-low',
                             'mood-warm','mood-cool','mood-dramatic'];
        const hasFilterEffect = effects.some(e => filterTypes.includes(e.type));
        const hasClearEffect = effects.some(e => e.type === 'clear' || e.type === 'mood-clear');
        if (!hasFilterEffect && !hasClearEffect) clearVisualFilter();
        effects.forEach(eff => {
            switch (eff.type) {
                case 'shake':
                    if (visualArea) {
                        visualArea.classList.remove('shake-active');
                        void visualArea.offsetWidth;
                        visualArea.classList.add('shake-active');
                        setTimeout(() => visualArea.classList.remove('shake-active'), eff.duration || 500);
                    }
                    break;
                case 'vignette':
                    if (vignette) {
                        vignette.classList.add('active');
                        if (eff.duration) setTimeout(() => vignette.classList.remove('active'), eff.duration);
                    }
                    break;
                case 'vignette_off':
                    if (vignette) vignette.classList.remove('active');
                    break;
                case 'flash':
                    if (flash) {
                        flash.classList.add('active');
                        setTimeout(() => flash.classList.remove('active'), eff.duration || 200);
                    }
                    break;
                case 'sepia':
                    applyVisualFilter('sepia(0.6)');
                    if (eff.duration) _pendingFilterTimers.push(setTimeout(clearVisualFilter, eff.duration));
                    break;
                case 'blur':
                    applyVisualFilter('blur(3px)');
                    if (eff.duration) _pendingFilterTimers.push(setTimeout(clearVisualFilter, eff.duration));
                    break;
                case 'bright':
                    applyVisualFilter('brightness(1.4)');
                    if (eff.duration) _pendingFilterTimers.push(setTimeout(clearVisualFilter, eff.duration));
                    break;
                case 'dark':
                    applyVisualFilter('brightness(0.5)');
                    if (eff.duration) _pendingFilterTimers.push(setTimeout(clearVisualFilter, eff.duration));
                    break;
                case 'mood-warm':
                    if (visualArea) {
                        visualArea.classList.remove('mood-cool', 'mood-dramatic');
                        visualArea.classList.add('mood-warm');
                    }
                    break;
                case 'mood-cool':
                    if (visualArea) {
                        visualArea.classList.remove('mood-warm', 'mood-dramatic');
                        visualArea.classList.add('mood-cool');
                    }
                    break;
                case 'mood-dramatic':
                    if (visualArea) {
                        visualArea.classList.remove('mood-warm', 'mood-cool');
                        visualArea.classList.add('mood-dramatic');
                    }
                    break;
                case 'mood-clear':
                    if (visualArea) {
                        visualArea.classList.remove('mood-warm', 'mood-cool', 'mood-dramatic');
                    }
                    break;
                case 'grayscale':
                    applyVisualFilter('grayscale(1)');
                    if (eff.duration) _pendingFilterTimers.push(setTimeout(clearVisualFilter, eff.duration));
                    break;
                case 'letterbox': {
                    const lb = document.getElementById('letterboxOverlay');
                    if (lb) lb.classList.add('active');
                    break;
                }
                case 'letterbox_off': {
                    const lb = document.getElementById('letterboxOverlay');
                    if (lb) lb.classList.remove('active');
                    break;
                }
                case 'zoom-in':
                    if (visualArea) {
                        visualArea.classList.remove('zoom-in-active');
                        void visualArea.offsetWidth;
                        visualArea.classList.add('zoom-in-active');
                    }
                    break;
                case 'zoom-out':
                    if (visualArea) visualArea.classList.remove('zoom-in-active');
                    break;
                case 'saturate-high':
                    applyVisualFilter('saturate(1.8)');
                    if (eff.duration) _pendingFilterTimers.push(setTimeout(clearVisualFilter, eff.duration));
                    break;
                case 'saturate-low':
                    applyVisualFilter('saturate(0.3)');
                    if (eff.duration) _pendingFilterTimers.push(setTimeout(clearVisualFilter, eff.duration));
                    break;
                case 'clear':
                    clearVisualFilter();
                    if (visualArea) {
                        visualArea.style.filter = '';
                        visualArea.classList.remove('mood-warm', 'mood-cool', 'mood-dramatic', 'zoom-in-active');
                    }
                    if (vignette) vignette.classList.remove('active');
                    { const lb = document.getElementById('letterboxOverlay'); if (lb) lb.classList.remove('active'); }
                    break;
            }
        });
    }

    // ========== 多角色立绘系统 ==========
    let multiSpriteGeneration = 0;   // 防止异步加载的竞态条件
    let currentMultiSprites = [];    // 跟踪当前场上立绘 [{key, position, breathing, opacity}]

    function _getSpriteUrl(key) {
        return assetConfig.sprites?.[key] || null;
    }

    function _createSpriteSlot(spr, url) {
        const slot = document.createElement('div');
        slot.className = 'sprite-slot pos-' + (spr.position || 'right');
        slot.setAttribute('data-sprite-key', spr.key);
        if (spr.breathing !== false) slot.classList.add('breathing');
        const img = document.createElement('img');
        img.src = url;
        img.alt = spr.key;
        img.style.opacity = spr.opacity !== undefined ? spr.opacity : '1';
        // main=false 或未设置 main 时初始灰化，main=true 正常显示
        img.style.filter = spr.main ? NORMAL_FILTER : DIM_FILTER;
        slot.appendChild(img);
        return slot;
    }

    function _animateSlotEnter(slot, position) {
        // 根据位置选择入场方向
        if (position === 'left') {
            slot.classList.add('slide-in-left');
        } else if (position === 'right') {
            slot.classList.add('slide-in-right');
        } else {
            // center：从下方淡入
            slot.style.opacity = '0';
            slot.style.transform = 'translateY(30px)';
            var anim = slot.animate(
                { opacity: [0, 1], transform: ['translateY(30px)', 'translateY(0)'] },
                { duration: 400, easing: 'ease-out', fill: 'forwards' }
            );
            anim.onfinish = function() { slot.style.opacity = '1'; slot.style.transform = ''; };
        }
    }

    function _animateSlotExit(slot, position) {
        var exitX = position === 'left' ? -120 : (position === 'right' ? 120 : 0);
        var exitY = position === 'center' ? 30 : 0;
        var keyframes;
        if (position === 'center') {
            keyframes = { opacity: [1, 0], transform: ['translateY(0)', 'translateY(30px)'] };
        } else {
            keyframes = { opacity: [1, 0], transform: ['translateX(0)', 'translateX(' + exitX + 'px)'] };
        }
        var anim = slot.animate(keyframes, { duration: 350, easing: 'ease-in', fill: 'forwards' });
        anim.onfinish = function() { if (slot.parentNode) slot.remove(); };
    }

    function updateMultiSprites(sprites) {
        multiSpriteGeneration++;
        var gen = multiSpriteGeneration;
        var container = document.getElementById('multiSpriteContainer');
        if (!container) return;

        // 清除可能残留的单立绘淡入淡出定时器，避免场景切换时闪烁
        if (spriteFadeTimer) { clearTimeout(spriteFadeTimer); spriteFadeTimer = null; }

        // 空数组或 null → 清除所有立绘（带动画离场）
        if (!sprites || !Array.isArray(sprites) || sprites.length === 0) {
            currentMultiSprites.forEach(function(spr) {
                var el = container.querySelector('[data-sprite-key="' + spr.key + '"]');
                if (el) _animateSlotExit(el, spr.position || 'right');
            });
            currentMultiSprites = [];
            if (spriteWrapper) spriteWrapper.style.opacity = '1';
            return;
        }

        // 单立绘→多立绘晋升：已在场立绘交叉淡化迁移到多角色容器，不播滑入动画
        // 用角色目录（而非 key）匹配，确保同一人物的不同差分不被当成新角色
        var didPromote = false;
        if (hasActiveSprite && spriteImg.src && currentMultiSprites.length === 0) {
            var currentCharDir = getSpriteCharDir(spriteImg.src);
            if (currentCharDir) {
                var promoted = sprites.find(function(s) {
                    return getSpriteCharDir(_getSpriteUrl(s.key)) === currentCharDir;
                });
                if (promoted) {
                    var url = _getSpriteUrl(promoted.key);
                    var slot = _createSpriteSlot({key: promoted.key, position: promoted.position || 'right', breathing: promoted.breathing, opacity: promoted.opacity}, url);
                    // 复制单立绘容器的计算后定位，确保 slot 出现在相同位置不跳动
                    var ws = getComputedStyle(spriteWrapper);
                    slot.style.right = ws.right;
                    slot.style.bottom = ws.bottom;
                    slot.style.height = ws.height;
                    // 起始透明：先关掉 CSS transition，避免浏览器把 opacity:1→0 动画化
                    slot.style.transition = 'none';
                    slot.style.opacity = '0';
                    container.appendChild(slot);
                    currentMultiSprites.push({key: promoted.key, position: promoted.position || 'right', breathing: promoted.breathing, opacity: promoted.opacity, main: true});
                    unlockItem('sprite', promoted.key);
                    didPromote = true;
                    // 强制提交 opacity:0 的渲染，然后恢复 transition 做交叉淡化
                    slot.offsetHeight;
                    slot.style.transition = '';
                    requestAnimationFrame(function() {
                        slot.style.opacity = '1';
                        spriteWrapper.style.opacity = '0';
                    });
                }
            }
        }

        // 非晋升路径仍需手动隐藏单立绘容器
        if (spriteWrapper && !didPromote) { spriteWrapper.style.opacity = '0'; undimSprite(); }

        // Diff：对比新旧立绘列表（按 key 精确匹配）
        var toAdd = sprites.filter(function(s) {
            return !currentMultiSprites.find(function(c) { return c.key === s.key; });
        });
        var toRemove = currentMultiSprites.filter(function(c) {
            return !sprites.find(function(s) { return s.key === c.key; });
        });

        // 同一角色不同差分切换：更新已有 slot 的图片，不播离场/入场动画
        var finalToRemove = [];
        toRemove.forEach(function(spr) {
            var rDir = getSpriteCharDir(_getSpriteUrl(spr.key));
            if (!rDir) { finalToRemove.push(spr); return; }
            var swapAdd = toAdd.find(function(s) {
                return getSpriteCharDir(_getSpriteUrl(s.key)) === rDir;
            });
            if (swapAdd) {
                // 原地更新：换图、换 key、换属性
                var el = container.querySelector('[data-sprite-key="' + spr.key + '"]');
                if (el) {
                    el.setAttribute('data-sprite-key', swapAdd.key);
                    var img = el.querySelector('img');
                    if (img) {
                        img.src = _getSpriteUrl(swapAdd.key);
                        img.style.opacity = swapAdd.opacity !== undefined ? swapAdd.opacity : '1';
                    }
                    if (swapAdd.breathing !== false) el.classList.add('breathing');
                    else el.classList.remove('breathing');
                    // 更新位置 class
                    el.className = el.className.replace(/pos-\w+/g, 'pos-' + (swapAdd.position || 'right'));
                    // 同步 tracking 数组中的条目
                    var tIdx = currentMultiSprites.findIndex(function(c) { return c.key === spr.key; });
                    if (tIdx >= 0) {
                        currentMultiSprites[tIdx] = { key: swapAdd.key, position: swapAdd.position || 'right', breathing: swapAdd.breathing, opacity: swapAdd.opacity, main: swapAdd.main };
                        // 更新 main 状态对应的滤镜
                        var newFilter = swapAdd.main ? NORMAL_FILTER : DIM_FILTER;
                        if (img._filterAnim) { img._filterAnim.cancel(); img._filterAnim = null; }
                        var fromVal = getComputedStyle(img).filter;
                        if (fromVal === 'none' || fromVal === '') fromVal = newFilter === NORMAL_FILTER ? DIM_FILTER : NORMAL_FILTER;
                        img._filterAnim = img.animate({ filter: [fromVal, newFilter] }, { duration: 500, easing: 'ease', fill: 'forwards' });
                        img._filterAnim.onfinish = function() { img.style.filter = newFilter; img._filterAnim = null; };
                    }
                }
                toAdd = toAdd.filter(function(s) { return s.key !== swapAdd.key; });
            } else {
                finalToRemove.push(spr);
            }
        });
        toRemove = finalToRemove;

        // 更新跟踪状态（用最新 sprites 列表覆盖）
        // 先检测已有 slot 的 main 状态变化并动画过渡
        var oldMultiSprites = currentMultiSprites;
        currentMultiSprites = sprites.map(function(s) {
            return { key: s.key, position: s.position, breathing: s.breathing, opacity: s.opacity, main: s.main };
        });
        // 对仍在舞台上的 sprite，检测 main 状态是否改变
        sprites.forEach(function(s) {
            var oldEntry = oldMultiSprites.find(function(c) { return c.key === s.key; });
            if (oldEntry && oldEntry.main !== s.main) {
                var el = container.querySelector('[data-sprite-key="' + s.key + '"]');
                if (el) {
                    var img = el.querySelector('img');
                    if (img) {
                        var toVal = s.main ? NORMAL_FILTER : DIM_FILTER;
                        var fromVal = getComputedStyle(img).filter;
                        if (fromVal === 'none' || fromVal === '') fromVal = s.main ? DIM_FILTER : NORMAL_FILTER;
                        if (img._filterAnim) { img._filterAnim.cancel(); img._filterAnim = null; }
                        img._filterAnim = img.animate({ filter: [fromVal, toVal] }, { duration: 500, easing: 'ease', fill: 'forwards' });
                        img._filterAnim.onfinish = function() { img.style.filter = toVal; img._filterAnim = null; };
                    }
                }
            }
        });

        // 离场动画
        toRemove.forEach(function(spr) {
            var el = container.querySelector('[data-sprite-key="' + spr.key + '"]');
            if (el) _animateSlotExit(el, spr.position || 'right');
        });

        // 预加载新立绘，然后以入场动画添加
        var urls = toAdd.map(function(spr) { return _getSpriteUrl(spr.key); }).filter(Boolean);
        Promise.all(urls.map(function(url) { return preloadImage(url).catch(function() { return null; }); })).then(function() {
            if (gen !== multiSpriteGeneration) return;
            toAdd.forEach(function(spr) {
                var url = _getSpriteUrl(spr.key);
                if (!url) return;
                var slot = _createSpriteSlot(spr, url);
                container.appendChild(slot);
                unlockItem('sprite', spr.key);
                _animateSlotEnter(slot, spr.position || 'right');
            });
        });
    }

    // ========== 右键菜单 ==========
    const contextMenu = document.getElementById('contextMenu');
    function showContextMenu(x, y) {
        if (!contextMenu || !gameActive) return;
        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';
        // 防止溢出屏幕
        const rect = contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) contextMenu.style.left = (x - rect.width) + 'px';
        if (rect.bottom > window.innerHeight) contextMenu.style.top = (y - rect.height) + 'px';
        contextMenu.classList.add('show');
        // 更新自动播放按钮文字
        const autoItem = contextMenu.querySelector('[data-action="auto"]');
        if (autoItem) autoItem.innerText = autoPlayEnabled ? '⏸ 停止自动' : '▶ 自动播放';
        const skipItem = contextMenu.querySelector('[data-action="skip"]');
        if (skipItem) skipItem.innerText = isFastForwarding ? '⏹ 停止快进' : '⏩ 快进';
    }
    function hideContextMenu() {
        if (contextMenu) contextMenu.classList.remove('show');
    }
    document.addEventListener('contextmenu', (e) => {
        if (!gameActive) return;
        if (e.target.closest('.settings-modal, .save-page, .chapter-select-overlay, .backlog-overlay, .gallery-page')) return;
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY);
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.context-menu')) hideContextMenu();
    });
    if (contextMenu) {
        contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                hideContextMenu();
                switch (action) {
                    case 'save': saveToAutoSlot(); break;
                    case 'load': loadLatestSaveFromLocal(); break;
                    case 'share': showShareCodeUI(); break;
                    case 'auto': toggleAutoPlay(); break;
                    case 'skip': toggleFastForward(); break;
                    case 'skipread': toggleSkipRead(); break;
                    case 'prevchoice': jumpToPreviousChoice(); break;
                    case 'nextchoice': jumpToNextChoice(); break;
                    case 'backlog': openBacklog(); break;
                    case 'settings': if (settingsIcon) settingsIcon.click(); break;
                    case 'title': returnToTitle(); break;
                    case 'reload': reloadProjectFile(); break;
                    case 'jumpScene': promptJumpToScene(); break;
                }
            });
        });
    }
    // Ctrl+S 快速重新加载项目
    function reloadProjectFile() {
        var input = document.querySelector('input[type="file"][accept="application/json"]');
        if (input) input.click();
        else showToast("未找到项目文件输入");
    }
    function promptJumpToScene() {
        var maxIdx = currentScenes.length - 1;
        var input = prompt("跳转到场景编号 (0 ~ " + maxIdx + ")：", currentIndex);
        if (input === null || input === "") return;
        var idx = parseInt(input, 10);
        if (isNaN(idx) || idx < 0 || idx > maxIdx) { showToast("无效的场景编号"); return; }
        if (isFastForwarding) stopFastForward();
        if (autoPlayEnabled) stopAutoPlay();
        if (isSkipRead) stopSkipRead();
        if (typingTimer) clearInterval(typingTimer);
        isTyping = false;
        clearChoices();
        clearVisuals();
        currentIndex = idx;
        updateScene();
        showToast("已跳转到场景 " + (idx + 1));
    }
    document.addEventListener('keydown', function(e) {
        if (!gameActive) return;
        // Ctrl+S: 重新加载项目
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            reloadProjectFile();
        }
    });

    // ========== 章节选择 ==========
    function buildChapterList() {
        if (!currentScenes.length) return [];
        const chapters = [];
        let chapterNum = 0;
        let startIdx = 0;
        for (let i = 0; i < currentScenes.length; i++) {
            const s = currentScenes[i];
            if (s && s.triggerChapterTransition) {
                chapterNum++;
                if (chapters.length > 0) {
                    chapters[chapters.length - 1].endIdx = i - 1;
                }
                chapters.push({
                    num: chapterNum,
                    title: s.subtitle || s.text || ('第' + toChineseNumeral(chapterNum) + '章'),
                    startIdx: s.next !== undefined && s.next !== null ? s.next : i + 1,
                    subtitle: s.text || ''
                });
            } else if (i === 0 && !s?.triggerChapterTransition) {
                // 第一个场景如果不是过渡，创建序章
                if (chapters.length === 0) {
                    chapters.push({ num: 1, title: '序章', startIdx: 0, subtitle: 'Chapter default subtitle' });
                }
            }
        }
        if (chapters.length > 0 && !chapters[chapters.length - 1].endIdx) {
            chapters[chapters.length - 1].endIdx = currentScenes.length - 1;
        }
        if (chapters.length === 0) {
            chapters.push({ num: 1, title: '序章', startIdx: 0, subtitle: 'Chapter default subtitle' });
        }
        return chapters;
    }
    function showChapterSelect() {
        const overlay = document.getElementById('chapterSelectOverlay');
        const list = document.getElementById('chapterSelectList');
        if (!overlay || !list) return;
        const chapters = buildChapterList();
        // 章节解锁判定：序章始终解锁；其余章节需要该章节过渡场景已被读过
        list.innerHTML = chapters.map((ch, idx) => {
            const unlocked = idx === 0 || readSceneSet.has(ch.startIdx) || Array.from(readSceneSet).some(function(sid) { return sid >= ch.startIdx; });
            const progress = unlocked ? (ch.startIdx <= currentIndex && gameActive ? ' (已读)' : '') : '（未解锁）';
            return '<div class="chapter-card' + (unlocked ? '' : ' locked') + '" data-start="' + ch.startIdx + '"' + (unlocked ? '' : ' title="尚未到达此章节"') + '>' +
                '<div class="chapter-card-title">第' + toChineseNumeral(ch.num) + '章 · ' + (unlocked ? ch.title : '???') + '</div>' +
                '<div class="chapter-card-sub">' + (unlocked ? (ch.subtitle || '') : '继续推进剧情以解锁') + '</div>' +
                '<div class="chapter-card-progress">场景 #' + (ch.startIdx + 1) + progress + '</div>' +
                '</div>';
        }).join('');
        list.querySelectorAll('.chapter-card:not(.locked)').forEach(card => {
            card.addEventListener('click', () => {
                const startIdx = parseInt(card.dataset.start);
                jumpToChapter(startIdx);
            });
        });
        overlay.classList.add('show');
    }
    function hideChapterSelect() {
        const overlay = document.getElementById('chapterSelectOverlay');
        if (overlay) overlay.classList.remove('show');
    }
    function jumpToChapter(startIdx) {
        if (!currentScenes.length || startIdx < 0 || startIdx >= currentScenes.length) return;
        if (isFastForwarding) stopFastForward();
        if (isSkipRead) stopSkipRead();
        if (autoPlayEnabled) stopAutoPlay();
        if (typingTimer) clearInterval(typingTimer);
        if (chapterTransitionTimer) { clearTimeout(chapterTransitionTimer); chapterTransitionTimer = null; chapterTransitionCallback = null; }
        isTyping = false;
        stopAllBgm();
        clearChoices();
        _prepareJumpSprite(startIdx);
        currentIndex = startIdx;
        gameActive = true;
        fullBacklog = [];
        chapterHistory = [];
        titleMenu.style.transition = 'none';
        titleMenu.classList.add('hide');
        titleMenu.offsetHeight;
        titleMenu.style.transition = '';
        document.getElementById('dialogArea').style.opacity = '1';
        document.getElementById('dialogArea').style.pointerEvents = 'auto';
        hideChapterSelect();
        closeSavePage();
        updateScene();
        fixSpritePosition();
    }

    // ========== BGM闪避系统（Howler.js fade 替代手写缓动） ==========
    let bgmPreDuckVolume = 0.5;
    let bgmDuckingRatio = 0.30;
    let bgmDuckingTargetVol = 0.15;
    let isDucking = false;

    function startBgmDucking() {
        if (!audioElement || audioElement.paused || !currentBgm) return;
        if (isDucking) {
            bgmDuckingTargetVol = (bgmPreDuckVolume || audioElement.volume) * bgmDuckingRatio;
            return;
        }
        bgmPreDuckVolume = audioElement.volume;
        isDucking = true;
        bgmDuckingTargetVol = bgmPreDuckVolume * bgmDuckingRatio;
        audioElement.fade(audioElement.volume, bgmDuckingTargetVol, 200);
    }

    function stopBgmDucking() {
        if (!isDucking) return;
        isDucking = false;
        if (!audioElement || audioElement.paused || !currentBgm) return;
        audioElement.fade(audioElement.volume, bgmPreDuckVolume, 450);
    }

    function forceStopBgmDucking() {
        if (isDucking && audioElement) {
            audioElement.volume = bgmPreDuckVolume;
        }
        isDucking = false;
    }

    // ========== 语音系统 (Howler.js) ==========
    let voiceAudio = null;
    let currentVoiceUrl = null;
    function playVoice(voiceKey) {
        if (!voiceKey) return;
        const url = assetConfig.voice?.[voiceKey] || voiceKey;
        if (!url) return;
        if (voiceAudio) { voiceAudio.off('end'); voiceAudio.stop(); voiceAudio.unload(); voiceAudio = null; }
        voiceAudio = new Howl({
            src: [url], volume: voiceVolume, html5: true,
            onend: function() { stopBgmDucking(); showVoiceIndicator(false); }
        });
        currentVoiceUrl = url;
        voiceAudio.play();
        startBgmDucking();
        showVoiceIndicator(true);
    }
    function stopVoice() {
        stopBgmDucking();
        if (voiceAudio) { voiceAudio.off('end'); voiceAudio.stop(); voiceAudio.unload(); voiceAudio = null; }
        currentVoiceUrl = null;
        showVoiceIndicator(false);
    }
    function showVoiceIndicator(visible) {
        var ind = document.getElementById('voiceIndicator');
        if (ind) ind.style.display = visible ? 'inline-flex' : 'none';
    }
    function replayCurrentVoice() {
        if (currentVoiceUrl) {
            if (voiceAudio) { voiceAudio.off('end'); voiceAudio.stop(); voiceAudio.unload(); voiceAudio = null; }
            voiceAudio = new Howl({
                src: [currentVoiceUrl], volume: voiceVolume, html5: true,
                onend: function() { stopBgmDucking(); showVoiceIndicator(false); }
            });
            voiceAudio.play();
            startBgmDucking();
            showVoiceIndicator(true);
        }
    }

    // ========== 跳过预览指示器 ==========
    function updateSkipIndicator(scene) {
        const indicator = document.getElementById('skipIndicator');
        if (!indicator) return;
        if (isFastForwarding || isSkipRead) {
            const speaker = scene?.speaker || '';
            const text = scene?.text || '';
            indicator.querySelector('.skip-title').innerText = isFastForwarding ? '⏩ 快进中' : '📖 已读跳过中';
            indicator.querySelector('.skip-text').innerText = speaker ? speaker + ': ' + text : text;
            indicator.classList.add('show');
        } else {
            indicator.classList.remove('show');
        }
    }

    // ========== 好感度显示 ==========
    function updateAffinity(scene) {
        const display = document.getElementById('affinityDisplay');
        if (!display) return;
        if (scene && scene.affinity !== undefined) {
            const label = display.querySelector('.affinity-label');
            const fill = display.querySelector('.affinity-fill-inner');
            if (label) label.innerText = scene.affinityLabel || '好感度';
            if (fill) fill.style.width = Math.min(100, Math.max(0, scene.affinity)) + '%';
            display.classList.add('show');
            // 成就追踪：最大好感变动
            var prevMax = getVar("_max_affinity_delta") || 0;
            if (scene.affinity > prevMax) { setVar("_max_affinity_delta", scene.affinity); checkAchievements(); }
        } else if (scene && scene.affinity === null) {
            display.classList.remove('show');
        }
        // 不设置时保持之前状态
    }

    // ========== CG 缩放转场 ==========
    let cgGeneration = 0;  // 防止CG异步加载的竞态条件
    function handleCgDisplayEnhanced(cgKey) {
        const cgLayer = document.getElementById('cgLayer');
        const cgImg = document.getElementById('cgImage');
        // 移除上一次的点击处理器
        if (cgLayer._cgClickHandler) {
            cgLayer.removeEventListener('click', cgLayer._cgClickHandler);
            cgLayer._cgClickHandler = null;
        }
        if (cgKey && assetConfig.cg && assetConfig.cg[cgKey]) {
            cgGeneration++;
            const gen = cgGeneration;
            const cgUrl = assetConfig.cg[cgKey];
            // 预加载CG后再显示，避免缩放动画时图片还未加载
            preloadImage(cgUrl).then(() => {
                if (gen !== cgGeneration) return; // 已被更新的调用覆盖
                cgImg.src = cgUrl;
                cgImg.classList.add('zoom-in');
                cgImg.classList.add('ken-burns');
                setTimeout(function() { cgImg.classList.remove('zoom-in'); }, 500);
                unlockItem('cg', cgKey);
                cgLayer.classList.add('show');
                lastTriggeredCGUrl = cgUrl;
                localStorage.setItem('lastTriggeredCGUrl', cgUrl);
                cgPrevBtn.style.display = 'none';
                cgNextBtn.style.display = 'none';
                if (autoPlayEnabled) { stopAutoPlay(); resumeAutoPlayAfterPause = true; }
                cgLayer._cgClickHandler = () => { nextDialogue(); };
                cgLayer.addEventListener('click', cgLayer._cgClickHandler);
            }).catch(() => {
                if (gen !== cgGeneration) return;
                // 加载失败也尝试显示
                cgImg.src = cgUrl;
                cgLayer.classList.add('show');
            });
        } else {
            cgLayer.classList.remove('show');
            cgImg.classList.remove('ken-burns');
        }
    }

    // ========== 视频播放 ==========
    let videoGeneration = 0;
    let _videoOverlayReady = false;
    let _videoEnded = false;

    function initVideoOverlay() {
        if (_videoOverlayReady) return;
        _videoOverlayReady = true;
        const overlay = document.getElementById('videoOverlay');
        const videoPlayer = document.getElementById('videoPlayer');
        const videoHint = document.getElementById('videoHint');
        if (!overlay || !videoPlayer) return;
        // 点击覆盖层任意位置跳过视频
        overlay.addEventListener('click', function(e) {
            if (_videoEnded) {
                // 视频已播放完毕，点击后关闭并推进
                stopVideo();
                nextDialogue();
                return;
            }
            // 播放中点击 → 跳过
            if (e.target === videoPlayer) return;
            stopVideo();
            nextDialogue();
        });
        // 点击视频元素本身也跳过（移除之前的守卫条件）
        videoPlayer.addEventListener('click', function(e) {
            e.stopPropagation();
            stopVideo();
            nextDialogue();
        });
        videoPlayer.addEventListener('ended', function() {
            _videoEnded = true;
            videoPlayer.pause(); // 停在最后一帧
            if (videoHint) {
                videoHint.innerText = '点击继续';
                videoHint.style.opacity = '1';
            }
        });
    }

    function playSceneVideo(videoKey) {
        if (!videoKey) return;
        const overlay = document.getElementById('videoOverlay');
        const videoPlayer = document.getElementById('videoPlayer');
        const videoHint = document.getElementById('videoHint');
        if (!overlay || !videoPlayer) return;
        const url = assetConfig.video?.[videoKey] || videoKey;
        initVideoOverlay();
        _videoEnded = false;
        // 成就追踪
        setVar("_watched_video", (getVar("_watched_video") || 0) + 1); checkAchievements();
        videoGeneration++;
        const gen = videoGeneration;
        // 暂停 BGM 和语音
        if (bgmHowl && bgmHowl.playing()) bgmHowl.pause();
        stopVoice();
        videoPlayer.src = url;
        videoPlayer.load();
        videoPlayer.play().then(function() {
            if (gen !== videoGeneration) return;
            overlay.classList.add('show');
            if (videoHint) {
                videoHint.innerText = '点击跳过视频';
                videoHint.style.opacity = '1';
            }
            if (autoPlayEnabled) { stopAutoPlay(); resumeAutoPlayAfterPause = true; }
            if (isFastForwarding) { stopFastForward(); resumeFastForwardAfterCG = true; }
        }).catch(function(err) {
            if (gen !== videoGeneration) return;
            console.warn('视频播放失败:', err);
            // 播放失败直接跳过
            nextDialogue();
        });
    }

    function stopVideo() {
        videoGeneration++;
        _videoEnded = false;
        const overlay = document.getElementById('videoOverlay');
        const videoPlayer = document.getElementById('videoPlayer');
        if (overlay) overlay.classList.remove('show');
        if (videoPlayer) {
            videoPlayer.pause();
            // 等 opacity 过渡完成后再清 src，保持淡出视觉连贯
            setTimeout(function() {
                if (videoPlayer) videoPlayer.src = '';
            }, 650);
        }
    }

    // ========== 回溯系统 ==========
    function restoreRollbackState(state) {
        if (!state) return;
        isRollingBack = true;
        // 停止打字和自动播放
        if (isTyping) { clearInterval(typingTimer); typingTimer = null; isTyping = false; }
        if (autoPlayEnabled) stopAutoPlay();
        if (state.bg && state.bg !== currentDisplayBg) {
            setBackground(state.bg);
            lastRenderedBgKey = state.bg;
        }
        if (state.bgm && state.bgm !== currentBgm) {
            playBgm(state.bgm);
        }
        // 恢复角色名：通过 empty 标记判断，避免全角空格 innerHTML 被当作有内容
        if (!state.speakerEmpty && state.speakerHTML) {
            speakerEl.innerHTML = state.speakerHTML;
            speakerEl.classList.remove('empty');
        } else {
            speakerEl.innerText = '　';
            speakerEl.classList.add('empty');
        }
        var dialogTextEl = document.getElementById('dialogText');
        if (dialogTextEl) dialogTextEl.innerText = state.text || '';
        // 恢复单立绘
        if (state.sprite1Src) {
            _setSpriteByUrl(state.sprite1Src, spriteImg, true);
            spriteImg.style.opacity = '1';
            hasActiveSprite = true;
        } else {
            spriteImg.src = '';
            if (!state.sprite2Src && !state.multiSprites) hasActiveSprite = false;
        }
        if (state.sprite2Src) {
            _setSpriteByUrl(state.sprite2Src, spriteImg2, true);
            spriteImg2.style.opacity = state.sprite2Opacity || '1';
        } else {
            spriteImg2.src = '';
            spriteImg2.style.opacity = '0';
        }
        // 恢复多角色立绘
        var mcContainer = document.getElementById('multiSpriteContainer');
        if (mcContainer) mcContainer.innerHTML = '';
        if (state.multiSprites && state.multiSprites.length > 0 && mcContainer) {
            hasActiveSprite = true;
            var frag = document.createDocumentFragment();
            state.multiSprites.forEach(function(ms) {
                var img = document.createElement('img');
                img.src = ms.src;
                img.dataset.spriteKey = ms.key;
                img.dataset.spritePosition = ms.position;
                img.style.cssText = [
                    'position:absolute', 'bottom:0',
                    ms.position === 'left' ? 'left:5%' : (ms.position === 'center' ? 'left:50%;transform:translateX(-50%)' : 'right:5%'),
                    'height:92%', 'width:auto', 'object-fit:contain',
                    'opacity:' + (ms.opacity || '1'),
                    'transition:opacity 0.5s ease, filter 0.5s ease',
                    'pointer-events:none'
                ].join(';');
                frag.appendChild(img);
            });
            mcContainer.appendChild(frag);
            currentMultiSprites = state.multiSprites.map(function(ms) {
                return { key: ms.key, position: ms.position };
            });
        } else {
            currentMultiSprites = [];
        }
        if (state.locationHint && state.locationHintVisible) {
            locationHintEl.innerText = state.locationHint;
            locationHintEl.classList.add('show');
        } else {
            locationHintEl.classList.remove('show');
        }
        // 隐藏 CG 层
        const cgLayer = document.getElementById('cgLayer');
        if (cgLayer && !state.cgVisible) {
            cgLayer.classList.remove('show');
        }
        isRollingBack = false;
    }

    function _setSpriteByUrl(url, imgEl, instant) {
        if (!imgEl || !url) return;
        if (instant) {
            imgEl.style.transition = 'none';
            imgEl.src = url;
            imgEl.offsetHeight;
            imgEl.style.transition = '';
        } else {
            imgEl.src = url;
        }
    }

    function performRollback() {
        if (rollbackStack.length === 0) return;
        // 成就追踪
        setVar("_used_rollback", (getVar("_used_rollback") || 0) + 1); checkAchievements();
        if (rollbackPos < 0) {
            // 未回溯：从栈顶开始
            rollbackPos = rollbackStack.length - 1;
        } else if (rollbackPos > 0) {
            rollbackPos--;
        } else {
            return; // 已在最早处
        }
        restoreRollbackState(rollbackStack[rollbackPos]);
    }

    function performRollForward() {
        if (rollbackPos < 0) return;
        if (rollbackPos >= rollbackStack.length - 1) {
            // 到达最新位置，退出回溯
            exitRollback();
            return;
        }
        rollbackPos++;
        restoreRollbackState(rollbackStack[rollbackPos]);
    }

    function exitRollback() {
        if (rollbackPos < 0) return;
        rollbackPos = -1;
        // 阻止 updateScene 将回溯态的临时显示再次入栈
        isRollingBack = true;
        if (gameActive && currentScenes.length > 0 && currentIndex >= 0 && currentIndex < currentScenes.length) {
            updateScene();
        }
        isRollingBack = false;
    }

    // 鼠标滚轮回溯
    (function initRollbackWheel() {
        var wrapper = document.getElementById('gameWrapper');
        if (!wrapper) return;
        wrapper.addEventListener('wheel', function(e) {
            // 开关关闭时直接放行
            if (!rollbackEnabled) return;
            if (!gameActive) return;
            // 有覆盖层打开时不拦截滚轮，让各层自身滚动正常工作
            if (_isAnyOverlayOpen()) return;
            if (chapterTransitionTimer) return;
            if (sceneTransitionTimer) return;
            // 节流：相邻两次回溯操作冷却
            var now = Date.now();
            if (now - lastRollbackTime < rollbackCooldown) return;
            if (e.deltaY < 0) {
                // 防止回溯到最早处后阻止页面默认滚动
                if (rollbackStack.length === 0 || (rollbackPos === 0 && rollbackStack.length > 0)) return;
                e.preventDefault();
                lastRollbackTime = now;
                performRollback();
            } else if (e.deltaY > 0 && rollbackPos >= 0) {
                e.preventDefault();
                lastRollbackTime = now;
                performRollForward();
            }
        }, { passive: false });
    })();

    // 检查是否有覆盖层打开（存档、对话记录、设置、标题、章节选择、鉴赏、CG、视频、选项）
    function _isAnyOverlayOpen() {
        var el;
        el = document.getElementById('sceneTransitionOverlay'); if (el && el.classList.contains('in')) return true;
        el = document.getElementById('cgLayer'); if (el && el.classList.contains('show')) return true;
        el = document.getElementById('videoOverlay'); if (el && el.classList.contains('show')) return true;
        el = document.getElementById('choicesContainer'); if (el && el.style.display !== 'none') return true;
        el = document.getElementById('savePage'); if (el && el.classList.contains('show')) return true;
        el = document.getElementById('backlogOverlay'); if (el && el.classList.contains('show')) return true;
        el = document.getElementById('settingsModal'); if (el && el.classList.contains('show')) return true;
        el = document.getElementById('titleMenu'); if (el && !el.classList.contains('hide')) return true;
        el = document.getElementById('chapterSelectOverlay'); if (el && el.classList.contains('show')) return true;
        el = document.getElementById('galleryPage'); if (el && el.style.display !== 'none') return true;
        return false;
    }

