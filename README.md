# Image Utility Imperium

![Solid Painting](./static/media/RM1.png)

## All the Essential Image Manipulation Operations in One Place

### Why use this?

All of the image manipulation methods that are integrated in this website handled on slow, ad-ridden websites with watermarks, and limited features. Often they are unreliable and fall behind a paywall past a certain point.

This project provides a solution for performing these operations offline and efficiently, with no restrictions. It is built for those who want a fast, watermark-free experience for cleaning up images for projects, presentations, or any other design-related task. It can be run on the web as well.

Implemented are faster, more efficient, and accessible alternatives. The UI is simple for your (and my) usage convenience.

## Currently Implemented Features

- **Background Remover**  
  Remove backgrounds from images effortlessly.
  
- **Image Compressor**  
  Compress images by reducing their resolution while maintaining quality and essential contents.
  
- **Noise Reducer**  
  Reduce image noise to create a cleaner, more professional look.
  
- **File Format Converter**  
  Convert an image file to any format you need (PNG, JPEG, etc.).

- **PDF Merger**  
  Merge PDFs and add pages between them.
  
## Requirements

To run this project locally, you need to have:

- Python 3.0 or higher
- A code editor (like VSCode) or any other IDE to Python on
- The required libraries (from readme.txt (see step 2 below))
- Microsoft Visual C++ Redistributable

### Installation

1. **Clone the repository**  
   Download the repository to your local machine using `git clone` or a direct download.

2. **Install dependencies**  
   After cloning, open a terminal, navigate to the project directory, and run:

   ```bash
        pip install -r requirements.txt

This will install all required packages system-wide.

#### Run the Flask application

In the terminal, navigate to the directory that contains app.py. Then, type
    ```
        flask run
    ```

This will start a local web server. You can access the application by visiting <http://127.0.0.1:5000> in your browser.
