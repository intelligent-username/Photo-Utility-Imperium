export function createProcessingController(processingOverlay) {
    const setProcessing = (isActive) => {
        if (!processingOverlay) return;
        processingOverlay.classList.toggle('active', isActive);
        processingOverlay.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    };

    const showProcessing = () => setProcessing(true);
    const hideProcessing = () => setProcessing(false);

    return { showProcessing, hideProcessing };
}
