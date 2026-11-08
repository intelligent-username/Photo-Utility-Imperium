// Field-by-field navigation for the annotation popover.
import { getFormFieldMetrics, getSortedFormFields, findAnnotationForField } from './pdfFormFieldMetrics.js';

export function navigateAnnotationField({ direction, wrap, page, xR, yR, options, onDocClick, commit, openAnnotationInput }) {
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
}
