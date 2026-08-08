import { getState, loadFiles, resetState, reRenderCanvases, setAppMode, setViewMode, cycleViewMode, loadSavedSignatures, saveSignatureStamp, removeSignatureStamp, formatDate } from './pdfCanvas.js';

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

    // ---- Toolbar Mode Selectors ----
    const annotateBtn = document.getElementById('annotate-btn');
    const cropBtn = document.getElementById('crop-btn');
    const overlayBtn = document.getElementById('overlay-btn');
    const whiteoutBtn = document.getElementById('whiteout-btn');
    const restoreBtn = document.getElementById('restore-all-btn');
    const annBar = document.getElementById('pdf-annotation-bar');
    const annToolText = document.getElementById('ann-tool-text');
    const annToolSign = document.getElementById('ann-tool-sign');
    const annBarControls = document.getElementById('ann-bar-controls');
    const viewModeBtn = document.getElementById('view-mode-btn');

    if (viewModeBtn) {
        viewModeBtn.addEventListener('click', () => {
            cycleViewMode();
        });
    }

    const state = getState();

    function clearModes() {
        if (annotateBtn) annotateBtn.classList.remove('active');
        if (cropBtn) cropBtn.classList.remove('active');
        if (overlayBtn) overlayBtn.classList.remove('active');
        if (whiteoutBtn) whiteoutBtn.classList.remove('active');
        if (annBar) annBar.classList.add('hidden');
        setAppMode('select');
    }

    function toggleMode(btn, modeName) {
        if (state.mode === modeName) { clearModes(); return; }
        if (annotateBtn) annotateBtn.classList.remove('active');
        if (cropBtn) cropBtn.classList.remove('active');
        if (overlayBtn) overlayBtn.classList.remove('active');
        if (whiteoutBtn) whiteoutBtn.classList.remove('active');

        if (btn) btn.classList.add('active');
        if (modeName === 'annotate') {
            if (annBar) annBar.classList.remove('hidden');
            selectAnnSubTool('text');
        } else if (annBar) {
            annBar.classList.add('hidden');
            setAppMode(modeName);
        }
    }

    function selectAnnSubTool(subTool) {
        const signMenu = document.getElementById('sign-dropdown-menu');
        const dateMenu = document.getElementById('date-dropdown-menu');
        if (subTool === 'text') {
            if (annToolText) annToolText.classList.add('active');
            if (annToolSign) annToolSign.classList.remove('active');
            const annToolDate = document.getElementById('ann-tool-date');
            if (annToolDate) annToolDate.classList.remove('active');
            if (annBarControls) annBarControls.classList.remove('hidden');
            if (signMenu) signMenu.classList.add('hidden');
            if (dateMenu) dateMenu.classList.add('hidden');
            setAppMode('annotate');
        } else if (subTool === 'sign') {
            if (annToolSign) annToolSign.classList.add('active');
            if (annToolText) annToolText.classList.remove('active');
            const annToolDate = document.getElementById('ann-tool-date');
            if (annToolDate) annToolDate.classList.remove('active');
            if (annBarControls) annBarControls.classList.add('hidden');
            if (signMenu) signMenu.classList.toggle('hidden');
            if (dateMenu) dateMenu.classList.add('hidden');
            setAppMode('signature');
        } else if (subTool === 'date') {
            const annToolDate = document.getElementById('ann-tool-date');
            if (annToolDate) annToolDate.classList.add('active');
            if (annToolText) annToolText.classList.remove('active');
            if (annToolSign) annToolSign.classList.remove('active');
            if (annBarControls) annBarControls.classList.add('hidden');
            if (dateMenu) dateMenu.classList.add('hidden');
            if (signMenu) signMenu.classList.add('hidden');
            setAppMode('date');
        }
    }

    if (annotateBtn) annotateBtn.addEventListener('click', () => toggleMode(annotateBtn, 'annotate'));
    if (cropBtn) cropBtn.addEventListener('click', () => toggleMode(cropBtn, 'crop'));
    if (overlayBtn) overlayBtn.addEventListener('click', () => toggleMode(overlayBtn, 'overlay'));
    if (whiteoutBtn) whiteoutBtn.addEventListener('click', () => toggleMode(whiteoutBtn, 'whiteout'));

    if (annToolText) {
        annToolText.addEventListener('click', () => selectAnnSubTool('text'));
    }
    if (annToolSign) {
        annToolSign.addEventListener('click', (e) => {
            e.stopPropagation();
            selectAnnSubTool('sign');
        });
    }

    const annToolDate = document.getElementById('ann-tool-date');
    if (annToolDate) {
        annToolDate.addEventListener('click', (e) => {
            e.stopPropagation();
            selectAnnSubTool('date');
        });
    }

    const annToolDateCaret = document.getElementById('ann-tool-date-caret');
    if (annToolDateCaret) {
        annToolDateCaret.addEventListener('click', (e) => {
            e.stopPropagation();
            const dateMenu = document.getElementById('date-dropdown-menu');
            const signMenu = document.getElementById('sign-dropdown-menu');
            if (dateMenu) dateMenu.classList.toggle('hidden');
            if (signMenu) signMenu.classList.add('hidden');
        });
    }

    // ---- Date Stamp Dropdown Logic ----
    const dateMenu = document.getElementById('date-dropdown-menu');
    const dateFormatOptions = document.querySelectorAll('.date-format-option');
    const dateFontOptions = document.querySelectorAll('.date-font-option');
    const datePreviewText = document.getElementById('date-preview-text');
    const dateColorInput = document.getElementById('date-color');
    const dateColorSwatch = document.getElementById('date-color-swatch');
    const dateColorDots = document.querySelectorAll('#date-dropdown-menu .color-dot');
    const dateSizeInput = document.getElementById('date-size');
    const dateSizeMinus = document.getElementById('date-size-minus');
    const dateSizePlus = document.getElementById('date-size-plus');

    function updateDatePreview() {
        if (!datePreviewText) return;
        datePreviewText.textContent = formatDate(state.dateFormat);
        datePreviewText.style.fontFamily = `"${state.dateFont}", sans-serif`;
        datePreviewText.style.color = state.dateColor;
        datePreviewText.style.fontWeight = state.dateBold ? 'bold' : 'normal';
        datePreviewText.style.fontSize = `${Math.max(10, state.dateSize)}px`;
    }

    if (dateFormatOptions.length) {
        dateFormatOptions.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                dateFormatOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                state.dateFormat = opt.getAttribute('data-format');
                updateDatePreview();
            });
        });
    }

    if (dateFontOptions.length) {
        dateFontOptions.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                dateFontOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                state.dateFont = opt.getAttribute('data-font');
                state.dateBold = opt.getAttribute('data-bold') === 'true';
                updateDatePreview();
            });
        });
    }

    if (dateColorDots.length) {
        dateColorDots.forEach(dot => {
            dot.addEventListener('click', (e) => {
                e.stopPropagation();
                dateColorDots.forEach(d => d.classList.remove('active'));
                dot.classList.add('active');
                const hex = dot.getAttribute('data-color');
                state.dateColor = hex;
                if (dateColorInput) dateColorInput.value = hex;
                if (dateColorSwatch) dateColorSwatch.style.backgroundColor = hex;
                updateDatePreview();
            });
        });
    }

    if (dateColorInput) {
        dateColorInput.addEventListener('input', (e) => {
            e.stopPropagation();
            const hex = e.target.value;
            state.dateColor = hex;
            if (dateColorSwatch) dateColorSwatch.style.backgroundColor = hex;
            dateColorDots.forEach(d => {
                d.classList.toggle('active', d.getAttribute('data-color').toLowerCase() === hex.toLowerCase());
            });
            updateDatePreview();
        });
    }

    if (dateSizeInput) {
        dateSizeInput.addEventListener('input', (e) => { state.dateSize = parseInt(e.target.value, 10) || 16; updateDatePreview(); });
        dateSizeInput.addEventListener('change', (e) => { state.dateSize = parseInt(e.target.value, 10) || 16; updateDatePreview(); });
    }

    if (dateSizeMinus && dateSizeInput) {
        dateSizeMinus.addEventListener('click', (e) => {
            e.stopPropagation();
            let val = Math.max(8, (parseInt(dateSizeInput.value, 10) || 16) - 2);
            dateSizeInput.value = val;
            state.dateSize = val;
            updateDatePreview();
        });
    }

    if (dateSizePlus && dateSizeInput) {
        dateSizePlus.addEventListener('click', (e) => {
            e.stopPropagation();
            let val = Math.min(72, (parseInt(dateSizeInput.value, 10) || 16) + 2);
            dateSizeInput.value = val;
            state.dateSize = val;
            updateDatePreview();
        });
    }

    updateDatePreview();

    // ---- Signature Dropdown & Modal Logic ----
    loadSavedSignatures();

    const signMenu = document.getElementById('sign-dropdown-menu');
    const createSigBtn = document.getElementById('create-sig-btn');
    const sigModal = document.getElementById('create-signature-modal');
    const closeSigModalBtn = document.getElementById('close-sig-modal-btn');
    const cancelSigModalBtn = document.getElementById('cancel-sig-modal-btn');
    const saveSigModalBtn = document.getElementById('save-sig-modal-btn');
    const sigNameInput = document.getElementById('sig-name-input');
    const sigLivePreviewText = document.getElementById('sig-live-preview-text');
    const sigFontOptions = document.querySelectorAll('.sig-font-option');
    const sigColorDots = document.querySelectorAll('.sig-color-dot');
    const sigStampsList = document.getElementById('signature-stamps-list');

    let currentSigFont = 'Caveat';
    let currentSigColor = '#0b1220';

    function renderSignatureStampsList() {
        if (!sigStampsList) return;
        sigStampsList.innerHTML = '';

        if (!state.signatures || state.signatures.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'dropdown-header-title';
            emptyMsg.style.textAlign = 'center';
            emptyMsg.textContent = 'No saved signatures';
            sigStampsList.appendChild(emptyMsg);
            return;
        }

        state.signatures.forEach(stamp => {
            const card = document.createElement('div');
            card.className = `sig-stamp-card ${state.activeSignature && state.activeSignature.id === stamp.id ? 'active' : ''}`;

            const prev = document.createElement('div');
            prev.className = 'sig-stamp-preview';
            prev.style.fontFamily = `"${stamp.fontFamily}", cursive`;
            prev.style.color = stamp.color || '#0b1220';
            prev.textContent = stamp.text;

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'sig-stamp-del';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Delete signature';

            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeSignatureStamp(stamp.id);
                renderSignatureStampsList();
            });

            card.addEventListener('click', () => {
                state.activeSignature = stamp;
                selectAnnSubTool('sign');
                if (signMenu) signMenu.classList.add('hidden');
                renderSignatureStampsList();
            });

            card.appendChild(prev);
            card.appendChild(delBtn);
            sigStampsList.appendChild(card);
        });
    }

    renderSignatureStampsList();

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#sign-dropdown-wrapper')) {
            if (signMenu) signMenu.classList.add('hidden');
        }
        if (!e.target.closest('#date-dropdown-wrapper')) {
            if (dateMenu) dateMenu.classList.add('hidden');
        }
    });

    function updateLivePreview() {
        if (!sigLivePreviewText) return;
        const text = sigNameInput ? (sigNameInput.value.trim() || 'Signature') : 'Varak';
        sigLivePreviewText.textContent = text;
        sigLivePreviewText.style.fontFamily = `"${currentSigFont}", cursive`;
        sigLivePreviewText.style.color = currentSigColor;

        sigFontOptions.forEach(opt => {
            const fontName = opt.getAttribute('data-font');
            const prevEl = opt.querySelector('.sig-font-preview');
            if (prevEl) {
                prevEl.textContent = text;
            }
        });
    }

    if (sigNameInput) {
        sigNameInput.addEventListener('input', updateLivePreview);
    }

    if (sigFontOptions.length) {
        sigFontOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                sigFontOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                currentSigFont = opt.getAttribute('data-font');
                updateLivePreview();
            });
        });
    }

    if (sigColorDots.length) {
        sigColorDots.forEach(dot => {
            dot.addEventListener('click', () => {
                sigColorDots.forEach(d => d.classList.remove('active'));
                dot.classList.add('active');
                currentSigColor = dot.getAttribute('data-color');
                updateLivePreview();
            });
        });
    }

    if (createSigBtn && sigModal) {
        createSigBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (signMenu) signMenu.classList.add('hidden');
            sigModal.classList.remove('hidden');
            updateLivePreview();
        });
    }

    function closeSigModal() {
        if (sigModal) sigModal.classList.add('hidden');
    }

    if (closeSigModalBtn) closeSigModalBtn.addEventListener('click', closeSigModal);
    if (cancelSigModalBtn) cancelSigModalBtn.addEventListener('click', closeSigModal);

    if (saveSigModalBtn) {
        saveSigModalBtn.addEventListener('click', async () => {
            const text = sigNameInput ? sigNameInput.value.trim() : '';
            if (!text) {
                alert('Please type your name or initials for your signature.');
                return;
            }
            const stamp = await saveSignatureStamp(text, currentSigFont, currentSigColor);
            state.activeSignature = stamp;
            closeSigModal();
            selectAnnSubTool('sign');
            renderSignatureStampsList();
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
    const customSwatch = document.getElementById('custom-color-swatch');
    const colorDots = document.querySelectorAll('.color-palette .color-dot');
    const sizeMinus = document.getElementById('ann-size-minus');
    const sizePlus = document.getElementById('ann-size-plus');

    if (colorDots.length) {
        colorDots.forEach(dot => {
            dot.addEventListener('click', () => {
                colorDots.forEach(d => d.classList.remove('active'));
                dot.classList.add('active');
                const hex = dot.getAttribute('data-color');
                state.annColor = hex;
                if (colorInput) colorInput.value = hex;
                if (customSwatch) customSwatch.style.backgroundColor = hex;
            });
        });
    }

    if (colorInput) {
        colorInput.addEventListener('input', (e) => {
            const hex = e.target.value;
            state.annColor = hex;
            if (customSwatch) customSwatch.style.backgroundColor = hex;
            colorDots.forEach(d => {
                d.classList.toggle('active', d.getAttribute('data-color').toLowerCase() === hex.toLowerCase());
            });
        });
    }

    if (sizeInput) {
        sizeInput.addEventListener('input', (e) => { state.annSize = parseInt(e.target.value, 10) || 16; });
        sizeInput.addEventListener('change', (e) => { state.annSize = parseInt(e.target.value, 10) || 16; });
    }

    if (sizeMinus && sizeInput) {
        sizeMinus.addEventListener('click', () => {
            let val = Math.max(8, (parseInt(sizeInput.value, 10) || 16) - 2);
            sizeInput.value = val;
            state.annSize = val;
            sizeInput.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    if (sizePlus && sizeInput) {
        sizePlus.addEventListener('click', () => {
            let val = Math.min(72, (parseInt(sizeInput.value, 10) || 16) + 2);
            sizeInput.value = val;
            state.annSize = val;
            sizeInput.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

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
                layers: p.layers,
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
