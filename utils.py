from PyPDF2 import PdfWriter, PdfReader, Transformation
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from io import BytesIO
import cv2
from PIL import Image
import numpy as np
import fitz

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

        available_width = max(20.0, width - x - 8.0)

        # Word wrap text so lines don't overflow the right edge of the page
        wrapped_lines = []
        for paragraph in text.split('\n'):
            if not paragraph:
                wrapped_lines.append('')
                continue
            words = paragraph.split(' ')
            current_line = []
            for word in words:
                candidate = ' '.join(current_line + [word]) if current_line else word
                if can.stringWidth(candidate, "Helvetica-Bold", font_size) <= available_width or not current_line:
                    current_line.append(word)
                else:
                    wrapped_lines.append(' '.join(current_line))
                    current_line = [word]
            if current_line:
                wrapped_lines.append(' '.join(current_line))

        line_height = font_size * 1.15
        for i, line in enumerate(wrapped_lines):
            can.drawString(x, y - font_size - (i * line_height), line)

    can.save()
    packet.seek(0)

    overlay_reader = PdfReader(packet)
    if len(overlay_reader.pages) > 0:
        page.merge_page(overlay_reader.pages[0])

    return page

def apply_signature_layer(page, layer):
    """Overlays a signature image or text onto a PDF page using reportlab."""
    if not layer:
        return page

    data_url = layer.get('dataUrl', '')
    left_ratio = float(layer.get('leftRatio', 0.0))
    top_ratio = float(layer.get('topRatio', 0.0))
    width_ratio = float(layer.get('widthRatio', 0.3))
    height_ratio = float(layer.get('heightRatio', 0.1))

    width = float(page.mediabox.width)
    height = float(page.mediabox.height)

    x = left_ratio * width
    w = width_ratio * width
    h = height_ratio * height
    y = (1.0 - top_ratio - height_ratio) * height  # Invert Y for PDF space

    if data_url and ',' in data_url:
        import base64
        from reportlab.lib.utils import ImageReader

        try:
            header, encoded = data_url.split(',', 1)
            img_data = base64.b64decode(encoded)
            img_io = BytesIO(img_data)
            img_reader = ImageReader(img_io)

            packet = BytesIO()
            can = canvas.Canvas(packet, pagesize=(width, height))
            can.setFillColorRGB(1.0, 1.0, 1.0)
            can.rect(x, y, w, h, fill=1, stroke=0)
            can.drawImage(img_reader, x, y, width=w, height=h, mask='auto')
            can.save()
            packet.seek(0)

            overlay_reader = PdfReader(packet)
            if len(overlay_reader.pages) > 0:
                page.merge_page(overlay_reader.pages[0])
            return page
        except Exception as e:
            print(f"Error merging signature dataUrl: {e}")

    # Text fallback
    text = layer.get('text', '')
    if text:
        packet = BytesIO()
        can = canvas.Canvas(packet, pagesize=(width, height))
        can.setFillColorRGB(1.0, 1.0, 1.0)
        can.rect(x, y, w, h, fill=1, stroke=0)
        color_hex = layer.get('color', '#000000')
        font_size = max(10, int(h * 0.7))
        can.setFillColor(HexColor(color_hex))
        can.setFont("Helvetica-Bold", font_size)
        can.drawString(x, y + (h * 0.2), text)
        can.save()
        packet.seek(0)
        overlay_reader = PdfReader(packet)
        if len(overlay_reader.pages) > 0:
            page.merge_page(overlay_reader.pages[0])

    return page

def apply_crop_box(page, crop_box):
    """Applies a crop box to a PDF page using PyPDF2."""
    if not crop_box:
        return page

    width = float(page.mediabox.width)
    height = float(page.mediabox.height)

    left_ratio = float(crop_box.get('leftRatio', 0.0))
    top_ratio = float(crop_box.get('topRatio', 0.0))
    width_ratio = float(crop_box.get('widthRatio', 1.0))
    height_ratio = float(crop_box.get('heightRatio', 1.0))

    left = left_ratio * width
    top = (1.0 - top_ratio) * height
    right = left + (width_ratio * width)
    bottom = top - (height_ratio * height)

    page.cropbox.lower_left = (max(0.0, left), max(0.0, bottom))
    page.cropbox.upper_right = (min(width, right), min(height, top))

    return page

def apply_whiteouts(page, whiteouts):
    """Draws solid white rectangles over specified regions of a PDF page,
    permanently nuking/redacting text that is FULLY covered while leaving
    partially covered text intact and highlightable.
    """
    if not whiteouts:
        return page

    # Convert PyPDF page to single-page PDF for PyMuPDF processing
    writer = PdfWriter()
    writer.add_page(page)
    tmp_io = BytesIO()
    writer.write(tmp_io)
    tmp_io.seek(0)

    try:
        doc = fitz.open(stream=tmp_io.getvalue(), filetype="pdf")
        doc_page = doc[0]
        page_w = doc_page.rect.width
        page_h = doc_page.rect.height

        for w in whiteouts:
            left_ratio = float(w.get('leftRatio', 0.0))
            top_ratio = float(w.get('topRatio', 0.0))
            width_ratio = float(w.get('widthRatio', 0.0))
            height_ratio = float(w.get('heightRatio', 0.0))

            x0 = left_ratio * page_w
            y0 = top_ratio * page_h
            x1 = (left_ratio + width_ratio) * page_w
            y1 = (top_ratio + height_ratio) * page_h
            wo_rect = fitz.Rect(x0, y0, x1, y1)

            # Add redaction annotation for the full whiteout rectangle with white fill
            doc_page.add_redact_annot(wo_rect, fill=(1, 1, 1))

        # Permanently erase all text, drawings, and images inside all redaction boxes
        doc_page.apply_redactions()

        out_io = BytesIO(doc.tobytes())
        doc.close()
        return PdfReader(out_io).pages[0]

    except Exception as e:
        print(f"Error applying whiteout with PyMuPDF: {e}")
        # Fallback to PyPDF2 + reportlab overlay if PyMuPDF fails
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
            y = (1.0 - top_ratio - height_ratio) * height
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
            elif l_type == 'signature':
                page = apply_signature_layer(page, layer)
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
    if pil_image.mode == 'RGBA':
        return cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGBA2BGRA)
    elif pil_image.mode != 'RGB':
        pil_image = pil_image.convert('RGB')
    return cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)

def cv2_to_pil(cv2_image):
    if len(cv2_image.shape) == 3 and cv2_image.shape[2] == 4:
        return Image.fromarray(cv2.cvtColor(cv2_image, cv2.COLOR_BGRA2RGBA))
    return Image.fromarray(cv2.cvtColor(cv2_image, cv2.COLOR_BGR2RGB))
# -----------------------
