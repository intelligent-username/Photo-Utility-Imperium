// ===========================================
//  pdfCanvas.js — Core state, rendering, drag-reorder, annotations, crop, overlay
// ===========================================

// ---- State ----
const state = {
    pages: [],       // { id, fileIdx, pageIdx, fileName, excluded, annotations[], cropBox, overlays[], _pdfPage, isBlank, aspectRatio }
    files: [],       // raw File objects
    mode: 'select',  // 'select' | 'annotate' | 'crop' | 'overlay' | 'signature'
    annColor: '#ff0000',
    annSize: 16,
    overlaySource: null, // page id selected as overlay source
    viewMode: 'large',   // 'small' | 'large' | 'full'
    isLargeView: true,
    signatures: [],      // array of saved signature stamp objects
    activeSignature: null, // currently selected signature stamp object
};

export function getState() { return state; }

const modeOrder = ['large', 'full', 'small'];
const modeLabels = { small: 'Small View', large: 'Large View', full: 'Full View' };

export function setViewMode(viewMode) {
    state.viewMode = viewMode;
    state.isLargeView = (viewMode === 'large');

    const grid = document.getElementById('pdf-page-grid');
    if (grid) {
        grid.classList.remove('small-view', 'large-view', 'full-view');
        grid.classList.add(`${viewMode}-view`);
    }

    const btn = document.getElementById('view-mode-btn');
    if (btn) {
        btn.textContent = modeLabels[viewMode] || 'View Mode';
    }

    reRenderCanvases();
}

export function cycleViewMode() {
    const currIdx = modeOrder.indexOf(state.viewMode);
    const nextIdx = (currIdx + 1) % modeOrder.length;
    setViewMode(modeOrder[nextIdx]);
}

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
    Object.defineProperty(page, 'signatures', {
        get: () => page.layers.filter(l => l.type === 'signature'),
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
        grid.classList.remove('grid-mode-crop', 'grid-mode-overlay', 'grid-mode-annotate', 'grid-mode-whiteout', 'grid-mode-signature');
        if (modeName !== 'select') {
            grid.classList.add(`grid-mode-${modeName}`);
        }
    }

    // Enable card dragging ONLY in 'select' mode
    document.querySelectorAll('.pdf-page-card').forEach(card => {
        card.draggable = (modeName === 'select');
    });

    document.querySelectorAll('.overlay-source').forEach(el => el.classList.remove('overlay-source'));
}

// ---- Canvas Cache & Rendering (Instant 60fps Cached Canvas Engine) ----
async function getPageCanvasCache(page, targetWidth) {
    if (!page._pdfPage && !page.isBlank) return null;

    if (!page._cacheCanvas || page._cacheWidth !== targetWidth) {
        const offCanvas = document.createElement('canvas');
        if (page.isBlank) {
            const ar = page.aspectRatio || (792 / 612);
            offCanvas.width = targetWidth;
            offCanvas.height = Math.round(targetWidth * ar);
            const offCtx = offCanvas.getContext('2d');
            offCtx.fillStyle = '#ffffff';
            offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
        } else if (page._pdfPage) {
            const origVp = page._pdfPage.getViewport({ scale: 1.0 });
            const scale = targetWidth / origVp.width;
            const vp = page._pdfPage.getViewport({ scale });
            offCanvas.width = Math.round(vp.width);
            offCanvas.height = Math.round(vp.height);
            const offCtx = offCanvas.getContext('2d');

            if (page._renderTask) {
                try { await page._renderTask.promise; } catch (e) {}
            }
            page._renderTask = page._pdfPage.render({ canvasContext: offCtx, viewport: vp });
            try {
                await page._renderTask.promise;
            } catch (e) {}
            page._renderTask = null;
        }
        page._cacheCanvas = offCanvas;
        page._cacheWidth = targetWidth;
    }

    return page._cacheCanvas;
}

export async function renderCardCanvas(page) {
    const card = document.getElementById(page.id);
    if (!card) return;
    const canvas = card.querySelector('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const dpr = Math.max(2, window.devicePixelRatio || 1);
    let baseTargetWidth = 600;
    if (state.viewMode === 'small') baseTargetWidth = 320;
    else if (state.viewMode === 'full') baseTargetWidth = 1000;
    const targetWidth = baseTargetWidth * dpr;

    const baseCache = await getPageCanvasCache(page, targetWidth);
    if (!baseCache) return;

    canvas.width = baseCache.width;
    canvas.height = baseCache.height;
    const vpWidth = canvas.width;
    const vpHeight = canvas.height;

    ctx.clearRect(0, 0, vpWidth, vpHeight);

    // 1. Draw Base Page
    ctx.drawImage(baseCache, 0, 0);

    const basePdfW = page._pdfPage ? page._pdfPage.getViewport({ scale: 1.0 }).width : 612.0;
    const canvasScale = vpWidth / basePdfW;

    // 2. Draw Unified Layer Stack in EXACT Chronological Creation Order directly on canvas ctx
    if (page.layers && page.layers.length > 0) {
        for (const layer of page.layers) {
            if (layer.type === 'whiteout') {
                ctx.fillStyle = '#ffffff';
                const wx = layer.leftRatio * vpWidth;
                const wy = layer.topRatio * vpHeight;
                const ww = layer.widthRatio * vpWidth;
                const wh = layer.heightRatio * vpHeight;
                ctx.fillRect(wx, wy, ww, wh);

            } else if (layer.type === 'overlay') {
                const ovPageObj = state.pages.find(p => p.id === layer.sourceId) ||
                                  state.pages.find(p => (p.fileIdx === layer.fileIdx || p.fileIdx === layer.fileIndex) &&
                                                        (p.pageIdx === layer.pageIdx || p.pageIdx === layer.pageIndex));
                if (ovPageObj) {
                    const ovCache = await getPageCanvasCache(ovPageObj, vpWidth);
                    if (ovCache) {
                        ctx.save();
                        ctx.globalAlpha = 0.90;
                        const dx = (layer.dxRatio || 0) * vpWidth;
                        const dy = (layer.dyRatio || 0) * vpHeight;
                        const scaleW = layer.scaleWidthRatio || 1.0;
                        const scaleH = layer.scaleHeightRatio || 1.0;

                        if (layer.cropBox) {
                            const cx = layer.cropBox.leftRatio * vpWidth;
                            const cy = layer.cropBox.topRatio * vpHeight;
                            const cw = layer.cropBox.widthRatio * vpWidth;
                            const ch = layer.cropBox.heightRatio * vpHeight;
                            ctx.drawImage(ovCache, cx, cy, cw, ch, dx, dy, cw * scaleW, ch * scaleH);
                        } else {
                            ctx.drawImage(ovCache, 0, 0, ovCache.width, ovCache.height, dx, dy, vpWidth * scaleW, vpHeight * scaleH);
                        }
                        ctx.restore();
                    }
                }
            } else if (layer.type === 'signature') {
                const sx = (layer.leftRatio || 0) * vpWidth;
                const sy = (layer.topRatio || 0) * vpHeight;
                const sw = (layer.widthRatio || 0.3) * vpWidth;
                const sh = (layer.heightRatio || 0.1) * vpHeight;

                // Draw solid white background box for readability
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(sx, sy, sw, sh);

                if (layer._cachedImg) {
                    ctx.drawImage(layer._cachedImg, sx, sy, sw, sh);
                } else if (layer.dataUrl) {
                    const img = new Image();
                    img.src = layer.dataUrl;
                    try {
                        await new Promise((resolve) => {
                            img.onload = resolve;
                            img.onerror = resolve;
                        });
                        layer._cachedImg = img;
                        ctx.drawImage(img, sx, sy, sw, sh);
                    } catch (e) {}
                } else {
                    ctx.save();
                    ctx.fillStyle = layer.color || '#0b1220';
                    const fontSz = Math.max(12, Math.round(sh * 0.7));
                    ctx.font = `600 ${fontSz}px "${layer.fontFamily || 'Dancing Script'}", cursive`;
                    ctx.textBaseline = 'middle';
                    ctx.fillText(layer.text || 'Signature', sx + 5, sy + (sh / 2));
                    ctx.restore();
                }
            }
        }
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
    // Mode banner removed per user request.
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
        } else if (state.mode === 'signature' && state.activeSignature) {
            if (e.target.closest('.signature-rect')) return;
            e.stopPropagation();
            const rect = canvas.getBoundingClientRect();
            const clickLeft = Math.max(0, Math.min(1.0 - 0.35, (e.clientX - rect.left) / (rect.width || 1)));
            const clickTop = Math.max(0, Math.min(1.0 - 0.12, (e.clientY - rect.top) / (rect.height || 1)));

            page.layers.push({
                type: 'signature',
                id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                text: state.activeSignature.text,
                fontFamily: state.activeSignature.fontFamily,
                color: state.activeSignature.color,
                dataUrl: state.activeSignature.dataUrl,
                leftRatio: clickLeft,
                topRatio: clickTop,
                widthRatio: 0.35,
                heightRatio: 0.12
            });

            renderCardCanvas(page);
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

function getContrastBgColor(hexColor) {
    let r = 0, g = 0, b = 0;
    if (hexColor && hexColor.startsWith('#')) {
        const hex = hexColor.slice(1);
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        }
    }
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    if (brightness < 130) {
        return { bg: 'rgba(238, 240, 243, 0.96)', border: 'rgba(0, 0, 0, 0.25)' };
    } else {
        return { bg: 'rgba(30, 30, 30, 0.95)', border: 'rgba(255, 255, 255, 0.3)' };
    }
}

function openAnnotationInput(wrap, page, xR, yR, existingAnn = null, existingMarker = null) {
    wrap.querySelectorAll('.ann-edit-box, .ann-input').forEach(b => b.remove());

    if (existingMarker) {
        existingMarker.style.visibility = 'hidden';
    }

    const box = document.createElement('div');
    box.className = 'ann-edit-box';
    const leftPct = (xR * 100).toFixed(1);
    box.style.left = `${leftPct}%`;
    box.style.top = `${(yR * 100).toFixed(1)}%`;
    box.style.maxWidth = `calc(100% - ${leftPct}%)`;

    const input = document.createElement('textarea');
    input.className = 'ann-input';
    input.rows = 1;
    input.style.maxWidth = '100%';
    let currentAnnColor = existingAnn ? (existingAnn.color || state.annColor) : state.annColor;
    let currentAnnSize = existingAnn ? (existingAnn.fontSize || state.annSize) : state.annSize;

    const applyContrastTheme = (hexColor) => {
        const theme = getContrastBgColor(hexColor);
        box.style.background = theme.bg;
        box.style.borderColor = theme.border;
    };
    applyContrastTheme(currentAnnColor);

    const wrapRect = wrap.getBoundingClientRect();
    const canvasScale = wrapRect.width > 0 ? (wrapRect.width / 612.0) : (state.viewMode === 'full' ? 0.95 : (state.viewMode === 'small' ? 0.26 : 0.55));

    const autoResize = () => {
        input.style.height = 'auto';
        input.style.height = `${input.scrollHeight}px`;
        const lines = input.value.split('\n');
        const maxLen = Math.max(...lines.map(l => l.length), 1);
        input.cols = Math.max(2, maxLen + 1);
    };

    const controls = document.createElement('div');
    controls.className = 'ann-box-controls';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'ann-popover-color';
    colorPicker.value = currentAnnColor;
    colorPicker.title = 'Font Color';
    colorPicker.addEventListener('input', (e) => {
        currentAnnColor = e.target.value;
        state.annColor = currentAnnColor;
        input.style.color = currentAnnColor;
        applyContrastTheme(currentAnnColor);
        const mainPicker = document.getElementById('ann-color');
        if (mainPicker) mainPicker.value = currentAnnColor;
    });

    const sizeSelect = document.createElement('select');
    sizeSelect.className = 'ann-popover-size';
    sizeSelect.title = 'Font Size';
    [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64].forEach(sz => {
        const opt = document.createElement('option');
        opt.value = sz;
        opt.textContent = `${sz}px`;
        if (sz === currentAnnSize) opt.selected = true;
        sizeSelect.appendChild(opt);
    });
    sizeSelect.addEventListener('change', (e) => {
        currentAnnSize = parseInt(e.target.value, 10);
        state.annSize = currentAnnSize;
        const wRect = wrap.getBoundingClientRect();
        const cScale = wRect.width > 0 ? (wRect.width / 612.0) : (state.viewMode === 'full' ? 0.95 : (state.viewMode === 'small' ? 0.26 : 0.55));
        input.style.fontSize = `${Math.max(9, currentAnnSize * cScale)}px`;
        autoResize();
        const mainSize = document.getElementById('ann-size');
        if (mainSize) mainSize.value = currentAnnSize;
    });

    controls.appendChild(colorPicker);
    controls.appendChild(sizeSelect);
    box.appendChild(controls);

    input.placeholder = 'Text...';
    input.value = existingAnn ? existingAnn.text : '';
    input.style.color = currentAnnColor;

    const scaledFont = Math.max(9, currentAnnSize * canvasScale);
    input.style.fontSize = `${scaledFont}px`;
    input.addEventListener('input', autoResize);
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
                existingAnn.color = currentAnnColor;
                existingAnn.fontSize = currentAnnSize;
            }
        } else if (text) {
            const ann = {
                type: 'annotation',
                id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                text,
                xRatio: xR,
                yRatio: yR,
                color: currentAnnColor,
                fontSize: currentAnnSize,
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

    box.addEventListener('mousedown', (e) => e.stopPropagation());
    box.addEventListener('click', (e) => e.stopPropagation());

    wrap.appendChild(box);
    setTimeout(autoResize, 0);
    input.focus();
    input.select();

    const onDocClick = (e) => {
        if (!box.contains(e.target)) {
            document.removeEventListener('pointerdown', onDocClick);
            commit();
        }
    };
    setTimeout(() => {
        document.addEventListener('pointerdown', onDocClick);
    }, 50);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            document.removeEventListener('pointerdown', onDocClick);
            commit();
        }
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
    // Overlay badge removed per user request; no UI badge needed.
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
function syncOverlayRectToPercentage(ovRect, page, layer = null) {
    const targetLayer = layer || page.overlays[page.overlays.length - 1];
    if (!targetLayer) return;

    let baseL = targetLayer.cropBox ? targetLayer.cropBox.leftRatio : 0.0;
    let baseT = targetLayer.cropBox ? targetLayer.cropBox.topRatio : 0.0;
    let baseW = targetLayer.cropBox ? targetLayer.cropBox.widthRatio : 1.0;
    let baseH = targetLayer.cropBox ? targetLayer.cropBox.heightRatio : 1.0;

    let scaleW = targetLayer.scaleWidthRatio || 1.0;
    let scaleH = targetLayer.scaleHeightRatio || 1.0;

    let lR = baseL + (targetLayer.dxRatio || 0);
    let tR = baseT + (targetLayer.dyRatio || 0);
    let wR = baseW * scaleW;
    let hR = baseH * scaleH;

    ovRect.style.left = `${(lR * 100).toFixed(2)}%`;
    ovRect.style.top = `${(tR * 100).toFixed(2)}%`;
    ovRect.style.width = `${(wR * 100).toFixed(2)}%`;
    ovRect.style.height = `${(hR * 100).toFixed(2)}%`;
}

function addOverlayControls(ovRect, wrap, page, layer = null) {
    ovRect.querySelectorAll('.overlay-handle').forEach(h => h.remove());

    const positions = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
    positions.forEach(pos => {
        const h = document.createElement('div');
        h.className = `overlay-handle handle-${pos}`;
        h.dataset.handle = pos;
        ovRect.appendChild(h);
    });

    makeOverlayInteractive(ovRect, wrap, page, layer);
}

function makeOverlayInteractive(ovRect, wrap, page, layer = null) {
    if (ovRect._isInteractive) return;
    ovRect._isInteractive = true;

    ovRect.addEventListener('mousedown', (e) => {
        if (state.mode !== 'overlay') return;
        e.stopPropagation();
        const wrapRect = wrap.getBoundingClientRect();
        const handle = e.target.closest('.overlay-handle')?.dataset.handle;

        const startX = e.clientX;
        const startY = e.clientY;

        const targetLayer = layer || page.overlays[page.overlays.length - 1];
        if (!targetLayer) return;

        const baseW = targetLayer.cropBox ? targetLayer.cropBox.widthRatio * wrapRect.width : wrapRect.width;
        const baseH = targetLayer.cropBox ? targetLayer.cropBox.heightRatio * wrapRect.height : wrapRect.height;

        const initDx = (targetLayer.dxRatio || 0) * wrapRect.width;
        const initDy = (targetLayer.dyRatio || 0) * wrapRect.height;
        const initScaleW = targetLayer.scaleWidthRatio || 1.0;
        const initScaleH = targetLayer.scaleHeightRatio || 1.0;

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
                        targetLayer.dxRatio = (initDx + dx) / wrapRect.width;
                        targetLayer.dyRatio = (initDy + dy) / wrapRect.height;
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

                        targetLayer.scaleWidthRatio = newW / baseW;
                        targetLayer.scaleHeightRatio = newH / baseH;
                        targetLayer.dxRatio = (initDx + extraDx) / wrapRect.width;
                        targetLayer.dyRatio = (initDy + extraDy) / wrapRect.height;
                    }

                    syncOverlayRectToPercentage(ovRect, page, targetLayer);
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
    const canvasScale = wrapRect.width > 0 ? (wrapRect.width / 612.0) : (state.viewMode === 'full' ? 0.95 : (state.viewMode === 'small' ? 0.26 : 0.55));

    page.layers.forEach((layer, idx) => {
        const zIndex = 10 + idx;

        if (layer.type === 'whiteout') {
            const canvas = wrap.querySelector('canvas');
            const canvasRect = canvas ? canvas.getBoundingClientRect() : wrapRect;

            const canvasOffsetLeft = canvasRect.left - wrapRect.left;
            const canvasOffsetTop = canvasRect.top - wrapRect.top;
            const leftPct = ((canvasOffsetLeft + (layer.leftRatio * canvasRect.width)) / (wrapRect.width || 1) * 100).toFixed(2);
            const topPct = ((canvasOffsetTop + (layer.topRatio * canvasRect.height)) / (wrapRect.height || 1) * 100).toFixed(2);
            const widthPct = (layer.widthRatio * canvasRect.width / (wrapRect.width || 1) * 100).toFixed(2);
            const heightPct = (layer.heightRatio * canvasRect.height / (wrapRect.height || 1) * 100).toFixed(2);

            const rect = document.createElement('div');
            rect.className = 'whiteout-rect';
            rect.style.left = `${leftPct}%`;
            rect.style.top = `${topPct}%`;
            rect.style.width = `${widthPct}%`;
            rect.style.height = `${heightPct}%`;
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
            const canvas = wrap.querySelector('canvas');
            const canvasRect = canvas ? canvas.getBoundingClientRect() : wrapRect;
            const canvasOffsetLeft = canvasRect.left - wrapRect.left;
            const canvasOffsetTop = canvasRect.top - wrapRect.top;

            const leftPct = ((canvasOffsetLeft + (layer.xRatio * canvasRect.width)) / (wrapRect.width || 1) * 100).toFixed(2);
            const topPct = ((canvasOffsetTop + (layer.yRatio * canvasRect.height)) / (wrapRect.height || 1) * 100).toFixed(2);
            const maxW = ((canvasRect.width * (1.0 - layer.xRatio)) / (wrapRect.width || 1) * 100).toFixed(2);

            const marker = document.createElement('span');
            marker.className = 'ann-marker';
            marker.textContent = layer.text;
            marker.style.left = `${leftPct}%`;
            marker.style.top = `${topPct}%`;
            marker.style.maxWidth = `${maxW}%`;
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

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'overlay-del-btn';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Remove overlay';

            const removeOverlay = (e) => {
                e.stopPropagation();
                e.preventDefault();
                const lIdx = page.layers.indexOf(layer);
                if (lIdx !== -1) {
                    page.layers.splice(lIdx, 1);
                    renderCardCanvas(page);
                }
            };

            delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
            delBtn.addEventListener('click', removeOverlay);
            ovRect.addEventListener('dblclick', (e) => {
                if (state.mode !== 'overlay') return;
                removeOverlay(e);
            });

            ovRect.appendChild(delBtn);
            wrap.appendChild(ovRect);
            addOverlayControls(ovRect, wrap, page, layer);
            syncOverlayRectToPercentage(ovRect, page, layer);

        } else if (layer.type === 'signature') {
            const canvas = wrap.querySelector('canvas');
            const canvasRect = canvas ? canvas.getBoundingClientRect() : wrapRect;

            const canvasOffsetLeft = canvasRect.left - wrapRect.left;
            const canvasOffsetTop = canvasRect.top - wrapRect.top;
            const leftPct = ((canvasOffsetLeft + (layer.leftRatio * canvasRect.width)) / (wrapRect.width || 1) * 100).toFixed(2);
            const topPct = ((canvasOffsetTop + (layer.topRatio * canvasRect.height)) / (wrapRect.height || 1) * 100).toFixed(2);
            const widthPct = (layer.widthRatio * canvasRect.width / (wrapRect.width || 1) * 100).toFixed(2);
            const heightPct = (layer.heightRatio * canvasRect.height / (wrapRect.height || 1) * 100).toFixed(2);

            const rect = document.createElement('div');
            rect.className = 'signature-rect';
            rect.style.left = `${leftPct}%`;
            rect.style.top = `${topPct}%`;
            rect.style.width = `${widthPct}%`;
            rect.style.height = `${heightPct}%`;
            rect.style.zIndex = zIndex;
            rect.title = 'Signature: Drag to move, double-click to remove';

            addSignatureControls(rect, wrap, page, layer);

            rect.addEventListener('dblclick', (e) => {
                if (state.mode !== 'signature' && state.mode !== 'select') return;
                e.stopPropagation();
                const lIdx = page.layers.indexOf(layer);
                if (lIdx !== -1) {
                    page.layers.splice(lIdx, 1);
                    renderCardCanvas(page);
                }
            });
            wrap.appendChild(rect);
        }
    });
}

function addSignatureControls(rect, wrap, page, layer) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeftRatio = layer.leftRatio || 0;
    let initialTopRatio = layer.topRatio || 0;

    rect.addEventListener('mousedown', (e) => {
        if (state.mode !== 'signature' && state.mode !== 'select') return;
        e.stopPropagation();
        e.preventDefault();
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const canvas = wrap.querySelector('canvas');
        const canvasRect = canvas ? canvas.getBoundingClientRect() : wrap.getBoundingClientRect();
        initialLeftRatio = layer.leftRatio || 0;
        initialTopRatio = layer.topRatio || 0;

        const onMouseMove = (moveEv) => {
            if (!isDragging) return;
            const dx = moveEv.clientX - startX;
            const dy = moveEv.clientY - startY;

            let newLeft = initialLeftRatio + (dx / (canvasRect.width || 1));
            let newTop = initialTopRatio + (dy / (canvasRect.height || 1));

            newLeft = Math.max(0, Math.min(1.0 - (layer.widthRatio || 0.3), newLeft));
            newTop = Math.max(0, Math.min(1.0 - (layer.heightRatio || 0.1), newTop));

            layer.leftRatio = newLeft;
            layer.topRatio = newTop;

            renderCardCanvas(page);
        };

        const onMouseUp = () => {
            isDragging = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });
}

export function generateSignatureDataUrl(text, fontFamily, color) {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 600;
    offCanvas.height = 180;
    const ctx = offCanvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);
    ctx.fillStyle = color || '#0b1220';
    ctx.font = `600 64px "${fontFamily || 'Caveat'}", cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text || 'Signature', 300, 90);

    return offCanvas.toDataURL('image/png');
}

export function saveSignatureStamp(text, fontFamily, color) {
    const dataUrl = generateSignatureDataUrl(text, fontFamily, color);
    const stamp = {
        id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text: text || 'Signature',
        fontFamily: fontFamily || 'Caveat',
        color: color || '#0b1220',
        dataUrl
    };
    state.signatures.push(stamp);
    try {
        localStorage.setItem('pui_signatures', JSON.stringify(state.signatures));
    } catch (e) {}
    return stamp;
}

export function removeSignatureStamp(stampId) {
    const idx = state.signatures.findIndex(s => s.id === stampId);
    if (idx !== -1) {
        state.signatures.splice(idx, 1);
        if (state.activeSignature && state.activeSignature.id === stampId) {
            state.activeSignature = state.signatures[0] || null;
        }
        try {
            localStorage.setItem('pui_signatures', JSON.stringify(state.signatures));
        } catch (e) {}
    }
}

export function loadSavedSignatures() {
    try {
        const saved = localStorage.getItem('pui_signatures');
        if (saved) {
            state.signatures = JSON.parse(saved);
        } else {
            state.signatures = [];
        }
    } catch (e) {
        state.signatures = [];
    }

    if (!state.activeSignature && state.signatures.length > 0) {
        state.activeSignature = state.signatures[0];
    } else if (state.signatures.length === 0) {
        state.activeSignature = null;
    }
}

function makeAnnotationInteractive(marker, wrap, page, ann) {
    if (marker._isInteractive) return;
    marker._isInteractive = true;

    marker.addEventListener('mousedown', (e) => {
        if (state.mode !== 'annotate') return;
        if (e.target.closest('.ann-delete-btn')) return;
        e.stopPropagation();
        e.preventDefault();

        const canvas = wrap.querySelector('canvas');
        const wrapRect = wrap.getBoundingClientRect();
        const canvasRect = canvas ? canvas.getBoundingClientRect() : wrapRect;

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
                    ann.xRatio = Math.max(0, Math.min(1.0, initXR + (dx / (canvasRect.width || 1))));
                    ann.yRatio = Math.max(0, Math.min(1.0, initYR + (dy / (canvasRect.height || 1))));

                    const cOffsetLeft = canvasRect.left - wrapRect.left;
                    const cOffsetTop = canvasRect.top - wrapRect.top;
                    const leftPct = ((cOffsetLeft + (ann.xRatio * canvasRect.width)) / (wrapRect.width || 1) * 100).toFixed(2);
                    const topPct = ((cOffsetTop + (ann.yRatio * canvasRect.height)) / (wrapRect.height || 1) * 100).toFixed(2);
                    const maxW = ((canvasRect.width * (1.0 - ann.xRatio)) / (wrapRect.width || 1) * 100).toFixed(2);

                    marker.style.left = `${leftPct}%`;
                    marker.style.top = `${topPct}%`;
                    marker.style.maxWidth = `${maxW}%`;
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
            } else {
                renderCardCanvas(page);
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



function startWhiteout(e, wrap, page) {
    const canvas = wrap.querySelector('canvas') || wrap;
    const rectBounds = canvas.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();

    const startX = Math.max(0, Math.min(rectBounds.width, e.clientX - rectBounds.left));
    const startY = Math.max(0, Math.min(rectBounds.height, e.clientY - rectBounds.top));

    const tempRect = document.createElement('div');
    tempRect.className = 'whiteout-rect';

    const toWrapLeft = (px) => ((rectBounds.left - wrapRect.left + px) / wrapRect.width * 100).toFixed(2);
    const toWrapTop = (py) => ((rectBounds.top - wrapRect.top + py) / wrapRect.height * 100).toFixed(2);
    const toWrapWidth = (pw) => (pw / wrapRect.width * 100).toFixed(2);
    const toWrapHeight = (ph) => (ph / wrapRect.height * 100).toFixed(2);

    tempRect.style.left = `${toWrapLeft(startX)}%`;
    tempRect.style.top = `${toWrapTop(startY)}%`;
    tempRect.style.width = '0%';
    tempRect.style.height = '0%';
    wrap.appendChild(tempRect);

    let moved = false;

    const onMove = (me) => {
        moved = true;
        const curX = Math.max(0, Math.min(rectBounds.width, me.clientX - rectBounds.left));
        const curY = Math.max(0, Math.min(rectBounds.height, me.clientY - rectBounds.top));

        const left = Math.min(startX, curX);
        const top = Math.min(startY, curY);
        const wPx = Math.abs(curX - startX);
        const hPx = Math.abs(curY - startY);

        tempRect.style.left = `${toWrapLeft(left)}%`;
        tempRect.style.top = `${toWrapTop(top)}%`;
        tempRect.style.width = `${toWrapWidth(wPx)}%`;
        tempRect.style.height = `${toWrapHeight(hPx)}%`;
    };

    const onUp = (me) => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        tempRect.remove();

        if (moved) {
            const curX = Math.max(0, Math.min(rectBounds.width, me.clientX - rectBounds.left));
            const curY = Math.max(0, Math.min(rectBounds.height, me.clientY - rectBounds.top));

            const leftPx = Math.min(startX, curX);
            const topPx = Math.min(startY, curY);
            const wPx = Math.abs(curX - startX);
            const hPx = Math.abs(curY - startY);

            if (wPx > 5 && hPx > 5) {
                if (!page.layers) page.layers = [];
                page.layers.push({
                    type: 'whiteout',
                    id: `wo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    leftRatio: leftPx / rectBounds.width,
                    topRatio: topPx / rectBounds.height,
                    widthRatio: wPx / rectBounds.width,
                    heightRatio: hPx / rectBounds.height,
                });
                renderCardCanvas(page);
            }
        }
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
        const canvas = wrap.querySelector('canvas') || wrap;
        const rectBounds = canvas.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;

        const initLeftPx = layer.leftRatio * rectBounds.width;
        const initTopPx = layer.topRatio * rectBounds.height;
        const initWidthPx = layer.widthRatio * rectBounds.width;
        const initHeightPx = layer.heightRatio * rectBounds.height;

        let ticking = false;

        const onMove = (me) => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const dx = me.clientX - startX;
                    const dy = me.clientY - startY;

                    if (!handle) {
                        // Position drag
                        const newLeft = Math.max(0, Math.min(rectBounds.width - initWidthPx, initLeftPx + dx));
                        const newTop = Math.max(0, Math.min(rectBounds.height - initHeightPx, initTopPx + dy));
                        layer.leftRatio = newLeft / rectBounds.width;
                        layer.topRatio = newTop / rectBounds.height;
                    } else {
                        // Handle resize drag
                        let newL = initLeftPx;
                        let newT = initTopPx;
                        let newW = initWidthPx;
                        let newH = initHeightPx;

                        if (handle.includes('e')) newW = Math.max(10, Math.min(rectBounds.width - initLeftPx, initWidthPx + dx));
                        if (handle.includes('s')) newH = Math.max(10, Math.min(rectBounds.height - initTopPx, initHeightPx + dy));
                        if (handle.includes('w')) {
                            newW = Math.max(10, initWidthPx - dx);
                            newL = initLeftPx + (initWidthPx - newW);
                        }
                        if (handle.includes('n')) {
                            newH = Math.max(10, initHeightPx - dy);
                            newT = initTopPx + (initHeightPx - newH);
                        }

                        layer.leftRatio = newL / rectBounds.width;
                        layer.topRatio = newT / rectBounds.height;
                        layer.widthRatio = newW / rectBounds.width;
                        layer.heightRatio = newH / rectBounds.height;
                    }

                    const canvasOffsetLeft = rectBounds.left - wrapRect.left;
                    const canvasOffsetTop = rectBounds.top - wrapRect.top;
                    const leftPct = ((canvasOffsetLeft + (layer.leftRatio * rectBounds.width)) / wrapRect.width * 100).toFixed(2);
                    const topPct = ((canvasOffsetTop + (layer.topRatio * rectBounds.height)) / wrapRect.height * 100).toFixed(2);
                    const widthPct = (layer.widthRatio * rectBounds.width / wrapRect.width * 100).toFixed(2);
                    const heightPct = (layer.heightRatio * rectBounds.height / wrapRect.height * 100).toFixed(2);

                    rect.style.left = `${leftPct}%`;
                    rect.style.top = `${topPct}%`;
                    rect.style.width = `${widthPct}%`;
                    rect.style.height = `${heightPct}%`;
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
