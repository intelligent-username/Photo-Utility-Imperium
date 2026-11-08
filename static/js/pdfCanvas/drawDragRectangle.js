export function drawDragRectangle(e, wrap, className, onComplete) {
    const rect = wrap.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    const box = document.createElement('div');
    box.className = className;
    box.style.left = `${startX}px`;
    box.style.top = `${startY}px`;
    box.style.width = '0px';
    box.style.height = '0px';
    wrap.appendChild(box);

    const onMove = (moveEv) => {
        const curX = Math.max(0, Math.min(rect.width, moveEv.clientX - rect.left));
        const curY = Math.max(0, Math.min(rect.height, moveEv.clientY - rect.top));
        const left = Math.min(startX, curX);
        const top = Math.min(startY, curY);
        const width = Math.abs(curX - startX);
        const height = Math.abs(curY - startY);

        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const finalWidth = parseFloat(box.style.width);
        const finalHeight = parseFloat(box.style.height);
        onComplete(box, rect, finalWidth, finalHeight);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}
