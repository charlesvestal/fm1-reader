// SPDX-License-Identifier: GPL-3.0-only
// The FM-1 screen reader's link (PROTOCOL.md): Web MIDI to any firmware with announce.c. The firmware is in
// charge of the words: it sends its screen's text and, with its HELLO, the link to its words file; this page
// knows nothing about any firmware. Every MIDI port is asked (HELLO); the ones that answer are FM-1s.
//   const r = findReaders(midi, { onFound(name, reader), onSay(name, text, now, keep), onLost(name) });
//   reader.words: the link to its words file ('' none)
//   r.where(name);  r.rescan();  r.close();

const H = [0x7d, 0x53, 0x52];
const HELLO = 1, BYE = 2, WHERE = 3, SAY = 16, VER = 1;
const GONE_MS = 5000;

export function findReaders(midi, { onFound, onSay, onLost } = {}) {
    const found = new Map();                         // input name -> { name, out, heard }
    const frame = (cmd, ...a) => [0xf0, ...H, cmd, ...a, 0xf7];
    const text = (d) => String.fromCharCode(...d.slice(6, d.length - 1).filter((b) => b && b < 128));
    const parts = (d) => String.fromCharCode(...d.slice(6, d.length - 1).filter((b) => b < 128)).split('\0');
    const send = (out, cmd, ...a) => { try { out.send(frame(cmd, ...a)); } catch (e) { /* unplugged */ } };
    const outFor = (inp) => [...midi.outputs.values()].find((o) => o.name === inp.name) || null;

    function onmsg(e) {
        const d = e.data, inp = e.target;
        if (d[0] !== 0xf0 || d[1] !== H[0] || d[2] !== H[1] || d[3] !== H[2]) return;
        let f = found.get(inp.id);
        if (d[4] === HELLO) {
            const out = outFor(inp);
            if (!f) {
                const [name, words = ''] = parts(d);
                f = { name, words: /^https:\/\/[^\s"']+\.json$/.test(words) ? words : '', out, inp };
                found.set(inp.id, f);
                onFound && onFound(f.name, f);
            }
            f.heard = performance.now();
        } else if (d[4] === SAY && f && onSay) {
            onSay(f.name, text(d), (d[5] & 1) !== 0, (d[5] & 2) !== 0);
        }
    }
    const watched = new Set();
    function watch() {
        for (const inp of midi.inputs.values())
            if (!watched.has(inp)) { inp.addEventListener('midimessage', onmsg); watched.add(inp); }
    }
    // a port is asked three times when it appears; after that only the ones that answered are (other gear on
    // the computer gets three short SysEx it ignores, not one every two seconds)
    const asked = new Map();
    function tick() {
        watch();
        const mine = new Set([...found.values()].map((f) => f.out));
        for (const out of midi.outputs.values()) {
            const k = asked.get(out.id) || 0;
            if (mine.has(out) || k < 3) { send(out, HELLO, VER); asked.set(out.id, k + 1); }
        }
        const now = performance.now();
        for (const [id, f] of found)
            if (now - f.heard > GONE_MS) { found.delete(id); asked.delete(f.out && f.out.id); onLost && onLost(f.name); }
    }
    tick();
    const timer = setInterval(tick, 2000);
    const changed = (e) => { if (e.port.state === 'disconnected') asked.delete(e.port.id); };   // plugged in again: asked again
    midi.addEventListener('statechange', changed);
    const bye = () => { for (const f of found.values()) f.out && send(f.out, BYE); };
    addEventListener('pagehide', bye);
    return {
        get readers() { return [...found.values()]; },
        rescan() { asked.clear(); tick(); },
        where(name) { for (const f of found.values()) if (!name || f.name === name) f.out && send(f.out, WHERE); },
        close() {
            clearInterval(timer);
            bye();
            removeEventListener('pagehide', bye);
            midi.removeEventListener('statechange', changed);
            for (const inp of watched) inp.removeEventListener('midimessage', onmsg);
        },
    };
}
