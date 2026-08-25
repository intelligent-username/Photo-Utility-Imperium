// ===========================================
//  pdfState.js — Core state & mode control
// ===========================================

const state = {
    pages: [],       // { id, fileIdx, pageIdx, fileName, excluded, annotations[], cropBox, overlays[], _pdfPage, isBlank, aspectRatio }
    files: [],       // raw File objects
    mode: 'select',  // 'select' | 'annotate' | 'crop' | 'overlay' | 'signature' | 'date' | 'whiteout'
    annColor: '#ff0000',
    annSize: 16,
    overlaySource: null,
    viewMode: 'large',
    isLargeView: true,
    signatures: [],
    activeSignature: null,
    dateFont: 'Arial',
    dateBold: false,
    dateFormat: 'words-short',
    dateColor: '#000000',
    dateSize: 16,
    undoStack: [],   // { type, pageId?, snapshot } — max MAX_UNDO entries
};

export function getState() { return state; }

const modeOrder = ['large', 'full', 'small'];
const modeLabels = { small: 'Small View', large: 'Large View', full: 'Full View' };

export function setViewMode(viewMode, reRenderCb) {
    state.viewMode = viewMode;
    state.isLargeView = (viewMode === 'large');

    const grid = document.getElementById('pdf-page-grid');
    if (grid) {
        grid.classList.remove('small-view', 'large-view', 'full-view');
        grid.classList.add(`${viewMode}-view`);
    }

    const btn = document.getElementById('view-mode-btn');
    if (btn) {
        btn.textContent = modeLabels[viewMode] || 'View Mode';
    }

    if (typeof reRenderCb === 'function') {
        reRenderCb();
    }
}

export function cycleViewMode(reRenderCb) {
    const currIdx = modeOrder.indexOf(state.viewMode);
    const nextIdx = (currIdx + 1) % modeOrder.length;
    setViewMode(modeOrder[nextIdx], reRenderCb);
}

export function createPageObject(config) {
    const layers = config.layers || [];
    const page = {
        id: config.id || `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        fileIdx: config.fileIdx !== undefined ? config.fileIdx : -1,
        pageIdx: config.pageIdx !== undefined ? config.pageIdx : -1,
        fileName: config.fileName || 'Page',
        excluded: config.excluded || false,
        cropBox: config.cropBox || null,
        isBlank: config.isBlank || false,
        aspectRatio: config.aspectRatio,
        _pdfPage: config._pdfPage || null,
        formFields: config.formFields || [],
        layers,
    };

    Object.defineProperty(page, 'annotations', {
        get: () => page.layers.filter(l => l.type === 'annotation'),
        configurable: true,
        enumerable: true
    });
    Object.defineProperty(page, 'whiteouts', {
        get: () => page.layers.filter(l => l.type === 'whiteout'),
        configurable: true,
        enumerable: true
    });
    Object.defineProperty(page, 'overlays', {
        get: () => page.layers.filter(l => l.type === 'overlay'),
        configurable: true,
        enumerable: true
    });
    Object.defineProperty(page, 'signatures', {
        get: () => page.layers.filter(l => l.type === 'signature'),
        configurable: true,
        enumerable: true
    });

    return page;
}

export function setAppMode(modeName) {
    state.mode = modeName;
    state.overlaySource = null;

    const grid = document.getElementById('pdf-page-grid');
    if (grid) {
        grid.classList.remove('grid-mode-crop', 'grid-mode-overlay', 'grid-mode-annotate', 'grid-mode-whiteout', 'grid-mode-signature', 'grid-mode-date');
        if (modeName !== 'select') {
            grid.classList.add(`grid-mode-${modeName}`);
        }
    }

    document.querySelectorAll('.pdf-page-card').forEach(card => {
        card.draggable = (modeName === 'select');
    });

    document.querySelectorAll('.overlay-source').forEach(el => el.classList.remove('overlay-source'));
}

export function resetState() {
    state.pages = [];
    state.files = [];
    state.mode = 'select';
    state.overlaySource = null;
    state.activeSignature = null;
    state.undoStack = [];
    const grid = document.getElementById('pdf-page-grid');
    if (grid) grid.innerHTML = '';
    updateStatusBar('');
}

export function updateStatusBar(msg) {
    const el = document.getElementById('pdf-status-bar');
    if (el) el.textContent = msg;
}

export function updateModeBanner(msg, type = 'crop') {
    updateStatusBar(msg);
}
