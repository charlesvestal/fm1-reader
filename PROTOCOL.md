# FM-1 screen reader protocol (version 1)

A firmware with `firmware/announce.c` tells a reader, in words, what its screen shows. The reader is any
program on the computer: the page in `web/`, or `tools/fm1_reader.py`. The firmware is in charge of the
words: it sends text ready to speak ("bass drum tune 37", not "BD TUNE 37"). A reader shows it and speaks it,
and never needs to know which firmware sent it.

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
| 1 HELLO | version, name (ASCII to F7) | The answer to every HELLO. The name is the firmware and its version, e.g. "X0X 1.1". |
| 16 SAY | flags, text (ASCII to F7) | Something to say. At most 240 characters (`ANN_MAX`). |

SAY flags:
- **1 NOW**: cut off what is being said. Used for a knob turning, a new page, the answer to a button press.
  Without it, the message is queued.
- **2 KEEP**: a warning or an error. It is heard whole: what follows waits instead of cutting it off. A
  page sends it to an assertive live region.

## Behaviour

- **Silent until asked.** A device sends nothing until a HELLO arrives, so a DAW on the same port never
  sees a byte. After 5 s without a HELLO, it stops.
- **The first HELLO** from a new reader also means WHERE: the reader hears the whole screen first.
- **Not too often.** A knob's value is sent once it has been still for about 120 ms, and at least every
  ~500 ms while it keeps turning.
- **No waiting.** The device never waits to send: with no room in its USB queue, the message is dropped.
- **Finding devices.** A reader that doesn't know which port is an FM-1 sends HELLO to each port a few times
  and keeps the ones that answer. The page in `web/` stops asking a port after three tries.
