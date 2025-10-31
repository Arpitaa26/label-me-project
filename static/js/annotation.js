let canvas = new fabric.Canvas('canvas');
canvas.selection = true; 
let currentImage = '';


let imageScale = 1;
let imageOffsetX = 0;
let imageOffsetY = 0;

function loadImage(filename) {
    if (!filename) return;
    currentImage = filename;
    canvas.clear();
    canvas.setBackgroundImage(null, canvas.renderAll.bind(canvas));

    const imageUrl = `/image/${filename}`;

    fabric.Image.fromURL(imageUrl, function(img) {
        const canvasWidth = canvas.getWidth();
        const canvasHeight = canvas.getHeight();

        const scaleX = canvasWidth / img.width;
        const scaleY = canvasHeight / img.height;
        const scale = Math.min(scaleX, scaleY);

        imageScale = scale;
        imageOffsetX = (canvasWidth - img.width * scale) / 2;
        imageOffsetY = (canvasHeight - img.height * scale) / 2;

        img.scale(scale);

        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
            originX: 'left',
            originY: 'top',
            left: imageOffsetX,
            top: imageOffsetY
        });

        loadAnnotation(filename);
    }, {
        crossOrigin: 'anonymous'
    });
}

function loadAnnotation(filename) {
    fetch(`/load_annotation/${filename}`)
        .then(res => res.json())
        .then(data => {
            data.shapes.forEach(shape => {
                if (shape.points.length === 2) {
                    // Rectangle
                    const [x1, y1] = shape.points[0];
                    const [x2, y2] = shape.points[1];

                    // ✅ Convert image coords → canvas coords
                    const cx1 = x1 * imageScale + imageOffsetX;
                    const cy1 = y1 * imageScale + imageOffsetY;
                    const cx2 = x2 * imageScale + imageOffsetX;
                    const cy2 = y2 * imageScale + imageOffsetY;

                    const rect = new fabric.Rect({
                        left: cx1,
                        top: cy1,
                        width: cx2 - cx1,
                        height: cy2 - cy1,
                        fill: 'rgba(0,0,255,0.3)',
                        stroke: 'blue',
                        strokeWidth: 2,
                        selectable: true,
                        hasControls: true
                    });
                    rect.label = shape.label;
                    canvas.add(rect);

                } else {
                    // Polygon
                    const canvasPoints = shape.points.map(([x, y]) => ({
                        x: x * imageScale + imageOffsetX,
                        y: y * imageScale + imageOffsetY
                    }));

                    const polygon = new fabric.Polygon(canvasPoints, {
                        fill: 'rgba(0,0,255,0.3)',
                        stroke: 'blue',
                        strokeWidth: 2,
                        selectable: true,
                        hasControls: true
                    });
                    polygon.label = shape.label;
                    canvas.add(polygon);
                }
            });
        });
}

function saveAnnotation() {
    const objects = canvas.getObjects().map(obj => {
        let points = [];

        if (obj.type === 'rect') {
            const tl = obj.getPointByOrigin('left', 'top');
            const br = obj.getPointByOrigin('right', 'bottom');
            points = [tl, br];
        } 
        else if (obj.type === 'polygon') {
            const matrix = obj.calcTransformMatrix();
            points = obj.get('points').map(p => {
                // p is in object-local coords (and Fabric's polygon points are relative to pathOffset)
                const local = new fabric.Point(p.x - (obj.pathOffset?.x || 0), p.y - (obj.pathOffset?.y || 0));
                const transformed = fabric.util.transformPoint(local, matrix);
                return { x: transformed.x, y: transformed.y };
            });
        }

        const imagePoints = points.map(p => ([
            Math.round((p.x - imageOffsetX) / imageScale),
            Math.round((p.y - imageOffsetY) / imageScale)
        ]));

        return {
            label: obj.label || "unlabeled",
            points: imagePoints
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


let isDrawingRect = false;
let startX, startY, currentRect;

let isDrawingPolygon = false;
let polygonPoints = [];
let tempLine;

// --- RECTANGLE DRAWING ---
canvas.on('mouse:down', function(opt) {
    // Did we click on existing object?
    if (opt.target) {
        // select existing rect/polygon
        isDrawingRect = false;
        currentRect = null;
        return;
    }

    if (isDrawingPolygon) {
        // polygon mode → handle in polygon section
        handlePolygonClick(opt);
        return;
    }

    // Start drawing rect
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
    isDrawingRect = true;
});

canvas.on('mouse:move', function(opt) {
    if (isDrawingRect && currentRect) {
        const pointer = canvas.getPointer(opt.e);
        currentRect.set({
            width: Math.abs(pointer.x - startX),
            height: Math.abs(pointer.y - startY),
            left: Math.min(pointer.x, startX),
            top: Math.min(pointer.y, startY)
        });
        canvas.renderAll();
    } else if (isDrawingPolygon && tempLine) {
        // update temp line while drawing polygon
        const pointer = canvas.getPointer(opt.e);
        tempLine.set({ x1: pointer.x, y1: pointer.y });
        canvas.renderAll();
    }
});

canvas.on('mouse:up', function() {
    if (isDrawingRect && currentRect) {
        const label = prompt("Enter label for this rectangle:", "object");
        currentRect.label = label || "object";
        currentRect.setCoords();
    }
    isDrawingRect = false;
    currentRect = null;
});

// --- POLYGON HELPERS ---
function handlePolygonClick(opt) {
    const pointer = canvas.getPointer(opt.e);
    polygonPoints.push({ x: pointer.x, y: pointer.y });

    // Draw marker
    const circle = new fabric.Circle({
        left: pointer.x,
        top: pointer.y,
        radius: 3,
        fill: 'red',
        selectable: false,
        evented: false
    });
    canvas.add(circle);

    tempLine = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: 'blue',
        strokeWidth: 2,
        selectable: false,
        evented: false
    });
    canvas.add(tempLine);

    // Draw line from previous point
    if (polygonPoints.length > 1) {
        const prev = polygonPoints[polygonPoints.length - 2];
        const line = new fabric.Line([prev.x, prev.y, pointer.x, pointer.y], {
            stroke: 'blue',
            strokeWidth: 2,
            selectable: false,
            evented: false
        });
        canvas.add(line);
    }
}

// Finish polygon on double click
canvas.on('mouse:dblclick', function() {
    if (!isDrawingPolygon) return;

    if (polygonPoints.length < 3) {
        alert("Need at least 3 points for a polygon.");
        return;
    }

    // clean helper circles and lines
    canvas.getObjects('line').forEach(obj => canvas.remove(obj));
    canvas.getObjects('circle').forEach(obj => canvas.remove(obj));

    const polygon = new fabric.Polygon(polygonPoints, {
        fill: 'rgba(0,0,255,0.3)',
        stroke: 'blue',
        strokeWidth: 2,
        selectable: true
    });

    const label = prompt("Enter label for this polygon:", "object");
    polygon.label = label || "object";

    canvas.add(polygon);
    canvas.renderAll();

    // reset
    polygonPoints = [];
    tempLine = null;
    isDrawingPolygon = false;
});

// --- KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', function(e) {
    if (e.key === 'r') {
        alert("Rectangle draw mode enabled.");
        isDrawingPolygon = false;
        isDrawingRect = true;
    }
    if (e.key === 'p') {
        alert("Polygon draw mode enabled. Click to add points, double click to finish.");
        isDrawingPolygon = true;
        isDrawingRect = false;
        polygonPoints = [];
    }
    if (e.key === 'Delete') {
        const activeObject = canvas.getActiveObject();
        if (activeObject) {
            canvas.remove(activeObject);
        }
    }
});


function activateRect(){
    isDrawingPolygon = false;
    isDrawingRect = true;
    alert("Rectangle draw mode enabled.");
}

function activatePoly(){
    isDrawingPolygon = true;
    isDrawingRect = false;
    polygonPoints = [];
    alert("Polygon draw mode enabled. Click to add points, double click to finish.");
}





window.onload = function() {
    if (selectedOnLoad) {
        loadImage(selectedOnLoad);
    }
};