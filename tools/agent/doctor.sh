#!/usr/bin/env bash
set -euo pipefail

PROJECT="${1:-$HOME/Projects/breakthyrule-eden-showroom}"
BASE_BRANCH="${BASE_BRANCH:-asset-workshop/limestone-planter}"
WORK_BRANCH="${WORK_BRANCH:-beyond-eden/browser-realism-proof}"

section() { printf '\n=== %s ===\n' "$1"; }
command_status() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    printf '%-20s %s\n' "$name" "$(command -v "$name")"
  else
    printf '%-20s %s\n' "$name" "MISSING"
  fi
}

section "Read-only Beyond Eden doctor"
echo "Project: $PROJECT"
echo "Base branch: $BASE_BRANCH"
echo "Work branch: $WORK_BRANCH"
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

section "Machine"
uname -a || true
sw_vers 2>/dev/null || true
sysctl -n machdep.cpu.brand_string 2>/dev/null || true
sysctl -n hw.memsize 2>/dev/null | awk '{printf "Unified/system memory: %.1f GiB\n", $1/1073741824}' || true
df -h "$HOME" | tail -1 || true

section "Required commands"
for cmd in git node npm python3 rsync blender ktx toktx; do command_status "$cmd"; done
node --version 2>/dev/null || true
npm --version 2>/dev/null || true
blender --version 2>/dev/null | head -2 || true
ktx --version 2>/dev/null || true
toktx --version 2>/dev/null || true

section "Project"
if [[ ! -d "$PROJECT/.git" ]]; then
  echo "ERROR: local Git repository not found."
  exit 2
fi
cd "$PROJECT"
echo "Current branch: $(git branch --show-current)"
echo "HEAD: $(git rev-parse --short HEAD)"
echo "Working tree status:"
git status --short || true

echo
echo "Required branches:"
for branch in "$BASE_BRANCH" "$WORK_BRANCH"; do
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    echo "  present  $branch  $(git rev-parse --short "$branch")"
  else
    echo "  absent   $branch"
  fi
done

echo
echo "Recent local commits:"
git --no-pager log --oneline --decorate -8 || true

section "Expected project files"
for file in server/eden-server.mjs index.html package.json; do
  if [[ -e "$file" ]]; then echo "ok       $file"; else echo "MISSING  $file"; fi
done
for file in eden-lighting.js eden-post.js eden-flora.js eden-quality.js camera-sway.js multiplayer.js arena.js; do
  [[ -e "$file" ]] && echo "found    $file" || true
done

section "Proof status"
for file in beyond-eden.html beyond-eden/main.js beyond-eden/config.js tools/pipeline/check-runtime.mjs; do
  if [[ -e "$file" ]]; then echo "present  $file"; else echo "absent   $file"; fi
done
if [[ -f assets/vendor/three-r187/VENDOR-MANIFEST.json ]]; then
  echo "present  local three.js vendor"
else
  echo "pending  local three.js vendor"
fi
count=$(find assets/beyond-eden/optimized -maxdepth 1 -name '*.glb' 2>/dev/null | wc -l | tr -d ' ')
echo "optimized sector GLBs: $count / 15"
for file in hero-tree-lod0.glb hero-tree-lod1.glb hero-tree-billboard.ktx2; do
  if [[ -f "assets/beyond-eden/trees/$file" ]]; then
    echo "present  assets/beyond-eden/trees/$file"
  else
    echo "pending  assets/beyond-eden/trees/$file"
  fi
done

section "Installed pinned packages"
node - <<'NODE' 2>/dev/null || true
for (const name of ['three', '@gltf-transform/cli']) {
  try {
    const pkg = require(`${name}/package.json`);
    console.log(`${name}: ${pkg.version}`);
  } catch {
    console.log(`${name}: not installed in this project`);
  }
}
NODE

section "Doctor conclusion"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "The worktree is dirty. Preserve and inspect these changes before applying the handoff."
elif git show-ref --verify --quiet "refs/heads/$WORK_BRANCH"; then
  echo "The proof branch already exists. Resume it; do not rerun the initial application script."
elif git show-ref --verify --quiet "refs/heads/$BASE_BRANCH"; then
  echo "The base branch is present and clean. The handoff can be applied locally."
else
  echo "The required local base branch is missing. Do not substitute the stale remote branch without the user’s direction."
fi
