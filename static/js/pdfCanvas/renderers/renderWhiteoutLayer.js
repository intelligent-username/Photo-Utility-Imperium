// ===========================================
//  renderWhiteoutLayer.js — Interactive whiteout block rendering and deletion
// ===========================================

import { getState } from '../pdfState.js';
import { renderCardCanvas } from '../pdfRender.js';
import { snapshotPageLayers } from '../pdfHistory.js';
import { selectLayer, selectedLayerInfo } from '../pdfLayerSelection.js';

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
