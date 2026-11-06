#!/usr/bin/env python3
"""Build the garden's foliage cards from photographic CC0 scans (Poly Haven): cut each plant part out of the scan's atlas
with its alpha map and arrange the parts into the card layouts eden-flora.js expects. Colour edges are dilated so
mipmaps and alpha-tested edges never pick up the black matte.
  python3 tools/pipeline/build-foliage-cards.py WORKSHOP/downloads/polyhaven/models assets/eden-textures/foliage"""
import glob, math, os, random, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ni
src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
random.seed(4117)
def load(model, diff_name, alpha_name):
    d = f"{src}/{model}/textures"
    rgb = Image.open(f"{d}/{diff_name}").convert("RGB")
    a = Image.open(f"{d}/{alpha_name}").convert("L").resize(rgb.size)
    return np.asarray(rgb), np.asarray(a)
def sprites(rgb, a, min_area, keep=lambda w, h: True, erode=0):
    solid = a > 110
    lab, n = ni.label(ni.binary_erosion(solid, iterations=erode) if erode else solid)
    if erode:  # split at thin stems, then grow each part back to its real outline
        lab = ni.grey_dilation(lab, size=erode * 2 + 1) * solid
    res = []
    for i, sl in enumerate(ni.find_objects(lab)):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        mask = lab[sl] == i + 1
        if mask.sum() < min_area or not keep(w, h): continue
        al = np.where(ni.binary_dilation(mask, iterations=2), a[sl], 0).astype(np.uint8)
        res.append(Image.fromarray(np.dstack([rgb[sl], al]), "RGBA"))
    return res
def tinted(im, k):
    arr = np.asarray(im, np.float32).copy(); arr[..., :3] = np.clip(arr[..., :3] * k, 0, 255); return Image.fromarray(arr.astype(np.uint8), "RGBA")
def finish(card, name, q=86):
    arr = np.asarray(card, np.float32); solid = arr[..., 3] > 20
    # bleed colour outward beneath the transparent area
    idx = ni.distance_transform_edt(~solid, return_distances=False, return_indices=True)
    rgb = arr[..., :3][tuple(idx)]
    Image.fromarray(np.dstack([rgb, arr[..., 3]]).astype(np.uint8), "RGBA").save(f"{out}/{name}.webp", quality=q, method=4, exact=True)
    print(name, os.path.getsize(f"{out}/{name}.webp") // 1024, "KB", f"coverage {(arr[..., 3] > 128).mean():.2f}")

# broadleaf: photographed leaves radiating from a centre (the card shape eden-flora.js expects)
rgb, a = load("tree_small_02", "tree_small_02_leaves_diff_1k.jpg", "leaves_alpha_1k.png")
# the atlas smears dark stem colour under its twigs: keep only clearly green, lit pixels (the leaves)
a = np.where((rgb[..., 1].astype(int) > 55) & (rgb[..., 1].astype(int) >= rgb[..., 2]) & (rgb[..., 1].astype(int) >= rgb[..., 0] * .9), a, 0).astype(np.uint8)
# leaf islands are connected to twigs: erode to split, then keep blob-shaped parts
leaves = sprites(rgb, a, 500, lambda w, h: max(w, h) < 3 * min(w, h) and max(w, h) < 300, erode=3)
print("leaf sprites", len(leaves))
S = 1024; card = Image.new("RGBA", (S, S), (70, 90, 45, 0))
for i in range(150):
    ang = random.uniform(0, 2 * math.pi); r = (random.random() ** .62) * S * .40
    s = random.choice(leaves); scale = random.uniform(.34, .62) * S / 1024 * 1.5
    im = tinted(s, random.uniform(.72, 1.12)).resize((max(2, int(s.width * scale)), max(2, int(s.height * scale))), Image.LANCZOS).rotate(-math.degrees(ang) + random.uniform(-60, 60), Image.BICUBIC, expand=True)
    card.alpha_composite(im, (int(S / 2 + math.cos(ang) * r - im.width / 2), int(S / 2 + math.sin(ang) * r - im.height / 2)))
finish(card, "broadleaf-card")

# grass: real blades and tufts standing on the card's bottom edge
blades = []
rgb, a = load("grass_bermuda_01", "grass_bermuda_01_diff_1k.jpg", "alpha_1k.png")
# no seed-head stalks (the tall thin sprites): this is a lawn, not a meadow
blades += sprites(rgb, a, 500, lambda w, h: h > w * .55 and h < w * 5)
rgb2, a2 = load("grass_medium_01", "grass_medium_01_diff_1k.jpg", "alpha_1k.png")
tufts = sprites(rgb2, a2, 2500, lambda w, h: w > 100 and h > 50 and h < 400)
print("grass sprites", len(blades), len(tufts))
W, H = 1024, 512; card = Image.new("RGBA", (W, H), (70, 90, 45, 0))
pool = blades + tufts * 3
for i in range(170):
    s = random.choice(pool); target = random.uniform(.34, .96) * H
    scale = min(target / s.height, W * .3 / s.width)
    im = tinted(s, random.uniform(.8, 1.2)).resize((max(2, int(s.width * scale)), max(2, int(s.height * scale))), Image.LANCZOS)
    if random.random() < .5: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    card.alpha_composite(im, (random.randint(0, max(0, W - im.width)), H - im.height))
finish(card, "grass-card", 82)

# fern: one real frond, upright
rgb, a = load("fern_02", "fern_02_diff_1k.jpg", "alpha_1k.png")
fronds = sorted(sprites(rgb, a, 3000, lambda w, h: h > 1.6 * w), key=lambda s: -s.height)
print("fronds", len(fronds))
f = fronds[0]; card = Image.new("RGBA", (256, 1024), (60, 90, 40, 0)); scale = min(1024 / f.height, 256 / f.width)
im = f.resize((int(f.width * scale), int(f.height * scale)), Image.LANCZOS); card.alpha_composite(im, ((256 - im.width) // 2, 1024 - im.height)); finish(card, "fern-card")

# cypress: dense dark sprays built from the same real fronds, tinted to needle green
S = 512; card = Image.new("RGBA", (S, S), (30, 50, 25, 0))
for i in range(120):
    ang = random.uniform(0, 2 * math.pi); r = math.sqrt(random.random()) * S * .42
    s = random.choice(fronds); k = random.uniform(.3, .55) * S / max(s.size)
    im = tinted(s, random.uniform(.4, .72)).resize((max(2, int(s.width * k)), max(2, int(s.height * k))), Image.LANCZOS).rotate(random.uniform(0, 360), Image.BICUBIC, expand=True)
    card.alpha_composite(im, (int(S / 2 + math.cos(ang) * r - im.width / 2), int(S / 2 + math.sin(ang) * r - im.height / 2)))
finish(card, "cypress-card")
