(function () {

    var processNode;
    var decodeTimer;
    var swipeBuffer = [];

    function onFail() {
        alert('Please allow access to the microphone.');
    }

    var context = new AudioContext();

    navigator.webkitGetUserMedia({audio: true}, function(stream) {
        var mic = context.createMediaStreamSource(stream);
        processNode = context.createScriptProcessor(1024, 1, 1);
        processNode.onaudioprocess = analyze;
        mic.connect(processNode);
        processNode.connect(context.destination);
        activeMonitor();
        console.log('ready');
    }, onFail);

    // Do not process if in background
    
    var activeTimer;
    var activeMonitor = function() {
        processNode.onaudioprocess = analyze;
        window.clearTimeout(activeTimer);
        activeTimer = window.setTimeout(function() {
            processNode.onaudioprocess = null;
        }, 1000);
        window.requestAnimationFrame(activeMonitor);
    };

    // Plotting functions

    var plotData = {
        points: [],
        graphs: []
    };

    function replot(offset) {
        offset = offset || 0;
        var canvas = document.getElementById('canvas');
        canvas.width = canvas.width;
        var canvasCtx = canvas.getContext('2d');
        plotData.points.forEach(function(point) {
            canvasCtx.fillStyle = point.color;
            for (i = 0; i < point.data.length; i++) {
                var x = point.data[i];
                var y = point.y;
                if (point.y === null) {
                    y = x[1] * 1000 + 256;
                    x = x[0];
                }
                var size = point.size || 3;
                canvasCtx.fillRect(x - offset, y, size, size);
            }
        });
        plotData.graphs.forEach(function(graph) {
            canvasCtx.strokeStyle = graph.color;
            canvasCtx.fillStyle = graph.color;
            canvasCtx.moveTo(0, 256);
            canvasCtx.lineTo(999999, 256);
            canvasCtx.stroke();
            canvasCtx.moveTo(0, graph.data[0] * 1000 + 256);
            for (var i = 1; i < graph.data.length; i++) {
                canvasCtx.lineTo(i - offset, graph.data[i] * 1000 + 256);
                // canvasCtx.fillRect(i - offset, graph.data[i] * 1000 + 256, 2, 2);
            }
            canvasCtx.stroke();
        });
    }

    function plotPoints(arr, y, color, size) {
        plotData.points.push({data: arr, y: y, color: color, size: size});
        replot();
    }

    function plot(arr, color) {
        plotData.graphs.push({data: arr, color: color});
        replot();
    }

    window.addEventListener('scroll', function(event) {
        replot(document.body.scrollLeft);
    }, false);

    // Decoding

    var THRESHOLD = 0.01;

    function findZeroCrossings(buffer) {
        var positive = false;
        var arr = [];
        for (var i = 0; i < buffer.length; i++) {
            if (!positive && buffer[i] > THRESHOLD) {
                positive = true;
                arr.push(i);
            } else if (positive && buffer[i] < -THRESHOLD) {
                positive = false;
                arr.push(i);
            }
        }
        return arr;
    }

    var TRACK2_SIZE = 5;
    var TRACK2_ASCII = 48;
    var TRACK1_SIZE = 7;
    var TRACK1_ASCII = 32;

    function decode(decodeBuffer) {
        console.log('decode', decodeBuffer);
        var decoded = [];
        var unknown = 0;
        var avgArray = new AverageArray();
        var zeroes = [], ones = [], unknowns = [];
        for (var i = 1; i < decodeBuffer.length; i++) {
            var average = avgArray.average();
            var base = decodeBuffer[i-1];
            var t = decodeBuffer[i] - base;
            var t2 = decodeBuffer[i+1] - base;
            if (i < 10) {
                if (i > 5) avgArray.add(t);
                continue;
            }
            if (Math.abs(t - average) < average * 0.3) {
                decoded.push(0);
                avgArray.add(t);
                zeroes.push(decodeBuffer[i]);
            } else if (Math.abs(t2 - average) < average * 0.3) {
                decoded.push(1);
                avgArray.add(t2);
                ones.push(decodeBuffer[i]);
                i++;
            } else {
                unknown++;
                unknowns.push(decodeBuffer[i]);
            }
        }
        console.log('unknown: ', unknown);

        decoded.splice(0, decoded.indexOf(1));
        decoded.reverse();
        decoded.splice(0, decoded.indexOf(1));

        var track = getTrack(decoded);
        if (!track) {
            track = getTrack(decoded.reverse());
        }
        console.log('track:', track);
        if (!track) {
            console.warn('Unknown track. Try swiping again');
            return 'Bad swipe :(';
        }

        var text = toASCII(decoded, track);

        plotPoints(zeroes, 300, 'cyan', 10);
        plotPoints(ones, 200, 'orange', 10);
        plotPoints(unknowns, 100, 'grey', 10);

        return text;
    }

    function getTrack(bitArray) {
        var bitString = bitArray.join('');
        var t1_percent = bitString.indexOf('1010001');
        var t1_questionMark = bitString.indexOf('1111100');
        if (t1_percent > -1 && t1_questionMark > t1_percent) {
            return 1;
        }
        var t2_semicolon = bitString.indexOf('11010');
        var t2_questionMark = bitString.indexOf('11111');
        if (t2_semicolon > -1 && t2_questionMark > t2_semicolon) {
            return 2;
        }
    }

    function toASCII(bitArray, track) {
        var bitsize = track === 1 ? TRACK1_SIZE : TRACK2_SIZE;
        var asciiOffset = track === 1 ? TRACK1_ASCII : TRACK2_ASCII;
        var groups = [];
        for (var i = 0; i < bitArray.length; i += bitsize) {
            groups.push(bitArray.slice(i, i + bitsize).reverse().join(''));
        }
        var decs = groups.map(function(group) {
            if (!checkParity(group)) {
                console.warn('Parity not matched');
            }
            return parseInt(group.substr(1), 2);
        });
        return decs.map(function(dec) { return String.fromCharCode(dec + asciiOffset); }).join('');
    }

    function checkParity(group) {
        var ones = 0;
        for (var i = 0; i < group.length; i++) {
            if (group[i] == 1) ones++;
        }
        return ones % 2 === 1;
    }

    function onSwipe() {
        console.log('onswipe');
        plot(swipeBuffer, 'red');
        var zeroCrossings = findZeroCrossings(swipeBuffer);
        plotPoints(zeroCrossings, 256, 'green');
        document.getElementById('text').innerHTML = decode(zeroCrossings);
        swipeBuffer = [];
    }


    function analyze(event) {
        var buffer = event.inputBuffer.getChannelData(0);
        if (findZeroCrossings(buffer).length) {
            window.clearTimeout(decodeTimer);
            decodeTimer = window.setTimeout(onSwipe, 1000);
            swipeBuffer = swipeBuffer.concat([].slice.call(buffer));
        }
    }

})();

function AverageArray() {}

var AVERAGE_SIZE = 5;

AverageArray.prototype = [];
AverageArray.prototype.add = function(value) {
    if (this.length >= AVERAGE_SIZE) {
        this.splice(0, this.length - AVERAGE_SIZE + 1);
    }
    this.push(value);
};

AverageArray.prototype.average = function() {
    return this.reduce(function(acc, cur) { return acc + cur; }, 0) / this.length;
};
