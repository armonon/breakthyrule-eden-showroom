# Mayan Theatre pilot — in-game evidence (2026-10-31)

Captured with `node tools/agent/capture-night-landmark.mjs` (headless Chrome 156, Metal, 1280x800 @2x, garden
adaptive resolution on). Each view drifts the camera 0.6 m for 10 s so every frame redraws.

Two clean builds were measured back to back, twice, under the same machine load: HEAD (procedural playhouse,
`baseline/`) and HEAD + the theatre. The machine was heavily loaded (1-min load average 10–18), so absolute fps is
low and noisy; only the paired comparison means anything.

| view | baseline run 1 / 2 | theatre run 1 / 2 |
|---|---:|---:|
| approach (first view, absorbs night build) | 16.7 / 21.9 | 16.9 / 36.1 |
| facade | 23.9 / 39.3 | 28.7 / 50.9 |
| statue | 33.6 / 44.6 | 35.6 / 55.1 |
| doorway | 33.8 / 35.4 | 39.6 / 55.8 |
| road toward theatre | 38.1 / 37.4 | 37.9 / 56.2 |

Result: no measurable frame-rate cost from the theatre at this noise level.

What it took (measured on the way):
- First build (158k triangles, a dedicated SpotLight) halved the frame rate on the facade view. A CPU profile showed
  the frame GPU-bound (CPU ~70% idle); at a pinned pixel ratio, hiding only the reliefs recovered most of it.
- Relief grids cut from 125k to ~18k triangles (the carving lives in the normal/cavity maps), statues 14k -> 6k,
  reliefs no longer cast shadows; instances merged to one mesh per material (32 -> 13 nodes).
- The SpotLight was removed: in r158 every scene light is evaluated by every lit material. The marquee joins the
  district's existing three-light lamp pool instead.

GLB: 6.98 MB (quantized positions/normals/UVs, JPEG textures), 35.6k triangles, 13 nodes.
