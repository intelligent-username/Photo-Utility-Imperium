/**
 * Before/After Image Comparison Slider
 * Pure vanilla JS — no dependencies
 */

export function initComparisonSlider(wrapperEl) {
    if (!wrapperEl) return;

    const clipper = wrapperEl.querySelector('.img-comp-clipper');
    const handle = wrapperEl.querySelector('.img-comp-handle');
    if (!clipper || !handle) return;

    let isDragging = false;
    let rectCache = null;

    function cacheRect() {
        rectCache = wrapperEl.getBoundingClientRect();
    }

    function syncClipperImgWidth() {
        const img = clipper.querySelector('img');
        if (img) img.style.width = wrapperEl.clientWidth + 'px';
    }

    function setPosition(clientX) {
        if (!rectCache) cacheRect();
        let pct = ((clientX - rectCache.left) / rectCache.width) * 100;
        pct = Math.max(5, Math.min(95, pct));
        clipper.style.width = pct + '%';
        handle.style.left = pct + '%';
        handle.setAttribute('aria-valuenow', Math.round(pct));
    }

    function onPointerDown(e) {
        e.preventDefault();
        isDragging = true;
        handle.classList.add('dragging');
        handle.setPointerCapture(e.pointerId);
        cacheRect();
        setPosition(e.clientX);
    }

    function onPointerMove(e) {
        if (!isDragging) return;
        setPosition(e.clientX);
    }

    function onPointerUp(e) {
        if (!isDragging) return;
        isDragging = false;
        handle.classList.remove('dragging');
        handle.releasePointerCapture(e.pointerId);
    }

    function onKeyDown(e) {
        let pct = parseFloat(handle.getAttribute('aria-valuenow')) || 50;
        const step = e.shiftKey ? 10 : 2;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            pct = Math.max(5, pct - step);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            pct = Math.min(95, pct + step);
        } else {
            return;
        }
        clipper.style.width = pct + '%';
        handle.style.left = pct + '%';
        handle.setAttribute('aria-valuenow', Math.round(pct));
    }

    function onWrapperClick(e) {
        if (e.target === handle || handle.contains(e.target)) return;
        cacheRect();
        setPosition(e.clientX);
    }

    function onResize() {
        syncClipperImgWidth();
        cacheRect();
    }

    // Initialize
    handle.setAttribute('tabindex', '0');
    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-label', 'Comparison slider: drag to compare original and compressed image');
    handle.setAttribute('aria-valuemin', '5');
    handle.setAttribute('aria-valuemax', '95');
    handle.setAttribute('aria-valuenow', '50');

    syncClipperImgWidth();
    cacheRect();

    handle.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('keydown', onKeyDown);
    wrapperEl.addEventListener('click', onWrapperClick);
    window.addEventListener('resize', onResize);

    return function destroy() {
        handle.removeEventListener('pointerdown', onPointerDown);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        handle.removeEventListener('keydown', onKeyDown);
        wrapperEl.removeEventListener('click', onWrapperClick);
        window.removeEventListener('resize', onResize);
        handle.removeAttribute('tabindex');
        handle.removeAttribute('role');
        handle.removeAttribute('aria-label');
        handle.removeAttribute('aria-valuemin');
        handle.removeAttribute('aria-valuemax');
        handle.removeAttribute('aria-valuenow');
    };
}
