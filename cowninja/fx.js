// Particles and weather. Each kind is one instanced mesh of camera-facing quads with a soft round texture; every
// particle carries its own colour and opacity (per-instance attributes read by a node material), so smoke fades as
// it thins rather than popping. Kinds: smoke, fire, spark, dust, breath, mist (long-lived ground fog round the
// camera), plus debris (small tumbling chunks) and rain (streaks round the camera, `?rain=1`).
import * as THREE from 'three/webgpu';
import { texture, instancedBufferAttribute, vec4 } from 'three/tsl';

function softTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.45, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const KINDS = {
  smoke: { max: 260, additive: false, color: [.42, .41, .4] },
  fire: { max: 120, additive: true, color: [1, .42, .1] },
  spark: { max: 220, additive: true, color: [1, .82, .45] },
  dust: { max: 260, additive: false, color: [.55, .5, .44] },
  breath: { max: 80, additive: false, color: [.85, .88, .9] },
  mist: { max: 46, additive: false, color: [.62, .68, .74] },
  flash: { max: 12, additive: true, color: [1, .85, .55] },
};

export function createFx({ scene, camera, quality = 0, rain = false }) {
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);   // mist lies in sheets over the ground
  const map = softTexture(), quad = new THREE.PlaneGeometry(1, 1), systems = {}, m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), q = new THREE.Quaternion();
  const budget = quality >= 3 ? .4 : quality >= 2 ? .7 : 1;
  for (const [name, K] of Object.entries(KINDS)) {
    const max = Math.max(8, Math.round(K.max * budget));
    const alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1), tint = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    alpha.setUsage(THREE.DynamicDrawUsage); tint.setUsage(THREE.DynamicDrawUsage);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: K.additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide });
    const tex = texture(map), a = instancedBufferAttribute(alpha, 'float'), c = instancedBufferAttribute(tint, 'vec3');
    mat.colorNode = vec4(c.mul(tex.rgb), 1); mat.opacityNode = a.mul(tex.a);
    const mesh = new THREE.InstancedMesh(quad, mat, max); mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = name === 'mist' ? 2 : 3; scene.add(mesh);
    systems[name] = { K, max, mesh, alpha, tint, list: [] };
  }
  // Debris: little dark chunks with real shading, tumbling under gravity and resting on the ground.
  const debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: .9 }), 90); debris.count = 0; debris.castShadow = true; debris.frustumCulled = false; scene.add(debris);
  const chunks = [];

  function emit(name, x, y, z, o = {}) {
    const S = systems[name]; if (!S) return; if (S.list.length >= S.max) S.list.shift();
    S.list.push({ x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, age: 0, life: o.life || 1, s0: o.size || 1, s1: o.grow ?? (o.size || 1), a: o.alpha ?? 1, g: o.gravity || 0, drag: o.drag ?? 0, c: o.color || S.K.color, spin: 0 });
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  // Ready-made effects.
  function explosion(x, z) {
    for (let i = 0; i < 6; i++) emit('flash', x, 1, z, { size: rnd(3, 5), grow: rnd(6, 9), life: rnd(.12, .22), alpha: 1 });
    for (let i = 0; i < 22; i++) { const a = rnd(0, 6.28), v = rnd(1, 5); emit('fire', x + rnd(-.6, .6), rnd(.3, 1.6), z + rnd(-.6, .6), { vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rnd(1, 4), size: rnd(.8, 1.4), grow: rnd(2, 3.4), life: rnd(.35, .7), drag: 2 }); }
    for (let i = 0; i < 26; i++) { const a = rnd(0, 6.28), v = rnd(.5, 3); emit('smoke', x + rnd(-1, 1), rnd(1.2, 2.6), z + rnd(-1, 1), { vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rnd(1.4, 3), size: rnd(1.2, 2), grow: rnd(3.5, 5.5), life: rnd(2.5, 4.2), alpha: rnd(.28, .45), drag: 1.2, color: [rnd(.16, .24), rnd(.15, .22), rnd(.14, .2)] }); }
    for (let i = 0; i < 40; i++) { const a = rnd(0, 6.28), v = rnd(4, 12); emit('spark', x, .6, z, { vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rnd(3, 10), size: rnd(.06, .12), life: rnd(.4, 1), gravity: 14, drag: .6 }); }
    for (let i = 0; i < 18; i++) { const a = rnd(0, 6.28), v = rnd(3, 9); if (chunks.length >= 90) chunks.shift(); chunks.push({ x, y: .5, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rnd(4, 10), rx: rnd(0, 6), ry: rnd(0, 6), wx: rnd(-12, 12), wy: rnd(-12, 12), s: rnd(.06, .2), age: 0 }); }
    for (let i = 0; i < 16; i++) { const a = rnd(0, 6.28), v = rnd(2, 6); emit('dust', x, 1, z, { vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rnd(.4, 1.2), size: 1, grow: rnd(2, 3.2), life: rnd(1.2, 2), alpha: .32, drag: 1.5 }); }
  }
  function sparks(x, y, z, dx = 0, dz = 0, n = 26) { for (let i = 0; i < n; i++) emit('spark', x + rnd(-.4, .4), y + rnd(-.3, .5), z + rnd(-.4, .4), { vx: dx * rnd(2, 7) + rnd(-3, 3), vz: dz * rnd(2, 7) + rnd(-3, 3), vy: rnd(1, 6), size: rnd(.05, .1), life: rnd(.3, .8), gravity: 14, drag: .5 }); }
  function muzzle(x, y, z, dx, dz) { emit('flash', x + dx * .5, y, z + dz * .5, { size: .5, grow: .8, life: .06 }); emit('smoke', x + dx * .6, y, z + dz * .6, { vx: dx * .8, vz: dz * .8, vy: .4, size: .25, grow: 1.1, life: .9, alpha: .3, drag: 1 }); }
  function hoofDust(x, z, speed) { emit('dust', x + rnd(-.4, .4), .55, z + rnd(-.4, .4), { vy: rnd(.2, .6), vx: rnd(-.3, .3), vz: rnd(-.3, .3), size: .4 + speed * .03, grow: 1.4 + speed * .08, life: rnd(.9, 1.5), alpha: Math.min(.5, .12 + speed * .025), drag: 1 }); }
  function breath(x, y, z, dx, dz) { emit('breath', x, y, z, { vx: dx * .5, vz: dz * .5, vy: .15, size: .12, grow: .55, life: 1.3, alpha: .22, drag: .8 }); }
  function puff(x, y, z, n = 8, color) { for (let i = 0; i < n; i++) emit('dust', x + rnd(-.3, .3), y, z + rnd(-.3, .3), { vx: rnd(-1.5, 1.5), vz: rnd(-1.5, 1.5), vy: rnd(.3, 1.2), size: .5, grow: rnd(1.6, 2.4), life: rnd(.8, 1.4), alpha: .4, drag: 1.6, color }); }

  // Ground mist that stays round the camera: big faint sheets drifting at knee height, recycled as you move.
  const mistOn = quality < 3;
  function keepMist(fx, fz, time) {
    if (!mistOn) return; const S = systems.mist;
    while (S.list.length < S.max) S.list.push({ x: fx + rnd(-45, 45), y: rnd(.25, 1.1), z: fz + rnd(-45, 45), vx: rnd(-.25, .25), vy: 0, vz: rnd(-.25, .25), age: rnd(0, 20), life: 1e9, s0: rnd(10, 18), s1: 0, a: rnd(.1, .2), g: 0, drag: 0, c: KINDS.mist.color, mist: true, phase: rnd(0, 6) });
    for (const p of S.list) { const dx = p.x - fx, dz = p.z - fz; if (Math.abs(dx) > 50 || Math.abs(dz) > 50) { p.x = fx - dx * .9 + rnd(-4, 4); p.z = fz - dz * .9 + rnd(-4, 4); } p.s1 = p.s0; }
  }
  // Rain: thin streaks falling round the camera.
  let rainMesh = null; const drops = [];
  if (rain) { rainMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.012, .55, .012), new THREE.MeshBasicMaterial({ color: 0x8a96a2, transparent: true, opacity: .35, depthWrite: false }), Math.round(1400 * budget)); rainMesh.frustumCulled = false; scene.add(rainMesh);
    for (let i = 0; i < rainMesh.count; i++) drops.push({ x: rnd(-25, 25), y: rnd(0, 18), z: rnd(-25, 25), v: rnd(14, 19) }); }

  function update(dt, time, focus) {
    if (focus) keepMist(focus.x, focus.z, time);
    q.copy(camera.quaternion);
    for (const S of Object.values(systems)) {
      let n = 0; const L = S.list;
      for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i]; p.age += dt; if (p.age >= p.life) { L.splice(i, 1); continue; }
        const k = p.age / p.life, damp = Math.exp(-p.drag * dt);
        p.vx *= damp; p.vz *= damp; p.vy = p.vy * damp - p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < .02 && p.g) { p.y = .02; p.vy *= -.3; p.vx *= .6; p.vz *= .6; }
        const size = p.mist ? p.s0 : p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k));
        const fade = p.mist ? p.a * (.75 + .25 * Math.sin(time * .2 + p.phase)) : p.a * Math.min(1, k * 8) * (1 - k) * (1 - k * .3);
        pos.set(p.x, p.y, p.z); scl.set(size, size, size); m4.compose(pos, p.mist ? flat : q, scl); S.mesh.setMatrixAt(n, m4);
        S.alpha.array[n] = fade; S.tint.array[n * 3] = p.c[0]; S.tint.array[n * 3 + 1] = p.c[1]; S.tint.array[n * 3 + 2] = p.c[2]; n++;
      }
      S.mesh.count = n; if (n) { S.mesh.instanceMatrix.needsUpdate = true; S.alpha.needsUpdate = true; S.tint.needsUpdate = true; }
    }
    let n = 0; const e = new THREE.Euler();
    for (let i = chunks.length - 1; i >= 0; i--) { const c = chunks[i]; c.age += dt; if (c.age > 6) { chunks.splice(i, 1); continue; }
      if (c.y > c.s * .5 || c.vy > 0) { c.vy -= 19 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.rx += c.wx * dt; c.ry += c.wy * dt; if (c.y < c.s * .5) { c.y = c.s * .5; c.vy = Math.abs(c.vy) > 2 ? -c.vy * .3 : 0; c.vx *= .5; c.vz *= .5; c.wx *= .5; c.wy *= .5; } }
      pos.set(c.x, c.y, c.z); scl.setScalar(c.s * (c.age > 5 ? 6 - c.age : 1)); m4.compose(pos, new THREE.Quaternion().setFromEuler(e.set(c.rx, c.ry, 0)), scl); debris.setMatrixAt(n++, m4); }
    debris.count = n; if (n) debris.instanceMatrix.needsUpdate = true;
    if (rainMesh && focus) { const cx = camera.position.x, cz = camera.position.z, cy = camera.position.y; q.identity();
      drops.forEach((d, i) => { d.y -= d.v * dt; if (d.y < -1) { d.y = 18; d.x = rnd(-25, 25); d.z = rnd(-25, 25); } pos.set(cx + d.x, cy - 4 + d.y, cz + d.z); scl.set(1, 1, 1); m4.compose(pos, q, scl); rainMesh.setMatrixAt(i, m4); }); rainMesh.instanceMatrix.needsUpdate = true; }
  }
  return { emit, explosion, sparks, muzzle, hoofDust, breath, puff, update, rain: !!rainMesh };
}
