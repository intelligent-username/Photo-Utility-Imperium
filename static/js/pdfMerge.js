export function initPdfMerge(options) {
    const { uploadArea, fileInput, showProcessing, hideProcessing } = options;
    if (!uploadArea || !fileInput) return;

    let pdfFiles = [];

    function updateFileList(files) {
        const fileListContainer = document.getElementById('file-list');
        if (!fileListContainer) return;
        fileListContainer.innerHTML = '';
        files.forEach((file, index) => {
            const li = document.createElement('li');
            
            const nameSpan = document.createElement('span');
            nameSpan.classList.add('file-name');
            nameSpan.textContent = `${index + 1}. ${file.name}`;
            li.appendChild(nameSpan);

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.classList.add('remove-file-btn');
            removeBtn.innerHTML = '&times;';
            removeBtn.title = 'Remove this file';
            removeBtn.addEventListener('click', function() {
                files.splice(index, 1);
                pdfFiles = files.slice();
                updateFileList(pdfFiles);
            });

            li.appendChild(removeBtn);
            fileListContainer.appendChild(li);
        });
    }

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
        const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
        pdfFiles = pdfFiles.concat(files);
        updateFileList(pdfFiles);
    });

    fileInput.addEventListener('change', function() {
        const files = Array.from(fileInput.files).filter(file => file.type === 'application/pdf');
        pdfFiles = pdfFiles.concat(files);
        updateFileList(pdfFiles);
    });

    const mergeBtn = document.getElementById('merge-btn');
    const resetBtn = document.getElementById('reset-btn');

    if (mergeBtn) {
        mergeBtn.addEventListener('click', function() {
            if (pdfFiles.length === 0) {
                alert('No PDF files selected!');
                return;
            }

            const pagesBetweenInput = document.getElementById('pages-between')?.value;
            const pagesBetween = Math.floor(Math.abs(parseInt(pagesBetweenInput) || 0));

            const formData = new FormData();
            pdfFiles.forEach((file, index) => formData.append(`file${index}`, file));
            formData.append('pages_between', pagesBetween);

            showProcessing();
            fetch('/process_pdf_merge', { method: 'POST', body: formData })
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.blob();
            })
            .then(blob => {
                const objectURL = URL.createObjectURL(blob);
                const pdfPreview = document.getElementById('merged-pdf-preview');
                if (pdfPreview) {
                    pdfPreview.src = objectURL;
                    pdfPreview.classList.remove('hidden');
                }
                updateFileList(pdfFiles); // keep list after merge
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
            pdfFiles = [];
            updateFileList(pdfFiles);
            const pdfPreview = document.getElementById('merged-pdf-preview');
            if (pdfPreview) {
                pdfPreview.classList.add('hidden');
                pdfPreview.src = '';
            }
        });
    }
}
