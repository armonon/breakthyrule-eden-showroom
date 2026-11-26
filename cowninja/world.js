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
        if (/^(gravel|apron|grass|mud|tracks)$/.test(m.name) && !m.userData.toned) { m.userData.toned = true; m.color.multiplyScalar({ gravel: .38, grass: .42, apron: .7, mud: .4, tracks: .5 }[m.name]); if (m.name === 'mud') m.roughness = Math.min(m.roughness, .3); }
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
    // Generated pieces come with their origin anywhere: they are anchored by their bounding box instead, at the base
    // centre (standing things) or, with part 'top', at the top centre (hanging things).
    if (name.startsWith('modly:')) {
      const model = assets.clone(name); if (!model) return null;
      model.updateMatrixWorld(true); box3.setFromObject(model);
      const c = box3.getCenter(new THREE.Vector3()); model.position.set(-c.x, part === 'top' ? -box3.max.y : -box3.min.y, -c.z);
      const holder = new THREE.Group(); holder.add(model); holder.scale.setScalar(scale); holder.rotation.set(pitch, yaw, 0); holder.position.set(x, y, z);
      root.add(holder); return holder;
    }
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

  // ---- gates and their levers. Every enclosure (the holding pen in the hall, six pens on the farm) has a barred
  // gate and a red lever beside it; the main gate has its lever in the gatehouse. A closed gate is a barrier for
  // cows, the rider and anyone on foot (who can climb over). A lever swings its gate open; enough force breaks it.
  const gates = [], gateListeners = [];
  const steel = new THREE.MeshStandardMaterial({ color: 0x4d5357, roughness: .5, metalness: .75 }), rust = new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: .8, metalness: .4 });
  const leverParts = { paint: new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: .55, metalness: .3 }), dark: new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: .5, metalness: .7 }), grip: new THREE.MeshStandardMaterial({ color: 0xc4130d, roughness: .45, emissive: 0x4a0603 }),
    cube: new THREE.BoxGeometry(1, 1, 1), rod: new THREE.CylinderGeometry(.5, .5, 1, 12) };
  function makeLever(at, big) {
    const lever = new THREE.Group(), base = at.y || 0; lever.position.set(at.x, base, at.z); root.add(lever);
    const { paint, dark, grip, cube, rod } = leverParts;
    const part = (g, m, x, y, z, sx, sy, sz, parent = lever) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; parent.add(o); return o; };
    part(cube, dark, 0, .04, 0, .5, .08, .5); part(cube, paint, 0, .55, 0, .26, 1.0, .2); part(cube, dark, 0, 1.0, 0, .32, .1, .26);
    const arm = new THREE.Group(); arm.position.set(0, .82, .13); arm.rotation.x = -.85; lever.add(arm);
    part(rod, dark, 0, .36, 0, .045, .72, .045, arm); part(rod, grip, 0, .74, 0, .09, .2, .09, arm);
    const sign = part(cube, new THREE.MeshBasicMaterial({ color: 0xff3020 }), 0, 2.25, 0, .16, .16, .16);
    // Only the hall's and the main gate's levers carry a real light (lights are costly); the rest glow.
    let light = null; if (big) { light = new THREE.PointLight(0xff3a20, 14, 9, 1.6); light.position.set(0, 2.2, 0); lever.add(light); }
    physics.staticBox([at.x, base + .55, at.z], [.14, .55, .12]);
    return { group: lever, arm, sign, light, pulled: 0 };
  }
  function makeLeaf(g, from, to, height) {   // one barred leaf hinged at `from`, reaching to `to` (distances along the gate)
    const hinge = new THREE.Group(), along = g.axis === 'x' ? [1, 0] : [0, 1], len = Math.abs(to - from), dirn = Math.sign(to - from);
    hinge.position.set(g.x + along[0] * from, 0, g.z + along[1] * from); hinge.rotation.y = Math.atan2(-along[1] * dirn, along[0] * dirn); root.add(hinge);
    const bar = (x, y, sx, sy, m = steel) => { const o = new THREE.Mesh(leverParts.cube, m); o.position.set(x, y, 0); o.scale.set(sx, sy, .06); o.castShadow = true; hinge.add(o); };
    const rails = Math.max(4, Math.round(height / .32)); for (let i = 0; i < rails; i++) bar(len / 2, .22 + i * (height - .3) / (rails - 1), len, .07);
    bar(.04, height / 2, .09, height); bar(len - .04, height / 2, .09, height); bar(len / 2, height / 2, .07, height, rust);
    { const o = new THREE.Mesh(leverParts.cube, rust); o.position.set(len / 2, height / 2, 0); o.scale.set(Math.hypot(len, height - .3), .06, .05); o.rotation.z = Math.atan2(height - .3, len); hinge.add(o); }
    return { hinge, rest: hinge.rotation.y, dirn, len };
  }
  for (const data of P.gates || [{ id: 'hall', kind: 'hall', x: P.gate.x, z: P.gate.z, axis: 'z', half: P.gate.half, n: [-1, 0], lever: P.lever, strength: 30 }]) {
    const g = { ...data, open: false, broken: false, openedAt: 0 }, height = g.kind === 'main' ? 2.3 : 1.45, t = .14;
    const hx = g.axis === 'x' ? g.half : t, hz = g.axis === 'x' ? t : g.half;
    g.wall = [g.x - hx, g.x + hx, g.z - hz, g.z + hz]; walls2d.push(g.wall);
    g.solid = { minX: g.x - hx, maxX: g.x + hx, minZ: g.z - hz, maxZ: g.z + hz, top: height, bottom: 0, roof: false, surface: false, gate: g }; solids.push(g.solid);
    g.body = physics.staticBox([g.x, height / 2, g.z], [hx, height / 2, hz]);
    g.leaves = g.kind === 'main' ? [makeLeaf(g, -g.half, 0, height), makeLeaf(g, g.half, 0, height)] : [makeLeaf(g, -g.half, g.half, height)];
    g.post = makeLever(g.lever, g.kind !== 'pen'); g.height = height;
    gates.push(g);
  }
  // Open a gate: by its lever (swings clear) or by force (`broken`: the leaves burst into loose bars along `dir`).
  function openGate(id = 'hall', { broken = false, dir = null, power = 0 } = {}) {
    const g = gates.find(o => o.id === id); if (!g || g.open) return false;
    g.open = true; g.broken = broken; g.openedAt = performance.now();
    const i = walls2d.indexOf(g.wall); if (i >= 0) walls2d.splice(i, 1);
    g.solid.open = true; g.solid.top = -10; g.solid.bottom = -11; g.solid.minX = g.solid.maxX = 1e6; g.body.remove(); g.body = null;
    g.post.pulled = g.openedAt; g.post.sign.material.color.set(0x35ff5a); g.post.light?.color.set(0x35ff5a);
    if (broken) {
      const d = dir || g.n, along = g.axis === 'x' ? [1, 0] : [0, 1], push = 40 + Math.min(80, power);
      for (const leaf of g.leaves) leaf.hinge.visible = false;
      const bars = g.kind === 'main' ? 9 : 5;
      for (let k = 0; k < bars; k++) { const s = (k / (bars - 1) * 2 - 1) * (g.half - .8), y = .4 + (k % 3) * .45;
        const piece = loose([g.x + along[0] * s, y, g.z + along[1] * s], g.axis === 'x' ? [.75, .05, .04] : [.04, .05, .75], steel, 16);
        piece.body.impulse(d[0] * push * (1 + (k % 3) * .3) + along[0] * (k % 2 ? 20 : -20), 30 + (k % 4) * 14, d[1] * push * (1 + (k % 3) * .3) + along[1] * (k % 2 ? 20 : -20)); piece.body.spinImpulse((k % 3 - 1) * 6, (k % 2 ? 5 : -5), (k % 4 - 1.5) * 4); }
    }
    for (const fn of gateListeners) fn(g);
    return true;
  }
  const closedAt = (g, x, z, r) => !g.open && x > g.wall[0] - r && x < g.wall[1] + r && z > g.wall[2] - r && z < g.wall[3] + r;
  const gateAt = (x, z, r = .4) => gates.find(g => closedAt(g, x, z, r)) || null;
  const gateNear = (x, z, r = 6) => { let best = null, d = r; for (const g of gates) if (!g.open) { const q = Math.hypot(Math.max(0, Math.abs(x - g.x) - (g.axis === 'x' ? g.half : 0)), Math.max(0, Math.abs(z - g.z) - (g.axis === 'z' ? g.half : 0))); if (q < d) { d = q; best = g; } } return best; };
  const leverNear = (x, z, r = 2.4, y = null) => { let best = null, d = r; for (const g of gates) if (!g.open && (y == null || Math.abs(y - (g.lever.y || 0)) < 1.2)) { const q = Math.hypot(x - g.lever.x, z - g.lever.z); if (q < d) { d = q; best = g; } } return best; };
  const gateBroken = () => gates[0].open;
  // The safe ground beyond the main gate: a ring of marker lamps where rescued cows are counted.
  { const E = P.exit, lamp = new THREE.MeshBasicMaterial({ color: 0x6dffa0 }), post = new THREE.CylinderGeometry(.05, .05, 1.2, 6);
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, o = new THREE.Mesh(post, lamp); o.position.set(E.x + Math.cos(a) * E.radius, .6, E.z + Math.sin(a) * E.radius); root.add(o); } }

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
  // Is there something solid at eye height on the straight line between two points? An exact test of the line
  // against each box (thin walls count; a sampled test used to step over them).
  function sightBlocked(x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1;
    for (const b of solids) {
      if (!(b.top > 1.45 && b.bottom < 1.2 && b.surface !== false)) continue;
      let t0 = .02, t1 = .98;
      if (Math.abs(dx) < 1e-9) { if (x1 <= b.minX || x1 >= b.maxX) continue; } else { const a = (b.minX - x1) / dx, c = (b.maxX - x1) / dx; t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c)); if (t0 > t1) continue; }
      if (Math.abs(dz) < 1e-9) { if (z1 <= b.minZ || z1 >= b.maxZ) continue; } else { const a = (b.minZ - z1) / dz, c = (b.maxZ - z1) / dz; t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c)); if (t0 > t1) continue; }
      return true;
    }
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
    const now = performance.now();
    for (const g of gates) {
      const post = g.post, pulled = post.pulled ? Math.min(1, (now - post.pulled) / 260) : 0; post.arm.rotation.x = -.85 + pulled * 1.7;
      if (!g.open) { const pulse = .65 + .35 * Math.sin(time * 4 + g.x); post.sign.material.color.setRGB(pulse, pulse * .19, pulse * .12); if (post.light) post.light.intensity = 10 + Math.sin(time * 4) * 5; }
      else if (!g.broken) { const k = Math.min(1, (now - g.openedAt) / 900), ease = 1 - (1 - k) * (1 - k), swing = (g.axis === 'x' ? -g.n[1] : g.n[0]) * 1.75;
        for (const leaf of g.leaves) leaf.hinge.rotation.y = leaf.rest + swing * leaf.dirn * ease; }
    }
    if (focus) { const fx = Math.round(focus.x / 2) * 2, fz = Math.round(focus.z / 2) * 2; if (moon.target.position.x !== fx || moon.target.position.z !== fz) { moon.target.position.set(fx, 0, fz); moon.position.set(fx + moonOffset.x, moonOffset.y, fz + moonOffset.z); moon.target.updateMatrixWorld(); } }
  }

  return {
    root, mat, blocked, walk, update, gateBroken, openGate, gates, gateAt, gateNear, leverNear, onGate: fn => gateListeners.push(fn), pens: P.pens || [], solids, solidAt, sightBlocked, ceilingAt, indoors, walls2d, dynamic, loose, looseModel, place,
    grips: data.grips || [], hay: data.hay || [], roofSteps: data.roofSteps || [],
    inHay: (x, z) => (data.hay || []).some(h => Math.hypot(x - h[0], z - h[1]) < h[2] * .85),
    gatePost: P.lever, spawn: P.spawn, cowSpawn: P.cowSpawn, exit: P.exit, gateZ: P.gateZ, bounds: P.bounds, pen: P.pen, escape: P.escape, truckStart: P.truckStart, patrols: P.patrols,
  };
}
