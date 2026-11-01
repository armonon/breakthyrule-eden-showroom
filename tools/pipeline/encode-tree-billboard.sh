#!/usr/bin/env bash
set -euo pipefail

INPUT="${1:-assets/beyond-eden/trees/hero-tree-billboard.png}"
OUTPUT="${2:-assets/beyond-eden/trees/hero-tree-billboard.ktx2}"

if ! command -v ktx >/dev/null 2>&1; then
  echo "KTX-Software 'ktx' is missing. Installing it requires explicit approval unless already approved locally." >&2
  exit 2
fi
if [[ ! -f "$INPUT" ]]; then
  echo "Missing billboard source: $INPUT" >&2
  exit 3
fi

mkdir -p "$(dirname "$OUTPUT")"
rm -f "$OUTPUT"
ktx create \
  --format R8G8B8A8_SRGB \
  --encode basis-lz \
  --qlevel 255 \
  --clevel 2 \
  --generate-mipmap \
  --mipmap-filter lanczos4 \
  "$INPUT" "$OUTPUT"

[[ -s "$OUTPUT" ]] || { echo "KTX2 encoder produced an empty output: $OUTPUT" >&2; exit 4; }
ktx info "$OUTPUT" >/dev/null

echo "[Beyond Eden] Wrote and validated $OUTPUT"
