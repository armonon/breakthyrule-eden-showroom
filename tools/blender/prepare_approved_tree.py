"""Prepare the already-approved local tree source for the Beyond Eden proof.

This script does not download or select an asset. It accepts a local source,
normalizes it to metres, generates two browser LODs, and writes a provenance
manifest. A billboard is rendered separately by build_tree_impostor.py.

Example:

  blender --background --factory-startup \
    --python tools/blender/prepare_approved_tree.py -- \
    --input /absolute/path/to/approved-tree.glb \
    --output assets/beyond-eden/trees \
    --target-height 9 \
    --lod0-ratio 0.12 \
    --lod1-ratio 0.035 \
    --keep-blend
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default="assets/beyond-eden/trees")
    parser.add_argument("--target-height", type=float, default=9.0)
    parser.add_argument("--lod0-ratio", type=float, default=0.12)
    parser.add_argument("--lod1-ratio", type=float, default=0.035)
    parser.add_argument("--keep-blend", action="store_true")
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def import_blend(path: Path) -> None:
    with bpy.data.libraries.load(str(path), link=False) as (source, target):
        target.objects = source.objects
    for obj in target.objects:
        if obj is not None:
            bpy.context.scene.collection.objects.link(obj)


def import_source(path: Path) -> None:
    suffix = path.suffix.lower()
    if suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif suffix == ".obj":
        if hasattr(bpy.ops.wm, "obj_import"):
            bpy.ops.wm.obj_import(filepath=str(path))
        else:
            bpy.ops.import_scene.obj(filepath=str(path))
    elif suffix == ".blend":
        import_blend(path)
    else:
        raise RuntimeError(f"Unsupported tree source format: {suffix}")


def mesh_objects() -> list[bpy.types.Object]:
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    if not points:
        raise RuntimeError("Approved tree source has no mesh bounds")
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return minimum, maximum


def normalize(objects: list[bpy.types.Object], target_height: float) -> dict:
    minimum, maximum = world_bounds(objects)
    height = maximum.z - minimum.z
    if height <= 0.0001:
        raise RuntimeError("Approved tree source has invalid height")
    scale = target_height / height
    center_x = (minimum.x + maximum.x) * 0.5
    center_y = (minimum.y + maximum.y) * 0.5
    transform = Matrix.Scale(scale, 4) @ Matrix.Translation(Vector((-center_x, -center_y, -minimum.z)))

    roots = [obj for obj in bpy.context.scene.objects if obj.parent is None and obj.type != "CAMERA"]
    for obj in roots:
        obj.matrix_world = transform @ obj.matrix_world

    bpy.context.view_layer.update()
    normalized_min, normalized_max = world_bounds(objects)
    return {
        "sourceBounds": {"min": list(minimum), "max": list(maximum)},
        "normalizedBounds": {"min": list(normalized_min), "max": list(normalized_max)},
        "scaleApplied": scale,
        "targetHeightMetres": target_height,
    }


def triangle_count(objects: list[bpy.types.Object]) -> int:
    total = 0
    for obj in objects:
        if obj.type != "MESH":
            continue
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def duplicate_hierarchy(objects: list[bpy.types.Object], name: str) -> list[bpy.types.Object]:
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    mapping: dict[bpy.types.Object, bpy.types.Object] = {}
    for original in objects:
        copy = original.copy()
        if original.data:
            copy.data = original.data.copy()
        collection.objects.link(copy)
        mapping[original] = copy
    for original, copy in mapping.items():
        copy.parent = mapping.get(original.parent)
        if copy.parent is not None:
            copy.matrix_parent_inverse = original.matrix_parent_inverse.copy()
    return list(mapping.values())


def apply_decimation(objects: list[bpy.types.Object], ratio: float) -> None:
    ratio = max(0.001, min(1.0, ratio))
    for obj in objects:
        if obj.type != "MESH" or len(obj.data.polygons) < 24:
            continue
        modifier = obj.modifiers.new("Beyond Eden browser LOD", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except Exception as exc:
            print(f"[Beyond Eden] Could not apply decimation to {obj.name}: {exc}")
        obj.select_set(False)


def export_selected(objects: list[bpy.types.Object], path: Path) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]
    export_operator = bpy.ops.export_scene.gltf
    supported = {prop.identifier for prop in export_operator.get_rna_type().properties}
    export_options = {
        "filepath": str(path),
        "export_format": "GLB",
        "use_selection": True,
        "export_apply": True,
        "export_texcoords": True,
        "export_normals": True,
        "export_materials": "EXPORT",
        "export_cameras": False,
        "export_lights": False,
        "export_animations": False,
        "export_yup": True,
    }
    if "export_vertex_color" in supported:
        export_options["export_vertex_color"] = "ACTIVE"
        if "export_all_vertex_colors" in supported:
            export_options["export_all_vertex_colors"] = True
        if "export_active_vertex_color_when_no_material" in supported:
            export_options["export_active_vertex_color_when_no_material"] = True
    elif "export_colors" in supported:
        export_options["export_colors"] = True
    export_operator(**{key: value for key, value in export_options.items() if key in supported})


def main() -> None:
    options = parse_args()
    source = Path(options.input).expanduser().resolve()
    output = Path(options.output).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    output.mkdir(parents=True, exist_ok=True)

    clear_scene()
    import_source(source)
    meshes = mesh_objects()
    if not meshes:
        raise RuntimeError("No mesh objects found in approved tree source")

    normalization = normalize(meshes, options.target_height)
    source_objects = [obj for obj in bpy.context.scene.objects if obj.type not in {"CAMERA", "LIGHT"}]
    normalized_triangles = triangle_count(mesh_objects())

    lod_specs = [
        ("lod0", options.lod0_ratio, output / "hero-tree-lod0.glb"),
        ("lod1", options.lod1_ratio, output / "hero-tree-lod1.glb"),
    ]
    outputs = []
    for label, ratio, destination in lod_specs:
        copies = duplicate_hierarchy(source_objects, f"EXPORT_{label.upper()}")
        apply_decimation(copies, ratio)
        export_selected(copies, destination)
        count = triangle_count([obj for obj in copies if obj.type == "MESH"])
        outputs.append({
            "label": label,
            "file": destination.name,
            "ratioRequested": ratio,
            "triangles": count,
            "bytes": destination.stat().st_size,
        })
        for obj in copies:
            data = obj.data if obj.type == "MESH" else None
            bpy.data.objects.remove(obj, do_unlink=True)
            if data and data.users == 0:
                bpy.data.meshes.remove(data)

    if options.keep_blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(output / "hero-tree-source.blend"))

    manifest = {
        "schema": "beyond-eden-tree-source-manifest-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "pathAtBuildTime": str(source),
            "filename": source.name,
            "bytes": source.stat().st_size,
            "sha256": sha256(source),
        },
        "normalization": normalization,
        "sourceTrianglesAfterImport": normalized_triangles,
        "outputs": outputs,
        "billboardPending": True,
        "license": "Complete tree-source-ledger.json from existing local evidence before public use.",
    }
    (output / "hero-tree-source-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
