#!/usr/bin/env bash
# Archive the Broadcast Room's three channels to Google Drive (owner-permitted copies; the site itself keeps streaming
# from YouTube). Re-runnable: a download archive records finished videos, so later runs only fetch new uploads.
#
#   bash tools/broadcast/archive-to-drive.sh [--max-height 480] [--limit N] [handle ...]
#
# Files land in "My Drive/Break Thy Rule/Broadcast Room/<Channel>/<upload date> <title> [<id>].mp4" (H.264 + AAC,
# metadata and thumbnail embedded). Downloads are assembled in a local cache and moved into Drive only when complete,
# and the run pauses whenever free disk space falls below MIN_FREE_GB so Google Drive (streaming mode) can upload
# and evict files before the next one.
set -uo pipefail
MAX_HEIGHT=480 LIMIT=0 MIN_FREE_GB=${MIN_FREE_GB:-12} HANDLES=()
while (($#)); do case "$1" in --max-height) MAX_HEIGHT=$2; shift 2;; --limit) LIMIT=$2; shift 2;; *) HANDLES+=("$1"); shift;; esac; done
((${#HANDLES[@]})) || HANDLES=(mylunchbreak conspiracyrus mindunveiled)

DRIVE=$(ls -d "$HOME"/Library/CloudStorage/GoogleDrive-*/"My Drive" 2>/dev/null | head -1)
[ -n "$DRIVE" ] || { echo "Google Drive for desktop is not set up (no ~/Library/CloudStorage/GoogleDrive-*/My Drive)"; exit 1; }
DEST="$DRIVE/Break Thy Rule/Broadcast Room"; CACHE="$HOME/Library/Caches/breakthyrule-broadcast"
mkdir -p "$DEST" "$CACHE"
GUARD="$CACHE/wait-for-space.sh"
cat > "$GUARD" <<EOF
#!/usr/bin/env bash
# pause until Google Drive has uploaded and evicted enough to keep $MIN_FREE_GB GB free
while [ "\$(df -g "$HOME" | awk 'NR==2{print \$4}')" -lt $MIN_FREE_GB ]; do echo "[archive] low disk space, waiting for Google Drive to upload"; sleep 60; done
EOF
chmod +x "$GUARD"

for handle in "${HANDLES[@]}"; do
  echo "[archive] $handle -> $DEST"
  extra=(); ((LIMIT > 0)) && extra=(--playlist-end "$LIMIT")
  yt-dlp "https://www.youtube.com/@$handle/videos" ${extra[@]+"${extra[@]}"} \
    -f "bv*[height<=$MAX_HEIGHT][vcodec^=avc1]+ba[acodec^=mp4a]/b[height<=$MAX_HEIGHT][ext=mp4]/b[height<=$MAX_HEIGHT]" \
    --merge-output-format mp4 --embed-metadata --embed-thumbnail --convert-thumbnails jpg \
    --paths "temp:$CACHE/partial" --paths "home:$DEST" \
    -o "%(channel)s/%(upload_date>%Y-%m-%d)s %(title).150B [%(id)s].%(ext)s" \
    --download-archive "$DEST/.downloaded.txt" --no-overwrites --continue --ignore-errors \
    --sleep-requests 2 --sleep-interval 20 --max-sleep-interval 45 \
    --exec "before_dl:$GUARD" --no-progress --console-title \
    2>&1 | grep --line-buffered -E "^\[download\] (Destination|.* has already been recorded)|^\[Merger\]|ERROR|WARNING: \[youtube\].*(unavailable|members|Private)|\[archive\]|^\[info\].*Downloading [0-9]+ items"
done
echo "[archive] done: $(find "$DEST" -name '*.mp4' | wc -l | tr -d ' ') videos in $DEST"
