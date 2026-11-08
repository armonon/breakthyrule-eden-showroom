#!/usr/bin/env python3
"""Refresh the Broadcast Room's video index from the channels' public upload lists.

  python3 tools/broadcast/build-index.py            # writes assets/broadcast/channels.json

Metadata only (yt-dlp --flat-playlist: video id, title, duration); nothing is downloaded. The museum's TV wall plays
the videos through YouTube's embedded player, and broadcast.html links each one back to YouTube, so the creators keep
their views and the site never hosts their files.
"""
import json
import subprocess
import sys
import time
from pathlib import Path

CHANNELS = [  # handle, channel id (resolved from youtube.com/@handle)
    ("mylunchbreak", "UC7Za5DiASIbqT8fuhiDBU6Q"),
    ("conspiracyrus", "UC6ubbifx2lhO4bNLYwDWbjA"),
    ("mindunveiled", "UC4TjXPVIYz9Z13SB3vxKuZQ"),
]
OUT = Path(__file__).resolve().parents[2] / "assets" / "broadcast" / "channels.json"


def listing(channel_id):
    r = subprocess.run(["yt-dlp", "--flat-playlist", "--skip-download", "-J",
                        f"https://www.youtube.com/channel/{channel_id}/videos"], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"yt-dlp failed for {channel_id}: {r.stderr[-400:]}")
    return json.loads(r.stdout)


channels = []
for handle, cid in CHANNELS:
    d = listing(cid)
    videos = [[e["id"], e.get("title") or "", int(e.get("duration") or 0)] for e in d.get("entries", []) if e.get("id")]
    channels.append({"handle": handle, "id": cid, "title": d.get("channel") or d.get("title") or handle,
                     "url": f"https://www.youtube.com/@{handle}", "uploads": "UU" + cid[2:], "videos": videos})
    print(f"{handle}: {len(videos)} videos")
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({"generated": time.strftime("%Y-%m-%d"), "channels": channels}, ensure_ascii=False,
                          separators=(",", ":")))
print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")
