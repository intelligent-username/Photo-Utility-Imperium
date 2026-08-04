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
        x_ratio = float(ann.get('xRatio', 0))
        y_ratio = float(ann.get('yRatio', 0))
        font_size = int(ann.get('fontSize', 16))
        hex_color = ann.get('color', '#ff0000')

        x = x_ratio * width
        y = (1.0 - y_ratio) * height  # Invert Y ratio for PDF coordinate space

        try:
            can.setFillColor(HexColor(hex_color))
        except Exception:
            can.setFillColorRGB(1, 0, 0)

        can.setFont("Helvetica-Bold", font_size)
        can.drawString(x, y, text)

    can.save()
    packet.seek(0)

    overlay_reader = PdfReader(packet)
    if len(overlay_reader.pages) > 0:
        page.merge_page(overlay_reader.pages[0])

    return page

def apply_crop_box(page, crop):
    """Adjusts page CropBox bounds based on normalized crop coordinates."""
    if not crop:
        return page

    width = float(page.mediabox.width)
    height = float(page.mediabox.height)

    left_ratio = float(crop.get('leftRatio', 0))
    top_ratio = float(crop.get('topRatio', 0))
    width_ratio = float(crop.get('widthRatio', 1.0))
    height_ratio = float(crop.get('heightRatio', 1.0))

    left = left_ratio * width
    bottom = (1.0 - top_ratio - height_ratio) * height
    right = left + (width_ratio * width)
    top = bottom + (height_ratio * height)

    page.cropbox.lower_left = (max(0.0, left), max(0.0, bottom))
    page.cropbox.upper_right = (min(width, right), min(height, top))

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
    """Process ordered list of pages with annotations, crops, overlays, and blank pages."""
    writer = PdfWriter()
    current_page_size = (612.0, 792.0)  # Default standard Letter size (612x792 pt)

    for item in manifest:
        if item.get('isBlank'):
            # Blank page inherits dimensions of preceding page (or standard Letter size)
            page = create_blank_page(width=current_page_size[0], height=current_page_size[1])
        else:
            file_idx = item.get('fileIndex', 0)
            page_idx = item.get('pageIndex', 0)

            if file_idx < len(readers) and page_idx < len(readers[file_idx].pages):
                # Extract base page
                page = readers[file_idx].pages[page_idx]

                # Track page size for subsequent blank pages
                try:
                    current_page_size = (float(page.mediabox.width), float(page.mediabox.height))
                except Exception:
                    pass
            else:
                continue

        # Apply cropping to base page (standard or blank)
        if 'cropBox' in item and item['cropBox']:
            page = apply_crop_box(page, item['cropBox'])

        # Apply annotations
        if 'annotations' in item and item['annotations']:
            page = apply_text_annotations(page, item['annotations'])

        # Apply overlays: merge other pages on top (with optional position translation offset)
        overlays = item.get('overlays', [])
        for ov in overlays:
            ov_file_idx = ov.get('fileIndex', 0)
            ov_page_idx = ov.get('pageIndex', 0)
            if ov_file_idx < len(readers) and ov_page_idx < len(readers[ov_file_idx].pages):
                overlay_page = readers[ov_file_idx].pages[ov_page_idx]
                ov_crop = ov.get('cropBox')
                if ov_crop:
                    overlay_page = apply_crop_box(overlay_page, ov_crop)

                dx_ratio = float(ov.get('dxRatio', 0.0))
                dy_ratio = float(ov.get('dyRatio', 0.0))
                if dx_ratio != 0.0 or dy_ratio != 0.0:
                    base_width = float(page.mediabox.width)
                    base_height = float(page.mediabox.height)
                    tx = dx_ratio * base_width
                    ty = -dy_ratio * base_height  # Y inverted in PDF space
                    try:
                        overlay_page.add_transformation(Transformation().translate(tx, ty))
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
