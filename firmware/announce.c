/* SPDX-License-Identifier: GPL-3.0-only */
/* Announce: what the screen says, in words, for a screen reader on the computer (fm1-reader: a page that
 * speaks it, or hands it to the computer's own screen reader). Shared by the FM-1 firmwares, one copy:
 * fm1-reader/firmware/announce.c. The app says what changed; this keeps the protocol and makes the words.
 *
 * The firmware is in charge of the words: the screen's abbreviations become words here, on the device, from
 * the app's own table (ann_words) and a common one, so the reader needs to know nothing about a firmware.
 *
 * SysEx over USB-MIDI, F0 7D 53 52 cmd args.. F7 ("SR"; fm1-reader/PROTOCOL.md):
 *   reader -> device   1 HELLO ver      listen (again every ~2 s: a reader not heard for 5 s is gone)
 *                      2 BYE            stop
 *                      3 WHERE          say everything on the screen now
 *   device -> reader   1 HELLO ver, name   (the answer to each HELLO)
 *                      16 SAY flags, text  (7-bit ASCII to the F7; flags 1: cut off what is being said,
 *                                           2: a warning or an error: not cut off by what follows)
 * Nothing is built or sent while no reader listens: a DAW on the same port never sees a byte.
 *
 * The includer supplies:
 *   ann_wire_send(p, n)   one complete F0..F7 message to the host; 0 = sent, else not sent at all (no room)
 * and calls ann_frame() with each received SysEx (the bytes between F0 and F7) and ann_tick() from its main
 * loop. The app calls ann_words() once, then ann_on(), ann_say(), ann_later() and ann_where().
 * Options before the #include: ANN_NAME (the HELLO answer), ANN_MAX (longest SAY; the SysEx send queue
 * must hold ANN_MAX + 9 bytes, (ANN_MAX + 9) / 3 USB-MIDI packets), ANN_DATA (a section for its RAM). */
#ifndef ANN_NAME
#define ANN_NAME "FM-1"
#endif
#ifndef ANN_DATA
#define ANN_DATA                              /* where its RAM goes (zeroed at start), e.g. a pool section */
#endif
#ifndef ANN_MAX
#define ANN_MAX 240u                          /* text in one SAY; longer is cut at a word */
#endif
#define ANN_VER 1u
#define ANN_H0 0x7Du
#define ANN_H1 0x53u
#define ANN_H2 0x52u
#define ANN_NOW 1u                            /* cut off what the reader is saying (a knob, a page) */
#define ANN_KEEP 2u                           /* a warning or an error: heard whole, not cut off by what follows */
#define ANN_GONE_MS 5000u
enum { ANN_HELLO = 1, ANN_BYE = 2, ANN_WHERE = 3, ANN_SAY = 16 };

static int ann_wire_send(const uint8_t *p, uint32_t n);

/* ---- words ----
 * A table entry: the screen's text and what to say. Matched whole (not inside a word), capitals or not;
 * "#" in both takes a number (digits, a sign, a decimal point), up to three, in order; "*" in the screen's
 * text takes a word and drops it ("NEW LINE *": a seed). The longest match wins; the app's table before the
 * common one when they match as much. */
typedef struct { const char *screen, *said; } ann_word_t;
static const ann_word_t ANN_COMMON[] = {
    {"FX", "effects"}, {"REV", "reverb"}, {"DLY", "delay"}, {"ENV", "envelope"}, {"LFO", "L F O"},
    {"GLO", "global"}, {"OCT+", "octave up"}, {"OCT-", "octave down"}, {"OCT", "octave"}, {"REC", "record"},
    {"SEQ", "sequence"}, {"ALGO", "algorithm"}, {"ARP", "arp"}, {"USB", "U S B"}, {"MIDI CH #", "MIDI channel #"},
    {"MIDI", "midi"}, {"dB", "decibels"}, {"Hz", "hertz"}, {"kHz", "kilohertz"}, {"ms", "milliseconds"},
    {"bpm", "B P M"}, {"CC", "C C"}, {"INF", "infinity"}, {"PCT", "percent"}, {"2ND", "second"},
    {"FWD", "forward"}, {"RND", "random"}, {"MEM", "memory"}, {"CPU", "C P U"}, {"P-LOCK", "p-lock"},
    {"MIN", "minor"}, {"MAJ", "major"}, {"ATK", "attack"}, {"DCY", "decay"}, {"SUS", "sustain"},
    {"REL", "release"}, {"RES", "resonance"}, {"RESO", "resonance"}, {"FREQ", "frequency"}, {"AMT", "amount"},
    {"LVL", "level"}, {"VOL", "volume"}, {"DIST", "distortion"}, {"SAT", "saturation"}, {"COMP", "compressor"},
    {"THRESH", "threshold"}, {"PERF", "performance"}, {"HP", "high-pass"}, {"LP", "low-pass"}, {"BP", "band-pass"},
};
static const ann_word_t *ann_wt;
static uint32_t ann_wn;

/* the app's words (a table in flash; kept, not copied) */
static void ann_words(const ann_word_t *t, uint32_t n)
{
    ann_wt = t;
    ann_wn = n;
}

static int ann_al(char c) { return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'); }
static int ann_dg(char c) { return c >= '0' && c <= '9'; }
static int ann_an(char c) { return ann_al(c) || ann_dg(c); }
static char ann_lc(char c) { return c >= 'A' && c <= 'Z' ? (char)(c + 32) : c; }

/* text s matches a table entry's screen text k at its start: the length, the numbers in cap[] (start, length) */
static uint32_t ann_match(const char *s, const char *k, uint32_t cap[3][2])
{
    const char *s0 = s;
    uint32_t nc = 0;
    while (*k) {
        if (*k == '#' || *k == '*') {
            const char *b = s;
            if (*k == '#') {
                if (*s == '-' || *s == '+')
                    s++;
                while (ann_dg(*s) || (*s == '.' && ann_dg(s[1])))
                    s++;
                if (s == b || !ann_dg(s[-1]))
                    return 0;
                if (nc < 3u) {
                    cap[nc][0] = (uint32_t)(b - s0);
                    cap[nc++][1] = (uint32_t)(s - b);
                }
            } else {
                while (ann_an(*s))
                    s++;
                if (s == b)
                    return 0;
            }
            k++;
            continue;
        }
        if (ann_lc(*s) != ann_lc(*k))
            return 0;
        s++;
        k++;
    }
    return ann_an(*s) && ann_an(s[-1]) ? 0 : (uint32_t)(s - s0);   /* whole: not the start of a longer word */
}

/* the spoken text of s into o (max bytes, ended): the words, then the common way to say numbers and signs */
static const char *const ANN_NOTE[6] = {"half", "quarter", "eighth", "sixteenth", "thirty-second", 0};
static uint32_t ann_spoken(char *o, uint32_t max, const char *s)
{
    uint32_t n = 0;
    const char *s0 = s;
#define PUT(c) do { if (n + 1u < max) o[n++] = (c); } while (0)
#define PUTS(t) do { const char *t_ = (t); while (*t_) PUT(*t_++); } while (0)
    while (*s) {
        int start = s == s0 || !ann_an(s[-1]);
        if (start && ann_an(*s)) {                       /* a word: the tables */
            uint32_t cap[3][2], c3[3][2], len = 0, l, i;
            const ann_word_t *w = 0;
            for (i = 0; i < ann_wn + sizeof ANN_COMMON / sizeof ANN_COMMON[0]; i++) {   /* the longest; the app's first */
                const ann_word_t *e = i < ann_wn ? &ann_wt[i] : &ANN_COMMON[i - ann_wn];
                if ((l = ann_match(s, e->screen, c3)) > len) {
                    len = l;
                    w = e;
                    for (l = 0; l < 3u; l++)
                        cap[l][0] = c3[l][0], cap[l][1] = c3[l][1];
                }
            }
            if (len) {
                const char *t = w->said;
                uint32_t c = 0;
                for (; *t; t++)
                    if (*t == '#' && c < 3u) {
                        for (i = 0; i < cap[c][1]; i++)
                            PUT(s[cap[c][0] + i]);
                        c++;
                    } else {
                        PUT(*t);
                    }
                s += len;
                continue;
            }
        }
        if (start && *s == '1' && s[1] == '/') {        /* 1/16, 1/8T (a triplet), 1/8. (dotted: the dot ends it) */
            uint32_t d = 0, k;
            const char *q = s + 2;
            while (ann_dg(*q))
                d = d * 10u + (uint32_t)(*q++ - '0');
            for (k = 0; ANN_NOTE[k] && (2u << k) != d; k++)
                ;
            if (ANN_NOTE[k]) {
                int trip = *q == 'T', dot = *q == '.' && (!q[1] || q[1] == ',' || q[1] == '.');
                if ((trip || dot) ? !ann_an(q[1]) : !ann_an(*q)) {
                    if (dot)
                        PUTS("dotted ");
                    PUTS(ANN_NOTE[k]);
                    if (trip)
                        PUTS(" triplet");
                    s = q + (trip || dot);
                    continue;
                }
            }
        }
        if (start && ann_dg(*s)) {                       /* 4:1 a ratio, 1-16 a range, 1/3 a share */
            const char *q = s;
            while (ann_dg(*q) || (*q == '.' && ann_dg(q[1])))
                q++;
            if ((*q == ':' || *q == '-' || *q == '/') && ann_dg(q[1])) {
                const char *e = q + 1;
                while (ann_dg(*e))
                    e++;
                if (!ann_an(*e)) {
                    while (s < q)
                        PUT(*s++);
                    PUTS(*q == '/' ? " of " : " to ");
                    s = q + 1;
                    continue;
                }
            }
        }
        if (start && *s >= 'A' && *s <= 'G' && s[1] == '#') {   /* C#3: C sharp 3 */
            PUT(*s);
            PUTS(" sharp");
            if (ann_dg(s[2]) || s[2] == '-')
                PUT(' ');
            s += 2;
            continue;
        }
        if (start && *s == 'x' && ann_dg(s[1])) {        /* x2: 2 times */
            const char *q = s + 1;
            while (ann_dg(*q))
                q++;
            if (!ann_an(*q)) {
                int one = q == s + 2 && s[1] == '1';
                for (s++; s < q; s++)
                    PUT(*s);
                PUTS(one ? " time" : " times");
                continue;
            }
        }
        if (start && *s == 'A' && s[1] == ' ' && ann_al(s[2]) && ann_al(s[3])) {   /* A NEW LINE: the article */
            PUT('a');
            s++;
            continue;
        }
        if (start && ann_al(*s)) {                       /* a word in capitals: a word, not letters */
            const char *q = s;
            int caps = 0, lower = 0;
            while (ann_al(*q) || *q == '\'') {
                caps += *q >= 'A' && *q <= 'Z';
                lower += *q >= 'a' && *q <= 'z';
                q++;
            }
            if (caps >= 2 && !lower && !ann_dg(*q)) {
                for (; s < q; s++)
                    PUT(ann_lc(*s));
                continue;
            }
            while (s < q)                                /* (as it is: "Saw", "A", "BD2") */
                PUT(*s++);
            continue;
        }
        if (*s == '(' && ann_dg(s[1])) {                 /* (1/2): page 1 of 2 */
            const char *q = s + 1, *m;
            while (ann_dg(*q))
                q++;
            m = q;
            if (*q == '/' && ann_dg(q[1])) {
                q++;
                while (ann_dg(*q))
                    q++;
                if (*q == ')') {
                    while (n && o[n - 1] == ' ')
                        n--;
                    PUTS(", page ");
                    for (s++; s < m; s++)
                        PUT(*s);
                    PUTS(" of ");
                    for (s++; s < q; s++)
                        PUT(*s);
                    s = q + 1;
                    continue;
                }
            }
        }
        if (*s == '%') {
            if (n && o[n - 1] != ' ')
                PUT(' ');
            PUTS("percent");
            s++;
            continue;
        }
        if (*s == '+' && (s == s0 || s[-1] == ' ' || s[-1] == '(') && s[1] == ' ') {   /* + KEY: plus key */
            PUTS("plus");
            s++;
            continue;
        }
        if (*s == '/' && s > s0 && s[-1] == ' ' && s[1] == ' ') {                     /* ON / OFF: on or off */
            PUTS("or");
            s++;
            continue;
        }
        if (*s == ' ') {                                 /* one space; none before a comma or a full stop */
            while (s[1] == ' ')
                s++;
            if (!n || o[n - 1] == ' ' || s[1] == ',' || s[1] == '.' || s[1] == ':' || !s[1]) {
                s++;
                continue;
            }
        }
        if (*s == '.' && n && (o[n - 1] == ',' || o[n - 1] == ':' || o[n - 1] == '?' || o[n - 1] == '!' ||
                               o[n - 1] == '.')) {      /* "DELAY,." / "PATTERN?." : one mark */
            if (o[n - 1] == ',' || o[n - 1] == ':')
                o[n - 1] = '.';
            s++;
            continue;
        }
        PUT(*s);
        s++;
    }
    o[n] = 0;
#undef PUT
#undef PUTS
    return n;
}

static struct {
    uint8_t on, where;
    uint32_t heard;                           /* the last HELLO */
    char later[ANN_MAX + 1];                  /* the newest of a run (a knob turning), said when it settles */
    uint8_t later_flags, later_set;
    uint32_t later_t, later_first, later_quiet;
} ann ANN_DATA;

static int ann_on(void) { return ann.on; }

static void ann_send(uint32_t cmd, uint32_t flags, const char *a, const char *b)
{
    char t[ANN_MAX + 1], w[ANN_MAX + 1];
    uint8_t f[8 + ANN_MAX];
    uint32_t n = 0, k = 0, i, cut = 0;
    for (; a; a = b, b = 0)                   /* a + b, then in words */
        while (*a && k < ANN_MAX)
            t[k++] = *a++;
    t[k] = 0;
    if (cmd == ANN_SAY)
        ann_spoken(w, sizeof w, t);
    else
        for (i = 0; i <= k; i++)
            w[i] = t[i];
    f[n++] = 0xF0;
    f[n++] = ANN_H0;
    f[n++] = ANN_H1;
    f[n++] = ANN_H2;
    f[n++] = (uint8_t)cmd;
    f[n++] = (uint8_t)(flags & 0x7Fu);
    for (i = 0; w[i]; i++) {
        if (n >= 6u + ANN_MAX) {              /* too long: back to the last space */
            if (cut)
                n = cut;
            break;
        }
        if (w[i] == ' ')
            cut = n;
        f[n++] = (uint8_t)w[i] & 0x7Fu;
    }
    f[n++] = 0xF7;
    ann_wire_send(f, n);
}

/* say a + b (b may be 0) now, after anything still waiting in ann_later */
static void ann_say(const char *a, const char *b, uint32_t flags)
{
    if (!ann.on || !a || !*a)
        return;
    if (ann.later_set && !(flags & ANN_NOW))  /* in order: what was waiting first */
        ann_send(ANN_SAY, ann.later_flags, ann.later, 0);
    ann.later_set = 0;
    ann_send(ANN_SAY, flags, a, b);
}

/* say s once it has stayed the newest for quiet_ms (each call replaces what waits; a run that keeps
 * changing is said at least every 4 x quiet_ms, so a long turn is heard as it goes) */
static void ann_later(const char *s, uint32_t flags, uint32_t quiet_ms, uint32_t now)
{
    uint32_t i;
    if (!ann.on)
        return;
    for (i = 0; s[i] && i < ANN_MAX; i++)
        ann.later[i] = s[i];
    ann.later[i] = 0;
    if (!ann.later_set)
        ann.later_first = now;
    ann.later_set = 1;
    ann.later_flags = (uint8_t)flags;
    ann.later_t = now;
    ann.later_quiet = quiet_ms;
}

/* the reader asked for the whole screen: 1 once */
static int ann_where(void)
{
    int w = ann.where;
    ann.where = 0;
    return w && ann.on;
}

static void ann_tick(uint32_t now)
{
    if (ann.on && now - ann.heard > ANN_GONE_MS) {
        ann.on = 0;
        ann.later_set = 0;
    }
    if (ann.later_set && (now - ann.later_t >= ann.later_quiet || now - ann.later_first >= 4u * ann.later_quiet)) {
        ann.later_set = 0;
        ann_send(ANN_SAY, ann.later_flags, ann.later, 0);
    }
}

/* a received SysEx (between F0 and F7): 1 if it was the reader's */
static int ann_frame(const uint8_t *p, uint32_t n, uint32_t now)
{
    if (n < 4u || p[0] != ANN_H0 || p[1] != ANN_H1 || p[2] != ANN_H2)
        return 0;
    switch (p[3]) {
    case ANN_HELLO:
        if (!ann.on)
            ann.where = 1;                    /* a new reader: what is on the screen first */
        ann.on = 1;
        ann.heard = now;
        ann_send(ANN_HELLO, ANN_VER, ANN_NAME, 0);
        break;
    case ANN_BYE:
        ann.on = 0;
        ann.later_set = 0;
        break;
    case ANN_WHERE:
        ann.where = 1;
        break;
    default:
        break;
    }
    return 1;
}
