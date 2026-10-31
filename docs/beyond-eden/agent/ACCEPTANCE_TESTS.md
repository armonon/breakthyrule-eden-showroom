# Acceptance tests

## A. Repository safety

- [ ] Work was performed on `beyond-eden/browser-realism-proof`.
- [ ] The branch was created from local `asset-workshop/limestone-planter`.
- [ ] No `git push`, deployment, Netlify command, release, or remote write occurred.
- [ ] Existing uncommitted work was preserved.
- [ ] Existing garden source was not migrated or overwritten.

## B. Runtime

- [ ] `node server/eden-server.mjs` serves the proof at `http://127.0.0.1:8777/beyond-eden.html`.
- [ ] WebGPU initializes in a supported browser.
- [ ] `?forceWebGL=1` initializes the WebGL2 fallback.
- [ ] No runtime asset comes from a CDN.
- [ ] Fatal startup errors are visible to the user rather than silently swallowed.

## C. Scene

- [ ] Temple core, plaza, south approach, west approach, and east approach are present.
- [ ] The temple reads as monumental, nearly windowless, and ceremonial.
- [ ] Relief bays and mosaic band are original abstractions, not copied historical artwork.
- [ ] The raised entrance and sealed door are visually legible from the plaza.
- [ ] All three approaches reach the ritual area.
- [ ] Cover interrupts sightlines without creating one dominant choke point.
- [ ] Collision prevents walking through major architecture and cover.

## D. Lighting and atmosphere

- [ ] Static geometry carries baked AO/indirect or a documented equivalent.
- [ ] Static architecture does not depend on many dynamic shadowed lights.
- [ ] Wide flashlight is unlimited.
- [ ] Focused flashlight is brighter/narrower and consumes battery.
- [ ] Flicker can be driven externally for future Attendant logic.
- [ ] Fog shows beam presence without hiding major visual defects.
- [ ] Practical-light count changes by quality preset.

## E. Assets and streaming

- [ ] Five sectors have LOD0, LOD1, and LOD2 optimized GLBs.
- [ ] GLBs pass validation.
- [ ] Geometry uses meshopt compression.
- [ ] Runtime textures use KTX2/Basis where applicable.
- [ ] Sector loading/unloading does not loop or repeatedly refetch missing assets.
- [ ] Repeated kit pieces use instancing where appropriate.
- [ ] Procedural proxies remain available when a GLB is absent.

## F. Vegetation

- [ ] Previously approved/local tree source was used if available.
- [ ] Tree source/license/cost record is filled with real information.
- [ ] LOD0 and LOD1 load.
- [ ] Billboard/impostor appears beyond the configured threshold.
- [ ] Trees cull at distance.
- [ ] No new tree shopping/download occurred without approval.

## G. Performance evidence

- [ ] High benchmark JSON exported.
- [ ] Medium benchmark JSON exported.
- [ ] Low benchmark JSON exported.
- [ ] Forced-WebGL2 High benchmark JSON exported.
- [ ] Three runs per condition completed; median selected.
- [ ] Draw calls, triangles, texture-memory estimate, and transfer size recorded.
- [ ] Current-garden baseline screenshot captured.
- [ ] Proof-slice screenshots captured at matching resolution.
- [ ] Final verdict uses measured values, not estimates.

## H. Final report

- [ ] Browser verdict is PASS, CONDITIONAL PASS, or FAIL.
- [ ] The report names visual compromises.
- [ ] Four-to-five-landmark scaling budget is stated.
- [ ] Biggest browser risks are named.
- [ ] UE5 differences are stated if relevant.
- [ ] Every external package and asset is listed with source, version, license, cost, and shipped status.
