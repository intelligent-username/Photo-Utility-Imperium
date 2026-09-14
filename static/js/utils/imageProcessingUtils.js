// ===========================================
//  imageProcessingUtils.js — Formatting & slideshow UI helpers
// ===========================================

import { initComparisonSlider } from '../components/comparison-slider.js';

export const getBaseName = (filename) => filename.replace(/\.[^/.]+$/, '');

export const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const clearOutputs = (options, state) => {
    const { downloadBtn, resultImage, comparisonContainer, slideshowHeader, convertAgainBtn } = options;
    [downloadBtn, resultImage, comparisonContainer, convertAgainBtn].forEach(el => el?.classList.add('hidden'));
    ['preview-pdf', 'output-pdf', 'original-size', 'compressed-size', 'slider-toolbar', 'comparison-slider', 'original-name', 'converted-name', 'resize-pdf-btn', 'resize-modal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.add('hidden'); if (el.tagName === 'IFRAME') el.src = ''; }
    });
    if (downloadBtn) downloadBtn.removeAttribute('href');
    if (resultImage) resultImage.src = '';
    if (slideshowHeader) slideshowHeader.style.display = 'none';

    state.processedResults?.forEach(r => {
        if (r.output?.startsWith('blob:')) URL.revokeObjectURL(r.output);
        if (r.preview?.startsWith('blob:')) URL.revokeObjectURL(r.preview);
    });

    state.fileQueue = [];
    state.processedResults = [];
    state.currentSlideIndex = 0;
    state.processingIndex = 0;
};

export function updateSlideUI(options, state) {
    const { slideshowHeader, slideCounterEl, prevSlideBtn, nextSlideBtn } = options;
    if (slideshowHeader) slideshowHeader.style.display = state.fileQueue.length > 1 ? 'flex' : 'none';
    if (slideCounterEl) slideCounterEl.textContent = `${state.currentSlideIndex + 1}/${state.fileQueue.length || 1}`;
    if (prevSlideBtn) prevSlideBtn.disabled = state.currentSlideIndex === 0;
    if (nextSlideBtn) nextSlideBtn.disabled = state.currentSlideIndex >= state.fileQueue.length - 1;
}

export function displaySlide(index, options, state) {
    const result = state.processedResults[index];
    if (!result) return;
    const { page, previewImage, resultImage, downloadBtn, convertAgainBtn } = options;

    const prevPdf = document.getElementById('preview-pdf'), outPdf = document.getElementById('output-pdf');
    const isInPdf = result.file?.type === 'application/pdf', isOutPdf = result.ext?.toLowerCase() === 'pdf';

    if (isInPdf && prevPdf) {
        prevPdf.src = `${result.preview.split('#')[0]}#navpanes=0&view=Fit`;
        prevPdf.classList.remove('hidden');
        previewImage?.classList.add('hidden');
    } else if (previewImage) {
        previewImage.src = result.preview;
        previewImage.classList.remove('hidden');
        prevPdf?.classList.add('hidden');
    }

    if (isOutPdf && outPdf) {
        outPdf.src = `${result.output.split('#')[0]}#navpanes=0&view=Fit&v=${Date.now()}`;
        outPdf.classList.remove('hidden');
        resultImage?.classList.add('hidden');
    } else if (resultImage) {
        resultImage.src = result.previewImageSrc || result.output;
        resultImage.classList.remove('hidden');
        outPdf?.classList.add('hidden');
    }

    if (downloadBtn) {
        downloadBtn.href = result.output;
        downloadBtn.download = `${result.baseName}_${result.operation}.${result.ext}`;
        downloadBtn.classList.remove('hidden');
    }

    if (page === 'IC') {
        const origSz = document.getElementById('original-size'), compSz = document.getElementById('compressed-size');
        if (origSz) { origSz.textContent = formatFileSize(result.file.size); origSz.classList.remove('hidden'); }
        if (compSz) { compSz.textContent = formatFileSize(result.blobSize); compSz.classList.remove('hidden'); compSz.classList.add('savings'); }
        document.getElementById('slider-toolbar')?.classList.remove('hidden');

        const sBefore = document.getElementById('slider-before'), sAfter = document.getElementById('slider-after'), sWrap = document.getElementById('comparison-slider');
        if (sBefore && sAfter && sWrap) {
            sBefore.src = result.preview;
            sAfter.src = result.output;
            sWrap.classList.remove('hidden');
            let loaded = 0;
            const onL = () => { if (++loaded >= 2) initComparisonSlider(sWrap); };
            sBefore.onload = onL; sAfter.onload = onL;
            if (sBefore.complete) onL(); if (sAfter.complete) onL();
        }
    }

    if (page === 'FC') {
        const origN = document.getElementById('original-name'), convN = document.getElementById('converted-name');
        if (origN) { origN.textContent = origN.title = result.file.name; origN.classList.remove('hidden'); }
        if (convN) { convN.textContent = convN.title = `${result.baseName}_${result.operation}.${result.ext}`; convN.classList.remove('hidden'); }
        convertAgainBtn?.classList.remove('hidden');
        document.getElementById('resize-pdf-btn')?.classList.toggle('hidden', !isOutPdf);
    }

    updateSlideUI(options, state);
}
