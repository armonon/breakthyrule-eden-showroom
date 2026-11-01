# Agent progress log

Append dated entries. Do not erase earlier entries.

## Handoff state — 2026-10-31

- Source bundle consolidated.
- Static JavaScript, shell, Python, and JSON validation completed in the handoff environment.
- No dependency download performed.
- No local project integration performed.
- No remote write or deployment performed.
- Tree selection treated as already resolved; local source still needs to be located.
- M4 build, screenshots, benchmarks, and verdict remain.

## Agent entries

### Date / commit

- Work completed:
- Files changed:
- Measurements:
- Problems found:
- Decisions made:
- Next action:

## Handoff hardening — 2026-10-31

- Corrected Blender-to-three.js coordinate conversion so generated sectors align with proxy geometry and collision space.
- Attached relief panels to the main facade instead of leaving them several metres forward.
- Kept the ritual door in the Blender source as a visual reference while excluding it from static GLBs; the runtime owns the interactive door.
- Throttled flashlight/status HUD DOM writes to reduce benchmark contamination.
- Changed screenshot capture to an RGBA8 render-target readback path that works across WebGPU and WebGL2, with a canvas fallback.

## M4 run — 2026-10-31 (branch beyond-eden/browser-realism-proof)

- Work completed: overlay applied on a new local branch from asset-workshop/limestone-planter; three@0.187.0 and
  @gltf-transform/cli@4.5.1 installed (npm, MIT); KTX-Software 4.4.2 official notarised pkg unpacked into
  tools/native (no system install; `source tools/ktx-env.sh`); three vendored; 15 sector GLBs built in Blender
  5.0.1 (AO/indirect baked on Metal) and optimised (1.40 MB -> 0.39 MB); approved tree (Poly Haven CC0 Jacaranda,
  via the workshop's 4.1k-tri rebuild) -> LOD0 0.38 MB / LOD1 0.34 MB / billboard.ktx2 0.18 MB, ledger complete.
- Expansions beyond the handoff: photographic CC0 stone (triplanar KTX2, 0.69 MB), shadowed moonlight, facade
  uplights, night sky dome with moon, lighter moonlit fog, exposure 1.0; architecture casts the moon shadow.
- Fixes: Blender 5 EEVEE enum (BLENDER_EEVEE, was _NEXT); draw-call counter read the WebGPU running total
  (`calls`) instead of the per-frame `drawCalls` (6160 reported vs ~216 real); streaming refetched the same GLB on
  every LOD switch (bytes now cached per URL; re-check: one request per file); bench needs a visible page, so a
  headless CDP driver (tools/agent/run-headless-bench.mjs) runs the protocol on the real Metal GPU.
- Measurements: see docs/beyond-eden/VERDICT.md and evidence/2026-10-31 (High 60.0 fps p99 16.8 ms, 0 frames
  >33 ms, 216 draws, 65k tris; WebGL2 59.7 fps). Verdict: CONDITIONAL PASS.
- Problems found: headless screenshot capture stalls at some views (temple door, east approach) — skipped by a
  timeout; uncapped headless frame pacing is not meaningful.
- Decisions made: per the user's explicit instruction, this branch is deployed to the live Netlify site
  (/beyond-eden.html); the handoff's no-deploy rule was superseded by the user. GitHub was not pushed.
- Next action: model the architecture with UVs (normal/detail maps), refine the side-wing massing, then the
  next landmark (Los Angeles Theatre is the highest-value interior test).
