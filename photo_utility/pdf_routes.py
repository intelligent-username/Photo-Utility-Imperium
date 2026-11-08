"""PDF editing endpoints."""

import io
import json
import traceback

import fitz
from flask import request, send_file
from PyPDF2 import PdfReader

from photo_utility.pdf_document import merge_pdfs, process_pdf_edit_logic
from photo_utility.pdf_page_utils import create_standard_blank_pdf, ensure_unencrypted_pdf_bytes


def process_pdf_merge():
    try:
        files = [request.files[k] for k in request.files if k.startswith("file")]
        pages_between = int(request.form.get("pages_between", 0))

        file_bytes_list = [ensure_unencrypted_pdf_bytes(f.read()) for f in files]
        readers = [PdfReader(io.BytesIO(b)) for b in file_bytes_list]
        writer = merge_pdfs(readers, num_blank_pages=pages_between)

        buf = io.BytesIO()
        writer.write(buf)
        buf.seek(0)
        return send_file(buf, mimetype="application/pdf", as_attachment=True, download_name="merged.pdf")

    except Exception as e:
        print(f"Error merging PDFs: {e}")
        traceback.print_exc()
        return "Error merging PDFs", 500

def process_pdf_edit():
    try:
        file_keys = sorted(
            (k for k in request.files if k.startswith("file_")),
            key=lambda k: int(k.split("_")[1]) if k.split("_")[1].isdigit() else k,
        )
        files = [request.files[k] for k in file_keys]
        manifest = json.loads(request.form.get("manifest", "[]"))

        raw_bytes_list = [f.read() for f in files]
        file_bytes_list = [ensure_unencrypted_pdf_bytes(b) for b in raw_bytes_list]
        readers = [PdfReader(io.BytesIO(b)) for b in file_bytes_list]
        writer = process_pdf_edit_logic(readers, manifest, file_bytes_list)

        buf = io.BytesIO()
        writer.write(buf)
        buf.seek(0)
        return send_file(buf, mimetype="application/pdf", as_attachment=True, download_name="edited.pdf")

    except Exception as e:
        print(f"Error editing PDF: {e}")
        traceback.print_exc()
        return "Error editing PDF", 500

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
