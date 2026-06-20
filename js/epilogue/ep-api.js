/**
 * ep-api.js — DeepSeek API 客户端 (流式输出)
 * 后日谈 AI 对话模块
 */

const EpilogueAPI = (() => {
    // ─── 配置 ───────────────────────────────────
    const DEEPSEEK_BASE = 'https://api.deepseek.com';
    const MODEL = 'deepseek-chat';
    const STORAGE_KEY = 'epilogue_deepseek_key';
    let apiKey = '';
    let _totalPromptTokens = 0;      // ★ 累计输入 token
    let _totalCompletionTokens = 0;  // ★ 累计输出 token
    let _callCount = 0;              // ★ API 调用次数

    /** ★ 粗估 token 数: 中文 ≈ 1.5 tok/字, 英文 ≈ 1.3 tok/词 */
    function estimateTokens(text) {
        if (!text) return 0;
        var cn = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
        var en = (text.match(/[a-zA-Z]+/g) || []).length;
        var other = text.length - cn;
        return Math.ceil(cn * 1.5 + en * 1.3 + other * 0.3);
    }

    function getUsage() {
        return { prompt: _totalPromptTokens, completion: _totalCompletionTokens, calls: _callCount };
    }

    function resetUsage() {
        _totalPromptTokens = 0;
        _totalCompletionTokens = 0;
        _callCount = 0;
    }

    // ★ 简单加密：基于浏览器指纹的 XOR + base64
    // 比明文存储安全，防止 localStorage 被直接复制走 API Key
    function _deriveEncryptionKey() {
        // ★ 只用稳定不变的浏览器指纹（屏幕尺寸会变化，用 platform 代替）
        var fp = [
            navigator.userAgent || '',
            navigator.platform || '',
            navigator.language || '',
            navigator.hardwareConcurrency || '',
            !!window.chrome + '',
            location.hostname || 'localhost'
        ].join('::');
        // 简单 hash → 32 字符 hex
        var hash = 0;
        for (var i = 0; i < fp.length; i++) {
            var ch = fp.charCodeAt(i);
            hash = ((hash << 5) - hash) + ch;
            hash = hash | 0;
        }
        // 将 hash 扩展为可重复的 key 字符串
        var h = Math.abs(hash).toString(16);
        while (h.length < 32) h = h + h;
        return h.substring(0, 32);
    }

    function _encrypt(plaintext) {
        if (!plaintext) return '';
        try {
            var key = _deriveEncryptionKey();
            var result = '';
            for (var i = 0; i < plaintext.length; i++) {
                var cc = plaintext.charCodeAt(i) ^ key.charCodeAt(i % key.length);
                result += String.fromCharCode(cc);
            }
            return btoa(result);
        } catch (e) {
            return '';
        }
    }

    function _decrypt(ciphertext) {
        if (!ciphertext) return '';
        try {
            var raw = atob(ciphertext);
            var key = _deriveEncryptionKey();
            var result = '';
            for (var i = 0; i < raw.length; i++) {
                var cc = raw.charCodeAt(i) ^ key.charCodeAt(i % key.length);
                result += String.fromCharCode(cc);
            }
            return result;
        } catch (e) {
            // 降级：可能是旧版明文存储
            return ciphertext.startsWith('sk-') ? ciphertext : '';
        }
    }

    // 从 localStorage 读取保存的 API Key
    function loadKey() {
        var stored = localStorage.getItem(STORAGE_KEY) || '';
        if (!stored) return '';
        // 兼容旧版明文存储
        if (stored.startsWith('sk-')) return stored;
        return _decrypt(stored);
    }

    function saveKey(key) {
        if (key) {
            localStorage.setItem(STORAGE_KEY, _encrypt(key));
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
        apiKey = key;
    }

    function getKey() {
        return apiKey || loadKey();
    }

    function hasKey() {
        return !!(apiKey || loadKey());
    }

    // ─── 构建 messages 数组 ─────────────────────
    function buildMessages(systemPrompt, memorySummary, recentChats, userMessage) {
        // 替换 prompt 模板中的占位符
        const system = systemPrompt
            .replace('{{memory_summary}}', memorySummary || '（这是你们的第一次对话）')
            .replace('{{recent_chat}}', recentChats || '（这是你们的第一次对话）');

        const messages = [{ role: 'system', content: system }];

        // 添加最近的历史对话（最近 8 轮）
        if (recentChats && Array.isArray(recentChats)) {
            for (const turn of recentChats) {
                messages.push({ role: 'user', content: turn.user });
                messages.push({ role: 'assistant', content: turn.assistant });
            }
        }

        // 添加当前用户消息
        messages.push({ role: 'user', content: userMessage });

        return messages;
    }

    // ─── 流式调用 (核心) ────────────────────────
    /**
     * 发送消息并流式接收回复
     * @param {Object} options
     * @param {string} options.systemPrompt  - 完整的 system prompt
     * @param {string} options.memorySummary - 长期记忆摘要
     * @param {Array}  options.recentChats   - 最近对话 [{user, assistant}, ...]
     * @param {string} options.userMessage   - 用户输入
     * @param {Function} options.onToken     - 每收到一个 token 时回调 (token: string)
     * @param {Function} options.onComplete  - 流结束时回调 (fullText: string)
     * @param {Function} options.onError     - 出错时回调 (error: Error)
     */
    async function chatStream({ systemPrompt, memorySummary, recentChats, userMessage, onToken, onComplete, onError }) {
        if (!hasKey()) {
            onError(new Error('NO_API_KEY'));
            return;
        }

        const key = getKey();
        const messages = buildMessages(systemPrompt, memorySummary, recentChats, userMessage);

        // ★ 累计输入 token
        var inputTokens = 0;
        messages.forEach(function(m) { inputTokens += estimateTokens(m.content); });
        _totalPromptTokens += inputTokens;
        _callCount++;

        try {
            const response = await fetch(`${DEEPSEEK_BASE}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: MODEL,
                    messages: messages,
                    stream: true,
                    temperature: 0.8,
                    max_tokens: 512
                })
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                if (response.status === 401) {
                    throw new Error('INVALID_API_KEY');
                }
                throw new Error(`API_ERROR: ${response.status} ${errText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullText = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                // 最后一个可能是不完整的行，保留在 buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;
                    const data = trimmed.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const json = JSON.parse(data);
                        const delta = json.choices?.[0]?.delta?.content;
                        if (delta) {
                            fullText += delta;
                            onToken(delta, fullText);
                        }
                    } catch (e) {
                        // 跳过无法解析的行
                    }
                }
            }

            // ★ 累计输出 token
            _totalCompletionTokens += estimateTokens(fullText);
            onComplete(fullText);

        } catch (error) {
            console.error('[EpilogueAPI] Stream error:', error);
            onError(error);
        }
    }

    // ─── 快捷话题生成 (可选增强) ────────────────
    /**
     * 让 AI 生成几个快捷话题建议，帮助不知道聊什么的玩家
     * @param {Function} callback - (topics: string[]) => void
     */
    async function suggestTopics() {
        // 返回预设话题，避免额外 API 调用
        const topics = [
            '今天天气真好，想出去走走',
            '你最喜欢的音乐是什么？',
            '最近有什么有趣的事吗？',
            '下雨了……你带伞了吗',
            '你奶奶还有其他故事吗',
            '今天拍了一张很满意的照片，给你看看',
            '（沉默一会儿，什么也不说）',
            '下周社团有个活动，要不要一起去'
        ];
        return topics;
    }

    // ─── 公开 API ──────────────────────────────
    return {
        loadKey,
        saveKey,
        hasKey,
        getKey,
        chatStream,
        suggestTopics,
        estimateTokens,
        getUsage,
        resetUsage
    };
})();
