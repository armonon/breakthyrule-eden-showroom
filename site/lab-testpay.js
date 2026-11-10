// Local/test only: stands in for the Stripe page and sends a payment event through the normal pipeline.
import { money } from '/site/cart-store.mjs';
const $ = id => document.getElementById(id);
const p = new URLSearchParams(location.search), ref = p.get('ref'), key = p.get('key');
const orderUrl = `/lab-order?ref=${encodeURIComponent(ref)}&key=${encodeURIComponent(key)}`;
async function act(action) {
  $('tp-status').textContent = 'Working…';
  const r = await fetch('/api/lab/test-gateway/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref, key }) });
  if (!r.ok) { $('tp-status').textContent = (await r.json().catch(() => ({}))).error || 'The test gateway is not available.'; return false; }
  return true;
}
$('tp-pay').onclick = async () => { if (await act('pay')) location.href = orderUrl + '&paid=1'; };
$('tp-decline').onclick = () => { $('tp-status').textContent = 'Card declined (test). Nothing was charged — try again or abandon.'; };
$('tp-abandon').onclick = async () => { if (await act('abandon')) location.href = '/lab?canceled=' + encodeURIComponent(ref); };
fetch(`/api/lab/orders/${encodeURIComponent(ref)}?key=${encodeURIComponent(key)}`).then(r => r.ok ? r.json() : null).then(o => {
  if (!o) { $('tp-status').textContent = 'Order not found.'; return; }
  $('tp-sum').innerHTML = '';
  for (const [k, v] of [['Order', o.id], ['Pieces', o.items.map(i => i.title + (i.quantity > 1 ? ' × ' + i.quantity : '')).join(', ')], ['Amount', money(o.subtotalCents) + ' (+ shipping and tax, calculated by Stripe in live mode)']]) {
    const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; $('tp-sum').append(dt, dd);
  }
});
