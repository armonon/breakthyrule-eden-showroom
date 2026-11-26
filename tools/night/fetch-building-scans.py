#!/usr/bin/env python3
"""The landmark buildings' extra scanned surface: one more layer of matrix-world.js's scan arrays, CC0 from polyhaven.com.

  python3 tools/night/fetch-building-scans.py <work dir>          download the raw 1k sets (work dir is NOT in the repo)
  python3 tools/night/fetch-building-scans.py <work dir> --pack   also write the web copies to assets/beyond-eden/scan/

Same format and conventions as tools/world/fetch-beyond-scans.py (generic user agent, no account, no personal data):
  <layer>-d.webp albedo, <layer>-n.webp OpenGL normal, <layer>-m.webp grey 1024 x 2048: roughness on top, height below.
Layer: 'planks' (weathered boards: the landmarks' doors and timber). The walls keep their own scans (night-district.js).
Needs ffmpeg and cwebp on the PATH for --pack.
"""
import json, os, subprocess, sys, tempfile, urllib.request
WORK = os.path.abspath(sys.argv[1]); PACK = '--pack' in sys.argv
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')); OUT = os.path.join(ROOT, 'assets', 'beyond-eden', 'scan')
UA = {'User-Agent': 'asset-fetch'}
TEXTURES = [('planks', 'weathered_planks')]
def get(url, path):
    if os.path.exists(path) and os.path.getsize(path): return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r, open(path, 'wb') as f: f.write(r.read())
def api(kind, name):
    with urllib.request.urlopen(urllib.request.Request(f'https://api.polyhaven.com/{kind}/{name}', headers=UA), timeout=60) as r: return json.load(r)
credits = []
for layer, name in TEXTURES:
    f = api('files', name); i = api('info', name)
    if i.get('license', 'CC0') not in ('CC0', 'cc0'): raise SystemExit(f'{name} is not CC0')
    for kind, key in (('diff', 'Diffuse'), ('nor', 'nor_gl'), ('rough', 'Rough'), ('disp', 'Displacement')):
        get(f[key]['1k']['jpg']['url'], os.path.join(WORK, 'tex', f'{name}-{kind}.jpg'))
    credits.append((layer, name, ', '.join(i.get('authors', {}).keys()), i.get('dimensions'))); print('texture', name, i.get('dimensions'))
if not PACK: sys.exit()
# Both scans are laid in courses: joints are where the surface turns sharply (the OpenGL normal map leans far from flat).
# Rows are found where a whole line of pixels is mostly joint, then, within each row, the vertical joints the same way;
# each block or board gets its own random tone (wrapping round the tile's edges). Pure Python: no numpy needed.
# (lean threshold, fraction of a line that makes a horizontal joint or None for boards that run the full height, same for vertical)
IDS = {'planks': (40, None, .35)}   # (a laid-in-courses scan such as sandstone_blocks_08 works with (18, .22, .35))
def ids(src, out, opt):
    t, hfrac, vfrac = opt; N = 1024
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', src, '-vf', f'scale={N}:{N},format=rgb24', '-f', 'rawvideo', '-'], check=True, capture_output=True).stdout
    joint = bytearray(N * N)
    for k in range(N * N):
        dx, dy = raw[k * 3] - 128, raw[k * 3 + 1] - 128
        joint[k] = dx * dx + dy * dy > t * t
    def peaks(profile, frac, sep):
        out = []
        for i, v in sorted(enumerate(profile), key=lambda iv: -iv[1]):
            if v < frac: break
            if all(min(abs(i - j), N - abs(i - j)) >= sep for j in out): out.append(i)
        return sorted(out)
    rows = peaks([sum(joint[y * N:(y + 1) * N]) / N for y in range(N)], hfrac, 60) if hfrac else []
    bands = [(rows[i], rows[(i + 1) % len(rows)] + (N if i + 1 == len(rows) else 0)) for i in range(len(rows))] if rows else [(0, N)]
    pix = bytearray(N * N); seed = 12345; count = 0
    for y0, y1 in bands:
        ys = [y % N for y in range(y0 + 8, y1 - 8)] or [y0 % N]
        cols = peaks([sum(joint[y * N + x] for y in ys) / len(ys) for x in range(N)], vfrac, 40) or [0]
        for i, x0 in enumerate(cols):
            x1 = cols[(i + 1) % len(cols)] + (N if i + 1 == len(cols) else 0)
            seed = (seed * 1103515245 + 12345) & 0x7fffffff; v = 40 + seed % 176; count += 1
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1): pix[(y % N) * N + x % N] = v
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', f'{N}x{N}', '-i', '-', out], input=bytes(pix), check=True)
    print(' ', os.path.basename(out), len(bands), 'rows', count, 'blocks')
def run(*a): subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
with tempfile.TemporaryDirectory() as tmp:
    for layer, name in TEXTURES:
        src = lambda k: os.path.join(WORK, 'tex', f'{name}-{k}.jpg')
        run('cwebp', '-quiet', '-q', '80', '-m', '6', '-resize', '1024', '1024', src('diff'), '-o', os.path.join(OUT, layer + '-d.webp'))
        run('cwebp', '-quiet', '-q', '82', '-m', '6', '-resize', '1024', '1024', src('nor'), '-o', os.path.join(OUT, layer + '-n.webp'))
        m = os.path.join(tmp, layer + '-m.png')
        run('ffmpeg', '-y', '-i', src('rough'), '-i', src('disp'), '-filter_complex', '[0:v]scale=1024:1024,format=gray[a];[1:v]scale=1024:1024,format=gray[b];[a][b]vstack=inputs=2,format=gray', '-frames:v', '1', m)
        if layer in IDS:  # a third band: one random tone per block/board (matrix-world.js reads it into B.a)
            band = os.path.join(tmp, layer + '-id.png'); ids(src('nor'), band, IDS[layer]); m2 = os.path.join(tmp, layer + '-m3.png')
            run('ffmpeg', '-y', '-i', m, '-i', band, '-filter_complex', '[0:v][1:v]vstack=inputs=2,format=gray', '-frames:v', '1', m2); m = m2
        run('cwebp', '-quiet', '-q', '78', '-m', '6', m, '-o', os.path.join(OUT, layer + '-m.webp'))
        print('packed', layer)
path = os.path.join(OUT, 'CREDITS.txt'); text = open(path).read()
for layer, name, authors, dims in credits:
    if f'"{name}"' in text: continue
    text += f'\n{layer}-d.webp, {layer}-n.webp, {layer}-m.webp  (landmark buildings, tools/night/fetch-building-scans.py)\n  texture: "{name}" by {authors}, CC0\n  https://polyhaven.com/a/{name}\n'
open(path, 'w').write(text)
