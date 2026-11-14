// Validation and pricing for Garment Lab items. Pure functions, shared by browser and server.
// The browser uses them to show prices; the server re-runs them on every checkout and ignores any
// price a browser sends.
import {
  OFFERINGS, CONSTRUCTIONS, COLORS, ARTWORK, SIZES, FITS, RELIC_BOX, TRINITY,
  CUSTOM_COLOR_MAX, MAX_QUANTITY, GARMENT_TYPES, PRINT_LIMITS, PICK_LIMITS, BACK_SIZES
} from './catalog.mjs';
import { ARTWORK_POOL } from './artwork-pool.mjs';
const GRAPHIC_NAME = Object.fromEntries(ARTWORK_POOL.map(a => [a.id, a.display || a.name]));
export const graphicName = id => GRAPHIC_NAME[id] || id;
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

  if (product === 'garment') {
    const construction = raw.construction;
    if (!CONSTRUCTIONS[construction]) errors.push('Choose The Canvas or Cut & Sew.');
    const chaos = raw.chaos === true;
    const seed = raw.seed == null ? null : Number(raw.seed);
    if ((chaos || raw.artwork === 'random-experimental') && !isSeed(seed)) errors.push('A random draw needs its seed.');
    let garment = raw.garment, color = raw.color, fit = raw.fit, artwork = raw.artwork, art = null;
    if (chaos && CONSTRUCTIONS[construction] && isSeed(seed)) {
      const c = drawChaos(seed, { construction }, artworkPool);
      garment = c.garment; color = c.color; fit = c.fit; artwork = 'random-experimental'; art = c.art;
    } else if (artwork === 'random-experimental' && isSeed(seed)) art = drawArt(seed, artworkPool);
    const offering = OFFERINGS[construction]?.[garment];
    if (CONSTRUCTIONS[construction] && !offering) errors.push('That garment is not offered in ' + CONSTRUCTIONS[construction].name + '.');
    const size = raw.size;
    if (!SIZES.includes(size)) errors.push('Choose a size.');
    const fits = FITS[construction] || [];
    if (!fits.some(f => f.id === fit)) fit = fits.length === 1 ? fits[0].id : (errors.push('Choose a fit.'), null);
    if (!COLORS[color]) errors.push('Choose a color.');
    const customColor = color === 'custom' ? clean(raw.customColor, CUSTOM_COLOR_MAX) : '';
    if (color === 'custom' && customColor.length < 2) errors.push('Name the custom color you want.');
    if (!ARTWORK[artwork]) errors.push('Choose an artwork direction.');
    const maxQ = construction === 'cut-sew' ? 1 : MAX_QUANTITY;
    const quantity = raw.quantity == null ? 1 : qty(raw.quantity, maxQ);
    if (!quantity) errors.push(construction === 'cut-sew' ? 'Each cut & sew piece is one of one — add another for a second piece.' : `Quantity must be 1–${MAX_QUANTITY}.`);
    if (errors.length) return { ok: false, errors };
    let picks = null;
    if (artwork === 'pick') {
      const valid = list => [...new Set((Array.isArray(list) ? list : []).filter(id => typeof id === 'string' && artworkPool.includes(id)))];
      picks = { front: valid(raw.picks?.front).slice(0, PICK_LIMITS.front), back: valid(raw.picks?.back).slice(0, PICK_LIMITS.back) };
      if (!picks.front.length && !picks.back.length) return { ok: false, errors: ['Pick at least one graphic.'] };
    }
    const print = normalizePrint(raw.print);
    const backSize = BACK_SIZES[raw.backSize] ? raw.backSize : 'full';
    return { ok: true, item: { product, construction, garment, size, fit, color, customColor, artwork, chaos, seed: art ? seed : null, art, picks, print, backSize, quantity } };
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
  const lines = [];
  if (item.product === 'garment') {
    const o = OFFERINGS[item.construction][item.garment];
    lines.push({ label: `${CONSTRUCTIONS[item.construction].name} — ${o.name}`, cents: o.priceCents });
    const c = COLORS[item.color];
    lines.push({ label: item.color === 'custom' ? `Custom color: ${item.customColor}` : `${c.name}`, cents: c.addCents });
    lines.push({ label: `Artwork: ${ARTWORK[item.artwork].name}`, cents: ARTWORK[item.artwork].addCents });
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
  if (item.product === 'garment') {
    const o = OFFERINGS[item.construction][item.garment];
    const spec = [
      `Construction: ${CONSTRUCTIONS[item.construction].name}`,
      ...(CONSTRUCTIONS[item.construction].material ? [`Material: ${CONSTRUCTIONS[item.construction].material}`] : []),
      `Size: ${item.size}` + (FITS[item.construction].length > 1 ? ` · Fit: ${FITS[item.construction].find(f => f.id === item.fit)?.name}` : ''),
      `Color: ${item.color === 'custom' ? 'Custom — ' + item.customColor : COLORS[item.color].name}`,
      `Artwork: ${ARTWORK[item.artwork].name}`
    ];
    if (item.art) spec.push(`Direction: ${item.art.category} / ${item.art.secondary} · ${item.art.placement} · ${item.art.technique} (seed ${item.seed})`);
    const sides = sidesFor(item);
    if (sides.front.length) spec.push('Front: ' + sides.front.map(graphicName).join(', '));
    const bs = BACK_SIZES[item.backSize] || BACK_SIZES.full;
    if (sides.back.length) spec.push(`Back: ${sides.back.map(graphicName).join(', ')} — ${bs.name.toLowerCase()}, ${bs.w} × ${bs.h} in on every size`);
    if (item.chaos) spec.push('Drawn by Total Chaos');
    if (!isDefaultPrint(item.print)) {
      const p = item.print, where = [];
      if (p.y) where.push(`${Math.abs(Math.round(p.y * 100))}% ${p.y > 0 ? 'higher' : 'lower'}`);
      if (p.x) where.push(`${Math.abs(Math.round(p.x * 100))}% to the ${p.x > 0 ? "wearer's left" : "wearer's right"}`);
      spec.push(`Print: ${Math.round(p.scale * 100)}% size` + (where.length ? ', ' + where.join(', ') : ''));
    }
    return { title: `${o.name} — ${CONSTRUCTIONS[item.construction].name}`, spec, silhouette: GARMENT_TYPES[item.garment].silhouette };
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

// Number of physical pieces an item asks the studio to fulfil.
export const unitsFor = item => (item.product === 'trinity' ? TRINITY.units : 1) * item.quantity;
