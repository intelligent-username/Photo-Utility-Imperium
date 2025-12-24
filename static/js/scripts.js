document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadfile');
    const previewImage = document.getElementById('preview');
    const resultImage = document.getElementById('output');
    const downloadBtn = document.getElementById('download-btn');
    const imagePreviewContainer = document.getElementById('image-preview');
    const resultContainer = document.getElementById('result');
    const formatSelect = document.getElementById('formatSelect');
    const page = (document.body.getAttribute('data-page') || '').trim();  // Detect which page we are on
    const processingOverlay = document.getElementById('processing-overlay');

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
    };

    // Filename without extension
    const getBaseName = (filename) => filename.replace(/\.[^/.]+$/, '');

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
            if (resultImage && resultContainer && downloadBtn) {
                resultImage.src = objectURL;  // Display the result image
                resultImage.classList.remove('hidden');
                downloadBtn.href = objectURL;
                downloadBtn.download = `${baseName}_${operation}.${ext}`;
                downloadBtn.classList.remove('hidden');  // Show the download button
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('There was an error processing your file. Please try again.');
        })
        .finally(() => hideProcessing());
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
});
