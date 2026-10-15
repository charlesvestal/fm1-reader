#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# Copy announce.c and gen_words.py into a firmware, or check that its copies are these.
#   tools/sync_announce.sh ../fm1-x0x            copy to firmware/src/announce.c and tools/gen_words.py
#   tools/sync_announce.sh --check ../fm1-x0x    exit 1 if one differs
set -e
R="$(cd "$(dirname "$0")/.." && pwd)"
check=0
[ "$1" = "--check" ] && { check=1; shift; }
for fw in "$@"; do
    for pair in "firmware/announce.c firmware/src/announce.c" "tools/gen_words.py tools/gen_words.py"; do
        set -- $pair
        if [ $check = 1 ]; then
            cmp -s "$R/$1" "$fw/$2" && echo "same: $fw/$2" || { echo "DIFFERS: $fw/$2"; exit 1; }
        else
            cp "$R/$1" "$fw/$2" && echo "copied: $fw/$2"
        fi
    done
done
