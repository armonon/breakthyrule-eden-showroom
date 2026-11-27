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
# The detail pass's props: big pieces keep more triangles; small clutter is cut hard and its textures halved.
DETAIL = {'overhead_crane': 18000, 'modular_fire_escape': 14000, 'exterior_aircon_unit': 6000, 'flood_lights': 4000, 'security_light': 2000, 'security_camera_02': 2000,
          'power_box_01': 2500, 'utility_box_02': 2500, 'hand_truck': 3000, 'industrial_storage_cart': 4000, 'plastic_crate_01': 1500, 'compost_bags': 4000,
          'wooden_barrels_01': 6000, 'industrial_pastic_container': 5000, 'small_lpg_tank': 2500, 'metal_tool_chest': 3000, 'old_military_crate': 2500,
          'plastic_jerrycan': 1500, 'rusted_spade_01': 1200, 'watering_can_metal_01': 2000, 'rubber_boots': 2000, 'sledgehammer_01': 1200, 'plastic_broom': 1500,
          'rusted_wheel_rim_01': 2500, 'worn_metal_rack': 4000, 'wooden_ladder_02': 2000, 'garden_hose_wall_mounted_01': 3000, 'wooden_crate_01': 2000,
          'concrete_road_barrier_02': 2500, 'industrial_wall_lamp': 2000, 'industrial_caged_sconce': 2000, 'old_military_compressor': 6000, 'portable_welding_cart': 5000,
          'bench_vice_01': 2500, 'metal_toolbox': 2500, 'wooden_bucket_02': 2000, 'wicker_basket_01': 3000, 'tire_pump': 2000, 'ladder_sectioned_01': 3000,
          'can_rusted': 800, 'oil_tin': 1000, 'plastic_crate_02': 1500, 'metal_jerrycan_green': 1500, 'rusted_wheel_rim_02': 2500, 'wooden_broom': 1200,
          'multi_cleaner_5_litre': 1000, 'korean_fire_extinguisher_01': 2000, 'medical_box': 1200, 'drawer_cabinet': 3000, 'metal_stool_02': 2000,
          'wooden_military_crate': 2500, 'plastic_bottle_gallon': 1000, 'street_lamp_02': 4000, 'dead_tree_trunk_02': 6000, 'tree_stump_02': 4000, 'wall_clock': 1000,
          'fern_02': 1500, 'dandelion_01': 600, 'celandine_01': 800, 'grass_bermuda_01': 900, 'shrub_sorrel_01': 1200, 'wild_rooibos_bush': 2000,
          'searsia_lucida': 2500, 'shrub_03': 2400, 'pine_roots': 2500, 'root_cluster_01': 2500, 'rock_moss_set_02': 3000, 'stone_01': 800,
          'rock_07': 1500, 'moss_01': 1200, 'tree_small_02': 6000, 'bark_debris_01': 1200, 'periwinkle_plant': 1000, 'pine_sapling_small': 2500}
# Foliage budgets (more for the few big plants placed sparingly).
FOLIAGE = {'shrub_02': 7000, 'shrub_04': 2500, 'wild_rooibos_bush': 6000, 'searsia_lucida': 9000, 'tree_small_02': 18000, 'fir_sapling': 6000,
           'pine_sapling_small': 6000, 'fern_02': 3000, 'shrub_03': 3000, 'nettle_plant': 1600, 'weed_plant_02': 1600, 'grass_medium_01': 1200,
           'grass_medium_02': 1200, 'grass_bermuda_01': 1500, 'dandelion_01': 1400, 'celandine_01': 1400, 'shrub_sorrel_01': 1600}
def thin_foliage(name, budget):
    # Leaves are separate little meshes (cards or modelled leaves): decimating them collapses them to nothing. So keep
    # a share of the leaves whole and drop the rest, scaling each survivor up round its own centre so the plant stays
    # as full; branches and twigs are left for the ordinary decimation. Returns the triangles left in wood.
    import bmesh, random as R
    rng = R.Random(7)
    # One object per material, so leaf and wood can be told apart.
    for o in [o for o in bpy.data.objects if o.type == 'MESH' and len(o.data.materials) > 1]:
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='MATERIAL'); bpy.ops.object.mode_set(mode='OBJECT')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    tris = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
    leaf = [o for o in meshes if o.data.materials and o.data.materials[0] and o.data.materials[0].get('cut')]
    wood = [o for o in meshes if o not in leaf]
    leaf_tris = sum(tris(o) for o in leaf); wood_tris = sum(tris(o) for o in wood)
    leaf_budget = budget * (.8 if wood_tris else 1.0)
    if leaf_tris > leaf_budget and leaf:
        keep = leaf_budget / leaf_tris; grow = min(2.4, (1 / keep) ** .5)
        for o in leaf:
            bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
            parent = list(range(len(bm.verts)))
            def find(a):
                while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
                return a
            for e in bm.edges:
                a, b = find(e.verts[0].index), find(e.verts[1].index)
                if a != b: parent[a] = b
            groups = {}
            for f in bm.faces: groups.setdefault(find(f.verts[0].index), []).append(f)
            if len(groups) < 12:   # one connected sheet: decimate it after all
                bm.free(); m = o.modifiers.new('lighter', 'DECIMATE'); m.ratio = keep; continue
            # Keep whole leaves in a shuffled order until this object's share of the budget is spent.
            order = list(groups.values()); rng.shuffle(order); share = len(bm.faces) * keep; kept = 0; kill = []
            for faces in order:
                if kept >= share: kill.extend(faces); continue
                kept += len(faces)
                vs = {v for f in faces for v in f.verts}; c = sum((v.co for v in vs), mathutils.Vector()) / len(vs)
                for v in vs: v.co = c + (v.co - c) * grow
            bmesh.ops.delete(bm, geom=kill, context='FACES'); bm.to_mesh(o.data); bm.free(); o.data.update()
        print('thinned', name, leaf_tris, '->', sum(tris(o) for o in leaf), 'leaf tris, grow', round(grow, 2))
    return wood, max(1000, budget - sum(tris(o) for o in leaf))
# The heaviest plants (hundreds of thousands to millions of triangles of modelled leaves) cannot be thinned to a
# web budget and still look leafy. Each of their pieces becomes an impostor instead: rendered in Cycles from the
# front and from the side onto textures with alpha, shown as two crossed cut-out cards the size of the plant.
IMPOSTOR = {'tree_small_02': 1024, 'searsia_lucida': 512, 'fir_sapling': 512, 'pine_sapling_small': 512}
def impostor(name, res):
    import bmesh
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24; sc.cycles.use_denoising = False
    sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = res; sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    if not sc.world: sc.world = bpy.data.worlds.new('w')
    sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.55, .58, .6, 1); sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 2.2; sun.rotation_euler = (math.radians(35), 0, math.radians(30)); sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.type = 'ORTHO'; sc.collection.objects.link(cam); sc.camera = cam
    bpy.context.view_layer.update()
    tops = [o for o in bpy.data.objects if o.type in ('MESH', 'EMPTY') and o.parent is None and (o.type == 'MESH' or any(c.type == 'MESH' for c in o.children_recursive))]
    cards = []
    for top in tops:
        parts = ([top] if top.type == 'MESH' else []) + [c for c in top.children_recursive if c.type == 'MESH']
        lo, hi = bounds(parts); cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2; S = max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) * 1.04; cz = lo[2] + S / 2 - .01
        for o in bpy.data.objects:
            if o.type == 'MESH': o.hide_render = o not in parts
        imgs = []
        for view, rot, off in (('front', (math.pi / 2, 0, 0), (0, -50, 0)), ('side', (math.pi / 2, 0, math.pi / 2), (50, 0, 0))):
            cam.data.ortho_scale = S; cam.rotation_euler = rot; cam.location = (cx + off[0], cy + off[1], cz)
            path = os.path.join(WORK, 'impostors', f'{name}-{top.name}-{view}.png'); os.makedirs(os.path.dirname(path), exist_ok=True)
            sc.render.filepath = path; bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(path); img.pack(); imgs.append(img)
        bm = bmesh.new(); uv = bm.loops.layers.uv.verify()
        for k, (a, b) in enumerate((((1, 0), (0, 0)), ((0, 1), (0, 0)))):
            h = S / 2; ax = (h, 0, 0) if k == 0 else (0, h, 0)
            vs = [bm.verts.new((cx - ax[0], cy - ax[1], cz - h)), bm.verts.new((cx + ax[0], cy + ax[1], cz - h)), bm.verts.new((cx + ax[0], cy + ax[1], cz + h)), bm.verts.new((cx - ax[0], cy - ax[1], cz + h))]
            if k == 1: vs = [vs[1], vs[0], vs[3], vs[2]]   # the side render looks from +x: mirror so it reads the right way round
            f = bm.faces.new(vs); f.material_index = k
            for l, t in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uv].uv = t
        me = bpy.data.meshes.new(top.name); bm.to_mesh(me); bm.free()
        for k, img in enumerate(imgs):
            m = bpy.data.materials.new(f'{top.name}-{k}'); m.use_nodes = True; nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
            cut = nt.nodes.new('ShaderNodeMath'); cut.operation = 'GREATER_THAN'; cut.inputs[1].default_value = .5; nt.links.new(t.outputs['Alpha'], cut.inputs[0]); nt.links.new(cut.outputs[0], bsdf.inputs['Alpha'])
            bsdf.inputs['Roughness'].default_value = .9; m.use_backface_culling = False; me.materials.append(m)
        cards.append((top.name, me, top.matrix_world.translation.copy()))
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    for nm, me, at in cards:
        o = bpy.data.objects.new(nm, me); bpy.context.scene.collection.objects.link(o)
        for v in me.vertices: v.co -= at   # keep each piece's own origin, so the variants still place as before
        o.location = at
    print('impostor', name, len(cards), 'pieces')
def export(name, limit=14000):
    limit = DETAIL.get(name, LIMITS.get(name, limit))
    if name in IMPOSTOR: impostor(name, IMPOSTOR[name]); limit = 10 ** 9
    if name in FOLIAGE and name not in IMPOSTOR:
        wood, wood_budget = thin_foliage(name, FOLIAGE[name]); bpy.context.view_layer.update()
        wt = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in wood)
        if wt > wood_budget:
            for o in wood: m = o.modifiers.new('lighter', 'DECIMATE'); m.ratio = wood_budget / wt
        limit = 10 ** 9   # done: skip the blanket decimation below
    if name in DETAIL and DETAIL[name] < 9000:
        for img in list(bpy.data.images):
            try:
                if img.size[0] > 512: img.scale(512, max(1, int(512 * img.size[1] / img.size[0])))
            except Exception: pass
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
def add_alpha(name):
    # Merge a plant's separate alpha map (fetched by fetch-polyhaven.py) into its colour texture's alpha channel and
    # feed it to the material as a cut-out (alpha > 0.5), which the glTF exporter writes as alphaMode MASK.
    import numpy as np
    folder = os.path.join(WORK, 'models', name, 'textures')
    for m in bpy.data.materials:
        if not m.node_tree: continue
        b = m.node_tree.nodes.get('Principled BSDF'); link = b and next((l for l in m.node_tree.links if l.to_socket == b.inputs['Base Color']), None)
        if not link or link.from_node.type != 'TEX_IMAGE' or not link.from_node.image: continue
        diff = link.from_node.image; path = os.path.join(folder, os.path.basename(diff.filepath).replace('_diff_', '_alpha_'))
        if '_diff_' not in os.path.basename(diff.filepath) or not os.path.exists(path): continue
        w, h = diff.size; a = bpy.data.images.load(path)
        if tuple(a.size) != (w, h): a.scale(w, h)
        px = np.empty(w * h * 4, np.float32); diff.pixels.foreach_get(px); ap = np.empty(w * h * 4, np.float32); a.pixels.foreach_get(ap)
        px = px.reshape(-1, 4); px[:, 3] = ap.reshape(-1, 4)[:, 0]
        img = bpy.data.images.new(diff.name + '-cut', w, h, alpha=True); img.pixels.foreach_set(px.ravel()); img.alpha_mode = 'STRAIGHT'; img.pack()
        link.from_node.image = img
        cut = m.node_tree.nodes.new('ShaderNodeMath'); cut.operation = 'GREATER_THAN'; cut.inputs[1].default_value = .5
        m.node_tree.links.new(link.from_node.outputs['Alpha'], cut.inputs[0]); m.node_tree.links.new(cut.outputs[0], b.inputs['Alpha'])
        m['cut'] = 1
        try: m.surface_render_method = 'DITHERED'
        except Exception: pass
        print('cut-out', name, m.name, w, 'px')
for name in sorted(os.listdir(os.path.join(WORK, 'models'))):
    if ONLY and name.lower() not in ONLY: continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(WORK, 'models', name, name + '.gltf'))
    if any(k in name.lower() for k in PLANTS + ('fern', 'dandelion', 'celandine', 'sorrel', 'rooibos', 'searsia', 'periwinkle')): add_alpha(name)
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
for k, v in index.items():
    if os.path.exists(os.path.join(OUT, k + '.glb')): print(k, v['tris'], v['min'], v['max'], os.path.getsize(os.path.join(OUT, k + '.glb')) // 1024, 'KB')
