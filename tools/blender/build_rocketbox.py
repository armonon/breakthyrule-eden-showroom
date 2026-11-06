# Convert a Microsoft Rocketbox avatar (MIT) to the showroom's web format.
# Blender -b --factory-startup --python build_rocketbox.py -- <avatar_dir> <out_dir>
#
# mesh.bin: uint32 header length, JSON header, then at 4-byte alignment:
#   position int16x3 (metres * 16000), index uint16, uv uint16x2, normal int8x3 padded to 4, joints uint8x4, weights uint8x4
# Coordinates: metres, y up, facing +z, the character's left at +x, scaled so the eyes sit at 1.62 m.
# Bones are renamed to the rig names character-motion.js expects; face bones merge into the head; arms hang from the
# chest and legs from the pelvis, so hiding the head in first person cannot take the arms with it.
import json, os, struct, sys
import bpy
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
adir, out = argv[0].rstrip('/'), argv[1]
os.makedirs(out, exist_ok=True)
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
avatar = os.path.basename(adir)
bpy.ops.import_scene.fbx(filepath=f'{adir}/Export/{avatar}.fbx')
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mesh_obj = next(o for o in bpy.data.objects if o.type == 'MESH')
me = mesh_obj.data
EYE_HEIGHT = 1.62

RIG = [('root', None, 'Pelvis'), ('spine03', 'root', 'Spine'), ('spine02', 'spine03', 'Spine1'), ('spine01', 'spine02', 'Spine2'),
       ('neck01', 'spine01', 'Neck'), ('head', 'neck01', 'Head')]
for s in 'LR':
    RIG += [(f'clavicle.{s}', 'spine01', f'{s} Clavicle'), (f'upperarm01.{s}', f'clavicle.{s}', f'{s} UpperArm'),
            (f'lowerarm01.{s}', f'upperarm01.{s}', f'{s} Forearm'), (f'wrist.{s}', f'lowerarm01.{s}', f'{s} Hand')]
    for finger, n in (('thumb', 0), ('index', 1), ('middle', 2), ('ring', 3), ('pinky', 4)):
        RIG += [(f'{finger}1.{s}', f'wrist.{s}', f'{s} Finger{n}'), (f'{finger}2.{s}', f'{finger}1.{s}', f'{s} Finger{n}1'),
                (f'{finger}3.{s}', f'{finger}2.{s}', f'{s} Finger{n}2')]
    RIG += [(f'upperleg01.{s}', 'root', f'{s} Thigh'), (f'lowerleg01.{s}', f'upperleg01.{s}', f'{s} Calf'),
            (f'foot.{s}', f'lowerleg01.{s}', f'{s} Foot'), (f'toes.{s}', f'foot.{s}', f'{s} Toe0')]
names = [r[0] for r in RIG]
index_of = {n: i for i, n in enumerate(names)}
to_ours = {'Bip01 ' + r[2]: r[0] for r in RIG}

world = lambda n: arm.matrix_world @ arm.data.bones[n].head_local
eye_z = world('Bip01 LEye').z
floor = min((mesh_obj.matrix_world @ v.co).z for v in me.vertices)
K = EYE_HEIGHT / (eye_z - floor)
to_web = lambda p: [p[0] * K, (p[2] - floor) * K, -p[1] * K]
bones = [{'name': n, 'parent': index_of[p] if p else -1, 'position': [round(c, 5) for c in to_web(world('Bip01 ' + src))]} for n, p, src in RIG]

groups = {g.index: g.name for g in mesh_obj.vertex_groups}
missing = set()
def influences(v):
    w = {}
    for g in v.groups:
        name = groups[g.group]
        ours = to_ours.get(name)
        if ours is None:
            if name.startswith('Bip01'): ours = 'head'  # every face bone rides the head
            else:
                missing.add(name); continue
        w[index_of[ours]] = w.get(index_of[ours], 0) + g.weight
    top = sorted(w.items(), key=lambda kv: -kv[1])[:4]
    total = sum(x for _, x in top) or 1
    q = [int(round(x / total * 255)) for _, x in top]
    if q: q[0] += 255 - sum(q)
    j = [b for b, _ in top] + [0] * (4 - len(top))
    return j, q + [0] * (4 - len(q))

me.calc_loop_triangles()
uv_layer = me.uv_layers.active.data
normals = me.corner_normals
matrix = mesh_obj.matrix_world
rot = matrix.to_3x3().normalized()
verts, remap, by_material = [], {}, {}
cached = {}
for tri in me.loop_triangles:
    corners = by_material.setdefault(tri.material_index, [])
    for loop in tri.loops:
        vi = me.loops[loop].vertex_index
        uv = uv_layer[loop].uv
        n = rot @ normals[loop].vector
        key = (vi, round(uv[0], 5), round(uv[1], 5), round(n.x, 2), round(n.y, 2), round(n.z, 2))
        i = remap.get(key)
        if i is None:
            i = remap[key] = len(verts)
            if vi not in cached: cached[vi] = influences(me.vertices[vi])
            verts.append((to_web(matrix @ me.vertices[vi].co), (uv[0], uv[1]), (n.x, n.z, -n.y), *cached[vi]))
        corners.append(i)
if missing: print('UNWEIGHTED GROUPS', missing)
assert len(verts) < 65536

uvs = np.array([v[1] for v in verts])
uv_min, uv_max = uvs.min(0), uvs.max(0)
position = np.round(np.array([v[0] for v in verts]) * 16000).astype(np.int16)
uv = np.round((uvs - uv_min) / (uv_max - uv_min) * 65535).astype(np.uint16)
normal = np.zeros((len(verts), 4), np.int8)
normal[:, :3] = np.round(np.array([v[2] for v in verts]) * 127).astype(np.int8)
joints = np.array([v[3] for v in verts], np.uint8)
weights = np.array([v[4] for v in verts], np.uint8)
order, sections, start = [], [], 0
for m in sorted(by_material):
    stem = me.materials[m].name.split('.')[0]
    kind = 'opacity' if 'opacity' in stem else 'head' if 'head' in stem else 'body'
    order += by_material[m]
    sections.append({'material': kind, 'start': start, 'count': len(by_material[m])}); start += len(by_material[m])
index = np.array(order, np.uint16)

# Save textures small: colour at 1024, normals at 512; no specular, the game's shading is Lambert.
scene = bpy.context.scene
scene.render.image_settings.file_format = 'WEBP'
scene.view_settings.look = 'None'
def save(stem, kind, size, alpha=False, colour=True):
    img = bpy.data.images.load(f'{adir}/Textures/{stem}_{kind}.tga')
    if not colour: img.colorspace_settings.name = 'Non-Color'
    scene.view_settings.view_transform = 'Standard' if colour else 'Raw'
    scene.render.image_settings.color_mode = 'RGBA' if alpha else 'RGB'
    scene.render.image_settings.quality = 80 if colour else 72
    img.scale(size, size)
    name = f'{out}/{stem.split("_")[-1]}{"" if colour else "-n"}.webp'
    img.save_render(name, scene=scene); bpy.data.images.remove(img)

for m in me.materials:
    stem = m.name.split('.')[0]
    if 'opacity' in stem: save(stem, 'color', 1024, alpha=True)
    else:
        save(stem, 'color', 1024); save(stem, 'normal', 512, colour=False)

header = json.dumps({'source': avatar, 'vertices': len(verts), 'triangles': len(index) // 3, 'bones': bones, 'sections': sections,
                     'uv': [*map(float, uv_min), *map(float, uv_max)], 'hipY': bones[0]['position'][1],
                     'eyeY': EYE_HEIGHT, 'top': float(position[:, 1].max()) / 16000}, separators=(',', ':')).encode()
header += b' ' * (-(4 + len(header)) % 4)
with open(f'{out}/mesh.bin', 'wb') as f:
    f.write(struct.pack('<I', len(header))); f.write(header)
    for block in (position, index, uv, normal, joints, weights): f.write(block.tobytes())
print('BUILT', avatar, 'verts', len(verts), 'tris', len(index) // 3, 'bytes', os.path.getsize(f'{out}/mesh.bin'), [s['material'] for s in sections], 'top', float(position[:, 1].max()) / 16000)
