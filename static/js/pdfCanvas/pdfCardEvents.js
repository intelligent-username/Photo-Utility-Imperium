// ===========================================
//  pdfCardEvents.js — Card mouse/click events (drag reorder, overlay, placement, routing)
// ===========================================

import { getState, setAppMode } from './pdfState.js';
import { openAnnotationInput } from './pdfAnnotationPopover.js';
import { formatDate } from './pdfDateUtils.js';
import { startWhiteout } from './pdfWhiteoutTool.js';
import { startDrawLine } from './pdfLineTool.js';
import { startCrop, handleOverlayClick } from './pdfCropOverlay.js';
import { renderCardCanvas } from './pdfRender.js';
import { snapshotPageLayers, snapshotPagesOrder } from './pdfHistory.js';
import { deselectAllLayers, hideGhost, selectLayer } from './pdfLayerSelection.js';
import { startCreateFormField } from './pdfFormFieldCreate.js';

export function attachCardEventListeners(card, wrap, canvas, page, syncGrid) {
    const state = getState();

    // 1. Drag to reorder cards
    card.addEventListener('dragstart', (e) => {
        if (state.mode !== 'select') { e.preventDefault(); return; }
        if (e.target.closest('.ann-marker, .signature-rect, .crop-rect, .ann-edit-box, .ann-delete-btn, .signature-del-btn, .whiteout-rect-interactive, .whiteout-del-btn, .page-actions, .page-action-btn')) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('text/plain', page.id);
        card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        document.querySelectorAll('.pdf-page-card.drag-over').forEach(c => c.classList.remove('drag-over'));
    });

    card.addEventListener('dragover', (e) => {
        if (state.mode !== 'select') return;
        e.preventDefault();
        card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));

    card.addEventListener('drop', (e) => {
        if (state.mode !== 'select') return;
        e.preventDefault();
        card.classList.remove('drag-over');
        const fromId = e.dataTransfer.getData('text/plain');
        if (!fromId || fromId === page.id) return;
        const fromIdx = state.pages.findIndex(p => p.id === fromId);
        const toIdx = state.pages.findIndex(p => p.id === page.id);
        if (fromIdx < 0 || toIdx < 0) return;
        snapshotPagesOrder();
        const [moved] = state.pages.splice(fromIdx, 1);
        state.pages.splice(toIdx, 0, moved);
        syncGrid();
    });

    // 2. Overlay source/target click routing
    card.addEventListener('click', (e) => {
        if (state.mode === 'overlay') {
            e.stopPropagation();
            handleOverlayClick(page, card);
        }
    });

    // 3. Canvas click placements (annotate, signature stamp, date stamp)
    wrap.addEventListener('click', (e) => {
        if (!e.target.closest('.ann-marker, .signature-rect, .overlay-rect, .whiteout-rect-interactive')) {
            deselectAllLayers();
        }
        if (state.mode === 'annotate') {
            if (e.target.closest('.ann-marker') || e.target.closest('.ann-edit-box') || e.target.closest('.ann-input')) return;
            e.stopPropagation();
            const rect = canvas.getBoundingClientRect();
            const xR = (e.clientX - rect.left) / rect.width;
            const yR = (e.clientY - rect.top) / rect.height;
            openAnnotationInput(wrap, page, xR, yR);
        } else if (state.mode === 'signature' && state.activeSignature) {
            if (e.target.closest('.signature-rect')) return;
            e.stopPropagation();
            const rect = canvas.getBoundingClientRect();
            const sig = state.activeSignature;
            const aspect = sig.aspectRatio || (sig.naturalWidth && sig.naturalHeight ? sig.naturalWidth / sig.naturalHeight : 3.0);
            const targetWR = sig.widthRatio || state.lastSignatureWidthRatio || 0.22;
            const minW = Math.max(0.08, 48 / (rect.width || 1));
            const wRatio = Math.max(minW, Math.min(0.95, targetWR));

            const sigW = wRatio * rect.width;
            const sigH = (sigW / aspect);
            const hRatio = sigH / (rect.height || 1);

            const clickX = e.clientX - rect.left - sigW / 2;
            const clickY = e.clientY - rect.top - sigH / 2;
            const clickLeft = Math.max(0, Math.min(1.0 - wRatio, clickX / (rect.width || 1)));
            const clickTop = Math.max(0, Math.min(1.0 - hRatio, clickY / (rect.height || 1)));

            snapshotPageLayers(page);
            page.layers.push({
                type: 'signature',
                id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                text: sig.text,
                fontFamily: sig.fontFamily,
                color: sig.color,
                dataUrl: sig.dataUrl,
                leftRatio: clickLeft,
                topRatio: clickTop,
                widthRatio: wRatio,
                heightRatio: hRatio
            });

            hideGhost();
            const cursorBtn = document.getElementById('ann-tool-cursor');
            if (cursorBtn) {
                cursorBtn.click();
            } else {
                setAppMode('select');
            }

            renderCardCanvas(page);
        } else if (state.mode === 'date') {
            if (e.target.closest('.ann-marker, .signature-rect')) return;
            e.stopPropagation();
            const rect = canvas.getBoundingClientRect();
            const xR = (e.clientX - rect.left) / rect.width;
            const yR = (e.clientY - rect.top) / rect.height;

            const ann = {
                type: 'annotation',
                id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                text: formatDate(state.dateFormat),
                xRatio: Math.max(0, Math.min(0.95, xR)),
                yRatio: Math.max(0, Math.min(0.95, yR)),
                color: state.dateColor,
                fontSize: state.dateSize,
                fontFamily: state.dateFont,
                bold: state.dateBold
            };

            snapshotPageLayers(page);
            page.layers.push(ann);

            hideGhost();
            const cursorBtn = document.getElementById('ann-tool-cursor');
            if (cursorBtn) {
                cursorBtn.click();
            } else {
                setAppMode('select');
            }

            renderCardCanvas(page);

            const cardEl = document.getElementById(page.id);
            if (cardEl) {
                const markers = cardEl.querySelectorAll('.ann-marker');
                const lastMarker = markers[markers.length - 1];
                if (lastMarker) {
                    selectLayer(page, ann, lastMarker);
                }
            }
        }
    });

    // 4. Drawing / tool mousedown dispatchers
    wrap.addEventListener('mousedown', (e) => {
        if (e.target.closest('.crop-rect') || e.target.closest('.overlay-rect') || e.target.closest('.ann-edit-box') || e.target.closest('.whiteout-rect') || e.target.closest('.whiteout-rect-interactive') || e.target.closest('.pdf-form-field-creating')) return;
        if (state.mode === 'crop') {
            e.preventDefault();
            startCrop(e, wrap, page);
        } else if (state.mode === 'whiteout') {
            e.preventDefault();
            startWhiteout(e, wrap, page);
        } else if (state.mode === 'field-form-create') {
            e.preventDefault();
            startCreateFormField(e, wrap, page);
        } else if (state.mode === 'line') {
            e.preventDefault();
            startDrawLine(e, wrap, page);
        }
    });
}
