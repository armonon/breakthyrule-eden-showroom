#!/usr/bin/env python3
"""Convert MakeHuman / MPFB 2 CC0 system assets into compact web files.

The avatar in character-model.js is the MakeHuman hm08 base mesh, so MakeHuman
proxies (skin UVs, eyes, eyebrows, eyelashes, hair) fit it directly. This
script bakes them into:

  assets/character-human-assets.js   skin UVs, eyes, brows, lashes, texture metadata
  assets/mh/hair-<name>.json         hair proxies, fetched on demand
  assets/mh/*.jpg|*.webp             downsized textures

Usage:
  python3 -I tools/build-human-assets.py <makehuman_system_assets dir> <hm08 base.obj>

Sources (CC0 1.0):
  https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
  https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/3dobjs/base.obj
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'mh')
BODY_VERTS = 13380            # hm08 body vertices, same order as GardenHumanBase.positions
TIGHTS_START, TIGHTS_END = 15328, 18001   # helper-tights, stored at 13380.. in GardenHumanBase
BASE_COUNT = BODY_VERTS + (TIGHTS_END - TIGHTS_START + 1)

# Creator option key -> MakeHuman hair asset. Keys stay stable for saved characters.
HAIR = {
    'crop': 'short02', 'side': 'short04', 'slick': 'short03', 'quiff': 'short01',
    'curls': 'afro01', 'bob': 'bob01', 'long': 'long01', 'ponytail': 'ponytail01',
    'bun': 'braid01', 'locs': 'bob02',
}
SKIN_TONES = {'light': 'caucasian', 'medium': 'asian', 'dark': 'african'}
SKIN_AGES = ['young', 'middleage', 'old']
EYES = ['brown', 'brownlight', 'green', 'bluegreen', 'blue', 'lightblue', 'deepblue', 'grey', 'ice']


def r(values, digits):
    return [round(v, digits) for v in values]


def read_obj(path):
    verts, uvs, faces = [], [], []
    group = None
    for line in open(path):
        t = line.split()
        if not t:
            continue
        if t[0] == 'v':
            verts.append(tuple(map(float, t[1:4])))
        elif t[0] == 'vt':
            uvs.append(tuple(map(float, t[1:3])))
        elif t[0] == 'g':
            group = t[1] if len(t) > 1 else None
        elif t[0] == 'f':
            corners = []
            for c in t[1:]:
                parts = c.split('/')
                corners.append((int(parts[0]) - 1, int(parts[1]) - 1 if len(parts) > 1 and parts[1] else 0))
            faces.append((group, corners))
    return verts, uvs, faces


def split_corners(faces, uvs, keep=lambda g: True):
    """Unique (vertex, uv) pairs and triangle indices into them."""
    lookup, corner_vert, corner_uv, tris = {}, [], [], []
    for group, corners in faces:
        if not keep(group):
            continue
        ids = []
        for vi, ti in corners:
            key = (vi, ti)
            if key not in lookup:
                lookup[key] = len(corner_vert)
                corner_vert.append(vi)
                corner_uv.extend(uvs[ti])
            ids.append(lookup[key])
        for k in range(1, len(ids) - 1):
            tris.extend((ids[0], ids[k], ids[k + 1]))
    return corner_vert, r(corner_uv, 4), tris


def read_mhclo(path):
    scale, entries = {}, []
    in_verts = False
    for line in open(path):
        t = line.split()
        if not t or t[0].startswith('#'):
            continue
        if t[0] in ('x_scale', 'y_scale', 'z_scale'):
            scale[t[0][0]] = [int(t[1]), int(t[2]), float(t[3])]
        elif t[0] == 'verts':
            in_verts = True
        elif in_verts and len(t) == 9 and t[0].isdigit():
            entries.append(([int(x) for x in t[:3]], [float(x) for x in t[3:6]], [float(x) for x in t[6:9]]))
        elif in_verts and len(t) == 1 and t[0].isdigit():
            entries.append(([int(t[0])] * 3, [1.0, 0.0, 0.0], [0.0, 0.0, 0.0]))
        elif t[0] in ('delete_verts', 'weights', 'shapekey'):
            in_verts = False
    return scale, entries


def nearest_body(p, base):
    best, best_d = 0, 1e9
    for i in range(BODY_VERTS):
        q = base[i]
        d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2
        if d < best_d:
            best, best_d = i, d
    return best


def proxy(mhclo, base):
    folder = os.path.dirname(mhclo)
    scale, entries = read_mhclo(mhclo)
    obj = next(os.path.join(folder, f) for f in os.listdir(folder) if f.endswith('.obj'))
    verts, uvs, faces = read_obj(obj)
    if len(verts) != len(entries):
        raise SystemExit(f'{mhclo}: {len(entries)} fitting rows for {len(verts)} vertices')
    extra, extra_index = [], {}

    def remap(i):
        if i < BODY_VERTS:
            return i
        if TIGHTS_START <= i <= TIGHTS_END:
            return BODY_VERTS + i - TIGHTS_START
        if i not in extra_index:
            extra_index[i] = len(extra)
            extra.append(i)
        return BASE_COUNT + extra_index[i]

    refs, weights, offsets = [], [], []
    for ids, w, off in entries:
        refs.extend(remap(i) for i in ids)
        weights.extend(w)
        offsets.extend(off)
    corner_vert, corner_uv, tris = split_corners(faces, uvs)
    return {
        'scale': [scale['x'], scale['y'], scale['z']],
        'refs': refs, 'w': r(weights, 5), 'off': r(offsets, 5),
        'extra': {'p': r([c for i in extra for c in base[i]], 5), 'from': [nearest_body(base[i], base) for i in extra]},
        'corners': corner_vert, 'uv': corner_uv, 'tris': tris,
    }


def mean_rgb(im, box):
    crop = im.convert('RGB').crop(box).resize((32, 32))
    px = list(crop.get_flattened_data())
    return [round(sum(p[k] for p in px) / len(px) / 255, 4) for k in range(3)]


def save_jpg(src, name, size, cover=None):
    im = Image.open(src).convert('RGB').resize((size, size), Image.LANCZOS)
    if cover:
        im = cover(im)
    im.save(os.path.join(OUT, name), quality=86, optimize=True, progressive=True)
    return im


def modesty_mask(base, uvs, faces, size):
    """UV mask over the groin and nipples. Avatars wear leaves; this keeps gaps clean."""
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    for group, corners in faces:
        if group != 'body':
            continue
        cx, cy, cz = (sum(base[v][k] for v, _ in corners) / len(corners) for k in range(3))
        groin = -1.5 < cy < 1.0 and abs(cx) < .8 and (cz > .15 or cy < -.2)
        nipple = min((cx - s * .70) ** 2 + (cy - 3.9) ** 2 + (cz - 1.5) ** 2 for s in (-1, 1)) < .38 ** 2
        if groin or nipple:
            draw.polygon([(uvs[t][0] * size, (1 - uvs[t][1]) * size) for _, t in corners], fill=255)
    return mask.filter(ImageFilter.MaxFilter(9))


def cover_with_skin(mask):
    def apply(im):
        # Fill with the surrounding skin colour, then feather the edge.
        ring = Image.eval(mask.filter(ImageFilter.MaxFilter(31)), lambda v: v) 
        ring_px = [p for p, a, b in zip(im.get_flattened_data(), ring.get_flattened_data(), mask.get_flattened_data()) if a and not b]
        fill = tuple(sorted(c[k] for c in ring_px)[len(ring_px) // 2] for k in range(3)) if ring_px else (200, 160, 130)
        blurred = Image.composite(Image.new('RGB', im.size, fill), im, mask).filter(ImageFilter.GaussianBlur(10))
        return Image.composite(blurred, im, mask.filter(ImageFilter.GaussianBlur(6)))
    return apply


def save_tintable(src, name, size):
    """Grey + alpha so the runtime can tint to any colour.

    Stretches the 98th percentile of opaque pixels to white (no clipping of strand
    detail) and returns the resulting median, which the runtime divides out.
    """
    im = Image.open(src).convert('RGBA').resize((size, size), Image.LANCZOS)
    grey, alpha = im.convert('L'), im.getchannel('A')
    values = sorted(g for g, a in zip(grey.get_flattened_data(), alpha.get_flattened_data()) if a > 128) or [180]
    gain = 255 / max(1, values[int(len(values) * .98)])
    grey = grey.point(lambda v: min(255, int(v * gain)))
    Image.merge('RGBA', (grey, grey, grey, alpha)).save(os.path.join(OUT, name), quality=88, method=6)
    return round(min(1, values[len(values) // 2] * gain / 255), 4)


def main(pack, base_obj):
    os.makedirs(OUT, exist_ok=True)
    base, base_uv, base_faces = read_obj(base_obj)
    skin_vert, skin_uv, skin_tris = split_corners(base_faces, base_uv, keep=lambda g: g == 'body')

    cover = cover_with_skin(modesty_mask(base, base_uv, base_faces, 1024))
    skins = {}
    for tone, ethnic in SKIN_TONES.items():
        for age in SKIN_AGES:
            # Male textures: natural lip colour, which reads neutral on every body shape.
            folder = os.path.join(pack, 'skins', f'{age}_{ethnic}_male')
            src = next(os.path.join(folder, f) for f in sorted(os.listdir(folder)) if 'diffuse' in f and f.endswith('.png'))
            name = f'skin-{tone}-{age}.jpg'
            im = save_jpg(src, name, 1024, cover)
            # Both cheeks, used to tint the texture to the exact creator skin tone (faces are redder than torsos).
            left, right = mean_rgb(im, (880, 410, 910, 440)), mean_rgb(im, (880, 600, 910, 630))
            skins[f'{tone}-{age}'] = {'file': name, 'mean': [round((x + y) / 2, 4) for x, y in zip(left, right)]}

    eyes = {}
    for color in EYES:
        src = os.path.join(pack, 'eyes', 'materials', f'{color}_eye.png')
        # RGBA: the outer cornea shell maps to a fully transparent spot in the texture.
        im = Image.open(src).convert('RGBA').resize((256, 256), Image.LANCZOS)
        if color == 'brown':  # The source iris is close to red; pull it toward a natural dark brown.
            rgb = Image.blend(im.convert('RGB'), im.convert('L').convert('RGB'), .45)
            im = Image.merge('RGBA', (*rgb.split(), im.getchannel('A')))
        im.save(os.path.join(OUT, f'eye-{color}.webp'), quality=88, method=6)
        eyes[color] = {'file': f'eye-{color}.webp', 'iris': mean_rgb(im, (55, 160, 66, 171))}

    tint = {
        'eyebrow': save_tintable(os.path.join(pack, 'eyebrows', 'eyebrow001', 'eyebrow001.png'), 'eyebrow.webp', 256),
        'eyelashes': save_tintable(os.path.join(pack, 'eyelashes', 'eyelashes01', 'eyelashes01.png'), 'eyelashes.webp', 256),
    }

    hair = {}
    for key, asset in HAIR.items():
        folder = os.path.join(pack, 'hair', asset)
        data = proxy(os.path.join(folder, asset + '.mhclo'), base)
        with open(os.path.join(OUT, f'hair-{asset}.json'), 'w') as f:
            json.dump(data, f, separators=(',', ':'))
        diffuse = next(os.path.join(folder, n) for n in os.listdir(folder) if 'diffuse' in n and n.endswith('.png'))
        hair[key] = {'asset': asset, 'median': save_tintable(diffuse, f'hair-{asset}.webp', 1024)}

    bundle = {
        'source': 'MakeHuman / MPFB 2 system assets, CC0 1.0',
        'skin': {'corners': skin_vert, 'uv': skin_uv, 'tris': skin_tris},
        'eyes': proxy(os.path.join(pack, 'eyes', 'high-poly', 'high-poly.mhclo'), base),
        'eyebrows': proxy(os.path.join(pack, 'eyebrows', 'eyebrow001', 'eyebrow001.mhclo'), base),
        'eyelashes': proxy(os.path.join(pack, 'eyelashes', 'eyelashes01', 'eyelashes01.mhclo'), base),
        'skins': skins, 'eyeTextures': eyes, 'hair': hair, 'tint': tint,
    }
    with open(os.path.join(ROOT, 'assets', 'character-human-assets.js'), 'w') as f:
        f.write("'use strict';\n// CC0 MakeHuman / MPFB 2 assets. See assets/mh/LICENSE.txt. Built by tools/build-human-assets.py.\n")
        f.write('window.GardenHumanAssets=' + json.dumps(bundle, separators=(',', ':')) + ';\n')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
