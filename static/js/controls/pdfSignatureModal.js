// ===========================================
//  pdfSignatureModal.js — Signature stamps & creation modal
// ===========================================

import {
    getState,
    loadSavedSignatures,
    removeSignatureStamp,
    saveSignatureStamp,
    generateSignatureDataUrl
} from '../pdfCanvas.js';

export function setupSignatureModal(selectAnnSubTool) {
    const state = getState();
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

        const total = state.signatures.length;
        state.signatures.forEach((stamp, idx) => {
            const card = document.createElement('div');
            const isHalf = (total > 3 && idx >= 2);
            card.className = `sig-stamp-card ${state.activeSignature && state.activeSignature.id === stamp.id ? 'active' : ''} ${isHalf ? 'col-half' : 'col-full'}`;
            card.draggable = true;
            card.dataset.id = stamp.id;

            const contentWrap = document.createElement('div');
            contentWrap.className = 'sig-stamp-content';

            const handle = document.createElement('span');
            handle.className = 'sig-stamp-handle';
            handle.innerHTML = '&#8942;&#8942;';
            handle.title = 'Drag to reorder';

            const prev = document.createElement('div');
            prev.className = 'sig-stamp-preview';
            prev.style.fontFamily = `"${stamp.fontFamily}", cursive`;
            prev.style.color = stamp.color || '#0b1220';
            prev.textContent = stamp.text;

            contentWrap.appendChild(handle);
            contentWrap.appendChild(prev);

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

            let isDraggingCard = false;

            card.addEventListener('dragstart', (e) => {
                if (e.target.closest('.sig-stamp-del')) {
                    e.preventDefault();
                    return;
                }
                isDraggingCard = true;
                e.dataTransfer.setData('text/plain', stamp.id);
                e.dataTransfer.effectAllowed = 'move';
                card.classList.add('dragging');
            });

            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                if (sigStampsList) {
                    sigStampsList.querySelectorAll('.sig-stamp-card.drag-over').forEach(c => c.classList.remove('drag-over'));
                }
                setTimeout(() => { isDraggingCard = false; }, 50);
            });

            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                card.classList.add('drag-over');
            });

            card.addEventListener('dragleave', () => {
                card.classList.remove('drag-over');
            });

            card.addEventListener('drop', (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                const fromId = e.dataTransfer.getData('text/plain');
                if (!fromId || fromId === stamp.id) return;
                const fromIdx = state.signatures.findIndex(s => s.id === fromId);
                const toIdx = state.signatures.findIndex(s => s.id === stamp.id);
                if (fromIdx >= 0 && toIdx >= 0) {
                    const [moved] = state.signatures.splice(fromIdx, 1);
                    state.signatures.splice(toIdx, 0, moved);
                    try {
                        localStorage.setItem('pdf_saved_signatures', JSON.stringify(state.signatures));
                    } catch (err) {}
                    renderSignatureStampsList();
                }
            });

            card.addEventListener('click', (e) => {
                if (isDraggingCard) return;
                state.activeSignature = stamp;
                renderSignatureStampsList();
                if (signMenu) signMenu.classList.add('hidden');
                if (selectAnnSubTool) selectAnnSubTool('sign', { openMenu: false });
            });

            card.appendChild(contentWrap);
            card.appendChild(delBtn);
            sigStampsList.appendChild(card);
        });
    }

    renderSignatureStampsList();

    if (createSigBtn && sigModal) {
        createSigBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (signMenu) signMenu.classList.add('hidden');
            sigModal.classList.remove('hidden');
            if (sigNameInput) {
                sigNameInput.value = '';
                sigNameInput.focus();
            }
            if (sigLivePreviewText) {
                sigLivePreviewText.textContent = 'Your Name';
                sigLivePreviewText.style.fontFamily = `"${currentSigFont}", cursive`;
                sigLivePreviewText.style.color = currentSigColor;
            }
        });
    }

    const closeSigModal = () => {
        if (sigModal) sigModal.classList.add('hidden');
    };

    if (closeSigModalBtn) closeSigModalBtn.addEventListener('click', closeSigModal);
    if (cancelSigModalBtn) cancelSigModalBtn.addEventListener('click', closeSigModal);

    if (sigNameInput && sigLivePreviewText) {
        sigNameInput.addEventListener('input', (e) => {
            sigLivePreviewText.textContent = e.target.value.trim() || 'Your Name';
        });
    }

    if (sigFontOptions.length) {
        sigFontOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                sigFontOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                currentSigFont = opt.getAttribute('data-font');
                if (sigLivePreviewText) {
                    sigLivePreviewText.style.fontFamily = `"${currentSigFont}", cursive`;
                }
            });
        });
    }

    if (sigColorDots.length) {
        sigColorDots.forEach(dot => {
            dot.addEventListener('click', () => {
                sigColorDots.forEach(d => d.classList.remove('active'));
                dot.classList.add('active');
                currentSigColor = dot.getAttribute('data-color');
                if (sigLivePreviewText) {
                    sigLivePreviewText.style.color = currentSigColor;
                }
            });
        });
    }

    if (saveSigModalBtn) {
        saveSigModalBtn.addEventListener('click', async () => {
            const text = sigNameInput ? sigNameInput.value.trim() : '';
            if (!text) {
                if (sigNameInput) sigNameInput.focus();
                return;
            }

            const dataUrl = await generateSignatureDataUrl(text, currentSigFont, currentSigColor);
            const newStamp = {
                id: 'sig_' + Date.now(),
                text: text,
                fontFamily: currentSigFont,
                color: currentSigColor,
                dataUrl: dataUrl
            };

            saveSignatureStamp(newStamp);
            state.activeSignature = newStamp;
            closeSigModal();
            renderSignatureStampsList();
            if (selectAnnSubTool) selectAnnSubTool('sign', { openMenu: false });
        });
    }

    return { renderSignatureStampsList };
}
