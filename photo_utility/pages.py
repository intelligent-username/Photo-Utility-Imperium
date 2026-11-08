"""Page views and browser utility endpoints."""

from flask import render_template


def main():
    return render_template("Pages/main.html")

def background_remover():
    return render_template("Pages/BR.html")

def image_compressor():
    return render_template("Pages/IC.html")

def noise_reducer():
    return render_template("Pages/NR.html")

def format_converter():
    return render_template("Pages/FC.html")

def pdf_editor():
    return render_template("Pages/PDF.html")

def chrome_devtools():
    return "", 204

def favicon():
    return "", 204
