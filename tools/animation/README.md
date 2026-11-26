# Shared animation bake

COWNinja and Beyond Eden both consume `assets/anim/clips.json` through `GardenAnim`.
The FBX source files are build inputs; neither game downloads or parses FBX at runtime.

To rebuild the 15 imported Mixamo clips, install the isolated, pinned build dependency:

```sh
npm install --prefix .anim-work three@0.158.0 --no-audit --no-fund
node tools/animation/bake-mixamo.cjs
node tools/animation/bake-mixamo.cjs --check
node --test tools/animation/mixamo.test.mjs
```

`mixamo-clips.json` maps each source file to its runtime ID, looping behavior and
root-motion policy. All sources are X Bot FBX Binary exports without skin, at
30 fps with keyframe reduction disabled. The baker uses Node's file system and
Three's FBX parser directly; it does not launch a browser. `bake-core.mjs` is also
used by the original browser workflow for the UAL and Rocketbox library.
The earlier optional-file Mixamo build-kit workflow is preserved as
`node tools/animation/bake-mixamo.cjs --legacy`; it retains its original Playwright
and `.anim-work/mixamo` requirements.

The new source space is named `mixamoX`. Keeping it separate preserves the rest
directions of the four retained older Mixamo clips (`pkVault`, `pkHang`,
`pkWallRun`, `pkWallRunR`) and every UAL and Rocketbox clip.

Movement owns horizontal root motion and the climb, ladder, jump and drop paths.
Their baked translations are removed so physics and animation do not move the
body twice. Loops retain periodic hip motion with vertical drift removed and a
short eased correction at the seam. The full Falling To Roll source starts in
mid-air; `pkRoll` begins at frame 14, its first ground contact, to retain landing
compression without replaying the physical fall. The paired stealth clips retain
their original seven-second duration and body compression.
Only the paired stealth clips also retain `rootXZ`: base64 signed 16-bit samples,
`[x,z]` per frame, relative to their first frame, in the same character-left/forward
axes as the bake. Divide by 10,000 and multiply by the target's bind hip height.
This lets the takedown move both actors together along collision-checked paths;
ordinary locomotion and parkour continue to use controller-owned translation.

`assets/anim/mixamo-manifest.json` records source hashes and the runtime library
hash. The `--check` mode reparses the FBXs and verifies the generated clip data
without writing. The tests also load the complete library through the actual
runtime validator, check quaternions and loop seams, and exercise preservation of
unrelated clips when a new source is merged.

## Gameplay integration

The shared movement presentation drives these clips in COWNinja and Beyond Eden:

| Movement | Runtime clips |
| --- | --- |
| Scramble / COWNinja free wall climb | `pkScramble` |
| Ledge traverse left / right | `pkShimmyL`, `pkShimmyR` |
| Pull up onto a ledge | `pkClimb` |
| Pipe or ladder entry, climb, exit | `pkLadderEnter`, `pkLadder`, `pkLadderExit` |
| Running leap | `pkLeap` |
| Ledge hop left / right / up | `pkHopL`, `pkHopR`, `pkHopUp` |
| Release a ledge | Initial release of `pkHangDrop`, followed by physical falling |
| Timed crouch landing or directional dive recovery | `pkRoll` |

While hanging, Space plus A/D hops to a reachable neighboring ledge; Space plus
W reaches a higher handhold when one is available. Ladder loops pause and reverse
with input. Controller clocks drive one-shots, and traversal layers use a normalized
160 ms crossfade. Optional presentation fields and roll/release clocks are included
in validated movement snapshots so replay and the server use the same state.

COWNinja's existing E takedown uses `stealthAssassin` and `stealthVictim` together.
It skips their already-completed approach, plays source seconds 2–7 on one clock,
checks both root paths for obstructions, and hands the final victim pose to the
ragdoll. Damage and invalid targets cancel the pair. Beyond Eden uses the shared
parkour integration; it does not add a new stealth-combat interaction.
