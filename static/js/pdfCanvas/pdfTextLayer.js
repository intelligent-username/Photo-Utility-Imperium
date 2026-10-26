// ===========================================
//  pdfTextLayer.js — Pre-existing PDF text extraction & interactive overlay rendering facade
// ===========================================

import { getState } from './pdfState.js';
import { renderRunsToElement, extractRunsFromElement, computeLineSpacing } from './pdfTextRuns.js';
import { sampleLineTextColor, extractPageTextLines } from './pdfTextExtractor.js';
import { activateDirectInlineEdit } from './pdfTextInlineEdit.js';

export {
    renderRunsToElement,
    extractRunsFromElement,
    computeLineSpacing,
    sampleLineTextColor,
    extractPageTextLines,
    activateDirectInlineEdit
};

/**
 * Renders transparent interactive spans for pre-existing text lines in the page card overlay.
 */
export function renderPageTextOverlay(wrap, page) {
    wrap.querySelectorAll('.pdf-extracted-text-line').forEach(el => el.remove());

    const lines = page._textLines;
    if (!lines || lines.length === 0) return;

    const canvas = wrap.querySelector('canvas');
    const wrapRect = wrap.getBoundingClientRect();
    const currentWrapHeight = wrapRect.height || (canvas ? canvas.clientHeight : 800);
    const currentWrapWidth = wrapRect.width || (canvas ? canvas.clientWidth : 612);

    // Compute scale ratio between PDF points (viewport 1.0) and screen pixels
    const pdfPage = page._pdfPage;
    let pageScale = 1.0;
    if (pdfPage && typeof pdfPage.getViewport === 'function') {
        const vp1 = pdfPage.getViewport({ scale: 1.0 });
        if (vp1.height > 0 && currentWrapHeight > 0) {
            pageScale = currentWrapHeight / vp1.height;
        }
    }

    lines.forEach(line => {
        // Sample ground-truth color from canvas if needed
        if (canvas && (!line.color || line.color === '#000000')) {
            const sampled = sampleLineTextColor(canvas, line);
            if (sampled) line.color = sampled;
        }

        const edit = page.textEdits ? page.textEdits[line.id] : null;
        const hasEdit = edit !== null && edit !== undefined;
        const currentText = hasEdit ? edit.text : line.text;
        const isLineBold = (hasEdit && edit.bold !== undefined) ? edit.bold : Boolean(line.bold);

        const span = document.createElement('div');
        span.className = 'pdf-extracted-text-line' + (hasEdit ? ' has-edit' : '');
        span.dataset.lineId = line.id;
        span.style.left = `${(line.leftRatio * 100).toFixed(3)}%`;
        span.style.top = `${(line.topRatio * 100).toFixed(3)}%`;
        span.style.width = hasEdit ? 'fit-content' : `${(line.widthRatio * 100).toFixed(3)}%`;
        span.style.minWidth = `${(line.widthRatio * 100).toFixed(3)}%`;
        span.style.height = `${(line.heightRatio * 100).toFixed(3)}%`;

        // Calculate display font size that matches canvas text
        const linePixelHeight = line.heightRatio * currentWrapHeight;
        let displayFontSize = 0;
        if (pageScale > 0 && line.fontSize) {
            displayFontSize = Math.round(line.fontSize * pageScale);
        }
        if (!displayFontSize || displayFontSize < 6) {
            displayFontSize = Math.round(linePixelHeight * 0.85);
        }
        displayFontSize = Math.max(8, displayFontSize);

        span.style.fontFamily = line.fontFamily || 'Arial, "Helvetica Neue", Helvetica, sans-serif';
        span.style.fontSize = `${displayFontSize}px`;
        span.style.fontWeight = isLineBold ? '700' : '400';
        span.style.color = (edit && edit.color) || line.color || '#000000';
        span.style.lineHeight = `${Math.round(linePixelHeight * 0.95)}px`;
        span.style.padding = '1px 3px';
        span.style.boxSizing = 'border-box';
        span.style.margin = '0';

        // Apply dynamic spacing (justified or character tracking) to match underlying canvas
        const linePixelWidth = line.widthRatio * currentWrapWidth;
        const spacing = computeLineSpacing(
            currentText,
            linePixelWidth,
            displayFontSize,
            line.fontFamily,
            isLineBold
        );
        span.style.wordSpacing = (spacing.wordSpacing !== 0) ? `${spacing.wordSpacing}px` : 'normal';
        span.style.letterSpacing = (spacing.letterSpacing !== 0) ? `${spacing.letterSpacing}px` : 'normal';

        if (hasEdit) {
            if (edit.runs && edit.runs.length > 0) {
                renderRunsToElement(span, edit.runs, currentText, isLineBold);
            } else {
                span.innerText = currentText;
                span.style.fontWeight = isLineBold ? '700' : '400';
            }
            span.style.backgroundColor = '#ffffff';
            span.style.width = 'fit-content';
            span.style.minWidth = `${(line.widthRatio * 100).toFixed(3)}%`;
            span.title = `Edited text: "${currentText}" (Click to edit)`;
        } else {
            span.innerText = '';
            span.style.backgroundColor = 'transparent';
            span.title = `Click to edit text: "${line.text}"`;
        }

        span.addEventListener('click', (e) => {
            const state = getState();
            if (state.mode !== 'select' && state.mode !== 'annotate') return;
            if (span.classList.contains('is-editing')) return;

            e.stopPropagation();
            e.preventDefault();

            activateDirectInlineEdit(wrap, page, line, span, displayFontSize, linePixelHeight);
        });

        wrap.appendChild(span);
    });
}
