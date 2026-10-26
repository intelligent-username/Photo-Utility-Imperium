// ===========================================
//  pdfFormFieldUI.js — Form field interactive DOM elements & facade
// ===========================================

import { getState } from './pdfState.js';
import { openAnnotationInput } from './pdfAnnotationPopover.js';
import { getFormFieldMetrics, findAnnotationForField } from './pdfFormFieldMetrics.js';
import { renderCardCanvas } from './pdfRender.js';
import { snapshotPageFormFields } from './pdfHistory.js';
import { showFieldDeleteDialog, confirmDeleteField } from './pdfFormFieldDialogs.js';
import { startCreateFormField } from './pdfFormFieldCreate.js';

export {
    showFieldDeleteDialog,
    confirmDeleteField,
    startCreateFormField
};

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

        if (handleEl) {
            isResizing = true;
            activeHandle = handleEl.dataset.handle;
        } else {
            isDragging = true;
            activeHandle = null;
        }

        const onMove = (me) => {
            const diffX = me.clientX - startX;
            const diffY = me.clientY - startY;
            if (Math.abs(diffX) > 2 || Math.abs(diffY) > 2) {
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
            } else if (isResizing) {
                let newW = initWidth;
                let newH = initHeight;
                let newL = initLeft;
                let newT = initTop;

                const minW = Math.max(0.02, 20 / (wRect.width || 1));
                const minH = Math.max(0.015, 12 / (wRect.height || 1));

                if (activeHandle === 'se') {
                    newW = Math.max(minW, Math.min(1.0 - initLeft, initWidth + dx));
                    newH = Math.max(minH, Math.min(1.0 - initTop, initHeight + dy));
                } else if (activeHandle === 'sw') {
                    newW = Math.max(minW, Math.min(initLeft + initWidth, initWidth - dx));
                    newH = Math.max(minH, Math.min(1.0 - initTop, initHeight + dy));
                    newL = initLeft + (initWidth - newW);
                } else if (activeHandle === 'ne') {
                    newW = Math.max(minW, Math.min(1.0 - initLeft, initWidth + dx));
                    newH = Math.max(minH, Math.min(initTop + initHeight, initHeight - dy));
                    newT = initTop + (initHeight - newH);
                } else if (activeHandle === 'nw') {
                    newW = Math.max(minW, Math.min(initLeft + initWidth, initWidth - dx));
                    newH = Math.max(minH, Math.min(initTop + initHeight, initHeight - dy));
                    newL = initLeft + (initWidth - newW);
                    newT = initTop + (initHeight - newH);
                }

                field.leftRatio = Math.max(0, newL);
                field.topRatio = Math.max(0, newT);
                field.widthRatio = newW;
                field.heightRatio = newH;

                fieldEl.style.left = `${(field.leftRatio * 100).toFixed(2)}%`;
                fieldEl.style.top = `${(field.topRatio * 100).toFixed(2)}%`;
                fieldEl.style.width = `${(field.widthRatio * 100).toFixed(2)}%`;
                fieldEl.style.height = `${(field.heightRatio * 100).toFixed(2)}%`;
            }
        };

        const onUp = () => {
            const wasResizing = isResizing;
            isDragging = false;
            isResizing = false;
            const c2 = card || document.getElementById(page.id);
            if (c2) c2.draggable = (getState().mode === 'select');
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);

            if (moved) {
                if (wasResizing) {
                    const pdfPageHeight = 612 * ((page && page.aspectRatio) || (792 / 612));
                    const fieldHeightPt = field.heightRatio * pdfPageHeight;
                    field.inferredFontSize = Math.max(8, Math.min(48, Math.round(fieldHeightPt * 0.70)));
                }
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
