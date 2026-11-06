#!/usr/bin/env python3
"""Build the first-person arm used for fist fighting.

Cuts the right arm (mid upper arm to fingertips) out of the MakeHuman hm08 base mesh, keeps its
real skeleton (upper arm, twisting forearm, wrist, metacarpals and three bones per finger) with the
CC0 default skin weights, and crops the matching region of each MakeHuman skin texture at full
resolution so the hands stay sharp right in front of the camera.

Inputs (all CC0):
  base.obj            https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/3dobjs/base.obj
  default.mhskel      https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/rigs/default.mhskel
  default_weights.mhw https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/rigs/default_weights.mhw
  makehuman_system_assets_cc0.zip (skins/) from https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/

Usage: python3 tools/build-fp-arms.py BASE_OBJ MHSKEL MHW PACK_DIR
Writes assets/fp-arm.js and assets/fp-arm/*.webp.
"""
import json, os, sys
from PIL import Image, ImageFilter, ImageOps, ImageChops

OUT_JS = 'assets/fp-arm.js'
OUT_DIR = 'assets/fp-arm'
SIDE = 'R'
KEEP = ['upperarm01', 'upperarm02', 'lowerarm01', 'lowerarm02', 'wrist',
        'metacarpal1', 'metacarpal2', 'metacarpal3', 'metacarpal4'] + \
       [f'finger{f}-{p}' for f in range(1, 6) for p in range(1, 4)]
SKIN_TONES = {'light': 'caucasian', 'medium': 'asian', 'dark': 'african'}
SKIN_AGES = ['young', 'middleage', 'old']
SCALE = 0.1  # hm08 units are decimetres


def read_obj(path):
    verts, uvs, faces, group = [], [], [], None
    for line in open(path):
        t = line.split()
        if not t:
            continue
        if t[0] == 'v':
            verts.append([float(x) for x in t[1:4]])
        elif t[0] == 'vt':
            uvs.append([float(x) for x in t[1:3]])
        elif t[0] == 'g':
            group = t[1] if len(t) > 1 else None
        elif t[0] == 'f' and group == 'body':
            faces.append([(int(c.split('/')[0]) - 1, int(c.split('/')[1]) - 1) for c in t[1:]])
    return verts, uvs, faces


def main(base_obj, mhskel, mhw, pack):
    verts, uvs, faces = read_obj(base_obj)
    skel = json.load(open(mhskel))
    weights_src = json.load(open(mhw))['weights']
    names = [f'{b}.{SIDE}' for b in KEEP]

    def joint(name):
        ids = skel['joints'][name]
        return [sum(verts[i][k] for i in ids) / len(ids) for k in range(3)]

    bones = []
    for name in names:
        b = skel['bones'][name]
        parent = b['parent'] if b['parent'] in names else None
        bones.append({'name': name, 'parent': parent, 'head': joint(b['head']), 'tail': joint(b['tail'])})
    origin = bones[0]['head']

    per_vertex = {}
    for bi, name in enumerate(names):
        for v, w in weights_src.get(name, []):
            per_vertex.setdefault(v, []).append((bi, w))
    total = {}
    for name, entries in weights_src.items():
        for v, w in entries:
            total[v] = total.get(v, 0) + w
    # Only vertices that belong almost entirely to the arm: this cuts cleanly through the upper arm.
    keep = {v for v, ws in per_vertex.items() if sum(w for _, w in ws) / max(total.get(v, 1), 1e-6) > 0.97}
    up = [i for i, b in enumerate(bones) if b['name'].startswith('upperarm01')][0]
    keep = {v for v in keep if not (len(per_vertex[v]) == 1 and per_vertex[v][0][0] == up and verts[v][1] > origin[1] - 0.6)}

    tris = []
    for f in faces:
        if all(v in keep for v, _ in f):
            for k in range(1, len(f) - 1):
                tris.append((f[0], f[k], f[k + 1]))

    corners, index = {}, []
    for tri in tris:
        for c in tri:
            if c not in corners:
                corners[c] = len(corners)
            index.append(corners[c])
    order = sorted(corners, key=corners.get)

    # Two UV islands are used: the forearm strip (top-left of the hm08 layout) and the hand (bottom).
    # Repack just those into a tight atlas so the texture stays at the source resolution.
    island = {}
    for tri in tris:
        top = sum(uvs[t][1] for _, t in tri) / 3 > 0.5
        for c in tri:
            island[c] = 'arm' if top else 'hand'
    boxes = {}
    for c, name in island.items():
        u, v = uvs[c[1]]
        b = boxes.setdefault(name, [u, u, v, v])
        b[0], b[1], b[2], b[3] = min(b[0], u), max(b[1], u), min(b[2], v), max(b[3], v)
    pad = 0.004
    for b in boxes.values():
        b[0] -= pad; b[1] += pad; b[2] -= pad; b[3] += pad
    # Atlas: hand on the left (most texels), forearm on the right, both at source pixel density.
    SRC = 2048
    size = {k: ((b[1] - b[0]) * SRC, (b[3] - b[2]) * SRC) for k, b in boxes.items()}
    atlas_w = size['hand'][0] + size['arm'][0]
    atlas_h = max(size['hand'][1], size['arm'][1])
    place = {'hand': (0, 0), 'arm': (size['hand'][0], 0)}

    def remap(c):
        name = island[c]
        b, (ox, oy), (w, h) = boxes[name], place[name], size[name]
        u, v = uvs[c[1]]
        x = ox + (u - b[0]) / (b[1] - b[0]) * w
        y = oy + (b[3] - v) / (b[3] - b[2]) * h
        return x / atlas_w, 1 - y / atlas_h

    positions, uv_out, skin_index, skin_weight = [], [], [], []
    for v, t in order:
        p = verts[v]
        positions += [round((p[k] - origin[k]) * SCALE, 5) for k in range(3)]
        ru, rv = remap((v, t))
        uv_out += [round(ru, 5), round(rv, 5)]
        ws = sorted(per_vertex[v], key=lambda e: -e[1])[:4]
        s = sum(w for _, w in ws)
        ws += [(0, 0.0)] * (4 - len(ws))
        skin_index += [b for b, _ in ws]
        skin_weight += [round(w / s, 4) for _, w in ws]

    os.makedirs(OUT_DIR, exist_ok=True)
    textures = {}
    normal_source = None
    for tone, ethnic in SKIN_TONES.items():
        for age in SKIN_AGES:
            folder = os.path.join(pack, 'skins', f'{age}_{ethnic}_male')
            src = next(os.path.join(folder, f) for f in sorted(os.listdir(folder)) if 'diffuse' in f and f.endswith('.png'))
            im = Image.open(src).convert('RGB')
            W, H = im.size
            scale = 1024 / atlas_w
            crop = Image.new('RGB', (1024, int(round(atlas_h * scale))), tuple(im.getpixel((int(.2 * W), int(.5 * H)))))
            for k, b in boxes.items():
                piece = im.crop((int(b[0] * W), int((1 - b[3]) * H), int(b[1] * W) + 1, int((1 - b[2]) * H) + 1))
                piece = piece.resize((max(1, int(round(size[k][0] * scale))), max(1, int(round(size[k][1] * scale)))), Image.LANCZOS)
                crop.paste(piece, (int(round(place[k][0] * scale)), int(round(place[k][1] * scale))))
            name = f'arm-{tone}-{age}.webp'
            crop.save(os.path.join(OUT_DIR, name), quality=88, method=6)
            # Forearm mean is used to tint toward the creator's exact skin tone.
            px = list(crop.resize((64, 64), Image.BOX).get_flattened_data())
            mean = [sum(p[k] for p in px) / len(px) / 255 for k in range(3)]
            textures[f'{tone}-{age}'] = {'file': name, 'mean': [round(m, 4) for m in mean]}
            if tone == 'medium' and age == 'young':
                normal_source = crop
    # Fine skin relief (pores, knuckle creases) from a high-pass of the diffuse luminance.
    grey = ImageOps.grayscale(normal_source)
    detail = ImageChops.subtract(grey, grey.filter(ImageFilter.GaussianBlur(6)), 1, 128)
    hx = list(detail.get_flattened_data())
    N, M = normal_source.size
    out = Image.new('RGB', (N, M))
    data = []
    strength = 2.2
    for y in range(M):
        for x in range(N):
            l = hx[y * N + (x - 1) % N]; r = hx[y * N + (x + 1) % N]
            u = hx[((y - 1) % M) * N + x]; d = hx[((y + 1) % M) * N + x]
            dx, dy = (r - l) / 255 * strength, (d - u) / 255 * strength
            n = (1 + dx * dx + dy * dy) ** -0.5
            data.append((int((-dx * n * .5 + .5) * 255), int((dy * n * .5 + .5) * 255), int((n * .5 + .5) * 255)))
    out.putdata(data)
    out.save(os.path.join(OUT_DIR, 'arm-normal.webp'), quality=90, method=6)

    payload = {
        'license': 'CC0 MakeHuman hm08 base mesh, default skeleton and weights, and skin textures',
        'bones': [{'name': b['name'], 'parent': b['parent'],
                   'head': [round((b['head'][k] - origin[k]) * SCALE, 5) for k in range(3)],
                   'tail': [round((b['tail'][k] - origin[k]) * SCALE, 5) for k in range(3)]} for b in bones],
        'positions': positions, 'uvs': uv_out, 'indices': index,
        'skinIndex': skin_index, 'skinWeight': skin_weight,
        'textures': textures, 'normal': 'arm-normal.webp'
    }
    with open(OUT_JS, 'w') as f:
        f.write('// Generated by tools/build-fp-arms.py from CC0 MakeHuman assets.\n')
        f.write('window.GardenFirstPersonArm=' + json.dumps(payload, separators=(',', ':')) + ';\n')
    print('verts', len(order), 'tris', len(index) // 3, 'atlas px', int(atlas_w), int(atlas_h), boxes)


if __name__ == '__main__':
    main(*sys.argv[1:5])
