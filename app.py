# app.py, the backend
import os
import io
from flask import Flask, render_template, request, send_file
from PIL import Image, ImageOps
from removebg import RemoveBg

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
    
    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(filepath)
    
    try:
        rmbg = RemoveBg()
        processed_filepath = rmbg.remove_background_from_img_file(filepath)
        
        return send_file(processed_filepath, mimetype='image/png')
    except Exception as e:
        return str(e), 500


@app.route('/process_compression', methods=['POST'])
def process_compression():
    if 'file' not in request.files:
        return 'No file uploaded', 400
    file = request.files['file']
    
    img = Image.open(file.stream)
    compressed_io = io.BytesIO()
    img.save(compressed_io, format='JPEG', quality=50)  # Compress quality to 50%
    compressed_io.seek(0)
    
    return send_file(compressed_io, mimetype='image/jpeg')

@app.route('/process_perspective_fix', methods=['POST'])
def process_perspective_fix():
    if 'file' not in request.files:
        return 'No file uploaded', 400
    file = request.files['file']
    
    img = Image.open(file.stream)
    
    corrected_img = ImageOps.exif_transpose(img)
    
    corrected_io = io.BytesIO()
    corrected_img.save(corrected_io, format='JPEG')
    corrected_io.seek(0)
    
    return send_file(corrected_io, mimetype='image/jpeg')

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
