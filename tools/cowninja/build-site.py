# Builds the COWNinja site: a small rural abattoir, modelled by script in Blender, lit with baked bounce light.
#   python build-site.py -- <work dir from fetch-polyhaven.py> <assets/cowninja> [--no-bake] [--samples N]
# Writes assets/cowninja/site.glb (architecture, bespoke kit, terrain), site-lightmap.webp (bounce light and sky
# occlusion for the architecture, read by the game as a lightMap on uv1) and site.json (collision boxes, lights,
# props to place, scatter, and every gameplay point: spawn, pen, lever, escape route, patrols).
#
# Everything is authored in game coordinates (metres; x east, y up, z south; the way out is north, -z) and converted
# to Blender's (x, -z, y) only when vertices are written, so site.json and the meshes always agree.
#
# The layout follows a real small abattoir's flow: road and gatehouse, staff car park, outdoor lairage pens and a race
# into an indoor holding pen, a knocking box on the kill floor, a bleed rail running to the chiller, offices, a loading
# dock, a boiler house, silos and offal skips. Ninja routes: the staff door, the catwalk, the office and chiller roofs.
import bpy, bmesh, sys, os, json, math, random
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
WORK, OUT = args[0], args[1]
BAKE = '--no-bake' not in args
SAMPLES = int(args[args.index('--samples') + 1]) if '--samples' in args else 40
LM_SIZE = 2048
random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
B = lambda p: Vector((p[0], -p[2], p[1]))          # game -> blender

# ---------------------------------------------------------------------------------------------------- materials
MATS = {}
def material(key, tex=None, tile=2.0, color=None, rough=None, metal=None, normal=1.0, emission=None, alpha=None):
    m = bpy.data.materials.new(key); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    if tex:
        uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
        def img(kind, data):
            i = bpy.data.images.load(f'{WORK}/tex/{tex}-{kind}.jpg', check_existing=True)
            if data: i.colorspace_settings.name = 'Non-Color'
            n = nt.nodes.new('ShaderNodeTexImage'); n.image = i; nt.links.new(uv.outputs['UV'], n.inputs['Vector']); return n
        d = img('diff', False)
        if color:
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
            nt.links.new(d.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = (*color, 1); nt.links.new(mix.outputs[2], b.inputs['Base Color'])
        else: nt.links.new(d.outputs['Color'], b.inputs['Base Color'])
        arm = img('arm', True); sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(arm.outputs['Color'], sep.inputs['Color'])
        if rough is None: nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
        else: b.inputs['Roughness'].default_value = rough
        if metal is None: nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
        else: b.inputs['Metallic'].default_value = metal
        nor = img('nor', True); nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = normal
        nt.links.new(nor.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    else:
        b.inputs['Base Color'].default_value = (*(color or (.5, .5, .5)), 1)
        b.inputs['Roughness'].default_value = .6 if rough is None else rough; b.inputs['Metallic'].default_value = metal or 0
    if emission: b.inputs['Emission Color'].default_value = (*emission[0], 1); b.inputs['Emission Strength'].default_value = emission[1]
    if alpha is not None: b.inputs['Alpha'].default_value = alpha; m.surface_render_method = 'BLENDED'
    MATS[key] = (m, tile); return m

material('ground', 'muddy_tracks', 5, color=(.72, .7, .68))
material('grass', 'withered_grass', 6, color=(.62, .64, .55))
material('road', 'asphalt_02', 4) if os.path.exists(f'{WORK}/tex/asphalt_02-diff.jpg') else material('road', 'hangar_concrete_floor', 4, color=(.55, .55, .55))
material('gravel', 'gravel_floor_02', 3, color=(.6, .6, .6))
material('apron', 'hangar_concrete_floor', 4, color=(.85, .84, .82))
material('floor', 'concrete_floor_worn_001', 3) if os.path.exists(f'{WORK}/tex/concrete_floor_worn_001-diff.jpg') else material('floor', 'hangar_concrete_floor', 3)
material('killtile', 'anti_skid_tiles', 1.2, color=(.86, .8, .78))
material('walltile', 'long_white_tiles', 1.6, color=(.9, .92, .9)) if os.path.exists(f'{WORK}/tex/long_white_tiles-diff.jpg') else material('walltile', 'white_plaster_02', 2)
material('concrete', 'painted_concrete', 3, color=(.86, .87, .84))
material('blockwall', 'concrete_wall_008', 3)
material('cladding', 'corrugated_iron_02', 2.4, color=(.62, .68, .66), metal=.55)
material('roof', 'rusty_corrugated_iron', 2.4) if os.path.exists(f'{WORK}/tex/rusty_corrugated_iron-diff.jpg') else material('roof', 'rusty_metal_sheet', 2.4)
material('plaster', 'white_plaster_02', 2.5, color=(.92, .9, .86))
material('brick', 'red_brick_03', 2.2)
material('steel', 'green_metal_rust', 1.6, color=(.75, .78, .74))
material('plate', 'metal_plate', 1.4, color=(.8, .82, .84), metal=.85, rough=.38)
material('grate', 'metal_grate_rusty', .9)
material('rust', 'rusty_metal_sheet', 1.6)
material('planks', 'weathered_planks', 2.2)
material('rock', 'rock_ground_02', 3)
material('glass', None, color=(.05, .07, .08), rough=.06, metal=.1, alpha=.42)
material('skylight', None, color=(.6, .64, .62), rough=.3, alpha=.55)
material('curtain', None, color=(.72, .78, .74), rough=.25, alpha=.38)
material('stainless', None, color=(.72, .73, .74), rough=.28, metal=1)
material('chain', None, color=(.42, .42, .43), rough=.4, metal=1)
material('blackrubber', None, color=(.02, .02, .02), rough=.85)
material('yellow', None, color=(.72, .52, .05), rough=.55)
material('panel', None, color=(.86, .88, .87), rough=.42)       # insulated chiller panels
material('locker', 'metal_plate', 1.2, color=(.28, .42, .38), metal=.6, rough=.45)
material('door', 'metal_plate', 1.4, color=(.42, .46, .5), metal=.6, rough=.45)
material('galv', 'corrugated_iron_02', 2.0, color=(.82, .84, .86), metal=.8)
material('trailer', 'metal_plate', 1.6, color=(.78, .8, .82), metal=.9, rough=.35)
material('red', None, color=(.45, .03, .02), rough=.45)

# Generated textures: hay and meat (no free photo fits), written once into the work folder.
def gen_textures():
    from PIL import Image, ImageFilter
    g = f'{WORK}/gen'; os.makedirs(g, exist_ok=True)
    rnd = random.Random(3)
    if not os.path.exists(f'{g}/hay-diff.jpg'):
        im = Image.new('RGB', (512, 512)); px = im.load()
        for y in range(512):
            for x in range(512): t = rnd.random(); px[x, y] = (int(150 + 70 * t), int(120 + 60 * t), int(50 + 40 * t))
        im = im.filter(ImageFilter.GaussianBlur(.6))
        from PIL import ImageDraw
        d = ImageDraw.Draw(im)
        for _ in range(2600):
            x, y = rnd.randrange(512), rnd.randrange(512); l = rnd.randrange(8, 40); c = rnd.randrange(150, 235)
            d.line([(x, y), (x + rnd.randrange(-6, 6), y + l)], fill=(c, int(c * .82), int(c * .38)), width=1)
        im.save(f'{g}/hay-diff.jpg', quality=88)
        Image.new('RGB', (4, 4), (128, 128, 255)).save(f'{g}/hay-nor.jpg'); Image.new('RGB', (4, 4), (255, 235, 0)).save(f'{g}/hay-arm.jpg')
    if not os.path.exists(f'{g}/meat-diff.jpg') or True:
        im = Image.new('RGB', (512, 512)); px = im.load()
        for y in range(512):
            for x in range(512):
                n = math.sin(x * .05 + math.sin(y * .03) * 3) * math.sin(y * .041 + math.sin(x * .02) * 2)
                fat = max(0, n - .72) * 2.0
                dark = .75 + .25 * math.sin(x * .013 + y * .007)
                r, gg, bb = int((92 + rnd.randrange(22)) * dark), int((16 + rnd.randrange(8)) * dark), int((14 + rnd.randrange(6)) * dark)
                f = min(1, fat); px[x, y] = (int(r + (208 - r) * f), int(gg + (180 - gg) * f), int(bb + (140 - bb) * f))
        im.filter(ImageFilter.GaussianBlur(1.1)).save(f'{g}/meat-diff.jpg', quality=88)
        Image.new('RGB', (4, 4), (128, 128, 255)).save(f'{g}/meat-nor.jpg'); Image.new('RGB', (4, 4), (255, 90, 0)).save(f'{g}/meat-arm.jpg')
    for name in ('hay', 'meat'):
        for kind in ('diff', 'nor', 'arm'):
            dst = f'{WORK}/tex/{name}-{kind}.jpg'
            if os.path.exists(dst): os.remove(dst)
            os.link(f'{g}/{name}-{kind}.jpg', dst)
gen_textures()
material('hay', 'hay', 1.0)
# Blood decals (generated RGBA, alpha-blended): fresh and wet, smeared, sprayed, dripping, dried brown; pink wash water.
def blood_textures():
    from PIL import Image, ImageDraw, ImageFilter
    g = f'{WORK}/gen'; os.makedirs(g, exist_ok=True); rnd = random.Random(23)
    def save(name, im):
        im.save(f'{g}/{name}.png')
    def blob(d, x, y, r, col):
        pts = [(x + math.cos(a) * r * (0.7 + rnd.random() * .5), y + math.sin(a) * r * (0.7 + rnd.random() * .5)) for a in [i / 14 * math.tau for i in range(14)]]
        d.polygon(pts, fill=col)
    S = 512
    if not os.path.exists(f'{g}/blood-pool.png'):
        im = Image.new('L', (S, S), 0); d = ImageDraw.Draw(im)
        blob(d, S / 2, S / 2, S * .28, 255)
        for _ in range(26): a = rnd.random() * math.tau; r = S * (.2 + rnd.random() * .2); blob(d, S / 2 + math.cos(a) * r, S / 2 + math.sin(a) * r, S * (.02 + rnd.random() * .08), 255)
        for _ in range(60): a = rnd.random() * math.tau; r = S * (.3 + rnd.random() * .18); blob(d, S / 2 + math.cos(a) * r, S / 2 + math.sin(a) * r, S * (.004 + rnd.random() * .014), 255)
        save('blood-pool-a', im.filter(ImageFilter.GaussianBlur(2.2)))
        im = Image.new('L', (S, S), 0); d = ImageDraw.Draw(im)
        for _ in range(40):  # drag smears: strokes that fade along their length
            y = rnd.uniform(S * .25, S * .75); x0 = rnd.uniform(0, S * .3); w = rnd.uniform(6, 30); L = rnd.uniform(S * .4, S * .9)
            for k in range(int(L / 4)):
                t = k / (L / 4); d.ellipse([x0 + k * 4 - w / 2, y - w / 2 + math.sin(k * .07) * 6, x0 + k * 4 + w / 2, y + w / 2 + math.sin(k * .07) * 6], fill=int(230 * (1 - t) ** .6))
        save('blood-smear-a', im.filter(ImageFilter.GaussianBlur(3)))
        im = Image.new('L', (S, S), 0); d = ImageDraw.Draw(im)
        for _ in range(420):  # spray: drops thrown from a point, elongated outward
            a = rnd.random() * math.tau; r = (rnd.random() ** 1.6) * S * .48; x, y = S / 2 + math.cos(a) * r, S / 2 + math.sin(a) * r; sz = rnd.uniform(1, 7) * (1 - r / S)
            d.ellipse([x - sz, y - sz, x + sz, y + sz], fill=255); d.line([x, y, x + math.cos(a) * sz * 3, y + math.sin(a) * sz * 3], fill=200, width=max(1, int(sz)))
        save('blood-spray-a', im.filter(ImageFilter.GaussianBlur(.8)))
        im = Image.new('L', (S, S), 0); d = ImageDraw.Draw(im)
        for _ in range(26):  # drips running down from a band at the top
            x = rnd.uniform(10, S - 10); L = rnd.uniform(S * .2, S * .95); w = rnd.uniform(3, 9)
            d.rectangle([x - w / 2, 0, x + w / 2, L], fill=235); d.ellipse([x - w, L - w, x + w, L + w * 1.2], fill=255)
        for _ in range(60): blob(d, rnd.uniform(0, S), rnd.uniform(0, S * .1), rnd.uniform(4, 18), 255)
        save('blood-drip-a', im.filter(ImageFilter.GaussianBlur(1.4)))
    for name, col in (('pool', (118, 4, 6)), ('smear', (128, 8, 8)), ('spray', (150, 6, 6)), ('drip', (122, 5, 5)), ('dry', (92, 16, 10)), ('wash', (160, 30, 30))):
        src = {'pool': 'blood-pool-a', 'smear': 'blood-smear-a', 'spray': 'blood-spray-a', 'drip': 'blood-drip-a', 'dry': 'blood-smear-a', 'wash': 'blood-smear-a'}[name]
        a = Image.open(f'{g}/{src}.png').convert('L')
        if name == 'wash': a = a.point(lambda v: int(v * .35))
        if name == 'dry': a = a.point(lambda v: int(v * .8))
        rgb = Image.new('RGB', (S, S), col); noise = Image.effect_noise((S, S), 18).convert('L')
        rgb = Image.composite(rgb, Image.new('RGB', (S, S), tuple(int(c * .55) for c in col)), noise.point(lambda v: 255 if v > 120 else 120))
        out = rgb.copy(); out.putalpha(a); out.save(f'{WORK}/tex/blood_{name}-diff.png')
blood_textures()
def decal_material(key, tex, rough, metal=0.0):
    m = bpy.data.materials.new(key); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    n = nt.nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(f'{WORK}/tex/{tex}-diff.png'); nt.links.new(uv.outputs['UV'], n.inputs['Vector'])
    nt.links.new(n.outputs['Color'], b.inputs['Base Color']); nt.links.new(n.outputs['Alpha'], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal; b.inputs['Specular IOR Level'].default_value = .6
    m.surface_render_method = 'BLENDED'; MATS[key] = (m, 1.0); return m
for k, r in (('pool', .2), ('smear', .3), ('spray', .35), ('drip', .25), ('dry', .75), ('wash', .25)): decal_material('blood_' + k, 'blood_' + k, r)
# Grime and wear (generated RGBA): dirt banked at the foot of walls, rust runs down cladding, water stains, floor dirt.
def grime_textures():
    from PIL import Image, ImageDraw, ImageFilter
    rnd = random.Random(31); S = 512
    def finish(name, alpha, col, rough_noise=30):
        rgb = Image.new('RGB', (S, S), col); n = Image.effect_noise((S, S), rough_noise).convert('L')
        rgb = Image.composite(rgb, Image.new('RGB', (S, S), tuple(int(c * .6) for c in col)), n.point(lambda v: 255 if v > 125 else 90))
        rgb.putalpha(alpha); rgb.save(f'{WORK}/tex/{name}-diff.png')
    if not os.path.exists(f'{WORK}/tex/grime_base-diff.png'):
        a = Image.new('L', (S, S), 0); px = a.load(); n = Image.effect_noise((S, S), 60).filter(ImageFilter.GaussianBlur(6)).load()
        for y in range(S):
            for x in range(S):
                t = y / S; edge = (1 - t) ** 2.2 * 255 + (n[x, y] - 128) * 1.2 * (1 - t); px[x, S - 1 - y] = max(0, min(235, int(edge)))
        finish('grime_base', a.transpose(Image.FLIP_TOP_BOTTOM), (46, 40, 32))
        a = Image.new('L', (S, S), 0); d = ImageDraw.Draw(a)
        for _ in range(34):
            x = rnd.uniform(0, S); L = rnd.uniform(S * .25, S); w = rnd.uniform(4, 22)
            for k in range(int(L / 3)): t = k / (L / 3); d.ellipse([x - w / 2 * (1 - t * .6), k * 3, x + w / 2 * (1 - t * .6), k * 3 + 6], fill=int(200 * (1 - t) ** 1.3))
        finish('grime_rust', a.filter(ImageFilter.GaussianBlur(3)), (112, 54, 24))
        a = Image.new('L', (S, S), 0); d = ImageDraw.Draw(a)
        for _ in range(9):
            cx, cy, r = rnd.uniform(S * .2, S * .8), rnd.uniform(S * .2, S * .8), rnd.uniform(40, 150)
            for k in range(5): rr = r * (1 - k * .16); d.ellipse([cx - rr, cy - rr * .8, cx + rr, cy + rr * .8], outline=110 - k * 15, width=int(rnd.uniform(3, 10)))
            d.ellipse([cx - r * .6, cy - r * .5, cx + r * .6, cy + r * .5], fill=50)
        finish('grime_stain', a.filter(ImageFilter.GaussianBlur(5)), (64, 58, 46))
grime_textures()
for k, r in (('grime_base', .8), ('grime_rust', .7), ('grime_stain', .75)): decal_material(k, k, r)
material('pipe_green', None, color=(.16, .28, .2), rough=.45, metal=.35)
material('pipe_grey', None, color=(.34, .35, .36), rough=.5, metal=.4)
material('pipe_red', None, color=(.42, .05, .04), rough=.45, metal=.3)
material('lagging', None, color=(.62, .6, .55), rough=.9)
material('junction', None, color=(.55, .56, .54), rough=.5, metal=.5)
material('meat', 'meat', .7, rough=.5)

# ---------------------------------------------------------------------------------------------------- geometry
OBJS = {'arch': [], 'kit': [], 'terrain': []}
SOLIDS, CEILINGS, INTERIORS, RAMPS, LIGHTS, PROPS, LOOSE, SCATTER = [], [], [], [], [], [], [], {}

def world_uv(bm, tile):
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            c = l.vert.co
            u, v = ((c.y, c.z) if ax == 0 else (c.x, c.z) if ax == 1 else (c.x, c.y))
            l[uvl].uv = (u / tile, v / tile)

def emit(name, bm, key, group):
    m, tile = MATS[key]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); world_uv(bm, tile)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    if me.uv_layers: me.uv_layers[0].name = 'UVMap'
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); me.materials.append(m); OBJS[group].append(o); return o

def corners_box(c, h, R=None):
    out = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                d = Vector((sx * h[0], sy * h[1], sz * h[2]))
                if R: d = R @ d
                out.append(Vector(c) + d)
    return out

def bm_box(bm, c, h, R=None):
    vs = [bm.verts.new(B(p)) for p in corners_box(c, h, R)]
    for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)): bm.faces.new([vs[i] for i in f])

def box(name, mn, mx, key, group='arch', solid=True, walker=True, surface=True):
    c = [(a + b) / 2 for a, b in zip(mn, mx)]; h = [(b - a) / 2 for a, b in zip(mn, mx)]
    bm = bmesh.new(); bm_box(bm, c, h); o = emit(name, bm, key, group)
    if solid: SOLIDS.append({'b': [round(v, 3) for v in (*mn, *mx)], 'w': walker, 's': surface})
    return o

def rot_y(a):
    from mathutils import Matrix
    return Matrix.Rotation(a, 3, 'Y')
def rot_x(a):
    from mathutils import Matrix
    return Matrix.Rotation(a, 3, 'X')
def rot_z(a):
    from mathutils import Matrix
    return Matrix.Rotation(a, 3, 'Z')

def obox(name, c, h, R, key, group='kit'):
    bm = bmesh.new(); bm_box(bm, c, h, R); return emit(name, bm, key, group)

def bm_cyl(bm, a, b, r, seg=12, caps=True, r2=None):
    a, b = Vector(a), Vector(b); d = (b - a); n = d.normalized()
    u = n.cross(Vector((0, 1, 0)) if abs(n.y) < .9 else Vector((1, 0, 0))).normalized(); v = n.cross(u)
    r2 = r if r2 is None else r2
    ra = [bm.verts.new(B(a + (u * math.cos(t) + v * math.sin(t)) * r)) for t in (i / seg * math.tau for i in range(seg))]
    rb = [bm.verts.new(B(b + (u * math.cos(t) + v * math.sin(t)) * r2)) for t in (i / seg * math.tau for i in range(seg))]
    for i in range(seg): j = (i + 1) % seg; bm.faces.new((ra[i], ra[j], rb[j], rb[i]))
    if caps: bm.faces.new(ra[::-1]); (bm.faces.new(rb) if r2 > 1e-4 else None)

def cyl(name, a, b, r, key, seg=12, group='kit', caps=True, r2=None):
    bm = bmesh.new(); bm_cyl(bm, a, b, r, seg, caps, r2); return emit(name, bm, key, group)

def solid_only(mn, mx, walker=True, surface=True): SOLIDS.append({'b': [round(v, 3) for v in (*mn, *mx)], 'w': walker, 's': surface})

# A wall along x (at z) or along z (at x) with openings (a, b, bottom, top[, 'glass']); `skin` puts a thin cladding
# layer on one side (+1 / -1 in the wall's normal axis) and `tile` a tile dado (to `dado` metres) on the other.
def wall(axis, at, a0, a1, h, t, key, openings=(), skin=None, tile=None, dado=2.2, name='wall'):
    def piece(s, e, y0, y1, solid=True):
        if e - s < .01 or y1 - y0 < .01: return
        if axis == 'x': mn, mx = (s, y0, at - t / 2), (e, y1, at + t / 2)
        else: mn, mx = (at - t / 2, y0, s), (at + t / 2, y1, e)
        box(name, mn, mx, key, solid=solid)
    cur = a0
    for o in sorted(openings):
        s, e, bot, top = o[:4]
        piece(cur, s, 0, h); piece(s, e, 0, bot); piece(s, e, top, h); cur = e
        if len(o) > 4 and o[4] == 'glass':
            if axis == 'x': box('glass', (s, bot, at - .02), (e, top, at + .02), 'glass', group='kit', solid=False); solid_only((s, bot, at - t / 2), (e, top, at + t / 2), surface=False)
            else: box('glass', (at - .02, bot, s), (at + .02, top, e), 'glass', group='kit', solid=False); solid_only((at - t / 2, bot, s), (at + t / 2, top, e), surface=False)
            # frame
            for (fa, fb, fy0, fy1) in ((s, s + .06, bot, top), (e - .06, e, bot, top), (s, e, bot - .06, bot), (s, e, top, top + .06)):
                if axis == 'x': box('frame', (fa, fy0, at - t / 2 - .02), (fb, fy1, at + t / 2 + .02), 'door', group='kit', solid=False)
                else: box('frame', (at - t / 2 - .02, fy0, fa), (at + t / 2 + .02, fy1, fb), 'door', group='kit', solid=False)
    piece(cur, a1, 0, h)
    for side, k, hh in ((skin, 'cladding', h), (tile, 'walltile', dado)):
        if side is None: continue
        off = side * (t / 2 + .015); cur = a0
        segs = []
        for o in sorted(openings): segs.append((cur, o[0], 0, hh)); segs.append((o[0], o[1], 0, min(hh, o[2]))); segs.append((o[0], o[1], min(hh, o[3]), hh)); cur = o[1]
        segs.append((cur, a1, 0, hh))
        for s, e, y0, y1 in segs:
            if e - s < .01 or y1 - y0 < .01: continue
            if axis == 'x': box('skin', (s, y0, at + off - .012), (e, y1, at + off + .012), k, solid=False)
            else: box('skin', (at + off - .012, y0, s), (at + off + .012, y1, e), k, solid=False)

# A steel rail fence between two points: posts every 2 m and `bars` horizontal rails; one collision box.
def rail_fence(x1, z1, x2, z2, h=1.4, bars=4, key='steel', solid=True, name='fence'):
    bm = bmesh.new(); L = math.hypot(x2 - x1, z2 - z1); n = max(1, round(L / 2))
    for i in range(n + 1):
        t = i / n; x, z = x1 + (x2 - x1) * t, z1 + (z2 - z1) * t; bm_box(bm, (x, h / 2, z), (.045, h / 2, .045))
    for k in range(bars):
        y = h * (k + 1) / bars - .05; bm_cyl(bm, (x1, y, z1), (x2, y, z2), .028, 6)
    emit(name, bm, key, 'kit')
    if solid: solid_only((min(x1, x2) - .08, 0, min(z1, z2) - .08), (max(x1, x2) + .08, h, max(z1, z2) + .08), surface=False)

# ---------------------------------------------------------------------------------------------------- the site
FX0, FX1, FZ0, FZ1 = -56, 56, -62, 72          # perimeter fence
GATE = (-7, 7)                                    # north gate gap (x)
H, T = 7.0, .3                                    # main building wall height and thickness
BX0, BX1, BZ0, BZ1 = -26, 26, 0, 48               # main building footprint

# Ground inside the fence, the road, the apron, the car park; then the countryside around (not baked).
box('ground', (FX0 - 8, -.5, FZ0 - 8), (FX1 + 8, 0, FZ1 + 8), 'ground', walker=False, surface=True)
box('road', (-5, 0, -340), (5, .015, -2), 'road', solid=False)
box('apron', (-30, 0, -24), (30, .02, -.5), 'apron', solid=False)
box('carpark', (-50, 0, -56), (-22, .018, -30), 'gravel', solid=False)
box('lairage-pad', (28, 0, -2), (54, .02, 46), 'apron', solid=False)
box('backyard', (-46, 0, 48.5), (50, .02, 66), 'apron', solid=False)

def terrain():
    N, S = 150, 720.0; bm = bmesh.new(); verts = []
    def h(x, z):
        inside = max(FX0 - 14 - x, x - FX1 - 14, FZ0 - 14 - z, z - FZ1 - 14, 0)
        road = max(0, 1 - max(0, abs(x) - 7) / 18) if z < FZ0 else 0
        hills = (math.sin(x * .011) * 7 + math.sin(z * .013 + 1.3) * 6 + math.sin((x + z) * .025) * 3 + math.sin(x * .05 + z * .03) * 1.2)
        rise = min(1, inside / 90) ** 1.4
        return -.04 + rise * (hills + 9) * (1 - road * .85)
    for j in range(N + 1):
        row = []
        for i in range(N + 1):
            x = -S / 2 + S * i / N; z = -S / 2 + S * j / N - 60; row.append(bm.verts.new(B((x, h(x, z), z))))
        verts.append(row)
    for j in range(N):
        for i in range(N): bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    o = emit('terrain', bm, 'grass', 'terrain')
    for p in o.data.polygons: p.use_smooth = True
    return h
terrain_h = terrain()

# Perimeter fence (chain-link panels placed by the game along these runs) and its collision.
FENCE = [[FX0, FZ0, GATE[0], FZ0], [GATE[1], FZ0, FX1, FZ0], [FX0, FZ0, FX0, FZ1], [FX1, FZ0, FX1, FZ1], [FX0, FZ1, FX1, FZ1]]
for x1, z1, x2, z2 in FENCE: solid_only((min(x1, x2) - .15, 0, min(z1, z2) - .15), (max(x1, x2) + .15, 2.5, max(z1, z2) + .15), surface=False)
for x in GATE: box('gatepost', (x - .25, 0, FZ0 - .25), (x + .25, 3.2, FZ0 + .25), 'yellow')

# Gatehouse with a window onto the gate, and the barrier arm (raised).
gx0, gx1, gz0, gz1 = -15, -9.5, -59, -54
wall('x', gz0, gx0, gx1, 2.9, .2, 'brick', name='gatehouse'); wall('x', gz1, gx0, gx1, 2.9, .2, 'brick', openings=[(-13.5, -11, 1, 2.1, 'glass')], name='gatehouse')
wall('z', gx0, gz0, gz1, 2.9, .2, 'brick', name='gatehouse'); wall('z', gx1, gz0, gz1, 2.9, .2, 'brick', openings=[(-56.8, -55.6, 0, 2.1), (-58.4, -57.2, 1, 2.1, 'glass')], name='gatehouse')
box('gatehouse-roof', (gx0 - .4, 2.9, gz0 - .4), (gx1 + .4, 3.1, gz1 + .4), 'roof')
CEILINGS.append([gx0, gx1, gz0, gz1, 2.9]); INTERIORS.append([gx0, gx1, gz0, gz1])
box('barrier-post', (-8.3, 0, -61.2), (-7.7, 1.1, -60.6), 'yellow')
obox('barrier-arm', (-8, 3.4, -60.9), (.06, 2.4, .06), rot_z(-.12), 'red')

# ---- the main building
openN = [(-4, 4, 0, 5.2), (8, 12, 1.1, 2.3, 'glass'), (14, 18, 1.1, 2.3, 'glass'), (20, 24, 1.1, 2.3, 'glass')]
openE = [(15, 16.8, 0, 2.3), (30, 32.6, 0, 2.6)]                                # staff door, race door into the pen
openW = [(10, 14, 1.3, 4.6), (18, 22, 1.3, 4.6), (28, 30, 2.5, 3.5, 'glass')]  # dock shutters (at dock height), a window
openS = [(-21, -17, 0, 3.4), (12, 13.6, 0, 2.3)]                                # chiller loadout, rear door
wall('x', BZ0, BX0, BX1, H, T, 'blockwall', openN, skin=-1, name='north')
wall('x', BZ1, BX0, BX1, H, T, 'blockwall', openS, skin=1, name='south')
wall('z', BX0, BZ0, BZ1, H, T, 'blockwall', openW, skin=-1, name='west')
wall('z', BX1, BZ0, BZ1, H, T, 'blockwall', openE, skin=1, name='east')
# Pitched roof: two slopes up to a ridge along x = 0, gables, trusses, skylights.
RIDGE = 10.0
pitch = math.atan2(RIDGE - H, BX1 + .6)
for s in (-1, 1):
    run = (BX1 + .6) / math.cos(pitch)
    for (za, zb) in ((-.6, 8), (11, 20), (23, 32), (35, 44), (47, 48.6)):
        obox('roof', (s * (BX1 + .6) / 2, (H + RIDGE) / 2 + .1, (za + zb) / 2), (run / 2, .06, (zb - za) / 2), rot_z(-s * pitch), 'roof', group='arch')
    for (za, zb) in ((8, 11), (20, 23), (32, 35), (44, 47)):
        obox('skylight', (s * (BX1 + .6) / 2, (H + RIDGE) / 2 + .1, (za + zb) / 2), (run / 2, .03, (zb - za) / 2), rot_z(-s * pitch), 'skylight')
for z in (BZ0, BZ1):
    bm = bmesh.new(); zz = z
    vs = [bm.verts.new(B(p)) for p in ((BX0, H, zz), (BX1, H, zz), (0, RIDGE, zz))]; bm.faces.new(vs)
    o = emit('gable', bm, 'cladding', 'arch')
    mod = o.modifiers.new('thick', 'SOLIDIFY'); mod.thickness = .2
for z in range(3, 48, 6):
    cyl('truss', (BX0, H - .1, z), (BX1, H - .1, z), .09, 'steel', 6)
    for s in (-1, 1): cyl('rafter', (s * BX1, H - .05, z), (0, RIDGE - .15, z), .07, 'steel', 6)
    cyl('king', (0, H - .1, z), (0, RIDGE - .15, z), .05, 'steel', 6)
CEILINGS.append([BX0, BX1, BZ0, BZ1, H - .35]); INTERIORS.append([BX0, BX1, BZ0, BZ1])
# Floors: concrete in the halls, anti-slip tile on the kill floor, a drain channel under the bleed rail.
box('floor', (BX0, 0, BZ0), (BX1, .03, BZ1), 'floor', solid=False)
box('killtile', (BX0 + .2, .03, BZ0 + .2), (6, .045, 36), 'killtile', solid=False)
box('drain', (-12.6, .045, 6), (-11.4, .05, 34), 'grate', group='kit', solid=False)

# ---- rooms
# Office block (north-east): plaster walls, windows onto the kill floor, a flat roof you can stand on.
OX0, OX1, OZ0, OZ1, OH = 6, BX1 - T / 2, BZ0 + T / 2, 12, 3.2
wall('z', OX0, OZ0, OZ1, OH, .16, 'plaster', [(2, 5, 1.0, 2.2, 'glass'), (9, 10.2, 0, 2.2)], name='office')
wall('x', OZ1, OX0, OX1, OH, .16, 'plaster', [(10, 11.2, 0, 2.2)], name='office')
box('office-roof', (OX0 - .08, OH, OZ0), (OX1, OH + .2, OZ1 + .08), 'concrete')
box('office-floor', (OX0, .03, OZ0), (OX1, .05, OZ1), 'apron', solid=False)
CEILINGS.append([OX0, OX1, OZ0, OZ1, OH]); INTERIORS.append([OX0, OX1, OZ0, OZ1])
# Lockers along the corridor.
for i in range(8): box('locker', (14 + i * .62, 0, 12.1), (14.58 + i * .62, 1.9, 12.6), 'locker')
# Holding pen (south-east): steel fences on the kill-floor side with the gate gap at z 32..37; cattle enter from the race.
PEN = dict(minX=7.5, maxX=24.5, minZ=25.5, maxZ=46.5)
rail_fence(6, 24, 6, 32, 1.5, name='pen'); rail_fence(6, 37, 6, BZ1 - T / 2, 1.5, name='pen'); rail_fence(6, 24, BX1 - T / 2, 24, 1.5, name='pen')
box('pen-straw', (6.2, .03, 24.2), (25.7, .06, 47.7), 'hay', solid=False)
# Chiller (south-west): insulated panel room with a strip curtain doorway; its roof is a surface too.
CX0, CX1, CZ0, CZ1, CH = BX0 + T / 2, -6, 36, BZ1 - T / 2, 4.2
wall('x', CZ0, CX0, CX1, CH, .2, 'panel', [(-14.5, -11, 0, 3)], name='chiller')
wall('z', CX1, CZ0, CZ1, CH, .2, 'panel', name='chiller')
box('chiller-roof', (CX0, CH, CZ0 - .1), (CX1 + .1, CH + .2, CZ1), 'panel')
CEILINGS.append([CX0, CX1, CZ0, CZ1, CH]); INTERIORS.append([CX0, CX1, CZ0, CZ1])
for i in range(15): box('curtain', (-14.45 + i * .233, .05, CZ0 - .12 + (i % 2) * .03), (-14.24 + i * .233, 2.98, CZ0 - .1 + (i % 2) * .03), 'curtain', group='kit', solid=False)
# Kill floor: the knocking box at the pen gate, the bleed rail with shackles and chains, a hoist, a splitting
# platform with steps, the drain, hose reels, a catwalk along the north wall up to the office roof.
box('knockbox-base', (2, 0, 19.6), (5.4, .25, 23.4), 'plate')
for z in (19.6, 23.2): box('knockbox-side', (2, .25, z), (5.4, 1.9, z + .2), 'plate')
box('knockbox-back', (5.2, .25, 19.6), (5.4, 1.9, 23.4), 'plate')
cyl('knockbox-rail', (2, 1.9, 19.7), (2, 1.9, 23.3), .05, 'steel', 8)
RAIL_Y = 4.9    # bleeding rail height for cattle (~4.9 m); the dressing rail runs beside it at ~3.4 m
rails = [((2, RAIL_Y, 21.5), (-12, RAIL_Y, 21.5)), ((-12, RAIL_Y, 6), (-12, RAIL_Y, 35.4)), ((-12, 3.4, 35.4), (-12, 3.4, 46.6)), ((-17.5, 3.4, 8), (-17.5, 3.4, 35.4))]
for z in (39, 42, 45): rails.append(((-24.6, 3.3, z), (-7, 3.3, z)))
for a, b in rails:
    cyl('rail', a, b, .045, 'stainless', 8)
    L = (Vector(b) - Vector(a)).length; n = max(1, int(L / 3))
    for i in range(n + 1):
        p = Vector(a).lerp(Vector(b), i / n); top = CH if p.z > CZ0 and p.x < CX1 else H - .1
        cyl('hanger', p, (p.x, top, p.z), .025, 'steel', 6)
# Shackles on chains down the bleed rail; hanging halves in the chiller.
chain = bmesh.new()
for k in range(7):
    y = -.12 * k
    for i in range(8):
        t0, t1 = i / 8 * math.tau, (i + 1) / 8 * math.tau; R = rot_y(math.pi / 2 * (k % 2))
        a = R @ Vector((math.cos(t0) * .03, y + math.sin(t0) * .055, 0)); b = R @ Vector((math.cos(t1) * .03, y + math.sin(t1) * .055, 0))
        bm_cyl(chain, a, b, .008, 4, caps=False)
bm_cyl(chain, (0, -.86, 0), (0, -1.0, 0), .05, 8); bm_box(chain, (0, -1.06, 0), (.11, .03, .02))
chain_obj = emit('shackle', chain, 'chain', 'kit')
SH = [chain_obj]
for i, z in enumerate(range(8, 35, 2)):
    o = bpy.data.objects.new('shackle', chain_obj.data); scene.collection.objects.link(o); o.location = B((-12, RAIL_Y - .05, z)); OBJS['kit'].append(o)
for x in range(-10, 2, 2):
    o = bpy.data.objects.new('shackle', chain_obj.data); scene.collection.objects.link(o); o.location = B((x, RAIL_Y - .05, 21.5)); OBJS['kit'].append(o)
box('hoist', (-12.3, RAIL_Y + .1, 5.6), (-11.7, RAIL_Y + .6, 6.4), 'yellow', group='kit', solid=False)
# Splitting platform with steps: a climbable stage in the middle of the floor.
box('platform', (-17, 1.6, 25), (-14, 1.75, 30), 'grate')
for x in (-17, -14):
    for z in (25, 30): box('platform-leg', (x - .05, 0, z - .05), (x + .05, 1.6, z + .05), 'steel', solid=False)
solid_only((-17, 0, 25), (-14, 1.75, 30))
for i in range(4): box('step', (-14 + i * .45, 0, 25.6), (-13.55 + i * .45, 1.6 - i * .4, 27), 'grate')
rail_fence(-17, 25, -17, 30, 1.0, 2, solid=False); rail_fence(-17, 30, -14, 30, 1.0, 2, solid=False)
# Catwalk along the north wall from the west ladder to the office roof.
box('catwalk', (BX0 + T / 2, 3.1, 1.2), (6, 3.25, 2.6), 'grate')
rail_fence(BX0 + .4, 2.6, 6, 2.6, 1.05 + 3.25, 2, solid=False, name='catwalk-rail')
for x in range(-24, 6, 4): box('catwalk-hanger', (x - .03, 3.25, 2.5), (x + .03, H - .1, 2.56), 'steel', solid=False)
for i in range(11): box('ladder-rung', (-24.5, .3 + i * .28, 3.0), (-23.7, .34 + i * .28, 3.06), 'steel', solid=False)
for x in (-24.5, -23.7): box('ladder-rail', (x - .03, 0, 3.0), (x + .03, 3.25, 3.06), 'steel', solid=False)
solid_only((-24.6, 0, 2.7), (-23.6, 3.25, 3.1), surface=True)   # the ladder as a climbable block
# Hose reels and a wash trough on the west wall.
for z in (8, 26): cyl('hose-reel', (BX0 + .2, 1.4, z), (BX0 + .45, 1.4, z), .35, 'red', 16)

# ---- outside
# Loading dock (west) with a ramp and bumpers.
box('dock', (BX0 - 10, 0, 6), (BX0 - T / 2, 1.3, 26), 'concrete')
for z in (9.5, 14.5, 17.5, 22.5): box('bumper', (BX0 - 10.2, .35, z), (BX0 - 10, .95, z + .5), 'blackrubber', solid=False)
ang = math.atan2(1.3, 8); L = math.hypot(8, 1.3)
obox('dock-ramp', (BX0 - 5, .62, 6 - L / 2 * math.cos(ang) + .05), (4.8, .09, L / 2), rot_x(ang), 'concrete', group='arch')
RAMPS.append({'c': [BX0 - 5, .62, 6 - L / 2 * math.cos(ang) + .05], 'h': [4.8, .09, L / 2], 'q': list(rot_x(ang).to_quaternion()[1:]) + [rot_x(ang).to_quaternion()[0]]})
# Lairage: four outdoor pens east of the building, a race into the holding pen, troughs, hay, the unloading ramp.
LX0, LX1, LZ0, LZ1 = 30, 50, 4, 44
rail_fence(LX0, LZ0, LX1, LZ0); rail_fence(LX1, LZ0, LX1, LZ1); rail_fence(LX0, LZ1, LX1, LZ1)
rail_fence(LX0, LZ0, LX0, 29.6); rail_fence(LX0, 33, LX0, LZ1)
for z in (14, 24, 34): rail_fence(LX0, z, LX1 - 4, z)
rail_fence(BX1 + .2, 29.6, LX0, 29.6, 1.6); rail_fence(BX1 + .2, 33, LX0, 33, 1.6)   # the race
for x in (34, 44): box('trough', (x, 0, LZ0 + .3), (x + 2.4, .6, LZ0 + .9), 'concrete')
for i, (x, z) in enumerate([(47, 8), (47.5, 18), (46.8, 28), (47.3, 38)]):
    cyl('hay', (x - .6, .7, z), (x + .6, .7, z), .7, 'hay', 18)
ang = math.atan2(1.0, 4)
obox('unload-ramp', (40, .5, LZ0 - 2.1), (1.4, .08, 2.1), rot_x(-ang), 'plate', group='kit')
# The cattle trailer backed up to the ramp: slatted aluminium sides, gooseneck, six wheels.
def trailer(x, z):
    bm = bmesh.new(); y0 = 1.05
    bm_box(bm, (x, y0, z), (1.25, .08, 5.0))                      # deck
    bm_box(bm, (x, y0 + 2.7, z), (1.25, .04, 5.0))                # roof
    for s in (-1, 1):
        for k in range(5): bm_box(bm, (x + s * 1.25, y0 + .25 + k * .55, z), (.025, .18, 5.0))      # side slats with gaps
        for k in range(9): bm_box(bm, (x + s * 1.26, y0 + 1.35, z - 4.8 + k * 1.2), (.03, 1.35, .05))  # uprights
    bm_box(bm, (x, y0 + 1.35, z - 5.0), (1.25, 1.35, .03))        # front wall
    bm_box(bm, (x, y0 + .35, z - 6.2), (.6, .25, 1.3))            # gooseneck
    emit('trailer', bm, 'trailer', 'kit')
    wh = bmesh.new()
    for dz in (2.2, 3.2, 4.2):
        for s in (-1, 1): bm_cyl(wh, (x + s * 1.05, .48, z + dz), (x + s * 1.35, .48, z + dz), .48, 14)
    emit('trailer-wheels', wh, 'blackrubber', 'kit')
    solid_only((x - 1.3, 0, z - 7.4), (x + 1.3, y0 + 2.75, z + 5), surface=True)
trailer(40, -7.4)
# Boiler house with its chimney, silos, a blood tank, offal skips along the back.
wall('x', 52, -44, -34, 4.6, .3, 'brick', name='boiler'); wall('x', 62, -44, -34, 4.6, .3, 'brick', name='boiler')
wall('z', -44, 52, 62, 4.6, .3, 'brick', name='boiler'); wall('z', -34, 52, 62, 4.6, .3, 'brick', [(55, 56.6, 0, 2.3)], name='boiler')
box('boiler-roof', (-44.4, 4.6, 51.6), (-33.6, 4.85, 62.4), 'roof')
CEILINGS.append([-44, -34, 52, 62, 4.6]); INTERIORS.append([-44, -34, 52, 62])
cyl('chimney', (-36, 0, 60), (-36, 17, 60), .8, 'brick', 16, r2=.65)
solid_only((-36.8, 0, 59.2), (-35.2, 17, 60.8), surface=False)
for i, x in enumerate((38, 45.5)):
    cyl('silo', (x, 2.2, 58), (x, 13, 58), 3.0, 'galv', 24); cyl('silo-top', (x, 13, 58), (x, 15.4, 58), 3.0, 'galv', 24, r2=.3)
    cyl('silo-hopper', (x, .9, 58), (x, 2.2, 58), .5, 'galv', 16, r2=3.0)
    for a in range(4): box('silo-leg', (x + math.cos(a * math.pi / 2 + .78) * 2.4 - .1, 0, 58 + math.sin(a * math.pi / 2 + .78) * 2.4 - .1), (x + math.cos(a * math.pi / 2 + .78) * 2.4 + .1, 2.4, 58 + math.sin(a * math.pi / 2 + .78) * 2.4 + .1), 'galv', group='kit', solid=False)
    solid_only((x - 3, 0, 55), (x + 3, 15, 61), surface=False)
cyl('blood-tank', (-2, 1.3, 53), (8, 1.3, 53), 1.25, 'galv', 20); solid_only((-2, 0, 51.7), (8, 2.6, 54.3), surface=True)
for x in (14, 18.5):
    box('skip', (x, 0, 50.4), (x + 3.6, 1.6, 52.4), 'rust', group='kit');
# Electricity poles along the road (Poly Haven model) and the scatter of countryside.
for z in range(-80, -340, -42): PROPS.append(['modular_electricity_poles', 9, 0, z, 0, 1.0, None])

# ---- countryside scatter (models placed by the game, many copies per draw call)
def scatter(name, n, ring, scale=(1, 1), avoid_road=True, clump=None):
    out = SCATTER.setdefault(name, []); r0, r1 = ring; tries = 0
    while len(out) < n and tries < n * 40:
        tries += 1; x = random.uniform(-r1, r1); z = random.uniform(-r1, r1) - 6
        d = max(abs(x) - (FX1 + r0), z - (FZ1 + r0), (FZ0 - r0) - z, 0) if abs(x) > FX1 + r0 or z > FZ1 + r0 or z < FZ0 - r0 else 0
        if d <= 0 or math.hypot(x, z) > r1: continue
        if avoid_road and abs(x) < 10 and z < FZ0: continue
        out.append([round(x, 2), round(terrain_h(x, z), 2), round(z, 2), round(random.uniform(0, math.tau), 2), round(random.uniform(*scale), 2)])
scatter('fir_sapling', 130, (14, 240), (2.6, 4.2));   # grown on: the full Poly Haven firs are too heavy for the web scatter('dead_tree_trunk', 10, (8, 120), (.9, 1.3))
scatter('boulder_01', 30, (6, 200), (.6, 1.8)); scatter('shrub_02', 120, (3, 160), (.7, 1.3)); scatter('shrub_04', 80, (3, 160), (.7, 1.3))
scatter('grass_medium_01', 420, (1, 90), (.8, 1.4)); scatter('grass_medium_02', 300, (1, 90), (.8, 1.4))
scatter('fir_sapling', 40, (4, 120), (.9, 1.5)); scatter('tree_stump_01', 14, (4, 80), (.9, 1.3))
# Weeds along the inside of the fence.
for i in range(140):
    side = i % 4; t = random.random()
    x, z = [(FX0 + .8, FZ0 + t * (FZ1 - FZ0)), (FX1 - .8, FZ0 + t * (FZ1 - FZ0)), (FX0 + t * (FX1 - FX0), FZ1 - .8), (FX0 + t * (FX1 - FX0), FZ0 + .8)][side]
    if side == 3 and GATE[0] - 2 < x < GATE[1] + 2: continue
    SCATTER.setdefault(random.choice(['nettle_plant', 'weed_plant_02', 'grass_medium_01']), []).append([round(x, 2), 0, round(z, 2), round(random.uniform(0, 6.28), 2), round(random.uniform(.8, 1.3), 2)])

# ---- props placed by the game (Poly Haven and the main game's library): [name, x, y, z, yaw, scale, part]
PROPS += [
    ['large_iron_gate', -6.2, 0, FZ0 - 2.4, 1.25, 1.25, None], ['large_iron_gate', 6.2, 0, FZ0 - 2.4, -1.25, 1.25, None],
    ['bull_head', 0, 6.0, -.3, math.pi, 4.2, None], ['security_camera_01', 4.6, 5.6, -.25, math.pi + .4, 1.2, None], ['security_camera_01', BX1 + .25, 5.4, 14, -math.pi / 2, 1.2, None],
    ['rollershutter_door', BX0 - .2, 1.3, 14.0, -math.pi / 2, 1.33, 'rollershutter_door'], ['rollershutter_door', BX0 - .2, 1.3, 22.0, -math.pi / 2, 1.33, 'rollershutter_door_graffiti'],
    ['utility_box_01', -12, 0, -.35, math.pi, 1.3, None], ['utility_box_01', 14, 0, 48.4, 0, 1.3, None],
    ['modular_industrial_pipes_01', -18, 2.4, -.3, math.pi, 1.8, None], ['modular_airduct_rectangular_01', 18, 7.4, 48.5, 0, 2.2, None],
    ['fire_hydrant', 8, 0, -3, 0, 1.0, None], ['water_manhole_cover', -2, .02, -14, 0, 1.0, None], ['water_manhole_cover', -12, .05, 20, 0, 1.0, None],
    ['metal_office_desk', 16, .05, 4, math.pi, 1.0, None], ['metal_office_desk', 21, .05, 4, math.pi, 1.0, None], ['metal_stool_01', 16, .05, 5.3, 0, 1.0, None],
    ['steel_frame_shelves_01', 24.9, .05, 7, -math.pi / 2, 1.0, None], ['covered_car', -42, 0, -42, .2, 1.0, None],
    ['chipped-granite-trough-v001', 23.8, 0, 33, math.pi / 2, 1.6, None], ['plain-limestone-trough-v001', 23.8, 0, 40, math.pi / 2, 1.6, None],
    ['old-iron-drainpipe-v001', BX0 - .3, 0, 32, math.pi / 2, 2.2, None], ['old-iron-drainpipe-v001', BX1 + .3, 0, 40, -math.pi / 2, 2.2, None],
    ['worn-iron-cell-door-v001', -38.8, 0, 56.4, math.pi / 2, 1.3, None], 
    ['wooden_ladder', 30.2, 0, 49.5, math.pi, 1.6, None], ['tool_cart', -8, .05, 31, .3, 1.0, None],
]
for x in (-30, -36, -42): PROPS.append(['street_lamp_01', x, 0, -24 if x != -42 else -36, 0, 1.6, None])
LOOSE += [  # [name, x, z, yaw, scale, mass, part, y]
    ['plain-iron-gurney-v001', -6, 14, .3, 1.5, 40, None, 0], ['worn-iron-gurney-v002', -18, 18, 1.4, 1.5, 40, None, 0],
    ['plain-iron-operating-table-v001', -8, 28, 0, 1.6, 70, None, 0], ['old-iron-operating-table-v002', -20, 32, 1.57, 1.6, 70, None, 0],
    ['sturdy-wood-table-v001', 18, 9, 0, 1.4, 45, None, 0], ['weathered-wood-cart-v001', -18, -14, .6, 1.7, 90, None, 0],
    ['weathered-wood-barricade-v001', -12, -46, .1, 1.6, 60, None, 0], ['plain-wood-barricade-v001', 13, -47, -.15, 1.6, 60, None, 0],
    ['concrete_road_barrier', -10, -52, 0, 1.3, 420, None, 0], ['concrete_road_barrier', 10, -52, 0, 1.3, 420, None, 0],
    ['trashbag', -5.6, -1.2, 0, 1.3, 8, None, 0], ['trashbag', -6.4, -.6, 1, 1.2, 8, None, 0], ['trashbag', 6, -1.1, 2, 1.3, 8, None, 0],
    ['cement_bag', 21, 50, .4, 1.2, 25, None, 0], ['cement_bag', 21.4, 49.6, 1.2, 1.2, 25, None, 0],
    ['propane_tank', -30, 49.8, 0, 1.4, 18, None, 0], ['propane_tank', -29.3, 49.9, 0, 1.4, 18, None, 0],
    ['old_tyre', -28, -6, 0, 1.2, 12, None, 0], ['old_tyre', 52, -10, 0, 1.2, 12, None, 0], ['old_tyre', 51.3, -9.4, 0, 1.2, 12, None, 0],
    ['Barrel_02', -27.5, 30, 0, 1.25, 35, None, 0], ['barrel_01', 22, -30, 0, 1.25, 35, None, 0], ['barrel_03', 23.2, -30.4, 0, 1.25, 35, None, 0],
    ['barrel_01', -22, -34, 0, 1.25, 35, None, 0], ['barrel_03', -2.6, 11, 0, 1.25, 35, None, 0], ['barrel_01', 2.8, 11.4, 0, 1.25, 35, None, 0],
    ['metal_jerrycan', -31, 51, .5, 1.2, 10, None, 0], ['wooden_bucket_01', 44, 6, 0, 1.2, 6, None, 0], ['cardboard_box_01', 20, 10.5, .2, 1.4, 6, None, 0],
    ['metal_trash_can', -9.5, -.6, 0, 1.25, 14, 'metal_trash_can_rust', 0], ['metal_trash_can', -10.6, -.55, 0, 1.25, 14, 'metal_trash_can_rust', 0],
]
for (x, z) in [(-14, -18), (16, -8), (-8, -6), (14, 18), (-3, 16)]:
    for i in range(6): LOOSE.append(['wooden_crate_02', x + (i % 2) * .75, z + (i % 3) * .1, (i % 2) * .08, 1.35, 20, 'wooden_crate_02_crate', math.floor(i / 2) * .66])

# ---- lights: [x, y, z], colour, intensity (candela), distance, flicker, bulb size
def lamp(p, color, i, d, flicker=0, bulb=None, blender=None): LIGHTS.append({'p': list(p), 'c': color, 'i': i, 'd': d, 'f': flicker, 'b': bulb})
for (x, z) in [(-30, -24), (-36, -24), (30, -36), (-42, -36)]: pass
lamp((-29.3, 5.9, -24), 0xffa64d, 300, 40); lamp((30, 5.9, -36), 0xffa64d, 300, 40); lamp((-41.3, 5.9, -36), 0xffa64d, 260, 36)
lamp((0, 6.2, -.5), 0xffd2a0, 160, 26, 0, [.5, .12, .25])          # over the main door
lamp((BX1 + .4, 4.6, 31.3), 0xffd2a0, 110, 22, 0, [.4, .12, .25]) # over the race door
lamp((40, 5.5, 2), 0xffa64d, 200, 32)                             # lairage
lamp((-37, 3.6, 49.5), 0xffa64d, 120, 20)                         # boiler yard
for (x, z) in [(-20, 8), (-6, 8), (-20, 26), (-6, 26), (2, 14)]: lamp((x, 5.6, z), 0xd8f0e6, 46, 24, .8, [1.9, .05, .12])
for (x, z) in [(-20, 42), (-11, 42)]: lamp((x, 3.9, z), 0xbfe6ff, 26, 14, .2, [1.6, .05, .12])
lamp((16, 3.0, 6), 0xfff0d8, 30, 14, 0, [1.2, .05, .3])           # office
lamp((16, 5.6, 36), 0xd8f0e6, 30, 22, .5, [1.9, .05, .12])        # pen

POINTS = {
    'spawn': {'x': 0, 'z': -78, 'yaw': 0}, 'cowSpawn': {'x': 16, 'z': 40, 'yaw': -math.pi / 2},
    'exit': {'x': 0, 'z': -72, 'radius': 9}, 'gateZ': FZ0, 'bounds': [-150, 150, -340, 160],
    'pen': PEN, 'gate': {'x': 6, 'z': 34.5, 'half': 2.55}, 'lever': {'x': 5.2, 'z': 31.2},
    'escape': [[9, 34.5], [3, 34.5], [0, 27], [0, 12], [0, -3], [0, -30]],
    'truckStart': {'x': 44, 'z': -40, 'yaw': math.pi},
    'fence': FENCE, 'gateX': GATE,
    'patrols': [
        [[-20, -40], [20, -40], [20, -12], [-20, -12]],
        [[27, -6], [54, -6], [54, 47], [27, 47]],
        [[-12, -4], [12, -4]],
        [[-22, 8], [-2, 8], [-2, 33], [-22, 33]],
        [[8, 18], [24, 18]],
        [[3.2, 26], [3.2, 45]],
        [[-22, 41], [-9, 41]],
        [[-20, 57], [24, 57]],
    ],
}

# ---------------------------------------------------------------------------------------------------- the gore pass
# Decals: quads a few millimetres off a surface, UV 0..1 over the quad. Floors lie flat (yaw turns them); walls face
# along +x/-x/+z/-z (`face`). Placed by hand where blood really collects, then scattered for the rest.
DECALS = []
def decal(kind, x, y, z, w, h, yaw=0.0, face=None):
    bm = bmesh.new(); uvl = bm.loops.layers.uv.verify(); c, s_ = math.cos(yaw), math.sin(yaw)
    if face is None:   # floor: w along x', h along z'
        pts = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
        vs = [bm.verts.new(B((x + px * c - pz * s_, y, z + px * s_ + pz * c))) for px, pz in pts]
    else:              # wall: w along the wall, h up
        ax, sign = face[0], (1 if face[1] == '+' else -1)
        pts = [(-w / 2, 0), (w / 2, 0), (w / 2, h), (-w / 2, h)]
        vs = [bm.verts.new(B((x, y + py, z + px)) if ax == 'x' else B((x + px, y + py, z))) for px, py in pts]
    f = bm.faces.new(vs)
    for l, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uvl].uv = uv
    me = bpy.data.meshes.new('decal'); bm.to_mesh(me); bm.free(); me.uv_layers[0].name = 'UVMap'
    o = bpy.data.objects.new('decal', me); scene.collection.objects.link(o); me.materials.append(MATS[kind if kind in MATS else 'blood_' + kind][0]); OBJS['kit'].append(o)
rg = random.Random(77)
F = .05   # kill-floor tile top
# Under the bleed rail: the sticking point and long pools draining to the channel, drag smears along the rails.
for z in (8, 10.5, 13, 15.5, 18, 21.5, 24, 27, 30, 33): decal('pool', -12 + rg.uniform(-.5, .5), F + .004, z, rg.uniform(2.2, 3.6), rg.uniform(2.2, 3.6), rg.uniform(0, 6.28))
for x in (-1, -4, -7, -10): decal('smear', x, F + .006, 21.5 + rg.uniform(-.4, .4), 3.4, 1.4, rg.uniform(-.15, .15))
for z in (7, 12, 17, 22, 27, 32): decal('smear', -12.8, F + .006, z, 4.2, 1.2, math.pi / 2 + rg.uniform(-.2, .2))
decal('pool', 3.7, .255, 21.5, 2.8, 3.2, .4)                                        # inside the knocking box
for i in range(5): decal('smear', 1.0 - i * .4, F + .007, 20.5 + i * .5, 2.5, .9, rg.uniform(-.6, .6))
decal('pool', -15.5, 1.756, 27.5, 2.6, 4, 0); decal('drip', -14.0, 0, 27.5, 4, 1.7, face=('x', '+'))   # splitting platform
for i in range(18): decal('smear', -15.5 + rg.uniform(-3, 3), F + .008, 27.5 + rg.uniform(-4, 4), rg.uniform(1, 3), rg.uniform(.6, 1.4), rg.uniform(0, 6.28))
# Walls: spray and drips on the west wall, the tile behind the rail, the office wall, the knocking box.
for z in range(5, 35, 2):
    if rg.random() < .75: decal('spray', BX0 + T / 2 + .006, rg.uniform(.1, .9), z + rg.uniform(-.8, .8), rg.uniform(1.4, 2.6), rg.uniform(1.2, 2.2), face=('x', '+'))
    if rg.random() < .55: decal('drip', BX0 + T / 2 + .008, rg.uniform(.2, 1.4), z + rg.uniform(-.8, .8), rg.uniform(.8, 1.6), rg.uniform(1.2, 2.4), face=('x', '+'))
for x in (-20, -15, -9, -4): decal('spray', x, .2, BZ0 + T / 2 + .006, 2.2, 2.0, face=('z', '+'))
for z in (2, 4, 7, 10): decal('spray', OX0 - .09, .1, z, 1.6, 1.3, face=('x', '-'))
decal('spray', 5.19, .3, 21.5, 3.6, 1.5, face=('x', '-')); decal('drip', 2.01, .3, 21.5, 3.4, 1.5, face=('x', '-'))
# Floor everywhere on the kill floor: dried trails, spray, boot-tracked smears, pink wash water running to the drain.
for i in range(70):
    x, z = rg.uniform(BX0 + 1, 5), rg.uniform(1, 35)
    decal(rg.choice(['dry', 'dry', 'smear', 'spray', 'wash', 'wash']), x, F + .003 + rg.random() * .002, z, rg.uniform(.8, 3.2), rg.uniform(.6, 2.6), rg.uniform(0, 6.28))
for z in range(7, 34, 3): decal('wash', -10.2, F + .009, z, 3.6, 1.6, math.pi + rg.uniform(-.3, .3))
# Chiller: a drip pool under almost every half; the strip curtain smeared at hand height.
for zz in (39, 42, 45):
    for x in range(-23, -8, 2): decal('pool' if rg.random() < .4 else 'dry', x + rg.uniform(-.3, .3), .034, zz + rg.uniform(-.3, .3), rg.uniform(.6, 1.4), rg.uniform(.6, 1.4), rg.uniform(0, 6.28))
decal('smear', -12.7, .6, CZ0 - .14, 3.0, 1.2, face=('z', '-'))
# Pen gate, race and outside: muck and blood by the knocking box entrance, a leak under the blood tank, the skips.
for i in range(8): decal('dry', rg.uniform(3, 8), F + .004, rg.uniform(24, 38), rg.uniform(1, 2.5), rg.uniform(1, 2.5), rg.uniform(0, 6.28))
decal('pool', 3, .025, 55, 5, 3, .2); decal('smear', 16, .025, 53.6, 6, 1.8, 0); decal('drip', 14, 0, 50.39, 3.6, 1.4, face=('z', '-')); decal('drip', 18.5, 0, 50.39, 3.6, 1.4, face=('z', '-'))
decal('dry', 40, .03, -3, 3, 5, 0)                                                   # trailer ramp
# Kill-floor equipment from real layouts: a hide puller frame at the dressing rail, the split saw on the platform,
# knife steriliser boxes, a wash-hand basin, the stun box's shackle hoist.
box('hide-puller', (-19.4, 0, 14), (-18.6, 3.2, 14.6), 'stainless', group='kit'); box('hide-puller', (-19.4, 0, 17.4), (-18.6, 3.2, 18), 'stainless', group='kit')
cyl('hide-puller-drum', (-19, .6, 14.3), (-19, .6, 17.7), .35, 'stainless', 16); box('hide-puller-chain', (-19.05, .9, 15.9), (-18.95, 3.3, 16.1), 'chain', group='kit', solid=False)
obox('split-saw', (-15.5, 3.0, 27.5), (.18, .55, .3), rot_z(.3), 'stainless'); cyl('split-saw-cable', (-15.5, 3.55, 27.5), (-15.5, H - .2, 27.5), .02, 'chain', 6)
for z in (10, 19, 28):
    box('steriliser', (BX0 + .2, 1.0, z), (BX0 + .5, 1.4, z + .5), 'stainless', group='kit', solid=False)
    box('basin', (BX0 + .2, .8, z + .9), (BX0 + .7, 1.0, z + 1.6), 'stainless', group='kit', solid=False)

# ---------------------------------------------------------------------------------------------------- wear and services
rw = random.Random(91)
# Dirt banked along the foot of every inside wall (and outside along the cladding).
for (ax, at, sign, a0, a1) in (('x', BX0 + T / 2 + .01, '+', 0.3, 47.7), ('x', BX1 - T / 2 - .01, '-', 0.3, 47.7), ('z', BZ0 + T / 2 + .01, '+', BX0 + .3, BX1 - .3), ('z', BZ1 - T / 2 - .01, '-', BX0 + .3, BX1 - .3),
                                ('x', BX0 - T / 2 - .03, '-', 0, 48), ('x', BX1 + T / 2 + .03, '+', 0, 48), ('z', BZ0 - T / 2 - .03, '-', BX0, BX1), ('z', BZ1 + T / 2 + .03, '+', BX0, BX1)):
    pos = a0
    while pos < a1 - .5:
        w = min(4.2, a1 - pos); c = pos + w / 2
        if ax == 'x': decal('grime_base', at, .0, c, w + .3, rw.uniform(.6, 1.2), face=('x', sign))
        else: decal('grime_base', c, .0, at, w + .3, rw.uniform(.6, 1.2), face=('z', sign))
        pos += w
# Rust running down the outside cladding from the eaves, water stains high on the inside walls.
for i in range(44):
    side = rw.randrange(4); h = rw.uniform(2, 4.5)
    if side == 0: decal('grime_rust', rw.uniform(BX0 + 1, BX1 - 1), H - h, BZ0 - T / 2 - .04, rw.uniform(1, 2.4), h, face=('z', '-'))
    elif side == 1: decal('grime_rust', rw.uniform(BX0 + 1, BX1 - 1), H - h, BZ1 + T / 2 + .04, rw.uniform(1, 2.4), h, face=('z', '+'))
    elif side == 2: decal('grime_rust', BX0 - T / 2 - .04, H - h, rw.uniform(1, 47), rw.uniform(1, 2.4), h, face=('x', '-'))
    else: decal('grime_rust', BX1 + T / 2 + .04, H - h, rw.uniform(1, 47), rw.uniform(1, 2.4), h, face=('x', '+'))
for i in range(30):
    side = rw.randrange(3); y = rw.uniform(2.6, 5.4); sz = rw.uniform(1.2, 2.8)
    if side == 0: decal('grime_stain', BX0 + T / 2 + .012, y, rw.uniform(1, 35), sz, sz * .8, face=('x', '+'))
    elif side == 1: decal('grime_stain', rw.uniform(BX0 + 1, 5), y, BZ0 + T / 2 + .012, sz, sz * .8, face=('z', '+'))
    else: decal('grime_stain', BX1 - T / 2 - .012, y, rw.uniform(13, 47), sz, sz * .8, face=('x', '-'))
for i in range(50): decal('grime_stain', rw.uniform(BX0 + 1, BX1 - 1), .036 + rw.random() * .002, rw.uniform(1, 47), rw.uniform(1.2, 3.5), rw.uniform(1, 3), rw.uniform(0, 6.28))
for i in range(40): decal('grime_stain', rw.uniform(-28, 28), .022, rw.uniform(-22, -1), rw.uniform(2, 5), rw.uniform(2, 4), rw.uniform(0, 6.28))

# Services: pipe runs along the walls with brackets and drops, lagged steam pipes, cable trays and conduit, a duct.
def pipe_run(points, r, key, brackets=None, seg=8):
    bm = bmesh.new()
    for a, b in zip(points, points[1:]): bm_cyl(bm, a, b, r, seg)
    for p in points[1:-1]: bm_cyl(bm, (p[0], p[1] - r * 1.3, p[2]), (p[0], p[1] + r * 1.3, p[2]), r * 1.25, seg)  # fittings at the bends
    emit('pipe', bm, key, 'kit')
    if brackets:
        bm = bmesh.new()
        for a, b in zip(points, points[1:]):
            L = math.dist(a, b); n = int(L / brackets)
            for i in range(1, n + 1):
                t = i / (n + 1); p = [a[k] + (b[k] - a[k]) * t for k in range(3)]; bm_box(bm, p, (r * 1.6, r * 1.6, r * 1.6))
        emit('bracket', bm, 'junction', 'kit')
WX = BX0 + T / 2
for k, (y, off, key, r) in enumerate([(4.6, .18, 'pipe_green', .06), (4.95, .2, 'pipe_grey', .05), (5.3, .3, 'lagging', .11), (2.9, .06, 'junction', .015)]):
    pipe_run([(WX + off, y, .6), (WX + off, y, 35.6)], r, key, brackets=2.2)
    pipe_run([(BX1 - T / 2 - off, y + .2, 12.5), (BX1 - T / 2 - off, y + .2, 47.4)], r, key, brackets=2.2)
    pipe_run([(BX0 + .6, y + .5, BZ0 + T / 2 + off), (BX1 - .6, y + .5, BZ0 + T / 2 + off)], r, key, brackets=2.2)
for z in (8, 10, 19, 26, 28): pipe_run([(WX + .18, 4.6, z), (WX + .18, 1.5, z)], .03, 'pipe_red' if z in (8, 26) else 'pipe_green')
for z in range(4, 34, 6):
    box('junction-box', (WX + .01, 2.7, z), (WX + .12, 3.1, z + .3), 'junction', group='kit', solid=False); pipe_run([(WX + .06, 2.7, z + .15), (WX + .06, 1.3, z + .15)], .012, 'junction')
    box('switch', (WX + .01, 1.15, z + .07), (WX + .07, 1.32, z + .23), 'yellow', group='kit', solid=False)
for x in (-8, 8):  # cable trays under the trusses, each with a bundle of cables
    box('tray', (x - .25, 6.3, .5), (x + .25, 6.34, 47.5), 'galv', group='kit', solid=False)
    for i in range(4): pipe_run([(x - .18 + i * .12, 6.38, .5), (x - .18 + i * .12, 6.38, 47.5)], .022, 'blackrubber', seg=6)
    for z in range(3, 48, 6): box('tray-hanger', (x - .01, 6.34, z), (x + .01, H - .1, z + .02), 'steel', group='kit', solid=False)
box('duct', (-20.3, 5.75, 1), (-19.7, 6.15, 35), 'galv', group='kit', solid=False)
for z in range(4, 35, 5): box('duct-vent', (-20.25, 5.6, z), (-19.75, 5.75, z + .5), 'grate', group='kit', solid=False)
# Outside: a lagged steam main from the boiler house along the south wall, with drops.
pipe_run([(-34, 3.6, 57), (-30, 3.6, 57), (-30, 3.6, BZ1 + .5), (20, 3.6, BZ1 + .5)], .14, 'lagging', brackets=3)
pipe_run([(-30.2, 3.0, 57), (-30.2, 3.0, BZ1 + .8), (24, 3.0, BZ1 + .8)], .07, 'pipe_red', brackets=3)

# ---------------------------------------------------------------------------------------------------- hanging halves
def halves():
    cow = f'{OUT}/cow.glb'
    if not os.path.exists(cow): return
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=cow)
    new = [o for o in bpy.data.objects if o not in before]; body = next((o for o in new if o.type == 'MESH' and o.name.startswith('cow') and 'eye' not in o.name), None)
    if not body: return
    for o in new:
        if o is not body: bpy.data.objects.remove(o)
    body.parent = None; body.modifiers.clear(); body.vertex_groups.clear()
    bm = bmesh.new(); bm.from_mesh(body.data)
    # Head down, hind legs up (rotate about x so blender +y, the head, goes to -z), dropped so the hocks are at 0.
    from mathutils import Matrix
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.pi / 2, 3, 'X'))
    res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(1, 0, 0), clear_outer=True)
    edges = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    try: bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    except Exception: pass
    bottom = min(v.co.z for v in bm.verts); top = max(v.co.z for v in bm.verts)
    cut = bottom + (top - bottom) * .3          # a dressed side ends at the neck: no head, no fore-shanks
    res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, cut), plane_no=(0, 0, 1), clear_inner=True)
    edges = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    try: bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    except Exception: pass
    top = max(v.co.z for v in bm.verts)
    for v in bm.verts: v.co.z -= top
    me = bpy.data.meshes.new('half'); bm.to_mesh(me); bm.free(); bpy.data.objects.remove(body)
    tmp = bmesh.new(); tmp.from_mesh(me); world_uv(tmp, MATS['meat'][1]); tmp.to_mesh(me); tmp.free()
    me.materials.clear(); me.materials.append(MATS['meat'][0])
    for p in me.polygons: p.use_smooth = True
    for z in (39, 42, 45):
        for i, x in enumerate(range(-23, -8, 2)):
            if random.random() < .18: continue
            o = bpy.data.objects.new('half', me); scene.collection.objects.link(o)
            o.location = B((x + random.uniform(-.2, .2), 3.25, z)); o.rotation_euler = (0, 0, random.uniform(-.4, .4) + (math.pi if i % 2 else 0)); OBJS['kit'].append(o)
    # Two on the bleed rail too.
    for z in (12, 16):
        o = bpy.data.objects.new('half', me); scene.collection.objects.link(o); o.location = B((-12, RAIL_Y - .25, z)); o.rotation_euler = (0, 0, .3); OBJS['kit'].append(o)
halves()

# ---------------------------------------------------------------------------------------------------- bake
def bake():
    arch = [o for o in OBJS['arch'] if o.type == 'MESH']
    for o in arch:
        for m in o.modifiers: pass
    bpy.ops.object.select_all(action='DESELECT')
    for o in arch:
        o.select_set(True)
        if 'lightmap' not in o.data.uv_layers: o.data.uv_layers.new(name='lightmap')
        o.data.uv_layers.active = o.data.uv_layers['lightmap']
        o['lightmap'] = 1
    bpy.context.view_layer.objects.active = arch[0]
    for o in arch:  # apply modifiers (gable thickness) first, so the UV covers the final mesh
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.context.view_layer.objects.active = arch[0]
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=.002, area_weight=0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=.0025, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new('lightmap', LM_SIZE, LM_SIZE, float_buffer=True)
    for m in {s.material for o in arch for s in o.material_slots}:
        n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = img; n.name = 'BAKE'; m.node_tree.nodes.active = n
    sc = scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = False
    sc.render.bake.margin = 6; sc.render.bake.use_pass_direct = True; sc.render.bake.use_pass_indirect = True; sc.render.bake.use_pass_color = False
    # Lights for the bake: the sky, the moon, and every lamp (as in site.json).
    w = bpy.data.worlds.new('night'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']
    sky = f'{OUT}/night-sky.hdr'
    if os.path.exists(sky):
        env = w.node_tree.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(sky); w.node_tree.links.new(env.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.0
    sun = bpy.data.objects.new('moon', bpy.data.lights.new('moon', 'SUN')); sun.data.energy = .35; sun.data.color = (.75, .82, .9); sun.data.angle = .02
    d = B((38, -60, 30)).normalized(); sun.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler(); sc.collection.objects.link(sun)
    lamps = []
    for L in LIGHTS:
        c = L['c']; col = ((c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255)
        ld = bpy.data.lights.new('lamp', 'POINT'); ld.energy = L['i'] * 1.6; ld.color = col; ld.shadow_soft_size = .25
        o = bpy.data.objects.new('lamp', ld); o.location = B(L['p']); sc.collection.objects.link(o); lamps.append(o)
    def run(direct, indirect, label):
        sc.render.bake.use_pass_direct = direct; sc.render.bake.use_pass_indirect = indirect
        print('BAKING', label, flush=True); bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'} if direct else {'INDIRECT'}, use_clear=True, margin=6)
        import numpy as np
        a = np.empty(LM_SIZE * LM_SIZE * 4, dtype=np.float32); img.pixels.foreach_get(a); return a.reshape(LM_SIZE, LM_SIZE, 4)[..., :3].copy()
    # Pass 1: the sky alone, direct and bounced (ambient light that the building shuts out). Pass 2: lamps and moon, bounce only.
    for o in lamps: o.hide_render = True
    sun.hide_render = True; skyl = run(True, True, 'sky')
    for o in lamps: o.hide_render = False
    sun.hide_render = False; bg.inputs['Strength'].default_value = 0; bounce = run(False, True, 'bounce')
    import numpy as np
    from PIL import Image, ImageFilter
    total = skyl + bounce
    k = float(np.percentile(total[total > 1e-5], 99.2)) if (total > 1e-5).any() else 1.0
    enc = np.clip(total / (k * 1.1), 0, 1) ** (1 / 2.2)
    im = Image.fromarray((enc[::-1] * 255).astype('uint8'), 'RGB').filter(ImageFilter.GaussianBlur(1.2))
    im.save(f'{OUT}/site-lightmap.webp', quality=86, method=6)
    POINTS['lightmap'] = {'file': 'site-lightmap.webp', 'scale': round(k * 1.1, 5)}
    print('LIGHTMAP scale', k, flush=True)
    for m in {s.material for o in arch for s in o.material_slots}:
        n = m.node_tree.nodes.get('BAKE')
        if n: m.node_tree.nodes.remove(n)
    for o in lamps + [sun]: bpy.data.objects.remove(o)
    for o in arch: o.data.uv_layers.active = o.data.uv_layers[0]

# Join each group's meshes by material (fewer draw calls), then bake and export.
def join_by_material(objs, group):
    by = {}
    for o in objs:
        if o.type != 'MESH' or o.data.users > 1: continue
        by.setdefault(o.data.materials[0].name, []).append(o)
    out = [o for o in objs if o.type == 'MESH' and o.data.users > 1]
    for name, os_ in by.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in os_: o.select_set(True)
        bpy.context.view_layer.objects.active = os_[0]
        if len(os_) > 1: bpy.ops.object.join()
        j = bpy.context.view_layer.objects.active; j.name = f'{group}-{name}'; out.append(j)
    return out
for o in bpy.data.objects:
    if o.type == 'MESH' and o.modifiers:
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
OBJS['arch'] = join_by_material(OBJS['arch'], 'arch')
OBJS['kit'] = join_by_material(OBJS['kit'], 'kit')
if BAKE: bake()
for o in OBJS['arch']: o['lightmap'] = 1
for o in bpy.data.objects:
    if o.type == 'MESH':
        for p in o.data.polygons:
            if o.name.startswith('terrain') or 'half' in o.name: continue
            p.use_smooth = False
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.export_scene.gltf(filepath=f'{OUT}/site.glb', export_format='GLB', export_image_format='WEBP', export_image_quality=80, export_extras=True,
                          export_apply=True, export_animations=False, export_yup=True, export_lights=False, export_cameras=False)
data = {'version': 1, 'solids': SOLIDS, 'ceilings': CEILINGS, 'interiors': INTERIORS, 'ramps': RAMPS, 'lights': LIGHTS, 'props': PROPS, 'loose': LOOSE, 'scatter': SCATTER, 'points': POINTS}
json.dump(data, open(f'{OUT}/site.json', 'w'), separators=(',', ':'))
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('SITE', os.path.getsize(f'{OUT}/site.glb') // 1024, 'KB', tris, 'tris', len(SOLIDS), 'solids', sum(len(v) for v in SCATTER.values()), 'scattered', flush=True)
