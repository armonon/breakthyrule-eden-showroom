# Runtime architecture and scale test

## Why this is isolated

Upgrading the entire showroom from its existing global r158 script stack before the proof would mix renderer migration risk with the visual-performance question. `/beyond-eden.html` therefore owns a modern ES-module import map and does not execute the garden scripts. Both experiences can be served by the existing Node server without changing its account, presence, chat, or PvP endpoints.

## Scene organization

The slice is divided into five independently loadable sectors:

1. temple core;
2. plaza center;
3. south processional approach;
4. west flank;
5. east flank.

The temple stays loaded. Other sectors choose LOD0/1/2 by distance and unload after leaving the preload/rear-visibility budget. Repeated relief bays, buttresses, planters, lamps, and trees use instancing. Static geometry has shadows disabled and receives baked/ambient information; only the player flashlight, ritual door, and limited practical lamps remain live.

## Three approaches and cover

The plaza intentionally avoids a single dominant choke point:

- the south approach is the clearest and longest sightline;
- west and east approaches enter from the flanks;
- planters and low walls provide interruption, not permanent fortification;
- the central ritual area remains exposed;
- the future Attendant AI can punish prolonged temple camping without changing the layout.

## Scaling to four or five landmarks

The same district contract should be used for every landmark:

```text
landmark-core LOD0/1/2
landmark-approach-a LOD0/1/2
landmark-approach-b LOD0/1/2
shared street kit
shared vegetation/material library
collision/nav proxy
streaming metadata
```

A realistic initial streaming budget is:

- one hero landmark at LOD0;
- one adjacent landmark at LOD1;
- skyline proxies/impostors for two or three distant landmarks;
- shared 1K–2K KTX2 material arrays rather than unique 4K sets per building;
- no more than two hero interiors resident simultaneously;
- collision/navigation meshes separate from render meshes.

Do not extrapolate final memory from the procedural proxy. The proof must first report real GLB sizes and estimated texture memory. For 4–5 landmarks, the main risks are unique texture growth, shader compilation stalls, alpha-heavy vegetation, live-light/shadow multiplication, and interior/exterior overlap—not raw triangle count alone.

## Browser-versus-UE5 decision rule

The browser path passes only if the actual temple asset, approved tree, fog, focused flashlight, and three approaches meet the high-quality target on the M4 without hiding unacceptable visual compromises.

If it fails:

- UE5 improves virtualized geometry, mature temporal reconstruction, shadowing, volumetrics, world partition, foliage tooling, and destruction/physics integration.
- A native UE5 build does not run as a normal lightweight browser page.
- Pixel Streaming preserves UE5 rendering in a browser but requires GPU servers, video latency, bandwidth, session orchestration, and recurring cost.
- Therefore the proof should fail plainly rather than assume Pixel Streaming is a free substitute.
