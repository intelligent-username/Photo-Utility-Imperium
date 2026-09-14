export function initMagnifierFeature() {
    const wrappers = document.querySelectorAll('.magnify-wrapper[data-pair="compare"]');
    if (wrappers.length < 2 || wrappers[0]._magInit) return;
    wrappers[0]._magInit = true;

    const zoom = 2.5, lensHalf = 60;
    let raf = null, rects = [];

    const syncMetrics = () => {
        rects = Array.from(wrappers, w => {
            const img = w.querySelector('img'), lens = w.querySelector('.magnifier-lens');
            if (!img || !lens) return null;
            if (img.src) {
                lens.style.backgroundImage = `url('${img.src}')`;
                lens.style.backgroundSize = `${img.offsetWidth * zoom}px ${img.offsetHeight * zoom}px`;
            }
            return { w, img, lens, r: w.getBoundingClientRect(), ir: img.getBoundingClientRect() };
        }).filter(Boolean);
    };

    wrappers.forEach(w => {
        w.addEventListener('mouseenter', () => { syncMetrics(); wrappers.forEach(el => el.classList.add('magnify-active')); });
        w.addEventListener('mouseleave', () => { if (raf) cancelAnimationFrame(raf); wrappers.forEach(el => el.classList.remove('magnify-active')); });
        w.addEventListener('mousemove', e => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const cur = rects.find(m => m.w === w);
                if (!cur || !cur.ir.width) return;
                const nx = Math.max(0, Math.min(1, (e.clientX - cur.ir.left) / cur.ir.width));
                const ny = Math.max(0, Math.min(1, (e.clientY - cur.ir.top) / cur.ir.height));
                rects.forEach(m => {
                    m.lens.style.left = `${(m.ir.left - m.r.left) + nx * m.ir.width}px`;
                    m.lens.style.top = `${(m.ir.top - m.r.top) + ny * m.ir.height}px`;
                    m.lens.style.backgroundPosition = `-${nx * m.img.offsetWidth * zoom - lensHalf}px -${ny * m.img.offsetHeight * zoom - lensHalf}px`;
                });
            });
        }, { passive: true });
    });
}
