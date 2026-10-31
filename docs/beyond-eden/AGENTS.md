# Agent operating instructions

## Mission

Finish the local Beyond Eden browser-realism proof slice for the Scottish Rite Temple plaza, measure it honestly on the user’s M4/24 GB machine, and leave a clean local branch and evidence package. The proof exists to answer whether a browser can reach the intended visual bar before the full lost-Los-Angeles world is built.

## Source of truth

- Local repository: `~/Projects/breakthyrule-eden-showroom`
- Required base branch: `asset-workshop/limestone-planter`
- Work branch: `beyond-eden/browser-realism-proof`
- Local asset workshop: `~/Projects/breakthyrule-asset-workshop`
- Architecture reference: `references/Beyond_Eden_Selected_Architecture_Atlas_Revised.docx`
- Runtime URL: `http://127.0.0.1:8777/beyond-eden.html`

GitHub contains only an older snapshot. Never replace local work with the remote state.

## Non-negotiable safety rules

1. Do not push, open a pull request, deploy to Netlify, upload assets, or modify any outward-facing service.
2. Do not run `git reset --hard`, `git clean -fdx`, destructive checkout commands, or force operations.
3. Do not overwrite a dirty worktree. Inspect and preserve every local change.
4. Do not modify `server/eden-server.mjs` unless a narrowly scoped static-serving fix is demonstrably required. Preserve all account, presence, chat, and PvP contracts.
5. Do not migrate the existing garden to the new renderer during this proof. The proof is isolated on `/beyond-eden.html`.
6. Do not ship archival photographs or recreate the historical relief artwork. The architecture is an original modular interpretation informed by massing and construction evidence.
7. Run only one heavy GPU task at a time. Do not bake in Blender while running local image generation or another GPU-heavy process.
8. Do not invent benchmark numbers. Every verdict must cite exported benchmark JSON and screenshot evidence.
9. Do not restart tree-selection research. Use the already approved/local tree asset if available; otherwise retain the proxy and log the missing source.
10. Ask before any new package, tool, paid asset, API, or service that is not already approved in the local project context.

## Engineering rules

- Keep the proof route isolated and ES-module based.
- Pin exact versions. No runtime CDN.
- Preserve automatic WebGL2 fallback and `?forceWebGL=1` comparison mode.
- Static architecture should use baked AO/indirect or lightmaps; live lights are limited to flashlight, ritual glow, and a small number of practicals.
- Keep five streaming sectors and three LODs unless measured evidence justifies a change.
- Keep three plaza approaches viable and avoid a single dominant choke point.
- Use instancing for repeated relief bays, buttresses, lamps, planters, and trees.
- Treat texture memory, alpha vegetation, shader compile stalls, and simultaneous interiors as primary scaling risks.
- Preserve the procedural proxy as a development fallback even after optimized GLBs exist.

## Required local commits

Prefer small commits in this order:

```text
feat(beyond-eden): integrate isolated renderer proof route
build(beyond-eden): generate and optimize temple sectors
feat(beyond-eden): integrate approved tree lods and impostor
perf(beyond-eden): tune streaming and quality budgets
test(beyond-eden): capture measured benchmark evidence
 docs(beyond-eden): record verdict and scaling projection
```

Skip a commit only when there was no corresponding change. Never push.

## Final deliverables

- local branch only;
- working proof URL;
- optimized GLBs and KTX2 textures;
- selected-tree source/license ledger completed from existing records;
- before/after screenshots;
- benchmark JSON for High, Medium, Low, and forced WebGL2 High;
- final report using `docs/VERDICT_TEMPLATE.md`;
- exact external package/asset ledger;
- list of remaining risks and recommended next landmark.
