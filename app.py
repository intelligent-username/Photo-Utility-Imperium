"""app.py — Photo Utility Imperium backend."""

import base64
import io
import json

try:
    import oxipng
except ImportError:
    oxipng = None
import traceback
import warnings

import cv2
import fitz
from flask import Flask, jsonify, render_template, request, send_file
from PIL import Image
from PyPDF2 import PdfReader
from rembg import remove

from utils import (
    create_standard_blank_pdf,
    cv2_to_pil,
    merge_pdfs,
    pil_to_cv2,
    process_pdf_edit_logic,
)

warnings.simplefilter("ignore")

app = Flask(__name__)

@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

@app.route("/")
@app.route("/main")
def main():
    return render_template("Pages/main.html")


@app.route("/BR")
def background_remover():
    return render_template("Pages/BR.html")


@app.route("/IC")
def image_compressor():
    return render_template("Pages/IC.html")


@app.route("/NR")
def noise_reducer():
    return render_template("Pages/NR.html")


@app.route("/FC")
def format_converter():
    return render_template("Pages/FC.html")


@app.route("/PDF")
def pdf_editor():
    return render_template("Pages/PDF.html")


# Silence noisy browser requests
@app.route("/.well-known/appspecific/com.chrome.devtools.json")
def chrome_devtools():
    return "", 204


@app.route("/favicon.ico")
def favicon():
    return "", 204


# ---------------------------------------------------------------------------
# Background Remover
# ---------------------------------------------------------------------------

@app.route("/process_background_removal", methods=["POST"])
def process_background_removal():
    if "file" not in request.files:
        return "No file uploaded", 400

    img = Image.open(request.files["file"].stream)
    output = remove(img)

    buf = io.BytesIO()
    output.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png")


# ---------------------------------------------------------------------------
# Image Compressor
# ---------------------------------------------------------------------------

@app.route("/process_compression", methods=["POST"])
def process_compression():
    if "file" not in request.files:
        return "No file uploaded", 400

    file = request.files["file"]
    file_bytes = file.read()
    if not file_bytes:
        return "Empty file uploaded", 400

    img = Image.open(io.BytesIO(file_bytes))
    fmt = (img.format or "JPEG").upper()
    if fmt == "JPG":
        fmt = "JPEG"

    quality = int(request.form.get("quality", 50))

    # Helper to run oxipng if available
    def run_oxipng(png_data: bytes) -> bytes:
        if oxipng is None:
            return png_data
        strip_arg = None
        if hasattr(oxipng, "StripChunks") and hasattr(oxipng.StripChunks, "none"):
            strip_arg = oxipng.StripChunks.none()
        elif hasattr(oxipng, "Strip") and hasattr(oxipng.Strip, "none"):
            strip_arg = oxipng.Strip.none()

        kwargs = {"level": 3}
        if strip_arg is not None:
            kwargs["strip"] = strip_arg
        try:
            return oxipng.optimize_from_memory(png_data, **kwargs)
        except Exception:
            return png_data

    # 1. Direct early exits for native lossy formats
    if fmt == "JPEG":
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        buf.seek(0)
        return send_file(buf, mimetype="image/jpeg")

    if fmt == "WEBP":
        buf = io.BytesIO()
        if quality >= 85:
            img.save(buf, format="WEBP", lossless=True, method=6)
        else:
            img.save(buf, format="WEBP", quality=quality, method=6)
        buf.seek(0)
        return send_file(buf, mimetype="image/webp")

    # 2. PNG Pipeline
    if fmt == "PNG":
        # Tier 0 (Quality >= 85): Strict lossless early exit
        if quality >= 85:
            optimized_png = run_oxipng(file_bytes)
            final_bytes = optimized_png if len(optimized_png) < len(file_bytes) else file_bytes
            buf = io.BytesIO(final_bytes)
            buf.seek(0)
            return send_file(buf, mimetype="image/png")

        # Color profile normalization to prevent color shifts
        work_img = img
        if "icc_profile" in work_img.info:
            try:
                from PIL import ImageCms
                f_in = io.BytesIO(work_img.info["icc_profile"])
                profile_in = ImageCms.getOpenProfile(f_in)
                profile_srgb = ImageCms.createProfile("sRGB")
                work_img = ImageCms.profileToProfile(work_img, profile_in, profile_srgb, outputMode=work_img.mode)
            except Exception:
                pass

        if work_img.mode == "RGBA":
            try:
                alpha = work_img.getchannel("A")
                if alpha.getextrema() == (255, 255):
                    work_img = work_img.convert("RGB")
            except Exception:
                pass
        elif work_img.mode not in ("RGB", "RGBA"):
            work_img = work_img.convert("RGB")

        # Tier 1 (First frontier): Perceptual WebP frequency compression to PNG (24-bit Truecolor)
        webp_buf = io.BytesIO()
        work_img.save(webp_buf, format="WEBP", quality=quality, method=6)
        webp_buf.seek(0)
        lossy_img = Image.open(webp_buf)

        buf1 = io.BytesIO()
        lossy_img.save(buf1, format="PNG", optimize=True)
        pass1_png = run_oxipng(buf1.getvalue())

        # Early exit if Tier 1 already achieved sufficient reduction or quality is moderate/high
        if quality >= 65 or len(pass1_png) <= len(file_bytes) * 0.5:
            buf = io.BytesIO(pass1_png)
            buf.seek(0)
            return send_file(buf, mimetype="image/png")

        # Tier 2: 256-color Fast Octree without dithering for deeper compression
        try:
            quantized = lossy_img.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        except Exception:
            try:
                quantized = lossy_img.quantize(colors=256, dither=Image.Dither.NONE)
            except Exception:
                quantized = lossy_img

        buf2 = io.BytesIO()
        quantized.save(buf2, format="PNG", optimize=True)
        pass2_png = run_oxipng(buf2.getvalue())

        # Pick whichever pass is smaller
        best_png = pass2_png if len(pass2_png) < len(pass1_png) else pass1_png
        buf = io.BytesIO(best_png)
        buf.seek(0)
        return send_file(buf, mimetype="image/png")

    # 3. Fallback for any remaining formats
    buf = io.BytesIO()
    try:
        img.save(buf, format=fmt, quality=quality)
        mimetype = f"image/{fmt.lower()}"
    except Exception:
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.save(buf, format="JPEG", quality=quality)
        mimetype = "image/jpeg"

    buf.seek(0)
    return send_file(buf, mimetype=mimetype)


# ---------------------------------------------------------------------------
# Noise Reducer
# ---------------------------------------------------------------------------

@app.route("/process_image_cleaning", methods=["POST"])
def process_image_cleaning():
    if "file" not in request.files:
        return "No file uploaded", 400

    file = request.files["file"]
    img = Image.open(file.stream)

    cv_img = pil_to_cv2(img)
    cleaned_cv = cv2.GaussianBlur(cv_img, (5, 5), 0)
    cleaned = cv2_to_pil(cleaned_cv)

    fmt = (img.format or "PNG").upper()
    if fmt in ("JPG", "JPEG"):
        if cleaned.mode in ("RGBA", "P", "LA"):
            cleaned = cleaned.convert("RGB")
        out_format = "JPEG"
        mimetype = "image/jpeg"
    else:
        out_format = fmt
        mimetype = f"image/{fmt.lower()}"

    buf = io.BytesIO()
    cleaned.save(buf, format=out_format)
    buf.seek(0)
    return send_file(buf, mimetype=mimetype)


# ---------------------------------------------------------------------------
# Format Converter
# ---------------------------------------------------------------------------

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


@app.route("/process_image_conversion", methods=["POST"])
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


# ---------------------------------------------------------------------------
# PDF editor
# ---------------------------------------------------------------------------

@app.route("/process_pdf_merge", methods=["POST"])
def process_pdf_merge():
    try:
        files = [request.files[k] for k in request.files if k.startswith("file")]
        pages_between = int(request.form.get("pages_between", 0))

        readers = [PdfReader(f.stream) for f in files]
        writer = merge_pdfs(readers, num_blank_pages=pages_between)

        buf = io.BytesIO()
        writer.write(buf)
        buf.seek(0)
        return send_file(buf, mimetype="application/pdf", as_attachment=True, download_name="merged.pdf")

    except Exception as e:
        print(f"Error merging PDFs: {e}")
        return "Error merging PDFs", 500


@app.route("/process_pdf_edit", methods=["POST"])
def process_pdf_edit():
    try:
        file_keys = sorted(k for k in request.files if k.startswith("file_"))
        files = [request.files[k] for k in file_keys]
        manifest = json.loads(request.form.get("manifest", "[]"))

        file_bytes_list = [f.read() for f in files]
        readers = [PdfReader(io.BytesIO(b)) for b in file_bytes_list]
        writer = process_pdf_edit_logic(readers, manifest, file_bytes_list)

        buf = io.BytesIO()
        writer.write(buf)
        buf.seek(0)
        return send_file(buf, mimetype="application/pdf", as_attachment=True, download_name="edited.pdf")

    except Exception as e:
        print(f"Error editing PDF: {e}")
        return "Error editing PDF", 500


@app.route("/process_pdf_standardize", methods=["POST"])
def process_pdf_standardize():
    try:
        page_size = request.form.get("page_size", "").strip()
        if not page_size:
            return "page_size required", 400

        file_keys = sorted(k for k in request.files if k.startswith("file"))
        if not file_keys:
            return "No files", 400

        print(f"Standardize PDF: {len(file_keys)} file(s), page_size='{page_size}'")

        final_doc = fitz.open()
        for k in file_keys:
            fb = request.files[k].read()
            if not fb:
                continue
            std_bytes = create_standard_blank_pdf(page_size, fb, is_pdf_input=True)
            tmp = fitz.open(stream=std_bytes, filetype="pdf")
            final_doc.insert_pdf(tmp)
            tmp.close()

        page_count = len(final_doc)
        if page_count == 0:
            return "No pages generated", 500

        out_bytes = final_doc.tobytes(garbage=3, deflate=True)
        final_doc.close()

        print(f"Standardize PDF generated {len(out_bytes)} bytes, {page_count} page(s)")
        return send_file(
            io.BytesIO(out_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name="standardized.pdf",
        )

    except Exception as e:
        print(f"Error standardizing PDF: {e}")
        traceback.print_exc()
        return f"Error standardizing PDF: {e}", 500


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(400)
def bad_request(e):
    return render_template("400.html"), 400


@app.errorhandler(401)
def unauthorized(e):
    return render_template("error.html", code=401, title="Unauthorized",
                           message="Please sign in to continue."), 401


@app.errorhandler(403)
def forbidden(e):
    return render_template("error.html", code=403, title="Forbidden",
                           message="You don't have permission to access this resource."), 403


@app.errorhandler(404)
def not_found(e):
    return render_template("404.html"), 404


@app.errorhandler(429)
def too_many_requests(e):
    return render_template("error.html", code=429, title="Too Many Requests",
                           message="You're sending requests too quickly. Please try again later."), 429


@app.errorhandler(500)
def internal_error(e):
    return render_template("500.html"), 500


@app.errorhandler(503)
def service_unavailable(e):
    return render_template("error.html", code=503, title="Service Unavailable",
                           message="The service is temporarily unavailable. Try again later."), 503


@app.errorhandler(Exception)
def handle_exception(e):
    return render_template("500.html"), 500


# ---------------------------------------------------------------

if __name__ == "__main__":
    app.run(debug=True)
