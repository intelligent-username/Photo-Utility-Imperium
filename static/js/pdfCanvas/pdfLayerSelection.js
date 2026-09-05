// ===========================================
//  pdfLayerSelection.js — Layer selection state & placement ghost preview
// ===========================================

import { getState } from './pdfState.js';
import { formatDate } from './pdfAnnotations.js';
import { renderCardCanvas } from './pdfRender.js';
import { snapshotPageLayers } from './pdfHistory.js';

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
    document.querySelectorAll('.ann-marker.selected, .signature-rect.selected, .whiteout-rect-interactive.selected').forEach(el => el.classList.remove('selected'));
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

export function getGhostEl() {
    if (!ghostEl) {
        ghostEl = document.createElement('div');
        ghostEl.className = 'placement-ghost';
        ghostEl.style.display = 'none';
        document.body.appendChild(ghostEl);
    }
    return ghostEl;
}

export function hideGhost() {
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
