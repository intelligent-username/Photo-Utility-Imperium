"""Background removal endpoint."""

import io

from flask import request, send_file
from PIL import Image
from rembg import remove


def process_background_removal():
    if "file" not in request.files:
        return "No file uploaded", 400

    img = Image.open(request.files["file"].stream)
    output = remove(img)

    buf = io.BytesIO()
    output.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png")
