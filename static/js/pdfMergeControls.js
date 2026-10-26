// ===========================================
//  pdfMergeControls.js — Toolbar controls orchestrator facade
// ===========================================

import { setupFieldFormActions } from './controls/pdfFieldFormActions.js';
import { setupToolbarModes } from './controls/pdfToolbarModes.js';
import { setupDateDropdown } from './controls/pdfDateDropdown.js';
import { setupSignatureModal } from './controls/pdfSignatureModal.js';
import { setupColorSizeControls } from './controls/pdfColorSizeControls.js';
import { setupRichTooltips } from './controls/pdfRichTooltips.js';
import { setupKeyboardShortcuts } from './controls/pdfKeyboardShortcuts.js';

export function setupToolbarControls() {
    let dateDropdownControls = null;

    const { selectFFSubTool } = setupFieldFormActions();

    const { clearModes, selectAnnSubTool, toggleMode } = setupToolbarModes({
        selectFFSubTool,
        getDateDropdownControls: () => dateDropdownControls
    });

    dateDropdownControls = setupDateDropdown(selectAnnSubTool);
    setupSignatureModal(selectAnnSubTool);
    setupColorSizeControls();
    setupRichTooltips();

    setupKeyboardShortcuts({
        toggleMode,
        selectAnnSubTool,
        clearModes,
        getDateDropdownControls: () => dateDropdownControls
    });

    return { clearModes };
}
