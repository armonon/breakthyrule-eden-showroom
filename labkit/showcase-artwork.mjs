import { mulberry32 } from './random.mjs';

export const DISCOVERY_GRAPHICS = Object.freeze(['illuminti', 'house-of-horus', 'diamond-body', 'nu-cross', 'divide', 'war', 'god-loves-u']);

// One strong front print and one back print, reproducible in the product page
// and saved as ordinary explicit picks for the Lab and checkout.
export function curatedDiscoveryPicks(seed, available = DISCOVERY_GRAPHICS) {
  const graphics = DISCOVERY_GRAPHICS.filter(id => available.includes(id));
  if (!graphics.length) throw new Error('The featured artwork is unavailable.');
  const random = mulberry32(seed), front = graphics[Math.floor(random() * graphics.length)];
  const backs = graphics.filter(id => id !== front);
  return { front: [front], back: [backs.length ? backs[Math.floor(random() * backs.length)] : front] };
}
