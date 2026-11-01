# Execution plan

## Phase 0 — preserve and inspect

1. Run `bash tools/agent/doctor.sh ~/Projects/breakthyrule-eden-showroom`.
2. Inspect `git status`, local branches, recent commits, `AGENTS.md`, existing server, and any local asset-workshop notes.
3. If the worktree is dirty, do not overwrite it. Determine whether the changes belong to the user’s ongoing work and preserve them.
4. If `beyond-eden/browser-realism-proof` already exists, switch to it and resume. Otherwise apply this handoff from the clean `asset-workshop/limestone-planter` branch.
5. Confirm the root garden runs before changing anything. Capture a baseline screenshot and note its backend, resolution, and quality setting.

## Phase 1 — integrate the isolated route

1. Copy the proof route, modules, manifests, tools, and docs using `tools/apply-to-project.sh` or a careful equivalent.
2. Confirm no existing garden file was replaced.
3. Run `npm run proof:check` before installing anything.
4. Confirm `server/eden-server.mjs` can serve `.html`, `.js`, `.json`, `.glb`, `.ktx2`, and Basis transcoder files. Add only a minimal MIME/static route fix if the current local server truly lacks one.
5. Load `/beyond-eden.html` with the procedural proxy first.

## Phase 2 — approved package/tool setup

1. Determine whether the pinned packages/tools are already installed locally or previously approved.
2. Do not download a new package without approval.
3. Once permitted, install exact versions, generate a lockfile, vendor three.js locally, and record resolved sizes/licenses.
4. Run:

```bash
npm run proof:vendor-three
npm run proof:check
```

5. Test WebGPU and forced WebGL2 before the heavy asset build.

## Phase 3 — build temple sectors

1. Run the Blender generator with the M4-safe configuration.
2. Inspect raw GLBs before compression for broken normals, missing vertex color, incorrect origin, material count, and scale.
3. Optimize with meshopt and KTX2.
4. Validate every GLB.
5. Confirm the runtime automatically replaces each corresponding proxy sector.
6. Fix visual or collision mismatch without deleting the proxy fallback.

Recommended command:

```bash
npm run proof:assets
```

Use the full Blender binary path if `blender` is not on `PATH`.

## Phase 4 — integrate the already selected tree

1. Search the local asset workshop and project for the previously approved tree source and its license/receipt record.
2. Do not re-shop or download a replacement without permission.
3. Use `tools/agent/build-approved-tree.sh` to normalize, generate LOD0/LOD1, render the billboard, and encode KTX2.
4. Complete `assets/beyond-eden/trees/tree-source-ledger.json` from real source information.
5. Run `node tools/pipeline/validate-tree-assets.mjs`.
6. Inspect transitions at near, mid, billboard, and cull distances. Eliminate obvious popping without hiding it through excessive fog.

## Phase 5 — visual tuning

Tune in this order:

1. temple scale and silhouette;
2. player eye height and approach readability;
3. material roughness and baked shading;
4. door and relief readability;
5. fog density and vertical falloff;
6. flashlight exposure and beam visibility;
7. practical lamp count;
8. tree placement and alpha cost;
9. dynamic pixel-ratio behavior.

Do not add full volumetrics, SSR, many shadowed lights, or unique 4K textures before the measured proof shows headroom.

## Phase 6 — functional checks

- Existing garden still loads.
- Account/presence/chat/server endpoints still behave as before.
- Three approaches are walkable.
- Collision prevents entering temple walls and cover volumes.
- Flashlight controls work.
- Sectors load and unload without request storms.
- High/Medium/Low visibly change rendering cost.
- `?forceWebGL=1` functions.
- No runtime request targets a CDN or external API.

## Phase 7 — benchmark and evidence

1. Close unrelated GPU-heavy applications.
2. Use the same browser window size for every run.
3. Run three passes per preset and retain the median result.
4. Run High, Medium, Low, then forced-WebGL2 High.
5. Save benchmark JSON and screenshots under a dated local evidence directory.
6. Capture a current-garden baseline at comparable resolution.
7. Record cold-load and warm-load transfer sizes.
8. Complete `docs/VERDICT_TEMPLATE.md` with measured values only.

## Phase 8 — verdict

Choose exactly one:

- PASS — browser reaches the intended Beyond Eden bar.
- CONDITIONAL PASS — browser reaches it under clearly named limits.
- FAIL — browser does not reach it.

Then project the implications for four or five landmarks: resident memory, district size, cold load, texture sharing, simultaneous hero interiors, shader warmup, and streaming boundaries. State plainly what UE5 would solve if the browser fails.
