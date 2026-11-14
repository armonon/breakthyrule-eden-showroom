# Expedition continuation — 2026-11-14

This branch preserves the actual game code recovered from Lillypad, including its uncommitted expedition integration. It is a development delivery, not a production rollout. The owner subsequently requested code and a Git push without further testing or SSH authentication. No new endurance/browser runs or Netlify deployment were performed for this push.

## Source and delivery

- Recovered development HEAD: `772a4343e2cfc189e6732a89d1f97e8d6ba6ad83`, branch `claude/garment-lab`, plus the captured dirty worktree.
- That local HEAD is not on GitHub. This continuation branch uses its available ancestor `838965b1f23e4692aa5d6e6350ee19ddb45dac76` and imports the recovered game source. It does not replace the storefront HTML, `site/`, or the Netlify garment-lab function.
- `SOURCE-MANIFEST.json` records the exact delivered file hashes, recovered baseline, and content version. The Git commit containing this document identifies the delivery.
- Last observed production deploy: `6af7f375fa3db239fec7fd96`. Existing production links continue to serve that separate published version.
- The SSH-only preview is unavailable after its tunnel closed. GitHub is the continuation channel; no SSH login is required to retain or inspect this code.

## Completion matrix

| Area | Delivered code | Existing evidence | Remaining |
| --- | --- | --- | --- |
| Solo loop | Bell/countdown, eight pages, escape, loss, retry, safe reset, return | Real-input win and loss runs passed | Final branch browser regression not rerun |
| Parkour routes | Shared rendered/collision roof geometry; temple/playhouse/hotel network, gardens, observatory; clearance and crouch-to-hang fixes | Real-input routes at different heights; 15 focused controller/input checks | Final ledge fix has fixture coverage, not a new visual run |
| Animation/camera | 62 licensed clips, first/third-person presentation, spring transitions, comfort settings, shared body-turn/traversal policy | Body views at 145/175/210 cm; control/remap/touch emulation | Fine contact/sliding review across all animation transitions; physical mobile |
| Ragdoll/recovery | Actual selected skeletons, collision-safe get-up, independent Jolt worlds, native ownership/leak fixes | All eight rigs and extremes; simultaneous six-world disposal; 128-cycle allocation plateau | New ownership/state changes not browser-endurance qualified |
| Loading/performance | Shader/texture warmup, stable light budgets, adaptive-resolution and disposal fixes; original visual effects retained | Ten-minute M4 exploration run, three world switches, failed-load retry | No final-source performance run, physical mobile or active-hunt endurance |
| Showroom compatibility | Garment photos, local library fallback/capability handling, optional resident animations, embedded Studio lifecycle | Shop/books/character/chat/wave/lab UI and Studio interaction passed | External search provider adjustment has focused checks only; public upload/music hosting remains unconfigured |
| Existing private multiplayer | Six saved-character account admission, room state, chat, reconnect and file checkpoints | Prior service/HTTP checks | Existing browser/server transport still validates client poses (protocol v1) |
| New input authority | Fixed-step shared controller, sequenced inputs/action receipts, selected-rig server actors, full animation and Jolt checkpoints, prediction/interpolation modules | Six authenticated rigs, simultaneous bails, restart and recovery in service tests | **Not connected to browser entry or the HTTP server. Protocol v2 is disabled.** |
| Public release | Source and evidence prepared for Git | Exact content inventory | Production host, frontend/backend rollout, real six-player network/endurance session and deployment |

## New multiplayer code boundary

`server/expedition-authority.mjs` exports the asynchronous input service. It preloads actual character rigs and physics outside the simulation tick and limits room/actor admission. `server/expedition-runtime.mjs`, `expedition-controller.js`, `expedition-inputs.js`, `expedition-pose.js`, and `expedition-actor.js` share movement, animation and physics policy. Native checkpoint bytes are bounded, hashed and tied to the simulation build. Invalid restore targets are discarded.

`expedition-client.js`, `expedition-prediction.js`, and `expedition-physical-view.js` provide the client foundations. They are intentionally not loaded by the current entry. Do not advertise fully input-authoritative multiplayer yet. Next integration must freeze saved appearance, sample fixed-step controls, send input batches with generation/connection epoch, reconcile self movement, render remote articulation, handle reconnect/leave, and then switch the HTTP service factory. Browser solo must retain the same game and rules.

## Evidence and limits

Existing evidence summaries are under `evidence/2026-11-14/`. The last complete earlier-source suite passed 174 tests. Later focused physics, animation, controller and service checks passed; their counts overlap and must not be added into a claimed full-suite total. Small final client guards, revision hashing, cache-version updates and documentation have not had a new behavioral run.

Earlier failures included an observatory run-up/input issue, first-use shader stalls, a Jolt settings double free and leaked constructor temporaries. Follow-up fixtures/runs informed fixes. These are not evidence that every device or network is now qualified. The earlier ten-minute browser run is exploration, not an active Watcher hunt or six-player endurance.

No accounts, public uploads, purchases or live music relays were created for this delivery. Netlify static hosting does not run the persistent Node room server. Current internet music relay capability remains unavailable.
