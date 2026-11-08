// ===========================================
//  pdfMergeStandardize.js — Standardize-size modal controls
// ===========================================

import { snapshotStandardize } from './pdfCanvas/pdfHistory.js';

export function setupStandardizeControls(state) {
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
