#!/usr/bin/env bash
# Ship to the live site: sync with main, refresh cache versions, check, push. Netlify publishes main on its own.
# Every agent (Claude, Codex) and person uses this instead of a manual Netlify deploy. See AGENTS.md.
#   tools/ship.sh            merge origin/main, refresh versions, syntax-check, push HEAD to main
#   tools/ship.sh --dry-run  everything except the push
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
dry=false;[[ "${1:-}" == "--dry-run" ]]&&dry=true
if [[ -n "$(git status --porcelain --untracked-files=no)" ]];then echo "Commit your work first (tracked files have changes)." >&2;exit 1;fi
for attempt in 1 2 3 4;do
 git fetch -q origin main
 if ! git merge --no-edit -q origin/main;then
  echo "Merge conflict with main. Resolve it keeping both sides' work (AGENTS.md: union, then refresh versions), commit, rerun." >&2;exit 1
 fi
 node tools/expedition/build-revision.mjs >/dev/null
 node tools/refresh-css-versions.mjs >/dev/null
 # Check collections, chapters, museum catalogs and media against the complete release baseline.
 node tools/release/check-release.mjs --require-tracked
 # Syntax-check every top-level script the game pages load.
 bad=0;for f in $(grep -ohE 'src="/[^"?]+\.js' showroom.html expedition.html|sed 's#src="/##'|sort -u);do [[ -f "$f" ]]||{ echo "missing: $f" >&2;bad=1;continue; };node --check "$f" 2>/dev/null||{ echo "syntax error: $f" >&2;bad=1; };done
 # Every local file the pages reference must exist in the repo (nothing may live only on Netlify).
 for f in $(grep -ohE '(src|href)="/[^"?#]+\.(js|mjs|css|png|webp|jpg|svg|json)' index.html showroom.html expedition.html product.html|sed -E 's#^(src|href)="/##'|sort -u);do [[ -e "$f" ]]||{ echo "referenced but not in repo: $f" >&2;bad=1; };done
 ((bad))&&{ echo "Fix the problems above before shipping." >&2;exit 1; }
 if [[ -n "$(git status --porcelain --untracked-files=no)" ]];then git add -u showroom.html expedition.html expedition-build.js;git commit -q -m "Refresh cache versions";fi
 $dry&&{ echo "Dry run: ready to push $(git rev-parse --short HEAD) to main.";exit 0; }
 if git push -q origin HEAD:main;then echo "Shipped $(git rev-parse --short HEAD) to main; Netlify publishes it in about a minute.";exit 0;fi
 echo "main moved while shipping; syncing again ($attempt)…" >&2;sleep $((attempt*2))
done
echo "Could not push to main after 4 attempts." >&2;exit 1
