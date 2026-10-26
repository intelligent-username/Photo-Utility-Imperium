// ===========================================
//  pdfRemovePages.js — Multi-range page deletion dialog & engine
// ===========================================

import { getState, updateStatusBar } from './pdfState.js';
import { snapshotPagesOrder } from './pdfHistory.js';
import { syncGrid } from './pdfCardBuilder.js';
import { deselectAllLayers } from './pdfLayerSelection.js';
import { parsePageRanges, formatPageRanges } from './pdfPageRangeParser.js';

export {
    parsePageRanges,
    formatPageRanges
};

/**
 * Removes pages from state.pages at the given 0-indexed positions,
 * snapshots history for undo/redo, updates selection, and re-renders the grid.
 */
export function removePagesByIndices(indicesToRemove) {
    const state = getState();
    if (!state.pages || state.pages.length === 0) return false;

    const removeSet = new Set(indicesToRemove);
    if (removeSet.size >= state.pages.length) {
        alert('Cannot remove all pages from the document.');
        return false;
    }

    // Snapshot full state.pages list for seamless Ctrl+Z / Ctrl+Y
    snapshotPagesOrder();
    deselectAllLayers();

    // Check if overlaySource is one of the removed pages
    if (state.overlaySource && removeSet.has(state.pages.indexOf(state.overlaySource))) {
        state.overlaySource = null;
    }

    const removedPages = state.pages.filter((_, idx) => removeSet.has(idx));
    state.pages = state.pages.filter((_, idx) => !removeSet.has(idx));

    // Rebuild grid with updated card indices
    syncGrid();

    const removedCount = removedPages.length;
    const remainingCount = state.pages.length;
    updateStatusBar(`Removed ${removedCount} page${removedCount === 1 ? '' : 's'}. ${remainingCount} page${remainingCount === 1 ? '' : 's'} remaining.`);

    return true;
}

/**
 * Opens and manages the Remove Pages modal dialog.
 */
export function openRemovePagesModal() {
    const state = getState();
    const totalPages = (state.pages || []).length;

    if (totalPages === 0) {
        alert('Please upload or open PDF files first.');
        return;
    }

    const modal = document.getElementById('pdf-remove-pages-modal');
    if (!modal) return;

    const input = document.getElementById('remove-pages-input');
    const feedback = document.getElementById('remove-pages-feedback');
    const totalDisplay = document.getElementById('remove-modal-total-pages');
    const confirmBtn = document.getElementById('confirm-remove-pages-btn');
    const cancelBtn = document.getElementById('cancel-remove-pages-modal-btn');
    const closeBtn = document.getElementById('close-remove-pages-modal-btn');

    if (totalDisplay) {
        totalDisplay.textContent = `${totalPages}`;
    }

    if (input) {
        input.value = '';
    }

    const updateLiveFeedback = () => {
        const val = input ? input.value : '';
        if (!val.trim()) {
            feedback.style.display = 'none';
            feedback.innerHTML = '';
            if (confirmBtn) confirmBtn.disabled = true;
            return;
        }

        feedback.style.display = 'flex';

        const parsed = parsePageRanges(val, totalPages);

        if (!parsed.valid) {
            feedback.className = 'remove-pages-feedback feedback-error';
            feedback.innerHTML = `
                <div class="feedback-icon error-icon">⚠</div>
                <div class="feedback-text">${parsed.error}</div>
            `;
            if (confirmBtn) confirmBtn.disabled = true;
        } else {
            const count = parsed.pageNumbers.length;
            const remaining = totalPages - count;
            const formatted = formatPageRanges(parsed.pageNumbers);
            const warningHtml = parsed.warning ? `<div class="feedback-sub-warn">${parsed.warning}</div>` : '';

            feedback.className = 'remove-pages-feedback feedback-valid';
            feedback.innerHTML = `
                <div class="feedback-icon valid-icon">✓</div>
                <div class="feedback-text">
                    <div>Removing <strong>${count}</strong> page${count === 1 ? '' : 's'} (<strong>${formatted}</strong>).</div>
                    <div class="feedback-sub"><strong>${remaining}</strong> page${remaining === 1 ? '' : 's'} will remain in the document.</div>
                    ${warningHtml}
                </div>
            `;
            if (confirmBtn) confirmBtn.disabled = false;
        }
    };

    const closeModal = () => {
        modal.classList.add('hidden');
        if (input) input.removeEventListener('input', updateLiveFeedback);
        document.removeEventListener('keydown', onKeyDown);
    };

    const executeRemoval = () => {
        const val = input ? input.value : '';
        const parsed = parsePageRanges(val, totalPages);
        if (!parsed.valid || parsed.pageIndices.length === 0) return;

        closeModal();
        removePagesByIndices(parsed.pageIndices);
    };

    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeModal();
        } else if (e.key === 'Enter' && e.target === input) {
            e.preventDefault();
            if (confirmBtn && !confirmBtn.disabled) {
                executeRemoval();
            }
        }
    };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };

    if (confirmBtn) {
        confirmBtn.onclick = executeRemoval;
    }

    if (input) {
        input.addEventListener('input', updateLiveFeedback);
    }
    document.addEventListener('keydown', onKeyDown);

    updateLiveFeedback();
    modal.classList.remove('hidden');

    setTimeout(() => {
        if (input) {
            input.focus();
            input.select();
        }
    }, 50);
}
