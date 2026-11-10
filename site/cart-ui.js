// The cart: a header button and a drawer on every page of the site. Edits configurations, quantities,
// removes lines, and starts a secure checkout (prices are recomputed on the server).
import { cart, labStatus, money } from '/site/cart-store.mjs';
import { itemSketch } from '/site/garment-sketch.mjs';
import { MAX_QUANTITY } from '/labkit/catalog.mjs';

const h = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids.flat()) if (k != null) n.append(k); return n; };

const button = h('button', { type: 'button', className: 'cart-button', title: 'Your cart' }, h('span', { textContent: 'Cart' }), h('span', { className: 'cart-count', textContent: '0' }));
button.setAttribute('aria-label', 'Open your cart');
const top = document.querySelector('.site-top');
(top?.querySelector('.enter-showroom') || top?.lastChild)?.before(button);

const drawer = h('dialog', { className: 'cart-drawer', id: 'cart-drawer' });
drawer.setAttribute('aria-labelledby', 'cart-title');
const list = h('ol', { className: 'cart-lines' });
const subtotal = h('strong', { className: 'cart-subtotal' });
const note = h('textarea', { id: 'cart-note', maxLength: 500, rows: 2, placeholder: 'A note for the studio (optional)' });
const status = h('p', { className: 'cart-status', role: 'status' });
const checkout = h('button', { type: 'button', className: 'solid big cart-checkout', textContent: 'Checkout' });
const close = h('button', { type: 'button', className: 'cart-close', textContent: '×', title: 'Close cart' });
close.setAttribute('aria-label', 'Close cart');
drawer.append(
  h('header', { className: 'cart-head' }, h('h2', { id: 'cart-title' }, h('small', { textContent: 'The Garment Lab' }), 'Your cart'), close),
  list,
  h('footer', { className: 'cart-foot' },
    h('div', { className: 'cart-row' }, h('span', { textContent: 'Subtotal' }), subtotal),
    h('p', { className: 'fine', textContent: 'Shipping and any taxes are calculated at checkout. Card details are handled by Stripe and never touch our servers.' }),
    h('label', { className: 'cart-note' }, h('span', { textContent: 'Note' }), note),
    status, checkout,
    h('a', { className: 'cart-continue', href: '/lab', textContent: 'Keep building in the Lab ↗' }))
);
document.body.append(drawer);

note.value = sessionStorage.getItem('btr-cart-note') || '';
note.addEventListener('input', () => sessionStorage.setItem('btr-cart-note', note.value));

function render(view = cart.view()) {
  button.querySelector('.cart-count').textContent = view.count;
  button.classList.toggle('has-items', view.count > 0);
  subtotal.textContent = money(view.subtotalCents);
  checkout.disabled = !view.lines.length;
  if (!view.lines.length) { list.replaceChildren(h('li', { className: 'cart-empty' }, h('p', { textContent: 'Your cart is empty.' }), h('a', { href: '/lab', className: 'ghost', textContent: 'Build a garment' }))); return; }
  list.replaceChildren(...view.lines.map(l => {
    const art = h('div', { className: 'cart-art' }); art.innerHTML = itemSketch(l.item, l.describe, 'cart-' + l.id);
    const single = l.item.product === 'garment' && l.item.construction === 'cut-sew';
    const minus = h('button', { type: 'button', textContent: '−', disabled: single || l.item.quantity <= 1 }); minus.setAttribute('aria-label', 'One fewer');
    const plus = h('button', { type: 'button', textContent: '+', disabled: single || l.item.quantity >= MAX_QUANTITY }); plus.setAttribute('aria-label', 'One more');
    minus.onclick = () => cart.setQuantity(l.id, l.item.quantity - 1);
    plus.onclick = () => cart.setQuantity(l.id, l.item.quantity + 1);
    const remove = h('button', { type: 'button', className: 'link', textContent: 'Remove' }); remove.onclick = () => cart.remove(l.id);
    const edit = l.item.product === 'garment' ? h('a', { className: 'link', href: '/lab?edit=' + encodeURIComponent(l.id) + '#build', textContent: 'Edit' }) : null;
    return h('li', { className: 'cart-line' }, art,
      h('div', { className: 'cart-info' },
        h('strong', { textContent: l.describe.title }),
        h('ul', { className: 'cart-spec' }, ...l.describe.spec.map(s => h('li', { textContent: s }))),
        h('div', { className: 'cart-controls' },
          h('div', { className: 'qty', role: 'group', ariaLabel: 'Quantity' }, minus, h('span', { textContent: String(l.item.quantity), ariaLive: 'polite' }), plus),
          edit, remove)),
      h('span', { className: 'cart-price', textContent: money(l.totalCents) }));
  }));
}
cart.subscribe(render); render();

function openCart() { if (!drawer.open) drawer.showModal(); status.textContent = ''; }
button.onclick = openCart;
close.onclick = () => drawer.close();
drawer.addEventListener('click', e => { if (e.target === drawer) drawer.close(); });
document.addEventListener('lab:open-cart', openCart);

// One checkout key per cart state, so a double click or a retry never opens two checkouts.
function checkoutKey(items) {
  const sig = JSON.stringify(items) + note.value;
  const saved = JSON.parse(sessionStorage.getItem('btr-checkout-key') || 'null');
  if (saved && saved.sig === sig) return saved.key;
  const key = Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem('btr-checkout-key', JSON.stringify({ sig, key }));
  return key;
}
checkout.onclick = async () => {
  const items = cart.items();
  if (!items.length) return;
  checkout.disabled = true; status.textContent = 'Opening secure checkout…';
  try {
    const st = await labStatus();
    if (!st) throw new Error('Ordering is not connected on this preview yet — your cart is saved on this device.');
    if (!st.checkout.available) throw new Error(st.checkout.reasons.join(' ') + ' Your cart is saved on this device.');
    const r = await fetch('/api/lab/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, note: note.value, idempotencyKey: checkoutKey(items) }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.url) throw new Error(data.error || 'Checkout could not start. Nothing was charged.');
    sessionStorage.setItem('btr-last-order', data.orderId);
    location.href = data.url;
  } catch (e) {
    status.textContent = e.message; checkout.disabled = false;
    sessionStorage.removeItem('btr-checkout-key');
  }
};
labStatus().then(st => { if (st?.checkout?.mode === 'test') { const b = h('span', { className: 'test-badge', textContent: 'Test mode — no real charges' }); drawer.querySelector('.cart-head h2').append(b); } });
