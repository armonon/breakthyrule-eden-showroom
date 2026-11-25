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

function hide(color) { return new THREE.MeshStandardMaterial({ color, roughness: .85 }); }

// A box cow: barrel, neck and head with horns, four legs that gallop, a tail, black patches, and the rider.
function buildCow() {
  const g = new THREE.Group(), cube = new THREE.BoxGeometry(1, 1, 1), white = hide(0xe9e4da), black = hide(0x1b1a19), pink = hide(0xc9938c), horn = hide(0xd8cfb4), cloth = hide(0x0d0d0f);
  const part = (parent, mat, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(cube, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m; };
  const body = new THREE.Group(); g.add(body);
  part(body, white, 0, .98, 0, .78, .82, 1.9);
  part(body, black, .3, 1.12, .32, .22, .5, .7); part(body, black, -.33, 1.0, -.45, .16, .46, .6); part(body, black, 0, 1.36, -.1, .5, .08, .8);
  const neck = new THREE.Group(); neck.position.set(0, 1.18, -.95); body.add(neck);
  part(neck, white, 0, .06, -.2, .42, .5, .55);
  const head = new THREE.Group(); head.position.set(0, .16, -.5); neck.add(head);
  part(head, white, 0, 0, -.18, .4, .42, .56); part(head, pink, 0, -.08, -.5, .32, .24, .14); part(head, black, 0, .12, -.1, .42, .2, .3);
  for (const s of [-1, 1]) { part(head, horn, s * .26, .28, -.06, .08, .26, .08).rotation.z = -s * .5; part(head, white, s * .28, .1, .04, .16, .1, .06); }
  const legs = [];
  for (const [x, z] of [[-.27, -.7], [.27, -.7], [-.27, .72], [.27, .72]]) {
    const hip = new THREE.Group(); hip.position.set(x, .62, z); body.add(hip);
    part(hip, white, 0, -.3, 0, .17, .62, .17); part(hip, black, 0, -.6, 0, .19, .1, .2); legs.push(hip);
  }
  const tail = new THREE.Group(); tail.position.set(0, 1.3, .96); body.add(tail); part(tail, white, 0, -.3, .04, .06, .6, .06); part(tail, black, 0, -.64, .04, .1, .14, .1);
  // The ninja: seated, leaning forward, a red headband as the one saturated thing on him.
  const rider = new THREE.Group(); rider.position.set(0, 1.42, .05); body.add(rider);
  part(rider, cloth, 0, .3, 0, .36, .56, .26); part(rider, cloth, 0, .72, -.04, .24, .24, .24);
  part(rider, new THREE.MeshStandardMaterial({ color: 0xb3140f, roughness: .6 }), 0, .76, -.04, .26, .06, .26);
  for (const s of [-1, 1]) { part(rider, cloth, s * .26, .02, -.1, .14, .16, .5); part(rider, cloth, s * .24, .34, -.22, .1, .1, .44); }
  return { group: g, body, neck, head, legs, tail, rider };
}

export function createCow({ scene, physics, spawn }) {
  const model = buildCow(); scene.add(model.group);
  const body = physics.dynamicBox([spawn.x, TUNE.rest + .1, spawn.z], TUNE.half, {
    mass: TUNE.mass, friction: 0, restitution: 0, linearDamping: 0, angularDamping: 0, dofs: physics.DOF.upright,
  });
  let yaw = spawn.yaw, charge = 0, speed = 0, lateral = 0, skid = 0, airborne = false, gait = 0, lean = 0, pitch = 0, bump = 0, lastVy = 0;
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
    state.charging = charge > .35 && speed > TUNE.trot * .9; state.skid = skid; state.airborne = airborne;
    state.forward.set(Math.sin(yaw), 0, -Math.cos(yaw)); state.velocity.set(v[0], v[1], v[2]);
    model.group.position.set(t.p[0], t.p[1] - TUNE.rest, t.p[2]); model.group.rotation.y = -yaw;
    const run = Math.min(1, Math.abs(speed) / TUNE.charge);
    gait += dt * (2.5 + Math.abs(speed) * 1.25);
    // Gallop: front and back pairs out of phase, a rocking barrel, head down in a charge, body leaning into turns.
    model.legs.forEach((leg, i) => { const front = i < 2, phase = gait + (front ? 0 : Math.PI * .9) + (i % 2 ? .5 : 0); leg.rotation.x = airborne ? (front ? -.9 : .8) : Math.sin(phase) * (.25 + run * .75); });
    bump = Math.max(0, bump - dt * 2.5);
    model.body.position.y = airborne ? 0 : Math.abs(Math.sin(gait)) * .07 * run - bump * .25;
    pitch += ((airborne ? -v[1] * .03 : Math.sin(gait + 1) * .05 * run) - pitch) * Math.min(1, dt * 10); model.body.rotation.x = pitch;
    const turning = (lateral * -.05) + skid * Math.sign(lateral || 1) * -.12; lean += (turning - lean) * Math.min(1, dt * 6); model.body.rotation.z = Math.max(-.35, Math.min(.35, lean));
    model.neck.rotation.x = -charge * .55 + Math.sin(gait) * .06 * run; model.head.rotation.x = -charge * .35;
    model.tail.rotation.x = .25 + run * .9 + Math.sin(gait * 1.7) * .2;
    model.rider.rotation.x = -.15 - charge * .35; model.rider.position.y = 1.42 + Math.abs(Math.sin(gait + .6)) * .05 * run;
  }

  // Shove from a hit (a truck, a pitchfork): an impulse in mass units, and the charge is knocked out of you.
  function hit(dx, dz, strength) { body.impulse(dx * strength * TUNE.mass, 0, dz * strength * TUNE.mass); charge *= .3; bump = Math.min(1, bump + .6); }
  function teleport(x, z, toYaw = yaw) { body.place(x, TUNE.rest + .05, z); body.setVelocity(0, 0, 0); yaw = toYaw; charge = 0; speed = 0; }
  function reset() { body.place(spawn.x, TUNE.rest + .1, spawn.z); body.setVelocity(0, 0, 0); yaw = spawn.yaw; charge = 0; speed = 0; }

  return { state, control, update, hit, reset, teleport, body, model, TUNE };
}

// A herd cow: no physics, just a box cow that follows. Used by herd.js.
export function buildHerdCow() { const c = buildCow(); c.rider.visible = false; return c; }
