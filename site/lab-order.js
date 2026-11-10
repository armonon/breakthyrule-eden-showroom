// The customer's private order page: payment status, the pieces, totals and the production timeline.
import { PRODUCTION_STATUSES, GARMENT_TYPES } from '/labkit/catalog.mjs';
import { itemSketch } from '/site/garment-sketch.mjs';
import { cart, money } from '/site/cart-store.mjs';
const $ = id => document.getElementById(id);
const h = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids.flat()) if (k != null) n.append(k); return n; };
const p = new URLSearchParams(location.search), ref = p.get('ref'), key = p.get('key');
const COPY = {
  pending: ['Waiting for payment confirmation', 'We are waiting for the payment provider to confirm. This page updates on its own.'],
  paid: ['Payment confirmed', 'Thank you. Your order is with the studio — you can follow it here.'],
  review: ['Payment received — under review', 'We received a payment that needs a quick check. We will be in touch.'],
  failed: ['Payment failed', 'The payment did not go through and nothing was charged. Your cart is still saved.'],
  expired: ['Checkout expired', 'The checkout window closed before payment. Nothing was charged.'],
  canceled: ['Order canceled', 'This order was canceled. Nothing was charged.'],
  refunded: ['Refunded', 'This order has been refunded.'],
  partially_refunded: ['Partly refunded', 'Part of this order has been refunded.']
};
$('copy-link').onclick = async () => { try { await navigator.clipboard.writeText(location.href); $('copy-link').textContent = 'Copied'; } catch { $('copy-link').textContent = 'Copy the address bar'; } };
let tries = 0;
async function load() {
  if (!ref || !key) { $('order-title').textContent = 'Order not found'; $('order-lede').textContent = 'Open the link from your confirmation to see your order.'; return; }
  let o;
  try { const r = await fetch(`/api/lab/orders/${encodeURIComponent(ref)}?key=${encodeURIComponent(key)}`, { cache: 'no-store' }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Order not found'); o = await r.json(); }
  catch (e) { $('order-title').textContent = 'Order not found'; $('order-lede').textContent = e.message; return; }
  const [title, lede] = COPY[o.payment.status] || [o.payment.status, ''];
  $('order-ref').textContent = o.id + (o.mode === 'test' ? ' · test order' : '');
  $('order-title').textContent = title; $('order-lede').textContent = lede;
  if (['paid', 'review'].includes(o.payment.status) && sessionStorage.getItem('btr-last-order') === o.id) { cart.clear(); sessionStorage.removeItem('btr-last-order'); sessionStorage.removeItem('btr-checkout-key'); sessionStorage.removeItem('btr-cart-note'); }
  $('order-items').replaceChildren(...o.items.map((it, i) => { const art = h('div', { className: 'cart-art' }); art.innerHTML = itemSketch(it, { silhouette: GARMENT_TYPES[it.garment]?.silhouette }, 'o' + i);
    return h('li', { className: 'cart-line' }, art, h('div', { className: 'cart-info' }, h('strong', { textContent: it.title + (it.quantity > 1 ? ` × ${it.quantity}` : '') }), h('ul', { className: 'cart-spec' }, ...it.spec.map(s => h('li', { textContent: s })))), h('span', { className: 'cart-price', textContent: money(it.totalCents) })); }));
  const rows = [['Subtotal', o.subtotalCents]];
  if (o.payment.amountShipping != null) rows.push(['Shipping', o.payment.amountShipping]);
  if (o.payment.amountTax != null) rows.push(['Tax', o.payment.amountTax]);
  if (o.payment.amountTotal != null) rows.push(['Total paid', o.payment.amountTotal]);
  $('order-totals').replaceChildren(...rows.map(([k, v]) => h('tr', {}, h('th', { scope: 'row', textContent: k }), h('td', { textContent: money(v) }))));
  const reached = new Map(o.production.history.map(x => [x.status, x.at]));
  const idx = PRODUCTION_STATUSES.findIndex(s => s.id === o.production.status);
  $('timeline').replaceChildren(...PRODUCTION_STATUSES.map((s, i) => h('li', { className: i <= idx ? 'done' : '' }, h('span', { className: 'dot' }), h('span', { textContent: s.name }), reached.get(s.id) ? h('time', { textContent: new Date(reached.get(s.id)).toLocaleDateString() }) : null)));
  $('shipment').replaceChildren(o.shipment ? h('p', { className: 'shipment' }, 'Shipped with ', h('strong', { textContent: o.shipment.carrier || 'the carrier' }), o.shipment.tracking ? ` — tracking ${o.shipment.tracking}` : '') : '');
  if (o.payment.status === 'pending' && tries++ < 40) setTimeout(load, 3000);
}
load();
