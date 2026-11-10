// The Garment Lab page: six-step configurator, the Altar of Chance, The Relic Box, The Trinity, catalog.
import { CONSTRUCTIONS, OFFERINGS, GARMENT_TYPES, COLORS, ARTWORK, SIZES, FITS, RELIC_BOX, TRINITY, SIZE_CHART } from '/labkit/catalog.mjs';
import { normalizeItem, priceItem, describeItem } from '/labkit/pricing.mjs';
import { drawArt, drawChaos, newSeed } from '/labkit/random.mjs';
import { artworkThumb, ARTWORK_POOL } from '/labkit/artwork-pool.mjs';
import { garmentSVG, itemSketch } from '/site/garment-sketch.mjs';
import { cart, POOL, labStatus, money } from '/site/cart-store.mjs';

const $ = id => document.getElementById(id);
const h = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids.flat()) if (k != null) n.append(k); return n; };
const nameOf = Object.fromEntries(ARTWORK_POOL.map(a => [a.id, a.name]));
const params = new URLSearchParams(location.search);

let status = null;
// Real 3D blanks (Ghost Studio, converted to meshopt). Shorts and long sleeves fall back to the drawing.
const BLANKS = { tee: '/models/blanks/tee.glb', hoodie: '/models/blanks/hoodie.glb', crewneck: '/models/blanks/crewneck.glb', sweatpants: '/models/blanks/pants.glb' };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const three = { viewer: null, loaded: null, loading: null, failed: false, wanted: false, hue: 0, timer: 0 };
const state = { construction: 'canvas', garment: 'tee', size: null, fit: 'blank', color: 'black', customColor: '', artwork: 'artists-choice', seed: null, chaos: false, preChaos: null, editId: null, side: 'front' };

// ---------- helpers ----------
const slotInfo = (c, g) => status?.slots?.[`${c}:${g}`] || null;
const skuInfo = sku => status?.skus?.[sku] || null;
function availabilityText(info) {
  if (!status) return { text: 'Availability confirmed at checkout', open: true };
  if (!info || info.available <= 0) return { text: 'At capacity', open: false };
  return { text: info.leadTimeDays != null ? `Open · about ${info.leadTimeDays} days to make` : 'Open for orders', open: true };
}
function choice(group, value, title, { sub = '', price = '', checked = false, disabled = false, badge = '', swatch = null } = {}) {
  const input = h('input', { type: 'radio', name: group, value, checked, disabled });
  const label = h('label', { className: 'choice' + (disabled ? ' is-off' : '') }, input,
    swatch ? h('span', { className: 'swatch', style: `background:${swatch}` }) : null,
    h('span', { className: 'choice-title' }, title, price ? h('em', { className: 'choice-price', textContent: price }) : null),
    sub ? h('span', { className: 'choice-sub', textContent: sub }) : null,
    badge ? h('span', { className: 'choice-badge', textContent: badge }) : null);
  return label;
}
const sizeButton = (group, value, checked) => { const input = h('input', { type: 'radio', name: group, value, checked }); return h('label', { className: 'size' }, input, h('span', { textContent: value })); };
function config() {
  const c = { product: 'garment', construction: state.construction, garment: state.garment, size: state.size, fit: state.fit, color: state.color, artwork: state.artwork, quantity: 1 };
  if (state.color === 'custom') c.customColor = state.customColor;
  if (state.artwork === 'random-experimental' || state.chaos) c.seed = state.seed;
  if (state.chaos) c.chaos = true;
  return c;
}
const currentArt = () => state.artwork === 'random-experimental' && state.seed ? drawArt(state.seed, POOL) : null;

// ---------- render steps ----------
function renderConstruction() {
  $('opt-construction').replaceChildren(...Object.values(CONSTRUCTIONS).map(c => {
    const from = Math.min(...Object.values(OFFERINGS[c.id]).map(o => o.priceCents));
    return choice('construction', c.id, c.name, { sub: c.blurb, price: 'from ' + money(from), checked: state.construction === c.id });
  }));
}
function renderGarments() {
  $('opt-garment').replaceChildren(...Object.entries(OFFERINGS[state.construction]).map(([id, o]) => {
    const a = availabilityText(slotInfo(state.construction, id));
    return choice('garment', id, o.name, { price: money(o.priceCents), checked: state.garment === id, badge: a.text, sub: '' });
  }));
}
function renderSizes() {
  $('opt-size').replaceChildren(...SIZES.map(s => sizeButton('size', s, state.size === s)));
  const fits = FITS[state.construction];
  $('opt-fit').hidden = fits.length < 2;
  $('opt-fit').replaceChildren(...fits.map(f => choice('fit', f.id, f.name, { sub: f.note, checked: state.fit === f.id })));
  $('size-note').textContent = SIZE_CHART ? '' : (fits.length < 2
    ? 'Fit follows the blank. Measured size charts are being finalised — we confirm fit with you before printing.'
    : 'Measured size charts for our patterns are being finalised — we confirm your measurements before cutting.');
}
function renderColors() {
  $('opt-color').replaceChildren(...Object.values(COLORS).map(c => choice('color', c.id, c.name, {
    price: c.addCents ? '+' + money(c.addCents) : 'included', checked: state.color === c.id,
    swatch: c.swatch || (c.id === 'random' ? 'linear-gradient(135deg,#c9473b,#e0b44c,#3f7d5a,#3554a5)' : 'repeating-linear-gradient(45deg,#b9a98f 0 4px,#8d7b62 4px 7px)')
  })));
  $('custom-color-wrap').hidden = state.color !== 'custom';
  $('custom-color').value = state.customColor;
}
function renderArt() {
  $('opt-art').replaceChildren(...Object.values(ARTWORK).map(a => choice('artwork', a.id, a.name, { sub: a.blurb, price: 'included', checked: state.artwork === a.id })));
  const art = currentArt();
  $('altar').hidden = !art;
  $('unchaos').hidden = !state.chaos;
  if (!art) return;
  $('seed-label').textContent = 'Seed ' + state.seed + (state.chaos ? ' · Total chaos' : '');
  $('altar-draw').replaceChildren(...[['Direction', `${art.category} / ${art.secondary}`], ['Placement', art.placement], ['Technique', art.technique]].flatMap(([k, v]) => [h('dt', { textContent: k }), h('dd', { textContent: v })]));
  $('altar-refs').replaceChildren(...art.references.map(id => h('figure', {}, h('img', { src: artworkThumb(id), alt: nameOf[id] || id, loading: 'lazy' }), h('figcaption', { textContent: nameOf[id] || id }))));
}
// ---------- 3D blank ----------
function fabricColor() {
  const T = window.THREE; if (!T) return null;
  if (state.color === 'black') return new T.Color('#1b1a19');
  if (state.color === 'white') return new T.Color('#eeece6');
  if (state.color === 'custom') return new T.Color(typeof CSS !== 'undefined' && state.customColor && CSS.supports('color', state.customColor) ? state.customColor : '#9c8f7a');
  return new T.Color().setHSL(three.hue, .55, .5); // random: the house picks — cycle through hues
}
function tint() {
  const model = three.viewer?.model(); const c = fabricColor(); if (!model || !c) return;
  model.traverse(n => {
    if (!n.isMesh) return;
    for (const m of [].concat(n.material)) {
      if (!m.userData.labOriginal) m.userData.labOriginal = { map: m.map, color: m.color.clone() };
      if (/topstitch|thread/i.test(m.name)) { m.color.copy(c).multiplyScalar(.55); }
      else { m.map = null; m.color.copy(c); }
      m.needsUpdate = true;
    }
  });
  three.viewer.redraw();
  clearInterval(three.timer);
  if (state.color === 'random' && !reduceMotion) three.timer = setInterval(() => { three.hue = (three.hue + .07) % 1; tint(); }, 900);
}
async function ensure3D() {
  const url = BLANKS[state.garment];
  if (!url || three.failed) return false;
  if (!three.viewer) { three.viewer = window.createGarmentViewer?.($('stage-3d'), { wheelZoom: true }) || null; if (!three.viewer) { three.failed = true; return false; } three.viewer.setAuto(!reduceMotion); }
  if (three.loaded === url) return true;
  three.loading = url; $('stage-loading').hidden = false;
  try { await three.viewer.load(url); three.loaded = url; if (three.loading !== url) { renderThree(); return false; } tint(); return true; }
  catch { three.failed = true; return false; }
  finally { if (three.loading === url) $('stage-loading').hidden = true; }
}
const use3D = () => three.wanted && !!BLANKS[state.garment] && !three.failed;
async function renderThree() {
  const on = use3D();
  $('mode-3d').disabled = !BLANKS[state.garment] || three.failed;
  $('mode-3d').setAttribute('aria-pressed', String(on)); $('mode-draw').setAttribute('aria-pressed', String(!on));
  $('stage-3d').hidden = !on; $('stage-art').hidden = on;
  $('stage-label').textContent = on
    ? '3D blank — the real cut in your colour. Artwork is placed by hand; switch to Drawing to see the direction.'
    : (three.failed ? '3D is unavailable on this device — showing the drawing. ' : '') + 'Conceptual preview — every piece is printed by hand and the finished garment will differ.';
  if (!on) { clearInterval(three.timer); return; }
  if (await ensure3D()) { tint(); three.viewer.setZoom($('zoom').value / 100); }
  else if (three.failed) renderThree();
}
$('mode-3d').onclick = () => { three.wanted = true; renderThree(); };
$('mode-draw').onclick = () => { three.wanted = false; renderThree(); };

function renderStage() {
  const desc = GARMENT_TYPES[state.garment];
  $('stage-art').innerHTML = garmentSVG({ silhouette: desc.silhouette, color: state.color, customColor: state.customColor, artwork: state.artwork, art: currentArt(), side: state.side, id: 'stage' });
  $('stage-art').style.transform = `scale(${$('zoom').value / 100})`;
  renderThree();
}
function renderReview() {
  const n = normalizeItem(config(), { artworkPool: POOL });
  const err = $('lab-error'), add = $('add-to-cart');
  if (!n.ok) {
    $('review-spec').replaceChildren(h('li', { className: 'pending', textContent: n.errors[0] }));
    $('breakdown').replaceChildren(); $('total').textContent = '—'; $('review-timeline').textContent = '';
    add.disabled = true; $('waitlist').hidden = true; err.textContent = '';
    return;
  }
  const p = priceItem(n.item), d = describeItem(n.item);
  $('review-spec').replaceChildren(h('li', { className: 'title', textContent: d.title }), ...d.spec.map(s => h('li', { textContent: s })));
  $('breakdown').replaceChildren(...p.lines.map(l => h('tr', {}, h('th', { scope: 'row', textContent: l.label }), h('td', { textContent: l.cents ? money(l.cents) : 'included' }))));
  $('total').textContent = money(p.unitCents);
  const info = slotInfo(n.item.construction, n.item.garment), a = availabilityText(info);
  $('review-timeline').textContent = info?.leadTimeDays != null ? `Estimated production: about ${info.leadTimeDays} days after payment, then shipping.` : status ? 'Production time is confirmed after your order.' : '';
  add.disabled = !a.open;
  add.textContent = state.editId ? 'Save changes' : a.open ? `Add to cart — ${money(p.unitCents)}` : 'At capacity';
  $('cancel-edit').hidden = !state.editId;
  $('waitlist').hidden = a.open;
  err.textContent = '';
}
function renderAll() { renderConstruction(); renderGarments(); renderSizes(); renderColors(); renderArt(); renderStage(); renderReview(); }
const refresh = () => { renderArt(); renderStage(); renderReview(); };

// ---------- events ----------
const form = $('lab-form');
form.addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'construction') {
    state.construction = t.value; leaveChaos();
    if (!OFFERINGS[state.construction][state.garment]) state.garment = Object.keys(OFFERINGS[state.construction])[0];
    const fits = FITS[state.construction]; state.fit = fits.length === 1 ? fits[0].id : (fits.some(f => f.id === state.fit) ? state.fit : null);
    renderAll(); return;
  }
  if (t.name === 'garment') { state.garment = t.value; leaveChaos(); }
  if (t.name === 'size') state.size = t.value;
  if (t.name === 'fit') { state.fit = t.value; leaveChaos(); }
  if (t.name === 'color') { state.color = t.value; leaveChaos(); renderColors(); if (t.value === 'custom') $('custom-color').focus(); }
  if (t.name === 'artwork') { state.artwork = t.value; if (t.value === 'random-experimental' && !state.seed) state.seed = newSeed(); if (t.value !== 'random-experimental') leaveChaos(); renderArt(); }
  refresh();
});
$('custom-color').addEventListener('input', e => { state.customColor = e.target.value; renderStage(); renderReview(); });
function leaveChaos() { if (state.chaos) { state.chaos = false; state.preChaos = null; } }
$('redraw').onclick = () => { state.seed = newSeed(); if (state.chaos) applyChaos(false); refresh(); };
$('chaos').onclick = () => { if (!state.chaos) state.preChaos = { garment: state.garment, color: state.color, fit: state.fit, artwork: state.artwork, seed: state.seed, customColor: state.customColor }; state.seed = newSeed(); applyChaos(true); };
$('unchaos').onclick = () => { if (state.preChaos) Object.assign(state, state.preChaos); state.chaos = false; state.preChaos = null; renderAll(); };
function applyChaos(full = true) {
  const c = drawChaos(state.seed, { construction: state.construction }, POOL);
  Object.assign(state, { garment: c.garment, color: c.color, fit: c.fit, artwork: 'random-experimental', chaos: true });
  if (full) renderAll(); else { renderGarments(); renderSizes(); renderColors(); }
}
$('side-front').onclick = () => setSide('front'); $('side-back').onclick = () => setSide('back');
function setSide(side) { state.side = side; if (use3D()) three.viewer?.view(side); $('side-front').setAttribute('aria-pressed', String(side === 'front')); $('side-back').setAttribute('aria-pressed', String(side === 'back')); $('stage-art').classList.remove('flip'); void $('stage-art').offsetWidth; $('stage-art').classList.add('flip'); renderStage(); }
$('zoom').addEventListener('input', renderStage);

form.addEventListener('submit', e => {
  e.preventDefault();
  const r = state.editId ? cart.replace(state.editId, config()) : cart.add(config());
  if (!r.ok) { $('lab-error').textContent = r.errors.join(' '); return; }
  const was = state.editId; state.editId = null;
  if (was) history.replaceState(null, '', location.pathname + '#build');
  document.dispatchEvent(new CustomEvent('lab:open-cart', { detail: { added: r.id } }));
  renderReview();
});
$('cancel-edit').onclick = () => { state.editId = null; history.replaceState(null, '', location.pathname + '#build'); renderReview(); };
$('waitlist-join').onclick = async () => {
  const email = $('waitlist-email').value.trim();
  if (!email) { $('waitlist-status').textContent = 'Enter your email.'; return; }
  try {
    const r = await fetch('/api/lab/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, slot: `${state.construction}:${state.garment}` }) });
    $('waitlist-status').textContent = r.ok ? 'You are on the list.' : (await r.json().catch(() => ({}))).error || 'Could not join right now.';
  } catch { $('waitlist-status').textContent = 'Could not join right now.'; }
};

// ---------- specials ----------
function renderSpecials() {
  $('relic-art').innerHTML = itemSketch({ product: 'relic-box' });
  $('trinity-art').innerHTML = itemSketch({ product: 'trinity' });
  $('relic-size').replaceChildren(...SIZES.map(s => sizeButton('relic-size', s, false)));
  $('relic-fit').replaceChildren(...RELIC_BOX.fits.map(f => { const l = sizeButton('relic-fit', f.id, false); l.querySelector('span').textContent = f.name; return l; }));
  $('relic-ex').replaceChildren(...RELIC_BOX.exclusions.map(x => h('label', { className: 'check' }, h('input', { type: 'checkbox', value: x, name: 'relic-ex' }), ' ' + x)));
  $('tri-size').replaceChildren(...SIZES.map(s => sizeButton('tri-size', s, false)));
  $('tri-variant').replaceChildren(...TRINITY.variants.map(v => choice('tri-variant', v.id, v.name, { sub: v.note, checked: v.id === 'curated' })));
  renderPolicy();
}
function renderPolicy() {
  const pol = status?.relicPolicies;
  $('relic-policy').replaceChildren(pol
    ? h('details', {}, h('summary', { textContent: 'What is guaranteed, condition, sizing and fulfilment' }), ...['contents', 'condition', 'sizing', 'fulfillment'].map(k => h('p', {}, h('strong', { textContent: k[0].toUpperCase() + k.slice(1) + ': ' }), pol[k])))
    : h('p', { className: 'fine', textContent: 'The guaranteed contents, garment condition, sizing rules and fulfilment policy are published here before the Relic Box goes on public sale.' }));
}
function stockLine(id, sku) {
  const info = skuInfo(sku);
  $(id).textContent = !status ? 'Availability confirmed at checkout.' : info?.available > 0 ? `${info.available} available in this size` : sku.endsWith(':') ? '' : 'Sold out in this size';
}
function relicConfig() {
  return { product: 'relic-box', size: document.querySelector('input[name=relic-size]:checked')?.value, fit: document.querySelector('input[name=relic-fit]:checked')?.value,
    exclusions: [...document.querySelectorAll('input[name=relic-ex]:checked')].map(i => i.value), preferences: $('relic-pref').value };
}
function trinityConfig() { return { product: 'trinity', size: document.querySelector('input[name=tri-size]:checked')?.value, variant: document.querySelector('input[name=tri-variant]:checked')?.value }; }
$('relic-form').addEventListener('change', () => { const c = relicConfig(); if (c.size) stockLine('relic-stock', `relic-box:${c.size}`); });
$('trinity-form').addEventListener('change', () => { const c = trinityConfig(); if (c.size && c.variant) stockLine('trinity-stock', `trinity:${c.variant}:${c.size}`); });
function addSpecial(e, cfg, errId, sku) {
  e.preventDefault();
  const info = sku && skuInfo(sku);
  if (status && sku && !(info?.available > 0)) { $(errId).textContent = 'That size is sold out right now.'; return; }
  const r = cart.add(cfg);
  $(errId).textContent = r.ok ? '' : r.errors.join(' ');
  if (r.ok) document.dispatchEvent(new CustomEvent('lab:open-cart', { detail: { added: r.id } }));
}
$('relic-form').addEventListener('submit', e => { const c = relicConfig(); addSpecial(e, c, 'relic-error', c.size ? `relic-box:${c.size}` : null); });
$('trinity-form').addEventListener('submit', e => { const c = trinityConfig(); addSpecial(e, c, 'trinity-error', c.size && c.variant ? `trinity:${c.variant}:${c.size}` : null); });

// ---------- catalog ----------
function catalogEntries() {
  const out = [];
  for (const [c, garments] of Object.entries(OFFERINGS)) for (const [g, o] of Object.entries(garments)) {
    const info = slotInfo(c, g);
    out.push({ type: c, title: o.name, sub: CONSTRUCTIONS[c].name, priceCents: o.priceCents, available: status ? (info?.available || 0) > 0 : null, href: `?c=${c}&g=${g}#build`,
      art: garmentSVG({ silhouette: GARMENT_TYPES[g].silhouette, color: c === 'cut-sew' ? 'black' : 'white', artwork: 'artists-choice', id: `cat-${c}-${g}` }) });
  }
  const anySku = prefix => status ? Object.entries(status.skus || {}).some(([k, v]) => k.startsWith(prefix) && v.available > 0) : null;
  out.push({ type: 'special', title: RELIC_BOX.name, sub: 'Mystery box', priceCents: RELIC_BOX.priceCents, available: anySku('relic-box:'), href: '#relic', art: itemSketch({ product: 'relic-box' }) });
  out.push({ type: 'special', title: TRINITY.name, sub: 'Three tees', priceCents: TRINITY.priceCents, available: anySku('trinity:'), href: '#trinity', art: itemSketch({ product: 'trinity' }) });
  return out;
}
function renderCatalog() {
  const type = $('cat-type').value, sort = $('cat-sort').value, onlyAvail = $('cat-available').checked;
  let list = catalogEntries().filter(e => type === 'all' || e.type === type).filter(e => !onlyAvail || e.available !== false);
  list.sort((a, b) => sort === 'price-desc' ? b.priceCents - a.priceCents : sort === 'available' ? (b.available === true) - (a.available === true) || a.priceCents - b.priceCents : a.priceCents - b.priceCents);
  $('catalog-grid').replaceChildren(...(list.length ? list.map(e => {
    const card = h('a', { className: 'offer', href: e.href }, h('div', { className: 'offer-art' }), h('div', { className: 'offer-body' },
      h('span', { className: 'offer-sub', textContent: e.sub }), h('strong', { textContent: e.title }), h('em', { textContent: money(e.priceCents) }),
      h('span', { className: 'offer-state ' + (e.available === false ? 'off' : 'on'), textContent: e.available == null ? 'Checked at checkout' : e.available ? 'Available' : 'At capacity / sold out' })));
    card.querySelector('.offer-art').innerHTML = e.art;
    card.addEventListener('click', ev => { if (e.href.startsWith('?')) { ev.preventDefault(); const p = new URLSearchParams(e.href.split('#')[0]); preselect(p.get('c'), p.get('g')); $('build').scrollIntoView({ behavior: 'smooth' }); } });
    return card;
  }) : [h('p', { className: 'fine', textContent: 'Nothing matches those filters.' })]));
}
['cat-type', 'cat-sort', 'cat-available'].forEach(id => $(id).addEventListener('change', renderCatalog));

function preselect(c, g) {
  if (CONSTRUCTIONS[c]) { state.construction = c; const fits = FITS[c]; state.fit = fits.length === 1 ? fits[0].id : null; }
  if (OFFERINGS[state.construction][g]) state.garment = g;
  leaveChaos(); renderAll();
}

// ---------- start ----------
(async () => {
  const editId = params.get('edit'), line = editId && cart.get(editId);
  if (line?.config?.product === 'garment') {
    const c = line.config;
    Object.assign(state, { construction: c.construction, garment: c.garment, size: c.size, fit: c.fit, color: c.color, customColor: c.customColor || '', artwork: c.artwork, seed: c.seed || null, chaos: !!c.chaos, editId });
  } else preselect(params.get('c'), params.get('g'));
  renderAll(); renderSpecials(); renderCatalog();
  // Open on the 3D blank once the stage is on screen (nothing heavy loads before that).
  if ('IntersectionObserver' in window && window.THREE) {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); if (!three.wanted && BLANKS[state.garment]) { three.wanted = true; renderThree(); } } }, { rootMargin: '200px' });
    io.observe($('stage-frame'));
  }
  if (params.get('canceled')) { $('lab-notice').hidden = false; $('lab-notice').textContent = 'Checkout was canceled — nothing was charged, and your cart is still here.'; }
  status = await labStatus();
  if (status?.notice) { $('lab-notice').hidden = false; $('lab-notice').textContent = status.notice; }
  renderGarments(); renderReview(); renderPolicy(); renderCatalog();
})();
