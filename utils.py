"""Compatibility facade - re-exports from photo_utility package.

This module is kept for backward compatibility; new code should
import directly from the photo_utility package.
"""

from photo_utility import (
    A4,
    LETTER,
    add_blank_pages,
    apply_crop_box,
    apply_line_layer,
    apply_signature_layer,
    apply_text_annotations,
    apply_text_edits,
    apply_whiteouts,
    create_blank_page,
    create_standard_blank_pdf,
    cv2_to_pil,
    ensure_unencrypted_pdf_bytes,
    merge_pdfs,
    pil_to_cv2,
    process_pdf_edit_logic,
    standardize_single_pdf_page,
)

__all__ = [
    "A4",
    "LETTER",
    "add_blank_pages",
    "apply_crop_box",
    "apply_line_layer",
    "apply_signature_layer",
    "apply_text_annotations",
    "apply_text_edits",
    "apply_whiteouts",
    "create_blank_page",
    "create_standard_blank_pdf",
    "cv2_to_pil",
    "ensure_unencrypted_pdf_bytes",
    "merge_pdfs",
    "pil_to_cv2",
    "process_pdf_edit_logic",
    "standardize_single_pdf_page",
]