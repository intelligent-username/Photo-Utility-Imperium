// ===========================================
//  pdfMerge.js — PDF file manager & merge entry point
// ===========================================

import { getState, loadFiles, resetState, cycleViewMode } from './pdfCanvas.js';
import { setupToolbarControls } from './pdfMergeControls.js';

export function initPdfMerge(options) {
    const { uploadArea, fileInput, showProcessing, hideProcessing } = options;
    if (!uploadArea || !fileInput) return;

    const state = getState();
    const { clearModes } = setupToolbarControls();

    // ---- File upload drop & input ----
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragging');
    });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragging'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragging');
        const pdfs = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
        if (pdfs.length) {
            loadFiles(pdfs);
            updateFileList(pdfs, true);
        }
    });
    fileInput.addEventListener('change', () => {
        const pdfs = Array.from(fileInput.files).filter(f => f.type === 'application/pdf');
        if (pdfs.length) {
            loadFiles(pdfs);
            updateFileList(pdfs, true);
        }
    });

    // ---- File list sidebar ----
    let sidebarFiles = [];
    function updateFileList(newFiles, append) {
        if (append) sidebarFiles = sidebarFiles.concat(Array.from(newFiles));
        else sidebarFiles = [];
        const ul = document.getElementById('file-list');
        if (!ul) return;
        ul.innerHTML = '';
        sidebarFiles.forEach((f, i) => {
            const li = document.createElement('span');
            li.className = 'file-name';
            li.textContent = `${i + 1}. ${f.name}`;

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'remove-file-btn';
            removeBtn.innerHTML = '&times;';
            removeBtn.title = 'Remove this file';
            removeBtn.addEventListener('click', () => {
                sidebarFiles.splice(i, 1);
                updateFileList([], false);
                sidebarFiles.forEach(sf => updateFileList([sf], true));
            });

            const item = document.createElement('li');
            item.appendChild(li);
            item.appendChild(removeBtn);
            ul.appendChild(item);
        });
    }

    // ---- View Mode Button ----
    const viewModeBtn = document.getElementById('view-mode-btn');
    if (viewModeBtn) {
        viewModeBtn.addEventListener('click', () => {
            cycleViewMode();
        });
    }

    // ---- Export & Reset Handlers ----
    const exportBtn = document.getElementById('export-pdf-btn') || document.getElementById('merge-btn');
    const resetBtn = document.getElementById('reset-btn');

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (typeof clearModes === 'function') clearModes();
            resetState();
            sidebarFiles = [];
            updateFileList([], false);
            const iframe = document.getElementById('merged-pdf-preview');
            if (iframe) { iframe.src = ''; iframe.classList.add('hidden'); }
        });
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            const activePages = state.pages.filter(p => !p.excluded);
            if (activePages.length === 0) {
                alert('No pages to export. Upload PDF files first.');
                return;
            }

            const formData = new FormData();
            state.files.forEach((file, i) => formData.append(`file_${i}`, file));

            const manifest = activePages.map(p => ({
                fileIndex: p.fileIdx,
                pageIndex: p.pageIdx,
                isBlank: p.isBlank || false,
                layers: p.layers,
                annotations: p.annotations,
                cropBox: p.cropBox,
                overlays: p.overlays,
                whiteouts: p.whiteouts,
            }));
            formData.append('manifest', JSON.stringify(manifest));

            if (typeof showProcessing === 'function') showProcessing();
            try {
                const res = await fetch('/process_pdf_edit', { method: 'POST', body: formData });
                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(`Server error ${res.status}: ${errText}`);
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);

                const iframe = document.getElementById('merged-pdf-preview');
                if (iframe) {
                    iframe.src = url;
                    iframe.classList.remove('hidden');
                }

                const a = document.createElement('a');
                a.href = url;
                a.download = 'edited.pdf';
                document.body.appendChild(a);
                a.click();
                a.remove();
            } catch (err) {
                console.error('Export failed:', err);
                alert('Failed to export PDF: ' + err.message);
            } finally {
                if (typeof hideProcessing === 'function') hideProcessing();
            }
        });
    }
}
