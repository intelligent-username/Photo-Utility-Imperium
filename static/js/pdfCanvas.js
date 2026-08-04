// ===========================================
//  pdfCanvas.js — Core state, rendering, drag-reorder, annotations, crop, overlay
// ===========================================

// ---- State ----
const state = {
    pages: [],       // { id, fileIdx, pageIdx, fileName, excluded, annotations[], cropBox, overlays[], _pdfPage, isBlank, aspectRatio }
    files: [],       // raw File objects
    mode: 'select',  // 'select' | 'annotate' | 'crop' | 'overlay'
    annColor: '#ff0000',
    annSize: 16,
    overlaySource: null, // page id selected as overlay source
    isLargeView: true,
};

export function getState() { return state; }

export function createPageObject(config) {
    const layers = config.layers || [];
    const page = {
        id: config.id || `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        fileIdx: config.fileIdx !== undefined ? config.fileIdx : -1,
        pageIdx: config.pageIdx !== undefined ? config.pageIdx : -1,
        fileName: config.fileName || 'Page',
        excluded: config.excluded || false,
        cropBox: config.cropBox || null,
        isBlank: config.isBlank || false,
        aspectRatio: config.aspectRatio,
        _pdfPage: config._pdfPage || null,
        layers,
    };

    Object.defineProperty(page, 'annotations', {
        get: () => page.layers.filter(l => l.type === 'annotation'),
        configurable: true,
        enumerable: true
    });
    Object.defineProperty(page, 'whiteouts', {
        get: () => page.layers.filter(l => l.type === 'whiteout'),
        configurable: true,
        enumerable: true
    });
    Object.defineProperty(page, 'overlays', {
        get: () => page.layers.filter(l => l.type === 'overlay'),
        configurable: true,
        enumerable: true
    });

    return page;
}

// ---- Mode Control (Enforces single active interaction type) ----
export function setAppMode(modeName) {
    state.mode = modeName;
    state.overlaySource = null;

    const grid = document.getElementById('pdf-page-grid');
    if (grid) {
        grid.classList.remove('grid-mode-crop', 'grid-mode-overlay', 'grid-mode-annotate', 'grid-mode-whiteout');
        if (modeName !== 'select') {
            grid.classList.add(`grid-mode-${modeName}`);
        }
    }

    // Enable card dragging ONLY in 'select' mode
    document.querySelectorAll('.pdf-page-card').forEach(card => {
        card.draggable = (modeName === 'select');
    });

    document.querySelectorAll('.overlay-source').forEach(el => el.classList.remove('overlay-source'));

    // Update banner instructions
    if (modeName === 'select') {
        updateModeBanner('Select Mode: Drag cards to reorder pages.', 'select');
    } else if (modeName === 'crop') {
        updateModeBanner('Crop Mode: Click & drag on any page to crop. Drag handles to resize, double-click box to delete.', 'crop');
    } else if (modeName === 'overlay') {
        updateModeBanner('Overlay Mode: Click source page, then target page. Drag purple box to reposition overlay.', 'overlay');
    } else if (modeName === 'annotate') {
        updateModeBanner('Annotate Mode: Click anywhere on a page to add text. Drag text to move, click to edit/delete.', 'annotate');
    } else if (modeName === 'whiteout') {
        updateModeBanner('Whiteout Mode: Drag on any page to cover content with a white block. Double-click box to delete.', 'whiteout');
    }
}

// ---- Canvas rendering (fast base PDF render + dynamic DOM layer stack z-index) ----
export async function renderCardCanvas(page) {
    const card = document.getElementById(page.id);
    if (!card) return;
    const canvas = card.querySelector('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const targetWidth = state.isLargeView ? 340 : 160;

    let vpWidth = targetWidth;
    let vpHeight = 440;

    if (page.isBlank) {
        const ar = page.aspectRatio || (792 / 612);
        vpHeight = Math.round(vpWidth * ar);
        canvas.width = vpWidth;
        canvas.height = vpHeight;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, vpWidth, vpHeight);
    } else if (page._pdfPage) {
        const origVp = page._pdfPage.getViewport({ scale: 1.0 });
        const scale = targetWidth / origVp.width;
        const vp = page._pdfPage.getViewport({ scale });

        vpWidth = vp.width;
        vpHeight = vp.height;
        canvas.width = vpWidth;
        canvas.height = vpHeight;
        ctx.clearRect(0, 0, vpWidth, vpHeight);

        // Render base PDF page
        await page._pdfPage.render({ canvasContext: ctx, viewport: vp }).promise;
    }

    const wrap = card.querySelector('.page-canvas-wrap');
    if (wrap) {
        // Sync Crop Box Rect
        let rect = wrap.querySelector('.crop-rect');
        if (page.cropBox) {
            if (!rect) {
                rect = document.createElement('div');
                rect.className = 'crop-rect';
                wrap.appendChild(rect);
                addCropControls(rect, wrap, page);
            }
            syncRectToPercentage(rect, page);
        } else if (rect) {
            rect.remove();
        }

        // Sync Unified Chronological Layer Elements (Whiteouts, Text Annotations, Overlays)
        renderCardLayers(wrap, page);
    }
}

export async function reRenderCanvases() {
    for (const page of state.pages) {
        await renderCardCanvas(page);
    }
}

// ---- Reset ----
export function resetState() {
    state.pages = [];
    state.files = [];
    state.mode = 'select';
    state.overlaySource = null;
    const grid = document.getElementById('pdf-page-grid');
    if (grid) grid.innerHTML = '';
    updateStatusBar('');
    updateModeBanner('');
}

// ---- Status & Mode Bar helpers ----
function updateStatusBar(msg) {
    const bar = document.getElementById('pdf-status');
    if (bar) bar.textContent = msg;
}

export function updateModeBanner(msg, type = 'crop') {
    const banner = document.getElementById('pdf-mode-banner');
    if (!banner) return;
    if (!msg) {
        banner.classList.add('hidden');
        banner.textContent = '';
        banner.className = 'pdf-mode-banner hidden';
        return;
    }
    banner.textContent = msg;
    banner.className = `pdf-mode-banner banner-${type}`;
}

// ---- Load files & render ----
export async function loadFiles(fileList) {
    const grid = document.getElementById('pdf-page-grid');
    if (!grid || !window.pdfjsLib) return;

    for (const file of fileList) {
        const fileIdx = state.files.length;
        state.files.push(file);

        try {
            const buf = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;

            for (let p = 0; p < pdf.numPages; p++) {
                const pdfPage = await pdf.getPage(p + 1);
                const page = createPageObject({
                    fileIdx,
                    pageIdx: p,
                    fileName: file.name,
                    _pdfPage: pdfPage,
                });
                state.pages.push(page);
                const card = buildCard(page);
                grid.appendChild(card);
                renderCardCanvas(page);
            }
        } catch (err) {
            console.error(`Failed to load ${file.name}:`, err);
        }
    }
}

// ---- Build a card element ----
function buildCard(page) {
    const card = document.createElement('div');
    card.className = 'pdf-page-card';
    card.id = page.id;
    card.draggable = (state.mode === 'select');

    // Page number badge
    const num = document.createElement('span');
    num.className = 'page-num';
    num.textContent = indexLabel(page);
    card.appendChild(num);

    // Hover actions (Exclude / Restore)
    const actions = document.createElement('div');
    actions.className = 'page-actions';

    const delBtn = document.createElement('button');
    delBtn.className = 'page-action-btn';
    delBtn.innerHTML = '&times;';
    delBtn.title = 'Exclude page';
    delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        page.excluded = !page.excluded;
        card.classList.toggle('excluded', page.excluded);
        delBtn.title = page.excluded ? 'Restore page' : 'Exclude page';
        if (page.excluded) delBtn.classList.add('restore-btn');
        else delBtn.classList.remove('restore-btn');
    });
    actions.appendChild(delBtn);
    card.appendChild(actions);

    // Canvas wrapper
    const wrap = document.createElement('div');
    wrap.className = 'page-canvas-wrap';

    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    // File source label
    const src = document.createElement('div');
    src.className = 'page-source';
    src.textContent = page.fileName;
    card.appendChild(src);

    // Add blank page (+) button
    const addBlankBtn = document.createElement('button');
    addBlankBtn.className = 'add-blank-btn';
    addBlankBtn.innerHTML = '+';
    addBlankBtn.title = 'Insert blank page after this page';
    addBlankBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertBlankAfter(page);
    });
    card.appendChild(addBlankBtn);

    // Overlay Badge container
    updateOverlayBadge(card, page);

    // ---- Drag & drop (page reorder) ----
    card.addEventListener('dragstart', (e) => {
        if (state.mode !== 'select') { e.preventDefault(); return; }
        e.dataTransfer.setData('text/plain', page.id);
        card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        document.querySelectorAll('.pdf-page-card.drag-over').forEach(c => c.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', (e) => {
        if (state.mode !== 'select') return;
        e.preventDefault();
        card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (e) => {
        if (state.mode !== 'select') return;
        e.preventDefault();
        card.classList.remove('drag-over');
        const fromId = e.dataTransfer.getData('text/plain');
        if (!fromId || fromId === page.id) return;
        const fromIdx = state.pages.findIndex(p => p.id === fromId);
        const toIdx = state.pages.findIndex(p => p.id === page.id);
        if (fromIdx < 0 || toIdx < 0) return;
        const [moved] = state.pages.splice(fromIdx, 1);
        state.pages.splice(toIdx, 0, moved);
        syncGrid();
    });

    // ---- Mode-based Click & Canvas Handlers ----
    card.addEventListener('click', (e) => {
        if (state.mode === 'overlay') {
            e.stopPropagation();
            handleOverlayClick(page, card);
        }
    });

    wrap.addEventListener('click', (e) => {
        if (state.mode === 'annotate') {
            if (e.target.closest('.ann-marker') || e.target.closest('.ann-edit-box') || e.target.closest('.ann-input')) return;
            e.stopPropagation();
            const rect = canvas.getBoundingClientRect();
            const xR = (e.clientX - rect.left) / rect.width;
            const yR = (e.clientY - rect.top) / rect.height;
            openAnnotationInput(wrap, page, xR, yR);
        }
    });

    wrap.addEventListener('mousedown', (e) => {
        if (e.target.closest('.crop-rect') || e.target.closest('.overlay-rect') || e.target.closest('.ann-edit-box') || e.target.closest('.whiteout-rect')) return;
        if (state.mode === 'crop') {
            e.preventDefault();
            startCrop(e, wrap, page);
        } else if (state.mode === 'whiteout') {
            e.preventDefault();
            startWhiteout(e, wrap, page);
        }
    });

    return card;
}

// ... helper logic ...

function openAnnotationInput(wrap, page, xR, yR, existingAnn = null, existingMarker = null) {
    wrap.querySelectorAll('.ann-edit-box, .ann-input').forEach(b => b.remove());

    if (existingMarker) {
        existingMarker.style.visibility = 'hidden';
    }

    const box = document.createElement('div');
    box.className = 'ann-edit-box';
    box.style.left = `${(xR * 100).toFixed(1)}%`;
    box.style.top = `${(yR * 100).toFixed(1)}%`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ann-input';
    input.placeholder = 'Text...';
    input.value = existingAnn ? existingAnn.text : '';
    input.style.color = existingAnn ? (existingAnn.color || state.annColor) : state.annColor;

    const scaleFactor = state.isLargeView ? 0.75 : 0.45;
    const fontSz = existingAnn ? existingAnn.fontSize : state.annSize;
    input.style.fontSize = `${Math.max(11, Math.round((fontSz || 16) * scaleFactor))}px`;
    input.size = Math.max(1, input.value.length || 1);
    input.addEventListener('input', () => {
        input.size = Math.max(1, input.value.length || 1);
    });
    box.appendChild(input);

    let committed = false;

    const commit = () => {
        if (committed) return;
        committed = true;

        const text = input.value.trim();
        if (existingAnn) {
            if (!text) {
                const idx = page.layers.indexOf(existingAnn);
                if (idx !== -1) page.layers.splice(idx, 1);
            } else {
                existingAnn.text = text;
                existingAnn.color = state.annColor;
                existingAnn.fontSize = state.annSize;
            }
        } else if (text) {
            const ann = {
                type: 'annotation',
                id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                text,
                xRatio: xR,
                yRatio: yR,
                color: state.annColor,
                fontSize: state.annSize,
            };
            page.layers.push(ann);
        }
        box.remove();
        renderCardCanvas(page);
    };

    // Trash can button on top right of edit menu box (only when editing existing annotation)
    if (existingAnn) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'ann-box-del-btn';
        delBtn.innerHTML = '&times;';
        delBtn.title = 'Delete annotation';
        delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            committed = true;
            const idx = page.layers.indexOf(existingAnn);
            if (idx !== -1) page.layers.splice(idx, 1);
            box.remove();
            renderCardCanvas(page);
        });
        box.appendChild(delBtn);
    }

    wrap.appendChild(box);
    input.focus();
    input.select();

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commit();
        } else if (e.key === 'Escape') {
            committed = true;
            if (existingMarker) existingMarker.style.visibility = 'visible';
            box.remove();
            renderCardCanvas(page);
        }
    });

    input.addEventListener('blur', (e) => {
        if (e.relatedTarget && box.contains(e.relatedTarget)) return;
        commit();
    });
}

function insertBlankAfter(targetPage) {
    const idx = state.pages.indexOf(targetPage);
    let aspectRatio = 792 / 612;

    if (targetPage) {
        if (targetPage.aspectRatio) {
            aspectRatio = targetPage.aspectRatio;
        } else if (targetPage._pdfPage) {
            const vp = targetPage._pdfPage.getViewport({ scale: 1.0 });
            aspectRatio = vp.height / vp.width;
        }
    }

    const newBlankPage = createPageObject({
        isBlank: true,
        fileName: 'Blank Page',
        aspectRatio,
    });

    if (idx !== -1) {
        state.pages.splice(idx + 1, 0, newBlankPage);
    } else {
        state.pages.push(newBlankPage);
    }
    syncGrid();
}

// ---- Sync grid order + badges ----
function syncGrid() {
    const grid = document.getElementById('pdf-page-grid');
    if (!grid) return;
    state.pages.forEach((p) => {
        let card = document.getElementById(p.id);
        if (!card) {
            card = buildCard(p);
        }
        card.draggable = (state.mode === 'select');
        card.querySelector('.page-num').textContent = indexLabel(p);
        grid.appendChild(card);
        renderCardCanvas(p);
    });
}

function indexLabel(page) {
    const idx = state.pages.indexOf(page);
    return idx < 0 ? '' : `${idx + 1}`;
}

// ---- Overlay Workflow ----
function handleOverlayClick(page, card) {
    if (!state.overlaySource) {
        state.overlaySource = page.id;
        card.classList.add('overlay-source');
        updateModeBanner(`Source page ${indexLabel(page)} selected. Now click the target page to overlay onto.`, 'overlay');
    } else if (state.overlaySource === page.id) {
        card.classList.remove('overlay-source');
        state.overlaySource = null;
        updateModeBanner('Select a source page, then click the target page to overlay onto.', 'overlay');
    } else {
        const sourcePage = state.pages.find(p => p.id === state.overlaySource);
        if (!sourcePage) { state.overlaySource = null; return; }

        page.layers.push({
            type: 'overlay',
            id: `ov_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            fileIndex: sourcePage.fileIdx,
            pageIndex: sourcePage.pageIdx,
            cropBox: sourcePage.cropBox ? { ...sourcePage.cropBox } : null,
            layers: sourcePage.layers ? JSON.parse(JSON.stringify(sourcePage.layers)) : [],
            sourceId: sourcePage.id,
            dxRatio: 0,
            dyRatio: 0,
            scaleWidthRatio: 1.0,
            scaleHeightRatio: 1.0,
        });

        sourcePage.excluded = true;
        const sourceCard = document.getElementById(sourcePage.id);
        if (sourceCard) {
            sourceCard.classList.remove('overlay-source');
            sourceCard.classList.add('excluded');
        }

        card.classList.add('has-overlay');
        updateOverlayBadge(card, page);
        renderCardCanvas(page);

        state.overlaySource = null;
        updateModeBanner(`Page ${indexLabel(sourcePage)} overlaid onto page ${indexLabel(page)}. Drag purple box to position.`, 'overlay');
    }
}

function updateOverlayBadge(card, page) {
    let badge = card.querySelector('.overlay-badge');
    if (page.overlays && page.overlays.length > 0) {
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'overlay-badge';
            card.appendChild(badge);
        }
        badge.innerHTML = `<span>+${page.overlays.length} overlay</span>`;

        const rmBtn = document.createElement('button');
        rmBtn.className = 'overlay-remove-btn';
        rmBtn.innerHTML = '&times;';
        rmBtn.title = 'Remove overlay';
        rmBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeOverlay(page);
        });
        badge.appendChild(rmBtn);
    } else if (badge) {
        badge.remove();
        card.classList.remove('has-overlay');
    }
}

function removeOverlay(targetPage) {
    if (!targetPage.overlays || targetPage.overlays.length === 0) return;
    const lastOv = targetPage.overlays.pop();

    if (lastOv.sourceId) {
        const sourcePage = state.pages.find(p => p.id === lastOv.sourceId);
        if (sourcePage) {
            sourcePage.excluded = false;
            const sourceCard = document.getElementById(sourcePage.id);
            if (sourceCard) sourceCard.classList.remove('excluded');
        }
    }

    const card = document.getElementById(targetPage.id);
    if (card) updateOverlayBadge(card, targetPage);
    renderCardCanvas(targetPage);
}

// ---- Overlay Draggable & Resizable Positioning ----
function syncOverlayRectToPercentage(ovRect, page) {
    if (!page.overlays || page.overlays.length === 0) return;
    const lastOv = page.overlays[page.overlays.length - 1];

    let baseL = lastOv.cropBox ? lastOv.cropBox.leftRatio : 0.0;
    let baseT = lastOv.cropBox ? lastOv.cropBox.topRatio : 0.0;
    let baseW = lastOv.cropBox ? lastOv.cropBox.widthRatio : 1.0;
    let baseH = lastOv.cropBox ? lastOv.cropBox.heightRatio : 1.0;

    let scaleW = lastOv.scaleWidthRatio || 1.0;
    let scaleH = lastOv.scaleHeightRatio || 1.0;

    let lR = baseL + (lastOv.dxRatio || 0);
    let tR = baseT + (lastOv.dyRatio || 0);
    let wR = baseW * scaleW;
    let hR = baseH * scaleH;

    ovRect.style.left = `${(lR * 100).toFixed(2)}%`;
    ovRect.style.top = `${(tR * 100).toFixed(2)}%`;
    ovRect.style.width = `${(wR * 100).toFixed(2)}%`;
    ovRect.style.height = `${(hR * 100).toFixed(2)}%`;
}

function addOverlayControls(ovRect, wrap, page) {
    ovRect.querySelectorAll('.overlay-handle').forEach(h => h.remove());

    const positions = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
    positions.forEach(pos => {
        const h = document.createElement('div');
        h.className = `overlay-handle handle-${pos}`;
        h.dataset.handle = pos;
        ovRect.appendChild(h);
    });

    makeOverlayInteractive(ovRect, wrap, page);
}

function makeOverlayInteractive(ovRect, wrap, page) {
    if (ovRect._isInteractive) return;
    ovRect._isInteractive = true;

    ovRect.addEventListener('mousedown', (e) => {
        if (state.mode !== 'overlay') return;
        e.stopPropagation();
        const wrapRect = wrap.getBoundingClientRect();
        const handle = e.target.closest('.overlay-handle')?.dataset.handle;

        const startX = e.clientX;
        const startY = e.clientY;

        const lastOv = page.overlays[page.overlays.length - 1];
        if (!lastOv) return;

        const baseW = lastOv.cropBox ? lastOv.cropBox.widthRatio * wrapRect.width : wrapRect.width;
        const baseH = lastOv.cropBox ? lastOv.cropBox.heightRatio * wrapRect.height : wrapRect.height;

        const initDx = (lastOv.dxRatio || 0) * wrapRect.width;
        const initDy = (lastOv.dyRatio || 0) * wrapRect.height;
        const initScaleW = lastOv.scaleWidthRatio || 1.0;
        const initScaleH = lastOv.scaleHeightRatio || 1.0;

        const currentPixelW = baseW * initScaleW;
        const currentPixelH = baseH * initScaleH;

        let ticking = false;

        const onMove = (me) => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const dx = me.clientX - startX;
                    const dy = me.clientY - startY;

                    if (!handle) {
                        // Drag position
                        lastOv.dxRatio = (initDx + dx) / wrapRect.width;
                        lastOv.dyRatio = (initDy + dy) / wrapRect.height;
                    } else {
                        // Drag handles to resize
                        let newW = currentPixelW;
                        let newH = currentPixelH;
                        let extraDx = 0;
                        let extraDy = 0;

                        if (handle.includes('e')) newW = Math.max(20, currentPixelW + dx);
                        if (handle.includes('s')) newH = Math.max(20, currentPixelH + dy);
                        if (handle.includes('w')) {
                            newW = Math.max(20, currentPixelW - dx);
                            extraDx = currentPixelW - newW;
                        }
                        if (handle.includes('n')) {
                            newH = Math.max(20, currentPixelH - dy);
                            extraDy = currentPixelH - newH;
                        }

                        lastOv.scaleWidthRatio = newW / baseW;
                        lastOv.scaleHeightRatio = newH / baseH;
                        lastOv.dxRatio = (initDx + extraDx) / wrapRect.width;
                        lastOv.dyRatio = (initDy + extraDy) / wrapRect.height;
                    }

                    syncOverlayRectToPercentage(ovRect, page);
                    renderCardCanvas(page);
                    ticking = false;
                });
                ticking = true;
            }
        };

        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            renderCardCanvas(page);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    });
}

// ---- Dynamic Layer Stack Rendering (Whiteouts, Text Annotations, Overlays with Chronological Z-Index) ----
function renderCardLayers(wrap, page) {
    wrap.querySelectorAll('.ann-marker, .whiteout-rect, .overlay-rect').forEach(el => el.remove());
    if (!page.layers || page.layers.length === 0) return;

    const wrapRect = wrap.getBoundingClientRect();
    const canvasScale = wrapRect.width > 0 ? (wrapRect.width / 612.0) : (state.isLargeView ? 0.55 : 0.26);

    page.layers.forEach((layer, idx) => {
        const zIndex = 5 + idx;

        if (layer.type === 'whiteout') {
            const rect = document.createElement('div');
            rect.className = 'whiteout-rect';
            rect.style.left = `${(layer.leftRatio * 100).toFixed(2)}%`;
            rect.style.top = `${(layer.topRatio * 100).toFixed(2)}%`;
            rect.style.width = `${(layer.widthRatio * 100).toFixed(2)}%`;
            rect.style.height = `${(layer.heightRatio * 100).toFixed(2)}%`;
            rect.style.zIndex = zIndex;
            rect.title = 'Drag to move, handles to resize, double-click to remove';

            addWhiteoutControls(rect, wrap, page, layer);

            rect.addEventListener('dblclick', (e) => {
                if (state.mode !== 'whiteout') return;
                e.stopPropagation();
                const lIdx = page.layers.indexOf(layer);
                if (lIdx !== -1) {
                    page.layers.splice(lIdx, 1);
                    renderCardCanvas(page);
                }
            });
            wrap.appendChild(rect);

        } else if (layer.type === 'annotation') {
            if (!layer.text) return;
            const marker = document.createElement('span');
            marker.className = 'ann-marker';
            marker.textContent = layer.text;
            marker.style.left = `${(layer.xRatio * 100).toFixed(1)}%`;
            marker.style.top = `${(layer.yRatio * 100).toFixed(1)}%`;
            marker.style.color = layer.color || state.annColor;
            marker.style.zIndex = zIndex;

            const scaledFont = Math.max(9, (layer.fontSize || 16) * canvasScale);
            marker.style.fontSize = `${scaledFont}px`;
            marker.title = 'Click to edit, drag to move';

            makeAnnotationInteractive(marker, wrap, page, layer);
            wrap.appendChild(marker);

        } else if (layer.type === 'overlay') {
            const ovRect = document.createElement('div');
            ovRect.className = 'overlay-rect';
            ovRect.style.zIndex = zIndex;

            const label = document.createElement('span');
            label.className = 'overlay-rect-label';
            label.textContent = 'Overlay Drag';
            ovRect.appendChild(label);

            wrap.appendChild(ovRect);
            addOverlayControls(ovRect, wrap, page);
            syncOverlayRectToPercentage(ovRect, page);
        }
    });
}

function makeAnnotationInteractive(marker, wrap, page, ann) {
    marker.addEventListener('mousedown', (e) => {
        if (state.mode !== 'annotate') return;
        if (e.target.closest('.ann-delete-btn')) return;
        e.stopPropagation();
        const wrapRect = wrap.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const initXR = ann.xRatio;
        const initYR = ann.yRatio;
        let moved = false;
        let ticking = false;

        const onMove = (me) => {
            const dx = me.clientX - startX;
            const dy = me.clientY - startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;

            if (moved && !ticking) {
                requestAnimationFrame(() => {
                    ann.xRatio = Math.max(0, Math.min(1.0, initXR + (dx / wrapRect.width)));
                    ann.yRatio = Math.max(0, Math.min(1.0, initYR + (dy / wrapRect.height)));
                    marker.style.left = `${(ann.xRatio * 100).toFixed(1)}%`;
                    marker.style.top = `${(ann.yRatio * 100).toFixed(1)}%`;
                    ticking = false;
                });
                ticking = true;
            }
        };

        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (!moved) {
                // Click without drag -> Edit annotation text (hide marker during edit)
                openAnnotationInput(wrap, page, ann.xRatio, ann.yRatio, ann, marker);
            }
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    });
}


// ---- Crop logic (Percentage-based, rAF throttled) ----
function syncRectToPercentage(rect, page) {
    if (!page || !page.cropBox) return;
    rect.style.left = `${(page.cropBox.leftRatio * 100).toFixed(2)}%`;
    rect.style.top = `${(page.cropBox.topRatio * 100).toFixed(2)}%`;
    rect.style.width = `${(page.cropBox.widthRatio * 100).toFixed(2)}%`;
    rect.style.height = `${(page.cropBox.heightRatio * 100).toFixed(2)}%`;
}

function addCropControls(rect, wrap, page) {
    rect.querySelectorAll('.crop-handle, .crop-apply-all-btn').forEach(h => h.remove());

    const positions = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
    positions.forEach(pos => {
        const h = document.createElement('div');
        h.className = `crop-handle handle-${pos}`;
        h.dataset.handle = pos;
        rect.appendChild(h);
    });

    const applyAllBtn = document.createElement('button');
    applyAllBtn.className = 'crop-apply-all-btn';
    applyAllBtn.textContent = 'Apply to All';
    applyAllBtn.title = 'Copy this crop region to all pages';
    applyAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyCropToAll(page);
    });
    rect.appendChild(applyAllBtn);

    rect.addEventListener('dblclick', (e) => {
        if (state.mode !== 'crop') return;
        e.stopPropagation();
        page.cropBox = null;
        rect.remove();
    });

    makeCropInteractive(rect, wrap, page);
}

function applyCropToAll(sourcePage) {
    if (!sourcePage.cropBox) return;
    const cropCopy = { ...sourcePage.cropBox };
    state.pages.forEach(p => {
        p.cropBox = { ...cropCopy };
        renderCardCanvas(p);
    });
    updateModeBanner('Crop applied to all pages.', 'crop');
}

function makeCropInteractive(rect, wrap, page) {
    if (rect._isInteractive) return;
    rect._isInteractive = true;

    rect.addEventListener('mousedown', (e) => {
        if (state.mode !== 'crop') return;
        if (e.target.classList.contains('crop-apply-all-btn')) return;
        e.stopPropagation();
        const wrapRect = wrap.getBoundingClientRect();
        const handle = e.target.closest('.crop-handle')?.dataset.handle;

        const startX = e.clientX;
        const startY = e.clientY;

        const initL = page.cropBox.leftRatio * wrapRect.width;
        const initT = page.cropBox.topRatio * wrapRect.height;
        const initW = page.cropBox.widthRatio * wrapRect.width;
        const initH = page.cropBox.heightRatio * wrapRect.height;

        let ticking = false;

        const onMove = (me) => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const dx = me.clientX - startX;
                    const dy = me.clientY - startY;

                    let newL = initL;
                    let newT = initT;
                    let newW = initW;
                    let newH = initH;

                    if (!handle) {
                        newL = Math.max(0, Math.min(initL + dx, wrapRect.width - initW));
                        newT = Math.max(0, Math.min(initT + dy, wrapRect.height - initH));
                    } else {
                        if (handle.includes('e')) newW = Math.max(15, Math.min(initW + dx, wrapRect.width - initL));
                        if (handle.includes('s')) newH = Math.max(15, Math.min(initH + dy, wrapRect.height - initT));
                        if (handle.includes('w')) {
                            const clampedDx = Math.max(-initL, Math.min(dx, initW - 15));
                            newL = initL + clampedDx;
                            newW = initW - clampedDx;
                        }
                        if (handle.includes('n')) {
                            const clampedDy = Math.max(-initT, Math.min(dy, initH - 15));
                            newT = initT + clampedDy;
                            newH = initH - clampedDy;
                        }
                    }

                    page.cropBox = {
                        leftRatio: newL / wrapRect.width,
                        topRatio: newT / wrapRect.height,
                        widthRatio: newW / wrapRect.width,
                        heightRatio: newH / wrapRect.height,
                    };

                    syncRectToPercentage(rect, page);
                    ticking = false;
                });
                ticking = true;
            }
        };

        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            syncRectToPercentage(rect, page);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    });
}

function startCrop(e, wrap, page) {
    const old = wrap.querySelector('.crop-rect');
    if (old) old.remove();

    const wrapRect = wrap.getBoundingClientRect();
    const sx = e.clientX - wrapRect.left;
    const sy = e.clientY - wrapRect.top;

    const rect = document.createElement('div');
    rect.className = 'crop-rect';
    rect.style.left = `${(sx / wrapRect.width * 100).toFixed(2)}%`;
    rect.style.top = `${(sy / wrapRect.height * 100).toFixed(2)}%`;
    rect.style.width = '0%';
    rect.style.height = '0%';
    wrap.appendChild(rect);

    let ticking = false;

    const onMove = (me) => {
        if (!ticking) {
            requestAnimationFrame(() => {
                const cx = me.clientX - wrapRect.left;
                const cy = me.clientY - wrapRect.top;
                const l = Math.max(0, Math.min(sx, cx));
                const t = Math.max(0, Math.min(sy, cy));
                const w = Math.min(Math.abs(cx - sx), wrapRect.width - l);
                const h = Math.min(Math.abs(cy - sy), wrapRect.height - t);

                rect.style.left = `${(l / wrapRect.width * 100).toFixed(2)}%`;
                rect.style.top = `${(t / wrapRect.height * 100).toFixed(2)}%`;
                rect.style.width = `${(w / wrapRect.width * 100).toFixed(2)}%`;
                rect.style.height = `${(h / wrapRect.height * 100).toFixed(2)}%`;
                ticking = false;
            });
            ticking = true;
        }
    };

    const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);

        const wrapW = wrapRect.width;
        const wrapH = wrapRect.height;
        const lPx = (parseFloat(rect.style.left) / 100) * wrapW;
        const tPx = (parseFloat(rect.style.top) / 100) * wrapH;
        const wPx = (parseFloat(rect.style.width) / 100) * wrapW;
        const hPx = (parseFloat(rect.style.height) / 100) * wrapH;

        if (wPx < 15 || hPx < 15) {
            rect.remove();
            page.cropBox = null;
            return;
        }

        page.cropBox = {
            leftRatio: lPx / wrapW,
            topRatio: tPx / wrapH,
            widthRatio: wPx / wrapW,
            heightRatio: hPx / wrapH,
        };

        syncRectToPercentage(rect, page);
        addCropControls(rect, wrap, page);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

// ---- Whiteout Logic ----
function renderWhiteouts(wrap, page) {
    wrap.querySelectorAll('.whiteout-rect').forEach(w => w.remove());
    if (!page.whiteouts) return;

    page.whiteouts.forEach(w => {
        const rect = document.createElement('div');
        rect.className = 'whiteout-rect';
        rect.style.left = `${(w.leftRatio * 100).toFixed(2)}%`;
        rect.style.top = `${(w.topRatio * 100).toFixed(2)}%`;
        rect.style.width = `${(w.widthRatio * 100).toFixed(2)}%`;
        rect.style.height = `${(w.heightRatio * 100).toFixed(2)}%`;
        rect.title = 'Double-click to remove whiteout';

        rect.addEventListener('dblclick', (e) => {
            if (state.mode !== 'whiteout') return;
            e.stopPropagation();
            const idx = page.layers.indexOf(w);
            if (idx !== -1) {
                page.layers.splice(idx, 1);
                renderCardCanvas(page);
            }
        });

        wrap.appendChild(rect);
    });
}

function startWhiteout(e, wrap, page) {
    const wrapRect = wrap.getBoundingClientRect();
    const startX = e.clientX - wrapRect.left;
    const startY = e.clientY - wrapRect.top;

    const tempRect = document.createElement('div');
    tempRect.className = 'whiteout-rect';
    tempRect.style.left = `${startX}px`;
    tempRect.style.top = `${startY}px`;
    tempRect.style.width = '0px';
    tempRect.style.height = '0px';
    wrap.appendChild(tempRect);

    let moved = false;

    const onMove = (me) => {
        moved = true;
        const curX = me.clientX - wrapRect.left;
        const curY = me.clientY - wrapRect.top;

        const left = Math.max(0, Math.min(startX, curX));
        const top = Math.max(0, Math.min(startY, curY));
        const right = Math.min(wrapRect.width, Math.max(startX, curX));
        const bottom = Math.min(wrapRect.height, Math.max(startY, curY));

        tempRect.style.left = `${left}px`;
        tempRect.style.top = `${top}px`;
        tempRect.style.width = `${right - left}px`;
        tempRect.style.height = `${bottom - top}px`;
    };

    const onUp = (me) => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);

        if (moved) {
            const curX = me.clientX - wrapRect.left;
            const curY = me.clientY - wrapRect.top;

            const leftPx = Math.max(0, Math.min(startX, curX));
            const topPx = Math.max(0, Math.min(startY, curY));
            const rightPx = Math.min(wrapRect.width, Math.max(startX, curX));
            const bottomPx = Math.min(wrapRect.height, Math.max(startY, curY));

            const wPx = rightPx - leftPx;
            const hPx = bottomPx - topPx;

            if (wPx > 10 && hPx > 10) {
                if (!page.layers) page.layers = [];
                page.layers.push({
                    type: 'whiteout',
                    id: `wo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    leftRatio: leftPx / wrapRect.width,
                    topRatio: topPx / wrapRect.height,
                    widthRatio: wPx / wrapRect.width,
                    heightRatio: hPx / wrapRect.height,
                });
            }
        }
        tempRect.remove();
        renderCardCanvas(page);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

function addWhiteoutControls(rect, wrap, page, layer) {
    const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    handles.forEach(dir => {
        const h = document.createElement('div');
        h.className = `whiteout-handle handle-${dir}`;
        h.dataset.handle = dir;
        rect.appendChild(h);
    });

    rect.addEventListener('mousedown', (e) => {
        if (state.mode !== 'whiteout') return;
        e.preventDefault();
        e.stopPropagation();

        const handle = e.target.classList.contains('whiteout-handle') ? e.target.dataset.handle : null;
        const wrapRect = wrap.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;

        const initLeftPx = layer.leftRatio * wrapRect.width;
        const initTopPx = layer.topRatio * wrapRect.height;
        const initWidthPx = layer.widthRatio * wrapRect.width;
        const initHeightPx = layer.heightRatio * wrapRect.height;

        let ticking = false;

        const onMove = (me) => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const dx = me.clientX - startX;
                    const dy = me.clientY - startY;

                    if (!handle) {
                        // Position drag
                        const newLeft = Math.max(0, Math.min(wrapRect.width - initWidthPx, initLeftPx + dx));
                        const newTop = Math.max(0, Math.min(wrapRect.height - initHeightPx, initTopPx + dy));
                        layer.leftRatio = newLeft / wrapRect.width;
                        layer.topRatio = newTop / wrapRect.height;
                    } else {
                        // Handle resize drag
                        let newL = initLeftPx;
                        let newT = initTopPx;
                        let newW = initWidthPx;
                        let newH = initHeightPx;

                        if (handle.includes('e')) newW = Math.max(10, Math.min(wrapRect.width - initLeftPx, initWidthPx + dx));
                        if (handle.includes('s')) newH = Math.max(10, Math.min(wrapRect.height - initTopPx, initHeightPx + dy));
                        if (handle.includes('w')) {
                            newW = Math.max(10, initWidthPx - dx);
                            newL = initLeftPx + (initWidthPx - newW);
                        }
                        if (handle.includes('n')) {
                            newH = Math.max(10, initHeightPx - dy);
                            newT = initTopPx + (initHeightPx - newH);
                        }

                        layer.leftRatio = newL / wrapRect.width;
                        layer.topRatio = newT / wrapRect.height;
                        layer.widthRatio = newW / wrapRect.width;
                        layer.heightRatio = newH / wrapRect.height;
                    }

                    rect.style.left = `${(layer.leftRatio * 100).toFixed(2)}%`;
                    rect.style.top = `${(layer.topRatio * 100).toFixed(2)}%`;
                    rect.style.width = `${(layer.widthRatio * 100).toFixed(2)}%`;
                    rect.style.height = `${(layer.heightRatio * 100).toFixed(2)}%`;
                    ticking = false;
                });
                ticking = true;
            }
        };

        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            renderCardCanvas(page);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    });
}
