# Repeatable asset pipeline

## Directory contract

```text
assets/beyond-eden/raw/        Blender GLB exports and optional .blend source
assets/beyond-eden/optimized/  Runtime GLBs with meshopt + KTX2
assets/beyond-eden/trees/      Approved tree LODs, billboard and provenance
assets/vendor/three-r187/      Local renderer/addons; no CDN
```

The runtime requests five sectors, each with LOD0–LOD2:

```text
temple-core
plaza-center
approach-south
approach-west
approach-east
```

If any optimized GLB is absent, the equivalent procedural proxy is built in the browser. This allows controls, collision, layout, and streaming logic to be reviewed before the heavy asset pass.

## 1. Build architecture in Blender

Use the existing Blender 5.0.1 installation; this handoff does not request another Blender download.

```bash
blender --background --factory-startup \
  --python tools/blender/build_scottish_rite_slice.py -- \
  --output assets/beyond-eden/raw \
  --bake-ao \
  --samples 48 \
  --keep-blend
```

The generator produces 15 GLBs: five sectors × three LODs.

- LOD0 retains the complete modular kit.
- LOD1 removes `_detail` meshes and targets 58% of remaining geometry.
- LOD2 removes `_detail` meshes and targets 24%.
- AO is baked into the active `BakedAO` color attribute where Cycles permits.
- A deterministic analytic cool-indirect/AO vertex-color fallback is always written.
- The Blender 5 glTF exporter is called with `export_vertex_color=ACTIVE` when supported, so the active color attribute becomes `COLOR_0`.

The model is an original modular interpretation of the internal atlas description. It does not ingest or ship archival photographs, historical relief artwork, or historical mosaic imagery.

## 2. Optimize, compress, and validate

After exact package/tool approval or confirmation that those tools are already approved locally:

```bash
npm run proof:optimize
```

For each GLB the script runs the pinned local CLI, never `npx`:

```bash
gltf-transform optimize input.glb output.glb \
  --compress meshopt \
  --meshopt-level high \
  --texture-compress ktx2 \
  --texture-size 2048 \
  --simplify false \
  --instance true \
  --flatten true \
  --join true \
  --join-named false \
  --prune true \
  --sparse true

gltf-transform validate output.glb
```

Texture ceilings are 2048 for LOD0, 1024 for LOD1, and 512 for LOD2. glTF Transform’s KTX2 mode applies UASTC to normal/occlusion/roughness/metallic slots and ETC1S to remaining slots. The required KTX-Software executables must be available locally.

The initial procedural architecture uses vertex-color AO and simple materials, so the largest KTX2 benefit in the first proof may come from the selected tree and billboard. Meshopt reduces transfer size and decode cost; it does not eliminate the need for sensible post-decode geometry budgets.

## 3. Inspect every output

```bash
npm run proof:inspect
```

This writes:

```text
docs/generated/asset-inspection.txt
docs/generated/asset-sizes.json
assets/beyond-eden/optimized/optimization-manifest.json
```

Do not accept an asset solely because the GLB is small. Review primitive count, material count, texture dimensions, extension usage, alpha cost, and draw-call implications.

## 4. Process the already approved tree

The selection is already resolved. Locate the existing local source and run:

```bash
bash tools/agent/build-approved-tree.sh \
  /absolute/path/to/already-approved-tree.glb
```

The helper performs:

1. source import and scale normalization;
2. browser LOD0 and LOD1 generation;
3. transparent billboard rendering;
4. KTX2 billboard encoding;
5. derivative validation.

Environment overrides:

```text
BLENDER_BIN=/Applications/Blender.app/Contents/MacOS/Blender
TREE_TARGET_HEIGHT=9
TREE_LOD0_RATIO=0.12
TREE_LOD1_RATIO=0.035
TREE_BILLBOARD_SIZE=1024
```

Expected runtime files:

```text
assets/beyond-eden/trees/hero-tree-lod0.glb
assets/beyond-eden/trees/hero-tree-lod1.glb
assets/beyond-eden/trees/hero-tree-billboard.ktx2
```

Complete `tree-source-ledger.json` from actual local license/receipt records before public use. If the source cannot be found, keep the proxy and continue the proof; do not silently download a substitute.

## 5. Vendor renderer locally

After approved npm setup:

```bash
npm run proof:vendor-three
```

The copy script verifies exact version `0.187.0` and refuses a mismatch. Runtime imports resolve only from `/assets/vendor/three-r187/`.

## 6. One-heavy-job rule

On the M4/24 GB machine, do not run Blender baking at the same time as local image generation, 3D generation, or another GPU-heavy process. `tools/agent/build-local-assets.sh` refuses to start if another Blender process is already running.
