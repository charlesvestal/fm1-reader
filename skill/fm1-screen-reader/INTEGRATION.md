# Adding screen reader support to an FM-1 firmware

All the FM-1 firmwares share Felucca's platform layer (`usb.c`, `ota.c`, `main_*.c`), so the hookup is the
same in each. X0X is the worked example: `fm1-x0x/firmware/src/app/ui.c`, the "screen reader" section.

## 1. The shared file

Copy `fm1-reader/firmware/announce.c` into `firmware/src/announce.c`. Don't edit the copy: change the original
in fm1-reader and copy it again (`fm1-reader/tools/sync_announce.sh ../fm1-<name>`).

## 2. The platform: send, receive, tick

In the firmware's unity file (X0X: `firmware/src/x0x.c`), after `usb.c` and `ota.c` and before the app:

```c
#define ANN_NAME "NAME " NAME_VERSION          /* the HELLO answer: the firmware and its version */
#include "announce.c"
static int ann_wire_send(const uint8_t *p, uint32_t n)   /* never waits: no room (nobody reading), not sent */
{
    if (!usb.config || usb.suspended || SXQ - (so_w - so_r) < (n + 2u) / 3u)
        return -1;
    return ota_wire_send(p, n);
}
```

**The send queue.** In `usb.c`, the SysEx queue must hold a whole SAY, `(ANN_MAX + 9) / 3` packets. With
the default `ANN_MAX` of 240, set `#define SXQ 128u` (it was 64; this costs 256 B of RAM). If RAM is tight,
keep 64 and `#define ANN_MAX 160u` before the include.

**Receiving.** In the main loop, before the editor and the updater read SysEx frames:

```c
{   /* a screen reader's SysEx (announce.c), before the editor and the updater look */
    const uint8_t *p;
    uint32_t n;
    if (ota_frame_get(&p, &n) && ann_frame(p, n, now_ms))
        ota_frame_done();
}
```

**Messages.** Where the app shows a message (a `say()`, `toast()` or `msg()`), also send it:
`ann_say(a, b, ANN_NOW)`. A warning or an error uses `ANN_NOW | ANN_KEEP` (X0X: `warn()`).

**The tick.** At the end of the UI frame (X0X: `ui_frame()`), call the app's `speak()` and then
`ann_tick(now_ms)`.

## 3. The words table

The screen's abbreviations, said in full, in flash (about 20 B an entry):

```c
static const ann_word_t NAME_WORDS[] = {
    {"BD", "bass drum"}, {"P#", "pattern #"}, {"P#-#", "patterns # to #"},
    {"LENGTH # st", "length # steps"}, {"NEW LINE *", "new line"},
};
/* in ui_init(): */ ann_words(NAME_WORDS, sizeof NAME_WORDS / sizeof NAME_WORDS[0]);
```

- **Wildcards.** `#` takes a number and puts it in the spoken text. `*` takes a word and drops it.
- **Matching.** Entries match whole words, ignoring capitals; the longest match wins. The app's entries come
  before the common ones (`ANN_COMMON` in announce.c), so a firmware can give "REV" its own meaning.
- **What's already handled.** announce.c says fractions, triplets, dotted values, ratios, ranges, sharps,
  "x2", "%", "+", " / " and "(1/2)" page marks, and lowercases words in capitals. Don't add entries for those.

## 4. speak(): what changed on the screen

Don't put calls all through the UI. Instead, once a frame, compare the screen's state with the last frame
and say what changed. X0X's `speak()` does it in about 100 lines:

- **Everything** (`!started || ann_where()`): the screen's name, the page's knobs with their values, and
  anything else a sighted user takes in at a glance (X0X: the steps that are on). Send it NOW.
- **The context changed** (a hash of view, page, overlay, help card, the selected track): the screen and
  its knobs. Use `ann_later(text, ANN_NOW, 200, now)` so flipping through pages settles before speaking.
- **A knob is turning** (the readout on screen): "name value". Use `ann_later(..., 120, now)`, and only
  when the text changes.
- **A list:** the row moved to, or its value changed, with its place: "tune 66, 2 of 14". When a new
  section starts, say its name first.
- **Transport:** play / stop, and the pattern or program changing.
- **Steps or keys** the user toggles: send them directly from the key handler, e.g. "step 5 on".

Build the text into a buffer in the pool (X0X: `sp_buf`, 241 B), not on the 8 KiB system stack.
`announce.c` itself needs about 300 B of RAM and about 1 KB of stack in the main loop (never in the
audio interrupt).

## 5. The simulator: a dump and a log

Two things for the audit.

**`speakdump`.** A host-only command that walks every screen, page, knob, list row, enum value and help
card, and prints `KIND<TAB>screen text<TAB>words` for each. Get the words with
`ann_spoken(w, sizeof w, text)`. X0X: `speak_dump()` in ui.c, under `#ifdef X0X_HOST`.

**`<NAME>_SAID_LOG=FILE`.** The simulator listens from boot and appends every SAY to FILE as
`MSG<TAB><TAB>words` (`WARN` when the KEEP flag is set). Running the scenario tests then collects every
action message.

Also add script commands `listen`, `where` and `said TEXT` (X0X: `host/x0x_host.c`), and a scenario that
checks the main paths. Any `expect`-style failure fails the tests.

## 6. The web emulator, if there is one

Export the SysEx in and the frames out (X0X: `web/emu/x0x_web.c`, `web_sysex` / `web_said_buf`), so the
emulator page can speak too.
