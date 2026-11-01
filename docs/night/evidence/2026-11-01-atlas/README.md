# Night district: nine more atlas landmarks (2026-11-01)

Nine buildings from the architecture atlas added as new landmarks on a widened night map (night-layout.json v2):
the False Gate, Palace of Mirrors, Redwood Chapel, First Cathedral, Campanile, High Tower, Three Arches, Rose Window
and Organ Tower. Captured with `node tools/agent/capture-night-landmark.mjs` (headless Chrome, Metal, 1280x800 @2x).

**All 17 views, light machine load** (`all-views-light-load.json`): every view 60 fps, p95 16.7–16.8 ms, zero frames
over 33 ms, every model streamed in. (Measured before the ground under the new sites was flattened and before
streaming went one-at-a-time with unloading; both changes only remove work.)

**Paired, same conditions, heavy machine load** (1-min load average ~11 from other work; `paired-new.json` vs
`baseline/paired-baseline.json`, HEAD before this change):

| view | baseline | with the nine buildings |
|---|---:|---:|
| theatre facade | 34.0 | 36.7 |
| Moon Temple | 39.5 | 37.3 |
| Observatory | 43.3 | 43.0 |
| Hotel | 40.9 | 42.5 |
| Gardens approach | 45.8 | 47.0 |
| Gardens court | 44.7 | 45.1 |
| road toward the theatre | 39.0 | 40.2 |

Result: no measurable frame-rate cost. Each building's arrival costs one main-thread task of roughly 0.3–0.5 s (GLB
parse, texture upload, shader compile), the same as the five earlier landmarks; streaming loads the nearest building
one at a time within 75 m and releases models beyond 110 m. Under heavy load, two full-tour runs of the new build
stalled in headless Chrome (evaluate timeout); the stall did not reproduce in isolation or in later full tours.
