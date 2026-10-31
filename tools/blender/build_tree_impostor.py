"""Render a transparent billboard PNG from an approved tree GLB.

Run only after a tree source has been approved and downloaded:

  blender --background --factory-startup \
    --python tools/blender/build_tree_impostor.py -- \
    --input path/to/approved-tree.glb \
    --output assets/beyond-eden/trees/hero-tree-billboard.png

The PNG is then converted to KTX2 by tools/pipeline/encode-tree-billboard.sh.
"""
from __future__ import annotations
import argparse
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--size", type=int, default=1024)
    return parser.parse_args(argv)


def main():
    options = args()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(Path(options.input).resolve()))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("No mesh objects found in approved tree asset")

    points = []
    for obj in meshes:
        for corner in obj.bound_box:
            points.append(obj.matrix_world @ Vector(corner))
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    center = (minimum + maximum) * .5
    width = max(maximum.x - minimum.x, maximum.y - minimum.y)
    height = maximum.z - minimum.z

    bpy.ops.object.camera_add(location=(center.x, center.y - max(width, height) * 2.8, center.z))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max(width, height) * 1.12
    camera.rotation_euler = (math.radians(90), 0, 0)
    direction = center - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera

    world = bpy.context.scene.world
    world.color = (0, 0, 0)
    bpy.context.scene.render.film_transparent = True
    bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
    bpy.context.scene.render.resolution_x = options.size
    bpy.context.scene.render.resolution_y = options.size
    bpy.context.scene.render.resolution_percentage = 100
    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.context.scene.render.image_settings.color_mode = "RGBA"
    output = Path(options.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(output)

    bpy.ops.object.light_add(type="AREA", location=(center.x - width, center.y - width, center.z + height))
    key = bpy.context.object
    key.data.energy = 800
    key.data.shape = "DISK"
    key.data.size = max(width, height) * 2
    key.rotation_euler = (math.radians(25), 0, math.radians(-25))
    bpy.ops.object.light_add(type="AREA", location=(center.x + width, center.y, center.z + height * .3))
    fill = bpy.context.object
    fill.data.energy = 350
    fill.data.size = max(width, height) * 2

    bpy.ops.render.render(write_still=True)
    print(f"[Beyond Eden] Wrote tree billboard {output}")


if __name__ == "__main__":
    main()
