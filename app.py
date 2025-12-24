# app.py  backend
import warnings; warnings.simplefilter("ignore")


from PIL import Image
from rembg import remove

import cv2
import os
import io

from flask import Flask, render_template, request, send_file
from utils import *

app = Flask(__name__)

UPLOAD_FOLDER = 'static/uploads'
PROCESSED_FOLDER = 'static/processed'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)

@app.route('/')
def index():
    print("Arrived at Main Page")
    return render_template('Pages/main.html')

@app.route('/main')
def main():
    print("Arrived at Main Page")
    return render_template('Pages/main.html')

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
    
    # Ensure correct format: convert non-JPEG images to RGB first to avoid issues with transparency
    if img.mode in ("RGBA", "P"):  # If image has transparency or is in palette mode
        img = img.convert("RGB")  # Colour the image
    
    compressed_io = io.BytesIO()
    
    # Compress & save to in-memory buffer
    img.save(compressed_io, format='JPEG', quality=50)  # Compression to 50% quality, change quantity later (or allow customization)
    compressed_io.seek(0)
    
    # Return compressed image as response
    return send_file(compressed_io, mimetype='image/jpeg')

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
    cleaned_pil_img.save(processed_io, format='PNG')
    processed_io.seek(0)
    
    return send_file(processed_io, mimetype='image/png')

# Page 4
@app.route('/process_image_conversion', methods=['POST'])
def process_image_conversion():
    if 'file' not in request.files or 'output_format' not in request.form:
        return 'File or format not provided', 400
    
    file = request.files['file']
    output_format = request.form['output_format'].upper()
    
    try:
        img = Image.open(file.stream)

        # Convert to RGB if saving as PDF and mode is not RGB
        if output_format == 'PDF' and img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        processed_io = io.BytesIO()
        img.save(processed_io, format=output_format)
        processed_io.seek(0)

        if output_format == 'PDF':
            return send_file(processed_io, mimetype='application/pdf', as_attachment=True, download_name='converted.pdf')
        else:
            return send_file(processed_io, mimetype=f'image/{output_format.lower()}')

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
