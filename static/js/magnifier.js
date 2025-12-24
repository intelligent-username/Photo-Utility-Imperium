export function initMagnifierFeature() {
    const wrappers = document.querySelectorAll('.magnify-wrapper[data-pair="compare"]');
    if (wrappers.length < 2) return;

    const zoomLevel = 2.5;
    const lensSize = 120; // Must match CSS .magnifier-lens width/height

    wrappers.forEach((wrapper) => {
        const img = wrapper.querySelector('img');
        const lens = wrapper.querySelector('.magnifier-lens');
        if (!img || !lens) return;

        const updateLensBackground = () => {
            lens.style.backgroundImage = `url('${img.src}')`;
            lens.style.backgroundSize = `${img.offsetWidth * zoomLevel}px ${img.offsetHeight * zoomLevel}px`;
        };

        img.addEventListener('load', updateLensBackground);
        if (img.complete) updateLensBackground();

        wrapper.addEventListener('mouseenter', () => {
            wrappers.forEach(w => w.classList.add('magnify-active'));
        });

        wrapper.addEventListener('mouseleave', () => {
            wrappers.forEach(w => w.classList.remove('magnify-active'));
        });

        wrapper.addEventListener('mousemove', (e) => {
            const rect = wrapper.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const normX = x / rect.width;
            const normY = y / rect.height;

            wrappers.forEach(w => {
                const wImg = w.querySelector('img');
                const wLens = w.querySelector('.magnifier-lens');
                if (!wImg || !wLens) return;

                const wRect = w.getBoundingClientRect();
                const posX = normX * wRect.width;
                const posY = normY * wRect.height;

                wLens.style.left = `${posX}px`;
                wLens.style.top = `${posY}px`;

                const bgX = (normX * wImg.offsetWidth * zoomLevel) - (lensSize / 2);
                const bgY = (normY * wImg.offsetHeight * zoomLevel) - (lensSize / 2);
                wLens.style.backgroundPosition = `-${bgX}px -${bgY}px`;
            });
        });
    });
}
