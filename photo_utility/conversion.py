"""Image and PDF conversion endpoint."""

import base64
import io
import traceback

import fitz
from flask import jsonify, request, send_file
from PIL import Image

from photo_utility.pdf_page_utils import create_standard_blank_pdf


_MIME_MAP = {
    "EPS":  "application/postscript",
    "TIFF": "image/tiff",
    "TIF":  "image/tiff",
    "PPM":  "image/x-portable-pixmap",
    "JPEG": "image/jpeg",
    "JPG":  "image/jpeg",
    "PNG":  "image/png",
    "WEBP": "image/webp",
    "GIF":  "image/gif",
    "BMP":  "image/bmp",
}

_PREVIEW_FORMATS = {"EPS", "TIFF", "TIF", "PPM"}


def process_image_conversion():
    if "file" not in request.files or "output_format" not in request.form:
        return "File or format not provided", 400

    file = request.files["file"]
    output_format = request.form["output_format"].upper()
    page_size = request.form.get("page_size", "").strip()

    file_bytes = file.read()
    is_pdf = (
        file_bytes.startswith(b"%PDF")
        or file.content_type == "application/pdf"
        or (bool(file.filename) and file.filename.lower().endswith(".pdf"))
    )

    try:
        if output_format == "PDF":
            if page_size:
                pdf_data = create_standard_blank_pdf(page_size, file_bytes, is_pdf)
            elif is_pdf:
                pdf_data = file_bytes
            else:
                img = Image.open(io.BytesIO(file_bytes))
                if img.mode in ("RGBA", "P", "LA"):
                    img = img.convert("RGB")
                tmp = io.BytesIO()
                img.save(tmp, format="PDF")
                pdf_data = tmp.getvalue()

            return send_file(
                io.BytesIO(pdf_data),
                mimetype="application/pdf",
                as_attachment=True,
                download_name="converted.pdf",
            )

        # Non-PDF output
        if is_pdf:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            if not doc:
                return "PDF is empty", 400
            pix = doc[0].get_pixmap()
            img = Image.open(io.BytesIO(pix.tobytes()))
        else:
            img = Image.open(io.BytesIO(file_bytes))

        # Mode compatibility
        if output_format in ("JPEG", "JPG", "EPS", "PPM") and img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")
        elif output_format == "EPS" and img.mode not in ("RGB", "1", "L"):
            img = img.convert("RGB")

        buf = io.BytesIO()
        if output_format in ("TIFF", "TIF"):
            img.save(buf, format="TIFF", compression="tiff_lzw")
        else:
            img.save(buf, format=output_format)
        buf.seek(0)

        mimetype = _MIME_MAP.get(output_format, f"image/{output_format.lower()}")

        # Generate JPEG preview for formats browsers can't render natively
        preview_b64 = None
        if output_format in _PREVIEW_FORMATS:
            try:
                preview = img.copy()
                preview.thumbnail((1200, 1200))
                if preview.mode in ("RGBA", "P", "LA"):
                    preview = preview.convert("RGB")
                p_buf = io.BytesIO()
                preview.save(p_buf, format="JPEG", quality=85)
                preview_b64 = "data:image/jpeg;base64," + base64.b64encode(p_buf.getvalue()).decode()
            except Exception as e:
                print(f"Preview generation warning: {e}")

        if request.form.get("return_json") == "true" or preview_b64:
            return jsonify({
                "success": True,
                "file_b64": base64.b64encode(buf.getvalue()).decode(),
                "preview_b64": preview_b64,
                "mimetype": mimetype,
                "filename": f"converted.{output_format.lower()}",
            })

        return send_file(
            buf,
            mimetype=mimetype,
            as_attachment=True,
            download_name=f"converted.{output_format.lower()}",
        )

    except IOError as e:
        print(f"IOError during image conversion: {e}")
        traceback.print_exc()
        return "Error: File format not supported or invalid image", 400
    except Exception as e:
        print(f"Error during image conversion: {e}")
        traceback.print_exc()
        return f"Error processing image: {e}", 500
