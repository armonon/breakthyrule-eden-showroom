# Downloads the CC0 Poly Haven models, textures and night sky COWNinja uses into a work folder (not committed), and
# writes the web-ready textures to assets/cowninja/tex. Models are then packed by pack-props.py (Blender).
#   python3 fetch-polyhaven.py <work dir>
import json, os, sys, urllib.request
from PIL import Image
WORK = sys.argv[1]; ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'cowninja')
MODELS = ['modular_chainlink_fence', 'concrete_road_barrier', 'Barrel_01', 'barrel_03', 'wooden_crate_02', 'street_lamp_01',
          'mounted_fluorescent_lights', 'caged_hanging_light', 'rollershutter_door', 'old_tyre', 'metal_trash_can', 'large_iron_gate',
          'utility_box_01', 'trashbag', 'propane_tank', 'bull_head', 'modular_industrial_pipes_01', 'cement_bag']
TEXTURES = ['muddy_tracks', 'concrete_floor_worn_001', 'dirty_tiles', 'factory_wall', 'rusty_corrugated_iron', 'rusty_metal_02', 'asphalt_02', 'long_white_tiles']
SKY = 'rogland_moonlit_night'
def get(url, path):
    if os.path.exists(path) and os.path.getsize(path): return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'asset-fetch'})
    with urllib.request.urlopen(req, timeout=120) as r, open(path, 'wb') as f: f.write(r.read())
def files(name):
    with urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/files/' + name, headers={'User-Agent': 'asset-fetch'}), timeout=60) as r: return json.load(r)
for name in MODELS:
    try:
        g = files(name)['gltf']['1k']['gltf']; base = os.path.join(WORK, 'models', name)
        get(g['url'], os.path.join(base, name + '.gltf'))
        for rel, f in g['include'].items(): get(f['url'], os.path.join(base, rel))
        print('model', name, sum(f['size'] for f in g['include'].values()) // 1024, 'KB')
    except Exception as e: print('FAILED model', name, e)
os.makedirs(os.path.join(ROOT, 'tex'), exist_ok=True)
for name in TEXTURES:
    try:
        f = files(name)
        for kind, key in (('diff', 'Diffuse'), ('nor', 'nor_gl'), ('arm', 'arm')):
            src = os.path.join(WORK, 'tex', f'{name}-{kind}.jpg'); get(f[key]['1k']['jpg']['url'], src)
            Image.open(src).convert('RGB').save(os.path.join(ROOT, 'tex', f'{name}-{kind}.webp'), quality=82 if kind == 'diff' else 78, method=6)
        print('texture', name)
    except Exception as e: print('FAILED texture', name, e)
try:
    get(files(SKY)['hdri']['1k']['hdr']['url'], os.path.join(ROOT, 'night-sky.hdr')); print('sky', SKY)
except Exception as e: print('FAILED sky', e)
