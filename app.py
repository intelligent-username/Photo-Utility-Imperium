# app.py  backend
import warnings; warnings.simplefilter("ignore")


from PIL import Image
from rembg import remove

import cv2
import os
import io

from flask import Flask, render_template, request, send_file, jsonify
from utils import pil_to_cv2, cv2_to_pil, merge_pdfs, process_pdf_edit_logic, convert_to_standard_pdf
import base64
import fitz
import json
from PyPDF2 import PdfReader

app = Flask(__name__)

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/')
def index():
    print("Arrived at Main Page")
    return render_template('Pages/main.html')

@app.route('/main')
def main():
    print("Arrived at Main Page")
    return render_template('Pages/main.html')

# Silence Chrome DevTools well-known request
@app.route('/.well-known/appspecific/com.chrome.devtools.json')
def chrome_devtools():
    return '', 204

@app.route('/favicon.ico')
def favicon():
    return '', 204

# Routes
@app.route('/BR')
def sample_page1():
    print("Background Remover Page")
    return render_template('Pages/BR.html')

@app.route('/IC')
def sample_page2():
    print("Image Compressor")
    return render_template('Pages/IC.html')

@app.route('/NR')
def sample_page3():
    print("Noise Reduction Page")
    return render_template('Pages/NR.html')

@app.route('/FC')
def sample_page4():
    print("Format Converter Page")
    return render_template('Pages/FC.html')

@app.route('/PDF')
def sample_page5():
    print("PDF Merger Page")
    return render_template('Pages/PDF.html')

# Page 1
@app.route('/process_background_removal', methods=['POST'])
def process_background_removal():
    if 'file' not in request.files:
        return 'No file uploaded', 400
    file = request.files['file']

    img = Image.open(file.stream)
    output = remove(img)

    processed_io = io.BytesIO()
    output.save(processed_io, format='PNG')
    processed_io.seek(0)

    return send_file(processed_io, mimetype='image/png')  

# Page 2
@app.route('/process_compression', methods=['POST'])
def process_compression():
    if 'file' not in request.files:
        return 'No file uploaded', 400
    
    file = request.files['file']
    img = Image.open(file.stream)
    orig_format = (img.format or 'JPEG').upper()
    if orig_format == 'JPG':
        orig_format = 'JPEG'
    
    compressed_io = io.BytesIO()
    
    if orig_format == 'PNG':
        if img.mode not in ("RGB", "RGBA", "P"):
            img = img.convert("RGBA")
        img.save(compressed_io, format='PNG', optimize=True)
        mimetype = 'image/png'
    elif orig_format == 'WEBP':
        img.save(compressed_io, format='WEBP', lossless=True, method=6)
        mimetype = 'image/webp'
    elif orig_format == 'JPEG':
        quality = int(request.form.get('quality', 50))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.save(compressed_io, format='JPEG', quality=quality)
        mimetype = 'image/jpeg'
    else:
        quality = int(request.form.get('quality', 50))
        try:
            img.save(compressed_io, format=orig_format, quality=quality)
            mimetype = f'image/{orig_format.lower()}'
        except Exception:
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(compressed_io, format='JPEG', quality=quality)
            mimetype = 'image/jpeg'
    
    compressed_io.seek(0)
    return send_file(compressed_io, mimetype=mimetype)

# Page 3
@app.route('/process_image_cleaning', methods=['POST'])
def process_image_cleaning():
    if 'file' not in request.files:
        return 'No file uploaded', 400
    
    file = request.files['file']
    img = Image.open(file.stream)
    
    # Convert image to OpenCV format
    cv_img = pil_to_cv2(img)
    
    # Apply Gaussian Blur, reduce noise
    cleaned_img = cv2.GaussianBlur(cv_img, (5, 5), 0)
    
    # Convert back to PIL for output
    cleaned_pil_img = cv2_to_pil(cleaned_img)
    
    processed_io = io.BytesIO()

    # Preserve original image format (Pillow format key for JPEG is 'JPEG')
    fmt = (img.format or 'PNG').upper()
    if fmt in ('JPG', 'JPEG'):
        if cleaned_pil_img.mode in ("RGBA", "P", "LA"):
            cleaned_pil_img = cleaned_pil_img.convert("RGB")
        out_format = 'JPEG'
        mimetype = 'image/jpeg'
    else:
        out_format = fmt
        mimetype = f'image/{fmt.lower()}'

    cleaned_pil_img.save(processed_io, format=out_format)
    processed_io.seek(0)
    
    return send_file(processed_io, mimetype=mimetype)

# Page 4
@app.route('/process_image_conversion', methods=['POST'])
def process_image_conversion():
    if 'file' not in request.files or 'output_format' not in request.form:
        return 'File or format not provided', 400
    
    file = request.files['file']
    output_format = request.form['output_format'].upper()
    page_size = request.form.get('page_size', '').strip()
    
    file_bytes = file.read()
    is_pdf_input = file.content_type == 'application/pdf' or (bool(file.filename) and file.filename.lower().endswith('.pdf'))

    try:
        if output_format == 'PDF':
            if page_size:
                pdf_data = convert_to_standard_pdf(file_bytes, page_size, is_pdf_input=is_pdf_input)
            else:
                if is_pdf_input:
                    pdf_data = file_bytes
                else:
                    img = Image.open(io.BytesIO(file_bytes))
                    if img.mode in ("RGBA", "P", "LA"):
                        img = img.convert("RGB")
                    processed_io = io.BytesIO()
                    img.save(processed_io, format='PDF')
                    pdf_data = processed_io.getvalue()

            return send_file(
                io.BytesIO(pdf_data),
                mimetype='application/pdf',
                as_attachment=True,
                download_name='converted.pdf'
            )
        else:
            if is_pdf_input:
                doc = fitz.open(stream=file_bytes, filetype="pdf")
                if len(doc) > 0:
                    pix = doc[0].get_pixmap()
                    img = Image.open(io.BytesIO(pix.tobytes()))
                else:
                    return 'PDF is empty', 400
            else:
                img = Image.open(io.BytesIO(file_bytes))

            # Ensure color mode compatibility for output formats (EPS, JPEG, PPM, etc.)
            if output_format in ('JPEG', 'JPG', 'EPS', 'PPM') and img.mode in ('RGBA', 'P', 'LA'):
                img = img.convert('RGB')
            elif output_format == 'EPS' and img.mode not in ('RGB', '1', 'L'):
                img = img.convert('RGB')

            processed_io = io.BytesIO()
            if output_format in ('TIFF', 'TIF'):
                img.save(processed_io, format='TIFF', compression='tiff_lzw')
            else:
                img.save(processed_io, format=output_format)
            processed_io.seek(0)

            # Generate preview thumbnail for formats browsers cannot natively render
            preview_b64 = None
            if output_format in ('EPS', 'TIFF', 'TIF', 'PPM'):
                try:
                    p_img = img.copy()
                    p_img.thumbnail((1200, 1200))
                    if p_img.mode in ('RGBA', 'P', 'LA'):
                        p_img = p_img.convert('RGB')
                    p_io = io.BytesIO()
                    p_img.save(p_io, format='JPEG', quality=85)
                    preview_b64 = "data:image/jpeg;base64," + base64.b64encode(p_io.getvalue()).decode('utf-8')
                except Exception as pe:
                    print(f"Preview generation warning: {pe}")

            mime_map = {
                'EPS': 'application/postscript',
                'TIFF': 'image/tiff',
                'TIF': 'image/tiff',
                'PPM': 'image/x-portable-pixmap',
                'JPEG': 'image/jpeg',
                'JPG': 'image/jpeg',
                'PNG': 'image/png',
                'WEBP': 'image/webp',
                'GIF': 'image/gif',
                'BMP': 'image/bmp'
            }
            mimetype = mime_map.get(output_format, f'image/{output_format.lower()}')

            if request.form.get('return_json') == 'true' or preview_b64:
                file_b64 = base64.b64encode(processed_io.getvalue()).decode('utf-8')
                return jsonify({
                    'success': True,
                    'file_b64': file_b64,
                    'preview_b64': preview_b64,
                    'mimetype': mimetype,
                    'filename': f'converted.{output_format.lower()}'
                })

            return send_file(
                processed_io,
                mimetype=mimetype,
                as_attachment=True,
                download_name=f'converted.{output_format.lower()}'
            )

    except IOError:
        return 'Error: File format not supported or invalid image', 400
    except Exception as e:
        print(f"Error processing image conversion: {e}")
        return 'Error processing image', 500

# Page 5
@app.route('/process_pdf_merge', methods=['POST'])
def process_pdf_merge():
    try:
        files = [request.files[key] for key in request.files if key.startswith('file')]
        pages_between = int(request.form.get('pages_between', 0))

        readers = [PdfReader(file.stream) for file in files]
        merged_writer = merge_pdfs(readers, num_blank_pages=pages_between)  # Pass pages_between to utility function

        output_io = io.BytesIO()
        merged_writer.write(output_io)
        output_io.seek(0)

        return send_file(output_io, mimetype='application/pdf', as_attachment=True, download_name='merged.pdf')

    except Exception as e:
        print(f"Error merging PDFs: {e}")
        return 'Error merging PDFs', 500

@app.route('/process_pdf_edit', methods=['POST'])
def process_pdf_edit():
    try:
        file_keys = sorted([k for k in request.files.keys() if k.startswith('file_')])
        files = [request.files[k] for k in file_keys]
        manifest_raw = request.form.get('manifest', '[]')
        manifest = json.loads(manifest_raw)

        readers = [PdfReader(f.stream) for f in files]
        edited_writer = process_pdf_edit_logic(readers, manifest)

        output_io = io.BytesIO()
        edited_writer.write(output_io)
        output_io.seek(0)

        return send_file(output_io, mimetype='application/pdf', as_attachment=True, download_name='edited.pdf')

    except Exception as e:
        print(f"Error editing PDF: {e}")
        return 'Error editing PDF', 500

# Error Handler Routes
@app.errorhandler(404)
def not_found_error(error):
    return render_template('404.html'), 404

@app.errorhandler(500)
def internal_error(error):
    return render_template('500.html'), 500

@app.errorhandler(400)
def bad_request(error):
    return render_template('400.html'), 400

@app.errorhandler(Exception)
def handle_exception(e):
    return render_template('500.html'), 500

from flask import render_template

@app.errorhandler(403)
def forbidden(e):
    return render_template('error.html', code=403, title='Forbidden',
                           message="You don't have permission to access this resource."), 403

@app.errorhandler(503)
def service_unavailable(e):
    return render_template('error.html', code=503, title='Service Unavailable',
                           message="The service is temporarily unavailable. Try again later."), 503

@app.errorhandler(401)
def unauthorized(e):
    return render_template('error.html', code=401, title='Unauthorized',
                           message="Please sign in to continue."), 401

@app.errorhandler(429)
def too_many_requests(e):
    response = render_template('error.html', code=429, title='Too Many Requests',
                               message="You're sending requests too quickly. Please try again later.")
    return response, 429

# Just run the app
if __name__ == '__main__':
    app.run(debug=True)
