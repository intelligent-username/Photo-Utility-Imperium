// ===========================================
//  pdfLayerRenderers.js — Interactive DOM rendering for page layers (annotations, signatures, overlays, whiteouts)
// ===========================================

import { getState } from './pdfState.js';
import { openAnnotationInput, getSortedFormFields } from './pdfAnnotations.js';
import { renderCardCanvas } from './pdfRender.js';
import { snapshotPageLayers } from './pdfHistory.js';
import { selectLayer, selectedLayerInfo } from './pdfLayerSelection.js';
import { renderFormFieldElement } from './pdfFormFieldUI.js';

// ── Text Annotation Layer ───────────────────────────────────────────────────
export function renderAnnotationLayer(wrap, page, layer, canvasScale, card) {
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
        const cardEl = card || document.getElementById(page.id);
        if (cardEl) cardEl.draggable = false;
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
            const cardEl = card || document.getElementById(page.id);
            if (cardEl) cardEl.draggable = (state.mode === 'select');
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (moved) {
                renderCardCanvas(page);
            }
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    });

    wrap.appendChild(marker);
    return marker;
}

// ── Signature Stamp Layer ───────────────────────────────────────────────────
export function renderSignatureLayer(wrap, page, layer, canvasScale, card) {
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
        const cardEl = card || document.getElementById(page.id);
        if (cardEl) cardEl.draggable = false;
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
            const cardEl = card || document.getElementById(page.id);
            if (cardEl) cardEl.draggable = (state.mode === 'select');
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
    return rect;
}

// ── Overlay Layer ───────────────────────────────────────────────────────────
export function renderOverlayLayer(wrap, page, layer, card) {
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
        const cardEl = card || document.getElementById(page.id);
        if (cardEl) {
            const badge = cardEl.querySelector('.overlay-badge');
            if (badge) badge.remove();
            cardEl.classList.remove('has-overlay');
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
        const cardEl = card || document.getElementById(page.id);
        if (cardEl) cardEl.draggable = false;
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
            const cardEl = card || document.getElementById(page.id);
            if (cardEl) cardEl.draggable = (getState().mode === 'select');
            renderCardCanvas(page);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    });

    wrap.appendChild(rect);
    return rect;
}

// ── Interactive Whiteout Layer ──────────────────────────────────────────────
export function renderWhiteoutLayer(wrap, page, layer) {
    const rect = document.createElement('div');
    rect.className = 'whiteout-rect-interactive';
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
        if (st.mode === 'select' || st.mode === 'whiteout') {
            e.stopPropagation();
            selectLayer(page, layer, rect);
        }
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'whiteout-del-btn';
    delBtn.innerHTML = '&times;';
    delBtn.title = 'Delete whiteout block';
    delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
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

    wrap.appendChild(rect);
    return rect;
}

// ── Render all layers for a page card ───────────────────────────────────────
export function renderCardLayers(wrap, page) {
    wrap.querySelectorAll('.ann-marker, .overlay-rect, .signature-rect, .whiteout-rect-interactive, .pdf-form-field').forEach(el => el.remove());
    const card = document.getElementById(page.id);

    // Render interactive PDF form field detection boxes
    if (page.formFields && page.formFields.length > 0) {
        const sortedFields = getSortedFormFields(page);
        sortedFields.forEach((field, fieldIndex) => {
            renderFormFieldElement(wrap, page, field, fieldIndex);
        });
    }

    if (!page.layers || page.layers.length === 0) return;
    const wrapRect = wrap.getBoundingClientRect();
    const canvasScale = wrapRect.width > 0 ? (wrapRect.width / 612.0) : 0.55;

    page.layers.forEach(layer => {
        if (layer.type === 'annotation') {
            renderAnnotationLayer(wrap, page, layer, canvasScale, card);
        } else if (layer.type === 'signature') {
            renderSignatureLayer(wrap, page, layer, canvasScale, card);
        } else if (layer.type === 'overlay') {
            renderOverlayLayer(wrap, page, layer, card);
        } else if (layer.type === 'whiteout') {
            renderWhiteoutLayer(wrap, page, layer);
        }
    });
}
