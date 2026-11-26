#!/usr/bin/env bash
# Re-run the landmark Blender pass end to end: decode the shipped GLBs, re-cut them in Blender, compress for the web.
#   bash tools/night/build-landmarks.sh [name ...]        (names without .glb; default all fourteen)
# Writes assets/night/built/<name>.glb (geometry + material names; night-district.js takes textures from assets/night).
# Needs `npm ci` (gltf-transform, meshoptimizer) and Blender 5 (BLENDER=..., default the macOS app).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/landmarks.XXXXXX")"; trap 'rm -rf "$TMP"' EXIT
files=(); for n in "$@"; do files+=("assets/night/$n.glb"); done
node tools/night/decode-landmarks.mjs "$TMP/decoded" ${files[@]+"${files[@]}"}
"$BLENDER" -b --factory-startup --python tools/night/build-landmarks.py -- "$TMP/decoded" "$TMP/built" ${1+"$@"} 2>&1 | grep '^\[build\]\|Error\|Traceback' || true
node tools/night/pack-built.mjs "$TMP/built" assets/night/built 2>&1 | grep -v '^quantize:\|^prune:'
