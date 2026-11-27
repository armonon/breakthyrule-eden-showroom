// A grass field round the camera: clumps of blades (three crossed cards each, with a painted blade texture) on every
// patch of ground the ground mask calls green, thicker and taller in the long-grass cover by the fences, none on
// anything paved, built or fenced. Blades sway in the wind (a vertex offset growing to the tips, each clump on its own
// phase), darken towards their roots, and vary from green to straw. Normals point up, so a field shades softly
// like real grass. The clumps live in one instanced mesh covering a square round the camera, rebuilt from fixed
// world positions (so nothing pops as you move) whenever the camera crosses into another cell.
import * as THREE from 'three/webgpu';
import { texture, uv, positionLocal, vec3, vec4, float, mix, sin, cos, time, instanceIndex, hash } from 'three/tsl';

function bladeTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d'); let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 34; i++) {
    const x = 16 + rnd() * 224, lean = (rnd() - .5) * 90, top = 20 + rnd() * 90, w = 3 + rnd() * 5, dry = rnd();
    const grad = g.createLinearGradient(0, 256, 0, top);
    const tip = dry > .65 ? `rgb(${190 + rnd() * 30},${170 + rnd() * 25},${100 + rnd() * 20})` : `rgb(${110 + rnd() * 40},${140 + rnd() * 40},${50 + rnd() * 30})`;
    grad.addColorStop(0, 'rgb(40,46,22)'); grad.addColorStop(.45, dry > .65 ? 'rgb(150,130,70)' : 'rgb(80,108,38)'); grad.addColorStop(1, tip);
    g.fillStyle = grad; g.beginPath(); g.moveTo(x - w, 256); g.quadraticCurveTo(x + lean * .3, (256 + top) / 2, x + lean, top); g.quadraticCurveTo(x + lean * .3 + w * .4, (256 + top) / 2, x + w, 256); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function clump() {
  const pos = [], uvs = [], idx = [];
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI, dx = Math.cos(a) * .5, dz = Math.sin(a) * .5, b = pos.length / 3;
    pos.push(-dx, 0, -dz, dx, 0, dz, dx, 1, dz, -dx, 1, -dz); uvs.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3)); geo.setIndex(idx); return geo;
}

export function createGrass({ scene, world, mask, quality = 0, reach = 40, cell = 12 }) {
  if (!mask) return { update() {} };
  const N = quality >= 3 ? 6000 : quality >= 2 ? 14000 : 30000;
  const map = bladeTexture(), m = new THREE.MeshStandardNodeMaterial({ roughness: .9, metalness: 0, side: THREE.DoubleSide, alphaTest: .45 });
  const tex = texture(map), h = hash(instanceIndex), v = uv().y;
  m.colorNode = vec4(tex.rgb.mul(mix(vec3(.82, 1.0, .78), vec3(1.12, 1.0, .72), hash(instanceIndex.add(11)))).mul(v.mul(.55).add(.42)), 1);
  m.opacityNode = tex.a;
  const sway = v.mul(v), phase = h.mul(6.28), gust = sin(time.mul(.35).add(phase.mul(.2))).mul(.5).add(.8);
  m.positionNode = positionLocal.add(vec3(sin(time.mul(1.7).add(phase)).mul(.09).mul(sway).mul(gust), float(0), cos(time.mul(1.3).add(phase)).mul(.06).mul(sway).mul(gust)));
  const mesh = new THREE.InstancedMesh(clump(), m, N); mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true; scene.add(mesh);
  // Where a clump may not grow: under anything solid near the ground (rasterised once, half-metre cells).
  const fence = world.fence || [-56, 100, -62, 72], G = .5, gx0 = fence[0] - 14, gz0 = fence[2] - 14, gw = Math.ceil((fence[1] - fence[0] + 28) / G), gh = Math.ceil((fence[3] - fence[2] + 28) / G);
  const blocked = new Uint8Array(gw * gh);
  for (const b of world.solids) { if (b.bottom > 1.2 || b.top < .15 || b.maxX - b.minX > 60 || b.maxZ - b.minZ > 60) continue;
    for (let j = Math.max(0, Math.floor((b.minZ - gz0) / G)); j <= Math.min(gh - 1, Math.floor((b.maxZ - gz0) / G)); j++) for (let i = Math.max(0, Math.floor((b.minX - gx0) / G)); i <= Math.min(gw - 1, Math.floor((b.maxX - gx0) / G)); i++) blocked[j * gw + i] = 1; }
  for (const c of world.ceilingsList || []) for (let j = Math.max(0, Math.floor((c[2] - gz0) / G)); j <= Math.min(gh - 1, Math.floor((c[3] - gz0) / G)); j++) for (let i = Math.max(0, Math.floor((c[0] - gx0) / G)); i <= Math.min(gw - 1, Math.floor((c[1] - gx0) / G)); i++) blocked[j * gw + i] = 1;
  const isBlocked = (x, z) => { const i = Math.floor((x - gx0) / G), j = Math.floor((z - gz0) / G); return i < 0 || j < 0 || i >= gw || j >= gh || blocked[j * gw + i] === 1; };
  const hsh = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const step = Math.sqrt((reach * 2) ** 2 / N) * .9;
  let cx = 1e9, cz = 1e9;
  function rebuild(x, z) {
    let n = 0;
    const i0 = Math.floor((x - reach) / step), i1 = Math.ceil((x + reach) / step), j0 = Math.floor((z - reach) / step), j1 = Math.ceil((z + reach) / step);
    for (let j = j0; j <= j1 && n < N; j++) for (let i = i0; i <= i1 && n < N; i++) {
      const wx = (i + hsh(i, j, 1)) * step, wz = (j + hsh(i, j, 2)) * step, d = Math.hypot(wx - x, wz - z); if (d > reach) continue;
      const covered = world.inCover?.(wx, wz), green = covered ? 1 : mask.grass(wx, wz);
      if (hsh(i, j, 3) > green * 1.15 - .05 || isBlocked(wx, wz)) continue;
      const fade = Math.min(1, (reach - d) / 8), tall = covered ? 1.05 + hsh(i, j, 4) * .45 : .3 + hsh(i, j, 4) * .45 * (.6 + green * .6);
      q.setFromAxisAngle(up, hsh(i, j, 5) * 6.28); sc.set(.8 + hsh(i, j, 6) * .6, tall * fade, .8 + hsh(i, j, 6) * .6); p.set(wx, 0, wz);
      m4.compose(p, q, sc); mesh.setMatrixAt(n++, m4);
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
  }
  function update(focus) {
    const nx = Math.round(focus.x / cell) * cell, nz = Math.round(focus.z / cell) * cell;
    if (nx !== cx || nz !== cz) { cx = nx; cz = nz; rebuild(nx, nz); }
  }
  return { update, mesh, get count() { return mesh.count; } };
}
