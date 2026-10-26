// ===========================================
//  pdfFormFieldCreate.js — Interactive drag creation of new PDF form fields
// ===========================================

import { renderCardCanvas } from './pdfRender.js';
import { snapshotPageFormFields } from './pdfHistory.js';
import { getFormFieldMetrics, getSortedFormFields } from './pdfFormFieldMetrics.js';
import { openAnnotationInput } from './pdfAnnotationPopover.js';

export function startCreateFormField(e, wrap, page) {
    const rect = wrap.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    const box = document.createElement('div');
    box.className = 'pdf-form-field-creating';
    box.style.left = `${startX}px`;
    box.style.top = `${startY}px`;
    box.style.width = '0px';
    box.style.height = '0px';
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
