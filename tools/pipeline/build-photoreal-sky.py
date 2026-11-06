#!/usr/bin/env python3
"""Turn a CC0 HDR panorama into the Photoreal setting's sky and horizon (assets/eden-photo/sky.webp + sky.json).

  python3 tools/pipeline/build-photoreal-sky.py SOURCE.hdr assets/eden-photo [--width 8192] [--bottom -6]

The scene pass is display-referred (eden-post.js renders tone-mapped sRGB into its buffer and the sky shaders write
display colours), so the panorama is tone-mapped here. Only elevations above --bottom are kept: nearer ground is real
geometry. Needs numpy, opencv (HDR reading) and Pillow (WebP).
"""
import argparse, json, os
os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "0")
import cv2, numpy as np
from PIL import Image

a = argparse.ArgumentParser()
a.add_argument("source"); a.add_argument("out")
a.add_argument("--width", type=int, default=8192); a.add_argument("--bottom", type=float, default=-6)
a.add_argument("--sky-level", type=float, default=.66, help="display value of the median sky")
a.add_argument("--quality", type=int, default=84)
args = a.parse_args()

hdr = cv2.imread(args.source, cv2.IMREAD_ANYDEPTH | cv2.IMREAD_COLOR)[:, :, ::-1].astype(np.float32)
h, w = hdr.shape[:2]
elev = 90 - (np.arange(h) + .5) / h * 180
luma = hdr @ np.array([.2126, .7152, .0722], np.float32)
row, col = np.unravel_index(np.argmax(cv2.GaussianBlur(luma, (0, 0), 6)), luma.shape)
sun_u, sun_elev = float((col + .5) / w), float(elev[row])

keep = elev >= args.bottom
crop = hdr[keep]
# Exposure from the median of open sky, then a soft shoulder; the sun itself clips to white.
median = float(np.median(luma[(elev > 12) & (elev < 70)]))
curve = lambda x: 1 - np.exp(-x)
k = -np.log(1 - args.sky_level ** 2.2) / median
display = np.clip(curve(crop * k), 0, 1) ** (1 / 2.2)
out_w = min(args.width, w)
out_h = round(crop.shape[0] * out_w / w)
image = cv2.resize(display, (out_w, out_h), interpolation=cv2.INTER_AREA)
os.makedirs(args.out, exist_ok=True)
path = os.path.join(args.out, "sky.webp")
Image.fromarray((image * 255 + .5).astype(np.uint8)).save(path, quality=args.quality, method=6)
json.dump({"sunU": round(sun_u, 5), "sunElevation": round(sun_elev, 2), "bottom": args.bottom, "width": out_w, "height": out_h},
          open(os.path.join(args.out, "sky.json"), "w"))
print(f"{path}: {out_w}x{out_h}, {os.path.getsize(path) / 1e6:.2f} MB, sun at u={sun_u:.4f} elevation {sun_elev:.1f}°, k={k:.4f}")
