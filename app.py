from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def index():
  return render_template('Pages/main.html')

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