import { createGarmentGraphicsEditor } from '/site/garment-graphics-editor.mjs?v=2';
import { graphicBaseURL, prepareGraphicBase } from '/site/graphic-base.mjs?v=1';
import { PRODUCT_DESIGNS } from '/labkit/product-options.mjs';
import { tintProductDesign } from '/site/product-preview.mjs?v=1';
// The Garment Lab: open configurator, mystery packages and catalog.
import { CONSTRUCTIONS, OFFERINGS, offeringFor, garmentPriceParts, GARMENT_TYPES, COLORS, ARTWORK, SIZES, FITS, MYSTERY_PACKAGES, MYSTERY_FITS, MYSTERY_PREFERENCES_MAX, PICK_LIMITS, BACK_SIZES } from '/labkit/catalog.mjs';
import { garmentSizes, garmentSizeGuide } from '/labkit/sizing.mjs';
import { normalizeItem, priceItem, describeItem, sidesFor } from '/labkit/pricing.mjs';
import { drawArt, drawChaos, newSeed } from '/labkit/random.mjs';
import { artworkThumb, ARTWORK_POOL, PICKER_TAGS } from '/labkit/artwork-pool.mjs';
import { itemSketch } from '/site/garment-sketch.mjs';
import { createPrinter, BLANKS } from '/site/garment-print.mjs?v=graphics-editor-1';
import { cart, POOL, labStatus, money } from '/site/cart-store.mjs?v=site-audit-1';
import { isUploadId, uploadForId, uploadedArtworkUrl } from '/labkit/custom-artwork.mjs';
import { uploadArtworkFile } from '/site/artwork-upload.mjs';
import { quoteGarment, modeSelection, garmentSelection } from '/site/lab-price.mjs?v=price-square-1';
import { createLabFlow } from '/site/lab-flow.mjs?v=3';
import { productRoute, randomProductDesign } from '/site/lab-product-route.mjs?v=curated-2';
import { hasAvailability, madeToOrderLabel } from '/site/availability.mjs';

const $ = id => document.getElementById(id);
const h = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids.flat()) if (k != null) n.append(k); return n; };
const nameOf = Object.fromEntries(ARTWORK_POOL.map(a => [a.id, a.display || a.name]));
const params = new URLSearchParams(location.search);
const productPage = productRoute(location.pathname);
if (productPage) {
  document.body.dataset.labProduct = productPage;
  document.body.dataset.page = 'product';
  const heading = document.querySelector('.lab-head'); heading.id = 'lab-product-heading';
  const title = heading.querySelector('h1'); title.id = 'lab-product-title';
  title.textContent = productPage === 'random' ? 'Random Shirt' : 'Mystery Box';
  heading.querySelector('.lede').textContent = productPage === 'random'
    ? 'Your garment and generated artwork are ready. Choose your size, or make it your own.'
    : 'Choose your package, size and preferred fit. Leave the selection to us.';
  const back = h('a', { href: '/?nocover=1#photo-story', textContent: '← Back' }); back.dataset.productBack = '';
  heading.before(h('nav', { className: 'lab-product-nav', ariaLabel: 'Product navigation' }, back, h('a', { href: '/?nocover=1#photo-story', textContent: 'Collection' })));
  const panel = $(productPage === 'random' ? 'build' : 'packages');
  panel.setAttribute('role', 'region'); panel.setAttribute('aria-labelledby', title.id);
  if (productPage === 'random') {
    $('keep-draw').textContent = 'Edit these graphics';
    $('opt-art').after($('keep-draw'));
  }
}
const legacyPackage = { relic: 'heavy-pack', trinity: 'light-pack' };
const isPackage = id => typeof id === 'string' && Object.hasOwn(MYSTERY_PACKAGES, id);
const initialPackage = params.get('package') || legacyPackage[location.hash.slice(1)];
const packageState = { package: isPackage(initialPackage) ? initialPackage : Object.keys(MYSTERY_PACKAGES)[0], size: null, fit: null, preferences: '', quantity: 1, editId: null };

let status = null;
// Real 3D blanks (Ghost Studio, converted to meshopt). Shorts and long sleeves show a panel instead.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const three = { viewer: null, loaded: null, loading: null, failed: false, wanted: false, hue: 0, timer: 0 };
const state = { quantity: 1, baseMode: 'random', construction: 'canvas', garment: 'tee', size: null, fit: 'blank', color: 'random', customColor: '', artwork: 'artists-choice', productDesign: null, sourceDesign:null, graphicLayout:null, seed: null, chaos: false, preChaos: null, editId: null, side: 'front', print: { x: 0, y: 0, scale: 1 }, picks: { front: [], back: [] }, uploads: [], backSize: 'full' };
let flow = null, graphicsEditor = null, graphicUpdateFrame=0;
let designIssue = '', uploadBusy = false, printRevision = 0;
const artName = id => uploadForId(id, state.uploads)?.name || nameOf[id] || id;
const artThumb = id => isUploadId(id) ? uploadedArtworkUrl(uploadForId(id, state.uploads)) : artworkThumb(id);

// ---------- helpers ----------
const slotInfo = (c, g) => status?.slots?.[`${c}:${g}`] || null;
const skuInfo = sku => status?.skus?.[sku] || null;
function availabilityText(info) {
  if (!status) return { text: '', open: true };
  if (!hasAvailability(info)) return { text: 'At capacity — waitlist', open: false };
  if (info.unlimited === true) return { text: madeToOrderLabel(info), open: true };
  return { text: info.leadTimeDays != null ? `About ${info.leadTimeDays} days to make` : '', open: true };
}
function choice(group, value, title, { sub = '', price = '', checked = false, disabled = false, badge = '', swatch = null } = {}) {
  const input = h('input', { type: 'radio', name: group, value, checked, disabled });
  input.setAttribute('aria-label', title);
  const label = h('label', { className: 'choice' + (disabled ? ' is-off' : '') }, input,
    swatch ? h('span', { className: 'swatch', style: `background:${swatch}` }) : null,
    h('span', { className: 'choice-title' }, title, price ? h('em', { className: 'choice-price', textContent: price }) : null),
    sub ? h('span', { className: 'choice-sub', textContent: sub }) : null,
    badge ? h('span', { className: 'choice-badge', textContent: badge }) : null);
  return label;
}
const sizeButton = (group, value, checked) => { const input = h('input', { type: 'radio', name: group, value, checked, ariaLabel: value }); return h('label', { className: 'size' }, input, h('span', { textContent: value })); };
function config() {
  const c = { product: 'garment', labMode: state.baseMode, construction: state.construction, garment: state.garment, size: state.size, fit: state.fit, color: state.baseMode === 'random' ? 'random' : state.color, artwork: state.artwork, quantity: state.quantity };
  if(state.sourceDesign)c.sourceDesign=state.sourceDesign;
  if (state.artwork === 'product-design' && state.productDesign) c.productDesign = {...state.productDesign};
  if (state.color === 'custom') c.customColor = state.customColor;
  if (state.artwork === 'random-experimental' || state.chaos) c.seed = state.seed;
  if (state.chaos) c.chaos = true;
  if (state.print.x || state.print.y || state.print.scale !== 1) c.print = { ...state.print };
  if (state.artwork === 'pick') {
    if(state.graphicLayout)c.graphicLayout=state.graphicLayout;
    c.picks = { front: [...state.picks.front], back: [...state.picks.back] };
    const used = new Set([...c.picks.front, ...c.picks.back]);
    const uploads = state.uploads.filter(asset => used.has(asset.id));
    if (uploads.length) c.uploads = uploads.map(asset => ({ ...asset }));
  }
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
  $('opt-construction').replaceChildren(...[
    ['random', 'Random', 'Studio chooses the base and color.', 'canvas'],
    ['blank', 'Blank', 'Choose your color.', 'canvas'],
    ['cut-sew', 'Cut & Sew', 'Made from scratch in cotton.', 'cut-sew']
  ].map(([id, name, sub, construction]) => {
    const selected = modeSelection(state, id), parts = selected && garmentPriceParts({ ...state, ...selected, labMode: id });
    return choice('base-mode', id, name, { sub: selected ? sub : 'Not available for this style', price: parts ? '+' + money(parts.constructionCents) : '', checked: state.baseMode === id, disabled: !selected });
  }));
  $('construction-note').hidden = false;
  $('construction-note').textContent = 'Added to the garment starting price.';
}
function renderGarments() {
  const names = { tee: 'T-shirt', hoodie: 'Hoodie', crewneck: 'Crewneck', sweatpants: 'Sweatpants', longsleeve: 'Long sleeve', shorts: 'Sweat shorts' };
  $('opt-garment').replaceChildren(...Object.entries(names).map(([id, name]) => {
    const base = offeringFor({ construction: 'canvas', garment: id, labMode: 'random' });
    return choice('garment', id, name, { price: base ? money(base.priceCents) : '', checked: state.garment === id });
  }));
}
function renderSizes() {
  const item = { ...state, product: 'garment', labMode: state.baseMode }, sizes = garmentSizes(item), guide = garmentSizeGuide(item);
  if (state.size && !sizes.includes(state.size)) state.size = null;
  $('opt-size').replaceChildren(...sizes.map(s => sizeButton('size', s, state.size === s)));
  $('opt-size').setAttribute('aria-describedby', 'size-note');
  const fits = FITS[state.construction];
  $('opt-fit').hidden = fits.length < 2;
  $('opt-fit').replaceChildren(...fits.map(f => choice('fit', f.id, f.name, { sub: f.note, checked: state.fit === f.id })));
  $('size-note').replaceChildren(...(guide.href ? [h('a', { href: guide.href, target: '_blank', rel: 'noopener', textContent: guide.label + ' ↗', ariaLabel: guide.label + ' (opens in a new tab)', style: 'text-decoration:underline;text-underline-offset:3px' }), h('br')] : []), h('span', { textContent: guide.note }));
}
function renderColors() {
  $('opt-color').replaceChildren(...Object.values(COLORS).map(c => choice('color', c.id, c.name, {
    price: c.addCents ? '+' + money(c.addCents) : 'included', checked: state.color === c.id, disabled: state.baseMode === 'random',
    swatch: c.swatch || (c.id === 'random' ? 'linear-gradient(135deg,#c9473b,#e0b44c,#3f7d5a,#3554a5)' : 'repeating-linear-gradient(45deg,#b9a98f 0 4px,#8d7b62 4px 7px)')
  })));
  $('color-mode-note').hidden = state.baseMode !== 'random';
  $('custom-color-wrap').hidden = state.color !== 'custom' || state.baseMode === 'random';
  $('custom-color').value = state.customColor;
  const hx = state.customColor && CSS.supports('color', state.customColor) ? toHex(state.customColor) : null;
  if (hx) $('color-picker').value = hx;
  const sw = document.querySelector('input[name=color][value=custom]')?.closest('.choice')?.querySelector('.swatch');
  if (sw && hx) sw.style.background = hx;
}
function renderArt() {
  $('opt-art').replaceChildren(
    ...(state.seed ? [choice('artwork', 'random-experimental', 'Keep this generated design', { sub: 'The graphics from your selected preview.', price: 'included', checked: state.artwork === 'random-experimental' })] : []),
    ...(state.productDesign && PRODUCT_DESIGNS[state.productDesign.id] ? [choice('artwork','product-design','Keep this design',{sub:PRODUCT_DESIGNS[state.productDesign.id].name,price:'included',checked:state.artwork==='product-design'})] : []),
    choice('artwork', 'artists-choice', 'Random', { price: ARTWORK['artists-choice'].addCents ? '+' + money(ARTWORK['artists-choice'].addCents) : 'included', sub: 'The studio chooses the artwork. No reveal until it is made.', checked: state.artwork === 'artists-choice' }),
    choice('artwork', 'pick', 'Pick graphics', { price: ARTWORK.pick.addCents ? '+' + money(ARTWORK.pick.addCents) : 'included', sub: 'Choose archive graphics or upload your own.', checked: state.artwork === 'pick' })
  );
  $('altar').hidden = true;
  if (productPage === 'random') $('keep-draw').hidden = state.artwork !== 'random-experimental';
  $('unchaos').hidden = !state.chaos;
  if ($('flow-browse')) $('flow-browse').hidden = state.artwork !== 'pick';
  if (state.artwork !== 'pick' && flow?.isBrowsing) flow.browse(false);
  renderPicker();
  renderSelectedArt();
  document.body.classList.toggle('lab-graphics-editing',state.artwork==='pick');graphicsEditor?.sync();
}
// ---------- 3D blank ----------
function fabricColor() {
  const T = window.THREE; if (!T) return null;
  if (state.color === 'black') return new T.Color('#1b1a19');
  if (state.color === 'white') return new T.Color('#eeece6');
  if (state.color === 'custom') return new T.Color(typeof CSS !== 'undefined' && state.customColor && CSS.supports('color', state.customColor) ? state.customColor : '#9c8f7a');
  return new T.Color('#b9b0a2'); // random: the house picks — shown undyed, with a note
}
// ---------- artwork printed onto the 3D blank (site/garment-print.mjs) ----------
function itemLike() { return { artwork: state.artwork, art: currentArt(), picks: state.artwork === 'pick' ? state.picks : null }; }
function sidePlan() {
  if (state.artwork === 'random-experimental' || state.artwork === 'pick') {
    const s = sidesFor(itemLike());
    return { front: s.front.length ? { kind: 'refs', ids: s.front, layers:state.artwork==='pick'?state.graphicLayout?.front:null } : null, back: s.back.length ? { kind: 'big', ids: s.back, layers:state.artwork==='pick'?state.graphicLayout?.back:null } : null };
  }
  if (state.artwork === 'minimal') return { front: { kind: 'minimal' }, back: null, small: true };
  if (state.artwork === 'expressive') return { front: { kind: 'expressive' }, back: { kind: 'expressive' } };
  return { front: null, back: null, note: "Artist's choice — the artist decides the print. You'll see it when it's made." };
}
let printer = null;
async function printArt() {
  if ((state.baseMode === 'random' && state.artwork !== 'pick') || !three.viewer?.model()) return;
  if(state.artwork==='product-design'&&state.productDesign){tintProductDesign(three.viewer.model(),state.color,PRODUCT_DESIGNS[state.productDesign.id],state.productDesign.graphic,state.customColor);three.viewer.redraw();return;}
  printer ||= createPrinter(three.viewer);
  const kind = GARMENT_TYPES[state.garment].silhouette === 'pants' ? 'pants' : state.garment;
  const revision = ++printRevision;
  try {
    const tex = await printer.apply({ kind, plan: sidePlan(), color: fabricColor(), backSize: state.backSize, print: state.print, uploads: state.uploads });
    if (!tex || revision !== printRevision) return;
    graphicsEditor?.previewReady();
    const hadError = three.printError;
    three.printError = '';
    if (tex.front !== three.texF || tex.back !== three.texB) { three.texF = tex.front; three.texB = tex.back; renderPrintSides(); }
    if (hadError) renderReview();
  } catch (error) {
    if (revision !== printRevision) return;
    three.printError = error.message || 'Your artwork preview could not be loaded.';
    $('stage-note').hidden = false; $('stage-note').textContent = three.printError;
    renderReview();
  }
}
function tint() { printArt(); }
async function ensure3D() {
  const reference=state.artwork==='product-design'?PRODUCT_DESIGNS[state.productDesign?.id]:state.artwork==='pick'?PRODUCT_DESIGNS[state.sourceDesign]:null;
  const url = reference?.model ? (state.artwork==='pick'?graphicBaseURL(reference.model):reference.model) : BLANKS[state.garment];
  if (!url || three.failed) return false;
  if (!three.viewer) { three.viewer = window.createGarmentViewer?.($('stage-3d'), { wheelZoom: false }) || null; if (!three.viewer) { three.failed = true; return false; } three.viewer.setAuto(!reduceMotion); }
  if (three.loaded === url) return true;
  three.loading = url; $('stage-loading').hidden = false;
  try { await three.viewer.load(url);if(state.artwork==='pick'&&reference)prepareGraphicBase(three.viewer.model()); three.loaded = url; if (three.loading !== url) { renderThree(); return false; } return true; }
  catch { three.failed = true; return false; }
  finally { if (three.loading === url) $('stage-loading').hidden = true; }
}
// Without a 3D blank (shorts, long sleeve) or without WebGL: an honest panel with the chosen graphics, no drawing.
function renderNone() {
  const name = OFFERINGS[state.construction][state.garment]?.name || 'this piece';
  $('stage-none-title').textContent = three.failed ? '3D preview is not available on this device' : `3D preview for the ${name.toLowerCase()} is coming`;
  $('stage-none-text').textContent = 'Your choices below are what the studio prints from.';
  const s = sidesFor(itemLike());
  const tiles = [...s.front.map(id => ['Front', id]), ...s.back.map(id => [(state.backSize === 'medium' ? 'Back · 12 × 13 in' : 'Back · 16 × 20 in'), id])];
  $('stage-none-art').replaceChildren(...tiles.map(([side, id]) => h('figure', {}, h('img', { src: artThumb(id), alt: artName(id) }), h('figcaption', { textContent: `${side}: ${artName(id)}` }))));
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
  document.body.dataset.baseMode = state.baseMode;
  const surprise = state.baseMode === 'random' && state.artwork !== 'pick';
  if ($('flow-surprise')) $('flow-surprise').hidden = !surprise;
  if (surprise) {
    ++printRevision; three.viewer?.setAuto(false);
    for (const id of ['stage-3d', 'stage-none', 'stage-loading', 'stage-note', 'print-sides', 'back-size', 'print-place']) $(id).hidden = true;
    $('stage-label').textContent = 'You choose the garment type. The studio chooses the actual base and color.';
    if ($('flow-placement')) $('flow-placement').hidden = true;
    return;
  }
  const designPreview=state.artwork==='product-design'?PRODUCT_DESIGNS[state.productDesign?.id]:state.artwork==='pick'?PRODUCT_DESIGNS[state.sourceDesign]:null;
  const has3D = !!(designPreview?.model || BLANKS[state.garment]) && !three.failed;
  $('stage-3d').hidden = !has3D; $('stage-none').hidden = has3D;
  $('print-place').hidden = !has3D || state.artwork==='pick';
  if ($('flow-placement')) $('flow-placement').hidden = true;
  $('stage-label').textContent = designPreview&&state.artwork==='pick' ? 'Drag a selected graphic to place it. Switch to Rotate to turn the garment.' : designPreview ? 'Collection design reference. Your selected construction and fit are made to order.' : has3D ? 'The real blank in your colour with your artwork laid on. A preview — every print is placed by hand.' : '';
  const plan = sidePlan(), notes = [plan.note, state.color === 'random' ? 'Random colour — the house picks it; shown here undyed.' : ''].filter(Boolean);
  $('stage-note').hidden = !notes.length || !has3D || (state.artwork === 'artists-choice' && state.color !== 'random'); $('stage-note').textContent = notes.join(' ');
  $('back-size').hidden = !hasBack() || !has3D; $('print-sides').hidden = !has3D || !!designPreview;
  $('back-size').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === state.backSize)));
  if (!has3D) { renderNone(); return; }
  if (!three.wanted) return; // loads when the stage scrolls into view
  if (await ensure3D()) { if (state.baseMode === 'random' && state.artwork !== 'pick') return; tint(); three.viewer.setZoom($('zoom').value / 100); }
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
  if (on) { setSide('front'); $('placement-dialog')?.close(); flow?.message('Drag the print on your garment. Open Print position to stop moving it.'); }
  else flow?.message();
  $('print-move').textContent = on ? 'Stop moving print' : 'Move print';
};
$('print-drag').addEventListener('pointerdown', e => { moveDrag = { x: e.clientX, y: e.clientY, p: { ...state.print } }; $('print-drag').setPointerCapture(e.pointerId); });
$('print-drag').addEventListener('pointermove', e => {
  if (!moveDrag) return; const r = $('stage-frame').getBoundingClientRect();
  setPrint({ x: moveDrag.p.x + (e.clientX - moveDrag.x) / r.width * .9, y: moveDrag.p.y - (e.clientY - moveDrag.y) / r.height * .9 });
});
$('print-drag').addEventListener('pointerup', () => { moveDrag = null; });
$('print-drag').addEventListener('wheel', e => { e.preventDefault(); setPrint({ scale: state.print.scale * (e.deltaY > 0 ? .95 : 1.05) }); }, { passive: false });

// ---------- the graphic picker ----------
let pickSide = 'front', pickTag = 'All', pickFocus = 0, pickView = 'grid', pickListKey = '';
const pickGrid = $('pick-grid');
const uploadInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
const uploadButton = h('button', { type: 'button', className: 'ghost', textContent: 'Upload graphic' });
const uploadStatus = h('p', { className: 'fine', role: 'status', textContent: 'PNG, JPEG or WebP · up to 3 MB' });
$('picker').querySelector('.picker-head').after(h('div', { className: 'pick-upload' }, uploadButton, uploadInput, uploadStatus));
uploadButton.onclick = () => {
  if (state.picks[pickSide].length >= PICK_LIMITS[pickSide] && pickSide === 'front') { uploadStatus.textContent = 'The front already has three graphics. Remove one before uploading another.'; return; }
  uploadInput.click();
};
uploadInput.addEventListener('change', async () => {
  const file = uploadInput.files[0], side = pickSide;
  uploadInput.value = '';
  if (!file || uploadBusy) return;
  uploadBusy = true; uploadButton.disabled = true; uploadButton.textContent = 'Uploading…'; uploadStatus.textContent = 'Saving your original graphic…'; renderReview();
  try {
    const { asset } = await uploadArtworkFile(file);
    if (!state.uploads.some(existing => existing.id === asset.id)) state.uploads.push(asset);
    state.artwork = 'pick'; designIssue = ''; leaveChaos();
    pickSide = side; togglePick(side, asset.id, false); renderArt();
    uploadStatus.textContent = state.picks[side].includes(asset.id) ? `${asset.name} saved and added to the ${side}.` : `${asset.name} saved. Remove a graphic, then choose it from Your uploads.`;
  } catch (error) { uploadStatus.textContent = error.message || 'Your graphic could not be uploaded. Please try again.'; }
  finally { uploadBusy = false; if (state.picks.front.length + state.picks.back.length) flow?.complete('art', { advance: !flow.isCompleted('art') }); uploadButton.disabled = false; uploadButton.textContent = 'Upload graphic'; renderReview(); uploadButton.focus({ preventScroll: true }); }
});
const visibleGraphics = () => {
  const q = $('pick-search').value.trim().toLowerCase(), explicit = $('pick-explicit').checked;
  const uploaded = state.uploads.map(asset => ({ id: asset.id, name: asset.name, display: asset.name, tags: ['Your uploads'] }));
  return [...uploaded, ...ARTWORK_POOL].filter(a => (explicit || !a.explicit)
    && (pickTag === 'All' || (pickTag === 'From the collection' ? a.collection : a.tags.includes(pickTag)))
    && (!q || (a.display || a.name).toLowerCase().includes(q) || a.name.toLowerCase().includes(q)))
    .sort((a, b) => (b.collection ? 1 : 0) - (a.collection ? 1 : 0) || (a.display || a.name).localeCompare(b.display || b.name));
};
function renderPicker() {
  const on = state.artwork === 'pick';
  $('picker').hidden = !on || !flow?.isBrowsing; if (!on) return;
  $('pick-front').setAttribute('aria-selected', String(pickSide === 'front')); $('pick-back').setAttribute('aria-selected', String(pickSide === 'back'));
  $('pick-front-n').textContent = `${state.picks.front.length}/${PICK_LIMITS.front}`; $('pick-back-n').textContent = `${state.picks.back.length}/${PICK_LIMITS.back}`;
  const tags = ['All', ...(state.uploads.length ? ['Your uploads'] : []), ...PICKER_TAGS];
  if (!tags.includes(pickTag)) pickTag = 'All';
  if ($('pick-filter')) {
    $('pick-filter').replaceChildren(...tags.map(tag => h('option', { value: tag, textContent: tag })));
    $('pick-filter').value = pickTag;
  }
  if ($('pick-tags')) $('pick-tags').hidden = true;
  const chip = (side, id) => { const b = h('button', { type: 'button', className: 'pick-chip', title: 'Remove' }, h('img', { src: artThumb(id), alt: '' }), h('span', { textContent: `${side === 'front' ? 'Front' : 'Back'}: ${artName(id)}` }), h('b', { textContent: '×', ariaHidden: 'true' }));
    b.setAttribute('aria-label', `Remove ${artName(id)} from the ${side}`); b.onclick = () => togglePick(side, id); return b; };
  $('pick-chosen').replaceChildren(...state.picks.front.map(id => chip('front', id)), ...state.picks.back.map(id => chip('back', id)));
  const chosen = new Set(state.picks[pickSide]), list = visibleGraphics();
  const key = JSON.stringify(list.map(a => a.id));
  const changed = key !== pickListKey;
  if (changed) {
    pickListKey = key; pickFocus = 0;
    pickGrid.replaceChildren(...(list.length ? list.map((a, i) => {
      const name = a.display || a.name;
      const b = h('button', { type: 'button', className: 'pick-tile', title: name, role: 'option', tabIndex: i === pickFocus ? 0 : -1 }, h('img', { src: artThumb(a.id), alt: '', loading: 'lazy', decoding: 'async' }), h('span', { textContent: name }));
      b.setAttribute('aria-label', name + (a.collection ? ' (from the collection)' : ''));
      b.dataset.index = i; b.dataset.art = a.id;
      b.onclick = () => { pickFocus = i; togglePick(pickSide, a.id); }; return b;
    }) : [h('p', { className: 'fine', textContent: 'No graphic matches. Try another word or category.' })]));
    pickGrid.scrollTop = 0;
  }
  pickGrid.dataset.view = pickView;
  pickGrid.setAttribute('aria-multiselectable', String(PICK_LIMITS[pickSide] > 1));
  for (const tile of pickGrid.querySelectorAll('.pick-tile')) {
    const selected = chosen.has(tile.dataset.art);
    tile.classList.toggle('on', selected);
    tile.setAttribute('aria-selected', String(selected));
    tile.tabIndex = Number(tile.dataset.index) === pickFocus ? 0 : -1;
  }
  for (const view of ['grid', 'board']) $('pick-view-' + view).setAttribute('aria-pressed', String(view === pickView));
  $('pick-page').textContent = `${list.length} graphics · scroll to explore`;
  requestAnimationFrame(updatePickerScroll);

}
// Arrow keys move around the grid (one tab stop for the whole grid).
$('pick-grid').addEventListener('keydown', e => {
  const tiles = [...$('pick-grid').querySelectorAll('.pick-tile')]; if (!tiles.length) return;
  const i = tiles.indexOf(document.activeElement); if (i < 0) return;
  const cols = Math.max(1, Math.round($('pick-grid').clientWidth / tiles[0].getBoundingClientRect().width));
  const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -i, End: tiles.length - 1 - i }[e.key];
  if (d === undefined) return;
  e.preventDefault(); const n = Math.max(0, Math.min(tiles.length - 1, i + d));
  tiles[i].tabIndex = -1; tiles[n].tabIndex = 0; tiles[n].focus({ preventScroll: true }); tiles[n].scrollIntoView({ block: 'nearest' }); pickFocus = n;
});
function updatePickerScroll() {
  $('pick-prev').disabled = pickGrid.scrollTop < 2;
  $('pick-next').disabled = pickGrid.scrollTop + pickGrid.clientHeight >= pickGrid.scrollHeight - 2;
}
pickGrid.addEventListener('scroll', updatePickerScroll, { passive: true });
if ('ResizeObserver' in window) new ResizeObserver(updatePickerScroll).observe(pickGrid);
for (const [id, delta] of [['pick-prev', -1], ['pick-next', 1]]) $(id).addEventListener('click', () => {
  pickGrid.scrollBy({ top: delta * pickGrid.clientHeight * .85, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
});
for (const view of ['grid', 'board']) $('pick-view-' + view).addEventListener('click', () => {
  const topTile = [...pickGrid.querySelectorAll('.pick-tile')].find(tile => tile.getBoundingClientRect().bottom > pickGrid.getBoundingClientRect().top);
  pickView = view; renderPicker();
  topTile?.scrollIntoView({ block: 'start' });
});
$('pick-explicit').addEventListener('change', renderPicker);
$('pick-filter')?.addEventListener('change', e => { pickTag = e.target.value; renderPicker(); });
function renderSelectedArt() {
  const box = $('flow-selected-art'); if (!box) return;
  if(state.artwork==='product-design'&&PRODUCT_DESIGNS[state.productDesign?.id]){const d=PRODUCT_DESIGNS[state.productDesign.id];box.replaceChildren(h('figure',{},h('img',{src:d.poster,alt:d.name}),h('figcaption',{textContent:d.name})));return;}
  const entries = state.artwork === 'pick' ? [...state.picks.front.map(id => ['Front', id]), ...state.picks.back.map(id => ['Back', id])] : [];
  box.replaceChildren(...(entries.length ? entries.map(([side, id]) => h('figure', {}, h('img', { src: artThumb(id), alt: artName(id) }), h('figcaption', { textContent: side }))) : [h('p', { className: 'fine', textContent: state.artwork === 'pick' ? 'No graphics selected yet.' : state.artwork === 'artists-choice' ? 'Artwork stays a surprise.' : 'Your saved artwork direction is preserved. Choose Random or Pick graphics to change it.' })]));
}
function togglePick(side, id, focusGrid = true) {
  const list = state.picks[side], i = list.indexOf(id), limit = PICK_LIMITS[side];
  if (i >= 0) list.splice(i, 1);
  else if (list.length >= limit) { if (limit === 1) list.splice(0, 1, id); else { $('pick-hint').textContent = `The front holds up to ${limit} graphics — remove one first.`; return; } }
  else list.push(id);
  designIssue = ''; three.printError = '';
  $('pick-hint').textContent = 'Front: up to 3 · Back: 1';
  if (side === 'back' && list.length) setSide('back'); else if (side === 'front' && list.length) setSide('front');
  renderPicker(); renderSelectedArt(); renderStage(); renderReview();
  if (state.picks.front.length + state.picks.back.length) flow?.complete('art', { advance: !flow.isCompleted('art') });
  else flow?.revoke('art');
  if (focusGrid) $('pick-grid').querySelector('.pick-tile[tabindex="0"]')?.focus({ preventScroll: true });
}
$('pick-front').onclick = () => { pickSide = 'front'; renderPicker(); };
$('pick-back').onclick = () => { pickSide = 'back'; renderPicker(); };
let pickTimer; $('pick-search').addEventListener('input', () => { clearTimeout(pickTimer); pickTimer = setTimeout(renderPicker, 120); });
$('keep-draw').onclick = () => {
  const s = sidesFor(itemLike());
  state.picks = { front: [...s.front].slice(0, PICK_LIMITS.front), back: [...s.back].slice(0, PICK_LIMITS.back) };
  state.artwork = 'pick'; leaveChaos(); renderArt(); renderStage(); renderReview();
  flow?.browse(true);
};

function renderStage() {
  renderThree();
}
function renderPricing(quote) {
  // Garments show starting prices; construction buttons show their additional cost.
  document.querySelectorAll('input[name="base-mode"]').forEach(input => {
    const selected = modeSelection(state, input.value);
    const parts = selected && garmentPriceParts({ ...state, ...selected, labMode: input.value });
    const price = input.closest('.choice').querySelector('.choice-price');
    if (price) { price.textContent = parts ? '+' + money(parts.constructionCents) : ''; price.title = 'Added to the garment starting price'; }
  });
  const total = $('flow-total'), nextTotal = quote ? money(quote.totalCents) : '—';
  if (total.textContent !== nextTotal) {
    total.textContent = nextTotal;
    const tile = total.closest('.flow-price');
    tile.classList.remove('is-updated'); void tile.offsetWidth; tile.classList.add('is-updated');
  }
  $('flow-total-label').textContent = quote?.quantity > 1 ? `${quote.quantity} garments · USD` : 'Item total · USD';
  if (!quote) { $('flow-price-detail').textContent = 'Choose a valid garment and options to see the price.'; return; }
  const lines = Object.fromEntries(quote.lines.map(line => [line.kind, line]));
  const parts = [`Base ${money(lines.garment.cents)}`, `${{ random: 'Random', blank: 'Blank', 'cut-sew': 'Cut & Sew' }[state.baseMode]} ${money(lines.construction.cents)}`];
  if (lines.color.cents) parts.push(`Custom color ${money(lines.color.cents)}`);
  if (lines.artwork.cents) parts.push(`Artwork ${money(lines.artwork.cents)}`);
  const unit = parts.join(' + ');
  $('flow-price-detail').textContent = quote.quantity > 1 ? `${quote.quantity} × ${money(quote.unitCents)} each. ${unit}.` : unit;
  document.querySelector('.flow-price-extras').textContent = (lines.artwork.cents ? '' : 'Artwork included. ') + 'Shipping and tax calculated separately.';
}
function renderReview() {
  if (productPage === 'random') {
    const name = 'Random ' + (OFFERINGS[state.construction]?.[state.garment]?.name || 'Garment');
    $('lab-product-title').textContent = name; document.title = 'BREAKTHYRULE — ' + name;
  }
  const n = normalizeItem(displayConfig(), { artworkPool: POOL });
  const err = $('lab-error'), add = $('add-to-cart');
  const blocked = uploadBusy || !!designIssue || (!!three.printError && state.baseMode !== 'random');
  $('share-design').disabled = !n.ok || blocked;
  const quote = n.ok ? { ...priceItem(n.item), quantity: n.item.quantity } : quoteGarment(config());
  renderPricing(quote);
  $('waitlist').hidden = true;
  flow?.refresh();
  if (!n.ok) {
    $('review-spec').replaceChildren(h('li', { className: 'pending', textContent: n.errors[0] }));
    $('breakdown').replaceChildren(); $('total').textContent = '—';
    add.disabled = true; add.textContent = 'Save design';
    $('mbar-add').disabled = true;
    if (designIssue) err.textContent = designIssue;
    $('mbar-price').textContent = '—'; $('mbar-title').textContent = n.errors[0];
    renderTrust(null); return;
  }
  const p = priceItem(n.item), d = describeItem(n.item);
  const spec = d.spec.filter(s => !s.startsWith('Construction:') && !s.startsWith('Material:')).map(s => s.startsWith('Size:') && !state.size ? 'Size: choose your size' : s);
  $('review-spec').replaceChildren(h('li', { className: 'title', textContent: d.title }), ...spec.map(s => h('li', { className: s.startsWith('Size: choose') ? 'pending' : '', textContent: s })));
  $('breakdown').replaceChildren(...p.lines.map(l => h('tr', {}, h('th', { scope: 'row', textContent: l.label }), h('td', { textContent: l.cents ? money(l.cents) : 'included' }))));
  $('total').textContent = money(p.totalCents);
  const info = slotInfo(n.item.construction, n.item.garment);
  const orderOpen = !!status?.checkout?.available && hasAvailability(info, n.item.quantity);
  add.disabled = blocked || !state.size;
  add.textContent = orderOpen ? 'Review order' : 'Save design';
  $('cancel-edit').hidden = !state.editId;
  $('waitlist').hidden = true;
  $('mbar-title').textContent = d.title; $('mbar-price').textContent = money(p.totalCents);
  $('mbar-add').disabled = add.disabled; $('mbar-add').textContent = add.textContent;

  const previewError = state.baseMode === 'random' ? '' : three.printError;
  if (designIssue || previewError) err.textContent = designIssue || previewError;
  else if (!err.dataset.sticky) err.textContent = '';
  renderTrust(info);
}
// What the customer should know before buying — only facts and what the studio has written in its settings.
function renderTrust(info) {
  const items = [
    'Printed by hand in our Los Angeles studio.',
    state.construction === 'cut-sew' ? 'Cut and sewn from scratch in 100% cotton.' : 'Printed on a blank chosen to fit your size and colour — it may be vintage or new.',
    state.baseMode === 'random' ? 'Made to order — up to one week to make, then shipping.' : info?.leadTimeDays != null ? `Made to order — about ${info.leadTimeDays} days to make, then shipping.` : 'Made to order — the production time is confirmed after you order.',
    status?.checkout?.available ? 'Shipping and any tax are shown before you pay.' : 'Ordering is not open yet. You can save your design on this device.'
  ];
  if (status?.shippingNote) items.push(status.shippingNote);
  if (status?.returnsNote) items.push(status.returnsNote);
  $('trust').replaceChildren(...items.map(t => h('li', { textContent: t })));
}
function renderAll() { renderConstruction(); renderGarments(); renderSizes(); renderColors(); renderArt(); renderStage(); renderReview(); }
const refresh = () => { renderArt(); renderStage(); renderReview(); };

// ---------- events ----------
const form = $('lab-form');
let lastRadio = null, lastRadioAt = 0;
function selectOption(e) {
  const t = e.target;
  if (!t.matches('input[type=radio]')) return;
  if (e.type === 'change' && lastRadio === t && performance.now() - lastRadioAt < 150) return;
  lastRadio = t; lastRadioAt = performance.now();
  three.viewer?.setAuto(false);
  flow?.message();
  if (t.name === 'base-mode' || t.name === 'construction') {
    const mode = t.name === 'construction' ? (t.value === 'cut-sew' ? 'cut-sew' : 'blank') : t.value;
    const selected = modeSelection(state, mode); if (!selected) return;
    const oldQuantity = state.quantity;
    Object.assign(state, selected); leaveChaos();
    renderAll(); flow?.complete('construction');
    if (oldQuantity !== state.quantity) flow?.message('Cut & Sew is one piece per design. Quantity is now 1.');
    return;
  }
  if (t.name === 'garment') {
    const selected = garmentSelection(state, t.value); if (!selected) return;
    const oldQuantity = state.quantity;
    if(state.artwork==='pick'&&state.sourceDesign&&PRODUCT_DESIGNS[state.sourceDesign]?.garment!==selected.garment)state.sourceDesign=null;
    Object.assign(state, selected); leaveChaos();
    renderAll(); flow?.complete('garment');
    if (oldQuantity !== state.quantity) flow?.message('Cut & Sew is one piece per design. Quantity is now 1.');
    return;
  }
  if (t.name === 'size') { state.size = t.value; delete $('lab-error').dataset.sticky; $('step-size').classList.remove('needs'); $('lab-error').textContent = ''; }
  if (t.name === 'fit') { state.fit = t.value; leaveChaos(); }
  if (t.name === 'color') { state.color = t.value; leaveChaos(); if (t.value === 'custom' && !state.customColor) state.customColor = $('color-picker').value; renderColors(); if (t.value === 'custom') $('color-picker').focus({ preventScroll: true }); }
  if (t.name === 'artwork') { state.artwork = t.value; designIssue = ''; three.printError = ''; if (t.value === 'random-experimental' && !state.seed) state.seed = newSeed(); if (t.value !== 'random-experimental') leaveChaos(); renderArt(); if (t.value === 'pick') graphicsEditor?.sync(); }
  refresh();
  if (t.name === 'garment') flow?.complete('garment');
  if (t.name === 'color' && t.value !== 'custom') flow?.complete('color');
  if (t.name === 'artwork' && t.value !== 'pick') flow?.complete('art');
  if ((t.name === 'size' || t.name === 'fit') && state.size && FITS[state.construction].some(fit => fit.id === state.fit)) flow?.complete('size');
}
form.addEventListener('click', selectOption);
form.addEventListener('change', selectOption);
const toHex = c => { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = '#000'; x.fillStyle = c; const v = x.fillStyle; return /^#[0-9a-f]{6}$/i.test(v) ? v : null; };
$('custom-color').addEventListener('input', e => { state.customColor = e.target.value; const hx = CSS.supports('color', e.target.value) ? toHex(e.target.value) : null; if (hx) $('color-picker').value = hx; renderStage(); renderReview(); });
$('color-picker').addEventListener('input', e => { state.customColor = e.target.value; $('custom-color').value = e.target.value; renderColors(); renderStage(); renderReview(); });
for (const id of ['custom-color', 'color-picker']) $(id).addEventListener('change', () => {
  if (state.color === 'custom' && state.customColor.trim().length >= 2) flow?.complete('color');
});
$('custom-color').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); flow?.complete('color'); } });
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
function setSide(side) { state.side = side; three.viewer?.view(side); graphicsEditor?.setSide(side); $('print-sides').querySelectorAll('.print-side').forEach((b, i) => b.classList.toggle('on', (i === 0) === (side === 'front'))); $('side-front').setAttribute('aria-pressed', String(side === 'front')); $('side-back').setAttribute('aria-pressed', String(side === 'back')); }
$('zoom').addEventListener('input', renderStage);
$('back-size').addEventListener('click', e => { const b = e.target.closest('[data-size]'); if (!b) return; state.backSize = b.dataset.size; setSide('back'); renderStage(); renderReview(); });
// Once someone starts choosing, the garment stops spinning so they can look at it.
const stopSpin = () => { if (three.viewer?.isAuto()) three.viewer.setAuto(false); };
$('lab-form').addEventListener('change', stopSpin); $('stage-3d').addEventListener('pointerdown', stopSpin);

form.addEventListener('submit', e => {
  e.preventDefault();
  if (uploadBusy || designIssue) { const message = designIssue || 'Wait for your graphic to finish uploading.'; $('lab-error').textContent = message; flow?.message(message); return; }
  if (!state.size) {
    const err = $('lab-error'); err.textContent = 'Choose your size to save this design.'; err.dataset.sticky = '1';
    $('step-size').classList.add('needs'); flow?.show('size'); flow?.message(err.textContent);
    return;
  }
  delete $('lab-error').dataset.sticky; $('step-size').classList.remove('needs');
  const normalized = normalizeItem(config(), { artworkPool: POOL });
  if (!normalized.ok) { $('lab-error').textContent = normalized.errors.join(' '); flow?.message($('lab-error').textContent); return; }
  flow?.syncNotes();
  const r = state.editId ? cart.replace(state.editId, config()) : cart.add(config());
  if (!r.ok) { $('lab-error').textContent = r.errors.join(' '); flow?.message($('lab-error').textContent); return; }
  state.editId = r.id;
  const open = !!status?.checkout?.available && hasAvailability(slotInfo(normalized.item.construction, normalized.item.garment), normalized.item.quantity);
  if (open) document.dispatchEvent(new CustomEvent('lab:open-cart', { detail: { added: r.id } }));
  else flow?.message('Design saved on this device. Ordering is not open yet.');
  renderReview();
});
// Keep an open design in sync when its cart quantity changes on this page or another tab.
cart.subscribe(view => {
  const line = state.editId && view.lines.find(item => item.id === state.editId);
  if (line && line.item.construction === state.construction && state.quantity !== line.item.quantity) {
    state.quantity = line.item.quantity;
    renderReview();
  }
});
$('mbar-add').onclick = () => form.requestSubmit();
$('cancel-edit').onclick = () => { state.editId = null; state.quantity = 1; history.replaceState(null, '', location.pathname + '#build'); renderReview(); };
$('waitlist-join').onclick = async () => {
  const email = $('waitlist-email').value.trim();
  if (!email) { $('waitlist-status').textContent = 'Enter your email.'; return; }
  try {
    const r = await fetch('/api/lab/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, slot: `${state.construction}:${state.garment}` }) });
    $('waitlist-status').textContent = r.ok ? 'You are on the list.' : (await r.json().catch(() => ({}))).error || 'Could not join right now.';
  } catch { $('waitlist-status').textContent = 'Could not join right now.'; }
};

// ---------- mystery packages ----------
function packageConfig() {
  const { editId, ...selection } = packageState;
  return { product: 'mystery-pack', ...selection };
}
function renderPackages() {
  $('package-options').replaceChildren(...Object.values(MYSTERY_PACKAGES).map(p => choice('package', p.id, p.name, { sub: p.countLabel, price: money(p.priceCents), checked: p.id === packageState.package })));
  $('package-size').replaceChildren(...SIZES.map(s => sizeButton('package-size', s, s === packageState.size)));
  $('package-fit').replaceChildren(...MYSTERY_FITS.map(f => { const label = sizeButton('package-fit', f.id, f.id === packageState.fit); label.querySelector('span').textContent = f.name; label.querySelector('input').setAttribute('aria-label', f.name); return label; }));
  $('package-pref').maxLength = MYSTERY_PREFERENCES_MAX;
  $('package-pref').value = packageState.preferences;
  renderPackageDetail();
}
function renderPackageDetail() {
  const p = MYSTERY_PACKAGES[packageState.package];
  if (productPage === 'mystery') {
    $('lab-product-title').textContent = 'Mystery Box / ' + p.name;
    document.title = 'BREAKTHYRULE — Mystery ' + p.name;
  }
  $('package-art').innerHTML = itemSketch({ product: 'mystery-pack', package: p.id });
  $('package-name').textContent = p.name;
  $('package-count').textContent = p.countLabel;
  $('package-price').textContent = money(p.priceCents);
  $('package-copy').textContent = p.blurb;
  renderPackageAvailability();
}
function renderPackageAvailability() {
  const p = MYSTERY_PACKAGES[packageState.package];
  const info = packageState.size && skuInfo(`mystery-pack:${p.id}:${packageState.size}`);
  const unavailable = !!status && !!packageState.size && !hasAvailability(info, packageState.quantity);
  $('package-submit').textContent = `${packageState.editId ? 'Update' : 'Add'} ${p.name} — ${money(p.priceCents)}${packageState.quantity > 1 ? ' each' : ''}`;
  $('package-submit').disabled = unavailable;
  $('package-stock').textContent = !packageState.size ? 'Choose your size and preferred fit.'
    : !status ? 'Availability is confirmed at checkout.'
    : unavailable ? 'Not available in this size right now.'
    : info.unlimited === true ? 'Made to order in your selected size.'
    : `${info.available} ${info.available === 1 ? 'package' : 'packages'} available in this size.`;
}
function renderPackagePolicy() {
  const policy = status?.relicPolicies;
  const entries = ['contents', 'condition', 'sizing', 'fulfillment'].filter(key => typeof policy?.[key] === 'string' && policy[key].trim());
  $('package-policy').hidden = !entries.length;
  $('package-policy-copy').replaceChildren(...entries.map(key => h('p', {}, h('strong', { textContent: `${key[0].toUpperCase()}${key.slice(1)}: ` }), policy[key])));
}
function selectPackage(id, updateUrl = true) {
  if (!isPackage(id)) return;
  packageState.package = id;
  document.querySelectorAll('input[name="package"]').forEach(input => { input.checked = input.value === id; });
  $('package-error').textContent = '';
  renderPackageDetail();
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set('package', id);
    url.hash = 'packages';
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
}
$('package-form').addEventListener('change', e => {
  const input = e.target;
  if (productPage === 'mystery' && input.name === 'package' && input.value !== packageState.package) {
    const url = new URL(location.href); url.searchParams.set('package', input.value); url.searchParams.delete('edit'); url.hash = '';
    // Keep this history entry consistent when the browser restores its form controls on Back.
    for (const option of $('package-options').querySelectorAll('input')) option.checked = option.value === packageState.package;
    location.assign(url); return;
  }
  if (input.name === 'package') selectPackage(input.value);
  if (input.name === 'package-size') packageState.size = input.value;
  if (input.name === 'package-fit') packageState.fit = input.value;
  $('package-error').textContent = '';
  renderPackageAvailability();
});
$('package-pref').addEventListener('input', e => { packageState.preferences = e.target.value; });
$('package-form').addEventListener('submit', e => {
  e.preventDefault();
  const cfg = packageConfig();
  const normalized = normalizeItem(cfg, { artworkPool: POOL });
  if (!normalized.ok) { $('package-error').textContent = normalized.errors.join(' '); return; }
  if (status && !hasAvailability(skuInfo(`mystery-pack:${cfg.package}:${cfg.size}`), cfg.quantity)) {
    $('package-error').textContent = 'This package is not available in that quantity and size right now.';
    return;
  }
  const result = packageState.editId ? cart.replace(packageState.editId, cfg) : cart.add(cfg);
  $('package-error').textContent = result.ok ? '' : result.errors.join(' ');
  if (result.ok) {
    packageState.editId = null;
    packageState.quantity = 1;
    const url = new URL(location.href);
    url.searchParams.delete('edit');
    url.searchParams.set('package', packageState.package);
    url.hash = 'packages';
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    renderPackageAvailability();
    document.dispatchEvent(new CustomEvent('lab:open-cart', { detail: { added: result.id } }));
  }
});

// ---------- catalog ----------
function catalogEntries() {
  const out = [];
  for (const [c, garments] of Object.entries(OFFERINGS)) for (const [g, o] of Object.entries(garments)) {
    const info = slotInfo(c, g);
    out.push({ type: c, title: o.name, sub: CONSTRUCTIONS[c].name, priceCents: o.priceCents, available: status ? hasAvailability(info) : null, madeToOrder: madeToOrderLabel(info), href: `?c=${c}&g=${g}#build`,
      art: `<div class="offer-mark"><span>${c === 'cut-sew' ? 'II' : 'I'}</span><b>${o.name}</b><i>${c === 'cut-sew' ? 'Cut & Sew · 100% cotton' : 'The Canvas'}</i></div>` });
  }
  const packageSkus = prefix => Object.entries(status?.skus || {}).filter(([key]) => key.startsWith(prefix)).map(([, value]) => value);
  for (const p of Object.values(MYSTERY_PACKAGES)) {
    const skus = packageSkus(`mystery-pack:${p.id}:`), unlimited = skus.find(info => info.unlimited === true && hasAvailability(info));
    out.push({ type: 'special', package: p.id, title: p.name, sub: p.countLabel, priceCents: p.priceCents, available: status ? skus.some(info => hasAvailability(info)) : null, madeToOrder: unlimited ? 'Made to order · choose a size' : '', href: `/lab?package=${encodeURIComponent(p.id)}#packages`, art: itemSketch({ product: 'mystery-pack', package: p.id }) });
  }
  return out;
}
function renderCatalog() {
  const type = $('cat-type').value, sort = $('cat-sort').value, onlyAvail = $('cat-available').checked;
  let list = catalogEntries().filter(e => type === 'all' || e.type === type).filter(e => !onlyAvail || e.available !== false);
  list.sort((a, b) => sort === 'price-desc' ? b.priceCents - a.priceCents : sort === 'available' ? (b.available === true) - (a.available === true) || a.priceCents - b.priceCents : a.priceCents - b.priceCents);
  $('catalog-grid').replaceChildren(...(list.length ? list.map(e => {
    const card = h('a', { className: 'offer', href: e.href }, h('div', { className: 'offer-art' }), h('div', { className: 'offer-body' },
      h('span', { className: 'offer-sub', textContent: e.sub }), h('strong', { textContent: e.title }), h('em', { textContent: money(e.priceCents) }),
      e.available === false ? h('span', { className: 'offer-state off', textContent: 'At capacity / sold out' }) : e.madeToOrder ? h('span', { className: 'offer-state', textContent: e.madeToOrder }) : null));
    card.querySelector('.offer-art').innerHTML = e.art;
    card.addEventListener('click', ev => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
      ev.preventDefault();
      if (e.package) { selectPackage(e.package); showTab('packages'); $('packages').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }); }
      else { const p = new URLSearchParams(e.href.split('#')[0]); showTab('build'); preselect(p.get('c'), p.get('g')); flow?.show('garment'); }
    });
    return card;
  }) : [h('p', { className: 'fine', textContent: 'Nothing matches those filters.' })]));
}
['cat-type', 'cat-sort', 'cat-available'].forEach(id => $(id).addEventListener('change', renderCatalog));

function preselect(c, g) {
  if (CONSTRUCTIONS[c]) { if (c === 'cut-sew') state.quantity = 1; state.construction = c; state.baseMode = c === 'cut-sew' ? 'cut-sew' : 'blank'; const fits = FITS[c]; state.fit = fits.length === 1 ? fits[0].id : null; }
  if (OFFERINGS[state.construction][g]) state.garment = g;
  leaveChaos(); renderAll();
}

// Placement controls stay in the explicit dialog; the main page never scrolls them into view.
if ($('placement-dialog') && !$('placement-dialog').contains($('print-place'))) $('placement-dialog').append($('print-place'));

// ---------- tabs ----------
const TABS = ['build', 'packages', 'catalog'];
function showTab(id, push = true) {
  if (productPage) id = productPage === 'mystery' ? 'packages' : 'build';
  if (id === 'relic' || id === 'trinity') id = 'packages';
  if (!TABS.includes(id)) id = 'build';
  for (const t of TABS) { $('tab-' + t).setAttribute('aria-selected', String(t === id)); $('tab-' + t).tabIndex = t === id ? 0 : -1; $(t).hidden = t !== id; }
  document.body.dataset.labTab = id;
  flow?.refresh();
  if (push) history.replaceState(history.state, '', location.pathname + location.search + (productPage || id === 'build' ? '' : '#' + id));
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
  const url = `${location.origin}${productPage === 'random' ? '/random-shirt' : '/lab'}?design=${b64.enc(design)}`;
  try { await navigator.clipboard.writeText(url); $('share-design').textContent = 'Link copied'; }
  catch { const box = $('share-url') || h('input', { id: 'share-url', className: 'share-url', readOnly: true }); box.value = url; $('share-design').after(box); box.select(); $('share-design').textContent = 'Copy the link below'; }
  setTimeout(() => { $('share-design').textContent = 'Share design'; }, 2500);
};
function applyDesign(raw) {
  const n = normalizeItem({ ...raw, size: raw.size || 'M' }, { artworkPool: POOL });
  if (!n.ok) { designIssue = 'This design could not be loaded: ' + n.errors.join(' ') + ' Choose artwork again before adding this garment.'; return false; }
  if (n.item.product !== 'garment') { designIssue = 'This link does not contain a garment design. Choose your garment and artwork before adding it.'; return false; }
  const c = n.item;
  Object.assign(state, { quantity: c.quantity ?? 1, construction: c.construction, garment: c.garment, size: raw.size ? c.size : null, fit: c.fit, color: c.color, customColor: c.customColor || '', artwork: c.artwork, seed: c.seed, chaos: !!c.chaos, print: c.print, productDesign: c.productDesign || null, sourceDesign:c.sourceDesign||null, graphicLayout:c.graphicLayout||null, picks: c.picks ? { front: [...c.picks.front], back: [...c.picks.back] } : { front: [], back: [] }, uploads: (c.uploads || []).map(asset => ({ ...asset })), backSize: c.backSize || 'full' });
  state.baseMode = c.construction === 'cut-sew' ? 'cut-sew' : raw.labMode === 'random' && c.color === 'random' ? 'random' : 'blank';
  designIssue = '';
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
const graphicsHost=h('section',{id:'lab-graphic-editor'});$('step-art').append(graphicsHost);
graphicsEditor=createGarmentGraphicsEditor({host:graphicsHost,viewerHost:$('stage-frame'),getState:()=>state,getViewer:()=>three.viewer,getPrinter:()=>printer,
 onActivate(){state.artwork='pick';renderArt();renderStage();renderReview();},
 onSideChange(which){state.side=which;},
 onChange(next){state.picks=next.picks;state.graphicLayout=next.graphicLayout;state.artwork='pick';designIssue='';three.printError='';
  if(!graphicUpdateFrame)graphicUpdateFrame=requestAnimationFrame(()=>{graphicUpdateFrame=0;renderSelectedArt();renderReview();renderThree();});
 },
 onUpload(asset){if(!state.uploads.some(a=>a.id===asset.id))state.uploads.push(asset);},
 onStatus(busy){uploadBusy=busy;renderReview();}
});
flow = createLabFlow({
  getBaseMode: () => state.baseMode,
  getSummary(step) {
    if (step === 'construction') return { random: 'Studio surprise', blank: 'Blank', 'cut-sew': 'Cut & Sew' }[state.baseMode];
    if (step === 'garment') return OFFERINGS[state.construction][state.garment]?.name || state.garment;
    if (step === 'color') return state.color === 'custom' ? state.customColor : COLORS[state.color]?.name;
    if (step === 'art') { const n = state.picks.front.length + state.picks.back.length; return state.artwork === 'pick' ? `${n} graphic${n === 1 ? '' : 's'} · add / edit` : 'Studio surprise'; }
    if (step === 'size') return [state.size, state.fit !== 'blank' ? state.fit : ''].filter(Boolean).join(' · ');
    return '';
  },
  validate(step) {
    if (step === 'color' && state.color === 'custom' && state.customColor.trim().length < 2) return 'Name the custom color you want.';
    if (step === 'art' && uploadBusy) return 'Wait for your graphic to finish uploading.';
    if (step === 'art' && designIssue) return designIssue;
    if (step === 'art' && state.artwork === 'pick' && !state.picks.front.length && !state.picks.back.length) return 'Choose at least one graphic.';
    if (step === 'size' && !state.size) return 'Choose your size.';
    if (step === 'size' && !FITS[state.construction].some(fit => fit.id === state.fit)) return 'Choose your fit.';
    return '';
  },
  onBrowse: () => renderPicker()
});
(async () => {
  const editId = params.get('edit'), line = editId && cart.get(editId);
  if (line?.config?.product === 'garment') {
    const c = line.config;
    Object.assign(state, { quantity: c.quantity ?? 1, construction: c.construction, garment: c.garment, size: c.size, fit: c.fit, color: c.color, customColor: c.customColor || '', artwork: c.artwork, seed: c.seed || null, chaos: !!c.chaos, editId, print: { x: 0, y: 0, scale: 1, ...(c.print || {}) }, productDesign: c.productDesign || null, sourceDesign:c.sourceDesign||null, graphicLayout:c.graphicLayout||null, picks: { front: [...(c.picks?.front || [])], back: [...(c.picks?.back || [])] }, uploads: (c.uploads || []).map(asset => ({ ...asset })), backSize: c.backSize || 'full' });
    state.baseMode = c.construction === 'cut-sew' ? 'cut-sew' : c.labMode === 'random' && c.color === 'random' ? 'random' : 'blank';
  } else if (line?.config?.product === 'mystery-pack') {
    Object.assign(packageState, line.config, { editId });
  } else if (params.get('design')) {
    try { applyDesign(b64.dec(params.get('design'))); }
    catch { designIssue = 'This design link could not be read. Choose artwork again before adding this garment.'; }
  } else if (productPage === 'random') {
    try {
      const design = randomProductDesign(params, { artworkPool: POOL });
      applyDesign(design);
      const url = new URL(location.href); url.searchParams.set('g', design.garment); url.searchParams.set('seed', design.seed); if(design.artwork==='pick')url.searchParams.set('art','curated-1'); url.hash = '';
      history.replaceState(history.state, '', url);
    } catch { designIssue = 'This generated design could not load. Please choose your artwork again.'; }
  } else preselect(params.get('c'), params.get('g'));
  renderAll(); renderPackages(); renderCatalog(); syncPrintControls();
  if (editId || params.get('design') || productPage === 'random') {
    const restored = ['construction', 'garment', 'color'];
    if (state.artwork !== 'pick' || state.picks.front.length + state.picks.back.length) restored.push('art');
    if (state.size && FITS[state.construction].some(fit => fit.id === state.fit)) restored.push('size');
    flow.restore(restored);
  } else if (params.get('c') && params.get('g')) flow.restore(['construction', 'garment']);
  showTab(location.hash.slice(1) || (packageState.editId || isPackage(params.get('package')) ? 'packages' : 'build'), false); renderWorn();
  // Open on the 3D blank once the stage is on screen (nothing heavy loads before that).
  if ('IntersectionObserver' in window && window.THREE) {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); three.wanted = true; renderThree(); } }, { rootMargin: '200px' });
    io.observe($('stage-frame'));
  }
  if (params.get('canceled')) { $('lab-notice').hidden = false; $('lab-notice').textContent = 'Checkout was canceled — nothing was charged, and your cart is still here.'; }
  status = await labStatus();graphicsEditor?.setUploadAvailable(!!status);
  if (status?.notice) { $('lab-notice').hidden = false; $('lab-notice').textContent = status.notice; }
  renderGarments(); renderReview(); renderPackageAvailability(); renderPackagePolicy(); renderCatalog();
})();
