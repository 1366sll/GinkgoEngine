/**
 * epilogue-entry.js — 后日谈模式入口
 *
 * 负责：
 *   1. 在后日谈模式与正常游戏模式之间切换
 *   2. 在通关结局时检测并记录解锁
 *   3. 在主菜单/标题画面增加「后日谈」入口按钮
 *   4. 加载所有 epilogue 子模块
 *
 * 使用方法：
 *   在 gal.html 中引入此脚本，
 *   并确保 epilogue/ 下的所有脚本在此之前已加载。
 */

(function () {
    'use strict';

    const EPILOGUE_UNLOCKED_KEY = 'galgame_epilogue_unlocked';
    let epilogueActive = false;

    // ─── 加载所有子模块脚本 ─────────────────────
    function loadEpilogueScripts() {
        return new Promise((resolve) => {
            const basePath = 'js/epilogue/';
            const scripts = [
                'ep-api.js',
                'ep-memory.js',
                'ep-emotion.js',
                'ep-tts.js',
                'ep-ui.js',
                'ep-engine.js'
            ];

            let loaded = 0;

            scripts.forEach(src => {
                // 检查是否已经加载
                const existing = document.querySelector(`script[src="${basePath}${src}"]`);
                if (existing) {
                    loaded++;
                    if (loaded === scripts.length) resolve();
                    return;
                }

                const script = document.createElement('script');
                script.src = basePath + src;
                script.onload = () => {
                    loaded++;
                    if (loaded === scripts.length) resolve();
                };
                script.onerror = () => {
                    console.error(`[EpilogueEntry] 加载脚本失败: ${src}`);
                    loaded++;
                    if (loaded === scripts.length) resolve();
                };
                document.head.appendChild(script);
            });
        });
    }

    // ─── 解锁检测 ──────────────────────────────
    function isEpilogueUnlocked() {
        return localStorage.getItem(EPILOGUE_UNLOCKED_KEY) === 'true';
    }

    function unlockEpilogue() {
        localStorage.setItem(EPILOGUE_UNLOCKED_KEY, 'true');
        console.log('[EpilogueEntry] 🎉 后日谈已解锁！');
    }

    // ─── 通关结局时自动解锁 ────────────────────
    // 这个函数应该在游戏引擎触发 ending 时被调用
    function onEndingReached(endingKey) {
        if (!isEpilogueUnlocked()) {
            unlockEpilogue();
            // 可选：显示提示
            if (typeof showToast === 'function') {
                showToast('🌟 后日谈模式已解锁！在主菜单可以进入。');
            }
        }
    }

    // ─── 启动后日谈模式 ────────────────────────
    async function startEpilogue() {
        if (epilogueActive) return;

        await loadEpilogueScripts();
        epilogueActive = true;

        // 暂停正常游戏的 BGM
        pauseGameBGM();

        // 初始化并显示后日谈 UI
        EpilogueEngine.init().then(() => {
            EpilogueUI.show();
        });

        console.log('[EpilogueEntry] 后日谈模式已启动');
    }

    // ─── 退出后日谈模式 ────────────────────────
    function exitEpilogue() {
        if (!epilogueActive) return;

        EpilogueEngine.destroy();
        epilogueActive = false;

        // 恢复游戏 BGM
        resumeGameBGM();

        console.log('[EpilogueEntry] 后日谈模式已退出');
    }

    // ─── BGM 控制 ──────────────────────────────
    function pauseGameBGM() {
        const bgm = document.getElementById('bgmAudio') || document.querySelector('audio');
        if (bgm && !bgm.paused) {
            bgm.dataset.epiloguePaused = 'true';
            bgm.pause();
        }
        // 播放后日谈专用 BGM（柔和、安静的曲目）
        // TODO: 指定一首适合后日谈氛围的 BGM
        // 例如 BGM/8.mp3 或 BGM/FM.mp3
        if (typeof switchBGM === 'function') {
            try {
                var keys = Object.keys(assetConfig.bgm || {});
                if (keys.length > 0) switchBGM(keys[0]);
            } catch (e) {}
        }
    }

    function resumeGameBGM() {
        const bgm = document.getElementById('bgmAudio') || document.querySelector('audio');
        if (bgm && bgm.dataset.epiloguePaused === 'true') {
            bgm.dataset.epiloguePaused = '';
            bgm.play().catch(() => {});
        }
    }

    // ─── 创建主菜单入口按钮 ────────────────────
    function addMainMenuButton() {
        // 尝试在标题画面或主菜单区域添加后日谈入口
        const settingsPage = document.getElementById('settingsModal');
        if (!settingsPage) return;

        // 检查是否已添加
        if (document.getElementById('epilogueMenuBtn')) return;

        const btn = document.createElement('button');
        btn.id = 'epilogueMenuBtn';
        btn.className = 'epilogue-menu-btn';
        btn.innerHTML = '<i class="fa-solid fa-feather-pointed"></i> 后日谈';
        btn.title = 'AI Character Chat Epilogue';
        btn.onclick = () => {
            // 关闭设置页面
            if (typeof closeSettings === 'function') {
                closeSettings();
            }
            startEpilogue();
        };

        // 插入到设置页面的显眼位置
        const header = settingsPage.querySelector('.settings-page-header');
        if (header) {
            header.appendChild(btn);
        }
    }

    // ─── 监听结局触发 ──────────────────────────
    // 劫持原有的 unlockEnding 来检测通关
    function hookEndingDetection() {
        // 检查 markSceneAsRead 函数（游戏引擎在播放到 ending 时会调用相关逻辑）
        // 这里用 MutationObserver 或者定时检测 ending 解锁
        const originalUnlockEnding = window.unlockEnding;
        if (typeof originalUnlockEnding === 'function') {
            window.unlockEnding = function (endingKey, endingTitle) {
                originalUnlockEnding.call(this, endingKey, endingTitle);
                onEndingReached(endingKey);
            };
        }

        // 同时监听 toast 消息中是否包含 "结局"
        const origShowToast = window.showToast;
        if (typeof origShowToast === 'function') {
            window.showToast = function (msg) {
                origShowToast.call(this, msg);
                if (typeof msg === 'string' && msg.includes('结局')) {
                    onEndingReached('detected_from_toast');
                }
            };
        }
    }

    // ─── 初始化 ─────────────────────────────────
    function init() {
        // 检测是否已解锁后日谈
        if (isEpilogueUnlocked()) {
            // 解锁后添加菜单入口
            setTimeout(addMainMenuButton, 500);
        }

        // Hook 结局检测
        hookEndingDetection();

        // 暴露全局 API 供游戏引擎调用
        window.EpilogueEntry = {
            start: startEpilogue,
            exit: exitEpilogue,
            isUnlocked: isEpilogueUnlocked,
            unlock: unlockEpilogue,
            isActive: () => epilogueActive,
            onEndingReached: onEndingReached
        };

        console.log('[EpilogueEntry] 入口已就绪 | 后日谈解锁状态:', isEpilogueUnlocked());
    }

    // ─── 启动 ───────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
