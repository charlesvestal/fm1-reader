// SPDX-License-Identifier: MIT
// web/reader.js (with fm1-base's web/fm1ports.js) finding FM-1s on a fake Web MIDI: an FM-1, one under another name
// that answers late, one whose input and output Windows numbers apart, a loopback (macOS's IAC bus: what goes out comes
// back in) and other gear that answers nothing.   node tests/reader_test.mjs
import { findReaders } from '../web/reader.js';
import { srHello, outputFor } from '../web/fm1ports.js';

globalThis.addEventListener ??= () => {};          // (the page's pagehide)
globalThis.removeEventListener ??= () => {};
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const HELLO = [0xf0, 0x7d, 0x53, 0x52, 1, 1, 0xf7].join(), WHERE = [0xf0, 0x7d, 0x53, 0x52, 3, 0xf7].join();

// a port pair; rx(bytes, tx) is the device on it
function pair(inName, outName, rx) {
    const ears = new Set(), sent = [];
    const input = { id: 'i-' + inName, name: inName, state: 'connected', addEventListener: (t, f) => ears.add(f),
                    removeEventListener: (t, f) => ears.delete(f) };
    const tx = (b) => setTimeout(() => ears.forEach((f) => f({ data: Uint8Array.from(b), target: input })), 1);
    const output = { id: 'o-' + outName, name: outName, state: 'connected', send: (b) => { sent.push(Array.from(b).join()); rx(Array.from(b), tx); } };
    return { input, output, sent };
}
const fm1 = (name, link, delay = 1) => (d, tx) => {
    if (d[1] !== 0x7d || d[2] !== 0x53 || d[3] !== 0x52) return;
    if (d[4] === 1) setTimeout(() => tx([0xf0, 0x7d, 0x53, 0x52, 1, 1, ...ascii(name), 0, ...ascii(link), 0xf7]), delay);
    if (d[4] === 3) setTimeout(() => tx([0xf0, 0x7d, 0x53, 0x52, 16, 1, ...ascii('BD TUNE 37'), 0xf7]), delay);
};
const ports = {
    iac: pair('IAC Driver Bus 1', 'IAC Driver Bus 1', (d, tx) => tx(d)),
    other: pair('Arturia KeyStep', 'Arturia KeyStep', () => {}),
    x0x: pair('FM-1', 'FM-1', fm1('X0X 1.1', 'https://example.org/words/0123456789.json')),
    late: pair('Felucca', 'Felucca', fm1('AMB-1 1.3', 'not a link', 1500)),
    win: pair('FM-1 MIDI 1', 'FM-1 MIDI 2', fm1('CTL-1 1.0', '')),
};
const list = Object.values(ports);
const midi = { inputs: new Map(list.map((p) => [p.input.id, p.input])), outputs: new Map(list.map((p) => [p.output.id, p.output])),
               addEventListener() {}, removeEventListener() {} };

// what an answer is (fm1ports.js)
check(srHello([0xf0, 0x7d, 0x53, 0x52, 1, 1, 0xf7]) === null, 'a HELLO sent back (a loopback) is no answer');
const h = srHello([0xf0, 0x7d, 0x53, 0x52, 1, 1, ...ascii('X0X 1.1'), 0, ...ascii('http://x/y.json'), 0xf7]);
check(h && h.name === 'X0X 1.1' && h.words === '', 'an answer: its name; a link that is not https .json is dropped');
check(outputFor(midi, ports.win.input) === ports.win.output, 'an input paired with its output numbered apart (Windows)');

const said = [], lost = [];
const r = findReaders(midi, { onSay: (name, text) => said.push(`${name}: ${text}`), onLost: (name) => lost.push(name) });
await sleep(5000);                                 // three HELLOs (at 0, 2 and 4 s), the late one answered
const names = r.readers.map((f) => f.name).sort();
check(names.join() === 'AMB-1 1.3,CTL-1 1.0,X0X 1.1', `found the three FM-1s, not the loopback (${names.join(' / ')})`);
check(r.readers.find((f) => f.name === 'X0X 1.1').words === 'https://example.org/words/0123456789.json', 'its words link');
check(ports.other.sent.length === 3 && ports.other.sent.every((s) => s === HELLO), 'other gear: three HELLOs, nothing else');
check(ports.iac.sent.length === 3 && ports.iac.sent.every((s) => s === HELLO), 'the loopback: three HELLOs, no WHERE');
check(ports.x0x.sent.includes(WHERE) && ports.win.sent.includes(WHERE), 'an FM-1 that sent nothing by itself is asked WHERE');
check(said.includes('X0X 1.1: BD TUNE 37') && said.includes('CTL-1 1.0: BD TUNE 37'), 'what they say comes through');
await sleep(2100);
check(ports.x0x.sent.filter((s) => s === HELLO).length === 4 && ports.other.sent.length === 3,
      'after three: only the FM-1s are asked, to keep them listening');
check(!lost.length, 'none lost while they answer');
r.close();
console.log(fails ? `reader: ${fails} FAILED` : 'reader: all passed');
process.exit(fails ? 1 : 0);
