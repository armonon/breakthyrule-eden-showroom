"""Built and weathered landmark geometry for Beyond Eden (showroom only; the expedition keeps assets/night/*.glb as they are).

  blender -b --factory-startup --python tools/night/build-landmarks.py -- DECODED_DIR OUT_DIR [name ...]

Normally run through tools/night/build-landmarks.sh, which decodes the shipped GLBs first and compresses the result.
For each landmark (DECODED_DIR/<name>.glb, a plain GLB) it writes OUT_DIR/<name>.glb with the same meshes and material
names, re-cut:
  - hard convex edges bevelled (2 segments, hardened normals) so the moon and lamps catch a line; a few corners and
    steps near the ground chipped
  - every window set back 15-20 cm: a reveal and an architrave round the glass, a stone sill under it, a lintel over
    square-headed ones, glazing bars on the larger ones (doorways are already framed by their portals' trim)
  - flat door leaves (a thin slab with stuck-on panels, such as the Moon Temple's side doors) turned to timber with iron
    strap hinges and a ring, set back 22 cm in a stone reveal and architrave
  - cast-iron drainpipes (hopper, brackets, shoe) at the building's outer corners where a wall stands there
  - the outward faces of the walls cut on a 0.7 m grid and given a vertex attribute _weather: r = how strongly rain runs down from a ledge
    or sill above (streaks), g = how occluded it is (corners, under ledges; 0 open); matrix-world.js reads it
  - on the three washed facades (the temple's and theatre's fronts, the hotel's entrance gate front) the wall and trim faces get a material of
    their own, '<material>@wash', so the architectural uplight (and the light bake) applies to those faces only
The textures are dropped by pack-built.mjs: night-district.js takes each material, by name, from the original GLB at load time.
Outer walls stay where they are (details only stand proud of them by a reveal's depth); collision is not from these
files (night-layout.json / expedition-world.js). Deterministic: the same input gives the same output.
"""
import bpy, bmesh, sys, os, json, math, random
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT, ONLY = argv[0], argv[1], argv[2:]
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
LAYOUT = {s['id']: s for s in json.load(open(os.path.join(ROOT, 'night-layout.json')))['landmarks']}
FILES = {'mayan-theatre': 'playhouse', 'moon-temple': 'temple', 'shrine-observatory': 'observatory', 'citadel-hotel': 'hotel',
         'egyptian-gardens': 'gardens', 'girard-gate': 'girard', 'palace-of-mirrors': 'latheatre', 'redwood-chapel': 'stjames',
         'first-cathedral': 'vibiana', 'campanile': 'methodist', 'high-tower': 'immanuel', 'three-arches': 'baptist',
         'rose-window': 'christian', 'organ-tower': 'firstcong'}
WASH = {'temple': 'front', 'playhouse': 'front', 'hotel': 'front'}   # the hotel's front is its entrance gate
GRID = .7

def kind(name):
    n = name.lower()
    if 'relief' in n: return 'relief'
    if n.endswith('_glass'): return 'glass'
    if n.endswith('shadow'): return 'shadow'
    if n.endswith('_floor'): return 'floor'
    if n.endswith(('_wall', '_side', '_stone')) or n in ('concrete_brick_wall_001', 'large_sandstone_blocks', 'large_sandstone_blocks.001'): return 'wall'
    if n.endswith(('_trim', '_tile', '_glaze')) or n == 'old_sandstone_02': return 'trim'
    if n.endswith(('_roof', '_dome')): return 'roof'
    return 'other'

def objects(): return [o for o in bpy.context.scene.objects if o.type == 'MESH']
def mat_of(o): return o.material_slots[0].material if o.material_slots else None

def new_material(name, colour, rough, metal):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*colour, 1); m.roughness = rough; m.metallic = metal
    b = m.node_tree.nodes.get('Principled BSDF') if m.node_tree else None
    if b is None: return m
    b.inputs['Base Color'].default_value = (*colour, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m

def islands(bm):
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen: continue
        stack, isl = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop(); isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); stack.append(h)
        out.append(isl)
    return out

def outer_loop(isl):
    fs = set(isl); bound = [e for f in isl for e in f.edges if sum(1 for g in e.link_faces if g in fs) == 1]
    bound = list(dict.fromkeys(bound)); adj = {}
    for e in bound:
        a, b = e.verts; adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
    loops, used = [], set()
    for start in adj:
        if start in used: continue
        loop, prev, cur = [start], None, start; used.add(start)
        while True:
            nxt = [v for v in adj[cur] if v is not prev and v not in used]
            if not nxt: break
            prev, cur = cur, nxt[0]; loop.append(cur); used.add(cur)
        if len(loop) >= 3: loops.append([v.co.copy() for v in loop])
    if not loops: return None
    per = lambda L: sum((L[i] - L[i - 1]).length for i in range(len(L)))
    return max(loops, key=per)

class Builder:
    """Collects new geometry (lists of quads) per material, then makes one object per material."""
    def __init__(self): self.faces = {}
    def quad(self, mat, pts, want=None):
        pts = [p.copy() for p in pts]
        if want is not None:
            n = (pts[1] - pts[0]).cross(pts[2] - pts[0])
            if n.dot(want) < 0: pts.reverse()
        self.faces.setdefault(mat, []).append(pts)
    def box(self, mat, c, u, v, n, su, sv, sn):
        # an oriented box: centre c, unit axes u (along), v (up), n (out), half sizes
        P = lambda a, b, d: c + u * (a * su) + v * (b * sv) + n * (d * sn)
        for axis, (a, b, d) in ((n, (0, 0, 1)), (-n, (0, 0, -1)), (u, (1, 0, 0)), (-u, (-1, 0, 0)), (v, (0, 1, 0)), (-v, (0, -1, 0))):
            if d: q = [P(-1, -1, d), P(1, -1, d), P(1, 1, d), P(-1, 1, d)]
            elif a: q = [P(a, -1, -1), P(a, 1, -1), P(a, 1, 1), P(a, -1, 1)]
            else: q = [P(-1, b, -1), P(1, b, -1), P(1, b, 1), P(-1, b, 1)]
            self.quad(mat, q, axis)
    def cylinder(self, mat, a, b, r, seg=10):
        axis = (b - a).normalized(); t = axis.orthogonal().normalized(); s = axis.cross(t)
        ring = [t * math.cos(k / seg * 2 * math.pi) * r + s * math.sin(k / seg * 2 * math.pi) * r for k in range(seg)]
        for k in range(seg):
            p, q = ring[k], ring[(k + 1) % seg]
            self.quad(mat, [a + p, a + q, b + q, b + p], (p + q))
    def build(self, name):
        made = []
        for mat, quads in self.faces.items():
            me = bpy.data.meshes.new(name + '_' + mat.name); bm = bmesh.new()
            for q in quads:
                vs = [bm.verts.new(p) for p in q]
                try: bm.faces.new(vs)
                except ValueError: pass
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=.0005)
            uv = bm.loops.layers.uv.new('UVMap')
            for f in bm.faces:  # box projection, 1 m = 1 unit (the textures are world-space on desktop anyway)
                n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
                for l in f.loops:
                    co = l.vert.co; l[uv].uv = (co.y, co.z) if ax == 0 else ((co.x, co.z) if ax == 1 else (co.x, co.y))
            bm.to_mesh(me); bm.free(); me.materials.append(mat)
            o = bpy.data.objects.new(me.name, me); bpy.context.scene.collection.objects.link(o); made.append(o)
        return made

def openings(o, b, trim, frame, centre, door):
    """Reveal, architrave, sill, lintel and glazing bars round each glass pane (door=False) or dark doorway (door=True)."""
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table(); count = 0
    for isl in islands(bm):
        area = sum(f.calc_area() for f in isl)
        if area < (1.2 if door else .12): continue
        n = Vector()
        for f in isl: n += f.normal * f.calc_area()
        if n.length < 1e-6: continue
        n.normalize()
        if abs(n.z) > .3 or any(f.normal.dot(n) < .9 for f in isl if f.calc_area() > .01): continue  # vertical and flat only
        n.z = 0; n.normalize()
        loop = outer_loop(isl)
        if not loop: continue
        c = sum(loop, Vector()) / len(loop)
        if n.dot(Vector((c.x - centre.x, c.y - centre.y, 0))) < 0: n = -n
        u = Vector((0, 0, 1)).cross(n).normalized(); v = Vector((0, 0, 1))
        uv = [((p - c).dot(u), (p - c).dot(v)) for p in loop]
        umin, umax = min(p[0] for p in uv), max(p[0] for p in uv); vmin, vmax = min(p[1] for p in uv), max(p[1] for p in uv)
        width, height = umax - umin, vmax - vmin
        if door and (height < 1.8 or c.z + vmin > 1.2): continue
        if width < .25 or height < .3: continue
        depth = .28 if door else (.2 if width > .6 else .15); rim = .15 if door else .09
        # 2-D outward offset of each boundary vertex (mitred), counter-clockwise loop in (u, v)
        s = sum(uv[i - 1][0] * uv[i][1] - uv[i][0] * uv[i - 1][1] for i in range(len(uv)))
        if s < 0: loop.reverse(); uv.reverse()
        off = []
        for i in range(len(uv)):
            (ax_, ay), (bx, by), (cx, cy) = uv[i - 1], uv[i], uv[(i + 1) % len(uv)]
            e1 = Vector((by - ay, -(bx - ax_))); e2 = Vector((cy - by, -(cx - bx)))
            e1 = e1.normalized() if e1.length > 1e-6 else e2.normalized(); e2 = e2.normalized() if e2.length > 1e-6 else e1
            m = (e1 + e2); m = m.normalized() if m.length > 1e-6 else e1
            k = 1 / max(.5, m.dot(e1)); off.append(u * (m.x * k) + v * (m.y * k))
        back = -.02
        for i in range(len(loop)):
            j = (i + 1) % len(loop); P, Q = loop[i], loop[j]
            if (Q - P).length < 1e-5: continue
            mid = (P + Q) / 2; inward = c - mid; inward -= n * inward.dot(n)
            if door and (P - c).dot(v) < vmin + .01 and (Q - c).dot(v) < vmin + .01: continue  # no reveal across a threshold
            b.quad(trim, [P + n * back, Q + n * back, Q + n * depth, P + n * depth], inward)   # reveal
            Pd, Qd = P + n * depth, Q + n * depth; Po, Qo = Pd + off[i] * rim, Qd + off[j] * rim
            b.quad(trim, [Pd, Qd, Qo, Po], n)                                                       # architrave face
            b.quad(trim, [Po, Qo, Qo - n * (depth - back), Po - n * (depth - back)], -inward)      # its outer return
        if not door and c.z + vmin > .35:   # sill
            b.box(trim, c + v * (vmin - .045) + n * (depth + .05) / 2, u, v, n, width / 2 + rim + .07, .045, (depth + .05 - back) / 2 + .01)
        top = [p for p in uv if p[1] > vmax - .03]
        if not door and len(top) >= 2 and max(p[0] for p in top) - min(p[0] for p in top) > width * .8:   # square head: lintel
            b.box(trim, c + v * (vmax + rim + .07) + n * (depth + .03) / 2, u, v, n, width / 2 + rim + .05, .07, (depth + .03 - back) / 2 + .01)
        if not door and width > .7 and height > 1.0:   # glazing bars just proud of the glass
            g = c + n * .015
            b.box(frame, g + u * ((umin + umax) / 2), u, v, n, .025, height / 2, .02)
            for t in (.38, .7):
                b.box(frame, g + v * (vmin + height * t) + u * ((umin + umax) / 2), u, v, n, width / 2, .02, .02)
        count += 1
    bm.free(); return count

def doors(b, trim, door, iron, centre):
    """Flat door leaves (a thin slab standing on the ground, 1.2-4.5 m wide, 2.2-4.2 m tall, with its moulded panels as
    separate thin pieces) become timber: the slab and its panels take the boards material, iron strap hinges and a ring
    go on, and a stone reveal and architrave stand round it so the door sits 22 cm back in its frame."""
    count = 0
    for o in objects():
        m = mat_of(o)
        if not m or kind(m.name) in ('glass', 'shadow', 'relief', 'floor') or m is door: continue
        bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
        isl = islands(bm); boxes = []
        for faces in isl:
            vs = [v.co for f in faces for v in f.verts]
            lo = Vector([min(v[i] for v in vs) for i in range(3)]); hi = Vector([max(v[i] for v in vs) for i in range(3)])
            boxes.append((faces, lo, hi))
        slabs = []
        for faces, lo, hi in boxes:
            ex = hi - lo
            for ax in (0, 1):
                other = 1 - ax
                if ex[ax] < .15 and 1.2 < ex[other] < 4.5 and 2.2 < ex.z < 4.2 and lo.z < .35:
                    c = (lo + hi) / 2; n = Vector((0, 0, 0)); n[ax] = 1 if c[ax] - centre[ax] > 0 else -1
                    slabs.append((faces, lo, hi, ax, n))
        if not slabs: bm.free(); continue
        move = set()
        for faces, lo, hi, ax, n in slabs:
            other = 1 - ax
            for f2, l2, h2 in boxes:   # its panels: thin pieces inside the slab's outline, within 8 cm of it
                if l2[other] >= lo[other] - .01 and h2[other] <= hi[other] + .01 and l2.z >= lo.z - .01 and h2.z <= hi.z + .01 and l2[ax] >= lo[ax] - .08 and h2[ax] <= hi[ax] + .08:
                    move.update(f.index for f in f2)
            front = hi[ax] if n[ax] > 0 else lo[ax]
            u = Vector((0, 0, 0)); u[other] = 1; v = Vector((0, 0, 1))
            w, h = hi[other] - lo[other], hi.z - lo.z; c = (lo + hi) / 2; c[ax] = front
            corners = [c + u * (-w / 2) + v * (-h / 2), c + u * (w / 2) + v * (-h / 2), c + u * (w / 2) + v * (h / 2), c + u * (-w / 2) + v * (h / 2)]
            depth, rim = .22, .16
            for i in (1, 2, 3):   # jambs and head; no reveal across the threshold
                P, Q = corners[i], corners[(i + 1) % 4]
                inward = c - (P + Q) / 2; inward -= n * inward.dot(n)
                out = -inward.normalized()
                b.quad(trim, [P - n * .03, Q - n * .03, Q + n * depth, P + n * depth], inward)
                b.quad(trim, [P + n * depth, Q + n * depth, Q + n * depth + out * rim, P + n * depth + out * rim], n)
                b.quad(trim, [P + n * depth + out * rim, Q + n * depth + out * rim, Q + out * rim - n * .03, P + out * rim - n * .03], out)
            leaves = 2 if w > 1.8 else 1
            for k in range(leaves):
                x0 = -w / 2 + k * w / leaves; hinge = x0 + (.02 if k == 0 else w / leaves - .02)
                for zz in (.35, h / 2, h - .4):   # strap hinges, from the hinge side two-thirds across the leaf
                    a = c + u * (hinge + (1 if k == 0 else -1) * w / leaves * .33) + v * (zz - h / 2) + n * .035
                    b.box(iron, a, u, v, n, w / leaves * .33, .035, .012)
                ring = c + u * (x0 + (w / leaves - .25 if k == 0 else .25)) + v * (1.05 - h / 2) + n * .05
                b.box(iron, ring, u, v, n, .05, .05, .02)
            count += 1
        if move:
            # the slab and its panels go to the door material (a slot of its own on this object)
            if door.name not in [mm.name for mm in o.data.materials]: o.data.materials.append(door)
            idx = [mm.name for mm in o.data.materials].index(door.name)
            for i in move: bm.faces[i].material_index = idx
            bm.to_mesh(o.data)
        bm.free()
    return count

def drainpipes(b, pipe, bvh, s):
    """Down the side walls, 35 cm back from each outer corner, where a plain wall runs from the ground to the eaves."""
    hw, hd = s['w'] / 2, s['d'] / 2; count = 0
    for sx in (-1, 1):
        for sy in (-1, 1):   # Blender: glTF +Z (the front) is -Y, so sy=-1 is the front
            # where the side wall and the end wall really are, 1.5 m up (the models overhang their footprints a little)
            hx = bvh.ray_cast(Vector((sx * 40, sy * (hd - 1.2), 1.5)), Vector((-sx, 0, 0)), 60)
            hy = bvh.ray_cast(Vector((sx * (hw - 1.2), sy * 40, 1.5)), Vector((0, -sy, 0)), 60)
            if hx[0] is None or hy[0] is None: continue
            x, y = hx[0].x + sx * .1, hy[0].y - sy * .35
            def wall_at(z):
                h = bvh.ray_cast(Vector((x + sx * .3, y, z)), Vector((-sx, 0, 0)), .55)
                return h[0] is not None and abs(h[1].x * sx) > .8
            top = .5
            while top < 30 and wall_at(top + .25): top += .25
            if top < 3 or not all(wall_at(z) for z in (.6, 1.5)): continue
            p0, p1 = Vector((x + sx * .06, y, .3)), Vector((x + sx * .06, y, top - .3))
            b.cylinder(pipe, p0, p1, .055)
            b.cylinder(pipe, p0, p0 + Vector((sx * .18, 0, -.22)), .055)                                       # shoe
            b.box(pipe, p1 + Vector((0, 0, .14)), Vector((0, 1, 0)), Vector((0, 0, 1)), Vector((1, 0, 0)), .13, .14, .13)   # hopper
            z = 1.4
            while z < top - .8:                                                                                # brackets
                b.box(pipe, Vector((x, y, z)), Vector((0, 1, 0)), Vector((0, 0, 1)), Vector((1, 0, 0)), .025, .025, .07); z += 2.1
            count += 1
    return count

def bevel_and_chip(o, width, rng, chip=True, shortest=.2):
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=.0008)
    edges = [e for e in bm.edges if len(e.link_faces) == 2 and e.is_convex and e.calc_face_angle(0) > math.radians(32) and e.calc_length() > shortest]
    if edges:
        res = bmesh.ops.bevel(bm, geom=edges, offset=width, offset_type='OFFSET', segments=2, profile=.5, affect='EDGES', clamp_overlap=True, harden_normals=False, loop_slide=True)
        if chip:
            # chips: little bites out of corners and steps, mostly within reach of the ground
            verts = list({v for f in res['faces'] for v in f.verts})
            verts.sort(key=lambda v: (round(v.co.x, 3), round(v.co.y, 3), round(v.co.z, 3)))
            for v in verts:
                p = .10 if v.co.z < 1.6 else .025
                cell = (int(v.co.x // .35), int(v.co.y // .35), int(v.co.z // .35))
                if random.Random(hash(cell) & 0xffffffff).random() < p:
                    nrm = v.normal
                    v.co -= nrm * (.012 + .02 * rng.random())
    bm.to_mesh(o.data); bm.free()

def flat_shading(o, angle=None):
    # Round things stay round (columns step 22.5 degrees) while each bevel step (30) stays
    # a crisp facet, so a lamp draws a line along the edge rather than a smear across the wall.
    me = o.data
    if me.has_custom_normals: bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.mesh.customdata_custom_splitnormals_clear(); o.select_set(False)
    for p in me.polygons: p.use_smooth = angle is not None
    if angle is not None: me.set_sharp_from_angle(angle=math.radians(angle))

def grid_cut(o, step, inward=False):
    """Cut the big vertical faces on a grid, so the weathering attribute has vertices to live on: the outward-facing ones
    (normal pointing away from the building's middle) finely, the rest (insides, courtyards) on a coarse grid, so no
    big triangle smears occlusion across a wall. Tops and small faces are left alone."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    def wanted(f):
        n, c = f.normal, f.calc_center_median()
        return abs(n.z) < .3 and f.calc_area() > step * step * 1.5 and (n.x * c.x + n.y * c.y > 0) != inward
    lo = Vector((min(v.co.x for v in bm.verts), min(v.co.y for v in bm.verts), min(v.co.z for v in bm.verts)))
    hi = Vector((max(v.co.x for v in bm.verts), max(v.co.y for v in bm.verts), max(v.co.z for v in bm.verts)))
    for axis in range(3):
        no = Vector((0, 0, 0)); no[axis] = 1
        t = math.floor(lo[axis] / step) * step + step
        while t < hi[axis]:
            faces = [f for f in bm.faces if wanted(f)]
            if faces:
                geom = list({v for f in faces for v in f.verts}) + list({e for f in faces for e in f.edges}) + faces
                co = Vector((0, 0, 0)); co[axis] = t
                bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, dist=.002)
            t += step
    bm.to_mesh(o.data); bm.free()

HEMI = [Vector(d).normalized() for d in ((0, 0, 1), (.7, 0, .7), (-.7, 0, .7), (0, .7, .7), (0, -.7, .7), (.5, .5, .3), (-.5, .5, .3), (.5, -.5, .3), (-.5, -.5, .3), (0, 0, .2))]
def weather(o, bvh):
    me = o.data; bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    up = Vector((0, 0, 1)); vals = []
    for v in bm.verts:
        n = v.normal if v.normal.length > .5 else up
        p = v.co + n * .04
        # streak: an overhang (a face looking down) above this point, the nearer the stronger
        s = 0.0
        if abs(n.z) < .5:
            hit = bvh.ray_cast(p, up, 3.5)
            if hit[0] is not None and hit[1].z < -.2: s = (1 - hit[3] / 3.5) ** 1.3
        # occlusion: rays round the normal's hemisphere
        t = n.orthogonal().normalized(); bi = n.cross(t); occ = 0
        for d in HEMI:
            w = (t * d.x + bi * d.y + n * d.z).normalized()
            hit = bvh.ray_cast(p, w, 1.4)
            if hit[0] is not None: occ += 1 - hit[3] / 1.4
        vals.append((s, min(1, occ / len(HEMI) * 1.6)))
    bm.free()
    attr = me.attributes.new('_weather', 'FLOAT2', 'POINT')
    for i, (s, a) in enumerate(vals): attr.data[i].vector = (s, a)

def wash_split(o, mode, s):
    mat = mat_of(o)
    if not mat or kind(mat.name) not in ('wall', 'trim'): return 0
    hd = s['d'] / 2; picks = []
    for p in o.data.polygons:
        c, n = p.center, p.normal
        front = n.y < -.5 and c.y < -(hd - 3.5) and p.material_index == 0
        picks.append(front)
    if not any(picks): return 0
    w = bpy.data.materials.get(mat.name + '@wash') or mat.copy()
    w.name = mat.name + '@wash'; o.data.materials.append(w); idx = len(o.data.materials) - 1
    for p, k in zip(o.data.polygons, picks):
        if k: p.material_index = idx
    return sum(picks)

def process(name):
    lid = FILES[name]; s = LAYOUT[lid]; rng = random.Random(name)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, name + '.glb'))
    for o in objects(): o.select_set(True)
    bpy.context.view_layer.objects.active = objects()[0]
    bpy.ops.object.make_single_user(object=True, obdata=True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # flatten any parenting so every mesh is in building space
    for o in objects():
        if o.parent: mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    bpy.ops.object.select_all(action='DESELECT')
    walls = [o for o in objects() if mat_of(o) and kind(mat_of(o).name) == 'wall']
    trims = [o for o in objects() if mat_of(o) and kind(mat_of(o).name) == 'trim']
    stone = trims[0] if trims else walls[0]; trim = mat_of(stone)
    prefix = trim.name.split('_')[0]
    frame = new_material(prefix + '_frame', (.055, .05, .045), .62, .0)
    pipe = new_material(prefix + '_pipe', (.09, .085, .08), .55, .75)
    door = new_material(prefix + '_door_wood', (.30, .20, .13), .8, .0)
    centre = Vector((0, 0, 0))
    before = sum(len(o.data.polygons) for o in objects())
    b = Builder(); nwin = ndoor = 0
    for o in objects():
        m = mat_of(o)
        if not m: continue
        k = kind(m.name)
        if k == 'glass': nwin += openings(o, b, trim, frame, centre, False)
        # Doorways are left as modelled: their dark panels sit behind arches and portals already framed in the trim,
        # and a reveal stood in front of those reads as a box round an arch. (The match hangs its own doors there.)
    dg = bpy.context.evaluated_depsgraph_get()
    bvh0 = BVHTree.FromObject(walls[0], dg) if walls else None
    allbvh = lambda: BVHTree.FromPolygons(*mesh_soup())
    ndoor = doors(b, trim, door, pipe, centre)
    npipe = drainpipes(b, pipe, allbvh(), s)
    made = b.build('detail')
    # the new surround geometry joins the trim object (same material), the rest stay their own objects
    for o in made:
        if mat_of(o) is trim:
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); stone.select_set(True); bpy.context.view_layer.objects.active = stone; bpy.ops.object.join()
    for o in walls: bevel_and_chip(o, .03, rng); flat_shading(o, 26)
    for o in trims: bevel_and_chip(o, .016, rng, shortest=.3); flat_shading(o, 26)
    for o in objects():
        m = mat_of(o)
        if m and kind(m.name) == 'roof': flat_shading(o, 40)
    for o in walls: grid_cut(o, GRID); grid_cut(o, GRID * 3, inward=True)
    bvh = allbvh()
    for o in walls: weather(o, bvh)
    washed = sum(wash_split(o, WASH[lid], s) for o in walls + trims) if lid in WASH else 0
    after = sum(len(o.data.polygons) for o in objects())
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', export_image_format='AUTO',
                              export_attributes=True, export_normals=True, export_texcoords=True, export_materials='EXPORT',
                              export_yup=True, export_apply=False, export_extras=False, use_selection=False)
    print(f'[build] {name}: {nwin} windows, {ndoor} doors, {npipe} drainpipes, {washed} washed faces, polygons {before} -> {after}', flush=True)

def mesh_soup():
    verts, polys = [], []
    for o in objects():
        mw = o.matrix_world; base = len(verts)
        verts.extend(mw @ v.co for v in o.data.vertices)
        polys.extend([base + i for i in p.vertices] for p in o.data.polygons)
    return verts, polys

for f in sorted(os.listdir(SRC)):
    n = f[:-4]
    if f.endswith('.glb') and n in FILES and (not ONLY or n in ONLY): process(n)
