// ===========================================
//  pdfWhiteoutTool.js — Whiteout interactive rectangle drawing
// ===========================================

import { getState } from './pdfState.js';
import { renderCardCanvas } from './pdfRender.js';
import { snapshotPageLayers } from './pdfHistory.js';
import { drawDragRectangle } from './drawDragRectangle.js';

export function startWhiteout(e, wrap, page) {
    const state = getState();
    if (state.mode !== 'whiteout') return;
    drawDragRectangle(e, wrap, 'whiteout-rect', (box, rect, finalWidth, finalHeight) => {
        if (finalWidth > 5 && finalHeight > 5) {
            snapshotPageLayers(page);
            const wo = {
                type: 'whiteout',
                id: `wo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                leftRatio: parseFloat(box.style.left) / rect.width,
                topRatio: parseFloat(box.style.top) / rect.height,
                widthRatio: finalWidth / rect.width,
                heightRatio: finalHeight / rect.height,
            };
            page.layers.push(wo);
        }
        box.remove();
        renderCardCanvas(page);
    });
}
