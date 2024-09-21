document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadfile');
    const previewImage = document.getElementById('preview');
    const resultImage = document.getElementById('output');
    const downloadBtn = document.getElementById('download-btn');
    const page = document.body.getAttribute('data-page');  // Ensure page detection works

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

        if (page === 'page1') {
            sendFileToBackend(file, '/process_background_removal');
        } else if (page === 'page2') {
            sendFileToBackend(file, '/process_compression');
        } else if (page === 'page3') {
            sendFileToBackend(file, '/process_perspective_fix');
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
            return response.blob();
        })
        .then(blob => {
            const fileURL = URL.createObjectURL(blob);
            resultImage.src = fileURL;
            resultImage.style.display = 'block';
            downloadBtn.href = fileURL;
            downloadBtn.style.display = 'inline-block';
        })
        .catch(error => {
            console.error('Error:', error);
        });
    }
});
