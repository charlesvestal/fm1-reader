#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# Copy announce.c into a firmware, or check that its copy is this one.
#   tools/sync_announce.sh ../fm1-x0x            copy to ../fm1-x0x/firmware/src/announce.c
#   tools/sync_announce.sh --check ../fm1-x0x    exit 1 if it differs
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)/firmware/announce.c"
check=0
[ "$1" = "--check" ] && { check=1; shift; }
for fw in "$@"; do
    dst="$fw/firmware/src/announce.c"
    if [ $check = 1 ]; then
        cmp -s "$SRC" "$dst" && echo "same: $dst" || { echo "DIFFERS: $dst"; exit 1; }
    else
        cp "$SRC" "$dst" && echo "copied: $dst"
    fi
done
