// A soft puff of smoke drawn on a 2D canvas laid over an element — used to hide the swap from one hero garment
// to the next. Runs its own animation only while a puff is on screen.
const rand = (a, b) => a + Math.random() * (b - a);

// Pre-rendered cloud sprites (a few overlapping soft blobs), tinted once.
function sprite(rgb) {
  const c = document.createElement('canvas'); c.width = c.height = 160; const x = c.getContext('2d');
  // Billows: many soft lobes, denser in the middle, so each puff has a cauliflower edge instead of a smudge.
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2), d = Math.pow(Math.random(), .7) * 44, r = rand(12, 34) * (1 - d / 90);
    const px = 80 + Math.cos(a) * d, py = 80 + Math.sin(a) * d;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(.45, 'rgba(0,0,0,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
  }
  // Wisps: carve small soft holes so it looks like vapour, not a disc.
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 30; i++) {
    const px = 80 + rand(-60, 60), py = 80 + rand(-60, 60), r = rand(4, 12);
    const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
  }
  x.globalCompositeOperation = 'source-in'; x.fillStyle = `rgb(${rgb})`; x.fillRect(0, 0, 160, 160);
  return c;
}

export function createSmoke(host, { colors = ['78,70,63', '98,89,81', '126,116,106', '160,149,138', '196,187,175'] } = {}) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true'); canvas.className = 'live smoke';
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '3', opacity: '1', transform: 'none', transition: 'none' });
  host.append(canvas);
  const ctx = canvas.getContext('2d');
  const sprites = colors.map(sprite);
  let parts = [], frame = 0, last = 0, w = 0, h = 0;
  const fit = () => { const k = Math.min(devicePixelRatio || 1, 1.5); w = host.clientWidth; h = host.clientHeight; canvas.width = Math.round(w * k); canvas.height = Math.round(h * k); ctx.setTransform(k, 0, 0, k, 0, 0); };
  function spawn(delay) {
    const cx = w * .5, cy = h * .5, a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random());
    const x = cx + Math.cos(a) * d * w * .22, y = cy + Math.sin(a) * d * h * .26;
    const out = rand(18, 60);
    parts.push({ x, y, vx: Math.cos(a) * out + rand(-6, 6), vy: Math.sin(a) * out * .6 - rand(10, 26), r: rand(.1, .2) * Math.min(w, h * .8),
      grow: rand(.5, .9), rot: rand(0, 6.3), spin: rand(-.35, .35), life: rand(1.2, 1.9), age: -delay, peak: rand(.22, .34), img: sprites[Math.floor(Math.random() * sprites.length)] });
  }
  function draw(time) {
    frame = 0;
    const dt = Math.min((time - (last || time)) / 1000, .05); last = time;
    ctx.clearRect(0, 0, w, h);
    parts = parts.filter(p => (p.age += dt) < p.life);
    for (const p of parts) {
      if (p.age < 0) continue;
      const t = p.age / p.life;
      const alpha = t < p.peak ? Math.sin((t / p.peak) * Math.PI / 2) : Math.pow(1 - (t - p.peak) / (1 - p.peak), 1.6);
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .985; p.vy = p.vy * .985 - 4 * dt; p.rot += p.spin * dt;
      const s = p.r * (1 + p.grow * (1 - Math.pow(1 - t, 2)) * 1.6);
      ctx.globalAlpha = alpha * .72;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.drawImage(p.img, -s, -s, s * 2, s * 2); ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (parts.length) frame = requestAnimationFrame(draw); else { last = 0; ctx.clearRect(0, 0, w, h); }
  }
  return {
    // One puff: a dense burst, then a few late wisps so it thins out gently.
    puff() {
      fit();
      for (let i = 0; i < 46; i++) spawn(rand(0, .14));
      for (let i = 0; i < 22; i++) spawn(rand(.14, .6));
      if (!frame) { last = 0; frame = requestAnimationFrame(draw); }
    }
  };
}
