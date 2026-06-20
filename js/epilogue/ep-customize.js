/**
 * ep-customize.js — 后日谈自定义面板（背景 & 音乐）
 *
 * 独立于游戏引擎，直接操作 DOM 和 Howler。
 * 设置保存在 localStorage，下次进入自动恢复。
 */

const EpilogueCustomize = (() => {
    const STORAGE_BG     = 'epilogue_custom_bg';
    const STORAGE_BGM    = 'epilogue_custom_bgm';
    const STORAGE_SPRITE = 'epilogue_sprite';

    // ─── 资源定义（动态从 assetConfig 生成）────────────────
    function _buildList(cat, fallback) {
        var cfg = (typeof assetConfig !== 'undefined' && assetConfig[cat]) ? assetConfig[cat] : {};
        var keys = Object.keys(cfg);
        if (keys.length === 0) return fallback;
        return keys.map(function(k) {
            if (typeof getAssetDisplayName === "function") { var dn = getAssetDisplayName(cat, k); } else { var dn = k.replace(/_/g, " "); } return { key: k, url: cfg[k], name: dn };
        });
    }
    const BG_LIST    = _buildList('bg',     [{ key:'campus', url:'assets/bg/campus.png', name:'Default' }]);
    const SPRITE_LIST = _buildList('sprites',[{ key:'char_default', url:'assets/sprites/character_default.png', name:'Default' }]);
    const BGM_LIST    = _buildList('bgm',    [{ key:'theme', url:'assets/bgm/theme.mp3', name:'Default' }]);

    // ─── 状态 ───────────────────────────────────
    let currentBgKey    = '';
    let currentBgmKey   = '';
    let currentSpriteKey = 'normal';
    let panelEl         = null;
    let bgmPreviewHowl  = null;   // 试听用的 Howl 实例

    // ─── 初始化 ─────────────────────────────────
    function init() {
        // 读取用户上次的选择，否则用默认
        currentBgKey  = localStorage.getItem(STORAGE_BG)  || (BG_LIST.length > 0 ? BG_LIST[0].key : '');
        currentBgmKey = localStorage.getItem(STORAGE_BGM) || (BGM_LIST.length > 0 ? BGM_LIST[0].key : '');

        // 应用已保存的设置
        applyBg(currentBgKey);
        applyBgm(currentBgmKey);
        currentSpriteKey = localStorage.getItem(STORAGE_SPRITE) || 'normal';

        console.log('[EpilogueCustomize] 初始化 | BG:', currentBgKey, '| BGM:', currentBgmKey, '| Sprite:', currentSpriteKey);
    }

    // ─── 应用背景 ──────────────────────────────
    function applyBg(key) {
        const bg = BG_LIST.find(b => b.key === key);
        if (!bg) return;

        const bgLayer = document.getElementById('bgLayer');
        if (bgLayer) {
            bgLayer.style.transition = 'opacity 0.5s ease';
            bgLayer.style.opacity = '0.3';
            setTimeout(() => {
                bgLayer.style.backgroundImage = `url('${bg.url}')`;
                bgLayer.style.backgroundSize   = 'cover';
                bgLayer.style.backgroundPosition = 'center';
                bgLayer.style.opacity = '1';
            }, 250);
        }
        currentBgKey = key;
        localStorage.setItem(STORAGE_BG, key);
    }

    // ─── 音量控制 ──────────────────────────────
    function getVolume() {
        return parseFloat(localStorage.getItem('epilogue_bgm_volume') || '0.5');
    }
    function setVolume(val) {
        const v = Math.max(0, Math.min(1, val));
        localStorage.setItem('epilogue_bgm_volume', v.toString());
        const audio = document.getElementById('bgmAudio') || document.querySelector('audio');
        if (audio) audio.volume = v;
    }

    // ─── 应用 BGM ──────────────────────────────
    function applyBgm(key) {
        const bgm = BGM_LIST.find(b => b.key === key);
        if (!bgm) return;

        const audio = document.getElementById('bgmAudio') || document.querySelector('audio');
        if (audio) {
            const wasPlaying = !audio.paused;
            audio.src = bgm.url;
            audio.loop = true;
            audio.volume = getVolume();
            if (wasPlaying || currentBgmKey !== key) {
                audio.play().catch(() => {});
            }
        }
        currentBgmKey = key;
        localStorage.setItem(STORAGE_BGM, key);
    }

    // ─── 应���立绘 ──────────────────────────────
    function applySprite(key) {
        var sp = SPRITE_LIST.find(function(s) { return s.key === key; });
        if (!sp) return;
        var si = document.getElementById('characterSprite');
        if (si) {
            si.src = sp.url;
            si.style.opacity = '1';
        }
        currentSpriteKey = key;
        localStorage.setItem(STORAGE_SPRITE, key);
    }

    // ─── 试听 BGM（预览播放）───────────────────
    function previewBgm(key) {
        const bgm = BGM_LIST.find(b => b.key === key);
        if (!bgm) return;

        // 停止之前的试听
        stopPreview();

        // 暂停主 BGM
        const mainAudio = document.getElementById('bgmAudio') || document.querySelector('audio');
        if (mainAudio && !mainAudio.paused) {
            window._epBgmWasPlaying = true;
            mainAudio.pause();
        }

        // 创建临时 Howl 用于试听
        if (typeof Howl !== 'undefined') {
            bgmPreviewHowl = new Howl({
                src: [bgm.url],
                html5: true,
                volume: 0.6,
                onend: function () { this.unload(); bgmPreviewHowl = null; }
            });
            bgmPreviewHowl.play();
        } else {
            // fallback: 直接用主 Audio 切换
            if (mainAudio) {
                mainAudio.src = bgm.url;
                mainAudio.play().catch(() => {});
            }
        }
    }

    function stopPreview() {
        if (bgmPreviewHowl) {
            bgmPreviewHowl.unload();
            bgmPreviewHowl = null;
        }
        // 恢复主 BGM
        if (window._epBgmWasPlaying) {
            const mainAudio = document.getElementById('bgmAudio') || document.querySelector('audio');
            if (mainAudio) {
                mainAudio.src = BGM_LIST.find(b => b.key === currentBgmKey)?.url || '';
                mainAudio.play().catch(() => {});
            }
            window._epBgmWasPlaying = false;
        }
    }

    // ─── 确认选择 BGM ──────────────────────────
    function selectBgm(key) {
        stopPreview();
        applyBgm(key);
        renderBgmPanel();
    }

    // ─── 打开/关闭面板 ──────────────────────────
    function toggle() {
        if (!panelEl) createPanel();
        const visible = panelEl.style.display === 'flex';
        if (visible) {
            close();
        } else {
            open();
        }
    }

    function open() {
        if (!panelEl) createPanel();
        panelEl.style.display = 'flex';
        renderBgPanel();
        renderBgmPanel();
        switchTab('bg');
    }

    function close() {
        stopPreview();
        if (panelEl) panelEl.style.display = 'none';
    }

    // ─── 创建面板 DOM ──────────────────────────
    function createPanel() {
        if (document.getElementById('epCustomPanel')) return;

        const html = `
        <div id="epCustomPanel" class="ep-custom-panel">
            <div class="ep-custom-overlay" id="epCustomOverlay"></div>
            <div class="ep-custom-sheet">
                <div class="ep-custom-header">
                    <h2><i class="fa-solid fa-palette"></i> ${t('epilogue.custom_scene')}</h2>
                    <button id="epCustomClose" class="ep-custom-close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <!-- Tab 切换 -->
                <div class="ep-custom-tabs">
                    <button class="ep-custom-tab active" data-tab="bg">
                        <i class="fa-solid fa-image"></i> ${t('epilogue.tab_bg')}
                    </button>
                    <button class="ep-custom-tab" data-tab="bgm">
                        <i class="fa-solid fa-music"></i> ${t('epilogue.tab_music')}
                    </button>
                    <button class="ep-custom-tab" data-tab="sprite">
                        <i class="fa-solid fa-user"></i> ${t('epilogue.tab_sprite')}
                    </button>
                    <button class="ep-custom-tab" data-tab="gaze">
                        <i class="fa-solid fa-eye"></i> ${t('epilogue.tab_gaze')}
                    </button>
                </div>

                <!-- 当前选中信息 -->
                <div class="ep-custom-current" id="epCustomCurrent"></div>

                <!-- 背景网格 -->
                <div class="ep-custom-body" id="epCustomBgBody"></div>

                <!-- 音乐列表 -->
                <div class="ep-custom-body" id="epCustomBgmBody" style="display:none;"></div>

                <!-- 立绘网格 -->
                <div class="ep-custom-body" id="epCustomSpriteBody" style="display:none;"></div>

                <!-- 视线追踪设置 -->
                <div class="ep-custom-body" id="epCustomGazeBody" style="display:none;"></div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
        panelEl = document.getElementById('epCustomPanel');

        // 事件绑定
        document.getElementById('epCustomClose').addEventListener('click', close);
        document.getElementById('epCustomOverlay').addEventListener('click', close);

        panelEl.querySelectorAll('.ep-custom-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                switchTab(tab.dataset.tab);
            });
        });
    }

    function switchTab(tab) {
        panelEl.querySelectorAll('.ep-custom-tab').forEach(function(t) {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        var bgBody     = document.getElementById('epCustomBgBody');
        var bgmBody    = document.getElementById('epCustomBgmBody');
        var spriteBody = document.getElementById('epCustomSpriteBody');
        var gazeBody   = document.getElementById('epCustomGazeBody');
        if (bgBody)     bgBody.style.display     = tab === 'bg'     ? '' : 'none';
        if (bgmBody)    bgmBody.style.display    = tab === 'bgm'    ? '' : 'none';
        if (spriteBody) spriteBody.style.display = tab === 'sprite' ? '' : 'none';
        if (gazeBody)   gazeBody.style.display   = tab === 'gaze'   ? '' : 'none';
        if (tab === 'bg')     renderBgPanel();
        if (tab === 'bgm')    renderBgmPanel();
        if (tab === 'sprite') renderSpritePanel();
        if (tab === 'gaze')   renderGazePanel();
    }

    // ─── 渲染背景网格 ──────────────────────────
    function renderBgPanel() {
        const body = document.getElementById('epCustomBgBody');
        const cur  = document.getElementById('epCustomCurrent');
        if (!body) return;

        const current = BG_LIST.find(b => b.key === currentBgKey);
        if (cur) {
            cur.innerHTML = `${t('epilogue.current_bg')}<strong>${current?.name || '—'}</strong>
                <span class="ep-custom-current-preview" style="background-image:url('${current?.url || ''}')"></span>`;
        }

        body.innerHTML = BG_LIST.map(bg => {
            const isActive = bg.key === currentBgKey;
            return `
            <div class="ep-custom-bg-card ${isActive ? 'active' : ''}"
                 data-bg-key="${bg.key}"
                 style="background-image:url('${bg.url}')">
                <div class="ep-custom-bg-card-overlay">
                    <span class="ep-custom-bg-card-name">${bg.name}</span>
                    ${isActive ? '<span class="ep-custom-bg-card-check">' + t('epilogue.active') + '</span>' : ''}
                </div>
            </div>`;
        }).join('');

        // 绑定点击
        body.querySelectorAll('.ep-custom-bg-card').forEach(card => {
            card.addEventListener('click', () => {
                const key = card.dataset.bgKey;
                applyBg(key);
                renderBgPanel();
            });
        });
    }

    // ─── 渲染音乐列表 ──────────────────────────
    function renderBgmPanel() {
        const body = document.getElementById('epCustomBgmBody');
        const cur  = document.getElementById('epCustomCurrent');
        if (!body) return;

        const current = BGM_LIST.find(b => b.key === currentBgmKey);
        const vol = Math.round(getVolume() * 100);

        // 顶部：当前信息 + 音量滑块
        const headerHTML = `
            <div class="ep-custom-bgm-header">
                <div class="ep-custom-bgm-vol">
                    <label><i class="fa-solid fa-volume-high"></i> BGM 音量</label>
                    <input type="range" id="epBgmVolumeSlider" min="0" max="100" value="${vol}" class="ep-custom-vol-slider">
                    <span id="epBgmVolumeVal">${vol}%</span>
                </div>
            </div>`;

        body.innerHTML = headerHTML + BGM_LIST.map(bgm => {
            const isActive = bgm.key === currentBgmKey;
            return `
            <div class="ep-custom-bgm-row ${isActive ? 'active' : ''}" data-bgm-key="${bgm.key}">
                <span class="ep-custom-bgm-icon">🎵</span>
                <span class="ep-custom-bgm-name">${bgm.name}</span>
                <span class="ep-custom-bgm-file">${bgm.url}</span>
                <div class="ep-custom-bgm-actions">
                    <button class="ep-custom-bgm-btn preview" data-action="preview" data-bgm-key="${bgm.key}">
                        <i class="fa-solid fa-play"></i> 试听
                    </button>
                    <button class="ep-custom-bgm-btn select" data-action="select" data-bgm-key="${bgm.key}">
                        ${isActive ? t('epilogue.active') : t('epilogue.select')}
                    </button>
                </div>
            </div>`;
        }).join('');

        if (cur) {
            cur.innerHTML = `${t('epilogue.current_music_info').replace('{0}', '<strong>'+current?.name).replace('{1}', '<strong>'+vol)}${current?.name || '—'}</strong> | 音量：<strong>${vol}%</strong>`;
        }

        // 音量滑块事件
        const slider = document.getElementById('epBgmVolumeSlider');
        const valEl  = document.getElementById('epBgmVolumeVal');
        if (slider && valEl) {
            slider.addEventListener('input', () => {
                const v = parseInt(slider.value) / 100;
                setVolume(v);
                valEl.textContent = slider.value + '%';
                if (cur) {
                    cur.innerHTML = `${t('epilogue.current_music_info').replace('{0}', '<strong>'+current?.name).replace('{1}', '<strong>'+vol)}${current?.name || '—'}</strong> | 音量：<strong>${slider.value}%</strong>`;
                }
            });
        }

        // 绑定点击
        body.querySelectorAll('.ep-custom-bgm-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const key  = btn.dataset.bgmKey;
                const action = btn.dataset.action;
                if (action === 'preview') {
                    previewBgm(key);
                } else if (action === 'select') {
                    selectBgm(key);
                }
            });
        });

        body.querySelectorAll('.ep-custom-bgm-row').forEach(row => {
            row.addEventListener('click', () => {
                selectBgm(row.dataset.bgmKey);
            });
        });
    }

    // ─── 渲染立绘网格 ──────────────────────────
    function renderSpritePanel() {
        var body = document.getElementById('epCustomSpriteBody');
        var cur  = document.getElementById('epCustomCurrent');
        if (!body) return;

        var current = SPRITE_LIST.find(function(s) { return s.key === currentSpriteKey; });
        if (cur) {
            cur.innerHTML = t('epilogue.current_sprite') + '<strong>' + (current ? current.name : '—') + '</strong>';
        }

        body.innerHTML = SPRITE_LIST.map(function(sprite) {
            var isActive = sprite.key === currentSpriteKey;
            var size = 'width:100%;height:100px;object-fit:contain;object-position:center;';
            return '<div class="ep-custom-sprite-card' + (isActive ? ' active' : '') + '" data-sprite-key="' + sprite.key + '">' +
                '<img src="' + sprite.url + '" style="' + size + 'display:block;margin:0 auto;" alt="' + sprite.name + '">' +
                '<div class="ep-custom-sprite-name">' + sprite.name + '</div>' +
                (isActive ? '<div class="ep-custom-sprite-check">' + t('epilogue.active') + '</div>' : '') +
                '</div>';
        }).join('');

        body.querySelectorAll('.ep-custom-sprite-card').forEach(function(card) {
            card.addEventListener('click', function() {
                var key = card.dataset.spriteKey;
                applySprite(key);
                // Also update the ep-ui sprite map so AI emotions still work
                if (typeof EpilogueUI !== 'undefined' && EpilogueUI.updateSprite) {
                    EpilogueUI.updateSprite(key);
                }
                renderSpritePanel();
            });
        });
    }

    // ─── 获取当前设置 ──────────────────────────
    function getCurrentBg()  { return currentBgKey; }
    function getCurrentBgm() { return currentBgmKey; }
    function getCurrentSprite() { return currentSpriteKey; }

    // ─── 渲染视线追踪面板 ──────────────────────
    function renderGazePanel() {
        var body = document.getElementById('epCustomGazeBody');
        var cur  = document.getElementById('epCustomCurrent');
        if (!body) return;

        var currentMode = 'mouse';
        var cameraActive = false;
        var statusText = '';
        var statusClass = '';
        if (typeof EpilogueGaze !== 'undefined') {
            currentMode = EpilogueGaze.getMode();
            cameraActive = EpilogueGaze.isCameraActive();
            var st = EpilogueGaze.getStatus();
            var err = EpilogueGaze.getError();
            if (st === 'tracking')      { statusText = '✅ Tracking'; statusClass = 'gaze-status-ok'; }
            else if (st === 'loading')  { statusText = '⏳ 正在加载追踪模型...'; statusClass = 'gaze-status-loading'; }
            else if (st === 'error')    { statusText = '❌ ' + (err || '加载失败'); statusClass = 'gaze-status-error'; }
            else if (st === 'ready')    { statusText = '📷 摄像头已就绪，等待开启追踪'; statusClass = 'gaze-status-ready'; }
            else                        { statusText = ''; statusClass = ''; }
        }

        if (cur) {
            var modeLabel = currentMode === 'camera' ? t('epilogue.gaze_camera') : (currentMode === 'mouse' ? '🖱️ ' + t('epilogue.gaze_mouse') : '🚫 ' + t('epilogue.gaze_off'));
            cur.innerHTML = t('epilogue.gaze_tracking') + '<strong>' + modeLabel + '</strong>' +
                (statusText ? ' · <span class="' + statusClass + '">' + statusText + '</span>' : '');
        }

        // ── Build HTML ──
        var html = '<div class="ep-gaze-section">';

        // Mode radio buttons
        html += '<div class="ep-gaze-mode-list">';

        html += '<label class="ep-gaze-mode-card' + (currentMode === 'off' ? ' active' : '') + '">' +
            '<input type="radio" name="epGazeMode" value="off"' + (currentMode === 'off' ? ' checked' : '') + '>' +
            '<span class="ep-gaze-mode-icon">🚫</span>' +
            '<span class="ep-gaze-mode-label">' + t('epilogue.gaze_off') + '</span>' +
            '<span class="ep-gaze-mode-desc">角色眼球保持默认动画</span>' +
            '</label>';

        html += '<label class="ep-gaze-mode-card' + (currentMode === 'mouse' ? ' active' : '') + '">' +
            '<input type="radio" name="epGazeMode" value="mouse"' + (currentMode === 'mouse' ? ' checked' : '') + '>' +
            '<span class="ep-gaze-mode-icon">🖱️</span>' +
            '<span class="ep-gaze-mode-label">' + t('epilogue.gaze_mouse') + '</span>' +
            '<span class="ep-gaze-mode-desc">眼球跟随鼠标移动（默认）</span>' +
            '</label>';

        html += '<label class="ep-gaze-mode-card' + (currentMode === 'camera' ? ' active' : '') + '">' +
            '<input type="radio" name="epGazeMode" value="camera"' + (currentMode === 'camera' ? ' checked' : '') + '>' +
            '<span class="ep-gaze-mode-icon">📷</span>' +
            '<span class="ep-gaze-mode-label">' + t('epilogue.gaze_camera') + '</span>' +
            '<span class="ep-gaze-mode-desc">' + t('epilogue.gaze_camera') + '</span>' +
            '</label>';

        html += '</div>'; // ep-gaze-mode-list

        // ── Camera section: only show controls when camera is ACTUALLY running ──
        if (currentMode === 'camera') {
            html += '<div class="ep-gaze-camera-section">';

            if (statusText) {
                html += '<div class="ep-gaze-status-bar ' + statusClass + '">' + statusText + '</div>';
            }

            // ★ 仅摄像头已激活时才显示预览按钮
            if (cameraActive) {
                var previewVisible = false;
                if (typeof EpilogueGaze !== 'undefined') {
                    previewVisible = EpilogueGaze.isPreviewVisible();
                }
                html += '<button class="ep-setting-api-btn ep-gaze-preview-btn" id="epGazePreviewToggle"' +
                    ' data-preview-visible="' + previewVisible + '">' +
                    '<i class="fa-solid fa-' + (previewVisible ? 'eye-slash' : 'camera') + '"></i> ' +
                    (previewVisible ? t('epilogue.camera_hide') : t('epilogue.camera_show')) + '</button>';
            } else if (statusClass === 'gaze-status-loading') {
                html += '<div class="ep-gaze-status-bar gaze-status-loading">' +
                    '<i class="fa-solid fa-spinner fa-spin"></i> ' + t('epilogue.camera_loading') + '</div>';
            }

            html += '<p class="ep-gaze-hint">' +
                '💡 ' + t('epilogue.camera_privacy') + '<br>' +
                '请确保面部光线充足，正对摄像头以获得最佳追踪效果。</p>';

            html += '</div>'; // ep-gaze-camera-section
        } else if (currentMode === 'mouse') {
            html += '<p class="ep-gaze-hint">💡 鼠标追踪为默认模式。角色眼球会跟随鼠标在画面中的位置移动。</p>';
        } else {
            html += '<p class="ep-gaze-hint">💡 关闭追踪后，角色眼球将保持默认的呼吸和眨眼动画。</p>';
        }

        html += '</div>'; // ep-gaze-section

        body.innerHTML = html;

        // ── Bind radio change events ──
        body.querySelectorAll('input[name="epGazeMode"]').forEach(function(radio) {
            radio.addEventListener('change', function() {
                var mode = this.value;
                if (typeof EpilogueGaze !== 'undefined') {
                    // ★ 立即重绘显示 loading 状态
                    renderGazePanel();
                    EpilogueGaze.setMode(mode).then(function(ok) {
                        renderGazePanel(); // 完成后再次重绘显示最终状态
                    });
                }
            });
        });

        // ── Bind preview button (only exists when camera is active) ──
        var previewBtn = document.getElementById('epGazePreviewToggle');
        if (previewBtn) {
            previewBtn.addEventListener('click', function(e) {
                e.preventDefault();
                if (typeof EpilogueGaze !== 'undefined') {
                    EpilogueGaze.toggleCameraPreview();
                    // Update button icon + text to reflect new state
                    var nowVisible = EpilogueGaze.isPreviewVisible();
                    this.setAttribute('data-preview-visible', nowVisible);
                    var icon = this.querySelector('i');
                    if (icon) icon.className = 'fa-solid fa-' + (nowVisible ? 'eye-slash' : 'camera');
                    // Keep the icon element, replace text node
                    var textNode = this.childNodes[this.childNodes.length - 1];
                    if (textNode && textNode.nodeType === 3) {
                        textNode.textContent = nowVisible ? ' ' + t('epilogue.camera_hide') : ' ' + t('epilogue.camera_show');
                    }
                }
            });
        }
    }

    return {
        init: init, toggle: toggle, open: open, close: close,
        getCurrentBg: getCurrentBg, getCurrentBgm: getCurrentBgm, getCurrentSprite: getCurrentSprite,
        applyBg: applyBg, applyBgm: applyBgm, applySprite: applySprite,
        getVolume: getVolume, setVolume: setVolume
    };
})();
