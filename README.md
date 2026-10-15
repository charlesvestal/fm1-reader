# FM-1 Screen Reader

Hear what an M-VAVE FM-1's screen says: pages, knobs as they turn, messages, help, lists and steps. The FM-1
sends its screen as words over USB, and the reader page speaks them with its own voice, or hands them to your
screen reader (VoiceOver, NVDA, JAWS, TalkBack).

**Use it:** plug in the FM-1, open https://charlesvestal.github.io/fm1-reader/ in Chrome or Edge, and click
Connect. Firmwares with support: X0X.

## For firmware developers

Each firmware is in charge of its own words. The page is the same for all of them and knows nothing about
any one. Support is one shared file, a table of the firmware's words, and a function that says what changed
on the screen.

| | |
|---|---|
| `firmware/announce.c` | The shared code: protocol, words, timing. Copy it, don't edit the copy (`tools/sync_announce.sh`). |
| `PROTOCOL.md` | The SysEx (`F0 7D 53 52 …`). |
| `skill/fm1-screen-reader/` | A Claude Code skill: `SKILL.md` (the steps), `INTEGRATION.md` (the code), `RULES.md` (the words). |
| `tools/audit.mjs` | Checks a firmware's words against the rules: `node tools/audit.mjs dump.tsv`. |
| `tools/fm1_reader.py` | A reader in the terminal, for checking a device (`--where --seconds 20`). |
| `web/` | The page. espeak-ng (English) runs in it as WebAssembly (`tools/build_espeak_web.sh`). |
| `tests/run_tests.sh` | announce.c's test, and the audit on good and bad fixtures. |

To use the skill with Claude Code, link it into your skills:
`ln -s "$PWD/skill/fm1-screen-reader" ~/.claude/skills/`. Then ask Claude to "add screen reader support"
to a firmware.

It costs a firmware about 3 KB of flash plus about 20 B a word in its table, and about 300 B of RAM, plus the
USB send queue (see INTEGRATION.md).

## Credits

Built on [Felucca](https://github.com/hugelton/Felucca) (Hügelton Instruments). The voice is
[eSpeak NG](https://github.com/espeak-ng/espeak-ng). GPL-3.0.
