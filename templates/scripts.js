document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadfile');
    const previewImage = document.getElementById('preview');
    const resultImage = document.getElementById('output');
    const downloadBtn = document.getElementById('download-btn');

    // Handle Drag and Drop
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.add('dragging');
    });

    uploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('dragging');
    });

    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('dragging');

        const file = e.dataTransfer.files[0];
        handleFile(file);
    });

    // Handle file selection from input
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        handleFile(file);
    });

    function handleFile(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            previewImage.src = e.target.result;
            previewImage.style.display = 'block';
            sendFileToBackend(file);
        };
        reader.readAsDataURL(file);
    }

    // Send file to backend for processing via AJAX
    function sendFileToBackend(file) {
        const formData = new FormData();
        formData.append('file', file);

        // Adjust the URL depending on the feature (e.g., '/process_background_removal', '/process_compression', etc.)
        fetch('/process_image', {
            method: 'POST',
            body: formData
        })
        .then(response => response.blob())
        .then(blob => {
            // Convert blob to URL and display processed image
            const url = URL.createObjectURL(blob);
            resultImage.src = url;
            resultImage.style.display = 'block';

            // Enable download button
            downloadBtn.href = url;
            downloadBtn.style.display = 'inline-block';
        })
        .catch(error => {
            console.error('Error:', error);
        });
    }
});
