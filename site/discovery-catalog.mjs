// The discovery hero reads the same catalog and price sources as the product pages.
// Existing products keep their artwork. Unpriced concepts stay unpriced.
const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const BLANKS = { tee: '/models/blanks/tee.glb', hoodie: '/models/blanks/hoodie.glb', crewneck: '/models/blanks/crewneck.glb' };
export const DISCOVERY_WEIGHTS = Object.freeze({ garments: 10, mystery: 4, accessories: 3, metals: 3 });
const currency = 'USD';
const money = cents => Number.isFinite(cents) ? MONEY.format(cents / 100) : 'Design preview';
const cents = price => typeof price === 'number' && Number.isFinite(price) ? Math.round(price * 100) : typeof price === 'string' && /^\$\d+(?:\.\d{1,2})?$/.test(price.trim()) ? Math.round(Number(price.trim().slice(1)) * 100) : null;
const absolute = (path, base) => !path || /^(?:\/|https?:)/.test(path) ? path || null : base + path;
const publishedColor = (name, value) => ({ kind: 'published', name, ...(value ? { value } : {}) });
const base = (item, category, renderKind, extra = {}) => ({
  id: item.id || item.slug, sourceId: item.id || item.slug, origin: 'catalog', category, renderKind,
  name: item.name, description: item.description || item.tagline || '', currency,
  priceCents: null, priceText: 'Design preview', href: '/product?item=' + encodeURIComponent(item.id || item.slug),
  model: item.model || null, poster: item.poster || null, sourceItem: item,
  colorway: { kind: 'original', name: 'Original artwork' }, ink: null,
  presentation: 'garment', cameraElevationDegrees: 0, ctaText: 'View piece', ...extra
});

/** Build a uniform pool. Dependency injection also lets tests use the captured live catalogs. */
export async function buildDiscoveryCatalog({
  scope = globalThis, fetcher = globalThis.fetch?.bind(globalThis),
  importModule = url => import(url), labCatalog, pendants,
  onWarning = (message, error) => console.warn(message, error)
} = {}) {
  const sources = [
    ['showroomCollection', '/garment-catalog.js'], ['BTR_CORE', '/core-collection/catalog.js'],
    ['BTR_ACCESSORIES', '/accessory-collection/catalog.js'], ['BTR_BELTS', '/btr-belts/catalog.js']
  ];
  await Promise.all(sources.map(async ([key, url]) => {
    if (Array.isArray(scope[key])) return;
    try { await importModule(url); } catch (error) { onWarning('Discovery catalog unavailable: ' + key, error); }
  }));
  if (!labCatalog) {
    try { labCatalog = await importModule(new URL('../labkit/catalog.mjs', import.meta.url).href); }
    catch (error) { onWarning('Discovery mystery offers unavailable', error); }
  }
  if (!pendants) {
    try {
      const response = await fetcher('/pendant-collection/catalog.json');
      if (!response.ok) throw new Error('Catalog HTTP ' + response.status);
      pendants = await response.json();
    } catch (error) { onWarning('Discovery necklaces unavailable', error); pendants = []; }
  }
  const items = [], original = scope.showroomCollection || [], accessories = scope.BTR_ACCESSORIES || [];
  const gloves = original.find(item => item.slug === 'apple-gloves' || item.id === 'apple-gloves');
  for (const item of original) {
    if (!item.model) continue;
    // Both official glove colors below link to this same published product and its price.
    if (item === gloves && accessories.some(accessory => accessory.family === 'gloves')) continue;
    const accessory = /beanie|gloves/i.test(item.slug || item.id);
    const priceCents = cents(item.price), photo = item.images?.[0];
    items.push(base(item, accessory ? 'accessory' : 'garment', accessory ? 'accessory' : 'garment', {
      id: item.slug || item.id, sourceId: item.slug || item.id,
      priceCents, priceText: money(priceCents), href: '/product?item=' + encodeURIComponent(item.slug || item.id),
      poster: scope.showroomAssets?.web?.(photo) || photo || null,
      description: item.tagline || item.description, chapter: item.chapter,
      cameraElevationDegrees: accessory ? 15 : 0
    }));
  }
  for (const item of scope.BTR_CORE || []) for (const fabric of item.colors || Object.keys(item.models || {})) {
    if (!item.models?.[fabric]) continue;
    items.push(base(item, 'core', 'core', {
      id: item.id + ':' + fabric, name: item.name + ' · ' + fabric,
      description: 'Complete logo chest embroidery · eye artwork across the back.',
      href: '/product?item=' + encodeURIComponent(item.id) + '&color=' + encodeURIComponent(fabric),
      model: item.models[fabric], poster: item.posters?.[fabric]?.front || null,
      colorway: { ...publishedColor(fabric === 'black' ? 'Black' : 'White', fabric === 'black' ? '#141414' : '#f4f1ea'), fabric, graphicIndex: item.colorOffset || 0 }
    }));
  }
  for (const item of accessories) {
    if (!item.model) continue;
    const priceCents = item.family === 'gloves' && gloves ? cents(gloves.price) : cents(item.price);
    const extra = {
      sourceId: item.family === 'gloves' && gloves ? gloves.slug || gloves.id : item.id,
      href: item.href || '/product?item=' + encodeURIComponent(item.id),
      priceCents, priceText: money(priceCents), presentation: 'accessory',
      cameraElevationDegrees: item.family === 'gloves' ? 8 : 23,
      colorway: publishedColor(item.name, item.color)
    };
    if (item.family !== 'trucker') { items.push(base(item, 'accessory', 'accessory', extra)); continue; }
    const styles = scope.BTR_HAT_STYLES?.length ? scope.BTR_HAT_STYLES : [{ id: 'trucker', name: 'Mesh trucker', model: item.model, poster: item.poster }];
    for (const style of styles) {
      const sourceItem = { ...item, hatStyle: style.id, model: style.model };
      items.push(base(item, 'accessory', 'hat', {
        ...extra, id: item.id + ':' + style.id, name: style.id === 'trucker' ? item.name : item.name.replace(/trucker/i, 'Baseball Cap'),
        href: extra.href + (extra.href.includes('?') ? '&' : '?') + 'hat=' + encodeURIComponent(style.id),
        model: style.model, poster: style.id === 'trucker' ? item.poster : style.poster,
        sourceItem, ink: style.ink || null,
        colorway: { kind: 'published', name: style.id === 'trucker' ? item.name : item.name.replace(/trucker/i, 'Baseball Cap'), colors: { front: item.frontColor, brim: item.brimColor, mesh: item.meshColor } }
      }));
    }
  }
  for (const item of scope.BTR_BELTS || []) {
    if (!item.model) continue;
    const priceCents = cents(item.price);
    items.push(base(item, 'belt', 'belt', {
      model: absolute(item.model, '/btr-belts/'), poster: absolute(item.poster, '/btr-belts/'),
      description: 'Sculptural buckle and black strap · both included.', priceCents, priceText: money(priceCents),
      presentation: 'belt', cameraElevationDegrees: item.cameraElevationDegrees || 18,
      colorway: publishedColor('Black strap', item.defaultStrapColor), priceIncludes: item.priceIncludes
    }));
  }
  for (const item of pendants || []) {
    const priceCents = cents(item.price), media = item.media || '/pendant-collection/media/' + item.slug + '/';
    const id = 'pendant-' + item.slug;
    items.push(base({ ...item, id }, 'necklace', 'pendant', {
      name: item.name + ' Necklace', description: 'Sculptural pendant and chain · both included.',
      priceCents, priceText: money(priceCents), href: '/product?item=' + encodeURIComponent(id),
      poster: media + item.slug + '-full-poster.png', model: '/pendant-collection/models/' + item.slug + '-discovery.glb',
      presentation: 'pendant', cameraElevationDegrees: 4,
      media: { src: media + item.slug + '-full-packed.mp4', width: 640, height: 900, packedAlpha: true, durationSeconds: 10 },
      priceIncludes: item.priceIncludes
    }));
  }
  for (const offer of Object.values(labCatalog?.MYSTERY_PACKAGES || {})) {
    const garmentType = offer.id === 'one-tee' ? 'tee' : offer.id === 'outerwear' ? 'hoodie' : null;
    const visualization = garmentType ? 'garment' : 'box';
    items.push(base({ ...offer, id: 'mystery-' + offer.id }, 'mystery', 'mystery', {
      sourceId: offer.id, name: offer.id === 'one-tee' ? 'Mystery Tee' : 'Mystery ' + offer.name,
      description: offer.blurb, priceCents: offer.priceCents, priceText: money(offer.priceCents),
      href: '/lab?package=' + encodeURIComponent(offer.id) + '#packages', ctaText: 'Choose mystery package',
      model: garmentType ? BLANKS[garmentType] : null,
      colorway: { kind: 'random', name: 'Selected by the house' },
      mystery: { packageId: offer.id, units: offer.units, countLabel: offer.countLabel, visualization, garmentType, questionMarks: true, offerOnly: true }
    }));
  }
  return [...new Map(items.map(item => [item.id, item])).values()];
}

function shuffled(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(random() * (i + 1))); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
const groupOf = item => item.category === 'mystery' ? 'mystery' : item.category === 'belt' || item.category === 'necklace' ? 'metals' : item.category === 'accessory' ? 'accessories' : 'garments';

/** Nine real catalog offers and one generated Lab design in every shuffled ten-slot batch.
 * Category and item shuffle bags prevent starvation, while weighted mystery bags favor the $30 tee.
 * makeGenerated is synchronous and should return the renderer's seeded Lab descriptor.
 */
export function createDiscoveryScheduler(items, { random = Math.random, makeGenerated } = {}) {
  if (!Array.isArray(items) || !items.length) throw new Error('Discovery needs at least one catalog item');
  if (typeof makeGenerated !== 'function') throw new Error('Discovery needs a generated-design factory');
  const groups = new Map(), itemBags = new Map(), lastByGroup = new Map();
  for (const item of items) { const group = groupOf(item); if (!groups.has(group)) groups.set(group, []); groups.get(group).push(item); }
  let slots = [], categories = [], lastId = null, generated = 0, catalog = 0, batch = 0;
  const seen = new Set(), groupCounts = {}, packageCounts = {};
  const refill = group => {
    const members = groups.get(group).flatMap(item => Array(group === 'mystery' ? item.mystery?.packageId === 'one-tee' ? 3 : item.mystery?.packageId === 'outerwear' ? 2 : 1 : 1).fill(item));
    // Weighted bags must also avoid runs at their tail and across bag boundaries.
    for (let attempt = 0; attempt < 128; attempt++) {
      const bag = shuffled(members, random); let previous = lastByGroup.get(group), valid = true;
      for (let i = bag.length - 1; i >= 0; i--) { if (bag[i].id === previous) { valid = false; break; } previous = bag[i].id; }
      if (valid) return bag;
    }
    // Deterministic fallback remains valid even with a constant random source.
    const remaining = new Map(); for (const item of members) remaining.set(item.id, { item, count: (remaining.get(item.id)?.count || 0) + 1 });
    const order = []; let previous = lastByGroup.get(group);
    while (remaining.size) {
      const available = [...remaining.values()].filter(entry => entry.item.id !== previous).sort((a, b) => b.count - a.count);
      const entry = available[0] || remaining.values().next().value;
      order.push(entry.item); previous = entry.item.id;
      if (--entry.count === 0) remaining.delete(entry.item.id);
    }
    return order.reverse();
  };
  function catalogItem() {
    if (!categories.length) categories = shuffled([...groups.keys()].flatMap(group => Array(DISCOVERY_WEIGHTS[group]).fill(group)), random);
    const group = categories.pop(); let bag = itemBags.get(group);
    if (!bag?.length) { bag = refill(group); itemBags.set(group, bag); }
    let item = bag.pop(); lastByGroup.set(group, item.id); catalog++; seen.add(item.id); groupCounts[group] = (groupCounts[group] || 0) + 1;
    if (item.mystery) {
      const mystery = { ...item.mystery }, isTee = mystery.packageId === 'one-tee';
      mystery.visualization = mystery.garmentType && random() < (isTee ? .75 : .65) ? 'garment' : 'box';
      item = { ...item, mystery, model: mystery.visualization === 'garment' ? BLANKS[mystery.garmentType] : null };
      packageCounts[mystery.packageId] = (packageCounts[mystery.packageId] || 0) + 1;
    }
    return item;
  }
  return {
    next() {
      if (!slots.length) { slots = shuffled([...Array(9).fill('catalog'), 'generated'], random); batch++; }
      const kind = slots.pop();
      const item = kind === 'generated' ? makeGenerated({ sequence: generated + 1, random }) : catalogItem();
      if (!item || typeof item.then === 'function') throw new Error('Generated-design factory must return a descriptor synchronously');
      if (kind === 'generated') generated++;
      lastId = item.id;
      return item;
    },
    stats() { return { catalog, generated, total: catalog + generated, batch, catalogSize: items.length, uniqueCatalog: seen.size, groups: { ...groupCounts }, packages: { ...packageCounts } }; }
  };
}
