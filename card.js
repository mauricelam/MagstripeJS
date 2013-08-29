(function () {

    var analyzer;
    var processNode;
    var buffer = new Uint8Array(1024);
    var frequencies = new Float32Array(1024);
    var rID;
    var decodeTimer;
    var decodeBuffer = [];

    function onFail() {
        alert('Please allow access to the microphone.');
    }

    var context = new window.webkitAudioContext();

    navigator.webkitGetUserMedia({audio: true}, function(stream) {
        var mic = context.createMediaStreamSource(stream);
        processNode = context.createScriptProcessor(1024, 1, 1);
        processNode.onaudioprocess = analyze;
        analyzer = context.createAnalyser();
        analyzer.fftSize = 2048;
        analyzer.smoothingTimeConstant = 0.2;
        mic.connect(analyzer);
        analyzer.connect(processNode);
        processNode.connect(context.destination);
        console.log('ready');
    }, onFail);

    var THRESHOLD = 6;


    function findZeroCrossings(buffer) {
        var lastCrossing = 0;
        var positive = false;
        var arr = [];
        for (var i = 0; i < buffer.length; i++) {
            if (!positive && buffer[i] > 128 + THRESHOLD) {
                positive = true;
                arr.push(i - lastCrossing);
                lastCrossing = i;
            } else if (positive && buffer[i] < 128 - THRESHOLD) {
                positive = false;
                arr.push(i - lastCrossing);
                lastCrossing = i;
            }
        }
        return arr;
    }

    function isUseful(buffer) {
        for (var i = 0; i < 1024; i++) {
            if (!positive && buffer[i] > 128 + THRESHOLD) {
                return true;
            } else if (positive && buffer[i] < 128 - THRESHOLD) {
                return true;
            }
        }
        return false;
    }

    function clear() {
        var canvas = document.getElementById('canvas');
        canvas.width = canvas.width;
    }


    function plot(arr, color) {
        var canvas = document.getElementById('canvas');
        var canvasCtx = canvas.getContext('2d');
        canvasCtx.strokeStyle = color;
        canvasCtx.moveTo(0, 256);
        canvasCtx.lineTo(999999, 256);
        canvasCtx.stroke();
        canvasCtx.moveTo(0, arr[0] * 2);
        for (var i = 1; i < arr.length; i++) {
            canvasCtx.lineTo(i, arr[i] * 2);
        }
        canvasCtx.stroke();
    }

    function decode(decodeBuffer) {
        console.log('decode', decodeBuffer);
        var decoded = [];
        var unknown = 0;
        var avgArray = new AverageArray20();
        for (var i = 1; i < decodeBuffer.length; i++) {
            var average = avgArray.reduce(function(acc, cur) { return acc + cur; }, 0) / avgArray.length;
            var t = decodeBuffer[i];
            if (Math.abs(t - average) < average * 0.2) {
                decoded.push(0);
                avgArray.add(t);
            } else if (Math.abs(t * 2 - average) < average * 0.2) {
                decoded.push(1);
                avgArray.add(t * 2);
                i++;
            } else {
                // console.log('unknown', t, average);
                unknown++;
                avgArray.add(t);
            }
            avgArray.push(decodeBuffer[i]);
        }
        // console.log(decoded, 'unknown: ', unknown);

        decoded = decoded.slice(decoded.indexOf(1));
        var groups = [];
        for (var i = 0; i < decoded.length; i += 5) {
            groups.push(decoded.slice(i, i+5).join(''));
        }
        var text = groups.map(function(group) {
            var bin = group.substr(0, group.length - 1);
            return String.fromCharCode(parseInt(bin, 2) + 48);
        });

        return [groups, text.join('')];
    }

    function onSwipe() {
        window.mmm = master;
        console.log('onswipe', master);
        var masterZxing = findZeroCrossings(master);
        window.zmm = masterZxing;
        var decoded = decode(masterZxing);
        document.getElementById('message').innerHTML = decoded[0].join('');
        document.getElementById('text').innerHTML = decoded[1];
        master = [];
        recording = false;
    }

    var master = [];
    var recording = false;

    function analyze(event) {
        if (analyzer) {
            analyzer.getByteTimeDomainData(buffer);
            // analyzer.getFloatFrequencyData(frequencies);
            if (recording) {
                master = master.concat([].slice.call(buffer));
            }
            if (findZeroCrossings(buffer).length) {
                recording = true;
                window.clearTimeout(decodeTimer);
                decodeTimer = window.setTimeout(onSwipe, 1000);
                master = master.concat([].slice.call(buffer));
            }
        }
        // rID = window.requestAnimationFrame(analyze);
    }

})();

function AverageArray20() {}

var AVERAGE_SIZE = 5;

AverageArray20.prototype = [];
AverageArray20.prototype.add = function (value) {
    if (this.length >= AVERAGE_SIZE) {
        this.splice(0, this.length - AVERAGE_SIZE + 1);
    }
    this.push(value);
};
