# Tree asset handoff — selection already resolved

The user has confirmed that the tree discussion is complete. This document no longer requests a choice and should not trigger another product search.

## Agent instruction

1. Search the existing local project and `~/Projects/breakthyrule-asset-workshop` for the already approved source.
2. Search existing local notes, receipts, or ledgers for its exact source, license, and cost.
3. Process it with `tools/agent/build-approved-tree.sh`.
4. Fill `assets/beyond-eden/trees/tree-source-ledger.json` using real evidence.
5. If the source is not available locally, keep the procedural proxy and continue. Ask before downloading a replacement.

## Runtime contract

```text
assets/beyond-eden/trees/hero-tree-lod0.glb
assets/beyond-eden/trees/hero-tree-lod1.glb
assets/beyond-eden/trees/hero-tree-billboard.ktx2
```

Near trees use LOD0, mid-distance trees use LOD1, and distant trees use the KTX2 billboard. The quality preset controls counts and transition distances.
