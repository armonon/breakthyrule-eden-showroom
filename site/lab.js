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
const state = { construction: 'canvas', garment: 'tee', size: null, fit: 'blank', color: 'black', customColor: '', artwork: 'artists-choice', seed: null, chaos: false, preChaos: null, editId: null, side: 'front', print: { x: 0, y: 0, scale: 1 } };

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
  if (state.print.x || state.print.y || state.print.scale !== 1) c.print = { ...state.print };
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
  const hx = state.customColor && CSS.supports('color', state.customColor) ? toHex(state.customColor) : null;
  if (hx) $('color-picker').value = hx;
  const sw = document.querySelector('input[name=color][value=custom]')?.closest('.choice')?.querySelector('.swatch');
  if (sw && hx) sw.style.background = hx;
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
// ---------- artwork printed onto the 3D blank ----------
// Planar projection in the fabric shader: the print lands on the chest / back / sleeve, follows the folds and turns
// with the garment. Random art uses the drawn graphics; the other directions show the same marks as the drawing.
const ART_ZONES = { // fractions of the garment's width/height: centre x, centre y, print width
  tee: { front: [0, .64, .46], back: [0, .62, .56], chest: [.2, .78, .16], sleeve: [.74, .14] },
  hoodie: { front: [0, .57, .34], back: [0, .56, .5], chest: [.17, .64, .13], sleeve: [.58, .12] },
  crewneck: { front: [0, .66, .42], back: [0, .62, .52], chest: [.2, .78, .15], sleeve: [.62, .13] },
  pants: { front: [.22, .66, .26], back: [.22, .66, .26], chest: [.22, .86, .14], sleeve: null }
};
const imageCache = new Map();
const loadImage = src => { if (!imageCache.has(src)) imageCache.set(src, new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; })); return imageCache.get(src); };
function artPlan() {
  const art = currentArt();
  if (state.artwork === 'random-experimental' && art) {
    const p = art.placement;
    return { kind: 'refs', refs: art.references, front: p !== 'Back', back: p === 'Back' || p === 'Front and back', small: p === 'Sleeve and chest', sleeve: p === 'Sleeve and chest' };
  }
  if (state.artwork === 'minimal') return { kind: 'minimal', front: true, small: true };
  if (state.artwork === 'expressive') return { kind: 'expressive', front: true, back: true };
  return { kind: 'choice', front: true };
}
async function artCanvas(plan, inkLight) {
  const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d');
  const ink = inkLight ? 'rgba(245,240,230,.92)' : 'rgba(20,18,16,.88)';
  if (plan.kind === 'refs') {
    const imgs = await Promise.all(plan.refs.map(id => loadImage('/images/breakthyrule/graphics/full/' + id + '.webp').catch(() => null)));
    const fit = (img, cx, cy, size) => { if (!img) return; const k = size / Math.max(img.width, img.height); x.drawImage(img, cx - img.width * k / 2, cy - img.height * k / 2, img.width * k, img.height * k); };
    fit(imgs[0], 512, 470, 760); fit(imgs[1], 230, 820, 330); fit(imgs[2], 800, 840, 300);
  } else if (plan.kind === 'minimal') {
    // A single cross pattée — the house mark — drawn as a shape (no font needed).
    x.fillStyle = ink; x.translate(512, 512);
    for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(-40, -60); x.lineTo(40, -60); x.lineTo(150, -380); x.quadraticCurveTo(0, -320, -150, -380); x.closePath(); x.fill(); x.rotate(Math.PI / 2); }
    x.beginPath(); x.arc(0, 0, 72, 0, Math.PI * 2); x.fill(); x.setTransform(1, 0, 0, 1, 0, 0);
  } else if (plan.kind === 'expressive') {
    // Loud, layered marks kept inside the print area so the whole gesture lands on the garment.
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (const [col, w, pts] of [['#c9473b', 120, [170, 330, 420, 120, 620, 720, 860, 400]], ['#e0b44c', 92, [150, 700, 420, 470, 600, 880, 870, 640]], ['#3554a5', 64, [230, 860, 380, 560, 700, 760, 800, 190]]]) {
      x.strokeStyle = col; x.lineWidth = w; x.globalAlpha = .9; x.beginPath(); x.moveTo(pts[0], pts[1]); x.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]); x.stroke();
    }
    x.globalAlpha = .85; x.fillStyle = ink; for (const [cx, cy, r] of [[300, 230, 28], [760, 820, 22], [820, 260, 36], [210, 560, 18], [540, 520, 46]]) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
    x.globalAlpha = .9; x.strokeStyle = ink; x.lineWidth = 16; x.setLineDash([30, 26]); x.beginPath(); x.arc(512, 512, 400, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
    x.globalAlpha = 1;
  } else {
    x.strokeStyle = ink; x.lineWidth = 22; x.setLineDash([46, 40]); x.beginPath(); x.arc(512, 512, 330, 0, Math.PI * 2); x.stroke();
    x.setLineDash([]); x.fillStyle = ink; x.font = '400 420px "Pirata One", serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 512, 560);
  }
  const T = window.THREE, tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8; return tex;
}
// Positions go world → garment space with one per-frame matrix (the garment's own frame), so every piece of a
// multi-part garment (body, hood, pocket) shares the same print.
const DECAL_VERT = `#include <begin_vertex>
  mat4 decalM = decalRootInv * modelMatrix;
  vDecalPos = (decalM * vec4(transformed, 1.0)).xyz; vDecalNrm = normalize(mat3(decalM) * objectNormal);`;
const DECAL_FRAG = `#include <map_fragment>
  {
    vec4 d = vec4(0.0);
    if (decalFlags.x > .5 && vDecalNrm.z > .2) d = decalAt((vDecalPos.xy - decalFront.xy) / (2.0 * decalFront.zw) + .5);
    if (decalFlags.y > .5 && vDecalNrm.z < -.2) { vec4 b = decalAt(vec2(-(vDecalPos.x - decalBack.x), vDecalPos.y - decalBack.y) / (2.0 * decalBack.zw) + .5); if (b.a > d.a) d = b; }
    if (decalFlags.z > .5 && vDecalNrm.x > .45) { vec4 s2 = decalAt(vec2(-(vDecalPos.z - decalSleeve.x), vDecalPos.y - decalSleeve.y) / (2.0 * decalSleeve.zw) + .5); if (s2.a > d.a) d = s2; }
    diffuseColor.rgb = mix(diffuseColor.rgb, d.rgb, d.a * .96);
  }`;
function decalMaterial(m) {
  if (m.userData.decal) return m.userData.decal;
  const T = window.THREE;
  const u = { decalMap: { value: null }, decalRootInv: { value: new T.Matrix4() }, decalFront: { value: new T.Vector4() }, decalBack: { value: new T.Vector4() }, decalSleeve: { value: new T.Vector4() }, decalFlags: { value: new T.Vector3() } };
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = 'uniform mat4 decalRootInv;\nvarying vec3 vDecalPos;\nvarying vec3 vDecalNrm;\n' + shader.vertexShader.replace('#include <begin_vertex>', DECAL_VERT);
    shader.fragmentShader = 'uniform sampler2D decalMap;\nuniform vec4 decalFront;\nuniform vec4 decalBack;\nuniform vec4 decalSleeve;\nuniform vec3 decalFlags;\nvarying vec3 vDecalPos;\nvarying vec3 vDecalNrm;\nvec4 decalAt(vec2 uv){ if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0); return texture2D(decalMap, uv); }\n'
      + shader.fragmentShader.replace('#include <map_fragment>', DECAL_FRAG);
  };
  m.customProgramCacheKey = () => 'btr-lab-decal';
  m.needsUpdate = true;
  m.userData.decal = u;
  return u;
}
let printToken = 0, lastPrint = '';
async function printArt() {
  const model = three.viewer?.model(); const T = window.THREE; if (!model || !T) return;
  const token = ++printToken;
  const garmentRoot = model.children[0] || model; garmentRoot.updateMatrixWorld(true);
  const inv = new T.Matrix4().copy(garmentRoot.matrixWorld).invert();
  const fabric = [], box = new T.Box3();
  model.traverse(n => { if (!n.isMesh) return; const rel = new T.Matrix4().multiplyMatrices(inv, n.matrixWorld);
    if (!n.geometry.boundingBox) n.geometry.computeBoundingBox(); box.union(n.geometry.boundingBox.clone().applyMatrix4(rel));
    for (const m of [].concat(n.material)) if (!/topstitch|thread/i.test(m.name)) fabric.push([n, m]); });
  const size = box.getSize(new T.Vector3()), min = box.min;
  const zones = ART_ZONES[GARMENT_TYPES[state.garment].silhouette === 'pants' ? 'pants' : state.garment] || ART_ZONES.tee;
  const plan = artPlan();
  const pr = state.print;
  const zone = (z, front = true) => z ? new T.Vector4(min.x + size.x * (.5 + z[0] + (front ? pr.x : 0)), min.y + size.y * (z[1] + pr.y), size.x * z[2] * pr.scale / 2, size.x * z[2] * pr.scale / 2) : new T.Vector4();
  const wide = z => z && plan.kind === 'expressive' ? [z[0], z[1] - .04, Math.min(.66, z[2] * 1.4)] : z;
  const front = zone(plan.small ? zones.chest : wide(zones.front)), back = zone(wide(zones.back), false);
  const sleeve = zones.sleeve ? new T.Vector4(min.z + size.z * .5, min.y + size.y * zones.sleeve[0], size.x * zones.sleeve[1] / 2, size.x * zones.sleeve[1] / 2) : new T.Vector4();
  const fc = fabricColor(), light = fc ? (fc.r * .3 + fc.g * .59 + fc.b * .11) < .35 : true;
  const key = model.uuid + JSON.stringify(plan) + light + JSON.stringify(pr);
  if (key === lastPrint) { printToken--; return; }
  const texKey = model.uuid + JSON.stringify(plan) + light;
  lastPrint = key;
  const tex = three.texKey === texKey && three.tex ? three.tex : await artCanvas(plan, light);
  three.texKey = texKey; three.tex = tex;
  if (token !== printToken) { lastPrint = ''; return; }
  for (const [mesh, m] of fabric) {
    const u = decalMaterial(m);
    if (u.decalMap.value && u.decalMap.value !== tex) u.decalMap.value.dispose(); u.decalMap.value = tex;
    u.decalFront.value.copy(front); u.decalBack.value.copy(back); u.decalSleeve.value.copy(sleeve);
    u.decalFlags.value.set(plan.front ? 1 : 0, plan.back ? 1 : 0, plan.sleeve && zones.sleeve ? 1 : 0);
    if (!mesh.userData.decalHook) { mesh.userData.decalHook = true; mesh.onBeforeRender = () => { const d = m.userData.decal; if (d) d.decalRootInv.value.copy(garmentRoot.matrixWorld).invert(); }; }
  }
  three.viewer.redraw();
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
  printArt();
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
    ? '3D blank — the real cut in your colour with the artwork laid on. A preview: every print is placed by hand and will differ.'
    : (three.failed ? '3D is unavailable on this device — showing the drawing. ' : '') + 'Conceptual preview — every piece is printed by hand and the finished garment will differ.';
  if (!on) { clearInterval(three.timer); return; }
  if (await ensure3D()) { tint(); three.viewer.setZoom($('zoom').value / 100); }
  else if (three.failed) renderThree();
}
// ---------- print placement ----------
function syncPrintControls() {
  $('print-scale').value = Math.round(state.print.scale * 100); $('print-scale-out').textContent = Math.round(state.print.scale * 100) + '%';
  $('print-y').value = Math.round(state.print.y * 100); $('print-x').value = Math.round(state.print.x * 100);
}
function setPrint(p) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  state.print = { x: +clamp(p.x ?? state.print.x, -.25, .25).toFixed(2), y: +clamp(p.y ?? state.print.y, -.25, .25).toFixed(2), scale: +clamp(p.scale ?? state.print.scale, .6, 1.6).toFixed(2) };
  syncPrintControls(); renderStage(); renderReview();
}
$('print-scale').addEventListener('input', e => setPrint({ scale: e.target.value / 100 }));
$('print-y').addEventListener('input', e => setPrint({ y: e.target.value / 100 }));
$('print-x').addEventListener('input', e => setPrint({ x: e.target.value / 100 }));
$('print-reset').onclick = () => setPrint({ x: 0, y: 0, scale: 1 });
// Move mode: drag on the garment moves the print, the wheel resizes it (the garment holds still facing you).
let moveDrag = null;
$('print-move').onclick = () => {
  const on = $('print-move').getAttribute('aria-pressed') !== 'true';
  $('print-move').setAttribute('aria-pressed', String(on)); $('print-drag').hidden = !on;
  $('stage-frame').classList.toggle('moving-print', on);
  if (on) { setSide('front'); if (use3D()) three.viewer?.view('front'); }
};
$('print-drag').addEventListener('pointerdown', e => { moveDrag = { x: e.clientX, y: e.clientY, p: { ...state.print } }; $('print-drag').setPointerCapture(e.pointerId); });
$('print-drag').addEventListener('pointermove', e => {
  if (!moveDrag) return; const r = $('stage-frame').getBoundingClientRect();
  setPrint({ x: moveDrag.p.x + (e.clientX - moveDrag.x) / r.width * .9, y: moveDrag.p.y - (e.clientY - moveDrag.y) / r.height * .9 });
});
$('print-drag').addEventListener('pointerup', () => { moveDrag = null; });
$('print-drag').addEventListener('wheel', e => { e.preventDefault(); setPrint({ scale: state.print.scale * (e.deltaY > 0 ? .95 : 1.05) }); }, { passive: false });

$('mode-3d').onclick = () => { three.wanted = true; renderThree(); };
$('mode-draw').onclick = () => { three.wanted = false; renderThree(); };

function renderStage() {
  const desc = GARMENT_TYPES[state.garment];
  $('stage-art').innerHTML = garmentSVG({ silhouette: desc.silhouette, color: state.color, customColor: state.customColor, artwork: state.artwork, art: currentArt(), side: state.side, id: 'stage', print: state.print });
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
  if (t.name === 'color') { state.color = t.value; leaveChaos(); if (t.value === 'custom' && !state.customColor) state.customColor = $('color-picker').value; renderColors(); if (t.value === 'custom') $('color-picker').focus(); }
  if (t.name === 'artwork') { state.artwork = t.value; if (t.value === 'random-experimental' && !state.seed) state.seed = newSeed(); if (t.value !== 'random-experimental') leaveChaos(); renderArt(); }
  refresh();
});
const toHex = c => { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = '#000'; x.fillStyle = c; const v = x.fillStyle; return /^#[0-9a-f]{6}$/i.test(v) ? v : null; };
$('custom-color').addEventListener('input', e => { state.customColor = e.target.value; const hx = CSS.supports('color', e.target.value) ? toHex(e.target.value) : null; if (hx) $('color-picker').value = hx; renderStage(); renderReview(); });
$('color-picker').addEventListener('input', e => { state.customColor = e.target.value; $('custom-color').value = e.target.value; renderColors(); renderStage(); renderReview(); });
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
    Object.assign(state, { construction: c.construction, garment: c.garment, size: c.size, fit: c.fit, color: c.color, customColor: c.customColor || '', artwork: c.artwork, seed: c.seed || null, chaos: !!c.chaos, editId, print: { x: 0, y: 0, scale: 1, ...(c.print || {}) } });
  } else preselect(params.get('c'), params.get('g'));
  renderAll(); renderSpecials(); renderCatalog(); syncPrintControls();
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
