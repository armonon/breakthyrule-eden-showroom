# Local run checklist

## 1. Inspect before modifying

From the handoff folder:

```bash
bash tools/agent/doctor.sh ~/Projects/breakthyrule-eden-showroom
node tools/agent/verify-handoff.mjs
```

If the project worktree is dirty, preserve and inspect it before applying anything.

## 2. Apply only on a clean local base

```bash
bash tools/apply-to-project.sh ~/Projects/breakthyrule-eden-showroom
```

If `beyond-eden/browser-realism-proof` already exists, switch to it and resume instead.

## 3. Before package approval

Inside the project:

```bash
npm run proof:check
```

Expected: runtime source passes; local three.js vendor and optimized GLBs may be reported as pending.

## 4. After approved package/tool setup

```bash
npm install
npm run proof:vendor-three
npm run proof:assets
npm run proof:check
```

If `blender` is not on PATH, use the full Blender 5.0.1 binary path from `docs/ASSET_PIPELINE.md`.

## 5. Process the existing approved tree

```bash
TREE_SOURCE=/absolute/path/to/the/already-approved-tree.glb \
  bash tools/agent/build-approved-tree.sh "$TREE_SOURCE"
```

If the source cannot be found locally, do not block the proof. Keep the proxy and record the missing source.

## 6. Start the real server

```bash
node server/eden-server.mjs
```

Open:

```text
http://127.0.0.1:8777/beyond-eden.html
```

## 7. Required checks

- WebGPU reports active in a supported browser.
- `?forceWebGL=1` reports WebGL2 fallback.
- Existing root garden still loads unchanged.
- Existing login/presence/chat behavior remains unchanged.
- WASD collision cannot cross temple body or planters.
- All three approaches reach the ritual plaza.
- F/Q/R flashlight controls work.
- Quality presets visibly change budget.
- Sectors load/unload without repeated network storms.
- Approved tree changes from LOD0 to LOD1 to billboard.
- Benchmark JSON downloads.
- Screenshot PNG downloads.
- No request goes to a CDN or external API at runtime.
