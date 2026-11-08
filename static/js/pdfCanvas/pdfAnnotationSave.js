// Persist the contents of an annotation popover to its page.
import { snapshotPageLayers } from './pdfHistory.js';
import { extractRunsFromElement } from './pdfTextLayer.js';

export function saveAnnotationInput({ page, input, isFormField, existingAnn, options, xR, yR, currentAnnBold, currentAnnColor, currentAnnSize, currentAnnFont }) {
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
}
