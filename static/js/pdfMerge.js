import { getState, loadFiles, resetState, reRenderCanvases, setAppMode } from './pdfCanvas.js';

export function initPdfMerge(options) {
    const { uploadArea, fileInput, showProcessing, hideProcessing } = options;
    if (!uploadArea || !fileInput) return;

    // ---- File upload ----
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
            const li = document.createElement('li');

            const name = document.createElement('span');
            name.className = 'file-name';
            name.textContent = `${i + 1}. ${f.name}`;
            li.appendChild(name);

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
            li.appendChild(removeBtn);

            ul.appendChild(li);
        });
    }

    // ---- Toolbar buttons ----
    const state = getState();

    const annotateBtn = document.getElementById('annotate-btn');
    const cropBtn = document.getElementById('crop-btn');
    const overlayBtn = document.getElementById('overlay-btn');
    const whiteoutBtn = document.getElementById('whiteout-btn');
    const restoreBtn = document.getElementById('restore-all-btn');
    const largeViewBtn = document.getElementById('large-view-btn');

    const annControls = document.getElementById('ann-controls');

    function clearModes() {
        if (annotateBtn) annotateBtn.classList.remove('active');
        if (cropBtn) cropBtn.classList.remove('active');
        if (overlayBtn) overlayBtn.classList.remove('active');
        if (whiteoutBtn) whiteoutBtn.classList.remove('active');
        if (annControls) annControls.classList.add('hidden');
        setAppMode('select');
    }

    function toggleMode(btn, modeName) {
        if (state.mode === modeName) { clearModes(); return; }
        if (annotateBtn) annotateBtn.classList.remove('active');
        if (cropBtn) cropBtn.classList.remove('active');
        if (overlayBtn) overlayBtn.classList.remove('active');
        if (whiteoutBtn) whiteoutBtn.classList.remove('active');

        if (btn) btn.classList.add('active');
        if (modeName === 'annotate' && annControls) {
            annControls.classList.remove('hidden');
        } else if (annControls) {
            annControls.classList.add('hidden');
        }
        setAppMode(modeName);
    }

    if (annotateBtn) annotateBtn.addEventListener('click', () => toggleMode(annotateBtn, 'annotate'));
    if (cropBtn) cropBtn.addEventListener('click', () => toggleMode(cropBtn, 'crop'));
    if (overlayBtn) overlayBtn.addEventListener('click', () => toggleMode(overlayBtn, 'overlay'));
    if (whiteoutBtn) whiteoutBtn.addEventListener('click', () => toggleMode(whiteoutBtn, 'whiteout'));

    if (largeViewBtn) {
        largeViewBtn.addEventListener('click', () => {
            state.isLargeView = !state.isLargeView;
            largeViewBtn.classList.toggle('active', state.isLargeView);
            document.getElementById('pdf-page-grid')?.classList.toggle('large-view', state.isLargeView);
            reRenderCanvases();
        });
    }

    if (restoreBtn) {
        restoreBtn.addEventListener('click', () => {
            state.pages.forEach(p => {
                p.excluded = false;
                p.whiteouts = [];
                p.cropBox = null;
                p.overlays = [];
                const card = document.getElementById(p.id);
                if (card) {
                    card.classList.remove('excluded', 'has-overlay', 'overlay-source');
                    const badge = card.querySelector('.overlay-badge');
                    if (badge) badge.remove();
                }
                renderCardCanvas(p);
            });
        });
    }

    // Color & size inputs
    const colorInput = document.getElementById('ann-color');
    const sizeInput = document.getElementById('ann-size');
    if (colorInput) colorInput.addEventListener('input', (e) => { state.annColor = e.target.value; });
    if (sizeInput) sizeInput.addEventListener('change', (e) => { state.annSize = parseInt(e.target.value, 10) || 16; });

    // ---- Export & Reset ----
    const exportBtn = document.getElementById('export-pdf-btn') || document.getElementById('merge-btn');
    const resetBtn = document.getElementById('reset-btn');

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            resetState();
            updateFileList([], false);
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
                annotations: p.annotations,
                cropBox: p.cropBox,
                overlays: p.overlays,
                whiteouts: p.whiteouts,
            }));
            formData.append('manifest', JSON.stringify(manifest));

            showProcessing();
            try {
                const res = await fetch('/process_pdf_edit', { method: 'POST', body: formData });
                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(`Server error ${res.status}: ${errText}`);
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);

                // Show in preview iframe
                const iframe = document.getElementById('merged-pdf-preview');
                if (iframe) {
                    iframe.src = url;
                    iframe.classList.remove('hidden');
                }

                // Trigger download
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
                hideProcessing();
            }
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            clearModes();
            resetState();
            sidebarFiles = [];
            updateFileList([], false);
            const iframe = document.getElementById('merged-pdf-preview');
            if (iframe) { iframe.src = ''; iframe.classList.add('hidden'); }
        });
    }
}
