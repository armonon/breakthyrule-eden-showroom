#!/usr/bin/env bash
set -euo pipefail

PROJECT="${1:-$HOME/Projects/breakthyrule-eden-showroom}"
WORK_BRANCH="${WORK_BRANCH:-beyond-eden/browser-realism-proof}"
TREE_SOURCE="${TREE_SOURCE:-}"

fail() { echo "ERROR: $*" >&2; exit 1; }
[[ -d "$PROJECT/.git" ]] || fail "Not a Git repository: $PROJECT"
cd "$PROJECT"
[[ "$(git branch --show-current)" == "$WORK_BRANCH" ]] || fail "Switch to $WORK_BRANCH first."
[[ -z "$(git status --porcelain)" ]] || fail "Working tree is dirty. Commit the current stage before a heavy asset build."

if pgrep -x Blender >/dev/null 2>&1 || pgrep -x blender >/dev/null 2>&1; then
  fail "Another Blender process is already running. Respect the one-heavy-GPU-job rule."
fi

npm run proof:check
npm run proof:vendor-three
npm run proof:build-temple
npm run proof:optimize
npm run proof:inspect

if [[ -n "$TREE_SOURCE" ]]; then
  bash tools/agent/build-approved-tree.sh "$TREE_SOURCE" "$PROJECT/assets/beyond-eden/trees"
else
  echo "TREE_SOURCE is not set. Keeping the procedural tree fallback and continuing."
fi

npm run proof:check

echo
echo "Asset build complete. Review the scene before committing generated derivatives."
