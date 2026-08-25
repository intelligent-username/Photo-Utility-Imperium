// ===========================================
//  pdfCardBuilder.js — Page card DOM generation & layer element rendering
// ===========================================

import { getState, createPageObject } from './pdfState.js';
import { openAnnotationInput, startWhiteout, formatDate } from './pdfAnnotations.js';
import { startCrop, handleOverlayClick, removeOverlay } from './pdfCropOverlay.js';
import { renderCardCanvas } from './pdfRender.js';
import { snapshotPageLayers, snapshotPageExcluded, snapshotPagesOrder } from './pdfHistory.js';

let ghostEl = null;
export let lastGhostPlacement = null;
export let selectedLayerInfo = null; // { page, layer, el }

export function selectLayer(page, layer, el) {
    deselectAllLayers();
    selectedLayerInfo = { page, layer, el };
    if (el) el.classList.add('selected');

    if (layer && layer.type === 'annotation') {
        const state = getState();
        if (layer.fontSize) {
            state.annSize = layer.fontSize;
            const sizeInput = document.getElementById('ann-size');
            if (sizeInput) sizeInput.value = layer.fontSize;
        }
        if (layer.color) {
            state.annColor = layer.color;
            const colorInput = document.getElementById('ann-color');
            const customSwatch = document.getElementById('custom-color-swatch');
            if (colorInput) colorInput.value = layer.color;
            if (customSwatch) customSwatch.style.backgroundColor = layer.color;
            document.querySelectorAll('.color-palette .color-dot').forEach(d => {
                d.classList.toggle('active', d.getAttribute('data-color').toLowerCase() === layer.color.toLowerCase());
            });
        }
    }
}

export function deselectAllLayers() {
    if (selectedLayerInfo && selectedLayerInfo.el) {
        selectedLayerInfo.el.classList.remove('selected');
    }
    document.querySelectorAll('.ann-marker.selected, .signature-rect.selected').forEach(el => el.classList.remove('selected'));
    selectedLayerInfo = null;
}

export function deleteSelectedLayer() {
    if (!selectedLayerInfo || !selectedLayerInfo.page || !selectedLayerInfo.layer) return false;
    const { page, layer } = selectedLayerInfo;
    const idx = page.layers.indexOf(layer);
    if (idx !== -1) {
        snapshotPageLayers(page);
        page.layers.splice(idx, 1);
        deselectAllLayers();
        renderCardCanvas(page);
        return true;
    }
    deselectAllLayers();
    return false;
}

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
        const wrapRect = wrap.getBoundingClientRect();
        const canvasScale = wrapRect.width > 0 ? (wrapRect.width / 612.0) : 0.55;

        if (state.mode === 'signature' && state.activeSignature) {
            const sig = state.activeSignature;
            const targetH = 22 * canvasScale;
            const aspect = sig.aspectRatio || (sig.naturalWidth && sig.naturalHeight ? sig.naturalWidth / sig.naturalHeight : 3.0);
            const ghostW = Math.max(14, targetH * aspect);
            const ghostH = Math.max(9, targetH);

            let left = e.clientX - ghostW / 2;
            let top = e.clientY - ghostH / 2;
            left = Math.max(canvasRect.left, Math.min(canvasRect.right - ghostW, left));
            top = Math.max(canvasRect.top, Math.min(canvasRect.bottom - ghostH, top));

            const wRatio = Math.min(0.95, ghostW / (canvasRect.width || 1));
            const hRatio = Math.min(0.5, ghostH / (canvasRect.height || 1));
            const clickLeft = Math.max(0, Math.min(1.0 - wRatio, (left - canvasRect.left) / (canvasRect.width || 1)));
            const clickTop = Math.max(0, Math.min(1.0 - hRatio, (top - canvasRect.top) / (canvasRect.height || 1)));
            lastGhostPlacement = { page, leftRatio: clickLeft, topRatio: clickTop, widthRatio: wRatio, heightRatio: hRatio };

            const ghost = getGhostEl();
            ghost.style.left = `${left}px`;
            ghost.style.top = `${top}px`;
            ghost.style.width = `${ghostW}px`;
            ghost.style.height = `${ghostH}px`;
            ghost.style.display = 'flex';

            ghost.innerHTML = sig.dataUrl ?
                `<img src="${sig.dataUrl}" style="width:100%;height:100%;object-fit:contain;" />` :
                `<span class="placement-ghost-text" style="font-family:'${sig.fontFamily}',cursive;color:${sig.color};">${sig.text}</span>`;
        } else if (state.mode === 'date') {
            const dateStr = formatDate(state.dateFormat);
            const fontSz = Math.max(9, (state.dateSize || 16) * canvasScale);
            let left = e.clientX;
            let top = e.clientY;

            const clickLeft = Math.max(0, Math.min(0.95, (left - canvasRect.left) / (canvasRect.width || 1)));
            const clickTop = Math.max(0, Math.min(0.95, (top - canvasRect.top) / (canvasRect.height || 1)));
            lastGhostPlacement = { page, leftRatio: clickLeft, topRatio: clickTop };

            const ghost = getGhostEl();
            ghost.style.left = `${left}px`;
            ghost.style.top = `${top}px`;
            ghost.style.width = 'auto';
            ghost.style.height = 'auto';
            ghost.style.display = 'block';

            ghost.innerHTML = `<span class="placement-ghost-text" style="font-family:'${state.dateFont}',sans-serif;color:${state.dateColor};font-weight:${state.dateBold ? 'bold' : 'normal'};font-size:${fontSz}px;">${dateStr}</span>`;
        }
    });

    grid.addEventListener('mouseleave', () => {
        hideGhost();
        lastGhostPlacement = null;
    });
}

export function commitActivePlacement() {
    // 1. If text edit box is active, trigger commit to finalize text annotation where it is
    const activeBox = document.querySelector('.ann-edit-box');
    if (activeBox && typeof activeBox._commit === 'function') {
        activeBox._commit();
    }

    // 2. In signature / date stamp mode, simply dismiss the ghost preview without placing a stamp
    hideGhost();
    lastGhostPlacement = null;
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
    snapshotPagesOrder();
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
    wrap.querySelectorAll('.ann-marker, .overlay-rect, .signature-rect, .whiteout-rect-interactive, .pdf-form-field').forEach(el => el.remove());

    // Render interactive PDF form field detection boxes
    if (page.formFields && page.formFields.length > 0) {
        // Sort fields top-to-bottom, left-to-right for Tab navigation
        const sortedFields = [...page.formFields].sort((a, b) => {
            const rowDiff = a.topRatio - b.topRatio;
            return Math.abs(rowDiff) > 0.01 ? rowDiff : a.leftRatio - b.leftRatio;
        });

        sortedFields.forEach((field, fieldIndex) => {
            const fieldEl = document.createElement('div');
            fieldEl.className = 'pdf-form-field';
            fieldEl.style.left = `${(field.leftRatio * 100).toFixed(2)}%`;
            fieldEl.style.top = `${(field.topRatio * 100).toFixed(2)}%`;
            fieldEl.style.width = `${(field.widthRatio * 100).toFixed(2)}%`;
            fieldEl.style.height = `${(field.heightRatio * 100).toFixed(2)}%`;
            fieldEl.title = field.fieldName ? `Form Field: ${field.fieldName}` : 'Form Field (Click to write)';

            fieldEl.addEventListener('click', (e) => {
                const st = getState();
                // In annotate mode, let the click pass through to place a text annotation
                if (st.mode === 'annotate') return;
                e.stopPropagation();
                // If an annotation already exists at this field, open it for editing
                const existing = page.layers.find(l => l.type === 'annotation' && Math.abs(l.xRatio - field.leftRatio) < 0.03 && Math.abs(l.yRatio - field.topRatio) < 0.03);
                if (existing) {
                    openAnnotationInput(wrap, page, existing.xRatio, existing.yRatio, existing, null, {
                        isFormField: true, fieldIndex, sortedFields
                    });
                } else {
                    const inferredSize = field.inferredFontSize || 14;
                    openAnnotationInput(wrap, page, field.leftRatio, field.topRatio, null, null, {
                        fontSize: inferredSize,
                        color: '#000000',
                        isFormField: true,
                        fieldIndex,
                        sortedFields,
                        initialText: field.fieldValue || ''
                    });
                }
            });

            wrap.appendChild(fieldEl);
        });
    }

    if (!page.layers || page.layers.length === 0) return;
    const wrapRect = wrap.getBoundingClientRect();
    const canvasScale = wrapRect.width > 0 ? (wrapRect.width / 612.0) : 0.55;

    const card = document.getElementById(page.id);

    page.layers.forEach(layer => {
        if (layer.type === 'annotation') {
            const marker = document.createElement('div');
            marker.className = 'ann-marker';
            if (layer.isFormField) marker.classList.add('is-form-field');
            marker.style.left = `${(layer.xRatio * 100).toFixed(1)}%`;
            marker.style.top = `${(layer.yRatio * 100).toFixed(1)}%`;

            const fontSz = Math.max(9, (layer.fontSize || 16) * canvasScale);
            marker.style.fontSize = `${fontSz}px`;
            marker.style.color = layer.color || '#ff0000';
            if (layer.fontFamily && layer.fontFamily !== 'inherit') marker.style.fontFamily = layer.fontFamily;
            if (layer.bold) marker.style.fontWeight = 'bold';

            marker.textContent = layer.text;

            if (!layer.isFormField) {
                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'ann-delete-btn';
                delBtn.innerHTML = '&times;';
                delBtn.title = 'Delete annotation';
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = page.layers.indexOf(layer);
                    if (idx !== -1) {
                        snapshotPageLayers(page);
                        page.layers.splice(idx, 1);
                    }
                    renderCardCanvas(page);
                });
                marker.appendChild(delBtn);
            }

            if (selectedLayerInfo && selectedLayerInfo.layer === layer) {
                marker.classList.add('selected');
                selectedLayerInfo.el = marker;
            }

            let lastTapTime = 0;

            const triggerEdit = () => {
                openAnnotationInput(wrap, page, layer.xRatio, layer.yRatio, layer, marker);
            };

            marker.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                e.preventDefault();
                triggerEdit();
            });

            // Dragging & tap detection for text annotation marker
            let isDragging = false;
            let startX = 0, startY = 0;
            let initXR = layer.xRatio, initYR = layer.yRatio;
            let moved = false;

            marker.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('ann-delete-btn')) return;
                e.stopPropagation();

                const now = Date.now();
                if (now - lastTapTime < 350) {
                    lastTapTime = 0;
                    triggerEdit();
                    return;
                }
                lastTapTime = now;

                selectLayer(page, layer, marker);
                if (card) card.draggable = false;
                isDragging = true;
                moved = false;
                snapshotPageLayers(page);  // snapshot before drag
                const wRect = wrap.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                initXR = layer.xRatio;
                initYR = layer.yRatio;

                const onMove = (me) => {
                    if (!isDragging) return;
                    const diffX = me.clientX - startX;
                    const diffY = me.clientY - startY;
                    if (Math.abs(diffX) > 3 || Math.abs(diffY) > 3) {
                        moved = true;
                    }
                    if (!moved) return;

                    const dx = diffX / (wRect.width || 1);
                    const dy = diffY / (wRect.height || 1);
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
                    if (moved) {
                        // snapshot was taken at mousedown with initXR/initYR — restore via snapshotting the pre-drag state
                        // We snapshot at mousedown instead; here we just render
                        renderCardCanvas(page);
                    }
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

            if (selectedLayerInfo && selectedLayerInfo.layer === layer) {
                rect.classList.add('selected');
                selectedLayerInfo.el = rect;
            }

            rect.addEventListener('click', (e) => {
                const st = getState();
                if (st.mode === 'select' || st.mode === 'annotate' || st.mode === 'signature' || st.mode === 'date') {
                    e.stopPropagation();
                    selectLayer(page, layer, rect);
                }
            });

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
                if (idx !== -1) {
                    snapshotPageLayers(page);
                    page.layers.splice(idx, 1);
                }
                renderCardCanvas(page);
            });
            rect.appendChild(delBtn);

            // Corner resize handles (aspect-ratio locked)
            ['nw', 'ne', 'sw', 'se'].forEach(pos => {
                const handle = document.createElement('div');
                handle.className = `signature-handle handle-${pos}`;
                handle.dataset.handle = pos;
                rect.appendChild(handle);
            });

            // Dragging & Resizing for signature rect
            let isDragging = false;
            let isResizing = false;
            let activeHandle = null;
            let startX = 0, startY = 0;
            let initLR = layer.leftRatio, initTR = layer.topRatio;
            let initWR = layer.widthRatio, initHR = layer.heightRatio;
            let moved = false;

            rect.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('signature-del-btn')) return;
                e.stopPropagation();
                selectLayer(page, layer, rect);
                if (card) card.draggable = false;
                snapshotPageLayers(page);  // snapshot before drag/resize

                const handleEl = e.target.closest('.signature-handle');
                const wRect = wrap.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                initLR = layer.leftRatio;
                initTR = layer.topRatio;
                initWR = layer.widthRatio;
                initHR = layer.heightRatio;
                moved = false;

                const baseAspect = (initWR * (wRect.width || 1)) / (initHR * (wRect.height || 1)) || 3.0;

                if (handleEl) {
                    isResizing = true;
                    activeHandle = handleEl.dataset.handle;
                } else {
                    isDragging = true;
                    activeHandle = null;
                }

                const onMove = (me) => {
                    const diffX = me.clientX - startX;
                    const diffY = me.clientY - startY;
                    if (Math.abs(diffX) > 2 || Math.abs(diffY) > 2) {
                        moved = true;
                    }
                    if (!moved) return;

                    const dx = diffX / (wRect.width || 1);
                    const dy = diffY / (wRect.height || 1);

                    if (isDragging) {
                        layer.leftRatio = Math.max(0, Math.min(1.0 - layer.widthRatio, initLR + dx));
                        layer.topRatio = Math.max(0, Math.min(1.0 - layer.heightRatio, initTR + dy));
                        rect.style.left = `${(layer.leftRatio * 100).toFixed(2)}%`;
                        rect.style.top = `${(layer.topRatio * 100).toFixed(2)}%`;
                    } else if (isResizing) {
                        let newW = initWR;
                        let newH = initHR;
                        let newL = initLR;
                        let newT = initTR;

                        const pxW = wRect.width || 1;
                        const pxH = wRect.height || 1;

                        if (activeHandle === 'se') {
                            const scaleX = (initWR * pxW + diffX) / (initWR * pxW || 1);
                            const scaleY = (initHR * pxH + diffY) / (initHR * pxH || 1);
                            const scale = Math.max(0.2, Math.min(4.0, Math.max(scaleX, scaleY)));
                            newW = Math.max(0.04, Math.min(1.0 - initLR, initWR * scale));
                            newH = (newW * pxW / baseAspect) / pxH;
                            if (newT + newH > 1.0) {
                                newH = 1.0 - newT;
                                newW = (newH * pxH * baseAspect) / pxW;
                            }
                        } else if (activeHandle === 'sw') {
                            const scaleX = (initWR * pxW - diffX) / (initWR * pxW || 1);
                            const scaleY = (initHR * pxH + diffY) / (initHR * pxH || 1);
                            const scale = Math.max(0.2, Math.min(4.0, Math.max(scaleX, scaleY)));
                            newW = Math.max(0.04, Math.min(initLR + initWR, initWR * scale));
                            newH = (newW * pxW / baseAspect) / pxH;
                            newL = initLR + (initWR - newW);
                            if (newT + newH > 1.0) {
                                newH = 1.0 - newT;
                                newW = (newH * pxH * baseAspect) / pxW;
                                newL = initLR + (initWR - newW);
                            }
                        } else if (activeHandle === 'ne') {
                            const scaleX = (initWR * pxW + diffX) / (initWR * pxW || 1);
                            const scaleY = (initHR * pxH - diffY) / (initHR * pxH || 1);
                            const scale = Math.max(0.2, Math.min(4.0, Math.max(scaleX, scaleY)));
                            newW = Math.max(0.04, Math.min(1.0 - initLR, initWR * scale));
                            newH = (newW * pxW / baseAspect) / pxH;
                            newT = initTR + (initHR - newH);
                            if (newT < 0) {
                                newT = 0;
                                newH = initTR + initHR;
                                newW = (newH * pxH * baseAspect) / pxW;
                            }
                        } else if (activeHandle === 'nw') {
                            const scaleX = (initWR * pxW - diffX) / (initWR * pxW || 1);
                            const scaleY = (initHR * pxH - diffY) / (initHR * pxH || 1);
                            const scale = Math.max(0.2, Math.min(4.0, Math.max(scaleX, scaleY)));
                            newW = Math.max(0.04, Math.min(initLR + initWR, initWR * scale));
                            newH = (newW * pxW / baseAspect) / pxH;
                            newL = initLR + (initWR - newW);
                            newT = initTR + (initHR - newH);
                            if (newT < 0 || newL < 0) {
                                if (newT < 0) {
                                    newT = 0;
                                    newH = initTR + initHR;
                                    newW = (newH * pxH * baseAspect) / pxW;
                                    newL = initLR + (initWR - newW);
                                }
                                if (newL < 0) {
                                    newL = 0;
                                    newW = initLR + initWR;
                                    newH = (newW * pxW / baseAspect) / pxH;
                                    newT = initTR + (initHR - newH);
                                }
                            }
                        }

                        layer.leftRatio = Math.max(0, newL);
                        layer.topRatio = Math.max(0, newT);
                        layer.widthRatio = newW;
                        layer.heightRatio = newH;

                        rect.style.left = `${(layer.leftRatio * 100).toFixed(2)}%`;
                        rect.style.top = `${(layer.topRatio * 100).toFixed(2)}%`;
                        rect.style.width = `${(layer.widthRatio * 100).toFixed(2)}%`;
                        rect.style.height = `${(layer.heightRatio * 100).toFixed(2)}%`;
                    }
                };

                const onUp = () => {
                    isDragging = false;
                    isResizing = false;
                    const state = getState();
                    if (card) card.draggable = (state.mode === 'select');
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    if (moved) {
                        renderCardCanvas(page);
                    }
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
                if (idx !== -1) {
                    snapshotPageLayers(page);
                    page.layers.splice(idx, 1);
                }
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
                snapshotPageLayers(page);  // snapshot before overlay drag/resize

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
        snapshotPageExcluded(page);
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
        snapshotPagesOrder();
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
        if (!e.target.closest('.ann-marker, .signature-rect, .overlay-rect, .whiteout-rect-interactive')) {
            deselectAllLayers();
        }
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
            const wrapRect = wrap.getBoundingClientRect();
            const canvasScale = wrapRect.width > 0 ? (wrapRect.width / 612.0) : 0.55;
            const sig = state.activeSignature;
            const targetH = 22 * canvasScale;
            const aspect = sig.aspectRatio || (sig.naturalWidth && sig.naturalHeight ? sig.naturalWidth / sig.naturalHeight : 3.0);
            const sigW = Math.max(14, targetH * aspect);
            const sigH = Math.max(9, targetH);

            const wRatio = Math.min(0.95, sigW / (rect.width || 1));
            const hRatio = Math.min(0.5, sigH / (rect.height || 1));

            const clickX = e.clientX - rect.left - sigW / 2;
            const clickY = e.clientY - rect.top - sigH / 2;
            const clickLeft = Math.max(0, Math.min(1.0 - wRatio, clickX / (rect.width || 1)));
            const clickTop = Math.max(0, Math.min(1.0 - hRatio, clickY / (rect.height || 1)));

            snapshotPageLayers(page);
            page.layers.push({
                type: 'signature',
                id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                text: sig.text,
                fontFamily: sig.fontFamily,
                color: sig.color,
                dataUrl: sig.dataUrl,
                leftRatio: clickLeft,
                topRatio: clickTop,
                widthRatio: wRatio,
                heightRatio: hRatio
            });

            renderCardCanvas(page);
        } else if (state.mode === 'date') {
            if (e.target.closest('.ann-marker, .signature-rect')) return;
            e.stopPropagation();
            const rect = canvas.getBoundingClientRect();
            const xR = (e.clientX - rect.left) / rect.width;
            const yR = (e.clientY - rect.top) / rect.height;

            const ann = {
                type: 'annotation',
                id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                text: formatDate(state.dateFormat),
                xRatio: Math.max(0, Math.min(0.95, xR)),
                yRatio: Math.max(0, Math.min(0.95, yR)),
                color: state.dateColor,
                fontSize: state.dateSize,
                fontFamily: state.dateFont,
                bold: state.dateBold
            };

            snapshotPageLayers(page);
            page.layers.push(ann);
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
