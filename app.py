from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for
import os
import json
from werkzeug.utils import secure_filename

app = Flask(__name__)

IMAGE_FOLDER = 'image'
ANNOTATION_FOLDER = 'annotations'
app.config['UPLOAD_FOLDER'] = IMAGE_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB

@app.route('/')
def index():
    images = os.listdir(IMAGE_FOLDER)
    return render_template('index.html', images=images)

@app.route('/image/<filename>')
def get_image(filename):
    return send_from_directory(IMAGE_FOLDER, filename)

@app.route('/upload', methods=['POST'])
def upload_image():
    image = request.files.get('image')
    annotation = request.files.get('annotation')
    if not image:
        return redirect(url_for('index'))

    image_filename = secure_filename(image.filename)
    image.save(os.path.join(app.config['UPLOAD_FOLDER'], image_filename))

    if annotation:
        name_without_ext = os.path.splitext(image_filename)[0]
        annotation_filename = f"{name_without_ext}.json"
        annotation.save(os.path.join(ANNOTATION_FOLDER, annotation_filename))

    return redirect(url_for('index', selected=image_filename))

@app.route('/load_annotation/<filename>')
def load_annotation(filename):
    name_without_ext = os.path.splitext(filename)[0]
    annotation_path = os.path.join(ANNOTATION_FOLDER, f"{name_without_ext}.json")
    if os.path.exists(annotation_path):
        with open(annotation_path) as f:
            data = json.load(f)
        return jsonify(data)
    return jsonify({"shapes": []})

@app.route('/save', methods=['POST'])
def save_annotation():
    data = request.get_json()
    filename = data['filename']
    annotation = data['annotation']

    name_without_ext = os.path.splitext(filename)[0]
    with open(os.path.join(ANNOTATION_FOLDER, f"{name_without_ext}.json"), 'w') as f:
        json.dump(annotation, f)
    return jsonify({"status": "success"})

if __name__ == '__main__':
    os.makedirs(ANNOTATION_FOLDER, exist_ok=True)
    os.makedirs(IMAGE_FOLDER, exist_ok=True)
    app.run(debug=True)
