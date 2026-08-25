// ===========================================
//  pdfCanvas.js — Facade API entry module
// ===========================================

import {
    getState,
    setViewMode as stateSetViewMode,
    cycleViewMode as stateCycleViewMode,
    createPageObject,
    setAppMode,
    resetState as stateResetState,
    updateStatusBar,
    updateModeBanner
} from './pdfCanvas/pdfState.js';

import {
    renderCardCanvas as renderCardCanvasCore,
    reRenderCanvases as reRenderCanvasesCore,
    loadFiles as loadFilesCore
} from './pdfCanvas/pdfRender.js';

import {
    openAnnotationInput,
    formatDate,
    generateSignatureDataUrl,
    saveSignatureStamp,
    removeSignatureStamp,
    loadSavedSignatures
} from './pdfCanvas/pdfAnnotations.js';

import {
    applyCropToAll as applyCropToAllCore,
    removeOverlay as removeOverlayCore,
    addCropControls,
    syncRectToPercentage
} from './pdfCanvas/pdfCropOverlay.js';

import {
    buildCard,
    syncGrid,
    renderCardLayers,
    commitActivePlacement,
    deleteSelectedLayer,
    selectLayer,
    deselectAllLayers
} from './pdfCanvas/pdfCardBuilder.js';

export {
    getState,
    createPageObject,
    setAppMode,
    updateStatusBar,
    updateModeBanner,
    openAnnotationInput,
    formatDate,
    generateSignatureDataUrl,
    saveSignatureStamp,
    removeSignatureStamp,
    loadSavedSignatures,
    buildCard,
    syncGrid,
    addCropControls,
    syncRectToPercentage,
    renderCardLayers,
    commitActivePlacement,
    deleteSelectedLayer,
    selectLayer,
    deselectAllLayers
};

export function renderCardCanvas(page) {
    return renderCardCanvasCore(page);
}

export function reRenderCanvases() {
    return reRenderCanvasesCore();
}

export function setViewMode(viewMode) {
    return stateSetViewMode(viewMode, reRenderCanvases);
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

export function applyCropToAll(sourcePage) {
    return applyCropToAllCore(sourcePage);
}

export function removeOverlay(targetPage) {
    return removeOverlayCore(targetPage);
}
