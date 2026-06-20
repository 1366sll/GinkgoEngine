/**
 * ep-effects.js — 画面演出效果系统
 * 后日谈 AI 对话模块
 *
 * 复刻原游戏 core.js 的 applySceneEffects，
 * 独立封装供后日谈使用。epilogue.html 已复用
 * gal-core.css 中所有画面效果 CSS，无需额外样式。
 */

const EpilogueEffects = (() => {
    // ─── DOM 缓存 ───────────────────────────────
    let visualArea  = null;
    let vignetteEl  = null;
    let flashEl     = null;
    let letterboxEl = null;
    let bgLayer     = null;
    let pendingTimers = [];  // 跟踪所有定时清除器

    // ─── 滤镜映射 ───────────────────────────────
    const FILTER_MAP = {
        sepia:          'sepia(0.6)',
        blur:           'blur(3px)',
        bright:         'brightness(1.4)',
        dark:           'brightness(0.5)',
        grayscale:      'grayscale(1)',
        'saturate-high':'saturate(1.8)',
        'saturate-low': 'saturate(0.3)'
    };

    const FILTER_KEYS = new Set(Object.keys(FILTER_MAP));

    // ─── 初始化 ─────────────────────────────────
    function init() {
        visualArea  = document.querySelector('.visual-area');
        vignetteEl  = document.getElementById('vignetteOverlay');
        flashEl     = document.getElementById('flashOverlay');
        letterboxEl = document.getElementById('letterboxOverlay');
        bgLayer     = document.getElementById('bgLayer');
    }

    // ─── 清除所有残留 ───────────────────────────
    function clearAll() {
        pendingTimers.forEach(t => clearTimeout(t));
        pendingTimers = [];

        // 滤镜
        if (visualArea) {
            visualArea.style.filter = '';
            visualArea.classList.remove(
                'mood-warm', 'mood-cool', 'mood-dramatic',
                'zoom-in-active', 'shake-active'
            );
        }
        if (vignetteEl)  vignetteEl.classList.remove('active');
        if (flashEl)     flashEl.classList.remove('active');
        if (letterboxEl) letterboxEl.classList.remove('active');

        // bgLayer 上的残留 transform
        if (bgLayer) {
            bgLayer.style.transform = '';
            bgLayer.style.transition = '';
        }
    }

    // ─── 应用滤镜（带过渡） ─────────────────────
    function applyFilter(cssFilter) {
        if (!visualArea) return;
        // 确保 transition 已设置（可在 gal-core 或 epilogue.html 中定义，这里做 fallback）
        if (!visualArea.style.transition || visualArea.style.transition === 'none') {
            visualArea.style.transition = 'filter 0.8s ease';
        }
        visualArea.style.filter = cssFilter;
    }

    // ─── 单个效果 ──────────────────────────────
    function play(effectType, duration) {
        if (!visualArea) init();

        switch (effectType) {
            // ═══ 画面抖动 ═══
            case 'shake':
                if (visualArea) {
                    visualArea.classList.remove('shake-active');
                    void visualArea.offsetWidth;
                    visualArea.classList.add('shake-active');
                    setTimeout(() => visualArea.classList.remove('shake-active'), duration || 500);
                }
                break;

            // ═══ 暗角 ═══
            case 'vignette':
                if (vignetteEl) vignetteEl.classList.add('active');
                if (duration) {
                    pendingTimers.push(setTimeout(() => {
                        if (vignetteEl) vignetteEl.classList.remove('active');
                    }, duration));
                }
                break;
            case 'vignette_off':
                if (vignetteEl) vignetteEl.classList.remove('active');
                break;

            // ═══ 闪白 ═══
            case 'flash':
                if (flashEl) {
                    flashEl.classList.add('active');
                    setTimeout(() => flashEl.classList.remove('active'), duration || 200);
                }
                break;

            // ═══ 宽银幕 ═══
            case 'letterbox':
                if (letterboxEl) letterboxEl.classList.add('active');
                break;
            case 'letterbox_off':
                if (letterboxEl) letterboxEl.classList.remove('active');
                break;

            // ═══ 缩放 ═══
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

            // ═══ 氛围滤镜 ═══
            case 'mood-warm':
                if (visualArea) {
                    visualArea.classList.remove('mood-cool', 'mood-dramatic');
                    void visualArea.offsetWidth;  // force reflow for transition
                    visualArea.classList.add('mood-warm');
                }
                break;
            case 'mood-cool':
                if (visualArea) {
                    visualArea.classList.remove('mood-warm', 'mood-dramatic');
                    void visualArea.offsetWidth;
                    visualArea.classList.add('mood-cool');
                }
                break;
            case 'mood-dramatic':
                if (visualArea) {
                    visualArea.classList.remove('mood-warm', 'mood-cool');
                    void visualArea.offsetWidth;
                    visualArea.classList.add('mood-dramatic');
                }
                break;
            case 'mood-clear':
                if (visualArea) {
                    visualArea.classList.remove('mood-warm', 'mood-cool', 'mood-dramatic');
                }
                break;

            // ═══ CSS 滤镜 ═══
            default:
                if (FILTER_MAP[effectType]) {
                    applyFilter(FILTER_MAP[effectType]);
                    if (duration) {
                        pendingTimers.push(setTimeout(() => {
                            if (visualArea) visualArea.style.filter = '';
                        }, duration));
                    }
                }
                break;
        }
    }

    // ─── 组合效果（从效果数组） ──────────────────
    function playAll(effects) {
        clearAll();
        if (!effects || !Array.isArray(effects) || !effects.length) return;

        // 检查是否有滤镜效果
        const hasFilter = effects.some(e => FILTER_KEYS.has(e.type));
        const hasClear  = effects.some(e => e.type === 'clear' || e.type === 'mood-clear');
        if (!hasFilter && !hasClear) {
            if (visualArea) visualArea.style.filter = '';
        }

        // 强制重排，让 clearAll 的"空状态"先渲染一帧，再过渡到新效果
        if (visualArea) void visualArea.offsetWidth;

        effects.forEach(eff => {
            play(eff.type, eff.duration);
        });
    }

    // ═════════ 预设组合 ══════════════════════════
    /** 回忆闪回：深褐 + 暗角 */
    function playFlashback(duration = 4000) {
        playAll([
            { type: 'sepia' },
            { type: 'vignette', duration: duration }
        ]);
        setTimeout(() => clearAll(), duration);
    }

    /** 惊讶瞬间：抖动 + 闪白 */
    function playShock() {
        play('shake', 600);
        setTimeout(() => play('flash', 150), 80);
    }

    /** 温暖黄昏：暖色氛围 */
    function playWarm() {
        playAll([{ type: 'mood-warm' }]);
    }

    /** 忧郁雨天：冷色氛围 + 暗角 */
    function playMelancholy() {
        playAll([
            { type: 'mood-cool' },
            { type: 'vignette' }
        ]);
    }

    /** 剧震：更强的抖动 + 变暗 */
    function playDramatic() {
        playAll([{ type: 'mood-dramatic' }, { type: 'dark' }]);
    }

    /** 恢复：清除一切效果 */
    function playClear() {
        clearAll();
    }

    /** 夕阳：暖色 + 饱和增强 */
    function playSunset(duration = 5000) {
        playAll([
            { type: 'mood-warm' },
            { type: 'saturate-high', duration: duration }
        ]);
        setTimeout(() => clearAll(), duration);
    }

    /** 梦境：模糊 + 暗 + 暗角 */
    function playDream() {
        playAll([
            { type: 'blur' },
            { type: 'dark' },
            { type: 'vignette' }
        ]);
    }

    // ═════════ 情绪 → 效果映射 ══════════════════
    /**
     * AI 回复后，根据检测到的情绪自动触发画面效果
     * @param {string} emotion - EpilogueEmotion 检测出的情绪名
     */
    function playByEmotion(emotion) {
        switch (emotion) {
            case 'happy':
                playAll([{ type: 'bright', duration: 3000 }]);
                break;
            case 'shy':
                // 害羞不触发效果，保持干净
                break;
            case 'sad':
                playMelancholy();
                break;
            case 'surprised':
                playShock();
                break;
            case 'thinking':
                playAll([{ type: 'vignette', duration: 4000 }]);
                break;
            case 'gentle':
                playWarm();
                break;
            case 'worried':
                playAll([{ type: 'vignette' }, { type: 'saturate-low', duration: 5000 }]);
                break;
            case 'nostalgic':
                playFlashback(5000);
                break;
            default:
                break;
        }
    }

    // ─── 公开 API ──────────────────────────────
    return {
        init,
        play,
        playAll,
        clearAll,
        // 预设
        playFlashback,
        playShock,
        playWarm,
        playMelancholy,
        playDramatic,
        playClear,
        playSunset,
        playDream,
        // 情绪联动
        playByEmotion,
        // 滤镜常量
        FILTER_TYPES: Object.keys(FILTER_MAP)
    };
})();
