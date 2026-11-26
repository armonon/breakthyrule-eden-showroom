// The herd. Cows start shut in their enclosures (the holding pen in the hall, six pens on the farm) and mill about.
// Opening an enclosure's gate frees its cows, and every free cow belongs to one herd that takes one order at a time:
//   follow   (default) gather round the leader (you, on a cow or on foot) and move with them
//   move     go to a spot on the ground and hold there
//   charge   form up in front of a gate, run at it together, and gather beyond it if it gives
// Orders stand until the next one; cows freed later join the order in force. The cow you ride is not in the herd.
// Cows find their way with flow fields (nav.js), keep apart, and flatten farmers when running.
//
// Gates give way to force: every cow that reaches a closed gate (or shoves into the back of one that just did)
// contributes speed × how squarely it is aimed. Contributions within TUNE.herd.impactWindow seconds add up, and the
// gate breaks when the sum reaches its strength. A standing herd has no speed and so no force; cows elsewhere
// contribute nothing. A cow you ride into the gate counts like any other.
import { buildHerdCow, animateCow } from '/cowninja/cow.js';
import { TUNE } from '/cowninja/config.js';
import { createNav } from '/cowninja/nav.js';

export function createHerd({ scene, world, cow, farmers, assets, leader, onEvent = () => {} }) {
  const H = TUNE.herd, nav = createNav({ world }), cows = [], out = { x: 0, z: 0 };
  const pens = world.pens.length ? world.pens : [{ id: 'hall', ...world.pen, count: 8 }];
  let index = 0;
  for (const pen of pens) {
    const n = pen.count ?? (pen.id === 'hall' ? H.penSize.hall : H.penSize.pen), cols = Math.ceil(Math.sqrt(n));
    for (let i = 0; i < n; i++, index++) {
      const model = buildHerdCow(assets, index); scene.add(model.group); model.group.scale.setScalar(.92 + (index * 37 % 10) * .014);
      const w = pen.maxX - pen.minX - 3, d = pen.maxZ - pen.minZ - 3;
      cows.push({ model, pen, state: 'penned', p: { x: pen.minX + 1.5 + ((i % cols) + .5) / cols * w, z: pen.minZ + 1.5 + (Math.floor(i / cols) + .5) / Math.ceil(n / cols) * d },
        yaw: (index * 2.4) % 6.28, speed: 0, gait: index, slot: index, wander: index * 1.7, stun: 0, hitAt: -9, hitGate: null, lane: 0 });
    }
  }
  const count = cows.length, exit = world.exit;
  let saved = 0, lost = 0, order = { type: 'follow' }, field = null, fieldAt = -9, fieldCell = -2, status = 'penned', navDirty = false;
  const free = () => cows.filter(c => c.state === 'free');
  const gateStrength = g => TUNE.gates[g.kind] ?? g.strength ?? 30;
  const series = new Map();   // gate id -> { hits: [{t, power}], peak, count, last }

  function centroid(list = free()) { let x = 0, z = 0; for (const c of list) { x += c.p.x; z += c.p.z; } const n = list.length || 1; return { x: x / n, z: z / n }; }
  function setField(x, z, time, force = false) {
    const cell = nav.snap(x, z); if (!force && field && cell === fieldCell && field.version === nav.version) return field;
    if (!force && field && time - fieldAt < .2 && field.version === nav.version) return field;
    field = nav.field(x, z); fieldAt = time; fieldCell = cell; return field;
  }

  // ---- orders
  function release(id) {
    let n = 0; for (const c of cows) if (c.state === 'penned' && c.pen.id === id) { c.state = 'free'; n++; }
    navDirty = true; if (n) onEvent({ type: 'released', id, count: n }); return n;
  }
  function recall() { order = { type: 'follow' }; field = null; for (const c of cows) c.flee = null; return free().length; }
  // The run-up to a gate from the herd's side: which way the charge goes and how far back there is room to start.
  function approach(gate, from) {
    const side = (from.x - gate.x) * gate.n[0] + (from.z - gate.z) * gate.n[1] > 0 ? -1 : 1, dir = [gate.n[0] * side, gate.n[1] * side];
    let back = 2; while (back < H.runup && !world.blocked(gate.x - dir[0] * (back + 1.5), gate.z - dir[1] * (back + 1.5), 1.2)) back += 1;
    return { dir, back, ax: gate.x - dir[0] * back, az: gate.z - dir[1] * back };
  }
  // What a charge at this gate would do, before it is ordered: the force the herd can bring against what is needed.
  function assess(gate) {
    const list = free(), n = list.length, need = gateStrength(gate); if (!n) return { verdict: 'NO FREE COWS', ok: false, need, power: 0, cows: 0 };
    if (navDirty) { nav.rebuild(); navDirty = false; }
    const from = centroid(list), near = list.reduce((a, c) => Math.hypot(c.p.x - from.x, c.p.z - from.z) < Math.hypot(a.p.x - from.x, a.p.z - from.z) ? c : a, list[0]);
    const a = approach(gate, near.p), reach = nav.field(a.ax, a.az).steps(near.p.x, near.p.z) >= 0;
    if (!reach || a.back < 4) return { verdict: 'APPROACH BLOCKED', ok: false, need, power: 0, cows: n };
    const speed = Math.min(H.chargeSpeed, Math.sqrt(2 * H.chargeAccel * Math.max(1, a.back - 1.5))), across = Math.max(1, Math.floor(Math.max(.5, gate.half - .9) * 2 / H.separation) + 1);
    const ranks = Math.floor(H.impactWindow * speed / (H.separation * .8)) + 2, hitters = Math.min(n, across * ranks), power = hitters * speed * H.assessAim;
    const most = Math.min(n, across * (Math.floor(H.impactWindow * H.chargeSpeed / (H.separation * .8)) + 2)) * H.chargeSpeed * H.assessAim;
    const wanted = Math.ceil(need / (H.chargeSpeed * H.assessAim));
    return { ok: power >= need, power, need, cows: n, wanted, back: a.back,
      verdict: power >= need ? 'READY TO BREAK' : most < need ? `NEED MORE COWS (${n} OF ABOUT ${wanted})` : 'NEED A LONGER RUN-UP' };
  }
  // An order at a point on the ground: charge the closed gate there if there is one, else go there and hold.
  // Returns { ok, type, x, z, gate } or { ok: false, reason } and then the standing order is kept.
  function command(x, z) {
    const list = free(); if (!list.length) return { ok: false, reason: 'NO FREE COWS YET' };
    if (navDirty) { nav.rebuild(); navDirty = false; }
    const from = centroid(list), near = list.reduce((a, c) => Math.hypot(c.p.x - from.x, c.p.z - from.z) < Math.hypot(a.p.x - from.x, a.p.z - from.z) ? c : a, list[0]);
    const gate = world.gateNear(x, z, H.commandGateRadius);
    if (gate) {
      // Charge from the herd's side. The run-up starts as far back as there is room for, up to H.runup.
      const { dir, back, ax, az } = approach(gate, near.p), f = nav.field(ax, az);
      if (f.steps(near.p.x, near.p.z) < 0 || back < 4) return { ok: false, reason: 'APPROACH BLOCKED' };
      order = { type: 'charge', gate, dir, ax, az, back, phase: 'gather', since: null, x: gate.x, z: gate.z }; field = f; fieldCell = -2;
      return { ok: true, type: 'charge', x: gate.x, z: gate.z, gate, outlook: assess(gate) };
    }
    if (nav.snap(x, z) < 0) return { ok: false, reason: 'NOT A PLACE COWS CAN STAND' };
    const f = nav.field(x, z); if (f.steps(near.p.x, near.p.z) < 0) return { ok: false, reason: 'THE HERD CAN\'T GET THERE' };
    order = { type: 'move', x, z }; field = f; fieldCell = -2;
    return { ok: true, type: 'move', x, z };
  }

  // ---- gates under load
  function strike(gate, power, time) {
    let s = series.get(gate.id); if (!s) series.set(gate.id, s = { hits: [], peak: 0, count: 0, last: 0, first: time });
    s.hits.push({ t: time, power }); s.hits = s.hits.filter(h => h.t > time - H.impactWindow); s.count++; s.last = time;
    const sum = s.hits.reduce((a, h) => a + h.power, 0); s.peak = Math.max(s.peak, sum);
    onEvent({ type: 'thud', gate, power, sum, need: gateStrength(gate) });
    if (sum >= gateStrength(gate)) {
      const dir = order.type === 'charge' && order.gate === gate ? order.dir : gate.n;
      series.delete(gate.id); world.openGate(gate.id, { broken: true, dir, power: sum });
      for (const c of cows) if (c.hitGate === gate) { c.stun = 0; c.hitGate = null; c.speed = Math.max(c.speed, 6); }
      onEvent({ type: 'break', gate, power: sum, need: gateStrength(gate), cows: s.hits.length });
      if (order.type === 'charge' && order.gate === gate) {   // on through, and gather beyond the opening
        let far = 4; while (far < 13 && !world.blocked(gate.x + dir[0] * (far + 1.5), gate.z + dir[1] * (far + 1.5), 1.2)) far += 1;
        order = { type: 'move', x: gate.x + dir[0] * far, z: gate.z + dir[1] * far, after: gate }; field = null;
      }
      return true;
    }
    return false;
  }
  // A gate was opened (lever or force): free its cows and redraw the routes.
  world.onGate(gate => { navDirty = true; release(gate.id); if (order.type === 'charge' && order.gate === gate) { order = { type: 'move', x: gate.x + order.dir[0] * 6, z: gate.z + order.dir[1] * 6, after: gate }; field = null; } });

  function update(dt, time, focus = null) {
    if (navDirty) { nav.rebuild(); navDirty = false; field = null; }
    const lead = leader(), list = free(), n = list.length, huddle = 1.4 + Math.sqrt(n) * H.huddle;
    // A charge that did not break the gate: report it once the blows stop, and regroup at the run-up.
    for (const [id, s] of series) if (time - s.first > H.impactWindow + .5) {
      const gate = world.gates.find(g => g.id === id); series.delete(id);
      if (gate && !gate.open && (s.peak > gateStrength(gate) * .2 || (order.type === 'charge' && order.gate === gate && order.phase === 'run'))) { onEvent({ type: 'bounce', gate, power: s.peak, need: gateStrength(gate), cows: s.count });
        if (order.type === 'charge' && order.gate === gate) { order.phase = 'gather'; order.since = null; order.rest = time + H.bounceStun + .6; } }
    }
    // Where the herd is headed this frame.
    let tx = lead.x, tz = lead.z, top = Math.max(H.followMin, Math.min(H.followMax, Math.abs(lead.speed) * H.followSpeedOver + H.followSpeedPlus)), hold = huddle, charging = false;
    if (order.type === 'move') { tx = order.x; tz = order.z; top = H.moveSpeed; }
    else if (order.type === 'charge') {
      tx = order.ax; tz = order.az; top = H.moveSpeed; hold = Math.min(huddle, H.gatherRadius * .7);
      if (order.gate.open) { order = { type: 'follow' }; }
      else if (order.phase === 'gather') {
        const ready = list.filter(c => Math.hypot(c.p.x - tx, c.p.z - tz) < H.gatherRadius && c.stun <= 0).length;
        if (ready && order.since == null) order.since = time;
        if (n && time > (order.rest || 0) && (ready >= Math.ceil(n * H.gatherFraction) || (order.since != null && time - order.since > H.gatherTimeout))) {
          order.phase = 'run'; order.runAt = time;
          // Lanes across the opening, front rank first.
          const tangent = [-order.dir[1], order.dir[0]], width = Math.max(.5, order.gate.half - .9), across = Math.max(1, Math.floor(width * 2 / H.separation) + 1);
          const ranked = list.slice().sort((a, b) => ((b.p.x - order.gate.x) * order.dir[0] + (b.p.z - order.gate.z) * order.dir[1]) - ((a.p.x - order.gate.x) * order.dir[0] + (a.p.z - order.gate.z) * order.dir[1]));
          for (let r = 0; r * across < ranked.length; r++) { const row = ranked.slice(r * across, (r + 1) * across).sort((a, b) => ((a.p.x - order.gate.x) * tangent[0] + (a.p.z - order.gate.z) * tangent[1]) - ((b.p.x - order.gate.x) * tangent[0] + (b.p.z - order.gate.z) * tangent[1]));
            row.forEach((c, i) => { c.lane = row.length > 1 ? (i / (row.length - 1) * 2 - 1) * width : 0; }); }
          onEvent({ type: 'charge', gate: order.gate, cows: n });
        }
      } else if (order.phase === 'run') { charging = true; if (time - order.runAt > 9) { order.phase = 'gather'; order.since = null; } }
    }
    const f = charging ? null : (field && order.type !== 'follow' && field.version === nav.version ? field : setField(tx, tz, time, order.type !== 'follow' && !field));
    // How far the front of a charge has got (those behind hurry to close up).
    let front = -1e9; if (charging) for (const c of list) front = Math.max(front, (c.p.x - order.gate.x) * order.dir[0] + (c.p.z - order.gate.z) * order.dir[1]);
    let nearCount = 0, astray = 0, fleeing = 0;
    const rush = charging ? order : null;   // the order may change mid-loop (the gate gives): this charge's own data

    for (const c of cows) {
      let ax = 0, az = 0, cap = 1.1, turnRate = 2, graze = 0;
      if (c.stun > 0) c.stun -= dt;
      if (c.state === 'lost') continue;
      if (c.state === 'penned' || c.state === 'saved') {   // mill about: in the pen, or on the grass once safe
        c.wander += Math.sin(time * .7 + c.slot * 2.1) * dt;
        const cx = c.state === 'saved' ? exit.x : (c.pen.minX + c.pen.maxX) / 2, cz = c.state === 'saved' ? exit.z : (c.pen.minZ + c.pen.maxZ) / 2;
        const rx = c.state === 'saved' ? exit.radius * .6 : (c.pen.maxX - c.pen.minX) * .3, rz = c.state === 'saved' ? exit.radius * .6 : (c.pen.maxZ - c.pen.minZ) * .3;
        const gx = cx + Math.cos(c.wander + c.slot) * rx, gz = cz + Math.sin(c.wander * 1.3 + c.slot) * rz, d = Math.hypot(gx - c.p.x, gz - c.p.z) || 1;
        const want = Math.min(cap, d * .8); ax = (gx - c.p.x) / d * want; az = (gz - c.p.z) / d * want; graze = Math.max(0, Math.sin(time * .25 + c.slot * 1.3));
      } else if (c.flee && time < c.flee.until) {   // bolting from a blast
        const fx = c.p.x - c.flee.x, fz = c.p.z - c.flee.z, d = Math.hypot(fx, fz) || 1; cap = 9.5; ax = fx / d * cap; az = fz / d * cap; turnRate = 7; fleeing++;
      } else if (charging && c.stun <= 0) {
        // Run at the gate in a lane, aimed well beyond it so the blow lands square.
        const tangent = [-rush.dir[1], rush.dir[0]], gx = rush.gate.x + tangent[0] * c.lane + rush.dir[0] * 14, gz = rush.gate.z + tangent[1] * c.lane + rush.dir[1] * 14;
        const along = (c.p.x - rush.gate.x) * rush.dir[0] + (c.p.z - rush.gate.z) * rush.dir[1], off = (c.p.x - rush.gate.x) * tangent[0] + (c.p.z - rush.gate.z) * tangent[1];
        const behind = Math.max(0, Math.min(1, (front - along) / 6)); cap = H.chargeSpeed * (.86 + behind * .34);
        const steer = Math.max(-1, Math.min(1, (c.lane - off) * .5)), d = Math.hypot(gx - c.p.x, gz - c.p.z) || 1;
        ax = ((gx - c.p.x) / d + tangent[0] * steer * .6) * cap; az = ((gz - c.p.z) / d + tangent[1] * steer * .6) * cap; turnRate = 6;
      } else if (c.stun <= 0) {
        const direct = Math.hypot(tx - c.p.x, tz - c.p.z), step = f?.dir(c.p.x, c.p.z, out);
        if (!step) astray++;
        if (direct < hold + 6) nearCount++;
        cap = direct > 14 ? Math.max(top, order.type === 'follow' ? H.followMax : top) : top;
        const want = direct < hold ? 0 : Math.min(cap, (direct - hold) * 1.6 + .6);
        if (direct < 3.5 || !step || (step.x === 0 && step.z === 0)) { ax = (tx - c.p.x) / (direct || 1) * want; az = (tz - c.p.z) / (direct || 1) * want; }
        else { ax = step.x * want; az = step.z * want; }
        turnRate = 5;
      }
      // Keep apart from the others (free cows only) and from the leader.
      if (c.state === 'free') {
        let sx = 0, sz = 0; const gap = charging ? H.separation * .8 : H.separation;
        for (const o of cows) if (o !== c && o.state === c.state) { const ox = c.p.x - o.p.x, oz = c.p.z - o.p.z; if (Math.abs(ox) > gap || Math.abs(oz) > gap) continue; const d = Math.hypot(ox, oz); if (d < gap && d > .001) { sx += ox / d * (gap - d); sz += oz / d * (gap - d); } }
        { const ox = c.p.x - lead.x, oz = c.p.z - lead.z, d = Math.hypot(ox, oz); if (d < 2.2 && d > .001) { sx += ox / d * (2.2 - d) * 1.5; sz += oz / d * (2.2 - d) * 1.5; } }
        ax += sx * 3; az += sz * 3;
      }
      const target = Math.min(cap, Math.hypot(ax, az));
      if (charging && c.state === 'free' && target > c.speed) c.speed = Math.min(target, c.speed + H.chargeAccel * dt);
      else c.speed += (target - c.speed) * Math.min(1, dt * 3);
      if (c.stun > 0) c.speed *= Math.max(0, 1 - dt * 6);
      if (target > .2 && c.stun <= 0) { let turn = Math.atan2(ax, -az) - c.yaw; turn = Math.atan2(Math.sin(turn), Math.cos(turn)); c.yaw += turn * Math.min(1, dt * turnRate); }
      const vx = Math.sin(c.yaw) * c.speed, vz = -Math.cos(c.yaw) * c.speed;
      if (c.state === 'penned') { c.p.x = Math.max(c.pen.minX + .8, Math.min(c.pen.maxX - .8, c.p.x + vx * dt)); c.p.z = Math.max(c.pen.minZ + .8, Math.min(c.pen.maxZ - .8, c.p.z + vz * dt)); }
      else {
        // Meeting a closed gate at speed is a blow on it; so is shoving into the back of a cow that just struck.
        if (c.state === 'free' && c.speed > 1.5 && time - c.hitAt > 1) {
          let gate = world.gateAt(c.p.x + vx * dt * 2 + Math.sin(c.yaw) * .9, c.p.z + vz * dt * 2 - Math.cos(c.yaw) * .9, .35);
          if (!gate) for (const o of cows) if (o !== c && o.hitGate && time - o.hitAt < H.impactWindow && !o.hitGate.open && Math.hypot(o.p.x - c.p.x - Math.sin(c.yaw) * 1.1, o.p.z - c.p.z + Math.cos(c.yaw) * 1.1) < 1.3) { gate = o.hitGate; break; }
          if (gate) {
            const aim = Math.abs(Math.sin(c.yaw) * gate.n[0] - Math.cos(c.yaw) * gate.n[1]);   // 1 square on, 0 along the gate
            if (c.speed * aim < H.minBlow) gate = null;   // a cow brushing along a gate is not a blow
          }
          if (gate) {
            const aim = Math.abs(Math.sin(c.yaw) * gate.n[0] - Math.cos(c.yaw) * gate.n[1]);
            c.hitAt = time; c.hitGate = gate;
            if (!strike(gate, c.speed * aim, time)) { c.stun = H.bounceStun; c.p.x -= Math.sin(c.yaw) * .25; c.p.z += Math.cos(c.yaw) * .25; c.speed *= .15; }
          }
        }
        world.walk(c.p, vx * dt, vz * dt, .6);
      }
      if (c.state === 'free' && c.speed > H.knockSpeed) for (const p of farmers.standing()) if (Math.hypot(p.p.x - c.p.x, p.p.z - c.p.z) < 1.2) farmers.knock(p, vx, vz, 'herd');
      if (c.state === 'free' && Math.hypot(c.p.x - exit.x, c.p.z - exit.z) < exit.radius) { c.state = 'saved'; saved++; onEvent({ type: 'saved', saved, count }); }
      // Draw. Far from the action a cow only keeps its place.
      const run = Math.min(1, c.speed / 15), moving = Math.min(1, c.speed / 1.2);
      c.gait += dt * (.5 + c.speed * .19) * moving;
      c.model.group.position.set(c.p.x, Math.abs(Math.sin(c.gait * Math.PI * 2)) * .05 * run, c.p.z); c.model.group.rotation.y = -c.yaw;
      const far = focus ? Math.hypot(c.p.x - focus.x, c.p.z - focus.z) : 0; c.model.group.visible = far < 150;
      if (far < 70) animateCow(c.model, { gait: c.gait, run, moving, charge: charging && c.state === 'free' ? 1 : 0, time: time + c.slot * 1.7, graze: graze * (1 - moving) });
    }
    // The ridden cow counts against a gate like any other.
    if (cow.state.mounted !== false && Math.abs(cow.state.speed) > 3 && time - (cow.herdHitAt || -9) > 1) {
      const s = cow.state, gate = world.gateAt(s.x + s.forward.x * 1.5, s.z + s.forward.z * 1.5, .4);
      const blow = gate ? Math.abs(s.speed) * Math.abs(s.forward.x * gate.n[0] + s.forward.z * gate.n[1]) : 0;
      if (blow >= H.minBlow) { cow.herdHitAt = time; strike(gate, blow, time); }
    }
    status = !n ? (saved ? 'safe' : lost ? 'lost' : 'penned') : order.type === 'charge' ? (charging ? 'charging' : 'forming up') : fleeing > n * .3 || astray > n * .4 || (order.type === 'follow' && nearCount < n * .5) ? 'scattered' : order.type === 'follow' ? 'following' : nearCount >= n * .7 ? 'holding' : 'moving';
  }

  // A blast: cows close to it die (they stay where they fell and are counted lost), the rest nearby bolt from it
  // for a few seconds. `covered(x, z)` says whether something solid stood between a cow and the blast.
  function blast(x, z, { lethal = TUNE.blast.lethal, scatter = TUNE.blast.scatter, seconds = TUNE.blast.scatterSeconds, covered = () => false, time = 0 } = {}) {
    let killed = 0, scattered = 0;
    for (const c of cows) {
      if (c.state === 'lost' || c.state === 'saved') continue; const d = Math.hypot(c.p.x - x, c.p.z - z);
      if (d < lethal && !covered(c.p.x, c.p.z)) { c.state = 'lost'; lost++; killed++; c.speed = 0; c.model.group.rotation.z = Math.PI / 2 * (c.slot % 2 ? 1 : -1); c.model.group.position.y = .42; onEvent({ type: 'cow-lost', x: c.p.x, z: c.p.z, lost }); }
      else if (d < scatter && c.state === 'free') { c.flee = { x, z, until: time + seconds * (1 - d / scatter * .5) }; c.stun = 0; scattered++; }
    }
    return { killed, scattered };
  }
  // The nearest free cow to a point, and trading places with the ridden cow (so any cow can be the one you ride).
  function nearest(x, z, reach) { let best = null, d = reach; for (const c of cows) if (c.state === 'free') { const r = Math.hypot(c.p.x - x, c.p.z - z); if (r < d) { d = r; best = c; } } return best; }
  function swap(c, ridden) {
    const x = ridden.state.x, z = ridden.state.z, yaw = ridden.state.yaw; ridden.teleport(c.p.x, c.p.z, c.yaw); c.p.x = x; c.p.z = z; c.yaw = yaw;
    // The cow left behind may be standing in a pen that is still shut.
    const pen = pens.find(p => x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ), gate = pen && world.gates.find(g => g.id === pen.id);
    if (pen && gate && !gate.open) { c.pen = pen; c.state = 'penned'; }
  }
  return { update, nearest, swap, release, recall, command, assess, blast, cows, nav, count, get lost() { return lost; },
    get order() { return order; }, get status() { return status; }, get freeCount() { return cows.filter(c => c.state === 'free').length; },
    get penned() { return cows.filter(c => c.state === 'penned').length; },
    get free() { return cows.some(c => c.state !== 'penned'); }, get saved() { return saved; } };
}
