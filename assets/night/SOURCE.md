# Night district assets

Fourteen landmarks, built locally (no cloud services) by scripted Blender in the asset workshop
(`~/Projects/breakthyrule-asset-workshop`: `scripts/blender/btr_kit.py` + `build_*.py`; the nine later atlas buildings share
`build_atlas_building.py --building ID`; sources in `assets/_world/mayan-theatre/v001/`,
`assets/_world/night-buildings/v001/` and `assets/_world/atlas-buildings/v001/`). Each is an original design that
translates a building from the internal *Beyond Eden Selected Architectural Atlas*; archive photographs were not
used as inputs (prompts describe styles in words), and nothing is a replica.

| GLB | Game landmark | Atlas reading | Style |
|---|---|---|---|
| mayan-theatre.glb | The Silent Playhouse | Mayan Theatre | Pre-Columbian revival: sculpted masks, guardians, marquee |
| moon-temple.glb | The Moon Temple | Wilshire Boulevard Temple | Byzantine revival: ribbed dome on an octagonal drum, triple arches |
| shrine-observatory.glb | The Observatory | Shrine Auditorium | Moorish revival: horseshoe portal, minarets, onion dome, armillary |
| citadel-hotel.glb | The Hotel on the Hill | Samson Tire Citadel | Assyrian revival: crenellated gate towers, glazed bands, procession reliefs |
| egyptian-gardens.glb | The Sunken Gardens | Grauman's Egyptian Theatre | Egyptian revival: battered pylons, papyrus colonnades, sphinx avenue |
| girard-gate.glb | The False Gate | Girard Gateway & Administration | Mission revival: paired domed towers, stepped parapet, arcaded shopfronts, urns |
| palace-of-mirrors.glb | The Palace of Mirrors | Los Angeles Theatre | French Baroque movie palace: giant arched window, paired columns, blade sign, muses |
| redwood-chapel.glb | The Redwood Chapel | St. James' Episcopal Church | Compact Gothic: corner spire, steep slate roof, redwood trusses, quatrefoil band |
| first-cathedral.glb | The First Cathedral | Cathedral of Saint Vibiana | Italianate: pilastered front, pediment relief, tall domed bell tower, angels |
| campanile.glb | The Campanile | Wilshire United Methodist Church | Romanesque basilica: arcaded porch, tiled roof, Italianate campanile |
| high-tower.glb | The High Tower | Immanuel Presbyterian Church | French Gothic: tall pinnacled tower, buttresses, lancets, tympanum |
| three-arches.glb | The Three Arches | First Baptist Church of Los Angeles | Lombard Romanesque: three great arches, corner towers, plaza, lions |
| rose-window.glb | The Rose Window | Wilshire Christian Church | Gothic: gabled front with a great rose window, tower and spire |
| organ-tower.glb | The Organ Tower | First Congregational Church | Gothic cathedral: massive central tower over the door, gargoyles |

- The first five keep their footprints, doorways and page sockets; the nine atlas buildings are new landmarks on
  the widened night map (night-layout.json v2) with standard footprint walls, so the watcher's pathfinding sees
  them. `night-district.js` adds collision for towers, porches and plinths.
- Materials: Poly Haven scans, CC0 (1k diff/arm/nor_gl; see the workshop's `downloads/polyhaven/textures/SOURCE.txt`).
- Reliefs: original designs generated with SDXL Base 1.0 (Draw Things, local), converted by Depth Anything V2 Small
  (Apache-2.0, local) into coarse displaced geometry plus normal/cavity maps over a stone scan. The design images
  are not shipped.
- Statues (Mayan guardians, Assyrian winged guardians, sphinxes, urns, muses, angels, gargoyles, lions): SDXL design -> Modly with Hunyuan3D Mini Turbo
  (local, 10 steps, octree 380), decimated to 5–6k triangles, given a scan material.
- Shipping: `tools/pipeline/optimize-landmark.sh` (normal/ARM maps 512 px, JPEG 80, KHR_mesh_quantization).
  Each GLB is ~2 MB; buildings stream in when the viewer is within 75 m.

## built/ (Beyond Eden's own build; the expedition page keeps the GLBs above)

`built/<name>.glb` is the same building re-cut by a scripted, re-runnable Blender pass (`bash tools/night/build-landmarks.sh`,
`tools/night/build-landmarks.py`): bevelled and chipped hard edges, windows set back 15–20 cm with reveals, architraves,
sills, lintels and glazing bars, cast-iron drainpipes, and a `_WEATHER` vertex attribute on the walls (rain streaks under
ledges and sills, occlusion) that `matrix-world.js` reads. Those files hold geometry and material names only;
`night-district.js` takes each material, textures and all, from the original GLB by name (`<name>@wash` is a copy that
carries the architectural uplight: the temple's and theatre's fronts and the hotel's entrance). Footprints, doorways and
step heights are the originals'; collision still comes from `night-layout.json` / `expedition-world.js`. The timber's
boards scan is Poly Haven's CC0 `weathered_planks` (`assets/beyond-eden/scan/planks-*`, see its CREDITS.txt).
