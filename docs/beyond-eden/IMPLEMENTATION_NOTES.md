# Implementation notes

## Historical source boundary

The internal architecture atlas identifies the Wilshire Scottish Rite Masonic Temple as a 1960–1961 work associated with Millard Sheets and Samuel E. Lunden, with monumental near-windowless walls, colossal reliefs, a raised entrance, and a surviving construction/dedication record. The proof translates those massing principles into original modular geometry. It does not reproduce the archival relief artwork, mosaic imagery, or photographs.

## Lighting strategy

- Static geometry: vertex-color AO plus cool indirect tint from Blender; authored lightmaps can replace this in a later asset pass.
- Global night fill: one low-intensity hemisphere light.
- Live lights: one player spotlight, ritual-door emissive/light set, and a quality-limited number of plaza practicals.
- Static architecture does not cast dynamic shadows in the proof; the flashlight can cast quality-dependent shadows onto receiving surfaces.

## Fog strategy

- WebGPU: TSL exponential height fog.
- Fallback: `FogExp2` remains assigned for conventional material compatibility.
- Beam visibility: translucent conical mesh aligned with the flashlight, not ray-marched volumetrics.
- Ground atmosphere: a small number of animated transparent mist planes.

This is intentionally cheap. Full volumetrics should be considered only after the measured proof has headroom.

## Benchmark caveats

- Frame interval is real browser timing, not a synthetic GPU estimate.
- Draw-call and triangle counters depend on backend support in `renderer.info`.
- Texture memory is estimated from image dimensions and compression state.
- Quality presets change pixel ratio, shadows, practical-light count, fog, beam segments, vegetation count, and LOD distances. The renderer's multisample context is created once and is not recreated during the in-page suite.
