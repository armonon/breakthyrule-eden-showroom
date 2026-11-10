// One shared cart per page (ES modules are singletons), kept in localStorage and synced across tabs.
import { createCart, CART_KEY } from '/labkit/cart.mjs';
import { ARTWORK_POOL } from '/labkit/artwork-pool.mjs';

export const POOL = ARTWORK_POOL.map(a => a.id);
export const cart = createCart(globalThis.localStorage, { artworkPool: POOL });
addEventListener('storage', e => { if (e.key === CART_KEY) cart.reload(); });

let statusPromise = null;
// Public availability and checkout state. Resolves to null when the order service is unreachable.
export function labStatus() {
  statusPromise ||= fetch('/api/lab/status', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
  return statusPromise;
}
export const money = c => '$' + (c / 100).toFixed(c % 100 ? 2 : 0);
