# Night district: all five landmarks modelled (2026-11-01)

Captured with `node tools/agent/capture-night-landmark.mjs` (headless Chrome, Metal, 1280x800 @2x, garden adaptive
resolution on). Two clean builds were measured back to back, twice each: HEAD (procedural temple, observatory,
hotel and gardens; theatre modelled; `baseline/`) and HEAD + the four new buildings. Machine load was low (1-min
load average 2–4).

| view | baseline run 1 / 3 | new buildings run 2 / 4 |
|---|---:|---:|
| theatre approach (first view, absorbs night build + streaming) | 52.6 / 60.0 | 60.0 / 60.0 |
| theatre facade | 59.0 / 60.0 | 59.9 / 60.0 |
| Moon Temple approach | 60.0 / 60.0 | 60.0 / 60.0 |
| Observatory approach | 60.0 / 60.0 | 60.0 / 60.0 |
| Hotel approach | 60.0 / 60.0 | 60.0 / 60.0 |
| Gardens approach | 60.0 / 60.0 | 60.0 / 60.0 |
| Gardens court | 60.0 / 60.0 | 60.0 / 60.0 |
| road toward the theatre | 60.0 / 60.0 | 60.0 / 60.0 |

Result: every view holds the 60 Hz refresh with the new buildings; p95 16.8 ms, zero frames over 33 ms in runs 2
and 4. Headroom beyond vsync was not measured.

Budget per building (after `tools/pipeline/optimize-landmark.sh`): 1.3–2.5 MB GLB, 12k–32k triangles, 9–10 nodes,
no scene lights. Buildings stream in when the viewer is within 75 m (about 9.4 MB for all five, vs 42 MB unoptimized).
