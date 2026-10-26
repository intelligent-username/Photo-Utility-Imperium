// ===========================================
//  pdfSignatures.js — Signature stamp generation, trimming, saving & storage
// ===========================================

import { getState } from './pdfState.js';

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
    const state = getState();
    const stamp = {
        id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text,
        fontFamily,
        color,
        dataUrl: sigData.dataUrl,
        naturalWidth: sigData.naturalWidth,
        naturalHeight: sigData.naturalHeight,
        aspectRatio: sigData.aspectRatio,
        widthRatio: state.lastSignatureWidthRatio || 0.22,
        heightRatio: state.lastSignatureHeightRatio || null
    };
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
        const lastW = localStorage.getItem('pdf_last_sig_width_ratio');
        const lastH = localStorage.getItem('pdf_last_sig_height_ratio');
        if (lastW) state.lastSignatureWidthRatio = parseFloat(lastW);
        if (lastH) state.lastSignatureHeightRatio = parseFloat(lastH);
    } catch (e) {}
    return state.signatures;
}
