// The studio dashboard: orders and production, stock and capacity, archive, waitlist, launch settings, staff.
// Talks to /api/lab/admin/* with a bearer token kept in this tab's sessionStorage.
import { PRODUCTION_STATUSES, PAYMENT_STATUSES } from '/labkit/catalog.mjs';
import { artworkThumb, ARTWORK_POOL } from '/labkit/artwork-pool.mjs';
import { itemSketch } from '/site/garment-sketch.mjs';

const $ = id => document.getElementById(id);
const h = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids.flat()) if (k != null && k !== false) n.append(k); return n; };
const money = c => c == null ? '—' : '$' + (c / 100).toFixed(2);
const prodName = id => PRODUCTION_STATUSES.find(s => s.id === id)?.name || '—';
const nameOf = Object.fromEntries(ARTWORK_POOL.map(a => [a.id, a.name]));
let token = sessionStorage.getItem('btr-studio-token'), me = null, current = null;

async function api(path, body) {
  const r = await fetch('/api/lab/admin/' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { signOut(); throw new Error('Signed out.'); }
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function signOut() { token = null; sessionStorage.removeItem('btr-studio-token'); $('desk').hidden = true; $('login').hidden = false; $('who').textContent = ''; }
$('logout').onclick = signOut;

$('login').addEventListener('submit', async e => {
  e.preventDefault(); $('login-error').textContent = '';
  try {
    const r = await fetch('/api/lab/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('login-email').value, password: $('login-password').value }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || (r.status === 404 ? 'The order service is not running here.' : 'Sign-in failed.'));
    token = data.token; sessionStorage.setItem('btr-studio-token', token); $('login-password').value = ''; start();
  } catch (err) { $('login-error').textContent = err.message; }
});

// ---------- tabs ----------
document.querySelectorAll('.admin-tabs [role=tab]').forEach(b => b.onclick = () => {
  document.querySelectorAll('.admin-tabs [role=tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll('.tab-panel').forEach(p => p.hidden = p.dataset.panel !== b.dataset.tab);
  ({ orders: loadOrders, stock: loadStock, archive: loadArchive, waitlist: loadWaitlist, settings: loadSettings, staff: loadStaff })[b.dataset.tab]?.();
});

// ---------- orders ----------
$('f-payment').append(...PAYMENT_STATUSES.map(s => h('option', { value: s, textContent: s.replace('_', ' ') })));
$('f-production').append(...PRODUCTION_STATUSES.map(s => h('option', { value: s.id, textContent: s.name })));
['f-payment', 'f-production'].forEach(id => $(id).onchange = loadOrders);
$('f-refresh').onclick = loadOrders; let qTimer; $('f-q').oninput = () => { clearTimeout(qTimer); qTimer = setTimeout(loadOrders, 250); };
async function loadOrders() {
  const q = new URLSearchParams(Object.entries({ payment: $('f-payment').value, production: $('f-production').value, q: $('f-q').value }).filter(([, v]) => v));
  try {
    const list = await api('orders?' + q);
    $('orders').replaceChildren(...(list.length ? list.map(o => {
      const tr = h('tr', { tabIndex: 0, className: current === o.id ? 'on' : '' },
        h('td', {}, h('strong', { textContent: o.id }), o.mode === 'test' ? h('span', { className: 'pill test', textContent: 'test' }) : null),
        h('td', { textContent: new Date(o.createdAt).toLocaleString() }), h('td', { textContent: o.items.join(', ') }),
        h('td', {}, h('span', { className: 'pill pay-' + o.payment, textContent: o.payment })), h('td', { textContent: prodName(o.production) }), h('td', { textContent: money(o.subtotalCents) }));
      tr.onclick = () => openOrder(o.id); tr.onkeydown = e => { if (e.key === 'Enter') openOrder(o.id); };
      return tr;
    }) : [h('tr', {}, h('td', { colSpan: 6, className: 'fine', textContent: 'No orders match.' }))]));
  } catch (e) { $('orders').replaceChildren(h('tr', {}, h('td', { colSpan: 6, textContent: e.message }))); }
}
async function openOrder(id) {
  current = id; const o = await api('orders/' + encodeURIComponent(id));
  document.querySelectorAll('#orders tr').forEach(tr => tr.classList.toggle('on', tr.querySelector('strong')?.textContent === id));
  const d = $('detail'), paid = o.payment.status === 'paid', owner = me.role === 'owner';
  const act = async (path, body, msg) => { try { await api(`orders/${encodeURIComponent(id)}/${path}`, body); await openOrder(id); loadOrders(); flash(msg); } catch (e) { flash(e.message, true); } };
  const flash = (t, bad) => { const p = d.querySelector('.detail-status'); if (p) { p.textContent = t; p.classList.toggle('bad', !!bad); } };
  const statusSel = h('select', { id: 'd-status' }, ...PRODUCTION_STATUSES.map(s => h('option', { value: s.id, textContent: s.name, selected: s.id === o.production.status })));
  const note = h('textarea', { rows: 2, maxLength: 1000, placeholder: 'Internal note (staff only)' });
  const assignee = h('input', { value: o.assignee || '', maxLength: 80, placeholder: 'Who is making it?' });
  const carrier = h('input', { placeholder: 'Carrier', maxLength: 40, value: o.shipment?.carrier || '' }), tracking = h('input', { placeholder: 'Tracking number', maxLength: 80, value: o.shipment?.tracking || '' });
  const upload = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  const refundAmt = h('input', { type: 'number', min: 1, step: '0.01', placeholder: 'Amount (blank = full)' });
  d.replaceChildren(...[
    h('header', { className: 'detail-head' }, h('h2', { textContent: o.id }), h('span', { className: 'pill pay-' + o.payment.status, textContent: o.payment.status }), o.mode === 'test' ? h('span', { className: 'pill test', textContent: 'test order' }) : null),
    o.payment.reviewReason ? h('p', { className: 'lab-error', textContent: o.payment.reviewReason }) : null,
    h('p', { className: 'detail-status', role: 'status' }),
    h('section', {}, h('h3', { textContent: 'Pieces' }), ...o.items.map((it, i) => {
      const art = h('div', { className: 'cart-art' }); art.innerHTML = itemSketch(it, it.describe, 'adm' + i);
      const refs = it.art?.references?.length ? h('div', { className: 'altar-refs' }, ...it.art.references.map(r => h('figure', {}, h('img', { src: artworkThumb(r), alt: nameOf[r] || r }), h('figcaption', { textContent: nameOf[r] || r })))) : null;
      let relic = null;
      if (it.product === 'relic-box') {
        const ta = h('textarea', { rows: 3, placeholder: 'One item per line', value: (o.relic?.[i] || []).join('\n') });
        relic = h('div', { className: 'relic-assign' }, h('label', {}, 'Box contents (assigned items)', ta), h('button', { className: 'ghost', type: 'button', textContent: 'Save contents', onclick: () => act('relic', { index: i, contents: ta.value.split('\n') }, 'Box contents saved.') }));
      }
      return h('div', { className: 'detail-item' }, art, h('div', {}, h('strong', { textContent: `${it.describe.title}${it.quantity > 1 ? ' × ' + it.quantity : ''} — ${money(it.totalCents)}` }), h('ul', { className: 'cart-spec' }, ...it.describe.spec.map(s => h('li', { textContent: s })), it.units > 1 ? h('li', { textContent: `Fulfil ${it.units} pieces` }) : null), refs, relic));
    })),
    o.customerNote ? h('section', {}, h('h3', { textContent: 'Customer note' }), h('p', { textContent: o.customerNote })) : null,
    h('section', {}, h('h3', { textContent: 'Customer & payment' }),
      h('dl', { className: 'kv' }, ...[['Name', o.customer?.name], ['Email', o.customer?.email], ['Ship to', o.customer?.shipping ? [o.customer.shipping.name, ...Object.values(o.customer.shipping.address || {}).filter(Boolean)].join(', ') : null],
        ['Subtotal', money(o.subtotalCents)], ['Shipping', money(o.payment.amountShipping)], ['Tax', money(o.payment.amountTax)], ['Total paid', money(o.payment.amountTotal)], ['Refunded', o.payment.amountRefunded ? money(o.payment.amountRefunded) : null]]
        .filter(([, v]) => v).flatMap(([k, v]) => [h('dt', { textContent: k }), h('dd', { textContent: v })]))),
    h('section', {}, h('h3', { textContent: 'Production' }),
      h('div', { className: 'row' }, statusSel, h('button', { className: 'solid', type: 'button', textContent: 'Update status', disabled: !paid, onclick: () => act('production', { status: statusSel.value }, 'Status updated.') })),
      !paid ? h('p', { className: 'fine', textContent: 'Production opens once payment is confirmed.' }) : null,
      h('ol', { className: 'history' }, ...o.production.history.map(x => h('li', { textContent: `${prodName(x.status)} — ${new Date(x.at).toLocaleString()} (${x.by})` }))),
      h('div', { className: 'row' }, assignee, h('button', { className: 'ghost', type: 'button', textContent: 'Assign', onclick: () => act('assign', { assignee: assignee.value }, 'Assigned.') }))),
    h('section', {}, h('h3', { textContent: 'Progress images' }), h('div', { className: 'progress-imgs', id: 'progress-imgs' }),
      h('div', { className: 'row' }, upload, h('button', { className: 'ghost', type: 'button', textContent: 'Upload', onclick: async () => { const f = upload.files[0]; if (!f) return; try { await api('uploads', { dataUrl: await shrink(f), purpose: 'progress', orderId: id }); await openOrder(id); flash('Image added.'); } catch (e) { flash(e.message, true); } } }))),
    h('section', {}, h('h3', { textContent: 'Internal notes' }), h('ol', { className: 'history' }, ...o.internalNotes.map(n => h('li', { textContent: `${n.text} — ${n.by}, ${new Date(n.at).toLocaleString()}` }))),
      h('div', { className: 'row' }, note, h('button', { className: 'ghost', type: 'button', textContent: 'Add note', onclick: () => act('note', { text: note.value }, 'Note added.') }))),
    h('section', {}, h('h3', { textContent: 'Shipping' }), o.shipment ? h('p', { textContent: `Shipped ${new Date(o.shipment.shippedAt).toLocaleDateString()} — ${o.shipment.carrier} ${o.shipment.tracking}` }) : null,
      h('div', { className: 'row' }, carrier, tracking, h('button', { className: 'ghost', type: 'button', textContent: 'Record shipment', disabled: !paid, onclick: () => act('shipment', { carrier: carrier.value, tracking: tracking.value }, 'Shipment recorded.') }))),
    owner ? h('section', { className: 'danger' }, h('h3', { textContent: 'Refunds & cancellation' }),
      h('div', { className: 'row' }, refundAmt, h('button', { className: 'ghost', type: 'button', textContent: 'Refund', disabled: !['paid', 'partially_refunded', 'review'].includes(o.payment.status), onclick: () => { const v = refundAmt.value ? Math.round(Number(refundAmt.value) * 100) : undefined; if (confirm(`Refund ${v ? money(v) : 'the full amount'} on ${id}?`)) act('refund', { amountCents: v }, 'Refund requested.'); } }),
        h('button', { className: 'ghost', type: 'button', textContent: 'Cancel unpaid order', disabled: o.payment.status !== 'pending', onclick: () => { if (confirm('Cancel this unpaid order and release its hold?')) act('cancel', {}, 'Canceled.'); } }))) : null
  ].filter(Boolean));
  for (const imgId of o.progressImages) {
    const r = await fetch('/api/lab/uploads/' + imgId, { headers: { Authorization: 'Bearer ' + token } });
    if (r.ok) $('progress-imgs').append(h('img', { src: URL.createObjectURL(await r.blob()), alt: 'Progress image' }));
  }
}
async function shrink(file, max = 1600) {
  const img = await createImageBitmap(file), k = Math.min(1, max / Math.max(img.width, img.height));
  const c = h('canvas', { width: Math.round(img.width * k), height: Math.round(img.height * k) }); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', .82);
}

// ---------- stock & capacity ----------
async function loadStock() {
  const s = await api('stock'), owner = me.role === 'owner';
  $('skus').replaceChildren(...s.skus.map(x => { const inp = h('input', { type: 'number', min: 0, value: x.onHand, disabled: !owner, ariaLabel: 'On hand for ' + x.label });
    return h('tr', {}, h('td', { textContent: x.label }), h('td', {}, inp), h('td', { textContent: x.reserved }), h('td', {}, owner ? h('button', { className: 'ghost', type: 'button', textContent: 'Save', onclick: async e => { try { await api('stock', { sku: x.sku, onHand: Number(inp.value) }); e.target.textContent = 'Saved'; } catch (err) { alert(err.message); } } }) : null)); }));
  $('slots').replaceChildren(...s.slots.map(x => {
    const lim = h('input', { type: 'number', min: 0, value: x.limit ?? '', placeholder: 'closed', disabled: !owner }), lead = h('input', { type: 'number', min: 0, value: x.leadTimeDays ?? '', placeholder: 'not set', disabled: !owner }), open = h('input', { type: 'checkbox', checked: x.open !== false, disabled: !owner });
    return h('tr', {}, h('td', { textContent: x.label }), h('td', {}, lim), h('td', { textContent: x.used }), h('td', { textContent: x.reserved }), h('td', {}, lead), h('td', {}, open),
      h('td', {}, owner ? h('button', { className: 'ghost', type: 'button', textContent: 'Save', onclick: async e => { try { await api('capacity', { slot: x.slot, limit: lim.value === '' ? null : Number(lim.value), leadTimeDays: lead.value === '' ? null : Number(lead.value), open: open.checked }); e.target.textContent = 'Saved'; } catch (err) { alert(err.message); } } }) : null));
  }));
}

// ---------- archive ----------
let photos = [];
const fields = ['title', 'garmentType', 'construction', 'materials', 'technique', 'createdOn', 'edition', 'orderId', 'description'];
function editEntry(e = {}) { $('a-id').value = e.id || ''; for (const f of fields) $('a-' + f).value = e[f] || ''; photos = [...(e.photos || [])]; renderPhotos(); $('a-error').textContent = ''; }
function renderPhotos() { $('a-photo-list').replaceChildren(...photos.map(p => h('span', { className: 'pill', textContent: p }))); }
$('a-new').onclick = () => editEntry();
$('a-photos').onchange = async () => { for (const f of $('a-photos').files) { try { photos.push((await api('uploads', { dataUrl: await shrink(f), purpose: 'archive' })).id); } catch (e) { $('a-error').textContent = e.message; } } $('a-photos').value = ''; renderPhotos(); };
$('archive-form').addEventListener('submit', async e => {
  e.preventDefault();
  const body = { id: $('a-id').value || undefined, status: e.submitter?.dataset.status || 'draft', photos, ...Object.fromEntries(fields.map(f => [f, $('a-' + f).value])) };
  try { const saved = await api('archive', body); editEntry(saved); loadArchive(); } catch (err) { $('a-error').textContent = err.message; }
});
async function loadArchive() {
  const list = await api('archive');
  $('archive').replaceChildren(...(list.length ? list.map(e => h('tr', {}, h('td', { textContent: e.id }), h('td', { textContent: e.title || '—' }), h('td', {}, h('span', { className: 'pill', textContent: e.status })),
    h('td', {}, h('button', { className: 'link', type: 'button', textContent: 'Edit', onclick: () => editEntry(e) }), ' ', e.status === 'published' ? h('a', { className: 'link', href: '/passport?id=' + e.id, target: '_blank', textContent: 'Passport ↗' }) : null))) : [h('tr', {}, h('td', { colSpan: 4, className: 'fine', textContent: 'No entries yet.' }))]));
}

// ---------- waitlist, settings, staff ----------
async function loadWaitlist() { const list = await api('waitlist'); $('waitlist').replaceChildren(...(list.length ? list.map(w => h('tr', {}, h('td', { textContent: w.slot }), h('td', { textContent: w.email }), h('td', { textContent: new Date(w.at).toLocaleDateString() }))) : [h('tr', {}, h('td', { colSpan: 3, className: 'fine', textContent: 'Nobody waiting.' }))])); }
async function loadSettings() {
  const s = await api('settings'), owner = me.role === 'owner';
  $('s-size').checked = s.launch.sizeChartsVerified; $('s-ship').checked = s.launch.shippingTaxConfigured; $('s-relic').checked = s.launch.relicPoliciesPublished;
  for (const k of ['contents', 'condition', 'sizing', 'fulfillment']) $('s-' + k).value = s.relicPolicies[k] || '';
  $('s-notice').value = s.notice || '';
  $('settings-form').querySelectorAll('input,textarea,button').forEach(x => x.disabled = !owner);
}
$('settings-form').addEventListener('submit', async e => {
  e.preventDefault();
  try { await api('settings', { launch: { sizeChartsVerified: $('s-size').checked, shippingTaxConfigured: $('s-ship').checked, relicPoliciesPublished: $('s-relic').checked },
    relicPolicies: Object.fromEntries(['contents', 'condition', 'sizing', 'fulfillment'].map(k => [k, $('s-' + k).value])), notice: $('s-notice').value }); $('s-status').textContent = 'Saved.'; }
  catch (err) { $('s-status').textContent = err.message; }
});
async function loadStaff() {
  const list = await api('staff');
  $('staff').replaceChildren(...list.map(s => h('tr', {}, h('td', { textContent: s.email }), h('td', { textContent: s.role }), h('td', { textContent: s.active ? 'yes' : 'no' }),
    h('td', {}, s.email === me.email ? null : h('button', { className: 'link', type: 'button', textContent: s.active ? 'Disable' : 'Enable', onclick: async () => { await api('staff/active', { email: s.email, active: !s.active }); loadStaff(); } })))));
}
$('staff-form').addEventListener('submit', async e => {
  e.preventDefault();
  try { await api('staff', { email: $('st-email').value, password: $('st-password').value, role: $('st-role').value }); $('st-password').value = ''; $('st-error').textContent = 'Added.'; loadStaff(); }
  catch (err) { $('st-error').textContent = err.message; }
});

async function start() {
  if (!token) { signOut(); return; }
  try { me = await api('me'); } catch { return; }
  $('login').hidden = true; $('desk').hidden = false;
  $('who').textContent = `Signed in as ${me.email} (${me.role})`;
  document.querySelectorAll('[data-owner]').forEach(x => x.hidden = me.role !== 'owner');
  loadOrders();
}
start();
