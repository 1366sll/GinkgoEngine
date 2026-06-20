/**
 * ep-tts.js v2 — 中文 TTS 管理器 (Web Speech API + 边界回调)
 * 后日谈 AI 对话模块
 *
 * 当前使用浏览器内置 Web Speech API（免费、零延迟），
 * v2: 新增 onboundary 回调，驱动 Live2D 真实口型同步。
 *
 * ═══════════════════════════════════════════════════════════════
 * 📢 更好的 TTS 引擎选择（按自然度排序）：
 *
 * ① Edge TTS (微软云 TTS) — ★★★★★ 推荐
 *    音色: zh-CN-XiaoxiaoNeural — 目前免费中文语音中最自然的
 *    方案: 通过 edge-tts (Python) 代理，或用 WebSocket 直连
 *    费用: 免费（需保持 Edge 的 User-Agent）
 *    接入: 起一个本地 Python 进程 `edge-tts --text "..." --voice zh-CN-XiaoxiaoNeural --write-media output.mp3`
 *         然后用 Audio 元素播放返回的音频。
 *
 * ② 火山引擎 TTS (字节跳动) — ★★★★ 适合商业项目
 *    音色: 多种中文女声可选，情感标签支持度好
 *    费用: 每月免费 100 万字符
 *    接入: REST API，返回 MP3/WAV 二进制流
 *
 * ③ Web Speech API (当前方案) — ★★★ 开发最简便
 *    音色: 取决于操作系统。Windows 11 的 Xiaoxiao 还不错；
 *         Windows 10 的 Huihui/Yaoyao 机械感重；macOS 的 Tingting 尚可
 *    费用: 免费
 *    局限: 无边界事件精确度因浏览器而异；音量包络不可读取
 *
 * ④ 本地 TTS 引擎 (VITS/Bert-VITS2) — ★★★★ 完全自主
 *    音色: 可微调为一个角色的专属声音，情绪控制强
 *    费用: 需 GPU，训练和推理成本
 *    接入: 本地 HTTP 服务 → 流式返回 WAV
 * ═══════════════════════════════════════════════════════════════
 */

const EpilogueTTS = (() => {
    let enabled = false;
    let volume = 0.8;
    let rate = 0.95;
    let voice = null;
    let speakSeq = 0;       // prevent stale stop events
    let boundaryCb = null;  // Live2D lip sync callback

    // ─── 初始化 ─────────────────────────────────
    function init() {
        if (!('speechSynthesis' in window)) {
            console.warn('[EpilogueTTS] 浏览器不支持 Web Speech API');
            return false;
        }

        // 读取用户设置
        enabled = localStorage.getItem('epilogue_tts_enabled') === 'true';
        volume = parseFloat(localStorage.getItem('epilogue_tts_volume') || '0.8');
        rate = parseFloat(localStorage.getItem('epilogue_tts_rate') || '0.95');

        // 等待语音列表加载
        loadVoices();
        speechSynthesis.onvoiceschanged = loadVoices;

        return true;
    }

    function loadVoices() {
        const voices = speechSynthesis.getVoices();
        if (voices.length === 0) {
            console.log('[EpilogueTTS] No voices available yet, waiting for voiceschanged event');
            return;
        }

        // ── GAL 风格语音优先级 ─────────────────
        // 中文女声，按自然度排序。后缀标注了效果评价。
        const preferred = [
            // ── Edge Neural 系列 (Win10+/Edge浏览器，最佳免费中文TTS) ──
            { name: 'Xiaoxiao',       lang: 'zh-CN', note: '★ Edge 自然女声 — 温柔清晰，最适合文小管' },
            { name: 'Yunxi',          lang: 'zh-CN', note: 'Edge 男声 — 适合男主内心独白' },
            { name: 'Xiaoyi',         lang: 'zh-CN', note: 'Edge 活泼女声' },
            { name: 'Yunjian',        lang: 'zh-CN', note: 'Edge 成熟男声' },
            // ── 系统内置 ──
            { name: 'Tingting',       lang: 'zh-CN', note: '旧版 Windows 女声 — 机械感较重' },
            { name: 'Mei-Jia',        lang: 'zh-TW', note: 'macOS 台湾女声 — 软糯，适合害羞语气' },
            // ── 宽泛回退 ──
            { name: 'zh-CN',          lang: 'zh',    note: '任意中文语音' },
        ];

        // 精准匹配：name 子串 + lang 子串
        for (const pref of preferred) {
            voice = voices.find(v =>
                v.name.toLowerCase().includes(pref.name.toLowerCase()) &&
                v.lang.toLowerCase().includes(pref.lang.toLowerCase())
            );
            if (voice) {
                console.log('[EpilogueTTS] 选中:', voice.name, '—', pref.note);
                break;
            }
        }

        // 最后手段：任意中文语音
        if (!voice) {
            voice = voices.find(v => v.lang.includes('zh'));
            if (voice) console.log('[EpilogueTTS] 回退到中文语音:', voice.name);
        }

        if (!voice && voices.length > 0) {
            voice = voices[0];
            console.log('[EpilogueTTS] 回退到系统第一个语音:', voice.name);
        }

        console.log('[EpilogueTTS] 选中语音:', voice?.name || '无',
            voice ? ('lang=' + voice.lang + ' local=' + voice.localService) : '');
    }

    // ─── 边界回调（供 Live2D 口型同步） ──────────
    /**
     * 注册词边界回调。Live2D 模块用此驱动口型。
     * @param {function} cb — cb({charIndex, charLength, elapsedTime, cleanText})
     */
    function setBoundaryCallback(cb) { boundaryCb = cb; }
    function clearBoundaryCallback() { boundaryCb = null; }

    // ─── 播放 ───────────────────────────────────
    /**
     * 朗读文本
     * @param {string} text - 要朗读的文本
     * @param {string} emotion - 情绪标签（可选，影响语速）
     * @returns {Promise} 朗读完成时 resolve
     */
    function speak(text, emotion = 'normal') {
        return new Promise((resolve) => {
            if (!enabled || !text || text.trim() === '') {
                resolve();
                return;
            }

            // 清理文本中的格式标记（包括内心独白整个移除）
            const cleanText = text
                .replace(/\[inner\][\s\S]*?\[\/inner\]/g, '')
                .replace(/\[\/?[a-zA-Z][^\]]*\]/g, '')
                .trim();

            // Sequence to prevent cancel's async onend from stopping new speech
            var seq = ++speakSeq;

            // Cancel previous + start lip sync immediately (before cancel's onend fires)
            speechSynthesis.cancel();
            if (typeof EpilogueLive2D !== 'undefined' && EpilogueLive2D.isReady()) {
                EpilogueLive2D.startLipSync();
            }

            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.voice = voice;
            utterance.volume = volume;
            utterance.rate = emotion === 'sad' ? rate * 0.85 : rate;
            utterance.pitch = emotion === 'happy' ? 1.1 : 1.0;

            // ★ v2: 词边界事件 → Live2D 口型脉冲
            utterance.onboundary = (ev) => {
                if (seq !== speakSeq) return;
                if (boundaryCb) {
                    boundaryCb({
                        charIndex: ev.charIndex,
                        charLength: ev.charLength || 1,
                        elapsedTime: ev.elapsedTime,
                        cleanText: cleanText
                    });
                }
            };

            utterance.onend = () => {
                if (seq !== speakSeq) return; // stale
                if (typeof EpilogueLive2D !== 'undefined' && EpilogueLive2D.isReady()) {
                    EpilogueLive2D.stopLipSync();
                }
                resolve();
            };
            utterance.onerror = () => {
                if (seq !== speakSeq) return;
                if (typeof EpilogueLive2D !== 'undefined' && EpilogueLive2D.isReady()) {
                    EpilogueLive2D.stopLipSync();
                }
                resolve();
            };

            speechSynthesis.speak(utterance);
        });
    }

    // ─── 控制 ───────────────────────────────────
    function stop() {
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
        if (typeof EpilogueLive2D !== 'undefined' && EpilogueLive2D.isReady()) {
            EpilogueLive2D.stopLipSync();
        }
    }

    function toggle() {
        enabled = !enabled;
        localStorage.setItem('epilogue_tts_enabled', enabled.toString());
        if (!enabled) stop();
        return enabled;
    }

    function setVolume(val) {
        volume = Math.max(0, Math.min(1, val));
        localStorage.setItem('epilogue_tts_volume', volume.toString());
    }

    function setRate(val) {
        rate = Math.max(0.5, Math.min(2, val));
        localStorage.setItem('epilogue_tts_rate', rate.toString());
    }

    function isEnabled() {
        return enabled;
    }

    // ─── 公开 API ──────────────────────────────
    function getVolume() { return volume; }

    return {
        init, speak, stop, toggle, getVolume, setVolume, setRate, isEnabled,
        setBoundaryCallback, clearBoundaryCallback   // ★ v2 新增
    };
})();
