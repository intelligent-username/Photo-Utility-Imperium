# Photo Utility Imperium

![Solid Painting](./static/media/RM1.png)

## All the Essential Image Manipulation Operations in One Place

### Why use this?

All of the image manipulation methods that are integrated in this website handled on slow, ad-ridden websites with watermarks, and limited features. Often they are unreliable and fall behind a paywall past a certain point.

This project provides a solution for performing these operations offline and efficiently, with no restrictions. It is built for those who want a fast, watermark-free experience for cleaning up images for projects, presentations, or any other design-related task.

Implemented are faster, more efficient, and accessible alternatives. The UI is simple for your (and my) usage convenience. Many of the models, like those from opencv, can definetely be tuned and improved. for better results but, for most use cases, what we have now is sufficient.

## Features

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

- Python 3.8 or higher
- A code editor (like VSCode) or any other IDE to Python on
- The required libraries (see installation options below)
- Microsoft Visual C++ Redistributable

### Installation

1. **Clone the repository**  
   Download the repository to your local machine using `git clone` or a direct download.

2. **Install dependencies**  
   After cloning, open a terminal and navigate to the project directory.

   **Using Conda:**

   ```bash
   conda env create -f environment.yml
   conda activate image-utility-imperium
   ```

   Note, this will create a temporary file called `condaenv.4nfgkqjk.requirements.txt` (or something like it) when installing the dependencies, nothing to worry about.

   activate the environment so you have access to the installed packages.

   ```bash
    conda activate image-utility-imperium
   ```

   **Or, Using pip:**

   ```bash
   pip install -r requirements.txt # Or create a venv and then run this
   ```

#### Run the Flask application

In the terminal, navigate to the directory that contains app.py. Make sure your environment is activated (if using conda), then type:

```bash
python app.py
```

Note that, when running locally for the first time, it will take a while to load.

This will start a local server. You can access the application by visiting [http://127.0.0.1:5000/](http://127.0.0.1:5000/) in your browser.

### Deactivating the Environment

If you used conda, you can deactivate the environment when done:

```bash
conda deactivate
```
