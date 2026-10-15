# Rules for what a firmware says

These rules are for anything an FM-1 firmware sends to a screen reader. `tools/audit.mjs` checks the ones
marked (audit). The rest need a person's judgement: read the dump.

## Words

1. **Words, not abbreviations.** Every word should be a real word. "CMPLX", "RTG2X", "ACCDEC" and "P.DPTH"
   become "complexity", "retrigger times 2", "accent decay" and "pitch depth". The screen keeps its short
   labels; the firmware's words file (words.tsv) says them in full. (audit: not-a-word)
2. **One word, one meaning.** The table is used everywhere on the screen, so check each entry where it
   appears. "CH" was "closed hat" next to the drum names, and "channel" after "MIDI": the longer entry
   ("MIDI CH #") must say the second one. "st" meant steps after a length and semitones after a transpose.
3. **Notes and chords.** The reader treats a capital A before a word as "a", except before MINOR, MAJOR,
   SHARP, FLAT and mode names, where it stays the note. Check the dump for any other "A <word>" that is
   a note, and add a words entry for it. Chord symbols ("F#m7b5") can't be put in words by the words file
   alone: build the spoken name in the firmware ("F sharp minor seven flat five"). The same goes for flats:
   the words file ignores capitals, so an entry for "Bb" would also catch "BB".
3b. **Numbers the way people say them.** 1/16 is "sixteenth", 1/8T "eighth triplet", 1/8. "dotted
   eighth", 4:1 "4 to 1", 1-16 "1 to 16", x2 "2 times", C#3 "C sharp 3", % "percent", dB "decibels". The
   common table and the built-in rules do these.
4. **No symbols a voice reads out loud or skips.** / | > < * _ = # [ ] { } ~ ^ @ & $ and a lone +. Say
   "or", "plus", "and". (audit: symbols)
5. **Letters and digits run together** ("bd2") are read oddly. Say them as words. (audit:
   letters-and-digits)
6. **No noise.** Leave out what is meant for the eye or for debugging: hex seeds, addresses, bars of dots.
   (audit: noise)
7. **Not in capitals.** Some voices spell a word in capitals letter by letter. The reader makes a word in
   capitals an ordinary word unless the words file says otherwise. To have something spelled, write it as
   letters, e.g. "L F O".

## Sentences

8. **The most important thing first.** A readout is the name and then the value ("cutoff 48"). A page is
   its name, then its knobs. A warning says what did not happen.
9. **Say a thing once.** "909. 909 kit" says it twice. (audit: repeated)
10. **One punctuation mark at a time,** and no space before a mark. Joining lines must not leave ",." or
    "?." (audit: punctuation)
11. **Short enough.** A SAY is at most 240 characters, and the device cuts off the rest. A readout is heard
    while the knob turns: keep it to the name and value. A screen is about 45 words; the rest belongs on
    WHERE. (audit: too-long, readout-short, screen-long)

## Context

12. **Where you are.** A new screen or page says its name. A list row ends with its place ("4 of 20"), and
    a new section says its name. A help card starts with its button ("save button. …"). (audit:
    list-position, help-names-button)
13. **What changed, not everything.** After a page change, say the page. After a knob turn, say the
    knob. WHERE is for everything at once.
14. **Each action has an answer.** Saved, muted, copied, play, stop. Most firmwares already put these on
    the screen; send each one.
15. **Warnings are heard whole.** Send them with ANN_KEEP: memory full, save failed, can't do that here.
    A warning says what did not happen, and what to do if there is something to do. (audit:
    warning-says-what)
16. **Questions say how to answer.** "Clear this pattern? S E L: yes. home: no."
17. **Interrupt on purpose.** NOW for the answer to what the user just did. A queued message, without
    NOW, for things the user didn't do (a song moving on, a clock arriving).
18. **Not too often.** A knob's value waits until the knob settles (ann_later, about 120 ms). Pages wait
    about 200 ms so flipping through pages doesn't stutter. Don't announce things that change by
    themselves every beat.
