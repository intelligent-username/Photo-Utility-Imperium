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
            wrappers.forEach(w => {
                const wImg = w.querySelector('img');
                const wLens = w.querySelector('.magnifier-lens');
                if (wImg && wLens) {
                    wLens.style.backgroundImage = `url('${wImg.src}')`;
                    wLens.style.backgroundSize = `${wImg.offsetWidth * zoomLevel}px ${wImg.offsetHeight * zoomLevel}px`;
                }
                w.classList.add('magnify-active');
            });
        });

        wrapper.addEventListener('mouseleave', () => {
            wrappers.forEach(w => w.classList.remove('magnify-active'));
        });

        wrapper.addEventListener('mousemove', (e) => {
            const hoveredImg = wrapper.querySelector('img');
            if (!hoveredImg) return;
            const imgRect = hoveredImg.getBoundingClientRect();
            if (imgRect.width === 0 || imgRect.height === 0) return;

            const x = Math.max(0, Math.min(imgRect.width, e.clientX - imgRect.left));
            const y = Math.max(0, Math.min(imgRect.height, e.clientY - imgRect.top));

            const normX = x / imgRect.width;
            const normY = y / imgRect.height;

            wrappers.forEach(w => {
                const wImg = w.querySelector('img');
                const wLens = w.querySelector('.magnifier-lens');
                if (!wImg || !wLens) return;

                const wRect = w.getBoundingClientRect();
                const wImgRect = wImg.getBoundingClientRect();

                const posX = (wImgRect.left - wRect.left) + (normX * wImgRect.width);
                const posY = (wImgRect.top - wRect.top) + (normY * wImgRect.height);

                wLens.style.left = `${posX}px`;
                wLens.style.top = `${posY}px`;

                const bgX = (normX * wImg.offsetWidth * zoomLevel) - (lensSize / 2);
                const bgY = (normY * wImg.offsetHeight * zoomLevel) - (lensSize / 2);
                wLens.style.backgroundPosition = `-${bgX}px -${bgY}px`;
            });
        });
    });
}
