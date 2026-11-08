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
import numpy as np
from PIL import Image
from PyPDF2 import PdfReader
from rembg import remove

from photo_utility import (
    create_standard_blank_pdf,
    cv2_to_pil,
    ensure_unencrypted_pdf_bytes,
    merge_pdfs,
    pil_to_cv2,
    process_pdf_edit_logic,
)

warnings.simplefilter("ignore")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100MB limit

from photo_utility.pages import main, background_remover, image_compressor, noise_reducer, format_converter, pdf_editor, chrome_devtools, favicon
from photo_utility.background_removal import process_background_removal
from photo_utility.compression import process_compression
from photo_utility.noise_reduction import process_image_cleaning
from photo_utility.conversion import _MIME_MAP, _PREVIEW_FORMATS, process_image_conversion
from photo_utility.pdf_routes import process_pdf_merge, process_pdf_edit, process_pdf_standardize
from photo_utility.error_handlers import bad_request, unauthorized, forbidden, not_found, request_entity_too_large, too_many_requests, internal_error, service_unavailable, handle_exception


@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

app.route("/main")(main)
app.route("/")(main)
app.route("/BR")(background_remover)
app.route("/IC")(image_compressor)
app.route("/NR")(noise_reducer)
app.route("/FC")(format_converter)
app.route("/PDF")(pdf_editor)
app.route("/.well-known/appspecific/com.chrome.devtools.json")(chrome_devtools)
app.route("/favicon.ico")(favicon)
app.route("/process_background_removal", methods=["POST"])(process_background_removal)
app.route("/process_compression", methods=["POST"])(process_compression)
app.route("/process_image_cleaning", methods=["POST"])(process_image_cleaning)
app.route("/process_image_conversion", methods=["POST"])(process_image_conversion)
app.route("/process_pdf_merge", methods=["POST"])(process_pdf_merge)
app.route("/process_pdf_edit", methods=["POST"])(process_pdf_edit)
app.route("/process_pdf_standardize", methods=["POST"])(process_pdf_standardize)
app.errorhandler(400)(bad_request)
app.errorhandler(401)(unauthorized)
app.errorhandler(403)(forbidden)
app.errorhandler(404)(not_found)
app.errorhandler(413)(request_entity_too_large)
app.errorhandler(429)(too_many_requests)
app.errorhandler(500)(internal_error)
app.errorhandler(503)(service_unavailable)
app.errorhandler(Exception)(handle_exception)


if __name__ == "__main__":
    app.run(debug=True)
