// ===========================================
//  pdfAnnotations.js — Text, signatures, dates & whiteouts
// ===========================================

import { getState } from './pdfState.js';
import { renderCardCanvas } from './pdfRender.js';
import { snapshotPageLayers } from './pdfHistory.js';

export function getContrastBgColor(hexColor) {
    let r = 0, g = 0, b = 0;
    if (hexColor && hexColor.startsWith('#')) {
        const hex = hexColor.slice(1);
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        }
    }
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    if (brightness < 130) {
        return { bg: 'rgba(238, 240, 243, 0.96)', border: 'rgba(0, 0, 0, 0.25)' };
    } else {
        return { bg: 'rgba(30, 30, 30, 0.95)', border: 'rgba(255, 255, 255, 0.3)' };
    }
}

export function formatDate(format) {
    const d = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const day = d.getDate();
    const monthIdx = d.getMonth();
    const year = d.getFullYear();
    const mm = String(monthIdx + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');

    switch (format) {
        case 'words-short': return `${monthsShort[monthIdx]} ${day}, ${year}`;
        case 'words-long':  return `${months[monthIdx]} ${day}, ${year}`;
        case 'numeric-slash': return `${mm}/${dd}/${year}`;
        case 'numeric-dash':  return `${year}-${mm}-${dd}`;
        case 'numeric-dot':   return `${dd}.${mm}.${year}`;
        default: return `${monthsShort[monthIdx]} ${day}, ${year}`;
    }
}

export async function generateSignatureDataUrl(text, fontFamily, color) {
    // Ensure web font is loaded before measuring
    try {
        if (document.fonts && document.fonts.load) {
            await document.fonts.load(`64px "${fontFamily}"`);
        }
    } catch (e) {}

    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 400;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `64px "${fontFamily}", cursive, sans-serif`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(text, 100, 100);

    // Pixel-perfect bounding box detection via image data
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
    let found = false;

    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const alpha = data[(y * canvas.width + x) * 4 + 3];
            if (alpha > 5) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
            }
        }
    }

    if (!found) {
        minX = 100;
        minY = 100;
        maxX = 200;
        maxY = 150;
    }

    const cropW = Math.max(4, maxX - minX + 1);
    const cropH = Math.max(4, maxY - minY + 1);

    const trimCanvas = document.createElement('canvas');
    trimCanvas.width = cropW;
    trimCanvas.height = cropH;
    const trimCtx = trimCanvas.getContext('2d');

    trimCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

    return {
        dataUrl: trimCanvas.toDataURL('image/png'),
        naturalWidth: trimCanvas.width,
        naturalHeight: trimCanvas.height,
        aspectRatio: trimCanvas.width / trimCanvas.height
    };
}

export async function saveSignatureStamp(text, fontFamily, color) {
    const sigData = await generateSignatureDataUrl(text, fontFamily, color);
    const stamp = {
        id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text,
        fontFamily,
        color,
        dataUrl: sigData.dataUrl,
        naturalWidth: sigData.naturalWidth,
        naturalHeight: sigData.naturalHeight,
        aspectRatio: sigData.aspectRatio
    };
    const state = getState();
    state.signatures.push(stamp);
    state.activeSignature = stamp;
    try {
        localStorage.setItem('pdf_saved_signatures', JSON.stringify(state.signatures));
    } catch (e) {}
    return stamp;
}

export function removeSignatureStamp(stampId) {
    const state = getState();
    const idx = state.signatures.findIndex(s => s.id === stampId);
    if (idx !== -1) {
        state.signatures.splice(idx, 1);
        if (state.activeSignature && state.activeSignature.id === stampId) {
            state.activeSignature = state.signatures[0] || null;
        }
        try {
            localStorage.setItem('pdf_saved_signatures', JSON.stringify(state.signatures));
        } catch (e) {}
    }
}

export function loadSavedSignatures() {
    const state = getState();
    try {
        const raw = localStorage.getItem('pdf_saved_signatures');
        if (raw) {
            state.signatures = JSON.parse(raw);
            if (state.signatures.length > 0) {
                state.activeSignature = state.signatures[0];
            }
            // Auto re-trim any signatures with outdated wide canvases
            state.signatures.forEach(async (s) => {
                if (s.text && s.fontFamily) {
                    const fresh = await generateSignatureDataUrl(s.text, s.fontFamily, s.color || '#000000');
                    s.dataUrl = fresh.dataUrl;
                    s.naturalWidth = fresh.naturalWidth;
                    s.naturalHeight = fresh.naturalHeight;
                    s.aspectRatio = fresh.aspectRatio;
                }
            });
        }
    } catch (e) {}
    return state.signatures;
}

export function openAnnotationInput(wrap, page, xR, yR, existingAnn = null, existingMarker = null, options = {}) {
    const state = getState();
    const isFormField = !!options.isFormField;
    const sortedFields = options.sortedFields || null;
    const fieldIndex = options.fieldIndex !== undefined ? options.fieldIndex : -1;
    wrap.querySelectorAll('.ann-edit-box, .ann-input').forEach(b => b.remove());

    if (existingMarker) {
        existingMarker.style.visibility = 'hidden';
    }

    const box = document.createElement('div');
    box.className = 'ann-edit-box' + (isFormField ? ' is-form-field' : '');
    const leftPct = (xR * 100).toFixed(1);
    box.style.left = `${leftPct}%`;
    box.style.top = `${(yR * 100).toFixed(1)}%`;
    box.style.maxWidth = `calc(100% - ${leftPct}%)`;

    const input = document.createElement('textarea');
    input.className = 'ann-input';
    input.rows = 1;
    input.style.maxWidth = '100%';
    let currentAnnColor = existingAnn ? (existingAnn.color || (options.color || state.annColor)) : (options.color ? options.color : (options.date ? state.dateColor : state.annColor));
    let currentAnnSize = existingAnn ? (existingAnn.fontSize || state.annSize) : (options.fontSize ? options.fontSize : (options.date ? state.dateSize : state.annSize));
    let currentAnnFont = existingAnn ? (existingAnn.fontFamily || 'inherit') : (options.date ? state.dateFont : 'inherit');
    let currentAnnBold = existingAnn ? (existingAnn.bold || false) : (options.date ? state.dateBold : false);

    const applyContrastTheme = (hexColor) => {
        if (isFormField) return;
        const theme = getContrastBgColor(hexColor);
        box.style.background = theme.bg;
        box.style.borderColor = theme.border;
    };
    applyContrastTheme(currentAnnColor);

    const wrapRect = wrap.getBoundingClientRect();
    const canvasScale = wrapRect.width > 0 ? (wrapRect.width / 612.0) : (state.viewMode === 'full' ? 0.95 : (state.viewMode === 'small' ? 0.26 : 0.55));

    const autoResize = () => {
        input.style.height = 'auto';
        input.style.height = `${input.scrollHeight}px`;
        const lines = input.value.split('\n');
        const maxLen = Math.max(...lines.map(l => l.length), 1);
        input.cols = Math.max(2, maxLen + 1);
    };

    const controls = document.createElement('div');
    controls.className = 'ann-box-controls';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'ann-popover-color';
    colorPicker.value = currentAnnColor;
    colorPicker.title = 'Font Color';
    colorPicker.addEventListener('input', (e) => {
        currentAnnColor = e.target.value;
        state.annColor = currentAnnColor;
        input.style.color = currentAnnColor;
        applyContrastTheme(currentAnnColor);
        const mainPicker = document.getElementById('ann-color');
        if (mainPicker) mainPicker.value = currentAnnColor;
    });

    const sizeSelect = document.createElement('select');
    sizeSelect.className = 'ann-popover-size';
    sizeSelect.title = 'Font Size';
    [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64].forEach(sz => {
        const opt = document.createElement('option');
        opt.value = sz;
        opt.textContent = `${sz}px`;
        if (sz === currentAnnSize) opt.selected = true;
        sizeSelect.appendChild(opt);
    });
    sizeSelect.addEventListener('change', (e) => {
        currentAnnSize = parseInt(e.target.value, 10);
        state.annSize = currentAnnSize;
        const wRect = wrap.getBoundingClientRect();
        const cScale = wRect.width > 0 ? (wRect.width / 612.0) : (state.viewMode === 'full' ? 0.95 : (state.viewMode === 'small' ? 0.26 : 0.55));
        input.style.fontSize = `${Math.max(9, currentAnnSize * cScale)}px`;
        autoResize();
        const mainSize = document.getElementById('ann-size');
        if (mainSize) mainSize.value = currentAnnSize;
    });

    if (!isFormField) {
        controls.appendChild(colorPicker);
        controls.appendChild(sizeSelect);
        box.appendChild(controls);
    }

    input.placeholder = isFormField ? '' : 'Text...';
    input.value = existingAnn ? existingAnn.text : (options.initialText !== undefined ? options.initialText : (options.date ? formatDate(state.dateFormat) : ''));
    input.style.color = currentAnnColor;
    if (currentAnnFont && currentAnnFont !== 'inherit') input.style.fontFamily = currentAnnFont;
    if (currentAnnBold) input.style.fontWeight = 'bold';

    const scaledFont = Math.max(9, currentAnnSize * canvasScale);
    input.style.fontSize = `${scaledFont}px`;
    input.addEventListener('input', autoResize);
    box.appendChild(input);

    let committed = false;

    const commit = () => {
        if (committed) return;
        committed = true;

        snapshotPageLayers(page);
        const text = input.value.trim();
        if (existingAnn) {
            if (!text) {
                const idx = page.layers.indexOf(existingAnn);
                if (idx !== -1) page.layers.splice(idx, 1);
            } else {
                existingAnn.text = text;
                existingAnn.color = currentAnnColor;
                existingAnn.fontSize = currentAnnSize;
                if (currentAnnFont && currentAnnFont !== 'inherit') existingAnn.fontFamily = currentAnnFont;
                existingAnn.bold = currentAnnBold;
                if (isFormField) existingAnn.isFormField = true;
            }
        } else if (text) {
            const ann = {
                type: 'annotation',
                id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                text,
                xRatio: xR,
                yRatio: yR,
                color: currentAnnColor,
                fontSize: currentAnnSize,
            };
            if (currentAnnFont && currentAnnFont !== 'inherit') ann.fontFamily = currentAnnFont;
            ann.bold = currentAnnBold;
            if (isFormField) ann.isFormField = true;
            page.layers.push(ann);
        }
        box.remove();
        renderCardCanvas(page);
    };

    if (existingAnn && !isFormField) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'ann-box-del-btn';
        delBtn.innerHTML = '&times;';
        delBtn.title = 'Delete annotation';
        delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            committed = true;
            const idx = page.layers.indexOf(existingAnn);
            if (idx !== -1) page.layers.splice(idx, 1);
            box.remove();
            renderCardCanvas(page);
        });
        box.appendChild(delBtn);
    }

    box.addEventListener('mousedown', (e) => e.stopPropagation());
    box.addEventListener('click', (e) => e.stopPropagation());

    wrap.appendChild(box);
    setTimeout(autoResize, 0);
    input.focus();
    input.select();

    box._commit = commit;

    const onDocClick = (e) => {
        if (!box.contains(e.target)) {
            document.removeEventListener('pointerdown', onDocClick);
            commit();
        }
    };
    setTimeout(() => {
        document.addEventListener('pointerdown', onDocClick);
    }, 50);

    const setFontSize = (newSize) => {
        currentAnnSize = Math.max(8, Math.min(72, newSize));
        state.annSize = currentAnnSize;
        const wRect = wrap.getBoundingClientRect();
        const cScale = wRect.width > 0 ? (wRect.width / 612.0) : (state.viewMode === 'full' ? 0.95 : (state.viewMode === 'small' ? 0.26 : 0.55));
        input.style.fontSize = `${Math.max(9, currentAnnSize * cScale)}px`;
        autoResize();
        if (sizeSelect) sizeSelect.value = currentAnnSize;
        const mainSize = document.getElementById('ann-size');
        if (mainSize) mainSize.value = currentAnnSize;
    };

    const navigateToField = (nextIndex) => {
        if (!sortedFields || nextIndex < 0 || nextIndex >= sortedFields.length) return;
        document.removeEventListener('pointerdown', onDocClick);
        commit();
        const nextField = sortedFields[nextIndex];
        const nextExisting = page.layers.find(l =>
            l.type === 'annotation' &&
            Math.abs(l.xRatio - nextField.leftRatio) < 0.03 &&
            Math.abs(l.yRatio - nextField.topRatio) < 0.03
        );
        if (nextExisting) {
            openAnnotationInput(wrap, page, nextExisting.xRatio, nextExisting.yRatio, nextExisting, null, {
                isFormField: true, fieldIndex: nextIndex, sortedFields
            });
        } else {
            openAnnotationInput(wrap, page, nextField.leftRatio, nextField.topRatio, null, null, {
                fontSize: nextField.inferredFontSize || 14,
                color: '#000000',
                isFormField: true,
                fieldIndex: nextIndex,
                sortedFields,
                initialText: nextField.fieldValue || ''
            });
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.removeEventListener('pointerdown', onDocClick);
            commit();
        } else if (e.key === 'Tab' && isFormField) {
            e.preventDefault();
            navigateToField(e.shiftKey ? fieldIndex - 1 : fieldIndex + 1);
        } else if (e.key === 'Enter' && isFormField && !e.shiftKey) {
            e.preventDefault();
            document.removeEventListener('pointerdown', onDocClick);
            commit();
        } else if (!isFormField && (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '.' || e.key === '>')) {
            e.preventDefault();
            setFontSize(currentAnnSize + 2);
        } else if (!isFormField && (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === ',' || e.key === '<')) {
            e.preventDefault();
            setFontSize(currentAnnSize - 2);
        }
    });
}

export function startWhiteout(e, wrap, page) {
    const state = getState();
    if (state.mode !== 'whiteout') return;
    const rect = wrap.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    const box = document.createElement('div');
    box.className = 'whiteout-rect';
    box.style.left = `${startX}px`;
    box.style.top = `${startY}px`;
    box.style.width = '0px';
    box.style.height = '0px';
    wrap.appendChild(box);

    const onMove = (moveEv) => {
        const curX = Math.max(0, Math.min(rect.width, moveEv.clientX - rect.left));
        const curY = Math.max(0, Math.min(rect.height, moveEv.clientY - rect.top));
        const left = Math.min(startX, curX);
        const top = Math.min(startY, curY);
        const width = Math.abs(curX - startX);
        const height = Math.abs(curY - startY);

        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        const finalWidth = parseFloat(box.style.width);
        const finalHeight = parseFloat(box.style.height);

        if (finalWidth > 5 && finalHeight > 5) {
            const wo = {
                type: 'whiteout',
                id: `wo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                leftRatio: parseFloat(box.style.left) / rect.width,
                topRatio: parseFloat(box.style.top) / rect.height,
                widthRatio: finalWidth / rect.width,
                heightRatio: finalHeight / rect.height,
            };
            page.layers.push(wo);
        }
        box.remove();
        renderCardCanvas(page);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}
