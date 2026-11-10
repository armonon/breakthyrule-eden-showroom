// The cart: a list of configurations (never prices) kept in the browser. Prices are always recomputed
// from the catalog for display and recomputed again by the server at checkout.
import { normalizeItem, priceItem, describeItem } from './pricing.mjs';
import { MAX_QUANTITY } from './catalog.mjs';

export const CART_KEY = 'btr-lab-cart-v1';
const lineId = () => 'l' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function createCart(storage = globalThis.localStorage, opts = {}) {
  const read = () => { try { const v = JSON.parse(storage?.getItem(CART_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  let lines = read().filter(l => l && l.id && normalizeItem(l.config, opts).ok);
  const listeners = new Set();
  const save = () => { try { storage?.setItem(CART_KEY, JSON.stringify(lines)); } catch { /* storage full or blocked */ } listeners.forEach(f => f(api.view())); };
  const strip = cfg => { const { unitCents, totalCents, lines: _l, priceCents, price, ...rest } = cfg || {}; void unitCents; void totalCents; void _l; void priceCents; void price; return rest; };

  const api = {
    add(config) {
      const n = normalizeItem(strip(config), opts);
      if (!n.ok) return { ok: false, errors: n.errors };
      lines.push({ id: lineId(), config: { ...strip(config), quantity: n.item.quantity } }); save();
      return { ok: true, id: lines[lines.length - 1].id };
    },
    replace(id, config) {
      const i = lines.findIndex(l => l.id === id); if (i < 0) return { ok: false, errors: ['That item is no longer in your cart.'] };
      const n = normalizeItem(strip(config), opts); if (!n.ok) return { ok: false, errors: n.errors };
      lines[i] = { id, config: strip(config) }; save(); return { ok: true, id };
    },
    setQuantity(id, q) {
      const l = lines.find(x => x.id === id); if (!l) return { ok: false };
      const next = { ...l.config, quantity: Math.max(1, Math.min(MAX_QUANTITY, Math.round(q))) };
      const n = normalizeItem(next, opts); if (!n.ok) return { ok: false, errors: n.errors };
      l.config = next; save(); return { ok: true };
    },
    remove(id) { lines = lines.filter(l => l.id !== id); save(); },
    clear() { lines = []; save(); },
    get(id) { return lines.find(l => l.id === id) || null; },
    items() { return lines.map(l => l.config); },
    view() {
      const out = lines.map(l => { const n = normalizeItem(l.config, opts); if (!n.ok) return null; const p = priceItem(n.item); return { id: l.id, config: l.config, item: n.item, ...p, describe: describeItem(n.item) }; }).filter(Boolean);
      return { lines: out, count: out.reduce((s, l) => s + l.item.quantity, 0), subtotalCents: out.reduce((s, l) => s + l.totalCents, 0) };
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    reload() { lines = read().filter(l => l && l.id && normalizeItem(l.config, opts).ok); listeners.forEach(f => f(api.view())); }
  };
  return api;
}
