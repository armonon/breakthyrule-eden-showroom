#!/usr/bin/env bash
# Publish a DRAFT preview of the committed site (HEAD) to Netlify — never production.
# Same clean copy as tools/deploy-netlify.sh plus the public-site redirects/headers and the Garment Lab function.
#   bash tools/deploy-netlify-draft.sh "message"
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_ID="${NETLIFY_SITE_ID:-5f44fbdb-d233-47df-8441-aee3fe327eb8}" # breakthyrule-eden-showroom
OUT="$(mktemp -d "${TMPDIR:-/tmp}/eden-draft.XXXXXX")"
trap 'rm -rf "$OUT"' EXIT
cd "$ROOT"
commit="$(git rev-parse --short HEAD)"
git archive HEAD | tar -x -C "$OUT"
[[ -f assets/vendor/three-r187/build/three.webgpu.js ]] && rsync -a --exclude .gitkeep assets/vendor/three-r187/ "$OUT/assets/vendor/three-r187/"
rm -rf "$OUT/server" "$OUT/tools" "$OUT/docs" "$OUT/netlify" "$OUT/netlify.toml" "$OUT/package.json" "$OUT/package-lock.json" \
       "$OUT/assets/beyond-eden/raw" "$OUT/assets/beyond-eden/trees/hero-tree-billboard.png"
find "$OUT" -name '.gitignore' -delete
cat > "$OUT/_redirects" <<'R'
/api/lab/*  /.netlify/functions/lab/:splat  200
/showroom   /showroom.html   200
/gallery    /gallery.html    200
/archive    /archive.html    200
/community  /                301
/product    /product.html    200
/studio     /studio.html     200
/lab        /lab.html        200
/lab-order  /lab-order.html  200
/lab-admin  /lab-admin.html  200
/lab-testpay /lab-testpay.html 200
/reliquary  /reliquary.html  200
/passport   /passport.html   200
/api/*      /preview-api-unavailable.json  404
R
cat > "$OUT/_headers" <<'H'
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Content-Security-Policy: frame-ancestors 'self'
/lab-admin*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
/lab-order*
  X-Robots-Tag: noindex
  Referrer-Policy: no-referrer
H
echo "Draft $commit ($(du -sh "$OUT" | cut -f1)) → Netlify site $SITE_ID"
(cd "$OUT" && netlify deploy --no-build --dir . --functions "$ROOT/netlify/functions" --site "$SITE_ID" --message "${1:-Draft $commit}")
