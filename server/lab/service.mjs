// The Garment Lab service: checkout, reservations, payments, production, inventory, capacity,
// archive and staff. Storage-agnostic (see store.mjs); payment through Stripe Checkout (stripe.mjs)
// or, only on non-production local/test setups, the explicit test gateway.
import crypto from 'node:crypto';
import { priceCart, describeItem, unitsFor } from '../../labkit/pricing.mjs';
import { skuFor, slotFor, allSkus, allSlots, PRODUCTION_STATUSES, CURRENCY, CONSTRUCTIONS, OFFERINGS, RELIC_BOX, TRINITY } from '../../labkit/catalog.mjs';
import { hashPassword, verifyPassword, signToken, verifyToken, can, newKey, hashKey, keyMatches } from './auth.mjs';

export class LabError extends Error {
  constructor(status, code, message, extra) { super(message); this.status = status; this.code = code; this.extra = extra; }
}
const RESERVE_MINUTES = 30, SWEEP_GRACE_MS = 5 * 60e3;
const ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const randomId = (prefix, n = 8) => prefix + Array.from(crypto.randomBytes(n), b => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
const PROD_IDS = PRODUCTION_STATUSES.map(s => s.id);

const DEFAULT_SETTINGS = {
  launch: { sizeChartsVerified: false, relicPoliciesPublished: false, shippingTaxConfigured: false },
  relicPolicies: { contents: '', condition: '', sizing: '', fulfillment: '' },
  notice: ''
};

export function createLab({ store, env = {}, stripe = null, artworkPool = [], now = () => Date.now() }) {
  const secret = env.LAB_SESSION_SECRET || '';
  const gatewayAllowed = env.LAB_PAYMENT_PROVIDER === 'test-gateway' && env.LAB_ALLOW_TEST_GATEWAY === 'true' && env.CONTEXT !== 'production' && !stripe;
  const provider = stripe ? 'stripe' : gatewayAllowed ? 'test-gateway' : null;
  const mode = stripe ? stripe.mode : gatewayAllowed ? 'test' : null;

  async function settings() { return { ...DEFAULT_SETTINGS, ...((await store.get('settings'))?.value || {}) }; }
  async function inventory() { return (await store.get('inventory'))?.value || { skus: {} }; }
  async function capacity() { return (await store.get('capacity'))?.value || { slots: {} }; }
  const skuAvail = (inv, sku) => { const s = inv.skus[sku]; return s ? Math.max(0, s.onHand - s.reserved) : 0; };
  const slotAvail = (cap, slot) => { const s = cap.slots[slot]; return s && Number.isInteger(s.limit) && s.open !== false ? Math.max(0, s.limit - s.used - s.reserved) : 0; };

  // ---------- Public status ----------
  async function publicStatus() {
    const [set, inv, cap] = await Promise.all([settings(), inventory(), capacity()]);
    const reasons = [];
    if (!provider) reasons.push('Payments are not configured yet.');
    if (mode === 'live' && env.LAB_ALLOW_LIVE !== 'true') reasons.push('Live checkout has not been switched on.');
    const slots = {}, skus = {};
    for (const { slot } of allSlots()) { const s = cap.slots[slot] || {}; slots[slot] = { available: slotAvail(cap, slot), leadTimeDays: Number.isInteger(s.leadTimeDays) ? s.leadTimeDays : null }; }
    for (const { sku } of allSkus()) skus[sku] = { available: skuAvail(inv, sku) };
    return {
      checkout: { available: !reasons.length, provider, mode, reasons },
      launch: set.launch,
      relicPolicies: set.launch.relicPoliciesPublished ? set.relicPolicies : null,
      notice: set.notice,
      slots, skus
    };
  }

  // ---------- Reservations (concurrency-safe via conditional writes) ----------
  function needsFor(items) {
    const skus = {}, slots = {};
    for (const it of items) {
      const sku = skuFor(it), slot = slotFor(it);
      if (sku) skus[sku] = (skus[sku] || 0) + it.quantity;
      if (slot) slots[slot] = (slots[slot] || 0) + it.quantity;
    }
    return { skus, slots };
  }
  async function reserve(needs) {
    if (Object.keys(needs.skus).length) await store.update('inventory', inv => {
      inv = inv || { skus: {} };
      for (const [sku, q] of Object.entries(needs.skus)) if (skuAvail(inv, sku) < q) throw new LabError(409, 'out_of_stock', 'That is sold out right now.', { sku });
      for (const [sku, q] of Object.entries(needs.skus)) inv.skus[sku].reserved += q;
      return inv;
    });
    try {
      if (Object.keys(needs.slots).length) await store.update('capacity', cap => {
        cap = cap || { slots: {} };
        for (const [slot, q] of Object.entries(needs.slots)) if (slotAvail(cap, slot) < q) throw new LabError(409, 'at_capacity', 'The studio is at capacity for that piece. Join the waitlist.', { slot });
        for (const [slot, q] of Object.entries(needs.slots)) cap.slots[slot].reserved += q;
        return cap;
      });
    } catch (e) { await adjust(needs, 'release', { skusOnly: true }); throw e; }
  }
  async function adjust(needs, op, { skusOnly = false } = {}) {
    if (Object.keys(needs.skus).length) await store.update('inventory', inv => {
      inv = inv || { skus: {} };
      for (const [sku, q] of Object.entries(needs.skus)) {
        const s = inv.skus[sku] || (inv.skus[sku] = { onHand: 0, reserved: 0 });
        s.reserved = Math.max(0, s.reserved - q);
        if (op === 'commit') s.onHand = Math.max(0, s.onHand - q);
      }
      return inv;
    });
    if (!skusOnly && Object.keys(needs.slots).length) await store.update('capacity', cap => {
      cap = cap || { slots: {} };
      for (const [slot, q] of Object.entries(needs.slots)) {
        const s = cap.slots[slot] || (cap.slots[slot] = { limit: null, used: 0, reserved: 0, leadTimeDays: null });
        s.reserved = Math.max(0, s.reserved - q);
        if (op === 'commit') s.used += q;
      }
      return cap;
    });
  }

  // ---------- Checkout ----------
  async function checkout({ items, note = '', idempotencyKey, origin }) {
    const st = await publicStatus();
    if (!st.checkout.available) throw new LabError(503, 'checkout_unavailable', st.checkout.reasons.join(' '));
    if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey)) throw new LabError(400, 'bad_request', 'Missing checkout key.');
    const priced = priceCart(items, { artworkPool });
    if (!priced.ok) throw new LabError(400, 'invalid_cart', priced.errors.join(' '), { errors: priced.errors });
    if (mode === 'live') {
      const set = await settings();
      if (!set.launch.sizeChartsVerified) throw new LabError(409, 'not_launched', 'Size charts are not published yet.');
      if (!set.launch.shippingTaxConfigured) throw new LabError(409, 'not_launched', 'Shipping and tax are not configured yet.');
      if (priced.items.some(i => i.product === 'relic-box') && !set.launch.relicPoliciesPublished) throw new LabError(409, 'not_launched', 'The Relic Box policies are not published yet.');
    }
    // Duplicate submissions with the same key return the same checkout.
    const reqKey = 'checkout-requests/' + idempotencyKey;
    const claimed = await store.set(reqKey, { at: now(), orderId: null }, { ifNew: true });
    if (!claimed) {
      const prior = (await store.get(reqKey))?.value;
      if (prior?.orderId && prior.url) return { orderId: prior.orderId, url: prior.url, duplicate: true };
      throw new LabError(409, 'in_progress', 'This checkout is already being prepared.');
    }
    const needs = needsFor(priced.items);
    try { await reserve(needs); } catch (e) { await store.delete(reqKey); throw e; }
    const id = randomId('BTR-'), key = newKey(), expiresAt = now() + RESERVE_MINUTES * 60e3;
    const order = {
      id, createdAt: new Date(now()).toISOString(), accessKeyHash: hashKey(key), mode, provider,
      items: priced.items.map(it => ({ ...it, describe: describeItem(it), units: unitsFor(it) })),
      subtotalCents: priced.subtotalCents, currency: CURRENCY,
      customerNote: typeof note === 'string' ? note.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 500) : '',
      payment: { status: 'pending', sessionId: null },
      production: { status: null, history: [] },
      reservation: { needs, state: 'held', expiresAt },
      internalNotes: [], assignee: '', progressImages: [], shipment: null, relic: {}, customer: null
    };
    await store.set('orders/' + id, order, { ifNew: true });
    const base = (env.LAB_PUBLIC_URL || origin || '').replace(/\/$/, '');
    const success = `${base}/lab-order?ref=${id}&key=${encodeURIComponent(key)}`;
    let url, sessionId;
    try {
      if (provider === 'stripe') {
        const params = {
          mode: 'payment', client_reference_id: id, success_url: success + '&paid=1', cancel_url: `${base}/lab?canceled=${id}`,
          expires_at: Math.floor(expiresAt / 1000), metadata: { order_id: id }, payment_intent_data: { metadata: { order_id: id } },
          shipping_address_collection: { allowed_countries: (env.LAB_SHIP_COUNTRIES || 'US').split(',').map(s => s.trim()).filter(Boolean) },
          line_items: order.items.map(it => ({
            quantity: it.quantity,
            price_data: { currency: CURRENCY, unit_amount: it.unitCents, product_data: { name: it.describe.title, description: it.describe.spec.join(' · ').slice(0, 500) } }
          }))
        };
        const rates = (env.LAB_STRIPE_SHIPPING_RATES || '').split(',').map(s => s.trim()).filter(Boolean);
        if (rates.length) params.shipping_options = rates.map(r => ({ shipping_rate: r }));
        if (env.LAB_STRIPE_AUTOMATIC_TAX === 'true') params.automatic_tax = { enabled: true };
        const session = await stripe.createCheckoutSession(params, 'checkout-' + idempotencyKey);
        url = session.url; sessionId = session.id;
      } else {
        sessionId = randomId('cs_testgw_', 16);
        url = `${base}/lab-testpay?ref=${id}&key=${encodeURIComponent(key)}`;
      }
    } catch (e) {
      await adjust(needs, 'release');
      await store.update('orders/' + id, o => { o.payment.status = 'failed'; o.payment.error = 'Could not start checkout'; o.reservation.state = 'released'; return o; });
      await store.delete(reqKey);
      throw new LabError(502, 'payment_unavailable', 'The payment page could not be opened. Nothing was charged. Try again.');
    }
    await store.update('orders/' + id, o => { o.payment.sessionId = sessionId; return o; });
    await store.set(reqKey, { at: now(), orderId: id, url });
    return { orderId: id, url, key };
  }

  // ---------- Payment events (verified Stripe events or the local test gateway) ----------
  async function handleEvent(event) {
    if (!event?.id || !event?.type) throw new LabError(400, 'bad_event', 'Malformed event.');
    const first = await store.set('events/' + event.id, { type: event.type, at: now() }, { ifNew: true });
    if (!first) return { duplicate: true };
    const obj = event.data?.object || {};
    const orderId = obj.metadata?.order_id || obj.client_reference_id;
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          if (obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required') return await markPaid(orderId, obj);
          return { ok: true, waiting: 'async_payment' };
        case 'checkout.session.async_payment_succeeded': return await markPaid(orderId, obj);
        case 'checkout.session.async_payment_failed': return await markEnded(orderId, 'failed');
        case 'checkout.session.expired': return await markEnded(orderId, 'expired');
        case 'charge.refunded': return await markRefund(obj);
        default: return { ignored: event.type };
      }
    } catch (e) { await store.delete('events/' + event.id); throw e; } // allow Stripe to retry
  }

  async function markPaid(orderId, session) {
    if (!orderId) throw new LabError(400, 'bad_event', 'Event has no order.');
    let release = null, recommit = false;
    const order = await store.update('orders/' + orderId, o => {
      if (!o) throw new LabError(404, 'not_found', 'Order not found.');
      if (['paid', 'refunded', 'partially_refunded'].includes(o.payment.status)) return undefined;
      if (session.id && o.payment.sessionId && session.id !== o.payment.sessionId) throw new LabError(400, 'bad_event', 'Session does not match order.');
      const amountOk = session.amount_subtotal === o.subtotalCents && (session.currency || CURRENCY) === CURRENCY;
      o.payment = { ...o.payment, status: amountOk ? 'paid' : 'review', paidAt: new Date(now()).toISOString(),
        amountTotal: session.amount_total ?? null, amountTax: session.total_details?.amount_tax ?? null, amountShipping: session.total_details?.amount_shipping ?? session.shipping_cost?.amount_total ?? null,
        paymentIntent: session.payment_intent || null, reviewReason: amountOk ? null : 'Paid amount does not match the order total.' };
      o.customer = { email: session.customer_details?.email || null, name: session.customer_details?.name || null,
        shipping: session.shipping_details || session.collected_information?.shipping_details || null };
      o.production = { status: 'payment_confirmed', history: [{ status: 'payment_confirmed', at: new Date(now()).toISOString(), by: 'payment' }] };
      if (o.reservation.state === 'held') { o.reservation.state = 'committed'; release = o.reservation.needs; }
      else if (o.reservation.state === 'released') { recommit = true; }
      return o;
    });
    if (release) await adjust(release, 'commit');
    if (recommit) {
      try { await reserve(order.reservation.needs); await adjust(order.reservation.needs, 'commit');
        await store.update('orders/' + orderId, o => { o.reservation.state = 'committed'; return o; }); }
      catch { await store.update('orders/' + orderId, o => { o.payment.status = 'review'; o.payment.reviewReason = 'Paid after the hold lapsed and stock or capacity ran out — contact the customer.'; return o; }); }
    }
    return { ok: true, orderId };
  }

  async function markEnded(orderId, status) {
    if (!orderId) return { ignored: true };
    let needs = null;
    await store.update('orders/' + orderId, o => {
      if (!o || o.payment.status !== 'pending') return undefined;
      o.payment.status = status; o.payment.endedAt = new Date(now()).toISOString();
      if (o.reservation.state === 'held') { o.reservation.state = 'released'; needs = o.reservation.needs; }
      return o;
    });
    if (needs) await adjust(needs, 'release');
    return { ok: true };
  }

  async function markRefund(charge) {
    const orderId = charge.metadata?.order_id;
    if (!orderId) return { ignored: true };
    await store.update('orders/' + orderId, o => {
      if (!o) return undefined;
      const refunded = charge.amount_refunded || 0;
      o.payment.amountRefunded = refunded;
      o.payment.status = refunded >= (o.payment.amountTotal ?? charge.amount ?? Infinity) ? 'refunded' : 'partially_refunded';
      return o;
    });
    return { ok: true };
  }

  // Release holds whose checkout window has passed (backstop for a missed expiry webhook).
  async function sweepExpired() {
    let released = 0;
    for (const key of await store.list('orders/')) {
      const o = (await store.get(key))?.value;
      if (o?.payment.status === 'pending' && o.reservation.state === 'held' && o.reservation.expiresAt + SWEEP_GRACE_MS < now()) { await markEnded(o.id, 'expired'); released++; }
    }
    return released;
  }

  // ---------- Customer view ----------
  function customerView(o) {
    return {
      id: o.id, createdAt: o.createdAt, mode: o.mode,
      items: o.items.map(i => ({ title: i.describe.title, spec: i.describe.spec, quantity: i.quantity, unitCents: i.unitCents, totalCents: i.totalCents, lines: i.lines, product: i.product, construction: i.construction, garment: i.garment, picks: i.picks || null, color: i.color, customColor: i.customColor || '', artwork: i.artwork, art: i.art || null, print: i.print || null })),
      subtotalCents: o.subtotalCents, currency: o.currency,
      payment: { status: o.payment.status, amountTotal: o.payment.amountTotal ?? null, amountTax: o.payment.amountTax ?? null, amountShipping: o.payment.amountShipping ?? null },
      production: { status: o.production.status, history: o.production.history.map(h => ({ status: h.status, at: h.at })) },
      shipment: o.shipment ? { carrier: o.shipment.carrier, tracking: o.shipment.tracking, shippedAt: o.shipment.shippedAt } : null,
      customerNote: o.customerNote
    };
  }
  async function customerOrder(id, key) {
    const o = typeof id === 'string' && /^BTR-[A-Z0-9]{8}$/.test(id) ? (await store.get('orders/' + id))?.value : null;
    if (!o || !keyMatches(key, o.accessKeyHash)) throw new LabError(404, 'not_found', 'Order not found.');
    return customerView(o);
  }

  // Local test gateway: only exists on non-production setups that opt in. Uses the same event path.
  async function testGateway(action, { ref, key }) {
    if (provider !== 'test-gateway') throw new LabError(404, 'not_found', 'Not found.');
    const o = (await store.get('orders/' + ref))?.value;
    if (!o || !keyMatches(key, o.accessKeyHash)) throw new LabError(404, 'not_found', 'Order not found.');
    const base = { id: o.payment.sessionId, client_reference_id: o.id, metadata: { order_id: o.id }, currency: CURRENCY, amount_subtotal: o.subtotalCents, amount_total: o.subtotalCents, total_details: { amount_tax: 0, amount_shipping: 0 } };
    const evId = 'evt_testgw_' + crypto.randomBytes(8).toString('hex');
    if (action === 'pay') return handleEvent({ id: evId, type: 'checkout.session.completed', data: { object: { ...base, payment_status: 'paid', payment_intent: 'pi_testgw_' + o.id, customer_details: { email: 'test-buyer@example.test', name: 'Test Buyer' } } } });
    if (action === 'abandon') return handleEvent({ id: evId, type: 'checkout.session.expired', data: { object: { ...base, payment_status: 'unpaid' } } });
    if (action === 'fail') return handleEvent({ id: evId, type: 'checkout.session.async_payment_failed', data: { object: { ...base, payment_status: 'unpaid' } } });
    throw new LabError(400, 'bad_request', 'Unknown action.');
  }

  // ---------- Staff ----------
  async function staffFromToken(token) {
    const p = verifyToken(token, secret, now());
    if (!p) return null;
    const rec = (await store.get('staff/' + p.email))?.value;
    return rec && rec.active !== false && rec.role === p.role ? { email: p.email, role: p.role } : null;
  }
  function need(staff, permission) {
    if (!staff) throw new LabError(401, 'unauthorized', 'Sign in to the studio.');
    if (!can(staff, permission)) throw new LabError(403, 'forbidden', 'Your role cannot do that.');
  }
  async function login(email, password) {
    if (!secret) throw new LabError(503, 'auth_unavailable', 'Studio sign-in is not configured (LAB_SESSION_SECRET).');
    email = String(email || '').trim().toLowerCase();
    const lockKey = 'login-failures/' + hashKey(email);
    const lock = (await store.get(lockKey))?.value;
    if (lock && lock.count >= 8 && now() - lock.at < 15 * 60e3) throw new LabError(429, 'locked', 'Too many attempts. Try again in 15 minutes.');
    let rec = (await store.get('staff/' + email))?.value;
    // First owner can come from the environment (hash made with tools/lab/hash-password.mjs).
    if (!rec && env.LAB_BOOTSTRAP_OWNER) {
      const [bootEmail, bootHash] = env.LAB_BOOTSTRAP_OWNER.split(':');
      if (bootEmail?.toLowerCase() === email) { rec = { email, role: 'owner', passwordHash: bootHash, active: true }; await store.set('staff/' + email, rec, { ifNew: true }); }
    }
    if (!rec || rec.active === false || !verifyPassword(password, rec.passwordHash)) {
      await store.update(lockKey, l => ({ count: (l && now() - l.at < 15 * 60e3 ? l.count : 0) + 1, at: now() }));
      throw new LabError(401, 'unauthorized', 'Wrong email or password.');
    }
    await store.delete(lockKey);
    return { token: signToken({ email, role: rec.role }, secret, now()), role: rec.role, email };
  }
  async function addStaff(staff, { email, password, role }) {
    need(staff, 'staff:write');
    if (!['owner', 'artist'].includes(role)) throw new LabError(400, 'bad_request', 'Role must be owner or artist.');
    email = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new LabError(400, 'bad_request', 'Enter a valid email.');
    let passwordHash; try { passwordHash = hashPassword(password); } catch (e) { throw new LabError(400, 'bad_request', e.message); }
    await store.set('staff/' + email, { email, role, passwordHash, active: true, addedBy: staff.email, at: new Date(now()).toISOString() });
    return { email, role };
  }
  async function listStaff(staff) { need(staff, 'staff:write'); const out = []; for (const k of await store.list('staff/')) { const s = (await store.get(k)).value; out.push({ email: s.email, role: s.role, active: s.active !== false }); } return out; }
  async function setStaffActive(staff, email, active) { need(staff, 'staff:write'); if (email === staff.email) throw new LabError(400, 'bad_request', 'You cannot disable yourself.'); await store.update('staff/' + email, s => { if (!s) throw new LabError(404, 'not_found', 'No such staff.'); s.active = !!active; return s; }); return { ok: true }; }

  // ---------- Orders (staff) ----------
  async function listOrders(staff, { payment, production, q } = {}) {
    need(staff, 'orders:read');
    await sweepExpired();
    const out = [];
    for (const key of await store.list('orders/')) {
      const o = (await store.get(key)).value;
      if (payment && o.payment.status !== payment) continue;
      if (production && o.production.status !== production) continue;
      if (q && !(o.id + ' ' + (o.customer?.email || '') + ' ' + (o.customer?.name || '')).toLowerCase().includes(String(q).toLowerCase())) continue;
      out.push({ id: o.id, createdAt: o.createdAt, mode: o.mode, payment: o.payment.status, production: o.production.status, assignee: o.assignee, subtotalCents: o.subtotalCents, items: o.items.map(i => i.describe.title), customer: o.customer?.name || null });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function getOrder(staff, id) {
    need(staff, 'orders:read');
    const o = (await store.get('orders/' + id))?.value;
    if (!o) throw new LabError(404, 'not_found', 'Order not found.');
    const { accessKeyHash, ...rest } = o; void accessKeyHash;
    return rest;
  }
  async function editOrder(staff, id, fn, permission = 'orders:write') {
    need(staff, permission);
    return store.update('orders/' + id, o => { if (!o) throw new LabError(404, 'not_found', 'Order not found.'); return fn(o) || o; });
  }
  async function setProduction(staff, id, status) {
    if (!PROD_IDS.includes(status)) throw new LabError(400, 'bad_request', 'Unknown production status.');
    return editOrder(staff, id, o => {
      if (o.payment.status !== 'paid') throw new LabError(409, 'not_paid', 'Production can only move on paid orders.');
      o.production.status = status; o.production.history.push({ status, at: new Date(now()).toISOString(), by: staff.email });
    });
  }
  const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  const addNote = (staff, id, text) => editOrder(staff, id, o => { const t = clean(text, 1000); if (!t) throw new LabError(400, 'bad_request', 'Empty note.'); o.internalNotes.push({ at: new Date(now()).toISOString(), by: staff.email, text: t }); });
  const assign = (staff, id, assignee) => editOrder(staff, id, o => { o.assignee = clean(assignee, 80); });
  const recordShipment = (staff, id, { carrier, tracking }) => editOrder(staff, id, o => {
    if (o.payment.status !== 'paid') throw new LabError(409, 'not_paid', 'Only paid orders ship.');
    o.shipment = { carrier: clean(carrier, 40), tracking: clean(tracking, 80), shippedAt: new Date(now()).toISOString(), by: staff.email };
    if (PROD_IDS.indexOf(o.production.status) < PROD_IDS.indexOf('shipped')) { o.production.status = 'shipped'; o.production.history.push({ status: 'shipped', at: o.shipment.shippedAt, by: staff.email }); }
  });
  const assignRelic = (staff, id, index, contents) => editOrder(staff, id, o => {
    const it = o.items[index];
    if (!it || it.product !== 'relic-box') throw new LabError(400, 'bad_request', 'That item is not a Relic Box.');
    o.relic[index] = (Array.isArray(contents) ? contents : []).map(c => clean(c, 120)).filter(Boolean).slice(0, 20);
  });
  async function cancelOrder(staff, id) {
    let needs = null;
    await editOrder(staff, id, o => {
      if (o.payment.status === 'paid') throw new LabError(409, 'paid', 'Paid orders are refunded, not canceled.');
      if (o.payment.status !== 'pending') return;
      o.payment.status = 'canceled';
      if (o.reservation.state === 'held') { o.reservation.state = 'released'; needs = o.reservation.needs; }
    }, 'orders:refund');
    if (needs) await adjust(needs, 'release');
    const o = (await store.get('orders/' + id)).value;
    if (stripe && o.payment.sessionId?.startsWith('cs_')) { try { await stripe.expireCheckoutSession(o.payment.sessionId); } catch { /* already finished */ } }
    return { ok: true };
  }
  async function refund(staff, id, { amountCents } = {}) {
    need(staff, 'orders:refund');
    const o = (await store.get('orders/' + id))?.value;
    if (!o) throw new LabError(404, 'not_found', 'Order not found.');
    if (!['paid', 'partially_refunded', 'review'].includes(o.payment.status) || !o.payment.paymentIntent) throw new LabError(409, 'not_refundable', 'Nothing to refund on this order.');
    const amount = amountCents == null ? undefined : Number(amountCents);
    if (amount !== undefined && (!Number.isInteger(amount) || amount < 1 || amount > (o.payment.amountTotal || o.subtotalCents))) throw new LabError(400, 'bad_request', 'Refund amount is out of range.');
    if (provider === 'stripe') {
      await stripe.createRefund({ payment_intent: o.payment.paymentIntent, amount, metadata: { order_id: id } }, `refund-${id}-${amount ?? 'full'}-${(o.payment.refundRequests || []).length}`);
    }
    await editOrder(staff, id, x => {
      x.payment.refundRequests = [...(x.payment.refundRequests || []), { at: new Date(now()).toISOString(), by: staff.email, amountCents: amount ?? null }];
      if (provider === 'test-gateway') { const total = x.payment.amountTotal || x.subtotalCents; const done = (x.payment.amountRefunded || 0) + (amount ?? total); x.payment.amountRefunded = Math.min(done, total); x.payment.status = done >= total ? 'refunded' : 'partially_refunded'; }
    }, 'orders:refund');
    return { ok: true, pending: provider === 'stripe' };
  }

  // ---------- Inventory, capacity, settings ----------
  async function stock(staff) {
    need(staff, 'orders:read');
    const [inv, cap] = await Promise.all([inventory(), capacity()]);
    return {
      skus: allSkus().map(s => ({ ...s, onHand: inv.skus[s.sku]?.onHand ?? 0, reserved: inv.skus[s.sku]?.reserved ?? 0 })),
      slots: allSlots().map(s => ({ ...s, ...{ limit: null, used: 0, reserved: 0, leadTimeDays: null, open: true }, ...(cap.slots[s.slot] || {}) }))
    };
  }
  async function setStock(staff, sku, onHand) {
    need(staff, 'inventory:write');
    if (!allSkus().some(s => s.sku === sku)) throw new LabError(400, 'bad_request', 'Unknown SKU.');
    if (!Number.isInteger(onHand) || onHand < 0 || onHand > 100000) throw new LabError(400, 'bad_request', 'Stock must be a whole number.');
    return store.update('inventory', inv => { inv = inv || { skus: {} }; const s = inv.skus[sku] || (inv.skus[sku] = { onHand: 0, reserved: 0 });
      if (onHand < s.reserved) throw new LabError(409, 'below_reserved', `${s.reserved} are held in open checkouts.`); s.onHand = onHand; return inv; });
  }
  async function setSlot(staff, slot, { limit, leadTimeDays, open }) {
    need(staff, 'inventory:write');
    if (!allSlots().some(s => s.slot === slot)) throw new LabError(400, 'bad_request', 'Unknown production slot.');
    const okInt = v => v === null || (Number.isInteger(v) && v >= 0 && v <= 10000);
    if (limit !== undefined && !okInt(limit)) throw new LabError(400, 'bad_request', 'Capacity must be a whole number or empty.');
    if (leadTimeDays !== undefined && !okInt(leadTimeDays)) throw new LabError(400, 'bad_request', 'Lead time must be whole days or empty.');
    return store.update('capacity', cap => { cap = cap || { slots: {} }; const s = cap.slots[slot] || (cap.slots[slot] = { limit: null, used: 0, reserved: 0, leadTimeDays: null, open: true });
      if (limit !== undefined) s.limit = limit; if (leadTimeDays !== undefined) s.leadTimeDays = leadTimeDays; if (open !== undefined) s.open = !!open; return cap; });
  }
  async function getSettings(staff) { need(staff, 'orders:read'); return settings(); }
  async function saveSettings(staff, patch) {
    need(staff, 'settings:write');
    return store.update('settings', cur => {
      const s = { ...DEFAULT_SETTINGS, ...(cur || {}) };
      if (patch.launch) for (const k of Object.keys(DEFAULT_SETTINGS.launch)) if (k in patch.launch) s.launch = { ...s.launch, [k]: !!patch.launch[k] };
      if (patch.relicPolicies) for (const k of Object.keys(DEFAULT_SETTINGS.relicPolicies)) if (k in patch.relicPolicies) s.relicPolicies = { ...s.relicPolicies, [k]: clean(patch.relicPolicies[k], 1200) };
      if ('notice' in patch) s.notice = clean(patch.notice, 280);
      if (s.launch.relicPoliciesPublished && Object.values(s.relicPolicies).some(v => !v)) throw new LabError(400, 'bad_request', 'Fill in all four Relic Box policies before publishing them.');
      return s;
    });
  }

  // ---------- Waitlist ----------
  async function joinWaitlist({ email, slot }) {
    email = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) throw new LabError(400, 'bad_request', 'Enter a valid email.');
    if (!allSlots().some(s => s.slot === slot) && !allSkus().some(s => s.sku === slot)) throw new LabError(400, 'bad_request', 'Unknown piece.');
    await store.set('waitlist/' + hashKey(slot + '|' + email), { email, slot, at: new Date(now()).toISOString() });
    return { ok: true };
  }
  async function listWaitlist(staff) { need(staff, 'orders:read'); const out = []; for (const k of await store.list('waitlist/')) out.push((await store.get(k)).value); return out; }

  // ---------- Uploads (progress images, archive photos) ----------
  async function upload(staff, { dataUrl, purpose = 'progress', orderId }) {
    need(staff, purpose === 'archive' ? 'archive:write' : 'orders:write');
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) throw new LabError(400, 'bad_request', 'Upload a JPEG, PNG or WebP image.');
    if (m[2].length * 0.75 > 3 * 1024 * 1024) throw new LabError(413, 'too_large', 'Images must be under 3 MB.');
    const id = randomId('img_', 12);
    await store.set('uploads/' + id, { mime: m[1], data: m[2], by: staff.email, at: new Date(now()).toISOString(), public: false, purpose });
    if (purpose === 'progress' && orderId) await editOrder(staff, orderId, o => { o.progressImages.push(id); });
    return { id };
  }
  async function getUpload(id, staff) {
    const u = /^img_[A-Z0-9]{12}$/.test(id) ? (await store.get('uploads/' + id))?.value : null;
    if (!u || (!u.public && !can(staff, 'orders:read'))) throw new LabError(404, 'not_found', 'Not found.');
    return { mime: u.mime, bytes: Buffer.from(u.data, 'base64') };
  }

  // ---------- The archive of finished one-of-ones (garment passports) ----------
  const ARCHIVE_FIELDS = ['garmentType', 'construction', 'materials', 'technique', 'createdOn', 'edition', 'title', 'description'];
  const publicEntry = e => ({ id: e.id, ...Object.fromEntries(ARCHIVE_FIELDS.map(f => [f, e[f] || ''])), photos: e.photos || [], publishedAt: e.publishedAt || null });
  async function saveArchive(staff, input) {
    need(staff, 'archive:write');
    const id = input.id && /^BTR-P[A-Z0-9]{6}$/.test(input.id) ? input.id : randomId('BTR-P', 6);
    const photos = (Array.isArray(input.photos) ? input.photos : []).filter(p => /^img_[A-Z0-9]{12}$/.test(p)).slice(0, 12);
    const entry = await store.update('archive/' + id, cur => {
      const e = { id, status: 'draft', ...(cur || {}) };
      for (const f of ARCHIVE_FIELDS) if (f in input) e[f] = clean(input[f], f === 'description' ? 2000 : 120);
      e.photos = photos; e.orderId = input.orderId ? clean(input.orderId, 20) : (e.orderId || null); // private link, never public
      if (input.status === 'published' && e.status !== 'published') { e.status = 'published'; e.publishedAt = new Date(now()).toISOString(); }
      if (input.status === 'draft') e.status = 'draft';
      e.updatedBy = staff.email;
      return e;
    });
    for (const p of photos) await store.update('uploads/' + p, u => { if (!u) return undefined; u.public = entry.status === 'published'; return u; });
    return entry;
  }
  async function listArchive(staff) {
    const out = [];
    for (const k of await store.list('archive/')) { const e = (await store.get(k)).value; if (e.status === 'published' || can(staff, 'archive:write')) out.push(staff && can(staff, 'archive:write') ? e : publicEntry(e)); }
    return out.sort((a, b) => String(b.publishedAt || b.id).localeCompare(String(a.publishedAt || a.id)));
  }
  async function getArchive(id) {
    const e = (await store.get('archive/' + id))?.value;
    if (!e || e.status !== 'published') throw new LabError(404, 'not_found', 'No passport with that number.');
    return publicEntry(e);
  }

  return {
    provider, mode, publicStatus, checkout, handleEvent, sweepExpired, customerOrder, testGateway,
    login, staffFromToken, addStaff, listStaff, setStaffActive,
    listOrders, getOrder, setProduction, addNote, assign, recordShipment, assignRelic, cancelOrder, refund,
    stock, setStock, setSlot, getSettings, saveSettings, joinWaitlist, listWaitlist,
    upload, getUpload, saveArchive, listArchive, getArchive,
    _test: { needsFor, reserve, adjust, inventory, capacity }
  };
}

export const CATALOG_SUMMARY = { CONSTRUCTIONS, OFFERINGS, RELIC_BOX, TRINITY };
