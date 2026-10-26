// ===========================================
//  pdfKeyboardShortcuts.js — Hotkey handlers
// ===========================================

import {
    getState,
    performUndo,
    performRedo,
    deleteSelectedLayer,
    deselectAllLayers,
    commitActivePlacement
} from '../pdfCanvas.js';

export function setupKeyboardShortcuts(actions) {
    const { toggleMode, selectAnnSubTool, clearModes, getDateDropdownControls } = actions;
    const state = getState();

    let rPressCount = 0;
    let lastRPressTime = 0;

    document.addEventListener('keydown', (e) => {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select' || document.activeElement.isContentEditable) {
            return;
        }

        const key = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && key === 'z') {
            e.preventDefault();
            performUndo();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && key === 'y') {
            e.preventDefault();
            performRedo();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && key === 'b') {
            e.preventDefault();
            const boldToggle = document.getElementById('ann-bold-toggle');
            if (boldToggle) boldToggle.click();
            return;
        }
        if (key === 'r') {
            const now = Date.now();
            if (now - lastRPressTime < 800) {
                rPressCount++;
            } else {
                rPressCount = 1;
            }
            lastRPressTime = now;

            if (rPressCount >= 3) {
                rPressCount = 0;
                deselectAllLayers();
                commitActivePlacement();
                const restoreBtn = document.getElementById('restore-all-btn');
                if (restoreBtn) restoreBtn.click();
            }
            return;
        } else {
            rPressCount = 0;
        }

        if (key === 'delete' || key === 'backspace') {
            if (deleteSelectedLayer()) {
                e.preventDefault();
                return;
            }
        } else if (key === 'escape') {
            deselectAllLayers();
            const annBar = document.getElementById('pdf-annotation-bar');
            const ffBar = document.getElementById('pdf-field-form-bar');
            if (annBar && !annBar.classList.contains('hidden')) {
                commitActivePlacement();
                selectAnnSubTool('cursor');
            } else if (ffBar && !ffBar.classList.contains('hidden')) {
                clearModes();
            } else {
                clearModes();
            }
        } else if (key === 'a') {
            deselectAllLayers();
            commitActivePlacement();
            const annotateBtn = document.getElementById('annotate-btn');
            toggleMode(annotateBtn, 'annotate');
        } else if (key === 'c') {
            deselectAllLayers();
            commitActivePlacement();
            const cropBtn = document.getElementById('crop-btn');
            toggleMode(cropBtn, 'crop');
        } else if (key === 'o') {
            deselectAllLayers();
            commitActivePlacement();
            const overlayBtn = document.getElementById('overlay-btn');
            toggleMode(overlayBtn, 'overlay');
        } else if (key === 'w') {
            deselectAllLayers();
            commitActivePlacement();
            const whiteoutBtn = document.getElementById('whiteout-btn');
            toggleMode(whiteoutBtn, 'whiteout');
        } else if (key === 'f') {
            deselectAllLayers();
            commitActivePlacement();
            const fieldFormBtn = document.getElementById('field-form-btn');
            toggleMode(fieldFormBtn, 'field-form');
        } else if (key === 'v') {
            const viewModeBtn = document.getElementById('view-mode-btn');
            if (viewModeBtn) viewModeBtn.click();
        } else if (key === 't') {
            deselectAllLayers();
            commitActivePlacement();
            activateAnnSubToolMode('text', selectAnnSubTool);
        } else if (key === 'l') {
            deselectAllLayers();
            commitActivePlacement();
            activateAnnSubToolMode('line', selectAnnSubTool);
        } else if (key === 's') {
            deselectAllLayers();
            commitActivePlacement();
            if (state.signatures && state.signatures.length > 0) {
                state.activeSignature = state.signatures[0];
            }
            activateAnnSubToolMode('sign', selectAnnSubTool, { openMenu: false });
        } else if (key === 'd') {
            deselectAllLayers();
            commitActivePlacement();
            if (state.dateFormats && state.dateFormats.length > 0) {
                state.dateFormat = state.dateFormats[0];
                const dateDropdownControls = getDateDropdownControls ? getDateDropdownControls() : null;
                if (dateDropdownControls) {
                    dateDropdownControls.updateDatePreview();
                    dateDropdownControls.renderDateFormatList();
                }
            }
            activateAnnSubToolMode('date', selectAnnSubTool, { openMenu: false });
        }
    });
}

function activateAnnSubToolMode(subTool, selectAnnSubTool, options = {}) {
    const annotateBtn = document.getElementById('annotate-btn');
    const cropBtn = document.getElementById('crop-btn');
    const overlayBtn = document.getElementById('overlay-btn');
    const whiteoutBtn = document.getElementById('whiteout-btn');
    const fieldFormBtn = document.getElementById('field-form-btn');
    const annBar = document.getElementById('pdf-annotation-bar');
    const ffBar = document.getElementById('pdf-field-form-bar');

    if (ffBar) ffBar.classList.add('hidden');
    if (fieldFormBtn) fieldFormBtn.classList.remove('active');
    if (cropBtn) cropBtn.classList.remove('active');
    if (overlayBtn) overlayBtn.classList.remove('active');
    if (whiteoutBtn) whiteoutBtn.classList.remove('active');
    if (annotateBtn) annotateBtn.classList.add('active');
    if (annBar) annBar.classList.remove('hidden');

    selectAnnSubTool(subTool, options);
}
