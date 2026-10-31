"""
Build the Beyond Eden Scottish Rite Temple proof-slice kit in Blender 5.x.

This script uses only procedural geometry. It does NOT ingest or ship archival
photographs. The atlas is a visual reference; this file encodes the selected
architectural reading: monumental wall planes, relief bays, mosaic band,
raised entrance, sealed ceremonial door, and a plaza with three approaches.

Run (after copying this bundle into the showroom project):

  /Applications/Blender.app/Contents/MacOS/Blender \
    --background --factory-startup \
    --python tools/blender/build_scottish_rite_slice.py -- \
    --output assets/beyond-eden/raw --bake-ao --samples 64

The script exports five sectors at three LODs each. AO is baked into COLOR_0
(vertex color) when Blender supports vertex-color AO baking. A deterministic
analytic AO/indirect fallback is always applied, so exports are usable even if
Cycles baking is unavailable.

Coordinate contract: the browser is Y-up and looks down -Z. Blender is Z-up and
looks down -Y, so browser (x, y, z) is authored here as Blender (x, -z, y).
All sector origins below follow that conversion so generated GLBs align exactly
with the procedural browser fallback and collision world.
"""
from __future__ import annotations

import argparse
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="assets/beyond-eden/raw")
    parser.add_argument("--bake-ao", action="store_true")
    parser.add_argument("--samples", type=int, default=48)
    parser.add_argument("--keep-blend", action="store_true")
    return parser.parse_args(argv)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def setup_scene(samples: int) -> None:
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world.color = (0.012, 0.022, 0.025)
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = samples
        scene.cycles.device = "CPU"
        scene.render.bake.target = "VERTEX_COLORS"
        scene.render.bake.margin = 2
        scene.render.bake.use_clear = True
    except Exception as exc:
        print(f"[Beyond Eden] Cycles/vertex bake setup unavailable: {exc}")
        scene.render.engine = "BLENDER_EEVEE_NEXT"


def make_material(name: str, color: tuple[float, float, float, float], roughness: float = 0.8, metallic: float = 0.0, emission=None) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    if emission:
        if "Emission Color" in principled.inputs:
            principled.inputs["Emission Color"].default_value = emission[0]
            principled.inputs["Emission Strength"].default_value = emission[1]
        elif "Emission" in principled.inputs:
            principled.inputs["Emission"].default_value = emission[0]
            principled.inputs["Emission Strength"].default_value = emission[1]
    return material


def collection(name: str) -> bpy.types.Collection:
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    return result


def move_to_collection(obj: bpy.types.Object, target: bpy.types.Collection) -> None:
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    target.objects.link(obj)


def box(name: str, size, location, material, target, bevel=0.0) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("Small real-world edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        modifier.limit_method = "ANGLE"
    obj.data.materials.append(material)
    move_to_collection(obj, target)
    return obj


def cylinder(name, radius, depth, location, material, target, vertices=12) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    move_to_collection(obj, target)
    return obj


def torus(name, major_radius, minor_radius, location, rotation, material, target, major_segments=32, minor_segments=8) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    move_to_collection(obj, target)
    return obj


def make_relief_bay(index: int, x: float, stone, recess, target) -> None:
    # Runtime z=-38.68 maps to Blender y=+38.68. The panel slightly overlaps
    # the main wall so it cannot float or z-fight after glTF conversion.
    box(f"relief_panel_{index:02d}", (5.7, 0.55, 9.4), (x, 38.68, 9.7), recess, target, .06)
    # An original geometric figure, deliberately not copied from the historic
    # relief artwork. Blender Y is the wall normal, so rotation about Y creates
    # a diamond in the facade plane without increasing its depth.
    symbol = box(f"relief_symbol_{index:02d}_detail", (2.15, .28, 5.7), (x, 38.28, 9.7), stone, target, .04)
    symbol.rotation_euler.y = math.radians(45)

    crown = torus(
        f"relief_crown_{index:02d}_detail",
        1.6,
        .18,
        (x, 38.20, 12.2),
        (math.radians(90), 0, 0),
        stone,
        target,
        28,
        7,
    )
    crown.scale.x = .78


def build_temple_core(materials) -> bpy.types.Collection:
    target = collection("sector_temple-core")
    stone, recess, mosaic, bronze = materials["stone"], materials["recess"], materials["mosaic"], materials["bronze"]
    box("temple_main_mass", (72, 19, 20), (0, 48.5, 10), stone, target, .08)
    box("temple_west_wing", (18, 24, 15), (-42, 45, 7.5), recess, target, .06)
    box("temple_east_wing", (18, 24, 15), (42, 45, 7.5), recess, target, .06)
    box("entrance_block", (24, 3.2, 12.5), (0, 38.2, 8.7), recess, target, .05)
    box("mosaic_band", (88, .46, 1.18), (0, 38.83, 15.25), mosaic, target, .015)
    box("temple_coping", (76, 21, .8), (0, 48.3, 20.3), stone, target, .05)

    for index in range(8):
        side = -1 if index < 4 else 1
        bay = index % 4
        make_relief_bay(index, side * (14.6 + bay * 6.35), stone, recess, target)

    for index in range(10):
        box(f"facade_buttress_{index:02d}_detail", (1.8, 3.7, 18), (-32 + index * 7.1, 38.1, 9), recess, target, .03)

    # Original ceremonial door, not a replica of the archive artwork.
    box("door_frame_runtime_dynamic", (18.2, 1.15, 11.3), (0, 38.55, 7.85), stone, target, .08)
    box("sealed_door_runtime_dynamic", (15.7, .75, 9.5), (0, 37.92, 7.75), bronze, target, .04)
    for index in range(8):
        angle = math.radians(202 + index * (136 / 7))
        x = math.cos(angle) * 6.35
        z = 6.15 + math.sin(angle) * 3.3
        torus(f"page_seal_{index:02d}_runtime_dynamic", .38, .09, (x, 37.48, z), (math.radians(90), 0, 0), bronze, target, 20, 6)
    return target


def build_plaza(materials) -> bpy.types.Collection:
    target = collection("sector_plaza-center")
    stone, paving, planter, soil, bronze = materials["stone"], materials["paving"], materials["planter"], materials["soil"], materials["bronze"]
    box("plaza_paving", (112, 72, .28), (0, 2, -.14), paving, target, .015)
    steps = 14
    for index in range(steps):
        t = index / steps
        height = (index + 1) * (3.25 / steps)
        depth = 11.5 / steps
        box(f"entrance_step_{index:02d}", (22 - t * 4, depth + .05, height), (0, 28 + index * depth + depth / 2, height / 2), stone, target, .025)
    box("entrance_landing", (25, 6, .35), (0, 42, 3.08), stone, target, .03)

    positions = [(-24.5,-11),(24.5,-11),(-36,5.5),(36,5.5),(-17,20),(17,20),(-49,-8),(49,-8)]
    for index, (x, runtime_z) in enumerate(positions):
        box(f"cover_planter_{index:02d}", (5, 6, 1.1), (x, -runtime_z, .55), planter, target, .08)
        box(f"cover_soil_{index:02d}_detail", (4.45, 5.45, .16), (x, -runtime_z, 1.04), soil, target, .01)

    lamp_positions = [(-30,-23),(30,-23),(-48,16),(48,16),(-20,35),(20,35)]
    for index, (x, runtime_z) in enumerate(lamp_positions):
        cylinder(f"lamp_pole_{index:02d}", .11, 3.7, (x, -runtime_z, 1.85), bronze, target, 10)
        box(f"lamp_head_{index:02d}_detail", (.55, .35, .32), (x, -runtime_z, 3.74), bronze, target, .03)
    return target


def build_south_approach(materials) -> bpy.types.Collection:
    target = collection("sector_approach-south")
    paving, recess, bronze = materials["paving"], materials["recess"], materials["bronze"]
    box("south_processional_path", (22, 80, .22), (0, -65, -.11), paving, target, .015)
    box("south_west_wall", (1.2, 76, 1.2), (-12.4, -65, .6), recess, target, .04)
    box("south_east_wall", (1.2, 76, 1.2), (12.4, -65, .6), recess, target, .04)
    for index, (x, runtime_z) in enumerate([(-10,35),(10,35),(-10,61),(10,61),(-10,86),(10,86)]):
        cylinder(f"south_lamp_{index:02d}_detail", .1, 3.7, (x, -runtime_z, 1.85), bronze, target, 8)
    return target


def build_side_approach(name: str, side: int, materials) -> bpy.types.Collection:
    target = collection(f"sector_approach-{name}")
    paving, recess, planter, stone = materials["paving"], materials["recess"], materials["planter"], materials["stone"]
    x = side * 56
    box(f"{name}_paving", (42, 15, .22), (x, -7, -.11), paving, target, .015)
    box(f"{name}_low_wall", (30, 1.1, 2.4), (x + side * 4, 1.5, 1.2), recess, target, .04)
    box(f"{name}_planter", (20, 2.2, 1.1), (x - side * 5, -15.5, .55), planter, target, .06)
    arch = torus(f"{name}_ceremonial_arch_detail", 5.3, .72, (x, -2.4, 5.2), (math.radians(90), 0, 0), stone, target, 34, 9)
    arch.scale.x = 1.0
    return target


def add_color_attribute(obj: bpy.types.Object) -> bpy.types.Attribute:
    mesh = obj.data
    attr = mesh.color_attributes.get("BakedAO")
    if attr is None:
        attr = mesh.color_attributes.new(name="BakedAO", type="BYTE_COLOR", domain="CORNER")
    mesh.color_attributes.active_color = attr
    mesh.color_attributes.active = attr
    return attr


def analytic_baked_color(obj: bpy.types.Object, ao_floor: float = .48) -> None:
    mesh = obj.data
    attr = add_color_attribute(obj)
    mesh.calc_normals_split() if hasattr(mesh, "calc_normals_split") else None
    min_z = min((vertex.co.z for vertex in mesh.vertices), default=0.0)
    max_z = max((vertex.co.z for vertex in mesh.vertices), default=1.0)
    span = max(0.001, max_z - min_z)
    for loop in mesh.loops:
        vertex = mesh.vertices[loop.vertex_index]
        normal = loop.normal if hasattr(loop, "normal") else vertex.normal
        height = (vertex.co.z - min_z) / span
        upward = max(0.0, normal.z)
        ao = ao_floor + (1.0 - ao_floor) * (0.35 + .65 * height)
        indirect = .78 + upward * .22
        value = max(.18, min(1.0, ao * indirect))
        attr.data[loop.index].color = (value * .90, value * .96, value, 1.0)


def bake_ao(objects: list[bpy.types.Object], enabled: bool) -> None:
    for obj in objects:
        if obj.type != "MESH":
            continue
        analytic_baked_color(obj)
        if not enabled:
            continue
        try:
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            add_color_attribute(obj)
            bpy.ops.object.bake(type="AO")
            # Re-apply a cool indirect tint while retaining baked AO values.
            attr = obj.data.color_attributes.get("BakedAO")
            if attr:
                for color in attr.data:
                    ao = sum(color.color[:3]) / 3.0
                    color.color = (ao * .90, ao * .96, ao, 1.0)
        except Exception as exc:
            print(f"[Beyond Eden] AO bake fallback for {obj.name}: {exc}")
            analytic_baked_color(obj)


def duplicate_for_lod(source: bpy.types.Collection, lod: int) -> bpy.types.Collection:
    target = collection(f"EXPORT_{source.name}_LOD{lod}")
    ratio = {0: 1.0, 1: .58, 2: .24}[lod]
    for original in source.objects:
        # The interactive ritual door is modeled in the .blend for reference
        # but instantiated at runtime, so it must not be duplicated in GLBs.
        if "_runtime_dynamic" in original.name:
            continue
        if lod >= 1 and "_detail" in original.name:
            continue
        duplicate = original.copy()
        if original.data:
            duplicate.data = original.data.copy()
        target.objects.link(duplicate)
        if duplicate.type == "MESH" and ratio < 1:
            modifier = duplicate.modifiers.new(f"LOD{lod}_decimate", "DECIMATE")
            modifier.ratio = ratio
            modifier.use_collapse_triangulate = True
            bpy.context.view_layer.objects.active = duplicate
            duplicate.select_set(True)
            try:
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            except Exception:
                pass
            duplicate.select_set(False)
    return target


def export_collection(source: bpy.types.Collection, output_dir: Path, stem: str, lod: int) -> Path:
    export_collection = duplicate_for_lod(source, lod)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_collection.objects:
        obj.select_set(True)
    if export_collection.objects:
        bpy.context.view_layer.objects.active = export_collection.objects[0]
    output = output_dir / f"{stem}-lod{lod}.glb"
    export_operator = bpy.ops.export_scene.gltf
    supported = {prop.identifier for prop in export_operator.get_rna_type().properties}
    export_options = {
        "filepath": str(output),
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
    # Blender 5 uses export_vertex_color; older exporters used export_colors.
    if "export_vertex_color" in supported:
        export_options["export_vertex_color"] = "ACTIVE"
        if "export_all_vertex_colors" in supported:
            export_options["export_all_vertex_colors"] = False
        if "export_active_vertex_color_when_no_material" in supported:
            export_options["export_active_vertex_color_when_no_material"] = True
    elif "export_colors" in supported:
        export_options["export_colors"] = True
    export_operator(**{key: value for key, value in export_options.items() if key in supported})
    exported_objects = list(export_collection.objects)
    bpy.data.collections.remove(export_collection)
    for obj in exported_objects:
        mesh = obj.data if obj.type == "MESH" else None
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    print(f"[Beyond Eden] Exported {output}")
    return output


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    clear_scene()
    setup_scene(args.samples)

    materials = {
        "stone": make_material("Baked limestone", (0.48, 0.50, 0.47, 1), .92),
        "recess": make_material("Recessed limestone", (0.25, 0.29, 0.28, 1), .95),
        "mosaic": make_material("Original teal-gold mosaic band", (0.19, 0.43, 0.43, 1), .68, .08),
        "bronze": make_material("Aged ceremonial bronze", (0.16, 0.11, 0.07, 1), .55, .72),
        "paving": make_material("Dark plaza paving", (0.25, 0.30, 0.29, 1), 1.0),
        "planter": make_material("Plaza planter stone", (0.27, 0.30, 0.28, 1), .94),
        "soil": make_material("Planter soil", (0.07, 0.08, 0.06, 1), 1.0),
    }

    sectors = {
        "temple-core": build_temple_core(materials),
        "plaza-center": build_plaza(materials),
        "approach-south": build_south_approach(materials),
        "approach-west": build_side_approach("west", -1, materials),
        "approach-east": build_side_approach("east", 1, materials),
    }

    all_meshes = [obj for target in sectors.values() for obj in target.objects if obj.type == "MESH"]
    bake_ao(all_meshes, args.bake_ao)

    for stem, source in sectors.items():
        for lod in range(3):
            export_collection(source, output_dir, stem, lod)

    if args.keep_blend:
        blend_path = output_dir / "scottish-rite-proof-source.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
        print(f"[Beyond Eden] Saved {blend_path}")

    print("[Beyond Eden] Temple proof kit complete.")


if __name__ == "__main__":
    main()
