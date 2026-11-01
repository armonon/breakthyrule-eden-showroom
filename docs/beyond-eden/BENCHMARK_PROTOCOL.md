# M4 benchmark and screenshot protocol

The code supplies an in-page benchmark; no performance number in the verdict should be estimated.

## Controlled run

1. Close Blender, Draw Things, Modly/Hunyuan3D, video editors, and other heavy GPU applications.
2. Connect power and disable Low Power Mode.
3. Use the same browser version for all runs.
4. Start the existing local server:

```bash
node server/eden-server.mjs
```

5. Open the isolated route and allow all resources to finish loading:

```text
http://127.0.0.1:8777/beyond-eden.html?quality=high
```

6. Walk each of the three approaches once so all sectors compile and cache.
7. Open PERF and run all presets. The camera follows a deterministic south → west → center → east → temple path for each preset after warm-up and a 0.75-second settle interval.
8. Download the benchmark JSON.
9. Repeat the entire suite three times. Use the median run, not the best run.
10. Repeat once with `?forceWebGL=1` to measure the fallback.

## Measurements produced

- renderer backend;
- CSS and backing-buffer resolution;
- requestAnimationFrame sample count;
- mean, median, p95, and p99 frame interval;
- mean FPS and 1% low FPS;
- frames exceeding 33.33 ms and 50 ms;
- peak draw calls, triangles, points, and lines during the sample;
- estimated loaded texture memory;
- encoded/transfer size and resource count for the slice;
- active streamed sectors, quality state, tree mode, and player state.

Texture memory is explicitly labeled an estimate. Browser APIs do not expose exact total GPU memory. Transfer size may report zero for cache hits; clear the cache or use a private window for a cold-load measurement.

## Acceptance targets for the proof

### High

- Median frame interval no worse than 16.7 ms at the target window size.
- p95 at or below 20 ms.
- 1% low at or above 45 FPS.
- No repeated 50 ms stalls after shader warm-up.
- Draw calls preferably below 180; investigate anything over 250.
- Visible architecture and vegetation must remain credible at normal play distance.

### Medium

- Stable 60 FPS target on the M4 at reduced pixel ratio and vegetation/light budgets.
- p95 at or below 18.5 ms.

### Low

- Designed as the fallback safety tier, not the visual target.
- p95 at or below 25 ms.

These thresholds are project decisions, not measured results. The final verdict must quote the downloaded JSON.

## Before/after screenshots

### Current garden

Open the existing garden at the same browser dimensions and capture:

- spawn view;
- a foliage-heavy view;
- a building/material close view;
- the existing performance HUD if available.

### Proof slice

Use **PERF → Save current frame PNG** at:

- south processional approach;
- west flank;
- east flank;
- door close-up with wide beam;
- door close-up with focused beam;
- one high/medium comparison pair.

Record browser, resolution, device-pixel ratio, backend, and quality in the screenshot filename or accompanying notes.
