// ===========================================
//  pdfCardBuilder.js — Page card DOM generation, grid sync & facade
// ===========================================

import { getState, createPageObject } from './pdfState.js';
import { removeOverlay } from './pdfCropOverlay.js';
import { renderCardCanvas } from './pdfRender.js';
import { snapshotPagesOrder } from './pdfHistory.js';
import { initGhostPreview, deselectAllLayers } from './pdfLayerSelection.js';
import { attachCardEventListeners } from './pdfCardEvents.js';

// ── Re-exports for backwards compatibility ──────────────────────────────────
export {
    lastGhostPlacement,
    selectedLayerInfo,
    getSelectedLayerInfo,
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
    delBtn.className = 'page-action-btn';
    delBtn.innerHTML = '&times;';
    delBtn.title = 'Remove page';
    delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pageIdx = state.pages.indexOf(page);
        if (pageIdx !== -1) {
            if (state.pages.length <= 1) {
                alert('Cannot remove the only remaining page in the document.');
                return;
            }
            snapshotPagesOrder();
            deselectAllLayers();
            if (state.overlaySource && state.overlaySource === page) {
                state.overlaySource = null;
            }
            state.pages.splice(pageIdx, 1);
            syncGrid();
        }
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
    attachCardEventListeners(card, wrap, canvas, page, syncGrid);
    initGhostPreview();

    return card;
}
