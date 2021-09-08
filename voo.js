var cols = 5;
var frameCount = 0;
var canvasElement, detailsDiv;
var canvasWidth, canvasHeight;
var firstColumn;
const columnTemplate = { widgetGap: 8, widgetHeight: 30 };
const styles = { read: '#39D', write: '#5D5' };
const loadTime = Date.now();
const cursor = {};
const INPUTS = ["i", "inputs", "input", "consumes", "reads", "loads","receives", "loads"];
const OUTPUTS = ["o", "outputs", "output", "produces", "creates", "writes", "sends","updates", "saves", "triggers"];
const iograph = { nodes: {} };

function hitTest() {
    var modelUnderCursor = null;
    forEachColumn(function (column) {
        if (cursor.x > column.x && cursor.x < (column.x + columnTemplate.width)) {
            column.widgetList.forEach(function (widget) {
                if (cursor.y >= widget.y && cursor.y <= widget.bottom) {
                    modelUnderCursor = widget.model;
                }
            });
        }
    });
    return modelUnderCursor;
}

var debug = isFlagged('debug');
var marching = debug || isFlagged('marching');

function isFlagged(flag) { return document.location.toString().lastIndexOf(flag) != -1 };

function calculateColumns() {
    var w = canvasElement.clientWidth;
    var h = canvasElement.clientHeight;
    var columnGap = 35;
    var availableWidth = w - (cols * columnGap);
    columnTemplate.width = availableWidth / cols;
    columnTemplate.height = h - 5;
    var colLoop = 0;
    var targetColumn = null;
    while (colLoop++ != cols) {
        targetColumn = { widgetList: [], next: targetColumn };
    }
    firstColumn = targetColumn;
    targetColumn.x = (columnGap / 2);
    while (targetColumn) {
        targetColumn.width = columnTemplate.width;
        if (targetColumn.next) {
            targetColumn.next.x = Math.floor(targetColumn.x + columnTemplate.width + columnGap);
            targetColumn.next.previous = targetColumn;
        }
        targetColumn = targetColumn.next;
    }
}

function resizeCanvas(canvas) {
    var displayWidth = canvas.clientWidth;
    var displayHeight = canvas.clientHeight;

    // Check if the canvas is not the same size.
    if (canvas.width != displayWidth || canvas.height != displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
    }
}

function drawFrame(timestamp) {
    resizeCanvas(canvasElement);
    const ctx = canvasElement.getContext("2d");

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    frameCount++;
    if (marching) ctx.lineDashOffset = timestamp / -190;

    forEachColumn(function (col) { drawColumn(ctx, col) });

    window.requestAnimationFrame(drawFrame);

    if (debug) {
        ctx.fillStyle = "red";
        ctx.font = "8px Arial";
        ctx.fillText("" + frameCount, 20, 10);
        ctx.textAlign = "center";
        ctx.fillText('+', cursor.x, cursor.y);
    }
}

function populateColumns() {
    var root = iograph.nodes[iograph.firstKey];
    if (!root) root = { id: "No root (no items defined?)." };
    addModelToColumn(root, firstColumn);
    showDetails(root.id);
    cursor.model = root;
    forEachColumn(packColumn);
}

function showDetails(modelId) {
    if (detailsDiv) {
        // All of this should be done with OO based DOM manipulation.
        var html = '';

        var model = iograph.nodes[modelId];
        if (!modelId) {
            html = '';
        } else if (!model) {
            html = 'Could not find model by Id - ' + modelId;
        } else {
            html += (model.label ||  modelId) + '</BR>';

            var details = '';
            details += prepareLink('View in Live', model['view.live']);
            details += prepareLink('View in Test', model['view.test']);
            details += prepareLink('View in Dev',  model['view.dev']);
            details += prepareLink('Source Code',  model.source || model.src);
            details += prepareLink('Documentation', model.documentation || model.doc || model.docs);
            html += details ? ('<BR/>' + details) : ('<H2>' + roundRobin(['🤷🏼‍♂', '🙇🏼‍♀️', '🙅🏼‍♂️', '🤦🏼‍♀️']) + '</H2>');
        }
        detailsDiv.innerHTML = html;
    }
}

function prepareLink(title, url, target) {
    if (!target) target = '_blank';
    var result = ''
    if (url) {
        result = '<a href=\"' + url + '\" target=\"' + target + '\">' + title + '</A>&nbsp;&nbsp;&nbsp;';
    }
    return result;
}

function packColumn(column) {
    var widgetCount = column.widgetList.length;
    var totalWidgetHeight = widgetCount * columnTemplate.widgetHeight;
    var totalSpacing = (widgetCount - 1) * columnTemplate.widgetGap;
    var totalHeight = totalWidgetHeight + totalSpacing;
    var columnYCenter = columnTemplate.height / 2;
    var y = columnYCenter - (totalHeight / 2);
    column.widgetList.forEach(function (widget) {
        widget.y = Math.floor(y);
        widget.bottom = widget.y + columnTemplate.widgetHeight;
        y += columnTemplate.widgetHeight + columnTemplate.widgetGap;
    });
}

function addModelToColumn(model, column) {
    var widget = null;
    if (column && model) {

        column.widgetList.forEach(function (testWidget) {
            if (testWidget.model.id == model.id) {
                widget = testWidget;
            }
        });
        if (!widget) {
            widget = { model: model };
            widget.label = model.label || model.id.replace(/[-_]/g, ' ');
            widget.icon = determineIcon(widget.label);
            column.widgetList.push(widget); // Temporary add is the recursive calls dont add it again.
            
            if (column.next) { // We can add outputs.
                eachItem(model, OUTPUTS, function (creationId) {
                    addModelToColumn(getOrCreate(creationId), column.next, styles.write);
                });
            }
            if (column.previous) { // We can add inputs.
                eachItem(model, INPUTS, function (consumptionId) {
                    const inputWidget = addModelToColumn(getOrCreate(consumptionId), column.previous);
                    linkWidgets(inputWidget, widget, styles.read);
                });
            }

            column.widgetList.splice(column.widgetList.indexOf(widget), 1); // Remove from temp-position and place correctly.
            var insertIndex = determineInsertIndex(column.previous, column, column.next, widget);
            column.widgetList.push(widget);
//            column.widgetList.splice(insertIndex, 0, widget);
        }
        // If there are items that create the model being added and there's a column to the left,
        // we can add the things.
        if (column.previous) {
            Object.keys(iograph.nodes).forEach(function (key) {
                var node = iograph.nodes[key];
                eachItem(node, OUTPUTS, function (createdId) {
                    if (createdId == model.id) {
                        var leftWidget = addModelToColumn(node, column.previous);
                        linkWidgets(leftWidget, widget, styles.write);
                    }
                });
            });
        }

        if (column.next) {
            Object.keys(iograph.nodes).forEach(function (key) {
                var node = iograph.nodes[key];
                eachItem(node, INPUTS, function (id) {
                    if (id == model.id) {
                        var rightWidget = addModelToColumn(node, column.next);
                        linkWidgets(widget, rightWidget, styles.read);
                    }
                });
            });
        }
    }
    return widget;
}

function linkWidgets(left, right, style) {
    if (!style) style = '#666';
    if (!left.links) left.links = [];
    left.links.push({ target: right, style: style });
}

function eachItem(model, keyList, callback) {
    keyList.forEach(function (key) { eachItemImpl(model[key], callback) });
}

function eachItemImpl(item, callback) {
    if (item) {
        if (Array.isArray(item)) {
            item.forEach(callback);
        } else {
            callback(item);
        }
    }
}

function forEachColumn(callback) {
    var targetColumn = firstColumn;
    while (targetColumn) {
        callback(targetColumn);
        targetColumn = targetColumn.next;
    }
}


function drawColumn(ctx, column) {
    ctx.lineWidth = 1;
    if (debug) {
        ctx.strokeStyle = '#DDDDDD';
        ctx.beginPath();
        ctx.moveTo(column.x, 0);
        ctx.lineTo(column.x + column.width, 0);
        ctx.lineTo(column.x + column.width, columnTemplate.height);
        ctx.lineTo(column.x, columnTemplate.height);
        ctx.lineTo(column.x, 0);
        ctx.stroke();
    }

    const columnCenterX = column.x + column.width / 2;

    var thickness = columnTemplate.widgetHeight;
    var half = thickness / 2;

    ctx.lineCap = 'square';
    if (column.next) {
        var leftAttachX = column.x + columnTemplate.width - half;
        var rightAttachX = column.next.x;
        column.widgetList.forEach(function (widget) {

            if (widget.links) {
                widget.links.forEach(function (link) {
                    const rightWidget = link.target;
                    ctx.beginPath();
                    ctx.strokeStyle = link.style;
                    ctx.moveTo(leftAttachX, widget.y + half);
                    ctx.lineTo(rightAttachX, rightWidget.y + half);
                    ctx.lineWidth = 4;
                    ctx.setLineDash([1, 8]);
                    ctx.stroke();
                    ctx.lineWidth = 3;
                    ctx.setLineDash([2, 7]);
                    ctx.stroke();
                    ctx.lineWidth = 2;
                    ctx.setLineDash([3, 6]);
                    ctx.stroke();
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 5]);
                    ctx.stroke();
                });
            }
        });
        ctx.setLineDash([]);

    }

    for (var created = 0; created <= 1; created++) {
        ctx.beginPath();
        column.widgetList.forEach(function (widget) {
            if ((created && widget.model.created) || (!created && !widget.model.created)) {
                ctx.moveTo(column.x + half, widget.y + half);
                ctx.lineTo((column.x + column.width) - half, widget.y + half);
            }
        });

        ctx.lineCap = created ? 'round' : 'square';

        ctx.lineWidth = thickness + 3;
        ctx.strokeStyle = 'white';
        ctx.stroke();
        ctx.lineWidth = thickness;
        ctx.strokeStyle = 'gray';
        ctx.stroke();
        ctx.lineWidth = thickness - 6;
        ctx.strokeStyle = created ? 'white' : '#FBFBFB';
        ctx.stroke();
    }

    ctx.fillStyle = "black";
    const baselineDelta = half + (half * 0.25);
    const maxTextWidth = columnTemplate.width - (thickness * 0.75);
    column.widgetList.forEach(function (widget) {

        if (cursor.model == widget.model) {
            ctx.beginPath();
            ctx.moveTo(column.x + half, widget.y + half);
            ctx.lineTo((column.x + column.width) - half, widget.y + half);
            ctx.lineWidth = thickness - 6;
            ctx.lineCap = widget.model.created ? 'round' : 'square';
            ctx.strokeStyle = 'yellow';
            ctx.stroke();
        }

        ctx.font = "14px Arial";
        ctx.textAlign = 'left';
        ctx.fillText(widget.label, column.x + half, widget.y + baselineDelta, maxTextWidth);

        if (widget.icon) {
            ctx.font = "16px Arial";
            ctx.textAlign = 'center';
            ctx.fillText(widget.icon, column.x + 2, widget.y + baselineDelta + 1)
        }
        if (debug) {
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'red';
            ctx.strokeRect(column.x, widget.y, columnTemplate.width, columnTemplate.widgetHeight);
        }
    });
}

canvasElement = document.getElementById('iograph_canvas');
if (canvasElement) {
    canvasWidth = canvasElement.clientWidth;
    canvasHeight = canvasElement.clientHeight;
    window.requestAnimationFrame(drawFrame);
    calculateColumns();
    canvasElement.onmousemove = function (e) { cursor.x = e.pageX; cursor.y = e.pageY; };
    canvasElement.onmousedown = function (e) {
        cursor.model = hitTest(); showDetails(cursor.model ? cursor.model.id : null);
    };
}

detailsDiv = document.getElementById('iograph_details');

function Get(uri) {
    var request = new XMLHttpRequest(); // a new request
    request.open("GET", uri, false);
    request.send(null);
    return request.responseText;
}

iograph.load = function (uri) {
    var data = JSON.parse(Get(uri));
    iograph.addMap(data.graph);
}

iograph.addMap = function (map) {
    Object.keys(map).forEach(function (key) {
        if (!iograph.firstKey) iograph.firstKey = key;
        const item = map[key];
        item.id = key;
        addItem(item);
    });

    Object.values(map).forEach(function (item) {
        eachItem(item, OUTPUTS, function (outputId) {
            var outputtedThing = getOrCreate(outputId);
            outputtedThing.created = true;
        });
    });

    populateColumns();
}

function getOrCreate(id) {
    var result = iograph.nodes[id];
    if (!result) {
        result = { id: id, definitionCount: 0 };
        iograph.nodes[id] = result;
    }
    return result;
}

const emptyDummyColumn = { widgetList: [] };
function determineInsertIndex(leftColumn = emptyDummyColumn, targetColumn, rightColumn = emptyDummyColumn, model) {
    var index = targetColumn.widgetList.length;
    if (index == 0) {
        return index; // Nothing in the column, ordering is irrelevant.
    }
    return index;
}

function addItem(item) {
    //Could just call getOrCreate() and set the defined flag.
    if (!iograph.nodes[item.id]) {
        iograph.nodes[item.id] = item;
        item.definitionCount = 1;
    } else {
        var existingItem = iograph.nodes[item.id];
        item.definitionCount++;
    }
}

function determineIcon(text1, text2) {
    var search = text1.toLowerCase() + ' ' + ((text2 ? text2 : '')).toLowerCase();
    var result = null;
    var latestIndex = 0;
    Object.keys(icons).forEach(function (key) {
        var foundIndex = search.indexOf(key);
        if (foundIndex != -1 && foundIndex >= latestIndex) {
            latestIndex = foundIndex;
            result = icons[key];
        }
    });
    return result || roundRobin(['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒', '🍍', '🥥', '🥝', '🍅']);
}

var roundRobinIndex = 0;
function roundRobin(choices) {
    return choices[roundRobinIndex++ % choices.length];
}

var icons = {
    'schedule': '🕑',
    'scheduling': '🕑',
    'key': '🔑',
    'file': '📄',
    'metric': '📊',
    'log': '📋',
    'queue': '➡️',
    'lambda': '🐑',
    'processor': '⚙️',
    'service': '⚙️',
    'query': '📰',
    'report': '📰',
    '.js': '📜',
    'message': '💬',
    'table':'📋',
    'cookie': '🍪',
    'document': '📑',
    'graph': '❄️',
    'map': '🌍',
    'satellite': '🛸',
    'html': '📄',
    'signal': '⚡️',
    'hardwear': '🤖',
    'notification': '🛎',
    'alert': '🚨',
    'prediction': '🔮',
    'history': '👣',
    'settings file': '📝',
    'config file': '📝',
    'request':'📡'
};