# Project map

```text
Beyond_Eden_Agent_Handoff/
├── AGENT_START_HERE.md          # Human/agent entry point
├── AGENTS.md                    # Non-negotiable operating rules
├── README.md                    # Technical overview and commands
├── agent/                       # Execution state, prompt, tests, progress
├── references/                  # Internal-only architecture research
├── beyond-eden.html             # Isolated proof route
├── beyond-eden.css              # Proof UI/HUD
├── beyond-eden/
│   ├── main.js                  # Scene orchestration and render loop
│   ├── config.js                # Quality, fog, flashlight, streaming budgets
│   ├── core/                    # Renderer, controls, collision, streaming, bench
│   ├── scene/                   # Temple proxy, lighting, fog, trees, ritual door
│   └── assets/                  # Runtime sector/tree manifests
├── assets/
│   ├── beyond-eden/raw/         # Blender-generated unoptimized GLBs
│   ├── beyond-eden/optimized/   # Meshopt/KTX2 runtime GLBs
│   ├── beyond-eden/trees/       # Approved tree LODs and billboard
│   └── vendor/three-r187/       # Locally vendored three.js runtime
├── tools/
│   ├── apply-to-project.sh      # Creates local branch and commits overlay
│   ├── agent/                   # Doctor/build/run/verification helpers
│   ├── blender/                 # Temple and tree generation scripts
│   ├── pipeline/                # Compression, validation, inspection
│   └── vendor/                  # Local three.js vendor copy script
└── docs/                        # Pipeline, benchmark, status, ledger, verdict
```

## Runtime data flow

```text
beyond-eden.html
  → import map: local three.js r187
  → beyond-eden/main.js
     → createRenderer()
     → FirstPersonController + CollisionWorld
     → DistrictStreamer
        → optimized GLB if present
        → procedural proxy if absent
     → TreeSystem
        → approved LOD0/LOD1/billboard if present
        → procedural proxy if absent
     → Atmosphere + Flashlight + PracticalLights + RitualDoor
     → QualityManager + BenchRunner
```

- `docs/COORDINATE_CONVENTIONS.md` — binding Blender ↔ three.js axis/sign contract and dynamic-door ownership.
