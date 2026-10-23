// ===========================================
//  pdfTextLayer.js — Pre-existing PDF text extraction & pixel-perfect in-place editing
// ===========================================

import { getState } from './pdfState.js';
import { renderCardCanvas } from './pdfRender.js';
import { snapshotPageLayers } from './pdfHistory.js';

/**
 * Samples glyph pixels from the rendered canvas at the line bounding box
 * to determine the exact ground-truth text color.
 */
function sampleLineTextColor(canvas, line) {
    if (!canvas || canvas.width === 0 || canvas.height === 0) return '#000000';
    try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return '#000000';

        const cx = Math.max(0, Math.floor(line.leftRatio * canvas.width));
        const cy = Math.max(0, Math.floor(line.topRatio * canvas.height));
        const cw = Math.max(1, Math.min(canvas.width - cx, Math.floor(line.widthRatio * canvas.width)));
        const ch = Math.max(1, Math.min(canvas.height - cy, Math.floor(line.heightRatio * canvas.height)));

        const sampleW = Math.min(cw, 80);
        const imgData = ctx.getImageData(cx, cy, sampleW, ch);
        const data = imgData.data;

        let darkestLum = 255;
        let bestR = 0, bestG = 0, bestB = 0;
        let found = false;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            if (a < 128) continue;
            // Luminance: 0.299R + 0.587G + 0.114B
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            // Ignore near-white canvas background pixels (lum > 235)
            if (lum < 235 && lum < darkestLum) {
                darkestLum = lum;
                bestR = r;
                bestG = g;
                bestB = b;
                found = true;
            }
        }

        if (found) {
            const toHex = (c) => c.toString(16).padStart(2, '0');
            return `#${toHex(bestR)}${toHex(bestG)}${toHex(bestB)}`;
        }
        return '#000000';
    } catch (_) {
        return '#000000';
    }
}

/**
 * Extracts text items from a PDF.js page and clusters them into distinct lines with exact typography metrics.
 */
export async function extractPageTextLines(pdfPage) {
    if (!pdfPage || typeof pdfPage.getTextContent !== 'function') return [];
    try {
        const textContent = await pdfPage.getTextContent();
        const vp = pdfPage.getViewport({ scale: 1.0 });
        const items = textContent.items || [];
        const styles = textContent.styles || {};
        if (items.length === 0) return [];

        const parsedItems = [];
        for (const it of items) {
            const rawStr = it.str || '';
            if (!rawStr.trim()) continue;

            const tx = it.transform; // [scaleX, skewY, skewX, scaleY, transX, transY]
            const x = tx[4];
            const y = tx[5];
            const scaleX = Math.hypot(tx[0], tx[1]);
            const scaleY = Math.hypot(tx[2], tx[3]);
            const fontHeight = Math.max(scaleY, it.height || 0) || scaleX || 12;
            const itemWidth = it.width || (rawStr.length * fontHeight * 0.55);

            // In PDF coordinate space, (x, y) is bottom-left of the glyph
            const leftRatio = Math.max(0, Math.min(1.0, x / vp.width));
            const topRatio = Math.max(0, Math.min(1.0, (vp.height - (y + fontHeight * 0.95)) / vp.height));
            const widthRatio = Math.max(0.005, Math.min(1.0 - leftRatio, itemWidth / vp.width));
            const heightRatio = Math.max(0.005, Math.min(1.0 - topRatio, (fontHeight * 1.30) / vp.height));

            // Extract real font name and styles
            const style = styles[it.fontName] || {};
            let rawFontName = it.fontName || '';
            try {
                if (pdfPage.commonObjs && typeof pdfPage.commonObjs.has === 'function' && pdfPage.commonObjs.has(it.fontName)) {
                    const fo = pdfPage.commonObjs.get(it.fontName);
                    if (fo && (fo.name || fo.fallbackName)) {
                        rawFontName = fo.name || fo.fallbackName;
                    }
                }
            } catch (_) {}
            if (!rawFontName && style.fontFamily) {
                rawFontName = style.fontFamily;
            }

            const cleanFont = rawFontName.replace(/^[A-Z]{6}\+/, '');
            const fnLower = cleanFont.toLowerCase();
            let fontFamily = 'Arial, "Helvetica Neue", Helvetica, sans-serif';
            let isBold = false;

            if (fnLower.includes('times') || fnLower.includes('serif') || fnLower.includes('roman') || fnLower.includes('cambria') || fnLower.includes('georgia') || fnLower.includes('garamond')) {
                if (fnLower.includes('georgia')) {
                    fontFamily = 'Georgia, "Times New Roman", serif';
                } else if (fnLower.includes('garamond')) {
                    fontFamily = 'Garamond, "Times New Roman", serif';
                } else {
                    fontFamily = '"Times New Roman", Times, Georgia, serif';
                }
            } else if (fnLower.includes('courier') || fnLower.includes('mono') || fnLower.includes('consolas')) {
                if (fnLower.includes('consolas')) {
                    fontFamily = 'Consolas, "Courier New", monospace';
                } else {
                    fontFamily = '"Courier New", Courier, monospace';
                }
            } else if (fnLower.includes('calibri')) {
                fontFamily = 'Calibri, "Segoe UI", Arial, sans-serif';
            } else if (fnLower.includes('verdana')) {
                fontFamily = 'Verdana, Geneva, sans-serif';
            } else if (fnLower.includes('tahoma')) {
                fontFamily = 'Tahoma, Verdana, sans-serif';
            } else if (fnLower.includes('trebuchet')) {
                fontFamily = '"Trebuchet MS", Arial, sans-serif';
            } else {
                fontFamily = 'Arial, "Helvetica Neue", Helvetica, sans-serif';
            }

            if (
                fnLower.includes('bold') ||
                fnLower.includes('black') ||
                fnLower.includes('heavy') ||
                fnLower.includes('demi') ||
                fnLower.includes('medium') ||
                fnLower.includes('w7') ||
                fnLower.includes('w8') ||
                fnLower.includes('w9') ||
                fnLower.includes('-b') ||
                fnLower.includes('ps-b')
            ) {
                isBold = true;
            }

            parsedItems.push({
                text: rawStr,
                fontSize: parseFloat(fontHeight.toFixed(2)),
                fontFamily,
                rawFontName: cleanFont,
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
                if (vertDiff < maxH * 0.45) {
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
                    rawFontName: item.rawFontName,
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
                rawFontName: line.rawFontName,
                bold: line.bold,
                originalBold: line.bold
            };
        }).filter(l => l.text.length > 0);

    } catch (e) {
        console.warn('extractPageTextLines error:', e);
        return [];
    }
}

/**
 * Renders structured runs ({ text, bold }) into a container element as styled fragments.
 */
export function renderRunsToElement(el, runs, fallbackText = '', fallbackBold = false) {
    el.innerHTML = '';
    if (Array.isArray(runs) && runs.length > 0) {
        for (const run of runs) {
            if (!run.text) continue;
            if (run.bold) {
                const b = document.createElement('b');
                b.textContent = run.text;
                b.style.fontWeight = '700';
                el.appendChild(b);
            } else {
                const s = document.createElement('span');
                s.textContent = run.text;
                s.style.fontWeight = '400';
                el.appendChild(s);
            }
        }
    } else {
        if (fallbackBold) {
            const b = document.createElement('b');
            b.textContent = fallbackText || '';
            b.style.fontWeight = '700';
            el.appendChild(b);
        } else {
            el.textContent = fallbackText || '';
        }
    }
}

/**
 * Extracts structured runs ({ text, bold }) from a contenteditable DOM element.
 */
export function extractRunsFromElement(rootNode, defaultBold = false) {
    const rawRuns = [];

    function traverse(node, currentBold) {
        if (node.nodeType === Node.TEXT_NODE) {
            const txt = node.textContent;
            if (txt && txt.length > 0) {
                rawRuns.push({ text: txt, bold: currentBold });
            }
            return;
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();
            if (tagName === 'br') {
                rawRuns.push({ text: '\n', bold: currentBold });
                return;
            }

            let isBold = currentBold;
            const fw = node.style ? (node.style.fontWeight || '').toLowerCase() : '';
            if (tagName === 'b' || tagName === 'strong' || fw === 'bold' || fw === '700' || fw === '800' || fw === '900') {
                isBold = true;
            } else if (tagName === 'span' && (fw === 'normal' || fw === '400')) {
                isBold = false;
            }

            for (const child of node.childNodes) {
                traverse(child, isBold);
            }
        }
    }

    traverse(rootNode, defaultBold);

    const merged = [];
    for (const r of rawRuns) {
        if (!r.text) continue;
        if (merged.length > 0 && merged[merged.length - 1].bold === r.bold) {
            merged[merged.length - 1].text += r.text;
        } else {
            merged.push({ text: r.text, bold: !!r.bold });
        }
    }

    const fullText = merged.map(r => r.text).join('');
    const anyBold = merged.some(r => r.bold);
    const allBold = merged.length > 0 && merged.every(r => r.bold);
    const hasPartialBold = anyBold && !allBold;

    return {
        runs: merged,
        text: fullText,
        allBold: allBold,
        anyBold: anyBold,
        hasPartialBold: hasPartialBold
    };
}

/**
 * Measures text using an offscreen canvas and computes word-spacing or letter-spacing
 * to precisely match the PDF line's target width.
 */
let _measureCtx = null;
export function computeLineSpacing(text, targetPixelWidth, fontSize, fontFamily, isBold) {
    if (!text || !targetPixelWidth || targetPixelWidth <= 0 || !fontSize || fontSize <= 0) {
        return { wordSpacing: 0, letterSpacing: 0 };
    }

    try {
        if (!_measureCtx) {
            const c = document.createElement('canvas');
            _measureCtx = c.getContext('2d', { willReadFrequently: true });
        }
        if (!_measureCtx) return { wordSpacing: 0, letterSpacing: 0 };

        const weight = isBold ? '700' : '400';
        _measureCtx.font = `${weight} ${fontSize}px ${fontFamily || 'Arial, "Helvetica Neue", Helvetica, sans-serif'}`;
        const naturalWidth = _measureCtx.measureText(text).width;

        if (!naturalWidth || naturalWidth <= 0) return { wordSpacing: 0, letterSpacing: 0 };

        const diff = targetPixelWidth - naturalWidth;
        if (Math.abs(diff) <= 2) {
            return { wordSpacing: 0, letterSpacing: 0 };
        }

        const spaceCount = (text.match(/ /g) || []).length;
        if (diff > 2) {
            if (spaceCount >= 2) {
                const extraPerSpace = diff / spaceCount;
                if (extraPerSpace <= 28) {
                    return { wordSpacing: parseFloat(extraPerSpace.toFixed(2)), letterSpacing: 0 };
                }
            }
            const charCount = Math.max(1, text.length - 1);
            const extraPerChar = diff / charCount;
            if (extraPerChar <= 8) {
                return { wordSpacing: 0, letterSpacing: parseFloat(extraPerChar.toFixed(2)) };
            }
        } else if (diff < -2) {
            if (spaceCount >= 2) {
                const shrinkPerSpace = diff / spaceCount;
                if (shrinkPerSpace >= -3.5) {
                    return { wordSpacing: parseFloat(shrinkPerSpace.toFixed(2)), letterSpacing: 0 };
                }
            }
            const shrinkPerChar = diff / Math.max(1, text.length - 1);
            if (shrinkPerChar >= -1.5) {
                return { wordSpacing: 0, letterSpacing: parseFloat(shrinkPerChar.toFixed(2)) };
            }
        }
    } catch (_) {}

    return { wordSpacing: 0, letterSpacing: 0 };
}

/**
 * Activates direct in-place contenteditable editing with typography identical to the canvas result.
 */
function activateDirectInlineEdit(wrap, page, line, span, displayFontSize, linePixelHeight) {
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
