// ===========================================
//  pdfLineTool.js — Vector line drawing tool and drag-interaction creation
// ===========================================

import { getState } from './pdfState.js';
import { renderCardCanvas } from './pdfRender.js';
import { snapshotPageLayers } from './pdfHistory.js';

export function startDrawLine(e, wrap, page) {
    const state = getState();
    if (state.mode !== 'line') return;
    const rect = wrap.getBoundingClientRect();
    const startX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const startY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    // Create live SVG preview container
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'pdf-live-line-svg');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '40';

    const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lineEl.setAttribute('x1', startX);
    lineEl.setAttribute('y1', startY);
    lineEl.setAttribute('x2', startX);
    lineEl.setAttribute('y2', startY);
    const canvasScale = rect.width > 0 ? (rect.width / 612.0) : 1.0;
    const baseThick = Math.max(0.5, state.annLineWidth || 2);
    const scaledThick = Math.max(0.75, baseThick * canvasScale);

    lineEl.setAttribute('stroke', state.annColor || '#000000');
    lineEl.setAttribute('stroke-width', scaledThick.toFixed(2));
    lineEl.setAttribute('stroke-linecap', 'butt');

    svg.appendChild(lineEl);
    wrap.appendChild(svg);

    let curX = startX;
    let curY = startY;

    const onMove = (moveEv) => {
        let rawX = Math.max(0, Math.min(rect.width, moveEv.clientX - rect.left));
        let rawY = Math.max(0, Math.min(rect.height, moveEv.clientY - rect.top));

        // Holding Ctrl or Shift restricts line to perfectly vertical or perfectly horizontal
        if (moveEv.ctrlKey || moveEv.shiftKey) {
            const dx = Math.abs(rawX - startX);
            const dy = Math.abs(rawY - startY);
            if (dx >= dy) {
                curX = rawX;
                curY = startY; // perfectly horizontal
            } else {
                curX = startX; // perfectly vertical
                curY = rawY;
            }
        } else {
            curX = rawX;
            curY = rawY;
        }

        lineEl.setAttribute('x2', curX);
        lineEl.setAttribute('y2', curY);
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        svg.remove();

        const dist = Math.hypot(curX - startX, curY - startY);
        if (dist > 4) {
            snapshotPageLayers(page);
            const lineLayer = {
                type: 'line',
                id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                x1Ratio: startX / rect.width,
                y1Ratio: startY / rect.height,
                x2Ratio: curX / rect.width,
                y2Ratio: curY / rect.height,
                color: state.annColor || '#000000',
                thickness: state.annLineWidth || 2
            };
            page.layers.push(lineLayer);
            renderCardCanvas(page);
        }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}
