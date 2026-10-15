#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# Publish the reader page (web/) to this repo's gh-pages branch: https://charlesvestal.github.io/fm1-reader/
set -e
cd "$(dirname "$0")/.."
sh tests/run_tests.sh
rm -rf build/pages && mkdir -p build/pages && cp -R web/. build/pages/ && rm -f build/pages/tts_test.html
REMOTE="$(git remote get-url origin)"
SHA="$(git rev-parse --short HEAD)"
cd build/pages
git init -q -b gh-pages && git add -A && git commit -q -m "Reader page (from $SHA)" && git push -q -f "$REMOTE" gh-pages
rm -rf .git
REPO="$(printf %s "$REMOTE" | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')"
gh api -X POST "repos/$REPO/pages/builds" >/dev/null 2>&1 || echo "(ask GitHub Pages to build: check the repository's Pages settings)"
echo "published web/ to gh-pages"
