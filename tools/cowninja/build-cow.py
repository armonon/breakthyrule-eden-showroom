# Builds assets/cowninja/cow.glb from the CC0 "Realtime Ranchers" cow (Iconoclast, opengameart.org/content/
# realtime-ranchers-3d-model-pack): scales it to a real cow (2.4 m, hooves on the ground, head toward -Z in glTF),
# gives it a 23-bone skeleton with automatic weights, and writes a GLB with WebP textures.
# Run with Blender's Python module:  python build-cow.py -- <dir with cowTM08New00RTime02.blend + textures> <out.glb> [pose.png]
import bpy, sys, math, mathutils
V = mathutils.Vector
args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
bpy.ops.wm.open_mainfile(filepath=src + '/cowTM08New00RTime02.blend')
S, LIFT = 2.4 / 9.84, 3.2
for o in list(bpy.data.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o)
body, eyes = bpy.data.objects['Cube'], bpy.data.objects['Cube.001']
for o in (body, eyes):
    o.vertex_groups.clear()
    for v in o.data.vertices: v.co = V((v.co.x, v.co.y, v.co.z + LIFT)) * S
    o.name = 'cow' if o is body else 'cow-eyes'

# Skeleton, in the source model's units (x left/right, y toward the head, z up from the hooves' -3.2).
P = lambda x, y, z: V((x, y, z + LIFT)) * S
BONES = [  # name, head, tail, parent
    ('body', (0, -.6, 1.2), (0, -.6, 2.0), None),
    ('chest', (0, -1.0, 1.85), (0, 1.9, 1.95), 'body'),
    ('pelvis', (0, -1.0, 1.85), (0, -3.9, 2.05), 'body'),
    ('neck', (0, 1.9, 1.95), (0, 3.2, 2.25), 'chest'),
    ('head', (0, 3.2, 2.25), (0, 4.8, 1.0), 'neck'),
    ('tail1', (0, -4.5, 2.15), (0, -4.62, 1.0), 'pelvis'),
    ('tail2', (0, -4.62, 1.0), (0, -4.6, -.2), 'tail1'),
    ('tail3', (0, -4.6, -.2), (0, -4.53, -1.5), 'tail2'),
]
for side, sx in (('L', -1), ('R', 1)):
    BONES += [
        ('fl-shoulder.' + side, (sx * 1.0, 1.3, .9), (sx * .88, .98, -.8), 'chest'),
        ('fl-fore.' + side, (sx * .88, .98, -.8), (sx * 1.0, 1.15, -1.9), 'fl-shoulder.' + side),
        ('fl-cannon.' + side, (sx * 1.0, 1.15, -1.9), (sx * 1.05, 1.2, -2.75), 'fl-fore.' + side),
        ('fl-hoof.' + side, (sx * 1.05, 1.2, -2.75), (sx * 1.1, 1.65, -3.12), 'fl-cannon.' + side),
        ('bl-thigh.' + side, (sx * .95, -3.0, 1.0), (sx * .75, -3.15, -.45), 'pelvis'),
        ('bl-gaskin.' + side, (sx * .75, -3.15, -.45), (sx * .65, -4.05, -1.45), 'bl-thigh.' + side),
        ('bl-cannon.' + side, (sx * .65, -4.05, -1.45), (sx * .67, -4.1, -2.65), 'bl-gaskin.' + side),
        ('bl-hoof.' + side, (sx * .67, -4.1, -2.65), (sx * .7, -3.6, -3.12), 'bl-cannon.' + side),
    ]
arm = bpy.data.objects.new('cow-rig', bpy.data.armatures.new('cow-rig'))
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
made = {}
for name, head, tail, parent in BONES:
    b = arm.data.edit_bones.new(name); b.head, b.tail = P(*head), P(*tail)
    if parent: b.parent = made[parent]
    made[name] = b
bpy.ops.object.mode_set(mode='OBJECT')

# Automatic (bone heat) weights for the body; the eyes ride the head.
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
unweighted = sum(1 for v in body.data.vertices if not v.groups)
print('UNWEIGHTED', unweighted, 'of', len(body.data.vertices))
if unweighted:  # islands bone heat could not reach: give each to its nearest bone
    segs = [(n, P(*h), P(*t)) for n, h, t, _ in BONES]
    for v in body.data.vertices:
        if v.groups: continue
        best = min(segs, key=lambda s: (v.co - (s[1] + (s[2] - s[1]) * max(0, min(1, (v.co - s[1]).dot(s[2] - s[1]) / (s[2] - s[1]).length_squared)))).length)
        body.vertex_groups[best[0]].add([v.index], 1, 'REPLACE')
eyes.parent = arm; m = eyes.modifiers.new('rig', 'ARMATURE'); m.object = arm
eyes.vertex_groups.new(name='head').add([v.index for v in eyes.data.vertices], 1, 'REPLACE')
for p in body.data.polygons: p.use_smooth = True
for o in (body, eyes):
    for a in list(o.data.color_attributes): o.data.color_attributes.remove(a)
    print('UV', [u.name for u in o.data.uv_layers])

# One PBR material from the source maps (the opacity in the colour map's alpha is not wanted: the hide is solid).
def image(name):
    i = bpy.data.images.load(src + '/' + name); i.pixels[0]  # force the pixels in before scaling
    if i.size[0] > 1024: i.scale(1024, 1024)
    return i
def material(name, colour, normal=None, rough=.62):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']; bsdf.inputs['Roughness'].default_value = rough
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVTex'
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = image(colour); nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color']); nt.links.new(uv.outputs['UV'], tex.inputs['Vector'])
    if normal:
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = image(normal); n.image.colorspace_settings.name = 'Non-Color'; nt.links.new(uv.outputs['UV'], n.inputs['Vector'])
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = .8
        nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return mat
body.data.materials.clear(); body.data.materials.append(material('cow-hide', 'colorOpacityCow.png', 'colorOpacityCowNorm.png'))
eyes.data.materials.clear(); eyes.data.materials.append(material('cow-eye', 'cowEye.png', None, .15))

if len(args) > 2:  # a posed check render: gallop-ish legs, head down
    for name, rx in (('fl-shoulder.L', .6), ('fl-fore.L', -.9), ('bl-thigh.R', -.6), ('bl-gaskin.R', .7), ('neck', .5), ('tail1', -.9), ('fl-shoulder.R', -.5), ('bl-thigh.L', .5)):
        b = arm.pose.bones[name]; b.rotation_mode = 'XYZ'; b.rotation_euler = (rx, 0, 0)
    sc = bpy.context.scene
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (-4.2, .6, 1.3); cam.rotation_euler = (V((0, 0, .75)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (.9, 0, -1.2); sc.collection.objects.link(sun)
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.5, .55, .6, 1)
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 12; sc.render.resolution_x, sc.render.resolution_y = 640, 400; sc.render.filepath = args[2]
    bpy.ops.render.render(write_still=True)
    for b in arm.pose.bones: b.rotation_euler = (0, 0, 0)
    bpy.data.objects.remove(cam); bpy.data.objects.remove(sun)

bpy.ops.object.select_all(action='DESELECT')
for o in (arm, body, eyes): o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_image_format='WEBP', export_image_quality=82,
                          export_animations=False, export_yup=True, export_skins=True, export_apply=False)
print('WROTE', out)
