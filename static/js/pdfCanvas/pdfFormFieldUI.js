// ===========================================
//  pdfFormFieldUI.js — Form field interactive DOM elements, dialogs & creation tool
// ===========================================

import { getState } from './pdfState.js';
import { openAnnotationInput, getFormFieldMetrics, getSortedFormFields, findAnnotationForField } from './pdfAnnotations.js';
import { renderCardCanvas } from './pdfRender.js';
import { snapshotPageFormFields } from './pdfHistory.js';

// ── Field-form confirmation dialogs ─────────────────────────────────────────
export function showFieldDeleteDialog(onConfirm) {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000;display:flex;align-items:center;justify-content:center;';
    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#1e2130;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:24px 28px;min-width:320px;max-width:420px;color:#e8eaf0;font-family:inherit;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
    dialog.innerHTML = `
        <div style="font-size:15px;font-weight:600;margin-bottom:8px;">Spare the text?</div>
        <div style="font-size:13px;color:#9aa0b4;margin-bottom:20px;">Keep the text typed into this field as a regular annotation, or delete it along with the field?</div>
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
        close(); confirmDeleteField(true, onConfirm);
    });
    dialog.querySelector('#ffd-delete-text').addEventListener('click', () => {
        close(); confirmDeleteField(false, onConfirm);
    });
}

export function confirmDeleteField(spareText, onConfirm) {
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
    dialog.querySelector('#ffc-confirm').addEventListener('click', () => { close(); onConfirm(spareText); });
}

// ── Interactive form field rendering ────────────────────────────────────────
export function renderFormFieldElement(wrap, page, field, fieldIndex) {
    const card = document.getElementById(page.id);
    const fieldEl = document.createElement('div');
    fieldEl.className = 'pdf-form-field';
    fieldEl.style.left = `${(field.leftRatio * 100).toFixed(2)}%`;
    fieldEl.style.top = `${(field.topRatio * 100).toFixed(2)}%`;
    fieldEl.style.width = `${(field.widthRatio * 100).toFixed(2)}%`;
    fieldEl.style.height = `${(field.heightRatio * 100).toFixed(2)}%`;
    fieldEl.title = field.fieldName ? `Form Field: ${field.fieldName}` : 'Form Field (Click to write, drag to move/resize)';

    // Resize handles (free resizing)
    ['nw', 'ne', 'sw', 'se'].forEach(pos => {
        const handle = document.createElement('div');
        handle.className = `pdf-form-field-handle handle-${pos}`;
        handle.dataset.handle = pos;
        fieldEl.appendChild(handle);
    });

    const openFieldEdit = () => {
        const metrics = getFormFieldMetrics(field, page);
        const existing = findAnnotationForField(page, field);
        if (existing) {
            const existingMarker = [...wrap.querySelectorAll('.ann-marker')].find(el => {
                const elLeft = parseFloat(el.style.left);
                const elTop = parseFloat(el.style.top);
                return Math.abs(elLeft - existing.xRatio * 100) < 2 &&
                       Math.abs(elTop - existing.yRatio * 100) < 2;
            }) || null;
            openAnnotationInput(wrap, page, existing.xRatio, existing.yRatio, existing, existingMarker, {
                isFormField: true,
                fieldId: field.id,
                fieldIndex
            });
        } else {
            openAnnotationInput(wrap, page, metrics.xRatio, metrics.yRatio, null, null, {
                fontSize: metrics.fontSize,
                color: '#000000',
                isFormField: true,
                fieldId: field.id,
                fieldIndex,
                initialText: field.fieldValue || ''
            });
        }
    };

    // Dragging and resizing for form field
    let isDragging = false;
    let isResizing = false;
    let activeHandle = null;
    let startX = 0, startY = 0;
    let initLeft = field.leftRatio, initTop = field.topRatio;
    let initWidth = field.widthRatio, initHeight = field.heightRatio;
    let moved = false;

    fieldEl.addEventListener('mousedown', (e) => {
        const st = getState();
        if (st.mode === 'annotate' || st.mode === 'field-form-create') return;

        if (st.mode === 'field-form-delete') {
            e.stopPropagation();
            const existing = findAnnotationForField(page, field);
            const hasText = (existing && existing.text && existing.text.trim().length > 0) || (field.fieldValue && String(field.fieldValue).trim().length > 0);
            if (!hasText) {
                snapshotPageFormFields(page);
                if (existing) {
                    const idx = page.layers.indexOf(existing);
                    if (idx !== -1) page.layers.splice(idx, 1);
                }
                const fi = page.formFields.indexOf(field);
                if (fi !== -1) page.formFields.splice(fi, 1);
                renderCardCanvas(page);
                return;
            }
            showFieldDeleteDialog((spareText) => {
                const existing2 = findAnnotationForField(page, field);
                snapshotPageFormFields(page);
                if (!spareText && existing2) {
                    const idx = page.layers.indexOf(existing2);
                    if (idx !== -1) page.layers.splice(idx, 1);
                } else if (spareText && existing2) {
                    delete existing2.isFormField;
                }
                const fi = page.formFields.indexOf(field);
                if (fi !== -1) page.formFields.splice(fi, 1);
                renderCardCanvas(page);
            });
            return;
        }

        e.stopPropagation();
        const handleEl = e.target.closest('.pdf-form-field-handle');
        const c = card || document.getElementById(page.id);
        if (c) c.draggable = false;
        snapshotPageFormFields(page);

        const wRect = wrap.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        initLeft = field.leftRatio;
        initTop = field.topRatio;
        initWidth = field.widthRatio;
        initHeight = field.heightRatio;
        moved = false;

        const existingAnn = findAnnotationForField(page, field);
        const annInitX = existingAnn ? existingAnn.xRatio : 0;
        const annInitY = existingAnn ? existingAnn.yRatio : 0;

        const existingMarker = existingAnn ? [...wrap.querySelectorAll('.ann-marker')].find(el => {
            const elLeft = parseFloat(el.style.left);
            const elTop = parseFloat(el.style.top);
            return Math.abs(elLeft - existingAnn.xRatio * 100) < 2 &&
                   Math.abs(elTop - existingAnn.yRatio * 100) < 2;
        }) : null;

        if (handleEl) {
            isResizing = true;
            activeHandle = handleEl.dataset.handle;
        } else {
            isDragging = true;
        }

        const onMove = (me) => {
            if (!isDragging && !isResizing) return;
            const diffX = me.clientX - startX;
            const diffY = me.clientY - startY;
            if (Math.abs(diffX) > 3 || Math.abs(diffY) > 3) {
                moved = true;
            }
            if (!moved) return;

            const dx = diffX / (wRect.width || 1);
            const dy = diffY / (wRect.height || 1);

            if (isDragging) {
                field.leftRatio = Math.max(0, Math.min(1.0 - field.widthRatio, initLeft + dx));
                field.topRatio = Math.max(0, Math.min(1.0 - field.heightRatio, initTop + dy));
                fieldEl.style.left = `${(field.leftRatio * 100).toFixed(2)}%`;
                fieldEl.style.top = `${(field.topRatio * 100).toFixed(2)}%`;

                if (existingAnn) {
                    existingAnn.xRatio = Math.max(0, Math.min(0.98, annInitX + dx));
                    existingAnn.yRatio = Math.max(0, Math.min(0.98, annInitY + dy));
                    if (existingMarker) {
                        existingMarker.style.left = `${(existingAnn.xRatio * 100).toFixed(1)}%`;
                        existingMarker.style.top = `${(existingAnn.yRatio * 100).toFixed(1)}%`;
                    }
                }
            } else if (isResizing && activeHandle) {
                if (activeHandle === 'se') {
                    field.widthRatio = Math.max(0.02, Math.min(1.0 - initLeft, initWidth + dx));
                    field.heightRatio = Math.max(0.012, Math.min(1.0 - initTop, initHeight + dy));
                } else if (activeHandle === 'sw') {
                    const newLeft = Math.max(0, Math.min(initLeft + initWidth - 0.02, initLeft + dx));
                    field.widthRatio = initLeft + initWidth - newLeft;
                    field.leftRatio = newLeft;
                    field.heightRatio = Math.max(0.012, Math.min(1.0 - initTop, initHeight + dy));
                } else if (activeHandle === 'ne') {
                    const newTop = Math.max(0, Math.min(initTop + initHeight - 0.012, initTop + dy));
                    field.heightRatio = initTop + initHeight - newTop;
                    field.topRatio = newTop;
                    field.widthRatio = Math.max(0.02, Math.min(1.0 - initLeft, initWidth + dx));
                } else if (activeHandle === 'nw') {
                    const newLeft = Math.max(0, Math.min(initLeft + initWidth - 0.02, initLeft + dx));
                    const newTop = Math.max(0, Math.min(initTop + initHeight - 0.012, initTop + dy));
                    field.widthRatio = initLeft + initWidth - newLeft;
                    field.heightRatio = initTop + initHeight - newTop;
                    field.leftRatio = newLeft;
                    field.topRatio = newTop;
                }

                fieldEl.style.left = `${(field.leftRatio * 100).toFixed(2)}%`;
                fieldEl.style.top = `${(field.topRatio * 100).toFixed(2)}%`;
                fieldEl.style.width = `${(field.widthRatio * 100).toFixed(2)}%`;
                fieldEl.style.height = `${(field.heightRatio * 100).toFixed(2)}%`;

                const pdfPageHeight = 612 * ((page && page.aspectRatio) || (792 / 612));
                field.inferredFontSize = Math.max(8, Math.min(48, Math.round(field.heightRatio * pdfPageHeight * 0.70)));

                if (existingAnn) {
                    const metrics = getFormFieldMetrics(field, page);
                    existingAnn.fontSize = metrics.fontSize;
                    existingAnn.xRatio = metrics.xRatio;
                    existingAnn.yRatio = metrics.yRatio;
                    if (existingMarker) {
                        const cScale = wRect.width > 0 ? (wRect.width / 612.0) : 0.55;
                        existingMarker.style.fontSize = `${Math.max(9, existingAnn.fontSize * cScale)}px`;
                        existingMarker.style.left = `${(existingAnn.xRatio * 100).toFixed(1)}%`;
                        existingMarker.style.top = `${(existingAnn.yRatio * 100).toFixed(1)}%`;
                    }
                }
            }
        };

        const onUp = () => {
            isDragging = false;
            isResizing = false;
            activeHandle = null;
            const cardEl = card || document.getElementById(page.id);
            if (cardEl) cardEl.draggable = (getState().mode === 'select');
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);

            if (moved) {
                renderCardCanvas(page);
            } else {
                openFieldEdit();
            }
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    });

    wrap.appendChild(fieldEl);
    return fieldEl;
}

// ── Interactive drag-box creation tool ──────────────────────────────────────
export function startCreateFormField(e, wrap, page) {
    const state = getState();
    if (state.mode !== 'field-form-create') return;
    const rect = wrap.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    const box = document.createElement('div');
    box.className = 'pdf-form-field-creating';
    box.style.position = 'absolute';
    box.style.left = `${startX}px`;
    box.style.top = `${startY}px`;
    box.style.width = '0px';
    box.style.height = '0px';
    box.style.border = '2px dashed #3b82f6';
    box.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
    box.style.borderRadius = '2px';
    box.style.pointerEvents = 'none';
    box.style.zIndex = '30';
    box.style.boxSizing = 'border-box';
    wrap.appendChild(box);

    const onMove = (moveEv) => {
        const curX = Math.max(0, Math.min(rect.width, moveEv.clientX - rect.left));
        const curY = Math.max(0, Math.min(rect.height, moveEv.clientY - rect.top));
        const left = Math.min(startX, curX);
        const top = Math.min(startY, curY);
        const width = Math.abs(curX - startX);
        const height = Math.abs(curY - startY);

        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        const finalWidth = parseFloat(box.style.width);
        const finalHeight = parseFloat(box.style.height);

        if (finalWidth > 8 && finalHeight > 8) {
            snapshotPageFormFields(page);
            if (!page.formFields) page.formFields = [];
            const leftRatio = parseFloat(box.style.left) / rect.width;
            const topRatio = parseFloat(box.style.top) / rect.height;
            const widthRatio = finalWidth / rect.width;
            const heightRatio = finalHeight / rect.height;

            const pdfPageHeight = 612 * ((page && page.aspectRatio) || (792 / 612));
            const fieldHeightPt = heightRatio * pdfPageHeight;
            const inferredFontSize = Math.max(8, Math.min(48, Math.round(fieldHeightPt * 0.70)));

            const newField = {
                id: `fld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                fieldName: `Field ${page.formFields.length + 1}`,
                fieldType: 'Tx',
                fieldValue: '',
                readOnly: false,
                leftRatio,
                topRatio,
                widthRatio,
                heightRatio,
                inferredFontSize
            };
            page.formFields.push(newField);

            box.remove();
            renderCardCanvas(page);

            // Switch to Edit Field Form sub-mode
            const ffEditBtn = document.getElementById('ff-tool-edit');
            if (ffEditBtn) ffEditBtn.click();

            // Instantly open the annotation input for the new field
            const metrics = getFormFieldMetrics(newField, page);
            const sortedFields = getSortedFormFields(page);
            const fieldIndex = sortedFields.indexOf(newField);
            openAnnotationInput(wrap, page, metrics.xRatio, metrics.yRatio, null, null, {
                fontSize: metrics.fontSize,
                color: '#000000',
                isFormField: true,
                fieldId: newField.id,
                fieldIndex,
                initialText: ''
            });
            return;
        }
        box.remove();
        renderCardCanvas(page);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}
