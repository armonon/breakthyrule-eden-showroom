#!/usr/bin/env python3
"""Build the Photoreal setting's trees and rocks from CC0 scans (Poly Haven) into assets/eden-photo/.

  python3 tools/pipeline/build-photoreal-flora.py --models DOWNLOADS/polyhaven/models --hero assets/eden-hero/hero-tree.glb \
      --out assets/eden-photo [--blender /Applications/Blender.app/Contents/MacOS/Blender]

Jacaranda: the scan has 116k real leaf fronds. Each level of detail keeps a random share of them, enlarged to keep the
crown's density, with crown-depth shading baked into vertex colours (dark inside, bright outside). Wood is filtered
to the larger limbs and decimated in Blender. Hero apple tree: individual photographed leaves from tree_small_02 grown
as small folded quads around the sculpted tree's twig tips, so its trunk and the serpent's branch stay as they are.
Rocks: rock_moss_set_01 decimated; the normal map carries the detail. Needs numpy, scipy, Pillow.
"""
import argparse, json, os, struct, subprocess, tempfile
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

a = argparse.ArgumentParser()
a.add_argument("--models", required=True); a.add_argument("--hero", required=True); a.add_argument("--out", required=True)
a.add_argument("--blender", default="/Applications/Blender.app/Contents/MacOS/Blender")
a.add_argument("--seed", type=int, default=11)
a.add_argument("--skip-jacaranda", action="store_true", help="keep the jacaranda files already built")
args = a.parse_args()
rng = np.random.default_rng(args.seed)
SITE_SCALE = 9 / 19.3  # the site's jacaranda stands 9 m tall; the scan is 19.3 m
os.makedirs(args.out, exist_ok=True)


def read_gltf(path):
    """(json, accessor reader) for a .gltf with one external .bin or a .glb."""
    if path.endswith(".glb"):
        raw = open(path, "rb").read()
        n = struct.unpack("<I", raw[12:16])[0]
        g = json.loads(raw[20:20 + n])
        off = 20 + n + 8
        blob = np.frombuffer(raw, dtype="u1", offset=off)
    else:
        g = json.load(open(path))
        blob = np.memmap(os.path.join(os.path.dirname(path), g["buffers"][0]["uri"]), dtype="u1", mode="r")

    def acc(i):
        A = g["accessors"][i]; V = g["bufferViews"][A["bufferView"]]
        n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[A["type"]]
        t = {5126: "f4", 5125: "u4", 5123: "u2", 5121: "u1"}[A["componentType"]]
        return np.array(np.frombuffer(blob, dtype=t, count=A["count"] * n, offset=V.get("byteOffset", 0) + A.get("byteOffset", 0)).reshape(-1, n))
    return g, acc


def write_glb(path, meshes, compact=False):
    """meshes: dict(name, pos, nor, uv, idx, [col]). compact stores 8-bit normals and colours and 16-bit UVs (24 bytes a
    vertex, not 44). Vertex and triangle order stay as built: the reflection pass draws an index prefix as an even sample
    of each crown, which is why meshopt, which reorders triangles, is not used here."""
    blob = bytearray(); views = []; accessors = []; gmeshes = []; nodes = []

    def push(arr, ctype, kind, target, bounds=False, normalized=False, stride=0):
        data = arr.tobytes()
        pad = (4 - len(blob) % 4) % 4; blob.extend(b"\0" * pad)
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), "target": target} | ({"byteStride": stride} if stride else {}))
        blob.extend(data)
        A = {"bufferView": len(views) - 1, "componentType": ctype, "count": len(arr), "type": kind} | ({"normalized": True} if normalized else {})
        if bounds:
            A["min"] = arr.min(0).tolist(); A["max"] = arr.max(0).tolist()
        accessors.append(A)
        return len(accessors) - 1

    for m in meshes:
        attrs = {"POSITION": push(m["pos"].astype("f4"), 5126, "VEC3", 34962, True)}
        if compact:
            n8 = np.round(np.clip(m["nor"], -1, 1) * 127).astype("i1")
            attrs["NORMAL"] = push(np.c_[n8, np.zeros(len(n8), "i1")], 5120, "VEC3", 34962, normalized=True, stride=4)
            uv_in_range = m["uv"].min() >= 0 and m["uv"].max() <= 1
            attrs["TEXCOORD_0"] = push(np.round(m["uv"] * 65535).astype("u2"), 5123, "VEC2", 34962, normalized=True) if uv_in_range else push(m["uv"].astype("f4"), 5126, "VEC2", 34962)
            if "col" in m:
                c8 = np.round(np.clip(m["col"], 0, 1) * 255).astype("u1")
                attrs["COLOR_0"] = push(np.c_[c8, np.full(len(c8), 255, "u1")], 5121, "VEC4", 34962, normalized=True)
        else:
            attrs["NORMAL"] = push(m["nor"].astype("f4"), 5126, "VEC3", 34962)
            attrs["TEXCOORD_0"] = push(m["uv"].astype("f4"), 5126, "VEC2", 34962)
        idx = push(m["idx"].astype("u4").reshape(-1, 1), 5125, "SCALAR", 34963)
        gmeshes.append({"name": m["name"], "primitives": [{"attributes": attrs, "indices": idx}]})
        nodes.append({"name": m["name"], "mesh": len(gmeshes) - 1})
    g = {"asset": {"version": "2.0", "generator": "build-photoreal-flora"}, "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}],
         "nodes": nodes, "meshes": gmeshes, "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(blob)}]}
    if compact:
        g["extensionsUsed"] = g["extensionsRequired"] = ["KHR_mesh_quantization"]
    j = json.dumps(g, separators=(",", ":")).encode(); j += b" " * ((4 - len(j) % 4) % 4)
    blob.extend(b"\0" * ((4 - len(blob) % 4) % 4))
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(j) + 8 + len(blob)))
        f.write(struct.pack("<II", len(j), 0x4E4F534A)); f.write(j)
        f.write(struct.pack("<II", len(blob), 0x004E4942)); f.write(bytes(blob))


def prims(path):
    g, acc = read_gltf(path); out = {}
    for m in g["meshes"]:
        for p in m["primitives"]:
            out[g["materials"][p["material"]]["name"]] = dict(pos=acc(p["attributes"]["POSITION"]), nor=acc(p["attributes"]["NORMAL"]),
                                                              uv=acc(p["attributes"]["TEXCOORD_0"]), idx=acc(p["indices"]).astype(np.int64).reshape(-1, 3))
    return out


def islands(m):
    I = m["idx"]; n = len(m["pos"])
    adj = coo_matrix((np.ones(len(I) * 2, bool), (np.r_[I[:, 0], I[:, 1]], np.r_[I[:, 1], I[:, 2]])), shape=(n, n))
    return connected_components(adj, directed=False)


def select(m, tri_keep):
    """Sub-mesh of the kept triangles, with unused vertices dropped."""
    idx = m["idx"][tri_keep]; used, inverse = np.unique(idx, return_inverse=True)
    return {k: m[k][used] for k in ("pos", "nor", "uv")} | {"idx": inverse.reshape(-1, 3), "source": used}


def crown_shade(points, weights, query, cell, sun=(-.38, .32, -.8), strength=.42):
    """Sky visibility at query points from a voxel density grid of the foliage: rays up and toward the sun."""
    lo = points.min(0) - cell * 2; shape = np.ceil((points.max(0) + cell * 2 - lo) / cell).astype(int) + 1
    grid = np.zeros(shape, "f4"); np.add.at(grid, tuple(((points - lo) / cell).astype(int).T), weights)
    grid = ndimage.gaussian_filter(grid, .7); grid /= np.percentile(grid[grid > 0], 90)
    dirs = [np.array(d, "f4") for d in ((0, 1, 0), (.7, .7, 0), (-.7, .7, 0), (0, .7, .7), (0, .7, -.7), sun)]
    total = np.zeros(shape, "f4")
    for d in dirs:
        d = d / np.linalg.norm(d); acc = np.zeros(shape, "f4")
        for step in range(1, max(shape)):
            acc += ndimage.shift(grid, -d * step, order=1, mode="constant", cval=0, prefilter=False)
            if step * cell > 14 * cell:
                break
        total += np.exp(-acc * strength)
    total /= len(dirs)
    return ndimage.map_coordinates(total, ((query - lo) / cell).T, order=1, mode="nearest")


def leaf_lod(leaves, labels, count, keep, grow, shade, name):
    chosen = rng.random(count) < keep
    tri_keep = chosen[labels[leaves["idx"][:, 0]]]
    m = select(leaves, tri_keep); lab = labels[m["source"]]
    # Enlarge each frond about its own centre, and bend normals out of the crown so it shades as one volume.
    sums = np.zeros((count, 3)); np.add.at(sums, lab, m["pos"]); centre = sums[lab] / np.maximum(np.bincount(lab, minlength=count)[lab, None], 1)
    pos = centre + (m["pos"] - centre) * grow
    crown = leaves["pos"].mean(0) - np.array([0, 2, 0])
    out = centre - crown; out /= np.linalg.norm(out, axis=1, keepdims=True)
    nor = m["nor"] * .45 + out * .55; nor /= np.linalg.norm(nor, axis=1, keepdims=True)
    # Baked shade plus a little leaf-to-leaf colour variation (some yellower, some bluer).
    tone = rng.normal(1, .1, count)[lab]; warm = rng.normal(0, .05, count)[lab]
    ao = np.clip(shade[lab], .16, 1)[:, None]
    col = .8 * ao * tone[:, None] * np.stack([1 + warm, np.ones_like(warm), 1 - warm * 1.4], 1)
    return dict(name=name, pos=pos * SITE_SCALE, nor=nor, uv=m["uv"], idx=m["idx"], col=col)


def wood_filter(m, min_diag):
    n, lab = islands(m); lo = np.full((n, 3), 1e9); hi = -lo.copy()
    np.minimum.at(lo, lab, m["pos"]); np.maximum.at(hi, lab, m["pos"])
    return select(m, (np.linalg.norm(hi - lo, axis=1) >= min_diag)[lab[m["idx"][:, 0]]])


BLENDER_DECIMATE = r'''
import bpy, json, sys
jobs = json.loads(sys.argv[sys.argv.index("--") + 1])
for job in jobs:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=job["in"])
    for o in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        target = job["targets"].get(o.name) or job["targets"]["*"]
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        if tris > target:
            d = o.modifiers.new("d", "DECIMATE"); d.decimate_type = "COLLAPSE"; d.ratio = target / tris
            d.use_collapse_triangulate = True
    bpy.ops.export_scene.gltf(filepath=job["out"], export_format="GLB", export_apply=True, export_materials="NONE", export_yup=True, export_animations=False)
'''


def decimate(jobs):
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
        f.write(BLENDER_DECIMATE)
    subprocess.run([args.blender, "-b", "--factory-startup", "--python", f.name, "--", json.dumps(jobs)], check=True, capture_output=True)
    os.unlink(f.name)


def read_meshes(path):
    g, acc = read_gltf(path); out = {}
    for node in g["nodes"]:
        if "mesh" not in node:
            continue
        p = g["meshes"][node["mesh"]]["primitives"][0]
        out[node["name"]] = dict(name=node["name"], pos=acc(p["attributes"]["POSITION"]), nor=acc(p["attributes"]["NORMAL"]),
                                 uv=acc(p["attributes"]["TEXCOORD_0"]), idx=acc(p["indices"]).astype(np.int64).reshape(-1, 3))
    return out


def webp(rgb, alpha, path, size, quality=82):
    """RGB (with colour bled past the cut-out so mipmaps have no dark halo) and optional alpha, resized and saved."""
    im = np.asarray(Image.open(rgb).convert("RGB"))
    if alpha:
        al = np.asarray(Image.open(alpha).convert("L").resize(im.shape[1::-1], Image.LANCZOS))
        near = ndimage.distance_transform_edt(al < 128, return_distances=False, return_indices=True)
        im = np.dstack([im[near[0], near[1]], al])
    Image.fromarray(im).resize((size, size), Image.LANCZOS).save(path, quality=quality, method=6, alpha_quality=90)
    print(path, f"{os.path.getsize(path) / 1e6:.2f} MB")


with tempfile.TemporaryDirectory() as tmp:
    if not args.skip_jacaranda:
        # ---- jacaranda ----
        src = os.path.join(args.models, "jacaranda_tree"); j = prims(os.path.join(src, "jacaranda_tree.gltf"))
        leaves = j["jacaranda_tree_leaves"]; n, labels = islands(leaves)
        sums = np.zeros((n, 3)); np.add.at(sums, labels, leaves["pos"]); centres = sums / np.bincount(labels, minlength=n)[:, None]
        shade = crown_shade(centres, np.ones(n, "f4"), centres, cell=.75)
        print("jacaranda fronds", n, "shade pct", np.percentile(shade, [5, 50, 95]).round(3))
        lods = {"near": dict(keep=1 / 16, grow=2.5, branch=.45, trunk=14000, wood=26000), "mid": dict(keep=1 / 90, grow=4.8, branch=1.3, trunk=2500, wood=2500)}
        jobs = []
        for key, L in lods.items():
            trunk, br = j["jacaranda_tree_trunk"], wood_filter(j["jacaranda_tree_branches"], L["branch"])
            print(key, "branches kept", len(br["idx"]), "tris")
            path = os.path.join(tmp, f"{key}.glb")
            write_glb(path, [dict(name="trunk", **{k: trunk[k] for k in ("pos", "nor", "uv", "idx")}), dict(name="branches", **{k: br[k] for k in ("pos", "nor", "uv", "idx")})])
            jobs.append({"in": path, "out": path + ".out.glb", "targets": {"trunk": L["trunk"], "branches": L["wood"], "*": L["wood"]}})
        decimate(jobs)
        for key, L in lods.items():
            wood = read_meshes(os.path.join(tmp, f"{key}.glb.out.glb"))
            for w in wood.values():
                w["pos"] = w["pos"] * SITE_SCALE
            lf = leaf_lod(leaves, labels, n, L["keep"], L["grow"], shade, "leaves")
            path = os.path.join(args.out, f"jacaranda-{key}.glb")
            write_glb(path, [lf, *wood.values()], compact=True)
            print(path, {k: len(v["idx"]) for k, v in {"leaves": lf, **wood}.items()}, f"{os.path.getsize(path) / 1e6:.1f} MB")
        t = os.path.join(src, "textures")
        webp(f"{t}/jacaranda_tree_leaves_diff_2k.jpg", f"{t}/leaves_alpha_2k.png", os.path.join(args.out, "jacaranda-leaves.webp"), 2048)
        webp(f"{t}/jacaranda_tree_leaves_nor_gl_2k.jpg", None, os.path.join(args.out, "jacaranda-leaves-nor.webp"), 1024, 78)
        webp(f"{t}/jacaranda_tree_trunk_diff_2k.jpg", None, os.path.join(args.out, "jacaranda-trunk.webp"), 2048)
        webp(f"{t}/jacaranda_tree_trunk_nor_gl_2k.jpg", None, os.path.join(args.out, "jacaranda-trunk-nor.webp"), 1024, 78)
        webp(f"{t}/jacaranda_tree_branches_diff_2k.jpg", None, os.path.join(args.out, "jacaranda-branches.webp"), 1024)

    # ---- hero apple tree: real leaves around the sculpted twig tips ----
    g, _ = read_gltf(args.hero)
    node = next(x for x in g["nodes"] if x.get("name") == "HeroTree")
    tips = np.array(node["extras"]["tips"]).reshape(-1, 3)
    t = os.path.join(args.models, "tree_small_02", "textures")
    alpha = np.asarray(Image.open(f"{t}/leaves_alpha_1k.png").convert("L")) > 128
    # Stems join the leaves in this atlas: opening the mask removes them, leaving one blob per leaf, then the box grows back.
    opened = ndimage.binary_opening(alpha, ndimage.generate_binary_structure(2, 1), iterations=9)
    comps, count = ndimage.label(opened); rects = []
    # Only whole leaves, on the left two-thirds of the atlas (the rest is twig and wrapper texture).
    for s in ndimage.find_objects(comps):
        y0, y1, x0, x1 = s[0].start - 9, s[0].stop + 9, s[1].start - 9, s[1].stop + 9
        w_, h_ = x1 - x0, y1 - y0
        if 60 < w_ < 260 and 40 < h_ < 260 and x0 >= 0 and y0 >= 0 and x1 < 700 and y1 < 1024:
            rects.append((x0 / 1024, 0, y0 / 1024, x1 / 1024, y1 / 1024))
    if len(rects) < 4:
        raise SystemExit(f"only {len(rects)} leaf cut-outs found in the atlas")
    print("apple leaf cut-outs", len(rects), "tips", len(tips))
    per_tip = max(30, 26000 // len(tips))
    centres = np.repeat(tips, per_tip, 0) + rng.normal(0, .42, (len(tips) * per_tip, 3)) * np.array([1, .75, 1])
    mid = tips.mean(0) - np.array([0, .5, 0])
    out = centres - mid; out /= np.linalg.norm(out, axis=1, keepdims=True)
    facing = out * .6 + rng.normal(0, .55, out.shape) + np.array([0, .55, 0]); facing /= np.linalg.norm(facing, axis=1, keepdims=True)
    side = np.cross(facing, rng.normal(0, 1, out.shape)); side /= np.linalg.norm(side, axis=1, keepdims=True)
    along = np.cross(facing, side)
    size = rng.uniform(.085, .15, len(centres))[:, None]
    shade = crown_shade(centres, np.ones(len(centres), "f4"), centres, cell=.42, strength=.2)
    print("apple leaves", len(centres), "shade pct", np.percentile(shade, [5, 50, 95]).round(3))
    pick = rng.integers(0, len(rects), len(centres)); R = np.array([r[0::1] for r in rects])
    u0, v0, u1, v1 = R[pick, 0], R[pick, 2], R[pick, 3], R[pick, 4]
    aspect = ((v1 - v0) / (u1 - u0))[:, None]; fold = rng.uniform(.04, .22, len(centres))[:, None] * size
    # Six vertices, four triangles: a shallow crease along the leaf's length.
    s = side * size; b = along * size * aspect
    P = np.stack([centres - s - b - facing * fold, centres - s + b - facing * fold, centres - b, centres + b, centres + s - b - facing * fold, centres + s + b - facing * fold], 1)
    U = np.stack([np.stack([u0, v0], 1), np.stack([u0, v1], 1), np.stack([(u0 + u1) / 2, v0], 1), np.stack([(u0 + u1) / 2, v1], 1), np.stack([u1, v0], 1), np.stack([u1, v1], 1)], 1)
    N = facing * .5 + out * .5; N /= np.linalg.norm(N, axis=1, keepdims=True)
    tone = rng.normal(1, .13, len(centres)); warm = rng.normal(0, .06, len(centres)); ao = np.clip(shade, .18, 1)
    C = .8 * (ao * tone)[:, None] * np.stack([1 + warm, np.ones_like(warm), 1 - warm * 1.4], 1)
    base = (np.arange(len(centres)) * 6)[:, None]; I = (base + np.array([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5])).reshape(-1, 3)
    path = os.path.join(args.out, "hero-leaves.glb")
    write_glb(path, [dict(name="leaves", pos=P.reshape(-1, 3), nor=np.repeat(N, 6, 0), uv=U.reshape(-1, 2), col=np.repeat(C, 6, 0), idx=I)], compact=True)
    print(path, len(I), "tris", f"{os.path.getsize(path) / 1e6:.1f} MB")
    webp(f"{t}/tree_small_02_leaves_diff_1k.jpg", f"{t}/leaves_alpha_1k.png", os.path.join(args.out, "hero-leaves.webp"), 1024)

    # ---- rocks ----
    src = os.path.join(args.models, "rock_moss_set_01")
    g, acc = read_gltf(os.path.join(src, "rock_moss_set_01.gltf")); parts = []
    for node in g["nodes"]:
        p = g["meshes"][node["mesh"]]["primitives"][0]
        parts.append(dict(name=node["name"].replace("rock_moss_set_01_", ""), pos=acc(p["attributes"]["POSITION"]), nor=acc(p["attributes"]["NORMAL"]), uv=acc(p["attributes"]["TEXCOORD_0"]), idx=acc(p["indices"]).astype(np.int64).reshape(-1, 3)))
    path = os.path.join(tmp, "rocks.glb"); write_glb(path, parts)
    decimate([{"in": path, "out": path + ".out.glb", "targets": {"*": 2800}}])
    rocks = read_meshes(path + ".out.glb")
    path = os.path.join(args.out, "rocks.glb"); write_glb(path, list(rocks.values()), compact=True)
    print(path, {k: len(v["idx"]) for k, v in rocks.items()}, f"{os.path.getsize(path) / 1e6:.1f} MB")
    t = os.path.join(src, "textures")
    webp(f"{t}/rock_moss_set_01_diff_2k.jpg", None, os.path.join(args.out, "rocks.webp"), 2048)
    webp(f"{t}/rock_moss_set_01_nor_gl_2k.jpg", None, os.path.join(args.out, "rocks-nor.webp"), 2048, 80)
