# Graphics plan: results (2026-11-05)

Branch `graphics/realism`, cut from `character/ps2-era`. Uncommitted and undeployed at the time of writing.
Before and after captures: `docs/graphics/baseline/`, `docs/graphics/baseline-rerun/`, `docs/graphics/after/`.

## Measured (M4, headless Chrome, Metal)

| | Before | After |
|---|---|---|
| Downloaded in first 10 s, cold | 77.5 MB | 39.0 MB |
| Downloaded by first view | 16.8 MB | 17.9 MB |
| Runtime GLBs (162 files) | 434 MB | 104 MB |
| Product images | 64 MB PNG | 8.7 MB WebP |
| Draw calls, spawn / lawn / road | 334 / 350 / 321 | 337 / 350 / 320 |
| Triangles, spawn | 631k | about 670k (grass adds about 40k) |

GPU time could not be compared cleanly before and after. Readings ranged from 4 to 18 ms between runs for both versions
because other GPU work was running on this machine (Ollama held a 12 GB model). Toggling features in one page, lawn view
at 1800x1125, gave about 4.6 ms all on, TAA about +0.4 ms, baked light and grass within noise.
Not measured: GPU memory, and real low-end hardware. Device classes change viewport and CPU throttling only.

## Done

1. Measure: `tools/agent/garden-baseline.mjs`, `tools/agent/garden-regression.mjs`.
2. Compress: `tools/pipeline/compress-site-models.mjs`, `products-to-webp.py`. Twelve night buildings keep their JPGs and
   take meshopt only, because KTX2 grew them over 1.5x. `assets/flora` and `assets/eden-hero` skip meshopt because
   eden-flora.js edits their raw vertices (quantization made the trees disappear). Rack models were already the garment
   LOD (about 16k triangles against 230k).
3. Bake: `tools/agent/export-static-scene.mjs` -> `tools/blender/bake_garden_light.py` (Cycles) ->
   `tools/pipeline/encode-garden-light.py`. `eden-baked-light.js` gives the terrain a lightmap and every physical material
   a 3D probe grid, moving things included. The sun stays live, with baked visibility beyond the shadow frustum.
4. Scanned materials: leaf litter in canopy shade, worn earth around stones, foliage cards from CC0 scans
   (`tools/pipeline/build-foliage-cards.py`).
5. Vegetation: `eden-grass.js`, translucent leaves, alpha-to-coverage.
6. Engine: three.js r158 -> r187 (`tools/pipeline/build-three-bundle.mjs`), temporal AA, AO varied per frame, AgX, grading
   LUT, adaptive sharpening, grain.

## Not done, or partly done

- Gaussian splats (step 7): not done. No CC0 outdoor scene turned up; it needs a real capture.
- Scanned close trees: partly. Jacarandas are scanned; the apple tree and cypresses keep generated branches with scanned
  cards. Cypress foliage is the weakest part of the scene (real fern fronds tinted dark).
- Far-tree impostors: jacarandas only, which already had them.
- AO is the existing method with per-frame variation, not a new algorithm such as GTAO.
- HDR sky: the sky is procedural; no HDR photo was added.
- Grass stops at the garden edge, so road verges are still flat.
- 39 MB in 10 s is still over the 25 MB budget, though first view (17.9 MB) is under it.
- Pavilion draw calls can spike (660-1050 seen) while the rack loads; 329 once settled.
- The bake covers daytime in the garden. Re-run it when garden geometry moves.


## Merge with main (2026-11-05)

Main moved 36 commits while this branch was in progress (open match, shared weather, HDR sky, graphics setting, its own
asset compression). Merged before release. Decisions:

- Road: main's brick road stays (The Long Brick Road), so the scanned cobble was removed.
- Props and the Violet Trickster: main's simplified WebP models. Library set and jacaranda: this branch's KTX2 versions.
- HDR sky: its reflections are kept; its diffuse light is replaced by the bake inside the probe grid.
- World textures use main's small `products/web/` copies; the shop uses the full-size WebP files.
- Colour: pocket worlds (museum, vault, black box) use Neutral tone mapping without the LUT so garments match their photos;
  the garden keeps AgX. TAA reprojection now uses one matrix multiplied in doubles, which fixed blur in pocket worlds.

Measured against the live site in the same script on the same M4 (calls): spawn 319 vs 314, vault 268 vs 265, librarian
604 vs 688, open match 575 vs 583. Over budget as live already is.

Re-baked after the merge, so main's statues, toll, secrets and hidden garments block light. The sky box and its backstage
are left out on purpose (`export-static-scene.mjs`): from inside the garden they read as open sky, and as geometry they
would darken it. Grass and blob shadows are left out too. Settings: 2048 terrain, 192 samples, 128 per probe. Run
Blender by its full path (`/Applications/Blender.app/Contents/MacOS/Blender`), since it is not on PATH.
