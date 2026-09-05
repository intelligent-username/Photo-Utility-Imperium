// ===========================================
//  pdfCardBuilder.js — Page card DOM generation, grid sync & facade
// ===========================================

import { getState, createPageObject } from './pdfState.js';
import { openAnnotationInput, startWhiteout, formatDate } from './pdfAnnotations.js';
import { startCrop, handleOverlayClick, removeOverlay } from './pdfCropOverlay.js';
import { renderCardCanvas } from './pdfRender.js';
import { snapshotPageLayers, snapshotPageExcluded, snapshotPagesOrder } from './pdfHistory.js';
import { initGhostPreview, deselectAllLayers } from './pdfLayerSelection.js';
import { startCreateFormField } from './pdfFormFieldUI.js';

// ── Re-exports for backwards compatibility ──────────────────────────────────
export {
    lastGhostPlacement,
    selectedLayerInfo,
    selectLayer,
    deselectAllLayers,
    deleteSelectedLayer,
    initGhostPreview,
    commitActivePlacement
} from './pdfLayerSelection.js';

export {
    showFieldDeleteDialog,
    confirmDeleteField,
    renderFormFieldElement,
    startCreateFormField
} from './pdfFormFieldUI.js';

export {
    renderAnnotationLayer,
    renderSignatureLayer,
    renderOverlayLayer,
    renderWhiteoutLayer,
    renderCardLayers
} from './pdfLayerRenderers.js';

// ── Page Card Helpers ───────────────────────────────────────────────────────
export function indexLabel(page) {
    const state = getState();
    const idx = state.pages.indexOf(page);
    return idx >= 0 ? `${idx + 1}` : '1';
}

export function updateOverlayBadge(card, page) {
    let badge = card.querySelector('.overlay-badge');
    if (page.overlays && page.overlays.length > 0) {
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'overlay-badge';
            card.appendChild(badge);
        }
        const state = getState();
        const srcPage = state.pages.find(p => p.id === page.overlays[0].sourceId);
        const srcIdx = srcPage ? state.pages.indexOf(srcPage) + 1 : '?';
        badge.innerHTML = `Overlay: P${srcIdx} <button type="button" class="remove-overlay-btn" title="Remove overlay">&times;</button>`;
        badge.querySelector('.remove-overlay-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            removeOverlay(page);
            updateOverlayBadge(card, page);
        });
    } else if (badge) {
        badge.remove();
    }
}

export function insertBlankAfter(targetPage) {
    const state = getState();
    const idx = state.pages.indexOf(targetPage);
    const newPage = createPageObject({
        fileName: 'Blank Page',
        isBlank: true,
        aspectRatio: targetPage.aspectRatio || (792 / 612),
    });
    snapshotPagesOrder();
    if (idx >= 0) {
        state.pages.splice(idx + 1, 0, newPage);
    } else {
        state.pages.push(newPage);
    }
    syncGrid();
}

export function syncGrid() {
    const grid = document.getElementById('pdf-page-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const state = getState();
    state.pages.forEach(page => {
        const card = buildCard(page);
        grid.appendChild(card);
        renderCardCanvas(page);
    });
}

// ── Build Page Card DOM ─────────────────────────────────────────────────────
export function buildCard(page) {
    const state = getState();
    const card = document.createElement('div');
    card.className = 'pdf-page-card';
    card.id = page.id;
    card.draggable = (state.mode === 'select');

    if (page.excluded) card.classList.add('excluded');

    const num = document.createElement('span');
    num.className = 'page-num';
    num.textContent = indexLabel(page);
    card.appendChild(num);

    const actions = document.createElement('div');
    actions.className = 'page-actions';

    const delBtn = document.createElement('button');
    delBtn.className = 'page-action-btn' + (page.excluded ? ' restore-btn' : '');
    delBtn.innerHTML = '&times;';
    delBtn.title = page.excluded ? 'Restore page' : 'Exclude page';
    delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        snapshotPageExcluded(page);
        page.excluded = !page.excluded;
        card.classList.toggle('excluded', page.excluded);
        delBtn.title = page.excluded ? 'Restore page' : 'Exclude page';
        if (page.excluded) delBtn.classList.add('restore-btn');
        else delBtn.classList.remove('restore-btn');
    });
    actions.appendChild(delBtn);
    card.appendChild(actions);

    const wrap = document.createElement('div');
    wrap.className = 'page-canvas-wrap';

    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    const src = document.createElement('div');
    src.className = 'page-source';
    src.textContent = page.fileName;
    card.appendChild(src);

    const addBlankBtn = document.createElement('button');
    addBlankBtn.className = 'add-blank-btn';
    addBlankBtn.innerHTML = '+';
    addBlankBtn.title = 'Insert blank page after this page';
    addBlankBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertBlankAfter(page);
    });
    card.appendChild(addBlankBtn);

    updateOverlayBadge(card, page);

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

    card.addEventListener('click', (e) => {
        if (state.mode === 'overlay') {
            e.stopPropagation();
            handleOverlayClick(page, card);
        }
    });

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
            const wrapRect = wrap.getBoundingClientRect();
            const canvasScale = wrapRect.width > 0 ? (wrapRect.width / 612.0) : 0.55;
            const sig = state.activeSignature;
            const targetH = 22 * canvasScale;
            const aspect = sig.aspectRatio || (sig.naturalWidth && sig.naturalHeight ? sig.naturalWidth / sig.naturalHeight : 3.0);
            const sigW = Math.max(14, targetH * aspect);
            const sigH = Math.max(9, targetH);

            const wRatio = Math.min(0.95, sigW / (rect.width || 1));
            const hRatio = Math.min(0.5, sigH / (rect.height || 1));

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
            renderCardCanvas(page);
        }
    });

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
        }
    });

    initGhostPreview();
    return card;
}
