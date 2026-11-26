#!/usr/bin/env python3
"""Encode the Beyond Cycles bake (tools/blender/bake_beyond_light.py) into assets/beyond-bake, format 3.

  python3 tools/pipeline/encode-beyond-light.py BAKE_DIR assets/beyond-bake [--weights sky=1,lamps=.45,uplight=1,moon=1,live=.6]

Runtime irradiance = Cycles DIFFUSE bake * pi. What the files hold (eden-baked-light.js reads them):
  lightmap.jpg  ground irradiance, RGB = cbrt(irradiance / scale)
  sun.jpg       R: static moon visibility   G: static visibility of the lamps and altar lights   B: contact occlusion
  probes.bin    two probe grids side by side along X in one volume (coarse district grid, then the fine courtyard grid),
                8 bytes a probe in z, y, x order: A = cbrt(mean irradiance / scale) rgb + lamp/altar visibility,
                B = dominant direction * .5 + .5 + moon visibility
  bake.json     the grids, the scale, the weights used and the lights that were baked
The weights only mix the separately baked kinds of light; change them and run this again, no rebake needed.
The live bake (assets/beyond-night) was encoded with --weights sky=3,lamps=.5,uplight=.7,moon=1.5,live=.6. Since the
showroom's night tuning (app.js BODYCAM_NIGHT: a sky floor, a roll-off of bright baked light, lamps as small sources) the
suggested next encode is --weights sky=3,lamps=.42,uplight=.7,moon=1.9,live=.6: a little more moon so unlit lanes read by
their shape and their moon shadows, a little less baked lamp light by the walls next to the lamps.
Needs NumPy; writes JPEG with Pillow when it is installed, otherwise through ffmpeg.
"""
import argparse, hashlib, json, struct, subprocess, sys, zlib
from pathlib import Path
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('src', type=Path); ap.add_argument('out', type=Path)
ap.add_argument('--weights', default='')
ap.add_argument('--quality', type=int, default=90)
args = ap.parse_args()
src, out = args.src, args.out; out.mkdir(parents=True, exist_ok=True)
# Tuned by eye against the live lights: the nearest lamps and the altar's lights also run live (at .55 of their diffuse,
# eden-baked-light.js), so their baked share is held back or walls a metre from a lamp burn out.
weights = dict(sky=1.0, lamps=.45, uplight=1.0, moon=1.0, live=.6)
for item in filter(None, args.weights.split(',')):
    k, v = item.split('='); assert k in weights, k; weights[k] = float(v)
meta = json.loads((src / 'probes.json').read_text()); lighting = json.loads((src / 'lighting.json').read_text())
lum = lambda a: np.asarray(a, np.float32).mean(-1)  # plain mean of RGB, as the bake's visibility maths always used
GAMMA = 3.0
load = lambda name: np.maximum(0, np.nan_to_num(np.load(src / f'{name}.npy').astype(np.float32)))


def blur3(a, kernel=(1, 1, 1)):
    k = np.array(kernel, np.float32); k /= k.sum(); p = np.pad(a, [(1, 1), (1, 1)] + [(0, 0)] * (a.ndim - 2), mode='edge')
    rows = sum(k[i] * p[i:i + a.shape[0]] for i in range(3)); return sum(k[i] * rows[:, i:i + a.shape[1]] for i in range(3))


def box(a, r):  # box blur of radius r pixels, edges repeated
    for axis in (0, 1):
        p = np.pad(a, [(r + 1, r) if i == axis else (0, 0) for i in range(2)], mode='edge'); c = np.cumsum(p, axis=axis, dtype=np.float64)
        n = a.shape[axis]; hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis); lo = np.take(c, np.arange(0, n), axis=axis); a = ((hi - lo) / (2 * r + 1)).astype(np.float32)
    return a


def despeckle(a):  # fireflies: no texel brighter than twice the mean of the eight around it (plus a little)
    around = (blur3(a) * 9 - a) / 8; limit = 2 * lum(around) + .004; l = lum(a)
    return a * np.minimum(1, limit / np.maximum(l, 1e-6))[..., None]


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)


def write_jpeg(path, rgb):  # rgb: uint8, rows top to bottom
    try:
        from PIL import Image
        Image.fromarray(rgb).save(path, quality=args.quality, subsampling=0)
    except ImportError:
        h, w = rgb.shape[:2]; raw = b''.join(b'\0' + rgb[y].tobytes() for y in range(h))
        chunk = lambda kind, body: struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xffffffff)
        png = path.with_suffix('.tmp.png')
        png.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 1)) + chunk(b'IEND', b''))
        q = max(2, min(31, round((100 - args.quality) / 4 + 1)))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(png), '-q:v', str(q), '-pix_fmt', 'yuvj444p', str(path)], check=True); png.unlink()


# ---------------------------------------------------------------- the unshadowed light of the lamps and live lights (three.js's falloff)
LAMP = lighting['lamp']
local_lights = [dict(position=p, color=LAMP['color'], intensity=LAMP['intensity'], decay=LAMP['decay'], distance=LAMP['distance']) for p in lighting['lamps']] + lighting.get('live', [])


def falloff(r, l):
    return float(np.mean(l['color'][:3])) * l['intensity'] / np.maximum(r ** l['decay'], .01) * np.clip(1 - (r / l['distance']) ** 4, 0, 1) ** 2


# ---------------------------------------------------------------- ground
x0, x1, z0, z1 = meta['bounds']; S = meta['size']
parts = {k: despeckle(load(f'ground_{k}') * np.pi) for k in weights}
ground = sum(parts[k] * weights[k] for k in weights)
xs = x0 + (np.arange(S) + .5) / S * (x1 - x0); zs = z1 - (np.arange(S) + .5) / S * (z1 - z0)  # row 0 = v 0 = far (z1) edge
clear = np.zeros((S, S), np.float32); y = meta.get('receiverHeight', .04)
for l in local_lights:
    px, py, pz = l['position']; d = l['distance']; h = py - y
    if h <= 0: continue
    i0, i1 = np.searchsorted(xs, [px - d, px + d]); j = np.where(np.abs(zs - pz) < d)[0]
    if i1 <= i0 or not len(j): continue
    dx = xs[i0:i1][None, :] - px; dz = zs[j][:, None] - pz; r = np.sqrt(dx * dx + dz * dz + h * h)
    clear[j[0]:j[-1] + 1, i0:i1] += falloff(r, l) * h / r
local = lum(load('ground_local') * np.pi)
# One of many lamps is sampled per ray, so their direct light is grainy: smooth it (about 0.15 m) before dividing,
# while it is still unclipped, so the grain averages out instead of darkening the open ground.
for _ in range(4): local = blur3(local, (1, 2, 1))
ratio = local / np.maximum(clear, 1e-6); lit = clear > .15
# Blender's units against three's: 1 unless the bake was made with another light constant (its probes.json says so).
# As a check, the baked light over the formula on the brightest open ground is printed; it should be close to 1.
cal = float(meta.get('pointCalibration', 1))
print(f'point lights: baked / formula on open ground = {float(np.percentile(ratio[lit], 96)) / cal:.3f} (about 1 is right)')
for k in ('lamps', 'live'): parts[k] = parts[k] / cal
ground = sum(parts[k] * weights[k] for k in weights)
local_vis = np.clip(ratio / cal, 0, 1); local_vis = 1 + (local_vis - 1) * smooth(.01, .06, clear)
moon = lighting['moon']; sd = np.array(moon['direction'], float); sd /= np.linalg.norm(sd)
moon_vis = np.clip(lum(load('ground_moonvis') * np.pi) / (moon['intensity'] * float(np.mean(moon['color'])) * max(sd[1], .01)), 0, 1)
# Contact occlusion: how much darker the sky is here than over the surrounding couple of metres. Open ground stays 1,
# the ground under and against things goes dark, whatever the wider shade of the buildings is.
sky = lum(parts['sky']); radius = max(2, round(1.6 / ((x1 - x0) / S))); wide = box(box(sky, radius), radius)
contact = np.clip(sky / np.maximum(wide * 1.02, 1e-6), 0, 1) ** 1.25

# ---------------------------------------------------------------- probes
grids, probe = meta['grids'], {}
names = [n for n in ('coarse', 'detail') if n in grids]
for name in names:
    g = grids[name]; nx, ny, nz = g['dims']; inside = np.load(src / f'{name}_inside.npy')
    pp = {k: load(f'{name}_{k}') * np.pi for k in weights}
    for k in ('lamps', 'live'): pp[k] = pp[k] / cal
    total = sum(pp[k] * weights[k] for k in weights)  # z, y, x, direction, rgb
    P = np.stack(np.meshgrid(g['min'][2] + g['step'][2] * np.arange(nz), g['min'][1] + g['step'][1] * np.arange(ny), g['min'][0] + g['step'][0] * np.arange(nx), indexing='ij'), -1)  # z, y, x
    clear_p = np.zeros((nz, ny, nx), np.float32)
    for l in local_lights:
        px, py, pz = l['position']; dz_, dy_, dx_ = pz - P[..., 0], py - P[..., 1], px - P[..., 2]; r = np.sqrt(dx_ * dx_ + dy_ * dy_ + dz_ * dz_) + 1e-6
        clear_p += falloff(r, l) * (np.abs(dx_) + np.abs(dy_) + np.abs(dz_)) / r
    local_p, moon_p = lum(load(f'{name}_local') * np.pi), lum(load(f'{name}_moonvis') * np.pi)
    lv = np.clip(local_p.sum(-1) / np.maximum(clear_p, 1e-6) / cal, 0, 1); lv = 1 + (lv - 1) * smooth(.02, .12, clear_p)
    expected = moon['intensity'] * float(np.mean(moon['color'])) * np.abs(sd).sum() / 6
    mv = np.clip(moon_p.mean(-1) / max(expected, 1e-6), 0, 1)
    # The bake's ray test misses solids built from open or nested shells (the altar's steps and table). A probe that no
    # light of any kind reaches on any side is inside something too: even the deepest shade outdoors gets some sky.
    sealed = (sum(lum(pp[k]).sum(-1) for k in weights) + local_p.sum(-1) + moon_p.sum(-1)) <= 1e-7
    print(f'{name}: {int((sealed & ~inside).sum())} more probes that no light reaches'); inside = inside | sealed
    # Probes inside solid things are black: take the mean of the neighbours in the open instead, a few shells deep.
    valid = ~inside; fields = [total, lv[..., None, None], mv[..., None, None]]; filled = 0
    for _ in range(4):
        if valid.all(): break
        count = np.zeros(valid.shape, np.float32); sums = [np.zeros_like(f) for f in fields]
        for axis in range(3):
            for shift in (1, -1):
                v = np.roll(valid, shift, axis); edge = [slice(None)] * 3; edge[axis] = 0 if shift == 1 else -1; v[tuple(edge)] = False
                count += v
                for s, f in zip(sums, fields): s += np.roll(f, shift, axis) * v[..., None, None]
        fix = ~valid & (count > 0); filled += int(fix.sum())
        for s, f in zip(sums, fields): f[fix] = s[fix] / count[fix][..., None, None]
        valid = valid | fix
    print(f'{name}: {nx}x{ny}x{nz}, {int(inside.sum())} probes inside geometry, {filled} filled from neighbours')
    probe[name] = dict(total=total, lv=fields[1][..., 0, 0], mv=fields[2][..., 0, 0])

assert all(np.isfinite(a).all() for a in [ground, local_vis, moon_vis, contact] + [p['total'] for p in probe.values()])
scale = float(max(.01, np.percentile(ground, 99.9), *[np.percentile(p['total'].mean(axis=3), 99.9) for p in probe.values()]) * 1.2)
enc = lambda a: np.power(np.clip(a / scale, 0, 1), 1 / GAMMA)
u8 = lambda a: (np.clip(a, 0, 1) * 255 + .5).astype('uint8')
write_jpeg(out / 'lightmap.jpg', u8(enc(blur3(ground)))[::-1])
write_jpeg(out / 'sun.jpg', u8(np.stack([blur3(moon_vis, (1, 2, 1)), local_vis, blur3(contact, (1, 2, 1))], -1))[::-1])

atlas = [sum(grids[n]['dims'][0] for n in names), max(grids[n]['dims'][1] for n in names), max(grids[n]['dims'][2] for n in names)]
volume = np.zeros((atlas[2], atlas[1], atlas[0], 8), np.uint8); at = 0
for name in names:
    g = grids[name]; nx, ny, nz = g['dims']; p = probe[name]; total = p['total']
    mean = total.mean(axis=3); lum6 = lum(total); L = lum6.mean(axis=3)[..., None] + 1e-6
    d = np.stack([lum6[..., 0] - lum6[..., 1], lum6[..., 2] - lum6[..., 3], lum6[..., 4] - lum6[..., 5]], -1) / 2 / L
    volume[:nz, :ny, at:at + nx, 0:3] = u8(enc(mean)); volume[:nz, :ny, at:at + nx, 3] = u8(p['lv'])
    volume[:nz, :ny, at:at + nx, 4:7] = u8(d * .5 + .5); volume[:nz, :ny, at:at + nx, 7] = u8(p['mv'])
    g['offset'] = [at, 0, 0]; at += nx
volume.tofile(out / 'probes.bin')

coarse = grids['coarse']
info = dict(format=3, world='beyond', gamma=GAMMA, scale=scale, bounds=meta['bounds'], size=S, atlas=atlas, grids=grids, dirs=meta['dirs'],
            min=coarse['min'], step=coarse['step'], dims=coarse['dims'],  # the coarse grid again, where format 2 kept it
            unit='linear irradiance; RGB=(irradiance/scale)^(1/gamma); probe A alpha=lamp/altar visibility, probe B alpha=moon visibility; sun.jpg R=moon visibility G=lamp/altar visibility B=contact occlusion',
            weights=weights, calibration=cal, bake={k: meta[k] for k in ('samples', 'seconds', 'blender') if k in meta}, lighting=lighting)
info['assets'] = {n: hashlib.sha256((out / n).read_bytes()).hexdigest() for n in ['lightmap.jpg', 'sun.jpg', 'probes.bin']}
(out / 'bake.json').write_text(json.dumps(info, indent=1) + '\n')
(out / 'CREDITS.txt').write_text('Beyond Eden lighting bake — generated for Break Thy Rule in Blender Cycles.\nDerived only from existing project geometry and materials; source licences remain in assets/night/SOURCE.md, assets/world-props and the Eden foliage asset credits.\nReproduce with tools/agent/export-static-scene.mjs, tools/blender/bake_beyond_light.py and tools/pipeline/encode-beyond-light.py.\n')
stat = lambda a: f'mean {float(a.mean()):.4f} p50 {float(np.percentile(a, 50)):.4f} p99 {float(np.percentile(a, 99)):.4f}'
for k in weights: print(f'ground {k:8s} x{weights[k]:<4g} {stat(lum(parts[k]))}')
print(json.dumps({'scale': scale, 'groundMean': float(ground.mean()), 'probeMean': {n: float(p['total'].mean()) for n, p in probe.items()}, 'moonVisible': float(moon_vis.mean()), 'localVisible': float(local_vis.mean()), 'contact': float(contact.mean()), 'atlas': atlas,
                  'bytes': {p.name: p.stat().st_size for p in sorted(out.iterdir())}, 'total': sum(p.stat().st_size for p in out.iterdir())}))
