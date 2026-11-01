# Locked decisions

These decisions are already made. Do not reopen them unless measured failure requires a documented exception.

## Renderer and isolation

- Use three.js `0.187.0` for the proof.
- Use `WebGPURenderer` with automatic WebGL2 fallback.
- Keep the current Eden garden on its existing renderer.
- Put the proof at `/beyond-eden.html`.
- Do not use a CDN at runtime.

## Scene scope

- One landmark only: the Wilshire Scottish Rite Masonic Temple and its plaza.
- This is a realism/performance proof, not the complete eight-page PvP mode.
- Architecture must be an original modular interpretation, not a photogrammetric replica and not a copy of protected relief/mosaic artwork.
- Use massive near-windowless wall planes, relief-panel bays, a mosaic band, a raised formal entrance, a sealed ceremonial door, and an exposed ritual plaza.
- Keep three distinct approaches with limited cover and no single controlling choke point.

## Lighting and atmosphere

- Bake static AO/indirect information in Blender.
- Keep live lighting limited to the player flashlight, ritual/door glow, and a few practical lamps.
- Use cheap height fog, mist cards/planes, and beam cones or light shafts—not full ray-marched volumetrics unless the measured budget proves clear headroom.
- Provide wide unlimited and focused battery flashlight modes.
- Preserve the public flicker control for future Attendant proximity.

## Performance

- Five streamed sectors: temple core, plaza center, south approach, west approach, east approach.
- Three LODs per sector.
- Meshopt geometry compression.
- KTX2/Basis textures.
- Instancing for repeated geometry and vegetation.
- High, Medium, and Low presets plus adaptive resolution.
- Measure frame intervals, 1% low, p95/p99, draw calls, triangles, texture-memory estimate, and transfer size.

## Tree

- Tree selection has already been covered with the user.
- Do not produce another tree shortlist.
- Use the previously approved/local source if it exists.
- Build LOD0, LOD1, and a KTX2 billboard/impostor.
- If the source is absent, keep the procedural fallback and continue the rest of the proof.

## Operations

- Work only locally.
- No Netlify changes.
- No remote Git writes.
- No cloud inference or paid service.
- One heavy GPU job at a time.
