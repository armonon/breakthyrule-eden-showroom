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
# For the site built in Blender (build-site.py): kept in the work folder only; the site GLB embeds what it uses.
SITE_TEXTURES = ['corrugated_iron_02', 'painted_concrete', 'concrete_wall_008', 'metal_grate_rusty', 'metal_plate', 'green_metal_rust',
                 'weathered_planks', 'gravel_floor_02', 'brown_mud_leaves_01', 'forest_ground_04', 'sparse_grass', 'red_brick_03',
                 'anti_skid_tiles', 'white_plaster_02', 'rusty_metal_sheet', 'hangar_concrete_floor', 'withered_grass', 'rock_ground_02']
SITE_MODELS = ['modular_electricity_poles', 'modular_airduct_rectangular_01', 'covered_car', 'security_camera_01', 'fire_hydrant',
               'water_manhole_cover', 'wooden_ladder', 'metal_office_desk', 'metal_stool_01', 'steel_frame_shelves_01', 'hanging_industrial_lamp',
               'pine_tree_01', 'fir_tree_01', 'dead_tree_trunk', 'tree_stump_01', 'boulder_01', 'rock_moss_set_01', 'shrub_01', 'shrub_02',
               'shrub_04', 'grass_medium_01', 'grass_medium_02', 'nettle_plant', 'weed_plant_02', 'wooden_bucket_01', 'metal_jerrycan',
               'portable_generator', 'cardboard_box_01', 'Barrel_02', 'namaqualand_boulder_02', 'fir_sapling', 'pine_sapling_medium',
               'dry_branches_medium_01', 'tool_cart', 'wooden_crate_01']
# The detail pass: plant on roofs and walls, yard and farm clutter, tools.
SITE_MODELS += ['exterior_aircon_unit', 'flood_lights', 'security_light', 'security_camera_02', 'overhead_crane', 'modular_fire_escape',
                'power_box_01', 'utility_box_02', 'hand_truck', 'industrial_storage_cart', 'plastic_crate_01', 'compost_bags', 'wooden_barrels_01',
                'industrial_pastic_container', 'small_lpg_tank', 'metal_tool_chest', 'old_military_crate', 'plastic_jerrycan', 'rusted_spade_01',
                'watering_can_metal_01', 'rubber_boots', 'sledgehammer_01', 'plastic_broom', 'rusted_wheel_rim_01', 'worn_metal_rack',
                'wooden_ladder_02', 'garden_hose_wall_mounted_01']
# Second detail pass: workshop and wall kit, more yard and farm clutter, trees.
SITE_MODELS += ['concrete_road_barrier_02', 'industrial_wall_lamp', 'industrial_caged_sconce', 'old_military_compressor', 'portable_welding_cart',
                'bench_vice_01', 'metal_toolbox', 'wooden_bucket_02', 'wicker_basket_01', 'tire_pump', 'ladder_sectioned_01', 'can_rusted', 'oil_tin',
                'plastic_crate_02', 'metal_jerrycan_green', 'rusted_wheel_rim_02', 'wooden_broom', 'multi_cleaner_5_litre', 'korean_fire_extinguisher_01',
                'medical_box', 'drawer_cabinet', 'metal_stool_02', 'wooden_military_crate', 'plastic_bottle_gallon', 'street_lamp_02', 'dead_tree_trunk_02',
                'tree_stump_02', 'wall_clock']
# Vegetation: wildflowers, weeds, ferns, shrubs, roots, mossy rocks and stones, a small tree.
SITE_MODELS += ['fern_02', 'dandelion_01', 'celandine_01', 'grass_bermuda_01', 'shrub_sorrel_01', 'wild_rooibos_bush', 'searsia_lucida', 'shrub_03',
                'pine_roots', 'root_cluster_01', 'rock_moss_set_02', 'stone_01', 'rock_07', 'moss_01', 'tree_small_02', 'bark_debris_01',
                'periwinkle_plant', 'pine_sapling_small']
# The ground the game blends at run time (world.js): diffuse and normal maps, 1k WebP, in tex/ground/.
GROUND = ['aerial_grass_rock', 'dry_ground_01', 'brown_mud_leaves_01', 'gravel_floor_02']
def get(url, path):
    if os.path.exists(path) and os.path.getsize(path): return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'asset-fetch'})
    with urllib.request.urlopen(req, timeout=120) as r, open(path, 'wb') as f: f.write(r.read())
def files(name):
    with urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/files/' + name, headers={'User-Agent': 'asset-fetch'}), timeout=60) as r: return json.load(r)
for name in MODELS + SITE_MODELS:
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
for name in SITE_TEXTURES:
    try:
        f = files(name)
        for kind, key in (('diff', 'Diffuse'), ('nor', 'nor_gl'), ('arm', 'arm')): get(f[key]['1k']['jpg']['url'], os.path.join(WORK, 'tex', f'{name}-{kind}.jpg'))
        print('site texture', name)
    except Exception as e: print('FAILED site texture', name, e)
# Plants: the glTF download's colour textures are JPEGs, with no alpha; the leaf cut-outs come as separate
# "Alpha" (or "<part>_alpha") maps. Fetch them beside the model's textures; pack-props.py merges them in.
for name in MODELS + SITE_MODELS:
    try:
        f = files(name)
        for key, v in f.items():
            if key.lower() == 'alpha' or key.lower().endswith('_alpha'):
                url = v['1k']['jpg']['url']; get(url, os.path.join(WORK, 'models', name, 'textures', os.path.basename(url)))
                print('alpha', name, key)
    except Exception as e: print('FAILED alpha', name, e)
os.makedirs(os.path.join(ROOT, 'tex', 'ground'), exist_ok=True)
for name in GROUND:
    try:
        f = files(name)
        for kind, key in (('diff', 'Diffuse'), ('nor', 'nor_gl')):
            src = os.path.join(WORK, 'tex', f'{name}-{kind}.jpg'); get(f[key]['1k']['jpg']['url'], src)
            dst = os.path.join(ROOT, 'tex', 'ground', f'{name}-{kind}.webp')
            if not os.path.exists(dst): Image.open(src).convert('RGB').save(dst, quality=80 if kind == 'diff' else 76, method=6)
        print('ground', name)
    except Exception as e: print('FAILED ground', name, e)
try:
    get(files(SKY)['hdri']['1k']['hdr']['url'], os.path.join(ROOT, 'night-sky.hdr')); print('sky', SKY)
except Exception as e: print('FAILED sky', e)
