/** ep-live2d.js v7 — Cubism 5 Framework (Full Featured)
 *
 * Feature set (✅ = v6 retained, ★ = v7 new):
 *   ✅  Model load & render (Cubism 5 + WebGL)
 *   ✅  Breathing animation (5-param, Demo-derived)
 *   ✅  Eye blink (4-state FSM)  ★  + micro-saccade jitter
 *   ✅  Mouse/touch tracking (6 params, delta-add)
 *   ★  Drag/Poke interaction (pose-driven, click vs drag threshold)
 *   ★  Expression crossfade blending (weight lerp over 0.3s)
 *   ★  Motion priority & interruption queue (P1>P2>P3)
 *   ✅  Idle motion loop (gap detection)
 *   ✅  Wind gust system (breeze + gust tiers)
 *   ★  TTS boundary-driven lip sync (pulse on word boundaries + procedural fallback)
 *   ★  Motion sound effects (Sound field from model3.json → Audio pool)
 *   ★  Visibility pause (requestAnimationFrame throttle on tab hidden)
 *   ★  FPS cap (30 fps render throttle, full-rate update)
 *   ★  Canvas mood overlay (CSS filter transition)
 *   ★  Multi-model preload cache
 */

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 1 — State & Configuration
   ═══════════════════════════════════════════════════════════════════════════ */
var EpilogueLive2D = (function() {
    'use strict';

    // Core state
    var ready = false, canvas = null, gl = null;
    var model = null, renderer = null, modelSetting = null, modelMatrix = null;
    var motionManager = null, expressionManager = null;
    var expressionMap = {};       // name → CubismExpressionMotion (v6)
    var expressionData = {};      // ★ name → [{id,value,blend}] raw JSON for crossfade
    var motionPool = {};          // groupName → [CubismMotion]
    var motionMeta = {};          // ★ groupName → [{sound, fadeIn, fadeOut}] metadata
    var idleTimer = null;
    var idleCooldown = false;
    var pose = null;
    var breath = null;
    var physics = null;
    var lipSyncIds = [];
    var isSpeaking = false;
    var shaderPath = 'live2d/shaders/';
    var neutralIdx = [];
    var blinkIds = [], blinkTimer = 0, blinkState = 0, blinkNext = 3.0;
    var af = null, prev = 0, onReadyCb = null;

    // ★ FPS cap (disabled — vsync is sufficient; cap caused visual stutter)
    var FPS_TARGET = 0;    // 0 = no cap, render at vsync rate
    var fpsInterval = 0;
    var lastRenderTime = 0;

    // ★ Visibility
    var pageVisible = true;

    // ★ Multi-model cache
    var modelCache = {};  // path → { moc, textures, setting }

    // ★ Audio pool for motion sounds
    var audioPool = [];
    var MAX_AUDIO = 4;

    // ★ Expression crossfade
    var exprFrom = null;        // { name, params: [{id,value}] } — snapshot of current
    var exprTo = null;          // { name, params: [{id,value}] } — target
    var exprFadeT = 1.0;        // 0→1 progress, 1 = done
    var exprFadeSpeed = 3.3;    // 1/duration (0.3s)

    // ★ Motion priority system
    var MOTION_PRIORITY = { SPECIAL: 1, TAP: 2, IDLE: 3 };
    var currentMotionPriority = 0;

    // ★ Drag state (pending→promote: click never enters drag code path)
    var dragPending = false;               // mousedown but not yet drag
    var dragActive = false;                // confirmed drag: applyDragOffset() runs
    var dragOriginX = 0, dragOriginY = 0;  // mousedown position (screen px)
    var dragCurX = 0, dragCurY = 0;        // current pointer position (screen px)
    var dragThreshold = 15;                // px — move ≥ this → promote to drag
    var dragHandles = [];                  // [{id, axis, scale}] resolved in setupMouse

    // ★ Release lerp: pixel deltas saved at mouseup, normalised each frame against current canvas rect
    var dragReleaseDX = 0;                 // screen-pixel X offset at release
    var dragReleaseDY = 0;                 // screen-pixel Y offset at release
    var dragReleaseAge = 999;              // seconds since release
    var dragReleaseDuration = 1.2;         // total lerp seconds

    // ★ Post-motion lerp: smooth transition from motion end back to neutral
    var postMotionLerpActive = false;
    var postMotionLerpAge = 0;
    var postMotionLerpDuration = 0.5;      // shorter than drag release
    var postMotionLerpValues = {};         // {idx: value} — snapshot of angle params at motion end

    // ★ TTS boundary lip sync
    var ttsMouthPulses = []; // [{target, decay}] active pulses
    var ttsPulseSmooth = 0.0;

    // ★ Saccade
    var saccadeX = 0, saccadeY = 0;           // current micro-offset
    var saccadeTargetX = 0, saccadeTargetY = 0;
    var saccadePrevX = 0, saccadePrevY = 0;   // ★ previous frame (for delta-add to avoid drift)
    var saccadeTimer = 0, saccadeInterval = 1.5 + Math.random() * 3.0;

    // ★ Model home path (for resolving sound file paths)
    var modelHome = '';

    // Wind
    var windX = 0, windY = 0;
    var windTargetX = 0, windTargetY = 0;
    var windTimer = 0, windChangeTime = 3.0 + Math.random() * 5.0;
    var windIdxList = [];

    // Mouse tracking
    var trackParams = [];
    var trackTargetX = 0, trackTargetY = 0;
    var trackCurX = 0, trackCurY = 0;
    var trackPrevX = 0, trackPrevY = 0;

    // ★ Gaze source: 'mouse' | 'external' | 'off'
    var gazeSource = 'mouse';
    // ★ External gaze data (from MediaPipe), normalized -1..1
    var externalGaze = { eyeX: 0, eyeY: 0, headX: 0, headY: 0, confidence: 0 };
    var externalGazeSmoothX = 0, externalGazeSmoothY = 0;
    var externalGazeSmoothHeadX = 0, externalGazeSmoothHeadY = 0;

    // Lip sync
    var lipSyncTime = 0, lipSyncLastVal = 0;
    var typingActive = false;  // ★ mouth moves during text typing (even without TTS)
    var dialogueActive = false; // ★ full reply lifecycle flag (set from engine)

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 2 — Utility Functions
       ═══════════════════════════════════════════════════════════════════════════ */

    function loadScript(url) {
        return new Promise(function(ok, fail) {
            var s = document.createElement('script');
            s.src = url; s.onload = ok; s.onerror = function() { fail(new Error(url)); };
            document.head.appendChild(s);
        });
    }

    function loadImage(url) {
        return new Promise(function(ok, fail) {
            var i = new Image();
            i.onload = function() { ok(i); };
            i.onerror = function() { fail(new Error(url)); };
            i.src = url;
        });
    }

    /** ★ Chinese character → mouth openness heuristic (0=closed, 1=open) */
    function chineseMouthOpenness(char) {
        var code = char.charCodeAt(0);
        if (code < 0x4E00 || code > 0x9FFF) return 0.5; // non-CJK
        // Finals that open mouth wide: a, ang, ao, ai, ia, ua, ian, iang, etc.
        var openFinals = /[\u{6211}\u{4ED6}\u{5927}\u{53D1}\u{8BF4}\u{4E0B}\u{5BB6}\u{4E2D}\u{5C71}\u{770B}\u{5F00}\u{6765}\u{4E0A}\u{597D}\u{8001}\u{5E78}\u{96E8}]/u;
        // Finals that keep mouth mostly closed: i, u, ü, -i(zhi/chi/shi)
        var closeFinals = /[\u{7684}\u{4E00}\u{662F}\u{4E0D}\u{4E86}\u{5728}\u{4EBA}\u{6709}\u{8FD9}\u{4E2A}\u{4EEC}\u{6765}\u{5230}\u{65F6}]/u;
        if (openFinals.test(char)) return 0.8 + Math.random() * 0.2;
        if (closeFinals.test(char)) return 0.2 + Math.random() * 0.2;
        return 0.4 + Math.random() * 0.3;
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 3 — Canvas & GL Setup
       ═══════════════════════════════════════════════════════════════════════════ */

    function createCanvas() {
        var w = document.getElementById('spriteWrapper');
        canvas = document.createElement('canvas');
        canvas.id = 'live2dCanvas';
        if (w) {
            w.style.display = 'flex';
            w.style.alignItems = 'flex-end';
            w.style.justifyContent = 'center';
            w.style.pointerEvents = 'auto';  // ★ override gal-core.css's pointer-events:none
            requestAnimationFrame(function() {
                var h = w.clientHeight;
                if (h > 0) w.style.width = Math.round(h * 0.45) + 'px';
            });
        }
        // ★ Mood overlay + explicit pointer-events so drag/clicks reach document listeners
        canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:6;cursor:pointer;' +
            'transition: filter 0.8s ease;pointer-events:auto;';
        var si = document.getElementById('characterSprite');
        if (si) si.style.display = 'none';
        (w || document.body).appendChild(canvas);
    }

    function initGL() {
        var parent = canvas.parentElement;
        var dpr = window.devicePixelRatio || 1;
        var w = parent ? (parent.clientWidth || 300) : 300;
        var h = parent ? (parent.clientHeight || 600) : 600;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        gl = canvas.getContext('webgl2', { premultipliedAlpha: true })
          || canvas.getContext('webgl', { premultipliedAlpha: true });
        if (!gl) throw new Error('WebGL fail');
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 4 — Model Loading
       ═══════════════════════════════════════════════════════════════════════════ */

    /** ★ Parse model3.json to extract Sound/FadeIn/FadeOut per motion */
    function parseMotionMeta(path) {
        return fetch(path).then(function(r) { return r.ok ? r.json() : null; }).then(function(json) {
            if (!json || !json.FileReferences || !json.FileReferences.Motions) return;
            var motions = json.FileReferences.Motions;
            var meta = {};
            Object.keys(motions).forEach(function(groupName) {
                meta[groupName] = [];
                var list = motions[groupName];
                for (var i = 0; i < list.length; i++) {
                    meta[groupName].push({
                        sound: list[i].Sound || null,
                        fadeIn: list[i].FadeInTime || 0.5,
                        fadeOut: list[i].FadeOutTime || 0.5
                    });
                }
            });
            motionMeta = meta;
            console.log('[Live2D] Motion meta parsed — groups:', Object.keys(meta).join(','));
        }).catch(function() { /* model3.json parse non-critical */ });
    }

    /** ★ Load expression JSON data for crossfade blending */
    function loadExpressionData(home) {
        var F = window.Live2DCubismFramework;
        var ec = modelSetting.getExpressionCount();
        var loads = [];
        for (var e = 0; e < ec; e++) {
            (function(idx) {
                var en = modelSetting.getExpressionName(idx);
                var ef = modelSetting.getExpressionFileName(idx);
                if (!ef) return;
                loads.push(fetch(home + ef).then(function(r) {
                    return r.ok ? r.json() : null;
                }).then(function(json) {
                    if (json && json.Parameters) {
                        expressionData[en] = json.Parameters.map(function(p) {
                            return {
                                id: F.CubismFramework.getIdManager().getId(p.Id),
                                value: p.Value || 0,
                                blend: p.Blend || 'Add'
                            };
                        });
                    }
                }));
            })(e);
        }
        return Promise.all(loads).then(function() {
            var count = Object.keys(expressionData).length;
            console.log('[Live2D] Expression data loaded: ' + count);
        });
    }

    function loadMotionsAndExpressions(home) {
        var F = window.Live2DCubismFramework;
        motionManager = new F.CubismMotionManager();
        expressionManager = new F.CubismExpressionMotionManager();
        motionPool = {};
        expressionMap = {};

        var gc = modelSetting.getMotionGroupCount();
        var all = [];

        for (var g = 0; g < gc; g++) {
            var gn = modelSetting.getMotionGroupName(g);
            var mc = modelSetting.getMotionCount(gn);
            motionPool[gn] = [];
            for (var i = 0; i < mc; i++) {
                (function(groupName, idx) {
                    var fn = modelSetting.getMotionFileName(groupName, idx);
                    if (!fn) return;
                    all.push(fetch(home + fn).then(function(r) {
                        return r.ok ? r.arrayBuffer() : null;
                    }).then(function(buf) {
                        if (!buf) return;
                        try {
                            var m = F.CubismMotion.create(buf, buf.byteLength);
                            if (m) { m.setEffectIds([], []); motionPool[groupName].push(m); }
                        } catch (e) { /* skip */ }
                    }));
                })(gn, i);
            }
        }

        var ec = modelSetting.getExpressionCount();
        for (var e = 0; e < ec; e++) {
            (function(idx) {
                var en = modelSetting.getExpressionName(idx);
                var ef = modelSetting.getExpressionFileName(idx);
                if (!ef) return;
                all.push(fetch(home + ef).then(function(r) {
                    return r.ok ? r.arrayBuffer() : null;
                }).then(function(buf) {
                    if (!buf) return;
                    try {
                        var em = F.CubismExpressionMotion.create(buf, buf.byteLength);
                        if (em) expressionMap[en] = em;
                    } catch (e2) { /* skip */ }
                }));
            })(e);
        }

        return Promise.all(all).then(function() {
            var loaded = 0, exprLoaded = Object.keys(expressionMap).length;
            for (var _g = 0; _g < gc; _g++) {
                var _gn = modelSetting.getMotionGroupName(_g);
                loaded += motionPool[_gn].length;
            }
            console.log('[Live2D] Motions: ' + loaded + ' expressions: ' + exprLoaded);
        });
    }

    function loadModel(path) {
        var F = window.Live2DCubismFramework;
        var ls = path.lastIndexOf('/');
        var home = ls >= 0 ? path.substring(0, ls + 1) : '';
        modelHome = home;  // ★ capture for sound path resolution

        // ★ Parse motion meta in parallel with model loading
        parseMotionMeta(path);

        // model3.json
        return fetch(path).then(function(r) {
            if (!r.ok) throw new Error('model3 fail');
            return r.arrayBuffer();
        }).then(function(buf) {
            modelSetting = new F.CubismModelSettingJson(buf, buf.byteLength);
            // moc3
            var mf = modelSetting.getModelFileName();
            return fetch(home + mf);
        }).then(function(r) {
            if (!r.ok) throw new Error('moc3 fail');
            return r.arrayBuffer();
        }).then(function(buf) {
            var moc = F.CubismMoc.create(buf);
            model = moc.createModel();
            console.log('[Live2D] Model — ' + model.getParameterCount() + ' params');

            // Cache neutral-reset param indices
            var neutralNames = ['ParamAngleX','ParamAngleY','ParamAngleZ','ParamBodyAngleX'];
            neutralIdx = [];
            for (var _ni = 0; _ni < neutralNames.length; _ni++) {
                var h = F.CubismFramework.getIdManager().getId(neutralNames[_ni]);
                var idx = h ? model.getParameterIndex(h) : -1;
                if (idx >= 0) neutralIdx.push(idx);
            }
            console.log('[Live2D] Neutral reset idx: ' + neutralIdx.length);

            // Breath
            breath = F.CubismBreath.create();
            var idMgr = F.CubismFramework.getIdManager();
            breath.setParameters([
                new F.BreathParameterData(idMgr.getId(F.CubismDefaultParameterId.ParamAngleX),     0.0, 15.0, 6.5345, 0.5),
                new F.BreathParameterData(idMgr.getId(F.CubismDefaultParameterId.ParamAngleY),     0.0, 8.0,  3.5345, 0.5),
                new F.BreathParameterData(idMgr.getId(F.CubismDefaultParameterId.ParamAngleZ),     0.0, 10.0, 5.5345, 0.5),
                new F.BreathParameterData(idMgr.getId(F.CubismDefaultParameterId.ParamBodyAngleX), 0.0, 4.0,  15.5345, 0.5),
                new F.BreathParameterData(idMgr.getId(F.CubismDefaultParameterId.ParamBreath),     0.5, 0.5,  3.2345, 1.0),
            ]);
            console.log('[Live2D] Breath setup — 5 params');

            // Renderer
            renderer = new F.CubismRenderer_WebGL();
            renderer.initialize(model);

            // Model matrix
            modelMatrix = new F.CubismModelMatrix(model.getCanvasWidth(), model.getCanvasHeight());
            var layout = new Map();
            modelSetting.getLayoutMap(layout);
            if (layout.size > 0) modelMatrix.setupFromLayout(layout);

            // Textures
            var loads = [];
            var tc = modelSetting.getTextureCount();
            function loadTex(idx) {
                var f = modelSetting.getTextureFileName(idx);
                if (!f) return null;
                return loadImage(home + f).then(function(im) { return { im: im, idx: idx }; });
            }
            for (var ti = 0; ti < tc; ti++) { var p = loadTex(ti); if (p) loads.push(p); }
            return Promise.all(loads);
        }).then(function(imgs) {
            for (var j = 0; j < imgs.length; j++) {
                var im = imgs[j].im, idx = imgs[j].idx;
                var t = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, t);
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.generateMipmap(gl.TEXTURE_2D);
                renderer.bindTexture(idx, t);
            }
            console.log('[Live2D] ' + imgs.length + ' textures');

            // Blink + LipSync param IDs
            blinkIds = [];
            lipSyncIds = [];
            var bc = modelSetting.getEyeBlinkParameterCount();
            for (var _k = 0; _k < bc; _k++) blinkIds.push(modelSetting.getEyeBlinkParameterId(_k));
            var lc = modelSetting.getLipSyncParameterCount();
            for (var _k2 = 0; _k2 < lc; _k2++) lipSyncIds.push(modelSetting.getLipSyncParameterId(_k2));
            if (blinkIds.length === 0) {
                var imgr = F.CubismFramework.getIdManager();
                var eyeL = imgr.getId('ParamEyeLOpen');
                var eyeR = imgr.getId('ParamEyeROpen');
                if (eyeL) { var eIdx = model.getParameterIndex(eyeL); if (eIdx >= 0) blinkIds.push(eyeL); }
                if (eyeR) { var eIdx2 = model.getParameterIndex(eyeR); if (eIdx2 >= 0) blinkIds.push(eyeR); }
            }
            console.log('[Live2D] Blink: ' + blinkIds.length + ' LipSync: ' + lipSyncIds.length);

            // Pose
            var pf = modelSetting.getPoseFileName();
            if (pf) return fetch(home + pf).then(function(r) { return r.arrayBuffer(); }).then(function(buf) {
                try { pose = F.CubismPose.create(buf, buf.byteLength); } catch (e) {}
                console.log('[Live2D] Pose loaded');
            });
        }).then(function() {
            // Physics (hair/cloth sway)
            var phyf = modelSetting.getPhysicsFileName();
            if (phyf) return fetch(home + phyf).then(function(r) { return r.arrayBuffer(); }).then(function(buf) {
                try { physics = F.CubismPhysics.create(buf, buf.byteLength); } catch (e) {}
                console.log('[Live2D] Physics loaded');
            });
        }).then(function() {
            // ★ Load expression JSON data for crossfade
            return loadExpressionData(home);
        }).then(function() {
            // Motions & expressions
            return loadMotionsAndExpressions(home).catch(function(e) {
                console.warn('[Live2D] Motion/expression loading failed:', e.message);
            });
        }).then(function() {
            if (canvas.width > 0) renderer.setRenderTargetSize(canvas.width, canvas.height);
            renderer.startUp(gl);
            renderer.setIsPremultipliedAlpha(true);
            renderer.loadShaders(shaderPath);
            return new Promise(function(r) { setTimeout(r, 1500); });
        }).then(function() {
            console.log('[Live2D] Loaded — masks=' + model.isUsingMasking() + ' blend=' + model.isBlendModeEnabled());
        });
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 5 — Expression Crossfade (★ v7)
       ═══════════════════════════════════════════════════════════════════════════ */

    /** Snapshot currently-active expression params (for crossfade FROM state) */
    function snapshotExpression(name) {
        var data = expressionData[name];
        if (!data) return { name: name, params: [] };
        // Clone the adjustment values
        return {
            name: name,
            params: data.map(function(d) { return { id: d.id, value: d.value, blend: d.blend }; })
        };
    }

    /** Apply an expression with a given weight (0..1) to model */
    function applyExpressionWeight(exprSnapshot, weight) {
        if (!exprSnapshot || weight <= 0) return;
        var params = exprSnapshot.params;
        for (var i = 0; i < params.length; i++) {
            var p = params[i];
            try {
                // Haru expressions all use 'Add' blend; add with weight
                if (p.blend === 'Add' || p.blend === 'Overwrite') {
                    model.addParameterValueById(p.id, p.value * weight, 1.0);
                } else if (p.blend === 'Multiply') {
                    // Multiply: lerp identity(1) → factor. Rarely used, safe fallback.
                    var idx = model.getParameterIndex(p.id);
                    if (idx >= 0) {
                        var cur = model.getParameterValueByIndex(idx);
                        model.setParameterValueByIndex(idx, cur * (1.0 + (p.value - 1.0) * weight), 1.0);
                    }
                }
            } catch (e) {}
        }
    }

    function updateExpressionCrossfade(dt) {
        if (!exprTo) return;
        exprFadeT += dt * exprFadeSpeed;
        if (exprFadeT >= 1.0) {
            // Crossfade complete — stabilise at target, keep manual blend active
            exprFrom = exprTo;
            exprTo = null;
            exprFadeT = 1.0;
            // Note: we never hand off to expressionManager because it's never
            // updated in our render loop. Manual blend stays active permanently.
        }
    }

    /** ★ Apply expression to model each frame (manual blend, always active after first emotion) */
    function applyExpressionBlend() {
        if (!exprFrom && !exprTo) return;
        if (exprTo) {
            // Mid-transition: blend from→to
            var t = Math.min(1.0, exprFadeT);
            if (exprFrom) applyExpressionWeight(exprFrom, 1.0 - t);
            applyExpressionWeight(exprTo, t);
        } else if (exprFrom && exprFadeT >= 1.0) {
            // Stable: apply current expression at full weight
            applyExpressionWeight(exprFrom, 1.0);
        }
    }

    function applyEmotion(name) {
        if (!ready) return;
        // ★ Map ALL emotion names (not just 6) so the fallback playMotion() never fires during dialogue
        var hMap = {
            happy: 'F01', shy: 'F02', angry: 'F03', sad: 'F04',
            thinking: 'F05', surprised: 'F06',
            gentle: 'F01', worried: 'F04', nostalgic: 'F02', normal: 'F01'
        };
        var expName = hMap[name] || 'F01';

        // If expression data not available, skip (never fall back to playMotion during dialogue)
        if (!expressionData[expName]) {
            console.log('[Live2D] No expression data for ' + expName + ', skipping');
            return;
        }

        // Already at target and fully stable? Skip.
        var currentName = (exprTo || exprFrom || {}).name;
        if (currentName === expName && !exprTo) return;

        // Initiate crossfade: snapshot the currently-visible state as FROM
        exprFrom = (exprTo) ? exprTo : snapshotExpression(currentName || expName);
        exprTo = snapshotExpression(expName);
        exprFadeT = 0.0;
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 6 — Motion Priority & Sound Effects (★ v7)
       ═══════════════════════════════════════════════════════════════════════════ */

    function getAudioPlayer() {
        // Reuse a finished player or create new one
        for (var i = 0; i < audioPool.length; i++) {
            if (audioPool[i].paused || audioPool[i].ended) return audioPool[i];
        }
        if (audioPool.length < MAX_AUDIO) {
            var a = new Audio();
            audioPool.push(a);
            return a;
        }
        // Recycle oldest
        var oldest = audioPool.shift();
        oldest.pause(); oldest.currentTime = 0;
        audioPool.push(oldest);
        return oldest;
    }

    function playMotion(groupName, priority) {
        // ★ Block ALL motions during dialogue — even silent ones interfere with lip sync params
        if (dialogueActive) return false;
        if (!motionManager || !motionPool[groupName] || motionPool[groupName].length === 0) return false;
        // ★ Priority check: don't interrupt higher-priority motions
        if (!motionManager.isFinished() && priority > currentMotionPriority) return false;
        // Don't interrupt same-priority
        if (!motionManager.isFinished() && priority === currentMotionPriority && priority !== MOTION_PRIORITY.SPECIAL) return false;

        var idx = Math.floor(Math.random() * motionPool[groupName].length);
        var m = motionPool[groupName][idx];
        try {
            // ★ Apply fade-in/fade-out from model3.json metadata for smooth transitions
            if (motionMeta[groupName] && motionMeta[groupName][idx]) {
                if (motionMeta[groupName][idx].fadeIn)  m.setFadeInTime(motionMeta[groupName][idx].fadeIn);
                if (motionMeta[groupName][idx].fadeOut) m.setFadeOutTime(motionMeta[groupName][idx].fadeOut);
            }
            motionManager.startMotion(m, false);
            currentMotionPriority = priority;

            // ★ Play associated sound (playMotion is already blocked during dialogueActive)
            if (!isSpeaking && !typingActive &&
                motionMeta[groupName] && motionMeta[groupName][idx] && motionMeta[groupName][idx].sound) {
                var soundPath = motionMeta[groupName][idx].sound;
                var audio = getAudioPlayer();
                audio.src = modelHome + soundPath;
                audio.volume = 0.6;
                audio.play().catch(function() { /* autoplay blocked, ignore */ });
            }
            return true;
        } catch (e) { return false; }
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 7 — Eye Blink & Micro-Saccade (★ v7 enhanced)
       ═══════════════════════════════════════════════════════════════════════════ */

    function updateEyeBlink(dt) {
        if (blinkIds.length === 0 || !model) return;
        blinkTimer += dt;
        var val = 1.0;
        if (blinkState === 0) {
            val = 1.0;
            if (blinkTimer >= blinkNext) { blinkState = 1; blinkTimer = 0; }
        } else if (blinkState === 1) {
            val = 1.0 - Math.min(1.0, blinkTimer / 0.08);
            if (blinkTimer >= 0.08) { blinkState = 2; blinkTimer = 0; }
        } else if (blinkState === 2) {
            val = 0.0;
            if (blinkTimer >= 0.04) { blinkState = 3; blinkTimer = 0; }
        } else {
            val = Math.min(1.0, blinkTimer / 0.08);
            if (blinkTimer >= 0.08) {
                blinkState = 0; blinkTimer = 0;
                blinkNext = 2.5 + Math.random() * 4.0;
            }
        }
        for (var i = 0; i < blinkIds.length; i++) {
            try { model.setParameterValueById(blinkIds[i], val, 1.0); } catch (e) {}
        }
    }

    /** ★ Micro-saccade: tiny random eye jitter for natural gaze */
    function updateSaccade(dt) {
        saccadeTimer += dt;
        if (saccadeTimer >= saccadeInterval) {
            saccadeTimer = 0;
            saccadeInterval = 1.5 + Math.random() * 3.0;
            // Pick a random micro-offset (±0.15 range for subtle twitch)
            saccadeTargetX = (Math.random() - 0.5) * 0.3;
            saccadeTargetY = (Math.random() - 0.5) * 0.2;
        }
        // Fast lerp for snappy saccade
        var lerp = Math.min(1.0, dt * 20.0);
        saccadePrevX = saccadeX; saccadePrevY = saccadeY;  // ★ save previous for delta-add
        saccadeX += (saccadeTargetX - saccadeX) * lerp;
        saccadeY += (saccadeTargetY - saccadeY) * lerp;
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 8 — Lip Sync (★ TTS boundary-driven + procedural fallback)
       ═══════════════════════════════════════════════════════════════════════════ */

    var lipSyncSeq = 0, lipSyncActiveSeq = 0;

    function startLipSync() {
        lipSyncActiveSeq = ++lipSyncSeq;
        isSpeaking = true; lipSyncTime = 0;
        // Don't clear typingActive — if TTS ends before UI typing animation,
        // the procedural fallback keeps the mouth moving.
        if (updateLipSync._mouthIdx === undefined && model) {
            var F = window.Live2DCubismFramework;
            var mouthHandle = F.CubismFramework.getIdManager().getId('ParamMouthOpenY');
            updateLipSync._mouthIdx = mouthHandle ? model.getParameterIndex(mouthHandle) : -1;
        }
    }

    function stopLipSync() {
        isSpeaking = false;
        // Don't touch typingActive — UI typing animation may still be running
        ttsMouthPulses = [];
    }

    /** ★ Mouth moves during text typing phase (no TTS needed) */
    function startTypingLipSync() {
        typingActive = true; lipSyncTime = 0;
        if (updateLipSync._mouthIdx === undefined && model) {
            var F = window.Live2DCubismFramework;
            var mouthHandle = F.CubismFramework.getIdManager().getId('ParamMouthOpenY');
            updateLipSync._mouthIdx = mouthHandle ? model.getParameterIndex(mouthHandle) : -1;
        }
    }

    function stopTypingLipSync() {
        typingActive = false;
        ttsMouthPulses = [];
    }

    function stopTypingLipSync() {
        typingActive = false;  // isSpeaking may still be true (TTS follows typing)
        ttsMouthPulses = [];
    }

    /** ★ Called by engine at start of full reply lifecycle. Suppresses all motion sounds. */
    function startDialogue() { dialogueActive = true; }
    function endDialogue()   { dialogueActive = false; }

    /** ★ Called by EpilogueTTS on word boundary */
    function onTtsBoundary(info) {
        if (!isSpeaking || !model) return;
        // Extract the current word from cleanText
        var word = (info.cleanText || '').substring(info.charIndex, info.charIndex + (info.charLength || 1));
        if (!word) return;
        // Calculate openness from word characters
        var openness = 0;
        for (var i = 0; i < word.length; i++) {
            openness += chineseMouthOpenness(word[i]);
        }
        openness = Math.min(1.0, openness / Math.max(1, word.length));
        // Longer words → slightly bigger mouth
        openness *= 0.5 + 0.5 * Math.min(1, word.length / 4);
        // Add pulse: rapid open → slow decay
        ttsMouthPulses.push({ target: Math.max(0.25, openness), decay: 8.0 + Math.random() * 4.0, age: 0 });
        // Cap pulses
        if (ttsMouthPulses.length > 5) ttsMouthPulses.shift();
    }

    function updateLipSync(dt) {
        if (!model) return;

        // ★ Fix: use !== undefined instead of ! (0 is falsy but valid param index)
        if (updateLipSync._mouthIdx === undefined) {
            var F = window.Live2DCubismFramework;
            var mouthHandle = F.CubismFramework.getIdManager().getId('ParamMouthOpenY');
            updateLipSync._mouthIdx = mouthHandle ? model.getParameterIndex(mouthHandle) : -1;
            if (updateLipSync._mouthIdx < 0 && lipSyncIds.length > 0) {
                updateLipSync._mouthIdx = model.getParameterIndex(lipSyncIds[0]);
            }
            console.log('[Live2D] LipSync mouthIdx=' + updateLipSync._mouthIdx + ' (resolved)');
        }
        if (updateLipSync._mouthIdx < 0) return;

        lipSyncTime += dt;

        var target;
        if (isSpeaking || typingActive) {
            // ★ TTS boundary pulses: sum active pulse contributions
            var pulseSum = 0, activePulses = 0;
            for (var i = ttsMouthPulses.length - 1; i >= 0; i--) {
                var p = ttsMouthPulses[i];
                p.age += dt;
                var contribution = p.target * Math.exp(-p.decay * p.age);
                if (contribution < 0.01) {
                    ttsMouthPulses.splice(i, 1);
                } else {
                    pulseSum += contribution;
                    activePulses++;
                }
            }

            if (activePulses > 0) {
                // Blend boundary-driven pulses with gentle sine background
                var procedural = (Math.sin(lipSyncTime * 7.0) * 0.5 + 0.5) * 0.15 + 0.05;
                target = Math.max(procedural, Math.min(0.9, pulseSum / Math.sqrt(activePulses)));
                // Smooth the pulse-driven value
                ttsPulseSmooth += (target - ttsPulseSmooth) * Math.min(1.0, dt * 14.0);
                target = ttsPulseSmooth;
            } else {
                // ★ Procedural oscillator for typing (no TTS pulses)
                var freq = 0.8 + Math.sin(lipSyncTime * 0.37) * 0.3;
                var phase = lipSyncTime * freq * Math.PI * 2;
                var mainWave = (Math.sin(phase) * 0.5 + 0.5) * 0.55 + 0.08;
                var subWave = Math.sin(lipSyncTime * 11.3 + 1.7) * 0.14;
                var rhythm = Math.sin(lipSyncTime * 2.3) * 0.10;
                target = mainWave + subWave + rhythm;
                var consonant = Math.sin(lipSyncTime * 5.2);
                if (consonant > 0.95) target *= 0.08;
                target = Math.max(0.02, Math.min(0.85, target));
            }
        } else {
            target = 0;
            ttsPulseSmooth = 0;
            ttsMouthPulses = [];
        }

        // Smooth interpolation toward target
        var smoothing = isSpeaking ? 14.0 : 12.0;
        var current = lipSyncLastVal + (target - lipSyncLastVal) * Math.min(1.0, dt * smoothing);
        lipSyncLastVal = current;

        try { model.setParameterValueByIndex(updateLipSync._mouthIdx, current, 1.0); } catch (e) {}
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 9 — Mouse Tracking & Drag/Poke (★ v7 enhanced)
       ═══════════════════════════════════════════════════════════════════════════ */

    function setupMouse() {
        var F = window.Live2DCubismFramework;
        var imgr = F.CubismFramework.getIdManager();
        var spec = [
            { name: 'ParamAngleX',     scale: 30,  axis: 1 },
            { name: 'ParamAngleY',     scale: 30,  axis: 0 },
            { name: 'ParamAngleZ',     scale: -30, axis: 0 },
            { name: 'ParamBodyAngleX', scale: 10,  axis: 1 },
            { name: 'ParamEyeBallX',   scale: 1,   axis: 0 },
            { name: 'ParamEyeBallY',   scale: 1,   axis: 1 },
        ];
        trackParams = [];
        for (var i = 0; i < spec.length; i++) {
            var h = imgr.getId(spec[i].name);
            if (h) {
                var idx = model.getParameterIndex(h);
                if (idx >= 0) trackParams.push({ idx: idx, scale: spec[i].scale, axis: spec[i].axis });
            }
        }
        console.log('[Live2D] Mouse track params: ' + trackParams.length);

        // ★ Drag handles: assign to module-level variable (applyDragOffset reads it)
        dragHandles = [];
        (function() {
            var names = [
                { id: 'ParamAngleX',     axis: 1, scale: -20 },
                { id: 'ParamAngleY',     axis: 0, scale:  20 },
                { id: 'ParamAngleZ',     axis: 0, scale: -12 },
                { id: 'ParamBodyAngleX', axis: 1, scale:  -6 },
            ];
            for (var n = 0; n < names.length; n++) {
                var hid = imgr.getId(names[n].id);
                if (hid) dragHandles.push({ id: hid, axis: names[n].axis, scale: names[n].scale });
            }
            console.log('[Live2D] Drag handles: ' + dragHandles.length);
        })();

        // ★ Check if event coords fall within the sprite/character area
        function isOverCanvas(clientX, clientY) {
            var sw = document.getElementById('spriteWrapper');
            if (sw) {
                var r = sw.getBoundingClientRect();
                if (r.width > 10 && r.height > 10) {
                    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
                }
            }
            if (canvas) {
                var r2 = canvas.getBoundingClientRect();
                if (r2.width > 10 && r2.height > 10) {
                    return clientX >= r2.left && clientX <= r2.right && clientY >= r2.top && clientY <= r2.bottom;
                }
            }
            return false;
        }

        function getNormalizedPos(clientX, clientY) {
            var r = canvas.getBoundingClientRect();
            if (!r || r.width === 0) return { x: 0, y: 0 };
            return {
                x: ((clientX - r.left) / r.width  - 0.5) * 2,
                y: ((clientY - r.top)  / r.height - 0.5) * 2
            };
        }

        // ── Bind to DOCUMENT (not spriteWrapper) because epilogueContainer z-index:50
        //     blocks events to spriteWrapper's event listeners.
        // ── Mouse ──
        document.addEventListener('mousedown', function(e) {
            var over = isOverCanvas(e.clientX, e.clientY);
            if (!over) return;
            dragPending = true; dragActive = false;
            dragOriginX = e.clientX; dragOriginY = e.clientY;
            dragCurX = e.clientX; dragCurY = e.clientY;
            console.log('[Drag] pending — down at', e.clientX, e.clientY);
        }, true);
        document.addEventListener('mousemove', function(e) {
            if (dragActive) {
                dragCurX = e.clientX; dragCurY = e.clientY;
            } else if (dragPending) {
                var dx = e.clientX - dragOriginX, dy = e.clientY - dragOriginY;
                var dist = Math.abs(dx) + Math.abs(dy);
                if (dist >= dragThreshold) {
                    console.log('[Drag] promote — moved', dist.toFixed(1), 'px ≥', dragThreshold);
                    dragActive = true; dragPending = false;
                    dragCurX = e.clientX; dragCurY = e.clientY;
                }
            } else {
                var np = getNormalizedPos(e.clientX, e.clientY);
                trackTargetX = np.x; trackTargetY = np.y;
            }
        }, true);
        document.addEventListener('mouseup', function() {
            if (dragActive) {
                dragReleaseDX = dragCurX - dragOriginX;
                dragReleaseDY = dragCurY - dragOriginY;
                dragReleaseAge = 0;
                dragActive = false;
                applyDragOffset._activeLogged = false;
                console.log('[Drag] release — dx=' + dragReleaseDX.toFixed(1) + ' dy=' + dragReleaseDY.toFixed(1) + ' lerp start');
            } else if (dragPending) {
                dragPending = false;
                // ★ Click: NO release lerp. Motion plays normally from current pose.
                console.log('[Drag] click — pending cleared, playing TapBody');
                if (motionPool && motionPool['TapBody'] && motionPool['TapBody'].length > 0) {
                    playMotion('TapBody', MOTION_PRIORITY.TAP);
                }
            }
            trackTargetX = 0; trackTargetY = 0;
        }, true);
        document.addEventListener('mouseleave', function() {
            if (dragActive) {
                dragReleaseDX = dragCurX - dragOriginX;
                dragReleaseDY = dragCurY - dragOriginY;
                dragReleaseAge = 0;
                console.log('[Drag] leave — dx=' + dragReleaseDX.toFixed(1) + ' dy=' + dragReleaseDY.toFixed(1) + ' lerp start');
            } else if (dragPending) {
                console.log('[Drag] leave-cancel — pending cleared');
            }
            trackTargetX = 0; trackTargetY = 0;
            dragPending = false; dragActive = false;
        });

        // ── Touch ──
        document.addEventListener('touchstart', function(e) {
            if (e.touches.length === 0) return;
            if (!isOverCanvas(e.touches[0].clientX, e.touches[0].clientY)) return;
            dragPending = true; dragActive = false;
            dragOriginX = e.touches[0].clientX; dragOriginY = e.touches[0].clientY;
            dragCurX = e.touches[0].clientX; dragCurY = e.touches[0].clientY;
            console.log('[Drag] touch-pending');
        }, { passive: true });
        document.addEventListener('touchmove', function(e) {
            if (e.touches.length === 0) return;
            var tx = e.touches[0].clientX, ty = e.touches[0].clientY;
            if (dragActive) {
                dragCurX = tx; dragCurY = ty;
            } else if (dragPending) {
                var tdx = tx - dragOriginX, tdy = ty - dragOriginY;
                var tdist = Math.abs(tdx) + Math.abs(tdy);
                if (tdist >= dragThreshold * 2) {
                    console.log('[Drag] touch-promote — moved', tdist.toFixed(1), 'px');
                    dragActive = true; dragPending = false;
                    dragCurX = tx; dragCurY = ty;
                }
            }
        });
        document.addEventListener('touchend', function() {
            if (dragActive) {
                dragReleaseDX = dragCurX - dragOriginX;
                dragReleaseDY = dragCurY - dragOriginY;
                dragReleaseAge = 0;
                dragActive = false;
                console.log('[Drag] touch-release — lerp start');
            } else if (dragPending) {
                dragPending = false;
                console.log('[Drag] touch-click — playing TapBody');
                if (motionPool && motionPool['TapBody'] && motionPool['TapBody'].length > 0) {
                    playMotion('TapBody', MOTION_PRIORITY.TAP);
                }
            }
            trackTargetX = 0; trackTargetY = 0;
        });
        document.addEventListener('touchcancel', function() {
            trackTargetX = 0; trackTargetY = 0;
            dragPending = false; dragActive = false;
        });
    }

    function updateMouseTrack(dt) {
        if (trackParams.length === 0 || !model) return;

        // ★ Gaze source: 'off' — skip all tracking
        if (gazeSource === 'off') return;

        // ★ During drag: skip angle/body track (drag sets them absolutely); keep eye tracking
        if (dragActive) {
            trackPrevX = trackCurX; trackPrevY = trackCurY;
            trackCurX = 0; trackCurY = 0;
            return;  // drag handles head/body params; eye params can rest
        }

        // ── Smooth external gaze data (only when external source is active) ──
        var isExternal = gazeSource === 'external';
        if (isExternal) {
            var extLerp = Math.min(1.0, dt * 8.0);
            externalGazeSmoothX += (externalGaze.eyeX - externalGazeSmoothX) * extLerp;
            externalGazeSmoothY += (externalGaze.eyeY - externalGazeSmoothY) * extLerp;
            externalGazeSmoothHeadX += (externalGaze.headX - externalGazeSmoothHeadX) * extLerp;
            externalGazeSmoothHeadY += (externalGaze.headY - externalGazeSmoothHeadY) * extLerp;
        }

        // ── Mouse tracking (skip in external mode — uses its own data source) ──
        var dx = 0, dy = 0;
        if (!isExternal) {
            var lerp = Math.min(1.0, dt * 6.0);
            trackCurX += (trackTargetX - trackCurX) * lerp;
            trackCurY += (trackTargetY - trackCurY) * lerp;
            dx = trackCurX - trackPrevX;
            dy = trackCurY - trackPrevY;
            trackPrevX = trackCurX;
            trackPrevY = trackCurY;
        }

        // ★ Blend in saccade offset for eye params (delta-add to avoid drift)
        for (var i = 0; i < trackParams.length; i++) {
            var p = trackParams[i];
            var delta = 0;

            if (isExternal) {
                // ── External gaze: use absolute eye position, delta-add for smooth transition ──
                if (Math.abs(p.scale) <= 1.5) {
                    // Eye ball params — track absolute gaze position
                    var targetVal = (p.axis === 0 ? externalGazeSmoothX : externalGazeSmoothY) * p.scale;
                    // Get current value and compute delta toward target
                    var curVal = 0;
                    try { curVal = model.getParameterValueByIndex(p.idx); } catch(e) {}
                    delta = (targetVal - curVal) * Math.min(1.0, dt * 10.0);
                    // Also blend in saccade for micro-movement
                    var saccadeDelta = (p.axis === 0 ? (saccadeX - saccadePrevX) : (saccadeY - saccadePrevY)) * 0.3;
                    delta += saccadeDelta;
                } else if (Math.abs(p.scale) >= 10) {
                    // Head/body angle params — blend external head position with current mouse
                    var headTarget = (p.axis === 0 ? externalGazeSmoothHeadX : externalGazeSmoothHeadY);
                    var headCur = 0;
                    try { headCur = model.getParameterValueByIndex(p.idx); } catch(e) {}
                    delta = (headTarget * p.scale * 0.4 - headCur) * Math.min(1.0, dt * 4.0);
                }
            } else {
                // ── Mouse mode: delta-add from mouse movement ──
                delta = (p.axis === 0 ? dx : dy) * p.scale;
                // Eye ball params: add saccade CHANGE (not absolute) to avoid accumulation
                if (Math.abs(p.scale) <= 1.5) {
                    var saccadeD = (p.axis === 0 ? (saccadeX - saccadePrevX) : (saccadeY - saccadePrevY)) * 0.5;
                    delta += saccadeD;
                }
            }

            if (Math.abs(delta) > 0.0005) {
                try { model.addParameterValueByIndex(p.idx, delta, 1.0); } catch (e) {}
            }
        }
    }

    /** ★ Called every frame. Active drag → absolute set. Released → lerp px deltas → 0. */
    function applyDragOffset(dt) {
        if (dragHandles.length === 0 || !model) return;
        if (!dragActive && dragReleaseAge >= dragReleaseDuration) return;  // skip when fully idle

        var rr = canvas && canvas.getBoundingClientRect();
        if (!rr || rr.width < 10) return;  // canvas not sized yet

        // ── Released but still lerping back ──
        if (!dragActive && dragReleaseAge < dragReleaseDuration) {
            if (dragReleaseAge === 0) console.log('[Drag] lerp start — dx=' + dragReleaseDX.toFixed(1) + ' dy=' + dragReleaseDY.toFixed(1) + ' dur=' + dragReleaseDuration.toFixed(1));
            dragReleaseAge += dt;
            var t = Math.min(1.0, dragReleaseAge / dragReleaseDuration);
            // Quintic ease-out: 1→0 over duration
            var ease = Math.pow(1.0 - t, 2);  // quadratic ease-out: gentle throughout
            // Normalise pixel deltas to Cubism range each frame (handles resize)
            var noX = (dragReleaseDX / rr.width)  * 2;
            var noY = (dragReleaseDY / rr.height) * 2;
            for (var d = 0; d < dragHandles.length; d++) {
                var dh = dragHandles[d];
                var rawOff = (dh.axis === 0 ? noX : noY);
                var val = rawOff * ease * dh.scale;
                try { model.setParameterValueById(dh.id, val, 1.0); } catch (e) {}
            }
            return;
        }

        // ── Active drag ──
        if (!dragActive) return;
        if (!applyDragOffset._activeLogged) { applyDragOffset._activeLogged = true; console.log('[Drag] active — applying offset each frame'); }
        var offX = (dragCurX - dragOriginX) / rr.width  * 2;
        var offY = (dragCurY - dragOriginY) / rr.height * 2;
        for (var de = 0; de < dragHandles.length; de++) {
            var dh2 = dragHandles[de];
            var voff = (dh2.axis === 0 ? offX : offY);
            var val2 = Math.max(-1, Math.min(1, voff)) * dh2.scale;
            try { model.setParameterValueById(dh2.id, val2, 1.0); } catch (e) {}
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 10 — Wind System (v6 retained, minor tuning)
       ═══════════════════════════════════════════════════════════════════════════ */

    function updateWind(dt) {
        if (!model) return;
        if (windIdxList.length === 0 && !updateWind._resolved) {
            updateWind._resolved = true;
            var F = window.Live2DCubismFramework;
            var imgr = F.CubismFramework.getIdManager();
            var names = ['ParamBodyAngleX', 'ParamBodyAngleY'];
            for (var i = 0; i < names.length; i++) {
                var h = imgr.getId(names[i]);
                if (h) { var idx = model.getParameterIndex(h); if (idx >= 0) windIdxList.push(idx); }
            }
            console.log('[Live2D] Wind params resolved: ' + windIdxList.length);
        }
        if (windIdxList.length === 0) return;

        windTimer += dt;
        if (windTimer >= windChangeTime) {
            windTimer = 0;
            if (Math.random() < 0.1) {
                windTargetX = (Math.random() - 0.5) * 1.6;
                windTargetY = (Math.random() - 0.5) * 0.8;
                windChangeTime = 1.5 + Math.random() * 2.0;
            } else {
                windTargetX = (Math.random() - 0.5) * 0.3;
                windTargetY = (Math.random() - 0.5) * 0.15;
                windChangeTime = 3.0 + Math.random() * 5.0;
            }
        }

        var lerp = Math.min(1.0, dt * 2.0);
        var prevX = windX, prevY = windY;
        windX += (windTargetX - windX) * lerp;
        windY += (windTargetY - windY) * lerp;

        var dx = windX - prevX, dy = windY - prevY;
        if (Math.abs(dx) > 0.0001) try { model.addParameterValueByIndex(windIdxList[0], dx * 5, 1.0); } catch (e) {}
        if (Math.abs(dy) > 0.0001 && windIdxList.length > 1) try { model.addParameterValueByIndex(windIdxList[1], dy * 3, 1.0); } catch (e) {}
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 11 — Idle Motion (v6 retained, uses priority system)
       ═══════════════════════════════════════════════════════════════════════════ */

    var _idleStarted = false;
    function tryIdle() {
        if (isSpeaking || typingActive) return;  // ★ don't interrupt dialogue
        if (!motionManager || idleCooldown || idleTimer) return;
        if (!motionManager.isFinished()) return;
        if (dragActive || dragPending) return;  // ★ don't idle during drag

        idleCooldown = true;
        var delay = _idleStarted ? (2000 + Math.random() * 3000) : 10;
        _idleStarted = true;
        idleTimer = setTimeout(function() {
            idleTimer = null; idleCooldown = false;
            var groups = Object.keys(motionPool);
            var g = groups.filter(function(x) { return x.toLowerCase().indexOf('idle') >= 0; })[0] || groups[0];
            if (!g) return;
            playMotion(g, MOTION_PRIORITY.IDLE);
        }, delay);
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 12 — Canvas Mood Overlay (★ v7)
       ═══════════════════════════════════════════════════════════════════════════ */

    var lastMoodStyle = '';

    /** ★ Apply CSS filter to Live2D canvas for scene mood blending */
    function setMoodOverlay(mood) {
        if (!canvas) return;
        var filter = '';
        switch (mood) {
            case 'warm':    filter = 'brightness(1.08) saturate(1.15) sepia(0.15)'; break;
            case 'cool':    filter = 'brightness(0.95) saturate(0.85) hue-rotate(-10deg)'; break;
            case 'dark':    filter = 'brightness(0.7) saturate(0.7)'; break;
            case 'sepia':   filter = 'sepia(0.5) brightness(0.9)'; break;
            case 'bright':  filter = 'brightness(1.15) saturate(1.1)'; break;
            case 'blur':    filter = 'blur(1px) brightness(0.95)'; break;
            case 'vignette': filter = 'brightness(0.85) contrast(1.05)'; break;
            case 'flash':   filter = 'brightness(1.5)'; break;
            case '':        filter = ''; break;
            default:        filter = ''; break;
        }
        if (filter !== lastMoodStyle) {
            lastMoodStyle = filter;
            canvas.style.filter = filter;
            // Auto-reset flash after 200ms
            if (mood === 'flash') {
                setTimeout(function() {
                    if (canvas && lastMoodStyle === filter) {
                        canvas.style.filter = '';
                        lastMoodStyle = '';
                    }
                }, 250);
            }
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 13 — Render Loop (★ FPS cap + visibility + mood)
       ═══════════════════════════════════════════════════════════════════════════ */

    function startLoop() {
        prev = performance.now();
        lastRenderTime = 0;
        var F = window.Live2DCubismFramework;
        var off = F.CubismWebGLOffscreenManager.getInstance();

        function tick(now) {
            // ★ Visibility check: skip rendering when page hidden
            if (!pageVisible) {
                af = requestAnimationFrame(tick);
                return;
            }

            var dt = Math.min((now - prev) / 1000, 0.1);
            prev = now;

            // Resize canvas if needed
            var p = canvas && canvas.parentElement;
            if (p) {
                var dpr = window.devicePixelRatio || 1;
                var pw = Math.round(p.clientWidth * dpr), ph = Math.round(p.clientHeight * dpr);
                if (pw > 0 && ph > 0 && (canvas.width !== pw || canvas.height !== ph)) {
                    canvas.width = pw; canvas.height = ph;
                    if (renderer) renderer.setRenderTargetSize(pw, ph);
                }
            }
            var cw = canvas.width, ch = canvas.height;
            if (cw <= 0 || ch <= 0) { af = requestAnimationFrame(tick); return; }

            off.beginFrameProcess(gl);

            var proj = new F.CubismMatrix44();
            if (model.getCanvasWidth() > 1.0 && cw < ch) {
                modelMatrix.setWidth(2.0);
                proj.scale(1.0, cw / ch);
            } else {
                proj.scale(ch / cw, 1.0);
            }

            // ── State updates (run every frame) ──
            var hasMotion = motionManager && !motionManager.isFinished();
            if (hasMotion) {
                tick._prevHasMotion = true;
                model.loadParameters();
                try { motionManager.updateMotion(model, dt); } catch (e) { motionManager.stopAllMotions(); }
                model.saveParameters();
            } else {
                // ★ Motion just ended? Snapshot angle params for smooth lerp back to neutral.
                if (tick._prevHasMotion && neutralIdx.length > 0 && !dragActive && dragReleaseAge >= dragReleaseDuration) {
                    postMotionLerpValues = {};
                    for (var _ni = 0; _ni < neutralIdx.length; _ni++) {
                        try {
                            postMotionLerpValues[neutralIdx[_ni]] = model.getParameterValueByIndex(neutralIdx[_ni]);
                        } catch (e) { postMotionLerpValues[neutralIdx[_ni]] = 0; }
                    }
                    postMotionLerpActive = true;
                    postMotionLerpAge = 0;
                }
                tick._prevHasMotion = false;
                currentMotionPriority = 0;
                // ★ Neutral reset only when fully idle (no drag, no release lerp, no post-motion lerp)
                if (!dragActive && dragReleaseAge >= dragReleaseDuration && !postMotionLerpActive) {
                    for (var _ni2 = 0; _ni2 < neutralIdx.length; _ni2++) {
                        try { model.setParameterValueByIndex(neutralIdx[_ni2], 0, 1.0); } catch (e) {}
                    }
                }
            }
            if (breath) breath.updateParameters(model, dt);
            updateWind(dt);
            updateMouseTrack(dt);
            updateSaccade(dt);            // ★ saccade
            updateEyeBlink(dt);
            updateLipSync(dt);
            updateExpressionCrossfade(dt); // ★ expression crossfade
            if (pose) pose.updateParameters(model, dt);
            if (physics) physics.evaluate(model, dt);

            // ★ No long-press promotion — touchpad hardware latency varies too much.
            //    Pending stays pending until moved ≥ dragThreshold px or released.
            // ★ Post-motion lerp: skip during active drag or release lerp
            if (postMotionLerpActive && !dragActive && dragReleaseAge >= dragReleaseDuration) {
                postMotionLerpAge += dt;
                var plT = Math.min(1.0, postMotionLerpAge / postMotionLerpDuration);
                var plEase = Math.pow(1.0 - plT, 2);
                for (var pli = 0; pli < neutralIdx.length; pli++) {
                    var plIdx = neutralIdx[pli];
                    var plStart = postMotionLerpValues[plIdx] || 0;
                    try { model.setParameterValueByIndex(plIdx, plStart * plEase, 1.0); } catch (e) {}
                }
                if (plT >= 1.0) postMotionLerpActive = false;
            }

            applyDragOffset(dt);

            // ★ Apply expression blend every frame (outside FPS cap so blends stay smooth)
            applyExpressionBlend();
            model.update();
            tryIdle();

            // ── Render (★ FPS cap: throttle drawModel) ──
            var shouldRender = (now - lastRenderTime) >= fpsInterval;
            if (shouldRender) {
                lastRenderTime = now;
                proj.multiplyByMatrix(modelMatrix);
                renderer.setMvpMatrix(proj);
                renderer.setRenderState(null, [0, 0, cw, ch]);
                renderer.drawModel(shaderPath);
            }

            off.endFrameProcess(gl);
            off.releaseStaleRenderTextures(gl);
            af = requestAnimationFrame(tick);
        }
        af = requestAnimationFrame(tick);

        // ★ Visibility listener
        document.addEventListener('visibilitychange', function() {
            pageVisible = !document.hidden;
            if (pageVisible) {
                // Reset timing to avoid dt spike
                prev = performance.now();
                lastRenderTime = 0;
                console.log('[Live2D] Tab visible — resuming');
            } else {
                console.log('[Live2D] Tab hidden — pausing render');
            }
        });
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 14 — Multi-Model Cache (★ v7)
       ═══════════════════════════════════════════════════════════════════════════ */

    /** ★ Preload a model into cache (call during idle time for future switch) */
    function preloadModel(model3Path) {
        if (modelCache[model3Path]) return Promise.resolve(true);
        var ls = model3Path.lastIndexOf('/');
        var home = ls >= 0 ? model3Path.substring(0, ls + 1) : '';
        return fetch(model3Path).then(function(r) { return r.arrayBuffer(); }).then(function(buf) {
            var F = window.Live2DCubismFramework;
            var setting = new F.CubismModelSettingJson(buf, buf.byteLength);
            var mf = setting.getModelFileName();
            return fetch(home + mf).then(function(r2) { return r2.arrayBuffer(); }).then(function(mocBuf) {
                var moc = F.CubismMoc.create(mocBuf);
                modelCache[model3Path] = { setting: setting, moc: moc, home: home };
                console.log('[Live2D] Preloaded: ' + model3Path);
                return true;
            });
        }).catch(function(e) {
            console.warn('[Live2D] Preload failed:', model3Path, e.message);
            return false;
        });
    }

    /** ★ List cached model paths */
    function getCachedModels() {
        return Object.keys(modelCache);
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 15 — Init / Destroy / API
       ═══════════════════════════════════════════════════════════════════════════ */

    function init(model3Path) {
        if (ready) return Promise.resolve(true);
        // ★ Register TTS boundary callback for lip sync
        if (typeof EpilogueTTS !== 'undefined') {
            EpilogueTTS.setBoundaryCallback(onTtsBoundary);
        }
        return Promise.resolve().then(function() {
            if (typeof Live2DCubismCore === 'undefined') return loadScript('live2d/core/live2dcubismcore.min.js');
        }).then(function() {
            var F = window.Live2DCubismFramework;
            if (typeof F === 'undefined' || !F.CubismFramework) return loadScript('live2d/live2dcubismframework.js');
        }).then(function() {
            var F = window.Live2DCubismFramework;
            if (!F.CubismFramework.isStarted()) F.CubismFramework.startUp();
            F.CubismFramework.initialize();
            createCanvas();
            initGL();
            return loadModel(model3Path);
        }).then(function() {
            startLoop();
            setupMouse();
            ready = true;
            pageVisible = !document.hidden;
            console.log('[Live2D] ✅ Ready v7 — motionPool keys=' + Object.keys(motionPool).join(',') +
                ' expressionData=' + Object.keys(expressionData).length +
                ' expressions=' + Object.keys(expressionMap).length +
                ' motionMeta=' + Object.keys(motionMeta).length);
            if (onReadyCb) onReadyCb();
            return true;
        }).catch(function(e) {
            console.error('[Live2D] ❌ Fail:', e.message, e.stack);
            destroy();
            return false;
        });
    }

    function destroy() {
        if (af) cancelAnimationFrame(af);
        if (idleTimer) clearTimeout(idleTimer);
        if (renderer) { try { renderer.release(); } catch (e) {} }
        // ★ Clear TTS callback
        if (typeof EpilogueTTS !== 'undefined') {
            EpilogueTTS.clearBoundaryCallback();
        }
        // ★ Clean up audio pool
        for (var i = 0; i < audioPool.length; i++) {
            try { audioPool[i].pause(); audioPool[i].src = ''; } catch (e) {}
        }
        audioPool = [];
        af = null; idleTimer = null;
        _idleStarted = false;
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
        canvas = null; gl = null; ready = false;
        exprFrom = null; exprTo = null; exprFadeT = 1.0;
        postMotionLerpActive = false; postMotionLerpAge = 0;
        currentMotionPriority = 0;
    }

    function isReady() { return ready; }

    function setEmotion(name) { applyEmotion(name); }

    return {
        init: init,
        setEmotion: setEmotion,
        startLipSync: startLipSync,
        stopLipSync: stopLipSync,
        startTypingLipSync: startTypingLipSync,
        stopTypingLipSync: stopTypingLipSync,
        startDialogue: startDialogue,
        endDialogue: endDialogue,
        destroy: destroy,
        isReady: isReady,
        getCanvas: function() { return canvas; },
        onReady: function(cb) { onReadyCb = cb; },
        // ★ v7 new API
        setMoodOverlay: setMoodOverlay,
        preloadModel: preloadModel,
        getCachedModels: getCachedModels,
        playMotion: function(groupName, priority) {
            return playMotion(groupName, priority || MOTION_PRIORITY.TAP);
        },
        // ★ Gaze tracking API
        setGazeSource: function(source) {
            gazeSource = source;
            // Reset external gaze smoothing when switching
            if (source !== 'external') {
                externalGazeSmoothX = 0; externalGazeSmoothY = 0;
                externalGazeSmoothHeadX = 0; externalGazeSmoothHeadY = 0;
            }
        },
        setExternalGaze: function(data) {
            if (!data) return;
            externalGaze.eyeX = data.eyeX || 0;
            externalGaze.eyeY = data.eyeY || 0;
            externalGaze.headX = data.headX || 0;
            externalGaze.headY = data.headY || 0;
            externalGaze.confidence = data.confidence || 0;
        },
        getGazeSource: function() { return gazeSource; }
    };
})();
