document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadfile');
    const previewImage = document.getElementById('preview');
    const resultImage = document.getElementById('output');
    const downloadBtn = document.getElementById('download-btn');
    const imagePreviewContainer = document.getElementById('image-preview');
    const resultContainer = document.getElementById('result');
    const comparisonContainer = document.getElementById('comparison-container');
    const formatSelect = document.getElementById('formatSelect');
    const page = (document.body.getAttribute('data-page') || '').trim();  // Detect which page we are on
    const processingOverlay = document.getElementById('processing-overlay');

    // Pages that use the comparison magnifier
    const comparisonPages = ['BR', 'NR'];

    // Multi-file handling for image processing pages
    let fileQueue = [];  // Queue of files to process
    let processedResults = [];  // Store { file, preview, output } for each processed file
    let currentSlideIndex = 0;  // For display/navigation
    let processingIndex = 0;  // For tracking which file is being processed
    const slideCounterEl = document.getElementById('slide-counter');
    const prevSlideBtn = document.getElementById('prev-slide');
    const nextSlideBtn = document.getElementById('next-slide');
    const slideshowHeader = document.getElementById('slideshow-header');
    const convertAgainBtn = document.getElementById('convert-again-btn');

    // Navbar toggle for mobile
    const navbarToggler = document.querySelector('.app-nav-toggle');
    const navbarCollapse = document.getElementById('navbarSupportedContent');
    if (navbarToggler && navbarCollapse) {
        navbarToggler.addEventListener('click', function() {
            const nextState = !navbarCollapse.classList.contains('show');
            navbarCollapse.classList.toggle('show', nextState);
            navbarToggler.setAttribute('aria-expanded', String(nextState));
        });

        navbarCollapse.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                navbarCollapse.classList.remove('show');
                navbarToggler.setAttribute('aria-expanded', 'false');
            });
        });
    }

    // Helper to toggle processing overlay
    const setProcessing = (isActive) => {
        if (!processingOverlay) return;
        processingOverlay.classList.toggle('active', isActive);
        processingOverlay.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    };
    const showProcessing = () => setProcessing(true);
    const hideProcessing = () => setProcessing(false);

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
        // Clear PDF iframes
        const previewPdf = document.getElementById('preview-pdf');
        const outputPdf = document.getElementById('output-pdf');
        if (previewPdf) { previewPdf.src = ''; previewPdf.classList.add('hidden'); }
        if (outputPdf) { outputPdf.src = ''; outputPdf.classList.add('hidden'); }
        // Clear file size badges
        const originalSizeEl = document.getElementById('original-size');
        const compressedSizeEl = document.getElementById('compressed-size');
        if (originalSizeEl) originalSizeEl.classList.add('hidden');
        if (compressedSizeEl) compressedSizeEl.classList.add('hidden');
        // Clear filename badges
        const originalNameEl = document.getElementById('original-name');
        const convertedNameEl = document.getElementById('converted-name');
        if (originalNameEl) originalNameEl.classList.add('hidden');
        if (convertedNameEl) convertedNameEl.classList.add('hidden');
        // Hide convert again button
        if (convertAgainBtn) convertAgainBtn.classList.add('hidden');
        // Hide slideshow header
        if (slideshowHeader) slideshowHeader.style.display = 'none';
        // Reset slideshow
        fileQueue = [];
        processedResults = [];
        currentSlideIndex = 0;
        processingIndex = 0;
    };

    // Filename without extension
    const getBaseName = (filename) => filename.replace(/\.[^/.]+$/, '');

    // Format file size in human-readable format
    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    // Safeguard: elements may be missing on some pages
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
            if (page === 'PDF') return;  // PDF page has its own handler
            const files = Array.from(e.dataTransfer.files);
            handleFiles(files);
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', function() {
            if (page === 'PDF') return;  // PDF page has its own handler
            const files = Array.from(fileInput.files);
            handleFiles(files);
        });
    }

    // Function to handle multiple files
    function handleFiles(files) {
        // PDF page has its own handlers; skip any generic calls here for safety
        if (page === 'PDF') return;

        clearOutputs();
        // FC page accepts images and PDFs, other pages only accept images
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

        // Process first file immediately, rest will be queued
        processNextFile();
    }

    // Process files one at a time
    function processNextFile() {
        if (processingIndex >= fileQueue.length) return;

        const file = fileQueue[processingIndex];
        handleFile(file, processingIndex);
    }

    // Update slideshow UI
    function updateSlideUI() {
        const processedCount = processedResults.filter(r => r).length;  // Count non-null results
        
        // Show/hide slideshow header based on file count
        if (slideshowHeader) {
            slideshowHeader.style.display = fileQueue.length > 1 ? 'flex' : 'none';
        }
        
        if (slideCounterEl) {
            slideCounterEl.textContent = `${currentSlideIndex + 1}/${fileQueue.length}`;
        }
        if (prevSlideBtn) {
            prevSlideBtn.disabled = currentSlideIndex === 0 || !processedResults[currentSlideIndex - 1];
        }
        if (nextSlideBtn) {
            nextSlideBtn.disabled = currentSlideIndex >= fileQueue.length - 1 || !processedResults[currentSlideIndex + 1];
        }
    }

    // Display current slide
    function displaySlide(index) {
        if (index < 0 || index >= processedResults.length || !processedResults[index]) return;

        const result = processedResults[index];

        // Update images/PDFs
        const previewPdf = document.getElementById('preview-pdf');
        const outputPdf = document.getElementById('output-pdf');
        const isInputPdf = result.file && result.file.type === 'application/pdf';
        const isOutputPdf = result.ext && result.ext.toLowerCase() === 'pdf';
        
        // Handle preview (original file)
        if (isInputPdf && previewPdf) {
            previewPdf.src = result.preview;
            previewPdf.classList.remove('hidden');
            if (previewImage) previewImage.classList.add('hidden');
        } else if (previewImage) {
            previewImage.src = result.preview;
            previewImage.classList.remove('hidden');
            if (previewPdf) previewPdf.classList.add('hidden');
        }
        
        // Handle result (converted file)
        if (isOutputPdf && outputPdf) {
            outputPdf.src = result.output;
            outputPdf.classList.remove('hidden');
            if (resultImage) resultImage.classList.add('hidden');
        } else if (resultImage) {
            resultImage.src = result.output;
            resultImage.classList.remove('hidden');
            if (outputPdf) outputPdf.classList.add('hidden');
        }

        // Update download button
        if (downloadBtn) {
            downloadBtn.href = result.output;
            downloadBtn.download = `${result.baseName}_${result.operation}.${result.ext}`;
            downloadBtn.classList.remove('hidden');
        }

        // Update badges for IC page
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

        // Update badges for FC page
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

        // Re-initialize magnifier if needed
        if (comparisonPages.includes(page) && comparisonContainer && !comparisonContainer.classList.contains('hidden')) {
            initMagnifier();
        }
    }

    // Slideshow navigation
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

    // Function to handle the file upload and preview
    function handleFile(file, fileIndex) {
        if (!file) return;  // Ensure file exists before proceeding

        // Read the file as data URL first, then send to backend
        const reader = new FileReader();
        reader.onload = function(e) {
            const previewDataUrl = e.target.result;

            // Only update display if this is the currently viewed slide
            if (fileIndex === currentSlideIndex) {
                const isPdf = file.type === 'application/pdf';
                const previewPdf = document.getElementById('preview-pdf');
                
                if (isPdf && previewPdf) {
                    // Show PDF in iframe, hide image
                    previewPdf.src = previewDataUrl;
                    previewPdf.classList.remove('hidden');
                    if (previewImage) previewImage.classList.add('hidden');
                } else if (previewImage) {
                    // Show image, hide PDF iframe
                    previewImage.src = previewDataUrl;
                    previewImage.classList.remove('hidden');
                    if (previewPdf) previewPdf.classList.add('hidden');
                }
            }

            // Determine the appropriate route based on the page
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

    // Function to send the file to the backend and handle the response
    function sendFileToBackend(file, url, extraData = {}, operation = 'processed', ext = 'png', previewDataUrl = '', fileIndex = 0) {
        const formData = new FormData();
        formData.append('file', file);
        const baseName = getBaseName(file.name);

        // Append extra form data if provided
        for (const key in extraData) {
            formData.append(key, extraData[key]);
        }

        showProcessing();
        fetch(url, {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.blob();
        })
        .then(blob => {
            const objectURL = URL.createObjectURL(blob);

            // Store result for slideshow (use passed previewDataUrl, not current DOM state)
            processedResults[fileIndex] = {
                preview: previewDataUrl,
                output: objectURL,
                file: file,
                baseName: baseName,
                operation: operation,
                ext: ext,
                blobSize: blob.size
            };

            // Only update display if this is the currently viewed slide
            if (fileIndex === currentSlideIndex) {
                displaySlide(currentSlideIndex);
            }

            // Update slide UI to reflect total processed
            updateSlideUI();

            // For comparison pages, show the comparison container
            if (comparisonPages.includes(page) && comparisonContainer) {
                comparisonContainer.classList.remove('hidden');
                if (fileIndex === currentSlideIndex) {
                    initMagnifier();
                }
            } else if (resultContainer) {
                resultContainer.classList.remove('hidden');
            }

            // Process next file if available
            processingIndex++;
            if (processingIndex < fileQueue.length) {
                processNextFile();
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('There was an error processing your file. Please try again.');
            // Still try to process remaining files
            processingIndex++;
            if (processingIndex < fileQueue.length) {
                processNextFile();
            }
        })
        .finally(() => {
            // Only hide processing when all files are done
            if (processingIndex >= fileQueue.length) {
                hideProcessing();
            }
        });
    }

    // Convert Again button handler for FC page
    if (convertAgainBtn && page === 'FC') {
        convertAgainBtn.addEventListener('click', function() {
            // Get the file from current slide's processed result
            const currentResult = processedResults[currentSlideIndex];
            const fileToConvert = currentResult ? currentResult.file : null;
            
            if (fileToConvert && formatSelect) {
                const format = formatSelect.value;
                // Read the file to get preview data URL
                const reader = new FileReader();
                reader.onload = function(e) {
                    sendFileToBackend(fileToConvert, '/process_image_conversion', { output_format: format }, 'converted', format.toLowerCase(), e.target.result, currentSlideIndex);
                };
                reader.readAsDataURL(fileToConvert);
            }
        });
    }

    // PDF merging page handling
    if (page === 'PDF' && uploadArea && fileInput) {
        let pdfFiles = []; // Array to store selected PDF files

        uploadArea.addEventListener('drop', function(e) {
            e.preventDefault();
            uploadArea.classList.remove('dragging');
            const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
            pdfFiles = pdfFiles.concat(files); // Append files to the list
            updateFileList(pdfFiles);
        });

        fileInput.addEventListener('change', function() {
            const files = Array.from(fileInput.files).filter(file => file.type === 'application/pdf');
            pdfFiles = pdfFiles.concat(files);
            updateFileList(pdfFiles);
        });

        function updateFileList(files) {
            const fileListContainer = document.getElementById('file-list');
            if (!fileListContainer) return;
            fileListContainer.innerHTML = ''; // Clear existing list
            files.forEach((file, index) => {
                const li = document.createElement('li');
                li.classList.add('d-flex', 'justify-content-between', 'align-items-center');
                li.textContent = `${index + 1}. ${file.name}`;

                // Remove button ("x")
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.classList.add('btn', 'btn-sm', 'btn-outline-danger', 'ml-2');
                removeBtn.textContent = '×';
                removeBtn.title = 'Remove this file';
                removeBtn.addEventListener('click', function() {
                    files.splice(index, 1);      // remove from current array reference
                    pdfFiles = files.slice();     // sync back to main list
                    updateFileList(pdfFiles);
                });

                li.appendChild(removeBtn);
                fileListContainer.appendChild(li);
            });
        }

        const mergeBtn = document.getElementById('merge-btn');
        const resetBtn = document.getElementById('reset-btn');
        if (mergeBtn) {
            mergeBtn.addEventListener('click', function() {
                if (pdfFiles.length === 0) {
                    alert('No PDF files selected!');
                    return;
                }

                // Get the number of pages between PDFs
                const pagesBetweenInput = document.getElementById('pages-between')?.value;
                const pagesBetween = Math.floor(Math.abs(parseInt(pagesBetweenInput) || 0));

                const formData = new FormData();
                pdfFiles.forEach((file, index) => formData.append(`file${index}`, file));
                formData.append('pages_between', pagesBetween);

                showProcessing();
                fetch('/process_pdf_merge', {
                    method: 'POST',
                    body: formData
                })
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok');
                    return response.blob();
                })
                .then(blob => {
                    const objectURL = URL.createObjectURL(blob);

                    // Display the merged PDF in the preview iframe
                    const pdfPreview = document.getElementById('merged-pdf-preview');
                    if (pdfPreview) {
                        pdfPreview.src = objectURL;
                        pdfPreview.classList.remove('hidden');
                    }

                    // Preserve list after merge (user can remove individually or reset)
                    updateFileList(pdfFiles);
                })
                .catch(error => {
                    console.error('Error:', error);
                    alert('An error occurred while merging PDFs.');
                })
                .finally(() => hideProcessing());
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                pdfFiles = []; // Clear the list of files
                updateFileList(pdfFiles); // Refresh the displayed list
                const pdfPreview = document.getElementById('merged-pdf-preview');
                if (pdfPreview) {
                    pdfPreview.classList.add('hidden'); // Hide the merged PDF preview
                    pdfPreview.src = ''; // Clear the preview source
                }
            });
        }
    }

    // Magnifier comparison feature for BR/NR pages
    function initMagnifier() {
        const wrappers = document.querySelectorAll('.magnify-wrapper[data-pair="compare"]');
        if (wrappers.length < 2) return;

        const zoomLevel = 2.5;
        const lensSize = 120; // Must match CSS .magnifier-lens width/height

        wrappers.forEach((wrapper, idx) => {
            const img = wrapper.querySelector('img');
            const lens = wrapper.querySelector('.magnifier-lens');
            if (!img || !lens) return;

            // Set lens background to the image
            const updateLensBackground = () => {
                lens.style.backgroundImage = `url('${img.src}')`;
                lens.style.backgroundSize = `${img.offsetWidth * zoomLevel}px ${img.offsetHeight * zoomLevel}px`;
            };

            img.addEventListener('load', updateLensBackground);
            if (img.complete) updateLensBackground();

            wrapper.addEventListener('mouseenter', () => {
                wrappers.forEach(w => w.classList.add('magnify-active'));
            });

            wrapper.addEventListener('mouseleave', () => {
                wrappers.forEach(w => w.classList.remove('magnify-active'));
            });

            wrapper.addEventListener('mousemove', (e) => {
                const rect = wrapper.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                // Normalized position (0-1)
                const normX = x / rect.width;
                const normY = y / rect.height;

                // Update all lenses in the pair
                wrappers.forEach(w => {
                    const wImg = w.querySelector('img');
                    const wLens = w.querySelector('.magnifier-lens');
                    if (!wImg || !wLens) return;

                    const wRect = w.getBoundingClientRect();
                    const posX = normX * wRect.width;
                    const posY = normY * wRect.height;

                    // Position lens at cursor (or mirrored position)
                    wLens.style.left = `${posX}px`;
                    wLens.style.top = `${posY}px`;

                    // Calculate background position for zoom
                    const bgX = (normX * wImg.offsetWidth * zoomLevel) - (lensSize / 2);
                    const bgY = (normY * wImg.offsetHeight * zoomLevel) - (lensSize / 2);
                    wLens.style.backgroundPosition = `-${bgX}px -${bgY}px`;
                });
            });
        });
    }
});
