// ===========================================
//  pdfCardBuilder.js — Page card DOM generation & layer element rendering
// ===========================================

import { getState, createPageObject } from './pdfState.js';
import { openAnnotationInput, startWhiteout, formatDate } from './pdfAnnotations.js';
import { startCrop, handleOverlayClick, removeOverlay } from './pdfCropOverlay.js';
import { renderCardCanvas } from './pdfRender.js';

let ghostEl = null;
export let lastGhostPlacement = null;

function getGhostEl() {
    if (!ghostEl) {
        ghostEl = document.createElement('div');
        ghostEl.className = 'placement-ghost';
        ghostEl.style.display = 'none';
        document.body.appendChild(ghostEl);
    }
    return ghostEl;
}

function hideGhost() {
    if (ghostEl) ghostEl.style.display = 'none';
}

export function initGhostPreview() {
    const grid = document.getElementById('pdf-page-grid');
    if (!grid || grid._ghostInit) return;
    grid._ghostInit = true;

    grid.addEventListener('mousemove', (e) => {
        const state = getState();
        if (state.mode !== 'signature' && state.mode !== 'date') { hideGhost(); lastGhostPlacement = null; return; }
        const card = e.target.closest('.pdf-page-card');
        if (!card) { hideGhost(); lastGhostPlacement = null; return; }
        const wrap = card.querySelector('.page-canvas-wrap');
        const canvas = wrap ? wrap.querySelector('canvas') : null;
        if (!wrap || !canvas) { hideGhost(); lastGhostPlacement = null; return; }

        const page = state.pages.find(p => p.id === card.id);
        if (!page) return;

        const canvasRect = canvas.getBoundingClientRect();
        const ghostW = canvasRect.width * 0.35;
        const ghostH = canvasRect.height * 0.12;
        let left = e.clientX - ghostW / 2;
        let top = e.clientY - ghostH / 2;

        left = Math.max(canvasRect.left, Math.min(canvasRect.right - ghostW, left));
        top = Math.max(canvasRect.top, Math.min(canvasRect.bottom - ghostH, top));

        const clickLeft = Math.max(0, Math.min(1.0 - 0.35, (left - canvasRect.left) / (canvasRect.width || 1)));
        const clickTop = Math.max(0, Math.min(1.0 - 0.12, (top - canvasRect.top) / (canvasRect.height || 1)));

        lastGhostPlacement = { page, leftRatio: clickLeft, topRatio: clickTop };

        const ghost = getGhostEl();
        ghost.style.left = `${left}px`;
        ghost.style.top = `${top}px`;
        ghost.style.width = `${ghostW}px`;
        ghost.style.height = `${ghostH}px`;
        ghost.style.display = 'flex';

        if (state.mode === 'signature' && state.activeSignature) {
            ghost.innerHTML = state.activeSignature.dataUrl ?
                `<img src="${state.activeSignature.dataUrl}" style="width:100%;height:100%;object-fit:contain;" />` :
                `<span class="placement-ghost-text" style="font-family:'${state.activeSignature.fontFamily}',cursive;color:${state.activeSignature.color};">${state.activeSignature.text}</span>`;
        } else if (state.mode === 'date') {
            const dateStr = formatDate(state.dateFormat);
            ghost.innerHTML = `<span class="placement-ghost-text" style="font-family:'${state.dateFont}',sans-serif;color:${state.dateColor};font-weight:${state.dateBold ? 'bold' : 'normal'};">${dateStr}</span>`;
        }
    });

    grid.addEventListener('mouseleave', () => {
        hideGhost();
        lastGhostPlacement = null;
    });
}

export function commitActivePlacement() {
    const state = getState();

    // 1. If text edit box is active, trigger commit to finalize text annotation
    const activeBox = document.querySelector('.ann-edit-box');
    if (activeBox && typeof activeBox._commit === 'function') {
        activeBox._commit();
    }

    // 2. If signature / date stamp ghost preview is active, place stamp at last ghost placement
    if ((state.mode === 'signature' || state.mode === 'date') && lastGhostPlacement && lastGhostPlacement.page) {
        const { page, leftRatio, topRatio } = lastGhostPlacement;
        if (state.mode === 'signature' && state.activeSignature) {
            page.layers.push({
                type: 'signature',
                id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                text: state.activeSignature.text,
                fontFamily: state.activeSignature.fontFamily,
                color: state.activeSignature.color,
                dataUrl: state.activeSignature.dataUrl,
                leftRatio,
                topRatio,
                widthRatio: 0.35,
                heightRatio: 0.12
            });
        } else if (state.mode === 'date') {
            page.layers.push({
                type: 'signature',
                id: `date_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                text: formatDate(state.dateFormat),
                fontFamily: state.dateFont,
                color: state.dateColor,
                bold: state.dateBold,
                fontSize: state.dateSize,
                leftRatio,
                topRatio,
                widthRatio: 0.35,
                heightRatio: 0.12
            });
        }
        hideGhost();
        lastGhostPlacement = null;
        renderCardCanvas(page);
    }
}

export function indexLabel(page) {
    const state = getState();
    const idx = state.pages.indexOf(page);
    return idx >= 0 ? `${idx + 1}` : '1';
}

export function updateOverlayBadge(card, page) {
    let badge = card.querySelector('.overlay-badge');
    if (page.overlays && page.overlays.length > 0) {
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'overlay-badge';
            card.appendChild(badge);
        }
        const state = getState();
        const srcPage = state.pages.find(p => p.id === page.overlays[0].sourceId);
        const srcIdx = srcPage ? state.pages.indexOf(srcPage) + 1 : '?';
        badge.innerHTML = `Overlay: P${srcIdx} <button type="button" class="remove-overlay-btn" title="Remove overlay">&times;</button>`;
        badge.querySelector('.remove-overlay-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            removeOverlay(page);
            updateOverlayBadge(card, page);
        });
    } else if (badge) {
        badge.remove();
    }
}

export function insertBlankAfter(targetPage) {
    const state = getState();
    const idx = state.pages.indexOf(targetPage);
    const newPage = createPageObject({
        fileName: 'Blank Page',
        isBlank: true,
        aspectRatio: targetPage.aspectRatio || (792 / 612),
    });
    if (idx >= 0) {
        state.pages.splice(idx + 1, 0, newPage);
    } else {
        state.pages.push(newPage);
    }
    syncGrid();
}

export function syncGrid() {
    const grid = document.getElementById('pdf-page-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const state = getState();
    state.pages.forEach(page => {
        const card = buildCard(page);
        grid.appendChild(card);
        renderCardCanvas(page);
    });
}

export function renderCardLayers(wrap, page) {
    wrap.querySelectorAll('.ann-marker, .overlay-rect, .signature-rect, .whiteout-rect-interactive').forEach(el => el.remove());

    if (!page.layers || page.layers.length === 0) return;
    const wrapRect = wrap.getBoundingClientRect();
    const canvasScale = wrapRect.width > 0 ? (wrapRect.width / 612.0) : 0.55;

    const card = document.getElementById(page.id);

    page.layers.forEach(layer => {
        if (layer.type === 'annotation') {
            const marker = document.createElement('div');
            marker.className = 'ann-marker';
            marker.style.left = `${(layer.xRatio * 100).toFixed(1)}%`;
            marker.style.top = `${(layer.yRatio * 100).toFixed(1)}%`;

            const fontSz = Math.max(9, (layer.fontSize || 16) * canvasScale);
            marker.style.fontSize = `${fontSz}px`;
            marker.style.color = layer.color || '#ff0000';
            if (layer.fontFamily && layer.fontFamily !== 'inherit') marker.style.fontFamily = layer.fontFamily;
            if (layer.bold) marker.style.fontWeight = 'bold';

            marker.textContent = layer.text;

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'ann-delete-btn';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Delete annotation';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = page.layers.indexOf(layer);
                if (idx !== -1) page.layers.splice(idx, 1);
                renderCardCanvas(page);
            });
            marker.appendChild(delBtn);

            marker.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                openAnnotationInput(wrap, page, layer.xRatio, layer.yRatio, layer, marker);
            });

            // Dragging for text annotation marker
            let isDragging = false;
            let startX = 0, startY = 0;
            let initXR = layer.xRatio, initYR = layer.yRatio;

            marker.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('ann-delete-btn')) return;
                e.stopPropagation();
                if (card) card.draggable = false;
                isDragging = true;
                const wRect = wrap.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                initXR = layer.xRatio;
                initYR = layer.yRatio;

                const onMove = (me) => {
                    if (!isDragging) return;
                    const dx = (me.clientX - startX) / (wRect.width || 1);
                    const dy = (me.clientY - startY) / (wRect.height || 1);
                    layer.xRatio = Math.max(0, Math.min(0.95, initXR + dx));
                    layer.yRatio = Math.max(0, Math.min(0.95, initYR + dy));
                    marker.style.left = `${(layer.xRatio * 100).toFixed(1)}%`;
                    marker.style.top = `${(layer.yRatio * 100).toFixed(1)}%`;
                };

                const onUp = () => {
                    if (!isDragging) return;
                    isDragging = false;
                    const state = getState();
                    if (card) card.draggable = (state.mode === 'select');
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    renderCardCanvas(page);
                };

                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });

            wrap.appendChild(marker);
        } else if (layer.type === 'signature') {
            const rect = document.createElement('div');
            rect.className = 'signature-rect';
            rect.style.left = `${(layer.leftRatio * 100).toFixed(2)}%`;
            rect.style.top = `${(layer.topRatio * 100).toFixed(2)}%`;
            rect.style.width = `${(layer.widthRatio * 100).toFixed(2)}%`;
            rect.style.height = `${(layer.heightRatio * 100).toFixed(2)}%`;

            if (layer.dataUrl) {
                const img = document.createElement('img');
                img.src = layer.dataUrl;
                rect.appendChild(img);
            } else {
                const span = document.createElement('span');
                span.className = 'signature-rect-content';
                span.style.color = layer.color || '#000000';
                if (layer.fontFamily) span.style.fontFamily = `"${layer.fontFamily}", sans-serif`;
                if (layer.bold) span.style.fontWeight = 'bold';
                const fontSz = Math.max(10, (layer.fontSize || 16) * canvasScale);
                span.style.fontSize = `${fontSz}px`;
                span.textContent = layer.text;
                rect.appendChild(span);
            }

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'signature-del-btn';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Delete stamp';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = page.layers.indexOf(layer);
                if (idx !== -1) page.layers.splice(idx, 1);
                renderCardCanvas(page);
            });
            rect.appendChild(delBtn);

            // Dragging for signature / date stamp rect
            let isDragging = false;
            let startX = 0, startY = 0;
            let initLR = layer.leftRatio, initTR = layer.topRatio;

            rect.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('signature-del-btn')) return;
                e.stopPropagation();
                if (card) card.draggable = false;
                isDragging = true;
                const wRect = wrap.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                initLR = layer.leftRatio;
                initTR = layer.topRatio;

                const onMove = (me) => {
                    if (!isDragging) return;
                    const dx = (me.clientX - startX) / (wRect.width || 1);
                    const dy = (me.clientY - startY) / (wRect.height || 1);
                    layer.leftRatio = Math.max(0, Math.min(1.0 - layer.widthRatio, initLR + dx));
                    layer.topRatio = Math.max(0, Math.min(1.0 - layer.heightRatio, initTR + dy));
                    rect.style.left = `${(layer.leftRatio * 100).toFixed(2)}%`;
                    rect.style.top = `${(layer.topRatio * 100).toFixed(2)}%`;
                };

                const onUp = () => {
                    if (!isDragging) return;
                    isDragging = false;
                    const state = getState();
                    if (card) card.draggable = (state.mode === 'select');
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    renderCardCanvas(page);
                };

                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });

            wrap.appendChild(rect);
        } else if (layer.type === 'overlay') {
            const state = getState();
            const srcPage = state.pages.find(p => p.id === layer.sourceId);
            const srcIdx = srcPage ? state.pages.indexOf(srcPage) + 1 : '?';

            const rect = document.createElement('div');
            rect.className = 'overlay-rect';

            // Position: dx/dy ratios are offset from top-left; scale ratios are the rendered size fraction
            const scaleW = layer.scaleWidthRatio || 1.0;
            const scaleH = layer.scaleHeightRatio || 1.0;
            rect.style.left   = `${((layer.dxRatio || 0) * 100).toFixed(2)}%`;
            rect.style.top    = `${((layer.dyRatio || 0) * 100).toFixed(2)}%`;
            rect.style.width  = `${(scaleW * 100).toFixed(2)}%`;
            rect.style.height = `${(scaleH * 100).toFixed(2)}%`;

            const label = document.createElement('div');
            label.className = 'overlay-rect-label';
            label.textContent = `P${srcIdx}`;
            rect.appendChild(label);

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'overlay-del-btn';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Remove overlay';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = page.layers.indexOf(layer);
                if (idx !== -1) page.layers.splice(idx, 1);
                renderCardCanvas(page);
                // Remove badge
                if (card) {
                    const badge = card.querySelector('.overlay-badge');
                    if (badge) badge.remove();
                    card.classList.remove('has-overlay');
                }
            });
            rect.appendChild(delBtn);

            // Resize handles
            ['nw','ne','sw','se','n','s','e','w'].forEach(pos => {
                const h = document.createElement('div');
                h.className = `overlay-handle handle-${pos}`;
                h.dataset.handle = pos;
                rect.appendChild(h);
            });

            // Drag to move
            rect.addEventListener('mousedown', (e) => {
                const state = getState();
                if (state.mode !== 'overlay') return;
                if (e.target.classList.contains('overlay-del-btn')) return;
                const handle = e.target.closest('.overlay-handle')?.dataset.handle;
                e.stopPropagation();
                if (card) card.draggable = false;

                const wRect = wrap.getBoundingClientRect();
                const startX = e.clientX, startY = e.clientY;
                const initDx = layer.dxRatio || 0;
                const initDy = layer.dyRatio || 0;
                const initSW = layer.scaleWidthRatio || 1.0;
                const initSH = layer.scaleHeightRatio || 1.0;

                const canvas = wrap.querySelector('canvas');
                const ctx = canvas ? canvas.getContext('2d') : null;
                const baseCache = page._cacheCanvas;
                const state2 = getState();
                const srcPage = state2.pages.find(p => p.id === layer.sourceId);
                const ovCache = srcPage ? srcPage._cacheCanvas : null;
                let ticking = false;

                const onMove = (me) => {
                    const dx = (me.clientX - startX) / (wRect.width || 1);
                    const dy = (me.clientY - startY) / (wRect.height || 1);

                    if (!handle) {
                        layer.dxRatio = Math.max(0, Math.min(1 - initSW, initDx + dx));
                        layer.dyRatio = Math.max(0, Math.min(1 - initSH, initDy + dy));
                    } else {
                        if (handle.includes('e')) layer.scaleWidthRatio  = Math.max(0.05, Math.min(1 - initDx, initSW + dx));
                        if (handle.includes('s')) layer.scaleHeightRatio = Math.max(0.05, Math.min(1 - initDy, initSH + dy));
                        if (handle.includes('w')) {
                            const cdx = Math.max(-initDx, Math.min(dx, initSW - 0.05));
                            layer.dxRatio = initDx + cdx;
                            layer.scaleWidthRatio = initSW - cdx;
                        }
                        if (handle.includes('n')) {
                            const cdy = Math.max(-initDy, Math.min(dy, initSH - 0.05));
                            layer.dyRatio = initDy + cdy;
                            layer.scaleHeightRatio = initSH - cdy;
                        }
                    }

                    rect.style.left   = `${(layer.dxRatio * 100).toFixed(2)}%`;
                    rect.style.top    = `${(layer.dyRatio * 100).toFixed(2)}%`;
                    rect.style.width  = `${(layer.scaleWidthRatio * 100).toFixed(2)}%`;
                    rect.style.height = `${(layer.scaleHeightRatio * 100).toFixed(2)}%`;

                    if (!ticking && ctx && baseCache && ovCache) {
                        requestAnimationFrame(() => {
                            const vpW = canvas.width, vpH = canvas.height;
                            ctx.clearRect(0, 0, vpW, vpH);
                            ctx.drawImage(baseCache, 0, 0);

                            ctx.save();
                            ctx.globalAlpha = 0.90;
                            const odx = layer.dxRatio * vpW;
                            const ody = layer.dyRatio * vpH;
                            const osW = layer.scaleWidthRatio * vpW;
                            const osH = layer.scaleHeightRatio * vpH;
                            if (layer.cropBox) {
                                const cx = layer.cropBox.leftRatio * ovCache.width;
                                const cy = layer.cropBox.topRatio * ovCache.height;
                                const cw = layer.cropBox.widthRatio * ovCache.width;
                                const ch = layer.cropBox.heightRatio * ovCache.height;
                                ctx.drawImage(ovCache, cx, cy, cw, ch, odx, ody, osW, osH);
                            } else {
                                ctx.drawImage(ovCache, 0, 0, ovCache.width, ovCache.height, odx, ody, osW, osH);
                            }
                            ctx.restore();
                            ticking = false;
                        });
                        ticking = true;
                    }
                };

                const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    if (card) card.draggable = (getState().mode === 'select');
                    renderCardCanvas(page);
                };

                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });

            wrap.appendChild(rect);
        } else if (layer.type === 'whiteout') {
            const rect = document.createElement('div');
            rect.className = 'whiteout-rect-interactive';
            rect.style.left = `${(layer.leftRatio * 100).toFixed(2)}%`;
            rect.style.top = `${(layer.topRatio * 100).toFixed(2)}%`;
            rect.style.width = `${(layer.widthRatio * 100).toFixed(2)}%`;
            rect.style.height = `${(layer.heightRatio * 100).toFixed(2)}%`;

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'ann-delete-btn';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Delete whiteout block';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = page.layers.indexOf(layer);
                if (idx !== -1) page.layers.splice(idx, 1);
                renderCardCanvas(page);
            });
            rect.appendChild(delBtn);

            wrap.appendChild(rect);
        }
    });
}

export function buildCard(page) {
    const state = getState();
    const card = document.createElement('div');
    card.className = 'pdf-page-card';
    card.id = page.id;
    card.draggable = (state.mode === 'select');

    if (page.excluded) card.classList.add('excluded');

    const num = document.createElement('span');
    num.className = 'page-num';
    num.textContent = indexLabel(page);
    card.appendChild(num);

    const actions = document.createElement('div');
    actions.className = 'page-actions';

    const delBtn = document.createElement('button');
    delBtn.className = 'page-action-btn' + (page.excluded ? ' restore-btn' : '');
    delBtn.innerHTML = '&times;';
    delBtn.title = page.excluded ? 'Restore page' : 'Exclude page';
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

    const wrap = document.createElement('div');
    wrap.className = 'page-canvas-wrap';

    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    const src = document.createElement('div');
    src.className = 'page-source';
    src.textContent = page.fileName;
    card.appendChild(src);

    const addBlankBtn = document.createElement('button');
    addBlankBtn.className = 'add-blank-btn';
    addBlankBtn.innerHTML = '+';
    addBlankBtn.title = 'Insert blank page after this page';
    addBlankBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertBlankAfter(page);
    });
    card.appendChild(addBlankBtn);

    updateOverlayBadge(card, page);

    card.addEventListener('dragstart', (e) => {
        if (state.mode !== 'select') { e.preventDefault(); return; }
        if (e.target.closest('.ann-marker, .signature-rect, .crop-rect, .ann-edit-box, .ann-delete-btn, .signature-del-btn, .page-actions, .page-action-btn')) {
            e.preventDefault();
            return;
        }
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
        } else if (state.mode === 'date') {
            if (e.target.closest('.signature-rect')) return;
            e.stopPropagation();
            const rect = canvas.getBoundingClientRect();
            const clickLeft = Math.max(0, Math.min(1.0 - 0.35, (e.clientX - rect.left) / (rect.width || 1)));
            const clickTop = Math.max(0, Math.min(1.0 - 0.12, (e.clientY - rect.top) / (rect.height || 1)));

            page.layers.push({
                type: 'signature',
                id: `date_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                text: formatDate(state.dateFormat),
                fontFamily: state.dateFont,
                color: state.dateColor,
                bold: state.dateBold,
                fontSize: state.dateSize,
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

    initGhostPreview();
    return card;
}
