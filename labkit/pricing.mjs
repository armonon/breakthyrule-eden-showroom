import { normalizeGraphicLayout, layoutSummary } from './graphic-layout.mjs';
import { PRODUCT_DESIGNS, GRAPHIC_COLORS, normalizeStudioProduct, priceStudioProduct, describeStudioProduct } from './product-options.mjs';
// Validation and pricing for Garment Lab items. Pure functions, shared by browser and server.
// The browser uses them to show prices; the server re-runs them on every checkout and ignores any
// price a browser sends.
import {
  OFFERINGS, offeringFor, labModeFor, garmentPriceParts, CONSTRUCTIONS, COLORS, ARTWORK, SIZES, FITS, RELIC_BOX, TRINITY,
  MYSTERY_PACKAGES, MYSTERY_FITS, MYSTERY_PREFERENCES_MAX,
  CUSTOM_COLOR_MAX, MAX_QUANTITY, GARMENT_TYPES, PRINT_LIMITS, PICK_LIMITS, BACK_SIZES
} from './catalog.mjs';
import { ARTWORK_POOL } from './artwork-pool.mjs';
import { isUploadId, normalizeUploadRefs, uploadForId } from './custom-artwork.mjs';
const GRAPHIC_NAME = Object.fromEntries(ARTWORK_POOL.map(a => [a.id, a.display || a.name]));
export const graphicName = (id, uploads) => GRAPHIC_NAME[id] || (uploadForId(id, uploads)?.name ? 'Your upload: ' + uploadForId(id, uploads).name : id);
import { drawArt, drawChaos, isSeed } from './random.mjs';

const clean = (s, max) => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
// Print placement chosen by the customer: clamped and rounded so it stores cleanly.
export function normalizePrint(p) {
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(hi, Math.max(lo, n)) * 100) / 100 : d; };
  const o = PRINT_LIMITS.offset;
  return { x: num(p?.x, -o, o, 0), y: num(p?.y, -o, o, 0), scale: num(p?.scale, PRINT_LIMITS.scaleMin, PRINT_LIMITS.scaleMax, 1) };
}
export const isDefaultPrint = p => !p || (p.x === 0 && p.y === 0 && p.scale === 1);
const qty = (q, max = MAX_QUANTITY) => Number.isInteger(q) && q >= 1 && q <= max ? q : null;

// Turn untrusted input into a canonical item, or report what is wrong. Never reads prices from input.
export function normalizeItem(raw, { artworkPool = [] } = {}) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['Item is missing.'] };
  const product = raw.product;

  if (product === 'studio-product') return normalizeStudioProduct(raw, artworkPool);

  if (product === 'garment') {
    const construction = raw.construction;
    const labMode = labModeFor(raw);
    if (!Object.hasOwn(CONSTRUCTIONS, construction)) errors.push('Choose The Canvas or Cut & Sew.');
    else if (!labMode) errors.push('Choose a valid base option for this construction.');
    if (labMode === 'random' && (raw.color !== 'random' || raw.chaos === true)) errors.push('Random bases are selected and colored by the studio.');
    const chaos = raw.chaos === true;
    const seed = raw.seed == null ? null : Number(raw.seed);
    if ((chaos || raw.artwork === 'random-experimental') && !isSeed(seed)) errors.push('A random draw needs its seed.');
    let garment = raw.garment, color = raw.color, fit = raw.fit, artwork = raw.artwork, art = null;
    if (chaos && Object.hasOwn(CONSTRUCTIONS, construction) && isSeed(seed)) {
      const c = drawChaos(seed, { construction }, artworkPool);
      garment = c.garment; color = c.color; fit = c.fit; artwork = 'random-experimental'; art = c.art;
    } else if (artwork === 'random-experimental' && isSeed(seed)) art = drawArt(seed, artworkPool);
    const offering = offeringFor({ construction, garment, labMode });
    if (Object.hasOwn(CONSTRUCTIONS, construction) && !offering) errors.push('That garment is not offered in ' + CONSTRUCTIONS[construction].name + '.');
    const size = raw.size;
    if (!SIZES.includes(size)) errors.push('Choose a size.');
    const fits = Object.hasOwn(FITS, construction) ? FITS[construction] : [];
    if (!fits.some(f => f.id === fit)) fit = fits.length === 1 ? fits[0].id : (errors.push('Choose a fit.'), null);
    if (!Object.hasOwn(COLORS, color)) errors.push('Choose a color.');
    const customColor = color === 'custom' ? clean(raw.customColor, CUSTOM_COLOR_MAX) : '';
    if (color === 'custom' && customColor.length < 2) errors.push('Name the custom color you want.');
    if (!Object.hasOwn(ARTWORK,artwork)) errors.push('Choose an artwork direction.');
    const sourceDesign = typeof raw.sourceDesign === 'string' && Object.hasOwn(PRODUCT_DESIGNS,raw.sourceDesign) ? raw.sourceDesign : null;
    if (raw.sourceDesign != null && !sourceDesign) errors.push('The source garment is unavailable.');
    let productDesign = null;
    if (artwork === 'product-design') {
      const ref = Object.hasOwn(PRODUCT_DESIGNS,raw.productDesign?.id) ? PRODUCT_DESIGNS[raw.productDesign.id] : null;
      if (!ref) errors.push('Choose a valid collection design.');
      else productDesign = { id: ref.id, graphic: GRAPHIC_COLORS.includes(raw.productDesign?.graphic) ? raw.productDesign.graphic : 'Red' };
    }
    const maxQ = construction === 'cut-sew' ? 1 : MAX_QUANTITY;
    const quantity = raw.quantity == null ? 1 : qty(raw.quantity, maxQ);
    if (!quantity) errors.push(construction === 'cut-sew' ? 'Each cut & sew piece is one of one — add another for a second piece.' : `Quantity must be 1–${MAX_QUANTITY}.`);
    if (errors.length) return { ok: false, errors };
    let picks = null;
    const uploaded = normalizeUploadRefs(raw.uploads);
    if (!uploaded.ok) return { ok: false, errors: uploaded.errors };
    if (uploaded.uploads.length && artwork !== 'pick') return { ok: false, errors: ['Uploaded artwork needs Pick your graphics.'] };
    let selectedUploads = [];
    if (artwork === 'pick') {
      const source = [...(Array.isArray(raw.picks?.front) ? raw.picks.front : []), ...(Array.isArray(raw.picks?.back) ? raw.picks.back : [])];
      if (source.some(id => typeof id === 'string' && id.startsWith('upload_') && (!isUploadId(id) || !uploadForId(id, uploaded.uploads)))) return { ok: false, errors: ['An uploaded image is missing its access reference. Upload it again.'] };
      const valid = list => [...new Set((Array.isArray(list) ? list : []).filter(id => typeof id === 'string' && (artworkPool.includes(id) || !!uploadForId(id, uploaded.uploads))))];
      if (source.some(isUploadId) && (valid(raw.picks?.front).length > PICK_LIMITS.front || valid(raw.picks?.back).length > PICK_LIMITS.back)) return { ok: false, errors: ['Choose up to three graphics on the front and one on the back.'] };
      picks = { front: valid(raw.picks?.front).slice(0, PICK_LIMITS.front), back: valid(raw.picks?.back).slice(0, PICK_LIMITS.back) };
      if (!picks.front.length && !picks.back.length) return { ok: false, errors: ['Pick at least one graphic.'] };
      const selected = new Set([...picks.front, ...picks.back]);
      selectedUploads = uploaded.uploads.filter(ref => selected.has(ref.id));
    }
    const graphicLayout = artwork === 'pick' && raw.graphicLayout != null ? normalizeGraphicLayout(raw.graphicLayout, picks) : null;
    if (graphicLayout && !graphicLayout.ok) return graphicLayout;
    const print = normalizePrint(raw.print);
    const backSize = BACK_SIZES[raw.backSize] ? raw.backSize : 'full';
    return { ok: true, item: { product, construction, labMode, garment, size, fit, color, customColor, artwork, chaos, seed: art ? seed : null, art, picks, print, backSize, quantity, ...(sourceDesign ? { sourceDesign } : {}), ...(graphicLayout ? { graphicLayout: graphicLayout.layout } : {}), ...(productDesign ? { productDesign } : {}), ...(selectedUploads.length ? { uploads: selectedUploads } : {}) } };
  }

  if (product === 'mystery-pack') {
    const packageId = raw.package, size = raw.size, fit = raw.fit;
    if (typeof packageId !== 'string' || !Object.hasOwn(MYSTERY_PACKAGES, packageId)) errors.push('Choose a mystery package.');
    if (!SIZES.includes(size)) errors.push('Choose a size.');
    if (!MYSTERY_FITS.some(f => f.id === fit)) errors.push('Choose a preferred fit.');
    const preferences = clean(raw.preferences, MYSTERY_PREFERENCES_MAX);
    const quantity = raw.quantity == null ? 1 : qty(raw.quantity);
    if (!quantity) errors.push(`Quantity must be 1–${MAX_QUANTITY}.`);
    if (errors.length) return { ok: false, errors };
    return { ok: true, item: { product, package: packageId, size, fit, preferences, quantity } };
  }

  if (product === 'relic-box') {
    const size = raw.size;
    if (!SIZES.includes(size)) errors.push('Choose a size.');
    const fit = raw.fit;
    if (!RELIC_BOX.fits.some(f => f.id === fit)) errors.push('Choose a preferred fit.');
    const exclusions = Array.isArray(raw.exclusions) ? [...new Set(raw.exclusions.filter(x => RELIC_BOX.exclusions.includes(x)))] : [];
    if (exclusions.length >= RELIC_BOX.exclusions.length) errors.push('Leave at least one kind of garment in the box.');
    const preferences = clean(raw.preferences, RELIC_BOX.preferencesMax);
    const quantity = raw.quantity == null ? 1 : qty(raw.quantity);
    if (!quantity) errors.push(`Quantity must be 1–${MAX_QUANTITY}.`);
    if (errors.length) return { ok: false, errors };
    return { ok: true, item: { product, size, fit, exclusions, preferences, quantity } };
  }

  if (product === 'trinity') {
    const size = raw.size, variant = raw.variant;
    if (!SIZES.includes(size)) errors.push('Choose a size.');
    if (!TRINITY.variants.some(v => v.id === variant)) errors.push('Choose curated or surprise.');
    const quantity = raw.quantity == null ? 1 : qty(raw.quantity);
    if (!quantity) errors.push(`Quantity must be 1–${MAX_QUANTITY}.`);
    if (errors.length) return { ok: false, errors };
    return { ok: true, item: { product, size, variant, quantity } };
  }

  return { ok: false, errors: ['Unknown product.'] };
}

// Price a canonical item. Returns the per-unit breakdown and the line total.
export function priceItem(item) {
  if (item.product === 'studio-product') return priceStudioProduct(item);
  const lines = [];
  if (item.product === 'garment') {
    const o = offeringFor(item);
    const parts = garmentPriceParts(item);
    if (!o || !parts) throw new Error('Invalid garment pricing options');
    lines.push({ kind: 'garment', label: `${o.name} base`, cents: parts.baseCents });
    lines.push({ kind: 'construction', label: { random: 'Random — studio selected', blank: 'Blank', 'cut-sew': 'Cut & Sew' }[parts.labMode], cents: parts.constructionCents });
    const c = COLORS[item.color];
    lines.push({ kind: 'color', label: item.color === 'custom' ? `Custom color: ${item.customColor}` : `${c.name}`, cents: c.addCents });
    lines.push({ kind: 'artwork', label: `Artwork: ${ARTWORK[item.artwork].name}`, cents: ARTWORK[item.artwork].addCents });
  } else if (item.product === 'mystery-pack') {
    const p = MYSTERY_PACKAGES[item.package];
    lines.push({ label: p.name, cents: p.priceCents });
  } else if (item.product === 'relic-box') {
    lines.push({ label: RELIC_BOX.name, cents: RELIC_BOX.priceCents });
  } else if (item.product === 'trinity') {
    lines.push({ label: `${TRINITY.name} — three tees`, cents: TRINITY.priceCents });
  } else throw new Error('Unknown product');
  const unitCents = lines.reduce((sum, l) => sum + l.cents, 0);
  return { unitCents, lines, totalCents: unitCents * item.quantity };
}

export function priceCart(rawItems, opts) {
  const items = [], errors = [];
  if (!Array.isArray(rawItems) || !rawItems.length) return { ok: false, errors: ['Your cart is empty.'], items: [] };
  if (rawItems.length > 20) return { ok: false, errors: ['Too many items in one order.'], items: [] };
  rawItems.forEach((raw, i) => {
    const n = normalizeItem(raw, opts);
    if (!n.ok) errors.push(...n.errors.map(e => `Item ${i + 1}: ${e}`));
    else items.push({ ...n.item, ...priceItem(n.item) });
  });
  if (errors.length) return { ok: false, errors, items: [] };
  return { ok: true, items, subtotalCents: items.reduce((s, i) => s + i.totalCents, 0) };
}

// Human-readable title and spec lines for carts, orders and the production dashboard.
export function describeItem(item) {
  if (item.product === 'studio-product') return describeStudioProduct(item);
  if (item.product === 'garment') {
    const o = offeringFor(item);
    const spec = [
      ...(item.productDesign ? [`Design: ${PRODUCT_DESIGNS[item.productDesign.id].name}`, ...(PRODUCT_DESIGNS[item.productDesign.id].core ? [`Graphic color: ${item.productDesign.graphic}`, 'Complete logo chest embroidery · Eye back print 16 × 19 in'] : [])] : []),
      `Construction: ${item.labMode === 'random' ? 'Random base — studio selected' : CONSTRUCTIONS[item.construction].name}`,
      ...(CONSTRUCTIONS[item.construction].material ? [`Material: ${CONSTRUCTIONS[item.construction].material}`] : []),
      `Size: ${item.size}` + (FITS[item.construction].length > 1 ? ` · Fit: ${FITS[item.construction].find(f => f.id === item.fit)?.name}` : ''),
      `Color: ${item.color === 'custom' ? 'Custom — ' + item.customColor : COLORS[item.color].name}`,
      `Artwork: ${ARTWORK[item.artwork].name}`
    ];
    if (item.art) spec.push(`Direction: ${item.art.category} / ${item.art.secondary} · ${item.art.placement} · ${item.art.technique} (seed ${item.seed})`);
    const sides = sidesFor(item);
    if (sides.front.length) spec.push('Front: ' + sides.front.map(id => graphicName(id, item.uploads)).join(', '));
    const bs = BACK_SIZES[item.backSize] || BACK_SIZES.full;
    if (sides.back.length) spec.push(`Back: ${sides.back.map(id => graphicName(id, item.uploads)).join(', ')} — ${bs.name.toLowerCase()}, ${bs.w} × ${bs.h} in on every size`);
    if (item.graphicLayout) for (const side of ['front','back']) for (const layer of item.graphicLayout[side]) spec.push(layoutSummary(side, layer));
    if (item.chaos) spec.push('Drawn by Total Chaos');
    if (!isDefaultPrint(item.print)) {
      const p = item.print, where = [];
      if (p.y) where.push(`${Math.abs(Math.round(p.y * 100))}% ${p.y > 0 ? 'higher' : 'lower'}`);
      if (p.x) where.push(`${Math.abs(Math.round(p.x * 100))}% to the ${p.x > 0 ? "wearer's left" : "wearer's right"}`);
      spec.push(`Print: ${Math.round(p.scale * 100)}% size` + (where.length ? ', ' + where.join(', ') : ''));
    }
    return { title: `${o.name} — ${item.labMode === 'random' ? 'Random base' : CONSTRUCTIONS[item.construction].name}`, spec, silhouette: GARMENT_TYPES[item.garment].silhouette };
  }
  if (item.product === 'mystery-pack') {
    const p = MYSTERY_PACKAGES[item.package];
    const spec = [`Contents: ${p.countLabel}`, `Size: ${item.size} · Fit: ${MYSTERY_FITS.find(f => f.id === item.fit)?.name}`];
    if (p.expectedUnits) spec.push('Selection: New and vintage; cut & sew may be included, but is not guaranteed.');
    if (item.preferences) spec.push('Preferences: ' + item.preferences);
    return { title: p.name, spec, silhouette: 'box' };
  }
  if (item.product === 'relic-box') {
    const spec = [`Size: ${item.size} · Fit: ${RELIC_BOX.fits.find(f => f.id === item.fit)?.name}`];
    if (item.exclusions.length) spec.push('Leave out: ' + item.exclusions.join(', '));
    if (item.preferences) spec.push('Preferences: ' + item.preferences);
    return { title: RELIC_BOX.name, spec, silhouette: 'box' };
  }
  const v = TRINITY.variants.find(x => x.id === item.variant);
  return { title: `${TRINITY.name} — three tees`, spec: [`Size: ${item.size}`, `Designs: ${v.name}`], silhouette: 'trinity' };
}

// Which graphics go on which side. Random art: the first drawn graphic becomes the big back print when the draw
// includes the back; the rest go on the front. Picked: exactly what the customer chose.
export function sidesFor(item) {
  if (item.artwork === 'pick' && item.picks) return { front: item.picks.front, back: item.picks.back };
  const refs = item.art?.references || [], p = item.art?.placement;
  if (item.artwork !== 'random-experimental' || !refs.length) return { front: [], back: [] };
  if (p === 'Back') return { front: [], back: refs.slice(0, 1) };
  if (p === 'Front and back') return { front: refs.slice(1).length ? refs.slice(1) : refs.slice(0, 1), back: refs.slice(0, 1) };
  return { front: refs, back: [] };
}

// Exact physical piece count. An expected range is not an exact fulfilment promise.
export const unitsFor = item => {
  const units = item.product === 'mystery-pack' ? MYSTERY_PACKAGES[item.package].units : item.product === 'trinity' ? TRINITY.units : 1;
  return units === null ? null : units * item.quantity;
};
export const expectedUnitsFor = item => {
  const range = item.product === 'mystery-pack' ? MYSTERY_PACKAGES[item.package].expectedUnits : null;
  return range ? { min: range.min * item.quantity, max: range.max * item.quantity } : null;
};
