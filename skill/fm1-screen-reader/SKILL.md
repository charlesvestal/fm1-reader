---
name: fm1-screen-reader
description: Add screen reader support to an M-VAVE FM-1 firmware (Felucca-based), audit and fix the words it says, and check it on the device. Use when asked to make an FM-1 firmware accessible, to "add the screen reader", "announce", or to audit or validate a firmware's screen-reader messages.
---

# FM-1 screen reader support

The firmware tells a reader on the computer what its screen shows, in words, over USB-MIDI SysEx. The
firmware is in charge of the words. The reader page (fm1-reader `web/`, published at
https://charlesvestal.github.io/fm1-reader/) is the same for every firmware: it shows the words and speaks
them, or hands them to the user's own screen reader.

Everything lives in the `fm1-reader` repo (next to the firmware: `../fm1-reader`, or clone
github.com/charlesvestal/fm1-reader):

- `firmware/announce.c`: the shared code (protocol, words, timing). One copy; firmwares copy it.
- `PROTOCOL.md`: the SysEx.
- `skill/fm1-screen-reader/INTEGRATION.md`: how to wire it in, step by step, with code.
- `skill/fm1-screen-reader/RULES.md`: the rules for the words. Read it before writing any.
- `tools/audit.mjs`: checks a firmware's words against the rules.
- `tools/fm1_reader.py`: a reader in the terminal, for checking the device.
- `tests/announce_test.c`: announce.c's own test.

## The work, in order

Use a task list. Don't skip the audit or the device check.

1. **Read** INTEGRATION.md and RULES.md, and the firmware's UI. Find:
   - how it shows a message (`say()` / toast)
   - its views, pages and knobs
   - lists, help cards, questions
   - what the keys do
2. **Wire it in** (INTEGRATION.md, sections 1–2): the copy of announce.c, `ann_wire_send`, the queue size,
   the frames in, `ann_tick`, and messages through `ann_say` (warnings with ANN_KEEP).
3. **The words table** (section 3): every abbreviation the screen uses. Gather them from:
   - the parameter names and enum labels in the DSP and UI sources (often 5–6 characters)
   - the help text, page titles and part names
4. **`speak()`** (section 4): everything on WHERE, and the context, readouts, lists, transport and
   steps as they change.
5. **The simulator** (section 5): `speakdump`, `*_SAID_LOG`, and the `listen` / `where` / `said` commands,
   plus a scenario under `tests/scenarios/` that walks the main paths with `said` checks.
6. **Audit** until it reports no errors, and no warnings you haven't decided to keep:
   ```sh
   build/host/<name>_host <dump script with "speakdump"> build/sr | grep -v '^host' | sort -u > build/sr/dump.tsv
   rm -f build/sr/said.tsv; for f in tests/scenarios/*.<ext>; do <NAME>_SAID_LOG=$PWD/build/sr/said.tsv build/host/<name>_host $f build/scenarios >/dev/null; done
   sort -u build/sr/said.tsv | cat build/sr/dump.tsv - | node ../fm1-reader/tools/audit.mjs /dev/stdin
   ```
   - **Fix the cause, in the firmware.** Use the words table, how `speak()` builds a sentence, or the
     string itself; never the page.
   - **Read the dump yourself too.** The audit can't judge meaning: a table entry can be right in one
     place and wrong in another ("CH": closed hat or channel?).
   - **Words the firmware really means** (a product name, a word the dictionary lacks) go in an allow list
     passed with `--allow`, kept in the firmware's repo.
7. **Budget:** the build's RAM and flash checks pass, and the room left is noted. The table costs about
   20 B of flash an entry; announce.c about 3 KB of flash and 300 B of RAM.
8. **On the device.** Flash it, then run `python3 ../fm1-reader/tools/fm1_reader.py --where --seconds 20`
   while turning knobs, changing pages and pressing buttons. Every action should be heard once, in words.
   Then open the page in Chrome and try it with its voice and with VoiceOver.
9. **Tests:** the firmware's test script passes, and `cc ... ../fm1-reader/tests/announce_test.c` too, if
   announce.c changed.

## The rules in short (RULES.md has them all)

- **Words.** Real words, not abbreviations. One meaning per word. Numbers said the way people say them.
  No symbols, no hex noise, no capitals.
- **Sentences.** The most important thing first (name, then value). Say a thing once. One punctuation
  mark at a time. At most 240 characters.
- **Context.** A new page says its name. A list row says "4 of 20". A help card names its button. Every
  action is answered. Warnings use ANN_KEEP and say what didn't happen. Questions say how to answer.
- **Timing.** NOW for the answer to what the user did. Readouts and pages wait to settle (ann_later). Nothing
  that changes by itself every beat.

## Don't

- Put a firmware's words in the page. The page is generic; the firmware is in charge.
- Send anything before a HELLO: announce.c already holds back, so don't get around it.
- Wait in `ann_wire_send`: drop the message when the queue is full.
- Build text in the audio interrupt or on the 8 KiB system stack.
- Edit a firmware's copy of announce.c. Change fm1-reader's, run its test, and sync.
