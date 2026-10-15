/* SPDX-License-Identifier: GPL-3.0-only */
/* announce.c on the host: the protocol (silent until a HELLO, the answer, a reader gone after 5 s, BYE, WHERE),
 * the SAY frames (flags, cut at a word, 7-bit), ann_later's settling, and the words (the tables, numbers, signs).
 *   cc -std=c99 -Wall -Wextra -Werror -o build/announce_test tests/announce_test.c && build/announce_test */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#define ANN_NAME "TEST 1.0"
#include "../firmware/announce.c"

static uint8_t sent[4096];
static uint32_t sent_n, frames, refuse;
static int ann_wire_send(const uint8_t *p, uint32_t n)
{
    if (refuse)
        return -1;
    memcpy(sent + sent_n, p, n);
    sent_n += n;
    frames++;
    return 0;
}
static void clear(void) { sent_n = frames = 0; }

static int fails;
#define CHECK(c, ...) do { if (!(c)) { printf("FAIL %s:%d: ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); fails++; } } while (0)

static void in(uint8_t cmd, uint32_t now)
{
    uint8_t f[5] = {ANN_H0, ANN_H1, ANN_H2, cmd, ANN_VER};
    CHECK(ann_frame(f, cmd == ANN_HELLO ? 5u : 4u, now) == 1, "frame %u not taken", cmd);
}
/* the text of the last SAY sent, and its flags */
static const char *last_said(int *flags)
{
    static char t[300];
    uint32_t i = 0, s = 0, k = 0;
    while (i < sent_n) {                       /* the last F0 .. F7 */
        if (sent[i] == 0xF0)
            s = i;
        i++;
    }
    CHECK(sent[s + 4] == ANN_SAY, "last frame is not a SAY");
    if (flags)
        *flags = sent[s + 5];
    for (i = s + 6; i < sent_n && sent[i] != 0xF7; i++) {
        CHECK(sent[i] < 0x80, "byte 0x%02X is not 7-bit", sent[i]);
        t[k++] = (char)sent[i];
    }
    t[k] = 0;
    return t;
}
static void words(const char *screen, const char *want)
{
    char o[ANN_MAX + 1];
    ann_spoken(o, sizeof o, screen);
    CHECK(!strcmp(o, want), "\"%s\" -> \"%s\", want \"%s\"", screen, o, want);
}

int main(void)
{
    static const ann_word_t APP[] = {
        {"BD", "bass drum"}, {"909", "nine oh nine"}, {"909 GR", "nine oh nine groove"}, {"P#", "pattern #"},
        {"P#-#", "patterns # to #"}, {"STEP #: #:#", "step #: loop # of every #"}, {"NEW LINE *", "new line"},
        {"LENGTH # st", "length # steps"}, {"REV", "reverse"},
    };
    ann_words(APP, sizeof APP / sizeof APP[0]);

    /* silent until a reader says HELLO */
    ann_say("SAVED", 0, ANN_NOW);
    ann_later("TUNE 5", ANN_NOW, 100, 0);
    ann_tick(500);
    CHECK(frames == 0, "%u frames sent with no reader", frames);
    CHECK(!ann_on(), "on with no reader");
    CHECK(!ann_where(), "where with no reader");

    /* HELLO: the answer (version, name), and the whole screen asked for once */
    in(ANN_HELLO, 1000);
    CHECK(ann_on(), "not on after HELLO");
    CHECK(frames == 1 && sent[4] == ANN_HELLO && sent[5] == ANN_VER && !memcmp(sent + 6, "TEST 1.0", 8) &&
              sent[14] == 0xF7, "HELLO answer wrong");
    CHECK(ann_where() && !ann_where(), "WHERE not asked once on a new reader");
    in(ANN_HELLO, 2000);
    CHECK(!ann_where(), "a second HELLO asked for the screen again");

    /* SAY: flags, words */
    clear();
    ann_say("MEMORY FULL: ", "NOT SAVED", ANN_NOW | ANN_KEEP);
    {
        int fl;
        const char *t = last_said(&fl);
        CHECK(fl == 3, "flags %d", fl);
        CHECK(!strcmp(t, "memory full: not saved"), "said \"%s\"", t);
    }

    /* ann_later: the newest, once it settles (or every 4 x quiet while it keeps changing) */
    clear();
    ann_later("TUNE 1", ANN_NOW, 100, 3000);
    ann_later("TUNE 2", ANN_NOW, 100, 3050);
    ann_tick(3100);
    CHECK(frames == 0, "said before it settled");
    ann_tick(3150);
    CHECK(frames == 1 && !strcmp(last_said(0), "tune 2"), "the settled one not said");
    clear();
    for (uint32_t t = 4000; t < 4500; t += 50) {
        ann_later(t & 64 ? "TUNE 3" : "TUNE 4", ANN_NOW, 100, t);
        ann_tick(t);
    }
    CHECK(frames >= 1, "a long run never heard");
    /* ann_say without NOW: what waits goes first */
    clear();
    ann_later("TUNE 9", ANN_NOW, 100, 5000);
    ann_say("SAVED", 0, 0);
    CHECK(frames == 2, "the waiting one not said first (%u)", frames);

    /* too long: cut at a word, within ANN_MAX */
    clear();
    {
        char big[600];
        int i;
        for (i = 0; i < 590; i++)
            big[i] = (i % 6 == 5) ? ' ' : 'W';
        big[590] = 0;
        ann_say(big, 0, 0);
        const char *t = last_said(0);
        CHECK(strlen(t) <= ANN_MAX && t[strlen(t) - 1] != ' ', "cut wrong (%zu)", strlen(t));
    }

    /* no room: not sent, nothing half sent */
    clear();
    refuse = 1;
    ann_say("SAVED", 0, 0);
    refuse = 0;
    CHECK(sent_n == 0, "half a frame sent");

    /* gone: no HELLO for 5 s */
    ann_tick(2000 + ANN_GONE_MS + 1);
    CHECK(!ann_on(), "still on 5 s after the last HELLO");
    in(ANN_HELLO, 9000);
    in(ANN_BYE, 9100);
    CHECK(!ann_on(), "on after BYE");
    in(ANN_HELLO, 9200);
    ann_where();
    in(ANN_WHERE, 9300);
    CHECK(ann_where(), "WHERE not asked");
    {
        uint8_t other[4] = {0x7D, 0x46, 0x4C, 1};    /* someone else's SysEx */
        CHECK(!ann_frame(other, 4, 9400), "took another protocol's frame");
    }

    /* the words */
    words("BD TUNE 37", "bass drum tune 37");
    words("909 GR", "nine oh nine groove");                 /* the longest match */
    words("909 KIT", "nine oh nine kit");
    words("P3", "pattern 3");
    words("COPY TO P17-32", "copy to patterns 17 to 32");
    words("STEP 5: 1:4", "step 5: loop 1 of every 4");
    words("NEW LINE 3FA2", "new line");
    words("LENGTH 16 st", "length 16 steps");
    words("DIRECTION REV", "direction reverse");            /* the app's table before the common one */
    words("RATE 1/16T", "rate sixteenth triplet");
    words("TIME 1/8., FEEDBACK 52", "time dotted eighth, feedback 52");
    words("RATE 1/16. STEPS 1-16 ON: NONE", "rate sixteenth. steps 1 to 16 on: none");
    words("RATIO 4:1", "ratio 4 to 1");
    words("ROOT C#", "root C sharp");
    words("STEP 5 ON C#3", "step 5 on C sharp 3");
    words("REPEAT x1", "repeat 1 time");
    words("REPEAT x4", "repeat 4 times");
    words("SWING 50 %", "swing 50 percent");
    words("LEVEL -5 dB", "level -5 decibels");
    words("BD (1/2): TUNE 34", "bass drum, page 1 of 2: tune 34");
    words("PLAY / STOP", "play or stop");
    words("HOME + REC: UNDO", "home plus record: undo");
    words("(+ OCT+: P17-32)", "(plus octave up: patterns 17 to 32)");
    words("HOLD A STEP", "hold a step");
    words("LOOP A", "loop A");
    words("THE PART'S SOUND", "the part's sound");
    words("THE EFFECTS: REVERB, DELAY,. TAPE", "the effects: reverb, delay. tape");
    words("CLEAR THIS?. SEL: YES", "clear this? sel: yes");
    words("WAVE Saw", "wave Saw");
    words("BREAK MIDI CH 4", "break MIDI channel 4");
    words("A  B", "A B");
    words("BDX", "bdx");                                    /* not "bass drum" inside a longer word */

    printf(fails ? "announce: %d FAILED\n" : "announce: all passed\n", fails);
    return fails != 0;
}
