# Film-quality stills of the COWNinja site, rendered in Blender Cycles: the built site with every prop the game places,
# cows in the pen, the site's own lamps, the night sky, volumetric haze and wet floors.
#   python hero-render.py -- <repo root> <output dir> [--preview] [--shots kill,rail,chiller,front]
import bpy, sys, os, json, math
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
ROOT, OUT = args[0], args[1]
PREVIEW = '--preview' in args
SHOTS = args[args.index('--shots') + 1].split(',') if '--shots' in args else ['kill', 'rail', 'chiller', 'front']
os.makedirs(OUT, exist_ok=True)
B = lambda x, y, z: Vector((x, -z, y))
A = f'{ROOT}/assets/cowninja'
data = json.load(open(f'{A}/site.json'))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def decoded(path):
    # The game's GLBs are meshopt-compressed (tools/cowninja/compress.sh), which this Blender build cannot read:
    # import a decoded copy, made once with gltf-transform and kept beside the renders.
    if b'EXT_meshopt_compression' not in open(path, 'rb').read(4096 * 16): return path
    import subprocess, hashlib
    cache = os.path.join(os.path.dirname(OUT.rstrip('/')), 'decoded'); os.makedirs(cache, exist_ok=True)
    out = os.path.join(cache, hashlib.md5(path.encode()).hexdigest()[:10] + '-' + os.path.basename(path))
    if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(path):
        subprocess.run(['npx', '-y', '@gltf-transform/cli@4', 'copy', path, out], check=True, capture_output=True)
    return out
def imp(path):
    path = decoded(path)
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]

imp(f'{A}/site.glb')
# Wet floors: the kill floor and halls get a much lower roughness (standing water and blood), the yard a little lower.
for m in bpy.data.materials:
    if not m.node_tree: continue
    b = m.node_tree.nodes.get('Principled BSDF')
    if not b: continue
    wet = {'killtile': .25, 'floor': .4, 'apron': .6, 'road': .55, 'ground': .7}.get(m.name)
    if m.name.startswith('blood_'): wet = .6
    if wet is None: continue
    link = next((l for l in m.node_tree.links if l.to_socket == b.inputs['Roughness']), None)
    if link:
        mul = m.node_tree.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = wet
        m.node_tree.links.new(link.from_socket, mul.inputs[0]); m.node_tree.links.new(mul.outputs[0], b.inputs['Roughness'])
    else: b.inputs['Roughness'].default_value *= wet

# Props and loose items, placed as the game places them.
def place(name, x, y, z, yaw, scale, part):
    path = f'{A}/modly/{name[6:]}.glb' if name.startswith('modly:') else f'{A}/props/{name.lower()}.glb'
    # The main game's props are meshopt-compressed, which this Blender build cannot read: decoded copies live in
    # <output>/../wpdec (made with: npx @gltf-transform/cli copy in.glb out.glb).
    if not os.path.exists(path): path = os.path.join(os.path.dirname(OUT.rstrip('/')), 'wpdec', f'{name}.glb')
    if not os.path.exists(path): return
    try: objs = imp(path)
    except Exception as error: print('SKIP', name, error); return
    if part and not name.startswith('modly:'):
        keep = set()
        for o in objs:
            if o.name.startswith(part): keep.add(o); keep.update(o.children_recursive); p = o.parent
            else: continue
            while p: keep.add(p); p = p.parent
        names = [o.name for o in objs if o not in keep]
        for n in names:
            if n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[n])
        objs = [o for o in keep]
    root = bpy.data.objects.new(name, None); sc.collection.objects.link(root)
    for o in objs:
        if o.parent is None: o.parent = root
    if part and not name.startswith('modly:'):  # bring the part to the origin as the game does
        for o in objs:
            if o.parent is root: o.location = (0, 0, 0)
    if name.startswith('modly:'):   # anchored by the bounding box, as the game does: base centre, or top centre
        bpy.context.view_layer.update(); lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
        for o in objs:
            if o.type == 'MESH':
                for c in o.bound_box: w = o.matrix_world @ Vector(c); lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
        off = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -(hi.z if part == 'top' else lo.z)))
        for o in objs:
            if o.parent is root: o.location = o.location + off
    root.location = B(x, y, z); root.rotation_euler = (0, 0, yaw); root.scale = (scale, scale, scale)
for name, x, y, z, yaw, scale, part in data['props']: place(name, x, y, z, yaw, scale, part)
for name, x, z, yaw, scale, mass, part, y in data['loose']: place(name, x, y, z, yaw, scale, part)

# The herd in the pen.
pen = data['points']['pen']
for i, (x, z, yaw) in enumerate([(12, 30, .5), (16.5, 33, 2.2), (20, 38, -1), (13, 41, 1.4), (18.5, 44, 2.9), (22.5, 29.5, -2.2)]):
    for o in imp(f'{A}/cow.glb'):
        if o.parent is None: o.location = B(x, 0, z); o.rotation_euler = (0, 0, yaw)

# Light: the night sky (moon clamped by strength), a moon key, and every lamp of the site as a soft light.
w = bpy.data.worlds.new('night'); sc.world = w; w.use_nodes = True; nt = w.node_tree; bg = nt.nodes['Background']
env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(f'{A}/night-sky.hdr')
# The moon in the sky image is thousands of times brighter than the sky: clamp it, as the game does, or it is day.
cap = nt.nodes.new('ShaderNodeVectorMath'); cap.operation = 'MINIMUM'; cap.inputs[1].default_value = (1.2, 1.2, 1.2)
nt.links.new(env.outputs['Color'], cap.inputs[0]); nt.links.new(cap.outputs['Vector'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = .18
moon = bpy.data.objects.new('moon', bpy.data.lights.new('moon', 'SUN')); moon.data.energy = .25; moon.data.color = (.72, .8, .92); moon.data.angle = .01
d = B(38, -60, 30).normalized(); moon.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler(); sc.collection.objects.link(moon)
for L in data['lights']:
    c = L['c']; col = ((c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255)
    tube = L.get('b') and L['b'][0] > 1
    ld = bpy.data.lights.new('lamp', 'AREA' if tube else 'POINT'); ld.color = col
    if tube: ld.shape = 'RECTANGLE'; ld.size = L['b'][0]; ld.size_y = .15; ld.energy = L['i'] * 14
    else: ld.energy = L['i'] * 9; ld.shadow_soft_size = .15
    o = bpy.data.objects.new('lamp', ld); o.location = B(*L['p']); sc.collection.objects.link(o)
    if tube: o.rotation_euler = (0, 0, 0)  # area lights face down (-Z) by default
    # The visible fitting: a glowing tube or bulb.
    me = bpy.data.meshes.new('bulb'); import bmesh; bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bm.to_mesh(me); bm.free()
    bulb = bpy.data.objects.new('bulb', me); bulb.location = B(*L['p']); s = L.get('b') or [.28, .08, .28]; bulb.scale = (s[0], s[2], s[1]); sc.collection.objects.link(bulb)
    em = bpy.data.materials.new('glow'); em.use_nodes = True; e = em.node_tree.nodes['Principled BSDF']; e.inputs['Emission Color'].default_value = (*col, 1); e.inputs['Emission Strength'].default_value = 12; e.inputs['Base Color'].default_value = (0, 0, 0, 1); me.materials.append(em)
# The red lever lamp by the pen.
lv = data['points']['lever']; ll = bpy.data.lights.new('lever', 'POINT'); ll.color = (1, .2, .1); ll.energy = 90; o = bpy.data.objects.new('lever', ll); o.location = B(lv['x'], 2.2, lv['z']); sc.collection.objects.link(o)

# Haze: a scattering volume filling the hall (light shafts under the lamps), and a thin mist outside.
def volume(name, mn, mx, density, aniso):
    import bmesh
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    c = [(a + b) / 2 for a, b in zip(mn, mx)]; o.location = B(*c); o.scale = (mx[0] - mn[0], mx[2] - mn[2], mx[1] - mn[1])
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.remove(nt.nodes['Principled BSDF'])
    v = nt.nodes.new('ShaderNodeVolumePrincipled'); v.inputs['Density'].default_value = density; v.inputs['Anisotropy'].default_value = aniso; v.inputs['Color'].default_value = (.9, .92, .95, 1)
    nt.links.new(v.outputs['Volume'], nt.nodes['Material Output'].inputs['Volume']); me.materials.append(m)
volume('haze-hall', (-25.8, .02, .2), (25.8, 9.8, 47.8), .007, .45)
volume('mist-yard', (-120, 0, -200), (120, 14, 120), .0018, .3)

# Cameras.
SH = {
    'kill': ((3.2, 1.65, 3.6), (-14, 1.6, 26), 22),
    'rail': ((-6.5, 1.45, 13.5), (-12, 2.6, 22), 32),
    'chiller': ((-8.6, 1.55, 37.6), (-20, 1.9, 44.5), 24),
    'front': ((-15, 1.7, -30), (2, 3.2, 2), 26),
}
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
r = sc.render; r.engine = 'CYCLES'; sc.cycles.device = 'CPU'
r.resolution_x, r.resolution_y = (960, 540) if PREVIEW else (1600, 900)
sc.cycles.samples = 24 if PREVIEW else 64; sc.cycles.use_denoising = True
try: sc.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception: pass
sc.cycles.max_bounces = 6; sc.cycles.volume_bounces = 1; sc.cycles.volume_step_rate = 4 if PREVIEW else 2
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Punchy' if 'AgX - Punchy' in [l.name for l in []] else 'None'
for name in SHOTS:
    pos, look, lens = SH[name]; cam.location = B(*pos); cam.rotation_euler = (B(*look) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = lens
    cam.data.dof.use_dof = not PREVIEW; cam.data.dof.focus_distance = 6 if name != 'front' else 20; cam.data.dof.aperture_fstop = 2.8
    sc.view_settings.exposure = {'kill': .8, 'rail': .8, 'chiller': .4, 'front': .9}[name]
    r.filepath = f'{OUT}/{name}{"-preview" if PREVIEW else ""}.png'
    print('RENDER', name, flush=True); bpy.ops.render.render(write_still=True); print('DONE', name, flush=True)
