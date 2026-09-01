// ===========================================
//  imageProcessingUtils.js — Formatting & slideshow UI helpers
// ===========================================

import { initComparisonSlider } from './comparison-slider.js';

export const getBaseName = (filename) => filename.replace(/\.[^/.]+$/, '');

export const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const clearOutputs = (options, state) => {
    const { downloadBtn, resultImage, comparisonContainer, slideshowHeader, convertAgainBtn } = options;
    if (downloadBtn) {
        downloadBtn.removeAttribute('href');
        downloadBtn.classList.add('hidden');
    }
    if (resultImage) {
        resultImage.src = '';
        resultImage.classList.add('hidden');
    }
    if (comparisonContainer) {
        comparisonContainer.classList.add('hidden');
    }
    const previewPdf = document.getElementById('preview-pdf');
    const outputPdf = document.getElementById('output-pdf');
    if (previewPdf) { previewPdf.src = ''; previewPdf.classList.add('hidden'); }
    if (outputPdf) { outputPdf.src = ''; outputPdf.classList.add('hidden'); }
    const originalSizeEl = document.getElementById('original-size');
    const compressedSizeEl = document.getElementById('compressed-size');
    if (originalSizeEl) originalSizeEl.classList.add('hidden');
    if (compressedSizeEl) compressedSizeEl.classList.add('hidden');
    const sliderToolbar = document.getElementById('slider-toolbar');
    if (sliderToolbar) sliderToolbar.classList.add('hidden');
    const sliderWrapper = document.getElementById('comparison-slider');
    if (sliderWrapper) sliderWrapper.classList.add('hidden');
    const originalNameEl = document.getElementById('original-name');
    const convertedNameEl = document.getElementById('converted-name');
    if (originalNameEl) originalNameEl.classList.add('hidden');
    if (convertedNameEl) convertedNameEl.classList.add('hidden');
    if (convertAgainBtn) convertAgainBtn.classList.add('hidden');
    const resizePdfBtnEl = document.getElementById('resize-pdf-btn');
    if (resizePdfBtnEl) resizePdfBtnEl.classList.add('hidden');
    const resizeModalEl = document.getElementById('resize-modal');
    if (resizeModalEl) resizeModalEl.classList.add('hidden');
    if (slideshowHeader) slideshowHeader.style.display = 'none';

    state.fileQueue = [];
    state.processedResults = [];
    state.currentSlideIndex = 0;
    state.processingIndex = 0;
};

export function updateSlideUI(options, state) {
    const { slideshowHeader, slideCounterEl, prevSlideBtn, nextSlideBtn } = options;
    if (slideshowHeader) {
        slideshowHeader.style.display = state.fileQueue.length > 1 ? 'flex' : 'none';
    }
    if (slideCounterEl) {
        slideCounterEl.textContent = `${state.currentSlideIndex + 1}/${state.fileQueue.length || 1}`;
    }
    if (prevSlideBtn) {
        prevSlideBtn.disabled = state.currentSlideIndex === 0 || !state.processedResults[state.currentSlideIndex - 1];
    }
    if (nextSlideBtn) {
        nextSlideBtn.disabled = state.currentSlideIndex >= state.fileQueue.length - 1 || !state.processedResults[state.currentSlideIndex + 1];
    }
}

export function displaySlide(index, options, state) {
    if (index < 0 || index >= state.processedResults.length || !state.processedResults[index]) return;
    const result = state.processedResults[index];
    const { page, previewImage, resultImage, downloadBtn, convertAgainBtn } = options;

    const previewPdf = document.getElementById('preview-pdf');
    const outputPdf = document.getElementById('output-pdf');
    const isInputPdf = result.file && result.file.type === 'application/pdf';
    const isOutputPdf = result.ext && result.ext.toLowerCase() === 'pdf';

    if (isInputPdf && previewPdf) {
        const raw = result.preview.split('#')[0];
        previewPdf.src = raw + '#navpanes=0&view=Fit';
        previewPdf.classList.remove('hidden');
        if (previewImage) previewImage.classList.add('hidden');
    } else if (previewImage) {
        previewImage.src = result.preview;
        previewImage.classList.remove('hidden');
        if (previewPdf) previewPdf.classList.add('hidden');
    }

    if (isOutputPdf && outputPdf) {
        const raw = result.output.split('#')[0];
        outputPdf.src = 'about:blank';
        requestAnimationFrame(() => {
            setTimeout(() => { outputPdf.src = raw + '#navpanes=0&view=Fit&v=' + Date.now(); }, 20);
        });
        outputPdf.classList.remove('hidden');
        if (resultImage) resultImage.classList.add('hidden');
    } else if (resultImage) {
        resultImage.src = result.previewImageSrc || result.output;
        resultImage.classList.remove('hidden');
        if (outputPdf) outputPdf.classList.add('hidden');
    }

    if (downloadBtn) {
        downloadBtn.href = result.output;
        downloadBtn.download = `${result.baseName}_${result.operation}.${result.ext}`;
        downloadBtn.classList.remove('hidden');
    }

    if (page === 'IC') {
        const originalSizeEl = document.getElementById('original-size');
        const compressedSizeEl = document.getElementById('compressed-size');
        const toolbar = document.getElementById('slider-toolbar');
        if (originalSizeEl) {
            originalSizeEl.textContent = formatFileSize(result.file.size);
            originalSizeEl.classList.remove('hidden');
        }
        if (compressedSizeEl) {
            compressedSizeEl.textContent = formatFileSize(result.blobSize);
            compressedSizeEl.classList.remove('hidden');
            compressedSizeEl.classList.add('savings');
        }
        if (toolbar) toolbar.classList.remove('hidden');

        const sliderBefore = document.getElementById('slider-before');
        const sliderAfter = document.getElementById('slider-after');
        const sliderWrapper = document.getElementById('comparison-slider');
        if (sliderBefore && sliderAfter && sliderWrapper) {
            sliderBefore.src = result.preview;
            sliderAfter.src = result.output;
            sliderWrapper.classList.remove('hidden');
            let loadedCount = 0;
            const onLoad = () => {
                if (loadedCount >= 2) return;
                loadedCount++;
                if (loadedCount === 2) {
                    initComparisonSlider(sliderWrapper);
                }
            };
            sliderBefore.onload = onLoad;
            sliderAfter.onload = onLoad;
            if (sliderBefore.complete) onLoad();
            if (sliderAfter.complete) onLoad();
        }
    }

    if (page === 'FC') {
        const originalNameEl = document.getElementById('original-name');
        const convertedNameEl = document.getElementById('converted-name');
        if (originalNameEl) {
            originalNameEl.textContent = result.file.name;
            originalNameEl.title = result.file.name;
            originalNameEl.classList.remove('hidden');
        }
        if (convertedNameEl) {
            const newName = `${result.baseName}_${result.operation}.${result.ext}`;
            convertedNameEl.textContent = newName;
            convertedNameEl.title = newName;
            convertedNameEl.classList.remove('hidden');
        }
        if (convertAgainBtn) {
            convertAgainBtn.classList.remove('hidden');
        }
        const resizePdfBtnEl = document.getElementById('resize-pdf-btn');
        if (resizePdfBtnEl) {
            if (isOutputPdf) {
                resizePdfBtnEl.classList.remove('hidden');
            } else {
                resizePdfBtnEl.classList.add('hidden');
            }
        }
    }

    updateSlideUI(options, state);
}
