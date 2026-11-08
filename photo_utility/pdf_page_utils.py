"""PDF page creation, decryption, and standard sizing helpers."""

from io import BytesIO

import fitz
from PIL import Image
from PyPDF2 import PdfReader
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

LETTER = (612.0, 792.0)
A4 = (595.0, 842.0)


def rotated_page_dimensions(rect, rotation):
    """Return page width/height with 90/270 rotations applied."""
    if rotation % 360 in (90, 270):
        return rect.height, rect.width
    return rect.width, rect.height


def fit_page_inside(source_width, source_height, target_width, target_height):
    """Contain-fit a source page inside a target canvas and center it."""
    scale = min(target_width / source_width, target_height / source_height)
    width = source_width * scale
    height = source_height * scale
    return scale, width, height, (target_width - width) / 2.0, (target_height - height) / 2.0


def add_fitted_pdf_page(out_doc, src_doc, page_number, src_page, width, height, rw, rh, x, y):
    """Draw a white page and embed a source page at the fitted position."""
    out_page = out_doc.new_page(width=width, height=height)
    out_page.draw_rect(fitz.Rect(0, 0, width, height), color=None, fill=(1, 1, 1), width=0)
    target_rect = fitz.Rect(x, y, x + rw, y + rh)
    out_page.show_pdf_page(target_rect, src_doc, pno=page_number, clip=src_page.rect,
                           rotate=src_page.rotation, keep_proportion=True)
    return out_page


def ensure_unencrypted_pdf_bytes(file_bytes):
    """Decrypts AES/standard-encrypted PDFs using PyMuPDF (which handles AES natively without pycryptodome)
    and returns clean unencrypted PDF bytes so PyPDF2 can process them safely without DependencyError."""
    if not file_bytes or not file_bytes.startswith(b"%PDF"):
        return file_bytes
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        if doc.is_encrypted:
            doc.authenticate("")
            clean_doc = fitz.open()
            clean_doc.insert_pdf(doc)
            clean_bytes = clean_doc.tobytes(garbage=3, deflate=True)
            clean_doc.close()
            doc.close()
            return clean_bytes
        doc.close()
    except Exception as e:
        pass
    return file_bytes

def create_blank_page(width=612.0, height=792.0):
    """Creates a single blank PDF page in memory with specified dimensions (default standard Letter: 612x792 pt)."""
    packet = BytesIO()
    can = canvas.Canvas(packet, pagesize=(width, height))
    can.showPage()
    can.save()
    packet.seek(0)
    return PdfReader(packet).pages[0]

def standardize_single_pdf_page(file_bytes, page_idx, std_spec):
    """Embeds a single PDF page into a standard white Letter/A4 canvas with contain-fit scaling."""
    if isinstance(std_spec, dict):
        tw = float(std_spec.get('tw', 612.0))
        th = float(std_spec.get('th', 792.0))
    elif isinstance(std_spec, str) and ('a4' in std_spec.lower() or 'eu' in std_spec.lower()):
        tw, th = 595.0, 842.0
    else:
        tw, th = 612.0, 792.0

    src_doc = fitz.open(stream=file_bytes, filetype="pdf")
    try:
        if src_doc.is_encrypted:
            src_doc.authenticate("")
        if page_idx >= len(src_doc):
            return None, (tw, th)
        src_page = src_doc[page_idx]

        sw, sh = rotated_page_dimensions(src_page.rect, src_page.rotation)

        if sw <= 0: sw = 612.0
        if sh <= 0: sh = 792.0

        _, rw, rh, x, y = fit_page_inside(sw, sh, tw, th)

        out_doc = fitz.open()
        add_fitted_pdf_page(out_doc, src_doc, page_idx, src_page, tw, th, rw, rh, x, y)

        std_pdf_bytes = out_doc.tobytes(garbage=3, deflate=True)
        out_doc.close()

        std_reader = PdfReader(BytesIO(std_pdf_bytes))
        return std_reader.pages[0], (tw, th)
    finally:
        src_doc.close()

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
            scale, rw, rh, x, y = fit_page_inside(sw, sh, w, h)
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
                if len(src) == 0:
                    raise ValueError("Empty PDF")
                out = fitz.open()
                for src_page in src:
                    page_sw, page_sh = rotated_page_dimensions(src_page.rect, src_page.rotation)

                    if page_sw <= 0: page_sw = 612.0
                    if page_sh <= 0: page_sh = 792.0

                    _, page_rw, page_rh, page_x, page_y = fit_page_inside(page_sw, page_sh, w, h)

                    add_fitted_pdf_page(out, src, src_page.number, src_page, w, h,
                                        page_rw, page_rh, page_x, page_y)

                print(f"embedded {len(src)} PDF page(s) standardized to {w}x{h}")
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
                _, rw2, rh2, x2, y2 = fit_page_inside(sw, sh, w2, h2)
                page.draw_rect(fitz.Rect(x2, y2, x2+rw2, y2+rh2), color=(1,0,0), fill=(1,1,0), width=4)
            data2 = doc.tobytes()
            doc.close()
            return data2
        except Exception as e2:
            print(f"fallback also failed: {e2}")
            traceback.print_exc()
            raise
