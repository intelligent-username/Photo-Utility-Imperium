import { initMagnifierFeature } from './magnifier.js';

export function initImageProcessing(options) {
    const {
        page,
        fileInput,
        uploadArea,
        previewImage,
        resultImage,
        downloadBtn,
        comparisonContainer,
        resultContainer,
        formatSelect,
        slideCounterEl,
        prevSlideBtn,
        nextSlideBtn,
        slideshowHeader,
        convertAgainBtn,
        showProcessing,
        hideProcessing,
    } = options;

    const comparisonPages = ['BR', 'NR'];

    let fileQueue = [];
    let processedResults = [];
    let currentSlideIndex = 0;
    let processingIndex = 0;

    const getBaseName = (filename) => filename.replace(/\.[^/.]+$/, '');

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const clearOutputs = () => {
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
        const originalNameEl = document.getElementById('original-name');
        const convertedNameEl = document.getElementById('converted-name');
        if (originalNameEl) originalNameEl.classList.add('hidden');
        if (convertedNameEl) convertedNameEl.classList.add('hidden');
        if (convertAgainBtn) convertAgainBtn.classList.add('hidden');
        if (slideshowHeader) slideshowHeader.style.display = 'none';
        fileQueue = [];
        processedResults = [];
        currentSlideIndex = 0;
        processingIndex = 0;
    };

    function updateSlideUI() {
        if (slideshowHeader) {
            slideshowHeader.style.display = fileQueue.length > 1 ? 'flex' : 'none';
        }
        if (slideCounterEl) {
            slideCounterEl.textContent = `${currentSlideIndex + 1}/${fileQueue.length || 1}`;
        }
        if (prevSlideBtn) {
            prevSlideBtn.disabled = currentSlideIndex === 0 || !processedResults[currentSlideIndex - 1];
        }
        if (nextSlideBtn) {
            nextSlideBtn.disabled = currentSlideIndex >= fileQueue.length - 1 || !processedResults[currentSlideIndex + 1];
        }
    }

    function displaySlide(index) {
        if (index < 0 || index >= processedResults.length || !processedResults[index]) return;
        const result = processedResults[index];

        const previewPdf = document.getElementById('preview-pdf');
        const outputPdf = document.getElementById('output-pdf');
        const isInputPdf = result.file && result.file.type === 'application/pdf';
        const isOutputPdf = result.ext && result.ext.toLowerCase() === 'pdf';

        if (isInputPdf && previewPdf) {
            previewPdf.src = result.preview;
            previewPdf.classList.remove('hidden');
            if (previewImage) previewImage.classList.add('hidden');
        } else if (previewImage) {
            previewImage.src = result.preview;
            previewImage.classList.remove('hidden');
            if (previewPdf) previewPdf.classList.add('hidden');
        }

        if (isOutputPdf && outputPdf) {
            outputPdf.src = result.output;
            outputPdf.classList.remove('hidden');
            if (resultImage) resultImage.classList.add('hidden');
        } else if (resultImage) {
            resultImage.src = result.output;
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
            if (originalSizeEl) {
                originalSizeEl.textContent = formatFileSize(result.file.size);
                originalSizeEl.classList.remove('hidden');
            }
            if (compressedSizeEl) {
                compressedSizeEl.textContent = formatFileSize(result.blobSize);
                compressedSizeEl.classList.remove('hidden');
                compressedSizeEl.classList.add('savings');
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
        }

        updateSlideUI();

        if (comparisonPages.includes(page) && comparisonContainer && !comparisonContainer.classList.contains('hidden')) {
            initMagnifierFeature();
        }
    }

    function processNextFile() {
        if (processingIndex >= fileQueue.length) return;
        const file = fileQueue[processingIndex];
        handleFile(file, processingIndex);
    }

    function handleFile(file, fileIndex) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            const previewDataUrl = e.target.result;
            if (fileIndex === currentSlideIndex) {
                const isPdf = file.type === 'application/pdf';
                const previewPdf = document.getElementById('preview-pdf');
                if (isPdf && previewPdf) {
                    previewPdf.src = previewDataUrl;
                    previewPdf.classList.remove('hidden');
                    if (previewImage) previewImage.classList.add('hidden');
                } else if (previewImage) {
                    previewImage.src = previewDataUrl;
                    previewImage.classList.remove('hidden');
                    if (previewPdf) previewPdf.classList.add('hidden');
                }
            }

            if (page === 'FC') {
                const format = formatSelect ? formatSelect.value : 'PNG';
                sendFileToBackend(file, '/process_image_conversion', { output_format: format }, 'converted', format.toLowerCase(), previewDataUrl, fileIndex);
            }
            if (page === 'BR') {
                sendFileToBackend(file, '/process_background_removal', {}, 'bg-removed', 'png', previewDataUrl, fileIndex);
            }
            if (page === 'IC') {
                sendFileToBackend(file, '/process_compression', {}, 'compressed', 'jpg', previewDataUrl, fileIndex);
            }
            if (page === 'NR') {
                sendFileToBackend(file, '/process_image_cleaning', {}, 'cleaned', 'png', previewDataUrl, fileIndex);
            }
        };
        reader.readAsDataURL(file);
    }

    function sendFileToBackend(file, url, extraData = {}, operation = 'processed', ext = 'png', previewDataUrl = '', fileIndex = 0) {
        const formData = new FormData();
        formData.append('file', file);
        const baseName = getBaseName(file.name);
        for (const key in extraData) {
            formData.append(key, extraData[key]);
        }

        showProcessing();
        fetch(url, { method: 'POST', body: formData })
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.blob();
        })
        .then(blob => {
            const objectURL = URL.createObjectURL(blob);
            processedResults[fileIndex] = {
                preview: previewDataUrl,
                output: objectURL,
                file: file,
                baseName: baseName,
                operation: operation,
                ext: ext,
                blobSize: blob.size
            };

            if (fileIndex === currentSlideIndex) {
                displaySlide(currentSlideIndex);
            }

            updateSlideUI();

            if (comparisonPages.includes(page) && comparisonContainer) {
                comparisonContainer.classList.remove('hidden');
                if (fileIndex === currentSlideIndex) {
                    initMagnifierFeature();
                }
            } else if (resultContainer) {
                resultContainer.classList.remove('hidden');
            }

            processingIndex++;
            if (processingIndex < fileQueue.length) {
                processNextFile();
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('There was an error processing your file. Please try again.');
            processingIndex++;
            if (processingIndex < fileQueue.length) {
                processNextFile();
            }
        })
        .finally(() => {
            if (processingIndex >= fileQueue.length) {
                hideProcessing();
            }
        });
    }

    function handleFiles(files) {
        clearOutputs();
        if (page === 'FC') {
            fileQueue = files.filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
        } else {
            fileQueue = files.filter(f => f.type.startsWith('image/'));
        }
        processedResults = [];
        currentSlideIndex = 0;
        processingIndex = 0;

        if (fileQueue.length === 0) {
            alert('No valid files selected!');
            return;
        }
        processNextFile();
    }

    if (uploadArea) {
        uploadArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            uploadArea.classList.add('dragging');
        });

        uploadArea.addEventListener('dragleave', function() {
            uploadArea.classList.remove('dragging');
        });

        uploadArea.addEventListener('drop', function(e) {
            e.preventDefault();
            uploadArea.classList.remove('dragging');
            const files = Array.from(e.dataTransfer.files);
            handleFiles(files);
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', function() {
            const files = Array.from(fileInput.files);
            handleFiles(files);
        });
    }

    if (prevSlideBtn) {
        prevSlideBtn.addEventListener('click', function() {
            if (currentSlideIndex > 0) {
                currentSlideIndex--;
                displaySlide(currentSlideIndex);
            }
        });
    }

    if (nextSlideBtn) {
        nextSlideBtn.addEventListener('click', function() {
            if (currentSlideIndex < processedResults.length - 1) {
                currentSlideIndex++;
                displaySlide(currentSlideIndex);
            }
        });
    }

    if (convertAgainBtn && page === 'FC') {
        convertAgainBtn.addEventListener('click', function() {
            const currentResult = processedResults[currentSlideIndex];
            const fileToConvert = currentResult ? currentResult.file : null;
            if (fileToConvert && formatSelect) {
                const format = formatSelect.value;
                const reader = new FileReader();
                reader.onload = function(e) {
                    sendFileToBackend(fileToConvert, '/process_image_conversion', { output_format: format }, 'converted', format.toLowerCase(), e.target.result, currentSlideIndex);
                };
                reader.readAsDataURL(fileToConvert);
            }
        });
    }
}
