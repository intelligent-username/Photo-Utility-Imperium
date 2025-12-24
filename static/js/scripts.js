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

    // Store current file for FC re-conversion
    let currentFile = null;
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
            const file = e.dataTransfer.files[0];
            handleFile(file);
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', function() {
            const file = fileInput.files[0];
            handleFile(file);
        });
    }

    // Function to handle the file upload and preview
    function handleFile(file) {
        if (!file) return;  // Ensure file exists before proceeding
        clearOutputs();

        // Display original file size for IC page
        if (page === 'IC') {
            const originalSizeEl = document.getElementById('original-size');
            if (originalSizeEl) {
                originalSizeEl.textContent = formatFileSize(file.size);
                originalSizeEl.classList.remove('hidden');
            }
        }

        // Display original filename for FC page
        if (page === 'FC') {
            const originalNameEl = document.getElementById('original-name');
            if (originalNameEl) {
                originalNameEl.textContent = file.name;
                originalNameEl.title = file.name;
                originalNameEl.classList.remove('hidden');
            }
        }

        if (previewImage && imagePreviewContainer) {
            const reader = new FileReader();
            reader.onload = function(e) {
                previewImage.src = e.target.result;  // Display the original image in the preview
                previewImage.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }

        // Determine the appropriate route based on the page
        if (page === 'FC') {
            currentFile = file;  // Store for re-conversion
            const format = formatSelect ? formatSelect.value : 'PNG';  // Get selected format
            sendFileToBackend(file, '/process_image_conversion', { output_format: format }, 'converted', format.toLowerCase());  // Image converter route
        }
        if (page === 'BR') {
            sendFileToBackend(file, '/process_background_removal', {}, 'bg-removed', 'png');  // Background remover route
        }
        if (page === 'IC') {
            sendFileToBackend(file, '/process_compression', {}, 'compressed', 'jpg');  // Image compressor route
        }
        if (page === 'NR') {
            sendFileToBackend(file, '/process_image_cleaning', {}, 'cleaned', 'png');  // Image cleaner route
        }
    }

    // Function to send the file to the backend and handle the response
    function sendFileToBackend(file, url, extraData = {}, operation = 'processed', ext = 'png') {
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
            if (resultImage && downloadBtn) {
                resultImage.src = objectURL;  // Display the result image
                resultImage.classList.remove('hidden');
                downloadBtn.href = objectURL;
                downloadBtn.download = `${baseName}_${operation}.${ext}`;
                downloadBtn.classList.remove('hidden');  // Show the download button

                // Display compressed file size for IC page
                if (page === 'IC') {
                    const compressedSizeEl = document.getElementById('compressed-size');
                    if (compressedSizeEl) {
                        compressedSizeEl.textContent = formatFileSize(blob.size);
                        compressedSizeEl.classList.remove('hidden');
                        compressedSizeEl.classList.add('savings');
                    }
                }

                // Display converted filename for FC page
                if (page === 'FC') {
                    const convertedNameEl = document.getElementById('converted-name');
                    if (convertedNameEl) {
                        const newName = `${baseName}_${operation}.${ext}`;
                        convertedNameEl.textContent = newName;
                        convertedNameEl.title = newName;
                        convertedNameEl.classList.remove('hidden');
                    }
                    // Show convert again button
                    if (convertAgainBtn) {
                        convertAgainBtn.classList.remove('hidden');
                    }
                }

                // For comparison pages, show the comparison container
                if (comparisonPages.includes(page) && comparisonContainer) {
                    comparisonContainer.classList.remove('hidden');
                    initMagnifier();
                } else if (resultContainer) {
                    resultContainer.classList.remove('hidden');
                }
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('There was an error processing your file. Please try again.');
        })
        .finally(() => hideProcessing());
    }

    // Convert Again button handler for FC page
    if (convertAgainBtn && page === 'FC') {
        convertAgainBtn.addEventListener('click', function() {
            if (currentFile && formatSelect) {
                const format = formatSelect.value;
                sendFileToBackend(currentFile, '/process_image_conversion', { output_format: format }, 'converted', format.toLowerCase());
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
                li.textContent = `${index + 1}. ${file.name}`;
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

                    // Reset files after successful merge
                    pdfFiles = [];
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
