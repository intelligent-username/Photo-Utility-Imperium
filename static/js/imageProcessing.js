// ===========================================
//  imageProcessing.js — Image processing queue & fetch dispatcher
// ===========================================

import { initMagnifierFeature } from './components/magnifier.js';
import { getBaseName, clearOutputs, updateSlideUI, displaySlide } from './utils/imageProcessingUtils.js';

export function initImageProcessing(options) {
    const {
        page, fileInput, uploadArea, resultImage, downloadBtn, comparisonContainer,
        resultContainer, formatSelect, prevSlideBtn, nextSlideBtn, convertAgainBtn,
        showProcessing, hideProcessing, qualitySlider, qualityValue,
    } = options;

    const comparisonPages = ['BR', 'NR'];
    const state = { fileQueue: [], processedResults: [], currentSlideIndex: 0, processingIndex: 0 };

    function sendFileToBackend(file, url, extraData = {}, operation = 'processed', ext = 'png', previewUrl = '', fileIndex = 0) {
        const formData = new FormData();
        formData.append('file', file);
        Object.entries(extraData).forEach(([k, v]) => formData.append(k, v));

        if (typeof showProcessing === 'function') showProcessing();

        fetch(url, { method: 'POST', body: formData })
            .then(res => {
                if (!res.ok) throw new Error('Network error');
                return res.headers.get('Content-Type')?.includes('application/json')
                    ? res.json()
                    : res.blob().then(blob => ({ isBlob: true, blob }));
            })
            .then(data => {
                const blob = data.isBlob ? data.blob : new Blob([Uint8Array.from(atob(data.file_b64), c => c.charCodeAt(0))], { type: data.mimetype });
                const objectURL = URL.createObjectURL(blob);
                const prev = state.processedResults[fileIndex];
                if (prev?.output?.startsWith('blob:')) URL.revokeObjectURL(prev.output);

                state.processedResults[fileIndex] = {
                    preview: previewUrl,
                    output: objectURL,
                    previewImageSrc: data.preview_b64 || objectURL,
                    file,
                    baseName: getBaseName(file.name),
                    operation,
                    ext,
                    blobSize: blob.size,
                    quality: extraData.quality
                };

                if (fileIndex === state.currentSlideIndex) displaySlide(state.currentSlideIndex, options, state);
                updateSlideUI(options, state);

                if (comparisonPages.includes(page) && comparisonContainer) {
                    comparisonContainer.classList.remove('hidden');
                    if (fileIndex === state.currentSlideIndex) initMagnifierFeature();
                } else if (resultContainer && page !== 'IC') {
                    resultContainer.classList.remove('hidden');
                }

                if (++state.processingIndex < state.fileQueue.length) processNextFile();
            })
            .catch(err => {
                console.error(err);
                alert('Processing error occurred.');
                if (++state.processingIndex < state.fileQueue.length) processNextFile();
            })
            .finally(() => {
                if (state.processingIndex >= state.fileQueue.length && typeof hideProcessing === 'function') hideProcessing();
            });
    }

    function dispatchFile(file, idx) {
        const pUrl = URL.createObjectURL(file);
        if (page === 'BR') {
            sendFileToBackend(file, '/process_background_removal', {}, 'no_bg', 'png', pUrl, idx);
        } else if (page === 'FC' && formatSelect) {
            sendFileToBackend(file, '/process_image_conversion', { output_format: formatSelect.value }, 'converted', formatSelect.value.toLowerCase(), pUrl, idx);
        } else if (page === 'IC') {
            const q = qualitySlider?.value || 50;
            const ext = (file.name || '').split('.').pop().toLowerCase() || 'jpg';
            sendFileToBackend(file, '/process_compression', { quality: q }, 'compressed', ext, pUrl, idx);
        } else if (page === 'NR') {
            const ext = (file.name || '').split('.').pop().toLowerCase() || 'png';
            sendFileToBackend(file, '/process_image_cleaning', {}, 'cleaned', ext, pUrl, idx);
        }
    }

    function processNextFile() {
        if (state.processingIndex < state.fileQueue.length) {
            dispatchFile(state.fileQueue[state.processingIndex], state.processingIndex);
        }
    }

    function handleFiles(files) {
        clearOutputs(options, state);
        state.fileQueue = files.filter(f => page === 'FC' ? (f.type.startsWith('image/') || f.type === 'application/pdf') : f.type.startsWith('image/'));
        if (!state.fileQueue.length) return alert('No valid files selected!');
        processNextFile();
    }

    // Modal PDF Standardizing
    const resizePdfBtn = document.getElementById('resize-pdf-btn');
    const resizeModal = document.getElementById('resize-modal');
    const closeResizeModal = document.getElementById('close-resize-modal-btn');
    const cancelResizeModal = document.getElementById('cancel-resize-modal-btn');
    const applyResizeModal = document.getElementById('apply-resize-modal-btn');
    const optionCards = document.querySelectorAll('.size-option-card');

    const toggleModal = (show) => resizeModal?.classList.toggle('hidden', !show);
    resizePdfBtn?.addEventListener('click', () => toggleModal(true));
    closeResizeModal?.addEventListener('click', () => toggleModal(false));
    cancelResizeModal?.addEventListener('click', () => toggleModal(false));
    resizeModal?.addEventListener('click', (e) => e.target === resizeModal && toggleModal(false));

    optionCards.forEach(card => card.addEventListener('click', () => {
        optionCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
    }));

    applyResizeModal?.addEventListener('click', () => {
        const size = document.querySelector('input[name="pageSizeChoice"]:checked')?.value || 'US Letter';
        toggleModal(false);
        const cur = state.processedResults[state.currentSlideIndex]?.file;
        if (cur) sendFileToBackend(cur, '/process_image_conversion', { output_format: 'PDF', page_size: size }, 'standardized', 'pdf', URL.createObjectURL(cur), state.currentSlideIndex);
    });

    if (qualitySlider && qualityValue) {
        qualitySlider.addEventListener('input', () => {
            qualityValue.textContent = qualitySlider.value;
            if (page === 'IC' && convertAgainBtn) {
                const curQ = parseInt(state.processedResults[state.currentSlideIndex]?.quality);
                convertAgainBtn.classList.toggle('hidden', isNaN(curQ) || parseInt(qualitySlider.value) === curQ);
            }
        });
    }

    if (uploadArea) {
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragging'); });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragging'));
        uploadArea.addEventListener('drop', (e) => { e.preventDefault(); uploadArea.classList.remove('dragging'); handleFiles(Array.from(e.dataTransfer.files)); });
    }

    fileInput?.addEventListener('change', () => handleFiles(Array.from(fileInput.files)));

    prevSlideBtn?.addEventListener('click', () => {
        if (state.currentSlideIndex > 0) displaySlide(--state.currentSlideIndex, options, state);
    });
    nextSlideBtn?.addEventListener('click', () => {
        if (state.currentSlideIndex < state.processedResults.length - 1) displaySlide(++state.currentSlideIndex, options, state);
    });

    convertAgainBtn?.addEventListener('click', () => {
        const cur = state.processedResults[state.currentSlideIndex]?.file;
        if (!cur) return;
        [downloadBtn, resultImage, document.getElementById('output-pdf'), document.getElementById('compressed-size'), document.getElementById('converted-name')].forEach(el => el?.classList.add('hidden'));
        dispatchFile(cur, state.currentSlideIndex);
    });
}
