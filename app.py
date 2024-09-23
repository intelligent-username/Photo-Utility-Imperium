# app.py  backend
import cv2
import numpy as np 
from PIL import Image
from rembg import remove

import os
import io

from flask import Flask, render_template, request, send_file
from perspective_fixer import unwarp, order_points

app = Flask(__name__)

UPLOAD_FOLDER = 'static/uploads'
PROCESSED_FOLDER = 'static/processed'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)

@app.route('/')
def index():
    return render_template('Pages/main.html')

@app.route('/main')
def main():
    return render_template('Pages/main.html')

# Routes for each feature page
@app.route('/page1')
def sample_page1():
    return render_template('Pages/page1.html')

@app.route('/page2')
def sample_page2():
    return render_template('Pages/page2.html')

@app.route('/page3')
def sample_page3():
    return render_template('Pages/page3.html')

@app.route('/page4')
def sample_page4():
    return render_template('Pages/page4.html')

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

@app.route('/process_compression', methods=['POST'])
def process_compression():
    if 'file' not in request.files:
        return 'No file uploaded', 400
    
    file = request.files['file']
    img = Image.open(file.stream)
    
    # Ensure correct format: convert non-JPEG images to RGB first to avoid issues with transparency
    if img.mode in ("RGBA", "P"):  # If image has transparency or is in palette mode
        img = img.convert("RGB")  # JPEG does not support transparency
    
    compressed_io = io.BytesIO()
    
    # Compress and save to in-memory buffer
    img.save(compressed_io, format='JPEG', quality=50)  # Compression to 50% quality
    compressed_io.seek(0)
    
    # Return the compressed image as a response
    return send_file(compressed_io, mimetype='image/jpeg')

# Convert PIL image to OpenCV format
def pil_to_cv2(pil_image):
    return cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)

# Convert OpenCV image to PIL format
def cv2_to_pil(cv2_image):
    return Image.fromarray(cv2.cvtColor(cv2_image, cv2.COLOR_BGR2RGB))

@app.route('/process_perspective_fix', methods=['POST'])
def process_perspective_fix():
    if 'file' not in request.files:
        return 'No file uploaded', 400
    
    file = request.files['file']

    try:
        img = Image.open(file.stream)
        
        cv_img = pil_to_cv2(img)

        fixed_img = unwarp(cv_img)

        fixed_pil_img = cv2_to_pil(fixed_img)

        fixed_io = io.BytesIO()
        fixed_pil_img.save(fixed_io, format='JPEG')
        fixed_io.seek(0)

        return send_file(fixed_io, mimetype='image/jpeg')

    except Exception as e:
        print(f"Error processing perspective fix: {e}")
        return 'Error processing image', 500


@app.errorhandler(404)
def not_found_error(error):
    return render_template('404.html'), 404

@app.errorhandler(500)
def internal_error(error):
    return render_template('500.html'), 500

@app.errorhandler(Exception)
def handle_exception(e):
    return render_template('500.html'), 500

if __name__ == '__main__':
    app.run(debug=True)
