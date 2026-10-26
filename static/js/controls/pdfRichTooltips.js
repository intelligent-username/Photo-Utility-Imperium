// ===========================================
//  pdfRichTooltips.js — Tooltip UI & positioning
// ===========================================

export function setupRichTooltips() {
    let tooltipEl = document.querySelector('.pdf-rich-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'pdf-rich-tooltip';
        document.body.appendChild(tooltipEl);
    }

    const elementsWithTooltip = document.querySelectorAll('[data-tooltip]');
    elementsWithTooltip.forEach(el => {
        const raw = el.getAttribute('data-tooltip');
        if (!raw) return;

        el.addEventListener('mouseenter', () => {
            const lines = raw.split('\n');
            let keysHtml = '';
            let labelText = '';

            if (lines.length > 1) {
                const keyTokens = lines[0].match(/`([^`]+)`/g) || [];
                keysHtml = keyTokens.map(t => `<kbd>${t.replace(/`/g, '')}</kbd>`).join('');
                labelText = lines.slice(1).join(' ').trim();
            } else {
                const keyTokens = lines[0].match(/`([^`]+)`/g) || [];
                if (keyTokens.length > 0) {
                    keysHtml = keyTokens.map(t => `<kbd>${t.replace(/`/g, '')}</kbd>`).join('');
                    labelText = lines[0].replace(/`([^`]+)`/g, '').trim();
                } else {
                    labelText = lines[0].trim();
                }
            }

            let contentHtml = '';
            if (keysHtml) {
                contentHtml += `<div class="pdf-rich-tooltip-keys">${keysHtml}</div>`;
            }
            if (labelText) {
                contentHtml += `<div class="pdf-rich-tooltip-label">${labelText}</div>`;
            }

            tooltipEl.innerHTML = contentHtml;
            tooltipEl.classList.add('visible');

            const rect = el.getBoundingClientRect();
            const tipRect = tooltipEl.getBoundingClientRect();
            let top = rect.bottom + 6;
            let left = rect.left + (rect.width - tipRect.width) / 2;

            if (top + tipRect.height > window.innerHeight) {
                top = rect.top - tipRect.height - 6;
            }
            if (left < 6) left = 6;
            if (left + tipRect.width > window.innerWidth - 6) {
                left = window.innerWidth - tipRect.width - 6;
            }

            tooltipEl.style.top = `${top}px`;
            tooltipEl.style.left = `${left}px`;
        });

        el.addEventListener('mouseleave', () => {
            tooltipEl.classList.remove('visible');
        });

        el.addEventListener('click', () => {
            tooltipEl.classList.remove('visible');
        });
    });
}
