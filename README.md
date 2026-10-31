# FM-1 Screen Reader

Hear what an M-VAVE FM-1's screen says: pages, knobs as they turn, messages, help, lists and steps. The FM-1
sends its screen over USB with a link to its own words, and the reader page speaks them with its own voice,
or hands them to your screen reader (VoiceOver, NVDA, JAWS, TalkBack).

**Use it:** plug in the FM-1, open https://charlesvestal.github.io/fm1-reader/ in Chrome or Edge, and click
Connect.

Firmwares with support:
- [X0X](https://charlesvestal.github.io/fm1-x0x/) 1.1.0+
- [FoMni-1](https://charlesvestal.github.io/fm1-fomni/) 0.4+
- [AMB-1](https://charlesvestal.github.io/fm1-amb/) 1.2+
- [Polly](https://charlesvestal.github.io/fm1-polly/) 0.4.3+
- [MONK-1](https://charlesvestal.github.io/fm1-monk/) 0.9.1+
- [Mocky](https://charlesvestal.github.io/fm1-mocky/) 0.9.1+
- [CTL-1](https://charlesvestal.github.io/fm1-ctl/) 0.9.1+

## For firmware developers

Each firmware is in charge of its own words, and they cost it no flash.
- It sends its screen's text, and a link to a **words file** published on its own site.
- The file is named by a fingerprint of its words, so each version of a firmware points at exactly its own.
- The page is the same for all firmwares and knows nothing about any one.
- Support is one shared file, a list of the firmware's words, and a function that says what changed on the
  screen.

| | |
|---|---|
| fm1-base's `device/announce.c` | The shared code: protocol and timing. Its one copy is in [fm1-base](https://github.com/charlesvestal/fm1-base), with its test; a firmware on fm1-base has it. |
| fm1-base's `tools/gen_words.py` | `words.tsv` to the words file and the link the device sends. In fm1-base too. |
| `tools/sync_announce.sh` | Copies those two into a firmware not on fm1-base (`../fm1-x0x`), and fm1-base's `web/fm1ports.js` here; `--check` reports a copy that differs. Don't edit the copies. |
| `web/words.js` | How a text is said with a words file: one copy, for the page, the audit and the tests. |
| `web/reader.js`, `web/fm1ports.js` | Finding FM-1s on Web MIDI. `fm1ports.js` is a copy of fm1-base's, which its installer and backup pages use too. |
| `PROTOCOL.md` | The SysEx (`F0 7D 53 52 …`). |
| `skill/fm1-screen-reader/` | A Claude Code skill: `SKILL.md` (the steps), `INTEGRATION.md` (the code), `RULES.md` (the words). |
| `tools/audit.mjs` | Checks a firmware's words against the rules: `node tools/audit.mjs dump.tsv --words file.json`. |
| `tools/fm1_reader.py` | A reader in the terminal, for checking a device (`--where --seconds 20`). |
| `web/` | The page. espeak-ng (English) runs in it as WebAssembly (`tools/build_espeak_web.sh`). |
| `tests/run_tests.sh` | The words, finding FM-1s, the audit on good and bad fixtures, and the copy of `fm1ports.js`. |

### Adding support with a coding agent

Paste this into your agent (Claude Code, Codex, Cursor, …) in your firmware's repo:

> Clone https://github.com/charlesvestal/fm1-reader into `../fm1-reader` (next to this firmware), unless
> it's already there. Read `../fm1-reader/skill/fm1-screen-reader/SKILL.md` and follow it to add screen
> reader support to this firmware. Read `INTEGRATION.md` and `RULES.md` in the same folder first. Put the
> words file's link on this firmware's own GitHub Pages site. Work through every step: the audit must report
> no errors, the build's RAM and flash checks must pass, and the tests must pass. Stop before flashing a
> device or publishing anything, and tell me what's left for me to check.

With Claude Code you can install the skill once instead, then just ask to "add screen reader support":

```sh
git clone https://github.com/charlesvestal/fm1-reader ~/fm1-reader
ln -s ~/fm1-reader/skill/fm1-screen-reader ~/.claude/skills/
```

The skill expects fm1-reader at `../fm1-reader`, next to the firmware; the agent clones it there if not. A
firmware on [fm1-base](https://github.com/charlesvestal/fm1-base) already has the firmware side. One that isn't
needs fm1-base next to fm1-reader too (`../fm1-base`), since `tools/sync_announce.sh` copies the files from there.

It costs a firmware about 1.5 KB of flash and about 300 B of RAM, plus the USB send queue (see
INTEGRATION.md). X0X's support in all comes to 2.3 KB of flash.

## Credits

For FM-1 firmwares built on [Felucca](https://github.com/hugelton/Felucca) (Hügelton Instruments): the hookup
uses their shared USB and update code. The voice is [eSpeak NG](https://github.com/espeak-ng/espeak-ng).

## Licence

MIT (see LICENSE), so any firmware can use it, GPL or not. The exceptions:
- The voice: `web/espeak/` (eSpeak NG and its wrapper) and `web/tts_worker.js`, which runs it, are
  GPL-3.0-or-later, like eSpeak NG. A page that uses the voice carries both side by side.
- `web/fm1ports.js` is fm1-base's, MPL-2.0 (its header says so).

The firmware side, `announce.c` and `gen_words.py`, lives in fm1-base and is MPL-2.0 there, like the rest of
fm1-base (it was MIT here). MPL-2.0 is compatible with the GPL, so GPL firmwares can carry it. The copies already in
the older firmwares not on fm1-base (X0X, FoMni-1, MONK-1 and Mocky, which are GPL) stay under their repositories'
licences until `tools/sync_announce.sh` copies them again.
