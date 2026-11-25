// The herd in the holding pen. Penned, they mill about. Once the gate is broken they follow the rider: each cow
// steers for a slot behind the leader, keeps its distance from the others, and slides along walls. A cow at a run
// flattens any farmer in its way, so the stampede clears its own path.
import * as THREE from 'three/webgpu';
import { buildHerdCow, animateCow } from '/cowninja/cow.js';

export function createHerd({ scene, world, cow, farmers, assets, count = 8 }) {
  const cows = [], pen = world.pen;
  for (let i = 0; i < count; i++) {
    const model = buildHerdCow(assets, i); scene.add(model.group); model.group.scale.setScalar(.92 + (i * 37 % 10) * .014);
    const c = { model, p: { x: pen.minX + 1.5 + (i % 3) * 3.6, z: pen.minZ + 1.6 + Math.floor(i / 3) * 4 }, yaw: Math.random() * 6.28, speed: 0, gait: i, slot: i, stage: 0, wander: Math.random() * 6.28 };
    cows.push(c);
  }
  let free = false, saved = 0;

  function update(dt, time) {
    const lead = cow.state;
    for (const c of cows) {
      if (c.saved) continue;
      let tx, tz, top;
      if (!free) { // mill about inside the pen
        c.wander += (Math.sin(time * .7 + c.slot * 2.1)) * dt;
        tx = (pen.minX + pen.maxX) / 2 + Math.cos(c.wander + c.slot) * 4; tz = (pen.minZ + pen.maxZ) / 2 + Math.sin(c.wander * 1.3 + c.slot) * 5; top = 1.1;
      } else if (c.stage < world.escape.length) { // first the way out of the building: pen gate, kill floor, corridor, door
        const w = world.escape[c.stage]; tx = w[0] + (c.slot % 2 ? .9 : -.9); tz = w[1]; top = 9;
        if (Math.hypot(w[0] - c.p.x, w[1] - c.p.z) < 2.6) c.stage++;
      } else { // then a slot in two columns behind the leader
        const row = 1 + Math.floor(c.slot / 2), col = c.slot % 2 ? 1 : -1;
        tx = lead.x - lead.forward.x * (2.6 * row) + lead.forward.z * col * 1.25; tz = lead.z - lead.forward.z * (2.6 * row) - lead.forward.x * col * 1.25;
        top = Math.max(6, Math.abs(lead.speed) * 1.08 + 1.5);
      }
      let dx = tx - c.p.x, dz = tz - c.p.z; const dist = Math.hypot(dx, dz) || 1;
      // Separation from the rest of the herd and from the leader.
      let sx = 0, sz = 0;
      for (const o of cows) if (o !== c && !o.saved) { const ox = c.p.x - o.p.x, oz = c.p.z - o.p.z, d = Math.hypot(ox, oz); if (d < 1.9 && d > .001) { sx += ox / d * (1.9 - d); sz += oz / d * (1.9 - d); } }
      { const ox = c.p.x - lead.x, oz = c.p.z - lead.z, d = Math.hypot(ox, oz); if (d < 2.2 && d > .001) { sx += ox / d * (2.2 - d) * 1.5; sz += oz / d * (2.2 - d) * 1.5; } }
      const want = Math.min(top, dist * 2.2), ax = dx / dist * want + sx * 3, az = dz / dist * want + sz * 3, target = Math.hypot(ax, az);
      c.speed += (Math.min(top, target) - c.speed) * Math.min(1, dt * 3);
      if (target > .2) { let turn = Math.atan2(ax, -az) - c.yaw; turn = Math.atan2(Math.sin(turn), Math.cos(turn)); c.yaw += turn * Math.min(1, dt * (free ? 5 : 2)); }
      const vx = Math.sin(c.yaw) * c.speed, vz = -Math.cos(c.yaw) * c.speed;
      if (!free) { c.p.x = Math.max(pen.minX, Math.min(pen.maxX, c.p.x + vx * dt)); c.p.z = Math.max(pen.minZ, Math.min(pen.maxZ, c.p.z + vz * dt)); }
      else world.walk(c.p, vx * dt, vz * dt, .6);
      // Stampede: a cow at a run knocks down a farmer it reaches.
      if (free && c.speed > 5) for (const f of farmers.standing()) if (Math.hypot(f.p.x - c.p.x, f.p.z - c.p.z) < 1.2) farmers.knock(f, vx, vz, 'herd');
      const run = Math.min(1, c.speed / 15), moving = Math.min(1, c.speed / 1.2);
      c.gait += dt * (.5 + c.speed * .19) * moving;
      c.model.group.position.set(c.p.x, Math.abs(Math.sin(c.gait * Math.PI * 2)) * .05 * run, c.p.z); c.model.group.rotation.y = -c.yaw;
      // Penned, they stand and feed in turns; loose, they run with their heads up.
      animateCow(c.model, { gait: c.gait, run, moving, time: time + c.slot * 1.7, graze: free ? 0 : Math.max(0, Math.sin(time * .25 + c.slot * 1.3)) * (1 - moving) });
      if (free && Math.hypot(c.p.x - world.exit.x, c.p.z - world.exit.z) < world.exit.radius) { c.saved = true; saved++; c.model.group.visible = false; }
    }
  }
  // The nearest loose cow to a point, and trading places with the ridden cow (so any cow can be the one you ride).
  function nearest(x, z, reach) { let best = null, d = reach; for (const c of cows) if (!c.saved) { const r = Math.hypot(c.p.x - x, c.p.z - z); if (r < d) { d = r; best = c; } } return best; }
  function swap(c, ridden) { const x = ridden.state.x, z = ridden.state.z, yaw = ridden.state.yaw; ridden.teleport(c.p.x, c.p.z, c.yaw); c.p.x = x; c.p.z = z; c.yaw = yaw; c.stage = world.escape.length; }
  return { update, nearest, swap, release() { free = true; }, get free() { return free; }, get saved() { return saved; }, count };
}
