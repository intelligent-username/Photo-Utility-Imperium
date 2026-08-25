// ===========================================
//  pdfHistory.js — In-memory undo / redo stacks
// ===========================================

import { getState } from './pdfState.js';
import { renderCardCanvas } from './pdfRender.js';

export const MAX_UNDO = 50;

// ─── Helpers ────────────────────────────────────────────────────────────────

function cloneLayers(layers) {
    return (layers || []).map(l => ({ ...l }));
}

function cloneFormFields(fields) {
    return (fields || []).map(f => ({ ...f }));
}

/**
 * Take a "forward" snapshot of the current state for the given entry type.
 * Used by performUndo to save what it's about to overwrite onto the redoStack,
 * and by performRedo to save what it's about to overwrite back onto the undoStack.
 */
function currentSnapshot(state, entry) {
    if (entry.type === 'page_layers') {
        const page = state.pages.find(p => p.id === entry.pageId);
        return page ? { ...entry, snapshot: cloneLayers(page.layers) } : null;
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
        return { ...entry, snapshot: state.pages.map(p => ({ id: p.id, excluded: p.excluded })) };
    }
    if (entry.type === 'page_excluded') {
        const page = state.pages.find(p => p.id === entry.pageId);
        return page ? { ...entry, snapshot: page.excluded } : null;
    }
    return null;
}

function pushUndo(entry) {
    const state = getState();
    // Any new action clears the redo stack
    state.redoStack = [];
    state.undoStack.push(entry);
    if (state.undoStack.length > MAX_UNDO) {
        state.undoStack.shift();
    }
}

// ─── Apply an entry's snapshot to state ──────────────────────────────────────

function applyEntry(state, entry, syncGridCb) {
    if (entry.type === 'page_layers') {
        const page = state.pages.find(p => p.id === entry.pageId);
        if (!page) return;
        page.layers = cloneLayers(entry.snapshot);
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

// ─── Snapshot APIs ──────────────────────────────────────────────────────────

/** Call BEFORE mutating page.layers */
export function snapshotPageLayers(page) {
    pushUndo({ type: 'page_layers', pageId: page.id, snapshot: cloneLayers(page.layers) });
}

/** Call BEFORE mutating page.formFields (or both formFields + layers) */
export function snapshotPageFormFields(page) {
    pushUndo({
        type: 'page_form_fields',
        pageId: page.id,
        snapshot: {
            formFields: cloneFormFields(page.formFields),
            layers: cloneLayers(page.layers)
        }
    });
}

/** Call BEFORE deleting all form fields across all pages */
export function snapshotAllFormFields() {
    const state = getState();
    pushUndo({
        type: 'all_form_fields',
        snapshot: state.pages.map(p => ({
            id: p.id,
            formFields: cloneFormFields(p.formFields),
            layers: cloneLayers(p.layers)
        }))
    });
}

/** Call BEFORE mutating page.cropBox */
export function snapshotPageCrop(page) {
    pushUndo({ type: 'page_crop', pageId: page.id, snapshot: page.cropBox ? { ...page.cropBox } : null });
}

/** Call BEFORE calling applyCropToAll */
export function snapshotAllCrops() {
    const state = getState();
    pushUndo({
        type: 'all_crops',
        snapshot: state.pages.map(p => ({ id: p.id, cropBox: p.cropBox ? { ...p.cropBox } : null })),
    });
}

/** Call BEFORE mutating pages order (reorder, insert blank, etc.) */
export function snapshotPagesOrder() {
    const state = getState();
    pushUndo({
        type: 'pages_order',
        snapshot: state.pages.map(p => ({ id: p.id, excluded: p.excluded })),
    });
}

/** Call BEFORE toggling page.excluded */
export function snapshotPageExcluded(page) {
    pushUndo({ type: 'page_excluded', pageId: page.id, snapshot: page.excluded });
}

// ─── Undo / Redo ────────────────────────────────────────────────────────────

/** Ctrl+Z: undo last action */
export function performUndo(syncGridCb) {
    const state = getState();
    if (state.undoStack.length === 0) return;

    const entry = state.undoStack.pop();

    // Save current state to redoStack so we can redo
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

    // Save current state back to undoStack (without clearing redoStack this time)
    const backward = currentSnapshot(state, entry);
    if (backward) {
        state.undoStack.push(backward);
        if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
    }

    applyEntry(state, entry, syncGridCb);
}
