let canvas = new fabric.Canvas('canvas');
let currentImage = '';

function loadImage(filename) {
    if (!filename) return;
    currentImage = filename;
    canvas.clear();
    canvas.setBackgroundImage(null, canvas.renderAll.bind(canvas));

    const imageUrl = `/image/${filename}`;

    fabric.Image.fromURL(imageUrl, function(img) {
        img.scaleToWidth(800);
        canvas.setBackgroundImage(img, () => {
            canvas.renderAll();
            loadAnnotation(filename);
        });
    }, {
        crossOrigin: 'anonymous'
    });
}

function loadAnnotation(filename) {
    fetch(`/load_annotation/${filename}`)
        .then(res => res.json())
        .then(data => {
            data.shapes.forEach(shape => {
                const [x1, y1] = shape.points[0];
                const [x2, y2] = shape.points[1];
                const rect = new fabric.Rect({
                    left: x1,
                    top: y1,
                    width: x2 - x1,
                    height: y2 - y1,
                    fill: 'rgba(0,0,255,0.3)',
                    stroke: 'blue',
                    strokeWidth: 2,
                    selectable: true
                });
                rect.label = shape.label;
                canvas.add(rect);
            });
        });
}

function saveAnnotation() {
    const objects = canvas.getObjects().filter(obj => obj.type === 'rect').map(obj => {
        const tl = obj.getPointByOrigin('left', 'top');
        const br = obj.getPointByOrigin('right', 'bottom');
        return {
            label: obj.label || "unlabeled",
            points: [
                [Math.round(tl.x), Math.round(tl.y)],
                [Math.round(br.x), Math.round(br.y)]
            ]
        };
    });

    fetch('/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: currentImage, annotation: { shapes: objects } })
    })
    .then(res => res.json())
    .then(data => alert('Annotation saved!'))
    .catch(err => alert('Save failed: ' + err));
}

let isDrawing = false;
let startX, startY, currentRect;

canvas.on('mouse:down', function(opt) {
    if (!isDrawing) {
        const pointer = canvas.getPointer(opt.e);
        startX = pointer.x;
        startY = pointer.y;

        currentRect = new fabric.Rect({
            left: startX,
            top: startY,
            width: 1,
            height: 1,
            fill: 'rgba(0,0,255,0.3)',
            stroke: 'blue',
            strokeWidth: 2,
            selectable: true
        });
        canvas.add(currentRect);
        isDrawing = true;
    }
});

canvas.on('mouse:move', function(opt) {
    if (!isDrawing || !currentRect) return;
    const pointer = canvas.getPointer(opt.e);
    currentRect.set({
        width: Math.abs(pointer.x - startX),
        height: Math.abs(pointer.y - startY),
        left: Math.min(pointer.x, startX),
        top: Math.min(pointer.y, startY)
    });
    canvas.renderAll();
});

canvas.on('mouse:up', function() {
    if (currentRect) {
        const label = prompt("Enter label for this region:", "object");
        currentRect.label = label || "object";
        currentRect.setCoords();
    }
    isDrawing = false;
    currentRect = null;
});

window.onload = function() {
    if (selectedOnLoad) {
        loadImage(selectedOnLoad);
    }
};
