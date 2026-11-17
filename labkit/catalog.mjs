import { STUDIO_PRODUCTS } from './product-options.mjs';
// THE GARMENT LAB CATALOG — the one place prices and options are defined.
// Shared by the browser (display) and the server (the only prices that are ever charged).
// All money is integer cents, USD. Edit here; never in page code.

export const CURRENCY = 'usd';
export const CATALOG_VERSION = 3;

export const CONSTRUCTIONS = {
  canvas: {
    id: 'canvas', name: 'The Canvas',
    blurb: 'An existing blank — vintage or new — printed in house with Break Thy Rule artwork.',
    madeTo: 'order'
  },
  'cut-sew': {
    id: 'cut-sew', name: 'Cut & Sew',
    blurb: 'An original garment cut, sewn and printed from scratch. Always 100% cotton. A handcrafted, brand-new piece.',
    material: '100% cotton',
    madeTo: 'commission'
  }
};

// Garment silhouettes used by the preview drawings.
export const GARMENT_TYPES = {
  tee: { id: 'tee', noun: 'tee', silhouette: 'tee' },
  hoodie: { id: 'hoodie', noun: 'hoodie', silhouette: 'hoodie' },
  sweatpants: { id: 'sweatpants', noun: 'sweatpants', silhouette: 'pants' },
  crewneck: { id: 'crewneck', noun: 'crewneck', silhouette: 'crewneck' },
  shorts: { id: 'shorts', noun: 'shorts', silhouette: 'shorts' },
  longsleeve: { id: 'longsleeve', noun: 'long sleeve', silhouette: 'longsleeve' }
};

// A Random base is the starting price. Blank adds $20; Cut & Sew has an
// absolute garment price, represented as a surcharge above the same base.
export const RANDOM_OFFERINGS = {
  tee: { name: 'T-shirt', priceCents: 3000 },
  hoodie: { name: 'Hoodie', priceCents: 5000 },
  crewneck: { name: 'Crewneck', priceCents: 4000 },
  sweatpants: { name: 'Sweatpants', priceCents: 5000 },
  longsleeve: { name: 'Long sleeve', priceCents: 3500 },
  shorts: { name: 'Shorts', priceCents: 5000 }
};
export const BLANK_ADD_CENTS = 2000;

// Keep this existing shape for catalog cards, stock slots and older clients.
// Canvas prices are Blank totals, while Random uses RANDOM_OFFERINGS.
export const OFFERINGS = {
  canvas: Object.fromEntries(Object.entries(RANDOM_OFFERINGS).map(([id, offering]) =>
    [id, { ...offering, priceCents: offering.priceCents + BLANK_ADD_CENTS }])),
  'cut-sew': {
    tee: { name: 'T-shirt', priceCents: 8500 },
    hoodie: { name: 'Heavyweight hoodie', priceCents: 18000 },
    sweatpants: { name: 'Sweatpants', priceCents: 18000 },
    crewneck: { name: 'Crewneck', priceCents: 15000 },
    longsleeve: { name: 'Lightweight long sleeve / thermal', priceCents: 12000 },
    shorts: { name: 'Shorts', priceCents: 15000 }
  }
};

// Old designs without labMode retain their Blank / Cut & Sew interpretation.
// A random color alone never converts a Blank design to the cheaper Random base.
export function labModeFor(item) {
  if (!item || typeof item !== 'object' || !Object.hasOwn(CONSTRUCTIONS, item.construction)) return null;
  const mode = item.labMode === undefined ? (item.construction === 'cut-sew' ? 'cut-sew' : 'blank') : item.labMode;
  if (!['random', 'blank', 'cut-sew'].includes(mode)) return null;
  if ((mode === 'cut-sew' ? 'cut-sew' : 'canvas') !== item.construction) return null;
  return mode;
}
export function offeringFor(item) {
  const mode = labModeFor(item);
  if (!mode) return undefined;
  const offerings = mode === 'random' ? RANDOM_OFFERINGS : OFFERINGS[item.construction];
  return Object.hasOwn(offerings, item.garment) ? offerings[item.garment] : undefined;
}
export function garmentPriceParts(item) {
  const offering = offeringFor(item);
  if (!offering || !Object.hasOwn(RANDOM_OFFERINGS, item.garment)) return null;
  const baseCents = RANDOM_OFFERINGS[item.garment].priceCents;
  return { labMode: labModeFor(item), baseCents, constructionCents: offering.priceCents - baseCents, garmentCents: offering.priceCents };
}

export const COLORS = {
  black: { id: 'black', name: 'Black', addCents: 0, swatch: '#141414' },
  white: { id: 'white', name: 'White', addCents: 0, swatch: '#f4f1ea' },
  custom: { id: 'custom', name: 'Custom color', addCents: 4000, swatch: null },
  random: { id: 'random', name: 'Random color', addCents: 0, swatch: null }
};
export const CUSTOM_COLOR_MAX = 40;

// Artwork directions never carry a charge.
export const ARTWORK = {
  'product-design': { id: 'product-design', name: 'This product design', addCents: 0, blurb: 'Keep the selected collection design.' },
  'artists-choice': { id: 'artists-choice', name: "Artist's choice", addCents: 0, blurb: 'The artist decides. You trust the hand.' },
  'random-experimental': { id: 'random-experimental', name: 'Random experimental', addCents: 0, blurb: 'Drawn at the Altar of Chance from a stored seed.' },
  minimal: { id: 'minimal', name: 'Minimal', addCents: 0, blurb: 'A single mark, quiet placement.' },
  expressive: { id: 'expressive', name: 'Expressive', addCents: 0, blurb: 'Loud, layered, edge to edge.' },
  pick: { id: 'pick', name: 'Pick your graphics', addCents: 0, blurb: 'Choose from the archive: up to three on the front, one big print on the back.' }
};
// Graphics a customer may pick per side, and the back print size (inches, width × height) — the same on every garment size.
export const PICK_LIMITS = { front: 3, back: 1 };
export const BACK_PRINT_IN = { w: 16, h: 20 };
export const BACK_SIZES = {
  full: { id: 'full', name: 'Full back', w: 16, h: 20 },
  medium: { id: 'medium', name: 'Medium', w: 12, h: 13 }
};

// Sizes offered. Measurements are NOT published until verified against the real blanks and patterns.
export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
export const SIZE_CHART = null; // { garment: { size: { chestIn, lengthIn, ... } } } once measured.
export const FITS = {
  canvas: [{ id: 'blank', name: 'True to the blank', note: 'Fits the way the chosen blank is cut.' }],
  'cut-sew': [
    { id: 'regular', name: 'Regular', note: 'Cut to the house pattern.' },
    { id: 'oversized', name: 'Oversized', note: 'Cut a size up through body and sleeve.' }
  ]
};

// The Altar of Chance: artistic directions and producible treatments the random engine draws from.
export const RANDOM_CATEGORIES = ['Abstract', 'Distressed', 'Archival', 'Surreal', 'Minimal', 'Industrial', 'Romantic', 'Deconstructed', 'Experimental', 'Mixed media'];
export const PLACEMENTS = ['Front', 'Back', 'Front and back']; // no sleeve hits; the back is one big print
export const TECHNIQUES = ['Airbrush', 'Screen print', 'Hand-finished print'];
export const RANDOM_VERSION = 2;

// Special products.
export const MYSTERY_FITS = [
  { id: 'regular', name: 'Regular' },
  { id: 'relaxed', name: 'Relaxed' },
  { id: 'oversized', name: 'Oversized' }
];
export const MYSTERY_PREFERENCES_MAX = 280;
export const MYSTERY_PACKAGES = {
  'one-tee': {
    id: 'one-tee', name: 'One Tee', priceCents: 3000, units: 1, countLabel: '1 tee',
    blurb: 'One tee, selected by the house. A simple way to leave the choice to us.'
  },
  outerwear: {
    id: 'outerwear', name: 'Outerwear', priceCents: 4000, units: 1, countLabel: '1 piece',
    blurb: 'One outerwear piece, selected by the house. The exact style is part of the surprise.'
  },
  'light-pack': {
    id: 'light-pack', name: 'Light Pack', priceCents: 8000, units: 3, countLabel: '3 pieces',
    blurb: 'Three pieces, brought together as a lighter mix. The selection changes with each pack.'
  },
  'heavy-pack': {
    id: 'heavy-pack', name: 'Heavy Pack', priceCents: 12000, units: 4, countLabel: '4 pieces',
    blurb: 'Four pieces, brought together as a heavier mix. The selection changes with each pack.'
  },
  'super-package': {
    id: 'super-package', name: 'Super Package', priceCents: 25000, units: null,
    expectedUnits: { min: 4, max: 6 }, countLabel: 'Expect 4–6 pieces',
    blurb: 'Expect 4–6 new and vintage pieces. Your package may also include a cut-and-sew piece.'
  }
};

// Legacy configurations remain valid for saved carts and existing orders.
export const RELIC_BOX = {
  id: 'relic-box', name: 'The Relic Box', priceCents: 12000,
  blurb: 'A curated assortment of new and repurposed garments — it may include tops, bottoms, tees and accessories.',
  exclusions: ['tops', 'bottoms', 'tees', 'accessories', 'outerwear'],
  fits: [{ id: 'regular', name: 'Regular' }, { id: 'relaxed', name: 'Relaxed' }, { id: 'oversized', name: 'Oversized' }],
  preferencesMax: 280
};
export const TRINITY = {
  id: 'trinity', name: 'The Trinity', priceCents: 6000, units: 3,
  blurb: 'Three tees, one bundle, sixty dollars.',
  variants: [
    { id: 'curated', name: 'Curated', note: 'Three designs picked by the house.' },
    { id: 'surprise', name: 'Surprise', note: 'Three designs drawn blind.' }
  ]
};

// Customer print placement: offsets are fractions of the garment's width/height from the default spot.
export const PRINT_LIMITS = { scaleMin: .6, scaleMax: 1.6, offset: .25 };
export const DEFAULT_PRINT = { x: 0, y: 0, scale: 1 };

export const MAX_QUANTITY = 5;
export const NOTE_MAX = 500;

// Production statuses (separate from payment status).
export const PRODUCTION_STATUSES = [
  { id: 'payment_confirmed', name: 'Payment confirmed' },
  { id: 'awaiting_production', name: 'Awaiting production' },
  { id: 'in_production', name: 'In production' },
  { id: 'quality_inspection', name: 'Quality inspection' },
  { id: 'ready_to_ship', name: 'Ready to ship' },
  { id: 'shipped', name: 'Shipped' },
  { id: 'delivered', name: 'Delivered' }
];
export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'expired', 'canceled', 'refunded', 'partially_refunded', 'review'];

// Inventory keys. Ready-made stock is tracked per SKU; made-to-order work per capacity slot.
export const skuFor = item =>
  item.product === 'mystery-pack' ? `mystery-pack:${item.package}:${item.size}` :
  item.product === 'trinity' ? `trinity:${item.variant}:${item.size}` :
  item.product === 'relic-box' ? `relic-box:${item.size}` : null;
export const slotFor = item => item.product === 'garment' ? `${item.construction}:${item.garment}` : item.product === 'studio-product' ? `studio:${item.productId}` : null;

export function allSkus() {
  const out = [];
  for (const p of Object.values(MYSTERY_PACKAGES)) for (const s of SIZES) out.push({ sku: `mystery-pack:${p.id}:${s}`, label: `${p.name} · ${s}` });
  for (const v of TRINITY.variants) for (const s of SIZES) out.push({ sku: `trinity:${v.id}:${s}`, label: `${TRINITY.name} · ${v.name} · ${s}` });
  for (const s of SIZES) out.push({ sku: `relic-box:${s}`, label: `${RELIC_BOX.name} · ${s}` });
  return out;
}
export function allSlots() {
  const out = Object.values(STUDIO_PRODUCTS).filter(p => p.available !== false).map(p => ({ slot: `studio:${p.id}`, label: p.name }));
  for (const [construction, garments] of Object.entries(OFFERINGS))
    for (const [garment, o] of Object.entries(garments)) out.push({ slot: `${construction}:${garment}`, label: `${CONSTRUCTIONS[construction].name} · ${o.name}` });
  for (const [garment, o] of Object.entries(RANDOM_OFFERINGS))
    if (!OFFERINGS.canvas[garment]) out.push({ slot: `canvas:${garment}`, label: `Random base · ${o.name}` });
  return out;
}

export const formatCents = cents => '$' + (cents / 100).toFixed(cents % 100 ? 2 : 0);
