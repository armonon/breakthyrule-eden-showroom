# Working on Break Thy Rule · Eden (for every agent and person)

Two agents (Codex and Claude) build this site and game in parallel. These rules keep either one from
overwriting the other or the live site.

## One source of truth

- **`main` on GitHub is the live site.** Netlify publishes `main` automatically (static, `publish = "."`). Its build command validates dependencies and stamps `game-release.json` with the actual source commit.
- **Never deploy by hand** (drag-and-drop, `netlify deploy`, or a base deploy with files overlaid). Files that
  exist only in a Netlify deploy are lost the next time `main` publishes. That happened on 2026-11-14 and took the
  collections, the about page and the bitmap hero off the site until they were recovered into git.
- Everything the site loads must be committed. `tools/ship.sh` refuses to ship if a page references a missing file.

## The loop

1. Start: `git fetch origin && git merge origin/main` (or branch from `origin/main`).
2. Work on your own branch (`codex/...`, `claude/...`). Commit small, descriptive commits.
3. Ship: `tools/ship.sh`. It merges the latest `main`, refreshes cache versions, syntax-checks the game's scripts,
   checks that nothing is missing, and pushes to `main` (retrying if `main` moved). `--dry-run` to check only.

## Only add; never take out someone else's work

- When merging, keep both sides. Never resolve a conflict by taking one whole file over the other.
- HTML include lists (`showroom.html`, `expedition.html`): keep the union of tags, then run
  `node tools/expedition/build-revision.mjs` (scripts) and `node tools/refresh-css-versions.mjs` (stylesheets).
  `?v=` versions on the game pages are content hashes, so conflicts in them are never real: regenerate.
- Removing a feature or page is fine when it is your own call or the owner asked; say so in the commit message.

## Shared simulation

`player-motion.js`, `player-movement.js`, `parkour.js`, `movement-state.js` and the expedition modules also run
on the server (`server/expedition-runtime.mjs`). Keep them deterministic: no `Math.random`, no wall-clock time,
no DOM. New movement state goes into `captureState` / `validateState` / `restoreState`, with defaults so older
snapshots still load. World props that movement uses must come from data both sides load (see `parkour-grips.js`).

## Map of the game (who added what, so you know where to look)

| Area | Files |
|---|---|
| Eden showroom, entry point | `showroom.html`, `app.js` |
| Public site, shop, lab | `index.html`, `product.html`, `site/`, `labkit/`, `*-collection/`, `btr-belts/` |
| Beyond Eden expedition | `expedition.html`, `expedition-*.js`, `solo-expedition.js`, `server/expedition*.mjs` |
| Movement and parkour | `player-movement.js` (momentum, held jumps), `parkour.js` (wall-run, wall jumps, climbing, bars/pipes/ropes), `parkour-grips.js` (the grip props) |
| Mobile | `eden-mobile.*`, `touch-controls.*`, `game-input-guard.*` |
| Museum | `museum.js`, `museum-sculptures.js`, `museum-exhibition.js`, `museum-reader.*` |
| Horror chapter | `story.js` (milestones), `worlds.js` + `worlds.css` (separate worlds, loading screens with the bitmap hero film), `horror-chapter.js` + `horror.css` (office, showdown, keys, black cube, garment lab), `assets/worlds/chapters.json` |
| Garden props | `garden-props.js` (+ `?edit` prop editor), `assets/props/{catalog,scene}.json`; AI-generated props from Modly: `tools/3d-gen/` |
| Natural motion | `character-motion.js` (planted feet, ground and slopes, landing weight, lean, inertial blending, body bob; `?natural=0` switches it all off), `visitor-smoothing.js` (other visitors drawn smoothly from network poses), `tools/motion/` (tests, a measurement and filming rig, a camera probe) |
| COWNinja (prototype, own page) | `cowninja.html`, `cowninja/` on the new renderer (three WebGPURenderer, WebGL2 fallback). Real models and surfaces: `assets.js` loads `assets/cowninja/` (rigged cow, pickup, Poly Haven props/textures/night sky, all CC0, see `CREDITS.txt`; rebuilt by `tools/cowninja/*.py` with Blender's `bpy` module) plus the main game's `assets/world-props`. People are the main game's characters (`character-*.js`) and its Jolt ragdoll (`ragdoll-jolt.js`). On foot it runs the main game's movement unchanged: `foot.js` wraps `createExpeditionController` (`player-movement.js` + `parkour.js`, momentum on) over the yard's boxes (`world.solids`), so a change to those files changes COWNinja too. Freerunning is layered on top in `foot.js` without touching the shared files: hold-sprint auto-jump at obstacles and edges, free-climbing any tall solid face (its own state machine: W/S climb, A/D traverse, Space kicks off, C lets go, pull-up at the top), climbing at double pace, step-off at the top of a pipe, a steered leap of faith into hay, hiding in hay; pipes, ropes and bars come from `site.json` `grips` (set as `window.parkourGrips` for this page), the walkable roof from `roofSteps`. `fight.js` (fists on foot, on the main game's shared `melee-core.js`: jab/cross/haymaker, combos, finisher, guard, parry; farmers have health, flinch, stagger and telegraph their blow), `main.js` (ride/foot modes, E use, Q whistle, stealth alarm, auto quality), `audio.js` (main game's combat bank + footsteps, synthesised wind/engine/siren), `touch.js`, `physics.js` (Jolt bodies, ramps), `cow.js` (ridden cow, procedural gait on bones, the rider, `steerTo` autopilot), `farmers.js`, `truck.js` (hunts; flips on a square side hit), `herd.js` (38 cows in seven enclosures: the hall pen and six farm pens, from `site.json` `points.pens`; one herd with one standing order: follow / go-and-hold / charge a gate; `nav.js` flow fields route them; gate force = cows that hit together × speed × aim), `config.js` (every playtest tunable: herd, gate strengths, cameras; live at `cowNinja.TUNE`), gates and levers in `world.js` (`points.gates`: `openGate(id, {broken})`, `gateAt`, `gateNear`, `leverNear`, `onGate`), `blood.js` (persistent decals), `post.js` (ambient occlusion, bloom, the grim grade), `world.js` (loads the site: `assets/cowninja/site.glb` + `site.json` + `site-lightmap.webp`, all written by `tools/cowninja/build-site.py`, which models the abattoir in Blender and bakes its light; change the map there and re-run it, then `tools/cowninja/compress.sh` to shrink the GLBs for the web; never hand-edit site.json). Modly shot list: `docs/cowninja-modly-shots.md`. Debug handle `window.cowNinja` (`.step(n, keys)`, `.state()`, `.freeCam=[x,y,z,lookX,lookY,lookZ]`, `.use()`, `.whistle()`, `.yaw`) |
| HUD additions | `momentum-hud.js` + `momentum-hud.css` (momentum meter) |
| Smoothness | `prewarm.js` (idle-time texture uploads, shader compiles incl. `worlds.compileFor('beyond')`, match/weapon build), `perf-hud.js` (F8 or `?perf=1`: frame graph that names each spike; "Copy report") |

Debug handles in the browser console: `breakThyRuleShowroom` (Eden: `.worlds()`, `.story()`, `.horror()`,
`.parkour()`, `.getState()`), `breakThyRuleExpedition` (Beyond Eden).

## Checks

- Movement: `node tools/movement/movement-test.mjs <url>/showroom.html check` (macOS Chrome path inside; on Linux
  point it at Chromium).
- Server: `node --test server/world.test.mjs server/expedition.test.mjs` (`server/lab` needs `npm install`).
