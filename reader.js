// SPDX-License-Identifier: MIT
// The FM-1 screen reader's link (PROTOCOL.md): Web MIDI to any firmware with announce.c. The firmware is in
// charge of the words: it sends its screen's text and, with its HELLO, the link to its words file; this page
// knows nothing about any firmware. Every MIDI port is asked (HELLO); the ones that answer are FM-1s. How ports are
// asked and paired, and what an answer is, is fm1-base's web/fm1ports.js (a copy: tools/sync_announce.sh).
//   const r = findReaders(midi, { onFound(name, reader), onSay(name, text, now, keep), onLost(name) });
//   reader.words: the link to its words file ('' none)
//   r.where(name);  r.rescan();  r.close();
import { outputFor, srFrame, srHello, isSr, Asking, SR_HELLO, SR_BYE, SR_WHERE, SR_SAY, SR_VER } from './fm1ports.js';

const GONE_MS = 5000;

export function findReaders(midi, { onFound, onSay, onLost } = {}) {
    const found = new Map();                         // input id -> { name, words, out, inp, heard }
    const text = (d) => String.fromCharCode(...d.slice(6, d.length - 1).filter((b) => b && b < 128));
    const send = (out, cmd, ...a) => { try { out.send(srFrame(cmd, ...a)); } catch (e) { /* unplugged */ } };

    function onmsg(e) {
        const d = e.data, inp = e.target;
        if (!isSr(d)) return;
        let f = found.get(inp.id);
        if (d[4] === SR_HELLO) {
            const h = srHello(d);
            if (!h) return;                          // (a HELLO back from a loopback: no name)
            const out = outputFor(midi, inp);
            if (!f) {
                f = { name: h.name, words: h.words, out, inp };
                found.set(inp.id, f);
                onFound && onFound(f.name, f);
                // the whole screen: a device sends it by itself to its first reader; when nothing comes (it was
                // already talking to another reader), ask. Only after it has answered: it takes one SysEx at a
                // time (one sent right behind the HELLO can be lost)
                if (out) setTimeout(() => { if (!f.said) send(out, SR_WHERE); }, 400);
            }
            f.heard = performance.now();
        } else if (d[4] === SR_SAY && f && onSay) {
            f.said = true;
            onSay(f.name, text(d), (d[5] & 1) !== 0, (d[5] & 2) !== 0);
        }
    }
    const watched = new Set();
    function watch() {
        for (const inp of midi.inputs.values())
            if (!watched.has(inp)) { inp.addEventListener('midimessage', onmsg); watched.add(inp); }
    }
    // a port is asked three times when it appears; after that only the ones that answered are (fm1ports.js Asking:
    // other gear on the computer gets three short SysEx it ignores, not one every two seconds)
    const asking = new Asking();
    function tick() {
        watch();
        const mine = new Set([...found.values()].map((f) => f.out));
        for (const out of midi.outputs.values())
            if (out.state !== 'disconnected' && asking.due(out, mine.has(out))) send(out, SR_HELLO, SR_VER);
        const now = performance.now();
        for (const [id, f] of found)
            if (now - f.heard > GONE_MS) { found.delete(id); f.out && asking.forget(f.out.id); onLost && onLost(f.name); }
    }
    tick();
    // the HELLO's beat comes from a worker: Chrome slows a background tab's own timers to once a minute, and the
    // device, not hearing from its reader for 5 s, would stop and then, at the next HELLO, say the whole screen
    // again. A worker's timer keeps time while you play the FM-1 with this tab behind.
    let timer, beat = null;
    try {
        beat = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 2000);'], { type: 'text/javascript' })));
        beat.onmessage = tick;
    } catch (e) {
        timer = setInterval(tick, 2000);                // (no workers: the tab's own timer)
    }
    const changed = (e) => { if (e.port.state === 'disconnected') asking.forget(e.port.id); };   // plugged in again: asked again
    midi.addEventListener('statechange', changed);
    const bye = () => { for (const f of found.values()) f.out && send(f.out, SR_BYE); };
    addEventListener('pagehide', bye);
    return {
        get readers() { return [...found.values()]; },
        rescan() { asking.clear(); tick(); },
        where(name) { for (const f of found.values()) if (!name || f.name === name) f.out && send(f.out, SR_WHERE); },
        close() {
            clearInterval(timer);
            if (beat) beat.terminate();
            bye();
            removeEventListener('pagehide', bye);
            midi.removeEventListener('statechange', changed);
            for (const inp of watched) inp.removeEventListener('midimessage', onmsg);
        },
    };
}
