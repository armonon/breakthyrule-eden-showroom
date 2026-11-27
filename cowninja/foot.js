// The ninja on foot. This is the main game's own locomotion, unchanged: createExpeditionController runs
// player-movement.js (sprint, held jumps, slide, crouch) and parkour.js (vaults, climbs, wall-runs, wall jumps) against
// the yard's boxes, and the character is posed from it the way Beyond Eden poses its players. Momentum is switched on
// here. The camera is third-person, so `yaw` is where the camera looks; W runs that way.
// Controller yaw 0 faces +z; this mode's "forward" vectors are (sin yaw, 0, cos yaw).
import * as THREE from 'three/webgpu';
import { createNinja } from '/cowninja/cow.js';
import { animationPath, clearAnimationPath } from '/cowninja/animation-path.js';

const CLIMBS = new Set(['pipe', 'rope', 'climb', 'hang', 'scramble']);
const BIT = { w: 1, s: 2, a: 4, d: 8, shift: 16, space: 32, crouch: 64 };
const ease = (a, b, n) => { const t = Math.max(0, Math.min(1, (n - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createFoot({ scene, world, onEffect }) {
  const G = window;
  const ready = !!(G.createExpeditionController && G.createParkour && G.createPlayerMovement && G.playerBodyProfile);
  // This yard has no pyramid: movement is only held inside the map's edge.
  G.createExpeditionConstraints = ({ layout }) => (next) => { const [a, b, c, d] = layout.bounds; next.x = Math.max(a, Math.min(b, next.x)); next.z = Math.max(c, Math.min(d, next.z)); return next; };
  const walls = world.solids.filter(b => !b.roof && b.bottom < .5).map(b => [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2, b.maxX - b.minX, b.maxZ - b.minZ, b.top]);
  const surfaces = world.solids.filter(b => b.surface !== false || b.bottom < .5).map(b => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, top: b.top, bottom: b.bottom }));
  // A gate that opens stops being in the way (the movement code reads these lists live).
  for (const g of world.gates || []) { const w = walls.find(o => o[0] === g.x && o[1] === g.z && o[4] === g.height), f = surfaces.find(o => o.minX === g.solid.minX && o.minZ === g.solid.minZ && o.top === g.height); g.footParts = { w, f }; }
  world.onGate?.(g => { const { w, f } = g.footParts || {}; if (w) { w[2] = 0; w[3] = 0; w[4] = -10; w[1] = 1e6; } if (f) { f.top = -10; f.bottom = -11; f.minX = f.maxX = 1e6; } });
  // The roof's terraces are walkable too; pipes, ropes and bars come from the site (parkour.js reads this global).
  for (const [x0, x1, z0, z1, top, bottom] of world.roofSteps || []) surfaces.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top, bottom });
  G.parkourGrips = { grips: (world.grips || []).map((g, id) => ({ ...g, id })), boxes: [] };   // parkour.js looks grips up by id
  let controller = null;
  if (ready) try {
    controller = G.createExpeditionController({ T: THREE, world: { walls, surfaces }, layout: { spawn: [world.spawn.x, world.spawn.z], bounds: world.bounds || [-150, 150, -340, 160] }, character: { height: 176, shoulders: 1 },
      worldRevision: 'cowninja-yard-1', momentumEnabled: true, effect: e => onEffect?.(e) });
  } catch (error) { console.warn('[cowninja] on-foot movement unavailable:', error); }
  const ninja = createNinja(), holder = ninja?.person.root || new THREE.Group(); holder.visible = false; scene.add(holder);
  const state = { active: false, busy: false, x: 0, y: 0, z: 0, yaw: 0, speed: 0, charging: false, skid: 0, airborne: false, crouched: false, movement: 'ground', onFoot: true, noise: 0, hidden: false, forward: new THREE.Vector3(0, 0, 1), velocity: new THREE.Vector3() };
  let bodyYaw = null, turning = false, handRise = 0, handsOn = false, tick = 0, lastJump = false, lastCrouch = false, freeAt = 0, topTicks = 0, leap = null, climbAt = 0, traversalRate = 1;
  const probe = new THREE.Vector3(), lookPoint = new THREE.Vector3();

  function enter(x, z, yaw) {
    if (!controller) return false;
    cancelAction(); wallClimb = null; mantle = null; releasePose = null; state.busy = false;
    controller.reset({ x, z, y: 0, yaw, nextTick: controller.tick }); bodyYaw = yaw; state.active = true; holder.visible = true; read(); return true;
  }
  function leave() { cancelAction(); state.active = false; state.busy = false; holder.visible = false; wallClimb = null; mantle = null; releasePose = null; ninja?.person.motion.traversal?.(null); }
  function read() {
    const p = controller.readPose(), v = controller.velocity;
    state.x = p.x; state.y = p.y; state.z = p.z; state.yaw = p.yaw; state.movement = p.movement; state.speed = Math.hypot(v.x, v.z);
    state.airborne = controller.motion.inspect().airborne; state.crouched = controller.movement.crouchAmount > .4 || p.movement === 'crouch';
    state.forward.set(Math.sin(p.yaw), 0, Math.cos(p.yaw)); state.velocity.set(v.x, p.vy || 0, v.z);
    // How far you can be heard, 0..1: nothing standing still or creeping, everything at a sprint or a landing.
    // In a hay pile and not sprinting: out of sight entirely.
    // Hidden: in hay, or crouched in tall grass.
    state.inBush = p.y < .6 && !!world.inBush?.(p.x, p.z);
    state.hidden = (!!world.inHay?.(p.x, p.z) && state.speed < 4.2 && p.y < 2) || (state.crouched && p.y < .6 && !!world.inCover?.(p.x, p.z)) || (state.inBush && state.speed < 3.2);
    state.climbing = CLIMBS.has(p.movement) || p.movement === 'bar' || p.movement === 'wallrun';
    state.noise = state.inBush && state.speed > .3 ? .18 : state.hidden ? 0 : state.speed < .3 ? 0 : state.crouched ? .12 : p.movement === 'slide' ? .5 : state.speed > 4.6 ? .85 : .38;
  }
  // ---- Free climbing (this mode's own, on top of parkour.js): any tall solid face can be climbed. Sprint into a wall
  // too high to grab and you take hold of it; W/S climb, A/D traverse, Space kicks off, C lets go; at the top you
  // pull up onto whatever is there. The wall is found from the site's solid boxes each tick, so openings stop you.
  const CLIMB_UP = 2.5, CLIMB_SIDE = 1.7, OFF = .36;
  let wallClimb = null, mantle = null, action = null, releasePose = null;
  const boxAt = (x, y, z) => { for (const b of world.solids) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && y < b.top && y > b.bottom) return b; return null; };
  function findWall(yaw) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), b = boxAt(state.x + fx * .75, state.y + 1.0, state.z + fz * .75);
    if (!b || b.top < state.y + 2.5 || boxAt(state.x, state.y + 1.0, state.z)) return null;
    // Which face are we at: the one whose outward normal faces us most squarely.
    const faces = [[-1, 0, b.minX], [1, 0, b.maxX], [0, -1, b.minZ], [0, 1, b.maxZ]];
    let best = null, bd = -.55;
    for (const [nx, nz, at] of faces) { const d = fx * nx + fz * nz; if (d < bd) { bd = d; best = { nx, nz, at }; } }
    if (!best) return null;
    const dist = best.nx ? Math.abs(state.x - best.at) : Math.abs(state.z - best.at);
    return dist < 1.0 ? best : null;
  }
  function placeOnWall() { if (wallClimb.nx) wallClimb.x = wallClimb.at + wallClimb.nx * OFF; else wallClimb.z = wallClimb.at + wallClimb.nz * OFF; }
  function endClimb(x, y, z, yaw, jump = false) {
    wallClimb = null; climbAt = tick + 40; ninja?.person.motion.traversal?.(null);
    controller.reset({ x, y, z, yaw, nextTick: controller.tick });
    // reset() starts grounded. Restore height above the real support before returning to shared movement, otherwise
    // the first walking tick would place the character on the ground instead of falling from this wall.
    let floor = 0; try { floor = controller.parkour.supportAt(x, z, y + .25, .26); } catch { /* ground */ }
    controller.motion.set(Math.max(0, y - floor), jump ? 5.4 : 0);
    if (jump) controller.velocity.set(Math.sin(yaw) * 4.2, 0, Math.cos(yaw) * 4.2);
    releasePose = jump ? { kind: 'warp', action: 'leap', time: 0, duration: .5 } : y > floor + .1 ? { kind: 'hangdrop', time: 0, duration: .4 } : null;
    read();
  }
  // The controller owns displacement; the baked clips supply the body pose. Raise the feet above the lip before
  // bringing them over it, then let the normal controller resume on the destination support.
  function beginMantle(x, y, z, yaw, kind = 'climb') {
    if (world.solidAt(x, y + .35, z, .24) || world.solidAt(x, y + 1.5, z, .24)) return false;
    for (let i = 1; i <= 16; i++) { const u = i / 16, across = ease(.55, 1, u), rise = ease(0, .55, u);
      const px = state.x + (x - state.x) * across, pz = state.z + (z - state.z) * across, py = state.y + (y - state.y) * rise;
      if (world.solidAt(px, py + .35, pz, .24) || world.solidAt(px, py + 1.5, pz, .24)) return false; }
    const clip = kind === 'ladderExit' ? 'pkLadderExit' : 'pkClimb';
    mantle = { from: { x: state.x, y: state.y, z: state.z }, to: { x, y, z }, yaw, kind, time: 0,
      duration: Math.max(.8, Math.min(1.35, (G.GardenAnim?.duration(clip) || 1.1) * .85)) };
    wallClimb = null; state.busy = true; leap = null; releasePose = null; topTicks = 0; return true;
  }
  function scriptedPose(traversal, dt) {
    if (!ninja) return;
    ninja.dress(); const person = ninja.person, motion = person.motion, M = G.GardenCharacterMotion;
    person.root.position.set(state.x, state.y, state.z); person.root.rotation.y = state.yaw;
    motion.airborne(false); motion.crouch(0); motion.guard?.(0); motion.lookAt?.(null);
    if (M?.traverseBody) ({ handRise, handsOn } = M.traverseBody(THREE, person, { hands: null, handRise, handsOn, pose: { traversal }, dt, probe }));
    else motion.traversal?.(traversal);
    motion.update(dt, { velocity: STILLV, wade: 0 });
  }
  function stepMantle(keys) {
    const m = mantle, dt = 1 / 60; m.time = Math.min(m.duration, m.time + dt); tick++;
    const u = m.time / m.duration, over = ease(.55, 1, u), rise = ease(0, .55, u);
    const x = m.from.x + (m.to.x - m.from.x) * over, z = m.from.z + (m.to.z - m.from.z) * over, y = m.from.y + (m.to.y - m.from.y) * rise;
    controller.reset({ x, y, z, yaw: m.yaw, nextTick: controller.tick + 1 }); read(); bodyYaw = m.yaw;
    state.busy = true; state.movement = m.kind; state.climbing = true; state.airborne = false; state.noise = .2;
    scriptedPose({ kind: m.kind, time: m.time, duration: m.duration }, dt);
    lastJump = keys.has('space'); lastCrouch = keys.has('crouch');
    if (u >= 1) { mantle = null; state.busy = false; state.climbing = false; climbAt = tick + 30; onEffect?.({ kind: 'footstep:land', args: ['stone', .4] }); }
  }
  function stepWallClimb(keys) {
    const c = wallClimb, dt = 1 / 60, face = Math.atan2(-c.nx, -c.nz), oldX = c.x, oldY = c.y, oldZ = c.z;   // yaw looking into the wall
    const up = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0), side = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    if (keys.has('space') && !lastJump) { lastJump = true; endClimb(c.x + c.nx * .5, c.y, c.z + c.nz * .5, Math.atan2(c.nx, c.nz), true); return; }
    lastJump = keys.has('space');
    if (keys.has('crouch')) { lastCrouch = true; endClimb(c.x + c.nx * .3, c.y, c.z + c.nz * .3, face); return; }
    // Sideways along the wall (the camera's right is the wall's tangent seen from outside), if there is wall there.
    if (side) { const tx = c.nz * side, tz = -c.nx * side, nx2 = c.x + tx * CLIMB_SIDE * dt, nz2 = c.z + tz * CLIMB_SIDE * dt;
      if (boxAt(nx2 - c.nx * .6, c.y + 1.0, nz2 - c.nz * .6) && !boxAt(nx2, c.y + 1.0, nz2)) { c.x = nx2; c.z = nz2; } }
    if (up) {
      const ny = c.y + up * CLIMB_UP * dt;
      if (up < 0 && ny <= 0) { endClimb(c.x + c.nx * .2, 0, c.z + c.nz * .2, face); return; }
      const hold = boxAt(c.x - c.nx * .6, ny + 1.55, c.z - c.nz * .6);   // wall still there at chest height?
      if (up > 0 && !hold) {
        // The top: pull up if there is somewhere to stand just beyond the edge.
        const sx = c.x - c.nx * 1.15, sz = c.z - c.nz * 1.15; let floor = -1;
        try { floor = controller.parkour.supportAt(sx, sz, ny + 2.2, .26); } catch { /* none */ }
        if (floor > ny + .4 && floor < ny + 2.3 && !boxAt(sx, floor + 1.0, sz) && beginMantle(sx, floor, sz, face)) { stepMantle(keys); return; }
      } else if (!boxAt(c.x, ny + 1.7, c.z) || up < 0) c.y = Math.max(0, ny);   // (an overhang above the head stops you)
    }
    const vertical = Math.abs(c.y - oldY) > 1e-5 ? up : 0, lateral = Math.hypot(c.x - oldX, c.z - oldZ) > 1e-5 ? side : 0;
    c.moving = !!(vertical || lateral); c.time += dt; tick++;
    controller.reset({ x: c.x, y: c.y, z: c.z, yaw: face, nextTick: controller.tick + 1 });
    read(); state.y = c.y; state.movement = 'wallclimb'; state.climbing = true; state.airborne = false; state.speed = c.moving ? 2 : 0; state.noise = c.moving ? .22 : 0; state.hidden = false; state.velocity.set(0, 0, 0);
    bodyYaw = face;
    // The source wall cycle rises 1.20796 bind-hip heights in two seconds. Match its stride to the actual travel,
    // including blocked movement, so hands do not cycle at an unrelated rate while the controller climbs.
    const hip = ninja?.person.motion.bindHipHeight?.() || 1;
    const travel = lateral ? Math.hypot(c.x - oldX, c.z - oldZ) : Math.abs(c.y - oldY);
    const speed = Math.min(8, travel / (dt * hip * (lateral ? .48516859 : .60398)));
    scriptedPose({ kind: 'wallclimb', time: c.time, moving: c.moving, vertical, lateral, speed }, dt);
  }
  const STILLV = new THREE.Vector3();
  // Preserve the COWNinja-specific bakes as fallbacks; shared traversal owns the equivalent parkour moves.
  const hasClip = id => !!G.GardenAnim?.has?.(id);
  const once = (id, options = {}) => hasClip(id) ? ninja?.person.motion.play?.(id, { mask: 'full', loop: false, ...options }) : null;
  let pipeClip = false;
  // One 60 Hz tick. keys: Set of 'w','a','s','d','shift','space','crouch'; yaw/pitch: where the camera looks.
  // A flip: C in the air. The authored flip clips over the jump (start, tuck loop, landing), and a little more carry.
  let flip = null;
  function flipJump() {
    const motion = ninja?.person.motion;
    if (!controller || !state.active || !state.airborne || state.climbing || state.busy || flip || !motion || !hasClip('flipStart')) return false;
    flip = { t: 0, loop: false }; motion.play('flipStart', { fade: .05, speed: 1.35, mask: 'full', arms: true });
    controller.velocity.x *= 1.12; controller.velocity.z *= 1.12; state.flipping = true;
    return true;
  }
  function stepFlip() {
    if (!flip) return; flip.t += 1 / 60; const motion = ninja?.person.motion;
    if (!state.airborne || state.climbing || flip.t > 2.5) {
      motion?.stop?.('flipStart', .1); motion?.stop?.('flipLoop', .12);
      if (!state.climbing && !state.airborne && hasClip('flipLand')) once('flipLand', { fade: .06, speed: 1.5 });
      flip = null; state.flipping = false; return;
    }
    const d = (G.GardenAnim?.duration('flipStart') || .6) / 1.35;
    if (!flip.loop && flip.t > d * .85 && hasClip('flipLoop')) { flip.loop = true; motion?.play?.('flipLoop', { fade: .08, loop: true, mask: 'full', arms: true }); }
  }
  function step(keys, yaw, pitch = 0) {
    if (!controller || !state.active) return;
    stepFlip();
    traversalRate = 1;
    if (action) { stepAction(keys); return; }
    if (mantle) { stepMantle(keys); return; }
    if (wallClimb) { stepWallClimb(keys); return; }
    // Take hold of a tall wall: sprint held, pushing into it (from the ground or out of a jump).
    if (keys.has('shift') && keys.has('w') && tick > climbAt && !CLIMBS.has(state.movement)) {
      const w = findWall(yaw);
      if (w) { wallClimb = { ...w, x: state.x, y: Math.max(0, state.y), z: state.z, moving: false, time: 0 }; placeOnWall(); climbAt = tick + 30; leap = null; stepWallClimb(keys); return; }
    }
    let held = 0; for (const k in BIT) if (keys.has(k)) held |= BIT[k];
    const jump = keys.has('space'), crouch = keys.has('crouch'); let edges = (jump && !lastJump ? 1 : 0) | (crouch && !lastCrouch ? 2 : 0); lastJump = jump; lastCrouch = crouch;
    // Freerun: with sprint held you do not press jump for what is in your way. Running at something solid at knee
    // height jumps (parkour.js then vaults, scrambles or grabs it), and running off an edge with a drop leaps.
    // (No run-up needed at a wall: standing on a ledge and pushing into the wall goes for the next ledge up.)
    if (keys.has('shift') && keys.has('w') && !state.airborne && state.movement === 'ground' && tick > freeAt) {
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      let go = world.solidAt(state.x + fx * .95, state.y + .55, state.z + fz * .95, 0) && !world.solidAt(state.x, state.y + .55, state.z, 0);
      if (go && state.speed < 2.2 && state.y < .3 && !world.solidAt(state.x + fx * .95, state.y + 2.4, state.z + fz * .95, 0)) go = false;   // on the ground, a low thing needs a run-up; a wall does not
      if (!go && state.speed > 4.4) { try { const floor = controller.parkour.supportAt(state.x + fx * 1.25, state.z + fz * 1.25, state.y + .45, .26); go = state.y - floor > 1.1; } catch { /* older parkour.js */ } }
      if (go) { edges |= 1; freeAt = tick + 26; held |= BIT.space; }
    }
    if (leap && leap !== 'none') held &= ~(BIT.w | BIT.s | BIT.a | BIT.d | BIT.shift);   // committed to the leap: the fall is steered, not run
    let wrapped = yaw % (Math.PI * 2); if (wrapped > Math.PI) wrapped -= Math.PI * 2; if (wrapped < -Math.PI) wrapped += Math.PI * 2;
    try { controller.step({ heldMask: held, edges, yaw: wrapped, pitch: Math.max(-1.3, Math.min(1.3, pitch)) });
      // Mantles and ledge moves keep COWNinja's quicker pace. Pipe and rope ascent use the shared controller pace
      // so the ladder cycle can keep up with each planted hand and foot.
      if (['climb', 'hang', 'scramble'].includes(controller.movement.state()) && (held & (BIT.w | BIT.a | BIT.d | BIT.s))) { controller.step({ heldMask: held, edges: 0, yaw: wrapped, pitch: Math.max(-1.3, Math.min(1.3, pitch)) }); traversalRate = 2; } } catch (error) { if (!step.warned) { step.warned = true; console.warn('[cowninja] movement step', error); } }
    tick++; read();
    // Top of a pipe with W held: step off onto whatever is there (the roof, the office roof) instead of hanging.
    if (state.movement === 'pipe' && keys.has('w')) {
      const g = (world.grips || []).find(g => g.type === 'pipe' && Math.hypot(g.x - state.x, g.z - state.z) < .9);
      if (g && state.y > g.y1 - 1.25) { if (++topTicks > 14) { const x = g.x - g.n[0] * 1.25, z = g.z - g.n[1] * 1.25; let y = state.y;
        try { y = controller.parkour.supportAt(x, z, state.y + 1.2, .26); } catch { /* keep */ }
        if (y > state.y - 1.6 && beginMantle(x, y, z, Math.atan2(-g.n[0], -g.n[1]), 'ladderExit')) { stepMantle(keys); return; } topTicks = 0; } } else topTicks = 0;
    } else topTicks = 0;
    // Leap of faith: in the air and falling with a hay pile ahead and below, the fall is steered into it.
    if (state.airborne && state.velocity.y < -1 && state.y > 2.2) {
      if (!leap) { const fx = Math.sin(wrapped), fz = Math.cos(wrapped); let best = null, bd = 13;
        for (const h of world.hay || []) { const dx = h[0] - state.x, dz = h[1] - state.z, d = Math.hypot(dx, dz); if (d < bd && (d < 5 || (dx * fx + dz * fz) / d > .55)) { bd = d; best = h; } }
        leap = best || 'none'; if (best) {
          if (hasClip('pkLeap')) releasePose = { kind: 'warp', action: 'leap', time: 0, duration: G.GardenAnim.duration('pkLeap') / .8 };
          else once('cnLeap', { fade: .1, speed: .8 });
        } }
      if (leap !== 'none') { const dx = leap[0] - state.x, dz = leap[1] - state.z, d = Math.hypot(dx, dz) || 1, v = Math.min(8.5, d * 2.4); controller.velocity.x = dx / d * v; controller.velocity.z = dz / d * v; }
    } else if (!state.airborne) { if (leap && leap !== 'none') { if (world.inHay?.(state.x, state.z)) onEffect?.({ kind: 'leap-of-faith' }); ninja?.person.motion.stop?.('cnLeap', .15); } leap = null; }
    // Older COWNinja libraries can supply their ladder clip; avoid stacking it over the shared traversal layer.
    { const on = !hasClip('pkLadder') && state.movement === 'pipe' && hasClip('cnLadder') && (keys.has('w') || keys.has('s'));
      if (on && !pipeClip) { pipeClip = true; ninja?.person.motion.play?.('cnLadder', { loop: true, fade: .12, speed: 1.6, mask: 'full' }); }
      else if (!on && pipeClip) { pipeClip = false; ninja?.person.motion.stop?.('cnLadder', .15); } }
    pose(1 / 60);
  }
  // The body follows the way he is moving (not the camera), and takes its traversal poses from the movement state.
  function pose(dt) {
    if (!ninja) return; ninja.dress();
    const person = ninja.person, motion = person.motion, M = G.GardenCharacterMotion, m = controller.movement, v = controller.velocity, moving = Math.hypot(v.x, v.z);
    const want = moving > .4 ? Math.atan2(v.x, v.z) : bodyYaw ?? state.yaw;
    if (tick < faceUntil) bodyYaw = faceYaw;   // a punch or a guard holds the body on its target
    else if (M?.turnBody) ({ yaw: bodyYaw, turning } = M.turnBody(bodyYaw, turning, want, moving, dt)); else bodyYaw = want;
    person.root.position.set(state.x, state.y, state.z); person.root.rotation.y = bodyYaw; state.facing = bodyYaw;   // the way the body faces (the camera follows it)
    const dive = m.dive ? Math.min(1, m.dive.t * 4) : m.proneT > 0 ? Math.min(1, m.proneT / .4) : 0, slide = m.slide?.kind === 'slide' && !m.slide.belly ? 1 - m.slide.t / m.slide.dur : 0;
    const drop = m.crouchAmount * .55 + (m.dive ? Math.min(1, m.dive.t * 5) * .55 : 0) + (m.proneT > 0 ? Math.min(1, m.proneT / .25) * .75 : 0);
    let traversal = m.traversal();
    if (traversal && ['pipe', 'rope', 'hang', 'scramble'].includes(traversal.kind)) traversal = { ...traversal, speed: (traversal.speed || 1) * traversalRate };
    if (releasePose) { if (!state.airborne || releasePose.time >= releasePose.duration || traversal) releasePose = null;
      else { releasePose.time = Math.min(releasePose.duration, releasePose.time + dt); traversal = { ...releasePose }; } }
    try {
      motion.airborne(state.airborne); motion.crouch(Math.min(drop, .55) / .55); motion.guard?.(guardWeight);
      if (M?.traverseBody) ({ handRise, handsOn } = M.traverseBody(THREE, person, { hands: controller.parkour.hands(), handRise, handsOn, pose: { traversal, dive, slide }, dt, probe }));
      lookPoint.set(state.x + Math.sin(bodyYaw) * 5, state.y + 1.6, state.z + Math.cos(bodyYaw) * 5); motion.lookAt?.(lookPoint);
      motion.update(dt, { velocity: v, wade: 0 });
    } catch (error) { if (!pose.warned) { pose.warned = true; console.warn('[cowninja] pose', error); } }
  }
  const play = (clip, options) => ninja?.person.motion.play?.(clip, options);
  // Fighting (fight.js): hold the body on a target for a while, a short shove (the step into a punch), the guard pose.
  let faceYaw = 0, faceUntil = 0, guardWeight = 0;
  const face = (yaw, seconds = .4) => { faceYaw = yaw; faceUntil = tick + Math.round(seconds * 60); bodyYaw = yaw; };
  const shove = (vx, vz) => { if (controller) { controller.velocity.x += vx; controller.velocity.z += vz; } };
  const setGuard = w => { guardWeight = w; if (w && tick >= faceUntil) { faceYaw = state.yaw; faceUntil = tick + 2; } };
  const facing = () => bodyYaw ?? state.yaw;
  // Paired actions use one movement clock. A small collision-checked alignment happens before either clip starts.
  function beginAction({ x, z, yaw, duration, sourceStart = 0, sourceEnd = G.GardenAnim?.duration('stealthAssassin'), onProgress, onFinish, onCancel, valid }) {
    if (!controller || !ninja || !state.active || state.airborne || state.climbing || action || mantle || !G.GardenAnim?.has('stealthAssassin')) return false;
    if (![x, z, yaw, duration].every(Number.isFinite) || duration <= 0 || Math.hypot(x - state.x, z - state.z) > 2) return false;
    if (![sourceStart, sourceEnd].every(Number.isFinite) || sourceStart < 0 || sourceEnd <= sourceStart || sourceEnd > G.GardenAnim.duration('stealthAssassin')) return false;
    const path = animationPath(G.GardenAnim, 'stealthAssassin', ninja.person, { x, z, yaw, start: sourceStart, end: sourceEnd });
    if (!clearAnimationPath(world, path, state.y, state)) return false;
    const motion = ninja.person.motion;
    motion.traversal?.(null); motion.stop?.(null, .14); motion.touch?.('L', null, null, 0); motion.touch?.('R', null, null, 0);
    const layer = motion.play?.('stealthAssassin', { fade: .18, speed: 0, start: sourceStart, mask: 'full', arms: true, hold: true });
    if (!layer) return false;
    action = { from: { x: state.x, z: state.z, yaw: bodyYaw ?? state.yaw }, x, z, y: state.y, yaw, duration, path, onProgress, onFinish, onCancel, valid, time: 0,
      align: Math.max(.16, Math.min(.45, Math.hypot(x - state.x, z - state.z) / 3)), layer };
    state.busy = true; return true;
  }
  function cancelAction() {
    if (!action) return;
    const a = action; action = null; state.busy = false; ninja?.person.motion.stop?.('stealthAssassin', .16); a.onCancel?.();
  }
  function stepAction(keys) {
    const a = action, dt = 1 / 60;
    if (a.valid && !a.valid()) { cancelAction(); return; }
    a.time += dt; tick++;
    const align = ease(0, a.align, a.time), yawDelta = Math.atan2(Math.sin(a.yaw - a.from.yaw), Math.cos(a.yaw - a.from.yaw));
    const progress = Math.max(0, Math.min(1, (a.time - a.align) / a.duration)), point = a.path.sample(progress);
    controller.reset({ x: a.from.x + (point.x - a.from.x) * align, y: a.y, z: a.from.z + (point.z - a.from.z) * align, yaw: a.from.yaw + yawDelta * align, nextTick: controller.tick + 1 });
    read(); bodyYaw = state.yaw; state.busy = true; state.movement = 'takedown'; state.noise = .12;
    a.layer.t = point.time; a.onProgress?.(progress);
    scriptedPose(null, dt); lastJump = keys.has('space'); lastCrouch = keys.has('crouch');
    if (progress >= 1) { action = null; state.busy = false; ninja.person.motion.stop?.('stealthAssassin', .2); a.onFinish?.(); }
  }
  return { state, enter, leave, step, flipJump, play, face, shove, setGuard, facing, beginAction, cancelAction, available: !!controller, controller, ninja, holder };
}
