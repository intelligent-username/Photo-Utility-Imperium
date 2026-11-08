"""Vector layers for PDF pages."""

from photo_utility.pdf_layer_overlay import (
    hex_color,
    merge_overlay,
    new_overlay_page,
    pdf_page_size,
)


def apply_line_layer(page, layer):
    """Draws a vector line onto a PDF page using reportlab."""
    if not layer:
        return page

    width, height = pdf_page_size(page)
    x1 = float(layer.get('x1Ratio', 0.0)) * width
    y1 = (1.0 - float(layer.get('y1Ratio', 0.0))) * height
    x2 = float(layer.get('x2Ratio', 0.0)) * width
    y2 = (1.0 - float(layer.get('y2Ratio', 0.0))) * height

    packet, can = new_overlay_page(page)
    can.setStrokeColor(hex_color(layer.get('color', '#000000')))
    can.setLineWidth(float(layer.get('thickness', 2)))
    can.setLineCap(0)
    can.line(x1, y1, x2, y2)
    can.save()
    return merge_overlay(page, packet)


def apply_crop_box(page, crop_box):
    """Applies a crop box to a PDF page using PyPDF2."""
    if not crop_box:
        return page

    width, height = pdf_page_size(page)
    left = float(crop_box.get('leftRatio', 0.0)) * width
    top = (1.0 - float(crop_box.get('topRatio', 0.0))) * height
    right = left + (float(crop_box.get('widthRatio', 1.0)) * width)
    bottom = top - (float(crop_box.get('heightRatio', 1.0)) * height)

    page.cropbox.lower_left = (max(0.0, left), max(0.0, bottom))
    page.cropbox.upper_right = (min(width, right), min(height, top))
    return page
