"""Rebuild the first-person arms with smooth, folded sleeves (models/combat/arms_tactical.glb).

  Blender -b --factory-startup --python tools/combat/refine-arms.py -- models/combat/arms_military.glb models/combat/arms_tactical.glb

Takes the Rocketbox arms (MIT, models/combat/CREDITS.md), subdivides them twice with their skin weights, and presses cloth
folds into the sleeves: long diagonal drag folds along the arm, tighter stacked ones toward the cuff. Hands are only
smoothed. The materials are left to combat-arms.js.
"""
import bpy, sys, math
from mathutils import Vector, noise
src, dst, *rest = sys.argv[sys.argv.index("--") + 1:]; LEVELS = rest[0] if rest else 2
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); ob = next(o for o in bpy.data.objects if o.type == 'MESH' and o.find_armature())
print('bones', [b.name for b in arm.data.bones][:60])
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=1e-5)
bpy.ops.object.mode_set(mode='OBJECT')
m = ob.modifiers.new('s', 'SUBSURF'); m.levels = int(LEVELS); m.subdivision_type = 'CATMULL_CLARK'; m.uv_smooth = 'PRESERVE_BOUNDARIES'
ob.modifiers.move(len(ob.modifiers) - 1, 0)
bpy.ops.object.modifier_apply(modifier='s')
me = ob.data; names = {g.index: g.name for g in ob.vertex_groups}
mw = ob.matrix_world; imw = mw.inverted(); B = {b.name: b for b in arm.data.bones}
normals = [v.normal.copy() for v in me.vertices]
uvs = [None] * len(me.vertices)
for l, uv in zip(me.loops, me.uv_layers.active.data): uvs[l.vertex_index] = (uv.uv.x, uv.uv.y)
moved = 0
for v in me.vertices:
    w = {}
    for g in v.groups: w[names[g.group]] = w.get(names[g.group], 0) + g.weight
    side = 'R' if sum(x for n, x in w.items() if n.endswith('.R')) >= sum(x for n, x in w.items() if n.endswith('.L')) else 'L'
    sleeve = sum(x for n, x in w.items() if n.startswith(('UpperArm', 'LowerArm')))
    if sleeve < .3: continue
    el, wr, sh = [arm.matrix_world @ B[n + '.' + side].head_local for n in ('LowerArm', 'Wrist', 'UpperArm')]
    p = mw @ v.co
    lower = sum(x for n, x in w.items() if n.startswith('LowerArm')) > .5
    a, b = (el, wr) if lower else (sh, el); d = (b - a); L = d.length; d.normalize(); t = (p - a).dot(d) / L
    r = p - a - d * ((p - a).dot(d)); ref = Vector((0, 0, 1)) - d * d.z; ref.normalize(); ang = math.atan2(r.dot(d.cross(ref)), r.dot(ref))
    s = t * L * 100  # cm along the limb
    n1 = noise.noise(Vector((math.cos(ang) * 1.4, math.sin(ang) * 1.4, s * .16 + (7 if lower else 0))))
    n2 = noise.noise(Vector((math.cos(ang) * 2.2, math.sin(ang) * 2.2, s * .42 + 31)))
    ridge = lambda x: (1 - abs(x)) ** 3
    stack = max(0, (t - .55) / .45) if lower else max(0, (t - .6) / .4)
    fold = ridge(math.sin(s * .55 + ang * 1.3 + n1 * 3.5)) * .55 + ridge(math.sin(s * 1.25 - ang * .8 + n2 * 2.8)) * .45 * stack + n1 * .35
    amp = .0042 * min(1, sleeve) * (.75 + .5 * stack)
    if lower: amp *= 1 - max(0, min(1, (t - .86) / .1))   # nothing at the glove's cuff
    v.co = imw @ (p + (mw.to_3x3() @ normals[v.index]).normalized() * (fold - .35) * amp); moved += 1
for p in me.polygons: p.use_smooth = True
me.update(); print('verts', len(me.vertices), 'sleeve', moved)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_skins=True, export_animations=False, export_yup=True, export_image_format='AUTO', export_morph=False, export_apply=False)
