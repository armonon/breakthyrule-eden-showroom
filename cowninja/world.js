// COWNinja grey-box: a fenced yard, a slaughterhouse shell with a loading corridor, a kill floor and a holding pen
// behind a plank gate, a loading dock with a ramp, loose crates and barrels, and the road out through the north gate.
// Everything solid is a box in both three.js and Jolt. Units are metres; +x east, -z north (the way out).
import * as THREE from 'three/webgpu';

export function createWorld({ scene, physics }) {
  const root = new THREE.Group(); root.name = 'COWNinja grey-box'; scene.add(root);
  const mat = {
    ground: new THREE.MeshStandardMaterial({ color: 0x4b4d4a, roughness: .95 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x8b8c88, roughness: .9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x4e565b, roughness: .45, metalness: .7 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: .85 }),
    tile: new THREE.MeshStandardMaterial({ color: 0x7d837f, roughness: .3, metalness: .05 }), // wet kill-floor tile
    hazard: new THREE.MeshStandardMaterial({ color: 0xb08a1e, roughness: .7 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x5d3a2a, roughness: .8, metalness: .4 }),
  };
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const walls2d = [];   // [minX, maxX, minZ, maxZ] of anything walkers cannot pass
  const dynamic = [];   // {mesh, body} synced every frame
  const lights = [];    // flickering practicals

  function block(center, half, material, { solid = true, cast = true, walker = true } = {}) {
    const m = new THREE.Mesh(cube, material); m.position.set(...center); m.scale.set(half[0] * 2, half[1] * 2, half[2] * 2);
    m.castShadow = cast; m.receiveShadow = true; root.add(m);
    if (solid) { physics.staticBox(center, half); if (walker && half[1] > .25) walls2d.push([center[0] - half[0], center[0] + half[0], center[2] - half[2], center[2] + half[2]]); }
    return m;
  }
  // A wall between two points (axis-aligned), `h` tall.
  const wall = (x1, z1, x2, z2, h, material = mat.concrete, t = .3) =>
    block([(x1 + x2) / 2, h / 2, (z1 + z2) / 2], [Math.abs(x2 - x1) / 2 + t / 2, h / 2, Math.abs(z2 - z1) / 2 + t / 2], material);
  function loose(center, half, material, mass) {
    const m = new THREE.Mesh(cube, material); m.scale.set(half[0] * 2, half[1] * 2, half[2] * 2); m.castShadow = m.receiveShadow = true; root.add(m);
    const body = physics.dynamicBox(center, half, { mass, friction: .6, restitution: .15, angularDamping: .25 });
    const item = { mesh: m, body, home: [...center] }; dynamic.push(item); return item;
  }

  // Ground and the kill-floor tiles (a visual slab just above it).
  block([0, -.5, 0], [90, .5, 90], mat.ground, { cast: false, walker: false });
  block([0, .01, 28], [24, .01, 18], mat.tile, { solid: false, cast: false });

  // Yard fence with the exit gap in the north side.
  const F = 2.4;
  wall(-40, -50, -6, -50, F, mat.steel); wall(6, -50, 40, -50, F, mat.steel);
  wall(-40, -50, -40, 50, F, mat.steel); wall(40, -50, 40, 50, F, mat.steel);
  wall(-40, 50, 40, 50, F, mat.steel);
  for (const x of [-6, 6]) block([x, 1.8, -50], [.25, 1.8, .25], mat.hazard);

  // Slaughterhouse shell: front wall with a doorway, side and back walls, the loading corridor, the pen.
  const H = 6.5;
  wall(-24, 10, -4, 10, H); wall(4, 10, 24, 10, H);            // front, door 8 m wide
  wall(-24, 10, -24, 46, H); wall(24, 10, 24, 46, H); wall(-24, 46, 24, 46, H);
  wall(-4, 10, -4, 22, 3.2); wall(4, 10, 4, 22, 3.2);          // corridor
  wall(8, 28, 8, 33.4, 1.5, mat.steel); wall(8, 38.6, 8, 44, 1.5, mat.steel); // pen west side, gate gap z 33.4..38.6
  wall(8, 28, 22, 28, 1.5, mat.steel); wall(8, 44, 22, 44, 1.5, mat.steel); wall(22, 28, 22, 44, 1.5, mat.steel);
  // Overhead rail with hooks down the kill floor (visual), and stun boxes along the west wall.
  block([-12, 4.6, 30], [.08, .08, 14], mat.steel, { solid: false });
  for (let z = 18; z <= 42; z += 3) { block([-12, 4.1, z], [.03, .5, .03], mat.steel, { solid: false }); block([-12, 3.5, z], [.12, .1, .03], mat.rust, { solid: false }); }
  for (const z of [24, 31, 38]) { wall(-22, z - 2, -17, z - 2, 2, mat.steel); wall(-22, z + 2, -17, z + 2, 2, mat.steel); }

  // Loading dock (west yard) with a ramp up its north end.
  block([-31, .7, 0], [5, .7, 9], mat.concrete);
  { const angle = Math.atan2(1.4, 7), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -angle);
    const m = new THREE.Mesh(cube, mat.hazard); m.position.set(-31, .62, -12.4); m.quaternion.copy(q); m.scale.set(6, .2, 7.2); m.castShadow = m.receiveShadow = true; root.add(m);
    physics.staticBox([-31, .62, -12.4], [3, .1, 3.6], [q.x, q.y, q.z, q.w]); }

  // The pen gate: five loose planks, heavy enough to need a charge.
  const gate = [];
  for (let i = 0; i < 5; i++) gate.push(loose([8, .35 + i * .34, 36], [.08, .15, 2.55], mat.wood, 28));
  // Things to plough through: crate stacks and barrels in the yard and the corridor mouth.
  for (const [x, z] of [[-14, -18], [16, -8], [-8, 2], [14, 4], [0, 16]])
    for (let i = 0; i < 6; i++) loose([x + (i % 2) * 1.05, .5 + Math.floor(i / 2) * 1.02, z + (i % 3) * .2], [.5, .5, .5], i % 3 ? mat.wood : mat.rust, 22);
  for (const [x, z] of [[20, -30], [21.2, -30.4], [-22, -34], [-2.6, 8], [2.8, 8.4]]) loose([x, .6, z], [.38, .6, .38], mat.rust, 35);

  // Light: a cold moon, sodium lamps over the yard, flickering tubes down the corridor and kill floor, a red pen lamp.
  scene.add(new THREE.HemisphereLight(0x9fb2c0, 0x2a2824, 1.25));
  const moon = new THREE.DirectionalLight(0xbfd2e6, 2.8); moon.position.set(-38, 60, -30); moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048); Object.assign(moon.shadow.camera, { left: -62, right: 62, top: 62, bottom: -62, near: 10, far: 160 }); moon.shadow.bias = -.0004; scene.add(moon);
  const lamp = (x, y, z, color, intensity, distance, flicker = 0) => {
    const l = new THREE.PointLight(color, intensity, distance, 1.8); l.position.set(x, y, z); scene.add(l);
    const bulb = new THREE.Mesh(cube, new THREE.MeshBasicMaterial({ color })); bulb.position.set(x, y, z); bulb.scale.set(flicker ? 1.6 : .3, .08, flicker ? .12 : .3); root.add(bulb);
    lights.push({ light: l, bulb, base: intensity, flicker, phase: Math.random() * 10 }); return l;
  };
  for (const [x, z] of [[-28, -36], [28, -36], [-28, 30], [30, -4]]) { block([x, 3, z], [.1, 3, .1], mat.steel, { walker: false }); lamp(x, 6.1, z, 0xffa64d, 260, 38); }
  for (const z of [12, 17, 22]) lamp(0, 3.1, z, 0xd8f0e6, 16, 14, .5);
  for (const [x, z] of [[-10, 30], [-10, 40], [2, 34]]) lamp(x, 5.4, z, 0xd8f0e6, 30, 22, .8);
  lamp(15, 3, 36, 0xff2a1a, 26, 16, .2);

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

  function update(time) {
    for (const d of dynamic) { const t = d.body.read(); d.mesh.position.set(t.p[0], t.p[1], t.p[2]); d.mesh.quaternion.set(t.q[0], t.q[1], t.q[2], t.q[3]); }
    for (const l of lights) if (l.flicker) {
      // A tube that mostly holds and sometimes stutters.
      const n = Math.sin(time * 31 + l.phase) * Math.sin(time * 7.3 + l.phase * 2), drop = n > .82 - l.flicker * .25 ? .15 : 1;
      l.light.intensity = l.base * drop * (.92 + .08 * Math.sin(time * 60 + l.phase));
      l.bulb.material.color.setScalar(drop).multiply(l.light.color);
    }
  }
  const gateBroken = () => gate.some(g => { const t = g.body.read().p; return Math.hypot(t[0] - g.home[0], t[2] - g.home[2]) > 1.2; });

  return {
    root, mat, blocked, walk, update, gateBroken, loose,
    spawn: { x: 0, z: -40, yaw: Math.PI },                 // inside the north gate, facing the building (yaw 0 faces -z)
    exit: { x: 0, z: -56, radius: 7 },
    pen: { minX: 9.5, maxX: 20.5, minZ: 29.5, maxZ: 42.5 },
    escape: [[10.5, 36], [5, 36], [0, 27], [0, 16], [0, 6]],   // the herd's way out of the building
    truckStart: { x: 0, z: -82, yaw: Math.PI },
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
