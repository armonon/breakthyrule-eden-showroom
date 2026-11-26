// The minimap: a round map in the corner that turns with your view. Buildings and fences are drawn once; over them,
// the levers (red until pulled), the main gate, the safe ground, the herd (white), penned cows (grey), people
// (amber when suspicious, red when they have you, blue for police) and the order you gave.
export function createMinimap({ canvas, world, herd, farmers, scale = 2.2, reach = 55 }) {
  if (!canvas) return { update() {} };
  canvas.hidden = false;
  const ctx = canvas.getContext('2d'), W = canvas.width, R = W / 2;
  const [x0, x1, z0, z1] = [-70, 115, -150, 85], base = document.createElement('canvas');
  base.width = Math.ceil((x1 - x0) * scale); base.height = Math.ceil((z1 - z0) * scale);
  { const g = base.getContext('2d'); g.fillStyle = '#16191b'; g.fillRect(0, 0, base.width, base.height);
    const px = x => (x - x0) * scale, pz = z => (z - z0) * scale;
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(px(-5), pz(-150), 10 * scale, (150 - 2) * scale);   // the road
    for (const p of world.pens) { g.fillStyle = 'rgba(214,190,120,.16)'; g.fillRect(px(p.minX - 1.6), pz(p.minZ - 1.6), (p.maxX - p.minX + 3.2) * scale, (p.maxZ - p.minZ + 3.2) * scale); }
    g.fillStyle = '#5c6266'; for (const w of world.walls2d) g.fillRect(px(w[0]), pz(w[2]), Math.max(1, (w[1] - w[0]) * scale), Math.max(1, (w[3] - w[2]) * scale));
    const e = world.exit; g.strokeStyle = 'rgba(109,255,160,.7)'; g.lineWidth = 2; g.beginPath(); g.arc(px(e.x), pz(e.z), e.radius * scale, 0, Math.PI * 2); g.stroke(); }
  const dot = (x, z, r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, z, r, 0, Math.PI * 2); ctx.fill(); };
  // `heading`: the view's yaw (0 looks toward +z); the map turns so that is up.
  function update({ x, z, heading, order, riding }) {
    ctx.save(); ctx.clearRect(0, 0, W, W); ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#0d0f10'; ctx.fillRect(0, 0, W, W);
    const k = R / reach, ch = Math.cos(heading), sh = Math.sin(heading);
    // World offsets into map pixels with the view direction up: right of view is (-cos h, sin h), forward (sin h, cos h).
    ctx.translate(R, R); ctx.transform(-ch * k, -sh * k, sh * k, -ch * k, 0, 0);
    ctx.save(); ctx.scale(1 / scale, 1 / scale); ctx.drawImage(base, (x0 - x) * scale, (z0 - z) * scale); ctx.restore();
    const at = (wx, wz) => [wx - x, wz - z], m = 1 / k;
    for (const g of world.gates) { const [a, b] = at(g.x, g.z); ctx.fillStyle = g.open ? 'rgba(109,255,160,.6)' : g.kind === 'main' ? '#ff6a30' : '#ff3a20';
      if (g.axis === 'x') ctx.fillRect(a - g.half, b - .5 * m * 2, g.half * 2, m * 3); else ctx.fillRect(a - m * 1.5, b - g.half, m * 3, g.half * 2);
      if (!g.open) { const [lx, lz] = at(g.lever.x, g.lever.z); dot(lx, lz, m * 3.2, '#ff3a20'); } }
    for (const c of herd.cows) { if (c.state === 'saved') continue; const [a, b] = at(c.p.x, c.p.z); if (Math.abs(a) > reach * 1.5 || Math.abs(b) > reach * 1.5) continue;
      dot(a, b, m * (c.state === 'free' ? 2.4 : 1.6), c.state === 'free' ? '#f2efe8' : c.state === 'lost' ? '#7a1a12' : 'rgba(200,200,200,.45)'); }
    for (const f of farmers.farmers) { if (f.ragdoll || f.hidden) continue; const [a, b] = at(f.p.x, f.p.z); const d = Math.hypot(a, b); if (d > reach * 1.4) continue;
      const police = f.role === 'police' || f.role === 'heavy', hot = f.state === 'chase' || f.alert >= 1;
      if (!police && !hot && f.alert < .05 && d > 35) continue;   // the unaware far off are not on the map
      dot(a, b, m * 2.6, hot ? '#ff3a20' : police ? '#5d8cff' : f.alert > .3 ? '#ffb020' : '#c9b37a'); }
    if (order && order.type !== 'follow') { const [a, b] = at(order.x, order.z); ctx.strokeStyle = order.type === 'charge' ? '#ff6a30' : '#5dff8a'; ctx.lineWidth = m * 1.6; ctx.beginPath(); ctx.arc(a, b, m * 5, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    // You, always at the centre pointing up.
    ctx.fillStyle = riding ? '#ffc04a' : '#ff3a20'; ctx.beginPath(); ctx.moveTo(R, R - 7); ctx.lineTo(R + 5, R + 5); ctx.lineTo(R, R + 2); ctx.lineTo(R - 5, R + 5); ctx.closePath(); ctx.fill();
  }
  return { update };
}
