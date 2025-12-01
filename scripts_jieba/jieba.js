// scripts/jieba.js (HMM VERSION)
define(["data/dictionary", "finalseg"], 
function(dictionary, finalseg) {
    
    var trie = {}, 
        FREQ = {},
        total = 0.0,
        min_freq = 0.0,
        initialized = false;

    var max_of_array = function(array){return Math.max.apply(Math, array)};
    var min_of_array = function(array){return Math.min.apply(Math, array)};

    var gen_trie = function () {
        var lfreq = {},
            trie = {},
            ltotal = 0.0;

        for (var i = 0; i < dictionary.length; i++) {
            var entry = dictionary[i],
                word = entry[0],
                freq = entry[1];
            lfreq[word] = freq;
            ltotal += freq;
            p = trie;
            for (var ci = 0; ci < word.length; ci++) {
                var c = word[ci];
                if (!(c in p)) {
                    p[c] = {};
                }
                p = p[c];
            }
            p[''] = '';
        }
        return [trie, lfreq, ltotal];
    }

    var initialize = function() {
        if (initialized === true) {
            return;
        }
        console.log("Building Trie...");

        var gar = gen_trie();
        trie = gar[0];
        FREQ = gar[1];
        total = gar[2];

        min_freq = Infinity;
        for (k in FREQ) {
            var v = FREQ[k];
            FREQ[k] = Math.log(v / total);
            if (FREQ[k] < min_freq) {
                min_freq = FREQ[k];
            }
        }
        initialized = true;
        console.log("✅ Trie built successfully!");
        console.log("✅ HMM models loaded (finalseg module ready)");
    }

    var get_DAG = function(sentence) {
        var N = sentence.length,
            i = 0,
            j = 0,
            p = trie,
            DAG = {};

        while (i < N) {
            var c = sentence[j];
            if (c in p) {
                p = p[c];
                if ('' in p) {
                    if (!(i in DAG)){
                        DAG[i] = [];
                    }
                    DAG[i].push(j);
                }
                j += 1;
                if (j >= N) {
                    i += 1;
                    j = i;
                    p = trie;
                }
            }
            else {
                p = trie;
                i += 1;
                j = i;
            }
        }
        for (i = 0; i < sentence.length; i++) {
            if (!(i in DAG)) {
                DAG[i] = [i];
            }
        }
        return DAG;
    }

    var calc = function(sentence, DAG, idx, route) {
        var N = sentence.length;
        route[N] = [0.0, ''];
        for (idx = N - 1; idx > -1; idx--) {
            candidates = [];
            candidates_x = [];
            for (xi in DAG[idx]) {
                var x = DAG[idx][xi];
                var f = ((sentence.substring(idx, x+1) in FREQ) ? FREQ[sentence.substring(idx, x+1)] : min_freq);
                candidates.push(f + route[x+1][0]);
                candidates_x.push(x);
            }
            var m = max_of_array(candidates);
            route[idx] = [m, candidates_x[candidates.indexOf(m)]];
        }
    }

    var __cut_DAG = function(sentence) {
        var DAG = get_DAG(sentence);
        var route = {};
        var yieldValues = [];

        calc(sentence, DAG, 0, route);

        var x = 0,
            buf = '',
            N = sentence.length;

        while(x < N) {
            var y = route[x][1]+1,
                l_word = sentence.substring(x, y);
            if (y - x == 1) {
                buf += l_word;
            }
            else {
                if (buf.length > 0) {
                    if (buf.length == 1) {
                        yieldValues.push(buf);
                        buf = '';
                    }
                    else {
                        if (!(buf in FREQ)) {
                            // ✅ USE IMPORTED finalseg module
                            var recognized = finalseg.cut(buf);
                            for (var t = 0; t < recognized.length; t++) {
                                yieldValues.push(recognized[t]);
                            }
                        }
                        else {
                            for (var elem in buf) {
                                yieldValues.push(buf[elem]);
                            }
                        }
                        buf = "";
                    }
                }
                yieldValues.push(l_word);
            }
            x = y;
        }

        if (buf.length > 0) {
            if (buf.length == 1) {
                yieldValues.push(buf);
            }
            else {
                if (!(buf in FREQ)) {
                    // ✅ USE IMPORTED finalseg module
                    var recognized = finalseg.cut(buf);
                    for (var t = 0; t < recognized.length; t++) {
                        yieldValues.push(recognized[t]);
                    }
                }
                else {
                    for (var elem in buf) {
                        yieldValues.push(buf[elem]);
                    }
                }
            }
        }
        return yieldValues;
    }

    var __cut_DAG_NO_HMM = function (sentence) {
        var re_eng = /[a-zA-Z0-9]/,
            route = {},
            yieldValues = [];

        var DAG = get_DAG(sentence);
        calc(sentence, DAG, 0, route);

        var x = 0,
            buf = '',
            N = sentence.length;

        while (x < N) {
            y = route[x][1] + 1;
            l_word = sentence.substring(x, y);
            if (l_word.match(re_eng) && l_word.length == 1) {
                buf += l_word;
                x = y;
            }
            else {
                if (buf.length > 0) {
                    yieldValues.push(buf);
                    buf = '';
                }
                yieldValues.push(l_word);
                x = y;
            }
        }
        if (buf.length > 0) {
            yieldValues.push(buf);
        }
        return yieldValues;
    }

    var cut = function(sentence, use_hmm){
        if (use_hmm === undefined) {
            use_hmm = true; // Enable HMM by default
        }
        
        var yieldValues = [];
        var re_han = /([\u4E00-\u9FA5a-zA-Z0-9+#&\._]+)/;
        var re_skip = /(\r\n|\s)/;
        var blocks = sentence.split(re_han);
        var cut_block = use_hmm ? __cut_DAG : __cut_DAG_NO_HMM;

        for (b in blocks) {
            var blk = blocks[b];
            if (blk.length == 0) {
                continue;
            }

            if (blk.match(re_han)) {
                var cutted = cut_block(blk);
                for (w in cutted) {
                    yieldValues.push(cutted[w]);
                }
            }
            else {
                var tmp = blk.split(re_skip);
                for (var i = 0; i < tmp.length; i++) {
                    var x = tmp[i];
                    if (x.match(re_skip)) {
                        yieldValues.push(x);
                    }
                    else {
                        for (xi in x) {
                            yieldValues.push(x[xi]);
                        }
                    }
                }
            }
        }
        return yieldValues;
    }

    // Initialize on load
    initialize();

    // Return public API
    return {
        cut: cut,
        cut_for_search: function(sentence) { return cut(sentence, true); },
        initialized: function() { return initialized; }
    };
});