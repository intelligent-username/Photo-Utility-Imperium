document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadfile');
    const previewImage = document.getElementById('preview');
    const resultImage = document.getElementById('output');
    const downloadBtn = document.getElementById('download-btn');
    const imagePreviewContainer = document.getElementById('image-preview');
    const resultContainer = document.getElementById('result');
    const page = document.body.getAttribute('data-page');  // Detect which page we are on

    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.classList.add('dragging');
    });

    uploadArea.addEventListener('dragleave', function() {
        uploadArea.classList.remove('dragging');
    });

    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        handleFile(file);
    });

    fileInput.addEventListener('change', function() {
        const file = fileInput.files[0];
        handleFile(file);
    });

    uploadArea.addEventListener('click', function() {
        fileInput.click();
    });

    let isFileUploaded = false; // Prevent multiple uploads
    function handleFile(file) {
        if (!file || isFileUploaded) return;
        isFileUploaded = true; // Mark as uploaded
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImage.src = e.target.result;  // Display original image
            previewImage.style.display = 'block';
            imagePreviewContainer.style.display = 'block';  // Show the preview container
        };
        reader.readAsDataURL(file);

        // Route handling based on the page
        if (page === 'page1') {
            // For Page 1 (Background Remover)
            sendFileToBackend(file, '/process_background_removal');  // Send to background removal route
        } else if (page === 'page2') {
            // For Page 2 (Image Compressor)
            sendFileToBackend(file, '/process_compression');  // Send to the compressor route
        }
    }

    function sendFileToBackend(file, url) {
        const formData = new FormData();
        formData.append('file', file);
    
        fetch(url, {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Error processing file');
            }
            return response.blob();  // Get the processed image blob
        })
        .then(blob => {
            const fileURL = URL.createObjectURL(blob);  // Create a URL for the processed image
            resultImage.src = fileURL;  // Display the processed image
            resultImage.style.display = 'block';  // Show the processed image
            resultContainer.style.display = 'block';  // Make result container visible
    
            // Set the download button URL and show the button
            downloadBtn.href = fileURL;
            downloadBtn.setAttribute('download', 'processed_image.jpg');  // Set default filename for download
            downloadBtn.style.display = 'inline-block';  // Show the download button
        })
        .finally(() => {
            isFileUploaded = false;  // Reset for new uploads
        })
        .catch(error => {
            console.error('Error:', error);
        });
    }    
});
