// ===========================================
//  pdfFormFieldDialogs.js — Field-form confirmation modal dialogs
// ===========================================

export function showFieldDeleteDialog(onConfirm) {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000;display:flex;align-items:center;justify-content:center;';
    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#1e2130;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:24px 28px;min-width:320px;max-width:420px;color:#e8eaf0;font-family:inherit;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
    dialog.innerHTML = `
        <div style="font-size:15px;font-weight:600;margin-bottom:8px;">Spare the text?</div>
        <div style="font-size:13px;color:#9aa0b4;margin-bottom:20px;">Keep the text typed into this field as a regular annotation, or delete it along with the field?</div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button id="ffd-cancel" style="padding:7px 16px;border-radius:7px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#9aa0b4;cursor:pointer;font-size:13px;">Cancel</button>
            <button id="ffd-delete-text" style="padding:7px 16px;border-radius:7px;border:none;background:#ef4444;color:#fff;cursor:pointer;font-size:13px;">Delete text too</button>
            <button id="ffd-spare" style="padding:7px 16px;border-radius:7px;border:none;background:#3b82f6;color:#fff;cursor:pointer;font-size:13px;">Keep text</button>
        </div>`;
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    dialog.querySelector('#ffd-cancel').addEventListener('click', close);
    dialog.querySelector('#ffd-spare').addEventListener('click', () => {
        close(); confirmDeleteField(true, onConfirm);
    });
    dialog.querySelector('#ffd-delete-text').addEventListener('click', () => {
        close(); confirmDeleteField(false, onConfirm);
    });
}

export function confirmDeleteField(spareText, onConfirm) {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000;display:flex;align-items:center;justify-content:center;';
    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#1e2130;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:24px 28px;min-width:300px;max-width:400px;color:#e8eaf0;font-family:inherit;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
    dialog.innerHTML = `
        <div style="font-size:15px;font-weight:600;margin-bottom:8px;">Confirm deletion</div>
        <div style="font-size:13px;color:#9aa0b4;margin-bottom:20px;">Delete the field${spareText ? ' (text kept as annotation)' : ' and its text'}?</div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button id="ffc-cancel" style="padding:7px 16px;border-radius:7px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#9aa0b4;cursor:pointer;font-size:13px;">Cancel</button>
            <button id="ffc-confirm" style="padding:7px 16px;border-radius:7px;border:none;background:#ef4444;color:#fff;cursor:pointer;font-size:13px;">Delete</button>
        </div>`;
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    dialog.querySelector('#ffc-cancel').addEventListener('click', close);
    dialog.querySelector('#ffc-confirm').addEventListener('click', () => { close(); onConfirm(spareText); });
}
