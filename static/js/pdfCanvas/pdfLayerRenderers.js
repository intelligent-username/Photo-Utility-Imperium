// ===========================================
//  pdfLayerRenderers.js — Layer render orchestration & facade
// ===========================================

import { getSortedFormFields } from './pdfFormFieldMetrics.js';
import { renderFormFieldElement } from './pdfFormFieldUI.js';
import { renderPageTextOverlay } from './pdfTextLayer.js';

import { renderAnnotationLayer } from './renderers/renderAnnotationLayer.js';
import { renderSignatureLayer } from './renderers/renderSignatureLayer.js';
import { renderOverlayLayer } from './renderers/renderOverlayLayer.js';
import { renderWhiteoutLayer } from './renderers/renderWhiteoutLayer.js';
import { renderLineLayer } from './renderers/renderLineLayer.js';

export {
    renderAnnotationLayer,
    renderSignatureLayer,
    renderOverlayLayer,
    renderWhiteoutLayer,
    renderLineLayer
};

/**
 * Render all interactive layers for a page card container.
 */
export function renderCardLayers(wrap, page) {
    wrap.querySelectorAll('.ann-marker, .overlay-rect, .signature-rect, .whiteout-rect-interactive, .pdf-form-field, .pdf-line-layer-svg').forEach(el => el.remove());
    const card = document.getElementById(page.id);

    // Render interactive PDF form field detection boxes
    if (page.formFields && page.formFields.length > 0) {
        const sortedFields = getSortedFormFields(page);
        sortedFields.forEach((field, fieldIndex) => {
            renderFormFieldElement(wrap, page, field, fieldIndex);
        });
    }

    // Render interactive pre-existing text layer
    renderPageTextOverlay(wrap, page);

    if (!page.layers || page.layers.length === 0) return;
    const wrapRect = wrap.getBoundingClientRect();
    const canvasScale = wrapRect.width > 0 ? (wrapRect.width / 612.0) : 0.55;

    page.layers.forEach(layer => {
        if (layer.type === 'annotation') {
            renderAnnotationLayer(wrap, page, layer, canvasScale, card);
        } else if (layer.type === 'signature') {
            renderSignatureLayer(wrap, page, layer, canvasScale, card);
        } else if (layer.type === 'overlay') {
            renderOverlayLayer(wrap, page, layer, card);
        } else if (layer.type === 'whiteout') {
            renderWhiteoutLayer(wrap, page, layer);
        } else if (layer.type === 'line') {
            renderLineLayer(wrap, page, layer, card);
        }
    });
}
