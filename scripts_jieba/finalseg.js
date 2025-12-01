// scripts/finalseg.js - HMM FIXED SCOPE VERSION
define(["finalseg/prob_emit", "finalseg/prob_start", "finalseg/prob_trans"], 
function(prob_emit_module, prob_start_module, prob_trans_module) {
    
    // Extract probability objects
    var PROB_EMIT = prob_emit_module;
    var PROB_START = prob_start_module;
    var PROB_TRANS = prob_trans_module;
    
    var MIN_FLOAT = -3.14e100;
    
    var PrevStatus = {
        'B': ['E', 'S'],
        'M': ['M', 'B'],
        'S': ['S', 'E'],
        'E': ['B', 'M']
    };
    
    var re_han = /([\u4E00-\u9FA5]+)/g;
    var re_skip = /(\r\n|\s)/;

    // Helper: Find max value and its index
    function argmax(array) {
        var maxValue = -Infinity;
        var maxIndex = 0;
        for (var i = 0; i < array.length; i++) {
            if (array[i] > maxValue) {
                maxValue = array[i];
                maxIndex = i;
            }
        }
        return [maxValue, maxIndex];
    }

    // Viterbi algorithm for HMM
    function viterbi(obs, states) {
        var V = [{}];
        var path = {};
        
        // Initialize first observation
        for (var i = 0; i < states.length; i++) {
            var y = states[i];
            var emitProb = (obs[0] in PROB_EMIT[y]) ? PROB_EMIT[y][obs[0]] : MIN_FLOAT;
            V[0][y] = PROB_START[y] + emitProb;
            path[y] = [y];
        }
        
        // Process remaining observations
        for (var t = 1; t < obs.length; t++) {
            V.push({});
            var newpath = {};
            
            for (var i = 0; i < states.length; i++) {
                var y = states[i];
                var emitProb = (obs[t] in PROB_EMIT[y]) ? PROB_EMIT[y][obs[t]] : MIN_FLOAT;
                
                var candidates = [];
                var candidateStates = PrevStatus[y];
                
                for (var j = 0; j < candidateStates.length; j++) {
                    var y0 = candidateStates[j];
                    var transProb = (y in PROB_TRANS[y0]) ? PROB_TRANS[y0][y] : MIN_FLOAT;
                    candidates.push(V[t-1][y0] + transProb + emitProb);
                }
                
                var maxResult = argmax(candidates);
                var maxProb = maxResult[0];
                var maxIdx = maxResult[1];
                
                V[t][y] = maxProb;
                newpath[y] = path[candidateStates[maxIdx]].concat([y]);
            }
            path = newpath;
        }
        
        // Find best final state (E or S)
        var lastT = obs.length - 1;
        var finalCandidates = [V[lastT]['E'], V[lastT]['S']];
        var finalResult = argmax(finalCandidates);
        var bestFinalState = ['E', 'S'][finalResult[1]];
        
        return {
            prob: finalResult[0],
            path: path[bestFinalState]
        };
    }

    // Cut a sentence using HMM
    function __cut(sentence) {
        if (!sentence || sentence.length === 0) {
            return [];
        }
        
        var states = ['B', 'M', 'E', 'S'];
        var obs = sentence.split('');
        
        var result = viterbi(obs, states);
        var posList = result.path;
        
        var words = [];
        var begin = 0;
        
        for (var i = 0; i < obs.length; i++) {
            var pos = posList[i];
            
            if (pos === 'B') {
                begin = i;
            } else if (pos === 'E') {
                words.push(sentence.substring(begin, i + 1));
            } else if (pos === 'S') {
                words.push(obs[i]);
            }
        }
        
        return words;
    }

    // Public cut function
    function cut(sentence) {
        var result = [];
        var blocks = sentence.split(re_han);
        
        for (var i = 0; i < blocks.length; i++) {
            var block = blocks[i];
            
            if (!block || block.length === 0) {
                continue;
            }
            
            if (block.match(/[\u4E00-\u9FA5]/)) {
                // Chinese block - use HMM
                var words = __cut(block);
                result = result.concat(words);
            } else {
                // Non-Chinese block - split by whitespace
                var parts = block.split(re_skip);
                for (var j = 0; j < parts.length; j++) {
                    if (parts[j] && parts[j].length > 0) {
                        result.push(parts[j]);
                    }
                }
            }
        }
        
        return result;
    }

    console.log("✅ FinalSeg module loaded successfully");
    console.log("  - PROB_START:", PROB_START);
    console.log("  - PROB_TRANS keys:", Object.keys(PROB_TRANS));
    console.log("  - PROB_EMIT keys:", Object.keys(PROB_EMIT));

    return {
        cut: cut
    };
});