# Expedition performance qualification

## Target, not a promise

Desktop target: 60 FPS, typical 16.7 ms frames and p99 at most 25 ms. Mobile target: stable 30 FPS. A headless correctness test, accelerated simulation, or average FPS alone does not certify either target. Record the actual graphics backend, viewport, pixel ratio, preset, effects, device, browser, source hashes, and route with every result.

## Confirmed controller defect and fix

The original adaptive-resolution controller inferred display refresh from its shortest rendered interval. A consistently slow game could therefore teach it that 30 FPS was the native refresh. A deterministic 1,199-frame simulation at 20, 25, 33.3 and 50 ms intervals never lowered the 1.25 pixel ratio.

`createAdaptiveResolution` now accepts optional `targetFps`. With this fixed target the controller reduces resolution after sustained missed budgets (15% tolerance), retains a lower-resolution fallback notification and waits eight seconds of near-budget frames before increasing resolution. Defaults for other callers remain unchanged. Six regression tests exercise sustained misses, 60/30 FPS budgets, recovery hysteresis, ceiling and pause/resume.

This is a controller correction, **not a measured frame-rate uplift**. Reducing pixels cannot fix CPU-bound simulation, network stalls, asset decoding or shader compilation. The actual entry must opt into 60 desktop / 30 mobile and the measured workload must be retested.

## Measurement order

1. One heavy browser workload at a time on Lillypad. Let assets/shaders warm for 15 seconds before sampling steady-state play; record cold-loading time separately.
2. Measure normal camera/animation effects, not only reduced motion. Exercise first and third person, sprint, roofs, foliage, flare/reload and ragdoll separately. Keep the world and rules unchanged between A/B runs.
3. Capture rAF p50/p95/p99/max, frames over 50/100 ms, renderer draws/triangles/programs, geometries/textures and actual buffer size. Report resolution reductions alongside frame results.
4. Instrument JS method wall-time around render submission, world, player and gameplay updates. Rendering call time can include driver/GPU backpressure; do not label it pure CPU or GPU cost. Avoid gl.finish in real-play benchmarks.
5. Compare a fixed outdoor route before/after optimization, then run ten-minute real browser endurance and repeated return/re-entry. Simulated thirty minutes is a separate test.
6. Test a named physical phone and normal visible desktop browser before claiming mobile or production performance acceptance.

## Priorities guided by evidence

- GPU/pixel cost: resolution and costly post passes (AO, bloom, temporal resolve, lens effects), shadow update frequency and visible foliage overdraw.
- CPU cost: repeated DOM writes, diagnostic snapshots, matrix/projection recalculation, sorting and temporary objects in each frame; spatial lookup only where profile identifies collision/navigation pressure.
- Loading/hitches: standalone expedition entry excludes showroom/studio assets. Preload required landmarks, schedule optional work outside interaction-critical frames, and keep geometry/material compilation evidence.
- Lifecycle: explicit disposal of off-scene render targets, PMREM resources and asynchronous loads, as well as scene geometry/textures. Navigation/context loss is not a substitute for correct ownership when testing in-document teardown.

Never optimize by reducing collision accuracy, hiding gameplay objects, changing authoritative timing, or silently disabling requested animations. Prefer bounded visual settings and show what changed in the evidence.

## Recorded continuation result (2026-11-14)

The confirmed 600.026-second exploration run used an Apple M4/24 GiB, Chrome 157.0.8103.78, ANGLE Metal, 1440×900 viewport and a 1440×790 initial stage, medium preset/DPR 1. It recorded 35,868 frames: p50 16.7 ms, p95/p99 16.8 ms, maximum 83.3 ms, six frames over 50.5 ms and none over 100 ms. Cold entry was 4,102 ms; startup maximum was 433.3 ms and is separate. Resource counts stabilized at 252 geometries/256 textures/one canvas; three world switches completed.

Adaptive resolution reached 0.75 at two checkpoints and later returned to 1. Grain, bloom, glare, rays, flare, TAA and LUT remained enabled. This is not constant-resolution or hiccup-free performance. Source content version: `10056d9f218af2f445da665b765065863682c29908649293f88137267fd779a9`.

Earlier A/B exploration runs both had p99 16.8 ms and an active-route maximum of 483.3 ms; they did not demonstrate an FPS improvement. The later stable-light/warmup confirmation removed that large first-use spike in its sampled route, but steady-state stalls remained. See the committed JSON summaries for before/after context. None of these measurements certifies the newer actor/checkpoint code, full-party play, active hunt, or a physical phone. Further runs were stopped at the owner's request to prioritize code and Git delivery.
