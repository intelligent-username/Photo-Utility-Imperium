// ===========================================
//  pdfHistory.js — In-memory undo stack
// ===========================================

import { getState } from './pdfState.js';
import { renderCardCanvas } from './pdfRender.js';

export const MAX_UNDO = 50;

function cloneLayers(layers) {
    return layers.map(l => ({ ...l }));
}

function pushEntry(entry) {
    const state = getState();
    state.undoStack.push(entry);
    if (state.undoStack.length > MAX_UNDO) {
        state.undoStack.shift();
    }
}

/** Call BEFORE mutating page.layers */
export function snapshotPageLayers(page) {
    pushEntry({
        type: 'page_layers',
        pageId: page.id,
        snapshot: cloneLayers(page.layers),
    });
}

/** Call BEFORE mutating page.cropBox */
export function snapshotPageCrop(page) {
    pushEntry({
        type: 'page_crop',
        pageId: page.id,
        snapshot: page.cropBox ? { ...page.cropBox } : null,
    });
}

/** Call BEFORE calling applyCropToAll */
export function snapshotAllCrops() {
    const state = getState();
    pushEntry({
        type: 'all_crops',
        snapshot: state.pages.map(p => ({ id: p.id, cropBox: p.cropBox ? { ...p.cropBox } : null })),
    });
}

/** Call BEFORE mutating pages order (reorder, insert blank, etc.) */
export function snapshotPagesOrder() {
    const state = getState();
    pushEntry({
        type: 'pages_order',
        snapshot: state.pages.map(p => ({
            id: p.id,
            excluded: p.excluded,
        })),
    });
}

/** Call BEFORE toggling page.excluded */
export function snapshotPageExcluded(page) {
    pushEntry({
        type: 'page_excluded',
        pageId: page.id,
        snapshot: page.excluded,
    });
}

/**
 * Pop and restore the top undo entry.
 * @param {Function} syncGridCb — syncGrid() from pdfCardBuilder (passed to avoid circular import)
 */
export function performUndo(syncGridCb) {
    const state = getState();
    if (state.undoStack.length === 0) return;

    const entry = state.undoStack.pop();

    if (entry.type === 'page_layers') {
        const page = state.pages.find(p => p.id === entry.pageId);
        if (!page) return;
        page.layers = entry.snapshot;
        renderCardCanvas(page);

    } else if (entry.type === 'page_crop') {
        const page = state.pages.find(p => p.id === entry.pageId);
        if (!page) return;
        page.cropBox = entry.snapshot;
        renderCardCanvas(page);

    } else if (entry.type === 'all_crops') {
        entry.snapshot.forEach(({ id, cropBox }) => {
            const page = state.pages.find(p => p.id === id);
            if (page) {
                page.cropBox = cropBox;
                renderCardCanvas(page);
            }
        });

    } else if (entry.type === 'pages_order') {
        const orderedPages = entry.snapshot
            .map(({ id, excluded }) => {
                const page = state.pages.find(p => p.id === id);
                if (page) page.excluded = excluded;
                return page;
            })
            .filter(Boolean);
        state.pages = orderedPages;
        if (typeof syncGridCb === 'function') syncGridCb();

    } else if (entry.type === 'page_excluded') {
        const page = state.pages.find(p => p.id === entry.pageId);
        if (!page) return;
        page.excluded = entry.snapshot;
        const card = document.getElementById(page.id);
        if (card) {
            card.classList.toggle('excluded', page.excluded);
            const btn = card.querySelector('.page-action-btn');
            if (btn) {
                btn.title = page.excluded ? 'Restore page' : 'Exclude page';
                btn.classList.toggle('restore-btn', page.excluded);
            }
        }
    }
}
