// Farmers. They are the main game's people (the same Rocketbox characters, walk cycles and Jolt ragdoll as Eden's
// visitors and Open Match bots). They patrol; when they see or hear the cow they come for it with a pitchfork. Hit one
// at a charge and his skeleton becomes a physics ragdoll that carries the cow's velocity; reach him slowly and he
// stabs you instead.
import * as THREE from 'three/webgpu';
import { createRagdoll } from '/ragdoll-jolt.js';
import { animationPath, clearAnimationPath } from '/cowninja/animation-path.js';

const SEE = 24, SEE_COS = Math.cos(1.05), HEAR = 13, RAM_SPEED = 5.5;
const LOOKS = ['harbor', 'boulevard', 'coast', 'midnight', 'boulevard', 'harbor'];

export function createFarmers({ scene, physics, world, cow, blood, onEvent, target = null }) {
  const cube = new THREE.BoxGeometry(1, 1, 1), C = window.GardenCharacter;
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: .4, metalness: .8 }), shaftWood = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: .8 });
  const farmers = [], up = new THREE.Vector3(0, 1, 0), still = new THREE.Vector3();

  function make(route, i) {
    const group = new THREE.Group(), turn = new THREE.Group(); turn.rotation.y = Math.PI; group.add(turn);
    const look = { version: 1, character: LOOKS[i % LOOKS.length], height: 172 + (i * 7 % 16), weight: 82, build: .5, shoulders: 1, waist: 1, hips: 1, legLength: 1 };
    let person = null;
    try { person = C?.create(THREE, look); } catch (error) { console.warn('[cowninja] farmer', error); }
    if (person) { person.root.castShadow = true; turn.add(person.root); }
    const fork = new THREE.Group(); fork.position.set(.3, 1.05, -.2); group.add(fork);
    const shaft = new THREE.Mesh(cube, shaftWood); shaft.scale.set(.04, .04, 1.5); shaft.position.z = -.35; shaft.castShadow = true; fork.add(shaft);
    for (const x of [-.07, 0, .07]) { const t = new THREE.Mesh(cube, steel); t.scale.set(.02, .02, .3); t.position.set(x, 0, -1.2); fork.add(t); }
    scene.add(group);
    const f = { group, person, fork, route, at: 0, p: { x: route[0][0], z: route[0][1] }, yaw: 0, state: 'patrol', alert: 0, strike: 0, ragdoll: null, down: 0, seenAt: 0, shadowed: null };
    group.position.set(f.p.x, 0, f.p.z); farmers.push(f); return f;
  }
  world.patrols.forEach(make);

  // Knock a farmer out: his own skeleton goes to the physics engine, thrown with the hitter's velocity plus lift.
  function knock(f, vx, vz, by = 'cow', { settled = false } = {}) {
    if (f.ragdoll) return;
    const speed = Math.hypot(vx, vz), lift = settled ? 0 : 2.5 + speed * .28;
    f.state = 'out'; f.down = 0; f.fork.visible = false; f.ragdoll = true;
    if (f.person?.skeleton) {
      try {
        f.person.motion.update(settled ? 0 : 1 / 60, { velocity: still });
        const rig = createRagdoll(physics.world, THREE, f.person);
        rig.start({ velocity: { x: vx * 1.1, y: lift, z: vz * 1.1 }, impulse: settled ? () => new THREE.Vector3() : y => new THREE.Vector3((Math.random() - .5) * 2.5, y * (1.2 + Math.random()), (Math.random() - .5) * 2.5) });
        f.ragdoll = rig; f.person.root.traverse(o => { if (o.isSkinnedMesh) o.frustumCulled = false; });
      } catch (error) { console.warn('[cowninja] ragdoll', error); f.person.motion.knockdown?.(new THREE.Vector3(vx, 0, vz), 2.2, { stay: true }); }
    } else f.person?.motion.knockdown?.(new THREE.Vector3(vx, 0, vz), 2.2, { stay: true });
    f.takedown = null;
    blood?.burst(f.p.x, settled ? .3 : 1.2, f.p.z, vx, vz, settled ? 5 : 14 + Math.min(18, speed));
    onEvent?.({ type: 'knockout', by, speed, farmer: f });
  }

  function beginTakedown(f, { sourceStart = 0, sourceEnd = window.GardenAnim?.duration('stealthVictim') } = {}) {
    if (f.ragdoll || f.takedown || !f.person || !window.GardenAnim?.has('stealthVictim')) return false;
    if (![sourceStart, sourceEnd].every(Number.isFinite) || sourceStart < 0 || sourceEnd <= sourceStart || sourceEnd > window.GardenAnim.duration('stealthVictim')) return false;
    const path = animationPath(window.GardenAnim, 'stealthVictim', f.person, { x: f.p.x, z: f.p.z, yaw: Math.PI - f.yaw, start: sourceStart, end: sourceEnd });
    if (!clearAnimationPath(world, path, 0)) return false;
    const motion = f.person.motion, previous = { state: f.state, alert: f.alert, strike: f.strike };
    motion.stop?.(null, .14); motion.airborne?.(false); motion.crouch?.(0); motion.guard?.(0);
    motion.touch?.('L', null, null, 0); motion.touch?.('R', null, null, 0);
    const layer = motion.play?.('stealthVictim', { fade: .18, speed: 0, start: sourceStart, mask: 'full', arms: true, weight: 1, hold: true });
    if (!layer) return false;
    f.takedown = { previous, layer, path }; f.state = 'takedown'; f.alert = 0; f.strike = 0; f.fork.visible = false; return true;
  }
  function poseTakedown(f, progress) {
    if (!f.takedown || f.ragdoll) return;
    const point = f.takedown.path.sample(progress);
    f.takedown.layer.t = point.time; f.p.x = point.x; f.p.z = point.z; f.group.position.set(point.x, 0, point.z);
  }
  function cancelTakedown(f) {
    if (!f.takedown || f.ragdoll) return;
    const { previous } = f.takedown; f.takedown = null; Object.assign(f, previous); f.fork.visible = true; f.person.motion.stop?.('stealthVictim', .18);
  }
  function finishTakedown(f) {
    if (!f.takedown || f.ragdoll) return;
    poseTakedown(f, 1); knock(f, 0, 0, 'takedown', { settled: true });
  }

  function update(dt, time, live) {
    const c = target ? target() : cow.state, foot = !!c.onFoot;
    for (const f of farmers) {
      if (f.ragdoll) {
        f.down += dt;
        if (f.ragdoll.apply) {
          f.ragdoll.apply();
          // He bleeds where he slides and lies: a trail while moving, a pool once he stops.
          if (blood && f.down < 14) { const t = f.ragdoll.pelvis(), v = f.ragdoll.velocity(), moving = Math.hypot(v.x, v.z);
            if (t.y < .5 && (f.down - (f.bledAt || 0)) > (moving > 1 ? .09 : .9)) { f.bledAt = f.down; blood.splat(t.x, t.z, moving > 1 ? .35 + Math.random() * .3 : .5 + Math.min(1.2, f.down * .12)); } }
        } else f.person?.motion.update(dt);
        continue;
      }
      // The attacker supplies the normalized clock. No patrol, perception or attack can move the paired victim.
      if (f.takedown) { f.person.motion.update(dt, { velocity: still }); continue; }
      // Reeling from a punch (or thrown off by a parry): no moving, no attacking, until it passes.
      if (f.stun > 0) { f.stun -= dt; f.windup = 0; f.group.position.set(f.p.x, 0, f.p.z); f.group.rotation.y = -f.yaw; f.person?.motion.update(dt); continue; }
      const dx = c.x - f.p.x, dz = c.z - f.p.z, dist = Math.hypot(dx, dz);
      // Perception: in front and in range, or close and loud (a charge, a skid).
      const facing = (Math.sin(f.yaw) * dx - Math.cos(f.yaw) * dz) / (dist || 1);
      // On foot the ninja is a small dark shape: seen from less far (less still when crouched), heard only by how he moves.
      const range = foot ? SEE * (c.crouched ? .5 : .8) : SEE;
      const sees = live && !c.hidden && dist < range && facing > SEE_COS && !(foot && world.sightBlocked?.(f.p.x, f.p.z, c.x, c.z));
      const hears = live && !c.hidden && (foot ? dist < HEAR * 1.25 * (c.noise || 0) : dist < HEAR * (c.charging || c.skid > .4 ? 1.6 : Math.abs(c.speed) > 6 ? 1 : .45));
      if (sees || hears) { f.alert = Math.min(1, f.alert + dt * (sees ? (foot ? (c.crouched ? .55 : 1) * (1.7 - dist / range) : 1.8) : .9)); f.seenAt = time; } else if (time - f.seenAt > (c.hidden ? 1.5 : 4)) f.alert = Math.max(0, f.alert - dt * (c.hidden ? .6 : .3));
      if (f.state === 'patrol' && f.alert >= 1) { f.state = 'chase'; onEvent?.({ type: 'spotted', farmer: f }); }
      if (f.state === 'chase' && f.alert <= 0) f.state = 'patrol';
      // Move: along the route, or straight at the cow.
      let tx, tz, pace;
      if (f.state === 'chase') { tx = c.x; tz = c.z; pace = 3.7; }
      else { f.at %= f.route.length; const w = f.route[f.at]; tx = w[0]; tz = w[1]; pace = f.alert > .3 ? 0 : 1.25; if (Math.hypot(tx - f.p.x, tz - f.p.z) < .5) f.at = (f.at + 1) % f.route.length; }
      const mx = tx - f.p.x, mz = tz - f.p.z, md = Math.hypot(mx, mz) || 1;
      const want = f.state === 'chase' || f.alert > .3 ? Math.atan2(dx, -dz) : Math.atan2(mx, -mz);
      let turn = want - f.yaw; turn = Math.atan2(Math.sin(turn), Math.cos(turn)); f.yaw += turn * Math.min(1, dt * 6);
      let moving = false;
      if (pace && (f.state !== 'chase' || dist > 1.5)) moving = world.walk(f.p, mx / md * pace * dt, mz / md * pace * dt, .35);
      // Contact with the cow: rammed at speed, or close enough to stab.
      const along = dx * c.forward.x + dz * c.forward.z, side = Math.abs(dx * c.forward.z - dz * c.forward.x), closing = Math.hypot(c.velocity.x, c.velocity.z);
      if (live && !foot && dist < 1.9 && -along < 1.75 && -along > -1.2 && side < .8 && closing > RAM_SPEED) { knock(f, c.velocity.x, c.velocity.z); continue; }
      f.strike = Math.max(0, f.strike - dt);
      // His attack is telegraphed: the fork draws back for 0.45 s (a glint), then drives home if you are still in reach.
      // That beat is what a guard raised in time parries.
      if (f.windup > 0) { f.windup -= dt; if (f.windup <= 0 && live && dist < 2.3) onEvent?.({ type: 'stabbed', farmer: f, dx: dx / (dist || 1), dz: dz / (dist || 1) }); }
      else if (live && f.state === 'chase' && dist < 1.9 && f.strike <= 0) { f.strike = 1.5; f.windup = .45; onEvent?.({ type: 'windup', farmer: f }); }
      // Pose: the character animates itself from how fast its root is moving; the fork comes up in a chase.
      if (live && f.state === 'chase' && dist < 1.9 && f.strike > 1.25) f.person?.motion.play?.('swingA', { fade: .06, speed: 1.5, mask: 'upper' });
      f.group.position.set(f.p.x, 0, f.p.z); f.group.rotation.y = -f.yaw;
      if (f.person) { if (f.shadowed !== f.person.skeleton && f.person.skeleton) { f.shadowed = f.person.skeleton; f.person.root.traverse(o => { if (o.isSkinnedMesh) o.castShadow = true; }); } f.person.motion.update(dt); }
      f.fork.rotation.x = f.state === 'chase' ? -.1 : .9; f.fork.position.z = -.2 - (f.strike > 1 ? (f.strike - 1) * 2.2 : 0);
    }
  }
  // A blow from the fists (fight.js). Health 40: a few jabs, or a combo and a haymaker. Returns {ko}.
  const blowDir = new THREE.Vector3();
  function hurt(f, damage, dx, dz, { tier = 'light', finisher = false, force = 2 } = {}) {
    if (f.ragdoll || f.takedown) return { ko: false };
    f.hp = (f.hp ?? 40) - damage;
    if (f.state !== 'chase') { f.state = 'chase'; f.alert = 1; f.seenAt = performance.now() / 1000; }
    if (f.hp <= 0 || finisher) { knock(f, dx * (finisher ? 6.5 : 3.2), dz * (finisher ? 6.5 : 3.2), 'fists'); return { ko: true }; }
    f.stun = tier === 'heavy' ? .8 : .38; f.windup = 0; f.strike = Math.max(f.strike, .6);
    world.walk(f.p, dx * (tier === 'heavy' ? .7 : .25), dz * (tier === 'heavy' ? .7 : .25), .35);
    try { f.person?.motion.hit?.(blowDir.set(dx, 0, dz), tier === 'heavy' ? 1.5 : .9, { fall: false }); } catch { /* pose only */ }
    blood?.burst(f.p.x, 1.5, f.p.z, dx * 2, dz * 2, tier === 'heavy' ? 5 : 2);
    return { ko: false };
  }
  const stun = (f, seconds) => { if (f && !f.ragdoll) { f.stun = Math.max(f.stun || 0, seconds); f.windup = 0; try { f.person?.motion.hit?.(blowDir.set(-Math.sin(f.yaw), 0, Math.cos(f.yaw)), 1.2, { fall: false }); } catch { /* pose only */ } } };
  // The nearest standing farmer within `reach` of a point, and whether that point is behind him (a takedown).
  function nearest(x, z, reach = 1.6) {
    let best = null, bestD = reach;
    for (const f of farmers) { if (f.ragdoll || f.takedown) continue; const d = Math.hypot(f.p.x - x, f.p.z - z); if (d < bestD) { bestD = d; best = f; } }
    if (!best) return null;
    const facing = (Math.sin(best.yaw) * (x - best.p.x) - Math.cos(best.yaw) * (z - best.p.z)) / (bestD || 1);
    return { farmer: best, behind: facing < .25, unaware: best.state !== 'chase' };
  }
  // A sound at a point (the whistle): everyone within `radius` grows suspicious and looks that way.
  function noise(x, z, radius, amount = .5) { for (const f of farmers) if (!f.ragdoll && !f.takedown && Math.hypot(f.p.x - x, f.p.z - z) < radius) { f.alert = Math.min(.95, f.alert + amount); f.seenAt = performance.now() / 1000; } }
  const alertLevel = () => farmers.reduce((m, f) => f.ragdoll ? m : Math.max(m, f.state === 'chase' ? 1 : f.alert), 0);
  return { farmers, update, knock, hurt, stun, beginTakedown, poseTakedown, cancelTakedown, finishTakedown, nearest, noise, alertLevel, standing: () => farmers.filter(f => !f.ragdoll), out: () => farmers.filter(f => f.ragdoll).length, alerted: () => farmers.some(f => f.state === 'chase') };
}
