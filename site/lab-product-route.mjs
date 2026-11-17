import { normalizeItem } from '../labkit/pricing.mjs';
import { newSeed as createSeed, isSeed } from '../labkit/random.mjs';
import { POOL_IDS } from '../labkit/artwork-pool.mjs';
import { curatedDiscoveryPicks } from '../labkit/showcase-artwork.mjs';

const previewGarments = new Set(['tee', 'hoodie', 'crewneck']);

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
  if (params.get('art') === 'curated-1' || !isSeed(seed)) {
    const chosenSeed = isSeed(seed) ? seed : newSeed();
    const raw = {
      product: 'garment', construction: 'canvas', labMode: 'blank', garment,
      fit: 'blank', color: 'random', artwork: 'pick',
      picks: curatedDiscoveryPicks(chosenSeed, artworkPool), seed: chosenSeed, quantity: 1
    };
    if (!normalizeItem({...raw, size:'M'}, {artworkPool}).ok) throw new Error('This featured garment could not be restored.');
    return raw;
  }
  // Seed-only links made before the curated showcase retain their exact artwork.
  const raw = {
    product: 'garment', construction: 'canvas', labMode: 'blank', garment,
    fit: 'blank', color: 'random', artwork: 'random-experimental', seed, quantity: 1
  };
  if (!normalizeItem({...raw,size:'M'}, {artworkPool}).ok) throw new Error('This random garment could not be restored.');
  return raw;
}
