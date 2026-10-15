# FM-1 Screen Reader

Hear what an M-VAVE FM-1's screen says: pages, knobs as they turn, messages, help, lists and steps. The FM-1
sends its screen over USB with a link to its own words, and the reader page speaks them with its own voice,
or hands them to your screen reader (VoiceOver, NVDA, JAWS, TalkBack).

**Use it:** plug in the FM-1, open https://charlesvestal.github.io/fm1-reader/ in Chrome or Edge, and click
Connect. Firmwares with support: [X0X](https://charlesvestal.github.io/fm1-x0x/) 1.1.0,
[AMB-1](https://charlesvestal.github.io/fm1-amb/) 1.2, [Polly](https://charlesvestal.github.io/fm1-polly/) 0.4.3,
[MONK-1](https://charlesvestal.github.io/fm1-monk/) 0.9.1, [Mocky](https://charlesvestal.github.io/fm1-mocky/) 0.9.1.

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

The skill expects fm1-reader at `../fm1-reader`, next to the firmware; the agent clones it there if not.

It costs a firmware about 1.5 KB of flash and about 300 B of RAM, plus the USB send queue (see
INTEGRATION.md). X0X's support in all comes to 2.3 KB of flash.

## Credits

Built on [Felucca](https://github.com/hugelton/Felucca) (Hügelton Instruments). The voice is
[eSpeak NG](https://github.com/espeak-ng/espeak-ng). GPL-3.0.
