// Shop hero: an endless run of Garment Lab pieces. Each turn of the garment brings new graphics — drawn by the
// Lab's own random draw — and every few turns a different garment. The swap happens while the garment is edge-on,
// so it reads as one piece becoming the next. Clicking opens that exact piece in the Lab.
import { OFFERINGS, GARMENT_TYPES } from '/labkit/catalog.mjs';
import { normalizeItem, priceItem, sidesFor } from '/labkit/pricing.mjs';
import { newSeed } from '/labkit/random.mjs';
import { ARTWORK_POOL } from '/labkit/artwork-pool.mjs';
import { createPrinter, BLANKS, preloadArt } from '/site/garment-print.mjs';

const $ = id => document.getElementById(id);
const stage = $('hero-stage'), mount = $('hero-viewer');
const T = window.THREE;
const POOL = ARTWORK_POOL.map(a => a.id);
const explicit = new Set(ARTWORK_POOL.filter(a => a.explicit).map(a => a.id));
const nameOf = Object.fromEntries(ARTWORK_POOL.map(a => [a.id, a.display || a.name]));
const money = c => '$' + (c / 100).toFixed(c % 100 ? 2 : 0);
const b64 = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Garments with a 3D blank; tees come up most often.
const GARMENTS = [['tee', 5], ['hoodie', 3], ['crewneck', 3], ['sweatpants', 1]].filter(([g]) => OFFERINGS.canvas[g] && BLANKS[g]);
const HOUSE_COLOURS = ['#6b1d1d', '#2f3b2a', '#1f2a44', '#8a6a3b', '#5a4a6e', '#b6a88f'];
const weighted = list => { let r = Math.random() * list.reduce((s, [, w]) => s + w, 0); for (const [v, w] of list) if ((r -= w) < 0) return v; return list[0][0]; };

// One Lab piece: The Canvas, a random-experimental draw. Seeds whose draw includes an explicit graphic are skipped,
// and draws that print on the back are preferred so both sides of the turn show something.
function drawPiece(garment) {
  let best = null;
  for (let i = 0; i < 24; i++) {
    const r = Math.random();
    const color = r < .42 ? 'black' : r < .74 ? 'white' : 'custom';
    const raw = { product: 'garment', construction: 'canvas', garment, size: 'M', fit: 'blank', color, customColor: color === 'custom' ? HOUSE_COLOURS[Math.floor(Math.random() * HOUSE_COLOURS.length)] : '', artwork: 'random-experimental', seed: newSeed(), quantity: 1 };
    const n = normalizeItem(raw, { artworkPool: POOL }); if (!n.ok) continue;
    const sides = sidesFor(n.item);
    if ([...sides.front, ...sides.back].some(id => explicit.has(id))) continue;
    best = { raw, item: n.item, sides };
    if (sides.front.length && sides.back.length) break;
  }
  return best;
}
const kindOf = g => GARMENT_TYPES[g].silhouette === 'pants' ? 'pants' : g;
const colourOf = p => new T.Color(p.item.color === 'black' ? '#1b1a19' : p.item.color === 'white' ? '#eeece6' : p.item.customColor);

let viewer = null, printer = null, current = null, next = null, turning = false;
function plan(p) { return { front: p.sides.front.length ? { kind: 'refs', ids: p.sides.front } : null, back: p.sides.back.length ? { kind: 'big', ids: p.sides.back } : null }; }
function label(p) {
  const { raw, item, sides } = p;
  const offering = OFFERINGS.canvas[item.garment];
  const { size, ...design } = raw; void size;
  stage.href = '/lab?design=' + b64(design) + '#build';
  $('hero-plate').textContent = 'Lab piece';
  $('hero-name').textContent = offering.name + ' · ' + (item.color === 'custom' ? 'house colour' : item.color);
  $('hero-price').textContent = money(priceItem(item).totalCents);
  const names = [...new Set([...sides.front, ...sides.back])].map(id => nameOf[id].replace(/ \(alt( \d+)?\)$/, '')).slice(0, 3);
  $('hero-chapter').textContent = 'From the Garment Lab';
  stage.title = names.join(' · ');
  stage.setAttribute('aria-label', `A random piece from the Garment Lab: ${offering.name}, ${names.join(', ')}. Open it in the Lab.`);
}
// Get the next piece ready (its graphics and, if needed, its blank) before the garment turns edge-on.
function prepare() {
  const change = Math.random() < .34;
  const garment = change ? weighted(GARMENTS.filter(([g]) => g !== current?.item.garment)) : current?.item.garment || 'tee';
  const p = drawPiece(garment); if (!p) return;
  p.ready = Promise.all([preloadArt([...p.sides.front, ...p.sides.back]), viewer.preload(BLANKS[garment]).catch(() => null)]);
  next = p;
}
async function show(p) {
  if (viewer.model() == null || current?.item.garment !== p.item.garment) await viewer.load(BLANKS[p.item.garment]);
  await printer.apply({ kind: kindOf(p.item.garment), plan: plan(p), color: colourOf(p), backSize: p.item.backSize, print: p.item.print });
  current = p; label(p);
}
// Each full turn, at the edge-on angle after the back has shown, the next piece takes over.
let lastTurn = null;
function onFrame(yaw) {
  const turn = Math.floor((yaw - Math.PI * 1.5) / (Math.PI * 2));
  if (lastTurn === null) { lastTurn = turn; return; }
  if (turn === lastTurn || turning || !next) { lastTurn = turn; return; }
  lastTurn = turn; turning = true;
  const p = next; next = null;
  p.ready.then(() => show(p)).catch(() => {}).finally(() => { turning = false; prepare(); });
}

(async () => {
  if (!T || !stage || !mount || !window.createGarmentViewer) return;
  viewer = window.createGarmentViewer(mount, { onFrame }); if (!viewer) return;
  printer = createPrinter(viewer);
  const first = drawPiece('tee'); if (!first) return;
  try {
    await Promise.all([viewer.preload(BLANKS.tee), preloadArt([...first.sides.front, ...first.sides.back])]);
    await show(first);
    mount.querySelector('canvas').classList.add('live');
    $('hero-photo').hidden = true; // the featured photo is only the fallback
    stage.querySelector('.hero-top span:last-child').textContent = 'a new piece every turn';
    prepare();
  } catch { /* the featured photo stays */ }
  setTimeout(() => $('hero-halo')?.classList.add('lit'), 250);
})();
