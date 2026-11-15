#!/usr/bin/env bash
# Compatibility entry: validate the canonical Git release without publishing.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "$ROOT/tools/ship.sh" --dry-run
