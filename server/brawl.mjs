// Bare-hand brawling outside the arena, decided on the server like arena hits: clients only say they threw a
// punch. It lands on the nearest signed-in character within reach in front of the puncher (their latest reported
// poses), and the third punch on the same person within 1.3 s knocks them down. Everyone in the zone is told.
export function createBrawl({presence, emit}) {
  const REACH = 1.35, CONE = Math.cos(40 * Math.PI / 180), COMBO_MS = 1300, COOLDOWN_MS = 220;
  const landed = new Map(); // target connectionId -> recent hit times
  let eventId = 0;
  return {
    punch(connectionId, p) {
      const now = Date.now(), zone = p.zone || 'garden';
      if (!p.userId || zone === 'arena' || now - (p.lastPunch || 0) < COOLDOWN_MS) return;
      p.lastPunch = now;
      const fx = Math.sin(p.pose.yaw), fz = Math.cos(p.pose.yaw);
      let best = null, bestDistance = REACH;
      for (const [id, t] of presence) {
        if (id === connectionId || !t.userId || t.userId === p.userId || (t.zone || 'garden') !== zone) continue;
        const dx = t.pose.x - p.pose.x, dz = t.pose.z - p.pose.z, d = Math.hypot(dx, dz);
        if (d < 1e-3 || d > bestDistance || (dx * fx + dz * fz) / d < CONE) continue;
        best = {id, t, dir: [+(dx / d).toFixed(3), +(dz / d).toFixed(3)]}; bestDistance = d;
      }
      const event = {id: ++eventId, type: 'punch', attacker: p.userId, time: now};
      if (best) {
        const hits = (landed.get(best.id) || []).filter(t => now - t < COMBO_MS); hits.push(now);
        const knockdown = hits.length >= 3; landed.set(best.id, knockdown ? [] : hits);
        Object.assign(event, {target: best.t.userId, dir: best.dir, knockdown});
      }
      emit(zone, [event]);
    },
    leave(connectionId) { landed.delete(connectionId); }
  };
}
