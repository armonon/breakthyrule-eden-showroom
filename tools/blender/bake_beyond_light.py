"""Cycles night district bake (Beyond Eden, always night). Units: game metres, Y up; values are Cycles DIFFUSE bakes
without colour, so runtime irradiance = value * pi (tools/pipeline/encode-beyond-light.py does that and packs the files).

Each kind of light is baked on its own, so the encoder can weigh them without a rebake:
  sky      moonlit sky, direct + bounce
  lamps    street lamps, lanterns, braziers and the altar's candles, direct + bounce
  uplight  the architectural wash on the buildings (an emissive term in matrix-world.js), as light on what is near them
  moon     bounce only: the moon itself stays a live light, cut by the baked visibility below
  live     bounce only, from the lights the game also runs live near the player (altar, pyramid lamps)
  moonvis  the moon's direct light alone, for its static shadow
  local    lamps + live lights, direct only, for their static shadow (the encoder divides by the unshadowed value)

Receivers: a plane just over the ground (the lightmap), and two probe grids baked to vertices: the coarse grid over the
whole district and a fine one over the courtyard and altar, where the models stand. Probes inside solid geometry are
marked, so the encoder can fill them from their neighbours instead of leaking black onto the surfaces around them.

  Blender -b --factory-startup --python tools/blender/bake_beyond_light.py -- --scene DIR --out DIR
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
a.add_argument("--samples", type=int, default=96)
a.add_argument("--vis-samples", type=int, default=48, help="the moon's shadow")
a.add_argument("--local-samples", type=int, default=384, help="the lamps' shadow: one of many lamps is sampled per ray, so it needs more")
a.add_argument("--probe-samples", type=int, default=32)
a.add_argument("--probe-min", type=float, nargs=3)
a.add_argument("--probe-max", type=float, nargs=3)
a.add_argument("--probe-step", type=float, nargs=3, default=[4, 3, 4])
a.add_argument("--detail-min", type=float, nargs=3)
a.add_argument("--detail-max", type=float, nargs=3)
a.add_argument("--detail-step", type=float, nargs=3, default=[1, .75, 1])
a.add_argument("--no-detail", action="store_true")
a.add_argument("--skip", default="", help="comma list of ground,probes (for trials)")
a.add_argument("--passes", default="", help="comma list of passes to bake again into an existing --out (default: all; 'inside' redoes only the probes-inside-geometry test)")
args = a.parse_args(sys.argv[sys.argv.index("--") + 1:])
os.makedirs(args.out, exist_ok=True)
T0 = time.time()
lighting = json.load(open(os.path.join(args.scene, "lighting.json")))
assert lighting["world"] == "beyond", "Export using --world beyond"
SUN_STRENGTH, SUN_POS = lighting["moon"]["intensity"], lighting["moon"]["direction"]
SUN_COLOR = lighting["moon"]["color"]
x0, x1, z0, z1 = lighting["bounds"]
bounds = [x0 - 4, x1 + 4, z0 - 4, z1 + 4]
args.probe_min = args.probe_min or [bounds[0], .4, bounds[2]]
args.probe_max = args.probe_max or [bounds[1], 36.4, bounds[3]]
court = lighting.get("courtyard")
if not court: args.no_detail = True
if not args.no_detail:
    half = court["r"] + 2
    args.detail_min = args.detail_min or [court["x"] - half, .3, court["z"] - half]
    args.detail_max = args.detail_max or [court["x"] + half, 8.55, court["z"] + half]

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
print("[bake] device", scene.cycles.device, flush=True)
scene.cycles.max_bounces = 4
scene.cycles.diffuse_bounces = 3
scene.cycles.transparent_max_bounces = 6
scene.cycles.use_adaptive_sampling = False
scene.cycles.sample_clamp_indirect = 4
scene.render.bake.margin = 4


def Bl(x, y, z):  # game (Y up) -> Blender (Z up)
    return (x, -z, y)


def math_node(nodes, links, kind, a_, b_=None):
    n = nodes.new("ShaderNodeMath"); n.operation = kind
    for i, v in enumerate((a_, b_)):
        if v is None: continue
        if isinstance(v, (float, int)): n.inputs[i].default_value = v
        else: links.new(v, n.inputs[i])
    return n.outputs[0]


# ---------------------------------------------------------------- geometry
meta = json.load(open(os.path.join(args.scene, "scene.json")))
data = np.fromfile(os.path.join(args.scene, "scene.bin"), dtype=np.float32)
UP = lighting.get("uplight")
wash_switches, cutouts, washed, opened = [], [], 0, 0
# A lamp's light sits inside its own lantern, whose glass and cap would shut it in: the fixture's triangles within
# FIXTURE metres of a lamp are left out, so it lights the ground the way the live lamp (which has no shadow) does.
FIXTURE = .6
lamp_at = np.array(lighting["lamps"], np.float32).reshape(-1, 3)
for i, b in enumerate(meta):
    tri = data[b["offset"]:b["offset"] + b["n"]].reshape(-1, 3)
    if len(tri) and len(lamp_at):
        centre = tri.reshape(-1, 3, 3).mean(axis=1); keep = np.ones(len(centre), bool)
        for p in lamp_at: keep &= ((centre - p) ** 2).sum(axis=1) > FIXTURE * FIXTURE
        opened += int((~keep).sum()); tri = tri.reshape(-1, 3, 3)[keep].reshape(-1, 3)
    if not len(tri): continue
    co = np.stack([tri[:, 0], -tri[:, 2], tri[:, 1]], axis=1)
    n = len(co) // 3
    verts, faces = co, np.arange(n * 3).reshape(-1, 3)
    me = bpy.data.meshes.new(f"m{i}")
    me.vertices.add(len(verts)); me.vertices.foreach_set("co", verts.astype(np.float32).ravel())
    me.loops.add(faces.size); me.loops.foreach_set("vertex_index", faces.ravel())
    me.polygons.add(len(faces)); me.polygons.foreach_set("loop_start", np.arange(len(faces)) * 3); me.polygons.foreach_set("loop_total", np.full(len(faces), 3))
    me.update(calc_edges=True)
    mat = bpy.data.materials.new(b["name"]); mat.use_nodes = True
    nt = mat.node_tree; out = nt.nodes["Material Output"]; nt.nodes.remove(nt.nodes["Principled BSDF"])
    albedo = [min(max(c, 0), .9) for c in b["albedo"][:3]]
    diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse"); diffuse.inputs["Color"].default_value = (*albedo, 1)
    surface = diffuse.outputs[0]
    if b["cutout"]:
        mix = nt.nodes.new("ShaderNodeMixShader"); mix.inputs[0].default_value = .55
        nt.links.new(nt.nodes.new("ShaderNodeBsdfTransparent").outputs[0], mix.inputs[1]); nt.links.new(diffuse.outputs[0], mix.inputs[2])
        surface = mix.outputs[0]
    elif b.get("wash") and UP:
        # The wall wash of matrix-world.js as emitted light: warm pools that fade with height on walls, a little cool on tops.
        N, L = nt.nodes, nt.links
        geo = N.new("ShaderNodeNewGeometry")
        sp = N.new("ShaderNodeSeparateXYZ"); L.new(geo.outputs["Position"], sp.inputs[0])
        sn = N.new("ShaderNodeSeparateXYZ"); L.new(geo.outputs["True Normal"], sn.inputs[0])
        h = math_node(N, L, "MAXIMUM", sp.outputs["Z"], 0.0)
        near = math_node(N, L, "MULTIPLY", math_node(N, L, "EXPONENT", math_node(N, L, "MULTIPLY", h, -UP["nearFall"])), UP["near"])
        far = math_node(N, L, "MULTIPLY", math_node(N, L, "EXPONENT", math_node(N, L, "MULTIPLY", h, -UP["farFall"])), UP["far"])
        wall = math_node(N, L, "MULTIPLY", math_node(N, L, "SUBTRACT", 1.0, math_node(N, L, "ABSOLUTE", sn.outputs["Z"])), math_node(N, L, "SUBTRACT", 1.0, geo.outputs["Backfacing"]))  # the face the game draws
        warm = math_node(N, L, "MULTIPLY", math_node(N, L, "MULTIPLY", math_node(N, L, "ADD", near, far), wall), UP["pool"])
        top = math_node(N, L, "MAXIMUM", sn.outputs["Z"], 0.0)

        def scaled(colour, factor):
            v = N.new("ShaderNodeVectorMath"); v.operation = "SCALE"; v.inputs[0].default_value = colour; L.new(factor, v.inputs["Scale"]); return v.outputs[0]
        add = N.new("ShaderNodeVectorMath"); add.operation = "ADD"
        L.new(scaled([albedo[k] * UP["tint"][k] for k in range(3)], warm), add.inputs[0]); L.new(scaled([albedo[k] * UP["top"][k] for k in range(3)], top), add.inputs[1])
        add2 = N.new("ShaderNodeVectorMath"); add2.operation = "ADD"; L.new(add.outputs[0], add2.inputs[0]); add2.inputs[1].default_value = [albedo[k] * UP["glow"][k] for k in range(3)]
        em = N.new("ShaderNodeEmission"); L.new(add2.outputs[0], em.inputs["Color"]); em.inputs["Strength"].default_value = 0
        both = N.new("ShaderNodeAddShader"); L.new(diffuse.outputs[0], both.inputs[0]); L.new(em.outputs[0], both.inputs[1])
        surface = both.outputs[0]; wash_switches.append(em.inputs["Strength"]); washed += n
    nt.links.new(surface, out.inputs["Surface"])
    me.materials.append(mat)
    ob = bpy.data.objects.new(b["name"], me); scene.collection.objects.link(ob)
    if b["cutout"]: cutouts.append(ob)
print(f"[bake] {len(meta)} buckets, {len(data)//9} triangles ({washed} washed, {opened} lamp fixture triangles left out), bounds {bounds}", flush=True)

# ---------------------------------------------------------------- probe positions, and which of them sit inside something solid
dirs = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]  # game axes
grids = {"coarse": (np.array(args.probe_min), np.array(args.probe_max), np.array(args.probe_step))}
if not args.no_detail: grids["detail"] = (np.array(args.detail_min), np.array(args.detail_max), np.array(args.detail_step))
grid_info, points = {}, []
for name, (lo, hi, step) in grids.items():
    dims = np.round((hi - lo) / step).astype(int) + 1
    grid_info[name] = {"min": lo.tolist(), "step": step.tolist(), "dims": dims.tolist(), "start": len(points)}
    for iz in range(dims[2]):
        for iy in range(dims[1]):
            for ix in range(dims[0]):
                points.append(lo + step * (ix, iy, iz))
    print("[bake] probe grid", name, dims.tolist(), int(dims.prod()), flush=True)
points = np.array(points)
# Leaves are open cards, not solids: they must not count as "inside".
for ob in cutouts: ob.hide_viewport = True
bpy.context.view_layer.update(); deps = bpy.context.evaluated_depsgraph_get()
t = time.time(); inside = np.zeros(len(points), bool)
for k, p in enumerate(points):
    o = Vector(Bl(*p)); back = 0; reach = {}
    for d in dirs:
        dv = Vector(Bl(*d)); hit, loc, nor, _, _, _ = scene.ray_cast(deps, o, dv, distance=60)
        if hit:
            reach[d] = (loc - o).length
            if nor.dot(dv) > 0: back += 1
    # Inside: most rays leave through the back of a face; or the probe is sandwiched, something within a metre above
    # and below (steps, tables and plinths are nested or open shells, sometimes mirrored, that the first test misses;
    # the space under a bench counts too, and loses nothing by borrowing its neighbours' light).
    inside[k] = back >= 3 or (reach.get((0, 1, 0), 9) < 1 and reach.get((0, -1, 0), 9) < 1)
for ob in cutouts: ob.hide_viewport = False
print(f"[bake] {int(inside.sum())} of {len(points)} probes inside geometry: {time.time()-t:.0f}s", flush=True)
for name, g in grid_info.items():
    n = int(np.prod(g["dims"])); np.save(os.path.join(args.out, f"{name}_inside.npy"), inside[g["start"]:g["start"] + n].reshape(g["dims"][2], g["dims"][1], g["dims"][0]))

# Bake onto a planar receiver just above road/floor/verge surfaces; original geometry
# still occludes rays. This avoids UV overlaps from their separate tiled UV sets.
x0, x1, z0, z1 = bounds
me = bpy.data.meshes.new("ground receiver")
verts = [Bl(x0, .04, z1), Bl(x1, .04, z1), Bl(x1, .04, z0), Bl(x0, .04, z0)]
me.from_pydata(verts, [], [(0, 1, 2, 3)]); me.update()
terrain = bpy.data.objects.new("ground receiver", me); scene.collection.objects.link(terrain)
mat = bpy.data.materials.new("ground bake"); mat.use_nodes = True; me.materials.append(mat)
uv = me.uv_layers.new(name="bake"); uv.data.foreach_set("uv", [0, 0, 1, 0, 1, 1, 0, 1])

# ---------------------------------------------------------------- light
world = bpy.data.worlds.new("sky"); scene.world = world; world.use_nodes = True
W, H = 256, 128
env = np.zeros((H, W, 4), np.float32); env[..., 3] = 1
# same radiance as eden-lighting.js's moonlit environment, in linear values
theta = (np.arange(H) + .5) / H * math.pi
dy = np.repeat(np.cos(theta)[:, None], W, 1)
pw = np.power(np.maximum(dy, 0), .45)[..., None]
env[..., :3] = ((1 - pw) * np.array(lighting["sky"]["horizon"]) + pw * np.array(lighting["sky"]["zenith"])) * lighting["sky"]["strength"]
env[dy < -.35] *= 0  # below the horizon the game's environment falls to nothing
img = bpy.data.images.new("sky", W, H, float_buffer=True); img.colorspace_settings.name = "Non-Color"
img.pixels.foreach_set(env[::-1].ravel())
envt = world.node_tree.nodes.new("ShaderNodeTexEnvironment"); envt.image = img
bg = world.node_tree.nodes["Background"]; world.node_tree.links.new(envt.outputs[0], bg.inputs["Color"])

sun = bpy.data.lights.new("sun", "SUN"); sun.energy = SUN_STRENGTH; sun.color = SUN_COLOR; sun.angle = math.radians(2.5)
sun_ob = bpy.data.objects.new("sun", sun); scene.collection.objects.link(sun_ob)
to_sun = Vector(Bl(*SUN_POS)).normalized()
sun_ob.rotation_euler = to_sun.to_track_quat("Z", "Y").to_euler()

# Point lights with three.js's falloff: intensity * r^-decay * (1-(r/range)^4)^2 as irradiance at normal incidence.
# Measured in Blender 5.0 with a single light over an empty plane: at 1 W, a node strength of 4 pi gives exactly 1/r^2.
POINT = 4 * math.pi


def point_light(name, pos, colour, intensity, decay, distance, size=.12):
    L = bpy.data.lights.new(name, "POINT"); L.energy = 1; L.color = colour[:3]; L.shadow_soft_size = size
    L.use_nodes = True; nodes = L.node_tree.nodes; links = L.node_tree.links
    emission = next(n for n in nodes if n.type == "EMISSION")
    r = math_node(nodes, links, "MAXIMUM", nodes.new("ShaderNodeLightPath").outputs["Ray Length"], .1)
    power = math_node(nodes, links, "POWER", r, 2 - decay)
    fall = math_node(nodes, links, "POWER", math_node(nodes, links, "DIVIDE", r, distance), 4)
    fall = math_node(nodes, links, "POWER", math_node(nodes, links, "MAXIMUM", math_node(nodes, links, "SUBTRACT", 1, fall), 0), 2)
    links.new(math_node(nodes, links, "MULTIPLY", math_node(nodes, links, "MULTIPLY", power, fall), POINT * intensity), emission.inputs["Strength"])
    ob = bpy.data.objects.new(name, L); ob.location = Bl(*pos); scene.collection.objects.link(ob); return ob


LAMP, CANDLE = lighting["lamp"], lighting.get("candle")
lamps = [point_light(f"lamp {i}", p, LAMP["color"], LAMP["intensity"], LAMP["decay"], LAMP["distance"]) for i, p in enumerate(lighting["lamps"])]
candles = [point_light(f"candle {i}", p, CANDLE["color"], CANDLE["intensity"], CANDLE["decay"], CANDLE["distance"], .03) for i, p in enumerate(lighting.get("candles", []))]
live = [point_light(f"live {i}", l["position"], l["color"], l["intensity"], l["decay"], l["distance"], .2) for i, l in enumerate(lighting.get("live", []))]
print(f"[bake] {len(lamps)} lamps, {len(candles)} candles, {len(live)} live lights", flush=True)


def setup(sky=False, moon=False, lamp=False, candle=False, live_=False, wash=False):
    bg.inputs["Strength"].default_value = 1 if sky else 0
    sun_ob.hide_render = not moon; sun.energy = SUN_STRENGTH if moon else 0
    for ob in lamps: ob.hide_render = not lamp
    for ob in candles: ob.hide_render = not candle
    for ob in live: ob.hide_render = not live_
    for s in wash_switches: s.default_value = 1 if wash else 0


BOTH, BOUNCE, DIRECT = ("DIRECT", "INDIRECT"), ("INDIRECT",), ("DIRECT",)
PASSES = [  # name, lights, passes, ground samples
    ("sky", dict(sky=True), BOTH, args.samples),
    ("lamps", dict(lamp=True, candle=True), BOTH, args.samples),
    ("uplight", dict(wash=True), BOTH, args.samples),
    ("moon", dict(moon=True), BOUNCE, args.samples),
    ("live", dict(live_=True), BOUNCE, args.samples),
    ("moonvis", dict(moon=True), DIRECT, args.vis_samples),
    ("local", dict(lamp=True, live_=True), DIRECT, args.local_samples),
]
ALL_PASSES = [p[0] for p in PASSES]
if args.passes: PASSES = [p for p in PASSES if p[0] in args.passes.split(",")]


def bake(ob, passes, samples, vertex=False, label=""):
    scene.cycles.samples = samples
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bk = scene.render.bake
    bk.use_pass_direct, bk.use_pass_indirect, bk.use_pass_color = "DIRECT" in passes, "INDIRECT" in passes, False
    bk.target = "VERTEX_COLORS" if vertex else "IMAGE_TEXTURES"
    t = time.time()
    bpy.ops.object.bake(type="DIFFUSE")
    print(f"[bake] {ob.name} {label} {'+'.join(passes)} {samples} spp: {time.time() - t:.0f}s", flush=True)


# ---------------------------------------------------------------- ground
if "ground" not in args.skip:
    mat = terrain.data.materials[0]; nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage"); nt.nodes.active = tex
    uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "bake"; nt.links.new(uvn.outputs[0], tex.inputs[0])
    image = bpy.data.images.new("bake", args.size, args.size, float_buffer=True); image.colorspace_settings.name = "Non-Color"; tex.image = image
    for name, lights, passes, samples in PASSES:
        setup(**lights); bake(terrain, passes, samples, label=name)
        px = np.empty(args.size * args.size * 4, np.float32); image.pixels.foreach_get(px)
        np.save(os.path.join(args.out, f"ground_{name}.npy"), px.reshape(args.size, args.size, 4)[:, :, :3].astype(np.float16))  # row 0 = v 0
    bpy.data.images.remove(image)
terrain.hide_render = True

# ---------------------------------------------------------------- probes: six tiny quads per grid point, baked to vertices
if "probes" not in args.skip:
    R = .05
    quad = np.array([(-1, -1), (1, -1), (1, 1), (-1, 1)], float) * R
    frames = []
    for d in dirs:
        n = Vector(Bl(*d)); u = n.orthogonal().normalized(); v = n.cross(u)
        frames.append((np.array(n), np.array(u), np.array(v)))
    centres = np.stack([points[:, 0], -points[:, 2], points[:, 1]], axis=1)
    co = np.empty((len(points), 6, 4, 3), np.float32)
    for k, (n, u, v) in enumerate(frames):
        co[:, k] = centres[:, None, :] + n * R + quad[None, :, 0:1] * u + quad[None, :, 1:2] * v
    count = len(points) * 6
    me = bpy.data.meshes.new("probes")
    me.vertices.add(count * 4); me.vertices.foreach_set("co", co.ravel())
    me.loops.add(count * 4); me.loops.foreach_set("vertex_index", np.arange(count * 4))
    me.polygons.add(count); me.polygons.foreach_set("loop_start", np.arange(count) * 4); me.polygons.foreach_set("loop_total", np.full(count, 4))
    me.update(calc_edges=True)
    probe = bpy.data.objects.new("probes", me); scene.collection.objects.link(probe)
    pm = bpy.data.materials.new("probe"); pm.use_nodes = True; me.materials.append(pm)
    ca = me.color_attributes.new("bake", "FLOAT_COLOR", "POINT"); me.color_attributes.active_color = ca
    for name, lights, passes, samples in PASSES:
        setup(**lights); bake(probe, passes, max(args.probe_samples, samples // 4) if name == "local" else args.probe_samples, vertex=True, label=name)
        a_ = np.empty(len(me.vertices) * 4, np.float32); ca.data.foreach_get("color", a_)
        faces = a_.reshape(-1, 6, 4, 4)[:, :, :, :3].mean(axis=2)  # probe, direction, rgb
        for gname, g in grid_info.items():
            n = int(np.prod(g["dims"])); np.save(os.path.join(args.out, f"{gname}_{name}.npy"), faces[g["start"]:g["start"] + n].reshape(g["dims"][2], g["dims"][1], g["dims"][0], 6, 3).astype(np.float32))

for g in grid_info.values(): del g["start"]
summary = os.path.join(args.out, "probes.json"); previous = json.load(open(summary)) if args.passes and os.path.exists(summary) else {}
json.dump({"grids": grid_info, "dirs": dirs, "bounds": bounds, "size": args.size, "receiverHeight": .04, "world": "beyond", "passes": ALL_PASSES,
           "samples": {"ground": args.samples, "moonShadow": args.vis_samples, "lampShadow": args.local_samples, "probes": args.probe_samples}, "seconds": round(time.time() - T0) + (previous.get("seconds", 0) if args.passes else 0),
           "blender": bpy.app.version_string, "pointCalibration": POINT / (4 * math.pi), "unit": "bake value; runtime irradiance = value * pi"}, open(os.path.join(args.out, "probes.json"), "w"), indent=1)
json.dump(lighting, open(os.path.join(args.out, "lighting.json"), "w"), indent=2)
print(f"[bake] done in {time.time() - T0:.0f}s", flush=True)
