// ===========================================
//  pdfCropOverlay.js — Crop box region & overlay page management
// ===========================================

import { getState, updateStatusBar, updateModeBanner } from './pdfState.js';
import { renderCardCanvas } from './pdfRender.js';

export function syncRectToPercentage(rect, page) {
    if (!page || !page.cropBox) return;
    rect.style.left = `${(page.cropBox.leftRatio * 100).toFixed(2)}%`;
    rect.style.top = `${(page.cropBox.topRatio * 100).toFixed(2)}%`;
    rect.style.width = `${(page.cropBox.widthRatio * 100).toFixed(2)}%`;
    rect.style.height = `${(page.cropBox.heightRatio * 100).toFixed(2)}%`;
}

export function applyCropToAll(sourcePage) {
    if (!sourcePage.cropBox) return;
    const state = getState();
    const cropCopy = { ...sourcePage.cropBox };
    state.pages.forEach(p => {
        p.cropBox = { ...cropCopy };
        renderCardCanvas(p);
    });
    updateModeBanner('Crop applied to all pages.', 'crop');
}

export function addCropControls(rect, wrap, page) {
    rect.querySelectorAll('.crop-handle, .crop-apply-all-btn').forEach(h => h.remove());

    const positions = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
    positions.forEach(pos => {
        const h = document.createElement('div');
        h.className = `crop-handle handle-${pos}`;
        h.dataset.handle = pos;
        rect.appendChild(h);
    });

    const applyAllBtn = document.createElement('button');
    applyAllBtn.className = 'crop-apply-all-btn';
    applyAllBtn.textContent = 'Apply to All';
    applyAllBtn.title = 'Copy this crop region to all pages';
    applyAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyCropToAll(page);
    });
    rect.appendChild(applyAllBtn);

    rect.addEventListener('dblclick', (e) => {
        const state = getState();
        if (state.mode !== 'crop') return;
        e.stopPropagation();
        page.cropBox = null;
        rect.remove();
    });

    makeCropInteractive(rect, wrap, page);
}

export function makeCropInteractive(rect, wrap, page) {
    if (rect._isInteractive) return;
    rect._isInteractive = true;

    rect.addEventListener('mousedown', (e) => {
        const state = getState();
        if (state.mode !== 'crop') return;
        if (e.target.classList.contains('crop-apply-all-btn')) return;
        e.stopPropagation();
        const wrapRect = wrap.getBoundingClientRect();
        const handle = e.target.closest('.crop-handle')?.dataset.handle;

        const startX = e.clientX;
        const startY = e.clientY;

        const initL = page.cropBox.leftRatio * wrapRect.width;
        const initT = page.cropBox.topRatio * wrapRect.height;
        const initW = page.cropBox.widthRatio * wrapRect.width;
        const initH = page.cropBox.heightRatio * wrapRect.height;

        let ticking = false;

        const onMove = (me) => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const dx = me.clientX - startX;
                    const dy = me.clientY - startY;

                    let newL = initL;
                    let newT = initT;
                    let newW = initW;
                    let newH = initH;

                    if (!handle) {
                        newL = Math.max(0, Math.min(initL + dx, wrapRect.width - initW));
                        newT = Math.max(0, Math.min(initT + dy, wrapRect.height - initH));
                    } else {
                        if (handle.includes('e')) newW = Math.max(15, Math.min(initW + dx, wrapRect.width - initL));
                        if (handle.includes('s')) newH = Math.max(15, Math.min(initH + dy, wrapRect.height - initT));
                        if (handle.includes('w')) {
                            const clampedDx = Math.max(-initL, Math.min(dx, initW - 15));
                            newL = initL + clampedDx;
                            newW = initW - clampedDx;
                        }
                        if (handle.includes('n')) {
                            const clampedDy = Math.max(-initT, Math.min(dy, initH - 15));
                            newT = initT + clampedDy;
                            newH = initH - clampedDy;
                        }
                    }

                    page.cropBox = {
                        leftRatio: newL / wrapRect.width,
                        topRatio: newT / wrapRect.height,
                        widthRatio: newW / wrapRect.width,
                        heightRatio: newH / wrapRect.height,
                    };

                    syncRectToPercentage(rect, page);
                    ticking = false;
                });
                ticking = true;
            }
        };

        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            syncRectToPercentage(rect, page);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    });
}

export function startCrop(e, wrap, page) {
    const old = wrap.querySelector('.crop-rect');
    if (old) old.remove();

    const wrapRect = wrap.getBoundingClientRect();
    const sx = e.clientX - wrapRect.left;
    const sy = e.clientY - wrapRect.top;

    const rect = document.createElement('div');
    rect.className = 'crop-rect';
    rect.style.left = `${(sx / wrapRect.width * 100).toFixed(2)}%`;
    rect.style.top = `${(sy / wrapRect.height * 100).toFixed(2)}%`;
    rect.style.width = '0%';
    rect.style.height = '0%';
    wrap.appendChild(rect);

    let ticking = false;

    const onMove = (me) => {
        if (!ticking) {
            requestAnimationFrame(() => {
                const cx = me.clientX - wrapRect.left;
                const cy = me.clientY - wrapRect.top;
                const l = Math.max(0, Math.min(sx, cx));
                const t = Math.max(0, Math.min(sy, cy));
                const w = Math.min(Math.abs(cx - sx), wrapRect.width - l);
                const h = Math.min(Math.abs(cy - sy), wrapRect.height - t);

                rect.style.left = `${(l / wrapRect.width * 100).toFixed(2)}%`;
                rect.style.top = `${(t / wrapRect.height * 100).toFixed(2)}%`;
                rect.style.width = `${(w / wrapRect.width * 100).toFixed(2)}%`;
                rect.style.height = `${(h / wrapRect.height * 100).toFixed(2)}%`;
                ticking = false;
            });
            ticking = true;
        }
    };

    const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);

        const wrapW = wrapRect.width;
        const wrapH = wrapRect.height;
        const lPx = (parseFloat(rect.style.left) / 100) * wrapW;
        const tPx = (parseFloat(rect.style.top) / 100) * wrapH;
        const wPx = (parseFloat(rect.style.width) / 100) * wrapW;
        const hPx = (parseFloat(rect.style.height) / 100) * wrapH;

        if (wPx < 15 || hPx < 15) {
            rect.remove();
            page.cropBox = null;
            return;
        }

        page.cropBox = {
            leftRatio: lPx / wrapW,
            topRatio: tPx / wrapH,
            widthRatio: wPx / wrapW,
            heightRatio: hPx / wrapH,
        };

        syncRectToPercentage(rect, page);
        addCropControls(rect, wrap, page);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

export function handleOverlayClick(page, card) {
    const state = getState();
    if (state.mode !== 'overlay') return;

    if (!state.overlaySource) {
        state.overlaySource = page.id;
        card.classList.add('overlay-source');
        updateStatusBar('Click target page to overlay onto, or click source again to cancel');
    } else if (state.overlaySource === page.id) {
        state.overlaySource = null;
        card.classList.remove('overlay-source');
        updateStatusBar('');
    } else {
        const srcPage = state.pages.find(p => p.id === state.overlaySource);
        if (srcPage) {
            const overlayLayer = {
                type: 'overlay',
                id: `ov_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                sourceId: srcPage.id,
                fileIdx: srcPage.fileIdx,
                pageIdx: srcPage.pageIdx,
                cropBox: srcPage.cropBox ? { ...srcPage.cropBox } : null,
                dxRatio: 0,
                dyRatio: 0,
                scaleWidthRatio: srcPage.cropBox ? srcPage.cropBox.widthRatio : 1.0,
                scaleHeightRatio: srcPage.cropBox ? srcPage.cropBox.heightRatio : 1.0,
            };
            page.layers.push(overlayLayer);
            card.classList.add('has-overlay');
            renderCardCanvas(page);
            updateStatusBar(`Overlay added to Page ${page.pageIdx + 1}`);
        }
        document.querySelectorAll('.overlay-source').forEach(el => el.classList.remove('overlay-source'));
        state.overlaySource = null;
    }
}

export function removeOverlay(targetPage) {
    const idx = targetPage.layers.findIndex(l => l.type === 'overlay');
    if (idx !== -1) {
        targetPage.layers.splice(idx, 1);
        renderCardCanvas(targetPage);
    }
}
