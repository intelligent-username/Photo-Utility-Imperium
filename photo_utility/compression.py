"""Image compression endpoint."""

import io

from flask import request, send_file
from PIL import Image

try:
    import oxipng
except ImportError:
    oxipng = None


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
