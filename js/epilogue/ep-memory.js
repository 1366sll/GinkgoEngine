/**
 * ep-memory.js — 记忆管理器 (短期会话 + 长期摘要)
 * 后日谈 AI 对话模块
 *
 * 双层记忆架构：
 *   短期记忆：最近 N 轮完整对话（保留原文）
 *   长期记忆：超过窗口的历史对话 → 调用 AI 做摘要压缩
 */

const EpilogueMemory = (() => {
    const STORAGE_KEY = 'epilogue_memory';
    const SHORT_TERM_LIMIT = 8;    // 短期记忆保留轮数
    const SUMMARIZE_EVERY = 4;     // 每 N 轮触发一次摘要

    // ─── 数据结构 ───────────────────────────────
    // {
    //   shortTerm: [{ user: string, assistant: string, emotion: string }, ...],
    //   longTermSummary: string,     // 累积的长期摘要
    //   totalTurns: number           // 总对话轮数
    // }

    let memory = null;

    function init() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                memory = JSON.parse(saved);
            } catch (e) {
                memory = null;
            }
        }
        if (!memory) {
            memory = {
                shortTerm: [],
                longTermSummary: '',
                totalTurns: 0
            };
        }
        return memory;
    }

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    }

    // ─── 添加一轮对话 ──────────────────────────
    function addTurn(userMsg, assistantMsg, emotion = 'normal') {
        if (!memory) init();

        memory.shortTerm.push({
            user: userMsg,
            assistant: assistantMsg,
            emotion: emotion
        });
        memory.totalTurns++;

        // 超出短期记忆限制时，触发摘要
        if (memory.shortTerm.length > SHORT_TERM_LIMIT) {
            // 取最早的多余轮次
            const overflowCount = memory.shortTerm.length - SHORT_TERM_LIMIT;
            const toSummarize = memory.shortTerm.splice(0, overflowCount);

            // 标记需要摘要（实际的 AI 摘要调用在外部完成）
            // 这里先做简单的文本拼接作为 fallback
            const rawText = toSummarize
                .map(t => `User: ${t.user}\nCharacter: ${t.assistant}`)
                .join('\n');

            memory.longTermSummary = memory.longTermSummary
                ? memory.longTermSummary + '\n---\n' + rawText
                : rawText;

            memory._needsSummarize = true;  // 标记：外部应调用 AI 摘要
            memory._pendingSummarize = toSummarize;
        }

        save();
        return memory;
    }

    // ─── 获取格式化的短期记忆 ──────────────────
    function getShortTermText() {
        if (!memory) init();
        if (memory.shortTerm.length === 0) return '';

        return memory.shortTerm
            .map(t => `User: ${t.user}\nCharacter: ${t.assistant}`)
            .join('\n\n');
    }

    // ─── 获取长期记忆摘要 ──────────────────────
    function getLongTermSummary() {
        if (!memory) init();
        return memory.longTermSummary || 'This is the first conversation. The characters have just finished an important chapter in their lives. They share a bond deeper than ordinary friendship, though unspoken. It is a quiet evening, and the air is calm.';
    }

    // ─── 检查是否需要 AI 摘要 ──────────────────
    function needsSummarize() {
        if (!memory) init();
        return memory._needsSummarize === true;
    }

    // ─── 获取待摘要的对话 ──────────────────────
    function getPendingSummarize() {
        if (!memory) init();
        return memory._pendingSummarize || [];
    }

    // ─── 设置 AI 摘要结果 ──────────────────────
    function setSummary(summaryText) {
        if (!memory) init();
        memory.longTermSummary = summaryText;
        memory._needsSummarize = false;
        memory._pendingSummarize = null;
        save();
    }

    // ★ 移除最后一轮对话（用于重新生成）
    function popLastTurn() {
        if (!memory || memory.shortTerm.length === 0) return null;
        var last = memory.shortTerm.pop();
        memory.totalTurns = Math.max(0, memory.totalTurns - 1);
        save();
        return last; // { user, assistant, emotion }
    }

    // ─── 重置记忆 ──────────────────────────────
    function reset() {
        memory = {
            shortTerm: [],
            longTermSummary: '',
            totalTurns: 0
        };
        save();
        return memory;
    }

    // ─── 获取总对话轮数 ────────────────────────
    function getTotalTurns() {
        if (!memory) init();
        return memory.totalTurns;
    }

    // ─── 导出当前完整状态 ──────────────────────
    function getState() {
        if (!memory) init();
        return {
            shortTerm: [...memory.shortTerm],
            longTermSummary: memory.longTermSummary,
            totalTurns: memory.totalTurns
        };
    }

    // ─── 公开 API ──────────────────────────────
    return {
        init,
        addTurn,
        popLastTurn,
        getShortTermText,
        getLongTermSummary,
        needsSummarize,
        getPendingSummarize,
        setSummary,
        reset,
        getTotalTurns,
        getState,
        SHORT_TERM_LIMIT
    };
})();
