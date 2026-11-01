# Night district assets

## mayan-theatre.glb — The Silent Playhouse (Mayan Theatre), pilot

Built locally on 2026-10-31 by `scripts/blender/build_mayan_theatre.py` in the asset workshop
(`~/Projects/breakthyrule-asset-workshop`, sources in `assets/_world/mayan-theatre/v001/`). No cloud services.

- Architecture: scripted in Blender 5.0.1 on the playhouse footprint (18 x 16 m, 3.6 m doorways), so wall
  collision and the server are unchanged. World-scale box UVs; one draw call per material.
- Materials: Poly Haven scans, CC0 (large_sandstone_blocks, old_sandstone_02, concrete_brick_wall_001; 1k diff/arm/nor_gl).
- Reliefs (sun mask, guardian panels, jaguar masks): original designs generated with SDXL Base 1.0 (Draw Things, local),
  converted by Depth Anything V2 Small (Apache-2.0, local) into displaced geometry plus normal/cavity maps over the
  sandstone scan. The design images themselves are not shipped. Prompts describe a Maya-revival style in words;
  no archival photos were used as inputs.
- Guardian statues: SDXL design -> Modly with Hunyuan3D Mini Turbo (local, 10 steps, octree 380), decimated to 6k
  triangles and given the sandstone scan material.
- Marquee lettering: Blender's built-in font, emissive.

Budget: 6.98 MB GLB (JPEG textures, KHR_mesh_quantization), 35.6k triangles, 13 nodes; plain GLB for the r158 GLTFLoader.
