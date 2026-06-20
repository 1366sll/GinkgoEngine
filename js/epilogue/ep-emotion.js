/**
 * ep-emotion.js — 情感分析 & 立绘映射
 * 后日谈 AI 对话模块
 *
 * 从 AI 回复文本中检测情绪，映射到对应的立绘 sprite key。
 * 当前使用关键词规则匹配；后续可升级为 AI 情感标签输出。
 */

const EpilogueEmotion = (() => {
    // ─── 情绪 → sprite key 映射 ─────────────────
    // 这些 key 对应 galgame_full_project.json 中 assets.sprites 的定义
    const EMOTION_SPRITE_MAP = {
        happy:      'Happy',      // 开心 → 差分1开心
        shy:        'shappy',     // 害羞 → 差分7害羞地笑
        sad:        'sad',        // 难过 → 差分3难过
        surprised:  'curious',    // 惊讶 → 差分8微惊讶
        thinking:   'hesitant',   // 思考/犹豫 → 差分10犹豫
        gentle:     'shy_happy',  // 温柔微笑 → 差分2微笑
        worried:    'serious',    // 担忧/严肃 → 差分9疑惑
        nostalgic:  'rainy3',     // 回忆/怀念 → 雨天若有所思
        normal:     'normal'      // 默认 → 差分5欣然地笑
    };

    // ─── 关键词 → 情绪 ─────────────────────────
    const KEYWORD_RULES = [
        { emotion: 'happy',     keywords: ['哈哈', '开心', '真好', '喜欢', '太好了', '有意思', '有趣', '笑'] },
        { emotion: 'shy',       keywords: ['……没', '还好吧', '没什么', '别问了', '你怎么', '突然', '有点'] },
        { emotion: 'sad',       keywords: ['难过', '想哭', '可惜', '如果', '不在了', '再也', '奶奶', '回不去'] },
        {
  emotion: 'surprised',
  keywords: ['什么', '真的吗', '不会吧', '你竟然', '你怎么知道', '啊', '诶']
},
        { emotion: 'thinking',  keywords: ['嗯……', '大概', '也许', '可能', '不知道', '说不清', '觉得'] },
        { emotion: 'gentle',    keywords: ['谢谢', '真好', '嗯。', '是啊', '记得', '你那次'] },
        { emotion: 'worried',   keywords: ['担心', '没事吧', '还好吗', '你还好', '不下雨', '怕'] },
        { emotion: 'nostalgic', keywords: ['以前', '草原', '小时候', '内蒙古', '奶奶说过', '陈晚', '苏晚', '记得那时候', '那片'] }
        // TODO: 你可以在这里继续添加更精细的关键词规则
        // 比如结合多个关键词的组合判断、否定词的排除等
    ];

    // ─── 检测情绪 ──────────────────────────────
    /**
     * 从 AI 回复文本中检测情绪
     * @param {string} text - AI 的回复文本
     * @returns {string} sprite key (如 'normal', 'Happy', 'shy_happy' 等)
     */
    function detect(text) {
        if (!text || text.trim() === '') {
            return EMOTION_SPRITE_MAP.normal;
        }

        const scores = {};

        for (const rule of KEYWORD_RULES) {
            let score = 0;
            for (const kw of rule.keywords) {
                if (text.includes(kw)) {
                    score += 1;
                }
            }
            if (score > 0) {
                scores[rule.emotion] = score;
            }
        }

        if (Object.keys(scores).length === 0) {
            return EMOTION_SPRITE_MAP.normal;
        }

        // 找得分最高的情绪
        const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
        return EMOTION_SPRITE_MAP[best] || EMOTION_SPRITE_MAP.normal;
    }

    // ─── 获取情绪对应的 sprite key ─────────────
    function getSpriteKey(emotionName) {
        return EMOTION_SPRITE_MAP[emotionName] || EMOTION_SPRITE_MAP.normal;
    }

    // ─── 获取所有支持的情绪列表 ─────────────────
    function getSupportedEmotions() {
        return Object.keys(EMOTION_SPRITE_MAP);
    }

    // ─── 公开 API ──────────────────────────────
    return {
        detect,
        getSpriteKey,
        getSupportedEmotions,
        EMOTION_SPRITE_MAP
    };
})();
