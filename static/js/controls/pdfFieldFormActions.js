// ===========================================
//  pdfFieldFormActions.js — Field-form toolbar actions & bulk operations
// ===========================================

import {
    getState,
    setAppMode,
    updateStatusBar
} from '../pdfCanvas.js';
import { showFieldDeleteDialog } from '../pdfCanvas/pdfFormFieldDialogs.js';

export function setupFieldFormActions() {
    const state = getState();
    const ffSubBtns = {
        edit: document.getElementById('ff-tool-edit'),
        create: document.getElementById('ff-tool-create'),
        delete: document.getElementById('ff-tool-delete'),
        deleteAll: document.getElementById('ff-tool-delete-all'),
    };

    function selectFFSubTool(sub) {
        Object.values(ffSubBtns).forEach(b => b && b.classList.remove('active'));
        if (ffSubBtns[sub]) ffSubBtns[sub].classList.add('active');

        const modeMap = {
            edit: 'field-form-edit',
            create: 'field-form-create',
            delete: 'field-form-delete',
            deleteAll: 'field-form-edit',
        };
        setAppMode(modeMap[sub] || 'field-form-edit');
        state._ffSubTool = sub;
        if (sub === 'edit') {
            updateStatusBar('Field Form: Click any field to fill or edit text');
        } else if (sub === 'create') {
            updateStatusBar('Create Field Form: Drag a rectangle on any page to create a field');
        } else if (sub === 'delete') {
            updateStatusBar('Delete Field Form: Click any field to delete it');
        }
    }

    function handleDeleteAllFields() {
        const pages = state.pages;
        const hasAnyField = pages.some(p => p.formFields && p.formFields.length > 0);
        if (!hasAnyField) {
            updateStatusBar('No form fields to delete');
            return;
        }
        const hasAnyText = pages.some(p => p.formFields && p.formFields.some(f => {
            const ann = p.layers.find(l => l.type === 'annotation' && l.fieldId === f.id);
            return (ann && ann.text && ann.text.trim().length > 0) || (f.fieldValue && String(f.fieldValue).trim().length > 0);
        }));

        if (!hasAnyText) {
            import('../pdfCanvas/pdfHistory.js').then(({ snapshotAllFormFields }) => {
                snapshotAllFormFields();
                pages.forEach(p => {
                    if (!p.formFields || p.formFields.length === 0) return;
                    p.layers = p.layers.filter(l => !(l.type === 'annotation' && l.isFormField));
                    p.formFields = [];
                    import('../pdfCanvas/pdfRender.js').then(({ renderCardCanvas }) => renderCardCanvas(p)).catch(() => {});
                });
                updateStatusBar('All form fields deleted');
            }).catch(() => {});
            return;
        }

        showFieldDeleteDialog((spareText) => {
            import('../pdfCanvas/pdfHistory.js').then(({ snapshotAllFormFields }) => {
                snapshotAllFormFields();
                pages.forEach(p => {
                    if (!p.formFields || p.formFields.length === 0) return;
                    if (!spareText) {
                        p.layers = p.layers.filter(l => !(l.type === 'annotation' && l.isFormField));
                    } else {
                        p.layers.forEach(l => { if (l.type === 'annotation' && l.isFormField) delete l.isFormField; });
                    }
                    p.formFields = [];
                    import('../pdfCanvas/pdfRender.js').then(({ renderCardCanvas }) => renderCardCanvas(p)).catch(() => {});
                });
                updateStatusBar('All form fields deleted');
            }).catch(() => {});
        });
    }

    if (ffSubBtns.edit)      ffSubBtns.edit.addEventListener('click', () => selectFFSubTool('edit'));
    if (ffSubBtns.create)    ffSubBtns.create.addEventListener('click', () => selectFFSubTool('create'));
    if (ffSubBtns.delete)    ffSubBtns.delete.addEventListener('click', () => selectFFSubTool('delete'));
    if (ffSubBtns.deleteAll) ffSubBtns.deleteAll.addEventListener('click', () => {
        selectFFSubTool('deleteAll');
        handleDeleteAllFields();
    });

    return { selectFFSubTool, handleDeleteAllFields };
}
