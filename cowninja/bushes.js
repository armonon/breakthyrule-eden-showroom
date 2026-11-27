// Bushes to hide in: thick, rounded shrubs you cannot see into. Each is a dark leafy core (a lumpy ball, so nothing
// shows through) wrapped in dozens of leaf cards painted with clusters of leaves, their normals pointing out from
// the middle so the bush shades as one soft mass. All bushes share two instanced meshes; one you push through is
// shaken (its instance matrix wobbles) and the leaves sway a little in the wind.
import * as THREE from 'three/webgpu';
import { texture, uv, positionLocal, vec3, vec4, sin, time, instanceIndex, hash, mix } from 'three/tsl';

function leafTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); let s = 11;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) {
    const x = 20 + rnd() * 216, y = 20 + rnd() * 216, r = 6 + rnd() * 10, a = rnd() * Math.PI, k = .55 + rnd() * .55;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = `rgb(${Math.round((40 + rnd() * 40) * k)},${Math.round((70 + rnd() * 60) * k)},${Math.round((24 + rnd() * 26) * k)})`;
    g.beginPath(); g.ellipse(0, 0, r, r * .45, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(20,30,10,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.stroke(); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function template(r) {
  // The core: an icosphere, squashed and made lumpy.
  const core = new THREE.IcosahedronGeometry(1, 2), p = core.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 1 + .12 * Math.sin(x * 5 + z * 3) + .08 * Math.sin(y * 7 + x * 2);
    p.setXYZ(i, x * r * .82 * n, Math.max(-.05, y * r * .85 * n + r * .6), z * r * .82 * n); }
  core.computeVertexNormals();
  // The cards: leaf clusters over the core's surface, facing out at a slant.
  const pos = [], nor = [], uvs = [], idx = []; let s = 5; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 95; i++) {
    const th = rnd() * Math.PI * 2, ph = i < 20 ? rnd() * .6 : Math.acos(1 - rnd() * 1.6) /* the first twenty crown it */, cx = Math.sin(ph) * Math.cos(th) * r * .85, cy = Math.cos(ph) * r * .82 + r * .62, cz = Math.sin(ph) * Math.sin(th) * r * .85;
    const out = new THREE.Vector3(cx, cy - r * .3, cz).normalize(), size = r * (.55 + rnd() * .4);
    const t1 = new THREE.Vector3().crossVectors(out, new THREE.Vector3(rnd() - .5, 1, rnd() - .5)).normalize(), t2 = new THREE.Vector3().crossVectors(out, t1).normalize();
    const b = pos.length / 3;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(cx + (t1.x * u + t2.x * v) * size * .5, Math.max(.02, cy + (t1.y * u + t2.y * v) * size * .5), cz + (t1.z * u + t2.z * v) * size * .5); nor.push(out.x, out.y, out.z); uvs.push((u + 1) / 2, (v + 1) / 2); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const cards = new THREE.BufferGeometry(); cards.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cards.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); cards.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); cards.setIndex(idx);
  return { core, cards };
}

export function createBushes({ scene, spots, radius = 1.8 }) {
  const { core, cards } = template(radius * .75), map = leafTexture(), n = spots.length;
  const coreMat = new THREE.MeshStandardNodeMaterial({ color: 0x1d2a14, roughness: .95 });
  coreMat.colorNode = vec4(mix(vec3(.04, .07, .03), vec3(.08, .11, .05), hash(instanceIndex)), 1);
  const leafMat = new THREE.MeshStandardNodeMaterial({ roughness: .85, side: THREE.DoubleSide, alphaTest: .4 });
  const tex = texture(map); leafMat.colorNode = vec4(tex.rgb.mul(mix(vec3(.85, 1, .8), vec3(1.15, 1.05, .7), hash(instanceIndex.add(3)))), 1); leafMat.opacityNode = tex.a;
  leafMat.positionNode = positionLocal.add(vec3(sin(time.mul(1.4).add(positionLocal.y.mul(2)).add(hash(instanceIndex).mul(6))).mul(.03).mul(positionLocal.y), 0, 0));
  const coreMesh = new THREE.InstancedMesh(core, coreMat, n), leafMesh = new THREE.InstancedMesh(cards, leafMat, n);
  coreMesh.castShadow = leafMesh.castShadow = true; coreMesh.receiveShadow = leafMesh.receiveShadow = true; scene.add(coreMesh, leafMesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const list = spots.map(([x, z], i) => ({ x, z, r: radius, yaw: (i * 2.39) % 6.28, size: .9 + (i * 37 % 10) * .03, shake: 0, i }));
  function place(b, t = 0) {
    e.set(Math.sin(t * 18) * .05 * b.shake, b.yaw, Math.cos(t * 15) * .05 * b.shake); q.setFromEuler(e); p.set(b.x, 0, b.z); sc.set(b.size, b.size * (.95 + (b.i % 3) * .06), b.size);
    m4.compose(p, q, sc); coreMesh.setMatrixAt(b.i, m4); leafMesh.setMatrixAt(b.i, m4);
  }
  list.forEach(b => place(b)); coreMesh.instanceMatrix.needsUpdate = leafMesh.instanceMatrix.needsUpdate = true;
  function update(dt, t) {
    let moved = false;
    for (const b of list) if (b.shake > 0) { b.shake = Math.max(0, b.shake - dt * 1.8); place(b, t); moved = true; }
    if (moved) coreMesh.instanceMatrix.needsUpdate = leafMesh.instanceMatrix.needsUpdate = true;
  }
  return { list, update };
}
