// The Altar of Chance: a seeded, reproducible random engine. The same seed, mode and inputs always
// give the same result, so an accepted configuration can be rebuilt exactly from its stored record.
// It only chooses from curated, producible treatments and existing artwork — it never invents an image.
import { OFFERINGS, RANDOM_CATEGORIES, PLACEMENTS, TECHNIQUES, RANDOM_VERSION, FITS } from './catalog.mjs';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
function pickDistinct(rng, list, n) {
  const pool = list.slice(), out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
export const isSeed = s => Number.isInteger(s) && s >= 1 && s <= 0xFFFFFFFF;
export function newSeed() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) { const a = new Uint32Array(1); do c.getRandomValues(a); while (!a[0]); return a[0]; }
  return 1 + Math.floor(Math.random() * 0xFFFFFFFE);
}

// RANDOM ART: keeps garment and size; draws the artistic direction.
// `artworkPool` is a list of curated artwork ids (Break Thy Rule graphics) to reference.
export function drawArt(seed, artworkPool = []) {
  const rng = mulberry32(seed);
  const [category, secondary] = pickDistinct(rng, RANDOM_CATEGORIES, 2);
  return {
    version: RANDOM_VERSION, seed,
    category, secondary,
    placement: pick(rng, PLACEMENTS),
    technique: pick(rng, TECHNIQUES),
    references: pickDistinct(rng, artworkPool, Math.min(3, artworkPool.length))
  };
}

// TOTAL CHAOS: keeps construction and size (the customer's essentials and price class); draws the
// garment, colour (black, white or random — never a paid custom colour), fit and the artistic direction.
export function drawChaos(seed, { construction }, artworkPool = []) {
  const rng = mulberry32(seed ^ 0x9E3779B9);
  const garments = Object.keys(OFFERINGS[construction] || {});
  const garment = pick(rng, garments);
  const color = pick(rng, ['black', 'white', 'random']);
  const fit = pick(rng, FITS[construction] || [{ id: 'blank' }]).id;
  return { garment, color, fit, art: drawArt(seed, artworkPool) };
}
