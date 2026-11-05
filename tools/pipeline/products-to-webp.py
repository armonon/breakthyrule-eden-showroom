#!/usr/bin/env python3
"""Convert product PNGs to WebP (alpha kept) and point the site's references at them. Originals stay in git history.
  python3 tools/pipeline/products-to-webp.py"""
import glob, os, re, subprocess
from PIL import Image
before = after = 0
for png in glob.glob("products/*.png"):
    webp = png[:-4] + ".webp"
    Image.open(png).save(webp, quality=88, method=6)
    before += os.path.getsize(png); after += os.path.getsize(webp); os.remove(png)
print(f"products: {before / 1048576:.1f} -> {after / 1048576:.1f} MB")
for f in subprocess.run(["git", "grep", "-l", "/products/", "--", "*.js", "*.html", "*.json", ":!assets"], capture_output=True, text=True).stdout.split():
    s = open(f).read(); t = re.sub(r"(/products/[^\"'`)\s]+?)\.png", r"\1.webp", s)
    if s != t: open(f, "w").write(t); print("updated", f)
