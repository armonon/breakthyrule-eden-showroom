// The farmers' pickup. A real rigid body with a low centre of mass that hunts the cow once the alarm is up.
// Head-on it wins: you take the hit. Catch it side-on at a charge and the impact, plus a roll torque scaled by how
// square and how fast you hit, puts it on its roof.
import * as THREE from 'three/webgpu';

const HALF = [1.02, .78, 2.05], MASS = 1500, REST = .8, TOP = 14.5, ACCEL = 6, TURN = 1.25, FLIP_SPEED = 8.5, SQUARE = .62;

export function createTruck({ scene, physics, world, cow, blood, onEvent, assets, target = null }) {
  const group = new THREE.Group(), cube = new THREE.BoxGeometry(1, 1, 1);
  // The generated old pickup when it is there (no separate wheels), else the low-poly one with turning wheels.
  const generated = assets?.clone('modly:old-pickup'), model = generated || assets?.clone('pickup'), wheels = [], beams = [];
  if (generated) {
    const fit = new THREE.Box3().setFromObject(generated), size = fit.getSize(new THREE.Vector3()), k = 4.3 / Math.max(size.x, size.z);
    generated.scale.setScalar(k); generated.rotation.y = size.z > size.x ? Math.PI : Math.PI / 2;   // nose to -z
    generated.position.set(0, -REST - fit.min.y * k, 0); group.add(generated);
  } else if (model) {
    model.position.y = -REST; group.add(model);
    model.traverse(o => { if (/^wheel-/.test(o.name)) { o.rotation.order = 'YXZ'; wheels.push(o); } if (o.isMesh && /headlights/.test(o.material.name)) { o.material = o.material.clone(); beams.push(o); } });
  } else {
    const paint = new THREE.MeshStandardMaterial({ color: 0x5b1f1a, roughness: .5, metalness: .4 }), part = (mat, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(cube, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; group.add(m); };
    part(paint, 0, -.1, 0, 1.96, .7, 4.1); part(paint, 0, .5, -.5, 1.8, .62, 1.7);
  }
  const lamp = new THREE.SpotLight(0xfff1c9, 0, 46, .5, .5, 1.4); lamp.position.set(0, -.05, -2.0); lamp.target.position.set(0, -.5, -14); group.add(lamp, lamp.target);
  scene.add(group);
  const s = world.truckStart;
  const body = physics.dynamicBox([s.x, REST + .05, s.z], HALF, { mass: MASS, friction: .85, restitution: .05, linearDamping: .02, angularDamping: .25, com: [0, -.42, 0] });
  const q = new THREE.Quaternion(), up = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), tmp = new THREE.Vector3(), local = new THREE.Vector3();
  let steerShown = 0, active = false, flipped = false, hitCool = 0, speed = 0, wreck = 0;
  { const start = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -s.yaw); body.place(s.x, REST + .05, s.z, start.x, start.y, start.z, start.w); }

  function update(dt, live) {
    const t = body.read(); group.position.set(t.p[0], t.p[1], t.p[2]); q.set(t.q[0], t.q[1], t.q[2], t.q[3]); group.quaternion.copy(q);
    up.set(0, 1, 0).applyQuaternion(q); fwd.set(0, 0, -1).applyQuaternion(q); right.set(1, 0, 0).applyQuaternion(q);
    const c = target ? target() : cow.state, upright = up.y > .72;
    hitCool = Math.max(0, hitCool - dt);
    if (!flipped && up.y < .2) { flipped = true; wreck = 0; lamp.intensity = 0; for (const b of beams) { b.material.emissiveIntensity = 0; b.material.color.setScalar(.15); } onEvent?.({ type: 'flipped' }); }
    if (flipped) { wreck += dt; return; }
    { const v = body.velocity(), roll = (v[0] * fwd.x + v[2] * fwd.z) * dt / .33; for (const w of wheels) { w.rotation.x -= roll; if (w.name.startsWith('wheel-f')) w.rotation.y = steerShown; } }
    lamp.intensity = active ? 900 : 0;
    // Drive: steer the nose at the cow, throttle up, written through the velocity so collisions still slow it.
    // (not for a moment after any hit: the driver has lost it, and physics alone decides whether it rolls)
    if (active && live && upright && hitCool <= 0) {
      const v = body.velocity(), f2 = Math.hypot(fwd.x, fwd.z) || 1, fx = fwd.x / f2, fz = fwd.z / f2;
      speed = v[0] * fx + v[2] * fz; const lat = v[0] * -fz + v[2] * fx;
      const dx = c.x - t.p[0], dz = c.z - t.p[2], dist = Math.hypot(dx, dz) || 1, cross = fx * dz - fz * dx, ahead = (fx * dx + fz * dz) / dist;
      const steer = Math.max(-1, Math.min(1, cross / dist * 2.2)) * (ahead < -.2 ? 1.6 : 1);
      const target = ahead > .3 ? TOP : 6.5; steerShown += (-steer * .45 - steerShown) * Math.min(1, dt * 8);
      speed += Math.max(-ACCEL * 1.6 * dt, Math.min(ACCEL * dt, target - speed));
      const yawRate = steer * TURN * Math.min(1, Math.abs(speed) / 4);
      const nfx = fx * Math.cos(yawRate * dt) - fz * Math.sin(yawRate * dt), nfz = fx * Math.sin(yawRate * dt) + fz * Math.cos(yawRate * dt), keep = Math.exp(-5 * dt);
      body.setVelocity(nfx * speed + -nfz * lat * keep, v[1], nfz * speed + nfx * lat * keep); body.setSpin(0, -yawRate, 0);
    }
    // Contact with the cow, in the truck's own frame.
    if (!live) return;
    tmp.set(c.x - t.p[0], 0, c.z - t.p[2]); local.set(tmp.dot(right), 0, -tmp.dot(fwd)); // x: to its right, z: ahead of its nose
    const nearSide = Math.abs(local.x) < HALF[0] + 1.25 && Math.abs(local.z) < HALF[2] + .5, nearEnd = Math.abs(local.x) < HALF[0] + .55 && Math.abs(local.z) < HALF[2] + 1.35;
    if ((nearSide || nearEnd) && hitCool <= 0 && upright) {
      const cv = c.velocity, cowSpeed = Math.hypot(cv.x, cv.z), square = Math.abs(c.forward.x * right.x + c.forward.z * right.z), intoSide = Math.abs(local.x) > HALF[0] * .9 && Math.abs(local.z) < HALF[2];
      if (intoSide && square > SQUARE && cowSpeed > FLIP_SPEED) {
        // The flip: roll about its length away from the cow, with lift; harder the squarer and faster the hit.
        const dir = Math.sign(local.x) || 1, power = (cowSpeed - FLIP_SPEED * .5) * square * MASS;
        body.spinImpulse(-fwd.x * dir * power * .7, 0, -fwd.z * dir * power * .7);
        body.impulse(-right.x * dir * power * .3, power * .26, -right.z * dir * power * .3);
        hitCool = 1.2; onEvent?.({ type: 'rammed-truck', speed: cowSpeed, square });
      } else if (Math.abs(speed) > 5 && local.z > 0 && Math.abs(local.x) < HALF[0] + .5) {
        // Its nose found you.
        hitCool = 1.1; blood?.burst(c.x, 1, c.z, fwd.x * speed, fwd.z * speed, 8); onEvent?.({ type: 'run-over', dx: fwd.x, dz: fwd.z, speed: Math.abs(speed) });
      } else if (cowSpeed > 4) { hitCool = .5; onEvent?.({ type: 'glanced', speed: cowSpeed }); }
    }
  }
  return { update, body, group, get speed() { return speed; }, start() { if (!active) { active = true; body.wake(); onEvent?.({ type: 'truck-coming' }); } }, get flipped() { return flipped; }, get active() { return active; } };
}
