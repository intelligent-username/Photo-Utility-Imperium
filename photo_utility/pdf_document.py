"""PDF merging and ordered page-editing orchestration."""

from io import BytesIO
import traceback

import fitz
from PIL import Image
from PyPDF2 import PdfReader, PdfWriter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from photo_utility.pdf_layers import (
    apply_crop_box, apply_line_layer, apply_signature_layer,
    apply_text_annotations, apply_text_edits, apply_whiteouts,
)
from photo_utility.pdf_page_utils import (
    create_blank_page, standardize_single_pdf_page,
)

DEFAULT_PAGE_SIZE = (612.0, 792.0)


def add_blank_pages(writer, num_pages):
    """Adds the specified number of blank pages."""
    for _ in range(num_pages):
        writer.add_page(create_blank_page())


def merge_pdfs(readers, num_blank_pages=0):
    """Merge PDFs with optional blank pages between files."""
    writer = PdfWriter()
    for i, reader in enumerate(readers):
        for page in reader.pages:
            writer.add_page(page)
        if num_blank_pages > 0 and i < len(readers) - 1:
            add_blank_pages(writer, num_blank_pages)
    return writer


def _merge_raster_overlay(page, layer, file_bytes_list, ov_file_idx, ov_page_idx):
    """Render and merge one overlay, using the editor's top-origin coordinates."""
    base_w = float(page.mediabox.width)
    base_h = float(page.mediabox.height)
    dest_x = float(layer.get('dxRatio', 0.0)) * base_w
    dest_y = float(layer.get('dyRatio', 0.0)) * base_h   # from top
    dest_w = float(layer.get('scaleWidthRatio', 1.0)) * base_w
    dest_h = float(layer.get('scaleHeightRatio', 1.0)) * base_h

    src_doc = fitz.open(stream=file_bytes_list[ov_file_idx], filetype="pdf")
    pix = src_doc[ov_page_idx].get_pixmap(matrix=fitz.Matrix(2, 2))
    src_doc.close()
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

    cb = layer.get('cropBox')
    if cb:
        x0 = int(float(cb['leftRatio']) * img.width)
        y0 = int(float(cb['topRatio']) * img.height)
        x1 = x0 + int(float(cb['widthRatio']) * img.width)
        y1 = y0 + int(float(cb['heightRatio']) * img.height)
        img = img.crop((x0, y0, x1, y1))

    dest_w_px = max(1, int(dest_w * 2))
    dest_h_px = max(1, int(dest_h * 2))
    img = img.resize((dest_w_px, dest_h_px), Image.LANCZOS)

    png_io = BytesIO()
    img.save(png_io, format='PNG')
    png_io.seek(0)
    rl_y = base_h - dest_y - dest_h
    packet = BytesIO()
    can = canvas.Canvas(packet, pagesize=(base_w, base_h))
    can.drawImage(ImageReader(png_io), dest_x, rl_y, width=dest_w, height=dest_h)
    can.save()
    packet.seek(0)
    stamp = PdfReader(packet)
    if stamp.pages:
        page.merge_page(stamp.pages[0])


def _legacy_layers(item):
    layers = []
    if 'whiteouts' in item and item['whiteouts']:
        for w in item['whiteouts']:
            layers.append({'type': 'whiteout', **w})
    if 'overlays' in item and item['overlays']:
        for ov in item['overlays']:
            layers.append({'type': 'overlay', **ov})
    if 'annotations' in item and item['annotations']:
        for ann in item['annotations']:
            layers.append({'type': 'annotation', **ann})
    return layers


def _apply_layer(page, layer, file_bytes_list):
    layer_type = layer.get('type')
    if layer_type == 'whiteout':
        return apply_whiteouts(page, [layer])
    if layer_type == 'annotation':
        return apply_text_annotations(page, [layer])
    if layer_type == 'line':
        return apply_line_layer(page, layer)
    if layer_type == 'signature':
        return apply_signature_layer(page, layer)
    if layer_type == 'overlay':
        ov_file_idx = layer.get('fileIndex', 0)
        ov_page_idx = layer.get('pageIndex', 0)
        if not (file_bytes_list and ov_file_idx < len(file_bytes_list)):
            return page
        try:
            _merge_raster_overlay(page, layer, file_bytes_list, ov_file_idx, ov_page_idx)
        except Exception as e:
            print(f"Overlay failed: {e}")
    return page


def _source_page(item, readers, file_bytes_list, current_page_size):
    page = None
    std = item.get('standardized')
    if item.get('isBlank'):
        if std and isinstance(std, dict):
            tw = float(std.get('tw', current_page_size[0]))
            th = float(std.get('th', current_page_size[1]))
        else:
            tw, th = current_page_size
        page = create_blank_page(width=tw, height=th)
        return page, (tw, th)

    file_idx = item.get('fileIndex', 0)
    page_idx = item.get('pageIndex', 0)
    if file_idx >= len(readers) or page_idx >= len(readers[file_idx].pages):
        return None, current_page_size

    orig_page = readers[file_idx].pages[page_idx]
    if std and file_bytes_list and file_idx < len(file_bytes_list):
        try:
            std_page, new_size = standardize_single_pdf_page(file_bytes_list[file_idx], page_idx, std)
            if std_page:
                page = std_page
                current_page_size = new_size
            else:
                page = orig_page
        except Exception as e:
            print(f"Error standardizing page {page_idx} of file {file_idx}: {e}")
            traceback.print_exc()
            page = orig_page
    else:
        page = orig_page

    try:
        current_page_size = (float(page.mediabox.width), float(page.mediabox.height))
    except Exception:
        pass
    return page, current_page_size


def process_pdf_edit_logic(readers, manifest, file_bytes_list=None):
    """Process ordered list of pages with sequential layer stack (annotations, crops, overlays, whiteouts)."""
    writer = PdfWriter()
    current_page_size = DEFAULT_PAGE_SIZE

    for item in manifest:
        page, current_page_size = _source_page(item, readers, file_bytes_list, current_page_size)
        if page is None:
            continue

        if 'cropBox' in item and item['cropBox']:
            page = apply_crop_box(page, item['cropBox'])

        text_edits = item.get('textEdits')
        if text_edits:
            page = apply_text_edits(page, text_edits)

        layers = item.get('layers', [])
        if not layers:
            layers = _legacy_layers(item)

        for layer in layers:
            page = _apply_layer(page, layer, file_bytes_list)

        writer.add_page(page)

    return writer
