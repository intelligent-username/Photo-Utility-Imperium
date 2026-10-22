// ===========================================
//  pdfTextLayer.js — Pre-existing PDF text extraction & direct in-place editing
// ===========================================

import { getState } from './pdfState.js';
import { renderCardCanvas } from './pdfRender.js';
import { snapshotPageLayers } from './pdfHistory.js';

/**
 * Extracts text items from a PDF.js page and clusters them into distinct lines.
 */
export async function extractPageTextLines(pdfPage) {
    if (!pdfPage || typeof pdfPage.getTextContent !== 'function') return [];
    try {
        const textContent = await pdfPage.getTextContent();
        const vp = pdfPage.getViewport({ scale: 1.0 });
        const items = textContent.items || [];
        if (items.length === 0) return [];

        // Map items to normalized coordinate boxes (ratios relative to page dimensions)
        const parsedItems = [];
        for (const it of items) {
            const rawStr = it.str || '';
            if (!rawStr.trim()) continue;

            const tx = it.transform; // [scaleX, skewY, skewX, scaleY, transX, transY]
            const x = tx[4];
            const y = tx[5];
            const fontHeight = Math.hypot(tx[2], tx[3]) || it.height || 12;
            const itemWidth = it.width || (rawStr.length * fontHeight * 0.55);

            // In PDF coordinate space, (x, y) is bottom-left of the glyph
            const leftRatio = Math.max(0, Math.min(1.0, x / vp.width));
            const topRatio = Math.max(0, Math.min(1.0, (vp.height - (y + fontHeight)) / vp.height));
            const widthRatio = Math.max(0.005, Math.min(1.0 - leftRatio, itemWidth / vp.width));
            const heightRatio = Math.max(0.005, Math.min(1.0 - topRatio, (fontHeight * 1.15) / vp.height));

            let fontName = it.fontName || '';
            let fontFamily = 'Helvetica, Arial, sans-serif';
            let isBold = false;
            const fnLower = fontName.toLowerCase();
            if (fnLower.includes('times') || fnLower.includes('serif') || fnLower.includes('roman') || fnLower.includes('georgia') || fnLower.includes('cambria')) {
                fontFamily = 'Times New Roman, serif';
            } else if (fnLower.includes('courier') || fnLower.includes('mono') || fnLower.includes('consolas')) {
                fontFamily = 'Courier New, monospace';
            } else {
                fontFamily = 'Helvetica, Arial, sans-serif';
            }
            if (fnLower.includes('bold') || fnLower.includes('black') || fnLower.includes('heavy') || fnLower.includes('demi') || fnLower.includes('medium') || fnLower.includes('w7') || fnLower.includes('w8') || fnLower.includes('w9')) {
                isBold = true;
            }

            parsedItems.push({
                text: rawStr,
                fontSize: Math.round(fontHeight),
                fontFamily,
                bold: isBold,
                leftRatio,
                topRatio,
                rightRatio: leftRatio + widthRatio,
                bottomRatio: topRatio + heightRatio,
                widthRatio,
                heightRatio,
                centerY: topRatio + heightRatio / 2,
            });
        }

        if (parsedItems.length === 0) return [];

        // Sort parsed items by vertical reading order (top to bottom), then left to right
        parsedItems.sort((a, b) => (a.topRatio - b.topRatio) || (a.leftRatio - b.leftRatio));

        const lines = [];
        for (const item of parsedItems) {
            let matchedLine = null;
            for (const line of lines) {
                const vertDiff = Math.abs(item.centerY - line.centerY);
                const maxH = Math.max(item.heightRatio, line.heightRatio);
                // Vertical alignment tolerance
                if (vertDiff < maxH * 0.45) {
                    // Check horizontal gap: if too large (across columns > 8% of page), do not merge
                    const gap = item.leftRatio - line.rightRatio;
                    if (gap >= -0.01 && gap < 0.08) {
                        matchedLine = line;
                        break;
                    }
                }
            }

            if (matchedLine) {
                matchedLine.items.push(item);
                matchedLine.leftRatio = Math.min(matchedLine.leftRatio, item.leftRatio);
                matchedLine.topRatio = Math.min(matchedLine.topRatio, item.topRatio);
                const right = Math.max(matchedLine.rightRatio, item.rightRatio);
                matchedLine.rightRatio = right;
                matchedLine.widthRatio = Math.min(1.0 - matchedLine.leftRatio, right - matchedLine.leftRatio);
                const bottom = Math.max(matchedLine.bottomRatio, item.bottomRatio);
                matchedLine.bottomRatio = bottom;
                matchedLine.heightRatio = bottom - matchedLine.topRatio;
                matchedLine.centerY = (matchedLine.topRatio + matchedLine.bottomRatio) / 2;
                matchedLine.fontSize = Math.max(matchedLine.fontSize, item.fontSize);
                if (item.bold) matchedLine.bold = true;
            } else {
                lines.push({
                    id: `tl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    items: [item],
                    leftRatio: item.leftRatio,
                    topRatio: item.topRatio,
                    rightRatio: item.rightRatio,
                    bottomRatio: item.bottomRatio,
                    widthRatio: item.widthRatio,
                    heightRatio: item.heightRatio,
                    centerY: item.centerY,
                    fontSize: item.fontSize,
                    fontFamily: item.fontFamily,
                    bold: item.bold,
                });
            }
        }

        // Assemble combined string with intelligent spacing for each line
        return lines.map(line => {
            line.items.sort((a, b) => a.leftRatio - b.leftRatio);
            let combinedStr = '';
            for (let i = 0; i < line.items.length; i++) {
                const cur = line.items[i];
                if (i === 0) {
                    combinedStr += cur.text;
                } else {
                    const prev = line.items[i - 1];
                    const gap = cur.leftRatio - prev.rightRatio;
                    // If gap indicates a word break, insert space unless already present
                    if (gap > 0.003 && !prev.text.endsWith(' ') && !cur.text.startsWith(' ')) {
                        combinedStr += ' ' + cur.text;
                    } else {
                        combinedStr += cur.text;
                    }
                }
            }
            const cleanText = combinedStr.replace(/\s+/g, ' ').trim();
            return {
                id: line.id,
                originalText: cleanText,
                text: cleanText,
                leftRatio: line.leftRatio,
                topRatio: line.topRatio,
                widthRatio: line.widthRatio,
                heightRatio: line.heightRatio,
                fontSize: line.fontSize,
                fontFamily: line.fontFamily,
                bold: line.bold
            };
        }).filter(l => l.text.length > 0);

    } catch (e) {
        console.warn('extractPageTextLines error:', e);
        return [];
    }
}

/**
 * Activates direct in-place contenteditable editing on the target text span.
 */
function activateDirectInlineEdit(wrap, page, line, span, displayFontSize) {
    const card = document.getElementById(page.id);
    if (card) card.draggable = false;

    const edit = page.textEdits ? page.textEdits[line.id] : null;
    const initialText = edit ? edit.text : (line.originalText || line.text);

    span.classList.add('is-editing');
    span.contentEditable = 'true';
    span.spellcheck = false;
    span.innerText = initialText;
    span.style.backgroundColor = '#ffffff';
    span.style.minWidth = `${(line.widthRatio * 100).toFixed(3)}%`;
    span.style.width = 'fit-content';
    span.style.maxWidth = `calc(100% - ${(line.leftRatio * 100).toFixed(3)}% - 6px)`;
    span.style.whiteSpace = 'pre';
    span.style.zIndex = '35';

    // Focus and select all contents
    span.focus();
    try {
        const range = document.createRange();
        range.selectNodeContents(span);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    } catch (_) {}

    let finished = false;

    const cleanup = () => {
        span.removeEventListener('keydown', onKeyDown);
        span.removeEventListener('blur', onBlur);
        if (card) card.draggable = (getState().mode === 'select');
    };

    const commitEdit = () => {
        if (finished) return;
        finished = true;
        cleanup();

        const newText = span.innerText.replace(/[\r\n]+/g, ' ').trim();
        const origText = line.originalText || line.text;
        const priorEdit = page.textEdits ? page.textEdits[line.id] : null;
        const priorText = priorEdit ? priorEdit.text : origText;

        span.contentEditable = 'false';
        span.classList.remove('is-editing');

        if (newText === priorText) {
            // Nothing changed
            if (!priorEdit) {
                span.innerText = '';
                span.style.backgroundColor = 'transparent';
                span.style.width = `${(line.widthRatio * 100).toFixed(3)}%`;
            }
            return;
        }

        // Snapshot undo history
        snapshotPageLayers(page);
        page.textEdits = page.textEdits || {};

        if (newText === origText) {
            // Restored original PDF text
            delete page.textEdits[line.id];
            line.text = origText;
            span.classList.remove('has-edit');
            span.innerText = '';
            span.style.backgroundColor = 'transparent';
            span.style.width = `${(line.widthRatio * 100).toFixed(3)}%`;
            span.title = `Click to edit text: "${line.text}"`;
        } else {
            // New direct text edit
            page.textEdits[line.id] = {
                id: line.id,
                originalText: origText,
                text: newText,
                leftRatio: line.leftRatio,
                topRatio: line.topRatio,
                widthRatio: line.widthRatio,
                heightRatio: line.heightRatio,
                fontSize: line.fontSize,
                fontFamily: line.fontFamily,
                bold: line.bold,
                color: line.color || '#000000'
            };
            line.text = newText;
            span.classList.add('has-edit');
            span.innerText = newText;
            span.style.backgroundColor = '#ffffff';
            span.style.width = 'fit-content';
            span.title = `Edited text: "${newText}" (Click to edit)`;
        }

        renderCardCanvas(page);
    };

    const cancelEdit = () => {
        if (finished) return;
        finished = true;
        cleanup();

        span.contentEditable = 'false';
        span.classList.remove('is-editing');

        const priorEdit = page.textEdits ? page.textEdits[line.id] : null;
        if (priorEdit) {
            span.innerText = priorEdit.text;
            span.style.backgroundColor = '#ffffff';
            span.style.width = 'fit-content';
        } else {
            span.innerText = '';
            span.style.backgroundColor = 'transparent';
            span.classList.remove('has-edit');
            span.style.width = `${(line.widthRatio * 100).toFixed(3)}%`;
        }
    };

    const onKeyDown = (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commitEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    };

    const onBlur = () => {
        commitEdit();
    };

    span.addEventListener('keydown', onKeyDown);
    span.addEventListener('blur', onBlur);
}

/**
 * Renders transparent interactive spans for pre-existing text lines in the page card overlay.
 */
export function renderPageTextOverlay(wrap, page) {
    wrap.querySelectorAll('.pdf-extracted-text-line').forEach(el => el.remove());

    const lines = page._textLines;
    if (!lines || lines.length === 0) return;

    const wrapRect = wrap.getBoundingClientRect();
    const vpHeight = (page.pdfPage && typeof page.pdfPage.getViewport === 'function')
        ? page.pdfPage.getViewport({ scale: 1.0 }).height
        : (wrapRect.height || 792);
    const scaleRatio = wrapRect.height > 0 ? (wrapRect.height / vpHeight) : 0.6;

    lines.forEach(line => {
        const edit = page.textEdits ? page.textEdits[line.id] : null;
        const hasEdit = edit !== null && edit !== undefined;
        const currentText = hasEdit ? edit.text : line.text;

        const span = document.createElement('div');
        span.className = 'pdf-extracted-text-line' + (hasEdit ? ' has-edit' : '');
        span.dataset.lineId = line.id;
        span.style.left = `${(line.leftRatio * 100).toFixed(3)}%`;
        span.style.top = `${(line.topRatio * 100).toFixed(3)}%`;
        span.style.width = hasEdit ? 'fit-content' : `${(line.widthRatio * 100).toFixed(3)}%`;
        span.style.minWidth = `${(line.widthRatio * 100).toFixed(3)}%`;
        span.style.height = `${(line.heightRatio * 100).toFixed(3)}%`;

        const displayFontSize = Math.max(9, Math.round((line.fontSize || 12) * scaleRatio));
        span.style.fontFamily = line.fontFamily || 'Helvetica, Arial, sans-serif';
        span.style.fontSize = `${displayFontSize}px`;
        span.style.fontWeight = line.bold ? '700' : '400';
        span.style.color = (edit && edit.color) || line.color || '#000000';
        span.style.lineHeight = '1.15';

        if (hasEdit) {
            span.innerText = currentText;
            span.style.backgroundColor = '#ffffff';
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

            activateDirectInlineEdit(wrap, page, line, span, displayFontSize);
        });

        wrap.appendChild(span);
    });
}
