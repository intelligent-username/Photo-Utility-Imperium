// ===========================================
//  pdfToolbarOverflow.js — Scrollable sub-toolbars & floating dropdown anchoring
// ===========================================
//
// The annotation / field-form sub-bars are width-constrained and scroll
// horizontally when their controls do not fit. A scroll container clips
// absolutely positioned descendants, so the Sign and Date menus are switched to
// viewport-fixed coordinates while they are open and put back on close.

const MENU_SELECTOR = '.pdf-dropdown-menu';
const MENU_GAP = 6;   // px between the trigger button and the menu
const EDGE_PAD = 8;   // px kept free on every viewport edge

function isMenuOpen(menu) {
    return !menu.classList.contains('hidden');
}

function hideMenuPosition(menu) {
    menu.classList.remove('is-floating');
    menu.style.removeProperty('--dd-top');
    menu.style.removeProperty('--dd-left');
}

function positionMenu(menu) {
    const anchor = menu.parentElement;
    if (!anchor) return;

    const a = anchor.getBoundingClientRect();
    // Measure at the natural size first; clamping must not stretch the menu.
    const width = menu.offsetWidth || 320;
    const height = menu.offsetHeight || 0;

    const maxLeft = window.innerWidth - width - EDGE_PAD;
    const maxTop = window.innerHeight - height - EDGE_PAD;

    const left = Math.max(EDGE_PAD, Math.min(a.left, maxLeft));
    const top = Math.max(EDGE_PAD, Math.min(a.bottom + MENU_GAP, maxTop));

    menu.style.setProperty('--dd-left', `${Math.round(left)}px`);
    menu.style.setProperty('--dd-top', `${Math.round(top)}px`);
    menu.classList.add('is-floating');
}

function syncMenu(menu) {
    if (isMenuOpen(menu)) {
        positionMenu(menu);
    } else {
        hideMenuPosition(menu);
    }
}

export function setupToolbarOverflow() {
    const menus = Array.from(document.querySelectorAll(MENU_SELECTOR));
    if (menus.length === 0) return;

    // The open/closed state is expressed only as a `hidden` class toggle, and
    // several modules toggle it, so react to the attribute instead of hooking
    // every call site.
    const classObserver = new MutationObserver((records) => {
        records.forEach((record) => {
            const wasHidden = (record.oldValue || '').split(/\s+/).includes('hidden');
            if (wasHidden !== record.target.classList.contains('hidden')) {
                syncMenu(record.target);
            }
        });
    });

    // Menu content is rendered on open (date formats, signature stamps), which
    // changes its height after the first position. Re-anchor when that happens.
    const sizeObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
            const menu = entry.target;
            if (isMenuOpen(menu)) positionMenu(menu);
        });
    });

    menus.forEach((menu) => {
        classObserver.observe(menu, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
        sizeObserver.observe(menu);
        syncMenu(menu);
    });

    // Keep the open menu glued to its trigger when the bar scrolls or the
    // window is resized/page is scrolled.
    let frame = null;
    const repositionAll = () => {
        frame = null;
        menus.forEach((menu) => {
            if (isMenuOpen(menu)) positionMenu(menu);
        });
    };
    const scheduleReposition = () => {
        if (frame === null) frame = requestAnimationFrame(repositionAll);
    };

    window.addEventListener('resize', scheduleReposition);
    window.addEventListener('scroll', scheduleReposition, true);
}
