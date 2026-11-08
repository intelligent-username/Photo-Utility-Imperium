"""Redaction and replacement for PDF page content."""

from io import BytesIO
import traceback

import fitz
from PyPDF2 import PdfReader, PdfWriter

from photo_utility.pdf_layer_overlay import (
    merge_overlay,
    new_overlay_page,
    pdf_page_size,
)


def _rect_ratios(item):
    return (
        float(item.get('leftRatio', 0.0)),
        float(item.get('topRatio', 0.0)),
        float(item.get('widthRatio', 0.0)),
        float(item.get('heightRatio', 0.0)),
    )


def _whiteout_fallback(page, whiteouts):
    packet, can = new_overlay_page(page)
    width, height = pdf_page_size(page)
    can.setFillColorRGB(1.0, 1.0, 1.0)
    can.setStrokeColorRGB(1.0, 1.0, 1.0)
    for w in whiteouts:
        left_ratio, top_ratio, width_ratio, height_ratio = _rect_ratios(w)
        can.rect(
            left_ratio * width,
            (1.0 - top_ratio - height_ratio) * height,
            width_ratio * width,
            height_ratio * height,
            fill=1,
            stroke=0,
        )
    can.save()
    return merge_overlay(page, packet)


def apply_whiteouts(page, whiteouts):
    """Draws solid white rectangles over specified regions of a PDF page,
    permanently nuking/redacting text that is FULLY covered while leaving
    partially covered text intact and highlightable.
    """
    if not whiteouts:
        return page

    writer = PdfWriter()
    writer.add_page(page)
    tmp_io = BytesIO()
    writer.write(tmp_io)
    tmp_io.seek(0)

    try:
        doc = fitz.open(stream=tmp_io.getvalue(), filetype="pdf")
        doc_page = doc[0]
        page_w = doc_page.rect.width
        page_h = doc_page.rect.height
        for w in whiteouts:
            left_ratio, top_ratio, width_ratio, height_ratio = _rect_ratios(w)
            doc_page.add_redact_annot(
                fitz.Rect(
                    left_ratio * page_w,
                    top_ratio * page_h,
                    (left_ratio + width_ratio) * page_w,
                    (top_ratio + height_ratio) * page_h,
                ),
                fill=(1, 1, 1),
            )
        doc_page.apply_redactions()
        out_io = BytesIO(doc.tobytes())
        doc.close()
        return PdfReader(out_io).pages[0]
    except Exception as e:
        print(f"Error applying whiteout with PyMuPDF: {e}")
        return _whiteout_fallback(page, whiteouts)


def _query_span_properties(doc_page, edit, x0, y0, x1, y1):
    try:
        clip_r = fitz.Rect(
            max(0.0, x0 - 2), max(0.0, y0 - 2),
            min(doc_page.rect.width, x1 + 2), min(doc_page.rect.height, y1 + 2),
        )
        text_dict = doc_page.get_text("dict", clip=clip_r)
        orig_spans = [
            s for b in text_dict.get("blocks", [])
            for l in b.get("lines", [])
            for s in l.get("spans", [])
            if s.get("text", "").strip()
        ]
        if not orig_spans:
            return
        orig_spans.sort(key=lambda s: len(s.get("text", "")), reverse=True)
        prim = orig_spans[0]
        if prim.get("font"):
            edit['origPdfFont'] = prim["font"]
        if prim.get("size") and float(prim["size"]) > 0:
            edit['origPdfSize'] = float(prim["size"])
        if "color" in prim and prim["color"] is not None:
            edit['origPdfColor'] = prim["color"]
        if "flags" in prim:
            edit['origPdfFlags'] = prim["flags"]
        if "bbox" in prim:
            edit['origBbox'] = prim["bbox"]
    except Exception as ex:
        print(f"Error querying original PDF span properties: {ex}")


def _font_name_for_edit(font_cand, flags, bold_flag):
    fc_lower = font_cand.lower()
    is_italic = bool(flags & 4) or ('italic' in fc_lower) or ('oblique' in fc_lower)
    is_serif = ('times' in fc_lower or 'serif' in fc_lower or 'roman' in fc_lower
                or 'georgia' in fc_lower or 'cambria' in fc_lower)
    is_mono = ('courier' in fc_lower or 'mono' in fc_lower or 'consolas' in fc_lower)
    if is_serif:
        if bold_flag and is_italic: return "tibi"
        if bold_flag: return "tibo"
        if is_italic: return "tiit"
        return "tiro"
    if is_mono:
        if bold_flag and is_italic: return "cobi"
        if bold_flag: return "cobo"
        if is_italic: return "coit"
        return "cour"
    if bold_flag and is_italic: return "hebi"
    if bold_flag: return "hebo"
    if is_italic: return "heit"
    return "helv"


def _edit_color(edit):
    if 'origPdfColor' in edit and edit['origPdfColor'] is not None:
        c = int(edit['origPdfColor'])
        return (((c >> 16) & 255) / 255.0, ((c >> 8) & 255) / 255.0, (c & 255) / 255.0)
    color_hex = str(edit.get('color', '#000000')).lstrip('#')
    if len(color_hex) == 6:
        return tuple(int(color_hex[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (0.0, 0.0, 0.0)


def _insert_text(doc_page, start_pt, text_str, font_name, f_size, c_rgb, extra_space):
    if extra_space <= 0.05 or ' ' not in text_str:
        try:
            doc_page.insert_text(start_pt, text_str, fontsize=f_size, fontname=font_name, color=c_rgb)
        except Exception:
            fallback = "hebo" if "bo" in font_name else "helv"
            doc_page.insert_text(start_pt, text_str, fontsize=f_size, fontname=fallback, color=c_rgb)
        try:
            return fitz.get_text_length(text_str, fontname=font_name, fontsize=f_size)
        except Exception:
            return len(text_str) * (f_size * 0.5)

    words = text_str.split(' ')
    cx = start_pt.x
    std_sp_w = fitz.get_text_length(' ', fontname=font_name, fontsize=f_size)
    for w_idx, word in enumerate(words):
        if word:
            try:
                doc_page.insert_text(fitz.Point(cx, start_pt.y), word, fontsize=f_size, fontname=font_name, color=c_rgb)
            except Exception:
                fallback = "hebo" if "bo" in font_name else "helv"
                doc_page.insert_text(fitz.Point(cx, start_pt.y), word, fontsize=f_size, fontname=fallback, color=c_rgb)
            cx += fitz.get_text_length(word, fontname=font_name, fontsize=f_size)
        if w_idx < len(words) - 1:
            cx += std_sp_w + extra_space
    return cx - start_pt.x


def apply_text_edits(page, text_edits):
    """Directly redacts pre-existing text areas and inserts replacement text
    at the exact coordinates and baseline using the original font, size, and color.
    """
    if not text_edits:
        return page
    edits_list = list(text_edits.values()) if isinstance(text_edits, dict) else text_edits
    if not edits_list:
        return page

    writer = PdfWriter()
    writer.add_page(page)
    tmp_io = BytesIO()
    writer.write(tmp_io)
    tmp_io.seek(0)

    try:
        doc = fitz.open(stream=tmp_io.getvalue(), filetype="pdf")
        doc_page = doc[0]
        page_w = doc_page.rect.width
        page_h = doc_page.rect.height

        for edit in edits_list:
            x0 = float(edit.get('leftRatio', 0.0)) * page_w
            y0 = float(edit.get('topRatio', 0.0)) * page_h
            x1 = min(page_w, (float(edit.get('leftRatio', 0.0)) + float(edit.get('widthRatio', 0.0))) * page_w)
            y1 = min(page_h, (float(edit.get('topRatio', 0.0)) + float(edit.get('heightRatio', 0.0))) * page_h)
            _query_span_properties(doc_page, edit, x0, y0, x1, y1)
            doc_page.add_redact_annot(
                fitz.Rect(max(0.0, x0 - 1.0), max(0.0, y0 - 1.2), min(page_w, x1 + 1.0), min(page_h, y1 + 1.2)),
                fill=(1, 1, 1),
            )
        doc_page.apply_redactions()

        for edit in edits_list:
            new_text = edit.get('text', '')
            if not new_text or not new_text.strip():
                continue
            font_size = float(edit.get('origPdfSize') or edit.get('fontSize') or 12.0)
            font_cand = edit.get('origPdfFont') or edit.get('rawFontName') or edit.get('fontFamily', '')
            flags = int(edit.get('origPdfFlags') or 0)
            color_rgb = _edit_color(edit)
            x0 = float(edit.get('leftRatio', 0.0)) * page_w
            y0 = float(edit.get('topRatio', 0.0)) * page_h
            y1 = (float(edit.get('topRatio', 0.0)) + float(edit.get('heightRatio', 0.0))) * page_h
            if 'origBbox' in edit and edit['origBbox']:
                ob = edit['origBbox']
                x0 = ob[0]
                baseline_y = ob[3] - (font_size * 0.15)
            else:
                baseline_y = y1 - (font_size * 0.18)
            word_spacing = float(edit.get('wordSpacing') or 0.0)
            runs = edit.get('runs')

            if runs and isinstance(runs, list) and len(runs) > 0:
                cur_x = x0
                for r in runs:
                    r_text = r.get('text', '')
                    if not r_text:
                        continue
                    font_name = _font_name_for_edit(font_cand, flags, bool(r.get('bold', False)))
                    cur_x += _insert_text(doc_page, fitz.Point(cur_x, baseline_y), r_text, font_name, font_size, color_rgb, word_spacing)
            else:
                if 'bold' in edit and edit['bold'] is not None:
                    is_bold = bool(edit['bold'])
                else:
                    is_bold = bool(flags & 2) or ('bold' in font_cand.lower()) or ('black' in font_cand.lower())
                font_name = _font_name_for_edit(font_cand, flags, is_bold)
                _insert_text(doc_page, fitz.Point(x0, baseline_y), new_text, font_name, font_size, color_rgb, word_spacing)

        out_io = BytesIO(doc.tobytes())
        doc.close()
        return PdfReader(out_io).pages[0]
    except Exception as e:
        print(f"Error applying text edits with PyMuPDF: {e}")
        traceback.print_exc()
        return page
