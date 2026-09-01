// ===========================================
//  imageProcessing.js — Image processing queue & fetch dispatcher
// ===========================================

import { initMagnifierFeature } from './magnifier.js';
import { getBaseName, clearOutputs, updateSlideUI, displaySlide } from './imageProcessingUtils.js';

export function initImageProcessing(options) {
    const {
        page,
        fileInput,
        uploadArea,
        resultImage,
        downloadBtn,
        comparisonContainer,
        resultContainer,
        formatSelect,
        prevSlideBtn,
        nextSlideBtn,
        convertAgainBtn,
        showProcessing,
        hideProcessing,
        qualitySlider,
        qualityValue,
    } = options;

    const comparisonPages = ['BR', 'NR'];

    const state = {
        fileQueue: [],
        processedResults: [],
        currentSlideIndex: 0,
        processingIndex: 0,
    };

    function sendFileToBackend(file, url, extraData = {}, operation = 'processed', ext = 'png', previewDataUrl = '', fileIndex = 0) {
        const formData = new FormData();
        formData.append('file', file);
        const baseName = getBaseName(file.name);
        for (const key in extraData) {
            formData.append(key, extraData[key]);
        }

        if (typeof showProcessing === 'function') showProcessing();
        fetch(url, { method: 'POST', body: formData })
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                const contentType = response.headers.get('Content-Type') || '';
                if (contentType.includes('application/json')) {
                    return response.json();
                }
                return response.blob().then(blob => ({ isBlob: true, blob }));
            })
            .then(data => {
                let blob;
                let previewSrc = null;

                if (data.isBlob) {
                    blob = data.blob;
                } else if (data.success && data.file_b64) {
                    const byteCharacters = atob(data.file_b64);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    blob = new Blob([byteArray], { type: data.mimetype });
                    previewSrc = data.preview_b64;
                } else {
                    throw new Error('Invalid response from server');
                }

                const objectURL = URL.createObjectURL(blob);
                const prev = state.processedResults[fileIndex];
                if (prev && prev.output && prev.output.startsWith('blob:')) URL.revokeObjectURL(prev.output);
                state.processedResults[fileIndex] = {
                    preview: previewDataUrl,
                    output: objectURL,
                    previewImageSrc: previewSrc || objectURL,
                    file: file,
                    baseName: baseName,
                    operation: operation,
                    ext: ext,
                    blobSize: blob.size,
                    quality: extraData.quality
                };

                if (fileIndex === state.currentSlideIndex) {
                    displaySlide(state.currentSlideIndex, options, state);
                }

                updateSlideUI(options, state);

                if (comparisonPages.includes(page) && comparisonContainer) {
                    comparisonContainer.classList.remove('hidden');
                    if (fileIndex === state.currentSlideIndex) {
                        initMagnifierFeature();
                    }
                } else if (resultContainer && page !== 'IC') {
                    resultContainer.classList.remove('hidden');
                }

                state.processingIndex++;
                if (state.processingIndex < state.fileQueue.length) {
                    processNextFile();
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('There was an error processing your file. Please try again.');
                state.processingIndex++;
                if (state.processingIndex < state.fileQueue.length) {
                    processNextFile();
                }
            })
            .finally(() => {
                if (state.processingIndex >= state.fileQueue.length && typeof hideProcessing === 'function') {
                    hideProcessing();
                }
            });
    }

    function processNextFile() {
        if (state.processingIndex >= state.fileQueue.length) return;
        const fileIndex = state.processingIndex;
        const file = state.fileQueue[fileIndex];
        const reader = new FileReader();

        reader.onload = function (e) {
            const previewDataUrl = e.target.result;
            if (page === 'BR') {
                sendFileToBackend(file, '/process_background_removal', {}, 'no_bg', 'png', previewDataUrl, fileIndex);
            } else if (page === 'FC' && formatSelect) {
                const targetFormat = formatSelect.value;
                const ext = targetFormat.toLowerCase();
                sendFileToBackend(file, '/process_image_conversion', { output_format: targetFormat }, 'converted', ext, previewDataUrl, fileIndex);
            } else if (page === 'IC') {
                const quality = qualitySlider ? qualitySlider.value : 50;
                const fileExt = (file.name || '').split('.').pop().toLowerCase();
                const ext = fileExt || 'jpg';
                sendFileToBackend(file, '/process_compression', { quality: quality }, 'compressed', ext, previewDataUrl, fileIndex);
            } else if (page === 'NR') {
                const fileExt = (file.name || '').split('.').pop().toLowerCase();
                const ext = fileExt || 'png';
                sendFileToBackend(file, '/process_image_cleaning', {}, 'cleaned', ext, previewDataUrl, fileIndex);
            }
        };
        reader.readAsDataURL(file);
    }

    function handleFiles(files) {
        clearOutputs(options, state);
        if (page === 'FC') {
            state.fileQueue = files.filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
        } else {
            state.fileQueue = files.filter(f => f.type.startsWith('image/'));
        }

        if (state.fileQueue.length === 0) {
            alert('No valid files selected!');
            return;
        }
        processNextFile();
    }

    // Modal PDF Standardizing
    const resizePdfBtnEl = document.getElementById('resize-pdf-btn');
    const resizeModalEl = document.getElementById('resize-modal');
    const closeResizeModalBtn = document.getElementById('close-resize-modal-btn');
    const cancelResizeModalBtn = document.getElementById('cancel-resize-modal-btn');
    const applyResizeModalBtn = document.getElementById('apply-resize-modal-btn');
    const optionCards = document.querySelectorAll('.size-option-card');

    if (resizePdfBtnEl && resizeModalEl) {
        resizePdfBtnEl.addEventListener('click', () => resizeModalEl.classList.remove('hidden'));
    }
    if (closeResizeModalBtn && resizeModalEl) {
        closeResizeModalBtn.addEventListener('click', () => resizeModalEl.classList.add('hidden'));
    }
    if (cancelResizeModalBtn && resizeModalEl) {
        cancelResizeModalBtn.addEventListener('click', () => resizeModalEl.classList.add('hidden'));
    }
    if (resizeModalEl) {
        resizeModalEl.addEventListener('click', (e) => {
            if (e.target === resizeModalEl) resizeModalEl.classList.add('hidden');
        });
    }

    if (optionCards.length) {
        optionCards.forEach(card => {
            card.addEventListener('click', () => {
                optionCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                const radio = card.querySelector('input[type="radio"]');
                if (radio) radio.checked = true;
            });
        });
    }

    if (applyResizeModalBtn) {
        applyResizeModalBtn.addEventListener('click', () => {
            const selectedRadio = document.querySelector('input[name="pageSizeChoice"]:checked');
            const chosenSize = selectedRadio ? selectedRadio.value : 'US Letter';
            if (resizeModalEl) resizeModalEl.classList.add('hidden');

            const currentResult = state.processedResults[state.currentSlideIndex];
            const fileToReProcess = currentResult ? currentResult.file : null;
            if (!fileToReProcess) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                sendFileToBackend(
                    fileToReProcess,
                    '/process_image_conversion',
                    { output_format: 'PDF', page_size: chosenSize },
                    'standardized',
                    'pdf',
                    e.target.result,
                    state.currentSlideIndex
                );
            };
            reader.readAsDataURL(fileToReProcess);
        });
    }

    if (qualitySlider && qualityValue) {
        qualitySlider.addEventListener('input', function () {
            qualityValue.textContent = qualitySlider.value;
            if (page === 'IC' && convertAgainBtn) {
                const currentResult = state.processedResults[state.currentSlideIndex];
                if (currentResult && currentResult.quality !== undefined) {
                    const currentQuality = parseInt(currentResult.quality);
                    const newQuality = parseInt(qualitySlider.value);
                    if (newQuality !== currentQuality) {
                        convertAgainBtn.classList.remove('hidden');
                    } else {
                        convertAgainBtn.classList.add('hidden');
                    }
                } else {
                    convertAgainBtn.classList.add('hidden');
                }
            }
        });
    }

    if (uploadArea) {
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragging'); });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragging'));
        uploadArea.addEventListener('drop', (e) => { e.preventDefault(); uploadArea.classList.remove('dragging'); handleFiles(Array.from(e.dataTransfer.files)); });
    }

    if (fileInput) {
        fileInput.addEventListener('change', () => handleFiles(Array.from(fileInput.files)));
    }

    if (prevSlideBtn) {
        prevSlideBtn.addEventListener('click', () => {
            if (state.currentSlideIndex > 0) {
                state.currentSlideIndex--;
                displaySlide(state.currentSlideIndex, options, state);
            }
        });
    }

    if (nextSlideBtn) {
        nextSlideBtn.addEventListener('click', () => {
            if (state.currentSlideIndex < state.processedResults.length - 1) {
                state.currentSlideIndex++;
                displaySlide(state.currentSlideIndex, options, state);
            }
        });
    }

    if (convertAgainBtn) {
        convertAgainBtn.addEventListener('click', () => {
            const currentResult = state.processedResults[state.currentSlideIndex];
            const fileToReProcess = currentResult ? currentResult.file : null;
            if (!fileToReProcess) return;

            if (downloadBtn) downloadBtn.classList.add('hidden');
            if (resultImage) resultImage.classList.add('hidden');
            const outputPdf = document.getElementById('output-pdf');
            if (outputPdf) outputPdf.classList.add('hidden');
            const compressedSizeEl = document.getElementById('compressed-size');
            if (compressedSizeEl) compressedSizeEl.classList.add('hidden');
            const convertedNameEl = document.getElementById('converted-name');
            if (convertedNameEl) convertedNameEl.classList.add('hidden');

            const reader = new FileReader();
            reader.onload = function (e) {
                if (page === 'FC' && formatSelect) {
                    sendFileToBackend(fileToReProcess, '/process_image_conversion', { output_format: formatSelect.value }, 'converted', formatSelect.value.toLowerCase(), e.target.result, state.currentSlideIndex);
                } else if (page === 'IC' && qualitySlider) {
                    const quality = qualitySlider.value;
                    const fileExt = (fileToReProcess.name || '').split('.').pop().toLowerCase();
                    sendFileToBackend(fileToReProcess, '/process_compression', { quality: quality }, 'compressed', fileExt || 'jpg', e.target.result, state.currentSlideIndex);
                }
            };
            reader.readAsDataURL(fileToReProcess);
        });
    }
}
