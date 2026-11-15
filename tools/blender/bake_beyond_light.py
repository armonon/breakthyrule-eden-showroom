"""Cycles night district bake. See docs/beyond-bake/README.md for units and reproduction.
Ground stores sky + bounced moon + lamps. Live moon retains dynamic character shadows;
static moon visibility is baked separately for ground and probes. No gameplay data changes.
"""
import argparse
import json
import math
import os
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Vector

a = argparse.ArgumentParser()
a.add_argument("--scene", required=True)
a.add_argument("--out", required=True)
a.add_argument("--size", type=int, default=2048)
a.add_argument("--samples", type=int, default=128)
a.add_argument("--probe-samples", type=int, default=64)
a.add_argument("--probe-min", type=float, nargs=3)
a.add_argument("--probe-max", type=float, nargs=3)
a.add_argument("--probe-step", type=float, nargs=3, default=[4, 3, 4])
args = a.parse_args(sys.argv[sys.argv.index("--") + 1:])
os.makedirs(args.out, exist_ok=True)
lighting = json.load(open(os.path.join(args.scene,"lighting.json")))
assert lighting["world"] == "beyond", "Export using --world beyond"
SUN_STRENGTH, SUN_POS = lighting["moon"]["intensity"], lighting["moon"]["direction"]
SUN_COLOR = lighting["moon"]["color"]
x0,x1,z0,z1 = lighting["bounds"]
bounds = [x0-4,x1+4,z0-4,z1+4]
args.probe_min = args.probe_min or [bounds[0],.4,bounds[2]]
args.probe_max = args.probe_max or [bounds[1],36.4,bounds[3]]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
try:
    prefs.compute_device_type = "METAL"; prefs.get_devices()
    for d in prefs.devices: d.use = d.type != "CPU"
    scene.cycles.device = "GPU" if any(d.use for d in prefs.devices) else "CPU"
except (TypeError, RuntimeError):
    scene.cycles.device = "CPU"
print("[bake] device",scene.cycles.device,flush=True)
scene.cycles.max_bounces = 4
scene.cycles.diffuse_bounces = 3
scene.cycles.transparent_max_bounces = 6
scene.cycles.use_adaptive_sampling = False
scene.render.bake.margin = 4


def Bl(x, y, z):  # game (Y up) -> Blender (Z up)
    return (x, -z, y)


# ---------------------------------------------------------------- geometry
meta = json.load(open(os.path.join(args.scene, "scene.json")))
data = np.fromfile(os.path.join(args.scene, "scene.bin"), dtype=np.float32)
terrain = None
for i, b in enumerate(meta):
    tri = data[b["offset"]:b["offset"] + b["n"]].reshape(-1, 3)
    if b["name"] != "terrain" and not len(tri): continue
    co = np.stack([tri[:, 0], -tri[:, 2], tri[:, 1]], axis=1)
    n = len(co) // 3
    if b["name"] == "terrain":
        # weld so the bake interpolates smoothly and normals stay continuous
        uniq, inv = np.unique(np.round(co, 4), axis=0, return_inverse=True)
        faces = inv.reshape(-1, 3)
        verts = uniq
    else:
        verts, faces = co, np.arange(n * 3).reshape(-1, 3)
    me = bpy.data.meshes.new(f"m{i}")
    me.vertices.add(len(verts)); me.vertices.foreach_set("co", verts.astype(np.float32).ravel())
    me.loops.add(faces.size); me.loops.foreach_set("vertex_index", faces.ravel())
    me.polygons.add(len(faces)); me.polygons.foreach_set("loop_start", np.arange(len(faces)) * 3); me.polygons.foreach_set("loop_total", np.full(len(faces), 3))
    me.update(calc_edges=True)
    mat = bpy.data.materials.new(b["name"]); mat.use_nodes = True
    nt = mat.node_tree; out = nt.nodes["Material Output"]; nt.nodes.remove(nt.nodes["Principled BSDF"])
    diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse"); diffuse.inputs["Color"].default_value = (*b["albedo"][:3], 1)
    if b["cutout"]:
        mix = nt.nodes.new("ShaderNodeMixShader"); mix.inputs[0].default_value = .55
        nt.links.new(nt.nodes.new("ShaderNodeBsdfTransparent").outputs[0], mix.inputs[1]); nt.links.new(diffuse.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs["Surface"])
    else:
        nt.links.new(diffuse.outputs[0], out.inputs["Surface"])
    me.materials.append(mat)
    ob = bpy.data.objects.new(b["name"], me); scene.collection.objects.link(ob)
# Bake onto a planar receiver just above road/floor/verge surfaces; original geometry
# still occludes rays. This avoids UV overlaps from their separate tiled UV sets.
x0,x1,z0,z1=bounds
me=bpy.data.meshes.new("ground receiver")
verts=[Bl(x0,.04,z1),Bl(x1,.04,z1),Bl(x1,.04,z0),Bl(x0,.04,z0)]
me.from_pydata(verts,[],[(0,1,2,3)]);me.update()
terrain=bpy.data.objects.new("ground receiver",me);scene.collection.objects.link(terrain)
mat=bpy.data.materials.new("ground bake");mat.use_nodes=True;me.materials.append(mat)
uv=me.uv_layers.new(name="bake");uv.data.foreach_set("uv",[0,0,1,0,1,1,0,1])
print(f"[bake] {len(meta)} buckets, {len(data)//9} triangles, bounds {bounds}",flush=True)

# ---------------------------------------------------------------- light
world = bpy.data.worlds.new("sky"); scene.world = world; world.use_nodes = True
W, H = 256, 128
sun_dir = np.array(SUN_POS, float); sun_dir /= np.linalg.norm(sun_dir)
env = np.zeros((H, W, 4), np.float32); env[..., 3] = 1


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)


# same radiance as eden-lighting.js's environment shader (strength .7), in linear values
theta = (np.arange(H) + .5) / H * math.pi; phi = (np.arange(W) + .5) / W * 2 * math.pi - math.pi
st, ct = np.sin(theta)[:, None], np.cos(theta)[:, None]
dy = np.repeat(ct, W, 1); dx = st * np.cos(phi)[None, :]; dz = st * np.sin(phi)[None, :]
pw=np.power(np.maximum(dy,0),.45)[...,None]
env[...,:3]=((1-pw)*np.array(lighting["sky"]["horizon"])+pw*np.array(lighting["sky"]["zenith"]))*lighting["sky"]["strength"]
img = bpy.data.images.new("sky", W, H, float_buffer=True); img.colorspace_settings.name = "Non-Color"
img.pixels.foreach_set(env[::-1].ravel())
envt = world.node_tree.nodes.new("ShaderNodeTexEnvironment"); envt.image = img
bg = world.node_tree.nodes["Background"]; world.node_tree.links.new(envt.outputs[0], bg.inputs["Color"])

sun = bpy.data.lights.new("sun", "SUN"); sun.energy = SUN_STRENGTH; sun.color = SUN_COLOR; sun.angle = math.radians(2.5)
sun_ob = bpy.data.objects.new("sun", sun); scene.collection.objects.link(sun_ob)
to_sun = Vector(Bl(*SUN_POS)).normalized()
sun_ob.rotation_euler = to_sun.to_track_quat("Z", "Y").to_euler()


lamps=[]
for i,pos in enumerate(lighting["lamps"]):
    L=bpy.data.lights.new(f"lamp {i}","POINT");L.energy=4*math.pi*lighting["lamp"]["intensity"];L.color=lighting["lamp"]["color"];L.shadow_soft_size=.12
    # Match three's finite-distance falloff: inverse-square times r^(2-decay)
    # and (1-(r/range)^4)^2. Ray length is measured at the emitter.
    L.use_nodes=True;nodes=L.node_tree.nodes;links=L.node_tree.links
    emission=next((n for n in nodes if n.type=="EMISSION"),None)
    if emission:
        length=nodes.new("ShaderNodeLightPath").outputs["Ray Length"]
        def op(kind,a,b):
            n=nodes.new("ShaderNodeMath");n.operation=kind
            if isinstance(a,(float,int)):n.inputs[0].default_value=a
            else:links.new(a,n.inputs[0])
            if isinstance(b,(float,int)):n.inputs[1].default_value=b
            else:links.new(b,n.inputs[1])
            return n.outputs[0]
        r=op("MAXIMUM",length,.1);power=op("POWER",r,2-lighting["lamp"]["decay"])
        fall=op("POWER",op("DIVIDE",r,lighting["lamp"]["distance"]),4)
        fall=op("POWER",op("MAXIMUM",op("SUBTRACT",1,fall),0),2)
        links.new(op("MULTIPLY",op("MULTIPLY",power,fall),L.energy),emission.inputs["Strength"])
    ob=bpy.data.objects.new(L.name,L);ob.location=Bl(*pos);scene.collection.objects.link(ob);lamps.append(ob)
def setup(sky_on,sun_on,lamps_on=False):
    bg.inputs["Strength"].default_value=1 if sky_on else 0
    sun_ob.hide_render=not sun_on;sun.energy=SUN_STRENGTH if sun_on else 0
    for ob in lamps:ob.hide_render=not lamps_on


def bake(ob, target_image=None, passes=("DIRECT", "INDIRECT"), samples=64, vertex=False):
    scene.cycles.samples = samples
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bk = scene.render.bake
    bk.use_pass_direct, bk.use_pass_indirect, bk.use_pass_color = "DIRECT" in passes, "INDIRECT" in passes, False
    bk.target = "VERTEX_COLORS" if vertex else "IMAGE_TEXTURES"
    t = time.time()
    bpy.ops.object.bake(type="DIFFUSE")
    print(f"[bake] {ob.name} {passes} {samples} spp: {time.time() - t:.0f}s", flush=True)


# ---------------------------------------------------------------- terrain
mat = terrain.data.materials[0]; nt = mat.node_tree
tex = nt.nodes.new("ShaderNodeTexImage"); nt.nodes.active = tex
uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "bake"; nt.links.new(uvn.outputs[0], tex.inputs[0])
image = bpy.data.images.new("bake", args.size, args.size, float_buffer=True); image.colorspace_settings.name = "Non-Color"; tex.image = image


def grab():
    px = np.empty(args.size * args.size * 4, np.float32); image.pixels.foreach_get(px)
    return px.reshape(args.size, args.size, 4)[:, :, :3].copy()  # row 0 = v 0


setup(True, False); bake(terrain, samples=args.samples); skyp = grab()
setup(False, True); bake(terrain, passes=("INDIRECT",), samples=args.samples); bounce = grab()
setup(False,False,True);bake(terrain,samples=args.samples);lamp_light=grab()
np.save(os.path.join(args.out,"ground_indirect.npy"),skyp+bounce+lamp_light)
setup(False,True)
bake(terrain, passes=("DIRECT",), samples=max(32, args.samples // 2)); direct = grab()
# visibility: direct / unshadowed cosine term of the terrain's own normal, approximated with the flat-ground cosine
cos0 = max(to_sun.z, .01)
np.save(os.path.join(args.out, "ground_sun.npy"), np.clip(direct.mean(axis=2) * math.pi / (SUN_STRENGTH * (sum(SUN_COLOR)/3) * cos0), 0, 1))
np.save(os.path.join(args.out,"ground_lit.npy"),skyp+bounce+lamp_light+direct)
bpy.data.images.remove(image)

# ---------------------------------------------------------------- probes: six tiny quads per grid point, baked to vertices
lo, hi, step = np.array(args.probe_min), np.array(args.probe_max), np.array(args.probe_step)
dims = np.round((hi - lo) / step).astype(int) + 1
print("[bake] probe grid", dims.tolist(), int(dims.prod()), flush=True)
R = .05
bm = bmesh.new()
dirs = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]  # game axes
for iz in range(dims[2]):
    for iy in range(dims[1]):
        for ix in range(dims[0]):
            p = lo + step * (ix, iy, iz)
            for d in dirs:
                n = Vector(Bl(*d)); c0 = Vector(Bl(*p)) + n * R
                u = n.orthogonal().normalized(); v = n.cross(u)
                vs = [bm.verts.new(c0 + (u * a_ + v * b_) * R) for a_, b_ in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
                bm.faces.new(vs)
me = bpy.data.meshes.new("probes"); bm.to_mesh(me); bm.free()
probe = bpy.data.objects.new("probes", me); scene.collection.objects.link(probe)
pm = bpy.data.materials.new("probe"); pm.use_nodes = True; me.materials.append(pm)
ca = me.color_attributes.new("bake", "FLOAT_COLOR", "POINT"); me.color_attributes.active_color = ca


def grab_probes():
    a_ = np.empty(len(me.vertices) * 4, np.float32); ca.data.foreach_get("color", a_)
    return a_.reshape(-1, 4, 4)[:, :, :3].mean(axis=1)


setup(True, False); bake(probe, samples=args.probe_samples, vertex=True); total = grab_probes()
setup(False, True); bake(probe, passes=("INDIRECT",), samples=args.probe_samples, vertex=True); total = total + grab_probes()
setup(False,False,True);bake(probe,samples=args.probe_samples,vertex=True);total+=grab_probes()
setup(False,True);bake(probe,passes=("DIRECT",),samples=args.probe_samples,vertex=True)
sun_probes=grab_probes().reshape(dims[2],dims[1],dims[0],6,3)
expected=SUN_STRENGTH*np.mean(SUN_COLOR)*np.abs(SUN_POS).sum()/6/math.pi
np.save(os.path.join(args.out,"probe_sun.npy"),np.clip(sun_probes.mean(axis=(3,4))/max(expected,1e-6),0,1))
np.save(os.path.join(args.out, "probes.npy"), total.reshape(dims[2], dims[1], dims[0], 6, 3))
json.dump({"min": lo.tolist(), "step": step.tolist(), "dims": dims.tolist(), "dirs": dirs, "bounds": bounds,"world":"beyond", "unit": "bake value; runtime irradiance = value * pi"}, open(os.path.join(args.out, "probes.json"), "w"))
print("[bake] done", flush=True)

json.dump(lighting,open(os.path.join(args.out,"lighting.json"),"w"),indent=2)
