# Break Thy Rule: Eden showroom roadmap

Ideas gathered on 2 November 2026, after the performance overhaul and the PLAY menu. Nothing here is built yet.

## Gameplay mechanics and feel

### Movement and camera
- **Mouse look while exploring.** Pointer lock today only happens with a weapon drawn; on foot it is click-and-drag,
  and vertical look is clamped to about ±22° (`pitch` -.38..+.4 in app.js). Offer a "click to play" mode with direct
  mouse look and roughly ±80° pitch; keep drag-to-look for browsing the showroom and for touch.
- **Camera that follows 1:1.** The camera eases toward the player's position every frame
  (`1-exp(-12·dt)` in `draw()`), so input arrives late and movement feels mushy. Drive the camera from the player
  directly and keep easing only for scripted view changes.
- **Snappier jump.** Today: 0.72 s airtime, ~1 m apex (player-motion.js: gravity 15, impulse 5.4). Raise gravity, add
  a short coyote time (jump just after stepping off an edge), a jump buffer (press slightly early) and a lower jump
  on a tap.
- **Sprint and landing feedback.** A small FOV kick when sprinting, a slight dip and footstep sound when landing,
  head bob tied to surface (grass, stone, brick).
- **Crouch and slide.** C to crouch; sprint + C to slide into cover in battles.
- **Look settings.** Sensitivity, invert Y and FOV in a small settings panel.

### Combat
- **One melee system.** Four separate punches exist today: the body punch (player-body.js, F), the jester fists
  (fist-combat.js, F/G/Q), weapon melee (combat.js, the axe) and the online arena sword (arena.js). Unify them on one
  set of inputs, timings, hit reactions and sounds.
- **Hit feel.** Brief hit-stop (a few frames' pause) on heavy hits, stronger knockback, directional hit reactions,
  screen shake scaled by damage, distinct sounds for hits, blocks and misses.
- **Gunplay.** Recoil patterns players can learn, aim-down-sights tuning per weapon, hit markers and kill
  confirmation with sound, tracer and impact effects that read in daylight.
- **Dodge.** A quick side-step or roll with a short invulnerability window, for both the jester and the battle.

### Battle
- Start with fists instead of empty-handed.
- Smarter bots: they loot, use cover, flee the dark, and come in difficulty levels.
- A 3-minute quick match beside the full 7-minute one.
- Loot and the safe zone on the minimap, and a warning when the dark reaches you.
- Spectate your eliminator, then a results card with a rematch button.

### The jester as a mini-boss
- Three rounds that get harder, telegraphed attacks to read and dodge, a combo meter, a knockout timer.
- Beating him wins his hat; keep a fastest-knockout record.

## Engagement and the brand

1. **Progression and rewards.** Rule Points from battles, jester knockouts, range true shots and expedition pages;
   they unlock wearable pieces from the real collection (each linked to its shop page) and badges such as
   "Jester Slayer" and "Last One Standing", shown on a trophy shelf. Saved on the device until accounts are live.
2. **See your character.** A third-person camera (V) to see your avatar and outfit; an emote wheel (hold B) using
   the jester's existing dances (toprock, breakdance, taunt).
3. **Exploration quest.** Link the librarian, the black box, the museum and the hidden door with a short quest.
4. **Sound.** Music per area, battle music that rises as the night closes in, footsteps by surface, echoes beyond
   Eden.
5. **Phones.** Touch controls for the battle and the range: a movement stick, fire and aim buttons, a weapon wheel.

## Needs the live game server

- Turn off the public-preview mode so accounts, the shared room, chat, saved characters and the community
  library work on the live site.
- The online arena, co-op battles, seeing other visitors' outfits and emotes, and weekly leaderboards.
- Choose one online fist-fight protocol (player-body.js's server-decided punches are in use; the client protocol in
  docs/fist-combat-protocol.md is not wired up).

## Engineering

- Automated browser checks on every push (load, viper, avatars, weapons, battle, jester) before Netlify deploys.
- One integration branch (`main`) instead of parallel long-lived branches.
