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
});
