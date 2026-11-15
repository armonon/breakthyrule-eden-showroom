# Prompt: finish AAA gunplay, bake Beyond Eden's lighting, and close out performance

Copy everything below the line into a new agent session (Codex or Claude) on a machine that has **Blender 4.x**,
**Node 20+** and **Chrome**, with this repository checked out.

---

You are working on **Break Thy Rule · Eden**, a three.js r187 web game (static site, no build step). Live site:
https://breakthyrule-eden-showroom.netlify.app (Eden at `/showroom.html`, the separate expedition at `/expedition.html`).

## Rules (read `AGENTS.md` first; it is binding)

- `main` is the live site; Netlify publishes it automatically. **Never deploy by hand.** Ship only with `tools/ship.sh`
  (it merges the latest `main`, refreshes content-hash `?v=` versions, syntax-checks every game script, checks that
  nothing referenced is missing, and pushes with retries). Start with `git fetch origin && git merge origin/main`.
- **Only add.** Another agent works in parallel. When merging keep both sides; never replace someone's file wholesale.
- `player-motion.js`, `player-movement.js`, `parkour.js`, `movement-state.js` and the expedition modules also run on
  the server: keep them deterministic (no `Math.random`, no wall clock, no DOM).
- Commit small, descriptive commits. Every committed asset must be one you have the right to ship (CC0 / CC-BY with
  credit in `assets/**/CREDITS.txt`, or made here).
- Measure before and after. Use the in-game performance overlay (**F8** or `?perf=1`, "Copy report"), Chrome
  DevTools Performance, and `renderer.info`. Report numbers, not impressions.

## Where things are

- Eden entry and main loop: `showroom.html`, `app.js` (debug handle `window.breakThyRuleShowroom`: `.scene()`,
  `.renderer()`, `.combat()`, `.battle()`, `.worlds()`, `.parkour()`, `.prewarm()`, `.perf()`, `.getState()`,
  `.teleport(x,z,yaw)`, `.sim(...)`).
- Weapons, shots, recoil, muzzle flash, procedural audio (`sfx`), hitmarker, aim assist (`ASSIST`, `assistScan`):
  `combat.js` + `combat.css`. Weapon art is in the arms rig (`combat-arms.js`).
- The open match in Beyond Eden (bots, damage, `shotHook`, `aimTargets`, flinch): `battle-arena.js`.
- Separate worlds and loading screens: `worlds.js` (`classify`, `apply`, `compileFor`). Idle-time warm-up:
  `prewarm.js`. Overlay: `perf-hud.js`.
- Lighting: `eden-lighting.js` (sun, follow shadows in 2.5 m steps, cached environment bakes by night level) and
  `eden-baked-light.js` (Eden's baked indirect light: a terrain lightmap plus a 3D probe grid that every
  `MeshStandardMaterial` reads, installed by patching `THREE.ShaderChunk` before materials compile).
- Beyond Eden geometry: `night-district.js` (buildings from `night-layout.json`, street-lamp light pool that moves to
  the nearest lamps, so the light count stays constant), `road-pyramid.js`, `pyramid-gathering.js`,
  `parkour-grips.js` (bars, pipes, ropes).
- The existing Eden bake pipeline (use it as the template):
  1. `node tools/agent/export-static-scene.mjs --url http://127.0.0.1:8790/showroom.html --out /tmp/eden-scene`
     dumps static world triangles grouped by material with average albedo (characters and animated things excluded).
  2. `blender -b --factory-startup --python tools/blender/bake_garden_light.py -- --scene /tmp/eden-scene/ --out /tmp/eden-bake/`
     bakes in Cycles: `terrain_indirect.npy`, `terrain_sun.npy`, `probes.npy` (6-direction irradiance grid).
  3. `python3 tools/pipeline/encode-garden-light.py` encodes them to `assets/eden-bake/` (`lightmap.jpg`, `sun.jpg`,
     `probes.bin`, `bake.json`, `grass-mask.png`).
  Unit convention: three.js shades diffuse as albedo/π × irradiance; a Cycles DIFFUSE bake with colour off stores
  irradiance/π, so runtime irradiance = bake × π.
- Serve locally with `PORT=8790 node tools/agent/serve-handoff.mjs` (static, no server deps needed).

## Task 1: Bake Beyond Eden's lighting (the main performance and quality win)

Beyond Eden is a night world with no bake: every frame pays for real-time light and the follow-shadow pass
(~371k shadow-caster triangles, ~466k triangles drawn, 6 point lights). Bake its static lighting so the real-time
shadow pass only has to cover characters near the player.

1. **Export.** Extend `tools/agent/export-static-scene.mjs` with `--world beyond`: teleport into Beyond Eden, wait
   for `garden.warmNight()` steps to finish (or until `breakThyRuleShowroom.worlds().world()==='beyond'` and the
   district is built), and dump the static roots of that world (`Beyond Eden / the old civilization`,
   `Pyramid at the end of the road`, `Parkour grips`, terrain), excluding bots, the Attendant, loot, effects and the
   player. Also dump the street-lamp positions (`garden.district.lamps`) and the moon direction/colour from
   `eden-lighting.js` at night.
2. **Bake.** Add `tools/blender/bake_beyond_light.py` (copy the garden script's structure and unit convention):
   - Lights: moon (directional, the live night values), every street lamp as a warm point light (`0xffb34f`-ish, match
     `night-district.js` intensity × the runtime falloff), sky at the night colours used by `eden-lighting.js`.
   - Outputs: `ground_indirect` and `ground_lit` (planar lightmap over the district bounds `night-layout.json:bounds`,
     with lamp pools and building/tree shadows baked in), and a probe grid over the district
     (suggested 4 m × 3 m × 4 m spacing, y 0.4..15 m) for buildings, props and moving characters.
   - Optional (only if UV2 work is reasonable): per-building lightmaps for the large facades. Otherwise rely on
     probes plus a baked ambient-occlusion term.
3. **Encode** to `assets/beyond-bake/` with the same formats as `assets/eden-bake/` (add `bake.json` with min, step,
   dims, scale).
4. **Runtime.** Extend `eden-baked-light.js` to hold two probe volumes (Eden, Beyond) and switch the active one with
   the world (`worlds.js`), without changing material program keys (no recompiles on switch: swap uniform values,
   not defines). Apply the Beyond ground lightmap to the district ground and road like the Eden terrain.
5. **Then cut real-time cost in Beyond:** with static lighting baked, make the follow shadow cover only a tight box
   around the player (e.g. 16 m) and let only characters, the player body and props that move cast into it; static
   buildings and grips stop casting (`castShadow=false` in Beyond). Re-check that the street lamps can stop being
   real-time point lights where the bake covers them (keep a small pool only for dynamic objects, constant count).
6. **Acceptance:** Beyond Eden looks at least as good (compare screenshots at 5 fixed camera spots, before/after, in
   `docs/beyond-bake/`), real-time shadow casters in Beyond drop by more than 70 %, frame time on a mid laptop GPU
   improves (perf overlay report before/after), no shader compiles on crossing the door beyond what the loading
   screen covers, and Eden is unchanged.

## Task 2: AAA gunplay, the rest

Already done (keep it): 6 body shots to down an unarmoured bot (pistol/rifle 17, SMG 15), medium aim assist
(magnetism cone, aim friction, touch pull), procedural body impacts, hit ticks, per-enemy grunts and death screams,
orange headshot and red kill hitmarkers, enemy flinch, four randomised muzzle-flash textures, weight layer under
each shot, prewarmed weapon shaders.

1. **Recorded audio.** Replace the synthesized core of each gunshot with licensed recordings (CC0 preferred: e.g.
   Freesound CC0 packs, Sonniss GDC bundles as allowed by their licence). Per weapon: 3–4 close shot variants, a
   distant variant, a mechanical layer (bolt/slide), and a tail; plus body impacts (3+), headshot crack, kill, bullet
   cracks/whizzes for near misses, impacts on stone/wood/metal/dirt (2–3 each), casings landing, and voice sets for
   enemies (pain ×6, death ×4, at least two voices). Load as small `.ogg`/`.m4a` with `AudioBuffer` caching;
   keep the procedural layers as fallback and for the sub-bass weight. Randomise pitch ±4 % and pick variants without
   repeats. Distance: low-pass and delay by distance (`sfx.remote` already does speed-of-sound delay).
2. **Visual impact.** Ejected shell casings (pooled instanced meshes with simple physics and a bounce sound),
   impact puffs and sparks per surface (stone dust, wood splinters, metal sparks), bullet-hole decals that fade
   (there is an `impact()`; extend it, keep counts capped and pooled), blood mist on body hits that matches the art
   direction, short tracer streaks on automatic fire.
3. **Weapons feel.** Per-shot camera recoil with recovery curves per weapon, a small FOV punch on heavy weapons,
   ADS sway and breathing, reload animations that read clearly, a dry-fire click that matches each gun. Check the
   viewmodel never clips walls (pull back near geometry).
4. **Hit reactions.** Enemies stagger by hit location (head snaps back, legs buckle, arm hits jerk), a short
   ragdoll-style fall on death (there is `ragdoll.js` / `ragdoll-jolt.js`), and a heavier stagger on headshots.
5. **Settings.** Aim assist strength in settings: Off / Low / Medium (default) / High, scaling `ASSIST.magnet`,
   cones and `friction` in `combat.js`; persist with `edenSettings`. Default Off for mouse users is acceptable if
   the owner prefers, but keep Medium for touch.
6. **Acceptance:** record a 60 s clip of the open match; a body shot, headshot and kill each read clearly by sound
   and sight; no frame spikes from effects (perf overlay); effect pools never allocate after warm-up.

## Task 3: Performance close-out

1. On a real machine, play 5 minutes (Eden, the door, Beyond running, a firefight, back to Eden) with the overlay
   on and **paste its "Copy report"** into the PR. Fix every labelled spike source you see.
2. Remaining known items: ~32 shader variants still appear on first crossing (find which light/define differs with
   `renderer.info.programs[i].cacheKey`, as in the earlier diff work, and either prewarm them in
   `worlds.compileFor('beyond')` or make the count constant). Character animation allocations
   (`character-motion.js` procedural code allocates ~11 MB per 6 s with bots: reuse temporaries). Reduce Beyond's
   triangles with LODs for distant buildings.
3. **Acceptance:** 60 fps steady on a mid laptop GPU in Eden and Beyond at "medium" graphics; no spike over 50 ms
   after the first 10 seconds except behind a loading screen; `tools/ship.sh` passes.

## How to report back

A short summary per task with before/after numbers (frame time, draw calls, triangles, shadow casters, program
count on crossing), screenshots for the bake, the perf overlay reports, and the list of new assets with licences.
