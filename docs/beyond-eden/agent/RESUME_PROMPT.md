# Copy-paste prompt for the local coding agent

You are the lead graphics engineer responsible for finishing the local Beyond Eden browser-realism proof slice in `~/Projects/breakthyrule-eden-showroom`.

Begin by reading every instruction in the handoff folder, starting with `AGENT_START_HERE.md`, `AGENTS.md`, `agent/DECISIONS_LOCKED.md`, `agent/HANDOFF_STATE.json`, and `agent/EXECUTION_PLAN.md`. Treat the local repository—not GitHub—as the source of truth. The remote contains only an older snapshot.

Your goal is to complete and measure one isolated playable scene at `/beyond-eden.html`: the Wilshire Scottish Rite Temple and plaza at night, using three.js 0.187.0 `WebGPURenderer` with automatic WebGL2 fallback. Preserve the existing Eden garden and `server/eden-server.mjs` multiplayer contract. Work only on the local branch `beyond-eden/browser-realism-proof`, created from local `asset-workshop/limestone-planter` if it does not already exist.

Do not push, deploy, use Netlify, create a PR, upload anything, or modify any outward-facing service. Do not reset, clean, or overwrite local uncommitted work. Do not download a new package/tool/asset unless it is already approved in the user’s local context; otherwise ask first. The tree choice has already been discussed and resolved: locate and use the existing approved local tree source if available. Do not restart tree shopping. If it cannot be found, keep the proxy tree, finish every other part, and document the missing local source.

Continue past planning. Inspect the repo, integrate the source overlay, vendor the approved three.js build locally, generate the five temple/plaza sectors at three LODs in Blender, bake static AO/indirect, optimize with meshopt and KTX2, integrate the selected tree LODs and billboard, run the proof through `node server/eden-server.mjs`, verify WebGPU and forced WebGL2, preserve the garden/server behavior, capture matching screenshots, run three benchmark passes for High/Medium/Low and WebGL2 High, and write a measured PASS / CONDITIONAL PASS / FAIL verdict with a four-to-five-landmark scaling projection.

Use small local commits. Never invent performance results. Update `agent/PROGRESS_LOG.md` as you work and complete every checkbox in `agent/ACCEPTANCE_TESTS.md` that the machine allows. Leave the final branch local and unpushed.
