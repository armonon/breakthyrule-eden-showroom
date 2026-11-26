// Explosives. Each one is announced: a red ring on the ground where it will land, closing in as the fuse burns, and
// a beep that quickens. Then the blast: a flash, and `onBlast({x, z, radius})` for the game to decide who it reached.
import * as THREE from 'three/webgpu';
import { TUNE } from '/cowninja/config.js';

export function createBlasts({ scene, audio, onBlast }) {
  const B = TUNE.blast, live = [], pool = [];
  const ringGeometry = new THREE.RingGeometry(.9, 1, 48), discGeometry = new THREE.CircleGeometry(1, 40), ball = new THREE.SphereGeometry(1, 16, 10);
  const flash = new THREE.PointLight(0xffb060, 0, 40, 1.6); flash.position.y = 2; scene.add(flash);
  const fire = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0 })); fire.visible = false; scene.add(fire);
  let flashAt = -9, lastAt = -9;
  function take() {
    const m = pool.pop(); if (m) { m.ring.visible = m.disc.visible = true; return m; }
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0xff3018, transparent: true, opacity: .95, depthTest: false, side: THREE.DoubleSide }));
    const disc = new THREE.Mesh(discGeometry, new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: .18, depthTest: false, side: THREE.DoubleSide }));
    ring.rotation.x = disc.rotation.x = -Math.PI / 2; ring.renderOrder = disc.renderOrder = 6; scene.add(ring, disc); return { ring, disc };
  }
  function spawn(x, z, { fuse = B.fuse, radius = B.radius, by = 'police' } = {}) {
    const m = take(); m.ring.position.set(x, .14, z); m.disc.position.set(x, .13, z); m.ring.scale.setScalar(radius);
    live.push({ x, z, radius, fuse, total: fuse, by, m, beep: 0 }); return true;
  }
  function update(dt, time) {
    for (let i = live.length - 1; i >= 0; i--) {
      const b = live[i]; b.fuse -= dt; const k = Math.max(0, b.fuse / b.total);
      b.m.disc.scale.setScalar(b.radius * (1 - k * .85)); b.m.ring.material.opacity = .55 + .4 * Math.sin(time * (10 + (1 - k) * 30));
      b.beep -= dt; if (b.beep <= 0) { b.beep = .12 + k * .4; audio?.hit?.('wood', b.x, b.z, .5, 2.2 + (1 - k) * 1.2); }
      if (b.fuse <= 0) {
        live.splice(i, 1); b.m.ring.visible = b.m.disc.visible = false; pool.push(b.m);
        flash.position.set(b.x, 2.2, b.z); fire.position.set(b.x, 1, b.z); flashAt = time; lastAt = time;
        audio?.hit?.('metal', b.x, b.z, 2.2, .35); audio?.hit?.('kill', b.x, b.z, 1.6, .5);
        onBlast?.({ x: b.x, z: b.z, radius: b.radius, by: b.by });
      }
    }
    const age = time - flashAt; flash.intensity = age < .5 ? 1400 * (1 - age / .5) : 0;
    fire.visible = age < .35; if (fire.visible) { fire.scale.setScalar(1 + age * 16); fire.material.opacity = .85 * (1 - age / .35); }
  }
  return { spawn, update, get pending() { return live.length; }, get lastAt() { return lastAt; }, live };
}
