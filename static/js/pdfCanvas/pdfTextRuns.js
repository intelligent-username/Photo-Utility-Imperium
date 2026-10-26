// ===========================================
//  pdfTextRuns.js — Structured text runs parsing, rendering, and spacing calculation
// ===========================================

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
