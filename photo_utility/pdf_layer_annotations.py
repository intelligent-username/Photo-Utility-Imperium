"""Text annotation overlays for PDF pages."""

from photo_utility.pdf_layer_overlay import (
    hex_color,
    merge_overlay,
    new_overlay_page,
    pdf_page_size,
)


def _draw_wrapped_text(can, text, x, y, font_name, font_size, width):
    available_width = max(20.0, width - x - 8.0)
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


def _font_name(font_family, bold):
    family = (font_family or '').lower()
    if 'times' in family or 'serif' in family:
        return "Times-Bold" if bold else "Times-Roman"
    if 'courier' in family or 'mono' in family:
        return "Courier-Bold" if bold else "Courier"
    return "Helvetica-Bold" if bold else "Helvetica"


def _draw_runs(can, runs, x, y, font_size, color_hex, font_family):
    cur_x = x
    cur_y = y - font_size
    line_height = font_size * 1.15
    for r in runs:
        r_text = r.get('text', '')
        if not r_text:
            continue
        font_name = _font_name(font_family, bool(r.get('bold', False)))
        can.setFillColor(hex_color(color_hex))
        can.setFont(font_name, font_size)
        for p_idx, part in enumerate(r_text.split('\n')):
            if p_idx > 0:
                cur_x = x
                cur_y -= line_height
            if part:
                can.drawString(cur_x, cur_y, part)
                cur_x += can.stringWidth(part, font_name, font_size)


def apply_text_annotations(page, annotations):
    """Overlays text annotations onto a PDF page using reportlab."""
    if not annotations:
        return page

    width, height = pdf_page_size(page)
    packet, can = new_overlay_page(page)

    for ann in annotations:
        text = ann.get('text', '')
        if not text:
            continue

        x = float(ann.get('xRatio', 0.0)) * width
        y = (1.0 - float(ann.get('yRatio', 0.0))) * height
        font_size = int(ann.get('fontSize', 16))
        color_hex = ann.get('color', '#3b82f6')
        is_bold = bool(ann.get('bold', False))
        font_family = ann.get('fontFamily', '')
        runs = ann.get('runs')

        if runs and isinstance(runs, list) and len(runs) > 0:
            _draw_runs(can, runs, x, y, font_size, color_hex, font_family)
        else:
            font_name = _font_name(font_family, is_bold)
            can.setFillColor(hex_color(color_hex))
            can.setFont(font_name, font_size)
            _draw_wrapped_text(can, text, x, y, font_name, font_size, width)

    can.save()
    return merge_overlay(page, packet)
