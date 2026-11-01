"""Sculpt the hero apple tree and its serpent as one GLB.

  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python tools/blender/build_hero_tree.py -- --output assets/eden-hero/hero-tree.glb

Authored in three.js space (Y up, metres) with the trunk base at the origin; the garden places the root at (.5, 0, -7).

  HeroTree   root; extras.tips is a flat [x,y,z,...] list of twig ends for the leaf cards built in eden-flora.js
  HeroWood   trunk, roots and limbs as one continuous mesh (Skin modifier over a branching skeleton, subdivided);
             UVs follow each branch (U around it, V along it) so the shared tiling bark texture runs with the wood
  SnakeBody  tapered body coiled round the snake limb, belly against the bark; U along the body, V around it (V=0 belly)
  SnakeHead  node at the neck, +Z forward and +Y up, with a sculpted viper head and eyes; tree-snake.js animates it
"""
from __future__ import annotations
import argparse
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

R = random.Random(4004)
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # three.js -> Blender axes
C3 = C.to_3x3()
UP = Vector((0, 1, 0))

# The serpent's limb leaves the trunk towards the library path; the head rises off its far end facing visitors.
SNAKE_LIMB = [Vector(p) for p in ((0, 2.42, .02), (.32, 2.56, .16), (.70, 2.70, .36), (1.10, 2.86, .58), (1.48, 3.0, .76), (1.80, 3.13, .90))]
HEAD_FORWARD = Vector((.15, -.32, 1)).normalized()
HEAD_SCALE = 1.2  # tree-snake.js scales the head group by this; the neck radius below is sized to meet it


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="assets/eden-hero/hero-tree.glb")
    return parser.parse_args(argv)


# ---------------------------------------------------------------- skeleton

class Skeleton:
    def __init__(self):
        self.points: list[Vector] = []
        self.radii: list[float] = []
        self.edges: list[tuple[int, int]] = []
        self.segments = []  # (a, b, branch id, v at a, v at b)
        self.branch_wrap: list[float] = []
        self.tips: list[Vector] = []

    def add(self, point, radius):
        self.points.append(point.copy())
        self.radii.append(radius)
        return len(self.points) - 1

    def branch(self, start_index, points, radii, v0=0.):
        """Chain of new points from an existing vertex; returns the new indices (start first)."""
        bid = len(self.branch_wrap)
        circumference = 2 * math.pi * max(radii[0], .01)
        self.branch_wrap.append(max(1, round(circumference / .45)) / 2)  # whole tiles round the branch at repeat 2
        chain, v = [start_index], v0
        for p, r in zip(points, radii):
            i = self.add(p, r)
            prev = chain[-1]
            dv = (self.points[i] - self.points[prev]).length * .9
            self.edges.append((prev, i))
            self.segments.append((prev, i, bid, v, v + dv))
            v += dv
            chain.append(i)
        return chain, v


def gnarled_path(start, direction, length, steps, gnarl, lift):
    d, p, out = direction.normalized(), start.copy(), []
    for _ in range(steps):
        d = (d + Vector((R.uniform(-1, 1) * gnarl, lift + R.uniform(-.3, .3) * gnarl, R.uniform(-1, 1) * gnarl))).normalized()
        p = p + d * (length / steps)
        out.append(p.copy())
    return out


def grow(sk, start_index, direction, length, radius, depth, v0, max_depth=3):
    steps = [6, 4, 3, 2][depth]
    pts = gnarled_path(sk.points[start_index], direction, length, steps, [.12, .22, .3, .35][depth], [.03, .10, .10, .06][depth])
    radii = [radius * (1 - (s + 1) / steps * .55) for s in range(steps)]
    chain, v = sk.branch(start_index, pts, radii, v0)
    if depth >= max_depth:
        end = sk.points[chain[-1]]
        for _ in range(3):
            sk.tips.append(end + Vector((R.uniform(-.3, .3), R.uniform(-.1, .35), R.uniform(-.3, .3))) * length)
        return
    count = [4, 3, 3][depth]
    for k in range(count):
        at = chain[min(len(chain) - 1, max(1, round(R.uniform(.35, 1) * steps)))]
        prev = chain[max(0, chain.index(at) - 1)]
        axis = (sk.points[at] - sk.points[prev]).normalized()
        side = axis.cross(UP if abs(axis.y) < .9 else Vector((1, 0, 0))).normalized()
        side.rotate(Matrix.Rotation(k * 2.399 + R.uniform(-.4, .4), 3, axis))
        spread = [.85, .75, .7][depth] * R.uniform(.8, 1.15)
        child = (axis * math.cos(spread) + side * math.sin(spread) + UP * .25).normalized()
        grow(sk, at, child, length * [.62, .6, .55][depth] * R.uniform(.8, 1.1), sk.radii[at] * .6, depth + 1, v0, max_depth)


def build_skeleton():
    sk = Skeleton()
    base = sk.add(Vector((0, -.12, 0)), .55)
    # Trunk: a short, leaning, slightly twisting bole, as old orchard apples are.
    trunk_pts, trunk_r = [], []
    for s in range(1, 11):
        t = s / 10
        trunk_pts.append(Vector((.10 * math.sin(t * 2.4) + .05 * t, t * 2.75, -.06 * math.sin(t * 3.1))))
        trunk_r.append(.44 - .13 * t)
    trunk, _ = sk.branch(base, trunk_pts, trunk_r)
    # Root flare: buttress roots that dive into the lawn.
    for k in range(6):
        a = k / 6 * 2 * math.pi + R.uniform(-.25, .25)
        out = Vector((math.cos(a), 0, math.sin(a)))
        pts = [sk.points[trunk[1]] * .3 + out * .42 + Vector((0, .0, 0)), out * .8 + Vector((0, -.12, 0)), out * 1.1 + Vector((0, -.34, 0))]
        sk.branch(trunk[1], pts, [.19, .12, .07])
    # Scaffold limbs from the crown of the trunk, kept off the bookcase that stands at +X/-Z below 4.3 m.
    for azimuth, elevation, at in ((140, 30, 9), (200, 36, 10), (250, 44, 10), (300, 58, 8), (75, 42, 10), (170, 62, 10)):
        a = math.radians(azimuth)
        direction = Vector((math.cos(a) * math.cos(math.radians(elevation)), math.sin(math.radians(elevation)), math.sin(a) * math.cos(math.radians(elevation))))
        grow(sk, trunk[at], direction, R.uniform(2.6, 3.1), .19, 0, 0)
    # The serpent's limb, then a little fan of twigs at its end.
    limb_r = [.13 - .075 * i / (len(SNAKE_LIMB) - 1) for i in range(len(SNAKE_LIMB))]
    limb, v = sk.branch(trunk[8], SNAKE_LIMB, limb_r)
    for k in range(3):
        d = (SNAKE_LIMB[-1] - SNAKE_LIMB[-2]).normalized() + Vector((R.uniform(-.6, .6), .5, R.uniform(-.6, .6)))
        grow(sk, limb[-1], d, .8, .04, 2, v)
    return sk


def limb_radius(t):
    return .13 - .075 * t


# ---------------------------------------------------------------- materials & objects

def material(name, color, roughness=.6, metallic=0.):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def mesh_object(name, bm, mat, parent=None, smooth=True):
    for face in bm.faces:
        face.smooth = smooth
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def wood_object(sk, mat, root):
    mesh = bpy.data.meshes.new("HeroWood")
    mesh.from_pydata([tuple(C3 @ p) for p in sk.points], sk.edges, [])
    obj = bpy.data.objects.new("HeroWood", mesh)
    bpy.context.collection.objects.link(obj)
    skin = obj.modifiers.new("skin", "SKIN")
    skin.branch_smoothing = .6
    skin.use_smooth_shade = True
    layer = mesh.skin_vertices[0].data
    for i, r in enumerate(sk.radii):
        layer[i].radius = (r, r)
    layer[0].use_root = True
    obj.modifiers.new("subsurf", "SUBSURF").levels = 2
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for name in ("skin", "subsurf"):
        bpy.ops.object.modifier_apply(modifier=name)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if tris > 60000:
        dec = obj.modifiers.new("decimate", "DECIMATE")
        dec.ratio = 60000 / tris
        bpy.ops.object.modifier_apply(modifier="decimate")
    branch_uvs(obj, sk)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.materials.append(mat)
    obj.parent = root
    return obj


def branch_uvs(obj, sk):
    """U around the nearest skeleton segment, V along its branch; wrap seams fixed per face."""
    mesh = obj.data
    inverse = C3.inverted()
    verts = np.array([tuple(inverse @ v.co) for v in mesh.vertices])
    a = np.array([tuple(sk.points[s[0]]) for s in sk.segments])
    b = np.array([tuple(sk.points[s[1]]) for s in sk.segments])
    ab = b - a
    length2 = np.maximum((ab ** 2).sum(1), 1e-9)
    u = np.zeros(len(verts))
    v = np.zeros(len(verts))
    wrap = np.zeros(len(verts))
    for start in range(0, len(verts), 2048):
        chunk = verts[start:start + 2048]
        t = np.clip(((chunk[:, None, :] - a[None]) * ab[None]).sum(2) / length2[None], 0, 1)
        closest = a[None] + t[..., None] * ab[None]
        # distance to the segment's surface, so a thick trunk wins over a twig passing nearby
        r = np.array([sk.radii[s[0]] for s in sk.segments])[None] * (1 - t) + np.array([sk.radii[s[1]] for s in sk.segments])[None] * t
        best = np.argmin(np.abs(np.linalg.norm(chunk[:, None, :] - closest, axis=2) - r), axis=1)
        for i, (vert, s_i) in enumerate(zip(chunk, best)):
            seg = sk.segments[s_i]
            axis = Vector(ab[s_i]).normalized()
            ref = axis.cross(Vector((0, 0, 1)) if abs(axis.z) < .9 else Vector((1, 0, 0))).normalized()
            radial = Vector(vert) - Vector(closest[i, s_i])
            radial -= axis * radial.dot(axis)
            angle = math.atan2(axis.cross(ref).dot(radial), ref.dot(radial)) / (2 * math.pi) + .5
            u[start + i] = angle * sk.branch_wrap[seg[2]]
            wrap[start + i] = sk.branch_wrap[seg[2]]
            v[start + i] = seg[3] + (seg[4] - seg[3]) * t[i, s_i]
    layer = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        ids = [mesh.loops[li].vertex_index for li in poly.loop_indices]
        us = [u[i] for i in ids]
        w = max(wrap[i] for i in ids)
        high = max(us)
        for li, i in zip(poly.loop_indices, ids):
            # a face straddling the seam gets its low side lifted by one wrap
            layer.data[li].uv = (u[i] + (w if high - u[i] > w / 2 else 0), v[i])


# ---------------------------------------------------------------- serpent

def catmull(points, samples):
    out = []
    pts = [points[0]] + points + [points[-1]]
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for s in range(samples):
            t = s / samples
            out.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(points[-1].copy())
    return out


def limb_at(t):
    """Point and tangent on the snake limb centreline, t in [0, 1]."""
    curve = catmull(SNAKE_LIMB, 20)
    f = t * (len(curve) - 1)
    i = min(int(f), len(curve) - 2)
    p = curve[i].lerp(curve[i + 1], f - i)
    return p, (curve[i + 1] - curve[i]).normalized()


def body_radius(s):
    tail = .2 + .8 * min(1, s / .3) ** .7
    neck = 1 - .22 * max(0, min(1, (s - .88) / .1))
    return .07 * tail * neck


def snake_path():
    """Centreline samples with the belly direction at each (towards the limb while coiled, down when free)."""
    pts, bellies = [], []
    turns, t0, t1, n = 3.2, .16, .84, 320
    side = Vector((0, 1, 0))
    for i in range(n + 1):
        f = i / n
        t = t0 + (t1 - t0) * f
        centre, tangent = limb_at(t)
        side = (side - tangent * side.dot(tangent)).normalized()
        other = tangent.cross(side)
        angle = f * turns * 2 * math.pi + math.pi
        out = side * math.cos(angle) + other * math.sin(angle)
        reach = limb_radius(t) + body_radius(f * .86) * .92
        pts.append(centre + out * reach)
        bellies.append(-out)
    # Neck lifts off the limb's top and arcs up to where the head is held, looking at the path.
    end, tangent = limb_at(t1 + .05)
    pivot = end + Vector((.0, .36, .30))
    last = pts[-1]
    side = HEAD_FORWARD.cross(UP).normalized()
    # S-shaped neck: up over the limb, back, then forward into the head.
    control = [last, end + Vector((0, .16, 0)) - HEAD_FORWARD * .12 + side * .07, end + Vector((0, .32, 0)) - HEAD_FORWARD * .02 - side * .07,
               pivot - HEAD_FORWARD * .13, pivot]
    neck = catmull(control, 18)[1:]
    for k, p in enumerate(neck):
        pts.append(p)
        w = (k + 1) / len(neck)
        bellies.append(bellies[-1].lerp(Vector((0, -1, 0)), w).normalized())
    return pts, bellies, pivot


def snake_body(mat, root):
    pts, bellies, pivot = snake_path()
    lengths = [0.]
    for a, b in zip(pts, pts[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    total = lengths[-1]
    sides = 20
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    rings = []
    for i, p in enumerate(pts):
        tangent = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        belly = (bellies[i] - tangent * bellies[i].dot(tangent)).normalized()
        other = tangent.cross(belly)
        r = body_radius(lengths[i] / total)
        rings.append([bm.verts.new(C3 @ (p + (belly * math.cos(2 * math.pi * k / sides) + other * math.sin(2 * math.pi * k / sides)) * r))
                      for k in range(sides)])
    for i in range(len(rings) - 1):
        for k in range(sides):
            k1 = (k + 1) % sides
            face = bm.faces.new((rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k]))
            for loop, (ri, kk) in zip(face.loops, ((i, k), (i, k + 1), (i + 1, k + 1), (i + 1, k))):
                loop[uv].uv = (lengths[ri] / total, kk / sides)
    tail = bm.verts.new(C3 @ (pts[0] - (pts[1] - pts[0]).normalized() * .03))
    for k in range(sides):
        bm.faces.new((tail, rings[0][(k + 1) % sides], rings[0][k]))
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh_object("SnakeBody", bm, mat, root)
    end_tangent = (pts[-1] - pts[-2]).normalized()
    return pivot, end_tangent, total


def head_shape(z):
    """Half width and half height of the head cross-section at z (head local, before the 0.82 runtime scale)."""
    t = (z + .13) / .375  # 0 at the neck, 1 at the snout tip
    width = .052 + .075 * math.sin(min(1, t / .55) * math.pi * .5) - .085 * max(0, (t - .55) / .45) ** 1.6
    height = .052 + .022 * math.sin(min(1, t / .45) * math.pi * .5) - .045 * max(0, (t - .5) / .5) ** 1.8
    return max(width, .004), max(height, .004)


def snake_head(skin, eye, pupil, root, pivot, forward):
    head = bpy.data.objects.new("SnakeHead", None)
    bpy.context.collection.objects.link(head)
    head.parent = root
    side = forward.cross(UP).normalized()
    up = side.cross(forward).normalized()
    frame = Matrix((tuple(side), tuple(up), tuple(forward))).transposed().to_4x4()
    frame.translation = pivot
    head.matrix_world = C @ frame @ C.inverted()
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    rows, sides = 40, 24
    rings = []
    for i in range(rows + 1):
        z = -.13 + .375 * i / rows
        w, h = head_shape(z)
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            c, s = math.cos(a), math.sin(a)
            # superellipse: flat crown and flat jaw, a ridge over each eye
            x = w * math.copysign(abs(s) ** .8, s)
            y = h * math.copysign(abs(c) ** .9, c)
            brow = .012 * math.exp(-((z - .07) / .045) ** 2) * max(0, c) * abs(s) ** 2
            y = y + brow if y > 0 else y * .85
            ring.append(bm.verts.new(C3 @ Vector((x, y - .004, z))))
        rings.append(ring)
    for i in range(rows):
        for k in range(sides):
            k1 = (k + 1) % sides
            face = bm.faces.new((rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k]))
            for loop, (ri, kk) in zip(face.loops, ((i, k), (i, k + 1), (i + 1, k + 1), (i + 1, k))):
                # V=0 is the throat (belly side of the scale texture); U runs nose-ward
                loop[uv].uv = (ri / rows * .45, kk / sides + .5)
    tip = bm.verts.new(C3 @ Vector((0, -.006, .25)))
    for k in range(sides):
        bm.faces.new((rings[-1][k], rings[-1][(k + 1) % sides], tip))
    back = bm.verts.new(C3 @ Vector((0, 0, -.14)))
    for k in range(sides):
        bm.faces.new((rings[0][(k + 1) % sides], rings[0][k], back))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh_object("SnakeHeadSkin", bm, skin, head)
    for sign in (-1, 1):
        for name, mat, centre, size in (("Eye", eye, (.098, .045, .085), (.022, .022, .026)), ("Pupil", pupil, (.118, .047, .093), (.004, .017, .010))):
            bm = bmesh.new()
            bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1)
            bmesh.ops.scale(bm, vec=size, verts=bm.verts)
            bmesh.ops.translate(bm, vec=(centre[0] * sign, centre[1], centre[2]), verts=bm.verts)
            bm.transform(C)
            mesh_object(f"Snake{name}{'L' if sign < 0 else 'R'}", bm, mat, head)
    return head


def main():
    options = args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = bpy.data.objects.new("HeroTree", None)
    bpy.context.collection.objects.link(root)
    sk = build_skeleton()
    wood_object(sk, material("bark", (.45, .36, .28), .95), root)
    skin = material("skin", (.6, .58, .32), .4)
    pivot, tangent, _ = snake_body(skin, root)
    snake_head(skin, material("eye", (.82, .58, .2), .25), material("pupil", (.02, .02, .015), .2), root, pivot, HEAD_FORWARD)
    # Keep the serpent in clear air: no leaf cards within reach of its coils or head.
    path, _, _ = snake_path()
    clear = [tip for tip in sk.tips if min((tip - p).length for p in path[::6]) > .95 and (tip - pivot).length > 1.25]
    print(f"cleared {len(sk.tips) - len(clear)} leaf tips around the snake")
    root["tips"] = [round(c, 3) for tip in clear for c in tip]
    out = Path(options.output).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", export_yup=True, export_apply=True,
                              export_cameras=False, export_lights=False, export_extras=True)
    wood = bpy.data.objects["HeroWood"]
    print(f"wrote {out} ({out.stat().st_size / 1e6:.2f} MB), wood tris "
          f"{sum(len(p.vertices) - 2 for p in wood.data.polygons)}, tips {len(sk.tips)}, head at {tuple(round(c, 2) for c in pivot)}")


main()
