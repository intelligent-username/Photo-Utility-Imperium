// ===========================================
//  pdfDateDropdown.js — Date format picker & drag-reordering
// ===========================================

import {
    getState,
    formatDate,
    renderCardCanvas,
    selectedLayerInfo,
    getSelectedLayerInfo
} from '../pdfCanvas.js';

export function setupDateDropdown(selectAnnSubTool) {
    const state = getState();
    const dateMenu = document.getElementById('date-dropdown-menu');
    const dateFontOptions = document.querySelectorAll('.date-font-option');
    const datePreviewText = document.getElementById('date-preview-text');
    const dateColorInput = document.getElementById('date-color');
    const dateColorSwatch = document.getElementById('date-color-swatch');
    const dateColorDots = document.querySelectorAll('#date-dropdown-menu .color-dot');
    const dateSizeInput = document.getElementById('date-size');
    const dateSizeMinus = document.getElementById('date-size-minus');
    const dateSizePlus = document.getElementById('date-size-plus');

    try {
        const rawFmts = localStorage.getItem('pdf_saved_date_formats');
        if (rawFmts) {
            const parsed = JSON.parse(rawFmts);
            if (Array.isArray(parsed) && parsed.length > 0) {
                state.dateFormats = parsed;
                state.dateFormat = state.dateFormats[0];
            }
        }
    } catch(e) {}

    function updateDatePreview() {
        if (!datePreviewText) return;
        datePreviewText.textContent = formatDate(state.dateFormat);
        datePreviewText.style.fontFamily = `"${state.dateFont}", sans-serif`;
        datePreviewText.style.color = state.dateColor;
        datePreviewText.style.fontWeight = state.dateBold ? 'bold' : 'normal';
        datePreviewText.style.fontSize = `${Math.max(10, state.dateSize)}px`;
    }

    function renderDateFormatList() {
        const container = document.querySelector('.date-format-options');
        if (!container) return;
        container.innerHTML = '';

        if (!state.dateFormats || state.dateFormats.length === 0) {
            state.dateFormats = ['words-short', 'words-full', 'numbers-us', 'numbers-eu'];
        }

        const total = state.dateFormats.length;
        state.dateFormats.forEach((fmtKey, idx) => {
            const card = document.createElement('div');
            const isHalf = (total > 3 && idx >= 2);
            card.className = `date-format-card ${state.dateFormat === fmtKey ? 'active' : ''} ${isHalf ? 'col-half' : 'col-full'}`;
            card.draggable = true;
            card.dataset.format = fmtKey;

            const contentWrap = document.createElement('div');
            contentWrap.className = 'date-format-content';

            const handle = document.createElement('span');
            handle.className = 'date-format-handle';
            handle.innerHTML = '&#8942;&#8942;';
            handle.title = 'Drag to reorder';

            const label = document.createElement('span');
            label.className = 'date-format-label';
            label.textContent = formatDate(fmtKey);

            contentWrap.appendChild(handle);
            contentWrap.appendChild(label);

            let isDraggingFmt = false;

            card.addEventListener('dragstart', (e) => {
                isDraggingFmt = true;
                e.dataTransfer.setData('text/plain', fmtKey);
                e.dataTransfer.effectAllowed = 'move';
                card.classList.add('dragging');
            });

            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                container.querySelectorAll('.date-format-card.drag-over').forEach(c => c.classList.remove('drag-over'));
                setTimeout(() => { isDraggingFmt = false; }, 50);
            });

            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                card.classList.add('drag-over');
            });

            card.addEventListener('dragleave', () => {
                card.classList.remove('drag-over');
            });

            card.addEventListener('drop', (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                const fromFmt = e.dataTransfer.getData('text/plain');
                if (!fromFmt || fromFmt === fmtKey) return;
                const fromIdx = state.dateFormats.indexOf(fromFmt);
                const toIdx = state.dateFormats.indexOf(fmtKey);
                if (fromIdx >= 0 && toIdx >= 0) {
                    const [moved] = state.dateFormats.splice(fromIdx, 1);
                    state.dateFormats.splice(toIdx, 0, moved);
                    state.dateFormat = state.dateFormats[0];
                    try {
                        localStorage.setItem('pdf_saved_date_formats', JSON.stringify(state.dateFormats));
                    } catch (err) {}
                    renderDateFormatList();
                    updateDatePreview();
                    const sel = getSelectedLayerInfo ? getSelectedLayerInfo() : selectedLayerInfo;
                    if (sel && sel.layer && sel.page) {
                        sel.layer.text = formatDate(state.dateFormat);
                        renderCardCanvas(sel.page);
                    }
                }
            });

            card.addEventListener('click', (e) => {
                if (isDraggingFmt) return;
                e.stopPropagation();
                state.dateFormat = fmtKey;
                renderDateFormatList();
                updateDatePreview();
                const sel = getSelectedLayerInfo ? getSelectedLayerInfo() : selectedLayerInfo;
                if (sel && sel.layer && sel.page) {
                    sel.layer.text = formatDate(state.dateFormat);
                    renderCardCanvas(sel.page);
                }
            });

            card.appendChild(contentWrap);
            container.appendChild(card);
        });
    }

    renderDateFormatList();
    updateDatePreview();

    if (dateFontOptions.length) {
        dateFontOptions.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                dateFontOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                state.dateFont = opt.getAttribute('data-font');
                state.dateBold = opt.getAttribute('data-bold') === 'true';
                updateDatePreview();
                const sel = getSelectedLayerInfo ? getSelectedLayerInfo() : selectedLayerInfo;
                if (sel && sel.layer && sel.page) {
                    sel.layer.fontFamily = state.dateFont;
                    sel.layer.bold = state.dateBold;
                    renderCardCanvas(sel.page);
                }
            });
        });
    }

    if (dateColorDots.length) {
        dateColorDots.forEach(dot => {
            dot.addEventListener('click', (e) => {
                e.stopPropagation();
                dateColorDots.forEach(d => d.classList.remove('active'));
                dot.classList.add('active');
                const hex = dot.getAttribute('data-color');
                state.dateColor = hex;
                if (dateColorInput) dateColorInput.value = hex;
                if (dateColorSwatch) dateColorSwatch.style.backgroundColor = hex;
                updateDatePreview();
                const sel = getSelectedLayerInfo ? getSelectedLayerInfo() : selectedLayerInfo;
                if (sel && sel.layer && sel.page) {
                    sel.layer.color = hex;
                    renderCardCanvas(sel.page);
                }
                const mainColorInput = document.getElementById('ann-color');
                const customSwatch = document.getElementById('custom-color-swatch');
                if (mainColorInput) mainColorInput.value = hex;
                if (customSwatch) customSwatch.style.backgroundColor = hex;
            });
        });
    }

    if (dateColorInput) {
        dateColorInput.addEventListener('input', (e) => {
            e.stopPropagation();
            const hex = e.target.value;
            state.dateColor = hex;
            if (dateColorSwatch) dateColorSwatch.style.backgroundColor = hex;
            dateColorDots.forEach(d => {
                d.classList.toggle('active', d.getAttribute('data-color').toLowerCase() === hex.toLowerCase());
            });
            updateDatePreview();
            const sel = getSelectedLayerInfo ? getSelectedLayerInfo() : selectedLayerInfo;
            if (sel && sel.layer && sel.page) {
                sel.layer.color = hex;
                renderCardCanvas(sel.page);
            }
            const mainColorInput = document.getElementById('ann-color');
            const customSwatch = document.getElementById('custom-color-swatch');
            if (mainColorInput) mainColorInput.value = hex;
            if (customSwatch) customSwatch.style.backgroundColor = hex;
        });
    }

    const applyDateSizeChange = (val) => {
        state.dateSize = val;
        if (dateSizeInput) dateSizeInput.value = val;
        updateDatePreview();
        const sel = getSelectedLayerInfo ? getSelectedLayerInfo() : selectedLayerInfo;
        if (sel && sel.layer && sel.page) {
            sel.layer.fontSize = val;
            renderCardCanvas(sel.page);
        }
        const mainSizeInput = document.getElementById('ann-size');
        if (mainSizeInput) mainSizeInput.value = val;
    };

    if (dateSizeInput) {
        dateSizeInput.addEventListener('input', (e) => {
            e.stopPropagation();
            applyDateSizeChange(parseInt(e.target.value, 10) || 16);
        });
        dateSizeInput.addEventListener('change', (e) => {
            e.stopPropagation();
            applyDateSizeChange(parseInt(e.target.value, 10) || 16);
        });
    }

    if (dateSizeMinus && dateSizeInput) {
        dateSizeMinus.addEventListener('click', (e) => {
            e.stopPropagation();
            let val = Math.max(8, (parseInt(dateSizeInput.value, 10) || 16) - 2);
            applyDateSizeChange(val);
        });
    }

    if (dateSizePlus && dateSizeInput) {
        dateSizePlus.addEventListener('click', (e) => {
            e.stopPropagation();
            let val = Math.min(72, (parseInt(dateSizeInput.value, 10) || 16) + 2);
            applyDateSizeChange(val);
        });
    }

    updateDatePreview();
    return { updateDatePreview, renderDateFormatList };
}
