"""Generate the old-world furniture set for the open library as one GLB.

  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python tools/blender/build_open_library.py -- --output assets/library/library-set.glb

Everything is authored in three.js space (Y up, metres, +Z towards the viewer) and converted to
Blender's Z-up axes when each mesh is written, so the exported node origins line up with the
placements in library.js. Each root node is one piece of furniture:

  LibBookcase  shelf unit, origin on the floor at the shelf group origin
  LibTable     refectory table, origin on the floor at the table centre
  LibLectern   reading board, in the local space of the tilted stand group (board centre)
  LibBench     pew bench, back towards -Z
  LibBook      face-out volume, .55 x .80 x .105, cover towards +Z, spine at -X
  LibCandle    brass candlestick standing on y=0
  LibGlobe     floor globe standing on y=0

Textures (walnut, leather, page edges, globe map) are generated here from periodic filtered noise,
so they tile without seams and the set rebuilds deterministically.
"""
from __future__ import annotations
import argparse
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

RNG = np.random.default_rng(1847)
TILE = 1.2  # metres of furniture covered by one texture repeat


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="assets/library/library-set.glb")
    parser.add_argument("--size", type=int, default=1024)
    return parser.parse_args(argv)


# ---------------------------------------------------------------- textures

def periodic_noise(h, w, fu, fv):
    """Tileable noise: white noise low-passed in frequency space (fu along x, fv along y)."""
    white = RNG.standard_normal((h, w))
    ky = np.fft.fftfreq(h)[:, None] * h
    kx = np.fft.fftfreq(w)[None, :] * w
    field = np.real(np.fft.ifft2(np.fft.fft2(white) * np.exp(-(kx / fu) ** 2 - (ky / fv) ** 2)))
    return (field - field.mean()) / (field.std() + 1e-9)


def normal_from_height(height, strength):
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * strength
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * strength
    n = np.stack([-dx, -dy, np.ones_like(height)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * .5 + .5


def make_image(name, rgb, non_color=False):
    h, w, _ = rgb.shape
    image = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones((h, w, 1))], -1).astype(np.float32)
    image.pixels.foreach_set(rgba.ravel())
    if non_color:
        image.colorspace_settings.name = "Non-Color"
    image.pack()
    return image


def walnut_texture(size):
    # Grain runs along U: streaks are long in x and narrow in y, warped into growth rings.
    warp = periodic_noise(size, size, 3, 3)
    streak = periodic_noise(size, size, 6, 90)
    pores = periodic_noise(size, size, 60, 400)
    rings = .5 + .5 * np.sin(2 * np.pi * (np.linspace(0, 14, size, endpoint=False)[:, None] + .55 * warp + .08 * streak))
    rings = rings ** 2.2
    tone = np.clip(.45 * rings + .35 * (.5 + .18 * streak) + .2 * (.5 + .1 * warp), 0, 1)
    dark, light = np.array([.29, .16, .085]), np.array([.60, .38, .21])  # sRGB
    rgb = dark + (light - dark) * tone[..., None]
    rgb *= (1 - .10 * np.clip(pores, 0, 3)[..., None] / 3)
    height = .6 * rings + .25 * streak * .1 - .15 * np.clip(pores, 0, 3) / 3
    return rgb, normal_from_height(height, 2.5)


def leather_texture(size):
    pebble = periodic_noise(size, size, 70, 70)
    crease = np.abs(periodic_noise(size, size, 18, 18))
    wear = periodic_noise(size, size, 3, 3)
    tone = .86 + .04 * pebble - .12 * np.exp(-crease * 6) + .05 * wear
    rgb = np.array([.98, .93, .85]) * tone[..., None]
    height = .4 * pebble - 1.2 * np.exp(-crease * 6)
    return rgb, normal_from_height(height, .9)


def page_texture(size):
    rows = periodic_noise(size, size, 2, 300)
    tone = .86 + .05 * np.tanh(rows)
    return np.array([.97, .91, .78]) * tone[..., None]


def globe_texture(w):
    h = w // 2
    land = periodic_noise(h, w, 7, 5) + .5 * periodic_noise(h, w, 20, 14)
    lat = np.linspace(-1, 1, h)[:, None]
    land -= 1.4 * lat ** 6  # keep the poles mostly ocean
    is_land = land > .55
    coast = (land > .45) & (land < .62)
    sea, earth, ink = np.array([.78, .68, .48]), np.array([.56, .42, .24]), np.array([.24, .15, .08])
    rgb = np.where(is_land[..., None], earth, sea)
    rgb = np.where(coast[..., None], rgb * .55 + ink * .45, rgb)
    yy, xx = np.mgrid[0:h, 0:w]
    grid = ((xx % (w // 24)) < 2) | ((yy % (h // 12)) < 2)
    rgb = np.where(grid[..., None], rgb * .7 + ink * .3, rgb)
    rgb *= (.92 + .06 * periodic_noise(h, w, 10, 10))[..., None]
    return rgb


# ---------------------------------------------------------------- materials

def principled(name, color=(1, 1, 1), metallic=0., roughness=.5, image=None, normal=None, emission=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if image:
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if normal:
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = normal
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = .8
        links.new(tex.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission[0], 1)
        bsdf.inputs["Emission Strength"].default_value = emission[1]
    return mat


# ---------------------------------------------------------------- geometry
# Every builder makes geometry in its own local frame, assigns UVs there (so grain follows the part),
# then maps it through `xf` (a 4x4 in three.js space) and finally into Blender's axes.

TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
PARTS: dict[str, list] = {}


def xf(pos=(0, 0, 0), rx=0., ry=0., rz=0., scale=(1, 1, 1)):
    m = Matrix.Translation(pos) @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rx, 4, "X") @ Matrix.Rotation(rz, 4, "Z")
    return m @ Matrix.Diagonal((*scale, 1))


def box_uv(bm, grain_axis):
    """Planar UVs per face from its dominant normal, with U running along the part's grain axis."""
    uv = bm.loops.layers.uv.verify()
    for face in bm.faces:
        n = face.normal
        normal_axis = max(range(3), key=lambda i: abs(n[i]))
        axes = [i for i in range(3) if i != normal_axis]
        u_axis = grain_axis if grain_axis in axes else axes[0]
        v_axis = [i for i in axes if i != u_axis][0]
        for loop in face.loops:
            loop[uv].uv = (loop.vert.co[u_axis] / TILE + .37 * normal_axis, loop.vert.co[v_axis] / TILE)


def finish(bm, asset, material, matrix, smooth=False):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.transform(TO_BLENDER @ matrix)
    for face in bm.faces:
        face.smooth = smooth
    mesh = bpy.data.meshes.new(f"{asset}_{material.name}")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(mesh.name, mesh)
    obj.data.materials.append(material)
    bpy.context.collection.objects.link(obj)
    PARTS.setdefault(asset, []).append(obj)
    return obj


def box(asset, material, size, center, matrix=Matrix(), bevel=.004, grain=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(size) * .45), segments=1,
                        affect="EDGES", clamp_overlap=True)
    box_uv(bm, grain if grain is not None else max(range(3), key=lambda i: size[i]))
    return finish(bm, asset, material, matrix)


def prism(asset, material, outline, plane, start, end, matrix=Matrix(), bevel=.003, grain=None):
    """Extrude a 2D outline. plane: 'xy' extrudes along z, 'zy' along x, 'xz' along y."""
    def place(a, b, c):
        return {"xy": (a, b, c), "zy": (c, b, a), "xz": (a, c, b)}[plane]
    bm = bmesh.new()
    bottom = [bm.verts.new(place(a, b, start)) for a, b in outline]
    top = [bm.verts.new(place(a, b, end)) for a, b in outline]
    bm.faces.new(bottom)
    bm.faces.new(list(reversed(top)))
    count = len(outline)
    for i in range(count):
        j = (i + 1) % count
        bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel:
        sharp = [e for e in bm.edges if e.calc_face_angle(0) > .6]
        bmesh.ops.bevel(bm, geom=sharp, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)
    box_uv(bm, grain if grain is not None else {"xy": 1, "zy": 1, "xz": 0}[plane])
    return finish(bm, asset, material, matrix)


def lathe(asset, material, profile, matrix=Matrix(), segments=24, sphere_uv=False, smooth=True):
    """Revolve (radius, y) points around Y. Zero radius ends become poles."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    rings = []
    for r, y in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((0, y, 0))])
        else:
            rings.append([bm.verts.new((r * math.sin(2 * math.pi * k / segments), y, r * math.cos(2 * math.pi * k / segments)))
                          for k in range(segments)])
    lengths = [0.]
    for (r0, y0), (r1, y1) in zip(profile, profile[1:]):
        lengths.append(lengths[-1] + math.hypot(r1 - r0, y1 - y0))
    mean_r = max(.01, sum(r for r, _ in profile) / len(profile))

    def coord(i, k):
        if sphere_uv:
            return (k / segments, .5 + math.asin(max(-1, min(1, profile[i][1] / max(1e-6, profile[0][1] or 1)))) / math.pi)
        return (lengths[i] / TILE, k / segments * 2 * math.pi * mean_r / TILE)

    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(segments):
            k1 = k + 1
            quad = []
            for ring, idx, ring_i in ((a, k, i), (a, k1, i), (b, k1, i + 1), (b, k, i + 1)):
                quad.append((ring[0] if len(ring) == 1 else ring[idx % segments], ring_i, idx))
            verts, seen = [], set()
            for v, ring_i, idx in quad:
                if v not in seen:
                    seen.add(v)
                    verts.append((v, ring_i, idx))
            if len(verts) < 3:
                continue
            face = bm.faces.new([v for v, _, _ in verts])
            for loop, (_, ring_i, idx) in zip(face.loops, verts):
                loop[uv].uv = coord(ring_i, idx)
    return finish(bm, asset, material, matrix, smooth)


def sphere(asset, material, radius, matrix=Matrix(), segments=48, rows=24):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    grid = []
    for i in range(rows + 1):
        lat = math.pi * (i / rows - .5)
        y, r = radius * math.sin(lat), radius * math.cos(lat)
        grid.append([bm.verts.new((r * math.sin(2 * math.pi * k / segments), y, r * math.cos(2 * math.pi * k / segments)))
                     for k in range(segments)])
    for i in range(rows):
        for k in range(segments):
            k1 = (k + 1) % segments
            face = bm.faces.new((grid[i][k], grid[i][k1], grid[i + 1][k1], grid[i + 1][k]))
            for loop, (u, v) in zip(face.loops, ((k, i), (k + 1, i), (k + 1, i + 1), (k, i + 1))):
                loop[uv].uv = (u / segments, v / rows)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    return finish(bm, asset, material, matrix, True)


def torus(asset, material, radius, tube, matrix=Matrix(), segments=64, sides=10):
    """Ring in the XY plane (axis along Z)."""
    bm = bmesh.new()
    box_layer = bm.loops.layers.uv.verify()
    grid = []
    for k in range(segments):
        a = 2 * math.pi * k / segments
        centre = Vector((math.cos(a), math.sin(a), 0))
        grid.append([bm.verts.new(centre * (radius + tube * math.cos(2 * math.pi * s / sides)) +
                                  Vector((0, 0, tube * math.sin(2 * math.pi * s / sides)))) for s in range(sides)])
    for k in range(segments):
        for s in range(sides):
            face = bm.faces.new((grid[k][s], grid[(k + 1) % segments][s], grid[(k + 1) % segments][(s + 1) % sides], grid[k][(s + 1) % sides]))
            for loop in face.loops:
                loop[box_layer].uv = (k / segments, s / sides)
    return finish(bm, asset, material, matrix, True)


def sweep(asset, material, profile, path, matrix=Matrix(), grain=0):
    """Sweep a closed (out, up) profile along a horizontal polyline with mitred corners (moldings)."""
    bm = bmesh.new()
    up = Vector((0, 1, 0))
    pts = [Vector(p) for p in path]
    normals = []
    for a, b in zip(pts, pts[1:]):
        t = (b - a).normalized()
        normals.append(Vector((-t.z, 0, t.x)))
    rings = []
    for i, p in enumerate(pts):
        if i == 0:
            m = normals[0]
        elif i == len(pts) - 1:
            m = normals[-1]
        else:
            m = (normals[i - 1] + normals[i]).normalized()
            m = m / max(.2, m.dot(normals[i]))
        rings.append([bm.verts.new(p + m * o + up * u) for o, u in profile])
    n = len(profile)
    for a, b in zip(rings, rings[1:]):
        for j in range(n):
            j1 = (j + 1) % n
            bm.faces.new((a[j], a[j1], b[j1], b[j]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    box_uv(bm, grain)
    return finish(bm, asset, material, matrix)


def ogee(depth, height, steps=8, base=0.):
    """Closed molding cross-section: a cyma curve from the wall out and up, then back to the wall."""
    pts = [(0, base), (depth * .18, base), (depth * .18, base + height * .1)]
    for s in range(steps + 1):
        t = s / steps
        out = depth * (.18 + .82 * (.5 - .5 * math.cos(math.pi * t)))
        rise = base + height * (.1 + .75 * t + .05 * math.sin(2 * math.pi * t))
        pts.append((out, rise))
    pts += [(depth, base + height), (0, base + height)]
    return pts


def smooth_outline(points, samples=6):
    """Closed Catmull-Rom spline through the control points."""
    out, n = [], len(points)
    for i in range(n):
        p0, p1, p2, p3 = (Vector(points[(i + k) % n]) for k in (-1, 0, 1, 2))
        for s in range(samples):
            t = s / samples
            out.append(tuple(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)))
    return out


def ring_outline(w, h, border):
    """Rectangular frame as one outline (outer loop, slit, inner loop) so it extrudes in one piece."""
    ow, oh, iw, ih = w / 2, h / 2, w / 2 - border, h / 2 - border
    return [(-ow, -oh), (ow, -oh), (ow, oh), (-ow, oh), (-ow, -ih + .0005), (-iw, -ih + .0005),
            (-iw, ih), (iw, ih), (iw, -ih), (-iw, -ih), (-ow, -ih)]


# ---------------------------------------------------------------- furniture

def bookcase(M):
    A = "LibBookcase"
    wood, dark, brass, gilt = M["walnut"], M["ebony"], M["brass"], M["gilt"]
    # Plinth and base molding wrapping the front and sides.
    box(A, wood, (4.12, .14, .58), (0, .07, .01))
    sweep(A, wood, ogee(.05, .09), [(-2.06, 0, -.28), (-2.06, 0, .30), (2.06, 0, .30), (2.06, 0, -.28)])
    # Back with a raised panel behind every cell.
    box(A, wood, (4.0, 3.18, .04), (0, 1.73, -.27))
    for col in (-1.32, 0, 1.32):
        for y0, y1 in ((.25, 1.17), (1.24, 2.16), (2.23, 3.18)):
            box(A, wood, (1.08, y1 - y0 - .14, .018), (col, (y0 + y1) / 2, -.243), bevel=.008, grain=1)
            prism(A, dark, ring_outline(1.18, y1 - y0 - .04, .045), "xy", -.25, -.236,
                  xf((col, (y0 + y1) / 2, 0)), bevel=.004)
    # Uprights with fluted pilasters, bases and capitals.
    for x in (-1.98, -.66, .66, 1.98):
        outer = abs(x) > 1
        w = .11 if outer else .08
        box(A, wood, (w, 3.18, .56), (x, 1.73, .01), grain=1)
        pw = .13 if outer else .10
        flutes, outline = 3, [(-pw / 2, 0), (pw / 2, 0)]
        outline.append((pw / 2, .03))
        for f in range(flutes, 0, -1):
            cx = -pw / 2 + pw * (f - .5) / flutes
            r = pw / flutes * .3
            outline.append((cx + r, .03))
            for s in range(1, 6):
                a = math.pi * s / 6
                outline.append((cx + r * math.cos(a), .03 - r * .8 * math.sin(a)))
            outline.append((cx - r, .03))
        outline.append((-pw / 2, .03))
        prism(A, wood, outline, "xz", .26, 3.10, xf((x, 0, .29)), bevel=0, grain=1)
        box(A, wood, (pw + .03, .12, .05), (x, .20, .315))
        box(A, wood, (pw + .04, .05, .055), (x, 3.105, .315))
        box(A, gilt, (pw + .045, .012, .058), (x, 3.075, .315), bevel=.002)
        box(A, wood, (pw + .05, .06, .06), (x, 3.16, .32))
    # Shelves; the three reading shelves carry an apron with a brass label frame.
    for y in (.20, 1.19, 2.18, 3.20):
        box(A, wood, (3.92, .065, .56), (0, y, .01))
        if y > 3:
            continue
        for col in (-1.32, 0, 1.32):
            box(A, wood, (1.22, .16, .03), (col, y - .045, .30), bevel=.006)
            prism(A, brass, ring_outline(1.18, .165, .012), "xy", .315, .322, xf((col, y - .035, 0)), bevel=0)
    # Frieze, dentils and crown.
    box(A, wood, (4.14, .14, .04), (0, 3.25, .305))
    box(A, gilt, (4.0, .01, .006), (0, 3.215, .328), bevel=0)
    for k in range(-34, 35):
        box(A, wood, (.032, .045, .035), (k * .06, 3.345, .34), bevel=.003)
    box(A, wood, (4.22, .025, .66), (0, 3.38, .03))
    sweep(A, wood, ogee(.11, .09, base=3.39), [(-2.11, 0, -.30), (-2.11, 0, .36), (2.11, 0, .36), (2.11, 0, -.30)])
    box(A, wood, (4.40, .03, .80), (0, 3.495, .04), bevel=.006)
    # Arched crest framing the sign, with turned finials.
    crest = smooth_outline([(-1.78, 3.51), (1.78, 3.51), (1.80, 3.86), (1.45, 3.98), (.62, 4.06), (0, 4.18),
                            (-.62, 4.06), (-1.45, 3.98), (-1.80, 3.86)], 5)
    prism(A, wood, crest, "xy", -.05, -.002, bevel=.006, grain=0)
    prism(A, dark, smooth_outline([(-1.70, 3.53), (1.70, 3.53), (1.72, 3.84), (1.40, 3.94), (.6, 4.02), (0, 4.12),
                                   (-.6, 4.02), (-1.40, 3.94), (-1.72, 3.84)], 5), "xy", -.002, .004, bevel=0)
    prism(A, gilt, ring_outline(3.25, .56, .03), "xy", .004, .012, xf((0, 3.78, 0)), bevel=.002)
    finial = [(0, 0), (.07, 0), (.07, .03), (.05, .05), (.06, .09), (.075, .14), (.06, .19), (.03, .22), (.035, .25),
              (.02, .28), (.025, .31), (0, .34)]
    for x in (-2.05, 2.05):
        lathe(A, wood, finial, xf((x, 3.51, .14)))
    lathe(A, gilt, [(0, 0), (.035, 0), (.045, .04), (.03, .08), (.012, .11), (0, .13)], xf((0, 4.14, -.025)))


def table(M):
    A = "LibTable"
    wood, dark, brass = M["walnut"], M["ebony"], M["brass"]
    box(A, wood, (2.32, .07, 1.16), (0, .82, 0), bevel=.014, grain=0)
    sweep(A, wood, ogee(.025, .03), [(-1.15, 0, -.57), (-1.15, 0, .57), (1.15, 0, .57), (1.15, 0, -.57), (-1.15, 0, -.57)],
          xf((0, .755, 0)))
    for z in (-.50, .50):
        box(A, wood, (1.86, .17, .04), (0, .70, z), bevel=.006)
        box(A, dark, (1.80, .012, .045), (0, .625, z), bevel=0)
    for x in (-.99, .99):
        box(A, wood, (.04, .17, .96), (x, .70, 0), bevel=.006)
    leg = [(0, 0), (.06, 0), (.065, .03), (.055, .07), (.04, .09), (.045, .12), (.07, .22), (.075, .30), (.065, .37),
           (.04, .44), (.032, .50), (.045, .54), (.055, .57), (.035, .60), (0, .61)]
    for x in (-.94, .94):
        for z in (-.46, .46):
            lathe(A, wood, leg, xf((x, 0, z)))
            box(A, wood, (.10, .17, .10), (x, .70, z), bevel=.008, grain=1)
        box(A, wood, (.06, .06, .92), (x, .13, 0), bevel=.008)
    box(A, wood, (1.82, .06, .06), (0, .13, 0), bevel=.008)
    # Brass escutcheon behind the "On the stand" plaque.
    prism(A, brass, ring_outline(1.46, .22, .014), "xy", .52, .527, xf((0, .72, 0)), bevel=0)


def lectern(M):
    """Built in table-top space, then expressed in the stand group's local frame."""
    A = "LibLectern"
    wood, dark, brass = M["walnut"], M["ebony"], M["brass"]
    pose = (Matrix.Translation((0, 1.28, 0)) @ Matrix.Rotation(-.35, 4, "X")).inverted()
    board = pose.inverted()
    box(A, wood, (.92, .83, .04), (0, 0, .0075), grain=1)
    prism(A, dark, ring_outline(.92, .83, .045), "xy", .0275, .038, bevel=.004)
    box(A, wood, (.98, .05, .09), (0, -.43, .055), bevel=.008)
    box(A, wood, (.98, .035, .02), (0, -.395, .095), bevel=.005)

    def on_board(y, z=-.0125):
        p = board @ Vector((0, y, z))
        return (p.z, p.y)

    cheek = [(.19, .862), (-.21, .862), (-.21, .94), on_board(.30), on_board(-.36)]
    for x in (-.40, .40):
        prism(A, wood, cheek, "zy", x - .018, x + .018, pose, bevel=.005)
    box(A, wood, (1.0, .035, .46), (0, .8725, -.01), pose, bevel=.008)
    sweep(A, wood, ogee(.015, .02), [(-.50, 0, -.24), (-.50, 0, .22), (.50, 0, .22), (.50, 0, -.24), (-.50, 0, -.24)],
          pose @ xf((0, .855, 0)))
    for x in (-.25, .25):
        box(A, brass, (.025, .10, .012), (x, -.36, .108), bevel=.003)


def bench(M):
    A = "LibBench"
    wood, dark = M["walnut"], M["ebony"]
    end = smooth_outline([(.25, 0), (.27, .05), (.21, .10), (.20, .40), (.27, .46), (.30, .60), (.24, .66), (.16, .60),
                          (-.20, .58), (-.25, .78), (-.27, 1.02), (-.33, 1.10), (-.40, 1.06), (-.38, .95), (-.35, .10),
                          (-.40, .05), (-.38, 0)], 4)
    for x in (-.98, .98):
        prism(A, wood, end, "zy", x - .028, x + .028, bevel=.006, grain=1)
    box(A, wood, (1.94, .055, .50), (0, .47, -.01), bevel=.014, grain=0)
    for y in (.60, 1.0):
        box(A, wood, (1.94, .085, .045), (0, y, -.30 - (y - .6) * .09), bevel=.01)
    spindle = [(0, 0), (.022, 0), (.016, .05), (.026, .14), (.020, .24), (.013, .30), (.020, .34), (0, .35)]
    for k in range(11):
        x = -.85 + k * .17
        lathe(A, wood, spindle, xf((x, .64, -.31), rx=-.09), segments=12)
    box(A, wood, (1.94, .06, .05), (0, .13, -.06), bevel=.008)
    box(A, dark, (1.90, .012, .05), (0, .443, .235), bevel=0)


def book(M):
    """Face-out volume; the cover art plane added in library.js sits inside the gilt frame at z=.054."""
    A = "LibBook"
    leather, pages, gilt, brass = M["leather"], M["pages"], M["gilt"], M["brass"]
    w, h, d, t = .55, .80, .105, .011
    for z in (d / 2 - t / 2, -d / 2 + t / 2):
        box(A, leather, (w - .01, h, t), (.005, 0, z), bevel=.004, grain=1)
    # Rounded spine: a half ellipse bulging out past the boards, closed along the page block.
    spine = [(-w / 2 + .012 - .02 * math.cos(math.pi * (i / 12 - .5)), d / 2 * math.sin(math.pi * (i / 12 - .5)))
             for i in range(13)]
    spine += [(-w / 2 + .03, d / 2), (-w / 2 + .03, -d / 2)]
    prism(A, leather, spine, "xz", -h / 2, h / 2, bevel=0, grain=1)
    box(A, pages, (w - .03, h - .022, d - 2 * t), (.008, 0, 0), bevel=.002, grain=1)
    for y in (-.25, -.08, .08, .25):
        box(A, gilt, (.012, .018, d * .7), (-w / 2 - .004, y, 0), bevel=.004)
    prism(A, gilt, ring_outline(w * .86, h * .88, .012), "xy", d / 2, d / 2 + .003, xf((.012, 0, 0)), bevel=0)
    corner = [(0, 0), (-.07, 0), (0, -.07)]
    for y, flip in ((h / 2, 1), (-h / 2, -1)):
        for z in (d / 2, -d / 2 - .003):
            prism(A, brass, [(a, b * flip) for a, b in corner], "xy", z, z + .003,
                  xf((w / 2 + .002, y, 0)), bevel=0)


def candlestick(M):
    A = "LibCandle"
    brass, wax, flame = M["brass"], M["wax"], M["flame"]
    lathe(A, brass, [(0, 0), (.075, 0), (.078, .01), (.06, .025), (.03, .04), (.022, .09), (.03, .12), (.016, .16),
                     (.014, .24), (.024, .26), (.016, .28), (.05, .29), (.055, .30), (.02, .305), (0, .305)])
    lathe(A, wax, [(0, .30), (.017, .30), (.017, .44), (.012, .45), (0, .452)], segments=16)
    lathe(A, flame, [(0, .455), (.008, .465), (.009, .478), (.004, .495), (0, .505)], segments=10)


def globe(M):
    A = "LibGlobe"
    wood, brass, mapmat = M["walnut"], M["brass"], M["globe"]
    lathe(A, wood, [(0, 0), (.22, 0), (.23, .03), (.16, .06), (.07, .09), (.05, .16), (.075, .30), (.06, .44),
                    (.04, .55), (.05, .62), (.09, .68), (.10, .72), (0, .74)])
    for k in range(3):
        a = 2 * math.pi * k / 3
        lathe(A, wood, [(0, 0), (.02, 0), (.015, .15), (.02, .32), (0, .33)],
              xf((.24 * math.sin(a), .72, .24 * math.cos(a)), rz=0), segments=10)
        box(A, wood, (.05, .03, .26), (0, .735, .13), xf(ry=a))
    lathe(A, wood, [(.30, 1.04), (.345, 1.04), (.345, 1.07), (.30, 1.07), (.30, 1.04)], segments=48, smooth=False)
    tilt = xf((0, 1.07, 0), rz=math.radians(23.5))
    sphere(A, mapmat, .27, tilt)
    torus(A, brass, .29, .009, tilt)
    lathe(A, brass, [(0, -.30), (.012, -.30), (.012, .30), (0, .30)], tilt, segments=8)


# ---------------------------------------------------------------- export

def main():
    options = args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    size = options.size
    wood_rgb, wood_n = walnut_texture(size)
    leather_rgb, leather_n = leather_texture(size // 2)
    M = {
        "walnut": principled("walnut", roughness=.48, image=make_image("walnut", wood_rgb),
                             normal=make_image("walnut_normal", wood_n, True)),
        "ebony": principled("ebony", (.07, .04, .025), roughness=.5),
        "brass": principled("brass", (.80, .60, .30), metallic=1, roughness=.32),
        "gilt": principled("gilt", (.86, .66, .30), metallic=1, roughness=.26),
        "leather": principled("leather", roughness=.62, image=make_image("leather", leather_rgb),
                              normal=make_image("leather_normal", leather_n, True)),
        "pages": principled("pages", roughness=.92, image=make_image("pages", page_texture(256))),
        "wax": principled("wax", (.93, .88, .76), roughness=.55),
        "flame": principled("flame", (1, .7, .35), roughness=1, emission=((1, .62, .25), 8)),
        "globe": principled("globe", roughness=.55, image=make_image("globe_map", globe_texture(1024))),
    }
    for build in (bookcase, table, lectern, bench, book, candlestick, globe):
        build(M)

    # One mesh per material per asset, parented under a named root at the origin.
    for asset, objects in PARTS.items():
        root = bpy.data.objects.new(asset, None)
        bpy.context.collection.objects.link(root)
        by_material: dict[str, list] = {}
        for obj in objects:
            by_material.setdefault(obj.data.materials[0].name, []).append(obj)
        for name, group in by_material.items():
            bpy.ops.object.select_all(action="DESELECT")
            for obj in group:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = group[0]
            if len(group) > 1:
                bpy.ops.object.join()
            joined = bpy.context.view_layer.objects.active
            joined.name = joined.data.name = f"{asset}_{name}"
            joined.parent = root

    out = Path(options.output).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", export_yup=True, export_apply=True,
                              export_image_format="JPEG", export_image_quality=88, export_cameras=False,
                              export_lights=False, export_extras=False)
    print(f"wrote {out} ({out.stat().st_size / 1e6:.2f} MB)")


main()
