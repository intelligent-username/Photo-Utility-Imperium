"""Signature overlays for PDF pages."""

import base64
from io import BytesIO

from reportlab.lib.utils import ImageReader

from photo_utility.pdf_layer_overlay import (
    hex_color,
    merge_overlay,
    new_overlay_page,
    pdf_page_size,
)


def _apply_image_signature(page, layer, x, y, width, height):
    data_url = layer.get('dataUrl', '')
    if not data_url or ',' not in data_url:
        return None
    try:
        _, encoded = data_url.split(',', 1)
        img_reader = ImageReader(BytesIO(base64.b64decode(encoded)))
        packet, can = new_overlay_page(page)
        can.drawImage(img_reader, x, y, width=width, height=height, mask='auto')
        can.save()
        return merge_overlay(page, packet)
    except Exception as e:
        print(f"Error merging signature dataUrl: {e}")
        return None


def apply_signature_layer(page, layer):
    """Overlays a signature image or text onto a PDF page using reportlab."""
    if not layer:
        return page

    width, height = pdf_page_size(page)
    x = float(layer.get('leftRatio', 0.0)) * width
    w = float(layer.get('widthRatio', 0.3)) * width
    h = float(layer.get('heightRatio', 0.1)) * height
    y = (1.0 - float(layer.get('topRatio', 0.0)) - float(layer.get('heightRatio', 0.1))) * height

    signed_page = _apply_image_signature(page, layer, x, y, w, h)
    if signed_page is not None:
        return signed_page

    text = layer.get('text', '')
    if not text:
        return page

    packet, can = new_overlay_page(page)
    font_family = layer.get('fontFamily', '')
    is_bold = bool(layer.get('bold', False))
    if 'times' in font_family.lower():
        font_name = "Times-Bold" if is_bold else "Times-Roman"
    else:
        font_name = "Helvetica-Bold" if is_bold else "Helvetica"
    font_size = int(layer.get('fontSize', 0)) or max(10, int(h * 0.7))
    can.setFillColor(hex_color(layer.get('color', '#000000')))
    can.setFont(font_name, font_size)
    can.drawString(x, y + (h * 0.2), text)
    can.save()
    return merge_overlay(page, packet)
