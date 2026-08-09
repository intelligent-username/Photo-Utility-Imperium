// ===========================================
//  pdfRender.js — PDF page canvas rendering & file loading
// ===========================================

import { getState, createPageObject } from './pdfState.js';
import { buildCard, renderCardLayers } from './pdfCardBuilder.js';
import { addCropControls, syncRectToPercentage } from './pdfCropOverlay.js';

export async function getPageCanvasCache(page, targetWidth) {
    if (!page._pdfPage && !page.isBlank) return null;

    if (!page._cacheCanvas || page._cacheWidth !== targetWidth) {
        const offCanvas = document.createElement('canvas');
        if (page.isBlank) {
            const ar = page.aspectRatio || (792 / 612);
            offCanvas.width = targetWidth;
            offCanvas.height = Math.round(targetWidth * ar);
            const offCtx = offCanvas.getContext('2d');
            offCtx.fillStyle = '#ffffff';
            offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
        } else if (page._pdfPage) {
            const origVp = page._pdfPage.getViewport({ scale: 1.0 });
            const scale = targetWidth / origVp.width;
            const vp = page._pdfPage.getViewport({ scale });
            offCanvas.width = Math.round(vp.width);
            offCanvas.height = Math.round(vp.height);
            const offCtx = offCanvas.getContext('2d');

            if (page._renderTask) {
                try { await page._renderTask.promise; } catch (e) {}
            }
            page._renderTask = page._pdfPage.render({ canvasContext: offCtx, viewport: vp });
            try {
                await page._renderTask.promise;
            } catch (e) {}
            page._renderTask = null;
        }
        page._cacheCanvas = offCanvas;
        page._cacheWidth = targetWidth;
    }

    return page._cacheCanvas;
}

export async function renderCardCanvas(page) {
    const card = document.getElementById(page.id);
    if (!card) return;
    const canvas = card.querySelector('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const state = getState();
    const dpr = Math.max(2, window.devicePixelRatio || 1);
    let baseTargetWidth = 600;
    if (state.viewMode === 'small') baseTargetWidth = 320;
    else if (state.viewMode === 'full') baseTargetWidth = 1000;
    const targetWidth = baseTargetWidth * dpr;

    const baseCache = await getPageCanvasCache(page, targetWidth);
    if (!baseCache) return;

    canvas.width = baseCache.width;
    canvas.height = baseCache.height;
    const vpWidth = canvas.width;
    const vpHeight = canvas.height;

    ctx.clearRect(0, 0, vpWidth, vpHeight);
    ctx.drawImage(baseCache, 0, 0);

    if (page.layers && page.layers.length > 0) {
        for (const layer of page.layers) {
            if (layer.type === 'whiteout') {
                ctx.fillStyle = '#ffffff';
                const wx = layer.leftRatio * vpWidth;
                const wy = layer.topRatio * vpHeight;
                const ww = layer.widthRatio * vpWidth;
                const wh = layer.heightRatio * vpHeight;
                ctx.fillRect(wx, wy, ww, wh);
            } else if (layer.type === 'overlay') {
                const ovPageObj = state.pages.find(p => p.id === layer.sourceId) ||
                                  state.pages.find(p => (p.fileIdx === layer.fileIdx || p.fileIdx === layer.fileIndex) &&
                                                        (p.pageIdx === layer.pageIdx || p.pageIdx === layer.pageIndex));
                if (ovPageObj) {
                    const ovCache = await getPageCanvasCache(ovPageObj, vpWidth);
                    if (ovCache) {
                        ctx.save();
                        ctx.globalAlpha = 0.90;
                        const dx = (layer.dxRatio || 0) * vpWidth;
                        const dy = (layer.dyRatio || 0) * vpHeight;
                        const scaleW = layer.scaleWidthRatio || 1.0;
                        const scaleH = layer.scaleHeightRatio || 1.0;

                        if (layer.cropBox) {
                            const cx = layer.cropBox.leftRatio * vpWidth;
                            const cy = layer.cropBox.topRatio * vpHeight;
                            const cw = layer.cropBox.widthRatio * vpWidth;
                            const ch = layer.cropBox.heightRatio * vpHeight;
                            ctx.drawImage(ovCache, cx, cy, cw, ch, dx, dy, cw * scaleW, ch * scaleH);
                        } else {
                            ctx.drawImage(ovCache, 0, 0, ovCache.width, ovCache.height, dx, dy, vpWidth * scaleW, vpHeight * scaleH);
                        }
                        ctx.restore();
                    }
                }
            }
        }
    }

    const wrap = card.querySelector('.page-canvas-wrap');
    if (wrap) {
        let rect = wrap.querySelector('.crop-rect');
        if (page.cropBox) {
            if (!rect) {
                rect = document.createElement('div');
                rect.className = 'crop-rect';
                wrap.appendChild(rect);
                addCropControls(rect, wrap, page);
            }
            syncRectToPercentage(rect, page);
        } else if (rect) {
            rect.remove();
        }

        renderCardLayers(wrap, page);
    }
}

export async function reRenderCanvases() {
    const state = getState();
    for (const page of state.pages) {
        await renderCardCanvas(page);
    }
}

export async function loadFiles(fileList) {
    const grid = document.getElementById('pdf-page-grid');
    if (!grid || !window.pdfjsLib) return;
    const state = getState();

    for (const file of fileList) {
        const fileIdx = state.files.length;
        state.files.push(file);

        try {
            const buf = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;

            for (let p = 0; p < pdf.numPages; p++) {
                const pdfPage = await pdf.getPage(p + 1);
                const page = createPageObject({
                    fileIdx,
                    pageIdx: p,
                    fileName: file.name,
                    _pdfPage: pdfPage,
                });
                state.pages.push(page);
                const card = buildCard(page);
                grid.appendChild(card);
                renderCardCanvas(page);
            }
        } catch (err) {
            console.error(`Failed to load ${file.name}:`, err);
        }
    }
}
