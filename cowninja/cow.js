// The cow you ride. A heavy rigid body that can only turn about the vertical, driven through its velocity so every
// impact costs it real speed:
//   W / S        gallop / brake (S at speed with a turn held is a skid: the back end swings out)
//   A / D        steer; the faster you go the wider the turn
//   Shift        charge: a higher top speed that builds, head down, and the only way to break things and people
//   Space        hop
// Yaw 0 faces -z; forward is (sin yaw, 0, -cos yaw).
import * as THREE from 'three/webgpu';

const TUNE = {
  mass: 620, half: [.42, .62, 1.05], rest: .66,
  trot: 8.5, charge: 17.5, reverse: 3.2,
  accel: 7.5, chargeAccel: 5.2, brake: 15, drag: .55,
  grip: 9, skidGrip: 1.6, turnSlow: 2.5, turnFast: .95, hop: 6.4,
  chargeBuild: .5, chargeFade: .9,           // per second, the 0..1 charge meter
};

// The cow model: the rigged GLB (assets/cowninja/cow.glb) with a procedural gait written straight onto its bones, so
// one function carries it from a walk to a flat-out gallop at any speed. Falls back to nothing visible if the model
// is missing (the physics still runs).
const STILL = new THREE.Vector3();
const LEGS = [ // name prefix, phase offset at a walk (lateral sequence), at a gallop (transverse), front?
  ['bl', 'L', 0, 0, false], ['fl', 'L', .25, .52, true], ['bl', 'R', .5, .1, false], ['fl', 'R', .75, .62, true],
];
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();

function buildCow(assets, { tint = null } = {}) {
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const model = assets?.skinned('cow'), bones = new Map();
  if (model) {
    body.add(model); model.updateMatrixWorld(true);
    model.traverse(o => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (tint && !/eye/i.test(o.material.name)) { o.material = o.material.clone(); o.material.color.set(tint); } }
      if (o.isBone) {
        // Rotations are given about the cow's own axes (x across, y up, z back); each bone keeps those axes as seen
        // from its parent at rest, which stay right while the chain above it only swings fore and aft.
        const parent = o.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        bones.set(o.name, { bone: o, rest: o.quaternion.clone(), x: X.clone().applyQuaternion(parent), y: Y.clone().applyQuaternion(parent), z: Z.clone().applyQuaternion(parent) });
      }
    });
  }
  // Swing a bone: rx forward/up (+), ry to its left (+), rz roll.
  function pose(name, rx = 0, ry = 0, rz = 0) {
    const b = bones.get(name); if (!b) return;
    qa.setFromAxisAngle(b.x, rx); if (ry) qa.multiply(qb.setFromAxisAngle(b.y, ry)); if (rz) qa.multiply(qb.setFromAxisAngle(b.z, rz));
    b.bone.quaternion.copy(qa).multiply(b.rest);
  }
  return { group, body, model, bones, pose };
}

// Write one frame of gait. run 0..1 (how close to a flat-out charge), gait in cycles, extras optional.
export function animateCow(cow, { gait = 0, run = 0, moving = 1, airborne = false, charge = 0, turn = 0, time = 0, graze = 0 } = {}) {
  const { pose } = cow, swing = (.3 + run * .5) * moving, fold = (.45 + run * .75) * moving, gallop = Math.min(1, Math.max(0, (run - .3) / .35));
  for (const [end, side, walkAt, gallopAt, front] of LEGS) {
    const phase = (gait + walkAt + (gallopAt - walkAt) * gallop) * Math.PI * 2, s = Math.sin(phase), lift = Math.max(0, Math.cos(phase)) * fold;
    if (airborne) {
      if (front) { pose(`fl-shoulder${side}`, .75); pose(`fl-fore${side}`, .35); pose(`fl-cannon${side}`, -1.25); pose(`fl-hoof${side}`, -.3); }
      else { pose(`bl-thigh${side}`, -.7); pose(`bl-gaskin${side}`, -.1); pose(`bl-cannon${side}`, .5); pose(`bl-hoof${side}`, -.4); }
    } else if (front) {
      pose(`fl-shoulder${side}`, s * swing - lift * .15); pose(`fl-fore${side}`, lift * .45); pose(`fl-cannon${side}`, -lift * 1.35); pose(`fl-hoof${side}`, -lift * .5 + Math.max(0, -s) * swing * .5);
    } else {
      pose(`bl-thigh${side}`, s * swing + lift * .3); pose(`bl-gaskin${side}`, -lift * .85); pose(`bl-cannon${side}`, lift * 1.05); pose(`bl-hoof${side}`, -lift * .55 + Math.max(0, -s) * swing * .5);
    }
  }
  const beat = gait * Math.PI * 2;
  // The barrel flexes with the gallop; the head drives down in a charge and nods at a walk; the tail streams.
  pose('chest', Math.sin(beat + .6) * .05 * gallop * moving, turn * .12); pose('pelvis', -Math.sin(beat + .6) * .07 * gallop * moving, -turn * .1);
  pose('neck', -charge * .55 - graze * .9 + Math.sin(beat * (gallop > .5 ? 1 : 2)) * (.05 + run * .06) * moving, turn * .35 + Math.sin(time * .5) * .12 * (1 - moving));
  pose('head', -charge * .25 - graze * .35 + Math.sin(beat * 2 + 1) * .03 * moving, turn * .2);
  pose('tail1', -(.12 + run * .95) + Math.sin(time * 2.3) * .08, Math.sin(time * 3.1 + gait) * (.18 + run * .1)); pose('tail2', -run * .5, Math.sin(time * 3.1 + gait + .8) * .25); pose('tail3', -run * .35, Math.sin(time * 3.1 + gait + 1.6) * .3);
}

// The ninja: one of the main game's people (same rig and animation as every visitor in Eden), dressed in black with
// the red headband. Used seated on the cow (the rider) and on foot (foot.js).
export function createNinja() {
  const C = window.GardenCharacter; if (!C || !window.GardenCharacterRocketbox) return null;
  let person = null;
  try { person = C.create(THREE, { version: 1, character: 'midnight', height: 176, weight: 70, build: .4, shoulders: 1, waist: 1, hips: 1, legLength: 1 }); } catch (error) { console.warn('[cowninja] ninja', error); return null; }
  const cloth = new THREE.Color(0xa0a0aa), band = new THREE.Mesh(new THREE.TorusGeometry(.098, .017, 6, 20), new THREE.MeshStandardMaterial({ color: 0xc4130d, roughness: .55, emissive: 0x3a0503 }));
  let dressed = null;
  function dress() {
    if (dressed === person.skeleton || !person.skeleton) return; dressed = person.skeleton;
    person.root.traverse(o => { if (o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; const dark = m => { const c = m.clone(); c.color.multiply(cloth); return c; }; o.material = Array.isArray(o.material) ? o.material.map(dark) : dark(o.material); } });
    const head = person.byName.head; if (head) { band.rotation.x = Math.PI / 2 - .12; band.position.set(0, .075, .012); head.add(band); }
  }
  return { person, dress };
}
function buildRider(cow) {
  const ninja = createNinja(); if (!ninja) return null;
  const { person, dress } = ninja;
  const seat = new THREE.Group(); seat.position.set(0, .93, .08); seat.rotation.y = Math.PI; seat.add(person.root); cow.body.add(seat);
  let seated = false;
  const sit = () => { if (!seated && person.skeleton) seated = !!person.motion.play?.('sitIdle', { loop: true, fade: 0, mask: 'full' }); return seated; };
  return { person, seat, dress, sit };
}

export function createCow({ scene, physics, spawn, assets }) {
  const model = buildCow(assets), rider = buildRider(model); scene.add(model.group);
  const body = physics.dynamicBox([spawn.x, TUNE.rest + .1, spawn.z], TUNE.half, {
    mass: TUNE.mass, friction: 0, restitution: 0, linearDamping: 0, angularDamping: 0, dofs: physics.DOF.upright,
  });
  let yaw = spawn.yaw, charge = 0, speed = 0, lateral = 0, skid = 0, airborne = false, gait = 0, clock = 0, lean = 0, pitch = 0, bump = 0, lastVy = 0;
  const state = { x: spawn.x, y: 0, z: spawn.z, yaw, speed: 0, charge: 0, charging: false, skid: 0, airborne: false, forward: new THREE.Vector3(), velocity: new THREE.Vector3() };

  // One physics tick of control. keys: Set of 'w','a','s','d','shift','space'.
  function control(dt, keys, frozen = false) {
    const v = body.velocity(), fx = Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = Math.sin(yaw);
    speed = v[0] * fx + v[2] * fz; lateral = v[0] * rx + v[2] * rz;
    const t = body.read(); airborne = t.p[1] > TUNE.rest + .09 || Math.abs(v[1]) > 1.2;
    const gas = frozen ? 0 : (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0), steer = frozen ? 0 : (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    const wantCharge = !frozen && keys.has('shift') && gas > 0 && speed > 3;
    charge = Math.max(0, Math.min(1, charge + (wantCharge ? TUNE.chargeBuild : -TUNE.chargeFade) * dt));
    // Throttle: top speed rises with the charge meter; braking is strong; nothing changes in the air.
    const top = TUNE.trot + (TUNE.charge - TUNE.trot) * charge;
    if (!airborne) {
      if (gas > 0) { if (speed < top) speed = Math.min(top, speed + (speed < 0 ? TUNE.brake : wantCharge ? TUNE.chargeAccel : TUNE.accel) * dt); }
      else if (gas < 0) speed = speed > .4 ? Math.max(0, speed - TUNE.brake * dt) : Math.max(-TUNE.reverse, speed - TUNE.accel * .6 * dt);
      else speed -= speed * Math.min(1, TUNE.drag * dt);
      if (speed > top) speed = Math.max(top, speed - TUNE.brake * .35 * dt);
      // Skid: braking while turning at speed lets the back end go; otherwise the hooves bite.
      const skidding = gas < 0 && steer !== 0 && Math.abs(speed) > 5;
      skid += ((skidding ? 1 : 0) - skid) * Math.min(1, dt * (skidding ? 9 : 3));
      const grip = TUNE.grip + (TUNE.skidGrip - TUNE.grip) * skid;
      lateral *= Math.exp(-grip * dt);
      // Steering: tight at a walk, wide at a charge; reversing flips it; a skid over-rotates.
      const fast = Math.min(1, Math.abs(speed) / TUNE.charge), rate = (TUNE.turnSlow + (TUNE.turnFast - TUNE.turnSlow) * fast) * (1 + skid * 1.1);
      yaw += steer * rate * dt * Math.min(1, Math.abs(speed) / 1.5 + .25) * (speed < -.2 ? -1 : 1);
      if (!frozen && keys.has('space')) { v[1] = TUNE.hop; airborne = true; keys.delete('space'); }
    }
    const nfx = Math.sin(yaw), nfz = -Math.cos(yaw), nrx = Math.cos(yaw), nrz = Math.sin(yaw);
    body.setVelocity(nfx * speed + nrx * lateral, v[1], nfz * speed + nrz * lateral);
    body.setSpin(0, 0, 0);
    bump = Math.max(bump, Math.max(0, lastVy - v[1] - 3) * .05); lastVy = v[1];
  }

  // Sync the model, animate the gallop, and publish state for the camera, AI and HUD.
  function update(dt) {
    const t = body.read(), v = body.velocity();
    state.x = t.p[0]; state.y = t.p[1] - TUNE.rest; state.z = t.p[2]; state.yaw = yaw; state.speed = speed; state.charge = charge;
    state.charging = charge > .35 && speed > TUNE.trot * .9; state.skid = skid; state.airborne = airborne; state.gait = gait; state.mounted = !rider || rider.seat.visible;
    state.forward.set(Math.sin(yaw), 0, -Math.cos(yaw)); state.velocity.set(v[0], v[1], v[2]);
    model.group.position.set(t.p[0], t.p[1] - TUNE.rest, t.p[2]); model.group.rotation.y = -yaw;
    const run = Math.min(1, Math.abs(speed) / TUNE.charge), moving = Math.min(1, Math.abs(speed) / 1.2);
    gait += dt * (.5 + Math.abs(speed) * .19) * moving; clock += dt;
    bump = Math.max(0, bump - dt * 2.5);
    // The barrel rises twice a stride at a walk and once at a gallop, rocks, and leans into turns.
    model.body.position.y = airborne ? 0 : Math.abs(Math.sin(gait * Math.PI * 2)) * .06 * run - bump * .25;
    pitch += ((airborne ? -v[1] * .03 : Math.sin(gait * Math.PI * 2 + 1) * .05 * run) - pitch) * Math.min(1, dt * 10); model.body.rotation.x = pitch;
    const turning = (lateral * -.05) + skid * Math.sign(lateral || 1) * -.12; lean += (turning - lean) * Math.min(1, dt * 6); model.body.rotation.z = Math.max(-.35, Math.min(.35, lean));
    animateCow(model, { gait, run, moving, airborne, charge, turn: Math.max(-1, Math.min(1, -lean * 4)), time: clock });
    if (rider && rider.seat.visible) {
      rider.dress(); rider.sit(); rider.person.motion.update(dt, { velocity: STILL }); // carried, not walking
      // He rides the cow's back: forward over the neck in a charge, rising and falling a beat behind it.
      rider.seat.rotation.x = .1 + charge * .32; rider.seat.position.y = .93 + Math.abs(Math.sin(gait * Math.PI * 2 + .6)) * .04 * run;
    }
  }

  // Shove from a hit (a truck, a pitchfork): an impulse in mass units, and the charge is knocked out of you.
  function hit(dx, dz, strength) { body.impulse(dx * strength * TUNE.mass, 0, dz * strength * TUNE.mass); charge *= .3; bump = Math.min(1, bump + .6); }
  function teleport(x, z, toYaw = yaw) { body.place(x, TUNE.rest + .05, z); body.setVelocity(0, 0, 0); yaw = toYaw; charge = 0; speed = 0; }
  function reset() { body.place(spawn.x, TUNE.rest + .1, spawn.z); body.setVelocity(0, 0, 0); yaw = spawn.yaw; charge = 0; speed = 0; }

  // Riderless: `keys` for control() that walk the cow to a point (the whistle), stopping `near` metres short.
  const auto = new Set();
  function steerTo(x, z, near = 2.6) {
    auto.clear(); const dx = x - state.x, dz = z - state.z, dist = Math.hypot(dx, dz); if (dist < near) { if (Math.abs(speed) > .5) auto.add('s'); return auto; }
    const cross = Math.sin(yaw) * dz + Math.cos(yaw) * dx, ahead = (Math.sin(yaw) * dx - Math.cos(yaw) * dz) / dist; // cross > 0: target to the right
    if (ahead < .96) auto.add(cross > 0 ? 'd' : 'a');
    if (ahead > -.2 && speed < Math.min(7, 1.5 + dist)) auto.add('w');
    return auto;
  }
  const setRider = on => { if (rider) rider.seat.visible = on; };
  return { state, control, update, hit, reset, teleport, steerTo, setRider, body, model, TUNE };
}

// A herd cow: no physics and no rider, a coat of its own. Used by herd.js.
const COATS = [null, 0x8f8478, 0x5c5450, 0xd9c7ae, 0x7b6a5c, null, 0x4a4442, 0xb7a892];
export function buildHerdCow(assets, i = 0) { return buildCow(assets, { tint: COATS[i % COATS.length] }); }
