// ===========================================
//  pdfToolbarModes.js — Toolbar mode switching & subtool state
// ===========================================

import {
    getState,
    setAppMode,
    deselectAllLayers,
    commitActivePlacement,
    openRemovePagesModal
} from '../pdfCanvas.js';

export function setupToolbarModes(options = {}) {
    const { selectFFSubTool, getDateDropdownControls } = options;
    const state = getState();

    const annotateBtn = document.getElementById('annotate-btn');
    const cropBtn = document.getElementById('crop-btn');
    const overlayBtn = document.getElementById('overlay-btn');
    const whiteoutBtn = document.getElementById('whiteout-btn');
    const removeBtn = document.getElementById('remove-pages-btn');
    const fieldFormBtn = document.getElementById('field-form-btn');

    const annBar = document.getElementById('pdf-annotation-bar');
    const ffBar = document.getElementById('pdf-field-form-bar');
    const annBarControls = document.getElementById('ann-bar-controls');

    const annToolCursor = document.getElementById('ann-tool-cursor');
    const annToolText = document.getElementById('ann-tool-text');
    const annToolLine = document.getElementById('ann-tool-line');
    const annToolSign = document.getElementById('ann-tool-sign');
    const annToolDate = document.getElementById('ann-tool-date');
    const annToolDateCaret = document.getElementById('ann-tool-date-caret');

    function clearModes() {
        if (annotateBtn) annotateBtn.classList.remove('active');
        if (cropBtn) cropBtn.classList.remove('active');
        if (overlayBtn) overlayBtn.classList.remove('active');
        if (whiteoutBtn) whiteoutBtn.classList.remove('active');
        if (fieldFormBtn) fieldFormBtn.classList.remove('active');
        if (annBar) annBar.classList.add('hidden');
        if (ffBar) ffBar.classList.add('hidden');
        setAppMode('select');
    }

    function selectAnnSubTool(subTool, subOptions = {}) {
        const signMenu = document.getElementById('sign-dropdown-menu');
        const dateMenu = document.getElementById('date-dropdown-menu');
        const textSizeStepper = document.getElementById('ann-text-size-stepper');
        const lineThicknessStepper = document.getElementById('ann-line-thickness-stepper');
        const dateDropdownControls = getDateDropdownControls ? getDateDropdownControls() : null;

        if (subTool === 'cursor') {
            if (annToolCursor) annToolCursor.classList.add('active');
            if (annToolText) annToolText.classList.remove('active');
            if (annToolLine) annToolLine.classList.remove('active');
            if (annToolSign) annToolSign.classList.remove('active');
            if (annToolDate) annToolDate.classList.remove('active');
            if (annBarControls) annBarControls.classList.add('hidden');
            if (signMenu) signMenu.classList.add('hidden');
            if (dateMenu) dateMenu.classList.add('hidden');
            setAppMode('select');
        } else if (subTool === 'text') {
            if (annToolText) annToolText.classList.add('active');
            if (annToolCursor) annToolCursor.classList.remove('active');
            if (annToolLine) annToolLine.classList.remove('active');
            if (annToolSign) annToolSign.classList.remove('active');
            if (annToolDate) annToolDate.classList.remove('active');
            if (annBarControls) annBarControls.classList.remove('hidden');
            if (textSizeStepper) textSizeStepper.classList.remove('hidden');
            if (lineThicknessStepper) lineThicknessStepper.classList.add('hidden');
            if (signMenu) signMenu.classList.add('hidden');
            if (dateMenu) dateMenu.classList.add('hidden');
            setAppMode('annotate');
        } else if (subTool === 'line') {
            if (annToolLine) annToolLine.classList.add('active');
            if (annToolCursor) annToolCursor.classList.remove('active');
            if (annToolText) annToolText.classList.remove('active');
            if (annToolSign) annToolSign.classList.remove('active');
            if (annToolDate) annToolDate.classList.remove('active');
            if (annBarControls) annBarControls.classList.remove('hidden');
            if (textSizeStepper) textSizeStepper.classList.add('hidden');
            if (lineThicknessStepper) lineThicknessStepper.classList.remove('hidden');
            if (signMenu) signMenu.classList.add('hidden');
            if (dateMenu) dateMenu.classList.add('hidden');
            setAppMode('line');
        } else if (subTool === 'sign') {
            if (annToolSign) annToolSign.classList.add('active');
            if (annToolCursor) annToolCursor.classList.remove('active');
            if (annToolText) annToolText.classList.remove('active');
            if (annToolLine) annToolLine.classList.remove('active');
            if (annToolDate) annToolDate.classList.remove('active');
            if (annBarControls) annBarControls.classList.add('hidden');
            if (dateMenu) dateMenu.classList.add('hidden');
            if (subOptions.toggleMenu) {
                if (signMenu) signMenu.classList.toggle('hidden');
            } else if (subOptions.openMenu) {
                if (signMenu) signMenu.classList.remove('hidden');
            } else {
                if (signMenu) signMenu.classList.add('hidden');
            }
            setAppMode('signature');
        } else if (subTool === 'date') {
            if (annToolDate) annToolDate.classList.add('active');
            if (annToolCursor) annToolCursor.classList.remove('active');
            if (annToolText) annToolText.classList.remove('active');
            if (annToolLine) annToolLine.classList.remove('active');
            if (annToolSign) annToolSign.classList.remove('active');
            if (annBarControls) annBarControls.classList.add('hidden');
            if (signMenu) signMenu.classList.add('hidden');
            if (subOptions.toggleMenu) {
                if (dateMenu) {
                    const opening = dateMenu.classList.contains('hidden');
                    dateMenu.classList.toggle('hidden');
                    if (opening && dateDropdownControls) {
                        dateDropdownControls.updateDatePreview();
                        dateDropdownControls.renderDateFormatList();
                    }
                }
            } else if (subOptions.openMenu) {
                if (dateMenu) {
                    dateMenu.classList.remove('hidden');
                    if (dateDropdownControls) {
                        dateDropdownControls.updateDatePreview();
                        dateDropdownControls.renderDateFormatList();
                    }
                }
            } else {
                if (dateMenu) dateMenu.classList.add('hidden');
            }
            setAppMode('date');
        }
    }

    function toggleMode(btn, modeName) {
        const isCurrentFieldForm = state.mode && state.mode.startsWith('field-form');
        const isCurrentAnnotate = state.mode === 'annotate' || state.mode === 'signature' || state.mode === 'date' || (annBar && !annBar.classList.contains('hidden'));

        if ((modeName === 'field-form' && isCurrentFieldForm) || (modeName === 'annotate' && isCurrentAnnotate && state.mode !== 'select') || (state.mode === modeName)) {
            clearModes();
            return;
        }
        if (annotateBtn) annotateBtn.classList.remove('active');
        if (cropBtn) cropBtn.classList.remove('active');
        if (overlayBtn) overlayBtn.classList.remove('active');
        if (whiteoutBtn) whiteoutBtn.classList.remove('active');
        if (fieldFormBtn) fieldFormBtn.classList.remove('active');

        if (btn) btn.classList.add('active');
        if (modeName === 'annotate') {
            if (annBar) annBar.classList.remove('hidden');
            if (ffBar) ffBar.classList.add('hidden');
            selectAnnSubTool('cursor');
        } else if (modeName === 'field-form') {
            if (ffBar) ffBar.classList.remove('hidden');
            if (annBar) annBar.classList.add('hidden');
            if (selectFFSubTool) selectFFSubTool('edit');
        } else {
            if (annBar) annBar.classList.add('hidden');
            if (ffBar) ffBar.classList.add('hidden');
            setAppMode(modeName);
        }
    }

    if (annotateBtn) annotateBtn.addEventListener('click', () => toggleMode(annotateBtn, 'annotate'));
    if (cropBtn) cropBtn.addEventListener('click', () => toggleMode(cropBtn, 'crop'));
    if (overlayBtn) overlayBtn.addEventListener('click', () => toggleMode(overlayBtn, 'overlay'));
    if (whiteoutBtn) whiteoutBtn.addEventListener('click', () => toggleMode(whiteoutBtn, 'whiteout'));
    if (fieldFormBtn) fieldFormBtn.addEventListener('click', () => toggleMode(fieldFormBtn, 'field-form'));

    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            deselectAllLayers();
            commitActivePlacement();
            openRemovePagesModal();
        });
    }

    if (annToolCursor) annToolCursor.addEventListener('click', () => selectAnnSubTool('cursor'));
    if (annToolText) annToolText.addEventListener('click', () => selectAnnSubTool('text'));
    if (annToolLine) annToolLine.addEventListener('click', () => selectAnnSubTool('line'));

    if (annToolSign) {
        annToolSign.addEventListener('click', (e) => {
            e.stopPropagation();
            selectAnnSubTool('sign', { toggleMenu: true });
        });
    }
    if (annToolDate) {
        annToolDate.addEventListener('click', (e) => {
            e.stopPropagation();
            selectAnnSubTool('date', { toggleMenu: true });
        });
    }
    if (annToolDateCaret) {
        annToolDateCaret.addEventListener('click', (e) => {
            e.stopPropagation();
            const dateMenu = document.getElementById('date-dropdown-menu');
            const signMenu = document.getElementById('sign-dropdown-menu');
            const dateDropdownControls = getDateDropdownControls ? getDateDropdownControls() : null;
            if (dateMenu) {
                const opening = dateMenu.classList.contains('hidden');
                dateMenu.classList.toggle('hidden');
                if (opening && dateDropdownControls) {
                    dateDropdownControls.updateDatePreview();
                    dateDropdownControls.renderDateFormatList();
                }
            }
            if (signMenu) signMenu.classList.add('hidden');
        });
    }

    return { clearModes, selectAnnSubTool, toggleMode };
}
