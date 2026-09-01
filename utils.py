from PyPDF2 import PdfWriter, PdfReader, Transformation
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
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
        font_family = ann.get('fontFamily', '')
        is_bold = bool(ann.get('bold', False))

        x = x_ratio * width
        y = (1.0 - y_ratio) * height  # Invert Y for PDF space

        # Map basic font families to built-in reportlab fonts
        if 'times' in font_family.lower():
            font_name = "Times-Bold" if is_bold else "Times-Roman"
        else:
            font_name = "Helvetica-Bold" if is_bold else "Helvetica"

        can.setFillColor(HexColor(color_hex))
        can.setFont(font_name, font_size)

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
                if can.stringWidth(candidate, font_name, font_size) <= available_width or not current_line:
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
        color_hex = layer.get('color', '#000000')
        font_family = layer.get('fontFamily', '')
        is_bold = bool(layer.get('bold', False))
        font_size = int(layer.get('fontSize', 0)) or max(10, int(h * 0.7))
        if 'times' in font_family.lower():
            font_name = "Times-Bold" if is_bold else "Times-Roman"
        else:
            font_name = "Helvetica-Bold" if is_bold else "Helvetica"
        can.setFillColor(HexColor(color_hex))
        can.setFont(font_name, font_size)
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

def process_pdf_edit_logic(readers, manifest, file_bytes_list=None):
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
                if not (file_bytes_list and ov_file_idx < len(file_bytes_list)):
                    continue
                try:
                    base_w = float(page.mediabox.width)
                    base_h = float(page.mediabox.height)
                    dest_x = float(layer.get('dxRatio', 0.0)) * base_w
                    dest_y = float(layer.get('dyRatio', 0.0)) * base_h   # from top
                    dest_w = float(layer.get('scaleWidthRatio', 1.0)) * base_w
                    dest_h = float(layer.get('scaleHeightRatio', 1.0)) * base_h

                    # 1. Render source page to pixels
                    src_doc = fitz.open(stream=file_bytes_list[ov_file_idx], filetype="pdf")
                    pix = src_doc[ov_page_idx].get_pixmap(matrix=fitz.Matrix(2, 2))
                    src_doc.close()
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

                    # 2. Crop (same ratios as frontend canvas drawImage source rect)
                    cb = layer.get('cropBox')
                    if cb:
                        x0 = int(float(cb['leftRatio'])  * img.width)
                        y0 = int(float(cb['topRatio'])   * img.height)
                        x1 = x0 + int(float(cb['widthRatio'])  * img.width)
                        y1 = y0 + int(float(cb['heightRatio']) * img.height)
                        img = img.crop((x0, y0, x1, y1))

                    # 3. Resize to destination pixel size
                    dest_w_px = max(1, int(dest_w * 2))
                    dest_h_px = max(1, int(dest_h * 2))
                    img = img.resize((dest_w_px, dest_h_px), Image.LANCZOS)

                    # 4. Stamp onto page via reportlab (y flipped: reportlab origin = bottom-left)
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
                except Exception as e:
                    print(f"Overlay failed: {e}")

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

LETTER = (612.0, 792.0)
A4 = (595.0, 842.0)

def create_standard_blank_pdf(page_size_name, file_bytes=None, is_pdf_input=False):
    """Return a blank Letter/A4 page with a rectangle of the original PDF size drawn centered."""
    try:
        name = str(page_size_name or "").upper()
        is_letter = "LETTER" in name or "US" in name
        w, h = LETTER if is_letter else A4
        # get original dimensions
        sw, sh = None, None
        if file_bytes:
            try:
                if is_pdf_input:
                    doc = fitz.open(stream=file_bytes, filetype="pdf")
                    if len(doc) > 0:
                        sw = float(doc[0].rect.width)
                        sh = float(doc[0].rect.height)
                    doc.close()
                else:
                    img = Image.open(BytesIO(file_bytes))
                    sw, sh = float(img.size[0]), float(img.size[1])
                    try:
                        img.close()
                    except:
                        pass
            except Exception as e:
                print(f"rect size detection failed: {e}")
                import traceback
                traceback.print_exc()
        print(f"create_standard_blank_pdf: page {w}x{h}, rect {sw}x{sh} is_pdf={is_pdf_input}")
        if sw and sh:
            scale = min(w / sw, h / sh) if sw and sh else 1.0
            rw, rh = sw * scale, sh * scale
            x = (w - rw) / 2.0
            y = (h - rh) / 2.0
            print(f"maxed rect {sw}x{sh} -> {rw}x{rh} scale {scale} at {x},{y}")
        else:
            scale = 1.0
            rw, rh = 200, 200
            x, y = (w - rw) / 2.0, (h - rh) / 2.0
            print("no sw/sh, using fallback 200x200")

        # branch: PDF -> fitz vector embed, Image -> reportlab embed
        if is_pdf_input and file_bytes:
            # draw generated PDF page in place of rectangle - maxed
            try:
                src = fitz.open(stream=file_bytes, filetype="pdf")
                out = fitz.open()
                page = out.new_page(width=w, height=h)
                page.draw_rect(fitz.Rect(0, 0, w, h), color=None, fill=(1, 1, 1), width=0)
                # show first page scaled to maxed rect
                page.show_pdf_page(fitz.Rect(x, y, x+rw, y+rh), src, pno=0, clip=src[0].rect, keep_proportion=False, overlay=True)
                print(f"embedded PDF page {sw}x{sh} -> rect {rw}x{rh}")
                data = out.tobytes(garbage=3, deflate=True)
                src.close()
                out.close()
                if data.startswith(b"%PDF"):
                    return data
                raise ValueError("PDF embed produced invalid PDF")
            except Exception as e:
                print(f"PDF embed failed, falling back to rect: {e}")
                import traceback
                traceback.print_exc()
                # fall through to reportlab rect
        if file_bytes and not is_pdf_input:
            # draw generated PDF (from image) in place of rectangle - maxed image
            packet = BytesIO()
            can = canvas.Canvas(packet, pagesize=(w, h))
            can.setFillColorRGB(1, 1, 1)
            can.rect(0, 0, w, h, fill=1, stroke=0)
            try:
                can.drawImage(ImageReader(BytesIO(file_bytes)), x, y, width=rw, height=rh, preserveAspectRatio=False, mask='auto')
                print(f"embedded image {sw}x{sh} -> rect {rw}x{rh}")
            except Exception as e:
                print(f"image embed failed: {e}")
                import traceback
                traceback.print_exc()
                can.setFillColorRGB(1, 1, 0)
                can.setStrokeColorRGB(1, 0, 0)
                can.setLineWidth(4)
                can.rect(x, y, rw, rh, fill=1, stroke=1)
            can.showPage()
            can.save()
            packet.seek(0)
            data = packet.getvalue()
            if data.startswith(b"%PDF"):
                return data
            raise ValueError("Image embed produced invalid PDF")
        # fallback: yellow rect (should not reach here)
        packet = BytesIO()
        can = canvas.Canvas(packet, pagesize=(w, h))
        can.setFillColorRGB(1, 1, 1)
        can.rect(0, 0, w, h, fill=1, stroke=0)
        can.setStrokeColorRGB(1, 0, 0)
        can.setFillColorRGB(1, 1, 0)
        can.setLineWidth(4)
        can.rect(x, y, rw, rh, fill=1, stroke=1)
        can.showPage()
        can.save()
        packet.seek(0)
        data = packet.getvalue()
        if not data.startswith(b"%PDF"):
            raise ValueError("Generated data is not PDF")
        return data
    except Exception as e:
        import traceback
        print(f"create_standard_blank_pdf failed for '{page_size_name}': {e}")
        traceback.print_exc()
        try:
            import fitz
            name2 = str(page_size_name or "").upper()
            is_letter2 = "LETTER" in name2 or "US" in name2
            w2, h2 = LETTER if is_letter2 else A4
            doc = fitz.open()
            page = doc.new_page(width=w2, height=h2)
            page.draw_rect(fitz.Rect(0, 0, w2, h2), color=None, fill=(1, 1, 1))
            if 'sw' in locals() and sw and sh:
                scale2 = min(w2 / sw, h2 / sh) if sw and sh else 1.0
                rw2, rh2 = sw * scale2, sh * scale2
                x2 = (w2 - rw2) / 2.0
                y2 = (h2 - rh2) / 2.0
                page.draw_rect(fitz.Rect(x2, y2, x2+rw2, y2+rh2), color=(1,0,0), fill=(1,1,0), width=4)
            data2 = doc.tobytes()
            doc.close()
            return data2
        except Exception as e2:
            print(f"fallback also failed: {e2}")
            traceback.print_exc()
            raise
# -----------------------
