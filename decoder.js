function AudioDecoder () {}

(function() {

    var TRACK_1_BITLENGTH = 7;
    var TRACK_1_BASECHAR = 32;
    var TRACK_2_BITLENGTH = 5;
    var TRACK_2_BASECHAR = 48;

    var silenceLevel = 500;
    var minLevel = silenceLevel;
    var smoothing = 0.1;
    var minLevelCoeff = 0.5;

    AudioDecoder.prototype = {
        getSilenceLevel: function() {
            return silenceLevel;
        },

        setSilenceLevel: function(level) {
            silenceLevel = level;
        },

        getMinLevelCoeff: function() {
            return minLevelCoeff;
        },

        setMinLevelCoeff: function(coeff) {
            minLevelCoeff = coeff;
        },

        getSmoothing: function() {
            return smoothing;
        },

        setSmoothing: function(_smoothing) {
            smoothing = _smoothing;
        },

        processData: function(samples) {
            var data = preprocessData(samples);

            var result = {
                content: 'Unevaluated. This should not happen.',
                badRead: true
            };

            minLevel = getMinLevel(data, minLevelCoeff);
            var bits = decodeToBitSet(data);
            result = decodeToASCII(bits);
            if (result.badRead) {
                console.log('Bad read, try backwards');
                result = decodeToASCII(reverse(bits));
            }
            if (result.badRead) {
                bits = decodePeaksToBitSet(getPeaks(data, minLevel));
                console.log('and now the peaks method');
                result = decodeToASCII(bits);
            }
            if (result.badRead) {
                console.log('bad read. Try backwards again');
                result = decodeToASCII(reverse(bits));
            }

            result.raw = samples;
            return result;
        },

        decodePeaksToBitSet: function(peaks) {
            var result = [];
            console.log('Threre are ' + peaks.length + ' peaks to decode');
            var lastPeak = peaks[0];
            var oneInterval = -1;
            var introDiscard = 1;
            var discardCount = 0;
            var flip = false;
            var resultBitCount = 0;
            var peakCount = 1;
            var needHalfOne = false;
            for (var i = 0; i < peaks.length; i++) {
                var peak = peaks[i];
                flip = !peak.sameSign(lastPeak);
                console.log('peak:', peak, 'flip:', flip, 'peakCount:', peakCount);
                if (flip) {
                    if (discardCount < introDiscard) {
                        console.log('discard');
                        discardCount++;
                    } else {
                        var sinceLast = peak.index -  lastPeak.index;
                        if (oneInterval === -1) {
                            console.log('set oneInterval');
                            oneInterval = sinceLast / 2;
                        } else {
                            var oz = isOne(sinceLast, oneInterval);
                            console.log('diff (peaks):', sinceLast, 'oneInterval:', oneInterval, 'idx:', peak.index, 'one?:', oz);
                            if (oz) {
                                if (needHalfOne) {
                                    oneInterval = (oneInterval + sinceLast) / 2;
                                    result[resultBitCount] = true;
                                    resultBitCount++;
                                    needHalfOne = false;
                                } else {
                                    needHalfOne = true;
                                }
                            } else {
                                if (needHalfOne) {
                                    console.log('Got a 0 where expected a 1. Result so far: ', result);
                                    break;
                                } else {
                                    oneInterval = (oneInterval + (sinceLast / 2)) / 2;
                                    result[resultBitCount] = false;
                                    resultBitCount++;
                                }
                            }
                        }
                    }
                    lastPeak = peak;
                }
            }
            // console.log('Raw binary:', dumpString)
            return result;
        },

        decodeToBitSet: function(data) {
            var result = [];
            var resultBitCount = 0;
            var lastSign = -1;
            var lasti = 0;
            var first = 0;
            var oneInterval = -1;
            var introDiscard = 1;
            var discardCount = 0;
            var needHalfOne = false;
            var expectedParityBit = 1;
            for (var i = 0; i < data.length; i++) {
                var dp = data[i];
                if ((dp * lastSign < 0) && (Math.abs(dp) > minLevel)) {
                    if (first === 0) {
                        first = i;
                        console.log('set first to:', first);
                    } else if (discardCount < introDiscard) {
                        discardCount++;
                    } else {
                        var sinceLast = i - lasti;
                        if (oneInterval === -1) {
                            oneInterval = sinceLast / 2;
                        } else {
                            var oz = isOne(sinceLast, oneInterval);
                            // console.log
                            if (oz) {
                                oneInterval = sinceLast;
                                if (needHalfOne) {
                                    expectedParityBit = 1 - expectedParityBit;
                                    result[resultBitCount] = true;
                                    needHalfOne = false;
                                } else {
                                    needHalfOne = true;
                                }
                            } else {
                                oneInterval = sinceLast / 2;
                                if (needHalfOne) {
                                    break;
                                } else {
                                    result[resultBitCount] = false;
                                    resultBitCount++;
                                }
                            }
                        }
                    }
                    lasti = i;
                    lastSign *= -1;
                }
            }
        }
    };

    function decodeToASCII(bits) {
        var toReturn = {};
        var first1 = bits.indexOf(true);
        if (first1 < 0) {
            console.log('no one bit deteced');
            toReturn.badRead = true;
            return toReturn;
        }
        console.log('First 1 bit is at position ' + first1);
        var sentinel = 0;
        var exp = 0;
        for (var i = first1; i < first1 + 4; i++) {
            if (bits[i]) {
                sentinel += 1 << exp;
            }
            exp++;
        }
        console.log('Sentinel value for 4 bit: ' + sentinel);
        if (sentinel === 11) {
            return decodeToASCII2(bits, first1, 4, 48);
        } else {
            for (; i < first1 + 6; i++) {
                if (bits[i]) {
                    sentinel += 1 << exp;
                }
                exp++;
            }
            console.log('sentinel value for 6 bit:' + sentinel);
            if (sentinel === 5) {
                return decodeToASCII2(bits, first1, 6, 32);
            }
        }
        console.log('Could not match sentinel value');
        toReturn.badRead = true;
        return toReturn;
    }

    function recenter(data) {
        var samples = [];
        var sum = 0;
        for (var i = 0; i < data.length; i++) {
            sum += data[i];
        }
        var avg = Math.round(sum / data.length);
        for (i = 0; i < data.length; i++) {
            samples.push(data[i] - avg);
        }
        return samples;
    }

    function smooth(data) {
        console.log('Smoothing data. Smoothing param is', smoothing);
        var samples = [];
        var lastVal = data[0];
        for (var i = 0; i < data.length; i++) {
            samples.push((lastVal * smoothing) + (data[i] * (1 - smoothing)));
        }
        return samples;
    }

    function getMinLevel(data, coeff) {
        var lastVal = 0;
        var peakCount = 0;
        var peakSum = 0;
        var peakTemp = 0;
        var hitMin = false;
        for (var i = 0; i < data.length; i++) {
            var val = data[i];
            if (val > 0 && lastVal <= 0) {
                // We're coming from negative to positive, reset peakTemp
                peakTemp = 0;
                hitMin = false;
            } else if (val < 0 && lastVal >= 0 && hitMin) {
                peakSum += peakTemp;
                peakCount++;
            }
            if ((val > 0) && (lastVal > val) && (lastVal > silenceLevel) && (val > peakTemp)) {
                // New peak, higher than last peak since zero
                hitMin = true;
                peakTemp = val;
            }
            lastVal = val;
        }
        if (peakCount > 0) {
            var level = Math.floor((peakSum / peakCount) * coeff);
            console.log('Returning ' + level + ' for minLevel');
            console.log('There were ' + peakCount + ' peaks');
            return level;
        } else {
            return silenceLevel;
        }
    }

    function getPeaks(data, threshold) {
        var toReturn = [];
        var lastDp = 0;
        var beforeThatDp = 0;
        for (var i = 0; i < data.length; i++) {
            var dp = data[i];
            if (Math.abs(dp) < threshold) {
                //if it's not a great enough level, we don't care if it's a min/max or not.  move on.
                continue;
            }

            // yes, I know these could be one condition.  I think it's more readable like this.
            if ((dp > 0) && (dp < lastDp) && (lastDp >= beforeThatDp)) {
                toReturn.push([i, lastDp]);
            } else if ((dp < 0) && (dp > lastDp) && (lastDp <= beforeThatDp)) {
                toReturn.push([i, lastDp]);
            }
            console.log('Got ' + toReturn.length + ' peaks');
            return toReturn;
        }
    }

    function preprocessData(data) {
        data = recenter(data);
        data = smooth(data);
        return data;
    }

})();