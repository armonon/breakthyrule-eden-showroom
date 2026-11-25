// The COWNinja site: a small rural abattoir built in Blender by tools/cowninja/build-site.py.
//   assets.site      site.glb: the architecture (with baked bounce light, lightmap on uv1), bespoke kit and terrain
//   assets.siteData  site.json: collision boxes, lights, props, scatter and every gameplay point
// This module turns that into the running world: Jolt bodies for every box, the walkers' 2D walls, the lamps, the
// chain-link fence, Poly Haven and main-game props (loose ones are physics bodies), the countryside scatter, the pen
// gate planks and the red lever. Units are metres; +x east, -z north (the way out).
import * as THREE from 'three/webgpu';

export function createWorld({ scene, physics, assets, shadows = 7 }) {
  const data = assets.siteData, P = data.points;
  const root = new THREE.Group(); root.name = 'COWNinja site'; scene.add(root);
  const walls2d = [], solids = [], dynamic = [], lights = [];
  const box3 = new THREE.Box3(), tmp = new THREE.Matrix4();

  // ---- the built site, with its baked light
  if (assets.site) {
    const site = assets.site; root.add(site);
    const lm = assets.lightmap, scale = (P.lightmap?.scale || 1) * .3, lit = new Map();
    site.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = !/terrain|ground|road|apron|floor|carpark|pad|backyard|killtile|drain|straw/i.test(o.name); o.receiveShadow = true;
      for (const m of [].concat(o.material)) {
        if (m.map) m.map.anisotropy = 8;
        { const wet = { killtile: .38, floor: .55, apron: .8 }[m.name] ?? (m.name?.startsWith('blood_') ? .6 : null); if (wet !== null && !m.userData.wet) { m.userData.wet = true; m.roughness *= wet; } }
        if (/^(gravel|apron|grass)$/.test(m.name) && !m.userData.toned) { m.userData.toned = true; m.color.multiplyScalar(m.name === 'gravel' ? .38 : m.name === 'grass' ? .42 : .7); }
        if (m.transparent) { m.depthWrite = false; m.side = THREE.DoubleSide; }
        if (lm && (o.userData.lightmap || o.parent?.userData?.lightmap) && o.geometry.attributes.uv1) {
          // Its own copy: the same material may also be on unbaked kit, which has no lightmap UVs.
          if (!lit.has(m)) { const c = m.clone(); c.lightMap = lm; c.lightMapIntensity = scale; c.envMapIntensity = .2; lit.set(m, c); }
          if (Array.isArray(o.material)) o.material = o.material.map(x => x === m ? lit.get(m) : x); else o.material = lit.get(m);
        }
      }
    });
  }
  const mat = { wood: null };
  { const loader = new THREE.TextureLoader(), map = loader.load('/assets/castle/planks.webp'), nor = loader.load('/assets/castle/planks-nor.webp');
    for (const t of [map, nor]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } map.colorSpace = THREE.SRGBColorSpace;
    mat.wood = new THREE.MeshStandardMaterial({ map, normalMap: nor, color: 0xa79a8c, roughness: .85 }); }

  // ---- collision
  for (const s of data.solids) {
    const [x0, y0, z0, x1, y1, z1] = s.b;
    physics.staticBox([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2]);
    solids.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: y1, bottom: y0, roof: false, surface: s.s });
    if (s.w && y1 - y0 > .25 && y0 < 1 && y1 > .3) walls2d.push([x0, x1, z0, z1]);
  }
  for (const r of data.ramps) physics.staticBox(r.c, r.h, r.q);

  // ---- helpers for props
  function place(name, x, y, z, { yaw = 0, scale = 1, part = null, pitch = 0, cast = true } = {}) {
    const m = assets.clone(name, part); if (!m) return null;
    m.scale.setScalar(scale); m.rotation.set(pitch, yaw, 0); m.position.set(x, y, z);
    if (!cast) m.traverse(o => { o.castShadow = false; });
    root.add(m); return m;
  }
  function looseModel(name, x, z, { yaw = 0, scale = 1, mass = 30, part = null, y = 0, shrink = .92 } = {}) {
    const model = assets.clone(name, part); if (!model) return null;
    model.scale.setScalar(scale); model.updateMatrixWorld(true); box3.setFromObject(model);
    const size = box3.getSize(new THREE.Vector3()), centre = box3.getCenter(new THREE.Vector3());
    const holder = new THREE.Group(); model.position.sub(centre); holder.add(model); root.add(holder);
    const half = [Math.max(.06, size.x / 2 * shrink), Math.max(.06, size.y / 2 * shrink), Math.max(.06, size.z / 2 * shrink)];
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const body = physics.dynamicBox([x, y + size.y / 2 + .02, z], half, { mass, friction: .7, restitution: .12, angularDamping: .3, quat: [q.x, q.y, q.z, q.w] });
    const item = { mesh: holder, body, home: [x, y + size.y / 2, z] }; dynamic.push(item); return item;
  }
  function loose(center, half, material, mass) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(half[0] * 2, half[1] * 2, half[2] * 2), material); m.castShadow = m.receiveShadow = true; root.add(m);
    const body = physics.dynamicBox(center, half, { mass, friction: .6, restitution: .15, angularDamping: .25 });
    const item = { mesh: m, body, home: [...center] }; dynamic.push(item); return item;
  }
  // Many copies of one model (or one of its parts) in a single draw call per mesh.
  // Copies are split into 48 m tiles so each tile is culled on its own (one batch spanning the whole map would be
  // drawn in full for every camera and every shadow).
  function instanced(node, placements, { cast = true, tile = 48 } = {}) {
    if (!node || !placements.length) return;
    node.updateMatrixWorld(true);
    const tiles = new Map(), pos = new THREE.Vector3();
    for (const p of placements) { pos.setFromMatrixPosition(p); const k = Math.floor(pos.x / tile) + ':' + Math.floor(pos.z / tile); if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(p); }
    node.traverse(m => {
      if (!m.isMesh) return;
      for (const list of tiles.values()) {
        const im = new THREE.InstancedMesh(m.geometry, m.material, list.length);
        list.forEach((p, i) => im.setMatrixAt(i, tmp.multiplyMatrices(p, m.matrixWorld)));
        im.castShadow = cast; im.receiveShadow = true; im.computeBoundingSphere(); root.add(im);
      }
    });
  }
  // The named variants inside a model (Poly Haven packs several clumps or shrubs in one file).
  const variants = name => { const m = assets.models.get(name); if (!m) return []; const out = []; m.traverse(o => { if (o !== m && o.name && (o.isMesh || o.children.some(k => k.isMesh)) && (o.parent === m || o.parent?.parent === m && !o.parent.isMesh && o.parent.children.length === 1)) out.push(o.name); }); return out.length > 1 ? out : []; };

  for (const [name, x, y, z, yaw, scale, part] of data.props) place(name, x, y, z, { yaw, scale, part });
  for (const [name, x, z, yaw, scale, mass, part, y] of data.loose) looseModel(name, x, z, { yaw, scale, mass, part, y });

  // Countryside: each model's variants share the copies out; grass and weeds cast no shadow.
  for (const [name, list] of Object.entries(data.scatter)) {
    const kinds = variants(name), groups = new Map();
    list.forEach((p, i) => { const v = kinds.length ? kinds[i % kinds.length] : null; if (!groups.has(v)) groups.set(v, []); groups.get(v).push(p); });
    for (const [v, ps] of groups) {
      const node = assets.clone(name, v); if (!node) continue;
      node.position.set(0, 0, 0);
      instanced(node, ps.map(([x, y, z, yaw, s]) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s))), { cast: false });   // plants: no shadow casting (they are outdoors at night; casting would redraw them per shadow)
    }
  }

  // Chain-link fence panels along the perimeter runs.
  const panel = assets.clone('modular_chainlink_fence', 'modular_chainlink_fence');
  if (panel) {
    box3.setFromObject(panel); const width = Math.max(.5, box3.max.x - box3.min.x), start = box3.min.x, placements = [];
    for (const [x1, z1, x2, z2] of P.fence) {
      const length = Math.hypot(x2 - x1, z2 - z1), count = Math.ceil(length / width), dx = (x2 - x1) / length, dz = (z2 - z1) / length, stretch = length / (count * width);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-dz, dx));
      for (let i = 0; i < count; i++) placements.push(new THREE.Matrix4().compose(new THREE.Vector3(x1 + dx * (i * width * stretch - start * stretch), 0, z1 + dz * (i * width * stretch - start * stretch)), q, new THREE.Vector3(stretch, 1, 1)));
    }
    instanced(panel, placements, { cast: false });
  }

  // ---- the pen gate (five loose planks: a charge smashes them) and the red lever that drops them
  const gate = [], G = P.gate;
  for (let i = 0; i < 5; i++) gate.push(loose([G.x, .35 + i * .3, G.z], [.07, .13, G.half], mat.wood, 28));
  const lever = new THREE.Group(); lever.position.set(P.lever.x, 0, P.lever.z); root.add(lever);
  { const paint = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: .55, metalness: .3 }), dark = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: .5, metalness: .7 }), grip = new THREE.MeshStandardMaterial({ color: 0xc4130d, roughness: .45, emissive: 0x4a0603 });
    const part = (g, m, x, y, z, sx, sy, sz, parent = lever) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; parent.add(o); return o; };
    const cube = new THREE.BoxGeometry(1, 1, 1), rod = new THREE.CylinderGeometry(.5, .5, 1, 12);
    part(cube, dark, 0, .04, 0, .5, .08, .5); part(cube, paint, 0, .55, 0, .26, 1.0, .2); part(cube, dark, 0, 1.0, 0, .32, .1, .26);
    const arm = new THREE.Group(); arm.position.set(0, .82, .13); arm.rotation.x = -.85; lever.add(arm); lever.userData.arm = arm;
    part(rod, dark, 0, .36, 0, .045, .72, .045, arm); part(rod, grip, 0, .74, 0, .09, .2, .09, arm);
    lever.userData.sign = part(cube, new THREE.MeshBasicMaterial({ color: 0xff3020 }), 0, 2.25, 0, .16, .16, .16);
    const l = new THREE.PointLight(0xff3a20, 14, 9, 1.6); l.position.set(0, 2.2, 0); lever.add(l); lever.userData.light = l; }
  physics.staticBox([P.lever.x, .55, P.lever.z], [.14, .55, .12]);
  let opened = false, leverPulled = 0;
  function openGate() {
    leverPulled = performance.now(); lever.userData.sign.material.color.set(0x35ff5a); lever.userData.light.color.set(0x35ff5a);
    gate.forEach((g, i) => { g.body.wake(); g.body.impulse(-60 - i * 14, 30, (i - 2) * 26); }); opened = true;
  }
  const gateBroken = () => opened || gate.some(g => { const t = g.body.read().p; return Math.hypot(t[0] - g.home[0], t[2] - g.home[2]) > 1.2; });

  // ---- light: the night sky as image-based light (dimmed: the baked map carries the ambient on the architecture),
  // a cold moon whose shadow follows the action, and the site's lamps (tubes stutter)
  if (assets.sky) { scene.environment = assets.sky; scene.environmentIntensity = .25; /* clamped sky: reflections and a little fill */ scene.background = assets.sky; scene.backgroundIntensity = .22; scene.backgroundBlurriness = .04; }
  scene.add(new THREE.HemisphereLight(0x8fa4b5, 0x1d1b18, .35));
  const moon = new THREE.DirectionalLight(0xbfd2e6, 2.4); moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048); Object.assign(moon.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 10, far: 190 }); moon.shadow.bias = -.0003; moon.shadow.normalBias = .04;
  const moonOffset = new THREE.Vector3(-38, 60, -30); moon.position.copy(moonOffset); scene.add(moon, moon.target);
  const glow = new THREE.BoxGeometry(1, 1, 1);
  // Ceiling tubes indoors are spotlights pointing down that cast shadows (rails, chains, carcasses, people throw real
  // shadows on the floor); the rest are point lights. `shadows` is how many may cast (0 on slow devices).
  let shadowBudget = shadows;
  for (const L of data.lights) {
    const tube = L.b && L.b[0] > 1 && indoors(L.p[0], L.p[2]);
    const l = tube ? new THREE.SpotLight(L.c, L.i * 1.6, L.d * 1.3, 1.25, .85, 1.6) : new THREE.PointLight(L.c, L.i, L.d, 1.8);
    l.position.set(...L.p); scene.add(l);
    if (tube) { l.target.position.set(L.p[0], 0, L.p[2]); scene.add(l.target);
      if (shadowBudget-- > 0) { l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -.0006; l.shadow.normalBias = .03; l.shadow.camera.near = .2; l.shadow.camera.far = L.d * 1.3; } }
    const bulb = new THREE.Mesh(glow, new THREE.MeshBasicMaterial({ color: L.c })); bulb.position.set(...L.p); bulb.scale.set(...(L.b || [.28, .08, .28])); root.add(bulb);
    lights.push({ light: l, bulb, base: L.i, flicker: L.f, phase: Math.random() * 10 });
  }

  // ---- queries
  function blocked(x, z, r = .35) { for (const w of walls2d) if (x > w[0] - r && x < w[1] + r && z > w[2] - r && z < w[3] + r) return true; return false; }
  function walk(p, dx, dz, r) {
    if (!blocked(p.x + dx, p.z + dz, r)) { p.x += dx; p.z += dz; return true; }
    if (!blocked(p.x + dx, p.z, r)) { p.x += dx; return true; }
    if (!blocked(p.x, p.z + dz, r)) { p.z += dz; return true; }
    return false;
  }
  function sightBlocked(x1, z1, x2, z2) {
    const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / .6));
    for (let i = 1; i < n; i++) { const x = x1 + (x2 - x1) * i / n, z = z1 + (z2 - z1) * i / n; for (const b of solids) if (b.top > 1.45 && b.bottom < 1.2 && b.surface !== false && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true; }
    return false;
  }
  const solidAt = (x, y, z, pad = .15) => { for (const b of solids) if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad && y < b.top + pad && y > b.bottom - pad) return true; return false; };
  // The lowest ceiling over a point (Infinity outdoors), and whether a point is under a roof.
  const ceilingAt = (x, z) => { let y = Infinity; for (const c of data.ceilings) if (x > c[0] && x < c[1] && z > c[2] && z < c[3]) y = Math.min(y, c[4]); return y; };
  function indoors(x, z) { return data.interiors.some(c => x > c[0] && x < c[1] && z > c[2] && z < c[3]); }

  function update(time, focus = null) {
    for (const d of dynamic) { const t = d.body.read(); d.mesh.position.set(t.p[0], t.p[1], t.p[2]); d.mesh.quaternion.set(t.q[0], t.q[1], t.q[2], t.q[3]); }
    for (const l of lights) if (l.flicker) {
      const n = Math.sin(time * 31 + l.phase) * Math.sin(time * 7.3 + l.phase * 2), drop = n > .82 - l.flicker * .25 ? .15 : 1;
      l.light.intensity = l.base * drop * (.92 + .08 * Math.sin(time * 60 + l.phase)); l.bulb.material.color.setScalar(drop).multiply(l.light.color);
    }
    const pulled = leverPulled ? Math.min(1, (performance.now() - leverPulled) / 260) : 0; lever.userData.arm.rotation.x = -.85 + pulled * 1.7; if (!leverPulled) lever.userData.light.intensity = 10 + Math.sin(time * 4) * 5;
    if (focus) { const fx = Math.round(focus.x / 2) * 2, fz = Math.round(focus.z / 2) * 2; if (moon.target.position.x !== fx || moon.target.position.z !== fz) { moon.target.position.set(fx, 0, fz); moon.position.set(fx + moonOffset.x, moonOffset.y, fz + moonOffset.z); moon.target.updateMatrixWorld(); } }
  }

  return {
    root, mat, blocked, walk, update, gateBroken, openGate, solids, solidAt, sightBlocked, ceilingAt, indoors, walls2d, dynamic, loose, looseModel, place,
    gatePost: P.lever, spawn: P.spawn, cowSpawn: P.cowSpawn, exit: P.exit, gateZ: P.gateZ, bounds: P.bounds, pen: P.pen, escape: P.escape, truckStart: P.truckStart, patrols: P.patrols,
  };
}
