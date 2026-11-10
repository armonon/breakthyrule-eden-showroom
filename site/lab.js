// The Garment Lab page: six-step configurator, the Altar of Chance, The Relic Box, The Trinity, catalog.
import { CONSTRUCTIONS, OFFERINGS, GARMENT_TYPES, COLORS, ARTWORK, SIZES, FITS, RELIC_BOX, TRINITY, SIZE_CHART, PICK_LIMITS, BACK_SIZES } from '/labkit/catalog.mjs';
import { normalizeItem, priceItem, describeItem, sidesFor } from '/labkit/pricing.mjs';
import { drawArt, drawChaos, newSeed } from '/labkit/random.mjs';
import { artworkThumb, ARTWORK_POOL, PICKER_TAGS } from '/labkit/artwork-pool.mjs';
import { itemSketch } from '/site/garment-sketch.mjs';
import { cart, POOL, labStatus, money } from '/site/cart-store.mjs';

const $ = id => document.getElementById(id);
const h = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids.flat()) if (k != null) n.append(k); return n; };
const nameOf = Object.fromEntries(ARTWORK_POOL.map(a => [a.id, a.display || a.name]));
const params = new URLSearchParams(location.search);

let status = null;
// Real 3D blanks (Ghost Studio, converted to meshopt). Shorts and long sleeves show a panel instead.
const BLANKS = { tee: '/models/blanks/tee.glb', hoodie: '/models/blanks/hoodie.glb', crewneck: '/models/blanks/crewneck.glb', sweatpants: '/models/blanks/pants.glb' };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const three = { viewer: null, loaded: null, loading: null, failed: false, wanted: false, hue: 0, timer: 0 };
const state = { construction: 'canvas', garment: 'tee', size: null, fit: 'blank', color: 'black', customColor: '', artwork: 'artists-choice', seed: null, chaos: false, preChaos: null, editId: null, side: 'front', print: { x: 0, y: 0, scale: 1 }, picks: { front: [], back: [] }, backSize: 'full' };

// ---------- helpers ----------
const slotInfo = (c, g) => status?.slots?.[`${c}:${g}`] || null;
const skuInfo = sku => status?.skus?.[sku] || null;
function availabilityText(info) {
  if (!status) return { text: '', open: true };
  if (!info || info.available <= 0) return { text: 'At capacity — waitlist', open: false };
  return { text: info.leadTimeDays != null ? `About ${info.leadTimeDays} days to make` : '', open: true };
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
  if (state.artwork === 'pick') c.picks = { front: [...state.picks.front], back: [...state.picks.back] };
  if (hasBack()) c.backSize = state.backSize;
  return c;
}
const hasBack = () => sidesFor({ artwork: state.artwork, art: currentArt(), picks: state.artwork === 'pick' ? state.picks : null }).back.length > 0;
// The price shows from the first click: until a size is chosen the review prices a placeholder size.
function displayConfig() { return { ...config(), size: state.size || 'M' };
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
  renderPicker();
  if (!art) return;
  $('seed-label').textContent = 'Seed ' + state.seed + (state.chaos ? ' · Total chaos' : '');
  $('altar-draw').replaceChildren(...[['Direction', `${art.category} / ${art.secondary}`], ['Placement', art.placement], ['Technique', art.technique]].flatMap(([k, v]) => [h('dt', { textContent: k }), h('dd', { textContent: v })]));
  const sides = sidesFor(itemLike());
  $('altar-refs').replaceChildren(...[...sides.back.map(id => ['Back', id]), ...sides.front.map(id => ['Front', id])].map(([side, id]) => h('figure', {}, h('img', { src: artworkThumb(id), alt: nameOf[id] || id, loading: 'lazy' }), h('figcaption', { textContent: `${side}: ${nameOf[id] || id}` }))));
}
// ---------- 3D blank ----------
function fabricColor() {
  const T = window.THREE; if (!T) return null;
  if (state.color === 'black') return new T.Color('#1b1a19');
  if (state.color === 'white') return new T.Color('#eeece6');
  if (state.color === 'custom') return new T.Color(typeof CSS !== 'undefined' && state.customColor && CSS.supports('color', state.customColor) ? state.customColor : '#9c8f7a');
  return new T.Color('#b9b0a2'); // random: the house picks — shown undyed, with a note
}
// ---------- artwork printed onto the 3D blank ----------
// Planar projection in the fabric shader, in garment space: the front gets the chosen composition, the back one
// big print (up to 18 × 20 in). It follows the folds, turns with the garment and spans multi-part pieces.
const IN = .0254;
const FRONT_ZONES = { // fractions of garment width/height: centre x, centre y, print width
  tee: { front: [0, .64, .46], chest: [.2, .78, .16] },
  hoodie: { front: [0, .57, .34], chest: [.17, .64, .13] },
  crewneck: { front: [0, .66, .42], chest: [.2, .78, .15] },
  pants: { front: [.22, .66, .26], chest: [.22, .86, .14] }
};
const BACK_TOP_GAP = { tee: .075, crewneck: .08, hoodie: .30 }; // metres below the top of the garment (hoodies: below the hood)
const imageCache = new Map();
const loadImage = src => { if (!imageCache.has(src)) imageCache.set(src, new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; })); return imageCache.get(src); };
const fullArt = id => '/images/breakthyrule/graphics/full/' + id + '.webp';
function itemLike() { return { artwork: state.artwork, art: currentArt(), picks: state.artwork === 'pick' ? state.picks : null }; }
function sidePlan() {
  if (state.artwork === 'random-experimental' || state.artwork === 'pick') {
    const s = sidesFor(itemLike());
    return { front: s.front.length ? { kind: 'refs', ids: s.front } : null, back: s.back.length ? { kind: 'big', ids: s.back } : null };
  }
  if (state.artwork === 'minimal') return { front: { kind: 'minimal' }, back: null, small: true };
  if (state.artwork === 'expressive') return { front: { kind: 'expressive' }, back: { kind: 'expressive' } };
  return { front: null, back: null, note: "Artist's choice — the artist decides the print. You'll see it when it's made." };
}
async function sideCanvas(plan, inkLight, back) {
  const c = document.createElement('canvas'); c.width = back ? 922 : 1024; c.height = 1024; const x = c.getContext('2d'), W = c.width, H = c.height;
  const ink = inkLight ? 'rgba(245,240,230,.92)' : 'rgba(20,18,16,.88)';
  const fit = (img, cx, cy, w, h) => { if (!img) return; const k = Math.min(w / img.width, h / img.height); x.drawImage(img, cx - img.width * k / 2, cy - img.height * k / 2, img.width * k, img.height * k); };
  if (plan.kind === 'big' || plan.kind === 'refs') {
    const imgs = await Promise.all(plan.ids.map(id => loadImage(fullArt(id)).catch(() => null)));
    if (plan.kind === 'big' || imgs.length === 1) fit(imgs[0], W / 2, H / 2, W, H);
    else if (imgs.length === 2) { fit(imgs[0], W / 2, H * .33, W * .9, H * .62); fit(imgs[1], W / 2, H * .8, W * .7, H * .38); }
    else { fit(imgs[0], W / 2, H * .44, W * .78, H * .7); fit(imgs[1], W * .22, H * .82, W * .4, H * .34); fit(imgs[2], W * .78, H * .82, W * .4, H * .34); }
  } else if (plan.kind === 'minimal') {
    x.fillStyle = ink; x.translate(W / 2, H / 2);
    for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(-40, -60); x.lineTo(40, -60); x.lineTo(150, -380); x.quadraticCurveTo(0, -320, -150, -380); x.closePath(); x.fill(); x.rotate(Math.PI / 2); }
    x.beginPath(); x.arc(0, 0, 72, 0, Math.PI * 2); x.fill(); x.setTransform(1, 0, 0, 1, 0, 0);
  } else if (plan.kind === 'expressive') {
    x.lineCap = 'round'; x.lineJoin = 'round'; x.scale(W / 1024, H / 1024);
    for (const [col, w, pts] of [['#c9473b', 130, [120, 300, 420, 60, 640, 760, 920, 380]], ['#e0b44c', 100, [90, 720, 420, 470, 600, 940, 940, 660]], ['#3554a5', 70, [200, 900, 380, 560, 700, 780, 840, 140]]]) {
      x.strokeStyle = col; x.lineWidth = w; x.globalAlpha = .9; x.beginPath(); x.moveTo(pts[0], pts[1]); x.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]); x.stroke();
    }
    x.globalAlpha = .85; x.fillStyle = ink; for (const [cx, cy, r] of [[300, 230, 28], [760, 820, 22], [820, 260, 36], [210, 560, 18], [540, 520, 46]]) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
    x.globalAlpha = 1; x.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    x.strokeStyle = ink; x.lineWidth = 22; x.setLineDash([46, 40]); x.beginPath(); x.arc(W / 2, H / 2, 330, 0, Math.PI * 2); x.stroke();
    x.setLineDash([]); x.fillStyle = ink; x.font = '700 420px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', W / 2, H / 2 + 20);
  }
  const T = window.THREE, tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8; return tex;
}
const DECAL_VERT = `#include <begin_vertex>
  mat4 decalM = decalRootInv * modelMatrix;
  vDecalPos = (decalM * vec4(transformed, 1.0)).xyz; vDecalNrm = normalize(mat3(decalM) * objectNormal);`;
const DECAL_FRAG = `#include <map_fragment>
  {
    vec4 d = vec4(0.0);
    if (decalFlags.x > .5 && vDecalNrm.z > .2) d = decalAt(decalMap, (vDecalPos.xy - decalFront.xy) / (2.0 * decalFront.zw) + .5);
    if (decalFlags.y > .5 && vDecalNrm.z < -.2) d = decalAt(decalMapBack, vec2(-(vDecalPos.x - decalBack.x), vDecalPos.y - decalBack.y) / (2.0 * decalBack.zw) + .5);
    diffuseColor.rgb = mix(diffuseColor.rgb, d.rgb, d.a * .96);
  }`;
function decalMaterial(m) {
  if (m.userData.decal) return m.userData.decal;
  const T = window.THREE;
  const u = { decalMap: { value: null }, decalMapBack: { value: null }, decalRootInv: { value: new T.Matrix4() }, decalFront: { value: new T.Vector4() }, decalBack: { value: new T.Vector4() }, decalFlags: { value: new T.Vector2() } };
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = 'uniform mat4 decalRootInv;\nvarying vec3 vDecalPos;\nvarying vec3 vDecalNrm;\n' + shader.vertexShader.replace('#include <begin_vertex>', DECAL_VERT);
    shader.fragmentShader = 'uniform sampler2D decalMap;\nuniform sampler2D decalMapBack;\nuniform vec4 decalFront;\nuniform vec4 decalBack;\nuniform vec2 decalFlags;\nvarying vec3 vDecalPos;\nvarying vec3 vDecalNrm;\nvec4 decalAt(sampler2D map, vec2 uv){ if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0); return texture2D(map, uv); }\n'
      + shader.fragmentShader.replace('#include <map_fragment>', DECAL_FRAG);
  };
  m.customProgramCacheKey = () => 'btr-lab-decal-2';
  m.needsUpdate = true;
  m.userData.decal = u;
  return u;
}
const blankTex = () => { const T = window.THREE; three.blank ||= new T.DataTexture(new Uint8Array(4), 1, 1); three.blank.needsUpdate = true; return three.blank; };
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
  const size = box.getSize(new T.Vector3()), min = box.min, max = box.max;
  const kind = GARMENT_TYPES[state.garment].silhouette === 'pants' ? 'pants' : state.garment;
  const zones = FRONT_ZONES[kind] || FRONT_ZONES.tee, plan = sidePlan(), pr = state.print;
  const fz = plan.small ? zones.chest : plan.front?.kind === 'expressive' ? [zones.front[0], zones.front[1] - .04, Math.min(.66, zones.front[2] * 1.4)] : zones.front;
  const front = new T.Vector4(min.x + size.x * (.5 + fz[0] + pr.x), min.y + size.y * (fz[1] + pr.y), size.x * fz[2] * pr.scale / 2, size.x * fz[2] * pr.scale / 2);
  // The back: one big print, up to 18 × 20 in, centred, starting just below the collar (or the hood).
  let back;
  if (kind === 'pants') back = new T.Vector4(min.x + size.x * .28, min.y + size.y * .62, size.x * .13, size.x * .13 / .9);
  else {
    const bs = BACK_SIZES[state.backSize] || BACK_SIZES.full;
    let hw = bs.w / 2 * IN, hh = bs.h / 2 * IN;
    const k = Math.min(1, (size.x * .33) / hw); hw *= k; hh *= k; // stays on the body, off the sleeves
    let top = max.y - (BACK_TOP_GAP[kind] ?? .08), cy = top - hh;
    if (cy - hh < min.y + .03) { const room = (top - min.y - .03) / 2; const s2 = room / hh; hw *= s2; hh *= s2; cy = top - hh; }
    back = new T.Vector4(min.x + size.x * .5, cy, hw, hh);
  }
  const fc = fabricColor(), light = fc ? (fc.r * .3 + fc.g * .59 + fc.b * .11) < .35 : true;
  const key = model.uuid + JSON.stringify(plan) + light + JSON.stringify(pr) + state.backSize;
  if (key === lastPrint) { printToken--; return; }
  lastPrint = key;
  const texKey = model.uuid + JSON.stringify(plan) + light;
  let texF = three.texF, texB = three.texB;
  if (three.texKey !== texKey) {
    [texF, texB] = await Promise.all([plan.front ? sideCanvas(plan.front, light, false) : null, plan.back ? sideCanvas(plan.back, light, true) : null]);
    if (token !== printToken) { lastPrint = ''; return; }
    for (const t of [three.texF, three.texB]) if (t && t !== texF && t !== texB) t.dispose();
    three.texF = texF; three.texB = texB; three.texKey = texKey;
    renderPrintSides();
  }
  for (const [mesh, m] of fabric) {
    const u = decalMaterial(m);
    u.decalMap.value = texF || blankTex(); u.decalMapBack.value = texB || blankTex();
    u.decalFront.value.copy(front); u.decalBack.value.copy(back);
    u.decalFlags.value.set(texF ? 1 : 0, texB ? 1 : 0);
    if (!mesh.userData.decalHook) { mesh.userData.decalHook = true; mesh.onBeforeRender = () => { const d = m.userData.decal; if (d) d.decalRootInv.value.copy(garmentRoot.matrixWorld).invert(); }; }
  }
  three.viewer.redraw();
}

function tint() {
  const model = three.viewer?.model(); const c = fabricColor(); if (!model || !c) return;
  model.traverse(n => {
    if (!n.isMesh) return;
    for (const m of [].concat(n.material)) {
      if (/topstitch|thread/i.test(m.name)) { m.color.copy(c).multiplyScalar(.55); }
      else { m.map = null; m.color.copy(c); }
      m.needsUpdate = true;
    }
  });
  three.viewer.redraw();
  printArt();
}
async function ensure3D() {
  const url = BLANKS[state.garment];
  if (!url || three.failed) return false;
  if (!three.viewer) { three.viewer = window.createGarmentViewer?.($('stage-3d'), { wheelZoom: true }) || null; if (!three.viewer) { three.failed = true; return false; } three.viewer.setAuto(!reduceMotion); }
  if (three.loaded === url) return true;
  three.loading = url; $('stage-loading').hidden = false;
  try { await three.viewer.load(url); three.loaded = url; lastPrint = ''; three.texKey = ''; if (three.loading !== url) { renderThree(); return false; } return true; }
  catch { three.failed = true; return false; }
  finally { if (three.loading === url) $('stage-loading').hidden = true; }
}
// Without a 3D blank (shorts, long sleeve) or without WebGL: an honest panel with the chosen graphics, no drawing.
function renderNone() {
  const name = OFFERINGS[state.construction][state.garment]?.name || 'this piece';
  $('stage-none-title').textContent = three.failed ? '3D preview is not available on this device' : `3D preview for the ${name.toLowerCase()} is coming`;
  $('stage-none-text').textContent = 'Your choices below are what the studio prints from.';
  const s = sidesFor(itemLike());
  const tiles = [...s.front.map(id => ['Front', id]), ...s.back.map(id => ['Back · up to 18 × 20 in', id])];
  $('stage-none-art').replaceChildren(...tiles.map(([side, id]) => h('figure', {}, h('img', { src: artworkThumb(id), alt: nameOf[id] || id }), h('figcaption', { textContent: `${side}: ${nameOf[id] || id}` }))));
}
// Small tiles of the actual front and back prints next to the preview; click one to turn the garment.
function renderPrintSides() {
  const tile = (side, tex) => {
    const b = h('button', { type: 'button', className: 'print-side' + (state.side === side ? ' on' : '') }, h('span', { textContent: side === 'front' ? 'Front' : 'Back' }));
    if (tex?.image) { const img = h('img', { alt: '' }); img.src = tex.image.toDataURL('image/webp', .7); b.prepend(img); } else b.prepend(h('i', { textContent: 'No print' }));
    b.setAttribute('aria-label', `Show the ${side}`); b.onclick = () => setSide(side); return b;
  };
  $('print-sides').replaceChildren(tile('front', three.texF), tile('back', three.texB));
}
async function renderThree() {
  const has3D = !!BLANKS[state.garment] && !three.failed;
  $('stage-3d').hidden = !has3D; $('stage-none').hidden = has3D;
  $('print-place').hidden = !has3D;
  $('stage-label').textContent = has3D ? 'The real blank in your colour with your artwork laid on. A preview — every print is placed by hand.' : '';
  const plan = sidePlan(), notes = [plan.note, state.color === 'random' ? 'Random colour — the house picks it; shown here undyed.' : ''].filter(Boolean);
  $('stage-note').hidden = !notes.length || !has3D; $('stage-note').textContent = notes.join(' ');
  $('back-size').hidden = !hasBack() || !has3D; $('print-sides').hidden = !has3D;
  $('back-size').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === state.backSize)));
  if (!has3D) { renderNone(); return; }
  if (!three.wanted) return; // loads when the stage scrolls into view
  if (await ensure3D()) { tint(); three.viewer.setZoom($('zoom').value / 100); }
  else if (three.failed) renderThree();
}
// ---------- print placement (front print) ----------
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
let moveDrag = null;
$('print-move').onclick = () => {
  const on = $('print-move').getAttribute('aria-pressed') !== 'true';
  $('print-move').setAttribute('aria-pressed', String(on)); $('print-drag').hidden = !on;
  $('stage-frame').classList.toggle('moving-print', on);
  if (on) setSide('front');
};
$('print-drag').addEventListener('pointerdown', e => { moveDrag = { x: e.clientX, y: e.clientY, p: { ...state.print } }; $('print-drag').setPointerCapture(e.pointerId); });
$('print-drag').addEventListener('pointermove', e => {
  if (!moveDrag) return; const r = $('stage-frame').getBoundingClientRect();
  setPrint({ x: moveDrag.p.x + (e.clientX - moveDrag.x) / r.width * .9, y: moveDrag.p.y - (e.clientY - moveDrag.y) / r.height * .9 });
});
$('print-drag').addEventListener('pointerup', () => { moveDrag = null; });
$('print-drag').addEventListener('wheel', e => { e.preventDefault(); setPrint({ scale: state.print.scale * (e.deltaY > 0 ? .95 : 1.05) }); }, { passive: false });

// ---------- the graphic picker ----------
let pickSide = 'front', pickTag = 'All', pickFocus = 0;
const visibleGraphics = () => {
  const q = $('pick-search').value.trim().toLowerCase(), explicit = $('pick-explicit').checked;
  return ARTWORK_POOL.filter(a => (explicit || !a.explicit)
    && (pickTag === 'All' || (pickTag === 'From the collection' ? a.collection : a.tags.includes(pickTag)))
    && (!q || (a.display || a.name).toLowerCase().includes(q) || a.name.toLowerCase().includes(q)))
    .sort((a, b) => (b.collection ? 1 : 0) - (a.collection ? 1 : 0) || (a.display || a.name).localeCompare(b.display || b.name));
};
function renderPicker() {
  const on = state.artwork === 'pick';
  $('picker').hidden = !on; if (!on) return;
  $('pick-front').setAttribute('aria-selected', String(pickSide === 'front')); $('pick-back').setAttribute('aria-selected', String(pickSide === 'back'));
  $('pick-front-n').textContent = `${state.picks.front.length}/${PICK_LIMITS.front}`; $('pick-back-n').textContent = `${state.picks.back.length}/${PICK_LIMITS.back}`;
  $('pick-tags').replaceChildren(...['All', ...PICKER_TAGS].map(t => { const b = h('button', { type: 'button', textContent: t }); b.setAttribute('aria-pressed', String(t === pickTag)); b.onclick = () => { pickTag = t; pickFocus = 0; renderPicker(); }; return b; }));
  const chip = (side, id) => { const b = h('button', { type: 'button', className: 'pick-chip', title: 'Remove' }, h('img', { src: artworkThumb(id), alt: '' }), h('span', { textContent: `${side === 'front' ? 'Front' : 'Back'}: ${nameOf[id] || id}` }), h('b', { textContent: '×', ariaHidden: 'true' }));
    b.setAttribute('aria-label', `Remove ${nameOf[id] || id} from the ${side}`); b.onclick = () => togglePick(side, id); return b; };
  $('pick-chosen').replaceChildren(...state.picks.front.map(id => chip('front', id)), ...state.picks.back.map(id => chip('back', id)));
  const chosen = new Set(state.picks[pickSide]), list = visibleGraphics();
  pickFocus = Math.min(pickFocus, Math.max(0, list.length - 1));
  $('pick-grid').replaceChildren(...(list.length ? list.map((a, i) => {
    const b = h('button', { type: 'button', className: 'pick-tile' + (chosen.has(a.id) ? ' on' : ''), title: a.display, role: 'option', tabIndex: i === pickFocus ? 0 : -1 }, h('img', { src: artworkThumb(a.id), alt: '', loading: 'lazy', decoding: 'async' }), h('span', { textContent: a.display }));
    b.setAttribute('aria-selected', String(chosen.has(a.id))); b.setAttribute('aria-label', a.display + (a.collection ? ' (from the collection)' : ''));
    b.dataset.index = i; b.onclick = () => { pickFocus = i; togglePick(pickSide, a.id); }; return b;
  }) : [h('p', { className: 'fine', textContent: 'No graphic matches. Try another word or category.' })]));
}
// Arrow keys move around the grid (one tab stop for the whole grid).
$('pick-grid').addEventListener('keydown', e => {
  const tiles = [...$('pick-grid').querySelectorAll('.pick-tile')]; if (!tiles.length) return;
  const i = tiles.indexOf(document.activeElement); if (i < 0) return;
  const cols = Math.max(1, Math.round($('pick-grid').clientWidth / tiles[0].getBoundingClientRect().width));
  const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -i, End: tiles.length - 1 - i }[e.key];
  if (d === undefined) return;
  e.preventDefault(); const n = Math.max(0, Math.min(tiles.length - 1, i + d));
  tiles[i].tabIndex = -1; tiles[n].tabIndex = 0; tiles[n].focus(); pickFocus = n;
});
$('pick-explicit').addEventListener('change', () => { pickFocus = 0; renderPicker(); });
function togglePick(side, id) {
  const list = state.picks[side], i = list.indexOf(id), limit = PICK_LIMITS[side];
  if (i >= 0) list.splice(i, 1);
  else if (list.length >= limit) { if (limit === 1) list.splice(0, 1, id); else { $('pick-hint').textContent = `The front holds up to ${limit} graphics — remove one first.`; return; } }
  else list.push(id);
  $('pick-hint').textContent = 'Click graphics to add them to the front (up to three). Switch to Back for one big print. Click again to remove. Arrow keys move around the grid.';
  if (side === 'back' && list.length) setSide('back'); else if (side === 'front' && list.length) setSide('front');
  renderPicker(); renderStage(); renderReview();
  $('pick-grid').querySelector('.pick-tile[tabindex="0"]')?.focus({ preventScroll: true });
}
$('pick-front').onclick = () => { pickSide = 'front'; renderPicker(); };
$('pick-back').onclick = () => { pickSide = 'back'; renderPicker(); };
let pickTimer; $('pick-search').addEventListener('input', () => { clearTimeout(pickTimer); pickTimer = setTimeout(renderPicker, 120); });
$('keep-draw').onclick = () => {
  const s = sidesFor(itemLike());
  state.picks = { front: [...s.front].slice(0, PICK_LIMITS.front), back: [...s.back].slice(0, PICK_LIMITS.back) };
  state.artwork = 'pick'; leaveChaos(); renderArt(); renderStage(); renderReview();
  $('picker').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

function renderStage() {
  renderThree();
}
function renderReview() {
  const n = normalizeItem(displayConfig(), { artworkPool: POOL });
  const err = $('lab-error'), add = $('add-to-cart');
  if (!n.ok) {
    $('review-spec').replaceChildren(h('li', { className: 'pending', textContent: n.errors[0] }));
    $('breakdown').replaceChildren(); $('total').textContent = '—';
    add.disabled = false; add.textContent = 'Add to cart'; $('waitlist').hidden = true;
    $('mbar-price').textContent = '—'; $('mbar-title').textContent = n.errors[0];
    renderTrust(null); return;
  }
  const p = priceItem(n.item), d = describeItem(n.item);
  const spec = d.spec.map(s => s.startsWith('Size:') && !state.size ? 'Size: choose in step V' : s);
  $('review-spec').replaceChildren(h('li', { className: 'title', textContent: d.title }), ...spec.map(s => h('li', { className: s.startsWith('Size: choose') ? 'pending' : '', textContent: s })));
  $('breakdown').replaceChildren(...p.lines.map(l => h('tr', {}, h('th', { scope: 'row', textContent: l.label }), h('td', { textContent: l.cents ? money(l.cents) : 'included' }))));
  $('total').textContent = money(p.unitCents);
  const info = slotInfo(n.item.construction, n.item.garment), a = availabilityText(info);
  add.disabled = !a.open;
  add.textContent = state.editId ? 'Save changes' : a.open ? `Add to cart — ${money(p.unitCents)}` : 'At capacity';
  $('cancel-edit').hidden = !state.editId;
  $('waitlist').hidden = a.open;
  $('mbar-title').textContent = d.title; $('mbar-price').textContent = money(p.unitCents);
  $('mbar-add').disabled = !a.open; $('mbar-add').textContent = state.editId ? 'Save' : a.open ? 'Add to cart' : 'At capacity';
  if (!err.dataset.sticky) err.textContent = '';
  renderTrust(info);
}
// What the customer should know before buying — only facts and what the studio has written in its settings.
function renderTrust(info) {
  const items = [
    'Printed by hand in our Los Angeles studio.',
    state.construction === 'cut-sew' ? 'Cut and sewn from scratch in 100% cotton.' : 'Printed on a blank chosen to fit your size and colour — it may be vintage or new.',
    info?.leadTimeDays != null ? `Made to order — about ${info.leadTimeDays} days to make, then shipping.` : 'Made to order — the production time is confirmed after you order.',
    'Secure checkout by Stripe. Shipping and any tax are shown before you pay.'
  ];
  if (status?.shippingNote) items.push(status.shippingNote);
  if (status?.returnsNote) items.push(status.returnsNote);
  $('trust').replaceChildren(...items.map(t => h('li', { textContent: t })));
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
  if (t.name === 'size') { state.size = t.value; delete $('lab-error').dataset.sticky; $('step-size').classList.remove('needs'); $('lab-error').textContent = ''; }
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
function setSide(side) { state.side = side; three.viewer?.view(side); $('print-sides').querySelectorAll('.print-side').forEach((b, i) => b.classList.toggle('on', (i === 0) === (side === 'front'))); $('side-front').setAttribute('aria-pressed', String(side === 'front')); $('side-back').setAttribute('aria-pressed', String(side === 'back')); }
$('zoom').addEventListener('input', renderStage);
$('back-size').addEventListener('click', e => { const b = e.target.closest('[data-size]'); if (!b) return; state.backSize = b.dataset.size; setSide('back'); renderStage(); renderReview(); });
// Once someone starts choosing, the garment stops spinning so they can look at it.
const stopSpin = () => { if (three.viewer?.isAuto()) three.viewer.setAuto(false); };
$('lab-form').addEventListener('change', stopSpin); $('stage-3d').addEventListener('pointerdown', stopSpin);

form.addEventListener('submit', e => {
  e.preventDefault();
  if (!state.size) {
    const err = $('lab-error'); err.textContent = 'Choose your size to add it to the cart.'; err.dataset.sticky = '1';
    $('step-size').classList.add('needs'); $('step-size').scrollIntoView({ block: 'center' });
    setTimeout(() => $('opt-size').querySelector('input')?.focus({ preventScroll: true }), 400);
    return;
  }
  delete $('lab-error').dataset.sticky; $('step-size').classList.remove('needs');
  const r = state.editId ? cart.replace(state.editId, config()) : cart.add(config());
  if (!r.ok) { $('lab-error').textContent = r.errors.join(' '); return; }
  const was = state.editId; state.editId = null;
  if (was) history.replaceState(null, '', location.pathname + '#build');
  document.dispatchEvent(new CustomEvent('lab:open-cart', { detail: { added: r.id } }));
  renderReview();
});
$('mbar-add').onclick = () => form.requestSubmit();
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
      art: `<div class="offer-mark"><span>${c === 'cut-sew' ? 'II' : 'I'}</span><b>${o.name}</b><i>${c === 'cut-sew' ? 'Cut & Sew · 100% cotton' : 'The Canvas'}</i></div>` });
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
      e.available === false ? h('span', { className: 'offer-state off', textContent: 'At capacity / sold out' }) : null));
    card.querySelector('.offer-art').innerHTML = e.art;
    card.addEventListener('click', ev => { ev.preventDefault(); if (e.href.startsWith('?')) { const p = new URLSearchParams(e.href.split('#')[0]); showTab('build'); preselect(p.get('c'), p.get('g')); $('build').scrollIntoView({ behavior: 'smooth' }); } else showTab(e.href.slice(1)); });
    return card;
  }) : [h('p', { className: 'fine', textContent: 'Nothing matches those filters.' })]));
}
['cat-type', 'cat-sort', 'cat-available'].forEach(id => $(id).addEventListener('change', renderCatalog));

function preselect(c, g) {
  if (CONSTRUCTIONS[c]) { state.construction = c; const fits = FITS[c]; state.fit = fits.length === 1 ? fits[0].id : null; }
  if (OFFERINGS[state.construction][g]) state.garment = g;
  leaveChaos(); renderAll();
}

// On phones the preview is pinned and compact, so the move & resize controls live in the Artwork step.
const phone = matchMedia('(max-width: 1000px)');
function placeControls() { const pp = $('print-place'); if (phone.matches) $('step-art').append(pp); else $('stage-label').before(pp); }
phone.addEventListener('change', placeControls); placeControls();

// ---------- tabs ----------
const TABS = ['build', 'relic', 'trinity', 'catalog'];
function showTab(id, push = true) {
  if (!TABS.includes(id)) id = 'build';
  for (const t of TABS) { $('tab-' + t).setAttribute('aria-selected', String(t === id)); $(t).hidden = t !== id; }
  document.body.dataset.labTab = id;
  if (push) history.replaceState(null, '', location.pathname + location.search + (id === 'build' ? '' : '#' + id));
  if (id === 'build' && three.viewer) three.viewer.redraw();
}
TABS.forEach(t => { $('tab-' + t).onclick = () => showTab(t); });
document.querySelector('.lab-tabs').addEventListener('keydown', e => {
  const i = TABS.indexOf(document.activeElement?.id?.replace('tab-', '')); if (i < 0) return;
  const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!d) return;
  e.preventDefault(); const next = TABS[(i + d + TABS.length) % TABS.length]; showTab(next); $('tab-' + next).focus();
});
addEventListener('hashchange', () => showTab(location.hash.slice(1) || 'build', false));

// ---------- share a design ----------
const b64 = { enc: o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), dec: s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))) };
$('share-design').onclick = async () => {
  const { quantity, ...design } = config(); void quantity;
  const url = `${location.origin}/lab?design=${b64.enc(design)}`;
  try { await navigator.clipboard.writeText(url); $('share-design').textContent = 'Link copied'; }
  catch { const box = $('share-url') || h('input', { id: 'share-url', className: 'share-url', readOnly: true }); box.value = url; $('share-design').after(box); box.select(); $('share-design').textContent = 'Copy the link below'; }
  setTimeout(() => { $('share-design').textContent = 'Copy a link to this design'; }, 2500);
};
function applyDesign(raw) {
  const n = normalizeItem({ ...raw, size: raw.size || 'M' }, { artworkPool: POOL }); if (!n.ok) return false;
  const c = n.item;
  Object.assign(state, { construction: c.construction, garment: c.garment, size: raw.size ? c.size : null, fit: c.fit, color: c.color, customColor: c.customColor || '', artwork: c.artwork, seed: c.seed, chaos: !!c.chaos, print: c.print, picks: c.picks ? { front: [...c.picks.front], back: [...c.picks.back] } : { front: [], back: [] }, backSize: c.backSize || 'full' });
  return true;
}

// ---------- worn by the witnesses (real photos) ----------
async function renderWorn() {
  try {
    const g = await (await fetch('/site/data/gallery.json', { cache: 'no-cache' })).json();
    const worn = g.items.filter(i => i.category === 'worn').slice(0, 10);
    if (!worn.length) { document.querySelector('.lab-worn').hidden = true; return; }
    $('lab-worn').replaceChildren(...worn.map(i => h('a', { href: '/gallery?filter=worn' }, h('img', { src: i.thumb || i.src, alt: i.alt, loading: 'lazy', decoding: 'async' }))));
  } catch { document.querySelector('.lab-worn').hidden = true; }
}

// ---------- start ----------
(async () => {
  const editId = params.get('edit'), line = editId && cart.get(editId);
  if (line?.config?.product === 'garment') {
    const c = line.config;
    Object.assign(state, { construction: c.construction, garment: c.garment, size: c.size, fit: c.fit, color: c.color, customColor: c.customColor || '', artwork: c.artwork, seed: c.seed || null, chaos: !!c.chaos, editId, print: { x: 0, y: 0, scale: 1, ...(c.print || {}) }, picks: { front: [...(c.picks?.front || [])], back: [...(c.picks?.back || [])] } });
  } else if (!(params.get('design') && (() => { try { return applyDesign(b64.dec(params.get('design'))); } catch { return false; } })())) preselect(params.get('c'), params.get('g'));
  renderAll(); renderSpecials(); renderCatalog(); syncPrintControls();
  showTab(location.hash.slice(1) || 'build', false); renderWorn();
  // Open on the 3D blank once the stage is on screen (nothing heavy loads before that).
  if ('IntersectionObserver' in window && window.THREE) {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); three.wanted = true; renderThree(); } }, { rootMargin: '200px' });
    io.observe($('stage-frame'));
  }
  if (params.get('canceled')) { $('lab-notice').hidden = false; $('lab-notice').textContent = 'Checkout was canceled — nothing was charged, and your cart is still here.'; }
  status = await labStatus();
  if (status?.notice) { $('lab-notice').hidden = false; $('lab-notice').textContent = status.notice; }
  renderGarments(); renderReview(); renderPolicy(); renderCatalog();
})();
