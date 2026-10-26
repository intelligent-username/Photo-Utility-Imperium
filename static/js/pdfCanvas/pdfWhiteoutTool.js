// ===========================================
//  pdfWhiteoutTool.js — Whiteout interactive rectangle drawing
// ===========================================

import { getState } from './pdfState.js';
import { renderCardCanvas } from './pdfRender.js';
import { snapshotPageLayers } from './pdfHistory.js';

export function startWhiteout(e, wrap, page) {
    const state = getState();
    if (state.mode !== 'whiteout') return;
    const rect = wrap.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    const box = document.createElement('div');
    box.className = 'whiteout-rect';
    box.style.left = `${startX}px`;
    box.style.top = `${startY}px`;
    box.style.width = '0px';
    box.style.height = '0px';
    wrap.appendChild(box);

    const onMove = (moveEv) => {
        const curX = Math.max(0, Math.min(rect.width, moveEv.clientX - rect.left));
        const curY = Math.max(0, Math.min(rect.height, moveEv.clientY - rect.top));
        const left = Math.min(startX, curX);
        const top = Math.min(startY, curY);
        const width = Math.abs(curX - startX);
        const height = Math.abs(curY - startY);

        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        const finalWidth = parseFloat(box.style.width);
        const finalHeight = parseFloat(box.style.height);

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
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}
