/**
 * ep-ui.js — 后日谈 UI 层
 * typing buffer + settings panel
 */

const EpilogueUI = (() => {
    let container = null, inputArea = null, sendBtn = null;
    let topicsBtn = null, topicsPopover = null;
    let chatLog = null, thinkingInd = null, apiKeyModal = null;
    let settingsPanel = null;
    let resetBtn = null, exitBtn = null, ttsToggle = null, settingsBtn = null, exportBtn = null, regenerateBtn = null;
    let usageBar = null;
    let gameWrapper = null, bgLayer = null, characterSprite = null, dialogArea = null;
    let bgmAudio = null, isStandalone = false;

    function init() {
        gameWrapper     = document.getElementById('gameWrapper');
        bgLayer         = document.getElementById('bgLayer');
        characterSprite = document.getElementById('characterSprite');
        dialogArea      = document.getElementById('dialogArea');
        isStandalone    = (!document.getElementById('actionBar') && !document.getElementById('nextBtn'));
        bgmAudio        = document.getElementById('bgmAudio') || document.querySelector('audio');
        createEpilogueDOM();
        hideGameUI();
        setDefaultBackground();
        setDefaultSprite();
        if (isStandalone) playDefaultBGM();  // 后日谈独立页面始终播放 BGM
        // Restore Live2D toggle state from storage
        _live2dEnabled = localStorage.getItem('epilogue_live2d_enabled') !== 'false'; // default=true
        var l2dIcon = document.getElementById('epLive2dToggleIcon');
        var l2dLabel = document.getElementById('epLive2dToggleLabel');
        if (!_live2dEnabled) {
            if (l2dIcon) l2dIcon.className = 'fa-solid fa-toggle-off';
            if (l2dLabel) l2dLabel.textContent = '静态立绘';
        }
        console.log('[EpilogueUI] 初始化完成 | 模式:', isStandalone ? 'standalone' : 'embedded', '| Live2D:', _live2dEnabled);
    }

    function createEpilogueDOM() {
        if (document.getElementById('epilogueContainer')) return;
        const html = `
        <div id="epilogueContainer">
            <div id="epChatLog" class="ep-chat-log"></div>
            <div id="epThinking" class="ep-thinking" style="display:none;">
                <span class="ep-thinking-dot"></span><span class="ep-thinking-dot"></span><span class="ep-thinking-dot"></span>
            </div>
            <div id="epInputArea" class="ep-input-area">
                <div class="ep-topics-wrapper">
                    <button id="epTopicsBtn" class="ep-topics-btn" title="快捷话题"><i class="fa-solid fa-comments"></i></button>
                    <div id="epTopicsPopover" class="ep-topics-popover" style="display:none;"></div>
                </div>
                <input type="text" id="epMessageInput" class="ep-message-input" placeholder="输入消息……" maxlength="200" autocomplete="off">
                <button id="epSendBtn" class="ep-send-btn"><i class="fa-solid fa-paper-plane"></i></button>
            </div>
            <div id="epToolbar" class="ep-toolbar">
                <button id="epTtsToggle" class="ep-tool-btn" title="${t('epilogue.settings_title')}"><i class="fa-solid fa-volume-high"></i></button>
                <button id="epRegenerateBtn" class="ep-tool-btn" title="重新生成回复"><i class="fa-solid fa-rotate-left"></i></button>
                <button id="epExportBtn" class="ep-tool-btn" title="Export"><i class="fa-solid fa-download"></i></button>
                <button id="epSettingsBtn" class="ep-tool-btn" title="${t('nav.settings')}"><i class="fa-solid fa-sliders"></i>${t('nav.settings')}</button>
                <button id="epResetBtn" class="ep-tool-btn" title="Reset"><i class="fa-solid fa-rotate-right"></i></button>
                <button id="epExitBtn" class="ep-tool-btn" title="${t('epilogue.return_game')}"><i class="fa-solid fa-door-open"></i>${t('epilogue.return_game')}</button>
            </div>
            <div id="epUsageBar" class="ep-usage-bar" title="本会话累计 token 量"></div>
            <!-- 设置面板 -->
            <div id="epSettingsPanel" class="ep-settings-panel" style="display:none;">
                <div class="ep-settings-panel-header">
                    <span>⚙️ ${t('epilogue.settings_title')}</span>
                    <button id="epSettingsClose" class="ep-settings-close-btn">&times;</button>
                </div>
                <div class="ep-settings-panel-body">
                    <div class="ep-setting-row">
                        <label><i class="fa-solid fa-gauge-high"></i>${t('epilogue.typing_speed')}</label>
                        <div class="ep-setting-slider-wrap">
                            <input type="range" id="epTypingSpeed" min="15" max="120" step="5" value="55">
                            <span id="epTypingSpeedVal">55ms</span>
                        </div>
                        <div class="ep-setting-hint">${t('epilogue.speed_slow')} ← → ${t('epilogue.speed_fast')}</div>
                    </div>
                    <div class="ep-setting-row">
                        <label><i class="fa-solid fa-volume-high"></i>${t('epilogue.bgm_vol')}</label>
                        <div class="ep-setting-slider-wrap">
                            <input type="range" id="epBgmVolSlider" min="0" max="100" step="5" value="50">
                            <span id="epBgmVolVal">50%</span>
                        </div>
                    </div>
                    <div class="ep-setting-row">
                        <label><i class="fa-solid fa-microphone"></i>${t('epilogue.voice_vol')}</label>
                        <div class="ep-setting-slider-wrap">
                            <input type="range" id="epTtsVolSlider" min="0" max="100" step="5" value="80">
                            <span id="epTtsVolVal">80%</span>
                        </div>
                    </div>
                    <div class="ep-setting-row">
                        <label><i class="fa-solid fa-user"></i>${t('epilogue.rendering')}</label>
                        <button id="epLive2dToggle" class="ep-setting-api-btn" style="width:auto;padding:8px 20px;margin-top:4px;">
                            <i class="fa-solid fa-toggle-on" id="epLive2dToggleIcon"></i>
                            <span id="epLive2dToggleLabel">Live2D 已启用</span>
                        </button>
                        <div class="ep-setting-hint">切换为静态立绘 / Live2D 模型</div>
                    </div>
                    <div class="ep-setting-divider"></div>
                    <button id="epOpenApiKeyBtn" class="ep-setting-api-btn">
                        <i class="fa-solid fa-key"></i> DeepSeek API Key 设置
                    </button>
                </div>
            </div>
            <!-- API Key 弹窗 -->
            <div id="epApiKeyModal" class="ep-modal" style="display:none;">
                <div class="ep-modal-content">
                    <h3>🔑 ${t('epilogue.api_title')}</h3>
                    <p style="font-size:14px;color:#888;margin-bottom:12px;">
                        ${t('epilogue.api_info')}<br>
                        <a href="https://platform.deepseek.com/api_keys" target="_blank" style="color:#4a90d9;">${t('epilogue.api_link')}</a>
                    </p>
                    <input type="password" id="epApiKeyInput" class="ep-input" placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                           style="width:100%;padding:10px;font-size:14px;margin-bottom:12px;">
                    <button id="epApiKeyConfirm" class="ep-btn-primary">确认</button>
                    <p id="epApiKeyError" style="color:#e74c3c;font-size:13px;display:none;"></p>
                </div>
            </div>
        </div>`;
        const insertAfter = gameWrapper || dialogArea;
        if (insertAfter) { insertAfter.insertAdjacentHTML('afterend', html); }
        else { document.body.insertAdjacentHTML('beforeend', html); }
        container     = document.getElementById('epilogueContainer');
        inputArea     = document.getElementById('epMessageInput');
        sendBtn       = document.getElementById('epSendBtn');
        topicsBtn     = document.getElementById('epTopicsBtn');
        topicsPopover = document.getElementById('epTopicsPopover');
        chatLog       = document.getElementById('epChatLog');
        thinkingInd   = document.getElementById('epThinking');
        apiKeyModal   = document.getElementById('epApiKeyModal');
        settingsPanel = document.getElementById('epSettingsPanel');
        settingsBtn   = document.getElementById('epSettingsBtn');
        resetBtn      = document.getElementById('epResetBtn');
        exitBtn       = document.getElementById('epExitBtn');
        ttsToggle     = document.getElementById('epTtsToggle');
        exportBtn     = document.getElementById('epExportBtn');
        regenerateBtn = document.getElementById('epRegenerateBtn');
        usageBar      = document.getElementById('epUsageBar');
        bindEvents();
        initTypingSpeed();
        initSettingsSliders();
    }

    // ═══════ 事件绑定 ═══════
    function bindEvents() {
        sendBtn.addEventListener('click', () => { const m = inputArea.value.trim(); if (m) { EpilogueEngine.sendMessage(m); inputArea.value = ''; } });
        inputArea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const m = inputArea.value.trim(); if (m) { EpilogueEngine.sendMessage(m); inputArea.value = ''; } } });
        document.getElementById('epApiKeyConfirm').addEventListener('click', () => {
            const key = document.getElementById('epApiKeyInput').value.trim();
            const errEl = document.getElementById('epApiKeyError');
            if (!key || !key.startsWith('sk-')) { errEl.textContent = t('epilogue.api_invalid_format'); errEl.style.display = 'block'; return; }
            errEl.style.display = 'none'; EpilogueEngine.setApiKey(key);
        });
        ttsToggle.addEventListener('click', () => {
            const on = EpilogueTTS.toggle();
            ttsToggle.innerHTML = on ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
        });
        resetBtn.addEventListener('click', () => { if (confirm(t('epilogue.reset_confirm'))) EpilogueEngine.reset(); });
        settingsBtn.addEventListener('click', () => toggleSettings());
        document.getElementById('epSettingsClose').addEventListener('click', () => { if (settingsPanel) settingsPanel.style.display = 'none'; });
        document.getElementById('epOpenApiKeyBtn').addEventListener('click', () => showApiKeyPrompt());
        exitBtn.addEventListener('click', () => {
            if (confirm('返回游戏主界面？')) {
                EpilogueEngine.destroy();
                if (isStandalone) window.location.href = 'index.html';
                else { container.style.display = 'none'; restoreGameUI(); }
            }
        });
        topicsBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleTopicsPopover(); });
        document.addEventListener('click', (e) => { if (topicsPopover && topicsPopover.style.display !== 'none' && !topicsPopover.contains(e.target) && e.target !== topicsBtn) { topicsPopover.style.display = 'none'; } });

        // Live2D toggle
        var l2dBtn = document.getElementById('epLive2dToggle');
        if (l2dBtn) l2dBtn.addEventListener('click', function() { toggleLive2D(); });

        // ★ ESC 关闭所有面板
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;
            // 关闭设置面板
            if (settingsPanel && settingsPanel.style.display === 'block') {
                settingsPanel.style.display = 'none'; return;
            }
            // 关闭 API Key 弹窗
            if (apiKeyModal && apiKeyModal.style.display === 'flex') {
                apiKeyModal.style.display = 'none'; return;
            }
            // 关闭话题弹出
            if (topicsPopover && topicsPopover.style.display === 'block') {
                topicsPopover.style.display = 'none'; return;
            }
            // 关闭自定义面板
            if (typeof EpilogueCustomize !== 'undefined' && typeof EpilogueCustomize.close === 'function') {
                EpilogueCustomize.close();
            }
        });

        // ★ 移动端虚拟键盘适配
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', function() {
                if (document.activeElement === inputArea) {
                    setTimeout(function() { scrollToBottom(); }, 200);
                }
            });
        }

        // ★ 导出对话
        if (exportBtn) exportBtn.addEventListener('click', function() { exportChat(); });

        // ★ 重新生成
        if (regenerateBtn) regenerateBtn.addEventListener('click', function() {
            if (typeof EpilogueEngine !== 'undefined') EpilogueEngine.regenerate();
        });
    }

    // ═══════ Live2D 切换 ═══════
    var _live2dEnabled = true;
    function toggleLive2D() {
        _live2dEnabled = !_live2dEnabled;
        var icon = document.getElementById('epLive2dToggleIcon');
        var label = document.getElementById('epLive2dToggleLabel');
        if (_live2dEnabled) {
            // Enable Live2D
            if (typeof EpilogueLive2D !== 'undefined') {
                EpilogueLive2D.init('live2d/models/Haru/Haru.model3.json');
            }
            if (icon) icon.className = 'fa-solid fa-toggle-on';
            if (label) label.textContent = t('epilogue.live2d_enabled');
            var cs = document.getElementById('live2dCanvas');
            if (cs) cs.style.display = '';
            var si = document.getElementById('characterSprite');
            if (si) si.style.display = 'none';
        } else {
            // Disable Live2D → static sprite
            if (typeof EpilogueLive2D !== 'undefined') EpilogueLive2D.destroy();
            if (icon) icon.className = 'fa-solid fa-toggle-off';
            if (label) label.textContent = '静态立绘';
            // Show static sprite
            var si2 = document.getElementById('characterSprite');
            if (si2) { si2.style.display = ''; applyStoredSprite(); }
        }
        localStorage.setItem('epilogue_live2d_enabled', _live2dEnabled.toString());
    }

    function applyStoredSprite() {
        var si = document.getElementById('characterSprite');
        if (!si) return;
        var key = localStorage.getItem('epilogue_sprite') || 'normal';
        updateSprite(key);
    }

    function toggleSettings() {
        if (!settingsPanel) return;
        const isOpen = settingsPanel.style.display === 'block';
        if (!isOpen) refreshSliders();
        settingsPanel.style.display = isOpen ? 'none' : 'block';
    }

    // ═══════ 设置滑块初始化 ═══════
    function initSettingsSliders() {
        // 打字速度
        const speedSlider = document.getElementById('epTypingSpeed');
        const speedVal    = document.getElementById('epTypingSpeedVal');
        if (speedSlider && speedVal) {
            speedSlider.addEventListener('input', () => {
                typingSpeed = parseInt(speedSlider.value);
                speedVal.textContent = typingSpeed + 'ms/字';
                localStorage.setItem('ep_typing_speed', typingSpeed.toString());
            });
        }
        // BGM 音量
        const bgmSlider = document.getElementById('epBgmVolSlider');
        const bgmVal    = document.getElementById('epBgmVolVal');
        if (bgmSlider && bgmVal) {
            bgmSlider.addEventListener('input', () => {
                const v = parseInt(bgmSlider.value) / 100;
                bgmVal.textContent = bgmSlider.value + '%';
                localStorage.setItem('epilogue_bgm_volume', v.toString());
                const a = document.getElementById('bgmAudio') || document.querySelector('audio');
                if (a) a.volume = v;
            });
        }
        // TTS 音量
        const ttsSlider = document.getElementById('epTtsVolSlider');
        const ttsVal    = document.getElementById('epTtsVolVal');
        if (ttsSlider && ttsVal) {
            ttsSlider.addEventListener('input', () => {
                const v = parseInt(ttsSlider.value) / 100;
                ttsVal.textContent = ttsSlider.value + '%';
                EpilogueTTS.setVolume(v);
            });
        }
    }

    function refreshSliders() {
        const ss = document.getElementById('epTypingSpeed');
        const sv = document.getElementById('epTypingSpeedVal');
        if (ss && sv) { ss.value = typingSpeed; sv.textContent = typingSpeed + 'ms/字'; }
        const bs = document.getElementById('epBgmVolSlider');
        const bv = document.getElementById('epBgmVolVal');
        if (bs && bv) {
            const vol = Math.round((parseFloat(localStorage.getItem('epilogue_bgm_volume') || '0.5')) * 100);
            bs.value = vol; bv.textContent = vol + '%';
        }
        const ts2 = document.getElementById('epTtsVolSlider');
        const tv  = document.getElementById('epTtsVolVal');
        if (ts2 && tv) {
            const vol = Math.round(EpilogueTTS.getVolume ? EpilogueTTS.getVolume() * 100 : 80);
            ts2.value = vol; tv.textContent = vol + '%';
        }
    }

    // ═══════ 打字速度 & 缓冲 ═══════
    let typingSpeed = 55;     // ms/字
    let typingTimer = null;   // setInterval id
    let latestText  = '';     // API 发来的最新全文
    let displayedLen = 0;     // 当前已显示字数
    let isComplete  = false;  // API 是否已结束
    let completeText = '';    // 最终完整文本（BBCode）

    function initTypingSpeed() {
        typingSpeed = parseInt(localStorage.getItem('ep_typing_speed') || '55');
        const ss = document.getElementById('epTypingSpeed');
        const sv = document.getElementById('epTypingSpeedVal');
        if (ss) ss.value = typingSpeed;
        if (sv) sv.textContent = typingSpeed + 'ms/字';
    }

    function startTyping() {
        displayedLen = 0;
        latestText   = '';
        isComplete   = false;
        completeText = '';
        if (typingTimer) clearInterval(typingTimer);
        typingTimer = setInterval(tickTyping, typingSpeed);
    }

    function tickTyping() {
        const target = BBCode.strip(latestText);
        if (displayedLen >= target.length) {
            // 如果 API 还没结束，等待更多数据
            if (isComplete) {
                clearInterval(typingTimer);
                typingTimer = null;
                finishReply();
            }
            return;
        }
        displayedLen++;
        const visible = target.substring(0, displayedLen);
        if (currentAiMsgDiv) {
            const ts = currentAiMsgDiv.querySelector('.ep-chat-text');
            if (ts) ts.textContent = visible;
            scrollToBottom();
        }
    }

    function flushTyping() {
        if (typingTimer) { clearInterval(typingTimer); typingTimer = null; }
        if (isComplete && completeText) {
            finishReply();
        }
    }

    function finishReply() {
        // 完整 BBCode HTML 替换纯文本
        if (currentAiMsgDiv && completeText) {
            const ts = currentAiMsgDiv.querySelector('.ep-chat-text');
            if (ts) {
                const r = BBCode.parse(completeText);
                ts.innerHTML = r.html;
                if (r.effects.length) {
                    console.log('[EpilogueUI] 检测到效果标签:', r.effects.join(', '));
                    setTimeout(() => BBCode.triggerEffects(r.effects), 150);
                }
            }
        }
        currentAiMsgDiv = null;
        isComplete = false;
        completeText = '';
        // 打字动画结束 → 关闭打字口型（TTS 如果还在播，stopTypingLipSync 不影响 isSpeaking）
        if (typeof EpilogueLive2D !== 'undefined' && EpilogueLive2D.isReady()) {
            EpilogueLive2D.stopTypingLipSync();
        }
    }

    // ═══════ 状态变化 ═══════
    function onStateChange(newState) {
        switch (newState) {
            case 'idle':     setInputEnabled(true);  hideThinking(); break;
            case 'thinking': setInputEnabled(false); showThinking(); break;
            case 'speaking': setInputEnabled(false); hideThinking(); break;
            case 'error':    setInputEnabled(true);  hideThinking(); break;
        }
    }

    function show() {
        if (container) container.style.display = 'flex';
        hideGameUI(); renderTopics(); showChatPlaceholder();
        if (ttsToggle) ttsToggle.innerHTML = EpilogueTTS.isEnabled() ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
        setTimeout(() => { if (inputArea) inputArea.focus(); }, 300);
    }
    function hide() { if (container) container.style.display = 'none'; }
    function destroy() { if (typingTimer) clearInterval(typingTimer); EpilogueTTS.stop(); hide(); if (!isStandalone) restoreGameUI(); }
    function hideGameUI() { const a = document.getElementById('actionBar'); const n = document.getElementById('nextBtn'); if (a) a.style.display = 'none'; if (n) n.style.display = 'none'; }
    function restoreGameUI() { const a = document.getElementById('actionBar'); const n = document.getElementById('nextBtn'); if (a) a.style.display = ''; if (n) n.style.display = ''; }
    function showApiKeyPrompt() { if (apiKeyModal) { apiKeyModal.style.display = 'flex'; const inp = document.getElementById('epApiKeyInput'); if (inp) inp.value = EpilogueAPI.getKey(); } }
    function hideApiKeyPrompt() { if (apiKeyModal) apiKeyModal.style.display = 'none'; }

    function setDefaultBackground() {
        if (!bgLayer) return;
        var bgUrl = '';
        if (typeof assetConfig !== 'undefined' && assetConfig.bg) {
            var keys = Object.keys(assetConfig.bg);
            if (keys.length > 0) bgUrl = assetConfig.bg[keys[0]];
        }
        bgLayer.style.backgroundImage = bgUrl ? "url('" + bgUrl + "')" : "linear-gradient(135deg, #2e3f2c, #1d2a1a)";
        bgLayer.style.opacity = '1';
    }
    function setDefaultSprite() {
        if (!characterSprite) return;
        var storedKey = localStorage.getItem('epilogue_sprite') || 'normal';
        updateSprite(storedKey);
    }
    // 表情→立绘映射，优先从项目 assetConfig.sprites 读取，否则为空
    var _spriteMap = {};
    (function() {
        var sprites = (typeof assetConfig !== 'undefined' && assetConfig.sprites) ? assetConfig.sprites : {};
        var emotionKeys = ['normal','Happy','shy_happy','curious','serious','sad','hesitant','shappy',
            'amazed','amazed2','rainy3','rainy_umbre','rainy2','rainy_shock','rainy_hold',
            'blouse1','blouse2','blouse_sad','blouse_amaz','blouse_think','blouse_shy','blouse_shy2'];
        emotionKeys.forEach(function(k) {
            if (sprites[k]) _spriteMap[k] = sprites[k];
        });
    })();
    function updateSprite(key) {
        var path = _spriteMap[key] || _spriteMap['normal'];
        if (characterSprite && path) { characterSprite.src = path; characterSprite.style.opacity = '1'; characterSprite.style.transform = 'scale(1.02)'; setTimeout(function() { if (characterSprite) characterSprite.style.transform = 'scale(1)'; }, 150); }
    }

    function playDefaultBGM() {
        if (!isStandalone) return;
        if (!bgmAudio) { bgmAudio = document.getElementById('bgmAudio'); }
        if (!bgmAudio) { bgmAudio = new Audio(); bgmAudio.id = 'bgmAudio'; bgmAudio.loop = true; bgmAudio.volume = parseFloat(localStorage.getItem('epilogue_bgm_volume') || '0.5'); document.body.appendChild(bgmAudio); }
        bgmAudio.src = 'BGM/8.mp3';
        bgmAudio.play().catch(() => { const r = () => { bgmAudio.play().catch(() => {}); document.removeEventListener('click', r); }; document.addEventListener('click', r, { once: true }); });
    }

    function esc(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }

    // ═══════ BBCode ═══════
    const BBCode = (() => {
        const colorMap = { red:'#f06060', pink:'#f590b0', blue:'#60a0f0', green:'#60d080', yellow:'#f5da8c', gold:'#dba541', purple:'#b080e0', white:'#fff', gray:'#a09888', orange:'#f0a040' };
        const EFFECT_TAGS = { flash:'flash', sepia:'sepia', vignette:'vignette', warm:'mood-warm', cool:'mood-cool', dark:'dark', blur:'blur', bright:'bright' };
        function _parse(text, effAcc) {
            if (!text) return ''; let r = '', i = 0;
            while (i < text.length) {
                if (text[i] === '[') {
                    const close = text.indexOf(']', i);
                    if (close === -1) { r += esc(text[i]); i++; continue; }
                    const tag = text.substring(i + 1, close), tagName = tag.split('=')[0];
                    const endTag = '[/' + tagName + ']', endIdx = text.indexOf(endTag, close + 1);
                    if (endIdx === -1) { r += esc(text[i]); i++; continue; }
                    const inner = _parse(text.substring(close + 1, endIdx), effAcc);
                    if (EFFECT_TAGS[tagName]) { if (!effAcc.includes(tagName)) effAcc.push(tagName); r += '<span class="ep-bb-effect ep-bb-eff-' + tagName + '">' + inner + '</span>'; i = endIdx + endTag.length; continue; }
                    switch (tagName) {
                        case 'b': r += '<b class="ep-bb-b">' + inner + '</b>'; break;
                        case 'i': r += '<i class="ep-bb-i">' + inner + '</i>'; break;
                        case 'shake': r += '<span class="ep-bb-shake">' + inner + '</span>'; break;
                        case 'big': r += '<span class="ep-bb-big">' + inner + '</span>'; break;
                        case 'small': r += '<span class="ep-bb-small">' + inner + '</span>'; break;
                        case 'c': const col = colorMap[tag.split('=')[1]] || tag.split('=')[1] || '#f5da8c'; r += '<span style="color:' + col + ';font-weight:700;">' + inner + '</span>'; break;
                        case 'inner': r += '<span class="ep-inner">' + inner + '</span>'; break;
                        default: r += inner;
                    }
                    i = endIdx + endTag.length;
                } else { r += esc(text[i]); i++; }
            }
            return r;
        }
        function parse(text) { const eff = []; return { html: _parse(text, eff), effects: eff }; }
        function strip(text) {
            // strip [inner]...[/inner] entirely, then strip other [] tags
            return (text || '').replace(/\[inner\][\s\S]*?\[\/inner\]/g, '').replace(/\[[^\]]*\]/g, '');
        }
        function triggerEffects(effects) {
            if (!effects || !effects.length) return;
            if (typeof EpilogueEffects === 'undefined') return;
            const mapped = effects.map(tag => {
                const e = EFFECT_TAGS[tag];
                if (e === 'flash') return { type: e, duration: 200 };
                if (e === 'blur' || e === 'sepia' || e === 'dark' || e === 'bright') return { type: e, duration: 4000 };
                return { type: e };
            });
            console.log('[BBCode] 触发画面效果:', mapped.map(m => m.type).join(', '));
            EpilogueEffects.init(); EpilogueEffects.playAll(mapped);

            // ★ 同步 Live2D 画布 mood 滤镜
            if (typeof EpilogueLive2D !== 'undefined' && EpilogueLive2D.isReady()) {
                // 取第一个 mood 型效果（跳过 flash，它自己会 auto-reset）
                var moodEffect = null;
                for (var mi = 0; mi < effects.length; mi++) {
                    var tag = effects[mi];
                    if (tag === 'warm' || tag === 'cool' || tag === 'dark' || tag === 'sepia' ||
                        tag === 'bright' || tag === 'blur' || tag === 'vignette' || tag === 'flash') {
                        moodEffect = tag;
                        break;
                    }
                }
                if (moodEffect) {
                    EpilogueLive2D.setMoodOverlay(moodEffect);
                    // 效果过期后自动清除 Live2D mood
                    var dur = (moodEffect === 'flash') ? 300 : 4500;
                    setTimeout(function() {
                        if (typeof EpilogueLive2D !== 'undefined' && EpilogueLive2D.isReady()) {
                            EpilogueLive2D.setMoodOverlay('');
                        }
                    }, dur);
                }
            }
        }
        return { parse, strip, triggerEffects, EFFECT_TAGS };
    })();

    // ═══════ 对话渲染 ═══════
    let currentAiMsgDiv = null;

    function showUserMessage(text) {
        if (!chatLog) return; removePlaceholder();
        const d = document.createElement('div');
        d.className = 'ep-chat-msg ep-chat-user';
        var playerLabel = (typeof t === 'function') ? t('epilogue.player_label') : 'You';
        d.innerHTML = '<span class="ep-chat-label">' + playerLabel + '</span><span class="ep-chat-text">' + esc(text) + '</span>';
        chatLog.appendChild(d); scrollToBottom();
    }
    function removePlaceholder() { var p = chatLog.querySelector('.ep-chat-placeholder'); if (p) p.remove(); }
    function showThinking() {
        if (thinkingInd) thinkingInd.style.display = 'flex';
        updateSprite('curious');
    }
    function hideThinking() { if (thinkingInd) thinkingInd.style.display = 'none'; }

    // 外部 API token 到达时调用
    function appendToken(_t, fullText) {
        if (!chatLog) return;
        if (!currentAiMsgDiv) {
            currentAiMsgDiv = document.createElement('div');
            currentAiMsgDiv.className = 'ep-chat-msg ep-chat-assistant';
            var charLabel = (typeof t === 'function') ? t('epilogue.char_label') : 'Character';
            currentAiMsgDiv.innerHTML = '<span class="ep-chat-label">' + charLabel + '</span><span class="ep-chat-text"></span>';
            chatLog.appendChild(currentAiMsgDiv);
            startTyping();  // 第一个 token 到达，启动打字定时器
        }
        latestText = fullText;
        scrollToBottom();
    }

    // 外部 API 流结束时调用
    function onReplyComplete(fullText) {
        isComplete = true;
        completeText = fullText;
        // 如果定时器已经停了（打字已打完），立即完成
        if (!typingTimer) finishReply();
    }
    function scrollToBottom() { if (chatLog) chatLog.scrollTop = chatLog.scrollHeight; }

    // ═══════ 输入控制 ═══════
    function setInputEnabled(enabled) {
        if (inputArea) {
            inputArea.disabled = !enabled;
            var charName = (typeof t === 'function') ? t('epilogue.char_label') : 'Character';
            inputArea.placeholder = enabled
                ? ((typeof t === 'function') ? t('epilogue.input_placeholder', charName) : ('Talk to ' + charName + '...'))
                : ((typeof t === 'function') ? t('epilogue.thinking', charName) : (charName + ' is thinking...'));
        }
        if (sendBtn) sendBtn.disabled = !enabled;
        if (topicsBtn) topicsBtn.disabled = !enabled;
    }

    // ═══════ 快捷话题 ═══════
    function toggleTopicsPopover() {
        if (!topicsPopover) return;
        if (topicsPopover.style.display === 'block') { topicsPopover.style.display = 'none'; return; }
        renderTopics(); topicsPopover.style.display = 'block';
    }
    function renderTopics() {
        if (!topicsPopover) return;
        const topics = EpilogueEngine.getQuickTopics();
        topicsPopover.innerHTML = topics.map(t =>
            '<button class="ep-topic-item" data-topic="' + esc(t.text) + '">' + esc(t.hint || t.text) + '</button>'
        ).join('');
        topicsPopover.querySelectorAll('.ep-topic-item').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); EpilogueEngine.sendMessage(btn.dataset.topic); topicsPopover.style.display = 'none'; });
        });
    }

    // ★ 移除最后一轮对话气泡（用于重新生成）
    function popLastAssistantBubble() {
        if (!chatLog) return;
        // 移除最后一个 AI 气泡
        var aiBubbles = chatLog.querySelectorAll('.ep-chat-msg.ep-chat-assistant');
        if (aiBubbles.length > 0) {
            aiBubbles[aiBubbles.length - 1].remove();
        }
        // 移除最后一个用户气泡（配对的上一条用户消息）
        var userBubbles = chatLog.querySelectorAll('.ep-chat-msg.ep-chat-user');
        if (userBubbles.length > 0) {
            userBubbles[userBubbles.length - 1].remove();
        }
        currentAiMsgDiv = null;
        if (typingTimer) { clearInterval(typingTimer); typingTimer = null; }
        isComplete = false;
        completeText = '';
    }

    function showError(error) {
        if (!chatLog) return; const d = document.createElement('div'); d.className = 'ep-chat-msg ep-chat-error';
        let msg = t('epilogue.error_generic');
        if (error.message === 'NO_API_KEY') { msg = t('epilogue.error_no_key'); showApiKeyPrompt(); }
        else if (error.message === 'INVALID_API_KEY') { msg = t('epilogue.error_invalid_key'); showApiKeyPrompt(); }
        d.innerHTML = '<span class="ep-chat-text">⚠️ ' + esc(msg) + '</span>'; chatLog.appendChild(d); scrollToBottom();
    }
    function reset() { if (chatLog) { chatLog.innerHTML = ''; showChatPlaceholder(); } currentAiMsgDiv = null; completeText = ''; isComplete = false; setDefaultSprite(); if (inputArea) inputArea.value = ''; }

    // ═══════ Token 用量显示 ═══════
    function updateUsageBar() {
        if (!usageBar) return;
        var u = EpilogueAPI.getUsage();
        var total = u.prompt + u.completion;
        if (total === 0) { usageBar.innerHTML = ''; return; }
        var costEst = (u.prompt * 0.14 + u.completion * 0.28) / 1000000; // DeepSeek 价格: ¥0.14/M 输入, ¥0.28/M 输出
        usageBar.innerHTML =
            '<span title="输入 token">📥 ' + _fmtTok(u.prompt) + '</span>' +
            '<span title="输出 token">📤 ' + _fmtTok(u.completion) + '</span>' +
            '<span title="调用次数">🔗 ' + u.calls + '次</span>' +
            '<span title="预估费用" style="margin-left:auto;">≈¥' + costEst.toFixed(4) + '</span>';
    }
    function _fmtTok(n) { return n >= 1000 ? (n/1000).toFixed(1) + 'k' : n; }

    function showChatPlaceholder() {
        if (!chatLog) return;
        var d = document.createElement('div');
        d.className = 'ep-chat-placeholder';
        var charName = (typeof t === 'function') ? t('epilogue.char_label') : 'Character';
        d.innerHTML = '<div class="ep-chat-placeholder-text">' + ((typeof t === 'function') ? t('epilogue.chat_placeholder', charName) : ('What would you like to talk about with ' + charName + '?')) + '</div>';
        chatLog.appendChild(d);
    }

    // ═══════ 对话导出 ═══════
    function exportChat() {
        if (!chatLog) return;
        var messages = chatLog.querySelectorAll('.ep-chat-msg');
        if (!messages.length) { showEpToast('没有可导出的对话记录'); return; }

        var dateStr = new Date().toLocaleString();
        var dateFile = new Date().toISOString().slice(0, 10);
        var msgCount = messages.length;
        var userCount = chatLog.querySelectorAll('.ep-chat-user').length;
        var charaCount = msgCount - userCount;

        // ── 纯文本版 ──
        var txtLines = [
            '🍂 Ginkgo Engine · Epilogue Conversation',
            '导出时间: ' + dateStr,
            '对话数: ' + msgCount + '（你: ' + userCount + '，角色: ' + charaCount + '）',
            '═'.repeat(40), ''
        ];
        messages.forEach(function(msg) {
            var label = msg.querySelector('.ep-chat-label');
            var text = msg.querySelector('.ep-chat-text');
            if (label && text) {
                txtLines.push(label.textContent + ': ' + text.textContent);
                txtLines.push('');
            }
        });

        // ── 美观 HTML 版 ──
        var htmlLines = [
            '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
            '<title>后日谈 · 对话记录</title>',
            '<style>',
            'body{max-width:720px;margin:40px auto;padding:0 20px;font-family:"Noto Serif SC",serif;background:#1a1612;color:#e0d8ce;line-height:2;}',
            'h1{text-align:center;color:#dba541;font-family:"ZCOOL XiaoWei",serif;margin-bottom:4px;}',
            '.meta{text-align:center;color:#887860;font-size:12px;margin-bottom:32px;}',
            '.msg{margin-bottom:22px;}',
            '.label{font-size:11px;color:#887860;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:1px;}',
            '.text{background:rgba(255,255,255,0.04);padding:14px 20px;border-radius:14px;border-left:3px solid #dba541;font-size:15px;}',
            '.user .text{border-left-color:#4a90d9;background:rgba(74,144,217,0.06);}',
            '</style></head><body>',
            '<h1>🍂 Ginkgo Engine · Epilogue</h1>',
            '<div class="meta">' + dateStr + ' · 共 ' + msgCount + ' 条对话</div>'
        ];
        messages.forEach(function(msg) {
            var label = msg.querySelector('.ep-chat-label');
            var text = msg.querySelector('.ep-chat-text');
            if (label && text) {
                var isUser = msg.classList.contains('ep-chat-user');
                htmlLines.push('<div class="msg' + (isUser ? ' user' : '') + '">');
                htmlLines.push('<div class="label">' + esc(label.textContent) + '</div>');
                htmlLines.push('<div class="text">' + text.innerHTML + '</div>');
                htmlLines.push('</div>');
            }
        });
        htmlLines.push('</body></html>');

        // ── 下载 (先 HTML，再 TXT，避免双重弹窗) ──
        var htmlBlob = new Blob([htmlLines.join('\n')], { type: 'text/html;charset=utf-8' });
        var htmlUrl = URL.createObjectURL(htmlBlob);
        var htmlA = document.createElement('a');
        htmlA.href = htmlUrl;
        htmlA.download = 'epilogue_dialog_' + dateFile + '.html';
        htmlA.click();

        setTimeout(function() {
            URL.revokeObjectURL(htmlUrl);
            var txtBlob = new Blob([txtLines.join('\n')], { type: 'text/plain;charset=utf-8' });
            var txtUrl = URL.createObjectURL(txtBlob);
            var txtA = document.createElement('a');
            txtA.href = txtUrl;
            txtA.download = 'epilogue_dialog_' + dateFile + '.txt';
            txtA.click();
            setTimeout(function() { URL.revokeObjectURL(txtUrl); }, 500);
            showEpToast('📥 对话已导出 (' + msgCount + ' 条 · TXT + HTML)');
        }, 400);
    }

    // 简易 toast（独立于游戏引擎的 showToast）
    function showEpToast(msg) {
        var existing = document.getElementById('epToast');
        if (existing) existing.remove();
        var toast = document.createElement('div');
        toast.id = 'epToast';
        toast.textContent = msg;
        toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);z-index:10000;'
            + 'background:rgba(20,18,24,0.95);border:1px solid #dba541;border-radius:12px;'
            + 'padding:10px 24px;color:#f0d060;font-family:"ZCOOL XiaoWei",serif;font-size:0.95rem;'
            + 'opacity:0;transition:opacity 0.3s;pointer-events:none;';
        document.body.appendChild(toast);
        requestAnimationFrame(function() { toast.style.opacity = '1'; });
        setTimeout(function() {
            toast.style.opacity = '0';
            setTimeout(function() { if (toast.parentNode) toast.remove(); }, 300);
        }, 3000);
    }

    // 对外暴露 refreshSliders，以便 settings 面板打开时读取最新值
    return { init, show, hide, destroy, onStateChange, updateSprite, showUserMessage, showThinking, appendToken, onReplyComplete, showError, showApiKeyPrompt, hideApiKeyPrompt, reset, refreshSliders, exportChat, popLastAssistantBubble, updateUsageBar, setInputEnabled };
})();
