// ===========================================
//  pdfMerge.js — PDF file manager & merge entry point
// ===========================================

import { getState, loadFiles, resetState, cycleViewMode } from './pdfCanvas.js';
import { setupToolbarControls } from './pdfMergeControls.js';
import { snapshotStandardize } from './pdfCanvas/pdfHistory.js';

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

    // ---- Standardize size (minimal, same as FC) ----
    const stdBtn = document.getElementById('standardize-pdf-btn');
    const stdModal = document.getElementById('pdf-standardize-modal');
    const closeStdBtn = document.getElementById('close-pdf-standardize-modal-btn');
    const cancelStdBtn = document.getElementById('cancel-pdf-standardize-modal-btn');
    const applyStdBtn = document.getElementById('apply-pdf-standardize-modal-btn');
    const sizeCards = stdModal ? stdModal.querySelectorAll('.size-option-card') : [];

    if (stdBtn && stdModal) stdBtn.addEventListener('click', () => stdModal.classList.remove('hidden'));
    if (closeStdBtn && stdModal) closeStdBtn.addEventListener('click', () => stdModal.classList.add('hidden'));
    if (cancelStdBtn && stdModal) cancelStdBtn.addEventListener('click', () => stdModal.classList.add('hidden'));
    if (stdModal) stdModal.addEventListener('click', (e) => { if (e.target === stdModal) stdModal.classList.add('hidden'); });
    if (sizeCards.length) sizeCards.forEach(card => card.addEventListener('click', () => {
        sizeCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const r = card.querySelector('input[type="radio"]');
        if (r) r.checked = true;
    }));

    if (applyStdBtn) {
        applyStdBtn.addEventListener('click', async () => {
            const sel = stdModal.querySelector('input[name="pdfPageSizeChoice"]:checked');
            const chosenSize = sel ? sel.value : 'US Letter';
            if (stdModal) stdModal.classList.add('hidden');
            if (!state.pages || state.pages.length === 0) {
                alert('Upload PDFs first.');
                return;
            }
            snapshotStandardize();
            const isLetter = /LETTER|US/.test(chosenSize.toUpperCase());
            const baseW = isLetter ? 612 : 595;
            const baseH = isLetter ? 792 : 842;
            // square one: replace each page with blank standardized page
            console.log(`Standardize click ${chosenSize}: pages=${state.pages.length} base ${baseW}x${baseH}`);
            if (!state.pages.length) console.warn('no pages to standardize');
            for (const page of state.pages) {
                let sw, sh;
                if (page.isBlank) {
                    const ar = page.aspectRatio || (792/612);
                    if (ar >= 1) { sw = 612; sh = 612 * ar; } else { sw = 792 / ar; sh = 792; }
                } else if (page._pdfPage) {
                    const vp = page._pdfPage.getViewport({ scale: 1 });
                    sw = vp.width; sh = vp.height;
                } else {
                    sw = 612; sh = 792;
                }
                // SAME base for every page (all portrait Letter/A4), not per-page flip
                const tW = baseW, tH = baseH;
                page.standardized = { tw: tW, th: tH, sw, sh, chosenSize };
                page.aspectRatio = tH / tW;
                page._cacheCanvas = null;
                page._cacheWidth = null;
                console.log(` page ${page.id}: ${sw.toFixed(0)}x${sh.toFixed(0)} -> blank ${tW}x${tH} aspect ${page.aspectRatio.toFixed(3)}`);
            }
            console.log('calling syncGrid');
            const { syncGrid } = await import('./pdfCanvas/pdfCardBuilder.js');
            syncGrid();
            // wait for async renders to finish before logging sizes
            await new Promise(r => setTimeout(r, 300));
            console.log('syncGrid done, grid children', document.getElementById('pdf-page-grid')?.children.length);
            for (const p of state.pages) {
                const card = document.getElementById(p.id);
                if (card) {
                    const canv = card.querySelector('canvas');
                    if (canv) console.log(` card ${p.id} canvas ${canv.width}x${canv.height} expected ~${p.standardized.tw}x${p.standardized.th}`);
                }
            }
            const iframe = document.getElementById('merged-pdf-preview');
            if (iframe) { iframe.src = ''; iframe.classList.add('hidden'); }
        });
    }
}
