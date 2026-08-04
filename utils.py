from PyPDF2 import PdfWriter, PdfReader, Transformation
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from io import BytesIO
import cv2
from PIL import Image
import numpy as np

#
# Helpers & Utilities
#-----------------------#
# PDF Merger & Editor
#

def create_blank_page(width=612.0, height=792.0):
    """Creates a single blank PDF page in memory with specified dimensions (default standard Letter: 612x792 pt)."""
    packet = BytesIO()
    can = canvas.Canvas(packet, pagesize=(width, height))
    can.showPage()
    can.save()
    packet.seek(0)
    return PdfReader(packet).pages[0]

def add_blank_pages(writer, num_pages):
    """Adds the specified number of blank pages."""
    for _ in range(num_pages):
        writer.add_page(create_blank_page())

def apply_text_annotations(page, annotations):
    """Overlays text annotations onto a PDF page using reportlab."""
    if not annotations:
        return page

    packet = BytesIO()
    width = float(page.mediabox.width)
    height = float(page.mediabox.height)

    can = canvas.Canvas(packet, pagesize=(width, height))

    for ann in annotations:
        text = ann.get('text', '')
        if not text:
            continue

        x_ratio = float(ann.get('xRatio', 0.0))
        y_ratio = float(ann.get('yRatio', 0.0))
        color_hex = ann.get('color', '#3b82f6')
        font_size = int(ann.get('fontSize', 16))

        x = x_ratio * width
        y = (1.0 - y_ratio) * height  # Invert Y for PDF space

        can.setFillColor(HexColor(color_hex))
        can.setFont("Helvetica-Bold", font_size)
        can.drawString(x, y - font_size, text)

    can.save()
    packet.seek(0)

    overlay_reader = PdfReader(packet)
    if len(overlay_reader.pages) > 0:
        page.merge_page(overlay_reader.pages[0])

    return page

def apply_crop_box(page, crop):
    """Applies crop dimensions to a page using cropbox ratios."""
    width = float(page.mediabox.width)
    height = float(page.mediabox.height)

    left_ratio = float(crop.get('leftRatio', 0.0))
    top_ratio = float(crop.get('topRatio', 0.0))
    width_ratio = float(crop.get('widthRatio', 1.0))
    height_ratio = float(crop.get('heightRatio', 1.0))

    left = left_ratio * width
    bottom = (1.0 - top_ratio - height_ratio) * height
    right = left + (width_ratio * width)
    top = bottom + (height_ratio * height)

    page.cropbox.lower_left = (max(0.0, left), max(0.0, bottom))
    page.cropbox.upper_right = (min(width, right), min(height, top))

    return page

def apply_whiteouts(page, whiteouts):
    """Draws solid white rectangles over specified regions of a PDF page."""
    if not whiteouts:
        return page

    packet = BytesIO()
    width = float(page.mediabox.width)
    height = float(page.mediabox.height)

    can = canvas.Canvas(packet, pagesize=(width, height))
    can.setFillColorRGB(1.0, 1.0, 1.0)
    can.setStrokeColorRGB(1.0, 1.0, 1.0)

    for w in whiteouts:
        left_ratio = float(w.get('leftRatio', 0.0))
        top_ratio = float(w.get('topRatio', 0.0))
        width_ratio = float(w.get('widthRatio', 0.0))
        height_ratio = float(w.get('heightRatio', 0.0))

        x = left_ratio * width
        y = (1.0 - top_ratio - height_ratio) * height  # Invert Y for PDF space
        rect_w = width_ratio * width
        rect_h = height_ratio * height

        can.rect(x, y, rect_w, rect_h, fill=1, stroke=0)

    can.save()
    packet.seek(0)

    overlay_reader = PdfReader(packet)
    if len(overlay_reader.pages) > 0:
        page.merge_page(overlay_reader.pages[0])

    return page

def merge_pdfs(readers, num_blank_pages=0):
    """Merge PDFs with optional blank pages between files."""
    writer = PdfWriter()
    for i, reader in enumerate(readers):
        for page in reader.pages:
            writer.add_page(page)
        if num_blank_pages > 0 and i < len(readers) - 1:
            add_blank_pages(writer, num_blank_pages)
    return writer

def process_pdf_edit_logic(readers, manifest):
    """Process ordered list of pages with sequential layer stack (annotations, crops, overlays, whiteouts)."""
    writer = PdfWriter()
    current_page_size = (612.0, 792.0)  # Default standard Letter size (612x792 pt)

    for item in manifest:
        if item.get('isBlank'):
            page = create_blank_page(width=current_page_size[0], height=current_page_size[1])
        else:
            file_idx = item.get('fileIndex', 0)
            page_idx = item.get('pageIndex', 0)

            if file_idx < len(readers) and page_idx < len(readers[file_idx].pages):
                page = readers[file_idx].pages[page_idx]
                try:
                    current_page_size = (float(page.mediabox.width), float(page.mediabox.height))
                except Exception:
                    pass
            else:
                continue

        # Apply crop box first (if any)
        if 'cropBox' in item and item['cropBox']:
            page = apply_crop_box(page, item['cropBox'])

        # Process unified layers in EXACT chronological order
        layers = item.get('layers', [])
        
        # Fallback for legacy manifests
        if not layers:
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

        for layer in layers:
            l_type = layer.get('type')
            if l_type == 'whiteout':
                page = apply_whiteouts(page, [layer])
            elif l_type == 'annotation':
                page = apply_text_annotations(page, [layer])
            elif l_type == 'overlay':
                ov_file_idx = layer.get('fileIndex', 0)
                ov_page_idx = layer.get('pageIndex', 0)
                if ov_file_idx < len(readers) and ov_page_idx < len(readers[ov_file_idx].pages):
                    overlay_page = readers[ov_file_idx].pages[ov_page_idx]

                    if 'cropBox' in layer and layer['cropBox']:
                        overlay_page = apply_crop_box(overlay_page, layer['cropBox'])

                    # Process sub-layers on overlay page recursively
                    sub_layers = layer.get('layers', [])
                    for sub in sub_layers:
                        s_type = sub.get('type')
                        if s_type == 'whiteout':
                            overlay_page = apply_whiteouts(overlay_page, [sub])
                        elif s_type == 'annotation':
                            overlay_page = apply_text_annotations(overlay_page, [sub])

                    dx_ratio = float(layer.get('dxRatio', 0.0))
                    dy_ratio = float(layer.get('dyRatio', 0.0))
                    scale_w = float(layer.get('scaleWidthRatio', 1.0))
                    scale_h = float(layer.get('scaleHeightRatio', 1.0))

                    base_width = float(page.mediabox.width)
                    base_height = float(page.mediabox.height)
                    ov_width = float(overlay_page.mediabox.width)
                    ov_height = float(overlay_page.mediabox.height)

                    tx = dx_ratio * base_width
                    ty = base_height - (dy_ratio * base_height) - (scale_h * ov_height)

                    try:
                        overlay_page.add_transformation(Transformation().scale(scale_w, scale_h).translate(tx, ty))
                    except Exception as e:
                        print(f"Overlay transformation failed: {e}")

                    page.merge_page(overlay_page)

        writer.add_page(page)

    return writer

# -----------------------
# For image converter
def pil_to_cv2(pil_image):
    return cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)

def cv2_to_pil(cv2_image):
    return Image.fromarray(cv2.cvtColor(cv2_image, cv2.COLOR_BGR2RGB))
# -----------------------
