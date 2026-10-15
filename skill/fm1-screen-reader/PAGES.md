# Accessible web pages for an FM-1 firmware

Every page a firmware publishes should work with a screen reader and a keyboard: the landing page, the
installer, the manual, what's new, the emulator, and the backup, breaks, mirror and app pages. The bar is
WCAG 2.2 AA. These are the FM-1 sites' own patterns: use them, so the sites stay alike.

## Check

```sh
cd ../fm1-reader/tools/a11y && npm install && npx playwright install chromium   # once
node ../fm1-reader/tools/a11y/check.mjs build/pages --click 'emu/index.html=#go'
                     # the built site: every page at desktop and phone widths, light and dark; the emulator
                     # also once it's switched on (use its own Switch on button's selector)
```

- **The goal:** no serious or critical problems, and no horizontal scroll at phone width.
- **Then by hand** (the checker can't judge these):
  - Tab through each page. Focus is always visible, the order follows reading, and nothing traps you.
  - Read each page with VoiceOver (VO-U rotor: headings, links, form controls). The headings give an
    outline, links make sense on their own, and every control says what it is and what it's set to.
  - Run each flow with the keyboard alone: install, back up and restore, send a picture. Its progress and
    its result are announced.

## Patterns

**Page.** Each page has:
- `<html lang="en">` and a `<title>` naming the page and the firmware ("Install · X0X")
- one `<h1>`, with headings in order (no skipped levels)
- `<main>`, plus `<nav>` / `<header>` / `<footer>` where it has them
- a "Skip to content" link first, on long pages (manual, what's new)

**Colour.**
- Text contrast at least 4.5:1 (3:1 for large text and for the outlines of controls), in light and dark.
- Dim greys and the coral/teal accents on cream usually fail: darken the token in `:root` rather than
  patching one element.
- Links in running text are underlined, or 3:1 against the text around them.
- Nothing is said by colour alone (a red "failed" also says "failed").

**Links and buttons.**
- A link goes somewhere; an action is a `<button>`.
- Their names make sense out of context: not "here", not an icon alone (give it an `aria-label`).
- A link that opens a new tab says so.

**Forms.**
- Every input has a `<label>`. A hidden file input is opened by a labelled `<button>`, or carries an
  `aria-label` itself.
- Errors say what went wrong and what to do, in text next to the control.

**Progress and status** (installer, backup, upload, connect):
- A `role="status"` region (polite) holds the current step in words ("Writing, 40 percent").
- Updates are throttled to about one every 2 seconds or every 10 percent.
- A failure goes to `role="alert"`.
- A `<progress>` bar has a label.
- Focus never jumps on its own, except to a result the user must act on.

**Code and wide content.** A `<pre>` or table that scrolls gets `tabindex="0"` and an `aria-label`
("Command"), so the keyboard can scroll it.

**Screenshots in the manual** use `![what the screen shows](img/x.png "caption")`: the alt text says what is
on the screen, and the title stays as the visible caption (the sites' `manual_html.py` does this).

**Language.** A language switch is named in its own language (`<button lang="ja">日本語</button>`), and the page's
`lang` changes with the text.

**Light-only sites** say so (`color-scheme: light`), and still meet contrast in a dark-mode browser.

**Buttons that become unavailable** while focused (Send, while sending) use `aria-disabled="true"`, not
`disabled`, so focus stays put.

**Images.**
- Pictures of the screen get an `alt` saying what the screen shows, written for the content.
  - Bad: `alt="screenshot"`.
  - Good: `alt="The 909 page: TUNE 34, ATTACK 13, DECAY 80"`.
- Decorative images get `alt=""`.
- Diagrams that matter also get their content in text nearby.

**The emulator** (a canvas screen and a drawn panel):
- **Each knob** is focusable: `role="slider"`, `aria-label` (its printed name), `aria-valuemin` / `max` /
  `now`, and `aria-valuetext` if the number means something else. Arrow keys turn it, and Page Up/Down
  turn it faster. An endless encoder that has no value is `role="button"` with "turn with the arrow keys"
  in its description.
- **Each button and key** is a `<button>` (or `role="button"` with `tabindex="0"`), named with its printed
  label or note ("C3 key", "PLAY"). Space and Enter press it. Holding is described ("Hold with Space").
  LEDs: `aria-pressed`, or the state in the name.
- **The screen** (canvas) gets `role="img"` with a short `aria-label`, plus the screen reader: if the
  firmware supports it, connect the emulator's reader exports (`web_sysex` / `web_said_buf`) to the same
  words (`words.js` and the firmware's words file) and a live region. Add a "Speak the screen" choice, as
  on the reader page. Otherwise, say plainly that the screen is visual only.
- **Keyboard shortcuts** for playing are written on the page, single letters only while the panel has
  focus, and can be turned off. Don't use Shift or Space as playing shortcuts: Shift+Tab and pressing a
  focused control need them.
- **Switching on.** The panel is `inert` until the emulator is switched on. Then focus moves to the panel,
  since the Switch on button is gone.
- **Presses** from the keyboard or a screen reader's click last at least one audio block (60 ms), or the
  firmware, reading inputs every 16 ms, may miss them. Space/Enter holds while held; Shift+Space or
  Shift+Enter latches a button for two-button combinations.
- **Keys** are one Tab stop, with the arrow keys moving between them (a roving tabindex), named by note in
  words ("F sharp 3 key"). A flat in a name keeps its shown text too ("Eb (E flat)"), for voice control.
- **Size.** At phone width, the controls are at least 24 px (2.5.8). Give the drawn panel a minimum width, and
  let its own box scroll sideways rather than the page.
- **Endless knobs** as `role="button"` (turned with the arrows) need NVDA's focus mode. Check with NVDA. If
  the arrows don't reach them in browse mode, make them `role="slider"` with `aria-valuetext` saying the
  readout ("Cutoff 64").
- **The screen reader in the emulator** works like the reader page:
  - HELLO goes in through `web_sysex` every 2 s, and the SAY frames are read from `web_said_buf` / `web_said_len`.
  - The words file is fetched from the site's own `../words/<id>.json` (the id is the HELLO's link).
  - The choice of who reads it defaults to the user's screen reader, with the page's voice or nobody as the
    alternatives. Add "Read the whole screen" and "Say it again" buttons.
  - Drop a NOW message that a later NOW message replaces before it is shown.
  - The site build copies `words.js`, `tts.js`, `tts_worker.js` and `espeak/` from `../fm1-reader/web`
    (`FM1_READER` overrides), and refuses to build without them.
- **SVG panels:** Chrome makes an SVG element focusable once it has a focus or blur listener. Give it
  `tabindex="-1"`, or listen on its parent.
- **Audio** starts only on a user action, and there's a visible, labelled stop or mute.

**Motion.** Respect `prefers-reduced-motion`. Nothing flashes more than three times a second.

**Web MIDI pages.** Before connecting, say in text what is needed (Chrome or Edge, the FM-1 on USB, the
permission prompt), and say in a status region what happened ("Connected to X0X 1.1.0", "No FM-1 found").
