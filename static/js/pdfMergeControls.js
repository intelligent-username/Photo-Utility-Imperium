// ===========================================
//  pdfMergeControls.js — Toolbar, date, & signature UI controls
// ===========================================

import {
    getState,
    setAppMode,
    updateStatusBar,
    formatDate,
    loadSavedSignatures,
    saveSignatureStamp,
    removeSignatureStamp,
    renderCardCanvas,
    commitActivePlacement,
    deleteSelectedLayer,
    deselectAllLayers,
    performUndo,
    performRedo
} from './pdfCanvas.js';

export function setupToolbarControls() {
    const annotateBtn = document.getElementById('annotate-btn');
    const cropBtn = document.getElementById('crop-btn');
    const overlayBtn = document.getElementById('overlay-btn');
    const whiteoutBtn = document.getElementById('whiteout-btn');
    const annBar = document.getElementById('pdf-annotation-bar');
    const ffBar = document.getElementById('pdf-field-form-bar');
    const fieldFormBtn = document.getElementById('field-form-btn');
    const annToolCursor = document.getElementById('ann-tool-cursor');
    const annToolText = document.getElementById('ann-tool-text');
    const annToolSign = document.getElementById('ann-tool-sign');
    const annToolDate = document.getElementById('ann-tool-date');
    const annToolDateCaret = document.getElementById('ann-tool-date-caret');
    const annBarControls = document.getElementById('ann-bar-controls');

    const state = getState();

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

    function selectAnnSubTool(subTool) {
        const signMenu = document.getElementById('sign-dropdown-menu');
        const dateMenu = document.getElementById('date-dropdown-menu');
        if (subTool === 'cursor') {
            if (annToolCursor) annToolCursor.classList.add('active');
            if (annToolText) annToolText.classList.remove('active');
            if (annToolSign) annToolSign.classList.remove('active');
            if (annToolDate) annToolDate.classList.remove('active');
            if (annBarControls) annBarControls.classList.add('hidden');
            if (signMenu) signMenu.classList.add('hidden');
            if (dateMenu) dateMenu.classList.add('hidden');
            setAppMode('select');
        } else if (subTool === 'text') {
            if (annToolText) annToolText.classList.add('active');
            if (annToolCursor) annToolCursor.classList.remove('active');
            if (annToolSign) annToolSign.classList.remove('active');
            if (annToolDate) annToolDate.classList.remove('active');
            if (annBarControls) annBarControls.classList.remove('hidden');
            if (signMenu) signMenu.classList.add('hidden');
            if (dateMenu) dateMenu.classList.add('hidden');
            setAppMode('annotate');
        } else if (subTool === 'sign') {
            if (annToolSign) annToolSign.classList.add('active');
            if (annToolCursor) annToolCursor.classList.remove('active');
            if (annToolText) annToolText.classList.remove('active');
            if (annToolDate) annToolDate.classList.remove('active');
            if (annBarControls) annBarControls.classList.add('hidden');
            if (signMenu) signMenu.classList.toggle('hidden');
            if (dateMenu) dateMenu.classList.add('hidden');
            setAppMode('signature');
        } else if (subTool === 'date') {
            if (annToolDate) annToolDate.classList.add('active');
            if (annToolCursor) annToolCursor.classList.remove('active');
            if (annToolText) annToolText.classList.remove('active');
            if (annToolSign) annToolSign.classList.remove('active');
            if (annBarControls) annBarControls.classList.add('hidden');
            if (dateMenu) dateMenu.classList.add('hidden');
            if (signMenu) signMenu.classList.add('hidden');
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
            selectFFSubTool('edit');
        } else {
            if (annBar) annBar.classList.add('hidden');
            if (ffBar) ffBar.classList.add('hidden');
            setAppMode(modeName);
        }
    }

    // ── Field Form sub-tool management ─────────────────────────────────────
    const ffSubBtns = {
        edit: document.getElementById('ff-tool-edit'),
        create: document.getElementById('ff-tool-create'),
        delete: document.getElementById('ff-tool-delete'),
        deleteAll: document.getElementById('ff-tool-delete-all'),
    };

    function selectFFSubTool(sub) {
        Object.values(ffSubBtns).forEach(b => b && b.classList.remove('active'));
        if (ffSubBtns[sub]) ffSubBtns[sub].classList.add('active');
        // Map sub-tool to an app mode so pdfCardBuilder can react
        const modeMap = {
            edit: 'field-form-edit',
            create: 'field-form-create',
            delete: 'field-form-delete',
            deleteAll: 'field-form-edit',
        };
        setAppMode(modeMap[sub] || 'field-form-edit');
        state._ffSubTool = sub;
        if (sub === 'edit') {
            updateStatusBar('Field Form: Click any field to fill or edit text');
        } else if (sub === 'create') {
            updateStatusBar('Create Field Form: Drag a rectangle on any page to create a field');
        } else if (sub === 'delete') {
            updateStatusBar('Delete Field Form: Click any field to delete it');
        }
    }

    if (ffSubBtns.edit)      ffSubBtns.edit.addEventListener('click', () => selectFFSubTool('edit'));
    if (ffSubBtns.create)    ffSubBtns.create.addEventListener('click', () => selectFFSubTool('create'));
    if (ffSubBtns.delete)    ffSubBtns.delete.addEventListener('click', () => selectFFSubTool('delete'));
    if (ffSubBtns.deleteAll) ffSubBtns.deleteAll.addEventListener('click', () => {
        selectFFSubTool('deleteAll');
        // Trigger delete-all action immediately
        handleDeleteAllFields();
    });

    // ── Field form confirmation dialog helper ───────────────────────────────
    function showFieldDeleteDialog(onConfirm) {
        // Step 1: ask about sparing the text
        const backdrop = document.createElement('div');
        backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000;display:flex;align-items:center;justify-content:center;';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#1e2130;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:24px 28px;min-width:320px;max-width:420px;color:#e8eaf0;font-family:inherit;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
        dialog.innerHTML = `
            <div style="font-size:15px;font-weight:600;margin-bottom:8px;">Spare the text?</div>
            <div style="font-size:13px;color:#9aa0b4;margin-bottom:20px;">Keep the text that was typed into this field as a regular annotation, or delete it along with the field?</div>
            <div style="display:flex;gap:10px;justify-content:flex-end;">
                <button id="ffd-cancel" style="padding:7px 16px;border-radius:7px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#9aa0b4;cursor:pointer;font-size:13px;">Cancel</button>
                <button id="ffd-delete-text" style="padding:7px 16px;border-radius:7px;border:none;background:#ef4444;color:#fff;cursor:pointer;font-size:13px;">Delete text too</button>
                <button id="ffd-spare" style="padding:7px 16px;border-radius:7px;border:none;background:#3b82f6;color:#fff;cursor:pointer;font-size:13px;">Keep text</button>
            </div>`;
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        const close = () => backdrop.remove();
        dialog.querySelector('#ffd-cancel').addEventListener('click', close);
        dialog.querySelector('#ffd-spare').addEventListener('click', () => {
            close();
            confirmDeleteField(true, onConfirm);
        });
        dialog.querySelector('#ffd-delete-text').addEventListener('click', () => {
            close();
            confirmDeleteField(false, onConfirm);
        });
    }

    function confirmDeleteField(spareText, onConfirm) {
        const backdrop = document.createElement('div');
        backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000;display:flex;align-items:center;justify-content:center;';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#1e2130;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:24px 28px;min-width:300px;max-width:400px;color:#e8eaf0;font-family:inherit;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
        dialog.innerHTML = `
            <div style="font-size:15px;font-weight:600;margin-bottom:8px;">Confirm deletion</div>
            <div style="font-size:13px;color:#9aa0b4;margin-bottom:20px;">Delete the field${spareText ? ' (text kept as annotation)' : ' and its text'}?</div>
            <div style="display:flex;gap:10px;justify-content:flex-end;">
                <button id="ffc-cancel" style="padding:7px 16px;border-radius:7px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#9aa0b4;cursor:pointer;font-size:13px;">Cancel</button>
                <button id="ffc-confirm" style="padding:7px 16px;border-radius:7px;border:none;background:#ef4444;color:#fff;cursor:pointer;font-size:13px;">Delete</button>
            </div>`;
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        const close = () => backdrop.remove();
        dialog.querySelector('#ffc-cancel').addEventListener('click', close);
        dialog.querySelector('#ffc-confirm').addEventListener('click', () => {
            close();
            onConfirm(spareText);
        });
    }

    function handleDeleteAllFields() {
        const pages = state.pages;
        const hasAnyField = pages.some(p => p.formFields && p.formFields.length > 0);
        if (!hasAnyField) {
            updateStatusBar('No form fields to delete');
            return;
        }
        const hasAnyText = pages.some(p => p.formFields && p.formFields.some(f => {
            const ann = p.layers.find(l => l.type === 'annotation' && l.fieldId === f.id);
            return (ann && ann.text && ann.text.trim().length > 0) || (f.fieldValue && String(f.fieldValue).trim().length > 0);
        }));
        if (!hasAnyText) {
            import('./pdfCanvas/pdfHistory.js').then(({ snapshotAllFormFields }) => {
                snapshotAllFormFields();
                pages.forEach(p => {
                    if (!p.formFields || p.formFields.length === 0) return;
                    p.layers = p.layers.filter(l => !(l.type === 'annotation' && l.isFormField));
                    p.formFields = [];
                    import('./pdfCanvas/pdfRender.js').then(({ renderCardCanvas }) => renderCardCanvas(p)).catch(() => {});
                });
                updateStatusBar('All form fields deleted');
            }).catch(() => {});
            return;
        }
        showFieldDeleteDialog((spareText) => {
            import('./pdfCanvas/pdfHistory.js').then(({ snapshotAllFormFields }) => {
                snapshotAllFormFields();
                pages.forEach(p => {
                    if (!p.formFields || p.formFields.length === 0) return;
                    if (!spareText) {
                        // Remove annotations that were placed in form fields
                        p.layers = p.layers.filter(l => !(l.type === 'annotation' && l.isFormField));
                    } else {
                        // Convert them to regular annotations
                        p.layers.forEach(l => { if (l.type === 'annotation' && l.isFormField) delete l.isFormField; });
                    }
                    p.formFields = [];
                    import('./pdfCanvas/pdfRender.js').then(({ renderCardCanvas }) => renderCardCanvas(p)).catch(() => {});
                });
                updateStatusBar('All form fields deleted');
            }).catch(() => {});
        });
    }

    if (annotateBtn) annotateBtn.addEventListener('click', () => toggleMode(annotateBtn, 'annotate'));
    if (cropBtn) cropBtn.addEventListener('click', () => toggleMode(cropBtn, 'crop'));
    if (overlayBtn) overlayBtn.addEventListener('click', () => toggleMode(overlayBtn, 'overlay'));
    if (whiteoutBtn) whiteoutBtn.addEventListener('click', () => toggleMode(whiteoutBtn, 'whiteout'));
    if (fieldFormBtn) fieldFormBtn.addEventListener('click', () => toggleMode(fieldFormBtn, 'field-form'));

    if (annToolCursor) annToolCursor.addEventListener('click', () => selectAnnSubTool('cursor'));
    if (annToolText) annToolText.addEventListener('click', () => selectAnnSubTool('text'));

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
            toggleMode(annotateBtn, 'annotate');
        } else if (key === 'c') {
            deselectAllLayers();
            commitActivePlacement();
            toggleMode(cropBtn, 'crop');
        } else if (key === 'o') {
            deselectAllLayers();
            commitActivePlacement();
            toggleMode(overlayBtn, 'overlay');
        } else if (key === 'w') {
            deselectAllLayers();
            commitActivePlacement();
            toggleMode(whiteoutBtn, 'whiteout');
        } else if (key === 'f') {
            deselectAllLayers();
            commitActivePlacement();
            toggleMode(fieldFormBtn, 'field-form');
        } else if (key === 'v') {
            const viewModeBtn = document.getElementById('view-mode-btn');
            if (viewModeBtn) viewModeBtn.click();
        } else if (key === 't') {
            deselectAllLayers();
            commitActivePlacement();
            if (ffBar) ffBar.classList.add('hidden');
            if (fieldFormBtn) fieldFormBtn.classList.remove('active');
            if (cropBtn) cropBtn.classList.remove('active');
            if (overlayBtn) overlayBtn.classList.remove('active');
            if (whiteoutBtn) whiteoutBtn.classList.remove('active');
            if (annotateBtn) annotateBtn.classList.add('active');
            if (annBar) annBar.classList.remove('hidden');
            selectAnnSubTool('text');
        } else if (key === 's') {
            deselectAllLayers();
            commitActivePlacement();
            if (ffBar) ffBar.classList.add('hidden');
            if (fieldFormBtn) fieldFormBtn.classList.remove('active');
            if (cropBtn) cropBtn.classList.remove('active');
            if (overlayBtn) overlayBtn.classList.remove('active');
            if (whiteoutBtn) whiteoutBtn.classList.remove('active');
            if (annotateBtn) annotateBtn.classList.add('active');
            if (annBar) annBar.classList.remove('hidden');
            selectAnnSubTool('sign');
        } else if (key === 'd') {
            deselectAllLayers();
            commitActivePlacement();
            if (ffBar) ffBar.classList.add('hidden');
            if (fieldFormBtn) fieldFormBtn.classList.remove('active');
            if (cropBtn) cropBtn.classList.remove('active');
            if (overlayBtn) overlayBtn.classList.remove('active');
            if (whiteoutBtn) whiteoutBtn.classList.remove('active');
            if (annotateBtn) annotateBtn.classList.add('active');
            if (annBar) annBar.classList.remove('hidden');
            selectAnnSubTool('date');
        }
    });
    if (annToolSign) {
        annToolSign.addEventListener('click', (e) => {
            e.stopPropagation();
            selectAnnSubTool('sign');
        });
    }
    if (annToolDate) {
        annToolDate.addEventListener('click', (e) => {
            e.stopPropagation();
            selectAnnSubTool('date');
        });
    }
    let dateDropdownControls = null;
    if (annToolDateCaret) {
        annToolDateCaret.addEventListener('click', (e) => {
            e.stopPropagation();
            const dateMenu = document.getElementById('date-dropdown-menu');
            const signMenu = document.getElementById('sign-dropdown-menu');
            if (dateMenu) {
                const opening = dateMenu.classList.contains('hidden');
                dateMenu.classList.toggle('hidden');
                if (opening && dateDropdownControls) {
                    dateDropdownControls.updateDateFormatButtons();
                    dateDropdownControls.updateDatePreview();
                }
            }
            if (signMenu) signMenu.classList.add('hidden');
        });
    }

    dateDropdownControls = setupDateDropdown(selectAnnSubTool);
    setupSignatureModal(selectAnnSubTool);
    setupColorSizeControls();
    setupRichTooltips();
    return { clearModes };
}

function setupRichTooltips() {
    let tooltipEl = document.querySelector('.pdf-rich-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'pdf-rich-tooltip';
        document.body.appendChild(tooltipEl);
    }

    const elementsWithTooltip = document.querySelectorAll('[data-tooltip]');
    elementsWithTooltip.forEach(el => {
        const raw = el.getAttribute('data-tooltip');
        if (!raw) return;

        el.addEventListener('mouseenter', (e) => {
            const lines = raw.split('\n');
            let keysHtml = '';
            let labelText = '';

            if (lines.length > 1) {
                const keyTokens = lines[0].match(/`([^`]+)`/g) || [];
                keysHtml = keyTokens.map(t => `<kbd>${t.replace(/`/g, '')}</kbd>`).join('');
                labelText = lines.slice(1).join(' ').trim();
            } else {
                const keyTokens = lines[0].match(/`([^`]+)`/g) || [];
                if (keyTokens.length > 0) {
                    keysHtml = keyTokens.map(t => `<kbd>${t.replace(/`/g, '')}</kbd>`).join('');
                    labelText = lines[0].replace(/`([^`]+)`/g, '').trim();
                } else {
                    labelText = lines[0].trim();
                }
            }

            let contentHtml = '';
            if (keysHtml) {
                contentHtml += `<div class="pdf-rich-tooltip-keys">${keysHtml}</div>`;
            }
            if (labelText) {
                contentHtml += `<div class="pdf-rich-tooltip-label">${labelText}</div>`;
            }

            tooltipEl.innerHTML = contentHtml;
            tooltipEl.classList.add('visible');

            const rect = el.getBoundingClientRect();
            const tipRect = tooltipEl.getBoundingClientRect();
            let top = rect.bottom + 6;
            let left = rect.left + (rect.width - tipRect.width) / 2;

            if (top + tipRect.height > window.innerHeight) {
                top = rect.top - tipRect.height - 6;
            }
            if (left < 6) left = 6;
            if (left + tipRect.width > window.innerWidth - 6) {
                left = window.innerWidth - tipRect.width - 6;
            }

            tooltipEl.style.top = `${top}px`;
            tooltipEl.style.left = `${left}px`;
        });

        el.addEventListener('mouseleave', () => {
            tooltipEl.classList.remove('visible');
        });

        el.addEventListener('click', () => {
            tooltipEl.classList.remove('visible');
        });
    });
}

function setupDateDropdown(selectAnnSubTool) {
    const state = getState();
    const dateMenu = document.getElementById('date-dropdown-menu');
    const dateFormatOptions = document.querySelectorAll('.date-format-option');
    const dateFontOptions = document.querySelectorAll('.date-font-option');
    const datePreviewText = document.getElementById('date-preview-text');
    const dateColorInput = document.getElementById('date-color');
    const dateColorSwatch = document.getElementById('date-color-swatch');
    const dateColorDots = document.querySelectorAll('#date-dropdown-menu .color-dot');
    const dateSizeInput = document.getElementById('date-size');
    const dateSizeMinus = document.getElementById('date-size-minus');
    const dateSizePlus = document.getElementById('date-size-plus');

    function updateDateFormatButtons() {
        if (dateFormatOptions.length) {
            dateFormatOptions.forEach(opt => {
                const fmt = opt.getAttribute('data-format');
                if (fmt) {
                    opt.textContent = formatDate(fmt);
                }
            });
        }
    }

    function updateDatePreview() {
        if (!datePreviewText) return;
        datePreviewText.textContent = formatDate(state.dateFormat);
        datePreviewText.style.fontFamily = `"${state.dateFont}", sans-serif`;
        datePreviewText.style.color = state.dateColor;
        datePreviewText.style.fontWeight = state.dateBold ? 'bold' : 'normal';
        datePreviewText.style.fontSize = `${Math.max(10, state.dateSize)}px`;
    }

    updateDateFormatButtons();
    updateDatePreview();

    if (dateFormatOptions.length) {
        dateFormatOptions.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                dateFormatOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                state.dateFormat = opt.getAttribute('data-format');
                updateDatePreview();
            });
        });
    }

    if (dateFontOptions.length) {
        dateFontOptions.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                dateFontOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                state.dateFont = opt.getAttribute('data-font');
                state.dateBold = opt.getAttribute('data-bold') === 'true';
                updateDatePreview();
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
        });
    }

    if (dateSizeInput) {
        dateSizeInput.addEventListener('input', (e) => { state.dateSize = parseInt(e.target.value, 10) || 16; updateDatePreview(); });
        dateSizeInput.addEventListener('change', (e) => { state.dateSize = parseInt(e.target.value, 10) || 16; updateDatePreview(); });
    }

    if (dateSizeMinus && dateSizeInput) {
        dateSizeMinus.addEventListener('click', (e) => {
            e.stopPropagation();
            let val = Math.max(8, (parseInt(dateSizeInput.value, 10) || 16) - 2);
            dateSizeInput.value = val;
            state.dateSize = val;
            updateDatePreview();
        });
    }

    if (dateSizePlus && dateSizeInput) {
        dateSizePlus.addEventListener('click', (e) => {
            e.stopPropagation();
            let val = Math.min(72, (parseInt(dateSizeInput.value, 10) || 16) + 2);
            dateSizeInput.value = val;
            state.dateSize = val;
            updateDatePreview();
        });
    }

    updateDatePreview();
    return { updateDateFormatButtons, updateDatePreview };
}

function setupSignatureModal(selectAnnSubTool) {
    const state = getState();
    loadSavedSignatures();

    const signMenu = document.getElementById('sign-dropdown-menu');
    const createSigBtn = document.getElementById('create-sig-btn');
    const sigModal = document.getElementById('create-signature-modal');
    const closeSigModalBtn = document.getElementById('close-sig-modal-btn');
    const cancelSigModalBtn = document.getElementById('cancel-sig-modal-btn');
    const saveSigModalBtn = document.getElementById('save-sig-modal-btn');
    const sigNameInput = document.getElementById('sig-name-input');
    const sigLivePreviewText = document.getElementById('sig-live-preview-text');
    const sigFontOptions = document.querySelectorAll('.sig-font-option');
    const sigColorDots = document.querySelectorAll('.sig-color-dot');
    const sigStampsList = document.getElementById('signature-stamps-list');

    let currentSigFont = 'Caveat';
    let currentSigColor = '#0b1220';

    function renderSignatureStampsList() {
        if (!sigStampsList) return;
        sigStampsList.innerHTML = '';

        if (!state.signatures || state.signatures.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'dropdown-header-title';
            emptyMsg.style.textAlign = 'center';
            emptyMsg.textContent = 'No saved signatures';
            sigStampsList.appendChild(emptyMsg);
            return;
        }

        state.signatures.forEach(stamp => {
            const card = document.createElement('div');
            card.className = `sig-stamp-card ${state.activeSignature && state.activeSignature.id === stamp.id ? 'active' : ''}`;

            const prev = document.createElement('div');
            prev.className = 'sig-stamp-preview';
            prev.style.fontFamily = `"${stamp.fontFamily}", cursive`;
            prev.style.color = stamp.color || '#0b1220';
            prev.textContent = stamp.text;

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'sig-stamp-del';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Delete signature';

            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeSignatureStamp(stamp.id);
                renderSignatureStampsList();
            });

            card.addEventListener('click', () => {
                state.activeSignature = stamp;
                selectAnnSubTool('sign');
                if (signMenu) signMenu.classList.add('hidden');
                renderSignatureStampsList();
            });

            card.appendChild(prev);
            card.appendChild(delBtn);
            sigStampsList.appendChild(card);
        });
    }

    renderSignatureStampsList();

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#sign-dropdown-wrapper')) {
            if (signMenu) signMenu.classList.add('hidden');
        }
        if (!e.target.closest('#date-dropdown-wrapper')) {
            const dateMenu = document.getElementById('date-dropdown-menu');
            if (dateMenu) dateMenu.classList.add('hidden');
        }
    });

    function updateLivePreview() {
        if (!sigLivePreviewText) return;
        const text = sigNameInput ? (sigNameInput.value.trim() || 'Signature') : 'Varak';
        sigLivePreviewText.textContent = text;
        sigLivePreviewText.style.fontFamily = `"${currentSigFont}", cursive`;
        sigLivePreviewText.style.color = currentSigColor;

        sigFontOptions.forEach(opt => {
            const fontName = opt.getAttribute('data-font');
            const prevEl = opt.querySelector('.sig-font-preview');
            if (prevEl) {
                prevEl.textContent = text;
            }
        });
    }

    if (sigNameInput) {
        sigNameInput.addEventListener('input', updateLivePreview);
    }

    if (sigFontOptions.length) {
        sigFontOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                sigFontOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                currentSigFont = opt.getAttribute('data-font');
                updateLivePreview();
            });
        });
    }

    if (sigColorDots.length) {
        sigColorDots.forEach(dot => {
            dot.addEventListener('click', () => {
                sigColorDots.forEach(d => d.classList.remove('active'));
                dot.classList.add('active');
                currentSigColor = dot.getAttribute('data-color');
                updateLivePreview();
            });
        });
    }

    if (createSigBtn && sigModal) {
        createSigBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (signMenu) signMenu.classList.add('hidden');
            sigModal.classList.remove('hidden');
            updateLivePreview();
        });
    }

    function closeSigModal() {
        if (sigModal) sigModal.classList.add('hidden');
    }

    if (closeSigModalBtn) closeSigModalBtn.addEventListener('click', closeSigModal);
    if (cancelSigModalBtn) cancelSigModalBtn.addEventListener('click', closeSigModal);

    if (saveSigModalBtn) {
        saveSigModalBtn.addEventListener('click', async () => {
            const text = sigNameInput ? sigNameInput.value.trim() : '';
            if (!text) {
                alert('Please type your name or initials for your signature.');
                return;
            }
            const stamp = await saveSignatureStamp(text, currentSigFont, currentSigColor);
            state.activeSignature = stamp;
            closeSigModal();
            selectAnnSubTool('sign');
            renderSignatureStampsList();
        });
    }
}

function setupColorSizeControls() {
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
                if (colorInput) colorInput.value = hex;
                if (customSwatch) customSwatch.style.backgroundColor = hex;

                if (selectedLayerInfo && selectedLayerInfo.layer && selectedLayerInfo.page) {
                    selectedLayerInfo.layer.color = hex;
                    renderCardCanvas(selectedLayerInfo.page);
                }
            });
        });
    }

    if (colorInput) {
        colorInput.addEventListener('input', (e) => {
            const hex = e.target.value;
            state.annColor = hex;
            if (customSwatch) customSwatch.style.backgroundColor = hex;
            colorDots.forEach(d => {
                d.classList.toggle('active', d.getAttribute('data-color').toLowerCase() === hex.toLowerCase());
            });

            if (selectedLayerInfo && selectedLayerInfo.layer && selectedLayerInfo.page) {
                selectedLayerInfo.layer.color = hex;
                renderCardCanvas(selectedLayerInfo.page);
            }
        });
    }

    const applySizeChange = (newSize) => {
        state.annSize = newSize;
        if (selectedLayerInfo && selectedLayerInfo.layer && selectedLayerInfo.page) {
            selectedLayerInfo.layer.fontSize = newSize;
            renderCardCanvas(selectedLayerInfo.page);
        }
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
}
