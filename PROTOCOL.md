# FM-1 screen reader protocol (version 1)

A firmware with `firmware/announce.c` tells a reader what its screen shows. The reader is any program on the
computer: the page in `web/`, or `tools/fm1_reader.py`.

**The firmware is in charge of the words, without spending flash on them.**
- It sends its screen's own text ("BD TUNE 37").
- Its HELLO answer gives a link to its **words file**, which tells the reader how to say that text ("bass
  drum tune 37").
- The link names the exact words the build was made with, so a device on 1.0 and one on 1.6 each get their
  own.
- A reader needs to know nothing about any firmware.

## Framing

SysEx over USB-MIDI: `F0 7D 53 52 <cmd> <args…> F7`. `7D` is the non-commercial ID, and `53 52` is "SR".
Every byte between F0 and F7 is 7-bit. A device that doesn't support the protocol ignores these frames.

## Reader → device

| cmd | args | meaning |
|---|---|---|
| 1 HELLO | version (1) | Start or keep listening. Send it again every 2 s; a device that hears nothing for 5 s stops. |
| 2 BYE | — | Stop listening, e.g. when the page closes. |
| 3 WHERE | — | Say everything on the screen now. |

## Device → reader

| cmd | args | meaning |
|---|---|---|
| 1 HELLO | version, name, 0, link (ASCII to F7) | The answer to every HELLO. The name is the firmware and its version, e.g. "X0X 1.1". The link is the https URL of its words file, or empty. |
| 16 SAY | flags, text (ASCII to F7) | Something to say. At most 240 characters (`ANN_MAX`). |

SAY flags:
- **1 NOW**: cut off what is being said. Used for a knob turning, a new page, the answer to a button press.
  Without it, the message is queued.
- **2 KEEP**: a warning or an error. It is heard whole: what follows waits instead of cutting it off. A
  page sends it to an assertive live region.

## The words file

```json
{"format":1,"words":[["BD","bass drum"],["P#","pattern #"],["LENGTH # st","length # steps"],["NEW LINE *","new line"]]}
```

- **What it holds.** `firmware/words.tsv` lists the screen's text and what to say. `tools/gen_words.py`
  turns it into the JSON file: the firmware's own words first, then the common ones (FX, dB, MIDI CH, …), so
  the file holds everything for that build.
- **How it's named.** The file name is a fingerprint of the content (`c8a6bb1555.json`): the same words give
  the same file. A file is never changed or deleted. Each firmware keeps all of its files in its repo
  (`web/words/`) and publishes them on its own site.
- **How an entry matches.** Whole words, ignoring capitals; the longest match wins, and an earlier entry
  wins a tie. `#` takes a number and says it; `*` takes a word and leaves it out.
- **What the reader does on its own.** After the list, it applies the common rules (`web/words.js`):
  - numbers: 1/16, 1/8T, 1/8., 4:1, 1-16, 2/3, x2, C#3, %
  - signs: " + ", " / ", "(1/2)"
  - punctuation clean-up
  - words in capitals become ordinary words
- **Without the file** (offline, or not published yet), the reader uses only those common rules. The page
  keeps each file it has fetched; links never change, so a kept file stays right.

## Behaviour

- **Silent until asked.** A device sends nothing until a HELLO arrives, so a DAW on the same port never
  sees a byte. After 5 s without a HELLO, it stops.
- **The first HELLO** from a new reader also means WHERE: the reader hears the whole screen first.
- **Not too often.** A knob's value is sent once it has been still for about 120 ms, and at least every
  ~500 ms while it keeps turning.
- **No waiting.** The device never waits to send: with no room in its USB queue, the message is dropped.
- **Finding devices.** A reader that doesn't know which port is an FM-1 sends HELLO to each port a few times
  and keeps the ones that answer. The page in `web/` stops asking a port after three tries.
