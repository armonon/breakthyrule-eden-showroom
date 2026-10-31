#!/usr/bin/env bash
# Deploy the committed site (HEAD) to the Netlify production site, as a clean static copy:
# - built from `git archive HEAD` (uncommitted work never ships);
# - adds the vendored three.js r187 (git-ignored by design) needed by /beyond-eden.html;
# - drops the local game server, build tools, docs, package files and build intermediates.
# Multiplayer/arena stay off on the static site (deployment.js keeps mode "preview").
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_ID="${NETLIFY_SITE_ID:-5f44fbdb-d233-47df-8441-aee3fe327eb8}" # breakthyrule-eden-showroom
OUT="$(mktemp -d "${TMPDIR:-/tmp}/eden-deploy.XXXXXX")"
trap 'rm -rf "$OUT"' EXIT
cd "$ROOT"
commit="$(git rev-parse --short HEAD)"
git archive HEAD | tar -x -C "$OUT"
[[ -f assets/vendor/three-r187/build/three.webgpu.js ]] || { echo "Vendor three.js first: npm run proof:vendor-three" >&2; exit 1; }
rsync -a --exclude .gitkeep assets/vendor/three-r187/ "$OUT/assets/vendor/three-r187/"
rm -rf "$OUT/server" "$OUT/tools" "$OUT/docs" "$OUT/netlify.toml" "$OUT/package.json" "$OUT/package-lock.json" \
       "$OUT/assets/beyond-eden/raw" "$OUT/assets/beyond-eden/trees/hero-tree-billboard.png"
find "$OUT" -name '.gitignore' -delete
echo "Deploying $commit ($(du -sh "$OUT" | cut -f1)) to Netlify site $SITE_ID"
(cd "$OUT" && netlify deploy --prod --no-build --dir . --site "$SITE_ID" --message "${1:-Eden $commit}")
