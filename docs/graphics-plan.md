# Eden graphics plan

Goal: a browser scene that looks close to photographic and stays light. Work branch: `graphics/realism`, cut from
`character/ps2-era` (the branch the live site deploys from; `main` is only the initial Netlify commit).

Budget at Medium on laptop integrated graphics: 60 fps, under 300 draw calls, 1.5 M visible triangles, 512 MB GPU
memory, 25 MB before first view, everything else loaded in the background.

1. Measure: `tools/agent/garden-baseline.mjs` captures screenshots, GPU frame time, draw calls and cold-load bytes.
2. Compress: KTX2 textures and meshopt geometry via gltf-transform, plus garment LODs.
3. Bake: Blender Cycles lightmaps for the static garden; light probes for things that move.
4. Scanned materials: CC0 sets (Poly Haven, ambientCG) replace code-drawn surfaces; terrain blends between them.
5. Vegetation: scanned trees near, impostors far, cutout grass with translucency and wind.
6. Engine: current Three.js, temporal AA, better AO, AgX/Neutral tone mapping, grading LUT, sharpening, grain.
7. Optional: Gaussian-splat horizon backdrop.

Results and honest limits are recorded in `docs/graphics/RESULTS.md`.
