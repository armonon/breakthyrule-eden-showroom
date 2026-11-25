// Blood that stays. Two pooled, instanced layers: floor splats (decals just above the ground, never removed, the
// oldest reused only when the pool is full) and airborne droplets that fall under gravity and leave a splat where
// they land. Saturated red is the one colour the grade keeps, so it reads from across the yard.
import * as THREE from 'three/webgpu';

const SPLATS = 420, DROPS = 160;

function splatTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.translate(64, 64);
  for (let i = 0; i < 26; i++) { // a body with thrown lobes and satellite drops
    const a = Math.random() * 6.283, r = i < 6 ? Math.random() * 14 : 16 + Math.random() * 40, s = i < 6 ? 16 + Math.random() * 14 : 2 + Math.random() * 7;
    g.fillStyle = `rgba(255,255,255,${i < 6 ? 1 : .9})`; g.beginPath(); g.ellipse(Math.cos(a) * r, Math.sin(a) * r, s, s * (.5 + Math.random() * .5), a, 0, 6.283); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createBlood({ scene }) {
  const map = splatTexture();
  // Dark arterial red that dries toward brown only slightly: the floor material is glossy so it reads wet.
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x8e0a08, alphaMap: map, transparent: true, depthWrite: false, roughness: .16, metalness: .1, polygonOffset: true, polygonOffsetFactor: -2 });
  const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
  const floor = new THREE.InstancedMesh(plane, floorMat, SPLATS); floor.count = 0; floor.frustumCulled = false; floor.receiveShadow = true; scene.add(floor);
  const drops = new THREE.InstancedMesh(new THREE.BoxGeometry(.06, .06, .06), new THREE.MeshStandardMaterial({ color: 0xa00d0a, roughness: .2 }), DROPS); drops.count = DROPS; drops.frustumCulled = false; scene.add(drops);
  const live = Array.from({ length: DROPS }, () => ({ alive: false, x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0 }));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0), hidden = new THREE.Matrix4().makeTranslation(0, -50, 0);
  for (let i = 0; i < DROPS; i++) drops.setMatrixAt(i, hidden);
  let next = 0, used = 0, total = 0;

  function splat(x, z, size = .6) {
    const i = next; next = (next + 1) % SPLATS; used = Math.min(SPLATS, used + 1); total++;
    q.setFromAxisAngle(yAxis, Math.random() * 6.283); s.set(size * (.8 + Math.random() * .5), 1, size * (.8 + Math.random() * .5)); p.set(x, .012 + (i % 9) * .0006, z);
    floor.setMatrixAt(i, m.compose(p, q, s)); floor.count = used; floor.instanceMatrix.needsUpdate = true;
  }
  // A spray: droplets thrown along (vx, vz) with spread and lift, plus an immediate splat under the wound.
  function burst(x, y, z, vx, vz, n = 12) {
    splat(x, z, .7 + Math.random() * .5);
    for (let k = 0; k < n; k++) { const d = live.find(d => !d.alive); if (!d) break;
      d.alive = true; d.x = x + (Math.random() - .5) * .3; d.y = y + Math.random() * .4; d.z = z + (Math.random() - .5) * .3;
      d.vx = vx * (.25 + Math.random() * .5) + (Math.random() - .5) * 4; d.vy = 2.5 + Math.random() * 5; d.vz = vz * (.25 + Math.random() * .5) + (Math.random() - .5) * 4; }
  }
  function update(dt) {
    let changed = false;
    live.forEach((d, i) => {
      if (!d.alive) return; changed = true;
      d.vy -= 19 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y <= .02) { d.alive = false; splat(d.x, d.z, .14 + Math.random() * .3); drops.setMatrixAt(i, hidden); return; }
      p.set(d.x, d.y, d.z); s.setScalar(1); drops.setMatrixAt(i, m.compose(p, q.identity(), s));
    });
    if (changed) drops.instanceMatrix.needsUpdate = true;
  }
  return { splat, burst, update, inspect: () => ({ splats: used, total }) };
}
