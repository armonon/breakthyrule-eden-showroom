# Packs the fetched Poly Haven models into small GLBs (WebP textures, heavy meshes decimated) and builds the pickup
# from Rgsdev's CC0 low-poly vehicle pack with repainted, worn materials and separate wheels.
#   python pack-props.py -- <work dir> <Pickup.fbx>
import bpy, sys, os, json, math, mathutils
args = sys.argv[sys.argv.index('--') + 1:]; WORK = args[0]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'cowninja', 'props'); os.makedirs(OUT, exist_ok=True)
index = {}
def bounds(objs):
    lo, hi = [1e9] * 3, [-1e9] * 3
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(c)
            for i in range(3): lo[i] = min(lo[i], w[i]); hi[i] = max(hi[i], w[i])
    return lo, hi
PLANTS = ('tree', 'shrub', 'grass', 'plant', 'sapling', 'nettle', 'weed', 'boulder', 'stump', 'trunk')
LIMITS = {'pine_tree_01': 26000, 'fir_tree_01': 26000, 'grass_medium_01': 1200, 'grass_medium_02': 1200, 'nettle_plant': 1500, 'weed_plant_02': 1500, 'shrub_02': 2400, 'shrub_04': 1800, 'fir_sapling': 3000, 'boulder_01': 1200, 'tree_stump_01': 1500, 'dead_tree_trunk': 3000, 'modular_electricity_poles': 9000, 'modular_chainlink_fence': 5000, 'wooden_crate_02': 1600, 'street_lamp_01': 4000, 'security_camera_01': 2500, 'concrete_road_barrier': 4000, 'metal_jerrycan': 3000, 'cardboard_box_01': 1500}
def export(name, limit=14000):
    limit = LIMITS.get(name, limit)
    bpy.context.view_layer.update()
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    if tris > limit:
        for o in meshes:
            m = o.modifiers.new('lighter', 'DECIMATE'); m.ratio = limit / tris
    if any(k in name for k in PLANTS):
        # Plants: textures to 512 px, and single-channel masks copied into RGBA so they can be written as WebP.
        for img in list(bpy.data.images):
            if not img.has_data:
                try: img.pixels[0]
                except Exception: continue
            if img.size[0] > 512: img.scale(512, max(1, int(512 * img.size[1] / img.size[0])))
            if img.channels < 3:
                rgba = bpy.data.images.new(img.name + '-rgba', img.size[0], img.size[1], alpha=True); px = list(img.pixels); c = img.channels
                out = []
                for i in range(0, len(px), c): v = px[i]; out += [v, v, v, 1.0]
                rgba.pixels = out; rgba.colorspace_settings.name = img.colorspace_settings.name
                for m in bpy.data.materials:
                    if m.node_tree:
                        for n in m.node_tree.nodes:
                            if n.type == 'TEX_IMAGE' and n.image == img: n.image = rgba
    lo, hi = bounds(meshes)
    # glTF axes: x right, y up, z toward the viewer (Blender's -y)
    index[name] = {'tris': min(tris, limit), 'min': [round(lo[0], 3), round(lo[2], 3), round(-hi[1], 3)], 'max': [round(hi[0], 3), round(hi[2], 3), round(-lo[1], 3)],
                   'parts': {o.name: [round(v, 3) for v in (o.matrix_world.translation.x, o.matrix_world.translation.z, -o.matrix_world.translation.y)] for o in meshes} if len(meshes) > 1 else {}}
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', export_image_format='WEBP', export_image_quality=76, export_apply=True, export_animations=False, export_yup=True)
ONLY = args[2].split(',') if len(args) > 2 else None   # optional: just these (e.g. "pickup")
for name in sorted(os.listdir(os.path.join(WORK, 'models'))):
    if ONLY and name.lower() not in ONLY: continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(WORK, 'models', name, name + '.gltf'))
    export(name.lower())

# The pickup: nose toward -Z in glTF, 4.1 m long, wheels kept as separate objects named wheel-fl/fr/rl/rr.
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.fbx(filepath=args[1])
S = .82
PAINT = {'body dark green': ((.2, .04, .035), .46, .2), 'body white': ((.5, .48, .44), .5, .3), 'body black': ((.012, .012, .014), .7, .1), 'windows': ((.02, .03, .04), .08, .9),
         'headlights': ((1, .93, .78), .2, 0), 'rear lights': ((.5, .01, .01), .3, 0), 'wheels': ((.3, .3, .31), .45, .6), 'tires': ((.014, .014, .015), .9, 0)}
for m in list(bpy.data.materials):   # a copy: renaming re-sorts the live collection
    c, rough, metal = PAINT.get(m.name, ((.2, .2, .2), .6, 0)); m.use_nodes = True; b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if m.name == 'headlights': b.inputs['Emission Color'].default_value = (1, .9, .7, 1); b.inputs['Emission Strength'].default_value = 6
    if m.name == 'rear lights': b.inputs['Emission Color'].default_value = (1, .02, .01, 1); b.inputs['Emission Strength'].default_value = 2
    m.name = 'truck-' + m.name.replace(' ', '-')
names = {'Pickup': 'truck-body', 'Pickup wheel front left': 'wheel-fl', 'Pickup wheel front right': 'wheel-fr', 'Pickup wheel rear left': 'wheel-rl', 'Pickup wheel rear right': 'wheel-rr'}
for o in list(bpy.data.objects):
    if o.type != 'MESH': continue
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    o.parent = None; o.data = o.data.copy(); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for v in o.data.vertices: v.co = mathutils.Vector((-v.co.x, -v.co.y, v.co.z)) * S   # turn it round (nose to +y) and scale
    if o.name != 'Pickup':  # wheel origin at the axle so it can spin
        c = sum((v.co for v in o.data.vertices), mathutils.Vector()) / len(o.data.vertices)
        for v in o.data.vertices: v.co -= c
        o.location = c
    else:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = .025; b.segments = 2; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(40)
    o.name = names.get(o.name, o.name)
    for p in o.data.polygons: p.use_smooth = False
export('pickup', 60000)
path = os.path.join(OUT, 'index.json')
if ONLY and os.path.exists(path): index = {**json.load(open(path)), **index}
json.dump(index, open(path, 'w'), indent=1)
for k, v in index.items(): print(k, v['tris'], v['min'], v['max'], os.path.getsize(os.path.join(OUT, k + '.glb')) // 1024, 'KB')
