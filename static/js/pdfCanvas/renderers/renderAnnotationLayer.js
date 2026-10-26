// ===========================================
//  renderAnnotationLayer.js — Interactive text annotation marker rendering and drag interaction
// ===========================================

import { getState } from '../pdfState.js';
import { openAnnotationInput } from '../pdfAnnotations.js';
import { renderCardCanvas } from '../pdfRender.js';
import { snapshotPageLayers } from '../pdfHistory.js';
import { selectLayer, selectedLayerInfo } from '../pdfLayerSelection.js';
import { renderRunsToElement } from '../pdfTextLayer.js';

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

    if (layer.runs && layer.runs.length > 0) {
        renderRunsToElement(marker, layer.runs, layer.text, layer.bold);
    } else {
        marker.textContent = layer.text;
        if (layer.bold) marker.style.fontWeight = 'bold';
    }

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
                if (layer.sourceTextId) {
                    const woIdx = page.layers.findIndex(l => l.type === 'whiteout' && l.sourceTextId === layer.sourceTextId);
                    if (woIdx !== -1) page.layers.splice(woIdx, 1);
                }
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
