# Night district assets

Five landmarks, built locally (no cloud services) by scripted Blender in the asset workshop
(`~/Projects/breakthyrule-asset-workshop`: `scripts/blender/btr_kit.py` + one `build_*.py` per building; sources in
`assets/_world/mayan-theatre/v001/` and `assets/_world/night-buildings/v001/`). Each is an original design that
translates a building from the internal *Beyond Eden Selected Architectural Atlas*; archive photographs were not
used as inputs (prompts describe styles in words), and nothing is a replica.

| GLB | Game landmark | Atlas reading | Style |
|---|---|---|---|
| mayan-theatre.glb | The Silent Playhouse | Mayan Theatre | Pre-Columbian revival: sculpted masks, guardians, marquee |
| moon-temple.glb | The Moon Temple | Wilshire Boulevard Temple | Byzantine revival: ribbed dome on an octagonal drum, triple arches |
| shrine-observatory.glb | The Observatory | Shrine Auditorium | Moorish revival: horseshoe portal, minarets, onion dome, armillary |
| citadel-hotel.glb | The Hotel on the Hill | Samson Tire Citadel | Assyrian revival: crenellated gate towers, glazed bands, procession reliefs |
| egyptian-gardens.glb | The Sunken Gardens | Grauman's Egyptian Theatre | Egyptian revival: battered pylons, papyrus colonnades, sphinx avenue |

- Footprints, doorways and page sockets are unchanged; `night-district.js` adds collision for new solid parts.
- Materials: Poly Haven scans, CC0 (1k diff/arm/nor_gl; see the workshop's `downloads/polyhaven/textures/SOURCE.txt`).
- Reliefs: original designs generated with SDXL Base 1.0 (Draw Things, local), converted by Depth Anything V2 Small
  (Apache-2.0, local) into coarse displaced geometry plus normal/cavity maps over a stone scan. The design images
  are not shipped.
- Statues (Mayan guardians, Assyrian winged guardians, sphinxes): SDXL design -> Modly with Hunyuan3D Mini Turbo
  (local, 10 steps, octree 380), decimated to 5–6k triangles, given a scan material.
- Shipping: `tools/pipeline/optimize-landmark.sh` (normal/ARM maps 512 px, JPEG 80, KHR_mesh_quantization).
  Each GLB is ~2 MB; buildings stream in when the viewer is within 75 m.
