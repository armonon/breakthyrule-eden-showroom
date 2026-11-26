// Searchlights. Once the alarm is up, lamps on the hall roof and the gatehouse come on and sweep the yard: a pool
// of light on the ground and a faint beam through the haze. Caught in one outdoors, you are seen by whoever is
// near; the beam stops and holds on you for a moment.
import * as THREE from 'three/webgpu';

export function createSearchlights({ scene, world, farmers, onCaught }) {
  const RIGS = [
    { at: [-25.5, 10.2, -.6], sweep: [[-40, -40], [20, -40], [20, -10], [-40, -10]] },
    { at: [25.5, 10.2, -.6], sweep: [[30, -10], [96, 0], [96, 62], [30, 62]] },
    { at: [-12.2, 4.4, -56.6], sweep: [[-30, -50], [30, -50], [20, -20], [-20, -20]] },
  ];
  const lights = RIGS.map(r => {
    const light = new THREE.SpotLight(0xe8f0ff, 0, 90, .16, .45, 1.2); light.position.set(...r.at); scene.add(light, light.target);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.25, 3.2, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xc8d8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.renderOrder = 3; scene.add(beam);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.35, .45, .5, 12), new THREE.MeshStandardMaterial({ color: 0x22262a, metalness: .7, roughness: .4, emissive: 0x000000 })); lamp.position.set(...r.at); scene.add(lamp);
    return { ...r, light, beam, lamp, t: Math.random() * 4, hold: 0, x: r.sweep[0][0], z: r.sweep[0][1] };
  });
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  let on = 0;
  function update(dt, time, { active, actor, onFoot }) {
    on += ((active ? 1 : 0) - on) * Math.min(1, dt * 1.5);
    for (const s of lights) {
      s.light.intensity = on * 5200; s.beam.material.opacity = on * .05; s.lamp.material.emissive.setScalar(on * .9); s.beam.visible = on > .02;
      if (on < .02) continue;
      // Sweep along the loop, or hold on the player when caught.
      if (s.hold > 0) { s.hold -= dt; s.x += (actor.x - s.x) * Math.min(1, dt * 4); s.z += (actor.z - s.z) * Math.min(1, dt * 4); }
      else { s.t += dt * .09; const n = s.sweep.length, i = Math.floor(s.t) % n, k = s.t % 1, a = s.sweep[i], b = s.sweep[(i + 1) % n], e = k * k * (3 - 2 * k); s.x = a[0] + (b[0] - a[0]) * e; s.z = a[1] + (b[1] - a[1]) * e; }
      s.light.target.position.set(s.x, 0, s.z); s.light.target.updateMatrixWorld();
      // The beam: from the lamp to the ground, widening.
      dir.set(s.x - s.at[0], -s.at[1], s.z - s.at[2]); const len = dir.length(); s.beam.position.set(s.at[0] + dir.x / 2, s.at[1] + dir.y / 2, s.at[2] + dir.z / 2);
      s.beam.scale.set(1, len, 1); s.beam.quaternion.setFromUnitVectors(up, dir.normalize().negate()); s.lamp.quaternion.copy(s.beam.quaternion);
      if (active && Math.hypot(actor.x - s.x, actor.z - s.z) < 3.4 && !world.indoors(actor.x, actor.z) && !actor.hidden && !world.sightBlocked(s.at[0], s.at[2], actor.x, actor.z)) {
        if (s.hold <= 0) onCaught?.(s); s.hold = 2.5;
        farmers.noise(actor.x, actor.z, 30, dt * 1.2);
      }
    }
  }
  return { update, lights };
}
