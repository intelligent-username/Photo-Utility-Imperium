// ===========================================
//  pdfCanvas.js — Facade API entry module
// ===========================================

import {
    getState,
    cycleViewMode as stateCycleViewMode,
    setAppMode,
    resetState as stateResetState,
    updateStatusBar
} from './pdfCanvas/pdfState.js';

import {
    renderCardCanvas as renderCardCanvasCore,
    reRenderCanvases as reRenderCanvasesCore,
    loadFiles as loadFilesCore
} from './pdfCanvas/pdfRender.js';

import {
    formatDate,
    generateSignatureDataUrl,
    saveSignatureStamp,
    removeSignatureStamp,
    loadSavedSignatures
} from './pdfCanvas/pdfAnnotations.js';

import {
    syncGrid,
    commitActivePlacement,
    deleteSelectedLayer,
    deselectAllLayers,
    selectedLayerInfo,
    getSelectedLayerInfo
} from './pdfCanvas/pdfCardBuilder.js';

import { openRemovePagesModal } from './pdfCanvas/pdfRemovePages.js';

import { performUndo as performUndoCore, performRedo as performRedoCore } from './pdfCanvas/pdfHistory.js';

export {
    getState,
    setAppMode,
    updateStatusBar,
    formatDate,
    generateSignatureDataUrl,
    saveSignatureStamp,
    removeSignatureStamp,
    loadSavedSignatures,
    syncGrid,
    commitActivePlacement,
    deleteSelectedLayer,
    deselectAllLayers,
    selectedLayerInfo,
    getSelectedLayerInfo,
    openRemovePagesModal
};

export function renderCardCanvas(page) {
    return renderCardCanvasCore(page);
}

function reRenderCanvases() {
    return reRenderCanvasesCore();
}

export function cycleViewMode() {
    return stateCycleViewMode(reRenderCanvases);
}

export function resetState() {
    return stateResetState();
}

export function loadFiles(fileList) {
    return loadFilesCore(fileList);
}

export function performUndo() {
    return performUndoCore(syncGrid);
}

export function performRedo() {
    return performRedoCore(syncGrid);
}
