#!/usr/bin/env bash
set -euo pipefail

PROJECT="${1:-$HOME/Projects/breakthyrule-eden-showroom}"
PORT="${PORT:-8777}"
[[ -d "$PROJECT" ]] || { echo "Project not found: $PROJECT" >&2; exit 2; }
cd "$PROJECT"
[[ -f server/eden-server.mjs ]] || { echo "Missing server/eden-server.mjs" >&2; exit 3; }

cat <<MSG
Starting the existing Eden server locally.
Proof URL: http://127.0.0.1:$PORT/beyond-eden.html
Forced WebGL2: http://127.0.0.1:$PORT/beyond-eden.html?forceWebGL=1
No remote service is contacted by this script.
MSG

PORT="$PORT" node server/eden-server.mjs
