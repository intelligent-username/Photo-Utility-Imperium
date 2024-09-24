# app.py  backend
import cv2
import numpy as np 
from PIL import Image
from rembg import remove

import tensorflow as tf
from tensorflow.keras.preprocessing import image as tf_image
from tensorflow.keras.applications import VGG19
from tensorflow.keras.applications.vgg19 import preprocess_input
from tensorflow.keras.models import Model
from tensorflow.keras import backend as K

from tensorflow.keras.layers import Conv2D
from tensorflow.keras.layers import UpSampling2D
from tensorflow.keras.models import Sequential

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
def page1():
    return render_template('Pages/page1.html')

@app.route('/page2')
def page2():
    return render_template('Pages/page2.html')

@app.route('/page3')
def page3():
    return render_template('Pages/page3.html')

@app.route('/page4')
def page4():
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

@app.route('/process_colorization', methods=['POST'])
def process_colorization():
    if 'file' not in request.files:
        return 'No file uploaded', 400
    file = request.files['file']
    
    img = Image.open(file.stream).convert("L")  # Convert to grayscale
    img = img.resize((256, 256))  # Resize to 256x256 as expected by the model
    img_arr = np.array(img) / 255.0  # Normalize the image

    # Load colorization model (simplified for TensorFlow)
    model = Sequential([
        Conv2D(64, (3, 3), activation='relu', padding='same', input_shape=(256, 256, 1)),
        UpSampling2D((2, 2)),
        Conv2D(128, (3, 3), activation='relu', padding='same'),
        UpSampling2D((2, 2)),
        Conv2D(3, (3, 3), activation='sigmoid', padding='same')
    ])

    # Simulate colorization (replace this with actual model usage)
    colorized_img = model.predict(np.expand_dims(img_arr, axis=0))

    # Convert back to an image
    result_image = cv2_to_pil(colorized_img[0])

    # Save result and return it
    result_io = io.BytesIO()
    result_image.save(result_io, format='PNG')
    result_io.seek(0)
    
    return send_file(result_io, mimetype='image/png')


# --- Style Transfer Function ---
@app.route('/process_style_transfer', methods=['POST'])
def process_style_transfer():
    if 'file' not in request.files:
        return 'No file uploaded', 400
    content_file = request.files['file']
    
    # Load content image
    content_image = Image.open(content_file.stream).resize((256, 256))
    content_array = np.array(content_image).astype('float32')

    # Load VGG19 model and define layers to use for style extraction
    vgg = VGG19(include_top=False, weights='imagenet')
    style_layer = vgg.get_layer('block5_conv2').output
    style_model = Model(inputs=vgg.input, outputs=style_layer)

    # Load the style image (could be a preset or upload)
    style_image = np.random.rand(256, 256, 3).astype('float32') * 255  # Placeholder

    # Perform style transfer here (simplified)
    result_image = style_transfer_function(content_array, style_image, style_model)

    # Convert to PIL and return the result
    result_image_pil = cv2_to_pil(result_image)
    result_io = io.BytesIO()
    result_image_pil.save(result_io, format='PNG')
    result_io.seek(0)
    
    return send_file(result_io, mimetype='image/png')


def style_transfer_function(content_image, style_image, model):
    """ A simplified placeholder for the style transfer logic """
    # Preprocess the content and style images
    content_image = preprocess_input(content_image)
    style_image = preprocess_input(style_image)
    
    # Example of extracting style features (needs actual implementation)
    content_features = model.predict(np.expand_dims(content_image, axis=0))
    style_features = model.predict(np.expand_dims(style_image, axis=0))

    # Placeholder result (perform the actual style transfer here)
    result = content_features * 0.6 + style_features * 0.4
    
    return result  # Modify this with the proper style transfer algorithm


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
