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

    // Function to handle the file upload and preview
    function handleFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImage.src = e.target.result;  // Display the original image in the preview
            previewImage.style.display = 'block';
            imagePreviewContainer.style.display = 'block';  // Show the image preview container
        };
        reader.readAsDataURL(file);

        // Determine the appropriate route based on the page
        if (page === 'page1') {
            sendFileToBackend(file, '/process_background_removal');  // Background remover route
        } else if (page === 'page2') {
            sendFileToBackend(file, '/process_compression');  // Image compressor route
        } else if (page === 'page3') {
            sendFileToBackend(file, '/process_perspective_fix');  // Perspective fixer route
        }
    }

    // Function to send the file to the backend and handle the response
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
            resultImage.style.display = 'block';
            resultContainer.style.display = 'block';  // Show the result container
            downloadBtn.href = fileURL;
            downloadBtn.setAttribute('download', 'processed_image.jpg');  // Set download filename
            downloadBtn.style.display = 'inline-block';  // Show the download button
        })
        .catch(error => {
            console.error('Error:', error);
        });
    }
});
