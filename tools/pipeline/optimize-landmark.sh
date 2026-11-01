#!/usr/bin/env bash
# Shrink a night-district landmark GLB for the r158 garden (plain GLB, JPEG, no KTX2/meshopt decoders needed):
# normal and ARM maps to 512 px (colour stays 1k), JPEG quality 80, KHR_mesh_quantization.
#   bash tools/pipeline/optimize-landmark.sh IN.glb OUT.glb
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; GT="$ROOT/node_modules/.bin/gltf-transform"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/landmark.XXXXXX")"; trap 'rm -rf "$TMP"' EXIT
"$GT" resize "$1" "$TMP/a.glb" --width 512 --height 512 --pattern "*{nor_gl,arm,_normal}*" >/dev/null
"$GT" jpeg "$TMP/a.glb" "$TMP/b.glb" --quality 80 >/dev/null
"$GT" quantize "$TMP/b.glb" "$2" --quantize-position 14 --quantize-normal 10 --quantize-texcoord 12 >/dev/null
echo "$(basename "$1"): $(du -h "$1" | cut -f1) -> $(du -h "$2" | cut -f1)"
