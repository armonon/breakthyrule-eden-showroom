# Beyond Eden — complete agent handoff

This is the consolidated local workspace for completing the **Scottish Rite Temple at night** browser-realism proof slice for Break Thy Rule.

Give this entire folder to the local coding agent. Start with:

```text
GIVE_THIS_FOLDER_TO_YOUR_AGENT.md
AGENT_START_HERE.md
```

The folder contains the complete source overlay, procedural fallback scene, Blender generators, tree-preparation pipeline, glTF optimization tools, benchmark UI, agent execution plan, acceptance tests, internal architecture reference, and local-only integration scripts.

## Important state

- The current Eden garden is intentionally untouched.
- The proof runs on `/beyond-eden.html`.
- The proof pins three.js `0.187.0`.
- `WebGPURenderer` is primary; WebGL2 is the automatic fallback.
- The existing local repository is the source of truth. GitHub is stale.
- No package/tool/asset was downloaded while assembling this handoff.
- No Git remote, Netlify site, deployment, or outward-facing service was modified.
- Tree selection is already resolved; the agent should locate the approved local source rather than reopen shopping/research.
- The runtime has proxy architecture and proxy vegetation so it can remain walkable before generated assets are present.

## Read-only validation

The delivered folder passed **45/45 static checks**, plus a local static-serving smoke test and a synthetic branch-application test.


```bash
node tools/agent/verify-handoff.mjs
```

## Inspect the local project

```bash
bash tools/agent/doctor.sh ~/Projects/breakthyrule-eden-showroom
```

## Apply to a clean base branch

```bash
bash tools/apply-to-project.sh ~/Projects/breakthyrule-eden-showroom
```

This creates the local branch:

```text
beyond-eden/browser-realism-proof
```

from:

```text
asset-workshop/limestone-planter
```

It creates local commits but never pushes or deploys.

## Source implementation

### Runtime

- `beyond-eden.html`
- `beyond-eden.css`
- `beyond-eden/main.js`
- `beyond-eden/config.js`
- `beyond-eden/core/`
- `beyond-eden/scene/`

### Asset generation

- `tools/blender/build_scottish_rite_slice.py`
- `tools/blender/prepare_approved_tree.py`
- `tools/blender/build_tree_impostor.py`
- `tools/pipeline/optimize-slice.mjs`
- `tools/pipeline/inspect-slice.mjs`
- `tools/pipeline/validate-tree-assets.mjs`

### Agent control

- `AGENTS.md`
- `agent/HANDOFF_STATE.json`
- `agent/EXECUTION_PLAN.md`
- `agent/ACCEPTANCE_TESTS.md`
- `agent/RESUME_PROMPT.md`
- `agent/PROGRESS_LOG.md`

### Internal reference

- `references/Beyond_Eden_Selected_Architecture_Atlas_Revised.docx`
- `references/SCOTTISH_RITE_REFERENCE_SUMMARY.md`
- `references/ARCHIVAL_ASSET_POLICY.md`

The atlas is internal research only and must not be copied into public runtime assets.

## What runs before final assets exist

The scene starts with procedural sector proxies for:

1. temple core;
2. plaza center;
3. south approach;
4. west approach;
5. east approach.

When matching optimized GLBs exist under `assets/beyond-eden/optimized/`, each proxy is replaced automatically. The same pattern applies to the tree system: approved LODs and billboard replace the project-owned procedural fallback.

## Local URL

After local integration and the approved dependency/vendor step:

```bash
node server/eden-server.mjs
```

Open:

```text
http://127.0.0.1:8777/beyond-eden.html
```

Useful modes:

```text
?quality=high
?quality=medium
?quality=low
?forceWebGL=1
?bench=1
?debug=1
```

## Controls

- Click: pointer lock
- WASD / arrows: move
- Shift: run
- Mouse: look
- F: flashlight on/off
- Q: wide/focused beam
- R: forced Attendant flicker test
- Esc: release pointer lock
- PERF: quality, screenshot, and benchmark panel

## Final proof outputs

The agent must produce measured evidence on the M4 rather than estimates:

- current-garden baseline screenshot;
- WebGPU High/Medium/Low screenshots and JSON;
- forced-WebGL2 High screenshot and JSON;
- actual draw calls and triangles;
- estimated texture memory;
- actual transfer size;
- optimized asset manifest;
- complete package/asset ledger;
- PASS, CONDITIONAL PASS, or FAIL verdict;
- four-to-five-landmark scaling projection.

See `agent/FINAL_OUTPUTS.md` and `docs/BENCHMARK_PROTOCOL.md`.
