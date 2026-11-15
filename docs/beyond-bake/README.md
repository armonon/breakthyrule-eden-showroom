# Beyond Eden lighting and combat close-out

Source baseline: `7b76ce2`. Implementation starts at `8ecf92e`; subsequent commits bound the light pool and exclude loading-screen frames from adaptive resolution. Captures use isolated Chrome with its real Metal GPU on an Apple M3, medium graphics, a 1280 × 800 viewport and DPR 1. This is one laptop measurement, not a guarantee for all phones or GPUs.

## Measured gameplay result

The final five-minute run averaged **16.67 ms** (60 Hz), with a **16.70 ms p95** and **33.30 ms maximum** outside loading after the first ten seconds. It recorded **zero frames over 50 ms** and **zero runtime exceptions**. Medium adaptive quality stayed at pixel ratio 1 in the recorded checkpoints. This result is specific to the tested Apple M3 session.

Shader programs stayed at 224 from the prepared doorway through all three district stops. One additional depth variant appeared in the firefight; it did not produce a >50 ms frame. First visits still compile material/depth programs behind the loading screen (202 → 224 entering Beyond; 225 → 234 returning to Eden). **A literal zero-compilation first crossing is not achieved**; world-light switching itself keeps its defines stable.

All five visual-pool capacities remained unchanged. Audio decoded 99/99 clips, with zero failed files and zero channel drops; 1,108 sounds played by the last firefight checkpoint. Bot model UUIDs remained unchanged across deaths and respawns. The separately recorded 60-second video contains 64 body hits, 48 head hits and 29 kills; these counts include the game's normal damage/power progression.

Earlier diagnostic failures and the fixes they led to are retained in `iteration-notes.json`. The full report is `five-minute.json`; `checks.json` lists the verification commands. The video was captured before the final loading-screen-only adjustment, with identical combat and lighting.

## Fixed-view results and remaining limits

| View | Shadow triangles before → after | Reduction | Render cost before → after |
|---|---:|---:|---:|
| Entry | 472,173 → 37,108 | 92.14% | 3.74 → 21.87 ms |
| Commons | 317,663 → 23,520 | 92.6% | 3.30 → 3.49 ms |
| Observatory | 465,222 → 37,120 | 92.02% | 3.24 → 16.32 ms |
| Hotel | 314,823 → 37,120 | 88.21% | 3.61 → 16.94 ms |
| Gardens | 317,803 → 40,128 | 87.37% | 2.57 → 16.87 ms |

The shadow-triangle target passes in every view (87–93% reduction). Counts are visible shadow-eligible geometry, not the triangles actually submitted inside the shadow frustum.

**A lower raw rendering cost is not demonstrated.** The matched-resolution screenshot run completed after a system pause and reported the costs above, plus slower frame intervals (including a 366.7 ms maximum at Commons). The cause of those later slow frames is unresolved; they are retained in `after/report.json`. The alternating bake/fallback benchmark in the successful traversal was 5.03 / 4.77 ms, approximately 5% more cost with the bake. Baked lamp/shadow detail therefore should not be advertised as an overall GPU speedup. The clean five-minute traversal is a measured result for that session, not a guarantee of consistently hitch-free performance.

Other limits: literal zero first-visit shader compilation is not achieved; one first-fire depth variant remains. This release has not been benchmarked on a physical phone. The gunfire pools are preallocated, but gameplay events, ragdoll startup, C4 debris and Web Audio one-shot source nodes still allocate CPU objects.

## Lighting

The static Cycles bake includes the old civilization, road, parkour props and pyramid. It supplies sky/bounced moon/street-lamp irradiance, a separate moon-visibility ground map, and a directional probe volume. The 2048-pixel maps and 47 × 13 × 45 probes cover the district through the pyramid, up to 36.4 m. Ground samples use 64 samples; probes use 48. Blender 5.2.3 LTS / Metal generated this release.

Runtime irradiance is Cycles' diffuse bake × π. RGB is encoded as `sqrt(irradiance / scale)`; probe B alpha stores static moon visibility. Both world volumes are installed before shaders compile; switching changes uniform values. The night bake fades in between night values .55 and .84, preserving the existing daylight cycle. Missing bake assets leave live lighting and static shadows enabled.

At full night, registered static meshes stop casting into the live shadow map. It contracts from a 50 m to a 16 m box, following the player's height on roofs. Moving characters retain live shadows nearby; distant test bots disable their shadow casters beyond 22 m. Daylight restores static and character shadows. The three street lamps remain in the scene with zero intensity when baked. Six persistent point-light slots select the strongest nearby visible sources. Hidden sources contribute zero intensity; the pyramid hemisphere also has a stable proxy. This bounds light-loop cost as well as avoiding changing light-count shader defines across worlds. Eden’s nearby library and doorway sources retain their positions, colours and intensity.

The district's high-detail models switch to their existing architectural proxies beyond 82 m and return inside 72 m. Collision, roof and traversal data remain unchanged. Preparing the complete small district retains its bounded set of models, preventing repeated decoding during exploration. First-time model preparation, geometry upload and depth/material compilation run behind the doorway loading screen. This does not eliminate all first-visit shader compilation: it moves preparation under the loading screen and keeps light-count variants stable during play.

This is a ground/probe bake, not per-building UV lightmaps. Narrow interior shadows and small wall details are limited by probe spacing; moving doors and the day/night transition still depend on live lighting.

## Combat

- Recorded firearm cores (3–4 per firearm), distant shots, mechanical and tail layers; body/head/kill accents, material impacts, casings, edited near-miss cracks, and two voice sets. Existing procedural sounds remain the fallback.
- 99 mono AAC clips, cached once; non-repeating selection and ±4% playback variation. Positional sounds use stereo direction, distance gain, low-pass filtering and optional propagation delay. 48 persistent audio channels bound concurrency. Web Audio requires a new one-shot AudioBufferSourceNode per playback; this is not a claim of zero JavaScript allocations.
- Fixed visual pools: 400 particles, 32 tracers, 64 casings/magazines, 90 fading decals, and 156 flipbook effects. Saturation drops cosmetic effects instead of creating more objects. Gunfire reuses geometry, materials, colors and velocity storage.
- Per-weapon recoil springs, small FOV punch, existing ADS sway/breathing/reload poses, recorded dry clicks, and a smoothed near-wall pullback.
- Head/arm/leg/chest responses with heavier head reactions and the existing death ragdoll. Corrected a double-subtraction health check that prevented some surviving enemies from reacting.
- Saved Off / Low / Medium / High aim assistance; Medium remains the default. Line-of-sight gates both slowing and shot correction.
- Reused procedural pose scratch vectors, quaternions and animation layers. Enemy respawns reset the current loaded skeleton in place instead of creating another character; each replacement skeleton owns its compatible recovery pose. Character checkpoint/replay tests cover the deterministic rig state. Visual hit-stop slows the weapon animation without suspending the main render loop. Adaptive resolution ignores the complete loading-screen interval, including its fade, so loading stalls cannot trigger a delayed render-target resize after returning to Eden.

## Evidence and reproduction

`before/` and `after/` contain five fixed views (entry, commons, observatory, hotel, gardens), an Eden view, and renderer/overlay reports. Comparison captures pin the internal pixel ratio to .75 on both revisions; the five-minute run retains adaptive medium graphics. Each view records the median of three synchronous GPU-finished rendering costs after an extra warm-up batch, separate from the 60 Hz presentation limit. These costs include CPU submission plus GPU completion, not GPU-timer-query measurements.

`runtime-checks.json` verifies saved aim assistance, live-light fallback, in-place enemy revival, C4 rendering, and standalone expedition entry. Twenty-four checkpoint, visual revival, adaptive resolution and server checks pass; the release checker validates 608 required source assets and all 102 loaded game scripts parse.

`five-minute.json` records the scripted five-minute route, rAF intervals, loading visibility, overlay reports, shader cache keys, audio counts and effect capacities. After initial keyboard interaction and a 12-second startup warm-up, the route includes normal keyboard walking, fixed-view camera placements, an actual bot firefight and return to Eden. `combat-60s.mp4` is a separate gameplay capture with game audio; video capture is excluded from performance results. Debug god mode and a large ammunition reserve keep the capture running. Video targets are repositioned onto the open road when selected so body/head impacts remain visible; all shots use the normal world raycast/damage path. The five-minute fight uses the bots’ normal positions and movement.

```sh
PORT=8790 node tools/agent/serve-handoff.mjs
node tools/agent/export-static-scene.mjs --world beyond --out /tmp/btr-beyond-scene
blender -b --factory-startup --python tools/blender/bake_beyond_light.py -- --scene /tmp/btr-beyond-scene --out /tmp/btr-beyond-bake --size 2048 --samples 64 --probe-samples 48
python3 tools/pipeline/encode-beyond-light.py /tmp/btr-beyond-bake assets/beyond-bake
node tools/agent/measure-beyond-bake.mjs --out docs/beyond-bake/after
node tools/agent/accept-beyond-combat.mjs
```

The encoder requires NumPy and Pillow. The audio preparation script requires FFmpeg and NumPy; its source folder is deliberately external to git. `assets/audio/combat/manifest.json` records original URLs, source hashes, trims and filters. All shipped playback files are committed.

## New assets and licences

- `assets/beyond-bake/`: lighting generated locally from project geometry; underlying credits remain in `assets/night/SOURCE.md` and the existing foliage credits. See its `CREDITS.txt`.
- `assets/audio/combat/`: CC0 sources from the Free Firearm Sound Library, Kenney Impact Sounds, Brian MacIntosh, Brandon Song and Exewin. Exact credits, links and derivative edits are in `CREDITS.txt` and `manifest.json`. Near-miss sounds are edited firearm transients; short Voice B pain sounds derive from Exewin's death recordings.

The production release goes through `tools/ship.sh`, with generated script/style hashes and automatic Netlify publishing from `main`.
