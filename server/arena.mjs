// Arena combat, decided on the server. Clients only report where they are and what they pressed; every hit,
// block, death and respawn is computed here against arena-layout.json, so a modified client cannot claim hits.
//
// Per fighter (stored on the presence entry as p.arena): health, dead/respawnAt, kills, deaths, cooldown stamps.
// Sword: targets within `range` (horizontal) inside an `arcDegrees` cone of the attacker's facing; a target
// blocking with the attacker inside its own front `blockArcDegrees` takes `blockedDamage` instead.
// Crossbow: a bolt from the attacker's eye along the aim direction, flying with gravity; the first body capsule
// or cover object on its path is hit (pillars and crates stop bolts). Positions are the latest reported ones.
import fs from 'node:fs';
import path from 'node:path';

export function createArena({root, presence, emit}) {
  const layout = JSON.parse(fs.readFileSync(path.join(root, 'arena-layout.json'), 'utf8'));
  const rules = layout.rules, [cx, cz] = layout.center;
  let eventId = 0;
  // Events name fighters by account id (what clients see in the room roster), not by connection.
  const who = connectionId => presence.get(connectionId)?.userId || null;
  const event = (type, data) => ({id: ++eventId, type, time: Date.now(), ...data,
    ...(data.attacker ? {attacker: who(data.attacker)} : {}), ...(data.target ? {target: who(data.target)} : {})});

  const fighters = () => [...presence.entries()].filter(([, p]) => p.zone === 'arena' && p.userId && p.arena);
  function enter(p) { p.arena = p.arena || {kills: 0, deaths: 0}; Object.assign(p.arena, {health: rules.health, dead: false, respawnAt: 0, lastSwing: 0, lastShot: 0}); }
  function inside(x, z) { return Math.hypot(x - cx, z - cz) <= layout.radius + 1; }

  function damage(attackerId, attacker, targetId, target, amount, weapon) {
    const t = target.arena; if (t.dead) return [];
    t.health = Math.max(0, t.health - amount);
    const out = [event('hit', {attacker: attackerId, target: targetId, weapon, amount, health: t.health})];
    if (t.health === 0) {
      t.dead = true; t.deaths++; t.respawnAt = Date.now() + rules.respawnSeconds * 1000;
      attacker.arena.kills++;
      out.push(event('kill', {attacker: attackerId, target: targetId, weapon}));
    }
    return out;
  }

  function swing(id, p) {
    const a = p.arena, now = Date.now();
    if (a.dead || now - a.lastSwing < rules.sword.cooldownMs || p.weapon !== 'sword') return;
    a.lastSwing = now;
    const events = [event('swing', {attacker: id})], fx = Math.sin(p.pose.yaw), fz = Math.cos(p.pose.yaw);
    for (const [tid, t] of fighters()) {
      if (tid === id || t.arena.dead) continue;
      const dx = t.pose.x - p.pose.x, dz = t.pose.z - p.pose.z, dist = Math.hypot(dx, dz);
      if (dist > rules.sword.range || dist < 1e-3) continue;
      if ((dx * fx + dz * fz) / dist < Math.cos(rules.sword.arcDegrees * Math.PI / 180)) continue;
      // blocked if the target is blocking and the attacker is in front of the target
      const tfx = Math.sin(t.pose.yaw), tfz = Math.cos(t.pose.yaw);
      const blocked = t.blocking && t.weapon === 'sword' && (-dx * tfx - dz * tfz) / dist > Math.cos(rules.blockArcDegrees * Math.PI / 180);
      events.push(...damage(id, p, tid, t, blocked ? rules.sword.blockedDamage : rules.sword.damage, blocked ? 'sword-blocked' : 'sword'));
    }
    emit(events);
  }

  function shoot(id, p, dir) {
    const a = p.arena, now = Date.now();
    if (a.dead || now - a.lastShot < rules.crossbow.cooldownMs || p.weapon !== 'crossbow') return;
    if (!Array.isArray(dir) || dir.length !== 3 || !dir.every(Number.isFinite)) return;
    const len = Math.hypot(...dir); if (len < 0.5 || len > 1.5) return;
    a.lastShot = now;
    const d = dir.map(v => v / len), origin = [p.pose.x + d[0] * 0.5, rules.eyeHeight + (p.y || 0) - 0.12, p.pose.z + d[2] * 0.5];
    const v = d.map(c => c * rules.crossbow.speed), step = 1 / 120;
    let pos = origin.slice(), t = 0, hit = null;
    while (t < rules.crossbow.maxFlightSeconds && !hit) {
      const next = [pos[0] + v[0] * step, pos[1] + (v[1] - rules.crossbow.gravity * (t + step / 2)) * step, pos[2] + v[2] * step];
      t += step;
      if (next[1] <= 0) { hit = {kind: 'ground', point: next}; break; }
      if (!inside(next[0], next[2])) { hit = {kind: 'wall', point: next}; break; }
      for (const c of layout.cover) {
        if (next[1] < c.h && Math.hypot(next[0] - (cx + c.x), next[2] - (cz + c.z)) < c.r) { hit = {kind: 'cover', point: next}; break; }
      }
      if (hit) break;
      for (const [tid, target] of fighters()) {
        if (tid === id || target.arena.dead) continue;
        const ty = target.y || 0;
        if (next[1] > ty && next[1] < ty + rules.bodyHeight && Math.hypot(next[0] - target.pose.x, next[2] - target.pose.z) < rules.bodyRadius) { hit = {kind: 'body', target: tid, point: next}; break; }
      }
      pos = next;
    }
    const events = [event('shot', {attacker: id, origin, velocity: v, flight: +t.toFixed(3), end: (hit?.point || pos).map(n => +n.toFixed(3)), hitKind: hit?.kind || 'none'})];
    if (hit?.kind === 'body') {
      const target = presence.get(hit.target);
      // the bolt meets the front of a blocking target when it travels against the target's facing
      const blocked = target.blocking && target.weapon === 'sword' && (d[0] * Math.sin(target.pose.yaw) + d[2] * Math.cos(target.pose.yaw)) < -Math.cos(rules.blockArcDegrees * Math.PI / 180);
      events.push(...damage(id, p, hit.target, target, blocked ? Math.round(rules.crossbow.damage / 2) : rules.crossbow.damage, blocked ? 'crossbow-blocked' : 'crossbow'));
    }
    emit(events);
  }

  // respawns
  setInterval(() => {
    const now = Date.now(), events = [];
    for (const [id, p] of fighters()) if (p.arena.dead && now >= p.arena.respawnAt) {
      Object.assign(p.arena, {dead: false, health: rules.health});
      events.push(event('respawn', {target: id, spawn: Math.floor(Math.random() * layout.spawns.length)}));
    }
    if (events.length) emit(events);
  }, 100);

  return {
    layout,
    // Called with every pose update; handles entering/leaving and keeps reported fields sane.
    pose(p, message) {
      const zone = message.zone === 'arena' ? 'arena' : 'garden';
      if (zone === 'arena' && (!p.userId || !inside(message.x, message.z))) return; // must be signed in and inside
      if (zone !== p.zone) { p.zone = zone; if (zone === 'arena') enter(p); }
      p.weapon = message.weapon === 'crossbow' ? 'crossbow' : 'sword';
      p.blocking = !!message.blocking && p.weapon === 'sword';
      p.y = Number.isFinite(message.y) ? Math.max(0, Math.min(2, message.y)) : 0;
      p.pitch = Number.isFinite(message.pitch) ? Math.max(-1.5, Math.min(1.5, message.pitch)) : 0;
    },
    action(id, p, message) {
      if (p.zone !== 'arena' || !p.arena) return;
      if (message.t === 'attack') swing(id, p);
      else if (message.t === 'shoot') shoot(id, p, message.dir);
    },
    publicState: p => p.zone === 'arena' && p.arena ? {health: p.arena.health, dead: p.arena.dead, kills: p.arena.kills, deaths: p.arena.deaths,
      weapon: p.weapon, blocking: !!p.blocking, pitch: p.pitch || 0, y: p.y || 0, respawnIn: p.arena.dead ? Math.max(0, p.arena.respawnAt - Date.now()) : 0} : null
  };
}
