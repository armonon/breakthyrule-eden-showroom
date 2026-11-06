#!/usr/bin/env python3
"""Encode the Cycles bake (tools/blender/bake_garden_light.py) for the web, into assets/eden-bake/.
  python3 tools/pipeline/encode-garden-light.py BAKE_DIR assets/eden-bake
  lightmap.jpg  terrain sky + bounce light, value = sqrt(irradiance / SCALE), three's flipY convention
  sun.jpg       terrain sun visibility, 0..1
  probes.bin    per probe 8 bytes: RGB = sqrt(mean irradiance / SCALE), A unused, XYZ = dominant direction * .5 + .5, W unused
  bake.json     grid and scale
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
PI = np.pi
ind = np.load(f"{src}/terrain_indirect.npy") * PI
sun = np.load(f"{src}/terrain_sun.npy")
probes = np.load(f"{src}/probes.npy") * PI
meta = json.load(open(f"{src}/probes.json"))
SCALE = float(max(np.percentile(ind, 99.8), np.percentile(probes, 99.8)) * 1.15)
def box(a, n=1):  # small 3x3 box passes remove bake noise without blurring shadows much
    for _ in range(n):
        a = sum(np.roll(np.roll(a, y, 0), x, 1) for y in (-1, 0, 1) for x in (-1, 0, 1)) / 9
    return a
# terrain hidden under other surfaces (road verges, floors, the pond) bakes black; fill it from the nearest lit pixel so
# nothing dark bleeds out through filtering, and hold the sun term at open sky there
from scipy import ndimage as ni
covered = ind.sum(axis=2) < .02
near = ni.distance_transform_edt(covered, return_distances=False, return_indices=True)
ind = ind[tuple(near)]; sun = np.where(covered, sun[tuple(near)], sun)
rgb = np.sqrt(np.clip(box(ind, 2) / SCALE, 0, 1))
Image.fromarray((rgb[::-1] * 255 + .5).astype(np.uint8)).save(f"{out}/lightmap.jpg", quality=92, subsampling=0)
Image.fromarray((np.clip(box(sun, 1), 0, 1)[::-1] * 255 + .5).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS).save(f"{out}/sun.jpg", quality=88)
# 6 directions -> mean colour + dominant direction (scaled so rgb*(1+dot(d,n)) reconstructs the cube along axes)
mean = probes.mean(axis=3)
lum = probes @ np.array([.2126, .7152, .0722])
L = lum.mean(axis=3)[..., None] + 1e-5
d = np.stack([lum[..., 0] - lum[..., 1], lum[..., 2] - lum[..., 3], lum[..., 4] - lum[..., 5]], -1) / 2 / L
nz, ny, nx = mean.shape[:3]
A = np.concatenate([np.sqrt(np.clip(mean / SCALE, 0, 1)), np.ones((nz, ny, nx, 1))], -1)
B = np.concatenate([np.clip(d * .5 + .5, 0, 1), np.ones((nz, ny, nx, 1))], -1)
((np.concatenate([A, B], -1) * 255 + .5).astype(np.uint8)).tofile(f"{out}/probes.bin")
json.dump({"scale": SCALE, "min": meta["min"], "step": meta["step"], "dims": meta["dims"]}, open(f"{out}/bake.json", "w"))
print("scale", SCALE, "probe mean", float(mean.mean()), "terrain mean", float(ind.mean()), "sun mean", float(sun.mean()))
# Grass exclusion: anything solid low to the ground (stones, floors, ponds, plinths) from the geometry dump, top down.
if len(sys.argv) > 3:
    meta = json.load(open(f"{sys.argv[3]}/scene.json")); data = np.fromfile(f"{sys.argv[3]}/scene.bin", dtype=np.float32)
    from PIL import ImageDraw
    N = 960; mask = Image.new("L", (N, N), 0); draw = ImageDraw.Draw(mask)  # 25 cm per pixel over 240 m; row 0 = z -120
    for b in meta:
        if b["cutout"] or b["name"] == "terrain": continue
        t = data[b["offset"]:b["offset"] + b["n"]].reshape(-1, 3, 3)
        t = t[(t[:, :, 1].max(axis=1) < 3) | (t[:, :, 1].min(axis=1) < 1.2)]
        for tri in t:
            draw.polygon([((x + 120) * 4, (z + 120) * 4) for x, _, z in tri], fill=255)
    mask.save(f"{out}/grass-mask.png", optimize=True); print("grass mask", os.path.getsize(f"{out}/grass-mask.png") // 1024, "KB")
