// ===========================================
//  pdfTextExtractor.js — Extracts text items from PDF.js pages and clusters into lines
// ===========================================

/**
 * Samples glyph pixels from the rendered canvas at the line bounding box
 * to determine the exact ground-truth text color.
 */
export function sampleLineTextColor(canvas, line) {
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
