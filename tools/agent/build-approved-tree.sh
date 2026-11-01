#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE="${1:-}"
OUTPUT="${2:-$ROOT/assets/beyond-eden/trees}"
BLENDER_BIN="${BLENDER_BIN:-blender}"

fail() { echo "ERROR: $*" >&2; exit 1; }
[[ -n "$SOURCE" ]] || fail "Usage: $0 /absolute/path/to/already-approved-tree.{glb,gltf,fbx,obj,blend} [output-dir]"
[[ -f "$SOURCE" ]] || fail "Approved local tree source not found: $SOURCE"
command -v "$BLENDER_BIN" >/dev/null 2>&1 || [[ -x "$BLENDER_BIN" ]] || fail "Blender not found. Set BLENDER_BIN to the Blender 5 executable."

mkdir -p "$OUTPUT"

echo "[1/4] Preparing LOD0 and LOD1 from the already-approved local tree…"
"$BLENDER_BIN" --background --factory-startup \
  --python "$ROOT/tools/blender/prepare_approved_tree.py" -- \
  --input "$SOURCE" \
  --output "$OUTPUT" \
  --target-height "${TREE_TARGET_HEIGHT:-9}" \
  --lod0-ratio "${TREE_LOD0_RATIO:-0.12}" \
  --lod1-ratio "${TREE_LOD1_RATIO:-0.035}" \
  --keep-blend

echo "[2/4] Rendering transparent billboard from LOD0…"
"$BLENDER_BIN" --background --factory-startup \
  --python "$ROOT/tools/blender/build_tree_impostor.py" -- \
  --input "$OUTPUT/hero-tree-lod0.glb" \
  --output "$OUTPUT/hero-tree-billboard.png" \
  --size "${TREE_BILLBOARD_SIZE:-1024}"

echo "[3/4] Encoding billboard to KTX2…"
bash "$ROOT/tools/pipeline/encode-tree-billboard.sh" \
  "$OUTPUT/hero-tree-billboard.png" \
  "$OUTPUT/hero-tree-billboard.ktx2"

echo "[4/4] Validating tree derivatives…"
node "$ROOT/tools/pipeline/validate-tree-assets.mjs" "$OUTPUT"

cat <<MSG

Tree derivatives are ready in:
  $OUTPUT

Now fill the real provenance fields in:
  $OUTPUT/tree-source-ledger.json

Do not publish while provenance/license fields remain null.
MSG
