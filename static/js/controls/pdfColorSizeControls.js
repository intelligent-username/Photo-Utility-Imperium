// ===========================================
//  pdfColorSizeControls.js — Styling toolbar controls
// ===========================================

import {
    getState,
    renderCardCanvas,
    selectedLayerInfo,
    getSelectedLayerInfo
} from '../pdfCanvas.js';

export function setupColorSizeControls() {
    const state = getState();
    const colorInput = document.getElementById('ann-color');
    const sizeInput = document.getElementById('ann-size');
    const customSwatch = document.getElementById('custom-color-swatch');
    const colorDots = document.querySelectorAll('.color-palette .color-dot');
    const sizeMinus = document.getElementById('ann-size-minus');
    const sizePlus = document.getElementById('ann-size-plus');
    const restoreBtn = document.getElementById('restore-all-btn');

    if (restoreBtn) {
        restoreBtn.addEventListener('click', () => {
            state.pages.forEach(p => {
                p.excluded = false;
                p.layers = [];
                p.cropBox = null;
                // reset standardized tracing (maxed rectangle)
                if (p.standardized) delete p.standardized;
                if (p.aspectRatio && p._pdfPage) delete p.aspectRatio;
                p._cacheCanvas = null;
                p._cacheWidth = null;
                const card = document.getElementById(p.id);
                if (card) {
                    card.classList.remove('excluded', 'has-overlay', 'overlay-source');
                    const badge = card.querySelector('.overlay-badge');
                    if (badge) badge.remove();
                }
                renderCardCanvas(p);
            });
        });
    }

    if (colorDots.length) {
        colorDots.forEach(dot => {
            dot.addEventListener('click', () => {
                colorDots.forEach(d => d.classList.remove('active'));
                dot.classList.add('active');
                const hex = dot.getAttribute('data-color');
                state.annColor = hex;
                state.dateColor = hex;
                if (colorInput) colorInput.value = hex;
                if (customSwatch) customSwatch.style.backgroundColor = hex;

                const dateColorInput = document.getElementById('date-color');
                const dateColorSwatch = document.getElementById('date-color-swatch');
                if (dateColorInput) dateColorInput.value = hex;
                if (dateColorSwatch) dateColorSwatch.style.backgroundColor = hex;

                const sel = getSelectedLayerInfo ? getSelectedLayerInfo() : selectedLayerInfo;
                if (sel && sel.layer && sel.page) {
                    sel.layer.color = hex;
                    renderCardCanvas(sel.page);
                }
            });
        });
    }

    if (colorInput) {
        colorInput.addEventListener('input', (e) => {
            const hex = e.target.value;
            state.annColor = hex;
            state.dateColor = hex;
            if (customSwatch) customSwatch.style.backgroundColor = hex;
            colorDots.forEach(d => {
                d.classList.toggle('active', d.getAttribute('data-color').toLowerCase() === hex.toLowerCase());
            });

            const dateColorInput = document.getElementById('date-color');
            const dateColorSwatch = document.getElementById('date-color-swatch');
            if (dateColorInput) dateColorInput.value = hex;
            if (dateColorSwatch) dateColorSwatch.style.backgroundColor = hex;

            const sel = getSelectedLayerInfo ? getSelectedLayerInfo() : selectedLayerInfo;
            if (sel && sel.layer && sel.page) {
                sel.layer.color = hex;
                renderCardCanvas(sel.page);
            }
        });
    }

    const applySizeChange = (newSize) => {
        state.annSize = newSize;
        state.dateSize = newSize;
        const sel = getSelectedLayerInfo ? getSelectedLayerInfo() : selectedLayerInfo;
        if (sel && sel.layer && sel.page) {
            sel.layer.fontSize = newSize;
            renderCardCanvas(sel.page);
        }
        const dateSizeInput = document.getElementById('date-size');
        if (dateSizeInput) dateSizeInput.value = newSize;
        const datePreviewText = document.getElementById('date-preview-text');
        if (datePreviewText) datePreviewText.style.fontSize = `${Math.max(10, newSize)}px`;
    };

    if (sizeInput) {
        sizeInput.addEventListener('input', (e) => { applySizeChange(parseInt(e.target.value, 10) || 16); });
        sizeInput.addEventListener('change', (e) => { applySizeChange(parseInt(e.target.value, 10) || 16); });
    }

    if (sizeMinus && sizeInput) {
        sizeMinus.addEventListener('click', () => {
            let val = Math.max(8, (parseInt(sizeInput.value, 10) || 16) - 2);
            sizeInput.value = val;
            applySizeChange(val);
            sizeInput.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    if (sizePlus && sizeInput) {
        sizePlus.addEventListener('click', () => {
            let val = Math.min(72, (parseInt(sizeInput.value, 10) || 16) + 2);
            sizeInput.value = val;
            applySizeChange(val);
            sizeInput.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    const fontSelect = document.getElementById('ann-font');
    if (fontSelect) {
        fontSelect.addEventListener('change', (e) => {
            const fontVal = e.target.value;
            state.annFont = fontVal;
            const sel = getSelectedLayerInfo ? getSelectedLayerInfo() : selectedLayerInfo;
            if (sel && sel.layer && sel.page) {
                sel.layer.fontFamily = fontVal;
                renderCardCanvas(sel.page);
            }
        });
    }

    const boldToggle = document.getElementById('ann-bold-toggle');
    if (boldToggle) {
        boldToggle.addEventListener('mousedown', (e) => {
            const activeEditing = document.querySelector('.pdf-extracted-text-line.is-editing, .ann-edit-box .ann-input[contenteditable="true"]');
            if (activeEditing) {
                e.preventDefault();
            }
        });

        boldToggle.addEventListener('click', () => {
            const activeInlineSpan = document.querySelector('.pdf-extracted-text-line.is-editing');
            if (activeInlineSpan) {
                activeInlineSpan.dispatchEvent(new CustomEvent('toggle-bold'));
                return;
            }

            const activePopover = document.querySelector('.ann-edit-box');
            if (activePopover) {
                activePopover.dispatchEvent(new CustomEvent('toggle-bold'));
                return;
            }

            state.annBold = !state.annBold;
            boldToggle.classList.toggle('active', state.annBold);

            const sel = getSelectedLayerInfo ? getSelectedLayerInfo() : selectedLayerInfo;
            if (sel && sel.layer && sel.page && sel.layer.type === 'annotation') {
                sel.layer.bold = state.annBold;
                if (sel.layer.runs && sel.layer.runs.length > 0) {
                    sel.layer.runs.forEach(r => { r.bold = state.annBold; });
                }
                renderCardCanvas(sel.page);
            }
        });
    }

    const lineWidthInput = document.getElementById('ann-line-width');
    const lineMinus = document.getElementById('ann-line-minus');
    const linePlus = document.getElementById('ann-line-plus');

    const applyLineWidthChange = (w) => {
        const val = Math.max(1, Math.min(24, w));
        state.annLineWidth = val;
        if (lineWidthInput) lineWidthInput.value = val;
        const sel = getSelectedLayerInfo ? getSelectedLayerInfo() : selectedLayerInfo;
        if (sel && sel.layer && sel.page && sel.layer.type === 'line') {
            sel.layer.thickness = val;
            renderCardCanvas(sel.page);
        }
    };

    if (lineWidthInput) {
        lineWidthInput.addEventListener('input', (e) => applyLineWidthChange(parseInt(e.target.value, 10) || 2));
        lineWidthInput.addEventListener('change', (e) => applyLineWidthChange(parseInt(e.target.value, 10) || 2));
    }
    if (lineMinus && lineWidthInput) {
        lineMinus.addEventListener('click', () => {
            const cur = parseInt(lineWidthInput.value, 10) || 2;
            applyLineWidthChange(cur - 1);
        });
    }
    if (linePlus && lineWidthInput) {
        linePlus.addEventListener('click', () => {
            const cur = parseInt(lineWidthInput.value, 10) || 2;
            applyLineWidthChange(cur + 1);
        });
    }
}
