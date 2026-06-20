    // === Branch reveal state (global) ===
    // fcVisible — Set of node ids currently visible
    // fcDnNodes[choiceId] — array of downstream node ids
    // fcDnEdges[choiceId] — array of downstream edge indices
    // fcEdgeSrc[edgeIdx] — source node id (for edge visibility)
    var fcVisible = {};
    var fcDnNodes = {};
    var fcDnEdges = {};
    var fcEdgeSrc = {};
    var fcEdgeTo = [];
    var fcEdgeFrom = [];

    var fcActiveSet = {};
    var fcNodeRefCount = {};
    var fcEdgeRefCount = [];
    var fcIsBranchEdge = {}; // edges in any choice's dns — toggled by refcount, not endpoint vis
    var fcNodeLookup = {};   // node id → node object for wasChoiceSelected checks

    function fcApplyNodeVis(nid) {
        var vis = fcNodeRefCount[nid] > 0;
        // Virtual choice nodes additionally require their parent fork to be
        // visible — otherwise toggling a branch would re-reveal orphaned choice
        // cards whose parent fork is on a different collapsed branch.
        if (vis) {
            var node = fcNodeLookup[nid];
            if (node && node.isVirtualChoice && node.parentId !== undefined) {
                vis = !!fcVisible[node.parentId];
            }
        }
        fcVisible[nid] = vis;
        var el = document.getElementById('fc-n-' + nid);
        if (el) {
            el.style.setProperty('opacity', vis ? '' : '0', 'important');
            el.style.setProperty('pointer-events', vis ? '' : 'none', 'important');
        }
    }

    function fcApplyEdgeVis(ei) {
        var shouldShow;
        if (fcIsBranchEdge[ei]) {
            shouldShow = fcEdgeRefCount[ei] > 0;
        } else {
            shouldShow = fcVisible[fcEdgeFrom[ei]] && fcVisible[fcEdgeTo[ei]];
        }
        var eel = document.getElementById('fc-e-' + ei);
        if (eel) {
            eel.style.setProperty('opacity', shouldShow ? '' : '0', 'important');
            eel.style.setProperty('pointer-events', shouldShow ? '' : 'none', 'important');
        }
    }

    function wasChoiceSelected(vNode) {
        // Has the player ever visited this choice's target scene (any session)?
        if (vNode && vNode.isVirtualChoice && vNode.childId !== undefined) {
            if (readSceneSet.has(vNode.childId)) return true;
        }
        // Fallback: check in-memory choice history (current session)
        if (!vNode || !vNode.isVirtualChoice) return false;
        var forkIdx = vNode.parentId;
        if (forkIdx === undefined) return false;
        var chosenIdx = lastChosenBranch.get(forkIdx);
        if (chosenIdx === undefined) return false;
        if (!currentScenes || !currentScenes[forkIdx]) return false;
        var choices = currentScenes[forkIdx].choices;
        if (!choices || chosenIdx >= choices.length) return false;
        return vNode.childId === choices[chosenIdx].nextIdx;
    }

    function wasChoiceSelectedCurrent(vNode) {
        // Only the most recent choice in the current session (for auto-expand)
        if (!vNode || !vNode.isVirtualChoice) return false;
        var forkIdx = vNode.parentId;
        if (forkIdx === undefined) return false;
        var chosenIdx = lastChosenBranch.get(forkIdx);
        if (chosenIdx === undefined) return false;
        if (!currentScenes || !currentScenes[forkIdx]) return false;
        var choices = currentScenes[forkIdx].choices;
        if (!choices || chosenIdx >= choices.length) return false;
        return vNode.childId === choices[chosenIdx].nextIdx;
    }

    function fcReveal(choiceId) {
        // Only allow toggling choices the player actually selected in-game
        var vNode = fcNodeLookup[choiceId];
        if (vNode && vNode.isVirtualChoice && !wasChoiceSelected(vNode)) return;

        var dns = fcDnNodes[choiceId];
        var des = fcDnEdges[choiceId];

        if (fcActiveSet[choiceId]) {
            // === TOGGLE OFF ===
            fcActiveSet[choiceId] = false;
            var dirtyEdges = {};
            if (dns) {
                for (var i = 0; i < dns.length; i++) {
                    var nid = dns[i];
                    fcNodeRefCount[nid] = (fcNodeRefCount[nid] || 0) - 1;
                    fcApplyNodeVis(nid);
                    var srcEdges = fcEdgeSrc[nid];
                    if (srcEdges) { for (var j = 0; j < srcEdges.length; j++) dirtyEdges[srcEdges[j]] = true; }
                }
            }
            // Decrement edge refcounts for this choice's segment
            if (des) {
                for (var i = 0; i < des.length; i++) {
                    var ei2 = des[i];
                    fcEdgeRefCount[ei2] = Math.max(0, (fcEdgeRefCount[ei2] || 0) - 1);
                    dirtyEdges[ei2] = true;
                }
            }
            for (var ei in dirtyEdges) fcApplyEdgeVis(Number(ei));
        } else {
            // === TOGGLE ON ===
            fcActiveSet[choiceId] = true;
            var dirtyEdges = {};
            if (dns) {
                for (var i = 0; i < dns.length; i++) {
                    var nid = dns[i];
                    fcNodeRefCount[nid] = (fcNodeRefCount[nid] || 0) + 1;
                    fcApplyNodeVis(nid);
                    var srcEdges = fcEdgeSrc[nid];
                    if (srcEdges) { for (var j = 0; j < srcEdges.length; j++) dirtyEdges[srcEdges[j]] = true; }
                }
            }
            // Increment edge refcounts for this choice's segment
            if (des) {
                for (var i = 0; i < des.length; i++) {
                    var ei2 = des[i];
                    fcEdgeRefCount[ei2] = (fcEdgeRefCount[ei2] || 0) + 1;
                    dirtyEdges[ei2] = true;
                }
            }
            for (var ei in dirtyEdges) fcApplyEdgeVis(Number(ei));
        }
    }

    // --- Flowchart zoom & pan ---
    var fcZoomLevel = 1;
    var FC_ZOOM_MIN = 0.3, FC_ZOOM_MAX = 2.5;
    var fcPanX = 0, fcPanY = 0;           // 当前平移偏移 (px)
    var fcDragging = false;                // 是否正在拖拽
    var fcDragStartX = 0, fcDragStartY = 0;
    var fcDragPanStartX = 0, fcDragPanStartY = 0;

    function fcApplyZoom() {
        var scaler = document.getElementById('fcScaler');
        if (!scaler) return;
        var svg = scaler.querySelector('svg');
        var svgW = svg ? parseInt(svg.getAttribute('width')) || 1200 : 1200;
        var svgH = svg ? parseInt(svg.getAttribute('height')) || 800 : 800;
        scaler.style.transform = 'translate(' + fcPanX + 'px, ' + fcPanY + 'px) scale(' + fcZoomLevel + ')';
        scaler.style.width  = Math.ceil(svgW * fcZoomLevel) + 'px';
        scaler.style.height = Math.ceil(svgH * fcZoomLevel) + 'px';
        var label = document.getElementById('fcZoomLabel');
        if (label) label.textContent = Math.round(fcZoomLevel * 100) + '%';
    }

    function fcZoomIn()  { fcZoomLevel = Math.min(FC_ZOOM_MAX, fcZoomLevel + 0.2); fcApplyZoom(); }
    function fcZoomOut() { fcZoomLevel = Math.max(FC_ZOOM_MIN, fcZoomLevel - 0.2); fcApplyZoom(); }
    function fcZoomReset() { fcZoomLevel = 1; fcPanX = 0; fcPanY = 0; fcApplyZoom(); }

    function renderFlowChartSVG() {
        var data = buildFlowChartData();
        if (!data || data.nodes.length === 0) {
            return '<div style="text-align:center;color:#888;padding:50px;">暂无路线数据，请先加载项目</div>';
        }

        var nodes = data.nodes, edges = data.edges, chapters = data.chapters, maxLayer = data.maxLayer;
        var tracksInLayer = data.tracksInLayer, forkNodeIds = data.forkNodeIds, mergeNodeIds = data.mergeNodeIds;
        var fwd = data.fwd, rev = data.rev;
        var nodeMap = {};
        for (var ni = 0; ni < nodes.length; ni++) {
            nodeMap[nodes[ni].id] = nodes[ni];
            fcNodeLookup[nodes[ni].id] = nodes[ni];
        }

        // ===== Sugiyama DAG Layout =====
        var NODE_W = 300, NODE_H = 68, NODE_RX = 12;
        var VIRT_CHOICE_W = 210, VIRT_CHOICE_H = 48;
        var LAYER_GAP_Y = 240;
        var MIN_GAP_X = 180;
        var PAD_X = 80, PAD_TOP = 40, PAD_BOT = 40;
        var CH_HEADER_H = 44, CH_SPACER = 20;

        // --- Step 1: Build parent adjacency for barycenter ordering ---
        var adjIn = {};  // node id -> [parent ids]
        for (var ei = 0; ei < edges.length; ei++) {
            var f = edges[ei].from, t = edges[ei].to;
            if (f === t) continue;
            (adjIn[t] = adjIn[t] || []).push(f);
        }

        // --- Step 2: Use pre-computed layers from buildFlowChartData ---
        var lay = {};
        var maxLayer = data.maxLayer;
        for (var ni = 0; ni < nodes.length; ni++) {
            lay[nodes[ni].id] = nodes[ni].layer;
        }

        // --- Step 3: Layer grouping ---
        var layerNodes = [];
        for (var l = 0; l <= maxLayer; l++) layerNodes[l] = [];
        for (var ni = 0; ni < nodes.length; ni++) {
            var nid2 = nodes[ni].id;
            layerNodes[lay[nid2]].push(nid2);
        }

        // --- Step 4: Crossing minimization (barycenter, multiple passes) ---
        function barycenterOrder(layerIdx, fixedAbove) {
            var ids = layerNodes[layerIdx].slice();
            var bary = {};
            for (var i = 0; i < ids.length; i++) {
                var nid3 = ids[i];
                var parents = adjIn[nid3] || [];
                var sum = 0, cnt = 0;
                for (var pi = 0; pi < parents.length; pi++) {
                    var pIdx = fixedAbove.indexOf(parents[pi]);
                    if (pIdx >= 0) { sum += pIdx; cnt++; }
                }
                bary[nid3] = cnt > 0 ? sum / cnt : ids.length / 2;
            }
            ids.sort(function(a, b) { return bary[a] - bary[b]; });
            return ids;
        }
        // Upward and downward sweeps
        for (var sweep = 0; sweep < 8; sweep++) {
            for (var l = 1; l <= maxLayer; l++) {
                layerNodes[l] = barycenterOrder(l, layerNodes[l - 1]);
            }
            for (var l = maxLayer - 1; l >= 0; l--) {
                layerNodes[l] = barycenterOrder(l, layerNodes[l + 1]);
            }
        }

        // --- Step 5: Use pre-computed tracks from buildFlowChartData ---
        // Merge nodes were pre-marked as track 0 in buildFlowChartData to prevent
        // branch-track propagation through merge points.
        var track = {};
        for (var ni = 0; ni < nodes.length; ni++) {
            track[nodes[ni].id] = nodes[ni].branchTrack;
        }

        // --- Step 6: Compute track extents per layer ---
        var minTrack = 0, maxTrack = 0;
        var layerTrackSet = {}; // layer -> {track: true}
        for (var l = 0; l <= maxLayer; l++) {
            layerTrackSet[l] = {};
            for (var i = 0; i < layerNodes[l].length; i++) {
                var tid = layerNodes[l][i];
                var t = track[tid] || 0;
                layerTrackSet[l][t] = true;
                if (t < minTrack) minTrack = t;
                if (t > maxTrack) maxTrack = t;
            }
        }

        // --- Step 7: Coordinate assignment (track-based with overlap avoidance) ---
        var TRACK_WIDTH = Math.max(NODE_W, VIRT_CHOICE_W) + MIN_GAP_X;
        var posX = {}, posY = {};
        var nodeWLUT = {}, nodeHLUT = {}, nodeLines = {};

        // Estimate rendered pixel width of a character
        function charW(code, fs) { return (code > 0x2000) ? fs * 0.95 : fs * 0.55; }

        // Measure text, wrap to maxLines, return {lines, pxWidth}
        function fitLines(text, fs, maxW, maxLines) {
            if (!text) text = '';
            var lines = [], cur = '', curW = 0;
            for (var ci = 0; ci < text.length; ci++) {
                var cw = charW(text.charCodeAt(ci), fs);
                if (curW + cw > maxW && cur.length > 0) {
                    lines.push(cur);
                    if (lines.length >= maxLines) break;
                    cur = ''; curW = 0;
                }
                cur += text[ci]; curW += cw;
            }
            if (cur && lines.length < maxLines) lines.push(cur);
            var maxLineW = 0;
            for (var li = 0; li < lines.length; li++) {
                var lw = 0;
                for (var ci = 0; ci < lines[li].length; ci++) lw += charW(lines[li].charCodeAt(ci), fs);
                if (lw > maxLineW) maxLineW = lw;
            }
            return { lines: lines, pxWidth: Math.ceil(maxLineW) + 16 };
        }

        var MIN_REG_W = 240, MAX_REG_W = 440;
        var MIN_CH_W = 150, MAX_CH_W = 340;
        var LINE_H = 24;

        for (var ni = 0; ni < nodes.length; ni++) {
            var ntype = nodes[ni], nid = ntype.id;
            if (ntype.isVirtualChoice) {
                var m = fitLines(ntype.choiceText || '', 14, MAX_CH_W - 16, 2);
                nodeLines[nid] = m.lines;
                nodeWLUT[nid] = Math.max(MIN_CH_W, Math.min(MAX_CH_W, m.pxWidth + 12));
                nodeHLUT[nid] = m.lines.length <= 1 ? 48 : 68;
            } else if (ntype.isEnding) {
                var el = ntype.endingUnlocked ? (ntype.endingTitle || t('gallery.endings_none')) : t('gallery.endings_locked');
                var m = fitLines(el, 16, MAX_REG_W - 20, 1);
                nodeLines[nid] = m.lines;
                nodeWLUT[nid] = Math.max(MIN_REG_W, Math.min(MAX_REG_W, m.pxWidth));
                nodeHLUT[nid] = NODE_H;
            } else {
                var txt = ntype.speaker ? ntype.speaker + ': ' + ntype.text : (ntype.text || '');
                var m = fitLines(txt, 14, MAX_REG_W - 20, 2);
                nodeLines[nid] = m.lines;
                nodeWLUT[nid] = Math.max(MIN_REG_W, Math.min(MAX_REG_W, m.pxWidth));
                nodeHLUT[nid] = m.lines.length <= 1 ? NODE_H : NODE_H + LINE_H;
            }
        }

        // Y: proportional to layer, with chapter header offsets
        var chapterLayers = {};
        for (var ci = 0; ci < chapters.length; ci++) {
            var ch = chapters[ci];
            for (var l = ch.startLayer; l <= ch.endLayer; l++) chapterLayers[l] = ci;
        }
        var yAccum = PAD_TOP;
        var layerTopY = {};
        for (var l = 0; l <= maxLayer; l++) {
            if (chapterLayers[l] !== undefined) yAccum += CH_HEADER_H + CH_SPACER;
            layerTopY[l] = yAccum;
            yAccum += LAYER_GAP_Y;
        }
        var SVG_H = yAccum + PAD_BOT;
        for (var l = 0; l <= maxLayer; l++) {
            var ly = layerTopY[l] + LAYER_GAP_Y / 2;
            for (var i = 0; i < layerNodes[l].length; i++) posY[layerNodes[l][i]] = ly;
        }

        // X: first pass — assign each node to its track column center
        for (var ni = 0; ni < nodes.length; ni++) {
            var nid5 = nodes[ni].id;
            var t4 = track[nid5] || 0;
            var colCX = t4 * TRACK_WIDTH;
            posX[nid5] = colCX;
        }

        // Second pass: run barycenter refinement to order nodes within tracks
        for (var iter = 0; iter < 6; iter++) {
            for (var l = 0; l <= maxLayer; l++) {
                var ids = layerNodes[l];
                // Group by track
                var trackGroups = {};
                for (var i = 0; i < ids.length; i++) {
                    var t5 = track[ids[i]] || 0;
                    if (!trackGroups[t5]) trackGroups[t5] = [];
                    trackGroups[t5].push(ids[i]);
                }
                var trackKeys = Object.keys(trackGroups).map(Number).sort(function(a,b){return a-b;});

                // Within each track, order by barycenter of parent positions
                for (var ti = 0; ti < trackKeys.length; ti++) {
                    var tk = trackKeys[ti];
                    var group = trackGroups[tk];
                    for (var gi = 0; gi < group.length; gi++) {
                        var nid6 = group[gi];
                        var parents = adjIn[nid6] || [];
                        var s = 0, c = 0;
                        for (var pi = 0; pi < parents.length; pi++) {
                            if (posX[parents[pi]] !== undefined) { s += posX[parents[pi]]; c++; }
                        }
                        group[gi]._bary = c > 0 ? s / c : tk * TRACK_WIDTH;
                    }
                    group.sort(function(a,b){ return a._bary - b._bary; });
                    // Place nodes at track column center, stacked if multiple
                    var colCenter = tk * TRACK_WIDTH;
                    if (group.length === 1) {
                        posX[group[0]] = colCenter;
                    } else {
                        // Stack multiple nodes within a track, spread evenly
                        var totalW = 0;
                        for (var gi = 0; gi < group.length; gi++) totalW += nodeWLUT[group[gi]];
                        totalW += (group.length - 1) * MIN_GAP_X;
                        var startX = colCenter - totalW / 2;
                        var curX = startX;
                        for (var gi = 0; gi < group.length; gi++) {
                            posX[group[gi]] = curX + nodeWLUT[group[gi]] / 2;
                            curX += nodeWLUT[group[gi]] + MIN_GAP_X;
                        }
                    }
                }

                // Push apart overlapping track groups in this layer
                if (trackKeys.length > 1) {
                    for (var ti = 1; ti < trackKeys.length; ti++) {
                        var prevTrack = trackKeys[ti - 1];
                        var curTrack = trackKeys[ti];
                        var prevGroup = trackGroups[prevTrack];
                        var curGroup = trackGroups[curTrack];
                        // Find rightmost point of prevGroup, leftmost point of curGroup
                        var prevRight = -Infinity;
                        for (var gi = 0; gi < prevGroup.length; gi++) {
                            var r = posX[prevGroup[gi]] + nodeWLUT[prevGroup[gi]] / 2;
                            if (r > prevRight) prevRight = r;
                        }
                        var curLeft = Infinity;
                        for (var gi = 0; gi < curGroup.length; gi++) {
                            var l2 = posX[curGroup[gi]] - nodeWLUT[curGroup[gi]] / 2;
                            if (l2 < curLeft) curLeft = l2;
                        }
                        if (curLeft - prevRight < MIN_GAP_X) {
                            var push = MIN_GAP_X - (curLeft - prevRight);
                            // Push curGroup and all groups to the right
                            for (var tti = ti; tti < trackKeys.length; tti++) {
                                var pushTrack = trackKeys[tti];
                                var pushGroup = trackGroups[pushTrack];
                                for (var gi = 0; gi < pushGroup.length; gi++) {
                                    posX[pushGroup[gi]] += push;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Compute SVG width and center everything
        var actualMinX = Infinity, actualMaxX = -Infinity;
        for (var ni = 0; ni < nodes.length; ni++) {
            var x = posX[nodes[ni].id], w2 = nodeWLUT[nodes[ni].id];
            if (x - w2/2 < actualMinX) actualMinX = x - w2/2;
            if (x + w2/2 > actualMaxX) actualMaxX = x + w2/2;
        }
        var SVG_W = Math.max(800, actualMaxX - actualMinX + 2 * PAD_X);
        var CENTER_X = SVG_W / 2;
        var xShift = CENTER_X - (actualMinX + actualMaxX) / 2;
        for (var ni = 0; ni < nodes.length; ni++) posX[nodes[ni].id] += xShift;

        // ===== Initial visibility & downstream sets =====
        // Reset global state on every re-render
        fcVisible = {};
        fcDnNodes = {};
        fcDnEdges = {};
        fcEdgeSrc = {};
        fcEdgeTo = [];
        fcEdgeFrom = [];
        fcActiveSet = {};
        fcNodeRefCount = {};
        fcEdgeRefCount = [];
        fcIsBranchEdge = {};
        fcNodeLookup = {};

        // Map: node id → edge indices that originate from this node
        // Also record edge index → destination node for gate checks
        for (var ei = 0; ei < edges.length; ei++) {
            var src = edges[ei].from;
            (fcEdgeSrc[src] = fcEdgeSrc[src] || []).push(ei);
            fcEdgeTo[ei] = edges[ei].to;
            fcEdgeFrom[ei] = src;
        }

        // Start with everything hidden, then reveal visited + choice cards + root + chapter transitions
        for (var ni = 0; ni < nodes.length; ni++) fcVisible[nodes[ni].id] = false;
        for (var ni = 0; ni < nodes.length; ni++) {
            var nidT = nodes[ni].id;
            if (nidT === 0 || nodes[ni].isVirtualChoice || nodes[ni].isTransition || readSceneSet.has(nidT)) {
                fcVisible[nidT] = true;
            }
        }

        // Build set of virtual choice node IDs for fast lookup
        var virtChoiceSet = {};
        for (var ni = 0; ni < nodes.length; ni++) {
            if (nodes[ni].isVirtualChoice) virtChoiceSet[nodes[ni].id] = true;
        }

        // Compute downstream segment for each virtual choice node
        // BFS stops at subsequent virtual choice nodes — they act as gates
        for (var ni = 0; ni < nodes.length; ni++) {
            if (!nodes[ni].isVirtualChoice) continue;
            var cid = nodes[ni].id;
            // Find the child (destination after this choice)
            var childId = null;
            for (var ei = 0; ei < edges.length; ei++) {
                if (edges[ei].from === cid) { childId = edges[ei].to; break; }
            }
            if (childId === null) { fcDnNodes[cid] = []; fcDnEdges[cid] = []; continue; }

            // BFS from child, stopping at other virtual choice nodes
            var dNodes = [], dEdges = [];
            var vis = {};
            var q = [childId];
            vis[childId] = true;
            while (q.length > 0) {
                var u = q.shift();
                dNodes.push(u);
                // Stop traversal at subsequent virtual choice gates
                if (virtChoiceSet[u]) continue;
                var ch = fwd[u] || [];
                for (var ci = 0; ci < ch.length; ci++) {
                    if (!vis[ch[ci]]) { vis[ch[ci]] = true; q.push(ch[ci]); }
                }
            }
            // Collect edges where source is in the downstream set and is NOT a virtual choice
            for (var ei = 0; ei < edges.length; ei++) {
                var srcE = edges[ei].from;
                if (vis[srcE] && !virtChoiceSet[srcE]) {
                    dEdges.push(ei);
                }
            }
            // Also include the edge from choice node to child
            for (var ei = 0; ei < edges.length; ei++) {
                if (edges[ei].from === cid && edges[ei].to === childId && dEdges.indexOf(ei) < 0) {
                    dEdges.unshift(ei);
                }
            }
            fcDnNodes[cid] = dNodes;
            fcDnEdges[cid] = dEdges;
        }

        // Mark edges that belong to any choice's downstream segment
        for (var ck in fcDnEdges) {
            var edList = fcDnEdges[ck];
            if (edList) { for (var i = 0; i < edList.length; i++) fcIsBranchEdge[edList[i]] = true; }
        }

        // Zero out visibility for visited branch nodes — they'll be revealed by auto-toggle.
        // Root, virtual choice cards, and chapter transitions are always exempt.
        // Fork points are NOT exempt: a fork on a branch must hide with the branch
        // (otherwise its choice cards float orphaned on the route map).
        for (var ni = 0; ni < nodes.length; ni++) {
            var nidB = nodes[ni].id;
            if (nodes[ni].isVirtualChoice || nidB === 0 || nodes[ni].isTransition) continue;
            var isBranch = false;
            for (var ck in fcDnNodes) {
                if (fcDnNodes[ck].indexOf(nidB) >= 0) { isBranch = true; break; }
            }
            if (isBranch) fcVisible[nidB] = false;
        }

        // Hide virtual choice nodes whose parent fork is invisible —
        // prevents orphaned choice cards floating without context on the route map.
        for (var ni = 0; ni < nodes.length; ni++) {
            if (!nodes[ni].isVirtualChoice) continue;
            if (nodes[ni].parentId !== undefined && !fcVisible[nodes[ni].parentId]) {
                fcVisible[nodes[ni].id] = false;
            }
        }

        // Initialize refcount (1=trunk/choice-card, 0=branch/hidden)
        for (var ni = 0; ni < nodes.length; ni++) {
            fcNodeRefCount[nodes[ni].id] = fcVisible[nodes[ni].id] ? 1 : 0;
        }

        // Auto-expand selected choices: adjust refcounts so visited branch content is visible
        for (var ni = 0; ni < nodes.length; ni++) {
            if (!nodes[ni].isVirtualChoice || !wasChoiceSelectedCurrent(nodes[ni])) continue;
            var cid = nodes[ni].id;
            fcActiveSet[cid] = true;
            var dns = fcDnNodes[cid];
            var des = fcDnEdges[cid];
            if (dns) {
                for (var i = 0; i < dns.length; i++) {
                    var anid = dns[i];
                    fcNodeRefCount[anid] = (fcNodeRefCount[anid] || 0) + 1;
                    fcVisible[anid] = fcNodeRefCount[anid] > 0;
                }
            }
            if (des) {
                for (var i = 0; i < des.length; i++) {
                    fcEdgeRefCount[des[i]] = (fcEdgeRefCount[des[i]] || 0) + 1;
                }
            }
        }

        // Second pass: re-hide virtual choice nodes whose parent fork is still
        // invisible after auto-expand. Auto-expand can re-reveal nested virtual
        // choice nodes via refcount bumps even when their parent fork is hidden.
        for (var ni = 0; ni < nodes.length; ni++) {
            if (!nodes[ni].isVirtualChoice) continue;
            if (nodes[ni].parentId !== undefined && !fcVisible[nodes[ni].parentId]) {
                fcVisible[nodes[ni].id] = false;
            }
        }

        // ===== SVG Rendering =====
        var svgParts = [];

        // Chapter headers — only rendered when there are multiple chapters
        // (a single-chapter map has no meaningful boundary to mark).
        if (chapters.length > 1) {
            var drawnChapters = {};
            for (var ci = 0; ci < chapters.length; ci++) {
                var ch = chapters[ci];
                var chY = layerTopY[ch.startLayer];
                if (chY !== undefined && !drawnChapters[ci]) {
                    drawnChapters[ci] = true;
                    svgParts.push('<rect x="0" y="' + chY + '" width="' + SVG_W + '" height="' + (CH_HEADER_H + CH_SPACER) + '" fill="rgba(219,165,65,0.025)" rx="0"/>');
                    svgParts.push('<line x1="' + PAD_X + '" y1="' + (chY + CH_HEADER_H / 2) + '" x2="' + (SVG_W - PAD_X) + '" y2="' + (chY + CH_HEADER_H / 2) + '" stroke="rgba(219,165,65,0.12)" stroke-width="0.8"/>');
                    svgParts.push('<text x="' + CENTER_X + '" y="' + (chY + CH_HEADER_H / 2 - 9) + '" text-anchor="middle" fill="#c89640" font-size="15" font-weight="600" font-family="inherit">' + escHtml(ch.label) + '</text>');
                }
            }
        }

        // ===== Smooth Bezier Edge Routing =====
        // Edges use cubic bezier curves that flow naturally from source
        // to destination. Fork edges fan outward; merge edges converge;
        // main-path edges stay nearly vertical with subtle easing.
        // No edge labels — choice text lives in virtual choice nodes.

        var nodeBox = {};
        for (var ni = 0; ni < nodes.length; ni++) {
            var nid3 = nodes[ni].id;
            var nw3 = nodeWLUT[nid3];
            var nh3 = nodeHLUT[nid3];
            var nx3 = posX[nid3], ny3 = posY[nid3];
            nodeBox[nid3] = {
                left: nx3 - nw3/2, right: nx3 + nw3/2,
                top: ny3 - nh3/2, bottom: ny3 + nh3/2
            };
        }

        var forkSet = {};
        for (var fi = 0; fi < forkNodeIds.length; fi++) forkSet[forkNodeIds[fi]] = true;
        var mergeSet = {};
        for (var mi = 0; mi < mergeNodeIds.length; mi++) mergeSet[mergeNodeIds[mi]] = true;

        // Count duplicate edges (same from->to)
        var dupCount = {};
        var dupIdx = {};
        for (var ei = 0; ei < edges.length; ei++) {
            var dk = edges[ei].from + '->' + edges[ei].to;
            dupCount[dk] = (dupCount[dk] || 0) + 1;
        }
        var dupOrd = {};
        for (var ei = 0; ei < edges.length; ei++) {
            var dk2 = edges[ei].from + '->' + edges[ei].to;
            dupOrd[dk2] = (dupOrd[dk2] || 0);
            dupIdx[dk2 + ':' + ei] = dupOrd[dk2]++;
        }

        for (var ei = 0; ei < edges.length; ei++) {
            var e = edges[ei];
            if (posX[e.from] === undefined || posX[e.to] === undefined) continue;
            var XA = posX[e.from], XB = posX[e.to];
            var YA = posY[e.from], YB = posY[e.to];
            var hA = nodeHLUT[e.from] || NODE_H;
            var hB = nodeHLUT[e.to] || NODE_H;
            var srcBottom = YA + hA/2;
            var tgtTop = YB - hB/2;
            var TA = track[e.from] || 0, TB = track[e.to] || 0;
            var dx = XB - XA;
            var dy = tgtTop - srcBottom;
            if (dy <= 0) dy = 10;

            var isFork = forkSet[e.from];
            var isMerge = mergeSet[e.to];
            var sameTrack = (TA === TB);

            // Visually separate curves that share the same from->to
            var dk3 = e.from + '->' + e.to;
            var nDup = dupCount[dk3] || 1;
            var iDup = dupIdx[dk3 + ':' + ei] || 0;
            var dupOff = (nDup > 1) ? (iDup - (nDup - 1)/2) * 35 : 0;

            // Cubic bezier control points — chosen by edge role
            var cx1, cy1, cx2, cy2;
            if (sameTrack && Math.abs(dx) < 30) {
                // Near-vertical: subtle ease-in-out
                cx1 = XA + dupOff;
                cy1 = srcBottom + dy * 0.45;
                cx2 = XB + dupOff;
                cy2 = tgtTop - dy * 0.45;
            } else if (isFork) {
                // Fork: fan outward from source
                cx1 = XA + dx * 0.38 + dupOff * 0.5;
                cy1 = srcBottom + dy * 0.35;
                cx2 = XB;
                cy2 = tgtTop - dy * 0.35;
            } else if (isMerge) {
                // Merge: converge gently toward merge node
                cx1 = XA;
                cy1 = srcBottom + dy * 0.35;
                cx2 = XB + dx * 0.32 + dupOff * 0.5;
                cy2 = tgtTop - dy * 0.35;
            } else {
                // General cross-track: gentle S-sweep
                cx1 = XA + dx * 0.20 + dupOff * 0.5;
                cy1 = srcBottom + dy * 0.40;
                cx2 = XB - dx * 0.20 + dupOff * 0.5;
                cy2 = tgtTop - dy * 0.40;
            }

            var d = 'M' + XA.toFixed(1) + ',' + srcBottom.toFixed(1) +
                    ' C' + cx1.toFixed(1) + ',' + cy1.toFixed(1) +
                    ' ' + cx2.toFixed(1) + ',' + cy2.toFixed(1) +
                    ' ' + XB.toFixed(1) + ',' + tgtTop.toFixed(1);

            var stroke, sw;
            if (isFork) {
                stroke = 'rgba(219,165,65,0.45)'; sw = 1.2;
            } else if (isMerge) {
                stroke = 'rgba(160,195,220,0.35)'; sw = 1.0;
            } else if (!sameTrack) {
                stroke = 'rgba(160,190,220,0.28)'; sw = 1.0;
            } else {
                stroke = 'rgba(200,185,215,0.25)'; sw = 1.0;
            }

            var edgeVis;
            if (fcIsBranchEdge[ei]) {
                edgeVis = fcEdgeRefCount[ei] > 0;
            } else {
                edgeVis = !!(fcVisible[e.from] && fcVisible[e.to]);
            }
            svgParts.push('<g id="fc-e-' + ei + '"' + (edgeVis ? '' : ' style="opacity:0;pointer-events:none"') + '>');
            svgParts.push('<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linecap="round"/>');

            // Arrowhead at destination
            var arrowSize = 5.5;
            svgParts.push('<polygon points="' + XB.toFixed(1) + ',' + tgtTop.toFixed(1) + ' ' + (XB - arrowSize).toFixed(1) + ',' + (tgtTop - arrowSize * 1.4).toFixed(1) + ' ' + (XB + arrowSize).toFixed(1) + ',' + (tgtTop - arrowSize * 1.4).toFixed(1) + '" fill="' + stroke + '"/>');
            svgParts.push('</g>');
        }

        // --- Vertical track separators ---
        var drawnSeps = {};
        for (var l = 0; l <= maxLayer; l++) {
            var tracks = Object.keys(layerTrackSet[l] || {}).map(Number);
            if (tracks.length <= 1) continue;
            var sortedT = tracks.sort(function(a, b) { return a - b; });
            for (var ti = 1; ti < sortedT.length; ti++) {
                var leftCX = CENTER_X + sortedT[ti-1] * TRACK_WIDTH;
                var rightCX = CENTER_X + sortedT[ti] * TRACK_WIDTH;
                var sepX = (leftCX + rightCX) / 2;
                var key = sepX.toFixed(1);
                if (!drawnSeps[key]) {
                    drawnSeps[key] = true;
                    svgParts.push('<line x1="' + sepX + '" y1="' + PAD_TOP + '" x2="' + sepX + '" y2="' + (SVG_H - PAD_BOT) + '" stroke="rgba(160,155,180,0.06)" stroke-width="0.8" stroke-dasharray="4,12"/>');
                }
            }
        }

        // --- Nodes ---
        function wrapText(text, maxChars) {
            if (!text) return [];
            var result = [];
            while (text.length > maxChars) {
                result.push(text.substring(0, maxChars));
                text = text.substring(maxChars);
            }
            if (text.length > 0) result.push(text);
            return result;
        }

        for (var ni = 0; ni < nodes.length; ni++) {
            var n = nodes[ni];
            var nx = posX[n.id], ny = posY[n.id];
            var nw = nodeWLUT[n.id] || NODE_W;
            var nh = nodeHLUT[n.id] || NODE_H;

            var nl = nodeLines[n.id] || [];
            var lineGap = LINE_H;

            var nid = n.id;
            var nVisible = !!fcVisible[nid];
            var nChoiceSelected = n.isVirtualChoice && wasChoiceSelected(n);
            var gOpen = '<g id="fc-n-' + nid + '"';
            var gStyles = [];
            if (!nVisible) { gStyles.push('opacity:0', 'pointer-events:none'); }
            if (n.isVirtualChoice && nChoiceSelected) { gStyles.push('cursor:pointer'); }
            if (n.isVirtualChoice && !nChoiceSelected) { gStyles.push('cursor:not-allowed'); }
            if (gStyles.length > 0) { gOpen += ' style="' + gStyles.join(';') + '"'; }
            if (n.isVirtualChoice && nChoiceSelected) { gOpen += ' onclick="fcReveal(' + nid + ')"'; }
            gOpen += '>';

            // Build multi-line SVG text snippet
            function svgText(x, y, lines, fs, fill, fw, xtra) {
                if (!lines || lines.length === 0) return '';
                if (lines.length === 1) {
                    return '<text x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="middle" fill="' + fill + '" font-size="' + fs + '" font-family="inherit"' + (fw ? ' font-weight="' + fw + '"' : '') + (xtra || '') + '>' + escHtml(lines[0]) + '</text>';
                }
                var sy = y - lineGap * (lines.length - 1) / 2;
                var h = '<text x="' + x.toFixed(1) + '" y="' + (sy + 4).toFixed(1) + '" text-anchor="middle" fill="' + fill + '" font-size="' + fs + '" font-family="inherit"' + (fw ? ' font-weight="' + fw + '"' : '') + (xtra || '') + '>' + escHtml(lines[0]);
                for (var li = 1; li < lines.length; li++) {
                    h += '<tspan x="' + x.toFixed(1) + '" dy="' + lineGap + '">' + escHtml(lines[li]) + '</tspan>';
                }
                h += '</text>';
                return h;
            }

            svgParts.push(gOpen);
            if (n.isVirtualChoice) {
                // Rounded pill card — selected vs. unselected visual
                var cFill   = nChoiceSelected ? 'rgba(219,165,65,0.10)' : 'rgba(219,165,65,0.04)';
                var cStroke = nChoiceSelected ? 'rgba(219,165,65,0.30)' : 'rgba(219,165,65,0.12)';
                var cColor  = nChoiceSelected ? '#d4b870' : '#7a7040';
                svgParts.push('<rect x="' + (nx - nw/2).toFixed(1) + '" y="' + (ny - nh/2).toFixed(1) + '" width="' + nw + '" height="' + nh + '" rx="14" fill="' + cFill + '" stroke="' + cStroke + '" stroke-width="1" class="fc-node"/>');
                svgParts.push(svgText(nx, ny, nl, 14, cColor, '', ' class="fc-node"'));
            } else if (n.isEnding) {
                var eFill = n.endingUnlocked ? 'rgba(200,160,60,0.28)' : 'rgba(50,50,60,0.55)';
                var eStroke = n.endingUnlocked ? 'rgba(219,165,65,0.75)' : 'rgba(110,110,120,0.35)';
                var eColor = n.endingUnlocked ? '#f8e0a0' : '#999';
                svgParts.push('<rect x="' + (nx - nw/2) + '" y="' + (ny - nh/2) + '" width="' + nw + '" height="' + nh + '" rx="14" fill="' + eFill + '" stroke="' + eStroke + '" stroke-width="1.6" class="fc-node" data-scene-id="' + n.id + '"/>');
                svgParts.push(svgText(nx, ny, nl, 16, eColor, '700', ' class="fc-node" data-scene-id="' + n.id + '"'));
                if (n.endingUnlocked) svgParts.push('<text x="' + (nx + nw/2 - 14) + '" y="' + (ny - nh/2 - 6) + '" text-anchor="middle" fill="#dba541" font-size="15">★</text>');
            } else if (n.isChoice) {
                // Legacy — kept for compatibility; normally unused
                svgParts.push('<path d="M' + (nx - nw/2 + 12) + ',' + (ny - nh/2) + ' L' + (nx + nw/2 - 12) + ',' + (ny - nh/2) + ' L' + (nx + nw/2) + ',' + ny + ' L' + (nx + nw/2 - 12) + ',' + (ny + nh/2) + ' L' + (nx - nw/2 + 12) + ',' + (ny + nh/2) + ' L' + (nx - nw/2) + ',' + ny + ' Z" fill="rgba(219,165,65,0.12)" stroke="rgba(219,165,65,0.40)" stroke-width="1.2" class="fc-node" data-scene-id="' + n.id + '"/>');
                svgParts.push(svgText(nx, ny, nl.length ? nl : [n.speaker || '选择点'], 15, '#f5da8c', '600', ' class="fc-node" data-scene-id="' + n.id + '"'));
            } else if (n.isTransition) {
                svgParts.push('<rect x="' + (nx - nw/2) + '" y="' + (ny - nh/2) + '" width="' + nw + '" height="' + nh + '" rx="' + NODE_RX + '" fill="rgba(219,165,65,0.15)" stroke="rgba(219,165,65,0.50)" stroke-width="1.4" class="fc-node" data-scene-id="' + n.id + '"/>');
                svgParts.push(svgText(nx, ny, nl, 15, '#f5da8c', '700', ' class="fc-node" data-scene-id="' + n.id + '"'));
            } else {
                var rFill, rStroke, rColor;
                if (n.isForkPoint) {
                    rFill = 'rgba(219,165,65,0.12)';
                    rStroke = 'rgba(219,165,65,0.45)';
                    rColor = '#efe0c0';
                } else if (n.isMainPath) {
                    rFill = 'rgba(70,65,85,0.65)';
                    rStroke = n.isMerge ? 'rgba(160,195,220,0.55)' : 'rgba(170,160,190,0.35)';
                    rColor = '#f0e8d8';
                } else {
                    rFill = 'rgba(48,46,58,0.50)';
                    rStroke = 'rgba(140,130,160,0.25)';
                    rColor = '#c0b098';
                }
                svgParts.push('<rect x="' + (nx - nw/2) + '" y="' + (ny - nh/2) + '" width="' + nw + '" height="' + nh + '" rx="' + NODE_RX + '" fill="' + rFill + '" stroke="' + rStroke + '" stroke-width="' + (n.isMerge ? 1.5 : 1) + '" class="fc-node" data-scene-id="' + n.id + '"/>');
                svgParts.push(svgText(nx, ny, nl, 14, rColor, '', ' class="fc-node" data-scene-id="' + n.id + '"'));
            }

            if (n.isSaved) svgParts.push('<text x="' + (nx + nw/2 - 12) + '" y="' + (ny - nh/2 + 16) + '" text-anchor="middle" fill="#dba541" font-size="15">💾</text>');
            if (n.id < 100000) svgParts.push('<text x="' + nx.toFixed(1) + '" y="' + (ny - nh/2 - 9).toFixed(1) + '" text-anchor="middle" fill="rgba(170,160,150,0.25)" font-size="11" font-family="inherit">#' + n.id + '</text>');
            svgParts.push('</g>');
        }

        var svgHtml = '<svg width="' + SVG_W + '" height="' + SVG_H + '" viewBox="0 0 ' + SVG_W + ' ' + SVG_H + '" xmlns="http://www.w3.org/2000/svg">';
        svgHtml += '<rect width="100%" height="100%" fill="transparent"/>';
        svgHtml += svgParts.join('');
        svgHtml += '</svg>';

        return '<div class="flowchart-legend">' +
            '<span class="flowchart-legend-item"><span class="flowchart-legend-dot normal"></span> ' + t('game.flow_story') + '</span>' +
            '<span class="flowchart-legend-item"><span class="flowchart-legend-dot choice"></span> ' + t('game.flow_choice') + '</span>' +
            '<span class="flowchart-legend-item"><span class="flowchart-legend-dot ending"></span> ' + t('game.flow_unlocked') + '</span>' +
            '<span class="flowchart-legend-item"><span class="flowchart-legend-dot ending-locked"></span> ' + t('game.flow_locked') + '</span>' +
            '<span class="flowchart-legend-item"><span class="flowchart-legend-dot merge"></span> ' + t('game.flow_merge') + '</span>' +
            '</div>' +
            '<div class="fc-zoom-wrapper">' +
                '<div class="flowchart-wrap" id="flowchartWrap">' +
                    '<div id="fcScaler" style="transform-origin:0 0">' + svgHtml + '</div>' +
                '</div>' +
                '<div class="fc-zoom-bar">' +
                    '<button class="fc-zoom-btn" onclick="fcZoomOut()" title="缩小">−</button>' +
                    '<span class="fc-zoom-label" id="fcZoomLabel">100%</span>' +
                    '<button class="fc-zoom-btn" onclick="fcZoomIn()" title="放大">＋</button>' +
                    '<button class="fc-zoom-btn" onclick="fcZoomReset()" title="重置">1:1</button>' +
                '</div>' +
            '</div>';
    }

    function escHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    let gallerySpriteGroups = {};
    let galleryCurrentChara = null;
    let galleryCurrentSpriteIdx = 0;
    let galleryCharOrder = []; // ordered character dir list for slide direction

    let carouselAnimating = false;
    let carouselBase = 0; // which DOM img index sits at position 0 (far-left)

    function renderSpriteCarousel(animateDir) {
        const leftPanel = document.getElementById('spriteViewerLeft');
        if (!leftPanel || !galleryCurrentChara) return;
        const group = gallerySpriteGroups[galleryCurrentChara];
        if (!group) return;
        const unlocked = group.sprites.filter(s => s.unlocked);
        if (unlocked.length === 0) { leftPanel.innerHTML = '<div style="color:#a09888;text-align:center;padding:40px;">该角色暂无已解锁立绘</div>'; carouselAnimating = false; return; }
        if (galleryCurrentSpriteIdx >= unlocked.length) galleryCurrentSpriteIdx = 0;
        const total = unlocked.length;

        const jsonList = JSON.stringify(group.sprites.map(s => ({key:s.key,url:s.url,unlocked:s.unlocked})));
        const escapedName = group.name.replace(/'/g, "\\'");
        const escJson = jsonList.replace(/"/g, '&quot;');

        function get(idx) { return unlocked[((idx % total) + total) % total]; }
        const sp = [get(galleryCurrentSpriteIdx - 2), get(galleryCurrentSpriteIdx - 1), get(galleryCurrentSpriteIdx), get(galleryCurrentSpriteIdx + 1), get(galleryCurrentSpriteIdx + 2)];
        const cur = sp[2];

        const stage = document.getElementById('carouselStage');

        // Single image: simple center-only display
        if (total <= 1) {
            leftPanel.innerHTML = `
            <div class="sprite-viewer-main">
                <div class="sprite-carousel-stage" id="carouselStage" style="min-height:72vh;">
                    <img class="carousel-img img-pos-center" src="${cur.url}" alt="${cur.key}" title="${cur.key}" decoding="async"
                         onclick="event.stopPropagation();showCharaSpriteViewer('${escapedName}', JSON.parse('${escJson}'), '${cur.key.replace(/'/g, "\\'")}')">
                </div>
                <div class="sprite-viewer-controls">
                    <button class="sprite-nav-btn" disabled>◀</button>
                    <span class="sprite-viewer-label">${cur.key} (1/1)</span>
                    <button class="sprite-nav-btn" disabled>▶</button>
                </div>
            </div>`;
            carouselAnimating = false;
            return;
        }

        // Build fresh 5-image stage (initial, character switch, or multi-step jump)
        if (!stage || !animateDir || Math.abs(animateDir) !== 1) {
            const POS = ['img-pos-far-left', 'img-pos-near-left', 'img-pos-center', 'img-pos-near-right', 'img-pos-far-right'];
            const clicks = [
                `event.stopPropagation();navigateGallerySprite(-2)`,
                `event.stopPropagation();navigateGallerySprite(-1)`,
                `event.stopPropagation();showCharaSpriteViewer('${escapedName}', JSON.parse('${escJson}'), '${cur.key.replace(/'/g, "\\'")}')`,
                `event.stopPropagation();navigateGallerySprite(1)`,
                `event.stopPropagation();navigateGallerySprite(2)`
            ];
            let imgsHTML = '';
            for (let i = 0; i < 5; i++) {
                imgsHTML += `<img class="carousel-img ${POS[i]}" src="${sp[i].url}" alt="${sp[i].key}" title="${sp[i].key}" decoding="async" onclick="${clicks[i]}">`;
            }
            leftPanel.innerHTML = `
            <div class="sprite-viewer-main">
                <div class="sprite-carousel-stage" id="carouselStage">${imgsHTML}</div>
                <div class="sprite-viewer-controls">
                    <button class="sprite-nav-btn" onclick="event.stopPropagation();navigateGallerySprite(-1)">◀</button>
                    <span class="sprite-viewer-label">${cur.key} (${galleryCurrentSpriteIdx + 1}/${total})</span>
                    <button class="sprite-nav-btn" onclick="event.stopPropagation();navigateGallerySprite(1)">▶</button>
                </div>
            </div>`;
            carouselBase = 0;
            carouselAnimating = false;
            return;
        }

        // Animate: shift position classes on existing img elements
        if (carouselAnimating) return;
        carouselAnimating = true;

        // Rotate the base index — this is what makes each animation shift different elements
        if (animateDir > 0) {
            carouselBase = (carouselBase + 1) % 5;
        } else {
            carouselBase = (carouselBase - 1 + 5) % 5;
        }

        const POS = ['img-pos-far-left', 'img-pos-near-left', 'img-pos-center', 'img-pos-near-right', 'img-pos-far-right'];
        const imgs = stage.querySelectorAll('.carousel-img');

        const clicks = [
            function(e) { e.stopPropagation(); navigateGallerySprite(-2); },
            function(e) { e.stopPropagation(); navigateGallerySprite(-1); },
            function(e) { e.stopPropagation(); showCharaSpriteViewer(escapedName, JSON.parse(jsonList), sp[2].key); },
            function(e) { e.stopPropagation(); navigateGallerySprite(1); },
            function(e) { e.stopPropagation(); navigateGallerySprite(2); }
        ];

        for (let i = 0; i < 5; i++) {
            const el = imgs[(carouselBase + i) % 5];
            el.className = 'carousel-img ' + POS[i];
            el.src = sp[i].url; el.alt = sp[i].key; el.title = sp[i].key;
            el.onclick = clicks[i];
        }

        const label = document.querySelector('.sprite-viewer-label');
        if (label) label.textContent = `${cur.key} (${galleryCurrentSpriteIdx + 1}/${total})`;

        setTimeout(() => { carouselAnimating = false; }, 600);
    }

    function navigateGallerySprite(delta) {
        const group = gallerySpriteGroups[galleryCurrentChara];
        if (!group) return;
        const unlocked = group.sprites.filter(s => s.unlocked);
        if (unlocked.length <= 1) return;
        galleryCurrentSpriteIdx = (galleryCurrentSpriteIdx + delta + unlocked.length) % unlocked.length;
        renderSpriteCarousel(delta);
    }

    let charaSwitchTimer = null;
    function selectGalleryChara(dir, noAnimate) {
        var prevMain = document.querySelector('#spriteViewerLeft .sprite-viewer-main');
        var prevStage = document.getElementById('carouselStage');
        var oldDir = galleryCurrentChara;

        galleryCurrentChara = dir;
        galleryCurrentSpriteIdx = 0;

        document.querySelectorAll('.chara-thumb-card').forEach(c => c.classList.remove('selected'));
        var selected = document.querySelector(`.chara-thumb-card[data-dir="${dir}"]`);
        if (selected) selected.classList.add('selected');

        // 首次加载或无旧内容，不播动画
        if (noAnimate || !prevMain || !prevStage) {
            if (charaSwitchTimer) { clearTimeout(charaSwitchTimer); charaSwitchTimer = null; }
            renderSpriteCarousel(0);
            return;
        }

        // 防止快速切换
        if (charaSwitchTimer) return;

        // 根据列表位置决定滑动方向
        var oldIdx = galleryCharOrder.indexOf(oldDir);
        var newIdx = galleryCharOrder.indexOf(dir);
        var slideDown = newIdx < oldIdx; // 新角色在上方 → 向下滑

        // 清理旧动画类，确保新动画能触发
        prevMain.classList.remove('animate-in-from-bottom', 'animate-in-from-top');
        void prevMain.offsetWidth;
        prevMain.classList.add(slideDown ? 'animate-out-down' : 'animate-out-up');

        charaSwitchTimer = setTimeout(function() {
            charaSwitchTimer = null;
            renderSpriteCarousel(0);
            var newMain = document.querySelector('#spriteViewerLeft .sprite-viewer-main');
            if (newMain) {
                void newMain.offsetWidth;
                newMain.classList.add(slideDown ? 'animate-in-from-top' : 'animate-in-from-bottom');
            }
        }, 300);
    }

    function buildSpriteGalleryLayout() {
        const container = document.getElementById('galleryGridContainer');
        if (!container) return;
        const CHARA_NAMES = {};
        // Build display names from asset keys (strips path, shows key)
        Object.keys(assetConfig.sprites || {}).forEach(function(k) {
            CHARA_NAMES[k] = (typeof getAssetDisplayName === 'function')
                ? getAssetDisplayName('sprites', k)
                : k.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
        });
        gallerySpriteGroups = {};
        var _rev = window._imgbbReverse || {}; // 逆向映射：ImgBB URL → 原始路径
        Object.entries(assetConfig.sprites || {}).forEach(([key, url]) => {
            var match = url.match(/lhcf\/([^/]+)\//);
            var dir;
            if (match) {
                dir = match[1];
            } else {
                // 部署环境中 URL 已被替换为 ImgBB 链接，通过逆向映射还原原始路径
                var origPath = _rev[url];
                if (origPath) {
                    var fm = origPath.match(/lhcf\/([^/]+)\//);
                    dir = fm ? fm[1] : '_other';
                } else {
                    dir = '_other';
                }
            }
            if (!gallerySpriteGroups[dir]) gallerySpriteGroups[dir] = { name: CHARA_NAMES[dir] || dir, sprites: [] };
            gallerySpriteGroups[dir].sprites.push({ key, url, unlocked: unlockedSprites.includes(key) });
        });
        const groupEntries = Object.entries(gallerySpriteGroups).sort(([,a], [,b]) => {
            const aLocked = a.sprites.every(s => !s.unlocked);
            const bLocked = b.sprites.every(s => !s.unlocked);
            return aLocked - bLocked;
        });
        galleryCharOrder = groupEntries.map(([dir]) => dir);

        const thumbnailsHtml = groupEntries.map(([dir, group]) => {
            const unlocked = group.sprites.filter(s => s.unlocked);
            const allLocked = unlocked.length === 0;
            const thumbUrl = allLocked ? './CG/null.png' : unlocked[0].url;
            const total = group.sprites.length;
            const uc = unlocked.length;
            return `
            <div class="chara-thumb-card ${allLocked ? 'locked-item' : ''}" data-dir="${dir}" onclick="${allLocked ? 'showLockedTip()' : `selectGalleryChara('${dir}')`}">
                <img src="${thumbUrl}" alt="${group.name}">
                <span class="chara-thumb-name">${group.name}</span>
                <span class="chara-thumb-count">${allLocked ? t('gallery.sprite_locked') : `${uc}/${total}`}</span>
            </div>`;
        }).join('');

        container.innerHTML = `
            <div class="sprite-gallery-layout">
                <div class="sprite-viewer-left" id="spriteViewerLeft"></div>
                <div class="sprite-viewer-right">
                    <h4 style="color:#f5da8c;text-align:center;margin-bottom:12px;">👥 人物选择</h4>
                    <div class="chara-thumb-list">${thumbnailsHtml}</div>
                </div>
            </div>`;

        const firstUnlocked = groupEntries.find(([,g]) => g.sprites.some(s => s.unlocked));
        if (firstUnlocked) {
            selectGalleryChara(firstUnlocked[0]);
        } else if (groupEntries.length > 0) {
            selectGalleryChara(groupEntries[0][0]);
        }
    }

    function renderGalleryPage(tab = 'cg') {
        const container = document.getElementById('galleryGridContainer');
        const coverPage = document.getElementById('coverSettingsPage');
        if (!container) return;
        // 隐藏封面设置子页面
        if (coverPage) coverPage.style.display = 'none';
        container.style.display = '';

        if (tab === 'cg') {
            const items = Object.entries(assetConfig.cg || {}).map(([key, url]) => ({
                key, url, unlocked: unlockedCgs.includes(key)
            })).sort((a, b) => b.unlocked - a.unlocked);
            const left = [], right = [];
            items.forEach((item, i) => {
                const marked = coverCGCandidates.includes(item.key);
                const html = `
                <div class="gallery-card-cg ${!item.unlocked ? 'locked-item' : ''}">
                    <img src="${item.unlocked ? item.url : './CG/null.png'}" alt="${item.key}" onclick="${item.unlocked ? `showFullImage('${item.url.replace(/'/g, "\\'")}', 'cg')` : 'showLockedTip()'}">
                    <div class="cg-label-row">
                        <span>${item.key} ${!item.unlocked ? '(未解锁)' : ''}</span>
                        ${item.unlocked ? `<button class="cover-candidate-btn ${marked ? 'marked' : ''}" data-cg-key="${item.key}" title="设为封面候选">☆</button>` : ''}
                    </div>
                </div>`;
                (i % 2 === 0 ? left : right).push(html);
            });
            container.innerHTML = `<div class="gallery-grid-cg"><div class="gallery-col">${left.join('')}</div><div class="gallery-col">${right.join('')}</div></div>`;
            setTimeout(() => {
                container.querySelectorAll('.cover-candidate-btn').forEach(btn => {
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        const key = btn.dataset.cgKey;
                        const marked = toggleCoverCGCandidate(key);
                        btn.classList.toggle('marked', marked);
                        showToast(marked ? '已加入封面候选' : '已移除封面候选');
                    };
                });
            }, 0);
        } else if (tab === 'sprites') {
            buildSpriteGalleryLayout();
        } else if (tab === 'bg') {
            const items = Object.entries(assetConfig.bg || {}).map(([key, url]) => ({
                key, url, unlocked: unlockedBgs.includes(key)
            })).sort((a, b) => b.unlocked - a.unlocked);
            const unlockedCount = items.filter(i => i.unlocked).length;
            const left = [], right = [];
            items.forEach((item, i) => {
                const html = `
                <div class="gallery-card-cg ${!item.unlocked ? 'locked-item' : ''}">
                    <img src="${item.unlocked ? item.url : './CG/null.png'}" alt="${item.key}" onclick="${item.unlocked ? `showFullImage('${item.url.replace(/'/g, "\\'")}', 'bg')` : 'showLockedTip()'}">
                    <div class="cg-label-row">
                        <span>${item.key} ${!item.unlocked ? '(未解锁)' : ''}</span>
                    </div>
                </div>`;
                (i % 2 === 0 ? left : right).push(html);
            });
            container.innerHTML = `
                <div style="text-align:center; color:#b0a890; font-size:0.85rem; margin-bottom:14px;">${t('gallery.bg_progress', unlockedCount, items.length)}</div>
                <div class="gallery-grid-cg"><div class="gallery-col">${left.join('')}</div><div class="gallery-col">${right.join('')}</div></div>`;
        } else if (tab === 'music') {
            const items = Object.entries(assetConfig.bgm || {}).map(([key, url]) => ({
                key, url, unlocked: unlockedBgms.includes(key)
            })).sort((a, b) => b.unlocked - a.unlocked);
            const unlockedCount = items.filter(i => i.unlocked).length;
            container.innerHTML = `
                <div class="gallery-music-controls" style="margin-bottom:14px;">
                    <button class="music-continuous-btn" id="musicContinuousBtn">${t('gallery.music_loop')}</button>
                    <span style="color:#f0e8da; font-size:0.85rem;">${t('gallery.bg_progress', unlockedCount, items.length)}</span>
                </div>
                <div class="music-list">` + items.map(item => {
                    const marked = coverBGMCandidates.includes(item.key);
                    return `
                <div class="music-row ${!item.unlocked ? 'locked-row' : ''}" data-music-key="${item.key}">
                    <span class="music-name">🎵 ${MUSIC_NAME_MAP[item.key] || item.key} ${!item.unlocked ? '(' + t('gallery.music_locked') + ')' : ''}</span>
                    ${item.unlocked ? `
                    <button class="music-play-btn" data-music-key="${item.key}" data-music-url="${item.url.replace(/"/g, '&quot;')}">▶ ${t('gallery.music_play')}</button>
                    <div class="music-progress" data-music-key="${item.key}" id="progressBar_${item.key.replace(/[^a-zA-Z0-9]/g, '_')}"><div class="music-progress-fill" id="progressFill_${item.key.replace(/[^a-zA-Z0-9]/g, '_')}" style="width:0%;"></div></div>
                    <span class="music-time" id="musicTime_${item.key.replace(/[^a-zA-Z0-9]/g, '_')}">00:00</span>
                    <button class="cover-candidate-btn ${marked ? 'marked' : ''}" data-bgm-key="${item.key}" title="设为封面候选">☆</button>
                    ` : '<span style="color:#888;font-size:0.85rem;">' + t('gallery.music_locked') + '</span>'}
                </div>`;
                }).join('') + `</div>`;
            // 绑定事件
            setTimeout(() => {
                const continuousBtn = document.getElementById('musicContinuousBtn');
                if (continuousBtn) {
                    continuousBtn.classList.toggle('active', isMusicContinuous);
                    continuousBtn.onclick = toggleMusicContinuous;
                }
                container.querySelectorAll('.music-play-btn').forEach(btn => {
                    btn.onclick = () => {
                        const key = btn.dataset.musicKey;
                        const url = btn.dataset.musicUrl.replace(/&quot;/g, '"');
                        startGalleryMusicPlayback(key, url);
                    };
                });
                // 进度条点击和拖动
                container.querySelectorAll('.music-progress').forEach(bar => {
                    const key = bar.dataset.musicKey;
                    bar.addEventListener('mousedown', (e) => {
                        progressDragKey = key;
                        progressDragBar = bar;
                        seekMusicProgress(key, e);
                    });
                    bar.addEventListener('click', (e) => {
                        seekMusicProgress(key, e);
                    });
                });
                container.querySelectorAll('.cover-candidate-btn').forEach(btn => {
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        const key = btn.dataset.bgmKey;
                        const marked = toggleCoverBGMCandidate(key);
                        btn.classList.toggle('marked', marked);
                        showToast(marked ? '已加入封面候选' : '已移除封面候选');
                    };
                });
            }, 0);
        } else if (tab === 'endings') {
            // 从场景数据中收集所有结局
            const endingsMap = new Map();
            for (const s of currentScenes) {
                if (s && s.endingKey) {
                    if (!endingsMap.has(s.endingKey)) {
                        endingsMap.set(s.endingKey, {
                            key: s.endingKey,
                            title: s.endingTitle || s.endingKey,
                            desc: s.endingDesc || '',
                            cgKey: s.endingCg || s.cgKey || null
                        });
                    }
                }
            }
            const endings = Array.from(endingsMap.values());
            const unlockedCount = endings.filter(e => unlockedEndings.includes(e.key)).length;
            const allCollected = unlockedCount === endings.length && endings.length > 0;
            const pct = endings.length > 0 ? Math.round(unlockedCount * 100 / endings.length) : 0;
            if (endings.length === 0) {
                container.innerHTML = `
                <div class="endings-empty">
                    <span class="endings-empty-icon">📜</span>
                    <p class="endings-empty-text">尚未配置结局<br><small>在场景数据中添加 endingKey 来定义结局</small></p>
                </div>`;
            } else {
                container.innerHTML = `
                <div class="endings-summary">
                    <div class="endings-summary-icon">${allCollected ? '👑' : '🏆'}</div>
                    <div class="endings-summary-content">
                        <div class="endings-summary-text${allCollected ? ' complete' : ''}">${allCollected ? t('gallery.endings_all') : t('gallery.endings_progress', unlockedCount, endings.length)}</div>
                        <div class="endings-progress-bar"><div class="endings-progress-fill" style="width:${pct}%;"></div></div>
                    </div>
                </div>
                <div class="endings-grid">${endings.map(e => {
                    const unlocked = unlockedEndings.includes(e.key);
                    const cgUrl = e.cgKey && assetConfig.cg?.[e.cgKey] ? assetConfig.cg[e.cgKey] : '';
                    const ts = endingTimestamps[e.key];
                    const dateStr = ts ? formatSaveTimestamp(ts) : '';
                    return `
                <div class="ending-card ${unlocked ? 'unlocked' : 'locked'}">
                    <div class="ending-card-thumb">
                        ${unlocked && cgUrl ? `<img src="${cgUrl}" alt="${e.title}">` : `<span class="locked-icon">?</span>`}
                    </div>
                    <div class="ending-card-body">
                        ${unlocked ? `<span class="ending-card-badge${allCollected ? ' collected' : ''}">✦ 已解锁</span>` : ''}
                        <div class="ending-card-title">${unlocked ? e.title : t('gallery.endings_locked')}</div>
                        <div class="ending-card-desc">${unlocked && e.desc ? e.desc : (unlocked ? '' : t('gallery.endings_tip'))}</div>
                        ${unlocked && dateStr ? `<div class="ending-card-date">🕐 ${dateStr}</div>` : ''}
                    </div>
                </div>`;
                }).join('')}</div>`;
            }
        } else if (tab === 'achievements') {
            const unlockedCount = unlockedAchievements.length;
            const totalCount = ACHIEVEMENTS.length;
            const pct = totalCount > 0 ? Math.round(unlockedCount * 100 / totalCount) : 0;
            const cards = ACHIEVEMENTS.map(function(ach) {
                var unlocked = isAchievementUnlocked(ach.id);
                var achI18n = (typeof achievementI18n === 'function') ? achievementI18n(ach.id) : null;
                var achName = unlocked ? (achI18n ? achI18n.name : ach.name) : t('gallery.endings_locked');
                var achDesc = unlocked ? (achI18n ? achI18n.desc : ach.desc) : (achI18n ? achI18n.hint : ach.hint);
                return '<div class="achievement-card' + (unlocked ? ' unlocked' : ' locked') + '">' +
                    '<div class="achievement-icon"><i class="fa-solid ' + ach.icon + '"></i></div>' +
                    '<div class="achievement-info">' +
                        '<div class="achievement-name">' + achName + '</div>' +
                        '<div class="achievement-desc">' + achDesc + '</div>' +
                    '</div>' +
                    (unlocked ? '<div class="achievement-check"><i class="fa-solid fa-check-circle"></i></div>' : '<div class="achievement-lock"><i class="fa-solid fa-lock"></i></div>') +
                '</div>';
            }).join('');
            container.innerHTML =
                '<div class="achievements-summary">' +
                    '<div class="achievements-progress"><span>' + unlockedCount + '</span> / <span>' + totalCount + '</span> ' + t('gallery.ach_unlocked') + '</div>' +
                    '<div class="achievements-progress-bar"><div class="achievements-progress-fill" style="width:' + pct + '%"></div></div>' +
                '</div>' +
                '<div class="achievements-grid">' + cards + '</div>';
        } else if (tab === 'flowchart') {
            container.innerHTML = renderFlowChartSVG();
            fcZoomLevel = 1; fcPanX = 0; fcPanY = 0; // reset on tab switch
            // Attach tooltip events & drag-to-pan
            setTimeout(function() {
                var tooltip = document.getElementById('flowchartTooltip');
                var wrap = document.getElementById('flowchartWrap');
                if (!tooltip || !wrap) return;

                // ★ Scroll wheel: normal=pan(vertical), shift=pan(horizontal), ctrl=zoom
                wrap.addEventListener('wheel', function(e) {
                    if (e.ctrlKey || e.metaKey) {
                        // Ctrl+滚轮 = 缩放
                        e.preventDefault();
                        fcZoomLevel += e.deltaY < 0 ? 0.1 : -0.1;
                        fcZoomLevel = Math.max(FC_ZOOM_MIN, Math.min(FC_ZOOM_MAX, fcZoomLevel));
                    } else {
                        // 普通滚轮 = 平移 (垂直滚动→上下平移, Shift+滚动→左右平移)
                        e.preventDefault();
                        fcPanY -= e.deltaY;
                        fcPanX -= e.deltaX || (e.shiftKey ? e.deltaY : 0);
                    }
                    fcApplyZoom();
                }, { passive: false });

                // ★ Drag-to-pan: 鼠标拖拽平移
                wrap.addEventListener('mousedown', function(e) {
                    if (e.target.closest('.fc-node')) return; // 点击节点时不触发拖拽
                    fcDragging = true;
                    fcDragStartX = e.clientX;
                    fcDragStartY = e.clientY;
                    fcDragPanStartX = fcPanX;
                    fcDragPanStartY = fcPanY;
                    wrap.style.cursor = 'grabbing';
                    e.preventDefault();
                });
                document.addEventListener('mousemove', function(e) {
                    if (!fcDragging) return;
                    fcPanX = fcDragPanStartX + (e.clientX - fcDragStartX);
                    fcPanY = fcDragPanStartY + (e.clientY - fcDragStartY);
                    fcApplyZoom();
                });
                document.addEventListener('mouseup', function() {
                    if (fcDragging && wrap) wrap.style.cursor = '';
                    fcDragging = false;
                });

                // ★ Touch support: 双指缩放 + 单指平移
                var fcLastPinchDist = 0, fcLastPinchZoom = 1;
                wrap.addEventListener('touchstart', function(e) {
                    if (e.touches.length === 1) {
                        fcDragging = true;
                        fcDragStartX = e.touches[0].clientX;
                        fcDragStartY = e.touches[0].clientY;
                        fcDragPanStartX = fcPanX;
                        fcDragPanStartY = fcPanY;
                    } else if (e.touches.length === 2) {
                        fcDragging = false;
                        var dx = e.touches[1].clientX - e.touches[0].clientX;
                        var dy = e.touches[1].clientY - e.touches[0].clientY;
                        fcLastPinchDist = Math.sqrt(dx * dx + dy * dy);
                        fcLastPinchZoom = fcZoomLevel;
                    }
                }, { passive: false });
                wrap.addEventListener('touchmove', function(e) {
                    if (e.touches.length === 1 && fcDragging) {
                        e.preventDefault();
                        fcPanX = fcDragPanStartX + (e.touches[0].clientX - fcDragStartX);
                        fcPanY = fcDragPanStartY + (e.touches[0].clientY - fcDragStartY);
                        fcApplyZoom();
                    } else if (e.touches.length === 2) {
                        e.preventDefault();
                        var dx = e.touches[1].clientX - e.touches[0].clientX;
                        var dy = e.touches[1].clientY - e.touches[0].clientY;
                        var dist = Math.sqrt(dx * dx + dy * dy);
                        if (fcLastPinchDist > 0) {
                            fcZoomLevel = Math.max(FC_ZOOM_MIN, Math.min(FC_ZOOM_MAX, fcLastPinchZoom * (dist / fcLastPinchDist)));
                            fcApplyZoom();
                        }
                    }
                }, { passive: false });
                wrap.addEventListener('touchend', function() { fcDragging = false; });
                var svgNodes = wrap.querySelectorAll('.fc-node');
                svgNodes.forEach(function(el) {
                    el.addEventListener('mouseenter', function(e) {
                        var sceneId = parseInt(el.dataset.sceneId);
                        if (isNaN(sceneId)) return;
                        var s = currentScenes[sceneId];
                        if (!s) return;
                        var spk = (s.speaker || '').replace(/\[[^\]]*\]/g, '').trim();
                        var txt = (s.text || '').replace(/\[[^\]]*\]/g, '').trim().substring(0, 60);
                        var hasChoice = !!(s.choices && s.choices.length > 0);
                        var isEnd = !!s.endingKey;
                        var unlocked = isEnd ? unlockedEndings.includes(s.endingKey) : true;
                        var lines = [];
                        lines.push('<b>场景 #' + sceneId + '</b>');
                        if (spk) lines.push('旁白: ' + escHtml(spk));
                        if (txt) lines.push(escHtml(txt));
                        if (hasChoice) lines.push('<span style="color:#dba541">含 ' + s.choices.length + ' 个选项</span>');
                        if (isEnd) lines.push(unlocked ? '<span style="color:#f5da8c">★ 已解锁结局</span>' : '<span style="color:#888">结局未解锁</span>');
                        tooltip.innerHTML = lines.join('<br>');
                        tooltip.classList.add('show');
                    });
                    el.addEventListener('mousemove', function(e) {
                        tooltip.style.left = (e.clientX + 16) + 'px';
                        tooltip.style.top = (e.clientY - 30) + 'px';
                    });
                    el.addEventListener('mouseleave', function() {
                        tooltip.classList.remove('show');
                    });
                    // 点击非选项节点跳转到对应场景
                    el.addEventListener('click', function(e) {
                        var sceneId = parseInt(el.dataset.sceneId);
                        if (isNaN(sceneId)) return; // 虚拟选择节点没有data-scene-id，不处理
                        e.stopPropagation();
                        jumpToFlowChartScene(sceneId);
                    });
                });
            }, 100);
        }
    }

    function showFullImage(url, category) {
        // 在鉴赏模式下查看大图，带左右导航（category: 'cg' | 'sprites' | 'bg'）
        category = category || 'cg';
        const assetMap = category === 'sprites' ? assetConfig.sprites : (category === 'bg' ? assetConfig.bg : assetConfig.cg);
        const unlockList = category === 'sprites' ? unlockedSprites : (category === 'bg' ? unlockedBgs : unlockedCgs);
        const allEntries = Object.entries(assetMap || {}).filter(([key]) => unlockList.includes(key));
        const currentIdx = allEntries.findIndex(([, u]) => u === url);
        const total = allEntries.length;

        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); z-index:3000; display:flex; justify-content:center; align-items:center;';
        const img = document.createElement('img');
        img.src = url;
        img.style.maxWidth = '85%';
        img.style.maxHeight = '85%';
        img.style.borderRadius = '16px';
        img.style.border = '2px solid #dba541';
        img.style.transition = 'opacity 0.3s';
        modal.appendChild(img);

        // 如果有多张已解锁CG，显示导航箭头
        if (total > 1) {
            let navIdx = currentIdx >= 0 ? currentIdx : 0;

            const updateCgImage = () => {
                const [key, u] = allEntries[navIdx];
                img.style.opacity = '0';
                setTimeout(() => {
                    img.src = u;
                    img.style.opacity = '1';
                }, 200);
            };

            const prevBtn = document.createElement('div');
            prevBtn.innerHTML = '◀';
            prevBtn.style.cssText = 'position:absolute; left:3%; top:50%; transform:translateY(-50%); background:rgba(0,0,0,0.5); border:1px solid rgba(219,165,65,0.5); color:#f0e0b0; font-size:2rem; width:50px; height:50px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:3010; transition:0.2s;';
            prevBtn.onmouseenter = () => { prevBtn.style.background = '#dba541'; prevBtn.style.color = '#1e1a10'; };
            prevBtn.onmouseleave = () => { prevBtn.style.background = 'rgba(0,0,0,0.5)'; prevBtn.style.color = '#f0e0b0'; };
            prevBtn.onclick = (e) => {
                e.stopPropagation();
                navIdx = (navIdx - 1 + total) % total;
                updateCgImage();
            };

            const nextBtn = document.createElement('div');
            nextBtn.innerHTML = '▶';
            nextBtn.style.cssText = 'position:absolute; right:3%; top:50%; transform:translateY(-50%); background:rgba(0,0,0,0.5); border:1px solid rgba(219,165,65,0.5); color:#f0e0b0; font-size:2rem; width:50px; height:50px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:3010; transition:0.2s;';
            nextBtn.onmouseenter = () => { nextBtn.style.background = '#dba541'; nextBtn.style.color = '#1e1a10'; };
            nextBtn.onmouseleave = () => { nextBtn.style.background = 'rgba(0,0,0,0.5)'; nextBtn.style.color = '#f0e0b0'; };
            nextBtn.onclick = (e) => {
                e.stopPropagation();
                navIdx = (navIdx + 1) % total;
                updateCgImage();
            };

            modal.appendChild(prevBtn);
            modal.appendChild(nextBtn);
        }

        modal.onclick = (e) => { if (e.target === modal || e.target === img) modal.remove(); };
        document.body.appendChild(modal);
    }

    function showCharaSpriteViewer(name, sprites, startKey) {
        // 角色立绘查看器：仅在组内已解锁的差分间左右切换
        if (!sprites || sprites.length === 0) return;
        const unlockedList = sprites.filter(s => s.unlocked);
        if (unlockedList.length === 0) { showLockedTip(); return; }
        let navIdx = 0;
        if (startKey) {
            const found = unlockedList.findIndex(s => s.key === startKey);
            if (found >= 0) navIdx = found;
        }
        const total = unlockedList.length;

        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.78); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); z-index:3000; display:flex; flex-direction:column; justify-content:center; align-items:center;';
        const titleBar = document.createElement('div');
        titleBar.innerText = `${name} · ${unlockedList[navIdx].key} (${navIdx + 1}/${total})`;
        titleBar.style.cssText = 'color:#f5da8c; font-size:1.2rem; margin-bottom:12px; letter-spacing:2px;';
        modal.appendChild(titleBar);
        const img = document.createElement('img');
        img.src = unlockedList[navIdx].url;
        img.style.maxWidth = '82%';
        img.style.maxHeight = '78%';
        img.style.borderRadius = '16px';
        img.style.border = '2px solid #dba541';
        img.style.transition = 'opacity 0.3s';
        modal.appendChild(img);

        const updateImage = () => {
            img.style.opacity = '0';
            setTimeout(() => {
                img.src = unlockedList[navIdx].url;
                titleBar.innerText = `${name} · ${unlockedList[navIdx].key} (${navIdx + 1}/${total})`;
                img.style.opacity = '1';
            }, 200);
        };

        if (total > 1) {
            const prevBtn = document.createElement('div');
            prevBtn.innerHTML = '◀';
            prevBtn.style.cssText = 'position:absolute; left:3%; top:50%; transform:translateY(-50%); background:rgba(0,0,0,0.5); border:1px solid rgba(219,165,65,0.5); color:#f0e0b0; font-size:2rem; width:50px; height:50px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:3010; transition:0.2s;';
            prevBtn.onmouseenter = () => { prevBtn.style.background = '#dba541'; prevBtn.style.color = '#1e1a10'; };
            prevBtn.onmouseleave = () => { prevBtn.style.background = 'rgba(0,0,0,0.5)'; prevBtn.style.color = '#f0e0b0'; };
            prevBtn.onclick = (e) => { e.stopPropagation(); navIdx = (navIdx - 1 + total) % total; updateImage(); };

            const nextBtn = document.createElement('div');
            nextBtn.innerHTML = '▶';
            nextBtn.style.cssText = 'position:absolute; right:3%; top:50%; transform:translateY(-50%); background:rgba(0,0,0,0.5); border:1px solid rgba(219,165,65,0.5); color:#f0e0b0; font-size:2rem; width:50px; height:50px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:3010; transition:0.2s;';
            nextBtn.onmouseenter = () => { nextBtn.style.background = '#dba541'; nextBtn.style.color = '#1e1a10'; };
            nextBtn.onmouseleave = () => { nextBtn.style.background = 'rgba(0,0,0,0.5)'; nextBtn.style.color = '#f0e0b0'; };
            nextBtn.onclick = (e) => { e.stopPropagation(); navIdx = (navIdx + 1) % total; updateImage(); };
            modal.appendChild(prevBtn);
            modal.appendChild(nextBtn);
        }

        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        document.body.appendChild(modal);
    }

    let galleryMusicIndex = -1;
    let galleryMusicItems = [];
    function startGalleryMusicPlayback(key, url) {
        // 如果点击的是正在播放的曲目，切换暂停/播放
        if (currentGalleryMusicKey === key && audioElement && audioElement.src) {
            if (audioElement.paused) {
                audioElement.play();
                updateMusicPlayButton(key, true);
            } else {
                audioElement.pause();
                updateMusicPlayButton(key, false);
            }
            return;
        }
        // 切换新曲目 (Howler.js: 创建新实例替换旧实例)
        currentGalleryMusicKey = key;
        if (musicProgressInterval) clearInterval(musicProgressInterval);
        let vol = audioElement ? audioElement.volume : 0.5;
        _createBgmHowl(url, vol);
        audioElement.loop = !isMusicContinuous;
        audioElement.play();
        updateMusicPlayButton(key, true);
        musicProgressInterval = setInterval(updateMusicProgress, 200);
        if (isMusicContinuous && audioElement) {
            audioElement.onended = function() { if (isMusicContinuous) playNextGalleryTrack(); };
        }
    }
    function updateMusicPlayButton(key, isPlaying) {
        document.querySelectorAll('.music-play-btn').forEach(b => { b.innerText = t('gallery.music_play'); });
        const activeBtn = document.querySelector(`.music-play-btn[data-music-key="${key}"]`);
        if (activeBtn) activeBtn.innerText = isPlaying ? '⏸ ' + t('gallery.music_play') : '▶ ' + t('gallery.music_play');
    }
    function updateMusicProgress() {
        if (!audioElement || !currentGalleryMusicKey) {
            // 清理所有进度条
            document.querySelectorAll('.music-progress-fill').forEach(f => { f.style.width = '0%'; });
            document.querySelectorAll('.music-time').forEach(t => { t.innerText = '00:00'; });
            return;
        }
        const duration = audioElement.duration;
        if (!duration || isNaN(duration)) return;
        const pct = (audioElement.currentTime / duration) * 100;
        const safeKey = currentGalleryMusicKey.replace(/[^a-zA-Z0-9]/g, '_');
        const fill = document.getElementById('progressFill_' + safeKey);
        const time = document.getElementById('musicTime_' + safeKey);
        if (fill) fill.style.width = pct + '%';
        if (time) {
            const m = Math.floor(audioElement.currentTime / 60);
            const s = Math.floor(audioElement.currentTime % 60);
            time.innerText = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
        }
        if (audioElement.paused || audioElement.ended) {
            updateMusicPlayButton(currentGalleryMusicKey, false);
        }
    }
    function seekMusicProgress(key, event) {
        if (!audioElement || currentGalleryMusicKey !== key) {
            // 如果还没播放过这首，先播放
            const entry = Object.entries(assetConfig.bgm || {}).find(([k]) => k === key);
            if (entry) startGalleryMusicPlayback(key, entry[1]);
            return;
        }
        if (!audioElement.duration || isNaN(audioElement.duration)) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        audioElement.currentTime = pct * audioElement.duration;
    }
    function playNextGalleryTrack() {
        const allItems = Object.entries(assetConfig.bgm || {}).filter(([k]) => unlockedBgms.includes(k));
        if (allItems.length === 0) return;
        const curIdx = allItems.findIndex(([k]) => k === currentGalleryMusicKey);
        const nextIdx = (curIdx + 1) % allItems.length;
        const [key, url] = allItems[nextIdx];
        startGalleryMusicPlayback(key, url);
    }
    function playMusicFromGallery(url) {
        let vol = audioElement ? audioElement.volume : 0.5;
        _createBgmHowl(url, vol);
        audioElement.loop = !isMusicContinuous;
        audioElement.play();
        const np = document.getElementById('galleryNowPlaying');
        if (np) np.innerText = '🎵 正在播放';
    }
    function playMusicFromGalleryByIndex(idx) {
        const items = Object.entries(assetConfig.bgm || {}).filter(([,]) => unlockedBgms.includes(Object.keys(assetConfig.bgm)[idx]));
        // 重新获取
        const allItems = Object.entries(assetConfig.bgm || {});
        galleryMusicItems = allItems.filter(([key]) => unlockedBgms.includes(key));
        galleryMusicIndex = galleryMusicItems.findIndex(([key]) => key === allItems[idx]?.[0]);
        if (galleryMusicIndex < 0) galleryMusicIndex = 0;
        const [key, url] = galleryMusicItems[galleryMusicIndex] || [null, null];
        if (url) {
            playMusicFromGallery(url);
            const displayName = MUSIC_NAME_MAP[key] || key;
            if (galleryNowPlaying) galleryNowPlaying.innerText = `🎵 ${displayName}`;
        }
    }
    function playNextMusicInGallery() {
        if (galleryMusicItems.length === 0) return;
        galleryMusicIndex = (galleryMusicIndex + 1) % galleryMusicItems.length;
        const [key, url] = galleryMusicItems[galleryMusicIndex];
        if (url) {
            playMusicFromGallery(url);
            const displayName = MUSIC_NAME_MAP[key] || key;
            const np = document.getElementById('galleryNowPlaying');
            if (np) np.innerText = `🎵 ${displayName}`;
        }
    }
    function toggleMusicContinuous() {
        isMusicContinuous = !isMusicContinuous;
        const btn = document.getElementById('musicContinuousBtn');
        if (btn) btn.classList.toggle('active', isMusicContinuous);
        if (audioElement && audioElement.src) {
            audioElement.loop = !isMusicContinuous;
        }
        if (isMusicContinuous) {
            showToast("连续播放已开启");
            // 监听播放结束
            if (audioElement) {
                audioElement.onended = () => {
                    if (isMusicContinuous) playNextMusicInGallery();
                };
            }
        } else {
            if (audioElement) audioElement.onended = null;
            showToast("连续播放已关闭");
        }
    }

    function showLockedTip() {
        showToast(t('gallery.locked_tip'));
    }

    // 事件绑定
    nextBtn.onclick = nextDialogue;
    const hotkeyInput = document.getElementById('hotkeyInput');
    let isWaitingForHotkey = false;

    // 从 localStorage 加载热键并显示
    let storedKey = localStorage.getItem('customNextKey');
    if (!storedKey) storedKey = ' ';
    customNextKey = storedKey;
    if (hotkeyInput) {
        hotkeyInput.value = (customNextKey === ' ') ? '空格' : customNextKey;
    }
    // 点击输入框时，开始等待热键
    if (hotkeyInput) {
        hotkeyInput.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isWaitingForHotkey) return;
            isWaitingForHotkey = true;
            hotkeyInput.value = '按下任意键...';
            hotkeyInput.style.backgroundColor = '#3e3528';
            
            const onKeyDown = (e) => {
                e.preventDefault();
                e.stopPropagation();
                let key = e.key;
                // 处理特殊键
                if (key === ' ') key = ' ';
                if (key === 'Enter') key = 'Enter';
                // 过滤掉 Ctrl, Shift, Alt, Meta 等修饰键单独按下
                if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') {
                    // 忽略，不记录
                    return;
                }
                // 如果是单字符或空格/回车，记录
                if (key.length === 1 || key === 'Enter') {
                    customNextKey = key;
                    localStorage.setItem('customNextKey', key);
                    hotkeyInput.value = (key === ' ') ? '空格' : key;
                    showToast(`热键已设为 ${hotkeyInput.value}`);
                } else {
                    // 其他功能键暂不支持，恢复原值
                    hotkeyInput.value = (customNextKey === ' ') ? '空格' : customNextKey;
                    showToast('仅支持字母、数字、空格或回车键');
                }
                // 清理监听
                document.removeEventListener('keydown', onKeyDown);
                isWaitingForHotkey = false;
                hotkeyInput.style.backgroundColor = '#2a2418';
            };
            
            document.addEventListener('keydown', onKeyDown, { once: true });
            // 设置超时，防止一直等待
            setTimeout(() => {
                if (isWaitingForHotkey) {
                    document.removeEventListener('keydown', onKeyDown);
                    isWaitingForHotkey = false;
                    hotkeyInput.value = (customNextKey === ' ') ? '空格' : customNextKey;
                    hotkeyInput.style.backgroundColor = '#2a2418';
                    showToast('热键设置超时，未更改');
                }
            }, 10000);
        });
    }
    startGameMainBtn.onclick = () => showSubmenu('start');
    if (projectSettingsBtn) projectSettingsBtn.onclick = showProjectSubmenu;
    if (volumeSettingsBtn) volumeSettingsBtn.onclick = showVolumeSubmenu;
    if (backToSettingsFromProject) backToSettingsFromProject.onclick = showSettingsMain;
    if (backToSettingsFromVolume) backToSettingsFromVolume.onclick = showSettingsMain;
    if (autoPlaySettingsBtn) autoPlaySettingsBtn.onclick = showAutoPlaySubmenu;
    if (backToSettingsFromAutoPlay) backToSettingsFromAutoPlay.onclick = showSettingsMain;
    settingsMainBtn.onclick = () => showSubmenu('settings');
    document.getElementById('hotkeySettingsBtn').onclick = showHotkeySubmenu;
    document.getElementById('backToSettingsBtn').onclick = showSettingsMain;
    // 为除“返回设置”按钮之外的所有返回按钮绑定返回主菜单
    // 只给“返回主菜单”的按钮绑定 showMainMenu
    const mainMenuBackBtns = document.querySelectorAll('#backToMainMenuBtn, #backToMainMenuBtn2');
    mainMenuBackBtns.forEach(btn => btn.onclick = showMainMenu);
    fastForwardBtn.onclick = toggleFastForward;
    document.getElementById('autoPlayBtn').onclick = toggleAutoPlay;
    if (skipReadBtn) skipReadBtn.onclick = toggleSkipRead;
    if (fullscreenBtn) fullscreenBtn.onclick = toggleFullscreen;
    if (backlogCloseBtn) backlogCloseBtn.onclick = closeBacklog;
    skipChapterBtn.onclick = skipToNextChapter;
    document.getElementById('prevChoiceBtn').onclick = jumpToPreviousChoice;
    document.getElementById('nextChoiceBtn').onclick = jumpToNextChoice;
    // Backlog 背景点击关闭
    if (backlogOverlay) backlogOverlay.addEventListener('click', (e) => {
        if (e.target === backlogOverlay) closeBacklog();
    });
    // CG 导航按钮
    if (cgPrevBtn) cgPrevBtn.addEventListener('click', (e) => { e.stopPropagation(); navigateCg(-1); });
    if (cgNextBtn) cgNextBtn.addEventListener('click', (e) => { e.stopPropagation(); navigateCg(1); });
    // 鼠标滚轮打开 backlog
    document.addEventListener('wheel', (e) => {
        if (!gameActive || isTyping) return;
        if (backlogOverlay && backlogOverlay.classList.contains('show')) return;
        if (settingsModal.classList.contains('show')) return;
        if (e.deltaY < -40 && !e.ctrlKey) {
            // 向上滚动，打开日志
            openBacklog();
        }
    }, { passive: true });
    // 记录设置打开前的状态
    let wasFastForwardingBeforeSettings = false;
    let wasAutoPlayBeforeSettings = false;
    // 点击模态框背景关闭
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettingsBtn.click(); // 复用关闭逻辑
        }
    });
    // 打开设置页面
    settingsIcon.onclick = () => {
        // 记录当前快进和自动播放状态
        wasFastForwardingBeforeSettings = isFastForwarding;
        wasAutoPlayBeforeSettings = autoPlayEnabled;
        // 停止快进和自动播放（如果开启）
        if (isFastForwarding) stopFastForward();
        if (autoPlayEnabled) stopAutoPlay();
        // 显示设置面板
        settingsModal.classList.add('show');
    };

    // 关闭设置页面（通过关闭按钮）
    closeSettingsBtn.onclick = () => {
        settingsModal.classList.remove('show');
        // 如果游戏仍然活跃，恢复之前的状态
        if (gameActive) {
            // 优先恢复快进（因为快进优先级高于自动播放，且两者不会同时恢复）
            if (wasFastForwardingBeforeSettings) {
                startFastForward();
            } else if (wasAutoPlayBeforeSettings) {
                startAutoPlay();
            }
        }
        // 重置记录标志（可选，避免下次误用）
        wasFastForwardingBeforeSettings = false;
        wasAutoPlayBeforeSettings = false;
    };
    settingsSaveBtn.onclick = () => { if (gameActive) openSavePage(); else showToast("游戏未开始"); };
    settingsReturnTitleBtn.onclick = () => { settingsModal.classList.remove('show'); if (gameActive) returnToTitle(); };
    // ★ 恢复默认设置
    var settingsResetDefaultsBtn = document.getElementById('settingsResetDefaultsBtn');
    if (settingsResetDefaultsBtn) {
        settingsResetDefaultsBtn.onclick = function() {
            if (!confirm('恢复所有设置为默认值？此操作不可撤销。')) return;
            resetSettingsToDefaults();
            showToast('设置已恢复默认');
        };
    }
    function resetSettingsToDefaults() {
        // 音量: BGM 50%, SE 80%, Voice 80%
        var defVol = 50;
        localStorage.setItem('galgame_volume', defVol);
        if (audioElement) audioElement.volume = defVol / 100;
        if (volumeSlider) volumeSlider.value = defVol;
        if (volumeValue) volumeValue.innerText = defVol + '%';
        if (menuVolumeSlider) menuVolumeSlider.value = defVol;
        if (menuVolumeValue) menuVolumeValue.innerText = defVol + '%';
        localStorage.setItem(SE_VOLUME_KEY, '80');
        seVolume = 0.8;
        if (typeof seVolumeSlider !== 'undefined' && seVolumeSlider) { seVolumeSlider.value = 80; }
        if (typeof seVolumeValue !== 'undefined' && seVolumeValue) { seVolumeValue.innerText = '80%'; }
        localStorage.setItem(VOICE_VOLUME_KEY, '80');
        voiceVolume = 0.8;
        if (typeof voiceVolumeSlider !== 'undefined' && voiceVolumeSlider) { voiceVolumeSlider.value = 80; }
        if (typeof voiceVolumeValue !== 'undefined' && voiceVolumeValue) { voiceVolumeValue.innerText = '80%'; }
        // 文本速度 40ms/字
        localStorage.setItem('galgame_text_speed', '40');
        textSpeed = 40;
        if (typeof textSpeedSlider !== 'undefined' && textSpeedSlider) { textSpeedSlider.value = 40; }
        if (typeof textSpeedValue !== 'undefined' && textSpeedValue) { textSpeedValue.innerText = '40 ms/字'; }
        // 自适应阅读速度：重置为开启
        localStorage.removeItem('galgame_adaptive_speed');
        adaptiveSpeedEnabled = true;
        if (typeof adaptiveSpeedCheckbox !== 'undefined' && adaptiveSpeedCheckbox) { adaptiveSpeedCheckbox.checked = true; }
        _adaptiveSpeedEMA = null;
        // 自动播放 0.06 秒/字, 最小间隔 1.0s
        localStorage.setItem('autoPlaySpeed', '0.06');
        autoPlaySpeed = 0.06;
        if (typeof autoPlaySpeedSlider !== 'undefined' && autoPlaySpeedSlider) { autoPlaySpeedSlider.value = 6; }
        if (typeof autoPlaySpeedValue !== 'undefined' && autoPlaySpeedValue) { autoPlaySpeedValue.innerText = '0.06 秒/字'; }
        if (typeof menuAutoPlaySpeedSlider !== 'undefined' && menuAutoPlaySpeedSlider) { menuAutoPlaySpeedSlider.value = 6; }
        if (typeof menuAutoPlaySpeedValue !== 'undefined' && menuAutoPlaySpeedValue) { menuAutoPlaySpeedValue.innerText = '0.06 秒/字'; }
        localStorage.setItem('minAutoPlayDelay', '1.0');
        minAutoPlayDelay = 1.0;
        if (typeof minDelaySlider !== 'undefined' && minDelaySlider) { minDelaySlider.value = 1.0; }
        if (typeof minDelayValue !== 'undefined' && minDelayValue) { minDelayValue.innerText = '1.0 秒'; }
        if (typeof menuMinDelaySlider !== 'undefined' && menuMinDelaySlider) { menuMinDelaySlider.value = 1.0; }
        if (typeof menuMinDelayValue !== 'undefined' && menuMinDelayValue) { menuMinDelayValue.innerText = '1.0 秒'; }
        // 立绘切换：crossfade
        localStorage.removeItem('galgame_sprite_transition');
        spriteTransitionMode = 'crossfade';
        if (typeof spriteTransitionSelect !== 'undefined' && spriteTransitionSelect) { spriteTransitionSelect.value = 'crossfade'; }
        // 滚轮回溯：开启, 300ms
        localStorage.removeItem('galgame_rollback_enabled');
        rollbackEnabled = true;
        if (typeof rollbackEnabledCheckbox !== 'undefined' && rollbackEnabledCheckbox) { rollbackEnabledCheckbox.checked = true; }
        localStorage.setItem('galgame_rollback_cooldown', '300');
        rollbackCooldown = 300;
        if (typeof rollbackSpeedSlider !== 'undefined' && rollbackSpeedSlider) { rollbackSpeedSlider.value = 300; }
        if (typeof rollbackSpeedValue !== 'undefined' && rollbackSpeedValue) { rollbackSpeedValue.innerText = '300ms'; }
        // 热键：空/Control/Alt/q
        localStorage.removeItem('customNextKey');
        customNextKey = ' ';
        if (typeof hotkeyInput !== 'undefined' && hotkeyInput) { hotkeyInput.value = '空格'; }
        localStorage.removeItem('customFastForwardKey');
        customFastForwardKey = 'Control';
        if (typeof fastForwardHotkeyInput !== 'undefined' && fastForwardHotkeyInput) { fastForwardHotkeyInput.value = 'Ctrl'; }
        localStorage.removeItem('customAutoPlayKey');
        customAutoPlayKey = 'Alt';
        if (typeof autoPlayHotkeyInput !== 'undefined' && autoPlayHotkeyInput) { autoPlayHotkeyInput.value = 'Alt'; }
        localStorage.removeItem('customQuickSaveKey');
        customQuickSaveKey = 'q';
        if (typeof quickSaveHotkeyInput !== 'undefined' && quickSaveHotkeyInput) { quickSaveHotkeyInput.value = 'Q'; }
        // 手柄：启用
        localStorage.setItem('galgame_gamepad_enabled', 'true');
        if (typeof gamepadEnabledCheckbox !== 'undefined' && gamepadEnabledCheckbox) { gamepadEnabledCheckbox.checked = true; }
        if (typeof gamepadEnabled !== 'undefined') gamepadEnabled = true;
        // 语音闪避：30%
        localStorage.setItem('bgmDuckingRatio', '30');
        bgmDuckingRatio = 0.3;
        if (typeof duckingRatioSlider !== 'undefined' && duckingRatioSlider) { duckingRatioSlider.value = 30; }
        if (typeof duckingRatioValue !== 'undefined' && duckingRatioValue) { duckingRatioValue.innerText = '30%'; }
    }
    bgmToggleBtn.onclick = toggleBgmMute;
    // 实时更新音量函数（立即生效）
    function updateVolumeImmediately(val) {
        if (audioElement) audioElement.volume = val / 100;
        volumeValue.innerText = val + '%';
    }
    // 保存到 localStorage 的防抖函数
    const debouncedSaveVolume = debounce((val) => {
        localStorage.setItem('galgame_volume', val);
    }, 300);

    volumeSlider.oninput = (e) => {
        let val = parseInt(e.target.value);
        updateVolumeImmediately(val);
        debouncedSaveVolume(val);
    };
    document.getElementById('newGameBtn').onclick = function() { _abortProgressivePreload(); startNewGameFromCurrent(); };
    document.getElementById('loadGameBtn').onclick = openSavePage;
    continueBtn.onclick = loadLatestSaveFromLocal;
    document.getElementById('closeSavePageBtn').onclick = closeSavePage;
    var shareCodeBtn = document.getElementById('shareCodeBtn');
    var loadShareCodeBtn = document.getElementById('loadShareCodeBtn');
    if (shareCodeBtn) shareCodeBtn.onclick = function() { showShareCodeUI(); };
    if (loadShareCodeBtn) loadShareCodeBtn.onclick = function() { showLoadShareCodeUI(); };
    document.getElementById('quickSaveBtn').onclick = saveToAutoSlot;
    document.getElementById('loadAutoSaveBtn').onclick = loadAutoSaveSlot;
    document.getElementById('reviewChapterBtn').onclick = showChapterReview;
    const debouncedSaveMenuVolume = debounce((val) => {
        localStorage.setItem('galgame_volume', val);
    }, 300);

    menuVolumeSlider.oninput = function() {
        let val = parseInt(this.value);
        menuVolumeValue.innerText = val + '%';
        if (audioElement) audioElement.volume = val / 100;
        const mainVolumeSlider = document.getElementById('volumeSlider');
        if (mainVolumeSlider) {
            mainVolumeSlider.value = val;
            volumeValue.innerText = val + '%';
        }
        debouncedSaveMenuVolume(val);
    };
    document.getElementById('exitBtn').onclick = () => { if (confirm("结束游戏？")) window.close(); };
    document.getElementById('resetDefaultBtn').onclick = resetToEggDefault;
    document.getElementById('exportFullProjectBtn').onclick = exportFullProject;
    const loadProjectBtn = document.getElementById('loadProjectBtn');
    const projectFileInput = document.createElement('input');
    const galleryBtn = document.getElementById('galleryBtn');
    const closeGalleryPageBtn = document.getElementById('closeGalleryPageBtn');

    document.getElementById('applyCoverSettingsBtn').onclick = () => {
        const imgModeEl = document.getElementById('coverImageMode');
        const bgmModeEl = document.getElementById('coverBgmMode');
        if (imgModeEl) { coverImageMode = imgModeEl.value; localStorage.setItem('coverImageMode', coverImageMode); }
        if (bgmModeEl) { coverBgmMode = bgmModeEl.value; localStorage.setItem('coverBgmMode', coverBgmMode); }
        // 如果当前在标题菜单，立即生效
        if (titleMenu && !titleMenu.classList.contains('hide')) {
            updateCoverBackground();
            let bgmToPlay = null;
            if (coverBgmMode === 'lastBGM' && lastTriggeredBGM && assetConfig.bgm[lastTriggeredBGM]) {
                bgmToPlay = lastTriggeredBGM;
            } else if (coverBgmMode === 'randomCandidates') {
                if (coverBGMCandidates.length > 0) bgmToPlay = coverBGMCandidates[Math.floor(Math.random() * coverBGMCandidates.length)];
            } else if (coverBgmMode === 'randomAll') {
                const allKeys = Object.keys(assetConfig.bgm || {});
                if (allKeys.length > 0) bgmToPlay = allKeys[Math.floor(Math.random() * allKeys.length)];
            }
            if (bgmToPlay) playBgm(bgmToPlay, true);
        }
        showToast('封面设置已应用');
    };
    // 打开封面设置子页面
    const openCoverSettingsBtn = document.getElementById('openCoverSettingsBtn');
    if (openCoverSettingsBtn) openCoverSettingsBtn.onclick = renderCoverSettingsPage;
    // 从封面设置返回鉴赏
    const backFromCoverSettingsBtn = document.getElementById('backFromCoverSettingsBtn');
    if (backFromCoverSettingsBtn) backFromCoverSettingsBtn.onclick = () => {
        const coverPage = document.getElementById('coverSettingsPage');
        const container = document.getElementById('galleryGridContainer');
        if (coverPage) coverPage.style.display = 'none';
        if (container) container.style.display = '';
        const activeTab = document.querySelector('.gallery-tab.active');
        if (activeTab) renderGalleryPage(activeTab.dataset.tab);
    };

    if (galleryBtn) {
        galleryBtn.onclick = () => {
            // 隐藏标题菜单和游戏界面
            titleMenu.classList.add('hide');
            document.getElementById('dialogArea').style.opacity = '0';
            document.getElementById('dialogArea').style.pointerEvents = 'none';
            settingsIcon.classList.remove('show');
            // 显示鉴赏页面
            galleryPage.style.display = 'block';
            // 隐藏封面设置
            const coverPage = document.getElementById('coverSettingsPage');
            const container = document.getElementById('galleryGridContainer');
            if (coverPage) coverPage.style.display = 'none';
            if (container) container.style.display = '';
            // 默认渲染 CG 标签页
            renderGalleryPage('cg');
            // 激活第一个标签页样式
            document.querySelectorAll('.gallery-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.dataset.tab === 'cg') tab.classList.add('active');
            });
        };
    }
    if (closeGalleryPageBtn) {
        closeGalleryPageBtn.onclick = () => {
            galleryPage.style.display = 'none';
            if (musicProgressInterval) { clearInterval(musicProgressInterval); musicProgressInterval = null; }
            currentGalleryMusicKey = null;
            clearVisuals();
            // 回到标题菜单
            titleMenu.classList.remove('hide');
            document.getElementById('dialogArea').style.opacity = '0';
            document.getElementById('dialogArea').style.pointerEvents = 'none';
        };
    }

    document.querySelectorAll('.gallery-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.gallery-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabName = tab.dataset.tab;
            // 隐藏封面设置子页面
            const coverPage = document.getElementById('coverSettingsPage');
            if (coverPage) coverPage.style.display = 'none';
            const container = document.getElementById('galleryGridContainer');
            if (container) container.style.display = '';
            renderGalleryPage(tabName);
        });
    });
    document.getElementById('coverImageMode')?.addEventListener('change', toggleSpecifiedSelects);
    document.getElementById('coverBgmMode')?.addEventListener('change', toggleSpecifiedSelects);
    projectFileInput.type = 'file';
    projectFileInput.accept = 'application/json';
    projectFileInput.style.display = 'none';
    document.body.appendChild(projectFileInput);
    loadProjectBtn.onclick = () => projectFileInput.click();
    projectFileInput.onchange = e => {
        if (e.target.files.length) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    const json = JSON.parse(ev.target.result);
                    loadFullProject(json);
                } catch (err) {
                    console.error("解析错误：", err);      // 看控制台具体报错
                    alert("无效的项目 JSON 文件\n" + err.message);
                }
            };
            reader.readAsText(file);
        };
        projectFileInput.value = '';
    };
    const cgLayer = document.getElementById('cgLayer');
    if (cgLayer) cgLayer.addEventListener('click', (e) => { if (gameActive && !cgLayer._cgClickHandler) cgLayer.classList.remove('show'); });

    (async function init() {
        await loadStoredOrEgg();
        // 自动解锁第一个CG（如果有的话）
        (function() {
            var keys = Object.keys(assetConfig.cg || {});
            if (keys.length > 0) unlockItem('cg', keys[0]);
        })();
        fixSpritePosition();
        stopAllBgm();
        playBgm('fm', true);
        const savedVolume = localStorage.getItem('galgame_volume');
        if (savedVolume !== null) {
            const vol = parseInt(savedVolume);
            if (!isNaN(vol)) {
                if (audioElement) audioElement.volume = vol / 100;
                if (volumeSlider) volumeSlider.value = vol;
                if (volumeValue) volumeValue.innerText = vol + '%';
                if (menuVolumeSlider) menuVolumeSlider.value = vol;
                if (menuVolumeValue) menuVolumeValue.innerText = vol + '%';
            }
        }
        const savedSeVolume = localStorage.getItem(SE_VOLUME_KEY);
        if (savedSeVolume !== null) {
            seVolume = parseFloat(savedSeVolume) / 100;
        } else {
            seVolume = 0.8;
        };
        const savedVoiceVolume = localStorage.getItem(VOICE_VOLUME_KEY);
        if (savedVoiceVolume !== null) {
            voiceVolume = parseFloat(savedVoiceVolume) / 100;
        } else {
            voiceVolume = 0.8;
        };
        document.getElementById('dialogArea').style.opacity = "0";
        document.getElementById('dialogArea').style.pointerEvents = "none";
        titleMenu.classList.remove('hide');
        updateContinueButtonState();
        updateCoverBackground();
        const observer = new MutationObserver(() => {
            const show = titleMenu.classList.contains('hide') && gameActive;
            if (show) { settingsIcon.classList.add('show'); if (fullscreenBtn) { fullscreenBtn.style.opacity = '1'; fullscreenBtn.style.pointerEvents = 'auto'; } }
            else { settingsIcon.classList.remove('show'); if (fullscreenBtn) { fullscreenBtn.style.opacity = '0'; fullscreenBtn.style.pointerEvents = 'none'; } }
        });
        observer.observe(titleMenu, { attributes: true, attributeFilter: ['class'] });
        // 🍂 彩蛋：连续点击标题三次 → 制作人员名单
        var titleEl = document.querySelector('.menu-title');
        var titleClickCount = 0, titleClickTimer = null;
        if (titleEl) {
            titleEl.style.cursor = 'default';
            titleEl.addEventListener('click', function(e) {
                e.stopPropagation();
                titleClickCount++;
                if (titleClickTimer) clearTimeout(titleClickTimer);
                if (titleClickCount >= 3) {
                    titleClickCount = 0;
                    if (typeof showCredits === 'function') showCredits();
                    else if (typeof toggleCheatConsole === 'function') toggleCheatConsole();
                } else {
                    titleClickTimer = setTimeout(function() { titleClickCount = 0; }, 1000);
                }
            });
        }
        const seSliders = document.querySelectorAll('#seVolumeSlider, #menuSeVolumeSlider');
        seSliders.forEach(slider => {
            if (slider) {
                slider.value = seVolume * 100;
                slider.addEventListener('input', (e) => {
                    setSeVolume(parseInt(e.target.value));
                });
            }
        });
        // 语音音量滑块同步
        const voiceVolumeSliders = document.querySelectorAll('#voiceVolumeSlider, #menuVoiceVolumeSlider');
        const voiceVolumeValues = document.querySelectorAll('#voiceVolumeValue, #menuVoiceVolumeValue');
        voiceVolumeSliders.forEach(slider => {
            if (slider) {
                slider.value = voiceVolume * 100;
                slider.addEventListener('input', (e) => {
                    voiceVolume = parseInt(e.target.value) / 100;
                    voiceVolume = Math.min(1, Math.max(0, voiceVolume));
                    voiceVolumeSliders.forEach(s => { if (s) s.value = voiceVolume * 100; });
                    voiceVolumeValues.forEach(s => { if (s) s.innerText = Math.round(voiceVolume * 100) + '%'; });
                    // 如果正在播放语音，即时调整音量（Howler用方法调用而非属性赋值）
                    if (voiceAudio && voiceAudio.playing()) voiceAudio.volume(voiceVolume);
                    if (voiceDebounceTimer) clearTimeout(voiceDebounceTimer);
                    voiceDebounceTimer = setTimeout(() => {
                        localStorage.setItem(VOICE_VOLUME_KEY, Math.round(voiceVolume * 100));
                    }, 300);
                });
            }
        });
        voiceVolumeValues.forEach(s => { if (s) s.innerText = Math.round(voiceVolume * 100) + '%'; });
        // 初始化显示
        setSeVolume(seVolume * 100);
        populateCoverSettings();
        // 绑定齿轮设置面板中的速度滑块
        const speedSlider = document.getElementById('autoPlaySpeedSlider');
        const speedValue = document.getElementById('autoPlaySpeedValue');
        // 定义重启自动播放的防抖函数
        const debouncedRestartAutoPlay = debounce(() => {
            if (autoPlayEnabled) {
                stopAutoPlay();
                startAutoPlay();
            }
        }, 300);
        const debouncedSaveSpeed = debounce(() => {
            localStorage.setItem('autoPlaySpeed', autoPlaySpeed);
        }, 300);

        if (speedSlider) {
            speedSlider.value = Math.round(autoPlaySpeed * 100);
            speedValue.innerText = autoPlaySpeed.toFixed(2) + ' 秒/字';
            speedSlider.addEventListener('input', function(e) {
                let val = parseInt(e.target.value);
                autoPlaySpeed = val / 100;
                // 立即更新 UI 和同步其他滑块
                speedValue.innerText = autoPlaySpeed.toFixed(2) + ' 秒/字';
                const menuSlider = document.getElementById('menuAutoPlaySpeedSlider');
                if (menuSlider) menuSlider.value = val;
                const menuValue = document.getElementById('menuAutoPlaySpeedValue');
                if (menuValue) menuValue.innerText = autoPlaySpeed.toFixed(2) + ' 秒/字';
                
                // 防抖保存到 localStorage 和重启自动播放
                debouncedRestartAutoPlay();
                // 注意：localStorage 存储可以在重启时一并保存，也可单独防抖保存
                // 为了简单，重启时会读取 autoPlaySpeed，无需立即存 localStorage，但为了持久化，可以再加一个保存防抖
                debouncedSaveSpeed();
            });  
        };
        if (menuMinDelaySlider) {
            menuMinDelaySlider.value = minAutoPlayDelay;
            menuMinDelayValue.innerText = minAutoPlayDelay.toFixed(1) + ' 秒';
            menuMinDelaySlider.addEventListener('input', (e) => {
                let val = parseFloat(e.target.value);
                minAutoPlayDelay = val;
                menuMinDelayValue.innerText = val.toFixed(1) + ' 秒';
                if (minDelaySlider) minDelaySlider.value = val;
                if (minDelayValue) minDelayValue.innerText = val.toFixed(1) + ' 秒';
                
                debouncedRestartAutoPlay();
            });
        };
        if (minDelaySlider) {
            minDelaySlider.value = minAutoPlayDelay;
            minDelayValue.innerText = minAutoPlayDelay.toFixed(1) + ' 秒';
            minDelaySlider.addEventListener('input', (e) => {
                let val = parseFloat(e.target.value);
                minAutoPlayDelay = val;
                minDelayValue.innerText = val.toFixed(1) + ' 秒';
                if (menuMinDelaySlider) menuMinDelaySlider.value = val;
                if (menuMinDelayValue) menuMinDelayValue.innerText = val.toFixed(1) + ' 秒';

                debouncedRestartAutoPlay();
            });
        };
        // 文字速度滑块
        if (textSpeedSlider) {
            textSpeedSlider.value = textSpeed;
            textSpeedValue.innerText = textSpeed + ' ms/字';
            textSpeedSlider.addEventListener('input', (e) => {
                textSpeed = parseInt(e.target.value);
                textSpeedValue.innerText = textSpeed + ' ms/字';
                if (menuTextSpeedSlider) menuTextSpeedSlider.value = textSpeed;
                if (menuTextSpeedValue) menuTextSpeedValue.innerText = textSpeed + ' ms/字';
                localStorage.setItem('galgame_text_speed', textSpeed);
            });
        }
        if (menuTextSpeedSlider) {
            menuTextSpeedSlider.value = textSpeed;
            menuTextSpeedValue.innerText = textSpeed + ' ms/字';
            menuTextSpeedSlider.addEventListener('input', (e) => {
                textSpeed = parseInt(e.target.value);
                menuTextSpeedValue.innerText = textSpeed + ' ms/字';
                if (textSpeedSlider) textSpeedSlider.value = textSpeed;
                if (textSpeedValue) textSpeedValue.innerText = textSpeed + ' ms/字';
                localStorage.setItem('galgame_text_speed', textSpeed);
            });
        }

        // 绑定标题菜单中的速度滑块
        const menuSpeedSlider = document.getElementById('menuAutoPlaySpeedSlider');
        const menuSpeedValue = document.getElementById('menuAutoPlaySpeedValue');
        if (menuSpeedSlider) {
            menuSpeedSlider.value = Math.round(autoPlaySpeed * 100);
            menuSpeedValue.innerText = autoPlaySpeed.toFixed(2) + ' 秒/字';
            menuSpeedSlider.addEventListener('input', function(e) {
                let val = parseInt(e.target.value);
                autoPlaySpeed = val / 100;
                menuSpeedValue.innerText = autoPlaySpeed.toFixed(2) + ' 秒/字';
                const mainSlider = document.getElementById('autoPlaySpeedSlider');
                if (mainSlider) mainSlider.value = val;
                const mainValue = document.getElementById('autoPlaySpeedValue');
                if (mainValue) mainValue.innerText = autoPlaySpeed.toFixed(2) + ' 秒/字';
                
                debouncedRestartAutoPlay();
            });
        };
        const savedSpeed = localStorage.getItem('autoPlaySpeed');
        if (savedSpeed !== null) {
            autoPlaySpeed = parseFloat(savedSpeed);
        } else {
            autoPlaySpeed = 0.06;
        };
        const savedMinDelay = localStorage.getItem('minAutoPlayDelay');
        if (savedMinDelay !== null) {
            minAutoPlayDelay = parseFloat(savedMinDelay);
        } else {
            minAutoPlayDelay = 1.0;
        }
        // 确保滑块显示正确
        if (minDelaySlider) minDelaySlider.value = minAutoPlayDelay;
        if (minDelayValue) minDelayValue.innerText = minAutoPlayDelay.toFixed(1) + ' 秒';
        if (menuMinDelaySlider) menuMinDelaySlider.value = minAutoPlayDelay;
        if (menuMinDelayValue) menuMinDelayValue.innerText = minAutoPlayDelay.toFixed(1) + ' 秒';
        updateCurrentBgmDisplay();
        // 语音闪避强度滑块
        const duckingSlider = document.getElementById('duckingRatioSlider');
        const duckingValue = document.getElementById('duckingRatioValue');
        if (duckingSlider) {
            const savedDuckingRatio = localStorage.getItem('bgmDuckingRatio');
            if (savedDuckingRatio !== null) bgmDuckingRatio = parseFloat(savedDuckingRatio) / 100;
            duckingSlider.value = Math.round(bgmDuckingRatio * 100);
            if (duckingValue) duckingValue.innerText = Math.round(bgmDuckingRatio * 100) + '%';
            duckingSlider.addEventListener('input', () => {
                bgmDuckingRatio = parseInt(duckingSlider.value) / 100;
                if (duckingValue) duckingValue.innerText = Math.round(bgmDuckingRatio * 100) + '%';
                localStorage.setItem('bgmDuckingRatio', Math.round(bgmDuckingRatio * 100));
                // 如果正在ducking中，即时应用新比例
                if (isDucking && audioElement && !audioElement.paused) {
                    bgmDuckingTargetVol = bgmPreDuckVolume * bgmDuckingRatio;
                    audioElement.fade(audioElement.volume, bgmDuckingTargetVol, 150);
                }
            });
        }
        showToast("支持导入JSON | 章节存档已隔离");
        // 进度条拖动（全局监听，避免重复绑定）
        document.addEventListener('mousemove', (e) => {
            if (!progressDragBar || !progressDragKey) return;
            const rect = progressDragBar.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right) {
                seekMusicProgress(progressDragKey, { clientX: e.clientX, currentTarget: progressDragBar });
            }
        });
        document.addEventListener('mouseup', () => {
            progressDragKey = null;
            progressDragBar = null;
        });
        // 立绘切换模式选择器
        const spriteTransitionSelect = document.getElementById('spriteTransitionSelect');
        if (spriteTransitionSelect) {
            spriteTransitionSelect.value = spriteTransitionMode;
            spriteTransitionSelect.addEventListener('change', () => {
                spriteTransitionMode = spriteTransitionSelect.value;
                localStorage.setItem('galgame_sprite_transition', spriteTransitionMode);
                showToast('立绘切换方式已设为：' + spriteTransitionSelect.options[spriteTransitionSelect.selectedIndex].text);
            });
        }
        // 滚轮回溯开关
        const rollbackEnabledCheckbox = document.getElementById('rollbackEnabledCheckbox');
        if (rollbackEnabledCheckbox) {
            rollbackEnabledCheckbox.checked = rollbackEnabled;
            rollbackEnabledCheckbox.addEventListener('change', () => {
                rollbackEnabled = rollbackEnabledCheckbox.checked;
                localStorage.setItem('galgame_rollback_enabled', rollbackEnabled ? 'true' : 'false');
            });
        }
        // ★ 自适应阅读速度开关
        const adaptiveSpeedCheckbox = document.getElementById('adaptiveSpeedCheckbox');
        if (adaptiveSpeedCheckbox) {
            adaptiveSpeedCheckbox.checked = adaptiveSpeedEnabled;
            adaptiveSpeedCheckbox.addEventListener('change', () => {
                adaptiveSpeedEnabled = adaptiveSpeedCheckbox.checked;
                localStorage.setItem('galgame_adaptive_speed', adaptiveSpeedEnabled ? 'true' : 'false');
                _adaptiveSpeedEMA = null; // 重置 EMA，重新开始学习
            });
        }
        // 回溯速度滑块
        const rollbackSpeedSlider = document.getElementById('rollbackSpeedSlider');
        const rollbackSpeedValue = document.getElementById('rollbackSpeedValue');
        if (rollbackSpeedSlider) {
            rollbackSpeedSlider.value = rollbackCooldown;
            if (rollbackSpeedValue) rollbackSpeedValue.textContent = rollbackCooldown + 'ms';
            rollbackSpeedSlider.addEventListener('input', () => {
                rollbackCooldown = parseInt(rollbackSpeedSlider.value);
                if (rollbackSpeedValue) rollbackSpeedValue.textContent = rollbackCooldown + 'ms';
                localStorage.setItem('galgame_rollback_cooldown', rollbackCooldown);
            });
        }
        // 银杏叶粒子系统初始化
        initParticleSystem();
        // 标题菜单显示时启动物子，隐藏时停止
        const titleObserver = new MutationObserver(() => {
            if (!titleMenu.classList.contains('hide')) {
                startParticles();
            } else {
                stopParticles();
            }
        });
        titleObserver.observe(titleMenu, { attributes: true, attributeFilter: ['class'] });
        if (!titleMenu.classList.contains('hide')) { startParticles(); startTitleParallax(); }

        // 全局图片加载失败后备：用内联 SVG 占位图替换，避免二次 404
        window.addEventListener('error', (e) => {
            const img = e.target;
            if (img && img.tagName === 'IMG' && img.getAttribute('src') && !img.src.startsWith('data:')) {
                // 用内联 SVG 占位图避免再次触发 404
                img.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#1a1612"/><text x="200" y="155" text-anchor="middle" fill="#665" font-size="18" font-family="sans-serif">Image Not Found</text></svg>');
            }
        }, true);

        // 章节选择按钮
        const chapterSelectMenuBtn = document.getElementById('chapterSelectMenuBtn');
        if (chapterSelectMenuBtn) {
            chapterSelectMenuBtn.onclick = () => {
                showChapterSelect();
            };
        }
        // 章节选择返回按钮
        const chapterSelectBackBtn = document.getElementById('chapterSelectBackBtn');
        if (chapterSelectBackBtn) {
            chapterSelectBackBtn.onclick = hideChapterSelect;
        }
        // 章节选择浮层背景点击关闭
        const chapterSelectOverlay = document.getElementById('chapterSelectOverlay');
        if (chapterSelectOverlay) {
            chapterSelectOverlay.addEventListener('click', (e) => {
                if (e.target === chapterSelectOverlay) hideChapterSelect();
            });
        }

        // 页面关闭前持久化已读场景
        window.addEventListener('beforeunload', () => {
            persistReadScenes();
            stopVoice();
        });
    })();
