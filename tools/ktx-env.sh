# Source before `npm run proof:optimize` or tools/agent/build-approved-tree.sh: puts KTX-Software 4.4.2 on PATH.
# The official notarised pkg is unpacked (not installed) into tools/native/ktx-4.4.2 — see docs/beyond-eden/PROGRESS_LOG.
source "$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)/native/env.sh"
