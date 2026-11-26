// Farmers. They are the main game's people (the same Rocketbox characters, walk cycles and Jolt ragdoll as Eden's
// visitors and Open Match bots). They patrol; when they see or hear the cow they come for it with a pitchfork. Hit one
// at a charge and his skeleton becomes a physics ragdoll that carries the cow's velocity; reach him slowly and he
// stabs you instead.
import * as THREE from 'three/webgpu';
import { createRagdoll } from '/ragdoll-jolt.js';
import { animationPath, clearAnimationPath } from '/cowninja/animation-path.js';
import { TUNE } from '/cowninja/config.js';

const SEE = 24, SEE_COS = Math.cos(1.05), HEAR = 13, RAM_SPEED = 5.5;
const LOOKS = ['harbor', 'boulevard', 'coast', 'midnight', 'boulevard', 'harbor'];

export function createFarmers({ scene, physics, world, cow, blood, onEvent, target = null }) {
  const cube = new THREE.BoxGeometry(1, 1, 1), C = window.GardenCharacter;
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: .4, metalness: .8 }), shaftWood = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: .8 });
  const farmers = [], up = new THREE.Vector3(0, 1, 0), still = new THREE.Vector3();

  // Roles (config.js deals them to the patrols): 'guard' has the fork; 'worker' is unarmed, runs to report what he
  // saw and then keeps out of the way; 'gunner' is a guard with a pistol; 'police' and 'heavy' arrive later (police.js)
  // with a pistol and with a launcher that lobs explosives.
  const S = TUNE.staff, dark = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: .5, metalness: .6 }), out = { x: 0, z: 0 };
  let nav = null, chase = null, chaseAt = -9; const reports = new Map();
  const fieldTo = (x, z) => { if (!nav) return null; const k = x + ',' + z; let f = reports.get(k); if (!f || f.version !== nav.version) reports.set(k, f = nav.field(x, z)); return f; };
  function make(route, i, role = S.roles[i % S.roles.length] || 'guard') {
    const group = new THREE.Group(), turn = new THREE.Group(); turn.rotation.y = Math.PI; group.add(turn);
    const look = { version: 1, character: LOOKS[i % LOOKS.length], height: 172 + (i * 7 % 16), weight: 82, build: .5, shoulders: 1, waist: 1, hips: 1, legLength: 1 };
    let person = null;
    try { person = C?.create(THREE, look); } catch (error) { console.warn('[cowninja] farmer', error); }
    if (person) { person.root.castShadow = true; turn.add(person.root); }
    const fork = new THREE.Group(); fork.position.set(.3, 1.05, -.2); group.add(fork);
    if (role === 'guard') {
      const shaft = new THREE.Mesh(cube, shaftWood); shaft.scale.set(.04, .04, 1.5); shaft.position.z = -.35; shaft.castShadow = true; fork.add(shaft);
      for (const x of [-.07, 0, .07]) { const t = new THREE.Mesh(cube, steel); t.scale.set(.02, .02, .3); t.position.set(x, 0, -1.2); fork.add(t); }
    } else if (role !== 'worker') {   // a pistol, or the heavy unit's launcher; police carry a torch that marks them out in the dark
      const heavy = role === 'heavy', gun = new THREE.Mesh(cube, dark); gun.scale.set(heavy ? .13 : .05, heavy ? .13 : .09, heavy ? .95 : .26); gun.position.z = heavy ? -.35 : -.42; gun.castShadow = true; fork.add(gun);
      if (role !== 'gunner') { const lamp = new THREE.Mesh(cube, new THREE.MeshBasicMaterial({ color: heavy ? 0xff8a20 : 0x7fb0ff })); lamp.scale.set(.07, .07, .07); lamp.position.set(0, .12, heavy ? -.8 : -.5); fork.add(lamp); }
    }
    scene.add(group);
    const f = { group, person, fork, route, at: 0, p: { x: route[0][0], z: route[0][1] }, yaw: 0, state: 'patrol', alert: 0, strike: 0, ragdoll: null, down: 0, seenAt: 0, shadowed: null, role, aim: 0, cool: 0 };
    group.position.set(f.p.x, 0, f.p.z); farmers.push(f); return f;
  }
  world.patrols.forEach((route, i) => make(route, i));
  // Someone arriving mid-mission (police.js): he walks to his post and holds it until he has a reason not to.
  function spawn(role, x, z, post = [x, z]) { const f = make([[x, z]], farmers.length, role); f.route = [post]; f.yaw = Math.PI; return f; }

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
    // Police and heavy units share a radio: if any of them has you in sight, the rest of them know where to go.
    const radio = farmers.some(o => !o.ragdoll && o.state === 'chase' && (o.role === 'police' || o.role === 'heavy') && time - o.seenAt < 2.5);
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
      // A body on the ground, seen: whoever finds it knows something is wrong (a quiet takedown is only quiet until then).
      if (live && f.state === 'patrol') for (const b of farmers) if (b.ragdoll && !b.found && b.ragdoll.pelvis) { const t = b.ragdoll.pelvis(), bx = t.x - f.p.x, bz = t.z - f.p.z, bd = Math.hypot(bx, bz);
        if (bd < S.bodySight && (Math.sin(f.yaw) * bx - Math.cos(f.yaw) * bz) / (bd || 1) > SEE_COS && !world.sightBlocked?.(f.p.x, f.p.z, t.x, t.z)) { b.found = true; f.alert = Math.max(f.alert, .9); f.seenAt = time; onEvent?.({ type: 'body-found', farmer: f, body: b }); } }
      if (radio && live && f.state === 'patrol' && (f.role === 'police' || f.role === 'heavy') && dist < 70) { f.alert = 1; f.seenAt = time; }
      if (f.state === 'patrol' && f.alert >= 1) {
        if (f.role === 'worker') { f.state = 'flee'; f.report = S.reportPoints.reduce((a, r) => Math.hypot(r[0] - f.p.x, r[1] - f.p.z) < Math.hypot(a[0] - f.p.x, a[1] - f.p.z) ? r : a, S.reportPoints[0]); f.fleeFor = 0; }
        else f.state = 'chase';
        onEvent?.({ type: 'spotted', farmer: f });
      }
      if (f.state === 'chase' && f.alert <= 0) f.state = 'patrol';
      // Move: along the route, or straight at the cow.
      let tx, tz, pace, step = null;
      const ranged = f.role === 'gunner' || f.role === 'police' || f.role === 'heavy', W = f.role === 'heavy' ? S.heavy : S.pistol;
      if (f.state === 'flee') {   // a worker running to report: stop him before he gets there and nobody hears of it
        tx = f.report[0]; tz = f.report[1]; pace = S.fleeSpeed; step = fieldTo(tx, tz)?.dir(f.p.x, f.p.z, out); f.fleeFor += dt;
        if (Math.hypot(tx - f.p.x, tz - f.p.z) < 2 || f.fleeFor > 25) { f.state = 'cower'; f.alert = .2; onEvent?.({ type: 'reported', farmer: f }); }
      }
      else if (f.state === 'cower') { tx = f.p.x; tz = f.p.z; pace = 0; f.alert = Math.min(f.alert, .2); }
      else if (f.state === 'chase') { tx = c.x; tz = c.z; pace = ranged && sees && dist < W.standoff ? 0 : 3.7;
        // Round the walls rather than into them, when there is no straight line to you.
        if (pace && nav && dist > 3 && world.sightBlocked?.(f.p.x, f.p.z, c.x, c.z)) { if (!chase || time - chaseAt > .5 || chase.version !== nav.version) { chase = nav.field(c.x, c.z); chaseAt = time; } step = chase.dir(f.p.x, f.p.z, out); } }
      else { f.at %= f.route.length; const w = f.route[f.at]; tx = w[0]; tz = w[1]; pace = f.alert > .3 ? 0 : 1.25; if (Math.hypot(tx - f.p.x, tz - f.p.z) < .5) f.at = (f.at + 1) % f.route.length; }
      const routed = step && (step.x || step.z), mx = routed ? step.x : tx - f.p.x, mz = routed ? step.z : tz - f.p.z, md = Math.hypot(mx, mz) || 1;
      if (f.state === 'patrol' && f.route.length === 1 && md < .6) pace = 0;   // holding a post
      const want = f.state === 'flee' ? Math.atan2(mx, -mz) : f.state === 'chase' || f.alert > .3 ? Math.atan2(dx, -dz) : Math.atan2(mx, -mz);
      let turn = want - f.yaw; turn = Math.atan2(Math.sin(turn), Math.cos(turn)); f.yaw += turn * Math.min(1, dt * 6);
      let moving = false;
      if (pace && (f.state !== 'chase' || dist > 1.5)) moving = world.walk(f.p, mx / md * pace * dt, mz / md * pace * dt, .35);
      // Contact with the cow: rammed at speed, or close enough to stab.
      const along = dx * c.forward.x + dz * c.forward.z, side = Math.abs(dx * c.forward.z - dz * c.forward.x), closing = Math.hypot(c.velocity.x, c.velocity.z);
      if (live && !foot && dist < 1.9 && -along < 1.75 && -along > -1.2 && side < .8 && closing > RAM_SPEED) { knock(f, c.velocity.x, c.velocity.z); continue; }
      f.strike = Math.max(0, f.strike - dt);
      // His attack is telegraphed: the fork draws back for 0.45 s (a glint), then drives home if you are still in reach.
      // That beat is what a guard raised in time parries.
      // Guns and launchers: he stops, takes aim for a beat (a glint), and fires. Moving fast, keeping low and being far
      // away all spoil the shot. A launcher lobs at where you will be; the blast has its own warning.
      if (ranged && live && f.state === 'chase') {
        if (f.cool > 0) { f.cool -= dt; f.aim = 0; }
        else if (dist > W.min && dist < W.range && (sees || (f.role === 'heavy' && f.alert >= 1))) {
          if (!f.aim) onEvent?.({ type: 'aiming', farmer: f }); f.aim += dt;
          if (f.aim >= W.aim) { f.aim = 0; f.cool = W.cooldown;
            if (f.role === 'heavy') onEvent?.({ type: 'lob', farmer: f, x: c.x + c.velocity.x * W.lead, z: c.z + c.velocity.z * W.lead });
            else { const chance = Math.max(.06, Math.min(.95, W.accuracy - Math.hypot(c.velocity.x, c.velocity.z) * W.dodge - dist / W.range * .35)) * (c.crouched ? .7 : 1);
              onEvent?.({ type: 'shot', farmer: f, hit: Math.random() < chance, dx: dx / (dist || 1), dz: dz / (dist || 1) }); } }
        } else f.aim = 0;
      }
      if (f.role !== 'guard') { /* only guards use the fork */ }
      else if (f.windup > 0) { f.windup -= dt; if (f.windup <= 0 && live && dist < 2.3) onEvent?.({ type: 'stabbed', farmer: f, dx: dx / (dist || 1), dz: dz / (dist || 1) }); }
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
  return { farmers, update, spawn, setNav(n) { nav = n; }, knock, hurt, stun, beginTakedown, poseTakedown, cancelTakedown, finishTakedown, nearest, noise, alertLevel, standing: () => farmers.filter(f => !f.ragdoll), out: () => farmers.filter(f => f.ragdoll).length, alerted: () => farmers.some(f => f.state === 'chase') };
}
