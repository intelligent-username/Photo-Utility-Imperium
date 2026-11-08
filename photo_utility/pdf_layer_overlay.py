"""Shared overlay helpers for PDF layers."""

from io import BytesIO

from PyPDF2 import PdfReader
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas


def pdf_page_size(page):
    return float(page.mediabox.width), float(page.mediabox.height)


def merge_overlay(page, packet):
    """Merge a single-page reportlab overlay onto a PDF page."""
    packet.seek(0)
    overlay_reader = PdfReader(packet)
    if len(overlay_reader.pages) > 0:
        page.merge_page(overlay_reader.pages[0])
    return page


def new_overlay_page(page):
    width, height = pdf_page_size(page)
    packet = BytesIO()
    can = canvas.Canvas(packet, pagesize=(width, height))
    return packet, can


def hex_color(value):
    return HexColor(value)
