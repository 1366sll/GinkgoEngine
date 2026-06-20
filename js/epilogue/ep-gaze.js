/**
 * ep-gaze.js — 后日谈视线追踪模块
 *
 * 提供两种角色眼球追踪模式：
 *   🖱️ 鼠标模式 — 眼球跟随鼠标移动（默认，基于 ep-live2d 现有系统）
 *   📷 摄像头模式 — 通过 MediaPipe Face Landmarker 追踪玩家真实目光
 *
 * 依赖：MediaPipe Tasks Vision（动态加载，仅在摄像头模式下请求）
 * 存储：localStorage 'epilogue_gaze_mode'
 */

var EpilogueGaze = (function() {
    'use strict';

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 1 — Constants & State
       ═══════════════════════════════════════════════════════════════════════════ */

    var MODE_OFF    = 'off';
    var MODE_MOUSE  = 'mouse';
    var MODE_CAMERA = 'camera';

    var STORAGE_KEY = 'epilogue_gaze_mode';

    var currentMode = MODE_MOUSE;

    // ★ Guard against concurrent setMode calls
    var setModePromise = null;

    // MediaPipe state
    var faceLandmarker = null;
    var videoEl = null;
    var stream = null;
    var animFrame = null;
    var lastVideoTime = -1;
    var isMPLoading = false;
    var isMPReady = false;
    var mpError = null;
    var isInitDeferred = false;  // ★ true when camera mode saved, waiting for deferred start

    // Gaze output (normalized -1..1, updated every detection frame)
    var gazeData = { eyeX: 0, eyeY: 0, headX: 0, headY: 0, confidence: 0 };

    // Smoothing buffer
    var smoothEyeX = 0, smoothEyeY = 0, smoothHeadX = 0, smoothHeadY = 0;

    // Callbacks
    var onGazeUpdate = null;   // function(gazeData) — called each frame with new gaze
    var onStatusChange = null; // function(status) — called when MP state changes

    // MediaPipe CDN config
    var MP_VERSION = '0.10.18';
    var MP_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VERSION + '/wasm';
    var MP_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';
    // Fallback model URL via jsdelivr (may be slower but more reliable in some regions)
    var MP_MODEL_URL_FALLBACK = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VERSION + '/wasm/face_landmarker.task';

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 2 — Gaze Calculation from Face Landmarks
       ═══════════════════════════════════════════════════════════════════════════ */

    /**
     * Calculate normalized gaze direction from MediaPipe face landmarks.
     *
     * Uses iris landmarks (468-477) relative to eye corner landmarks
     * to estimate where the player is looking on screen.
     *
     * @param {Array} landmarks — 478 face landmarks from MediaPipe, each {x,y,z}
     * @returns {{eyeX: number, eyeY: number, headX: number, headY: number, confidence: number}}
     */
    function computeGaze(landmarks) {
        // ── Eye corner indices ──
        var L_EYE_OUTER = 33;   // left eye outer corner
        var L_EYE_INNER = 133;  // left eye inner corner
        var R_EYE_INNER = 362;  // right eye inner corner
        var R_EYE_OUTER = 263;  // right eye outer corner

        // ★ Guard: validate all required landmarks exist
        var required = [33, 133, 362, 263, 468, 473];
        for (var ri = 0; ri < required.length; ri++) {
            if (!landmarks[required[ri]]) {
                return { eyeX: 0, eyeY: 0, headX: 0, headY: 0, confidence: 0 };
            }
        }

        // ── Iris center indices ──
        // Left iris: landmarks 468-472, right iris: 473-477
        var lIris = averageLandmarks(landmarks, 468, 472);
        var rIris = averageLandmarks(landmarks, 473, 477);

        // Guard against NaN (can happen if model lacks iris support)
        if (isNaN(lIris.x) || isNaN(rIris.x)) {
            return { eyeX: 0, eyeY: 0, headX: 0, headY: 0, confidence: 0 };
        }

        // ── Eye centers and widths ──
        var lEyeLeft   = landmarks[L_EYE_OUTER];
        var lEyeRight  = landmarks[L_EYE_INNER];
        var rEyeLeft   = landmarks[R_EYE_INNER];
        var rEyeRight  = landmarks[R_EYE_OUTER];

        var lEyeCenterX = (lEyeLeft.x + lEyeRight.x) / 2;
        var lEyeCenterY = (lEyeLeft.y + lEyeRight.y) / 2;
        var rEyeCenterX = (rEyeLeft.x + rEyeRight.x) / 2;
        var rEyeCenterY = (rEyeLeft.y + rEyeRight.y) / 2;

        var lEyeWidth = Math.max(0.001, Math.abs(lEyeRight.x - lEyeLeft.x));
        var rEyeWidth = Math.max(0.001, Math.abs(rEyeRight.x - rEyeLeft.x));

        // ── Gaze direction: iris offset from eye center, normalized by eye width ──
        var lGazeX = (lIris.x - lEyeCenterX) / (lEyeWidth * 0.5);
        var lGazeY = (lIris.y - lEyeCenterY) / (lEyeWidth * 0.3); // vertical range is smaller
        var rGazeX = (rIris.x - rEyeCenterX) / (rEyeWidth * 0.5);
        var rGazeY = (rIris.y - rEyeCenterY) / (rEyeWidth * 0.3);

        // Average both eyes, clamp to sensible range
        var rawEyeX = (lGazeX + rGazeX) / 2;
        var rawEyeY = (lGazeY + rGazeY) / 2;

        // ── Head pose from face bounding box ──
        // Approximate face center from key landmarks (forehead, chin, left/right cheeks)
        var faceCenterX = 0, faceCenterY = 0, facePointCount = 0;
        var faceIndices = [10, 152, 234, 454];
        for (var fi = 0; fi < faceIndices.length; fi++) {
            var fp = landmarks[faceIndices[fi]];
            if (fp && !isNaN(fp.x) && !isNaN(fp.y)) {
                faceCenterX += fp.x;
                faceCenterY += fp.y;
                facePointCount++;
            }
        }
        if (facePointCount === 0) {
            return { eyeX: 0, eyeY: 0, headX: 0, headY: 0, confidence: 0 };
        }
        faceCenterX /= facePointCount;
        faceCenterY /= facePointCount;

        // Head position in frame (normalized 0..1 → -1..1)
        var rawHeadX = (faceCenterX - 0.5) * 2.0;
        var rawHeadY = (faceCenterY - 0.5) * 2.0;

        // ── Z-depth for confidence estimation ──
        // Use the z-coordinate spread of face landmarks to estimate if face is "flat on"
        var zVals = [];
        for (var zi = 0; zi < 50; zi++) {
            var lm = landmarks[zi * 9]; // sample every 9th landmark
            if (lm && !isNaN(lm.z)) zVals.push(lm.z);
        }
        zVals.sort(function(a,b) { return a - b; });
        var zRange = zVals.length > 2 ? (zVals[Math.floor(zVals.length * 0.9)] - zVals[Math.floor(zVals.length * 0.1)]) : 0.1;
        // Larger z-range = face is turned more (lower confidence in gaze)
        var confidence = isNaN(zRange) ? 0 : Math.max(0, 1 - zRange / 0.15);

        // Clamp eye values + final NaN guard (defense in depth)
        var eyeX = isNaN(rawEyeX) ? 0 : Math.max(-1.5, Math.min(1.5, rawEyeX));
        var eyeY = isNaN(rawEyeY) ? 0 : Math.max(-1.5, Math.min(1.5, rawEyeY));
        var headX = isNaN(rawHeadX) ? 0 : Math.max(-1, Math.min(1, rawHeadX));
        var headY = isNaN(rawHeadY) ? 0 : Math.max(-1, Math.min(1, rawHeadY));
        if (isNaN(confidence)) confidence = 0;

        return { eyeX: eyeX, eyeY: eyeY, headX: headX, headY: headY, confidence: confidence };
    }

    /** Average landmarks[start..end] → {x, y, z}. Skips missing indices safely. */
    function averageLandmarks(landmarks, start, end) {
        var x = 0, y = 0, z = 0, count = 0;
        for (var i = start; i <= end; i++) {
            var lm = landmarks[i];
            if (lm && !isNaN(lm.x) && !isNaN(lm.y)) {
                x += lm.x; y += lm.y; z += (isNaN(lm.z) ? 0 : lm.z);
                count++;
            }
        }
        if (count === 0) return { x: NaN, y: NaN, z: NaN };
        return { x: x / count, y: y / count, z: z / count };
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 3 — MediaPipe Initialization
       ═══════════════════════════════════════════════════════════════════════════ */

    /**
     * Dynamically load MediaPipe Tasks Vision from CDN.
     * Uses dynamic import() — requires the page to be served over http(s), not file://.
     */
    function loadMediaPipeScript() {
        if (isMPReady) return Promise.resolve(true);
        if (isMPLoading) return new Promise(function(resolve) {
            // Poll until loaded
            var check = setInterval(function() {
                if (isMPReady || mpError) { clearInterval(check); resolve(isMPReady); }
            }, 200);
        });

        isMPLoading = true;
        _notifyStatus('loading', '正在加载视觉追踪模块...');

        // Try dynamic ESM import first
        return import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VERSION + '/+esm')
            .then(function(mod) {
                window.__mpVision = mod;
                console.log('[EpilogueGaze] MediaPipe module loaded via ESM');
                return initFaceLandmarker(mod);
            })
            .catch(function(err) {
                console.warn('[EpilogueGaze] ESM import failed, trying UMD fallback:', err.message);
                // Fallback: load via script tag
                return new Promise(function(resolve, reject) {
                    var script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VERSION + '/vision_bundle.js';
                    script.onload = function() {
                        var mod = window.Vision || window;
                        window.__mpVision = mod;
                        console.log('[EpilogueGaze] MediaPipe module loaded via UMD');
                        initFaceLandmarker(mod).then(resolve, reject);
                    };
                    script.onerror = function() {
                        reject(new Error('MediaPipe script load failed'));
                    };
                    document.head.appendChild(script);
                });
            })
            .then(function() {
                isMPReady = true;
                isMPLoading = false;
                mpError = null;
                _notifyStatus('ready', '视觉追踪已就绪');
                return true;
            })
            .catch(function(err) {
                isMPLoading = false;
                mpError = err.message || 'MediaPipe 加载失败';
                _notifyStatus('error', mpError);
                console.error('[EpilogueGaze] Load failed:', err);
                return false;
            });
    }

    /**
     * Initialize FaceLandmarker with WASM backend.
     * @param {object} visionModule — the imported @mediapipe/tasks-vision module
     */
    function initFaceLandmarker(visionModule) {
        var FilesetResolver = visionModule.FilesetResolver;
        var FaceLandmarker = visionModule.FaceLandmarker;

        return FilesetResolver.forVisionTasks(MP_WASM_URL)
            .then(function(fileset) {
                return FaceLandmarker.createFromOptions(fileset, {
                    baseOptions: {
                        modelAssetPath: MP_MODEL_URL,
                        delegate: 'GPU'
                    },
                    outputFaceBlendshapes: false,
                    outputFacialTransformationMatrixes: false,
                    runningMode: 'VIDEO',
                    numFaces: 1
                });
            })
            .catch(function(err) {
                // Try CPU delegate + fallback model URL
                console.warn('[EpilogueGaze] GPU init failed, trying CPU + fallback URL:', err.message);
                return FilesetResolver.forVisionTasks(MP_WASM_URL).then(function(fileset) {
                    return FaceLandmarker.createFromOptions(fileset, {
                        baseOptions: {
                            modelAssetPath: MP_MODEL_URL_FALLBACK,
                            delegate: 'CPU'
                        },
                        outputFaceBlendshapes: false,
                        outputFacialTransformationMatrixes: false,
                        runningMode: 'VIDEO',
                        numFaces: 1
                    });
                });
            })
            .then(function(fl) {
                faceLandmarker = fl;
                console.log('[EpilogueGaze] FaceLandmarker created (delegate=' +
                    (fl._baseOptions ? fl._baseOptions.delegate : 'unknown') + ')');
            });
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 4 — Camera & Detection Loop
       ═══════════════════════════════════════════════════════════════════════════ */

    /**
     * Start webcam capture. Creates a hidden <video> element.
     * @returns {Promise<boolean>}
     */
    function startCamera() {
        if (stream) return Promise.resolve(true); // already running

        return new Promise(function(resolve) {
            // Create hidden video element if needed
            if (!videoEl) {
                videoEl = document.createElement('video');
                videoEl.setAttribute('playsinline', '');
                videoEl.setAttribute('autoplay', '');
                videoEl.style.cssText = 'position:fixed;bottom:16px;right:16px;width:160px;height:120px;z-index:300;' +
                    'border:1px solid rgba(255,255,255,0.2);border-radius:8px;opacity:0.3;' +
                    'pointer-events:none;display:none;';
                videoEl.id = 'epGazeCamera';
                document.body.appendChild(videoEl);
            }

            // Request camera
            var constraints = {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                },
                audio: false
            };

            navigator.mediaDevices.getUserMedia(constraints)
                .then(function(s) {
                    stream = s;
                    videoEl.srcObject = s;
                    videoEl.play().then(function() {
                        console.log('[EpilogueGaze] Camera started');
                        _notifyStatus('tracking', '正在追踪视线...');
                        detectionLoop();
                        resolve(true);
                    }).catch(function(e) {
                        _notifyStatus('error', '摄像头播放失败');
                        resolve(false);
                    });
                })
                .catch(function(err) {
                    mpError = '摄像头权限被拒绝: ' + (err.message || '未知错误');
                    _notifyStatus('error', mpError);
                    console.error('[EpilogueGaze] Camera error:', err);
                    resolve(false);
                });
        });
    }

    function stopCamera() {
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        if (stream) {
            stream.getTracks().forEach(function(t) { t.stop(); });
            stream = null;
        }
        if (videoEl) {
            videoEl.pause();
            videoEl.srcObject = null;
        }
        // ★ Don't destroy faceLandmarker — it's reusable. Only destroy() tears it down.
        lastVideoTime = -1;
        _detectConsecutiveErrors = 0;
        // Reset gaze to neutral
        gazeData = { eyeX: 0, eyeY: 0, headX: 0, headY: 0, confidence: 0 };
        smoothEyeX = 0; smoothEyeY = 0; smoothHeadX = 0; smoothHeadY = 0;
        console.log('[EpilogueGaze] Camera stopped');
    }

    /**
     * Main detection loop: feed video frames to MediaPipe, process results.
     * Runs via requestAnimationFrame when camera mode is active.
     */
    var _detectConsecutiveErrors = 0;

    function detectionLoop() {
        if (currentMode !== MODE_CAMERA) {
            animFrame = null;
            _detectConsecutiveErrors = 0;
            return;
        }

        animFrame = requestAnimationFrame(detectionLoop);

        if (!faceLandmarker || !videoEl || videoEl.readyState < 2) return;
        // ★ Guard against closed/destroyed faceLandmarker
        if (faceLandmarker._isClosed) return;

        var now = videoEl.currentTime;
        // Skip duplicate frames (video hasn't advanced)
        if (now === lastVideoTime) return;
        lastVideoTime = now;

        try {
            var results = faceLandmarker.detectForVideo(videoEl, performance.now());
            _detectConsecutiveErrors = 0; // ★ reset on success
        } catch (e) {
            _detectConsecutiveErrors++;
            // If too many consecutive errors, stop the loop to avoid spinning
            if (_detectConsecutiveErrors > 30) {
                console.warn('[EpilogueGaze] Too many detection errors, stopping loop');
                mpError = '检测连续失败，请刷新页面重试';
                _notifyStatus('error', mpError);
                stopCamera();
                return;
            }
            // MediaPipe internal error — skip this frame
            return;
        }

        if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
            var raw = computeGaze(results.faceLandmarks[0]);

            // Exponential smoothing (lerp factor tuned for responsive but stable gaze)
            var lerp = 0.35;
            smoothEyeX  += (raw.eyeX  - smoothEyeX)  * lerp;
            smoothEyeY  += (raw.eyeY  - smoothEyeY)  * lerp;
            smoothHeadX += (raw.headX - smoothHeadX) * lerp;
            smoothHeadY += (raw.headY - smoothHeadY) * lerp;

            gazeData.eyeX = smoothEyeX;
            gazeData.eyeY = smoothEyeY;
            gazeData.headX = smoothHeadX;
            gazeData.headY = smoothHeadY;
            gazeData.confidence = raw.confidence;

            // Feed to Live2D if available
            if (onGazeUpdate) onGazeUpdate(gazeData);
        } else {
            // No face detected — slowly drift back to neutral
            var drift = 0.08;
            smoothEyeX  *= (1 - drift);
            smoothEyeY  *= (1 - drift);
            smoothHeadX *= (1 - drift);
            smoothHeadY *= (1 - drift);
            gazeData.confidence = Math.max(0, gazeData.confidence - 0.02);

            if (onGazeUpdate) onGazeUpdate(gazeData);
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 5 — Mode Switching & API
       ═══════════════════════════════════════════════════════════════════════════ */

    /**
     * Switch gaze tracking mode.
     * @param {'off'|'mouse'|'camera'} mode
     * @returns {Promise<boolean>} — true if switch succeeded
     */
    function setMode(mode) {
        // ★ Guard against rapid concurrent calls — chain onto the in-flight promise
        if (setModePromise) {
            return setModePromise.then(function() {
                return setMode(mode);
            });
        }
        isInitDeferred = false; // ★ clear deferred flag (either we're about to start or user switched away)
        if (mode === currentMode) return Promise.resolve(true);

        var prevMode = currentMode;

        // ── Teardown previous mode ──
        if (prevMode === MODE_CAMERA) {
            stopCamera();
        }

        // ── Setup new mode ──
        if (mode === MODE_CAMERA) {
            setModePromise = loadMediaPipeScript().then(function(ok) {
                if (!ok) {
                    setModePromise = null;
                    console.warn('[EpilogueGaze] Cannot switch to camera: MediaPipe unavailable');
                    return false;
                }
                return startCamera().then(function(camOk) {
                    if (!camOk) {
                        setModePromise = null;
                        console.warn('[EpilogueGaze] Camera start failed');
                        return false;
                    }
                    currentMode = mode;
                    _savePreference();
                    _applyToLive2D();
                    setModePromise = null;
                    console.log('[EpilogueGaze] Mode → camera');
                    return true;
                });
            }).catch(function(err) {
                setModePromise = null;
                mpError = err.message || 'Unknown error';
                _notifyStatus('error', mpError);
                return false;
            });
            return setModePromise;
        } else {
            currentMode = mode;
            _savePreference();
            _applyToLive2D();
            console.log('[EpilogueGaze] Mode → ' + mode);
            return Promise.resolve(true);
        }
    }

    function getMode() { return currentMode; }
    function getGazeData() { return gazeData; }
    function isCameraActive() { return currentMode === MODE_CAMERA && isMPReady && stream !== null; }
    function getStatus() {
        if (mpError) return 'error';
        if (isInitDeferred) return 'loading';
        if (isMPLoading) return 'loading';
        if (isCameraActive()) return 'tracking';
        if (isMPReady) return 'ready';
        return 'idle';
    }
    function getError() { return mpError; }

    /** Register callback for gaze data (called each detection frame) */
    function setOnGazeUpdate(fn) { onGazeUpdate = fn; }
    /** Register callback for status changes */
    function setOnStatusChange(fn) { onStatusChange = fn; }

    function _notifyStatus(status, message) {
        if (onStatusChange) onStatusChange({ status: status, message: message || '' });
    }

    /**
     * Tell Live2D which gaze source to use.
     * Called after mode switch or init.
     */
    function _applyToLive2D() {
        if (typeof EpilogueLive2D === 'undefined' || !EpilogueLive2D.isReady()) return;

        if (currentMode === MODE_CAMERA) {
            EpilogueLive2D.setGazeSource('external');
            // Wire up gaze update callback
            setOnGazeUpdate(function(data) {
                EpilogueLive2D.setExternalGaze(data);
            });
        } else if (currentMode === MODE_MOUSE) {
            EpilogueLive2D.setGazeSource('mouse');
            setOnGazeUpdate(null);
        } else {
            EpilogueLive2D.setGazeSource('off');
            setOnGazeUpdate(null);
        }
    }

    function _savePreference() {
        try { localStorage.setItem(STORAGE_KEY, currentMode); } catch(e) {}
    }

    function _loadPreference() {
        try {
            var saved = localStorage.getItem(STORAGE_KEY);
            if (saved === MODE_OFF || saved === MODE_MOUSE || saved === MODE_CAMERA) {
                return saved;
            }
        } catch(e) {}
        return MODE_MOUSE; // default
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 6 — Camera Preview Toggle (for debugging / user feedback)
       ═══════════════════════════════════════════════════════════════════════════ */

    function showCameraPreview() {
        if (!videoEl) return;
        videoEl.style.display = '';
        videoEl.style.opacity = '0.85';
        console.log('[EpilogueGaze] Camera preview shown');
    }
    function hideCameraPreview() {
        if (!videoEl) return;
        videoEl.style.display = 'none';
        videoEl.style.opacity = '0.3';
        console.log('[EpilogueGaze] Camera preview hidden');
    }
    function isPreviewVisible() {
        // display='' (default) or display='block' etc. → visible; display='none' → hidden
        return !!(videoEl && videoEl.style.display !== 'none');
    }
    function toggleCameraPreview() {
        if (!videoEl) {
            console.warn('[EpilogueGaze] toggleCameraPreview: no video element (camera not started?)');
            return;
        }
        if (isPreviewVisible()) {
            hideCameraPreview();
        } else {
            showCameraPreview();
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 7 — Init / Destroy
       ═══════════════════════════════════════════════════════════════════════════ */

    function init() {
        var savedMode = _loadPreference();
        console.log('[EpilogueGaze] Init — saved mode: ' + savedMode);

        // ★ camera mode is deferred — keep currentMode at its actual state (mouse)
        //    until the camera is really running. This prevents setMode('camera')
        //    from short-circuiting with "mode === currentMode" before the camera starts.
        if (savedMode === MODE_CAMERA) {
            currentMode = MODE_MOUSE;
            isInitDeferred = true;
            _notifyStatus('loading', '启动中，正在连接视线追踪...');
        } else {
            currentMode = savedMode;
        }

        // If camera mode was saved, attempt to start it (deferred to avoid blocking boot)
        if (savedMode === MODE_CAMERA) {
            setTimeout(function() {
                // ★ Guard: don't override if user manually switched away during boot
                if (!isInitDeferred) {
                    console.log('[EpilogueGaze] init deferred: user already switched away, skipping');
                    return;
                }
                if (typeof EpilogueLive2D !== 'undefined' && EpilogueLive2D.isReady()) {
                    setMode(MODE_CAMERA);
                } else {
                    // Live2D not ready yet — retry
                    var retries = 0;
                    var checkReady = setInterval(function() {
                        retries++;
                        if (typeof EpilogueLive2D !== 'undefined' && EpilogueLive2D.isReady()) {
                            clearInterval(checkReady);
                            if (!isInitDeferred) return; // user switched away
                            setMode(MODE_CAMERA);
                        } else if (retries > 30) {
                            clearInterval(checkReady);
                            console.warn('[EpilogueGaze] Live2D not ready after 15s, falling back to mouse mode');
                            isInitDeferred = false;
                            _savePreference();
                            _notifyStatus('error', 'Live2D 未就绪，已回退为鼠标追踪');
                        }
                    }, 500);
                }
            }, 1000);
        } else {
            // Apply current mode to Live2D once it's ready
            var checkRetries = 0;
            var check = setInterval(function() {
                checkRetries++;
                if (typeof EpilogueLive2D !== 'undefined' && EpilogueLive2D.isReady()) {
                    clearInterval(check);
                    _applyToLive2D();
                } else if (checkRetries > 40) {
                    clearInterval(check);
                    console.warn('[EpilogueGaze] Live2D not ready after 12s, giving up on gaze init');
                }
            }, 300);
        }
    }

    function destroy() {
        stopCamera();
        setModePromise = null;
        if (faceLandmarker) {
            faceLandmarker._isClosed = true;
            try { faceLandmarker.close(); } catch(e) {}
            faceLandmarker = null;
        }
        if (videoEl && videoEl.parentNode) {
            videoEl.parentNode.removeChild(videoEl);
            videoEl = null;
        }
        isMPReady = false;
        isMPLoading = false;
        mpError = null;
        onGazeUpdate = null;
        currentMode = MODE_MOUSE;
        _applyToLive2D();
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SECTION 8 — Public API
       ═══════════════════════════════════════════════════════════════════════════ */

    return {
        // Constants
        MODE_OFF: MODE_OFF,
        MODE_MOUSE: MODE_MOUSE,
        MODE_CAMERA: MODE_CAMERA,

        // Core
        init: init,
        destroy: destroy,
        setMode: setMode,
        getMode: getMode,

        // Status
        getGazeData: getGazeData,
        isCameraActive: isCameraActive,
        getStatus: getStatus,
        getError: getError,

        // Callbacks
        setOnGazeUpdate: setOnGazeUpdate,
        setOnStatusChange: setOnStatusChange,

        // Camera preview (debug / user feedback)
        showCameraPreview: showCameraPreview,
        hideCameraPreview: hideCameraPreview,
        toggleCameraPreview: toggleCameraPreview,
        isPreviewVisible: isPreviewVisible,

        // Boot helper — called when Live2D becomes ready after init
        notifyLive2DReady: _applyToLive2D
    };
})();
