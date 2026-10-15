#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Audit what a firmware says to a screen reader (announce.c), against the rules in skill/.../RULES.md.
//   node tools/audit.mjs DUMP.tsv [--allow words.txt] [--dict /usr/share/dict/words] [--max 240] [--all]
// DUMP.tsv: one message a line, KIND <tab> the screen's text <tab> the words sent (the firmware simulator's
// "speakdump"; KIND: SCREEN KNOB ROW VALUE HELP MSG WARN ASK STEP ...). Exit 1 when there are errors.
import fs from 'fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const file = args.find((a, i) => !a.startsWith('--') && !(i && args[i - 1].startsWith('--') && args[i - 1] !== '--all'));
if (!file) { console.error('usage: audit.mjs DUMP.tsv [--allow words.txt] [--dict FILE] [--max 240] [--all]'); process.exit(2); }
const MAX = +opt('--max', 240);
const all = args.includes('--all');

// words: the system dictionary, music and synth words, and the firmware's own allow list
const dictFile = opt('--dict', ['/usr/share/dict/words', '/usr/dict/words'].find((f) => fs.existsSync(f)));
const words = new Set();
if (dictFile) for (const w of fs.readFileSync(dictFile, 'utf8').split('\n')) words.add(w.trim().toLowerCase());
const MUSIC = `arp arpeggiator reverb delay lfo cutoff resonance envelope sustain release attack decay glide portamento
  detune oscillator osc filter chorus flanger phaser bitcrush wavefolder sidechain ping-pong p-lock p-locks retrigger
  accent tom toms hat hats rimshot cowbell clap snare kick midi semitones semitone pentatonic dorian phrygian
  lydian mixolydian locrian aeolian ionian staccato legato sequencer euclidean pan mute unmute unmuted muted
  autosave autosaved bpm usb sixteenth thirty-second triplet dotted tempo swing groove fill loop loops crunch fuzz
  saturation distortion compressor makeup limiter glue drive overdrive preset presets algorithm velocity aftertouch
  polyphony mono stereo wav sysex firmware fm-1 ok undo redo octave octaves cancelled cancelling colour`.split(/\s+/);
MUSIC.forEach((w) => words.add(w));
const allowFile = opt('--allow');
if (allowFile) for (const w of fs.readFileSync(allowFile, 'utf8').split('\n')) if (w.trim() && !w.startsWith('#')) words.add(w.trim().toLowerCase());
const isWord = (w) => {
    const l = w.toLowerCase();
    if (words.has(l)) return true;
    for (const suf of ['s', 'es', 'ed', 'd', 'ing', "'s"])           // plurals and tenses of a known word
        if (l.endsWith(suf) && words.has(l.slice(0, -suf.length))) return true;
    return l.split('-').every((p) => p && words.has(p));             // "ping-pong", "low-cut"
};

const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const findings = [];                                                  // {level, rule, kind, said, note}
const notWords = new Map();                                           // word -> {count, example}
const add = (level, rule, kind, said, note) => findings.push({ level, rule, kind, said, note });

for (const [kind, screen, said0] of lines) {
    const said = said0 ?? screen;
    if (!said) continue;
    // 1. words, not abbreviations: every word should be a word (single letters are letters: "L F O", "loop A")
    for (const m of said.matchAll(/[A-Za-z][A-Za-z'\-]*/g)) {
        const w = m[0].replace(/'$/, '').replace(/-$/, '');
        if (w.length < 2 || isWord(w)) continue;
        const k = w.toLowerCase();
        const e = notWords.get(k) || { count: 0, example: said, screen };
        e.count++;
        notWords.set(k, e);
    }
    // 2. letters and digits run together are read oddly ("rtg2x", "bd2")
    for (const m of said.matchAll(/\b(?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z0-9]{2,}\b/g))
        if (!/^\d+(st|nd|rd|th)$/i.test(m[0]) && !/^[A-Z]\d$/.test(m[0]))   // 1st, C3 are fine
            add('warn', 'letters-and-digits', kind, said, `"${m[0]}": say it as words ("retrigger times 2")`);
    // 3. signs a voice reads out loud or skips
    const sym = said.match(/[\/\\|<>*_=#\[\]{}~^@&$]/g);
    if (sym) add('error', 'symbols', kind, said, `${[...new Set(sym)].join(' ')}: put it in words`);
    if (/(^|\s)\+(\s|$)/.test(said)) add('error', 'symbols', kind, said, '"+": say "plus" or "and"');
    // 4. punctuation: one mark at a time, none after a space, no space runs
    if (/[,:;?!]\.|\.\.(?!\.)|,,|::/.test(said)) add('error', 'punctuation', kind, said, 'two marks in a row');
    if (/\s[,.:;?!]/.test(said)) add('error', 'punctuation', kind, said, 'a space before a mark');
    if (/\s{2,}/.test(said)) add('warn', 'punctuation', kind, said, 'two spaces');
    // 5. no word or phrase twice in a row ("909. 909 KIT"; a heading and its first item, "retrigger: retrigger
    //    times 2", are two things)
    for (const part of said.split(':')) {
    const ws = part.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);
    for (let n = 1; n <= 4; n++)
        for (let i = 0; i + 2 * n <= ws.length; i++)
            if (ws.slice(i, i + n).join(' ') === ws.slice(i + n, i + 2 * n).join(' ') && !/^\d+$/.test(ws[i]) && ws[i] !== 'oh') {
                add('error', 'repeated', kind, said, `"${ws.slice(i, i + n).join(' ')}" twice in a row`);
                n = 9;
                break;
            }
    }
    // 6. a SAY's length (the device cuts the rest)
    if (said.length > MAX) add('error', 'too-long', kind, said, `${said.length} characters, ${MAX} at most: the end is cut off`);
    // 7. what each kind of message needs
    if (kind === 'KNOB' && !/\d|\b(on|off)\b|[a-z]+$/i.test(said)) add('warn', 'readout-value', kind, said, 'a readout is the name, then the value');
    if (kind === 'KNOB' && said.split(/\s+/).length > 8) add('warn', 'readout-short', kind, said, 'a readout is heard while turning: keep it to the name and the value');
    if (kind === 'ROW' && !/\b\d+ of \d+$/i.test(said)) add('warn', 'list-position', kind, said, 'end a list row with its place: "4 of 20"');
    if (kind === 'HELP' && !/^\S+( \S+)? button\b/i.test(said) && !/^[a-z ]+ button/i.test(said)) add('warn', 'help-names-button', kind, said, 'start a help card with the button it is about');
    if (kind === 'SCREEN' && said.split(/\s+/).length > 45) add('warn', 'screen-long', kind, said, `${said.split(/\s+/).length} words: the page's name and its knobs first, the rest on WHERE`);
    for (const m of said.matchAll(/\b[0-9A-Fa-f]{4,}\b/g))       // a hex number: two digits and two of A-F at least
        if ((m[0].match(/\d/g) || []).length >= 2 && (m[0].match(/[a-f]/gi) || []).length >= 2)
            add('warn', 'noise', kind, said, `"${m[0]}": a hex number (a seed, an address) is noise when heard: leave it out`);
    if ((kind === 'WARN') && !/\b(not|no|full|failed|can't|cannot|stop|first|pick)\b/i.test(said))
        add('warn', 'warning-says-what', kind, said, 'a warning says what did not happen, and what to do');
    if (said === said.toUpperCase() && /[A-Z]{4,}/.test(said)) add('warn', 'capitals', kind, said, 'all capitals: some voices spell words in capitals letter by letter');
}

for (const [w, e] of notWords) add('warn', 'not-a-word', '', e.example, `"${w}" (${e.count}x): add it to the firmware's words table (announce.c ann_words), or to an allow list if it is meant`);

// report
const order = { error: 0, warn: 1 };
findings.sort((a, b) => order[a.level] - order[b.level] || a.rule.localeCompare(b.rule));
const byRule = new Map();
for (const f of findings) { const k = f.level + ' ' + f.rule; byRule.set(k, (byRule.get(k) || []).concat(f)); }
let shown = 0;
for (const [k, fs_] of byRule) {
    console.log(`\n${k.toUpperCase()}  (${fs_.length})`);
    for (const f of fs_.slice(0, all ? Infinity : 12)) {
        console.log(`  ${f.kind ? f.kind + ': ' : ''}${f.note}\n      "${f.said.length > 140 ? f.said.slice(0, 140) + '…' : f.said}"`);
        shown++;
    }
    if (!all && fs_.length > 12) console.log(`  … and ${fs_.length - 12} more (--all)`);
}
const errors = findings.filter((f) => f.level === 'error').length, warns = findings.length - errors;
console.log(`\n${lines.length} messages: ${errors} errors, ${warns} warnings${dictFile ? '' : ' (no dictionary: words not checked; --dict FILE)'}`);
process.exit(errors ? 1 : 0);
