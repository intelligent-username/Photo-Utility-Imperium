// ===========================================
//  pdfAnnotationPopover.js — Rich annotation input popover UI & field-by-field navigation
// ===========================================

import { getState } from './pdfState.js';
import { renderCardCanvas } from './pdfRender.js';
import { snapshotPageLayers } from './pdfHistory.js';
import { renderRunsToElement, extractRunsFromElement } from './pdfTextLayer.js';
import { getContrastBgColor } from './pdfDateUtils.js';
import { getFormFieldMetrics, getSortedFormFields, findAnnotationForField } from './pdfFormFieldMetrics.js';

export function openAnnotationInput(wrap, page, xR, yR, existingAnn = null, existingMarker = null, options = {}) {
    const state = getState();
    const isFormField = !!options.isFormField;
    wrap.querySelectorAll('.ann-edit-box, .ann-input').forEach(b => b.remove());

    if (existingMarker) {
        existingMarker.style.visibility = 'hidden';
    }

    const box = document.createElement('div');
    box.className = 'ann-edit-box' + (isFormField ? ' is-form-field' : '');
    const leftPct = (xR * 100).toFixed(1);
    box.style.left = `${leftPct}%`;
    box.style.top = `${(yR * 100).toFixed(1)}%`;
    box.style.maxWidth = `calc(100% - ${leftPct}%)`;

    const input = isFormField ? document.createElement('textarea') : document.createElement('div');
    if (isFormField) {
        input.rows = 1;
    } else {
        input.contentEditable = 'true';
        input.spellcheck = false;
        input.dataset.placeholder = 'Text...';
    }
    input.className = 'ann-input';
    input.id = options.fieldId ? `form-field-input-${options.fieldId}` : `ann-input-${Date.now()}`;
    input.name = options.fieldId || 'annotation-text';
    input.autocomplete = 'off';
    input.style.maxWidth = '100%';
    let currentAnnColor = existingAnn ? (existingAnn.color || (options.color || state.annColor)) : (options.color ? options.color : (options.date ? state.dateColor : state.annColor));
    let currentAnnSize = existingAnn ? (existingAnn.fontSize || state.annSize) : (options.fontSize ? options.fontSize : (options.date ? state.dateSize : state.annSize));
    let currentAnnFont = existingAnn ? (existingAnn.fontFamily || 'inherit') : (options.fontFamily ? options.fontFamily : (options.date ? state.dateFont : (state.annFont || 'inherit')));
    let currentAnnBold = existingAnn ? (existingAnn.bold || false) : (options.bold !== undefined ? options.bold : (options.date ? state.dateBold : (state.annBold || false)));

    const applyContrastTheme = (hexColor) => {
        if (isFormField) return;
        const theme = getContrastBgColor(hexColor);
        box.style.background = theme.bg;
        box.style.borderColor = theme.border;
    };
    applyContrastTheme(currentAnnColor);

    const wrapRect = wrap.getBoundingClientRect();
    const canvasScale = wrapRect.width > 0 ? (wrapRect.width / 612.0) : (state.viewMode === 'full' ? 0.95 : (state.viewMode === 'small' ? 0.26 : 0.55));

    const autoResize = () => {
        if (isFormField) {
            input.style.height = 'auto';
            input.style.height = `${input.scrollHeight}px`;
            const lines = (input.value || '').split('\n');
            const maxLen = Math.max(...lines.map(l => l.length), 1);
            input.cols = Math.max(2, maxLen + 1);
        }
    };

    const controls = document.createElement('div');
    controls.className = 'ann-box-controls';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.id = 'ann-popover-color';
    colorPicker.name = 'ann-popover-color';
    colorPicker.className = 'ann-popover-color';
    colorPicker.value = currentAnnColor;
    colorPicker.title = 'Font Color';
    colorPicker.addEventListener('input', (e) => {
        currentAnnColor = e.target.value;
        state.annColor = currentAnnColor;
        input.style.color = currentAnnColor;
        applyContrastTheme(currentAnnColor);
        const mainPicker = document.getElementById('ann-color');
        if (mainPicker) mainPicker.value = currentAnnColor;
    });

    const fontSelect = document.createElement('select');
    fontSelect.id = 'ann-popover-font';
    fontSelect.name = 'ann-popover-font';
    fontSelect.className = 'ann-popover-font';
    fontSelect.title = 'Font Family';
    [
        { value: 'Helvetica, Arial, sans-serif', label: 'Sans-Serif (Helvetica)' },
        { value: 'Times New Roman, serif', label: 'Serif (Times)' },
        { value: 'Courier New, monospace', label: 'Monospace (Courier)' }
    ].forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.value;
        opt.textContent = f.label;
        if (currentAnnFont && (currentAnnFont.toLowerCase().includes(f.value.split(',')[0].toLowerCase()) || (f.value.includes('Times') && currentAnnFont.toLowerCase().includes('times')) || (f.value.includes('Courier') && currentAnnFont.toLowerCase().includes('courier')))) {
            opt.selected = true;
        }
        fontSelect.appendChild(opt);
    });
    fontSelect.addEventListener('change', (e) => {
        currentAnnFont = e.target.value;
        input.style.fontFamily = currentAnnFont;
        autoResize();
    });

    const sizeSelect = document.createElement('select');
    sizeSelect.id = 'ann-popover-size';
    sizeSelect.name = 'ann-popover-size';
    sizeSelect.className = 'ann-popover-size';
    sizeSelect.title = 'Font Size';
    const standardSizes = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 48, 64];
    if (!standardSizes.includes(currentAnnSize)) {
        standardSizes.push(currentAnnSize);
        standardSizes.sort((a, b) => a - b);
    }
    standardSizes.forEach(sz => {
        const opt = document.createElement('option');
        opt.value = sz;
        opt.textContent = `${sz}px`;
        if (sz === currentAnnSize) opt.selected = true;
        sizeSelect.appendChild(opt);
    });
    sizeSelect.addEventListener('change', (e) => {
        currentAnnSize = parseInt(e.target.value, 10);
        state.annSize = currentAnnSize;
        const fontSz = Math.max(9, currentAnnSize * canvasScale);
        input.style.fontSize = `${fontSz}px`;
        autoResize();
        const mainSize = document.getElementById('ann-size');
        if (mainSize) mainSize.value = currentAnnSize;
    });

    const mainBoldBtn = document.getElementById('ann-bold-toggle');
    if (mainBoldBtn) {
        mainBoldBtn.classList.toggle('active', !!currentAnnBold);
    }

    const boldBtn = document.createElement('button');
    boldBtn.type = 'button';
    boldBtn.className = 'ann-popover-bold-btn' + (currentAnnBold ? ' active' : '');
    boldBtn.innerHTML = '<b>B</b>';
    boldBtn.title = 'Toggle Bold (Ctrl+B)';

    const updatePopoverBoldState = () => {
        try {
            const isB = isFormField ? currentAnnBold : document.queryCommandState('bold');
            boldBtn.classList.toggle('active', isB);
            if (mainBoldBtn) mainBoldBtn.classList.toggle('active', isB);
            state.annBold = isB;
            currentAnnBold = isB;
        } catch (_) {}
    };

    const togglePopoverBold = () => {
        if (isFormField) {
            currentAnnBold = !currentAnnBold;
            boldBtn.classList.toggle('active', currentAnnBold);
            input.style.fontWeight = currentAnnBold ? 'bold' : 'normal';
            state.annBold = currentAnnBold;
            if (mainBoldBtn) mainBoldBtn.classList.toggle('active', currentAnnBold);
            autoResize();
        } else {
            input.focus();
            document.execCommand('bold', false, null);
            updatePopoverBoldState();
        }
    };

    boldBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
    });
    boldBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        togglePopoverBold();
    });

    const onPopoverToggleBold = () => {
        togglePopoverBold();
    };
    box.addEventListener('toggle-bold', onPopoverToggleBold);

    if (!isFormField) {
        input.addEventListener('keyup', updatePopoverBoldState);
        input.addEventListener('mouseup', updatePopoverBoldState);
    }

    if (!isFormField) {
        controls.appendChild(colorPicker);
        controls.appendChild(fontSelect);
        controls.appendChild(sizeSelect);
        controls.appendChild(boldBtn);
        box.appendChild(controls);
    }

    const initialText = existingAnn ? existingAnn.text : (options.initialText || '');
    if (isFormField) {
        input.value = initialText;
        input.placeholder = '';
        if (currentAnnBold) input.style.fontWeight = 'bold';
    } else {
        if (existingAnn && existingAnn.runs && existingAnn.runs.length > 0) {
            renderRunsToElement(input, existingAnn.runs, initialText, currentAnnBold);
        } else if (currentAnnBold) {
            renderRunsToElement(input, [{ text: initialText, bold: true }], initialText, true);
        } else {
            input.textContent = initialText;
        }
    }

    input.style.color = currentAnnColor;
    if (currentAnnFont && currentAnnFont !== 'inherit') input.style.fontFamily = currentAnnFont;

    const fontSz = Math.max(9, currentAnnSize * canvasScale);
    input.style.fontSize = `${fontSz}px`;

    box.appendChild(input);
    wrap.appendChild(box);
    autoResize();
    input.focus();
    if (!isFormField) {
        updatePopoverBoldState();
    }

    let committed = false;

    const commit = () => {
        if (committed) return;
        committed = true;

        snapshotPageLayers(page);
        // Form fields preserve spacing. Regular annotations trim whitespace.
        const extracted = isFormField
            ? { text: input.value, runs: [], allBold: false, hasPartialBold: false }
            : extractRunsFromElement(input, currentAnnBold);
        const text = isFormField ? input.value : extracted.text.trim();
        const runs = isFormField ? [] : extracted.runs.map(r => ({
            text: r.text,
            bold: !!r.bold
        })).filter(r => r.text.length > 0);
        const isEmpty = isFormField ? (text.length === 0) : !text;

        if (existingAnn) {
            if (isEmpty) {
                const idx = page.layers.indexOf(existingAnn);
                if (idx !== -1) page.layers.splice(idx, 1);
            } else {
                existingAnn.text = text;
                existingAnn.runs = runs;
                existingAnn.bold = extracted.allBold;
                existingAnn.color = currentAnnColor;
                existingAnn.fontSize = currentAnnSize;
                if (currentAnnFont && currentAnnFont !== 'inherit') existingAnn.fontFamily = currentAnnFont;
                if (isFormField) {
                    existingAnn.isFormField = true;
                    if (options.fieldId) existingAnn.fieldId = options.fieldId;
                }
            }
        } else if (!isEmpty) {
            const ann = {
                type: 'annotation',
                id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                text,
                runs,
                bold: extracted.allBold,
                xRatio: xR,
                yRatio: yR,
                color: currentAnnColor,
                fontSize: currentAnnSize,
            };
            if (currentAnnFont && currentAnnFont !== 'inherit') ann.fontFamily = currentAnnFont;
            if (isFormField) {
                ann.isFormField = true;
                if (options.fieldId) ann.fieldId = options.fieldId;
            }
            if (options.sourceTextId) {
                ann.sourceTextId = options.sourceTextId;
            }
            page.layers.push(ann);
        }
        box.remove();
        renderCardCanvas(page);
    };

    if (existingAnn && !isFormField) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'ann-box-del-btn';
        delBtn.innerHTML = '&times;';
        delBtn.title = 'Delete annotation';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = page.layers.indexOf(existingAnn);
            if (idx !== -1) page.layers.splice(idx, 1);
            box.remove();
            renderCardCanvas(page);
        });
        box.appendChild(delBtn);
    }

    input.addEventListener('input', autoResize);

    const onDocClick = (e) => {
        if (!box.contains(e.target)) {
            document.removeEventListener('pointerdown', onDocClick);
            commit();
        }
    };
    setTimeout(() => {
        document.addEventListener('pointerdown', onDocClick);
    }, 100);

    const setFontSize = (newSize) => {
        currentAnnSize = Math.max(8, Math.min(72, newSize));
        state.annSize = currentAnnSize;
        const wRect = wrap.getBoundingClientRect();
        const cScale = wRect.width > 0 ? (wRect.width / 612.0) : (state.viewMode === 'full' ? 0.95 : (state.viewMode === 'small' ? 0.26 : 0.55));
        input.style.fontSize = `${Math.max(9, currentAnnSize * cScale)}px`;
        autoResize();
        if (sizeSelect) sizeSelect.value = currentAnnSize;
        const mainSize = document.getElementById('ann-size');
        if (mainSize) mainSize.value = currentAnnSize;
    };

    const navigateToField = (direction) => {
        const currentSorted = getSortedFormFields(page);
        if (currentSorted.length <= 1) return;

        let currentIdx = -1;
        if (options.fieldId) {
            currentIdx = currentSorted.findIndex(f => f.id === options.fieldId);
        }
        if (currentIdx === -1) {
            let bestDist = Infinity;
            currentSorted.forEach((f, idx) => {
                const dx = f.leftRatio - xR;
                const dy = f.topRatio - yR;
                const dist = dx * dx + dy * dy;
                if (dist < bestDist) {
                    bestDist = dist;
                    currentIdx = idx;
                }
            });
        }
        if (currentIdx === -1) currentIdx = 0;

        const nextIndex = (currentIdx + direction + currentSorted.length) % currentSorted.length;
        const nextField = currentSorted[nextIndex];
        if (!nextField) return;

        document.removeEventListener('pointerdown', onDocClick);
        commit();

        const metrics = getFormFieldMetrics(nextField, page);
        const nextExisting = findAnnotationForField(page, nextField);

        if (nextExisting) {
            const nextMarker = [...wrap.querySelectorAll('.ann-marker')].find(el => {
                const elLeft = parseFloat(el.style.left);
                const elTop = parseFloat(el.style.top);
                return Math.abs(elLeft - nextExisting.xRatio * 100) < 2 &&
                       Math.abs(elTop - nextExisting.yRatio * 100) < 2;
            }) || null;
            openAnnotationInput(wrap, page, nextExisting.xRatio, nextExisting.yRatio, nextExisting, nextMarker, {
                isFormField: true,
                fieldId: nextField.id,
                fieldIndex: nextIndex
            });
        } else {
            openAnnotationInput(wrap, page, metrics.xRatio, metrics.yRatio, null, null, {
                fontSize: metrics.fontSize,
                color: '#000000',
                isFormField: true,
                fieldId: nextField.id,
                fieldIndex: nextIndex,
                initialText: nextField.fieldValue || ''
            });
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.removeEventListener('pointerdown', onDocClick);
            commit();
        } else if (e.key === 'Tab' && isFormField) {
            e.preventDefault();
            navigateToField(e.shiftKey ? -1 : 1);
        } else if (e.key === 'Enter' && isFormField && !e.shiftKey) {
            e.preventDefault();
            document.removeEventListener('pointerdown', onDocClick);
            commit();
        } else if (!isFormField && (e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
            e.preventDefault();
            togglePopoverBold();
        } else if (!isFormField && (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '.' || e.key === '>')) {
            e.preventDefault();
            setFontSize(currentAnnSize + 2);
        } else if (!isFormField && (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === ',' || e.key === '<')) {
            e.preventDefault();
            setFontSize(currentAnnSize - 2);
        }
    });
}
