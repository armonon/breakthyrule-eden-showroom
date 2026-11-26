// The police. A car comes up the road with its lights going, stops across it beyond the main gate, and its officers
// get out (they are people like any others: farmers.js runs them). The car is a real body once parked: ram it and it
// moves, and that is on you.
import * as THREE from 'three/webgpu';
import { TUNE } from '/cowninja/config.js';

const HALF = [1.02, .78, 2.05], REST = .8;

export function createPolice({ scene, physics, assets, farmers, herd, cow, audio, onEvent }) {
  const R = TUNE.response, cars = [], cube = new THREE.BoxGeometry(1, 1, 1);
  function build(kind) {
    const group = new THREE.Group(), model = assets?.clone?.('pickup');
    const paint = new THREE.MeshStandardMaterial({ color: kind === 'heavy' ? 0x20241f : 0x0f1d3a, roughness: .45, metalness: .5 });
    if (model) { model.position.y = -REST; model.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color?.multiply(new THREE.Color(kind === 'heavy' ? 0x4a5246 : 0x38508a)); o.castShadow = true; } }); group.add(model); }
    else { const part = (x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(cube, paint); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; group.add(m); }; part(0, -.1, 0, 1.96, .7, 4.1); part(0, .5, -.3, 1.8, .62, 2.0); }
    const bar = [0x2050ff, 0xff2020].map((c, i) => { const m = new THREE.Mesh(cube, new THREE.MeshBasicMaterial({ color: c })); m.position.set(i ? .35 : -.35, .95, -.4); m.scale.set(.5, .14, .22); group.add(m); return m; });
    const light = new THREE.PointLight(0x3060ff, 0, 30, 1.7); light.position.set(0, 1.4, -.4); group.add(light);
    scene.add(group); return { group, bar, light };
  }
  // A car arrives for stop `slot` with `count` officers of `role` ('police' or 'heavy').
  function arrive(role = 'police', count = 3) {
    const slot = cars.length; if (slot >= R.roadblock.length) return false;
    const [x, z, yaw] = R.roadblock[slot], v = build(role);
    const car = { ...v, role, count, x, z, yaw, t: 0, body: null, hitAt: -9, home: [x, z], parked: false }; cars.push(car);
    v.group.position.set(x, REST, R.arriveFrom); audio?.siren?.(R.arriveSeconds); onEvent?.({ type: 'police-coming', role });
    return true;
  }
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  function update(dt, time, live) {
    for (const car of cars) {
      const on = Math.floor(time * 5) % 2; car.bar[0].visible = !!on; car.bar[1].visible = !on; car.light.color.set(on ? 0x3060ff : 0xff2828); car.light.intensity = car.wrecked ? 0 : 260;
      if (!car.parked) {
        car.t += dt / R.arriveSeconds; const k = Math.min(1, car.t), ease = 1 - (1 - k) * (1 - k);
        car.group.position.set(car.x, REST, R.arriveFrom + (car.z - R.arriveFrom) * ease); car.group.rotation.y = -(Math.PI + (car.yaw) * Math.max(0, (k - .75) / .25));
        if (k >= 1) {
          car.parked = true; q.setFromAxisAngle(up, car.group.rotation.y);
          car.body = physics.dynamicBox([car.x, REST + .05, car.z], HALF, { mass: 1500, friction: .9, restitution: .05, linearDamping: .4, angularDamping: .6, com: [0, -.42, 0] });
          car.body.place(car.x, REST + .05, car.z, q.x, q.y, q.z, q.w);
          for (let i = 0; i < car.count; i++) { const side = i % 2 ? 1 : -1, ox = car.x + side * (2.2 + (i >> 1) * 1.6), oz = car.z + 1.5 + (i >> 1) * 1.4; farmers.spawn(car.role, ox, oz, [ox, oz + 3.5]); }
          onEvent?.({ type: 'police-arrived', role: car.role, count: car.count });
        }
        continue;
      }
      const t = car.body.read(); car.group.position.set(t.p[0], t.p[1], t.p[2]); car.group.quaternion.set(t.q[0], t.q[1], t.q[2], t.q[3]);
      if (!live) continue;
      // Rammed by the cow you ride, or run into by your herd: the car is shoved, and it counts against you.
      const s = cow.state, d = Math.hypot(s.x - t.p[0], s.z - t.p[2]);
      if (s.mounted !== false && d < 3.1 && Math.abs(s.speed) > 5 && time - car.hitAt > 2) { car.hitAt = time; onEvent?.({ type: 'police-car-hit', by: 'cow', speed: Math.abs(s.speed), x: t.p[0], z: t.p[2] }); }
      for (const c of herd.cows) if (c.state === 'free' && c.speed > 5 && Math.abs(c.p.x - t.p[0]) < 2.6 && Math.abs(c.p.z - t.p[2]) < 2.6) {
        car.body.wake(); car.body.impulse(Math.sin(c.yaw) * c.speed * 260, 0, -Math.cos(c.yaw) * c.speed * 260); c.speed *= .5;
        if (time - car.hitAt > 2) { car.hitAt = time; onEvent?.({ type: 'police-car-hit', by: 'herd', speed: c.speed, x: t.p[0], z: t.p[2] }); }
      }
    }
  }
  return { arrive, update, cars };
}
