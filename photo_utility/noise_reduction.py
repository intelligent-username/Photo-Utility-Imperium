"""Image noise reduction endpoint."""

import io

import cv2
import numpy as np
from flask import request, send_file
from PIL import Image

from photo_utility.image_utils import cv2_to_pil, pil_to_cv2


def process_image_cleaning():
    if "file" not in request.files:
        return "No file uploaded", 400

    file = request.files["file"]
    img = Image.open(file.stream)
    level = request.form.get("denoise_level", "2")

    cv_img = pil_to_cv2(img)

    if level == "1":
        cleaned_cv = cv2.GaussianBlur(cv_img, (5, 5), 0)
    elif level == "2":
        # Medium: bilateral filter — smooths noise while preserving edges
        if len(cv_img.shape) == 3 and cv_img.shape[2] == 4:
            bgr = cv_img[:, :, :3]
            alpha = cv_img[:, :, 3]
            denoised = cv2.bilateralFilter(bgr, d=9, sigmaColor=50, sigmaSpace=50)
            cleaned_cv = np.dstack((denoised, alpha))
        else:
            cleaned_cv = cv2.bilateralFilter(cv_img, d=9, sigmaColor=50, sigmaSpace=50)
    else:
        try:
            if len(cv_img.shape) == 3 and cv_img.shape[2] == 4:
                bgr = cv_img[:, :, :3]
                alpha = cv_img[:, :, 3]
                denoised = cv2.fastNlMeansDenoisingColored(bgr, None, h=6, hColor=6, templateWindowSize=7, searchWindowSize=15)
                cleaned_cv = np.dstack((denoised, alpha))
            elif len(cv_img.shape) == 3 and cv_img.shape[2] == 3:
                cleaned_cv = cv2.fastNlMeansDenoisingColored(cv_img, None, h=6, hColor=6, templateWindowSize=7, searchWindowSize=15)
            else:
                cleaned_cv = cv2.fastNlMeansDenoising(cv_img, None, h=6, templateWindowSize=7, searchWindowSize=15)
        except Exception:
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
