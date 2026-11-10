// THE GARMENT LAB CATALOG — the one place prices and options are defined.
// Shared by the browser (display) and the server (the only prices that are ever charged).
// All money is integer cents, USD. Edit here; never in page code.

export const CURRENCY = 'usd';
export const CATALOG_VERSION = 1;

export const CONSTRUCTIONS = {
  canvas: {
    id: 'canvas', name: 'The Canvas',
    blurb: 'An existing blank — vintage or new — printed in house with Break Thy Rule artwork.',
    madeTo: 'order'
  },
  'cut-sew': {
    id: 'cut-sew', name: 'Cut & Sew',
    blurb: 'An original garment cut, sewn and printed from scratch. A handcrafted, brand-new piece.',
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

// Official prices (cents). The Canvas / Cut & Sew garment offerings.
export const OFFERINGS = {
  canvas: {
    tee: { name: 'T-shirt', priceCents: 6000 },
    hoodie: { name: 'Hoodie', priceCents: 8000 },
    sweatpants: { name: 'Sweatpants', priceCents: 8000 },
    crewneck: { name: 'Crewneck', priceCents: 8000 },
    shorts: { name: 'Shorts', priceCents: 8000 }
  },
  'cut-sew': {
    tee: { name: 'T-shirt', priceCents: 8000 },
    hoodie: { name: 'Heavyweight hoodie', priceCents: 18000 },
    sweatpants: { name: 'Sweatpants', priceCents: 18000 },
    crewneck: { name: 'Crewneck', priceCents: 15000 },
    longsleeve: { name: 'Lightweight long sleeve / thermal', priceCents: 12000 },
    shorts: { name: 'Shorts', priceCents: 15000 }
  }
};

export const COLORS = {
  black: { id: 'black', name: 'Black', addCents: 0, swatch: '#141414' },
  white: { id: 'white', name: 'White', addCents: 0, swatch: '#f4f1ea' },
  custom: { id: 'custom', name: 'Custom color', addCents: 4000, swatch: null },
  random: { id: 'random', name: 'Random color', addCents: 0, swatch: null }
};
export const CUSTOM_COLOR_MAX = 40;

// Artwork directions never carry a charge.
export const ARTWORK = {
  'artists-choice': { id: 'artists-choice', name: "Artist's choice", addCents: 0, blurb: 'The artist decides. You trust the hand.' },
  'random-experimental': { id: 'random-experimental', name: 'Random experimental', addCents: 0, blurb: 'Drawn at the Altar of Chance from a stored seed.' },
  minimal: { id: 'minimal', name: 'Minimal', addCents: 0, blurb: 'A single mark, quiet placement.' },
  expressive: { id: 'expressive', name: 'Expressive', addCents: 0, blurb: 'Loud, layered, edge to edge.' }
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
export const PLACEMENTS = ['Front', 'Back', 'Front and back', 'Sleeve and chest'];
export const TECHNIQUES = ['Airbrush', 'Screen print', 'Hand-finished print'];
export const RANDOM_VERSION = 1;

// Special products.
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
  item.product === 'trinity' ? `trinity:${item.variant}:${item.size}` :
  item.product === 'relic-box' ? `relic-box:${item.size}` : null;
export const slotFor = item => item.product === 'garment' ? `${item.construction}:${item.garment}` : null;

export function allSkus() {
  const out = [];
  for (const v of TRINITY.variants) for (const s of SIZES) out.push({ sku: `trinity:${v.id}:${s}`, label: `${TRINITY.name} · ${v.name} · ${s}` });
  for (const s of SIZES) out.push({ sku: `relic-box:${s}`, label: `${RELIC_BOX.name} · ${s}` });
  return out;
}
export function allSlots() {
  const out = [];
  for (const [construction, garments] of Object.entries(OFFERINGS))
    for (const [garment, o] of Object.entries(garments)) out.push({ slot: `${construction}:${garment}`, label: `${CONSTRUCTIONS[construction].name} · ${o.name}` });
  return out;
}

export const formatCents = cents => '$' + (cents / 100).toFixed(cents % 100 ? 2 : 0);
