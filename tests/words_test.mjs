// SPDX-License-Identifier: GPL-3.0-only
// web/words.js: the screen's text in words (a firmware's list, then the common rules).   node tests/words_test.mjs
import { spoken, wordsOf } from '../web/words.js';

const LIST = [['BD', 'bass drum'], ['909', 'nine oh nine'], ['909 GR', 'nine oh nine groove'], ['P#', 'pattern #'],
    ['P#-#', 'patterns # to #'], ['STEP #: #:#', 'step #: loop # of every #'], ['NEW LINE *', 'new line'],
    ['LENGTH # st', 'length # steps'], ['REV', 'reverse'], ['REV', 'reverb'], ['OCT+', 'octave up'], ['REC', 'record'],
    ['MIDI CH #', 'MIDI channel #'], ['dB', 'decibels']];
const CASES = [
    ['BD TUNE 37', 'bass drum tune 37'],
    ['909 GR', 'nine oh nine groove'],                 // the longest match
    ['909 KIT', 'nine oh nine kit'],
    ['P3', 'pattern 3'],
    ['COPY TO P17-32', 'copy to patterns 17 to 32'],
    ['STEP 5: 1:4', 'step 5: loop 1 of every 4'],
    ['NEW LINE 3FA2', 'new line'],
    ['LENGTH 16 st', 'length 16 steps'],
    ['DIRECTION REV', 'direction reverse'],            // the earlier entry when they match as much
    ['RATE 1/16T', 'rate sixteenth triplet'],
    ['TIME 1/8., FEEDBACK 52', 'time dotted eighth, feedback 52'],
    ['TIME 1/8.', 'time dotted eighth'],
    ['RATE 1/16. STEPS 1-16 ON: NONE', 'rate sixteenth. steps 1 to 16 on: none'],
    ['RATIO 4:1', 'ratio 4 to 1'],
    ['BATTERY 2/3', 'battery 2 of 3'],
    ['ROOT C#', 'root C sharp'],
    ['STEP 5 ON C#3', 'step 5 on C sharp 3'],
    ['REPEAT x1', 'repeat 1 time'],
    ['REPEAT x4', 'repeat 4 times'],
    ['SWING 50 %', 'swing 50 percent'],
    ['SWING 50%', 'swing 50 percent'],
    ['LEVEL -5 dB', 'level -5 decibels'],
    ['BD (1/2): TUNE 34', 'bass drum, page 1 of 2: tune 34'],
    ['PLAY / STOP', 'play or stop'],
    ['HOME + REC: UNDO', 'home plus record: undo'],
    ['(+ OCT+: P17-32)', '(plus octave up: patterns 17 to 32)'],
    ['HOLD A STEP', 'hold a step'],
    ['LOOP A', 'loop A'],
    ["THE PART'S SOUND", "the part's sound"],
    ['THE EFFECTS: REVERB, DELAY,. TAPE', 'the effects: reverb, delay. tape'],
    ['CLEAR THIS?. SEL: YES', 'clear this? sel: yes'],
    ['WAVE Saw', 'wave Saw'],
    ['BREAK MIDI CH 4', 'break MIDI channel 4'],
    ['A  B ', 'A B'],
    ['BDX', 'bdx'],                                    // not "bass drum" inside a longer word
];
let fails = 0;
for (const [s, want] of CASES) {
    const got = spoken(s, LIST);
    if (got !== want) { console.log(`FAIL "${s}" -> "${got}", want "${want}"`); fails++; }
}
if (spoken('BD TUNE 37') !== 'bd tune 37') { console.log('FAIL: no list: capitals not made words'); fails++; }
try { wordsOf({ format: 2, words: [] }); console.log('FAIL: format 2 taken'); fails++; } catch (e) { /* refused */ }
if (wordsOf({ format: 1, words: [['A', 'b'], ['', 'x'], [1, 2]] }).length !== 1) { console.log('FAIL: bad entries kept'); fails++; }
console.log(fails ? `words: ${fails} FAILED` : `words: all ${CASES.length} passed`);
process.exit(fails ? 1 : 0);
