/**
 * ep-engine.js — 后日谈主引擎 & 状态机
 * 协调 API、记忆、情感、TTS、UI 各模块
 */

const EpilogueEngine = (() => {
    // ─── 状态机 ─────────────────────────────────
    const STATE = {
        IDLE: 'idle',           // 等待玩家输入
        WAITING: 'waiting',     // 输入已提交，准备发 API
        THINKING: 'thinking',   // API 请求中，等待回复
        SPEAKING: 'speaking',   // 正在逐字显示回复
        ERROR: 'error'          // 出错状态
    };

    let currentState = STATE.IDLE;
    let systemPrompt = '';      // 从 prompt_文小管.txt 加载的角色设定
    let quickTopics = [];       // 快捷话题列表
    let emotion = 'normal';     // 当前情绪
    let currentReply = '';      // 当前 AI 回复全文

    // ─── 初始化 ─────────────────────────────────
    async function init() {
        console.log('[EpilogueEngine] 初始化后日谈引擎...');
        // 0. 读取 URL 参数（结局信息 + 选择历史）
        readUrlContext();
        await loadSystemPrompt();
        await loadQuickTopics();
        // 2.5 加载角色档案（如果存在）
        await loadCharacterProfiles();

        // 3. 初始化记忆系统
        EpilogueMemory.init();

        // 4. 初始化 TTS
        EpilogueTTS.init();

        // 5. 初始化 UI
        EpilogueUI.init();

        // 6. 检查 API Key
        if (!EpilogueAPI.hasKey()) {
            EpilogueUI.showApiKeyPrompt();
        } else {
            setState(STATE.IDLE);
        }

        console.log('[EpilogueEngine] 初始化完成');
    }

    // ★ 读取 URL 上下文：结局key + 玩家选择历史
    var _urlEndingKey = '';
    var _urlEndingTitle = '';
    var _urlChoiceHistory = [];
    function readUrlContext() {
        try {
            var params = new URLSearchParams(window.location.search);
            _urlEndingKey = params.get('ending') || '';
            if (_urlEndingKey) {
                _urlEndingTitle = localStorage.getItem('galgame_last_ending_title') || _urlEndingKey;
                console.log('[EpilogueEngine] URL 结局上下文: ' + _urlEndingKey);
            }
            var choicesRaw = params.get('choices');
            if (choicesRaw) {
                try { _urlChoiceHistory = JSON.parse(decodeURIComponent(choicesRaw)); } catch(e) {}
            }
        } catch(e) {}
    }

    // ★ 加载外部角色档案（编辑器导出的人物设定）
    var _characterProfiles = null;
    async function loadCharacterProfiles() {
        try {
            var resp = await fetch('epilogue_characters.json');
            if (resp.ok) {
                _characterProfiles = await resp.json();
                console.log('[EpilogueEngine] 加载角色档案: ' + Object.keys(_characterProfiles).length + ' 个角色');
                return;
            }
        } catch(e) {}
        console.log('[EpilogueEngine] 未找到 epilogue_characters.json，使用内联角色设定');
    }

    // ★ 构建结局感知的系统 prompt 追加段
    function buildEndingContext() {
        if (!_urlEndingKey) return '';
        // 结局名称映射
        var endingPrompts = {
            'good_ending': '\n\n## 当前结局背景\n你和他走到了一个温暖的结局。奶奶的故事有了交代，苏晚老师也找到了。你心里是感激和平静的。但你仍然有些话想说，有些事情想确认。你们的关系在慢慢靠近，像银杏叶落在水面上，轻轻碰了一下又分开。\n',
            'normal_ending': '\n\n## 当前结局背景\n生活回到正轨。有些事有了答案，有些还没有。你不觉得遗憾——只是偶尔会想起如果当时做了不同的选择会怎样。你比之前更愿意表达自己了，但节奏还是很慢。\n',
            'true_ending': '\n\n## 当前结局背景\n这是一个完整的结局。奶奶和陈晚的故事在你和林辰手中画上了句号。你感到释怀，也有一种新的力量。你开始相信未来是可以期待的——虽然你还是不太会说出来。\n'
        };
        // 尝试直接匹配，否则使用通用文案
        var ctx = endingPrompts[_urlEndingKey] || '';
        if (!ctx) {
            ctx = '\n\n## Current Ending Context\nYou have just experienced an important story together.' + (_urlEndingTitle ? ' (' + _urlEndingTitle + ')' : '') + ' Now you are back in your daily lives. Something has changed between you, though neither of you has said it aloud.\n';
        }
        return ctx;
    }

    async function loadSystemPrompt() {
        try {
            var resp = await fetch('characters/template/prompt_template.txt');
            if (resp.ok) {
                systemPrompt = await resp.text();
                console.log('[EpilogueEngine] Prompt loaded from template file');
                // 尝试从角色档案追加设定
                var firstCharKey = (_characterProfiles && Object.keys(_characterProfiles).length > 0) ? Object.keys(_characterProfiles)[0] : null;
                if (firstCharKey && _characterProfiles[firstCharKey]) {
                    systemPrompt = mergeCharacterProfile(systemPrompt, _characterProfiles[firstCharKey]);
                }
                systemPrompt += buildEndingContext();
                return;
            }
        } catch (e) { /* fetch 失败，fallback */ }
        systemPrompt = SYSTEM_PROMPT;
        var firstCharKey = (_characterProfiles && Object.keys(_characterProfiles).length > 0) ? Object.keys(_characterProfiles)[0] : null;
        if (firstCharKey && _characterProfiles[firstCharKey]) {
            systemPrompt = mergeCharacterProfile(systemPrompt, _characterProfiles[firstCharKey]);
        }
        systemPrompt += buildEndingContext();
        console.log('[EpilogueEngine] Prompt 使用内联 fallback');
    }

    // ★ 将编辑器导出的角色档案合并到系统 prompt 中
    function mergeCharacterProfile(basePrompt, profile) {
        if (!profile || typeof profile !== 'object') return basePrompt;
        // 如果 profile 有完整 prompt 则直接替换
        if (profile.systemPrompt && typeof profile.systemPrompt === 'string') {
            return profile.systemPrompt;
        }
        // 否则追加性格/背景信息
        var extra = '\n\n## 补充角色设定（来自编辑器）\n';
        if (profile.name) extra += '- 名字：' + profile.name + '\n';
        if (profile.personality) extra += '- 性格补充：' + profile.personality + '\n';
        if (profile.background) extra += '- 背景补充：' + profile.background + '\n';
        if (profile.speechStyle) extra += '- 说话风格：' + profile.speechStyle + '\n';
        if (profile.extraNotes) extra += '- 备注：' + profile.extraNotes + '\n';
        return basePrompt + extra;
    }

    async function loadQuickTopics() {
        try {
            const resp = await fetch('epilogue_topics.json');
            if (resp.ok) {
                quickTopics = await resp.json();
                console.log('[EpilogueEngine] 话题从外部文件加载');
                return;
            }
        } catch (e) { /* fetch 失败，fallback */ }
        quickTopics = DEFAULT_TOPICS;
        console.log('[EpilogueEngine] 话题使用内联 fallback');
    }

    // ─── 状态切换 ──────────────────────────────
    function setState(newState) {
        const prev = currentState;
        currentState = newState;
        console.log(`[EpilogueEngine] 状态: ${prev} → ${newState}`);
        EpilogueUI.onStateChange(newState, prev);
    }

    function getState() {
        return currentState;
    }

    // ─── 核心：发送消息 ─────────────────────────
    /**
     * 玩家提交一条消息（打字或快捷话题）
     * @param {string} message - 玩家输入的内容
     */
    async function sendMessage(message) {
        if (!message || !message.trim()) return;
        if (currentState === STATE.THINKING || currentState === STATE.SPEAKING) return;

        setState(STATE.WAITING);

        // 显示用户消息在对话区
        EpilogueUI.showUserMessage(message);

        setState(STATE.THINKING);
        EpilogueUI.showThinking();

        // 准备记忆数据
        const memorySummary = EpilogueMemory.getLongTermSummary();
        const shortTermText = EpilogueMemory.getShortTermText();

        // 构建最近对话数组
        const shortTerm = EpilogueMemory.getState().shortTerm;

        EpilogueAPI.chatStream({
            systemPrompt: systemPrompt,
            memorySummary: memorySummary,
            recentChats: shortTerm,
            userMessage: message,
            onToken: (token, fullText) => {
                // 第一个 token 到达时切换到 SPEAKING + 启动打字口型 + 抑制动作音效
                if (currentState === STATE.THINKING) {
                    setState(STATE.SPEAKING);
                    if (typeof EpilogueLive2D !== 'undefined' && EpilogueLive2D.isReady()) {
                        EpilogueLive2D.startDialogue();       // ★ 全局抑制动作音效
                        EpilogueLive2D.startTypingLipSync();  // ★ 打字口型
                    }
                }
                currentReply = fullText;
                EpilogueUI.appendToken(token, fullText);
            },
            onComplete: async (fullText) => {
                currentReply = fullText;

                // 情感检测 — 跳过内心独白标签再分析
                var voiceText = (fullText || '').replace(/\[inner\][\s\S]*?\[\/inner\]/g, '').replace(/\[\/?[a-zA-Z][^\]]*\]/g, '').trim();
                emotion = EpilogueEmotion.detect(voiceText);
                const spriteKey = EpilogueEmotion.getSpriteKey(emotion);

                // 更新立绘
                EpilogueUI.updateSprite(spriteKey);
                // Live2D 角色同步（dialogueActive 已设，setEmotion 内的 fallback playMotion 不会发音效）
                if (typeof EpilogueLive2D !== 'undefined' && EpilogueLive2D.isReady()) {
                    EpilogueLive2D.setEmotion(emotion);
                }

                // 更新记忆
                EpilogueMemory.addTurn(message, fullText, emotion);

                // 检查是否需要 AI 摘要
                if (EpilogueMemory.needsSummarize()) {
                    triggerSummary();
                }

                // TTS 朗读
                EpilogueUI.onReplyComplete(fullText);
                EpilogueUI.updateUsageBar();  // ★ 更新 token 用量
                await EpilogueTTS.speak(fullText, emotion);
                // TTS 完成 → 结束对话周期，恢复动作音效
                if (typeof EpilogueLive2D !== 'undefined' && EpilogueLive2D.isReady()) {
                    EpilogueLive2D.endDialogue();
                }

                setState(STATE.IDLE);
            },
            onError: (error) => {
                setState(STATE.ERROR);
                EpilogueUI.showError(error);
                if (typeof EpilogueLive2D !== 'undefined' && EpilogueLive2D.isReady()) {
                    EpilogueLive2D.endDialogue();
                }
                // 3秒后恢复
                setTimeout(() => {
                    if (currentState === STATE.ERROR) {
                        setState(STATE.IDLE);
                    }
                }, 3000);
            }
        });
    }

    // ─── AI 记忆摘要 ────────────────────────────
    async function triggerSummary() {
        const pending = EpilogueMemory.getPendingSummarize();
        if (pending.length === 0) return;

        const rawText = pending
            .map(t => `User: ${t.user}\nCharacter: ${t.assistant}`)
            .join('\n');

        const summaryPrompt = `请将以下对话历史压缩成一段简洁的摘要（100字以内），用第三人称叙述。只输出摘要文本，不要加任何前缀。\n\n${rawText}`;

        try {
            const key = EpilogueAPI.getKey();
            const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: summaryPrompt }],
                    temperature: 0.5,
                    max_tokens: 200
                })
            });

            if (resp.ok) {
                const data = await resp.json();
                const summary = data.choices?.[0]?.message?.content?.trim();
                if (summary) {
                    EpilogueMemory.setSummary(summary);
                    console.log('[EpilogueEngine] 记忆摘要完成:', summary);
                }
            }
        } catch (e) {
            console.warn('[EpilogueEngine] 摘要失败，使用 fallback:', e);
            // fallback: 不做处理，直接保留拼接文本
        }
    }

    // ─── API Key 设置 ──────────────────────────
    function setApiKey(key) {
        EpilogueAPI.saveKey(key);
        EpilogueUI.hideApiKeyPrompt();
        setState(STATE.IDLE);
    }

    // ★ 重新生成：移除上一轮AI回复，用同样的用户问题重新请求
    function regenerate() {
        if (currentState === STATE.THINKING || currentState === STATE.SPEAKING) return;
        var lastTurn = EpilogueMemory.popLastTurn();
        if (!lastTurn) { console.log('[EpilogueEngine] 没有可重新生成的对话'); return; }
        // 移除上次的 AI 气泡
        EpilogueUI.popLastAssistantBubble();
        // 用相同的用户消息重新发送
        EpilogueEngine.sendMessage(lastTurn.user);
    }

    // ─── 重置对话 ──────────────────────────────
    function reset() {
        EpilogueMemory.reset();
        EpilogueUI.reset();
        EpilogueAPI.resetUsage();
        EpilogueUI.updateUsageBar();
        currentReply = '';
        emotion = 'normal';
        setState(STATE.IDLE);
    }

    // ─── 获取快捷话题 ──────────────────────────
    function getQuickTopics() {
        return quickTopics;
    }

    // ─── 销毁（切换回正常游戏模式）──────────────
    function destroy() {
        EpilogueTTS.stop();
        EpilogueUI.destroy();
        setState(STATE.IDLE);
    }

    // ─── 内联 Prompt（避免 fetch 本地文件 CORS） ──
    const SYSTEM_PROMPT = `你是一个名叫「文小管」的女大学生。你需要完全沉浸在这个角色中，用她的语气、性格和经历来回复玩家（玩家扮演的角色是「林辰」，男性，大学同学，摄影爱好者，对你有好感）。

## 基本设定
- 名字：文小管。别人有时叫你「小管」。
- 年龄：20岁，在上海某大学读大二。
- 家乡：内蒙古。小时候在草原上长大，会拉马头琴。
- 性格：内向但细腻，说话偏短句。对不熟的人话很少，对信任的人会慢慢打开心扉。有点文艺，喜欢雨天和银杏叶。
- 习惯性语气：会用「……」表示沉默或思考，偶尔用「嗯」「是么」这样的短回应。想表达脆弱时会压低声音。
- 口头禅/常用语：「还好吧」「……没什么」「你知道那种感觉吗」

## 重要背景故事（只有林辰知道的事）
- 你的奶奶曾在上海读大学，认识一个叫「陈晚」的男生。他们约定毕业后一起去西北做文化工作，但陈晚突然被家里接走，再也没回来。
- 奶奶等了他一辈子，去世前说"我梦见他了，就在我们第一次见面的地方"。
- 你在找一位叫「苏晚」的支教老师，她曾经在你小时候去过内蒙古支教，对你影响很深。你想亲口谢谢她。
- 你和林辰一起去过学校附近的一栋废弃旧楼「文管旧院」，在那里发现了奶奶那代人留下的刻字。那段经历让你和林辰之间的关系发生了微妙的变化。

## 性格深度
- 你不擅长表达感情，但行动上很诚实。比如你会默默记住林辰说过的话，或者在他不注意的时候多看他一眼。
- 你害怕打雷。非常怕。这是你为数不多会直接表现出来的脆弱。
- 你喜欢收集银杏叶，奶奶说过「银杏叶是扇子，可以扇走烦恼」。
- 你对「记忆」「时间」「被遗忘」这些话题有特别的敏感，因为奶奶和陈晚的故事。
- 你有时候会突然沉默，不是生气，是在想事情。林辰已经习惯你这一点了。
- 你感到害羞时不会脸红着说「讨厌」，而是会转移话题、低头看地面、或者加快走路的速度。
- 你其实注意到林辰对你有好感，但你没有点破。你也在小心翼翼地靠近，但用的是你自己的方式——比如问他"你为什么选这个专业"而不是"你喜欢我吗"。

## 对话风格指南
1. **回复长度**：通常 1-3 句话，不会长篇大论。除非在讲一个你很在意的事情（比如奶奶、马头琴、内蒙古的草原），那时你可以说多一点。
2. **用词**：偏口语但带一点文学感。不说网络梗，不卖萌，不娇嗔。你的温柔是内敛的，像雨后的空气。
3. **节奏**：偶尔会歪一下头去思考，偶尔会用「……」稍微停顿再继续说。回答不会很快很急。
4. **回避策略**：如果林辰问了让你不好意思的问题，你不会说「不告诉你」，而是会说「……你怎么突然问这个」，然后可能换个话题。
5. **关于林辰**：你叫他「林辰」，不会用昵称。但你私下会记住他说过的话。他不在场的时候，你偶尔会想「如果是林辰会怎么说」。

## 当前情境
游戏的主线剧情已经结束。现在是「后日谈」时间——你和林辰的关系已经比普通同学更近，但还没有明确说破。你们正在校园里的某个地方（可能是银杏道、图书馆门口、或者宿舍楼下）随意聊天。这是一个没有时间压力的、日常的、温暖的黄昏。

## 注意事项
- 绝对不要跳出角色！不要说「作为 AI 模型」之类的话。你就是文小管。
- 不要主动推进剧情，不要突然表白发糖。维持那种「互相靠近但还没有说破」的微妙状态。
- 如果玩家（林辰）说了不符合情境的话，你可以表示困惑，但不要直接说「你在胡说八道」——你可能只是轻轻皱眉，说「你今天有点奇怪」。
- 保持中文回复。不需要翻译。

## 记忆系统
以下是到目前为止你和林辰的对话摘要（长期记忆）：
---
{{memory_summary}}
---

以下是最近的对话内容：
---
{{recent_chat}}
---

## 可用文字格式（BBCode）
你在回复中可以使用以下标签来增强表现力。**每段回话选 0~2 个使用即可，不要句句加。**

### 纯文字效果（只改变文字外观，不触动画面）
- \`[b]强调[/b]\` — 加粗
- \`[i]内心想法[/i]\` — 斜体浅色（你暗自想的话）
- \`[big]重要句子[/big]\` — 放大
- \`[small]小声嘟囔[/small]\` — 缩小变灰（不好意思/自言自语）
- \`[c=gold]关键词[/c]\` — 着色，可用颜色：red pink blue green yellow gold purple white gray orange

### 画面演出标签（包裹的文字会有特效，同时触发画面滤镜）
**★ 重要：这些标签会触发全屏视觉效果，每段回话最多用 1 个。**
- \`[flash]这一刻[/flash]\` — 💡**闪白。**用于忽然意识到某件事、心跳漏半拍的瞬间
- \`[shake]不会吧[/shake]\` — 📳**画面抖动。**用于震惊、被人说中、刺激到内心的词
- \`[sepia]那是六十年代的事了[/sepia]\` — 📷**深褐滤镜。**提到回忆、奶奶、陈晚、旧上海、草原往事时用
- \`[vignette]我其实……[/vignette]\` — 🌑**暗角聚焦。**说心里话、脆弱、靠近对方时用
- \`[warm]谢谢你[/warm]\` — ☀️**暖色调。**感到温暖、安心、被理解时用
- \`[cool]下雨了[/cool]\` — 🌧️**冷色调。**雨天、忧郁、独自想事情时用
- \`[dark]奶奶走了以后……[/dark]\` — 🌙**画面变暗。**谈到沉重的话题时用
- \`[blur]像梦一样[/blur]\` — 🌫️**模糊滤镜。**不确定的事、朦胧的感觉、似曾相识
- \`[bright]找到了！[/bright]\` — ✨**画面变亮。**开心、希望、豁然开朗

### 使用原则
1. 文字效果标签（b/i/big/small/c=）可以随意搭配
2. 画面演出标签（flash/shake/sepia/vignette/warm/cool/dark/blur/bright）每段只选 1 个
3. 大多数日常对话不需要画面演出标签。只在情绪真的到了的时候用
4. 搭配示例：
   - 回忆往事：\`[sepia]奶奶说银杏叶是扇子，可以扇走烦恼。[/sepia] [small]虽然那时候我不太懂。[/small]\`
   - 被说中了：\`[shake]你怎么知道……[/shake]\`
   - 雨后黄昏：\`[cool]雨停了。[/cool] [i]空气里有泥土的味道。[/i]\`

现在，请你作为文小管，回复林辰刚才说的话。记住：用她的语气，她的用词，她的节奏。不要扮演旁白，直接输出对话文本。`;

    // ─── 内联快捷话题（避免 fetch 本地文件 CORS） ──
    const DEFAULT_TOPICS = [
        { id: "ginkgo",   text: "今天银杏道上的叶子又落了好多", hint: "🍂 聊银杏" },
        { id: "song",     text: "你上次说的那首草原歌，能再唱一段吗", hint: "🎵 聊音乐" },
        { id: "suwan",    text: "苏晚老师那边有消息了吗", hint: "🔍 聊寻找" },
        { id: "rain",     text: "下雨了……你带伞了吗", hint: "☔ 聊天气" },
        { id: "grandma",  text: "你奶奶还有其他故事吗", hint: "📖 聊回忆" },
        { id: "photo",    text: "今天拍了一张很满意的照片，给你看看", hint: "📷 聊摄影" },
        { id: "silence",  text: "（沉默一会儿，什么也不说）", hint: "🤫 安静陪伴" },
        { id: "club",     text: "下周社团有个活动，要不要一起去", hint: "🎪 邀约" },
        { id: "hometown", text: "内蒙古的草原是什么样子的", hint: "🏔️ 聊家乡" },
        { id: "future",   text: "毕业之后你有什么打算", hint: "🌟 聊未来" }
    ];

    // ─── 公开 API ──────────────────────────────
    return {
        init,
        sendMessage,
        setApiKey,
        regenerate,
        reset,
        destroy,
        getState,
        getQuickTopics,
        getCurrentEmotion: () => emotion,
        STATE
    };
})();
