#!/bin/sh
# SPDX-License-Identifier: MIT
# The shared files whose one copy is fm1-base's: copy them, or check the copies are the same.
#   - web/fm1ports.js (finding FM-1s on Web MIDI) into this repository's web/, for the page (reader.js).
#   - device/announce.c and tools/gen_words.py (the screen reader's firmware side) into each firmware named that is not
#     on fm1-base, as firmware/src/announce.c and tools/gen_words.py. A firmware on fm1-base has them from base/.
#   tools/sync_announce.sh                       copy web/fm1ports.js here
#   tools/sync_announce.sh ../fm1-x0x ...        and announce.c and gen_words.py into those firmwares
#   tools/sync_announce.sh --check [FIRMWARE...] exit 1 if a copy's content differs (its SPDX and copyright lines
#                                                are not compared: an older copy in a GPL firmware keeps its own)
# fm1-base: FM1_BASE, or ../fm1-base next to this repository. Change the files there, run its tests, then sync.
set -e
R="$(cd "$(dirname "$0")/.." && pwd)"
B="${FM1_BASE:-$R/../fm1-base}"
check=0
[ "$1" = "--check" ] && { check=1; shift; }
[ -f "$B/device/announce.c" ] && [ -f "$B/web/fm1ports.js" ] || { echo "no fm1-base at $B (set FM1_BASE)"; exit 2; }
B="$(cd "$B" && pwd)"
bad=0
body() {  # a file without its licence and copyright lines
    sed -e '/SPDX-License-Identifier:/d' -e '/^[[:space:]#/*]*Copyright (C)/d' "$1"
}
one() {   # FROM TO
    if [ $check = 1 ]; then
        if [ -f "$2" ] && [ "$(body "$1")" = "$(body "$2")" ]; then echo "same: $2"; else echo "DIFFERS: $2 (from $1)"; bad=1; fi
    else
        cp "$1" "$2" && echo "copied: $2"
    fi
}
one "$B/web/fm1ports.js" "$R/web/fm1ports.js"
for fw in "$@"; do
    one "$B/device/announce.c" "$fw/firmware/src/announce.c"
    one "$B/tools/gen_words.py" "$fw/tools/gen_words.py"
done
exit $bad
