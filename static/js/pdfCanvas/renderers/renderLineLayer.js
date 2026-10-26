// ===========================================
//  renderLineLayer.js — Interactive vector line SVG layer rendering, dragging & endpoint handles
// ===========================================

import { getState } from '../pdfState.js';
import { renderCardCanvas } from '../pdfRender.js';
import { snapshotPageLayers } from '../pdfHistory.js';
import { selectLayer, selectedLayerInfo } from '../pdfLayerSelection.js';

export function renderLineLayer(wrap, page, layer, card) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'pdf-line-layer-svg');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.overflow = 'visible';
    svg.style.zIndex = '15';

    const isSelected = selectedLayerInfo && selectedLayerInfo.layer === layer;
    if (isSelected) {
        selectedLayerInfo.el = svg;
    }

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', `${(layer.x1Ratio * 100).toFixed(3)}%`);
    line.setAttribute('y1', `${(layer.y1Ratio * 100).toFixed(3)}%`);
    line.setAttribute('x2', `${(layer.x2Ratio * 100).toFixed(3)}%`);
    line.setAttribute('y2', `${(layer.y2Ratio * 100).toFixed(3)}%`);
    line.setAttribute('stroke', layer.color || '#000000');
    const wrapRect = wrap.getBoundingClientRect();
    const canvasScale = wrapRect.width > 0 ? (wrapRect.width / 612.0) : 1.0;
    const baseThick = Math.max(0.5, layer.thickness || 2);
    const scaledThick = Math.max(0.75, baseThick * canvasScale);

    line.setAttribute('stroke-width', scaledThick.toFixed(2));
    line.setAttribute('stroke-linecap', 'butt');
    line.style.pointerEvents = 'stroke';
    line.style.cursor = 'move';

    // Invisible wider stroke hit area to make clicking/dragging easy
    const hitLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hitLine.setAttribute('x1', `${(layer.x1Ratio * 100).toFixed(3)}%`);
    hitLine.setAttribute('y1', `${(layer.y1Ratio * 100).toFixed(3)}%`);
    hitLine.setAttribute('x2', `${(layer.x2Ratio * 100).toFixed(3)}%`);
    hitLine.setAttribute('y2', `${(layer.y2Ratio * 100).toFixed(3)}%`);
    hitLine.setAttribute('stroke', 'transparent');
    hitLine.setAttribute('stroke-width', Math.max(12, (layer.thickness || 2) + 10));
    hitLine.setAttribute('stroke-linecap', 'butt');
    hitLine.style.pointerEvents = 'stroke';
    hitLine.style.cursor = 'move';

    if (isSelected) {
        line.setAttribute('stroke-dasharray', '4 2');
        line.setAttribute('filter', 'drop-shadow(0 0 3px var(--primary))');
    }

    // Drag-to-move whole line
    const onLineDragStart = (e) => {
        const st = getState();
        if (st.mode !== 'select' && st.mode !== 'line') return;
        e.stopPropagation();
        selectLayer(page, layer, svg);

        const cardEl = card || document.getElementById(page.id);
        if (cardEl) cardEl.draggable = false;

        snapshotPageLayers(page);
        const wRect = wrap.getBoundingClientRect();
        const startClientX = e.clientX;
        const startClientY = e.clientY;
        const initX1 = layer.x1Ratio, initY1 = layer.y1Ratio;
        const initX2 = layer.x2Ratio, initY2 = layer.y2Ratio;
        let moved = false;

        const onMove = (me) => {
            const dx = (me.clientX - startClientX) / (wRect.width || 1);
            const dy = (me.clientY - startClientY) / (wRect.height || 1);
            if (Math.abs(me.clientX - startClientX) > 2 || Math.abs(me.clientY - startClientY) > 2) {
                moved = true;
            }
            if (!moved) return;

            layer.x1Ratio = Math.max(0, Math.min(1.0, initX1 + dx));
            layer.y1Ratio = Math.max(0, Math.min(1.0, initY1 + dy));
            layer.x2Ratio = Math.max(0, Math.min(1.0, initX2 + dx));
            layer.y2Ratio = Math.max(0, Math.min(1.0, initY2 + dy));

            line.setAttribute('x1', `${(layer.x1Ratio * 100).toFixed(3)}%`);
            line.setAttribute('y1', `${(layer.y1Ratio * 100).toFixed(3)}%`);
            line.setAttribute('x2', `${(layer.x2Ratio * 100).toFixed(3)}%`);
            line.setAttribute('y2', `${(layer.y2Ratio * 100).toFixed(3)}%`);
            hitLine.setAttribute('x1', `${(layer.x1Ratio * 100).toFixed(3)}%`);
            hitLine.setAttribute('y1', `${(layer.y1Ratio * 100).toFixed(3)}%`);
            hitLine.setAttribute('x2', `${(layer.x2Ratio * 100).toFixed(3)}%`);
            hitLine.setAttribute('y2', `${(layer.y2Ratio * 100).toFixed(3)}%`);
            if (h1) {
                h1.setAttribute('cx', `${(layer.x1Ratio * 100).toFixed(3)}%`);
                h1.setAttribute('cy', `${(layer.y1Ratio * 100).toFixed(3)}%`);
            }
            if (h2) {
                h2.setAttribute('cx', `${(layer.x2Ratio * 100).toFixed(3)}%`);
                h2.setAttribute('cy', `${(layer.y2Ratio * 100).toFixed(3)}%`);
            }
        };

        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (cardEl) cardEl.draggable = (getState().mode === 'select');
            if (moved) renderCardCanvas(page);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    line.addEventListener('mousedown', onLineDragStart);
    hitLine.addEventListener('mousedown', onLineDragStart);

    svg.appendChild(hitLine);
    svg.appendChild(line);

    // Endpoint resize handles (when selected)
    let h1 = null, h2 = null;
    if (isSelected) {
        const createEndpointHandle = (pointNum) => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            const xProp = pointNum === 1 ? 'x1Ratio' : 'x2Ratio';
            const yProp = pointNum === 1 ? 'y1Ratio' : 'y2Ratio';
            const otherXProp = pointNum === 1 ? 'x2Ratio' : 'x1Ratio';
            const otherYProp = pointNum === 1 ? 'y2Ratio' : 'y1Ratio';

            circle.setAttribute('cx', `${(layer[xProp] * 100).toFixed(3)}%`);
            circle.setAttribute('cy', `${(layer[yProp] * 100).toFixed(3)}%`);
            circle.setAttribute('r', '6');
            circle.setAttribute('fill', '#ffffff');
            circle.setAttribute('stroke', 'var(--primary)');
            circle.setAttribute('stroke-width', '2');
            circle.style.pointerEvents = 'auto';
            circle.style.cursor = 'crosshair';

            circle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                const cardEl = card || document.getElementById(page.id);
                if (cardEl) cardEl.draggable = false;
                snapshotPageLayers(page);
                const wRect = wrap.getBoundingClientRect();
                let moved = false;

                const onMove = (me) => {
                    let curX = Math.max(0, Math.min(wRect.width, me.clientX - wRect.left)) / (wRect.width || 1);
                    let curY = Math.max(0, Math.min(wRect.height, me.clientY - wRect.top)) / (wRect.height || 1);

                    // Holding Ctrl snaps resizing line to horizontal or vertical
                    if (me.ctrlKey) {
                        const anchorX = layer[otherXProp];
                        const anchorY = layer[otherYProp];
                        const dx = Math.abs(curX - anchorX);
                        const dy = Math.abs(curY - anchorY);
                        if (dx >= dy) {
                            curY = anchorY; // horizontal
                        } else {
                            curX = anchorX; // vertical
                        }
                    }

                    layer[xProp] = curX;
                    layer[yProp] = curY;
                    moved = true;

                    line.setAttribute(pointNum === 1 ? 'x1' : 'x2', `${(curX * 100).toFixed(3)}%`);
                    line.setAttribute(pointNum === 1 ? 'y1' : 'y2', `${(curY * 100).toFixed(3)}%`);
                    hitLine.setAttribute(pointNum === 1 ? 'x1' : 'x2', `${(curX * 100).toFixed(3)}%`);
                    hitLine.setAttribute(pointNum === 1 ? 'y1' : 'y2', `${(curY * 100).toFixed(3)}%`);
                    circle.setAttribute('cx', `${(curX * 100).toFixed(3)}%`);
                    circle.setAttribute('cy', `${(curY * 100).toFixed(3)}%`);
                };

                const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    if (cardEl) cardEl.draggable = (getState().mode === 'select');
                    if (moved) renderCardCanvas(page);
                };

                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });

            return circle;
        };

        h1 = createEndpointHandle(1);
        h2 = createEndpointHandle(2);
        svg.appendChild(h1);
        svg.appendChild(h2);
    }

    wrap.appendChild(svg);
    return svg;
}
