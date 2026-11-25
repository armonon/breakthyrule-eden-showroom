// The COWNinja yard: a chain-link compound around a working slaughterhouse. The layout and every collision shape are
// the same boxes as the grey-box (so the mission plays identically); what you see is real surfaces and models:
//   mud yard and a tarmac road out, a concrete apron, tiled kill floor, factory walls under a corrugated roof
//   sodium street lamps, fluorescent tubes that stutter, a red pen lamp, a cold moon that follows the action
//   carcasses on the overhead rail, gurneys, troughs, barrels, crates, tyres, gas bottles: the loose ones are bodies
// Units are metres; +x east, -z north (the way out).
import * as THREE from 'three/webgpu';

// A box whose texture repeats every `tile` metres on every face (BoxGeometry faces: +x -x +y -y +z -z, 4 verts each).
function tiledBox(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let face = 0; face < 6; face++) for (let i = 0; i < 4; i++) { const k = face * 4 + i; uv.setXY(k, uv.getX(k) * spans[face][0] / tile, uv.getY(k) * spans[face][1] / tile); }
  return g;
}

export function createWorld({ scene, physics, assets }) {
  const root = new THREE.Group(); root.name = 'COWNinja yard'; scene.add(root);
  const S = (name, options) => assets.surface(name, options);
  const mat = {
    ground: S('muddy_tracks', { color: 0x8d8a84 }), road: S('asphalt_02', { color: 0x9a9a9a }),
    concrete: S('factory_wall', { color: 0xb9b6ae }), floor: S('concrete_floor_worn_001', { color: 0xa8a6a0 }),
    tile: S('dirty_tiles', { roughness: .55 }), wallTile: S('long_white_tiles', { color: 0xc9cdc6, roughness: .6 }),
    steel: S('rusty_metal_02', { color: 0x9b9d9e }), roof: S('rusty_corrugated_iron', { color: 0x8c8a86 }),
    hazard: new THREE.MeshStandardMaterial({ color: 0xb08a1e, roughness: .7 }),
    rust: S('rusty_metal_02', { color: 0xb07a5c }),
    flesh: new THREE.MeshStandardMaterial({ color: 0x6e1512, roughness: .32, metalness: 0 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xc9bfa6, roughness: .6 }),
  };
  // The main game's castle planks for the pen gate and anything wooden.
  { const loader = new THREE.TextureLoader(), map = loader.load('/assets/castle/planks.webp'), nor = loader.load('/assets/castle/planks-nor.webp');
    for (const t of [map, nor]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1); } map.colorSpace = THREE.SRGBColorSpace;
    mat.wood = new THREE.MeshStandardMaterial({ map, normalMap: nor, color: 0xa79a8c, roughness: .85 }); }
  const TILE = { [mat.ground.uuid]: 5, [mat.road.uuid]: 4, [mat.concrete.uuid]: 3.2, [mat.floor.uuid]: 3, [mat.tile.uuid]: 2, [mat.wallTile.uuid]: 1.6, [mat.steel.uuid]: 1.5, [mat.rust.uuid]: 1.5, [mat.roof.uuid]: 2.4, [mat.wood.uuid]: 1.4 };
  const walls2d = [];   // [minX, maxX, minZ, maxZ] of anything walkers cannot pass
  const solids = [];    // {minX,maxX,minZ,maxZ,top,bottom}: every static box, for the on-foot movement and the camera
  const dynamic = [];   // {mesh, body} synced every frame
  const lights = [];    // flickering practicals
  const tmp = new THREE.Matrix4(), box3 = new THREE.Box3(), v3 = new THREE.Vector3();

  function block(center, half, material, { solid = true, cast = true, walker = true, visible = true } = {}) {
    let m = null;
    if (visible) { m = new THREE.Mesh(tiledBox(half[0] * 2, half[1] * 2, half[2] * 2, TILE[material.uuid] || 2), material); m.position.set(...center); m.castShadow = cast; m.receiveShadow = true; root.add(m); }
    if (solid) { physics.staticBox(center, half); if (walker && half[1] > .25) { walls2d.push([center[0] - half[0], center[0] + half[0], center[2] - half[2], center[2] + half[2]]); solids.push({ minX: center[0] - half[0], maxX: center[0] + half[0], minZ: center[2] - half[2], maxZ: center[2] + half[2], top: center[1] + half[1], bottom: center[1] - half[1] }); } }
    return m;
  }
  // A wall between two points (axis-aligned), `h` tall.
  const wall = (x1, z1, x2, z2, h, material = mat.concrete, t = .3, options) =>
    block([(x1 + x2) / 2, h / 2, (z1 + z2) / 2], [Math.abs(x2 - x1) / 2 + t / 2, h / 2, Math.abs(z2 - z1) / 2 + t / 2], material, options);
  function loose(center, half, material, mass) {
    const m = new THREE.Mesh(tiledBox(half[0] * 2, half[1] * 2, half[2] * 2, 1.4), material); m.castShadow = m.receiveShadow = true; root.add(m);
    const body = physics.dynamicBox(center, half, { mass, friction: .6, restitution: .15, angularDamping: .25 });
    const item = { mesh: m, body, home: [...center] }; dynamic.push(item); return item;
  }
  // A model placed as scenery (no physics of its own): position is where its base centre goes.
  function place(name, x, y, z, { yaw = 0, scale = 1, part = null, pitch = 0, cast = true } = {}) {
    const m = assets.clone(name, part); if (!m) return null;
    m.scale.setScalar(scale); m.rotation.set(pitch, yaw, 0); m.position.set(x, y, z);
    if (!cast) m.traverse(o => { o.castShadow = false; });
    root.add(m); return m;
  }
  // A model that is a loose physics body: its bounding box becomes the body, the model rides it.
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
  // Many copies of one model in a single draw call per mesh. `placements` are Matrix4.
  function instanced(node, placements, { cast = true } = {}) {
    if (!node || !placements.length) return;
    node.updateMatrixWorld(true);
    node.traverse(m => {
      if (!m.isMesh) return;
      const im = new THREE.InstancedMesh(m.geometry, m.material, placements.length);
      placements.forEach((p, i) => im.setMatrixAt(i, tmp.multiplyMatrices(p, m.matrixWorld)));
      im.castShadow = cast; im.receiveShadow = true; im.computeBoundingSphere(); root.add(im);
    });
  }

  // Ground: mud, the tarmac road through the north gate, a concrete apron, the building's floor, the kill-floor tiles.
  block([0, -.5, 0], [110, .5, 110], mat.ground, { cast: false, walker: false });
  block([0, .012, -64], [5.2, .012, 46], mat.road, { solid: false, cast: false });
  block([0, .014, 1], [14, .014, 9], mat.floor, { solid: false, cast: false });
  block([0, .016, 28], [24, .016, 18], mat.floor, { solid: false, cast: false });
  block([-9, .022, 30], [14.6, .022, 15.6], mat.tile, { solid: false, cast: false });

  // Yard fence with the exit gap in the north side: chain-link panels over the same collision walls.
  const F = 2.4;
  const runs = [[-40, -50, -6, -50], [6, -50, 40, -50], [-40, -50, -40, 50], [40, -50, 40, 50], [-40, 50, 40, 50]];
  const panel = assets.clone('modular_chainlink_fence', 'modular_chainlink_fence');
  for (const [x1, z1, x2, z2] of runs) wall(x1, z1, x2, z2, F, mat.steel, .3, { visible: !panel });
  if (panel) {
    box3.setFromObject(panel); const width = Math.max(.5, box3.max.x - box3.min.x), start = box3.min.x, placements = [];
    for (const [x1, z1, x2, z2] of runs) {
      const length = Math.hypot(x2 - x1, z2 - z1), count = Math.ceil(length / width), dx = (x2 - x1) / length, dz = (z2 - z1) / length, stretch = length / (count * width);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-dz, dx));
      for (let i = 0; i < count; i++) placements.push(new THREE.Matrix4().compose(new THREE.Vector3(x1 + dx * (i * width * stretch - start * stretch), 0, z1 + dz * (i * width * stretch - start * stretch)), q, new THREE.Vector3(stretch, 1, 1)));
    }
    instanced(panel, placements, { cast: false });
  }
  for (const x of [-6, 6]) block([x, 1.8, -50], [.25, 1.8, .25], mat.hazard);
  for (const s of [-1, 1]) place('large_iron_gate', s * 6.2, 0, -52.6, { yaw: s * 1.25, scale: 1.25 });

  // Slaughterhouse shell: front wall with a doorway, side and back walls, the loading corridor, the pen, a roof.
  const H = 6.5;
  wall(-24, 10, -4, 10, H); wall(4, 10, 24, 10, H);            // front, door 8 m wide
  wall(-24, 10, -24, 46, H); wall(-24, 46, 24, 46, H);
  // East wall with a staff door (z 12.2..14): the quiet way in, a few steps from the pen.
  wall(24, 10, 24, 12.2, H); wall(24, 14, 24, 46, H); block([24, 4.4, 13.1], [.15, 2.1, .9], mat.concrete, { solid: false });
  block([0, 5.2, 10], [4, 1.3, .15], mat.concrete, { solid: false });   // lintel over the door
  block([0, H + .12, 28], [24.6, .12, 18.6], mat.roof, { solid: false });
  for (const z of [16, 22, 28, 34, 40]) block([0, H - .25, z], [24, .14, .1], mat.steel, { solid: false, cast: false }); // roof trusses
  wall(-4, 10, -4, 22, 3.2); wall(4, 10, 4, 22, 3.2);          // corridor
  // White tile to head height on the inside of the kill floor walls (visual skins just inside the shell).
  for (const [x1, z1, x2, z2] of [[-23.8, 10.2, -23.8, 45.8], [-23.8, 45.8, 7.8, 45.8], [-23.8, 10.2, -4.2, 10.2]])
    block([(x1 + x2) / 2, 1.15, (z1 + z2) / 2], [Math.abs(x2 - x1) / 2 + .03, 1.15, Math.abs(z2 - z1) / 2 + .03], mat.wallTile, { solid: false, cast: false });
  wall(8, 28, 8, 33.4, 1.5, mat.steel, .16); wall(8, 38.6, 8, 44, 1.5, mat.steel, .16); // pen west side, gate gap z 33.4..38.6
  wall(8, 28, 22, 28, 1.5, mat.steel, .16); wall(8, 44, 22, 44, 1.5, mat.steel, .16); wall(22, 28, 22, 44, 1.5, mat.steel, .16);
  // The overhead rail and its hooks down the kill floor, a carcass on most of them, and stun boxes on the west wall.
  block([-12, 4.6, 30], [.08, .08, 14], mat.steel, { solid: false });
  let hung = 0;
  for (let z = 18; z <= 42; z += 3) {
    block([-12, 4.1, z], [.03, .5, .03], mat.steel, { solid: false, cast: false }); block([-12, 3.56, z], [.12, .05, .03], mat.rust, { solid: false, cast: false });
    if (z % 2 === 0 && z !== 30) continue;
    const carcass = assets.skinned('cow'); if (!carcass) continue;
    // Hung by the hind legs, head down, skinned: the same animal you are riding.
    carcass.traverse(o => { if (o.isMesh) { o.material = /eye/i.test(o.material.name) ? mat.bone : mat.flesh; o.castShadow = true; o.frustumCulled = false; } });
    const bone = name => carcass.getObjectByName(name);
    for (const [name, x] of [['bl-thighL', .9], ['bl-thighR', .9], ['bl-gaskinL', -.5], ['bl-gaskinR', -.5], ['fl-shoulderL', -.5], ['fl-shoulderR', -.5], ['neck', .35], ['head', .3]]) { const b = bone(name); if (b) b.rotation.x += x; }
    carcass.rotation.set(-Math.PI / 2 - .05, (hung++ % 2 ? .3 : -.2), 0); carcass.position.set(-12, 3.5, z + .9); carcass.scale.setScalar(.98); root.add(carcass);
  }
  for (const z of [24, 31, 38]) { wall(-22, z - 2, -17, z - 2, 2, mat.steel, .16); wall(-22, z + 2, -17, z + 2, 2, mat.steel, .16); }

  // Loading dock (west yard) with a ramp up its north end and a shutter door behind it.
  block([-31, .7, 0], [5, .7, 9], mat.floor);
  { const angle = Math.atan2(1.4, 7), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -angle);
    const m = new THREE.Mesh(tiledBox(6, .2, 7.2, 1.5), mat.steel); m.position.set(-31, .62, -12.4); m.quaternion.copy(q); m.castShadow = m.receiveShadow = true; root.add(m);
    physics.staticBox([-31, .62, -12.4], [3, .1, 3.6], [q.x, q.y, q.z, q.w]); }
  place('rollershutter_door', -25.1, 0, 20.5, { yaw: -Math.PI / 2, scale: 1.5, part: 'rollershutter_door' });
  place('rollershutter_door', 25.1, 0, 18, { yaw: Math.PI / 2, scale: 1.5, part: 'rollershutter_door_graffiti' });

  // The pen gate: five loose planks, heavy enough to need a charge.
  const gate = [];
  for (let i = 0; i < 5; i++) gate.push(loose([8, .35 + i * .34, 36], [.08, .15, 2.55], mat.wood, 28));
  // Things to plough through. Crates and barrels are bodies; so are the gurneys, bins, tyres and gas bottles.
  for (const [x, z] of [[-14, -18], [16, -8], [-8, 2], [14, 4], [0, 16]])
    for (let i = 0; i < 6; i++) looseModel('wooden_crate_02', x + (i % 2) * .75, z + (i % 3) * .1, { y: Math.floor(i / 2) * .66, scale: 1.35, mass: 20, yaw: (i % 2) * .08, part: 'wooden_crate_02_crate' }) || loose([x + (i % 2) * 1.05, .5 + Math.floor(i / 2) * 1.02, z + (i % 3) * .2], [.5, .5, .5], mat.wood, 22);
  for (const [x, z, kind] of [[20, -30, 'barrel_01'], [21.2, -30.4, 'barrel_03'], [-22, -34, 'barrel_01'], [-2.6, 8, 'barrel_03'], [2.8, 8.4, 'barrel_01'], [19.6, -31.4, 'barrel_03'], [-22.9, -33.2, 'barrel_03']])
    looseModel(kind, x, z, { scale: 1.25, mass: 35 }) || loose([x, .6, z], [.38, .6, .38], mat.rust, 35);
  for (const [name, x, z, yaw, scale, mass] of [
    ['plain-iron-gurney-v001', -6, 20, .3, 1.5, 40], ['worn-iron-gurney-v002', -15, 27, 1.4, 1.5, 40], ['plain-iron-operating-table-v001', -9, 30.5, 0, 1.6, 70], ['old-iron-operating-table-v002', -15.5, 40, 1.57, 1.6, 70],
    ['sturdy-wood-table-v001', 2, 42, 0, 1.4, 45], ['weathered-wood-cart-v001', -18, -6, .6, 1.7, 90], ['sturdy-wood-cart-v001', 24, 30 - 44, -.4, 1.7, 90],
    ['weathered-wood-barricade-v001', -12, -40, .1, 1.6, 60], ['plain-wood-barricade-v001', 13, -41, -.15, 1.6, 60],
    ['trashbag', -5.4, 11.6, 0, 1.3, 8], ['trashbag', -6.2, 12.3, 1, 1.2, 8], ['trashbag', 6, 11.4, 2, 1.3, 8], ['cement_bag', 21, 8.6, .4, 1.2, 25], ['cement_bag', 21.2, 8.2, 1.2, 1.2, 25],
    ['propane_tank', 6.4, 9.2, 0, 1.4, 18], ['propane_tank', 7.1, 9.3, 0, 1.4, 18], ['old_tyre', -26, -8, 0, 1.2, 12], ['old_tyre', 30, 12, 0, 1.2, 12], ['old_tyre', 29.3, 12.6, 0, 1.2, 12],
    ['concrete_road_barrier', -9, -46, 0, 1.3, 420], ['concrete_road_barrier', 9, -46, 0, 1.3, 420], ['concrete_road_barrier', -34, -20, 1.57, 1.3, 420]])
    looseModel(name, x, z, { yaw, scale, mass });
  for (const [x, z] of [[-9.5, 9.2], [-10.6, 9.25], [11, 9.2]]) looseModel('metal_trash_can', x, z, { part: 'metal_trash_can_rust', scale: 1.25, mass: 14 });
  // Fixed dressing: troughs in the pen, drains and services on the walls, the bull's head over the door.
  place('chipped-granite-trough-v001', 20.6, 0, 33, { yaw: Math.PI / 2, scale: 1.6 }); place('plain-limestone-trough-v001', 20.6, 0, 39.5, { yaw: Math.PI / 2, scale: 1.6 });
  place('bull_head', 0, 6.1, 9.72, { yaw: Math.PI, scale: 4.2 });
  for (const [x, yaw] of [[-12, Math.PI], [14, Math.PI]]) place('utility_box_01', x, 0, 9.6, { yaw, scale: 1.3 });
  for (const x of [-18, 18]) place('modular_industrial_pipes_01', x, 2.2, 9.7, { yaw: Math.PI, scale: 1.8 });
  for (const z of [16, 34]) place('old-iron-drainpipe-v001', -23.6, 0, z, { yaw: Math.PI / 2, scale: 2.2 });
  place('worn-iron-cell-door-v001', 23.7, 0, 36, { yaw: -Math.PI / 2, scale: 1.5 });

  // Light: a cold moon, sodium lamps over the yard, flickering tubes down the corridor and kill floor, a red pen lamp.
  if (assets.sky) { scene.environment = assets.sky; scene.environmentIntensity = .55; scene.background = assets.sky; scene.backgroundIntensity = .22; scene.backgroundBlurriness = .04; }
  scene.add(new THREE.HemisphereLight(0x8fa4b5, 0x1d1b18, assets.sky ? .55 : 1.25));
  const moon = new THREE.DirectionalLight(0xbfd2e6, 2.6); moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048); Object.assign(moon.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 10, far: 170 }); moon.shadow.bias = -.0003; moon.shadow.normalBias = .04;
  const moonOffset = new THREE.Vector3(-38, 60, -30); moon.position.copy(moonOffset); scene.add(moon, moon.target);
  const glow = new THREE.BoxGeometry(1, 1, 1);
  const lamp = (x, y, z, color, intensity, distance, flicker = 0, bulbSize = null) => {
    const l = new THREE.PointLight(color, intensity, distance, 1.8); l.position.set(x, y, z); scene.add(l);
    const bulb = new THREE.Mesh(glow, new THREE.MeshBasicMaterial({ color })); bulb.position.set(x, y, z); bulb.scale.set(...(bulbSize || (flicker ? [1.5, .05, .1] : [.28, .08, .28]))); root.add(bulb);
    lights.push({ light: l, bulb, base: intensity, flicker, phase: Math.random() * 10 }); return l;
  };
  for (const [x, z] of [[-28, -36], [28, -36], [-28, 30], [30, -4]]) {
    const yaw = Math.atan2(-x, -z);
    if (!place('street_lamp_01', x, 0, z, { yaw, scale: 1.6 })) block([x, 3, z], [.1, 3, .1], mat.steel, { walker: false });
    physics.staticBox([x, 3, z], [.12, 3, .12]); walls2d.push([x - .15, x + .15, z - .15, z + .15]); solids.push({ minX: x - .15, maxX: x + .15, minZ: z - .15, maxZ: z + .15, top: 6, bottom: 0 });
    lamp(x + Math.sin(yaw) * .7, 5.9, z + Math.cos(yaw) * .7, 0xffa64d, 300, 40);
  }
  for (const z of [12, 17, 22]) { place('mounted_fluorescent_lights', 0, 3.16, z, { part: 'mounted_fluorescent_lights_a', scale: 1.7, yaw: Math.PI / 2, cast: false }); lamp(0, 3.08, z, 0xd8f0e6, 18, 14, .5); }
  for (const [x, z] of [[-10, 30], [-10, 40], [2, 34], [-18, 20]]) { place('mounted_fluorescent_lights', x, 5.5, z, { part: 'mounted_fluorescent_lights_a', scale: 2.2, yaw: Math.PI / 2, cast: false }); lamp(x, 5.38, z, 0xd8f0e6, 46, 24, .8, [1.9, .05, .12]); }
  place('caged_hanging_light', 15, 3.9, 36, { scale: 1.1, cast: false }); lamp(15, 3.1, 36, 0xff2a1a, 30, 16, .2, [.2, .12, .2]);

  // The pen lever: a floor-standing throw switch by the gate with a red lamp over it, so it reads from across the floor.
  const lever = new THREE.Group(); lever.position.set(7.2, 0, 32.7); root.add(lever);
  { const paint = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: .55, metalness: .3 }), dark = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: .5, metalness: .7 }), grip = new THREE.MeshStandardMaterial({ color: 0xc4130d, roughness: .45, emissive: 0x4a0603 });
    const part = (g, m, x, y, z, sx, sy, sz, parent = lever) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; parent.add(o); return o; };
    const box = new THREE.BoxGeometry(1, 1, 1), rod = new THREE.CylinderGeometry(.5, .5, 1, 12);
    part(box, dark, 0, .04, 0, .5, .08, .5); part(box, paint, 0, .55, 0, .26, 1.0, .2); part(box, dark, 0, 1.0, 0, .32, .1, .26);
    const arm = new THREE.Group(); arm.position.set(0, .82, .13); arm.rotation.x = -.85; lever.add(arm); lever.userData.arm = arm;
    part(rod, dark, 0, .36, 0, .045, .72, .045, arm); part(rod, grip, 0, .74, 0, .09, .2, .09, arm);
    const sign = part(box, new THREE.MeshBasicMaterial({ color: 0xff3020 }), 0, 2.25, 0, .16, .16, .16); lever.userData.sign = sign;
    const glowLight = new THREE.PointLight(0xff3a20, 14, 9, 1.6); glowLight.position.set(0, 2.2, 0); lever.add(glowLight); lever.userData.light = glowLight; }
  physics.staticBox([7.2, .55, 32.7], [.14, .55, .12]);

  // 2D blocking test for walkers (farmers, the herd): a circle against the wall rectangles.
  function blocked(x, z, r = .35) {
    for (const w of walls2d) if (x > w[0] - r && x < w[1] + r && z > w[2] - r && z < w[3] + r) return true;
    return false;
  }
  // Move a walker with wall sliding; returns true if it moved at all.
  function walk(p, dx, dz, r) {
    if (!blocked(p.x + dx, p.z + dz, r)) { p.x += dx; p.z += dz; return true; }
    if (!blocked(p.x + dx, p.z, r)) { p.x += dx; return true; }
    if (!blocked(p.x, p.z + dz, r)) { p.z += dz; return true; }
    return false;
  }

  // `focus` (optional {x,z}): the moon's shadow follows it in 2 m steps, so the shadow map stays sharp where you are.
  function update(time, focus = null) {
    for (const d of dynamic) { const t = d.body.read(); d.mesh.position.set(t.p[0], t.p[1], t.p[2]); d.mesh.quaternion.set(t.q[0], t.q[1], t.q[2], t.q[3]); }
    for (const l of lights) if (l.flicker) {
      // A tube that mostly holds and sometimes stutters.
      const n = Math.sin(time * 31 + l.phase) * Math.sin(time * 7.3 + l.phase * 2), drop = n > .82 - l.flicker * .25 ? .15 : 1;
      l.light.intensity = l.base * drop * (.92 + .08 * Math.sin(time * 60 + l.phase));
      l.bulb.material.color.setScalar(drop).multiply(l.light.color);
    }
    if (lever.userData.arm) { const pulled = leverPulled ? Math.min(1, (performance.now() - leverPulled) / 260) : 0; lever.userData.arm.rotation.x = -.85 + pulled * 1.7; if (!leverPulled) lever.userData.light.intensity = 10 + Math.sin(time * 4) * 5; }
    if (focus) { const fx = Math.round(focus.x / 2) * 2, fz = Math.round(focus.z / 2) * 2; if (moon.target.position.x !== fx || moon.target.position.z !== fz) { moon.target.position.set(fx, 0, fz); moon.position.set(fx + moonOffset.x, moonOffset.y, fz + moonOffset.z); moon.target.updateMatrixWorld(); } }
  }
  // The roof can be stood on (and is a ceiling for the camera).
  solids.push({ minX: -24.6, maxX: 24.6, minZ: 9.4, maxZ: 46.6, top: H + .24, bottom: H, roof: true });
  // Is the line between two people (at eye height) cut by something taller than them?
  function sightBlocked(x1, z1, x2, z2) {
    const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / .6));
    for (let i = 1; i < n; i++) { const x = x1 + (x2 - x1) * i / n, z = z1 + (z2 - z1) * i / n; for (const b of solids) if (!b.roof && b.top > 1.45 && b.bottom < 1.2 && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true; }
    return false;
  }
  const solidAt = (x, y, z, pad = .15) => { for (const b of solids) if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad && y < b.top + pad && y > b.bottom - pad) return true; return false; };
  // Unlatch the pen gate by hand: the planks drop and are shoved clear without the noise of a charge.
  function openGate() { if (lever.userData.arm) { leverPulled = performance.now(); lever.userData.sign.material.color.set(0x35ff5a); lever.userData.light.color.set(0x35ff5a); }
    gate.forEach((g, i) => { g.body.wake(); g.body.impulse(-60 - i * 14, 30, (i - 2) * 26); }); opened = true; }
  let opened = false, leverPulled = 0;
  const gateBroken = () => opened || gate.some(g => { const t = g.body.read().p; return Math.hypot(t[0] - g.home[0], t[2] - g.home[2]) > 1.2; });

  return {
    root, mat, blocked, walk, update, gateBroken, openGate, solids, solidAt, sightBlocked, gatePost: { x: 7.2, z: 32.7 }, loose, looseModel, place, walls2d, dynamic,
    spawn: { x: 0, z: -66, yaw: 0 },                       // the ninja, on foot on the road outside the north gate (foot yaw 0 faces +z, the yard)
    cowSpawn: { x: 15, z: 39.5, yaw: -Math.PI / 2 },       // your cow starts penned with the rest (cow yaw 0 faces -z)
    exit: { x: 0, z: -56, radius: 7 },
    pen: { minX: 9.5, maxX: 20.5, minZ: 29.5, maxZ: 42.5 },
    escape: [[10.5, 36], [5, 36], [0, 27], [0, 16], [0, 6]],   // the herd's way out of the building
    truckStart: { x: 31, z: -40, yaw: Math.PI },           // parked inside the fence by the east lamp
    patrols: [
      [[-18, -30], [18, -30], [18, -12], [-18, -12]],
      [[26, 0], [32, -20], [32, 20]],
      [[-10, 4], [10, 4]],
      [[0, 13], [0, 21]],
      [[-8, 28], [2, 40], [-8, 42]],
      [[4, 30], [4, 42]],
    ],
  };
}
