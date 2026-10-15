# FM-1 Screen Reader

Hear what an M-VAVE FM-1's screen says: pages, knobs as they turn, messages, help, lists and steps. The FM-1
sends its screen over USB with a link to its own words, and the reader page speaks them with its own voice,
or hands them to your screen reader (VoiceOver, NVDA, JAWS, TalkBack).

**Use it:** plug in the FM-1, open https://charlesvestal.github.io/fm1-reader/ in Chrome or Edge, and click
Connect. Firmwares with support: X0X.

## For firmware developers

Each firmware is in charge of its own words, and they cost it no flash.
- It sends its screen's text, and a link to a **words file** published on its own site.
- The file is named by a fingerprint of its words, so each version of a firmware points at exactly its own.
- The page is the same for all firmwares and knows nothing about any one.
- Support is one shared file, a list of the firmware's words, and a function that says what changed on the
  screen.

| | |
|---|---|
| `firmware/announce.c` | The shared code: protocol and timing. Copy it, don't edit the copy (`tools/sync_announce.sh`). |
| `tools/gen_words.py` | `words.tsv` to the words file and the link the device sends (copied into each firmware too). |
| `web/words.js` | How a text is said with a words file: one copy, for the page, the audit and the tests. |
| `PROTOCOL.md` | The SysEx (`F0 7D 53 52 …`). |
| `skill/fm1-screen-reader/` | A Claude Code skill: `SKILL.md` (the steps), `INTEGRATION.md` (the code), `RULES.md` (the words). |
| `tools/audit.mjs` | Checks a firmware's words against the rules: `node tools/audit.mjs dump.tsv --words file.json`. |
| `tools/fm1_reader.py` | A reader in the terminal, for checking a device (`--where --seconds 20`). |
| `web/` | The page. espeak-ng (English) runs in it as WebAssembly (`tools/build_espeak_web.sh`). |
| `tests/run_tests.sh` | announce.c's test, and the audit on good and bad fixtures. |

To use the skill with Claude Code, link it into your skills:
`ln -s "$PWD/skill/fm1-screen-reader" ~/.claude/skills/`. Then ask Claude to "add screen reader support"
to a firmware.

It costs a firmware about 1.5 KB of flash and about 300 B of RAM, plus the USB send queue (see
INTEGRATION.md). X0X's support in all comes to 2.3 KB of flash.

## Credits

Built on [Felucca](https://github.com/hugelton/Felucca) (Hügelton Instruments). The voice is
[eSpeak NG](https://github.com/espeak-ng/espeak-ng). GPL-3.0.
