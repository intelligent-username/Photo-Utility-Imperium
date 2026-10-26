// ===========================================
//  renderSignatureLayer.js — Interactive signature stamp rendering, drag-repositioning & 4-corner aspect-locked resize
// ===========================================

import { getState } from '../pdfState.js';
import { renderCardCanvas } from '../pdfRender.js';
import { snapshotPageLayers } from '../pdfHistory.js';
import { selectLayer, selectedLayerInfo } from '../pdfLayerSelection.js';

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
                const minW = Math.max(0.08, 48 / pxW);

                if (activeHandle === 'se') {
                    const scaleX = (initWR * pxW + diffX) / (initWR * pxW || 1);
                    const scaleY = (initHR * pxH + diffY) / (initHR * pxH || 1);
                    const scale = Math.max(0.1, Math.min(5.0, Math.max(scaleX, scaleY)));
                    newW = Math.max(minW, Math.min(1.0 - initLR, initWR * scale));
                    newH = (newW * pxW / baseAspect) / pxH;
                    if (newT + newH > 1.0) {
                        newH = 1.0 - newT;
                        newW = (newH * pxH * baseAspect) / pxW;
                    }
                } else if (activeHandle === 'sw') {
                    const scaleX = (initWR * pxW - diffX) / (initWR * pxW || 1);
                    const scaleY = (initHR * pxH + diffY) / (initHR * pxH || 1);
                    const scale = Math.max(0.1, Math.min(5.0, Math.max(scaleX, scaleY)));
                    newW = Math.max(minW, Math.min(initLR + initWR, initWR * scale));
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
                    const scale = Math.max(0.1, Math.min(5.0, Math.max(scaleX, scaleY)));
                    newW = Math.max(minW, Math.min(1.0 - initLR, initWR * scale));
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
                    const scale = Math.max(0.1, Math.min(5.0, Math.max(scaleX, scaleY)));
                    newW = Math.max(minW, Math.min(initLR + initWR, initWR * scale));
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
            const wasResizing = isResizing;
            isDragging = false;
            isResizing = false;
            const state = getState();
            const cardEl = card || document.getElementById(page.id);
            if (cardEl) cardEl.draggable = (state.mode === 'select');
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (moved) {
                if (wasResizing) {
                    const newWR = layer.widthRatio;
                    const newHR = layer.heightRatio;
                    state.lastSignatureWidthRatio = newWR;
                    state.lastSignatureHeightRatio = newHR;
                    try {
                        localStorage.setItem('pdf_last_sig_width_ratio', String(newWR));
                        localStorage.setItem('pdf_last_sig_height_ratio', String(newHR));
                    } catch (e) {}

                    if (state.activeSignature) {
                        state.activeSignature.widthRatio = newWR;
                        state.activeSignature.heightRatio = newHR;
                    }
                    if (state.signatures) {
                        const matchingSig = state.signatures.find(s => s.dataUrl === layer.dataUrl || (s.text === layer.text && s.fontFamily === layer.fontFamily));
                        if (matchingSig) {
                            matchingSig.widthRatio = newWR;
                            matchingSig.heightRatio = newHR;
                        }
                        try {
                            localStorage.setItem('pdf_saved_signatures', JSON.stringify(state.signatures));
                        } catch (e) {}
                    }
                }
                renderCardCanvas(page);
            }
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    });

    wrap.appendChild(rect);
    return rect;
}
