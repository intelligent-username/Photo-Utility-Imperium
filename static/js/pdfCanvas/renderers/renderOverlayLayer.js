// ===========================================
//  renderOverlayLayer.js — Overlay layer DOM rendering, 8-handle resizing, and live RAF canvas preview
// ===========================================

import { getState } from '../pdfState.js';
import { renderCardCanvas } from '../pdfRender.js';
import { snapshotPageLayers } from '../pdfHistory.js';

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

            rect.style.left   = `${((layer.dxRatio || 0) * 100).toFixed(2)}%`;
            rect.style.top    = `${((layer.dyRatio || 0) * 100).toFixed(2)}%`;
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
