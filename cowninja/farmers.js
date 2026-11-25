// Farmers. They patrol; when they see or hear the cow they come for it with a pitchfork. Hit one at a charge and he
// becomes a ten-part physics ragdoll that carries the cow's velocity; reach him slowly and he stabs you instead.
import * as THREE from 'three/webgpu';

// Ragdoll layout, standing at the origin facing -z: [name, x, y, z-half... ] as centre and half extents, mass.
const PARTS = [
  ['pelvis', 0, .95, [.17, .12, .11], 12], ['chest', 0, 1.3, [.19, .2, .12], 18], ['head', 0, 1.68, [.1, .12, .1], 5],
  ['armL', -.29, 1.33, [.05, .15, .05], 2.5], ['armR', .29, 1.33, [.05, .15, .05], 2.5],
  ['handL', -.29, 1.02, [.045, .15, .045], 1.8], ['handR', .29, 1.02, [.045, .15, .045], 1.8],
  ['thighL', -.1, .66, [.075, .2, .075], 8], ['thighR', .1, .66, [.075, .2, .075], 8],
  ['shinL', -.1, .24, [.06, .22, .06], 4.5], ['shinR', .1, .24, [.06, .22, .06], 4.5],
];
const JOINTS = [
  ['pelvis', 'chest', 0, 1.1, .35, .3], ['chest', 'head', 0, 1.54, .5, .6],
  ['chest', 'armL', -.29, 1.48, 1.3, .6], ['chest', 'armR', .29, 1.48, 1.3, .6],
  ['armL', 'handL', -.29, 1.17, 1.2, .2], ['armR', 'handR', .29, 1.17, 1.2, .2],
  ['pelvis', 'thighL', -.1, .86, .9, .3], ['pelvis', 'thighR', .1, .86, .9, .3],
  ['thighL', 'shinL', -.1, .46, 1, .1], ['thighR', 'shinR', .1, .46, 1, .1],
];
const SEE = 24, SEE_COS = Math.cos(1.05), HEAR = 13, RAM_SPEED = 5.5;

export function createFarmers({ scene, physics, world, cow, blood, onEvent }) {
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cloth = [0x4a5a3c, 0x5b4634, 0x3e4a5c, 0x6a5a3a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .9 }));
  const skin = new THREE.MeshStandardMaterial({ color: 0xb08a72, roughness: .8 }), denim = new THREE.MeshStandardMaterial({ color: 0x2f3a4a, roughness: .9 }), steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: .4, metalness: .8 });
  const farmers = [];

  function make(route, i) {
    const group = new THREE.Group(), meshes = new Map(), shirt = cloth[i % cloth.length];
    for (const [name, x, y, half] of PARTS) {
      const m = new THREE.Mesh(cube, name === 'head' || name.startsWith('hand') ? skin : name.startsWith('thigh') || name.startsWith('shin') ? denim : shirt);
      m.position.set(x, y, 0); m.scale.set(half[0] * 2, half[1] * 2, half[2] * 2); m.castShadow = true; group.add(m); meshes.set(name, m);
    }
    const fork = new THREE.Group(); fork.position.set(.3, 1.05, -.2); group.add(fork);
    const shaft = new THREE.Mesh(cube, new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: .8 })); shaft.scale.set(.04, .04, 1.5); shaft.position.z = -.35; fork.add(shaft);
    for (const x of [-.07, 0, .07]) { const t = new THREE.Mesh(cube, steel); t.scale.set(.02, .02, .3); t.position.set(x, 0, -1.2); fork.add(t); }
    scene.add(group);
    const f = { group, meshes, fork, route, at: 0, p: { x: route[0][0], z: route[0][1] }, yaw: 0, state: 'patrol', alert: 0, strike: 0, step: i * 1.3, ragdoll: null, down: 0, seenAt: 0 };
    group.position.set(f.p.x, 0, f.p.z); farmers.push(f); return f;
  }
  world.patrols.forEach(make);

  // Knock a farmer out: bodies where his boxes are, thrown with the hitter's velocity plus lift and a twist.
  function knock(f, vx, vz, by = 'cow') {
    if (f.ragdoll) return;
    const sin = Math.sin(-f.yaw), cos = Math.cos(-f.yaw), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -f.yaw);
    const at = (x, y) => [f.p.x + x * cos, y, f.p.z - x * sin];
    const parts = PARTS.map(([name, x, y, half, mass]) => ({ name, center: at(x, y), half, mass, quat: [q.x, q.y, q.z, q.w] }));
    const joints = JOINTS.map(([a, b, x, y, cone, twist]) => ({ a, b, at: at(x, y), cone, twist }));
    f.ragdoll = physics.ragdoll(parts, joints); f.state = 'out'; f.down = 0;
    const speed = Math.hypot(vx, vz), lift = 2.5 + speed * .28;
    for (const [name, b] of f.ragdoll.parts) {
      b.setVelocity(vx * 1.15 + (Math.random() - .5) * 2, lift * (name === 'chest' || name === 'pelvis' ? 1 : .8 + Math.random() * .6), vz * 1.15 + (Math.random() - .5) * 2);
      b.setSpin((Math.random() - .5) * 9, (Math.random() - .5) * 9, (Math.random() - .5) * 9);
    }
    for (const m of f.meshes.values()) scene.attach(m);
    f.fork.visible = false; f.group.visible = false;
    blood?.burst(f.p.x, 1.2, f.p.z, vx, vz, 14 + Math.min(18, speed));
    onEvent?.({ type: 'knockout', by, speed, farmer: f });
  }

  function update(dt, time, live) {
    const c = cow.state;
    for (const f of farmers) {
      if (f.ragdoll) {
        f.down += dt;
        for (const [name, b] of f.ragdoll.parts) { const t = b.read(), m = f.meshes.get(name); m.position.set(t.p[0], t.p[1], t.p[2]); m.quaternion.set(t.q[0], t.q[1], t.q[2], t.q[3]); }
        // He bleeds where he slides and lies: a trail while moving, a pool once he stops.
        if (blood) { const t = f.ragdoll.parts.get('chest').read().p, v = f.ragdoll.parts.get('chest').velocity(), moving = Math.hypot(v[0], v[2]);
          if (t[1] < .5 && (f.down - (f.bledAt || 0)) > (moving > 1 ? .09 : .9) && f.down < 14) { f.bledAt = f.down; blood.splat(t[0], t[2], moving > 1 ? .35 + Math.random() * .3 : .5 + Math.min(1.2, f.down * .12)); } }
        continue;
      }
      const dx = c.x - f.p.x, dz = c.z - f.p.z, dist = Math.hypot(dx, dz);
      // Perception: in front and in range, or close and loud (a charge, a skid).
      const facing = (Math.sin(f.yaw) * dx - Math.cos(f.yaw) * dz) / (dist || 1);
      const sees = live && dist < SEE && facing > SEE_COS, hears = live && dist < HEAR * (c.charging || c.skid > .4 ? 1.6 : Math.abs(c.speed) > 6 ? 1 : .45);
      if (sees || hears) { f.alert = Math.min(1, f.alert + dt * (sees ? 1.8 : .9)); f.seenAt = time; } else if (time - f.seenAt > 4) f.alert = Math.max(0, f.alert - dt * .3);
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
      if (moving) f.step += dt * pace * 2.2;
      // Contact with the cow: rammed at speed, or close enough to stab.
      const along = dx * c.forward.x + dz * c.forward.z, side = Math.abs(dx * c.forward.z - dz * c.forward.x), closing = Math.hypot(c.velocity.x, c.velocity.z);
      if (live && dist < 1.9 && -along < 1.75 && -along > -1.2 && side < .8 && closing > RAM_SPEED) { knock(f, c.velocity.x, c.velocity.z); continue; }
      f.strike = Math.max(0, f.strike - dt);
      if (live && f.state === 'chase' && dist < 1.9 && f.strike <= 0) { f.strike = 1.3; onEvent?.({ type: 'stabbed', dx: -dx / (dist || 1), dz: -dz / (dist || 1) }); }
      // Pose: bob and leg swing while walking, the fork thrust on a strike.
      f.group.position.set(f.p.x, moving ? Math.abs(Math.sin(f.step)) * .04 : 0, f.p.z); f.group.rotation.y = -f.yaw;
      const swing = moving ? Math.sin(f.step) * .5 : 0;
      for (const [n, s] of [['thighL', 1], ['thighR', -1], ['shinL', 1], ['shinR', -1]]) f.meshes.get(n).position.z = -swing * s * .16 * (n.startsWith('shin') ? 1.6 : 1);
      f.fork.rotation.x = f.state === 'chase' ? -.1 : .9; f.fork.position.z = -.2 - (f.strike > 1 ? (f.strike - 1) * 2.2 : 0);
    }
  }
  return { farmers, update, knock, standing: () => farmers.filter(f => !f.ragdoll), out: () => farmers.filter(f => f.ragdoll).length, alerted: () => farmers.some(f => f.state === 'chase') };
}
