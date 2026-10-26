// ===========================================
//  pdfAnnotations.js — Annotations facade re-exporting focused modules
// ===========================================

export {
    getContrastBgColor,
    formatDate
} from './pdfDateUtils.js';

export {
    generateSignatureDataUrl,
    saveSignatureStamp,
    removeSignatureStamp,
    loadSavedSignatures
} from './pdfSignatures.js';

export {
    getFormFieldMetrics,
    getSortedFormFields,
    findAnnotationForField
} from './pdfFormFieldMetrics.js';

export {
    openAnnotationInput
} from './pdfAnnotationPopover.js';

export {
    startWhiteout
} from './pdfWhiteoutTool.js';

export {
    startDrawLine
} from './pdfLineTool.js';
