/**
 * Before/After Image Comparison Slider
 * Pure vanilla JS — no dependencies
 */

export function initComparisonSlider(wrapperEl) {
    if (!wrapperEl) return;
    wrapperEl._sliderDestroy?.();

    const clipper = wrapperEl.querySelector('.img-comp-clipper');
    const handle = wrapperEl.querySelector('.img-comp-handle');
    const img = clipper?.querySelector('img');
    if (!clipper || !handle) return;

    let isDragging = false, rect = null, raf = null;

    const syncWidth = () => { if (img) img.style.width = `${wrapperEl.clientWidth}px`; };
    const setPos = (clientX) => {
        if (!rect) rect = wrapperEl.getBoundingClientRect();
        const pct = Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100));
        clipper.style.width = `${pct}%`;
        handle.style.left = `${pct}%`;
        handle.setAttribute('aria-valuenow', Math.round(pct));
    };

    const onDown = (e) => { e.preventDefault(); isDragging = true; handle.classList.add('dragging'); handle.setPointerCapture(e.pointerId); rect = wrapperEl.getBoundingClientRect(); setPos(e.clientX); };
    const onMove = (e) => { if (!isDragging) return; if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setPos(e.clientX)); };
    const onUp = (e) => { if (!isDragging) return; isDragging = false; handle.classList.remove('dragging'); handle.releasePointerCapture(e.pointerId); };
    const onKey = (e) => {
        let p = parseFloat(handle.getAttribute('aria-valuenow')) || 50;
        const step = e.shiftKey ? 10 : 2;
        if (['ArrowLeft', 'ArrowDown'].includes(e.key)) p -= step;
        else if (['ArrowRight', 'ArrowUp'].includes(e.key)) p += step;
        else return;
        e.preventDefault();
        setPos(rect.left + (Math.max(5, Math.min(95, p)) / 100) * rect.width);
    };

    handle.setAttribute('tabindex', '0');
    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-label', 'Comparison slider');
    handle.setAttribute('aria-valuenow', '50');

    syncWidth();
    rect = wrapperEl.getBoundingClientRect();

    handle.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp, { passive: true });
    handle.addEventListener('keydown', onKey);
    wrapperEl.addEventListener('click', (e) => !handle.contains(e.target) && setPos(e.clientX));
    window.addEventListener('resize', () => { syncWidth(); rect = wrapperEl.getBoundingClientRect(); }, { passive: true });

    wrapperEl._sliderDestroy = () => {
        handle.removeEventListener('pointerdown', onDown);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        handle.removeEventListener('keydown', onKey);
        if (raf) cancelAnimationFrame(raf);
    };
    return wrapperEl._sliderDestroy;
}
