#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# The screen reader's speech: espeak-ng, English only, compiled to WebAssembly.
#   [ESPEAK_SRC=path] tools/build_espeak_web.sh [path]  ->  web/espeak/{espeak.js, espeak.wasm}
# Without a path it clones the pinned commit into build/espeak-src. A native espeak-ng (no
# klatt / mbrola / sonic / async) compiles the English data; emcc then builds the library plus
# web/espeak/tts_wrap.c with that data embedded in the wasm (no .data file, no CDN).
set -e
cd "$(dirname "$0")/.."
ROOT=$(pwd)
COMMIT=ba90c8e9f440ad544f674a790bb5f53878b6ffc5
SRC=${1:-${ESPEAK_SRC:-}}
if [ -z "$SRC" ]; then
    SRC=build/espeak-src
    [ -d "$SRC/.git" ] || git clone -q https://github.com/espeak-ng/espeak-ng.git "$SRC"
    git -C "$SRC" checkout -q "$COMMIT"
fi
SRC=$(cd "$SRC" && pwd)
B=${ESPEAK_BUILD:-$ROOT/build/espeak-web}
OUT=$ROOT/web/espeak
mkdir -p "$B" "$OUT"

# 1. native espeak-ng, only to compile the data
cmake -S "$SRC" -B "$B/native" -DCMAKE_BUILD_TYPE=Release -DCOMPILE_INTONATIONS=OFF -DENABLE_TESTS=OFF \
    -DUSE_MBROLA=OFF -DUSE_LIBSONIC=OFF -DUSE_LIBPCAUDIO=OFF -DUSE_ASYNC=OFF -DUSE_KLATT=OFF \
    -DUSE_SPEECHPLAYER=OFF >/dev/null
cmake --build "$B/native" --target espeak-ng-bin -j8 >/dev/null
NATIVE=$B/native/src/espeak-ng

# 2. English data: phonemes, intonations, en_dict, the en / en-US voices (as data.cmake does)
D=$B/data
rm -rf "$D" && mkdir -p "$D/espeak-ng-data/lang/gmw" "$D/espeak-ng-data/voices" "$D/dictsource"
cp -R "$SRC/phsource" "$D/"
cp "$SRC/espeak-ng-data/lang/gmw/en" "$SRC/espeak-ng-data/lang/gmw/en-US" "$D/espeak-ng-data/lang/gmw/"
cp "$SRC/dictsource/en_rules" "$SRC/dictsource/en_list" "$D/dictsource/"
(cd "$D/phsource" && ESPEAK_DATA_PATH=$D "$NATIVE" --compile-intonations >/dev/null)
(cd "$D/phsource" && ESPEAK_DATA_PATH=$D "$NATIVE" --compile-phonemes >/dev/null)
(cd "$D/dictsource" && ESPEAK_DATA_PATH=$D "$NATIVE" --compile=en >/dev/null)
E=$B/embed/espeak-ng-data
rm -rf "$B/embed" && mkdir -p "$E/voices"
cp -R "$D/espeak-ng-data/lang" "$E/"
cp "$D/espeak-ng-data/phondata" "$D/espeak-ng-data/phonindex" "$D/espeak-ng-data/phontab" \
   "$D/espeak-ng-data/intonations" "$D/espeak-ng-data/en_dict" "$E/"

# 3. the library and the wrapper, in wasm
mkdir -p "$B/inc"
cat > "$B/inc/config.h" <<'EOF'
#define HAVE_MKSTEMP 1
#define HAVE_NBTOOL_CONFIG_H 0
#define HAVE_DECL_OPTRESET 0
#define HAVE_SYS_ENDIAN_H 0
#define HAVE_ISWBLANK 1
#define USE_ASYNC 0
#define USE_KLATT 0
#define USE_LIBPCAUDIO 0
#define USE_LIBSONIC 0
#define USE_MBROLA 0
#define USE_SPEECHPLAYER 0
#define PACKAGE_VERSION "1.53.0"
EOF
L=$SRC/src/libespeak-ng
U=$SRC/src/ucd-tools/src
emcc -Oz -flto -std=gnu99 -fwrapv -w -DLIBESPEAK_NG_EXPORT=1 '-DPATH_ESPEAK_DATA="/espeak-ng-data"' \
    -I"$B/inc" -I"$SRC/src/include" -I"$SRC/src/include/compat" -I"$U/include" \
    -sMODULARIZE -sEXPORT_NAME=createEspeak -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH \
    -sINITIAL_MEMORY=16777216 -sSTACK_SIZE=262144 -sEXIT_RUNTIME=0 -sINCOMING_MODULE_JS_API=locateFile,print,printErr \
    -sEXPORTED_FUNCTIONS=_tts_init,_tts_synth,_tts_samples,_tts_length,_tts_rate,_malloc,_free \
    -sEXPORTED_RUNTIME_METHODS=HEAP16,stringToNewUTF8 \
    --embed-file "$E@/espeak-ng-data" \
    -o "$OUT/espeak.js" "$OUT/tts_wrap.c" \
    "$L/common.c" "$L/mnemonics.c" "$L/error.c" "$L/ieee80.c" "$L/compiledata.c" "$L/compiledict.c" \
    "$L/dictionary.c" "$L/encoding.c" "$L/intonation.c" "$L/langopts.c" "$L/numbers.c" "$L/phoneme.c" \
    "$L/phonemelist.c" "$L/readclause.c" "$L/setlengths.c" "$L/soundicon.c" "$L/spect.c" "$L/ssml.c" \
    "$L/synthdata.c" "$L/synthesize.c" "$L/tr_languages.c" "$L/translate.c" "$L/translateword.c" \
    "$L/voices.c" "$L/wavegen.c" "$L/speech.c" "$L/espeak_api.c" \
    "$U/case.c" "$U/categories.c" "$U/ctype.c" "$U/proplist.c" "$U/scripts.c" "$U/tostring.c"
cp "$SRC/COPYING" "$OUT/LICENSE"
echo "espeak $(git -C "$SRC" rev-parse --short HEAD 2>/dev/null): espeak.js $(wc -c < "$OUT/espeak.js") B, espeak.wasm $(wc -c < "$OUT/espeak.wasm") B"
