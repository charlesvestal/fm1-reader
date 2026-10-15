#!/bin/sh
# SPDX-License-Identifier: MIT
# announce.c's test, and the audit on its fixtures: a clean dump passes, a bad one is caught.
set -e
cd "$(dirname "$0")/.."
mkdir -p build
${CC:-cc} -std=c99 -Wall -Wextra -Werror -Wno-unused-function -o build/announce_test tests/announce_test.c
build/announce_test
node tests/words_test.mjs
node tools/audit.mjs tests/fixtures/good.tsv --words tests/fixtures/good_words.json >/dev/null && echo "audit: good.tsv passes (X0X's messages and words)"
if node tools/audit.mjs tests/fixtures/bad.tsv > build/bad.txt; then echo "audit: bad.tsv NOT caught"; exit 1; fi
for rule in SYMBOLS PUNCTUATION REPEATED NOT-A-WORD LIST-POSITION TOO-LONG NOISE LETTERS-AND-DIGITS; do
    grep -q "$rule" build/bad.txt || { echo "audit: $rule not caught"; exit 1; }
done
echo "audit: bad.tsv caught (every rule)"
