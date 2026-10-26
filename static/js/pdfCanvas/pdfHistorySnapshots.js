// ===========================================
//  pdfHistorySnapshots.js — State cloning helpers and snapshot dispatch functions
// ===========================================

import { getState } from './pdfState.js';

export const MAX_UNDO = 50;

export function cloneLayers(layers) {
    return (layers || []).map(l => ({
        ...l,
        runs: l.runs ? l.runs.map(r => ({ ...r })) : undefined
    }));
}

export function cloneTextEdits(edits) {
    if (!edits) return {};
    const copy = {};
    for (const k of Object.keys(edits)) {
        copy[k] = {
            ...edits[k],
            runs: edits[k].runs ? edits[k].runs.map(r => ({ ...r })) : undefined
        };
    }
    return copy;
}

export function cloneFormFields(fields) {
    return (fields || []).map(f => ({ ...f }));
}

export function pushUndo(entry) {
    const state = getState();
    state.redoStack = [];
    state.undoStack.push(entry);
    if (state.undoStack.length > MAX_UNDO) {
        state.undoStack.shift();
    }
}

/** Call BEFORE mutating page.layers or page.textEdits */
export function snapshotPageLayers(page) {
    if (!page) return;
    pushUndo({
        type: 'page_layers',
        pageId: page.id,
        snapshot: {
            layers: cloneLayers(page.layers),
            textEdits: cloneTextEdits(page.textEdits)
        }
    });
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

/** Call BEFORE mutating pages order (reorder, insert blank, remove pages, etc.) */
export function snapshotPagesOrder() {
    const state = getState();
    pushUndo({
        type: 'pages_order',
        snapshot: state.pages.slice(),
    });
}

/** Call BEFORE toggling page.excluded */
export function snapshotPageExcluded(page) {
    pushUndo({ type: 'page_excluded', pageId: page.id, snapshot: page.excluded });
}

/** Call BEFORE standardizing sizes (adds maxed rect) */
export function snapshotStandardize() {
    const state = getState();
    pushUndo({
        type: 'standardize',
        snapshot: state.pages.map(p => ({ id: p.id, standardized: p.standardized ? { ...p.standardized } : null, aspectRatio: p.aspectRatio })),
    });
}
