#!/usr/bin/env bash
# Compatibility entry: all production releases go through Git main.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "$ROOT/tools/ship.sh"
