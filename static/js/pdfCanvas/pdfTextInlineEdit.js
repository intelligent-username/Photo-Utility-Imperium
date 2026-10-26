// ===========================================
//  pdfTextInlineEdit.js — In-place contenteditable direct text editing
// ===========================================

import { getState } from './pdfState.js';
import { renderCardCanvas } from './pdfRender.js';
import { snapshotPageLayers } from './pdfHistory.js';
import { renderRunsToElement, extractRunsFromElement, computeLineSpacing } from './pdfTextRuns.js';

/**
 * Activates direct in-place contenteditable editing with typography identical to the canvas result.
 */
export function activateDirectInlineEdit(wrap, page, line, span, displayFontSize, linePixelHeight) {
    const card = document.getElementById(page.id);
    if (card) card.draggable = false;

    const wrapRect = wrap.getBoundingClientRect();
    const canvas = wrap.querySelector('canvas');
    const currentWrapWidth = wrapRect.width || (canvas ? canvas.clientWidth : 612);
    const linePixelWidth = line.widthRatio * currentWrapWidth;

    const edit = page.textEdits ? page.textEdits[line.id] : null;
    const initialText = edit ? edit.text : (line.originalText || line.text);
    let currentBold = (edit && edit.bold !== undefined) ? edit.bold : Boolean(line.bold);

    const spacing = computeLineSpacing(
        initialText,
        linePixelWidth,
        displayFontSize,
        line.fontFamily,
        currentBold
    );

    span.classList.add('is-editing');
    span.contentEditable = 'true';
    span.spellcheck = false;

    // Apply exact typography and geometry to match the underlying text
    span.style.backgroundColor = '#ffffff';
    span.style.minWidth = `${(line.widthRatio * 100).toFixed(3)}%`;
    span.style.width = 'fit-content';
    span.style.maxWidth = `calc(100% - ${(line.leftRatio * 100).toFixed(3)}% - 4px)`;
    span.style.fontFamily = line.fontFamily || 'Arial, "Helvetica Neue", Helvetica, sans-serif';
    span.style.fontSize = `${displayFontSize}px`;
    span.style.fontWeight = '400';
    span.style.color = (edit && edit.color) || line.color || '#000000';
    span.style.lineHeight = `${Math.round(linePixelHeight * 0.95)}px`;
    span.style.whiteSpace = 'pre';
    span.style.padding = '1px 3px';
    span.style.boxSizing = 'border-box';
    span.style.margin = '0';
    span.style.zIndex = '35';

    if (spacing.wordSpacing !== 0) {
        span.style.wordSpacing = `${spacing.wordSpacing}px`;
    } else {
        span.style.wordSpacing = 'normal';
    }
    if (spacing.letterSpacing !== 0) {
        span.style.letterSpacing = `${spacing.letterSpacing}px`;
    } else {
        span.style.letterSpacing = 'normal';
    }

    // Populate initial content: prioritize structured runs, fallback to bold tag or plain text
    if (edit && edit.runs && edit.runs.length > 0) {
        renderRunsToElement(span, edit.runs, initialText, currentBold);
    } else if (currentBold) {
        renderRunsToElement(span, [{ text: initialText, bold: true }], initialText, true);
    } else {
        span.textContent = initialText;
    }

    // Sync toolbar bold button with current selection / caret bold state
    const boldToggleBtn = document.getElementById('ann-bold-toggle');
    const updateToolbarBold = () => {
        try {
            const isB = document.queryCommandState('bold');
            if (boldToggleBtn) boldToggleBtn.classList.toggle('active', isB);
            getState().annBold = isB;
        } catch (_) {}
    };

    const toggleSelectionBold = () => {
        span.focus();
        document.execCommand('bold', false, null);
        updateToolbarBold();
    };

    const onCustomToggleBold = () => {
        toggleSelectionBold();
    };
    span.addEventListener('toggle-bold', onCustomToggleBold);

    // Track caret/selection movements to keep toolbar button in sync
    const onSelectionChange = () => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const anchor = sel.anchorNode;
            if (anchor && (span === anchor || span.contains(anchor))) {
                updateToolbarBold();
            }
        }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    span.addEventListener('keyup', updateToolbarBold);
    span.addEventListener('mouseup', updateToolbarBold);

    // Focus and select all contents
    span.focus();
    try {
        const range = document.createRange();
        range.selectNodeContents(span);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    } catch (_) {}
    updateToolbarBold();

    let finished = false;

    const cleanup = () => {
        span.removeEventListener('keydown', onKeyDown);
        span.removeEventListener('blur', onBlur);
        span.removeEventListener('keyup', updateToolbarBold);
        span.removeEventListener('mouseup', updateToolbarBold);
        span.removeEventListener('toggle-bold', onCustomToggleBold);
        document.removeEventListener('selectionchange', onSelectionChange);
        if (card) card.draggable = (getState().mode === 'select');
    };

    const commitEdit = () => {
        if (finished) return;
        finished = true;
        cleanup();

        const extracted = extractRunsFromElement(span, currentBold);
        const newText = extracted.text.replace(/[\r\n]+/g, ' ').trim();
        const runs = extracted.runs.map(r => ({
            text: r.text.replace(/[\r\n]+/g, ' '),
            bold: !!r.bold
        })).filter(r => r.text.length > 0);

        const origText = line.originalText || line.text;
        const origBold = Boolean(line.originalBold !== undefined ? line.originalBold : line.bold);
        const priorEdit = page.textEdits ? page.textEdits[line.id] : null;
        const priorText = priorEdit ? priorEdit.text : origText;
        const priorBold = priorEdit ? Boolean(priorEdit.bold) : origBold;
        const priorRuns = priorEdit ? priorEdit.runs : null;

        span.contentEditable = 'false';
        span.classList.remove('is-editing');

        const runsChanged = JSON.stringify(runs) !== JSON.stringify(priorRuns);
        const textChanged = (newText !== priorText);
        const boldChanged = (extracted.allBold !== priorBold);

        if (!textChanged && !boldChanged && !runsChanged) {
            if (!priorEdit) {
                span.innerHTML = '';
                span.style.backgroundColor = 'transparent';
                span.style.width = `${(line.widthRatio * 100).toFixed(3)}%`;
                span.style.fontWeight = origBold ? '700' : '400';
            } else {
                renderRunsToElement(span, priorEdit.runs, priorEdit.text, priorEdit.bold);
            }
            return;
        }

        // Snapshot undo history
        snapshotPageLayers(page);
        page.textEdits = page.textEdits || {};

        if (!extracted.hasPartialBold && newText === origText && extracted.allBold === origBold) {
            // Restored original PDF text and original boldness
            delete page.textEdits[line.id];
            line.text = origText;
            line.bold = origBold;
            delete line.runs;
            span.classList.remove('has-edit');
            span.innerHTML = '';
            span.style.backgroundColor = 'transparent';
            span.style.width = `${(line.widthRatio * 100).toFixed(3)}%`;
            span.style.fontWeight = origBold ? '700' : '400';
            span.title = `Click to edit text: "${line.text}"`;
        } else {
            // Compute word spacing in PDF points for backend vector insertion
            const currentWrapH = wrap.getBoundingClientRect().height || (canvas ? canvas.clientHeight : 800);
            const curScale = (page._pdfPage && page._pdfPage.getViewport({ scale: 1.0 }).height > 0)
                ? (currentWrapH / page._pdfPage.getViewport({ scale: 1.0 }).height)
                : 1.0;
            const updatedSpacing = computeLineSpacing(newText, line.widthRatio * currentWrapWidth, displayFontSize, line.fontFamily, extracted.allBold);
            const pdfWordSpacing = (curScale > 0 && updatedSpacing.wordSpacing) ? parseFloat((updatedSpacing.wordSpacing / curScale).toFixed(2)) : 0;

            // New direct text edit preserving exact original font, size, color, and justified word spacing
            page.textEdits[line.id] = {
                id: line.id,
                originalText: origText,
                text: newText,
                runs: runs,
                bold: extracted.allBold,
                hasPartialBold: extracted.hasPartialBold,
                leftRatio: line.leftRatio,
                topRatio: line.topRatio,
                widthRatio: line.widthRatio,
                heightRatio: line.heightRatio,
                fontSize: line.fontSize,
                fontFamily: line.fontFamily,
                rawFontName: line.rawFontName || '',
                wordSpacing: pdfWordSpacing,
                color: (edit && edit.color) || line.color || '#000000'
            };
            line.text = newText;
            line.bold = extracted.allBold;
            line.runs = runs;
            span.classList.add('has-edit');
            renderRunsToElement(span, runs, newText, extracted.allBold);
            span.style.backgroundColor = '#ffffff';
            span.style.width = 'fit-content';
            span.style.minWidth = `${(line.widthRatio * 100).toFixed(3)}%`;
            span.style.fontWeight = '400';
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
            if (priorEdit.runs && priorEdit.runs.length > 0) {
                renderRunsToElement(span, priorEdit.runs, priorEdit.text, priorEdit.bold);
            } else {
                span.innerText = priorEdit.text;
                span.style.fontWeight = priorEdit.bold ? '700' : '400';
            }
            span.style.backgroundColor = '#ffffff';
            span.style.width = 'fit-content';
            span.style.minWidth = `${(line.widthRatio * 100).toFixed(3)}%`;
        } else {
            span.innerHTML = '';
            span.style.backgroundColor = 'transparent';
            span.classList.remove('has-edit');
            span.style.width = `${(line.widthRatio * 100).toFixed(3)}%`;
            span.style.fontWeight = line.bold ? '700' : '400';
        }
    };

    const onKeyDown = (e) => {
        e.stopPropagation();
        if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
            e.preventDefault();
            toggleSelectionBold();
        } else if (e.key === 'Enter' && !e.shiftKey) {
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
