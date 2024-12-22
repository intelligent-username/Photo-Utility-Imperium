document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadfile');
    const previewImage = document.getElementById('preview');
    const resultImage = document.getElementById('output');
    const downloadBtn = document.getElementById('download-btn');
    const imagePreviewContainer = document.getElementById('image-preview');
    const resultContainer = document.getElementById('result');
    const formatSelect = document.getElementById('formatSelect');
    const page = document.body.getAttribute('data-page');  // Detect which page we are on

    // Drag-and-drop handling
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

    // File input handling
    fileInput.addEventListener('change', function() {
        const file = fileInput.files[0];
        handleFile(file);
    });

    // Function to handle the file upload and preview
    function handleFile(file) {
        if (!file) return;  // Ensure file exists before proceeding
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImage.src = e.target.result;  // Display the original image in the preview
            previewImage.style.display = 'block';
            imagePreviewContainer.style.display = 'block';  // Show the image preview container
        };
        reader.readAsDataURL(file);

        // Determine the appropriate route based on the page
        if (page === 'page4') {
            const format = formatSelect.value;  // Get selected format
            sendFileToBackend(file, '/process_image_conversion', { output_format: format });  // Image converter route
        }
    }

    // Function to send the file to the backend and handle the response
    function sendFileToBackend(file, url, extraData = {}) {
        const formData = new FormData();
        formData.append('file', file);

        // Append extra form data if provided
        for (const key in extraData) {
            formData.append(key, extraData[key]);
        }

        fetch(url, {
            method: 'POST',
            body: formData
        })
        .then(response => response.blob())
        .then(blob => {
            const objectURL = URL.createObjectURL(blob);
            resultImage.src = objectURL;  // Display the result image
            resultImage.style.display = 'block';
            resultContainer.style.display = 'block';  // Show the result container
            downloadBtn.href = objectURL;
            downloadBtn.style.display = 'block';  // Show the download button
        })
        .catch(error => {
            console.error('Error:', error);
        });
    }
    // PDF merging page handling
    if (page === 'page5') {
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
            fileListContainer.innerHTML = ''; // Clear existing list
            files.forEach((file, index) => {
                const li = document.createElement('li');
                li.textContent = `${index + 1}. ${file.name}`;
                fileListContainer.appendChild(li);
            });
        }
    
        document.getElementById('merge-btn').addEventListener('click', function() {
            if (pdfFiles.length === 0) {
                alert('No PDF files selected!');
                return;
            }
    
            // Get the number of pages between PDFs
            const pagesBetweenInput = document.getElementById('pages-between').value;
            const pagesBetween = Math.floor(Math.abs(parseInt(pagesBetweenInput) || 0));
    
            const formData = new FormData();
            pdfFiles.forEach((file, index) => formData.append(`file${index}`, file));
            formData.append('pages_between', pagesBetween);
    
            fetch('/process_pdf_merge', {
                method: 'POST',
                body: formData
            })
            .then(response => response.blob())
            .then(blob => {
                const objectURL = URL.createObjectURL(blob);
    
                // Display the merged PDF in the preview iframe
                const pdfPreview = document.getElementById('merged-pdf-preview');
                pdfPreview.src = objectURL;
                pdfPreview.hidden = false;
    
                // Reset files after successful merge
                pdfFiles = [];
                updateFileList(pdfFiles);
            })
            .catch(error => {
                console.error('Error:', error);
                alert('An error occurred while merging PDFs.');
            });
        });
    
        document.getElementById('reset-btn').addEventListener('click', function() {
            pdfFiles = []; // Clear the list of files
            updateFileList(pdfFiles); // Refresh the displayed list
            const pdfPreview = document.getElementById('merged-pdf-preview');
            pdfPreview.hidden = true; // Hide the merged PDF preview
            pdfPreview.src = ''; // Clear the preview source
        });
    }    
});
