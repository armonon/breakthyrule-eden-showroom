#!/usr/bin/env bash
set -euo pipefail

PROJECT="${1:-$HOME/Projects/breakthyrule-eden-showroom}"
STAMP="${2:-$(date +%Y-%m-%d-%H%M%S)}"
DEST="$PROJECT/docs/beyond-eden/evidence/$STAMP"

[[ -d "$PROJECT/.git" ]] || { echo "Not a Git repository: $PROJECT" >&2; exit 2; }
mkdir -p "$DEST"

{
  echo "createdAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "project=$PROJECT"
  echo "branch=$(git -C "$PROJECT" branch --show-current)"
  echo "commit=$(git -C "$PROJECT" rev-parse HEAD)"
  echo "node=$(node --version 2>/dev/null || true)"
  echo "npm=$(npm --version 2>/dev/null || true)"
  echo "blender=$(blender --version 2>/dev/null | head -1 || true)"
  echo "ktx=$(ktx --version 2>/dev/null | head -1 || true)"
  sw_vers 2>/dev/null || true
  uname -a
} > "$DEST/environment.txt"

for file in \
  "$PROJECT/assets/beyond-eden/optimized/optimization-manifest.json" \
  "$PROJECT/docs/generated/asset-sizes.json" \
  "$PROJECT/docs/generated/asset-inspection.txt" \
  "$PROJECT/assets/vendor/three-r187/VENDOR-MANIFEST.json" \
  "$PROJECT/assets/beyond-eden/trees/tree-source-ledger.json" \
  "$PROJECT/assets/beyond-eden/trees/hero-tree-source-manifest.json" \
  "$PROJECT/package-lock.json"; do
  [[ -f "$file" ]] && cp -a "$file" "$DEST/"
done

cat <<MSG
Evidence directory created:
  $DEST

Move browser-downloaded screenshots and benchmark JSON files into this folder, then run:
  node tools/agent/summarize-benchmarks.mjs "$DEST"/*.json
MSG
