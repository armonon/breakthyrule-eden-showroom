// Home, "The codex, pasted up": four garments under the sticker board. Drag a sticker off the board onto a garment
// and it prints there — up to three graphics on the front, one big one on the back. Each garment can be turned,
// recoloured, shuffled, cleared, and opened in the Garment Lab as that exact design.
import { createPrinter } from '/site/garment-print.mjs';
import { OFFERINGS } from '/labkit/catalog.mjs';
import { POOL_IDS } from '/labkit/artwork-pool.mjs';

const host = document.getElementById('codex-lab');
const T = window.THREE;
const graphics = window.breakthyruleAssets?.graphics || [];
const inPool = new Set(POOL_IDS);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const STATIONS = [
  { id: 'tee', name: 'Tee', url: '/models/blanks/tee.glb', kind: 'tee', construction: 'canvas', garment: 'tee', color: 'white' },
  { id: 'thermal', name: 'Thermal', url: '/rack-models/eternal-thermal-tailored-v6.glb', kind: 'tee', construction: 'cut-sew', garment: 'longsleeve', color: 'white' },
  { id: 'hoodie', name: 'Hoodie', url: '/models/blanks/hoodie.glb', kind: 'hoodie', construction: 'canvas', garment: 'hoodie', color: 'black' },
  { id: 'crew', name: 'Crewneck', url: '/models/blanks/crewneck.glb', kind: 'crewneck', construction: 'canvas', garment: 'crewneck', color: 'black' }
];
const FABRIC = { white: '#eeece6', black: '#1b1a19' };
const money = c => '$' + (c / 100).toFixed(c % 100 ? 2 : 0);
const b64 = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const h = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids.flat()) if (k != null) n.append(k); return n; };
const nameOf = id => graphics.find(g => g.id === id)?.name || 'graphic';

function station(cfg) {
  const st = { ...cfg, front: [], back: [], side: 'front', viewer: null, printer: null, ready: false };
  const stage = h('div', { className: 'cl-stage' }, h('div', { className: 'cl-drop', textContent: 'Drop art here' }), h('div', { className: 'cl-loading', textContent: 'Loading…' }));
  const side = (s, label) => { const b = h('button', { type: 'button', textContent: label }); b.setAttribute('aria-pressed', String(s === 'front')); b.onclick = () => turn(s); return b; };
  const frontBtn = side('front', 'Front'), backBtn = side('back', 'Back');
  const swatch = c => { const b = h('button', { type: 'button', className: 'cl-swatch', title: c === 'white' ? 'White' : 'Black' }); b.style.background = FABRIC[c]; b.setAttribute('aria-label', 'Make it ' + c); b.setAttribute('aria-pressed', String(st.color === c)); b.onclick = () => { st.color = c; card.querySelectorAll('.cl-swatch').forEach(x => x.setAttribute('aria-pressed', String(x === b))); paint(); }; return b; };
  const shuffle = h('button', { type: 'button', className: 'cl-link', textContent: 'Shuffle' });
  const clear = h('button', { type: 'button', className: 'cl-link', textContent: 'Clear' });
  const status = h('p', { className: 'cl-status', ariaLive: 'polite', textContent: 'Drag a graphic from the board onto me.' });
  const make = h('a', { className: 'cl-make', href: '/lab#build', textContent: 'Make it in the Lab →' });
  const offering = OFFERINGS[cfg.construction][cfg.garment];
  const card = h('article', { className: 'cl-station' }, stage,
    h('header', {}, h('strong', { textContent: cfg.name }), h('em', { textContent: (cfg.construction === 'cut-sew' ? 'Cut & Sew · ' : '') + money(offering.priceCents) })),
    h('div', { className: 'cl-controls' }, h('div', { className: 'cl-seg', role: 'group', ariaLabel: 'Side' }, frontBtn, backBtn), h('div', { className: 'cl-swatches' }, swatch('white'), swatch('black')), shuffle, clear),
    status, make);
  card.dataset.id = cfg.id;
  Object.assign(st, { card, stage, status, make });

  function turn(s) { st.side = s; frontBtn.setAttribute('aria-pressed', String(s === 'front')); backBtn.setAttribute('aria-pressed', String(s === 'back')); st.viewer?.view(s); resumeLater(); }
  let resumeTimer = 0;
  function resumeLater() { clearTimeout(resumeTimer); if (!reduce) resumeTimer = setTimeout(() => st.viewer?.setAuto(true), 6000); }
  function plan() { return { front: st.front.length ? { kind: 'refs', ids: st.front } : null, back: st.back.length ? { kind: 'big', ids: st.back } : null }; }
  async function paint() {
    if (!st.ready) return;
    await st.printer.apply({ kind: cfg.kind, plan: plan(), color: new T.Color(FABRIC[st.color]), backSize: 'full' });
    const picks = { front: st.front.filter(id => inPool.has(id)), back: st.back.filter(id => inPool.has(id)) };
    const design = { product: 'garment', construction: cfg.construction, garment: cfg.garment, fit: cfg.construction === 'cut-sew' ? 'regular' : 'blank', color: st.color, artwork: 'pick', picks, backSize: 'full', quantity: 1 };
    make.href = picks.front.length || picks.back.length ? '/lab?design=' + b64(design) + '#build' : '/lab#build';
  }
  st.add = id => {
    const list = st.side === 'back' ? st.back : st.front, limit = st.side === 'back' ? 1 : 3;
    if (!list.includes(id)) { list.push(id); while (list.length > limit) list.shift(); }
    status.textContent = `${nameOf(id)} on the ${st.side}.` + (st.side === 'front' && st.front.length === 3 ? ' The front is full — the next one replaces the oldest.' : '');
    st.viewer?.view(st.side); resumeLater(); paint();
    card.classList.remove('printed'); void card.offsetWidth; card.classList.add('printed');
  };
  shuffle.onclick = () => {
    const pool = graphics.filter(g => inPool.has(g.id)), pick = () => pool[Math.floor(Math.random() * pool.length)].id;
    st.front = [...new Set([pick(), pick(), pick()].slice(0, 1 + Math.floor(Math.random() * 3)))]; st.back = [pick()];
    status.textContent = 'Shuffled: ' + [...st.front, ...st.back].map(nameOf).join(' · '); paint();
  };
  clear.onclick = () => { st.front = []; st.back = []; status.textContent = 'Cleared. Drag a graphic from the board onto me.'; paint(); };
  st.load = async () => {
    if (st.viewer || !window.createGarmentViewer) return;
    st.viewer = window.createGarmentViewer(stage, { spin: .55 }); if (!st.viewer) { stage.querySelector('.cl-loading').textContent = '3D is not available here'; return; }
    st.printer = createPrinter(st.viewer);
    try {
      await st.viewer.load(cfg.url); st.ready = true; stage.querySelector('.cl-loading').remove();
      stage.querySelector('canvas').classList.add('live'); await paint();
    } catch { stage.querySelector('.cl-loading').textContent = 'Could not load this garment'; }
  };
  stage.addEventListener('pointerdown', () => resumeLater());
  return st;
}

if (host && T && graphics.length) {
  const stations = STATIONS.map(station);
  host.append(
    h('div', { className: 'cl-head' }, h('p', { className: 'kicker', textContent: 'Try it on' }), h('p', { className: 'cl-hint', textContent: 'Drag any graphic off the board onto a garment. Turn it to the back for one big print.' })),
    h('div', { className: 'cl-grid' }, stations.map(s => s.card)));
  // Load the garments only when the section comes near the screen.
  new IntersectionObserver((entries, io) => { if (entries.some(e => e.isIntersecting)) { io.disconnect(); stations.forEach(s => s.load()); } }, { rootMargin: '300px' }).observe(host);
  const at = (x, y) => stations.find(s => { const r = s.stage.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
  let over = null;
  document.addEventListener('btr-sticker-drag', e => { const s = at(e.detail.x, e.detail.y); if (s !== over) { over?.card.classList.remove('over'); s?.card.classList.add('over'); over = s; } });
  document.addEventListener('btr-sticker-drop', e => {
    over?.card.classList.remove('over'); over = null;
    const s = at(e.detail.x, e.detail.y); if (!s || !e.detail.item) return;
    e.preventDefault(); s.add(e.detail.item.id);
  });
  const css = document.createElement('style');
  css.textContent = `.codex-lab{margin-top:28px}
.cl-head{display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;margin-bottom:12px}.cl-hint{margin:0;font-style:italic;color:var(--muted)}
.cl-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.cl-station{position:relative;display:flex;flex-direction:column;gap:8px;background:var(--paper-2);border:1px solid var(--line);padding:10px 10px 12px;transition:transform .2s,box-shadow .2s}
.cl-stage{position:relative;height:clamp(220px,24vw,320px);background:radial-gradient(80% 70% at 50% 45%,color-mix(in srgb,var(--paper) 70%,#fff),var(--paper-2));overflow:hidden;cursor:grab;touch-action:pan-y}
.cl-stage canvas{position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity .6s}.cl-stage canvas.live{opacity:1}
.cl-loading{position:absolute;inset:0;display:grid;place-items:center;font-style:italic;color:var(--muted);font-size:14px}
.cl-drop{position:absolute;inset:8px;z-index:2;display:grid;place-items:center;border:2px dashed var(--rubric);color:var(--rubric);font:600 12px/1 var(--sans,system-ui);letter-spacing:.18em;text-transform:uppercase;background:color-mix(in srgb,var(--paper) 55%,transparent);opacity:0;pointer-events:none;transition:opacity .15s}
body.sticker-dragging .cl-drop{opacity:.55}.cl-station.over .cl-drop{opacity:1;background:color-mix(in srgb,var(--rubric) 12%,transparent)}
.cl-station.over{transform:translateY(-4px);box-shadow:0 14px 30px rgba(40,25,10,.18)}
.cl-station.printed .cl-stage{animation:cl-print .5s cubic-bezier(.2,1.6,.4,1)}@keyframes cl-print{40%{transform:scale(1.035)}}
.cl-station header{display:flex;justify-content:space-between;align-items:baseline;font-family:var(--display,inherit)}
.cl-station header strong{font-size:20px}.cl-station header em{color:var(--rubric);font-family:var(--serif)}
.cl-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cl-seg{display:inline-flex;border:1px solid var(--line)}.cl-seg button{border:0;background:transparent;padding:5px 10px;font-size:13px;cursor:pointer}.cl-seg button[aria-pressed=true]{background:var(--ink);color:var(--paper)}
.cl-swatches{display:inline-flex;gap:6px}.cl-swatch{width:22px;height:22px;border-radius:50%;border:1px solid var(--line);cursor:pointer;padding:0}.cl-swatch[aria-pressed=true]{outline:2px solid var(--rubric);outline-offset:2px}
.cl-link{border:0;background:none;padding:0;font-size:13px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;color:var(--ink)}
.cl-status{margin:0;font-size:13px;color:var(--muted);min-height:2.6em}
.cl-make{font:600 12px/1 var(--sans,system-ui);letter-spacing:.14em;text-transform:uppercase;color:var(--rubric);text-decoration:none}.cl-make:hover{text-decoration:underline}
.paste-ghost{position:fixed;z-index:9999;pointer-events:none;transform:translate(-50%,-50%) rotate(-6deg) scale(1.1);filter:drop-shadow(0 16px 20px rgba(40,25,10,.4))}
@media(max-width:1000px){.cl-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:520px){.cl-grid{gap:10px}.cl-station{padding:8px}.cl-stage{height:200px}.cl-controls{gap:8px}}`;
  document.head.append(css);
}
