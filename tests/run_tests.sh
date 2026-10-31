#!/bin/sh
# SPDX-License-Identifier: MIT
# The page's words and its finding of FM-1s, the audit on its fixtures (a clean dump passes, a bad one is caught), and
# the copies of fm1-base's shared files (tools/sync_announce.sh --check: web/fm1ports.js), when fm1-base is there.
# announce.c's own test is fm1-base's (tests/announce_test.c), with announce.c.
set -e
cd "$(dirname "$0")/.."
mkdir -p build
node tests/words_test.mjs
node tests/reader_test.mjs
node tools/audit.mjs tests/fixtures/good.tsv --words tests/fixtures/good_words.json >/dev/null && echo "audit: good.tsv passes (X0X's messages and words)"
if node tools/audit.mjs tests/fixtures/bad.tsv > build/bad.txt; then echo "audit: bad.tsv NOT caught"; exit 1; fi
for rule in SYMBOLS PUNCTUATION REPEATED NOT-A-WORD LIST-POSITION TOO-LONG NOISE LETTERS-AND-DIGITS; do
    grep -q "$rule" build/bad.txt || { echo "audit: $rule not caught"; exit 1; }
done
echo "audit: bad.tsv caught (every rule)"
if [ -f "${FM1_BASE:-../fm1-base}/web/fm1ports.js" ]; then
    sh tools/sync_announce.sh --check
else
    echo "skip: the copy of fm1-base's web/fm1ports.js not checked (no fm1-base at ${FM1_BASE:-../fm1-base}: set FM1_BASE)"
fi
