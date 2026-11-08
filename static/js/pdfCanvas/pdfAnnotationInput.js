// Initialize the content and appearance of an annotation popover input.
import { renderRunsToElement } from './pdfTextLayer.js';

export function initializeAnnotationInput({ input, existingAnn, options, isFormField, currentAnnBold, currentAnnColor, currentAnnFont, currentAnnSize, canvasScale }) {
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
}
