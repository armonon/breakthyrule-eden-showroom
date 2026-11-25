// The ninja on foot. This is the main game's own locomotion, unchanged: createExpeditionController runs
// player-movement.js (sprint, held jumps, slide, crouch) and parkour.js (vaults, climbs, wall-runs, wall jumps) against
// the yard's boxes, and the character is posed from it the way Beyond Eden poses its players. Momentum is switched on
// here. The camera is third-person, so `yaw` is where the camera looks; W runs that way.
// Controller yaw 0 faces +z; this mode's "forward" vectors are (sin yaw, 0, cos yaw).
import * as THREE from 'three/webgpu';
import { createNinja } from '/cowninja/cow.js';

const BIT = { w: 1, s: 2, a: 4, d: 8, shift: 16, space: 32, crouch: 64 };

export function createFoot({ scene, world, onEffect }) {
  const G = window;
  const ready = !!(G.createExpeditionController && G.createParkour && G.createPlayerMovement && G.playerBodyProfile);
  // This yard has no pyramid: movement is only held inside the map's edge.
  G.createExpeditionConstraints = ({ layout }) => (next) => { const [a, b, c, d] = layout.bounds; next.x = Math.max(a, Math.min(b, next.x)); next.z = Math.max(c, Math.min(d, next.z)); return next; };
  const walls = world.solids.filter(b => !b.roof && b.bottom < .5).map(b => [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2, b.maxX - b.minX, b.maxZ - b.minZ, b.top]);
  const surfaces = world.solids.filter(b => b.surface !== false || b.bottom < .5).map(b => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, top: b.top, bottom: b.bottom }));
  // The roof's terraces are walkable too; pipes, ropes and bars come from the site (parkour.js reads this global).
  for (const [x0, x1, z0, z1, top, bottom] of world.roofSteps || []) surfaces.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top, bottom });
  G.parkourGrips = { grips: (world.grips || []).map((g, id) => ({ ...g, id })), boxes: [] };   // parkour.js looks grips up by id
  let controller = null;
  if (ready) try {
    controller = G.createExpeditionController({ T: THREE, world: { walls, surfaces }, layout: { spawn: [world.spawn.x, world.spawn.z], bounds: world.bounds || [-150, 150, -340, 160] }, character: { height: 176, shoulders: 1 },
      worldRevision: 'cowninja-yard-1', momentumEnabled: true, effect: e => onEffect?.(e) });
  } catch (error) { console.warn('[cowninja] on-foot movement unavailable:', error); }
  const ninja = createNinja(), holder = ninja?.person.root || new THREE.Group(); holder.visible = false; scene.add(holder);
  const state = { active: false, x: 0, y: 0, z: 0, yaw: 0, speed: 0, charging: false, skid: 0, airborne: false, crouched: false, movement: 'ground', onFoot: true, noise: 0, hidden: false, forward: new THREE.Vector3(0, 0, 1), velocity: new THREE.Vector3() };
  let bodyYaw = null, turning = false, handRise = 0, handsOn = false, tick = 0, lastJump = false, lastCrouch = false, freeAt = 0, topTicks = 0, leap = null;
  const probe = new THREE.Vector3(), lookPoint = new THREE.Vector3();

  function enter(x, z, yaw) {
    if (!controller) return false;
    controller.reset({ x, z, y: 0, yaw, nextTick: controller.tick }); bodyYaw = yaw; state.active = true; holder.visible = true; read(); return true;
  }
  function leave() { state.active = false; holder.visible = false; }
  function read() {
    const p = controller.readPose(), v = controller.velocity;
    state.x = p.x; state.y = p.y; state.z = p.z; state.yaw = p.yaw; state.movement = p.movement; state.speed = Math.hypot(v.x, v.z);
    state.airborne = controller.motion.inspect().airborne; state.crouched = controller.movement.crouchAmount > .4 || p.movement === 'crouch';
    state.forward.set(Math.sin(p.yaw), 0, Math.cos(p.yaw)); state.velocity.set(v.x, p.vy || 0, v.z);
    // How far you can be heard, 0..1: nothing standing still or creeping, everything at a sprint or a landing.
    // In a hay pile and not sprinting: out of sight entirely.
    state.hidden = !!world.inHay?.(p.x, p.z) && state.speed < 4.2 && p.y < 2;
    state.noise = state.hidden ? 0 : state.speed < .3 ? 0 : state.crouched ? .12 : p.movement === 'slide' ? .5 : state.speed > 4.6 ? .85 : .38;
  }
  // One 60 Hz tick. keys: Set of 'w','a','s','d','shift','space','crouch'; yaw/pitch: where the camera looks.
  function step(keys, yaw, pitch = 0) {
    if (!controller || !state.active) return;
    let held = 0; for (const k in BIT) if (keys.has(k)) held |= BIT[k];
    const jump = keys.has('space'), crouch = keys.has('crouch'); let edges = (jump && !lastJump ? 1 : 0) | (crouch && !lastCrouch ? 2 : 0); lastJump = jump; lastCrouch = crouch;
    // Freerun: with sprint held you do not press jump for what is in your way. Running at something solid at knee
    // height jumps (parkour.js then vaults, scrambles or grabs it), and running off an edge with a drop leaps.
    if (keys.has('shift') && keys.has('w') && !state.airborne && state.movement === 'ground' && tick > freeAt && state.speed > 2.2) {
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      let go = world.solidAt(state.x + fx * .95, state.y + .55, state.z + fz * .95, 0) && !world.solidAt(state.x, state.y + .55, state.z, 0);
      if (!go && state.speed > 4.4) { try { const floor = controller.parkour.supportAt(state.x + fx * 1.25, state.z + fz * 1.25, state.y + .45, .26); go = state.y - floor > 1.1; } catch { /* older parkour.js */ } }
      if (go) { edges |= 1; freeAt = tick + 26; held |= BIT.space; }
    }
    if (leap && leap !== 'none') held &= ~(BIT.w | BIT.s | BIT.a | BIT.d | BIT.shift);   // committed to the leap: the fall is steered, not run
    let wrapped = yaw % (Math.PI * 2); if (wrapped > Math.PI) wrapped -= Math.PI * 2; if (wrapped < -Math.PI) wrapped += Math.PI * 2;
    try { controller.step({ heldMask: held, edges, yaw: wrapped, pitch: Math.max(-1.3, Math.min(1.3, pitch)) }); } catch (error) { if (!step.warned) { step.warned = true; console.warn('[cowninja] movement step', error); } }
    tick++; read();
    // Top of a pipe with W held: step off onto whatever is there (the roof, the office roof) instead of hanging.
    if (state.movement === 'pipe' && keys.has('w')) {
      const g = (world.grips || []).find(g => g.type === 'pipe' && Math.hypot(g.x - state.x, g.z - state.z) < .9);
      if (g && state.y > g.y1 - 1.25) { if (++topTicks > 14) { const x = g.x - g.n[0] * 1.25, z = g.z - g.n[1] * 1.25; let y = state.y;
        try { y = controller.parkour.supportAt(x, z, state.y + 1.2, .26); } catch { /* keep */ }
        if (y > state.y - 1.6) { controller.reset({ x, y, z, yaw: wrapped, nextTick: controller.tick }); read(); onEffect?.({ kind: 'footstep:land', args: ['stone', .4] }); } topTicks = 0; } } else topTicks = 0;
    } else topTicks = 0;
    // Leap of faith: in the air and falling with a hay pile ahead and below, the fall is steered into it.
    if (state.airborne && state.velocity.y < -1 && state.y > 2.2) {
      if (!leap) { const fx = Math.sin(wrapped), fz = Math.cos(wrapped); let best = null, bd = 13;
        for (const h of world.hay || []) { const dx = h[0] - state.x, dz = h[1] - state.z, d = Math.hypot(dx, dz); if (d < bd && (d < 5 || (dx * fx + dz * fz) / d > .55)) { bd = d; best = h; } }
        leap = best || 'none'; }
      if (leap !== 'none') { const dx = leap[0] - state.x, dz = leap[1] - state.z, d = Math.hypot(dx, dz) || 1, v = Math.min(8.5, d * 2.4); controller.velocity.x = dx / d * v; controller.velocity.z = dz / d * v; }
    } else if (!state.airborne) { if (leap && leap !== 'none' && world.inHay?.(state.x, state.z)) onEffect?.({ kind: 'leap-of-faith' }); leap = null; }
    pose(1 / 60);
  }
  // The body follows the way he is moving (not the camera), and takes its traversal poses from the movement state.
  function pose(dt) {
    if (!ninja) return; ninja.dress();
    const person = ninja.person, motion = person.motion, M = G.GardenCharacterMotion, m = controller.movement, v = controller.velocity, moving = Math.hypot(v.x, v.z);
    const want = moving > .4 ? Math.atan2(v.x, v.z) : bodyYaw ?? state.yaw;
    if (M?.turnBody) ({ yaw: bodyYaw, turning } = M.turnBody(bodyYaw, turning, want, moving, dt)); else bodyYaw = want;
    person.root.position.set(state.x, state.y, state.z); person.root.rotation.y = bodyYaw;
    const dive = m.dive ? Math.min(1, m.dive.t * 4) : m.proneT > 0 ? Math.min(1, m.proneT / .4) : 0, slide = m.slide?.kind === 'slide' && !m.slide.belly ? 1 - m.slide.t / m.slide.dur : 0;
    const drop = m.crouchAmount * .55 + (m.dive ? Math.min(1, m.dive.t * 5) * .55 : 0) + (m.proneT > 0 ? Math.min(1, m.proneT / .25) * .75 : 0);
    try {
      motion.airborne(state.airborne); motion.crouch(Math.min(drop, .55) / .55); motion.guard?.(0);
      if (M?.traverseBody) ({ handRise, handsOn } = M.traverseBody(THREE, person, { hands: controller.parkour.hands(), handRise, handsOn, pose: { traversal: m.traversal(), dive, slide }, dt, probe }));
      lookPoint.set(state.x + Math.sin(bodyYaw) * 5, state.y + 1.6, state.z + Math.cos(bodyYaw) * 5); motion.lookAt?.(lookPoint);
      motion.update(dt, { velocity: v, wade: 0 });
    } catch (error) { if (!pose.warned) { pose.warned = true; console.warn('[cowninja] pose', error); } }
  }
  const play = (clip, options) => ninja?.person.motion.play?.(clip, options);
  return { state, enter, leave, step, play, available: !!controller, controller, ninja, holder };
}
