import { normalizeItem, sidesFor } from '../labkit/pricing.mjs';
import { newSeed as createSeed, isSeed } from '../labkit/random.mjs';
import { ARTWORK_POOL, POOL_IDS } from '../labkit/artwork-pool.mjs';

const previewGarments = new Set(['tee', 'hoodie', 'crewneck']);
const explicitArtwork = new Set(ARTWORK_POOL.filter(art => art.explicit).map(art => art.id));

export function productRoute(pathname) {
  if (/^\/random-shirt(?:\.html)?\/?$/.test(pathname)) return 'random';
  if (/^\/mystery-box(?:\.html)?\/?$/.test(pathname)) return 'mystery';
  return null;
}

/** Restore the preview's seeded design; the customer still chooses their size.
 * A random fabric color is a Blank choice, not the separate cheaper Random base.
 */
export function randomProductDesign(params, { newSeed = createSeed, artworkPool = POOL_IDS } = {}) {
  const garment = previewGarments.has(params.get('g')) ? params.get('g') : 'tee';
  const seed = Number(params.get('seed'));
  const prepare = candidate => {
    if (!isSeed(candidate)) return null;
    const raw = {
      product: 'garment', construction: 'canvas', labMode: 'blank', garment,
      fit: 'blank', color: 'random', artwork: 'random-experimental',
      seed: candidate, quantity: 1
    };
    // Validate with the same temporary size used by the Lab's price preview.
    const normalized = normalizeItem({ ...raw, size: 'M' }, { artworkPool });
    return normalized.ok ? { raw, sides: sidesFor(normalized.item) } : null;
  };

  if (isSeed(seed)) {
    const restored = prepare(seed);
    if (restored) return restored.raw;
    throw new Error('This random garment could not be restored.');
  }

  // New draws follow the hero's bounded, non-explicit artwork selection. A
  // supplied seed is restored exactly instead of quietly becoming another design.
  let fallback = null;
  for (let attempt = 0; attempt < 36; attempt++) {
    const candidate = prepare(newSeed());
    if (!candidate) continue;
    const { front, back } = candidate.sides;
    if ([...front, ...back].some(id => explicitArtwork.has(id))) continue;
    fallback = candidate.raw;
    if (front.length && back.length) return fallback;
  }
  if (fallback) return fallback;
  throw new Error('Could not prepare a random garment. Please try again.');
}
