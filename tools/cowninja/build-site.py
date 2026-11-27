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
# Generated hero pieces (docs/cowninja-modly-library.md) that are in the repo replace the scripted stand-ins.
MODLY = {f[:-4] for f in os.listdir(f'{OUT}/modly') if f.endswith('.glb')} if os.path.isdir(f'{OUT}/modly') else set()
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
material('mud', 'brown_mud_leaves_01', 2.5, color=(.62, .56, .5), rough=.36)
material('tracks', 'muddy_tracks', 3, color=(.7, .66, .62), rough=.5)
material('water', None, color=(.025, .04, .045), rough=.03, metal=0)
material('container_red', 'corrugated_iron_02', 1.6, color=(.62, .2, .14), rough=.55)
material('container_blue', 'corrugated_iron_02', 1.6, color=(.2, .32, .46), rough=.55)
material('container_green', 'corrugated_iron_02', 1.6, color=(.24, .38, .27), rough=.55)
material('container_rust', 'rusty_corrugated_iron', 1.6, color=(.8, .7, .62))
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
    def straw(name, aligned, seed):
        # Strands drawn over a golden base, each with a shadow under it and a highlight along it, wrapped so the image
        # tiles; the stack of strands is also a height field, turned into the normal map and the occlusion.
        if os.path.exists(f'{g}/{name}-v2'): return
        import numpy as np
        from PIL import ImageDraw
        N = 1024; rr = random.Random(seed)
        col = Image.new('RGB', (N, N), (150, 118, 58)); hgt = Image.new('L', (N, N), 0)
        dc, dh = ImageDraw.Draw(col), ImageDraw.Draw(hgt)
        pal = [(222, 190, 112), (204, 168, 88), (236, 212, 146), (176, 140, 72), (150, 116, 56), (214, 186, 120), (190, 150, 70)]
        for i in range(16000 if aligned else 13000):
            x, y = rr.uniform(0, N), rr.uniform(0, N)
            ang = (math.pi / 2 + rr.gauss(0, .12)) if aligned else rr.uniform(0, math.pi)
            L = rr.uniform(40, 150) if aligned else rr.uniform(24, 110); w = rr.choice((2, 2, 3, 3, 4))
            dx, dy = math.cos(ang) * L, math.sin(ang) * L
            c = pal[rr.randrange(len(pal))]; k = rr.uniform(.85, 1.08); c = tuple(min(255, int(v * k)) for v in c)
            h = int(60 + 190 * i / (16000 if aligned else 13000))
            for ox in (-N, 0, N):
                for oy in (-N, 0, N):
                    p0, p1 = (x + ox, y + oy), (x + ox + dx, y + oy + dy)
                    dc.line([(p0[0] + 2, p0[1] + 2), (p1[0] + 2, p1[1] + 2)], fill=(70, 52, 24), width=w + 1)
                    dc.line([p0, p1], fill=c, width=w); dh.line([p0, p1], fill=h, width=w)
                    if w > 2: dc.line([(p0[0] - .6, p0[1] - .6), (p1[0] - .6, p1[1] - .6)], fill=tuple(min(255, v + 28) for v in c), width=1)
        col = col.filter(ImageFilter.GaussianBlur(.5)); col.save(f'{g}/{name}-diff.jpg', quality=90)
        H = np.asarray(hgt.filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255.0
        gx = (np.roll(H, -1, 1) - np.roll(H, 1, 1)) * 3.0; gy = (np.roll(H, -1, 0) - np.roll(H, 1, 0)) * 3.0
        nz = 1.0 / np.sqrt(gx * gx + gy * gy + 1.0)
        nor = np.stack([(-gx * nz) * .5 + .5, (gy * nz) * .5 + .5, nz * .5 + .5], -1)
        Image.fromarray((nor * 255).astype(np.uint8)).save(f'{g}/{name}-nor.jpg', quality=92)
        ao = np.clip(.45 + H * .8, 0, 1); rough = np.clip(.95 - H * .2, 0, 1)
        Image.fromarray((np.stack([ao, rough, np.zeros_like(H)], -1) * 255).astype(np.uint8)).save(f'{g}/{name}-arm.jpg', quality=90)
        open(f'{g}/{name}-v2', 'w').write('1')
    straw('hay', False, 3); straw('bale', True, 4)
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
    for name in ('hay', 'bale', 'meat'):
        for kind in ('diff', 'nor', 'arm'):
            dst = f'{WORK}/tex/{name}-{kind}.jpg'
            if os.path.exists(dst): os.remove(dst)
            os.link(f'{g}/{name}-{kind}.jpg', dst)
gen_textures()
material('hay', 'hay', 1.4, normal=1.6)
material('bale', 'bale', 1.1, normal=1.8)
material('twine', None, color=(.62, .2, .04), rough=.55)
material('plinth', 'concrete_wall_008', 1.5, color=(.62, .61, .58))
# A hay bale: rounded edges, a little uneven, two bands of orange baler twine round its short way.
def bale(x0, y0, z0, x1, y1, z1, solid=True, group='kit'):
    rr = random.Random(int(x0 * 131 + z0 * 71 + y0 * 37))
    c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]; h = [(x1 - x0) / 2 * .985, (y1 - y0) / 2 * .97, (z1 - z0) / 2 * .985]
    bm = bmesh.new(); bm_box(bm, c, h)
    try: bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(h) * .3, segments=3, profile=.7, affect='EDGES')
    except Exception as error: print('bale bevel', error)
    for v in bm.verts: v.co += Vector((rr.uniform(-.014, .014), rr.uniform(-.014, .014), rr.uniform(-.01, .01)))
    emit('bale', bm, 'bale', group)
    along_x = (x1 - x0) >= (z1 - z0)
    for t in (.3, .7):
        if along_x:
            xb = x0 + (x1 - x0) * t
            box('twine', (xb - .012, y1 - .002, z0 + .05), (xb + .012, y1 + .006, z1 - .05), 'twine', group='kit', solid=False)
            for z in (z0 - .004, z1 - .004): box('twine', (xb - .012, y0 + .05, z), (xb + .012, y1 - .05, z + .008), 'twine', group='kit', solid=False)
        else:
            zb = z0 + (z1 - z0) * t
            box('twine', (x0 + .05, y1 - .002, zb - .012), (x1 - .05, y1 + .006, zb + .012), 'twine', group='kit', solid=False)
            for x in (x0 - .004, x1 - .004): box('twine', (x, y0 + .05, zb - .012), (x + .008, y1 - .05, zb + .012), 'twine', group='kit', solid=False)
    if solid: SOLIDS.append({'b': [round(v, 3) for v in (x0, y0, z0, x1, y1, z1)], 'w': True, 's': True})
# A round bale lying on its side: a drum with softened shoulders.
def rbale(a, b, r, group='kit'):
    a, b = Vector(a), Vector(b); d = b - a; L = d.length; n = d.normalized()
    u = n.cross(Vector((0, 1, 0)) if abs(n.y) < .9 else Vector((1, 0, 0))).normalized(); v = n.cross(u); seg = 24
    rings = [(0, r * .82), (.07, r * .97), (.16, r), (L - .16, r), (L - .07, r * .97), (L, r * .82)]
    bm = bmesh.new(); rv = []
    for (t, rad) in rings: rv.append([bm.verts.new(B(a + n * t + (u * math.cos(q) + v * math.sin(q)) * rad)) for q in (i / seg * math.tau for i in range(seg))])
    for k in range(len(rv) - 1):
        for i in range(seg): j = (i + 1) % seg; bm.faces.new((rv[k][i], rv[k][j], rv[k + 1][j], rv[k + 1][i]))
    bm.faces.new(rv[0][::-1]); bm.faces.new(rv[-1])
    o = emit('round-bale', bm, 'bale', group)
    for f in o.data.polygons: f.use_smooth = len(f.vertices) == 4   # smooth round the drum, flat ends
# Loose straw: thin strands lying on the ground (or on a pile, `top(x, z)` its height), pointing every way.
def straw(cx, cz, rx, rz, n, seed, top=None, y0=.02):
    rr = random.Random(seed); bm = bmesh.new()
    for i in range(n):
        x, z = cx + rr.uniform(-rx, rx), cz + rr.uniform(-rz, rz); y = (top(x, z) if top else y0) + .004
        L = rr.uniform(.1, .3); ang = rr.uniform(0, math.tau); lift = rr.uniform(0, .5) if top else rr.uniform(0, .18)
        dx, dz, dy = math.cos(ang) * L * math.cos(lift), math.sin(ang) * L * math.cos(lift), L * math.sin(lift); w = rr.uniform(.004, .008)
        ps = [(x - math.sin(ang) * w, y, z + math.cos(ang) * w), (x + math.sin(ang) * w, y, z - math.cos(ang) * w), (x + dx, y + dy, z + dz)]
        bm.faces.new([bm.verts.new(B(p)) for p in ps])
    if n: emit('straw', bm, 'hay', 'kit')
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
FX0, FX1, FZ0, FZ1 = -56, 100, -62, 72         # perimeter fence (the east side holds the farm)
GATE = (-7, 7)                                    # north gate gap (x)
H, T = 7.0, .3                                    # main building wall height and thickness
BX0, BX1, BZ0, BZ1 = -26, 26, 0, 48               # main building footprint

# Ground inside the fence, the road, the apron, the car park; then the countryside around (not baked).
box('ground', (FX0 - 8, -.5, FZ0 - 8), (FX1 + 8, 0, FZ1 + 8), 'ground', walker=False, surface=True)
box('road', (-5, 0, -340), (5, .015, -2), 'road', solid=False)
box('apron', (-30, 0, -24), (30, .02, -.5), 'apron', solid=False)
box('carpark', (-50, 0, -56), (-22, .018, -30), 'gravel', solid=False)
box('farm-pad', (30, 0, 3), (96, .02, 57), 'apron', solid=False)
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
# The staff gate on the east side stands open: a gap a person walks through and a cow cannot. It is the way in.
SIDE = (29.25, 30.75)
FENCE = [[FX0, FZ0, GATE[0], FZ0], [GATE[1], FZ0, FX1, FZ0], [FX0, FZ0, FX0, FZ1], [FX1, FZ0, FX1, SIDE[0]], [FX1, SIDE[1], FX1, FZ1], [FX0, FZ1, FX1, FZ1]]
for z in SIDE: box('sidepost', (FX1 - .14, 0, z - .14 + (.3 if z == SIDE[1] else -.3)), (FX1 + .14, 2.7, z + .14 + (.3 if z == SIDE[1] else -.3)), 'yellow')
box('side-path', (FX1 - 9, 0, 28.6), (FX1 + 16, .02, 31.4), 'gravel', solid=False)
for x1, z1, x2, z2 in FENCE: solid_only((min(x1, x2) - .15, 0, min(z1, z2) - .15), (max(x1, x2) + .15, 2.5, max(z1, z2) + .15), surface=False)
for x in GATE: box('gatepost', (x - .25, 0, FZ0 - .25), (x + .25, 3.2, FZ0 + .25), 'yellow')

# Gatehouse with a window onto the gate, and the barrier arm (raised).
gx0, gx1, gz0, gz1 = -15, -9.5, -59, -54
wall('x', gz0, gx0, gx1, 2.9, .2, 'brick', name='gatehouse'); wall('x', gz1, gx0, gx1, 2.9, .2, 'brick', openings=[(-13.5, -11, 1, 2.1, 'glass')], name='gatehouse')
wall('z', gx0, gz0, gz1, 2.9, .2, 'brick', name='gatehouse'); wall('z', gx1, gz0, gz1, 2.9, .2, 'brick', openings=[(-56.8, -55.6, 0, 2.1), (-58.4, -57.2, 1, 2.1, 'glass')], name='gatehouse')
box('gatehouse-roof', (gx0 - .4, 2.9, gz0 - .4), (gx1 + .4, 3.1, gz1 + .4), 'roof')
CEILINGS.append([gx0, gx1, gz0, gz1, 2.9]); INTERIORS.append([gx0, gx1, gz0, gz1])
box('barrier-post', (-8.3, 0, -61.2), (-7.7, 1.1, -60.6), 'yellow')

# ---- the main building
openN = [(-4, 4, 0, 5.2), (8, 12, 1.1, 2.3, 'glass'), (14, 18, 1.1, 2.3, 'glass'), (20, 24, 1.1, 2.3, 'glass')]
openE = [(15, 16.8, 0, 2.3), (20, 21.3, 0, 1.3), (30, 32.6, 0, 2.6)]              # staff door, a crawl hole, race door into the pen
openW = [(10, 14, 1.3, 4.6), (18, 22, 1.3, 4.6), (28, 30, 2.5, 3.5, 'glass'), (32.5, 33.8, 0, 1.3)]  # dock shutters (at dock height), a window, a crawl hole
openS = [(-21, -17, 0, 3.4), (12, 13.6, 0, 2.3)]                                # chiller loadout, rear door
wall('x', BZ0, BX0, BX1, H, T, 'blockwall', openN, skin=-1, name='north')
wall('x', BZ1, BX0, BX1, H, T, 'blockwall', openS, skin=1, name='south')
wall('z', BX0, BZ0, BZ1, H, T, 'blockwall', openW, skin=-1, name='west')
wall('z', BX1, BZ0, BZ1, H, T, 'blockwall', openE, skin=1, name='east')
# Handholds: three steel rails round the outside of the hall, 1.8 m apart, broken at doors and windows. They are
# what the hands are on when you free-climb a wall (foot.js climbs any tall face; these are its visible holds).
def courses(axis, at, sign, a0, a1, openings):
    for y in (1.85, 3.65, 5.45):
        cur = a0; segs = []
        for o in sorted(openings):
            if o[2] < y + .15 and o[3] > y - .35: segs.append((cur, o[0] - .12)); cur = o[1] + .12
        segs.append((cur, a1))
        d0, d1 = (at - T / 2 - .14, at - T / 2) if sign < 0 else (at + T / 2, at + T / 2 + .14)
        for a, b in segs:
            if b - a < .6: continue
            if axis == 'x': box('ledge', (a, y - .1, d0), (b, y, d1), 'steel', group='kit', solid=False)
            else: box('ledge', (d0, y - .1, a), (d1, y, b), 'steel', group='kit', solid=False)
courses('x', BZ0, -1, BX0 - .4, BX1 + .4, openN); courses('x', BZ1, 1, BX0 - .4, BX1 + .4, openS)
courses('z', BX0, -1, BZ0, BZ1, openW + [(6, 26, 0, 1.3)]); courses('z', BX1, 1, BZ0, BZ1, openE)
# Inside the kill floor: one beam course along the west and north walls, a way up to the catwalk and round the room.
box('ledge', (BX0 + T / 2, 1.75, 4), (BX0 + T / 2 + .14, 1.85, 35.5), 'steel', group='kit', solid=False)
box('ledge', (BX0 + T / 2, 3.55, 4), (BX0 + T / 2 + .14, 3.65, 35.5), 'steel', group='kit', solid=False)
# Pitched roof: two slopes up to a ridge along x = 0, gables, trusses, skylights.
RIDGE = 10.0
pitch = math.atan2(RIDGE - H, BX1 + .6)
for s in (-1, 1):
    run = (BX1 + .6) / math.cos(pitch)
    for (za, zb) in ((-.6, 8), (11, 20), (23, 32), (35, 44), (47, 48.6)):
        obox('roof', (s * (BX1 + .6) / 2, (H + RIDGE) / 2 + .1, (za + zb) / 2), (run / 2, .06, (zb - za) / 2), rot_z(-s * pitch), 'roof', group='arch')
    for (za, zb) in ((8, 11), (20, 23), (32, 35), (44, 47)):
        # One pane is missing over the office (east slope, x 8..14): the way in from the roof.
        spans = ((0, 8), (14, BX1 + .6)) if (s == 1 and za == 8) else ((0, BX1 + .6),)
        for xa, xb in spans:
            xc = (xa + xb) / 2; yc = RIDGE - xc / (BX1 + .6) * (RIDGE - H) + .1
            obox('skylight', (s * xc, yc, (za + zb) / 2), ((xb - xa) / 2 / math.cos(pitch), .03, (zb - za) / 2), rot_z(-s * pitch), 'skylight')
# The roof as the ninja walks it: terraces following the pitch (movement works in boxes), with the open pane left out.
ROOF_STEPS = []
NT = 8
for s in (-1, 1):
    for i in range(NT):
        xa, xb = (BX1 + .6) * i / NT, (BX1 + .6) * (i + 1) / NT; top = RIDGE - (xa + xb) / 2 / (BX1 + .6) * (RIDGE - H) + .16
        x0, x1 = (xa, xb) if s == 1 else (-xb, -xa)
        for z0, z1 in (((-.6, 8), (11, 48.6)) if (s == 1 and x1 > 8 and x0 < 14) else ((-.6, 48.6),)): ROOF_STEPS.append([round(x0, 2), round(x1, 2), z0, z1, round(top, 3), round(top - .3, 3)])
        if s == 1 and x1 > 8 and x0 < 14:
            if x0 < 8: ROOF_STEPS.append([round(x0, 2), 8, 8, 11, round(top, 3), round(top - .3, 3)])
            if x1 > 14: ROOF_STEPS.append([14, round(x1, 2), 8, 11, round(top, 3), round(top - .3, 3)])
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
if 'locker-bank' not in MODLY:
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
if 'knocking-box' in MODLY:
    for mn, mx in (((2, 0, 19.6), (5.4, .25, 23.4)), ((2, .25, 19.6), (5.4, 1.9, 19.8)), ((2, .25, 23.2), (5.4, 1.9, 23.4)), ((5.2, .25, 19.6), (5.4, 1.9, 23.4))): solid_only(mn, mx)
else:
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
if 'chain-hoist' not in MODLY: box('hoist', (-12.3, RAIL_Y + .1, 5.6), (-11.7, RAIL_Y + .6, 6.4), 'yellow', group='kit', solid=False)
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
# The farm: six cattle pens east of the building, three either side of a wide lane. Each pen has its own gate onto
# the lane and its own lever on a post beside it. The race from the lane's west end runs into the indoor holding
# pen. Alleys between the pens and the passage along the building lead north to the yard: room for a herd to gather,
# turn and run.
PW, PD, LANE0, LANE1 = 16, 16, 23, 37
PEN_COLS = (34, 54, 74)
PENS, GATES = [{'id': 'hall', 'minX': PEN['minX'], 'maxX': PEN['maxX'], 'minZ': PEN['minZ'], 'maxZ': PEN['maxZ'], 'count': 8}], []
GATES.append({'id': 'hall', 'kind': 'hall', 'x': 6, 'z': 34.5, 'axis': 'z', 'half': 2.55, 'n': [-1, 0], 'lever': {'x': 5.2, 'z': 31.2}, 'strength': 30, 'planks': True})
# Each pen is its own small problem: how many cows, how strong the gate, and where the lever is.
#   pen1 lever by the gate (the first one you meet)      pen4 lever up on a feed platform: climb for it
#   pen2 lever round the back of the pen                  pen5 the strongest gate, its lever in a guard's booth, feeders across the run-up
#   pen3 a big pen, a stout gate                          pen6 a weak gate, lever behind the hay
VARIETY = {1: dict(count=4, strength=24), 2: dict(count=5, strength=30, lever='back'), 3: dict(count=6, strength=38),
           4: dict(count=5, strength=30, lever='platform'), 5: dict(count=6, strength=46, lever='booth'), 6: dict(count=4, strength=22, lever='hay')}
EXTRA_PATROLS = []
k = 0
for row, (z0, z1, gz, nz) in enumerate(((LANE0 - PD, LANE0, LANE0, 1), (LANE1, LANE1 + PD, LANE1, -1))):
    for x0 in PEN_COLS:
        k += 1; x1 = x0 + PW; cx = (x0 + x1) / 2; far = z0 if nz == 1 else z1
        rail_fence(x0, far, x1, far, name='pen-fence'); rail_fence(x0, z0, x0, z1, name='pen-fence'); rail_fence(x1, z0, x1, z1, name='pen-fence')
        rail_fence(x0, gz, cx - 2.5, gz, name='pen-fence'); rail_fence(cx + 2.5, gz, x1, gz, name='pen-fence')
        for gx in (cx - 2.5, cx + 2.5): box('gate-post', (gx - .12, 0, gz - .12), (gx + .12, 1.9, gz + .12), 'yellow', group='kit')
        box('trough', (x0 + 1.2, 0, far + (.5 if nz == 1 else -1.1)), (x0 + 4.2, .6, far + (1.1 if nz == 1 else -.5)), 'concrete')
        rbale((x1 - 2.6, .7, far + nz * 2.2), (x1 - 1.4, .7, far + nz * 2.2), .7)
        box('pen-straw', (x0 + .3, .02, z0 + .3), (x1 - .3, .05, z1 - .3), 'hay', solid=False)
        straw((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2 - .4, (z1 - z0) / 2 - .4, 260, int(x0 * 3 + z0), y0=.05)
        V = VARIETY[k]; lever = {'x': cx + 3.3, 'z': gz + nz * .7}
        if V.get('lever') == 'back': lever = {'x': cx, 'z': far - nz * 1.0}
        elif V.get('lever') == 'platform':   # a feed platform beside the gate, 2.2 m up, with crates to climb
            px, pz = cx + 4.2, gz + nz * 1.9; box('feed-platform', (px - 1.3, 0, pz - 1.3), (px + 1.3, 2.2, pz + 1.3), 'concrete'); box('feed-step', (px + 1.3, 0, pz - .7), (px + 2.5, 1.1, pz + .7), 'planks')
            lever = {'x': px, 'z': pz, 'y': 2.2}
        elif V.get('lever') == 'booth':      # a three-sided booth with a guard standing in it; feeders narrow the run-up
            px, pz = cx + 4.4, gz + nz * 1.6
            box('booth-back', (px + 1.1, 0, pz - 1.3), (px + 1.3, 2.3, pz + 1.3), 'cladding'); box('booth-side', (px - 1.1, 0, pz - nz * 1.3 - .1), (px + 1.3, 2.3, pz - nz * 1.3 + .1), 'cladding'); box('booth-roof', (px - 1.3, 2.3, pz - 1.5), (px + 1.5, 2.42, pz + 1.5), 'roof')
            lever = {'x': px + .4, 'z': pz}; EXTRA_PATROLS.append([[px - .6, pz + nz * .2]])
            for fx in (cx - 1.6, cx + 1.6): box('feeder', (fx - 1.1, 0, gz + nz * 7.2 - .5), (fx + 1.1, 1.1, gz + nz * 7.2 + .5), 'concrete')
        elif V.get('lever') == 'hay':
            lever = {'x': x1 + 1.6, 'z': gz - nz * 3.0}
            for i in range(3): rbale((x1 + 1.0 + i * .1, .7 + (i == 2) * 1.2, gz - nz * 1.2 + (i == 1) * nz * -1.5), (x1 + 2.3 + i * .1, .7 + (i == 2) * 1.2, gz - nz * 1.2 + (i == 1) * nz * -1.5), .7)
        PENS.append({'id': f'pen{k}', 'minX': x0 + 1.6, 'maxX': x1 - 1.6, 'minZ': z0 + 1.6, 'maxZ': z1 - 1.6, 'count': V['count']})
        GATES.append({'id': f'pen{k}', 'kind': 'pen', 'x': cx, 'z': gz, 'axis': 'x', 'half': 2.5, 'n': [0, nz], 'lever': lever, 'strength': V['strength']})
# A working farm: trodden mud at every gate and round the troughs, water in the troughs, a muddy track down the
# lane with puddles, a lean-to shelter in each pen (its roof is a walkable route over the pens), hay bales stacked
# where they give cover.
fr = random.Random(5)
for k, p in enumerate(PENS[1:], start=1):
    g = GATES[k]; nz = g['n'][1]
    for i in range(6):
        mx, mz = g['x'] + fr.uniform(-3.2, 3.2), g['z'] + nz * fr.uniform(-3, 3); r = fr.uniform(1.1, 2.3)
        cyl('mud', (mx, .052, mz), (mx, .068, mz), r, 'mud', 18, group='kit')
    x0, x1, z0, z1 = p['minX'] - 1.6, p['maxX'] + 1.6, p['minZ'] - 1.6, p['maxZ'] + 1.6; far = z0 if nz == 1 else z1
    tz0, tz1 = (far + .5, far + 1.1) if nz == 1 else (far - 1.1, far - .5)
    box('water', (x0 + 1.32, .5, tz0 + .1), (x0 + 4.08, .52, tz1 - .1), 'water', solid=False, group='kit')
    for i in range(3): mx, mz = x0 + 2.7 + fr.uniform(-1.5, 1.5), (tz0 + tz1) / 2 - nz * fr.uniform(1, 2.6); cyl('mud', (mx, .052, mz), (mx, .068, mz), fr.uniform(1, 1.8), 'mud', 16, group='kit')
    # The shelter: four posts and a roof along the far fence, on the side away from the trough.
    sx0, sx1 = x1 - 8.5, x1 - .6; sz0, sz1 = (far + .5, far + 4) if nz == 1 else (far - 4, far - .5)
    for px in (sx0, sx1):
        for pz in (sz0, sz1): box('shelter-post', (px - .09, 0, pz - .09), (px + .09, 2.7, pz + .09), 'planks', group='kit')
    box('shelter-roof', (sx0 - .3, 2.7, sz0 - .3), (sx1 + .3, 2.86, sz1 + .3), 'roof')
    box('shelter-straw', (sx0, .05, sz0), (sx1, .08, sz1), 'hay', solid=False, group='kit')
box('lane-track', (31, .021, 27.2), (98, .026, 32.8), 'tracks', solid=False)
for (x, z, r) in ((44, 29, 1.6), (58.5, 31.2, 1.1), (67, 28.6, 2.0), (79, 31, 1.3), (88, 29.4, 1.7), (36, 30.5, 1.2), (96, 12, 1.5), (34, 50, 1.4)):
    cyl('water', (x, .028, z), (x, .034, z), r, 'water', 20, group='kit')
for (x, z, n) in ((38.5, 2.5, 3), (73, 60.5, 2), (97.5, 45, 3), (49, 62, 2)):
    for i in range(n): bale(x - 1.1, i * .55, z - .5 + (i % 2) * .1, x + 1.1, i * .55 + .55, z + .5 + (i % 2) * .1, group='arch')
    straw(x, z, 2, 1.4, 70, int(x * 7 + z))
# Cover along the lane and round the farm: crate stacks to move between.
for (x, z) in ((51, 26.5), (71, 33.5), (91.5, 25), (94, 36), (31, 12), (93, 50)):
    box('crate', (x - .9, 0, z - .9), (x + .9, 1.7, z + .9), 'planks'); box('crate', (x + .9, 0, z - .6), (x + 2.1, 1.0, z + .6), 'planks')
# The main exit: a barred gate across the road, opened by the lever in the gatehouse or broken by a herd at a run.
GATES.append({'id': 'main', 'kind': 'main', 'x': 0, 'z': FZ0, 'axis': 'x', 'half': GATE[1], 'n': [0, -1], 'lever': {'x': -12.4, 'z': -56.4}, 'strength': 110})
if 'cattle-race-panel' in MODLY:   # the race: solid generated panels (collision here, the models placed below)
    for z in (29.6, 33): solid_only((BX1 + .2, 0, z - .1), (30, 1.6, z + .1), surface=False)
else: rail_fence(BX1 + .2, 29.6, 30, 29.6, 1.6); rail_fence(BX1 + .2, 33, 30, 33, 1.6)   # the race
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
trailer(62, -9)
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
    solid_only((x - 3, 0, 55), (x + 3, 15, 61), surface=True)   # the top is somewhere to stand
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
for (x, z) in ((52, 30), (72, 30), (62, 1)): PROPS.append(['street_lamp_01', x - .7, 0, z, 0, 1.6, None])
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
lamp((52, 5.8, 30), 0xffa64d, 240, 34); lamp((72, 5.8, 30), 0xffa64d, 240, 34); lamp((62, 5.8, 1), 0xffa64d, 200, 32)   # the farm lane and its north side
lamp((-37, 3.6, 49.5), 0xffa64d, 120, 20)                         # boiler yard
for (x, z) in [(-20, 8), (-6, 8), (-20, 26), (-6, 26), (2, 14)]: lamp((x, 5.6, z), 0xd8f0e6, 46, 24, .8, [1.9, .05, .12])
for (x, z) in [(-20, 42), (-11, 42)]: lamp((x, 3.9, z), 0xbfe6ff, 26, 14, .2, [1.6, .05, .12])
lamp((16, 3.0, 6), 0xfff0d8, 30, 14, 0, [1.2, .05, .3])           # office
lamp((16, 5.6, 36), 0xd8f0e6, 30, 22, .5, [1.9, .05, .12])        # pen

# Generated hero pieces, placed by the game: [name, x, y, z, yaw, scale, anchor] with the name 'modly:<file>'. The
# game anchors each by its bounding box: base centre, or top centre for hanging things (anchor 'top').
# SIZE is each piece's footprint and height in metres (w along x, d along z at yaw 0), for collision.
SIZE = {'hide-puller': (2.5, 1.6, 3.5), 'boning-table': (2.0, 1.5, 2.45), 'viscera-table': (1.2, 2.4, 1.07), 'bandsaw-meat': (1.2, 1.3, 1.9),
        'locker-bank': (2.0, 1.8, 1.9), 'safety-cabinet': (1.1, 1.2, 1.8), 'ice-machine': (.62, .51, 1.2), 'splitting-platform': (2.0, 2.3, 2.0),
        'pallet-cartons': (1.2, 1.2, .83), 'bleeding-trough': (1.1, 2.5, 1.2), 'blood-tank-small': (.92, .93, 1.2), 'apron-wash': (1.0, .5, 1.84),
        'mincer': (.31, .44, .6), 'inspection-stand': (.48, .54, 1.5)}
def modly(name, x, y, z, yaw=0.0, scale=1.0, anchor=None, solid=False):
    if name not in MODLY: return False
    PROPS.append(['modly:' + name, round(x, 3), round(y, 3), round(z, 3), round(yaw, 3), scale, anchor])
    if solid and name in SIZE:
        w, d, h = (v * scale for v in SIZE[name])
        if abs(math.sin(yaw)) > .7: w, d = d, w
        solid_only((x - w / 2, y, z - d / 2), (x + w / 2, y + h * .92, z + d / 2))
    return True
def loose_modly(name, x, z, yaw=0.0, scale=1.0, mass=20, y=0):
    if name in MODLY: LOOSE.append(['modly:' + name, x, z, yaw, scale, mass, None, y])
R = random.Random(5)
# ---- carcasses: sides on the bleed rail, rows in the chiller with quarters, pork and lamb on the last rail
for z in (12, 14.5, 17, 25, 27.5, 31): modly('beef-half-carcass', -12, RAIL_Y - .05, z, math.pi / 2 + R.uniform(-.06, .06), R.uniform(.95, 1.03), 'top')
for zz in (39, 42):
    for x in [-23.3 + i * 2.5 for i in range(7)]:
        if R.random() < .12: continue
        modly('beef-half-carcass', x + R.uniform(-.15, .15), 3.28, zz, R.uniform(-.08, .08) + (math.pi if R.random() < .5 else 0), R.uniform(.95, 1.04), 'top')
for i, x in enumerate([-23.6 + k * 1.45 for k in range(12)]):
    kind = ('beef-quarter', 'pork-half', 'lamb-carcass', 'beef-quarter')[i % 4]
    if not modly(kind, x, 3.28, 45, R.uniform(-.3, .3), R.uniform(.95, 1.05), 'top'): modly('beef-half-carcass', x, 3.28, 45, 0, 1, 'top')
for z in range(10, 35, 3): modly('rail-trolley-hook', -17.5, 3.42, z, math.pi / 2, 1.0, 'top')
modly('scales-hanging', -22, 3.28, 37.4, 0, 1.2, 'top'); modly('chain-hoist', -12, RAIL_Y - .02, 6.2, 0, 1.3, 'top')
# ---- the line: knocking box, bleeding troughs under the rail, hide puller, split saw, platform, tables, saws
modly('knocking-box', 3.7, 0, 21.5, 0, 1.12)
for z in (9.5, 13.2): modly('bleeding-trough', -12, .05, z, 0, 1.0, solid=True)
modly('blood-tank-small', -10, .05, 6.6, 0, 1.0, solid=True)
HIDE = modly('hide-puller', -19, .05, 16, math.pi / 2, 1.0, solid=True)
SAW = modly('splitting-saw', -15.5, 3.3, 27.5, .4, 1.0, 'top')
modly('splitting-platform', -21.5, .05, 23, 0, 1.0, solid=True)
modly('boning-table', -7, .05, 32.5, 0, 1.0, solid=True); modly('boning-table', -3.6, .05, 32.5, 0, 1.0, solid=True)
modly('viscera-table', -21.5, .05, 11.5, 0, 1.0, solid=True); modly('viscera-table', -7.5, .05, 17.5, math.pi / 2, 1.0, solid=True)
modly('inspection-stand', -9.6, .05, 19.2, .4, 1.0, solid=True)
modly('bandsaw-meat', -.6, .05, 33.6, math.pi, 1.0, solid=True); modly('mincer', 1.6, .05, 34, 0, 1.9, solid=True)
for (n, x, y, z, yaw) in (('cleaver', -7.3, .96, 32.4, .5), ('butcher-knife-set', -6.5, .96, 32.7, 0), ('cutting-board-stack', -3.9, .96, 32.4, .2), ('bone-saw-hand', -3.2, .96, 32.6, 1.2),
                          ('brisket-saw', -21.5, 1.1, 11.2, .7), ('stunner-cartridges', -7.6, 1.1, 17.3, 0), ('captive-bolt-stunner', 3.2, 2.1, 19.75, 0)): modly(n, x, y, z, yaw)
# ---- hygiene and services along the west wall; drains in the floor
for z in (10.2, 19.2, 28.2): modly('knife-steriliser', BX0 + T / 2 + .14, 1.0, z, math.pi / 2)
for z in (11.3, 29.3): modly('hand-wash-basin', BX0 + T / 2 + .3, .85, z, math.pi / 2)
modly('apron-wash', BX0 + T / 2 + .3, .05, 23.2, math.pi / 2, 1.0, solid=True); modly('pressure-washer', -24.3, .05, 5, .6)
modly('safety-cabinet', BX0 + T / 2 + .65, .05, 32.2, math.pi / 2, 1.0, solid=True); modly('ice-machine', -24.9, .05, 34.6, math.pi / 2, 1.0, solid=True)
modly('squeegee', -25.3, .05, 21, 0); modly('meat-hooks-rack', -8, 1.9, BZ0 + T / 2 + .1, 0); modly('meat-hooks-rack', -15, 1.9, BZ0 + T / 2 + .1, 0)
modly('emergency-stop', -12.9, .9, 6.0, 0, 1.6); modly('emergency-stop', 1.6, .9, 19.3, 0, 1.6)
for (x, z) in ((-6, 12), (-20, 20), (0, 28), (-18, 31)): modly('floor-drain', x, .046, z, 0)
modly('drain-channel', -12, .046, 4.6, 0); modly('floor-drain', -15, .032, 42, 0); modly('floor-drain', -10, .032, 40, 0)
modly('cold-room-thermometer', -10.3, 1.6, CZ0 - .13, 0, 1.4)
modly('boot-wash', 2.6, .05, 1.4, 0, 1.0); modly('boot-wash', 7.2, .05, 13.2, 0, 1.0)
# ---- doors and curtains; lockers and aprons in the corridor; lamps outside
modly('chiller-door', CX1 + .15, 0, 41, math.pi / 2, 1.0); modly('chiller-door', -19, 0, BZ1 - T / 2 - .2, 0, 1.0)
modly('strip-curtain', BX1, 0, 31.3, math.pi / 2, .9); modly('swing-door-plastic', BX1, 0, 15.9, math.pi / 2, 1.05); modly('swing-door-plastic', OX0, 0, 9.6, math.pi / 2, .82)
LOCKERS = modly('locker-bank', 15.2, .05, 13.2, 0, 1.0, solid=True); modly('locker-bank', 17.6, .05, 13.2, 0, 1.0, solid=True); modly('safety-cabinet', 24.9, .05, 20, -math.pi / 2, 1.0, solid=True)
for x in (10, 11.2, 12.4): modly('apron-chainmail', x, 1.9, OZ1 + .14, 0, 1.0, 'top')
for (x, y, z, yaw) in ((-10, 3.4, BZ0 - T / 2 - .12, math.pi), (10, 3.4, BZ0 - T / 2 - .12, math.pi), (BX1 + T / 2 + .12, 3.2, 22, math.pi / 2), (BX0 - T / 2 - .12, 3.2, 30, -math.pi / 2), (0, 3.2, BZ1 + T / 2 + .12, 0)): modly('caged-wall-lamp', x, y, z, yaw, 1.3)
# ---- race, lairage gates, the pickup wreck; pallets of boxed beef in the chiller and on the dock
for z in (29.6, 33):
    for x in (27.45, 29.35): modly('cattle-race-panel', x, 0, z, math.pi / 2, 1.0)
modly('old-pickup', -40, 0, -46, .35, .86)
for (x, y, z) in ((-8.3, .034, 46.4), (-8.3, .034, 44.9), (-30, 1.3, 9), (-31.5, 1.3, 11), (-33, 1.3, 23)): modly('pallet-cartons', x, y, z, R.uniform(-.1, .1), 1.0, solid=True)
# ---- loose things you can knock about: trolleys, bins, tubs, buckets, the pallet jack, cartons
for (n, x, z, yaw, m) in (('meat-trolley', -14, 33.2, .3, 35), ('meat-trolley', -9.4, 34.4, 1.2, 35), ('meat-trolley', -10.5, 38.2, 0, 35), ('offal-bin', -24.2, 15, 0, 25), ('offal-bin', -24.2, 16.1, .2, 25),
                          ('offal-bin', 3.6, 30, 1, 25), ('offal-bin', 11.5, 50, 0, 25), ('meat-tubs-stack', -4.6, 28.6, 0, 30), ('meat-tub', -22.8, 30, 0, 12), ('meat-tub', -2, 30.4, .5, 12),
                          ('bucket-steel', -13.6, 10.4, 0, 6), ('bucket-steel', -10.8, 24, 0, 6), ('bucket-steel', 3.2, 26.6, 0, 6), ('bucket-steel', -20, 29, 0, 6), ('pallet-jack', -10.6, 45.2, .4, 60),
                          ('carton-boxed-beef', -9.2, 35.2, .3, 14), ('shackle-chain', 1, 24.6, .8, 9), ('shackle-chain', -13.2, 7.2, 2, 9)): loose_modly(n, x, z, yaw, 1.0, m)
for (x, z) in ((-29, 14), (-29.6, 14.4), (-31, 20)): loose_modly('carton-boxed-beef', x, z, R.uniform(0, 3), 1.0, 14, 1.3)
loose_modly('pallet-jack', -32, 18, 1.2, 1.0, 60, 1.3)

# ================================================================================================ the parkour layer
# The site is built to be crossed off the ground. Every area has a high route and a low one: the lane gantry from the
# staff gate over the pens to the hall roof, beams over the kill floor to drop on guards from, a container yard to
# run across, an awning over the dock, silos to climb and leap from into hay, a hay barn with a loft and a walkable
# roof, a water tower to look out from, crawl holes into the hall too low for anyone standing, and tall grass along
# the fences to move through unseen.
EXTRA_GRIPS, EXTRA_HAY, COVER, COW_WALLS = [], [], [], []
def ladder(x0, z0, x1, z1, top, rungs_along='x'):
    # A ladder is a climbable block (the free-climb takes it) with rails and rungs drawn on it.
    solid_only((x0, 0, z0), (x1, top, z1), surface=True)
    for i in range(int(top / .3)):
        box('ladder-rung', (x0, .25 + i * .3, z0), (x1, .29 + i * .3, z1), 'steel', group='kit', solid=False)
    for (a, b) in (((x0, z0), (x0 + .05, z0 + .05)), ((x1 - .05, z1 - .05), (x1, z1))): box('ladder-rail', (a[0], 0, a[1]), (b[0], top + .9, b[1]), 'steel', group='kit', solid=False)
def deck(x0, z0, x1, z1, y, key='grate', rail=True):
    box('deck', (x0, y - .12, z0), (x1, y, z1), key)
    if rail:   # a hand rail you can vault, not a wall
        for (a, b, c, d) in ((x0, z0, x1, z0), (x0, z1, x1, z1)) if (x1 - x0) > (z1 - z0) else ((x0, z0, x0, z1), (x1, z0, x1, z1)):
            cyl('deck-rail', (a, y + 1.0, b), (c, y + 1.0, d), .03, 'galv', 6)
def posts(points, y, key='galv', r=.1):
    for (x, z) in points: box('post', (x - r, 0, z - r), (x + r, y, z + r), key, group='kit')
# -- the lane gantry: a feed conveyor walkway at 4.4 m from the staff gate to the hall, frames over the alleys
GY = 4.4
for fx in (31.4, 52, 72, 92, 97.4):
    posts([(fx, 23.7), (fx, 36.3)], GY + .3)
    box('gantry-frame', (fx - .12, GY - .32, 23.6), (fx + .12, GY - .12, 36.4), 'galv', group='kit', solid=False)
deck(31, 29.3, 97.8, 30.7, GY)
for x in range(32, 98, 4): cyl('gantry-truss', (x, GY - .12, 29.3), (x + 2, GY - 1.1, 29.3), .035, 'galv', 6); cyl('gantry-truss', (x + 2, GY - 1.1, 30.7), (x + 4, GY - .12, 30.7), .035, 'galv', 6)
box('conveyor', (31, GY + .05, 29.45), (97.8, GY + .35, 29.85), 'blackrubber', group='kit', solid=False)
ladder(97.6, 30.75, 98.2, 31.35, GY)                                    # up from the staff gate
for (x, z) in ((52, 25.2), (72, 34.8), (92, 25.2)): EXTRA_GRIPS.append({'type': 'rope', 'x': x, 'z': z, 'top': GY - .3, 'len': 3.6})
for x in (41, 62.5, 83): EXTRA_GRIPS.append({'type': 'bar', 'a': [x, GY - .55, 24.2], 'b': [x, GY - .55, 28.8]}); EXTRA_GRIPS.append({'type': 'bar', 'a': [x, GY - .55, 31.2], 'b': [x, GY - .55, 35.8]})
# West end: scaffolding against the hall up to the eave.
posts([(27.1, 24.2), (30.5, 24.2), (27.1, 28.4), (30.5, 28.4)], 6.7, 'galv', .05)
deck(27, 24.1, 30.6, 28.5, GY, 'planks', rail=False); deck(27, 24.1, 30.6, 28.5, 6.6, 'planks', rail=False)
ladder(30.0, 24.2, 30.6, 24.8, 6.6)
# -- the container yard (north-east of the road): stacks of one, two and three, gaps to jump, lanes to hide in
CONT = []
def container(x0, z0, along, level, key):
    L, W, Hc = 6.06, 2.44, 2.59
    x1, z1 = (x0 + L, z0 + W) if along == 'x' else (x0 + W, z0 + L)
    box('container', (x0, level * Hc, z0), (x1, level * Hc + Hc, z1), key)
    for i in range(1, 6):   # door bars and corner castings for scale
        t = i / 6
        if along == 'x': box('container-rib', (x0 + (x1 - x0) * t - .03, level * Hc + .1, z0 - .03), (x0 + (x1 - x0) * t + .03, level * Hc + Hc - .1, z0), 'steel', group='kit', solid=False)
        else: box('container-rib', (x0 - .03, level * Hc + .1, z0 + (z1 - z0) * t - .03), (x0, level * Hc + Hc - .1, z0 + (z1 - z0) * t + .03), 'steel', group='kit', solid=False)
    CONT.append((x0, z0, x1, z1, level))
for (x0, z0, along, n, keys) in (
        (56, -52, 'x', 2, ('container_red', 'container_blue')), (63, -52, 'x', 1, ('container_rust',)), (70, -52, 'x', 3, ('container_green', 'container_red', 'container_blue')),
        (58, -47, 'x', 1, ('container_blue',)), (65.6, -47, 'x', 2, ('container_rust', 'container_green')), (73.2, -47, 'x', 1, ('container_red',)),
        (56, -40, 'z', 2, ('container_green', 'container_rust')), (60.8, -38, 'z', 1, ('container_red',)), (76.5, -42, 'z', 2, ('container_blue', 'container_green')), (67, -36, 'x', 1, ('container_rust',))):
    for lv in range(n): container(x0, z0, along, lv, keys[lv])
deck(76.06, -51.2, 79.2, -50.4, 7.77, 'planks', rail=False)            # a plank out from the top of the three-high
deck(66.6, -49.56, 67.4, -47, 5.18, 'planks', rail=False)              # and one across between rows
ladder(55.4, -50.6, 56, -50, 5.18); ladder(76.5, -42.6, 77.1, -42, 5.18)
EXTRA_GRIPS.append({'type': 'bar', 'a': [69.3, 4.0, -51.5], 'b': [69.3, 4.0, -49.9]})
# -- the dock awning: a roof over the loading bay to run along, a pipe up its end post
posts([(-35.8, 6.2), (-35.8, 16), (-35.8, 25.8)], 4.2, 'galv', .08)
box('dock-awning', (-36.4, 4.2, 5.6), (BX0 - .2, 4.38, 26.4), 'roof')
EXTRA_GRIPS.append({'type': 'pipe', 'x': -36.85, 'z': 25.8, 'y0': .2, 'y1': 4.38 + 1.35, 'n': [-1, 0]})
# -- the silos: a caged ladder up the west one, a walkway between their tops, and hay below to leap into
EXTRA_GRIPS.append({'type': 'pipe', 'x': 34.75, 'z': 58, 'y0': .2, 'y1': 15 + 1.35, 'n': [-1, 0]})
for y in range(3, 15, 1): cyl('silo-cage', (34.5, y, 57.4), (34.5, y, 58.6), .025, 'galv', 6)
deck(41, 57.3, 42.5, 58.7, 15.0, 'grate', rail=True)
EXTRA_HAY.append([51.5, 58, 2.1])
# -- the hay barn (north of the south pens): open front, a loft at the back, a roof you can walk
BB0, BB1, BZa, BZb = 58, 84, 58.5, 70
posts([(x, z) for x in (58, 64.5, 71, 77.5, 84) for z in (58.5, 70)], 7.6, 'planks', .14)
wall('x', BZb + .15, BB0, BB1, 7.4, .2, 'cladding', name='barn'); wall('z', BB0 - .15, BZa + 4, BZb, 6, .2, 'cladding', name='barn'); wall('z', BB1 + .15, BZa + 4, BZb, 6, .2, 'cladding', name='barn')
deck(BB0, 64, BB1, BZb, 3.6, 'planks', rail=True)
for i in range(6):   # bales stacked as steps to the loft
    for k in range(i + 1): bale(79 - i * 1.1, .6 * k, 60.5, 80.2 - i * 1.1, .6 * (k + 1), 61.6, solid=False, group='arch')
    solid_only((79 - i * 1.1, 0, 60.5), (80.2 - i * 1.1, .6 * (i + 1), 61.6))
for (x, z) in ((62, 66), (66, 68), (74, 67), (62, 66.05), (79, 68.4)): bale(x - 1.1, 3.6, z - .5, x + 1.1, 4.2, z + .5)
bale(60.9, 4.2, 65.55, 63.1, 4.8, 66.55); straw((BB0 + BB1) / 2, 67, 12, 2.6, 300, 41, y0=3.6); straw((BB0 + BB1) / 2, 63, 12, 4, 360, 42, y0=.06)
ladder(BB0 + .3, 63.4, BB0 + .9, 64.0, 3.6)
# Roof: a monopitch from 7.6 at the back to 6.4 at the front, walked as terraces.
pitch_b = math.atan2(1.2, BZb - BZa)
obox('barn-roof', ((BB0 + BB1) / 2, 7.0 + .1, (BZa + BZb) / 2), ((BB1 - BB0) / 2 + .5, .06, (BZb - BZa) / 2 / math.cos(pitch_b) + .4), rot_x(pitch_b), 'roof', group='arch')
for i in range(5):
    za, zb = BZa - .4 + (BZb - BZa + .8) * i / 5, BZa - .4 + (BZb - BZa + .8) * (i + 1) / 5; top = 6.4 + 1.2 * (i + .5) / 5 + .16
    ROOF_STEPS.append([BB0 - .5, BB1 + .5, round(za, 2), round(zb, 2), round(top, 3), round(top - .3, 3)])
CEILINGS.append([BB0, BB1, BZa, BZb, 6.2]); INTERIORS.append([BB0, BB1, BZa, BZb])
EXTRA_GRIPS.append({'type': 'pipe', 'x': BB1 + .45, 'z': 58.5, 'y0': .2, 'y1': 6.6 + 1.35, 'n': [1, 0]})
EXTRA_GRIPS.append({'type': 'rope', 'x': 70, 'z': 61.5, 'top': 6.2, 'len': 4.8})
EXTRA_HAY += [[67, 61.5, 1.6], [61.5, 66.5, 1.5]]
# -- the water tower: a lookout over the farm and the yard
WX, WZ = 93, 64
posts([(WX - 2, WZ - 2), (WX + 2, WZ - 2), (WX - 2, WZ + 2), (WX + 2, WZ + 2)], 8, 'rust', .12)
for y in (2.6, 5.3): cyl('tower-brace', (WX - 2, y, WZ - 2), (WX + 2, y + 2.5, WZ - 2), .04, 'rust', 6); cyl('tower-brace', (WX + 2, y, WZ + 2), (WX - 2, y + 2.5, WZ + 2), .04, 'rust', 6)
deck(WX - 2.8, WZ - 2.8, WX + 2.8, WZ + 2.8, 8.0, 'grate', rail=True)
cyl('tower-tank', (WX, 8.0, WZ), (WX, 11.4, WZ), 2.1, 'galv', 20); solid_only((WX - 1.5, 8, WZ - 1.5), (WX + 1.5, 11.4, WZ + 1.5), surface=True)
EXTRA_GRIPS.append({'type': 'pipe', 'x': WX - 3.05, 'z': WZ, 'y0': .2, 'y1': 8 + 1.35, 'n': [-1, 0]})
EXTRA_HAY.append([88.5, 60, 1.8])
# -- inside the hall: walkable beams on the trusses over the kill floor (headroom only towards the ridge), a beam
# along the ridge joining them, and a pipe up from the catwalk; from up there you drop onto whoever walks below
for z in range(3, 48, 6): box('truss-beam', (-13.5, 6.86, z - .14), (13.5, 7.0, z + .14), 'steel', group='kit')
box('ridge-beam', (-.14, 6.86, 2.6), (.14, 7.0, 45.4), 'steel', group='kit')
EXTRA_GRIPS.append({'type': 'pipe', 'x': -12.0, 'z': 2.85, 'y0': 3.25, 'y1': 7.0 + 1.3, 'n': [0, -1]})
EXTRA_GRIPS.append({'type': 'pipe', 'x': 6.2, 'z': 9.0, 'y0': 3.3, 'y1': 7.0 + 1.3, 'n': [1, 0]})   # from the office roof
# -- crawl holes: a short duct round each; a cow cannot follow (a wall for the herd only)
for (x0, x1, z0, z1) in ((BX1 - .3, BX1 + .9, 20, 21.3), (BX0 - .9, BX0 + .3, 32.5, 33.8)):
    COW_WALLS.append([x0, x1, z0, z1])
    box('duct', (x0, 1.3, z0 - .1), (x1, 1.42, z1 + .1), 'galv', group='kit', solid=False)
    box('duct', (x0, 0, z0 - .12), (x1, 1.42, z0 - .02), 'galv', group='kit', solid=False); box('duct', (x0, 0, z1 + .02), (x1, 1.42, z1 + .12), 'galv', group='kit', solid=False)
# -- rooftop plant on the hall: units to hide behind up there (searchlights sweep the roof)
for (x, z) in ((-8, 16), (8, 38), (-15, 40), (16, 22)):
    ry = RIDGE - abs(x) / (BX1 + .6) * (RIDGE - H) + .16
    box('roof-unit', (x - 1.1, ry - .3, z - 1.4), (x + 1.1, ry + 1.4, z + 1.4), 'galv'); box('roof-fan', (x - .7, ry + 1.4, z - .7), (x + .7, ry + 1.55, z + .7), 'grate', group='kit', solid=False)
# -- tall grass along the fences: crouched in it, nobody sees you
COVER += [[96.6, 99.6, 38, 71.5], [30, 99.6, -61.6, -57.4], [-55.6, -51, -60, 70], [-46, 26, 67.5, 71.6], [91, 99.6, 3, 21]]
for (x0, x1, z0, z1) in COVER:
    n = int((x1 - x0) * (z1 - z0) * .55); rr = random.Random(int(x0 * 7 + z0))
    for i in range(n):
        x, z = rr.uniform(x0, x1), rr.uniform(z0, z1)
        SCATTER.setdefault('grass_medium_01' if i % 2 else 'grass_medium_02', []).append([round(x, 2), 0, round(z, 2), round(rr.uniform(0, math.tau), 2), round(rr.uniform(2.2, 2.9), 2)])

# ================================================================================================== the detail pass
# Real things on every structure: container doors, lock rods and corner castings; scaffold ledgers, braces and toe
# boards; conveyor rollers; barn trusses, purlins, sliding doors and straw; tank bands; gutters on the hall; a steel
# fire escape up the hall's north gable to the roof; an overhead crane over the container yard you can walk along;
# wall lights, cameras, boxes and hoses; and the clutter of a working yard and farm (Poly Haven, CC0).
LATER_DECALS = []   # grime decals: drawn once decal() exists (the gore pass below)
for (x0, z0, x1, z1, lv) in CONT:
    y0, y1 = lv * 2.59, lv * 2.59 + 2.59; alongx = (x1 - x0) > (z1 - z0)
    for (cx, cz) in ((x0, z0), (x1, z0), (x0, z1), (x1, z1)):
        for cy in (y0, y1 - .16): box('casting', (cx - .09, cy, cz - .09), (cx + .09, cy + .16, cz + .09), 'rust', group='kit', solid=False)
    if alongx:   # doors on the +x end: two leaves, four lock rods, cam handles
        for zc in ((z0 + z1) / 2 - .6, (z0 + z1) / 2 + .6):
            for dz in (-.32, .32): cyl('lock-rod', (x1 + .05, y0 + .1, zc + dz), (x1 + .05, y1 - .1, zc + dz), .018, 'galv', 6); box('cam', (x1 + .03, y0 + 1.1, zc + dz - .02), (x1 + .1, y0 + 1.16, zc + dz + .14), 'galv', group='kit', solid=False)
        box('door-seam', (x1 + .01, y0 + .05, (z0 + z1) / 2 - .015), (x1 + .04, y1 - .05, (z0 + z1) / 2 + .015), 'blackrubber', group='kit', solid=False)
    else:
        for xc in ((x0 + x1) / 2 - .6, (x0 + x1) / 2 + .6):
            for dx in (-.32, .32): cyl('lock-rod', (xc + dx, y0 + .1, z1 + .05), (xc + dx, y1 - .1, z1 + .05), .018, 'galv', 6)
    if lv == 0:
        if alongx: LATER_DECALS.append(lambda: decal('grime_rust', (x0 + x1) / 2, .02, z0 - .02, x1 - x0, 1.3, face=('z', '-')))
        else: LATER_DECALS.append(lambda: decal('grime_rust', x0 - .02, .02, (z0 + z1) / 2, z1 - z0, 1.3, face=('x', '-')))
# Scaffolding up the hall's east wall: ledgers, cross braces and toe boards.
for y in (2.2, GY, 6.6):
    for (a, b) in (((27.1, 24.2), (30.5, 24.2)), ((27.1, 28.4), (30.5, 28.4)), ((27.1, 24.2), (27.1, 28.4)), ((30.5, 24.2), (30.5, 28.4))):
        cyl('ledger', (a[0], y + .9, a[1]), (b[0], y + .9, b[1]), .024, 'galv', 6)
for (a, b, c) in (((27.1, 24.2), (30.5, 24.2), 0), ((27.1, 28.4), (30.5, 28.4), 1)):
    cyl('brace', (a[0], .1, a[1]), (b[0], GY, b[1]), .022, 'galv', 6); cyl('brace', (b[0], GY, b[1]), (a[0], 6.5, a[1]), .022, 'galv', 6)
for y in (GY, 6.6): box('toe-board', (27, y, 28.4), (30.6, y + .15, 28.45), 'planks', group='kit', solid=False)
# The conveyor: rollers along its length, a motor at the east end.
for x in [31.6 + i * 1.2 for i in range(55)]: cyl('roller', (x, GY + .3, 29.45), (x, GY + .3, 29.85), .045, 'galv', 8, caps=False)
box('conveyor-motor', (96.4, GY, 29.3), (97.6, GY + .7, 29.9), 'pipe_green'); cyl('motor-drum', (96.2, GY + .35, 29.4), (96.2, GY + .35, 29.8), .2, 'steel', 12)
lamp((52, GY - .5, 30), 0xffd8a8, 70, 16, .15, [.4, .1, .2]); lamp((82, GY - .5, 30), 0xffd8a8, 70, 16, 0, [.4, .1, .2])
# The barn: timber trusses on every post line, purlins, sliding doors on their track, straw on the floor.
for x in (58, 64.5, 71, 77.5, 84):
    cyl('barn-rafter', (x, 6.35, BZa - .4), (x, 7.55, BZb + .4), .09, 'planks', 6)
    cyl('barn-tie', (x, 6.0, BZa), (x, 6.0, BZb), .08, 'planks', 6); cyl('barn-strut', (x, 6.0, (BZa + BZb) / 2), (x, 6.95, (BZa + BZb) / 2), .06, 'planks', 6)
for z in (BZa + .5, 61.5, 64.5, 67.5, BZb - .3): cyl('barn-purlin', (BB0 - .4, 6.4 + 1.2 * (z - BZa) / (BZb - BZa) + .02, z), (BB1 + .4, 6.4 + 1.2 * (z - BZa) / (BZb - BZa) + .02, z), .06, 'planks', 6)
cyl('door-track', (BB0 - .3, 6.1, BZa - .25), (BB1 + .3, 6.1, BZa - .25), .04, 'rust', 6)
for (dx0, dx1) in ((BB0 - .1, BB0 + 3.4), (BB1 - 3.4, BB1 + .1)):
    box('barn-door', (dx0, .05, BZa - .4), (dx1, 6.0, BZa - .28), 'planks')
    for y in (1.2, 3.0, 4.8): box('door-brace', (dx0, y, BZa - .45), (dx1, y + .14, BZa - .4), 'planks', group='kit', solid=False)
box('barn-straw', (BB0 + .2, .03, BZa + .1), (BB1 - .2, .06, BZb - .1), 'hay', solid=False)
LATER_DECALS.append(lambda: decal('grime_base', (BB0 + BB1) / 2, .02, BZb + .03, BB1 - BB0, 1.1, face=('z', '-')))
lamp((64.5, 5.7, 62), 0xffc890, 80, 16, .2, [.28, .08, .28]); lamp((77.5, 5.7, 62), 0xffc890, 80, 16, 0, [.28, .08, .28])
# The water tower: bands round the tank, a cone roof, the outlet down to a valve.
for y in (8.5, 9.6, 10.7): cyl('tank-band', (WX, y, WZ), (WX, y + .07, WZ), 2.14, 'rust', 20, caps=False)
cyl('tank-roof', (WX, 11.4, WZ), (WX, 12.2, WZ), 2.2, 'rust', 20, r2=.25)
cyl('tank-outlet', (WX + 1.2, 0, WZ + 1.2), (WX + 1.2, 8.05, WZ + 1.2), .12, 'rust', 10); cyl('valve', (WX + 1.2, .9, WZ + 1.05), (WX + 1.2, .9, WZ + 1.35), .2, 'red', 10)
lamp((WX, 8.9, WZ - 2.7), 0xfff0d0, 90, 22, 0, [.25, .1, .2])
# Gutters along the hall's eaves.
for sx in (-1, 1): box('gutter', (sx * (BX1 + .6) - .1, H - .18, -.6), (sx * (BX1 + .6) + .1, H, 48.6), 'galv', group='kit', solid=False)
# A steel fire escape up the north gable: a flight to a landing at 3.5 m, a flight back up to a landing at 6.9 m
# under the roof edge, rails all the way.
def flight(xa, xb, ya, yb, za, zb):
    n = int(round((yb - ya) / .25)); dx = (xb - xa) / n
    for i in range(n):
        x0, x1 = sorted((xa + dx * i, xa + dx * (i + 1))); y = ya + (yb - ya) * (i + 1) / n
        box('fe-step', (x0, y - .05, za), (x1, y, zb), 'grate')
    for z in (za, zb): cyl('fe-rail', (xa, ya + 1.0, z), (xb, yb + 1.0, z), .025, 'steel', 6)
flight(22.4, 15.4, 0, 3.5, -1.4, -.35); box('fe-landing', (13.8, 3.38, -2.6), (15.4, 3.5, -.35), 'grate')
flight(15.4, 22.4, 3.5, 6.9, -2.55, -1.5); box('fe-landing', (22.4, 6.78, -2.6), (24.2, 6.9, -.35), 'grate')
posts([(13.9, -2.5), (13.9, -.45), (24.1, -2.5), (24.1, -.45)], 6.9, 'steel', .05)
# The overhead crane over the container yard: columns, runway beams, the crane on top (walk its bridge), a ladder up.
for (cx, cz) in ((63.4, -47.4), (63.4, -42.6), (76.6, -47.4), (76.6, -42.6)): box('crane-column', (cx - .15, 0, cz - .15), (cx + .15, 8.2, cz + .15), 'yellow', group='kit')
for cx in (63.4, 76.6): box('crane-runway', (cx - .2, 8.0, -47.6), (cx + .2, 8.25, -42.4), 'yellow', group='kit', solid=False)
PROPS.append(['overhead_crane', 70, 8.2, -45, 0, 1.0, None])
solid_only((63.75, 9.1, -45.4), (76.25, 9.42, -44.6), surface=True)
ladder(76.75, -48.05, 77.35, -47.45, 9.42)
EXTRA_GRIPS.append({'type': 'rope', 'x': 70.6, 'z': -45, 'top': 8.6, 'len': 4.2})
lamp((63.4, 8.6, -45), 0xffe6c0, 120, 26, 0, [.4, .12, .25]); lamp((76.6, 8.6, -45), 0xffe6c0, 120, 26, 0, [.4, .12, .25])
# Wall plant: security lights over the doors, cameras on the corners, electrical boxes, hoses.
for (x, y, z, yaw) in ((0, 5.5, -.3, math.pi), (BX1 + .3, 2.9, 15.9, math.pi / 2), (BX1 + .3, 3.1, 31.3, math.pi / 2), (-9.3, 2.5, -56.2, math.pi / 2), (64.5, 5.4, BZa - .2, math.pi), (77.5, 5.4, BZa - .2, math.pi), (BX0 - .3, 4.9, 16, -math.pi / 2)):
    PROPS.append(['security_light', x, y, z, yaw, 1.4, None])
for (x, y, z, yaw) in ((BX1 - .2, 6.4, -.35, 2.4), (BX0 + .2, 6.4, -.35, -2.4), (BX1 - .2, 6.4, BZ1 + .35, .8), (BX0 + .2, 6.4, BZ1 + .35, -.8), (-9.3, 2.8, -59.3, 2.4), (97.4, 4.9, 23.7, 2.2), (BB1, 5.6, BZa, 2.6)):
    PROPS.append(['security_camera_02', x, y, z, yaw, 1.6, None])
for (x, y, z, yaw) in ((BX1 + .2, 1.3, 12, math.pi / 2), (-15.2, 1.2, -56, -math.pi / 2), (71, 1.3, BZb - .1, math.pi), (BX0 - .2, 1.4, 38, -math.pi / 2)):
    PROPS.append(['power_box_01', x, y, z, yaw, 1.2, None])
for (x, z, yaw) in ((BX1 + .35, 18.5, math.pi / 2), (-8.7, -55, math.pi / 2), (96.8, 26, -math.pi / 2)): PROPS.append(['utility_box_02', x, 0, z, yaw, 1.0, None])
for (x, z, yaw) in ((BB0 - .25, 66, -math.pi / 2), (6, BZ1 + .25, 0), (BX1 + .25, 36, math.pi / 2)): PROPS.append(['garden_hose_wall_mounted_01', x, 1.1, z, yaw, 1.3, None])
# Clutter: the barn, the container yard, the dock, the pens, the gatehouse.
R2 = random.Random(19)
CLUTTER = [
    ('wooden_barrels_01', 61.5, 0, 67.5, .3, 1.0), ('worn_metal_rack', 82.6, 0, 69.3, math.pi, 1.0), ('worn_metal_rack', 81.6, 0, 69.3, math.pi, 1.0),
    ('metal_tool_chest', 80.2, 0, 66.8, 2.8, 1.0), ('rubber_boots', 59.6, 0, 59.2, .2, 1.0), ('watering_can_metal_01', 60.6, 0, 59.4, 1.1, 1.0),
    ('hand_truck', 63, 0, 59.6, .4, 1.0), ('wooden_ladder_02', 83.2, 0, 62.5, -math.pi / 2, 1.2), ('rusted_spade_01', 58.5, 0, 62, 0, 1.0),
    ('plastic_broom', 58.6, 0, 62.9, .3, 1.0), ('sledgehammer_01', 83.5, 0, 60.2, 1.2, 1.0),
    ('cement_bag', 66, 0, 68.9, .1, 1.3), ('cement_bag', 66.9, 0, 68.9, -.1, 1.3), ('cement_bag', 66.45, .28, 68.9, .05, 1.3), ('cement_bag', 68.4, 0, 69.0, 1.5, 1.3),
    ('plastic_crate_01', 74, 0, 69.0, 0, 1.6), ('plastic_crate_01', 74, .42, 69.0, .1, 1.6), ('plastic_crate_01', 74.6, 0, 69.0, -.1, 1.6),
    ('industrial_storage_cart', 66, 0, -40, .4, 1.0), ('hand_truck', 64.2, 0, -32.6, 2.1, 1.0), ('old_military_crate', 60.2, 0, -42.8, .2, 1.0),
    ('wooden_crate_01', 72.5, 0, -38, 1.1, 1.3), ('wooden_crate_01', 72.5, .46, -38, 1.0, 1.3), ('rusted_wheel_rim_01', 79.6, 0, -46.2, 0, 1.0),
    ('small_lpg_tank', 58.6, 0, -30.6, 0, 1.2), ('small_lpg_tank', 59.2, 0, -30.4, .5, 1.2), ('plastic_jerrycan', 61, 0, -30.2, .7, 1.3),
    ('metal_tool_chest', 68.6, 0, -41.6, -.4, 1.0), ('industrial_pastic_container', 81, 0, -33, 0, 1.6),
    ('industrial_storage_cart', -31, 1.3, 9, 1.6, 1.0), ('plastic_crate_01', -33.5, 1.3, 23.6, 0, 1.6), ('plastic_crate_01', -33.5, 1.72, 23.6, .2, 1.6), ('hand_truck', -28.4, 1.3, 24.4, -1, 1.0),
    ('plastic_broom', -15.6, 0, -54.3, 0, 1.0), ('plastic_jerrycan', -9, 0, -58.6, 0, 1.3),
    ('wooden_ladder_02', 96.3, 0, 36.5, math.pi / 2, 1.2), ('rubber_boots', 98.6, 0, 27.8, 2, 1.0), ('industrial_storage_cart', 28.5, 0, 21.5, 1.6, 1.0),
]
for g in GATES[1:7]:
    nz = g['n'][1]; CLUTTER += [('watering_can_metal_01', g['x'] - 3.4, 0, g['z'] - nz * .6, R2.uniform(0, 6), 1.0), ('plastic_jerrycan', g['x'] + 4.6, 0, g['z'] - nz * .7, R2.uniform(0, 6), 1.3)]
for (name, x, y, z, yaw, sc) in CLUTTER: PROPS.append([name, x, y, z, round(yaw, 3), sc, None])

# ================================================================================================= the realism pass
# What makes a shed read as real: a concrete plinth where the walls meet the ground, flashing on the corners, fascia
# and barge boards on the roof edges, a ridge cap, sills under the windows with rust running down from them,
# louvred vents and an extract fan high on the walls, and the same on the gatehouse, boiler house and barn.
def spans(a0, a1, holes):
    out, cur = [], a0
    for (h0, h1) in sorted(holes):
        if h0 > cur: out.append((cur, h0))
        cur = max(cur, h1)
    if cur < a1: out.append((cur, a1))
    return out
def plinth(axis, at, sign, a0, a1, holes, h=.62, t=.06):
    for (p0, p1) in spans(a0, a1, holes):
        if axis == 'x': box('plinth', (p0, 0, min(at, at + sign * t)), (p1, h, max(at, at + sign * t)), 'plinth', group='kit', solid=False)
        else: box('plinth', (min(at, at + sign * t), 0, p0), (max(at, at + sign * t), h, p1), 'plinth', group='kit', solid=False)
OUT_N, OUT_S, OUT_W, OUT_E = BZ0 - T / 2, BZ1 + T / 2, BX0 - T / 2, BX1 + T / 2
plinth('x', OUT_N, -1, BX0 - .2, BX1 + .2, [(-4, 4)]); plinth('x', OUT_S, 1, BX0 - .2, BX1 + .2, [(-21, -17), (12, 13.6)])
plinth('z', OUT_W, -1, BZ0, BZ1, [(6, 26), (32.5, 33.8)]); plinth('z', OUT_E, 1, BZ0, BZ1, [(15, 16.8), (20, 21.3), (30, 32.6)])
for (cx, cz, sx, sz) in ((BX0, BZ0, -1, -1), (BX1, BZ0, 1, -1), (BX0, BZ1, -1, 1), (BX1, BZ1, 1, 1)):   # corner flashing
    box('flashing', (cx + sx * T / 2 - (.3 if sx > 0 else 0), 0, cz + sz * T / 2 - (.04 if sz > 0 else 0)), (cx + sx * T / 2 + (0 if sx > 0 else .3), H, cz + sz * T / 2 + (0 if sz > 0 else .04)), 'galv', group='kit', solid=False)
    box('flashing', (cx + sx * T / 2 - (.04 if sx > 0 else 0), 0, cz + sz * T / 2 - (.3 if sz > 0 else 0)), (cx + sx * T / 2 + (0 if sx > 0 else .04), H, cz + sz * T / 2 + (0 if sz > 0 else .3)), 'galv', group='kit', solid=False)
for sx in (-1, 1): box('fascia', (sx * (BX1 + .6) - .03, H - .42, -.6), (sx * (BX1 + .6) + .03, H - .14, 48.6), 'galv', group='kit', solid=False)
for z in (-.66, 48.66):   # barge boards up the gable edges
    for sx in (-1, 1):
        run = (BX1 + .6) / math.cos(pitch); obox('barge', (sx * (BX1 + .6) / 2, (H + RIDGE) / 2 + .02, z), (run / 2, .16, .03), rot_z(-sx * pitch), 'galv', group='kit')
box('ridge-cap', (-.32, RIDGE + .08, -.66), (.32, RIDGE + .2, 48.66), 'galv', group='kit', solid=False)
for (a0, a1, y0, y1, *g) in openN:
    if g: box('sill', (a0 - .08, y0 - .08, OUT_N - .16), (a1 + .08, y0, OUT_N), 'concrete', group='kit', solid=False); LATER_DECALS.append(lambda a0=a0, a1=a1, y0=y0: decal('grime_rust', (a0 + a1) / 2, .05, OUT_N - .02, a1 - a0 + .3, y0 - .1, face=('z', '-')))
box('sill', (OUT_W - .16, 2.42, 27.92), (OUT_W, 2.5, 30.08), 'concrete', group='kit', solid=False)
for z in (8, 40):   # louvred vents high on the east wall, and an extract fan
    box('louvre', (OUT_E, 5.0, z - .6), (OUT_E + .12, 5.9, z + .6), 'grate', group='kit', solid=False)
    for k in range(5): box('louvre-blade', (OUT_E + .02, 5.08 + k * .17, z - .58), (OUT_E + .16, 5.12 + k * .17, z + .58), 'galv', group='kit', solid=False)
cyl('extract-fan', (OUT_E, 5.4, 35.5), (OUT_E + .35, 5.4, 35.5), .5, 'galv', 20); box('fan-guard', (OUT_E + .35, 4.95, 35.05), (OUT_E + .38, 5.85, 35.95), 'grate', group='kit', solid=False)
cyl('extract-fan', (OUT_W, 5.4, 12), (OUT_W - .35, 5.4, 12), .5, 'galv', 20); box('fan-guard', (OUT_W - .38, 4.95, 11.55), (OUT_W - .35, 5.85, 12.45), 'grate', group='kit', solid=False)
for (x, z) in ((-14, 48.4), (16, 48.4)): LATER_DECALS.append(lambda x=x, z=z: decal('grime_rust', x, H - 3.2, OUT_S + .02, 1.6, 3.0, face=('z', '+')))   # rust run from the gutter outlets
# The gatehouse and the boiler house: plinths, fascias, sills.
plinth('x', gz0 - .1, -1, gx0 - .1, gx1 + .1, []); plinth('x', gz1 + .1, 1, gx0 - .1, gx1 + .1, []); plinth('z', gx0 - .1, -1, gz0, gz1, []); plinth('z', gx1 + .1, 1, gz0, gz1, [(-56.8, -55.6)])
box('fascia', (gx0 - .42, 2.72, gz0 - .42), (gx1 + .42, 2.9, gz0 - .38), 'galv', group='kit', solid=False); box('fascia', (gx0 - .42, 2.72, gz1 + .38), (gx1 + .42, 2.9, gz1 + .42), 'galv', group='kit', solid=False)
box('sill', (-13.58, .92, gz1 + .1), (-10.92, 1.0, gz1 + .24), 'concrete', group='kit', solid=False)
plinth('x', 51.85, -1, -44.2, -33.8, []); plinth('x', 62.15, 1, -44.2, -33.8, []); plinth('z', -44.15, -1, 52, 62, []); plinth('z', -33.85, 1, 52, 62, [(55, 56.6)])
# The barn: corner flashing, rot and muck along the bottom of the cladding.
for (x, z) in ((BB0 - .25, BZb + .25), (BB1 + .25, BZb + .25)): box('flashing', (x - .06, 0, z - .06), (x + .06, 7.2, z + .06), 'galv', group='kit', solid=False)
LATER_DECALS.append(lambda: decal('grime_base', (BB0 + BB1) / 2, .02, BZb + .27, BB1 - BB0, 1.3, face=('z', '+')))
for x in (BB0 - .27, BB1 + .27): LATER_DECALS.append(lambda x=x: decal('grime_base', x, .02, (BZa + 4 + BZb) / 2, BZb - BZa - 4, 1.2, face=('x', '-' if x < BB0 else '+')))

# More things: workbenches in the barn and the container yard with their tools, lamps and extinguishers round the
# hall, a compressor and a welding cart in the yard, barriers, ladders, buckets and baskets, fallen trees outside.
def workbench(x0, z0, x1, z1, items):
    box('bench-top', (x0, .86, z0), (x1, .92, z1), 'planks'); box('bench-shelf', (x0 + .05, .2, z0 + .05), (x1 - .05, .24, z1 - .05), 'planks', group='kit', solid=False)
    for (x, z) in ((x0 + .06, z0 + .06), (x1 - .06, z0 + .06), (x0 + .06, z1 - .06), (x1 - .06, z1 - .06)): box('bench-leg', (x - .04, 0, z - .04), (x + .04, .86, z + .04), 'steel', group='kit', solid=False)
    for (name, fx, fz, yaw, sc) in items: PROPS.append([name, round(x0 + (x1 - x0) * fx, 3), .92, round(z0 + (z1 - z0) * fz, 3), yaw, sc, None])
workbench(79.4, 69.2, 83.4, 69.9, [('metal_toolbox', .15, .5, .2, 1.0), ('oil_tin', .38, .4, .9, 1.0), ('can_rusted', .45, .6, 0, 1.0), ('multi_cleaner_5_litre', .62, .5, .4, 1.0), ('plastic_bottle_gallon', .72, .45, 1.2, 1.0), ('medical_box', .88, .5, .1, 1.0)])
workbench(64.2, -31.2, 67.6, -30.4, [('metal_toolbox', .2, .5, -.3, 1.0), ('oil_tin', .5, .5, .4, 1.0), ('can_rusted', .58, .4, 0, 1.0), ('multi_cleaner_5_litre', .82, .5, 1.0, 1.0)])
MORE = [
    ('drawer_cabinet', 78.6, 0, 69.6, math.pi, 1.0), ('metal_stool_02', 81, 0, 68.6, .4, 1.0), ('tire_pump', 83.7, 0, 68.9, -1.2, 1.0), ('wall_clock', 71, 2.6, 69.98, math.pi, 1.0),
    ('wooden_bucket_02', 61.8, 0, 59.6, 0, 1.0), ('wicker_basket_01', 62.6, 0, 59.3, .6, 1.4), ('wooden_broom', 58.6, 0, 63.7, .2, 1.0), ('korean_fire_extinguisher_01', 71.3, 0, 58.9, math.pi, 1.0),
    ('old_military_compressor', 62.6, 0, -29.6, math.pi / 2, 1.0), ('portable_welding_cart', 75, 0, -34, 2.4, 1.0), ('wooden_military_crate', 69.6, 0, -44, .2, 1.0), ('wooden_military_crate', 69.6, .47, -44, .25, 1.0),
    ('metal_jerrycan_green', 61.6, 0, -30.1, .3, 1.0), ('metal_jerrycan_green', 61.95, 0, -30.2, .5, 1.0), ('rusted_wheel_rim_02', 80.1, 0, -46.0, .4, 1.0), ('plastic_crate_02', 74.8, 0, -30.9, 0, 1.4), ('plastic_crate_02', 74.8, .35, -30.9, .2, 1.4),
    ('ladder_sectioned_01', 55.7, 0, -47.6, -math.pi / 2, 1.0), ('korean_fire_extinguisher_01', 63.8, 0, -29.9, math.pi, 1.0), ('metal_stool_02', 65.6, 0, -29.6, 1.3, 1.0),
    ('concrete_road_barrier_02', 53.6, 0, -27.8, 0, 1.0), ('concrete_road_barrier_02', 55.3, 0, -27.8, .05, 1.0), ('concrete_road_barrier_02', 83.6, 0, -27.8, 0, 1.0), ('concrete_road_barrier_02', -8.6, 0, -64.5, 0, 1.0), ('concrete_road_barrier_02', 8.6, 0, -64.5, 0, 1.0),
    ('korean_fire_extinguisher_01', BX1 - .55, 0, 14.4, -math.pi / 2, 1.0), ('korean_fire_extinguisher_01', -4.7, 0, .6, 0, 1.0), ('korean_fire_extinguisher_01', BX0 + .55, 0, 27.4, math.pi / 2, 1.0), ('korean_fire_extinguisher_01', -10.4, 0, -54.7, 0, 1.0),
    ('wooden_broom', -33.6, 1.3, 25.4, 1.4, 1.0), ('wooden_bucket_02', -30.2, 1.3, 7.2, 0, 1.0), ('metal_stool_02', -11.6, 0, -57.4, .3, 1.0), ('drawer_cabinet', -14.4, 0, -55.3, math.pi / 2, .9),
    ('dead_tree_trunk_02', -48, 0, 20, .4, 1.4), ('dead_tree_trunk_02', 98.2, 0, 52, 1.7, 1.2), ('tree_stump_02', 40.5, 0, 68.5, .3, 1.2), ('tree_stump_02', -30, 0, 69.6, 2, 1.1), ('tree_stump_02', 97.8, 0, 12, .9, 1.0),
    ('dead_tree_trunk_02', 64, 0, -59.6, 2.9, 1.3), ('tree_stump_02', -53, 0, -40, 1.2, 1.2),
]
for (name, x, y, z, yaw, sc) in MORE: PROPS.append([name, x, y, z, round(yaw, 3), sc, None])
for (x, y, z, yaw) in ((OUT_E + .1, 3.4, 4, math.pi / 2), (OUT_E + .1, 3.4, 44, math.pi / 2), (OUT_W - .1, 3.4, 30, -math.pi / 2), (OUT_W - .1, 3.4, 44, -math.pi / 2),
                       (-8, 3.4, OUT_S + .1, 0), (22, 3.4, OUT_S + .1, 0), (-18, 3.4, OUT_N - .1, math.pi), (gx1 + .15, 2.3, -58, math.pi / 2), (BB0 - .3, 4.2, 64, -math.pi / 2), (BB1 + .3, 4.2, 64, math.pi / 2)):
    PROPS.append(['industrial_wall_lamp', x, y, z, yaw, 1.4, None])
for (x, y, z, yaw) in ((gx0 - .2, 2.6, -56.5, -math.pi / 2), (-33.9, 3.0, 52, math.pi)): PROPS.append(['street_lamp_02', x, y, z, yaw, 1.2, None])

# Freerunning: drainpipes to the eaves on every side, a rope from the trusses, bars across the yard; hay to leap into
# and hide in. parkour.js reads GRIPS (the same format as parkour-grips.js).
GRIPS = [
    # (standing just outside the eave, which overhangs the wall by 0.6 m, and rising past it so you step onto the roof)
    {'type': 'pipe', 'x': BX0 - .82, 'z': 32, 'y0': .2, 'y1': H + 1.35, 'n': [-1, 0]},
    {'type': 'pipe', 'x': BX1 + .82, 'z': 40, 'y0': .2, 'y1': H + 1.35, 'n': [1, 0]},
    {'type': 'pipe', 'x': -22, 'z': BZ0 - .82, 'y0': .2, 'y1': H + 1.35, 'n': [0, -1]},
    {'type': 'pipe', 'x': 10, 'z': BZ1 + .82, 'y0': .2, 'y1': H + 1.35, 'n': [0, 1]},
    {'type': 'pipe', 'x': OX0 - .3, 'z': 7, 'y0': .2, 'y1': OH + .3, 'n': [-1, 0]},          # kill floor up to the office roof
    {'type': 'rope', 'x': -6, 'z': 30, 'top': H - .2, 'len': 5.6},
    {'type': 'rope', 'x': 0, 'z': 14, 'top': H - .2, 'len': 5.6},
    {'type': 'bar', 'a': [26.6, 3.0, -14], 'b': [29.4, 3.0, -14]}, {'type': 'bar', 'a': [26.6, 3.0, -17], 'b': [29.4, 3.0, -17]},
] + EXTRA_GRIPS
for g in GRIPS:
    if g['type'] == 'pipe':
        cyl('grip-pipe', (g['x'], 0, g['z']), (g['x'], g['y1'] + .1, g['z']), .06, 'pipe_grey', 10)
        for y in range(1, int(g['y1']), 2):   # stand-off arms back to the wall
            cyl('grip-arm', (g['x'], y, g['z']), (g['x'] - g['n'][0] * .7, y, g['z'] - g['n'][1] * .7), .025, 'junction', 6)
    elif g['type'] == 'rope': cyl('grip-rope', (g['x'], g['top'], g['z']), (g['x'], g['top'] - g['len'], g['z']), .022, 'planks', 6)
    else:
        cyl('grip-bar', g['a'], g['b'], .035, 'stainless', 8)
        for p in (g['a'], g['b']): box('grip-post', (p[0] - .06, 0, p[2] - .06), (p[0] + .06, p[1] + .1, p[2] + .06), 'steel', group='kit')
HAY = [[28.8, 19, 1.9], [-38.5, 31, 1.9], [9.5, -3.4, 1.7], [15, 44.5, 1.7], [-28.8, 40, 1.7], [31.5, 56, 1.8], [92.5, 30, 1.8]] + EXTRA_HAY
for hx, hz, hr in HAY:
    rr = random.Random(int(hx * 31 + hz * 17)); ph = [rr.uniform(0, 6.28) for _ in range(5)]
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=30, v_segments=15, radius=1)
    for v in bm.verts:
        d = v.co.normalized(); n = 1 + .11 * math.sin(d.x * 5 + ph[0]) * math.sin(d.y * 4 + ph[1]) + .07 * math.sin(d.x * 11 + d.y * 9 + ph[2]) + .045 * math.sin(d.y * 19 + d.x * 7 + ph[3]) + .03 * math.sin(d.x * 31 + ph[4])
        v.co = Vector((hx + v.co.x * hr * n, -(hz + v.co.y * hr * n), max(0, v.co.z * .75 + .12) * 1.1 * n))
    o = emit('haypile', bm, 'hay', 'kit')
    for f in o.data.polygons: f.use_smooth = True   # a soft heap, not facets
    dome = lambda x, z, hx=hx, hz=hz, hr=hr: max(0, 1 - (math.hypot(x - hx, z - hz) / hr) ** 2) ** .5 * .96
    straw(hx, hz, hr * .9, hr * .9, int(140 * hr), int(hx * 13 + hz), top=dome); straw(hx, hz, hr * 1.6, hr * 1.6, int(90 * hr), int(hx * 5 + hz * 3))

POINTS = {
    'spawn': {'x': FX1 + 9, 'z': 30, 'yaw': -math.pi / 2}, 'cowSpawn': {'x': 16, 'z': 40, 'yaw': -math.pi / 2},
    'exit': {'x': 0, 'z': -128, 'radius': 18}, 'cover': COVER, 'cowWalls': COW_WALLS, 'gateZ': FZ0, 'pens': PENS, 'gates': GATES, 'bounds': [-150, 150, -340, 160],
    'pen': PEN, 'gate': {'x': 6, 'z': 34.5, 'half': 2.55}, 'lever': {'x': 5.2, 'z': 31.2},
    'escape': [[9, 34.5], [3, 34.5], [0, 27], [0, 12], [0, -3], [0, -30]],
    'truckStart': {'x': 44, 'z': -40, 'yaw': math.pi},
    'fence': FENCE, 'gateX': GATE,
    'patrols': [
        [[-20, -40], [20, -40], [20, -12], [-20, -12]],
        [[32, 2], [92, 2], [92, 55.5], [50.5, 55.5], [50.5, 63.5], [32, 63.5]],
        [[-12, -4], [12, -4]],
        [[-22, 8], [-2, 8], [-2, 33], [-22, 33]],
        [[8, 18], [24, 18]],
        [[3.2, 26], [3.2, 45]],
        [[-22, 41], [-9, 41]],
        [[-20, 57], [24, 57]],
        [[37, 30], [70, 30]],
        [[40, -22], [90, -22]],
        [[-11.6, -51], [-3, -51]],
    ] + EXTRA_PATROLS,
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
for later in LATER_DECALS: later()
rg = random.Random(77)
F = .05   # kill-floor tile top
# Under the bleed rail: the sticking point and long pools draining to the channel, drag smears along the rails.
for z in (8, 10.5, 13, 15.5, 18, 21.5, 24, 27, 30, 33): decal('pool', -12 + rg.uniform(-.5, .5), F + .004, z, rg.uniform(2.2, 3.6), rg.uniform(2.2, 3.6), rg.uniform(0, 6.28))
for x in (-1, -4, -7, -10): decal('smear', x, F + .006, 21.5 + rg.uniform(-.4, .4), 3.4, 1.4, rg.uniform(-.15, .15))
for z in (7, 12, 17, 22, 27, 32): decal('smear', -12.8, F + .006, z, 4.2, 1.2, math.pi / 2 + rg.uniform(-.2, .2))
decal('pool', 3.7, .255 if 'knocking-box' not in MODLY else .06, 21.5, 2.8, 3.2, .4)   # in (or under) the knocking box
for i in range(5): decal('smear', 1.0 - i * .4, F + .007, 20.5 + i * .5, 2.5, .9, rg.uniform(-.6, .6))
decal('pool', -15.5, 1.756, 27.5, 2.6, 4, 0); decal('drip', -14.0, 0, 27.5, 4, 1.7, face=('x', '+'))   # splitting platform
for i in range(18): decal('smear', -15.5 + rg.uniform(-3, 3), F + .008, 27.5 + rg.uniform(-4, 4), rg.uniform(1, 3), rg.uniform(.6, 1.4), rg.uniform(0, 6.28))
# Walls: spray and drips on the west wall, the tile behind the rail, the office wall, the knocking box.
for z in range(5, 35, 2):
    if rg.random() < .75: decal('spray', BX0 + T / 2 + .006, rg.uniform(.1, .9), z + rg.uniform(-.8, .8), rg.uniform(1.4, 2.6), rg.uniform(1.2, 2.2), face=('x', '+'))
    if rg.random() < .55: decal('drip', BX0 + T / 2 + .008, rg.uniform(.2, 1.4), z + rg.uniform(-.8, .8), rg.uniform(.8, 1.6), rg.uniform(1.2, 2.4), face=('x', '+'))
for x in (-20, -15, -9, -4): decal('spray', x, .2, BZ0 + T / 2 + .006, 2.2, 2.0, face=('z', '+'))
for z in (2, 4, 7, 10): decal('spray', OX0 - .09, .1, z, 1.6, 1.3, face=('x', '-'))
if 'knocking-box' not in MODLY: decal('spray', 5.19, .3, 21.5, 3.6, 1.5, face=('x', '-')); decal('drip', 2.01, .3, 21.5, 3.4, 1.5, face=('x', '-'))
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
if 'hide-puller' not in MODLY:
    box('hide-puller', (-19.4, 0, 14), (-18.6, 3.2, 14.6), 'stainless', group='kit'); box('hide-puller', (-19.4, 0, 17.4), (-18.6, 3.2, 18), 'stainless', group='kit')
    cyl('hide-puller-drum', (-19, .6, 14.3), (-19, .6, 17.7), .35, 'stainless', 16); box('hide-puller-chain', (-19.05, .9, 15.9), (-18.95, 3.3, 16.1), 'chain', group='kit', solid=False)
if 'splitting-saw' not in MODLY: obox('split-saw', (-15.5, 3.0, 27.5), (.18, .55, .3), rot_z(.3), 'stainless')
cyl('split-saw-cable', (-15.5, 3.3, 27.5), (-15.5, H - .2, 27.5), .02, 'chain', 6)
for z in (10, 19, 28):
    if 'knife-steriliser' not in MODLY: box('steriliser', (BX0 + .2, 1.0, z), (BX0 + .5, 1.4, z + .5), 'stainless', group='kit', solid=False)
    if 'hand-wash-basin' not in MODLY: box('basin', (BX0 + .2, .8, z + .9), (BX0 + .7, 1.0, z + 1.6), 'stainless', group='kit', solid=False)

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
    if not os.path.exists(cow) or 'beef-half-carcass' in MODLY: return
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
# Faces are flat unless something asked for smooth (the terrain, hay piles, round bales): keep what was set.
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.export_scene.gltf(filepath=f'{OUT}/site.glb', export_format='GLB', export_image_format='WEBP', export_image_quality=80, export_extras=True,
                          export_apply=True, export_animations=False, export_yup=True, export_lights=False, export_cameras=False)
data = {'version': 1, 'grips': GRIPS, 'hay': HAY, 'roofSteps': ROOF_STEPS, 'modly': sorted(MODLY), 'solids': SOLIDS, 'ceilings': CEILINGS, 'interiors': INTERIORS, 'ramps': RAMPS, 'lights': LIGHTS, 'props': PROPS, 'loose': LOOSE, 'scatter': SCATTER, 'points': POINTS}
json.dump(data, open(f'{OUT}/site.json', 'w'), separators=(',', ':'))
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('SITE', os.path.getsize(f'{OUT}/site.glb') // 1024, 'KB', tris, 'tris', len(SOLIDS), 'solids', sum(len(v) for v in SCATTER.values()), 'scattered', flush=True)
