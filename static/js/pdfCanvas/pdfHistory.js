// ===========================================
//  pdfHistory.js — In-memory undo / redo engine & history entry application
// ===========================================

import { getState } from './pdfState.js';
import { renderCardCanvas } from './pdfRender.js';
import {
    MAX_UNDO,
    cloneLayers,
    cloneTextEdits,
    cloneFormFields,
    snapshotPageLayers,
    snapshotPageFormFields,
    snapshotAllFormFields,
    snapshotPageCrop,
    snapshotAllCrops,
    snapshotPagesOrder,
    snapshotPageExcluded,
    snapshotStandardize
} from './pdfHistorySnapshots.js';

export {
    MAX_UNDO,
    snapshotPageLayers,
    snapshotPageFormFields,
    snapshotAllFormFields,
    snapshotPageCrop,
    snapshotAllCrops,
    snapshotPagesOrder,
    snapshotPageExcluded,
    snapshotStandardize
};

/**
 * Take a "forward" snapshot of the current state for the given entry type.
 */
function currentSnapshot(state, entry) {
    if (entry.type === 'standardize') {
        return { ...entry, snapshot: state.pages.map(p => ({ id: p.id, standardized: p.standardized ? { ...p.standardized } : null, aspectRatio: p.aspectRatio, _cacheCanvas: null, _cacheWidth: null })) };
    }
    if (entry.type === 'page_layers') {
        const page = state.pages.find(p => p.id === entry.pageId);
        return page ? {
            ...entry,
            snapshot: {
                layers: cloneLayers(page.layers),
                textEdits: cloneTextEdits(page.textEdits)
            }
        } : null;
    }
    if (entry.type === 'page_form_fields') {
        const page = state.pages.find(p => p.id === entry.pageId);
        return page ? {
            ...entry,
            snapshot: {
                formFields: cloneFormFields(page.formFields),
                layers: cloneLayers(page.layers)
            }
        } : null;
    }
    if (entry.type === 'all_form_fields') {
        return {
            ...entry,
            snapshot: state.pages.map(p => ({
                id: p.id,
                formFields: cloneFormFields(p.formFields),
                layers: cloneLayers(p.layers)
            }))
        };
    }
    if (entry.type === 'page_crop') {
        const page = state.pages.find(p => p.id === entry.pageId);
        return page ? { ...entry, snapshot: page.cropBox ? { ...page.cropBox } : null } : null;
    }
    if (entry.type === 'all_crops') {
        return { ...entry, snapshot: state.pages.map(p => ({ id: p.id, cropBox: p.cropBox ? { ...p.cropBox } : null })) };
    }
    if (entry.type === 'pages_order') {
        return { ...entry, snapshot: state.pages.slice() };
    }
    if (entry.type === 'page_excluded') {
        const page = state.pages.find(p => p.id === entry.pageId);
        return page ? { ...entry, snapshot: page.excluded } : null;
    }
    return null;
}

/**
 * Applies a snapshot entry to mutate state back to that point in time.
 */
function applyEntry(state, entry, syncGridCb) {
    if (entry.type === 'standardize') {
        entry.snapshot.forEach(({ id, standardized, aspectRatio }) => {
            const page = state.pages.find(p => p.id === id);
            if (page) {
                if (standardized) page.standardized = { ...standardized };
                else delete page.standardized;
                if (aspectRatio !== undefined) {
                    if (aspectRatio === null || aspectRatio === undefined) delete page.aspectRatio;
                    else page.aspectRatio = aspectRatio;
                }
                page._cacheCanvas = null;
                page._cacheWidth = null;
                const card = document.getElementById(page.id);
                if (card) renderCardCanvas(page);
                else renderCardCanvas(page);
            }
        });
        if (typeof syncGridCb === 'function') syncGridCb();
        else {
            state.pages.forEach(p => renderCardCanvas(p));
        }
    } else if (entry.type === 'page_layers') {
        const page = state.pages.find(p => p.id === entry.pageId);
        if (!page) return;
        if (Array.isArray(entry.snapshot)) {
            page.layers = cloneLayers(entry.snapshot);
        } else if (entry.snapshot && typeof entry.snapshot === 'object') {
            page.layers = cloneLayers(entry.snapshot.layers);
            page.textEdits = cloneTextEdits(entry.snapshot.textEdits);
        }
        renderCardCanvas(page);

    } else if (entry.type === 'page_form_fields') {
        const page = state.pages.find(p => p.id === entry.pageId);
        if (!page) return;
        page.formFields = cloneFormFields(entry.snapshot.formFields);
        page.layers = cloneLayers(entry.snapshot.layers);
        renderCardCanvas(page);

    } else if (entry.type === 'all_form_fields') {
        entry.snapshot.forEach(({ id, formFields, layers }) => {
            const page = state.pages.find(p => p.id === id);
            if (page) {
                page.formFields = cloneFormFields(formFields);
                page.layers = cloneLayers(layers);
                renderCardCanvas(page);
            }
        });

    } else if (entry.type === 'page_crop') {
        const page = state.pages.find(p => p.id === entry.pageId);
        if (!page) return;
        page.cropBox = entry.snapshot ? { ...entry.snapshot } : null;
        renderCardCanvas(page);

    } else if (entry.type === 'all_crops') {
        entry.snapshot.forEach(({ id, cropBox }) => {
            const page = state.pages.find(p => p.id === id);
            if (page) {
                page.cropBox = cropBox ? { ...cropBox } : null;
                renderCardCanvas(page);
            }
        });

    } else if (entry.type === 'pages_order') {
        if (Array.isArray(entry.snapshot)) {
            if (entry.snapshot.length > 0 && entry.snapshot[0] && entry.snapshot[0].id && !entry.snapshot[0].fileName && entry.snapshot[0].excluded !== undefined) {
                const orderedPages = entry.snapshot
                    .map(({ id, excluded }) => {
                        const page = state.pages.find(p => p.id === id);
                        if (page) page.excluded = excluded;
                        return page;
                    })
                    .filter(Boolean);
                state.pages = orderedPages;
            } else {
                state.pages = entry.snapshot.slice();
            }
        }
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

/** Ctrl+Z: undo last action */
export function performUndo(syncGridCb) {
    const state = getState();
    if (state.undoStack.length === 0) return;

    const entry = state.undoStack.pop();
    const forward = currentSnapshot(state, entry);
    if (forward) {
        state.redoStack.push(forward);
        if (state.redoStack.length > MAX_UNDO) state.redoStack.shift();
    }

    applyEntry(state, entry, syncGridCb);
}

/** Ctrl+Y: redo last undone action */
export function performRedo(syncGridCb) {
    const state = getState();
    if (state.redoStack.length === 0) return;

    const entry = state.redoStack.pop();
    const backward = currentSnapshot(state, entry);
    if (backward) {
        state.undoStack.push(backward);
        if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
    }

    applyEntry(state, entry, syncGridCb);
}
