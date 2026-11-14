// One shared cart per page (ES modules are singletons), kept in localStorage and synced across tabs.
import { createCart, CART_KEY } from '/labkit/cart.mjs';
import { ARTWORK_POOL } from '/labkit/artwork-pool.mjs';

export const POOL = ARTWORK_POOL.map(a => a.id);
let storage = null;
try { storage = globalThis.localStorage || null; } catch { /* Browsing still works when storage is blocked. */ }
export const cart = createCart(storage, { artworkPool: POOL });
addEventListener('storage', e => { if (e.key === CART_KEY || e.key === null) cart.reload(); });

let statusPromise = null, cachedStatus = null, statusExpires = 0;
// Deduplicate in-flight reads, but let a temporary failure recover without a page reload.
export function labStatus({ refresh = false } = {}) {
  if (statusPromise) return statusPromise;
  if (!refresh && cachedStatus && Date.now() < statusExpires) return Promise.resolve(cachedStatus);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  statusPromise = fetch('/api/lab/status', { cache: 'no-store', signal: controller.signal })
    .then(r => r.ok ? r.json() : null).catch(() => null)
    .then(value => { cachedStatus = value; statusExpires = value ? Date.now() + 30000 : 0; return value; })
    .finally(() => { clearTimeout(timer); statusPromise = null; });
  return statusPromise;
}
export const money = c => '$' + (c / 100).toFixed(c % 100 ? 2 : 0);
