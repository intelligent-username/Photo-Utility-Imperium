document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadfile');
    const previewImage = document.getElementById('preview');
    const resultImage = document.getElementById('output');
    const downloadBtn = document.getElementById('download-btn');

    // Detect current page from data-page attribute
    const page = document.body.getAttribute('data-page');

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

    function handleFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImage.src = e.target.result;
            previewImage.style.display = 'block';
        };
        reader.readAsDataURL(file);

        // Call the correct function based on the page
        if (page === 'page1') {
            sendFileToBackend(file, '/process_bg_removal');
        } else if (page === 'page2') {
            sendFileToBackend(file, '/process_compression');
        }
        // Add more conditions for other pages as needed
    }

    function sendFileToBackend(file, url) {
        const formData = new FormData();
        formData.append('file', file);

        fetch(url, {
            method: 'POST',
            body: formData
        })
        .then(response => response.blob())
        .then(blob => {
            const url = URL.createObjectURL(blob);
            resultImage.src = url;
            resultImage.style.display = 'block';
            downloadBtn.href = url;
            downloadBtn.style.display = 'inline-block';
        })
        .catch(error => {
            console.error('Error:', error);
        });
    }
});
