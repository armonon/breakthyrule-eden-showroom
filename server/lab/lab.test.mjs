// node --test server/lab/
// Garment Lab: pricing, random engine, cart, checkout (Stripe mocked at the HTTP boundary), webhooks,
// inventory and capacity under concurrency, production, staff authorization, order isolation, archive, QR.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeItem, priceItem, priceCart, describeItem } from '../../labkit/pricing.mjs';
import { drawArt, drawChaos } from '../../labkit/random.mjs';
import { createCart } from '../../labkit/cart.mjs';
import { encodeQR, qrSVG } from '../../labkit/qr.mjs';
import { OFFERINGS } from '../../labkit/catalog.mjs';
import { ARTWORK_POOL } from '../../labkit/artwork-pool.mjs';
import { MemoryStore, FileStore } from './store.mjs';
import { createLab } from './service.mjs';
import { createHandler } from './api.mjs';
import { createStripe, signStripePayload, verifyStripeSignature, formEncode } from './stripe.mjs';
import { hashPassword } from './auth.mjs';

const POOL = ARTWORK_POOL.map(a => a.id);
const garment = (over = {}) => ({ product: 'garment', construction: 'canvas', garment: 'tee', size: 'M', color: 'black', artwork: 'artists-choice', ...over });
const price = cfg => { const n = normalizeItem(cfg, { artworkPool: POOL }); assert.ok(n.ok, JSON.stringify(n.errors)); return priceItem(n.item); };
const SECRET = 'x'.repeat(40);

// ---------------- Pricing ----------------
test('every Canvas price is exact', () => {
  const want = { tee: 6000, hoodie: 8000, sweatpants: 8000, crewneck: 8000, shorts: 8000 };
  assert.deepEqual(Object.keys(OFFERINGS.canvas).sort(), Object.keys(want).sort());
  for (const [g, cents] of Object.entries(want)) assert.equal(price(garment({ garment: g })).unitCents, cents, g);
});
test('every Cut & Sew price is exact', () => {
  const want = { tee: 8000, hoodie: 18000, sweatpants: 18000, crewneck: 15000, longsleeve: 12000, shorts: 15000 };
  assert.deepEqual(Object.keys(OFFERINGS['cut-sew']).sort(), Object.keys(want).sort());
  for (const [g, cents] of Object.entries(want)) assert.equal(price(garment({ construction: 'cut-sew', garment: g, fit: 'regular' })).unitCents, cents, g);
});
test('custom color adds exactly $40; black, white and random are free', () => {
  assert.equal(price(garment({ color: 'custom', customColor: 'Oxblood' })).unitCents, 6000 + 4000);
  assert.equal(price(garment({ construction: 'cut-sew', garment: 'hoodie', fit: 'oversized', color: 'custom', customColor: 'Moss green' })).unitCents, 18000 + 4000);
  for (const color of ['black', 'white', 'random']) assert.equal(price(garment({ color })).unitCents, 6000, color);
});
test('every artwork direction is free, including random', () => {
  for (const artwork of ['artists-choice', 'minimal', 'expressive']) assert.equal(price(garment({ artwork })).unitCents, 6000);
  assert.equal(price(garment({ artwork: 'random-experimental', seed: 12345 })).unitCents, 6000);
  for (const seed of [999, 31337, 4242]) { // chaos may change the garment, but never adds a fee on top of it
    const n = normalizeItem(garment({ chaos: true, seed }), { artworkPool: POOL });
    assert.equal(priceItem(n.item).unitCents, OFFERINGS.canvas[n.item.garment].priceCents);
  }
});
test('The Relic Box is $120 and The Trinity is one $60 bundle of three', () => {
  assert.equal(price({ product: 'relic-box', size: 'L', fit: 'relaxed' }).unitCents, 12000);
  const t = price({ product: 'trinity', size: 'S', variant: 'surprise' });
  assert.equal(t.unitCents, 6000); assert.equal(t.lines.length, 1);
  assert.equal(price({ product: 'trinity', size: 'S', variant: 'curated', quantity: 2 }).totalCents, 12000);
});
test('browser-sent prices are ignored', () => {
  const r = priceCart([{ ...garment(), priceCents: 1, unitCents: 1, totalCents: 1 }], { artworkPool: POOL });
  assert.equal(r.subtotalCents, 6000);
});
test('invalid selections are rejected', () => {
  const bad = c => assert.equal(normalizeItem(c, { artworkPool: POOL }).ok, false, JSON.stringify(c));
  bad(garment({ garment: 'longsleeve' })); // not offered as Canvas
  bad(garment({ size: 'XXXXL' }));
  bad(garment({ color: 'custom' }));       // custom needs a name
  bad(garment({ color: 'gold' }));
  bad(garment({ artwork: 'random-experimental' })); // needs a seed
  bad(garment({ construction: 'cut-sew', fit: 'regular', quantity: 2 })); // one of one
  bad(garment({ quantity: 99 }));
  bad({ product: 'relic-box', size: 'M', fit: 'regular', exclusions: ['tops', 'bottoms', 'tees', 'accessories', 'outerwear'] });
  bad({ product: 'trinity', size: 'M', variant: 'gold' });
  bad({ product: 'gift-card' });
});

test('print placement is optional, clamped, free, and written into the spec for the studio', () => {
  const plain = normalizeItem(garment(), { artworkPool: POOL }).item;
  assert.deepEqual(plain.print, { x: 0, y: 0, scale: 1 });
  const moved = normalizeItem(garment({ print: { x: .12, y: -2, scale: 99 }, unitCents: 1 }), { artworkPool: POOL }).item;
  assert.deepEqual(moved.print, { x: .12, y: -.25, scale: 1.6 });
  assert.equal(priceItem(moved).unitCents, 6000);
  assert.match(describeItem(moved).spec.join(' | '), /Print: 160% size, 25% lower, 12% to the wearer's left/);
  assert.ok(!describeItem(plain).spec.some(s => s.startsWith('Print:')));
  assert.deepEqual(normalizeItem(garment({ print: 'junk' }), { artworkPool: POOL }).item.print, { x: 0, y: 0, scale: 1 });
});
test('cut & sew is always described as 100% cotton', () => {
  const cs = normalizeItem(garment({ construction: 'cut-sew', garment: 'hoodie', fit: 'regular' }), { artworkPool: POOL }).item;
  assert.ok(describeItem(cs).spec.includes('Material: 100% cotton'));
  assert.ok(!describeItem(normalizeItem(garment(), { artworkPool: POOL }).item).spec.some(s => s.startsWith('Material:')));
});

// ---------------- Random engine ----------------
test('random art is reproducible from its seed and only references curated artwork', () => {
  const a = drawArt(424242, POOL), b = drawArt(424242, POOL);
  assert.deepEqual(a, b);
  assert.notDeepEqual(drawArt(424243, POOL), a);
  for (const ref of a.references) assert.ok(POOL.includes(ref));
});
test('total chaos keeps construction and size, never picks a paid custom color', () => {
  for (let seed = 1; seed < 400; seed += 7) {
    const c = drawChaos(seed, { construction: 'cut-sew' }, POOL);
    assert.ok(OFFERINGS['cut-sew'][c.garment]); assert.ok(['black', 'white', 'random'].includes(c.color));
    const n = normalizeItem(garment({ construction: 'cut-sew', chaos: true, seed, size: 'XL', garment: 'tee', color: 'custom', customColor: 'x' }), { artworkPool: POOL });
    assert.ok(n.ok); assert.equal(n.item.size, 'XL'); assert.equal(n.item.construction, 'cut-sew'); assert.notEqual(n.item.color, 'custom');
  }
});
test('the server re-derives random art from the seed, ignoring client-sent art', () => {
  const n = normalizeItem(garment({ artwork: 'random-experimental', seed: 77, art: { category: 'Forged' } }), { artworkPool: POOL });
  assert.deepEqual(n.item.art, drawArt(77, POOL));
});

// ---------------- Cart ----------------
function memStorage() { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; }
test('cart: add, edit, quantity, remove, persist, totals', () => {
  const st = memStorage(), cart = createCart(st, { artworkPool: POOL });
  const a = cart.add(garment()); assert.ok(a.ok);
  const b = cart.add({ product: 'trinity', size: 'M', variant: 'curated' }); assert.ok(b.ok);
  assert.equal(cart.view().subtotalCents, 12000);
  assert.ok(cart.setQuantity(b.id, 3).ok); assert.equal(cart.view().subtotalCents, 6000 + 18000);
  assert.ok(cart.replace(a.id, garment({ color: 'custom', customColor: 'Rust' })).ok);
  assert.equal(cart.view().lines[0].unitCents, 10000);
  const again = createCart(st, { artworkPool: POOL }); // persisted
  assert.equal(again.view().subtotalCents, 10000 + 18000);
  again.remove(b.id); assert.equal(again.view().count, 1);
  assert.equal(cart.add(garment({ size: 'nope' })).ok, false);
  assert.ok(!st.m.get('btr-lab-cart-v1').includes('Cents'), 'no prices are stored');
});

// ---------------- Checkout harness ----------------
function fakeStripe() {
  const calls = [];
  return {
    calls, mode: 'test',
    async createCheckoutSession(params, idem) { calls.push({ params, idem }); return { id: 'cs_test_' + calls.length, url: 'https://checkout.stripe.com/c/pay/cs_test_' + calls.length }; },
    async expireCheckoutSession() { return {}; },
    async createRefund(params) { calls.push({ refund: params }); return { id: 're_1' }; }
  };
}
async function setup({ store = new MemoryStore(), stripe = fakeStripe(), env = {} } = {}) {
  const lab = createLab({ store, env: { LAB_SESSION_SECRET: SECRET, ...env }, stripe, artworkPool: POOL });
  await store.set('staff/owner@btr.test', { email: 'owner@btr.test', role: 'owner', passwordHash: hashPassword('correct horse battery'), active: true });
  await store.set('staff/artist@btr.test', { email: 'artist@btr.test', role: 'artist', passwordHash: hashPassword('paint it all black'), active: true });
  const owner = await lab.staffFromToken((await lab.login('owner@btr.test', 'correct horse battery')).token);
  const artist = await lab.staffFromToken((await lab.login('artist@btr.test', 'paint it all black')).token);
  for (const s of ['M', 'L']) { await lab.setStock(owner, `trinity:curated:${s}`, 3); await lab.setStock(owner, `relic-box:${s}`, 2); }
  await lab.setSlot(owner, 'cut-sew:hoodie', { limit: 2, leadTimeDays: 21 });
  await lab.setSlot(owner, 'canvas:tee', { limit: 50 });
  return { lab, store, stripe, owner, artist };
}
const key = () => 'k' + Math.random().toString(36).slice(2) + Date.now().toString(36) + 'xxxxxxxx';
const paidEvent = (o, session, over = {}) => ({ id: 'evt_' + Math.random().toString(36).slice(2), type: 'checkout.session.completed',
  data: { object: { id: session, client_reference_id: o.id, metadata: { order_id: o.id }, payment_status: 'paid', currency: 'usd', amount_subtotal: o.subtotalCents, amount_total: o.subtotalCents + 800, total_details: { amount_tax: 300, amount_shipping: 500 }, payment_intent: 'pi_1', customer_details: { email: 'buyer@example.test', name: 'Buyer' }, ...over } } });

test('checkout: server prices go to Stripe; payment confirms the order and commits stock', async () => {
  const { lab, stripe, owner } = await setup();
  const r = await lab.checkout({ items: [{ ...garment(), unitCents: 1 }, { product: 'trinity', size: 'M', variant: 'curated', priceCents: 1 }], idempotencyKey: key(), origin: 'https://x.test' });
  const p = stripe.calls[0].params;
  assert.deepEqual(p.line_items.map(l => l.price_data.unit_amount), [6000, 6000]);
  assert.equal(p.metadata.order_id, r.orderId);
  let o = await lab.getOrder(owner, r.orderId);
  assert.equal(o.payment.status, 'pending'); assert.equal(o.subtotalCents, 12000);
  assert.equal((await lab.stock(owner)).skus.find(s => s.sku === 'trinity:curated:M').reserved, 1);
  await lab.handleEvent(paidEvent(o, o.payment.sessionId));
  o = await lab.getOrder(owner, r.orderId);
  assert.equal(o.payment.status, 'paid'); assert.equal(o.production.status, 'payment_confirmed'); assert.equal(o.customer.email, 'buyer@example.test');
  const sku = (await lab.stock(owner)).skus.find(s => s.sku === 'trinity:curated:M');
  assert.deepEqual([sku.onHand, sku.reserved], [2, 0]);
  const slot = (await lab.stock(owner)).slots.find(s => s.slot === 'canvas:tee');
  assert.deepEqual([slot.used, slot.reserved], [1, 0]);
});
test('duplicate webhook delivery is processed once', async () => {
  const { lab, owner } = await setup();
  const r = await lab.checkout({ items: [{ product: 'relic-box', size: 'L', fit: 'regular' }], idempotencyKey: key() });
  const o = await lab.getOrder(owner, r.orderId);
  const ev = paidEvent(o, o.payment.sessionId);
  await lab.handleEvent(ev); const second = await lab.handleEvent(ev);
  assert.equal(second.duplicate, true);
  await lab.handleEvent({ ...ev, id: ev.id + '-retry' }); // same payment, new event id: still idempotent on order state
  const sku = (await lab.stock(owner)).skus.find(s => s.sku === 'relic-box:L');
  assert.deepEqual([sku.onHand, sku.reserved], [1, 0]);
});
test('failed and expired (canceled) payments release the hold and are never marked paid', async () => {
  const { lab, owner } = await setup();
  for (const type of ['checkout.session.async_payment_failed', 'checkout.session.expired']) {
    const r = await lab.checkout({ items: [{ product: 'relic-box', size: 'M', fit: 'relaxed' }], idempotencyKey: key() });
    const o = await lab.getOrder(owner, r.orderId);
    await lab.handleEvent({ id: 'evt_' + type, type, data: { object: { id: o.payment.sessionId, metadata: { order_id: o.id } } } });
    const after = await lab.getOrder(owner, r.orderId);
    assert.equal(after.payment.status, type.endsWith('failed') ? 'failed' : 'expired');
    assert.equal(after.production.status, null);
  }
  const sku = (await lab.stock(owner)).skus.find(s => s.sku === 'relic-box:M');
  assert.deepEqual([sku.onHand, sku.reserved], [2, 0]);
});
test('an unpaid session completion does not mark the order paid', async () => {
  const { lab, owner } = await setup();
  const r = await lab.checkout({ items: [garment()], idempotencyKey: key() });
  const o = await lab.getOrder(owner, r.orderId);
  await lab.handleEvent(paidEvent(o, o.payment.sessionId, { payment_status: 'unpaid' }));
  assert.equal((await lab.getOrder(owner, r.orderId)).payment.status, 'pending');
});
test('a paid amount that does not match the order is held for review', async () => {
  const { lab, owner } = await setup();
  const r = await lab.checkout({ items: [garment()], idempotencyKey: key() });
  const o = await lab.getOrder(owner, r.orderId);
  await lab.handleEvent(paidEvent(o, o.payment.sessionId, { amount_subtotal: 100 }));
  assert.equal((await lab.getOrder(owner, r.orderId)).payment.status, 'review');
});
test('duplicate checkout submissions return the same session', async () => {
  const { lab, stripe } = await setup();
  const k = key();
  const a = await lab.checkout({ items: [garment()], idempotencyKey: k });
  const b = await lab.checkout({ items: [garment()], idempotencyKey: k });
  assert.equal(a.url, b.url); assert.equal(b.duplicate, true); assert.equal(stripe.calls.length, 1);
});
test('stock cannot oversell under concurrent checkouts (memory and file stores)', async () => {
  for (const store of [new MemoryStore(), new FileStore(fs.mkdtempSync(path.join(os.tmpdir(), 'btr-lab-')))]) {
    const { lab, owner } = await setup({ store });
    const tries = await Promise.allSettled(Array.from({ length: 10 }, () => lab.checkout({ items: [{ product: 'trinity', size: 'L', variant: 'curated' }], idempotencyKey: key() })));
    assert.equal(tries.filter(t => t.status === 'fulfilled').length, 3);
    assert.ok(tries.filter(t => t.status === 'rejected').every(t => t.reason.code === 'out_of_stock'));
    assert.equal((await lab.stock(owner)).skus.find(s => s.sku === 'trinity:L:curated'.replace('L:curated', 'curated:L')).reserved, 3);
  }
});
test('cut & sew capacity limits are enforced', async () => {
  const { lab } = await setup();
  const hoodie = garment({ construction: 'cut-sew', garment: 'hoodie', fit: 'regular' });
  await lab.checkout({ items: [hoodie], idempotencyKey: key() });
  await lab.checkout({ items: [hoodie], idempotencyKey: key() });
  await assert.rejects(lab.checkout({ items: [hoodie], idempotencyKey: key() }), e => e.code === 'at_capacity');
  await assert.rejects(lab.checkout({ items: [garment({ construction: 'cut-sew', garment: 'crewneck', fit: 'regular' })], idempotencyKey: key() }), e => e.code === 'at_capacity', 'unconfigured capacity sells nothing');
  const st = await lab.publicStatus();
  assert.equal(st.slots['cut-sew:hoodie'].available, 0); assert.equal(st.slots['cut-sew:hoodie'].leadTimeDays, 21);
  assert.equal(st.slots['cut-sew:crewneck'].leadTimeDays, null, 'no invented lead times');
});
test('a mixed cart that fails capacity releases its stock hold', async () => {
  const { lab, owner } = await setup();
  await assert.rejects(lab.checkout({ items: [{ product: 'trinity', size: 'M', variant: 'curated' }, garment({ construction: 'cut-sew', garment: 'shorts', fit: 'regular' })], idempotencyKey: key() }));
  assert.equal((await lab.stock(owner)).skus.find(s => s.sku === 'trinity:curated:M').reserved, 0);
});
test('expired holds are swept back into stock', async () => {
  let t = Date.now();
  const store = new MemoryStore();
  const lab = createLab({ store, env: { LAB_SESSION_SECRET: SECRET }, stripe: fakeStripe(), artworkPool: POOL, now: () => t });
  await store.set('inventory', { skus: { 'relic-box:M': { onHand: 1, reserved: 0 } } });
  const r = await lab.checkout({ items: [{ product: 'relic-box', size: 'M', fit: 'regular' }], idempotencyKey: key() });
  t += 40 * 60e3;
  assert.equal(await lab.sweepExpired(), 1);
  assert.equal((await store.get('inventory')).value.skus['relic-box:M'].reserved, 0);
  assert.equal((await store.get('orders/' + r.orderId)).value.payment.status, 'expired');
});
test('checkout is unavailable without a payment provider', async () => {
  const lab = createLab({ store: new MemoryStore(), env: {}, stripe: null, artworkPool: POOL });
  await assert.rejects(lab.checkout({ items: [garment()], idempotencyKey: key() }), e => e.code === 'checkout_unavailable');
  assert.equal((await lab.publicStatus()).checkout.available, false);
});
test('the test gateway only exists when explicitly allowed outside production', async () => {
  const on = createLab({ store: new MemoryStore(), env: { LAB_PAYMENT_PROVIDER: 'test-gateway', LAB_ALLOW_TEST_GATEWAY: 'true' }, artworkPool: POOL });
  assert.equal(on.provider, 'test-gateway');
  const prod = createLab({ store: new MemoryStore(), env: { LAB_PAYMENT_PROVIDER: 'test-gateway', LAB_ALLOW_TEST_GATEWAY: 'true', CONTEXT: 'production' }, artworkPool: POOL });
  assert.equal(prod.provider, null);
  const withStripe = createLab({ store: new MemoryStore(), env: { LAB_PAYMENT_PROVIDER: 'test-gateway', LAB_ALLOW_TEST_GATEWAY: 'true' }, stripe: fakeStripe(), artworkPool: POOL });
  assert.equal(withStripe.provider, 'stripe');
});
test('live mode is gated on published size charts, shipping/tax and Relic policies', async () => {
  const live = { ...fakeStripe(), mode: 'live' };
  const { lab, owner } = await setup({ stripe: live, env: { LAB_ALLOW_LIVE: 'true' } });
  await assert.rejects(lab.checkout({ items: [garment()], idempotencyKey: key() }), e => e.code === 'not_launched');
  await lab.saveSettings(owner, { launch: { sizeChartsVerified: true, shippingTaxConfigured: true } });
  await assert.rejects(lab.checkout({ items: [{ product: 'relic-box', size: 'M', fit: 'regular' }], idempotencyKey: key() }), e => /Relic/.test(e.message));
  await assert.rejects(lab.saveSettings(owner, { launch: { relicPoliciesPublished: true } }), /Fill in all four/);
  assert.ok((await lab.checkout({ items: [garment()], idempotencyKey: key() })).url);
});

// ---------------- Production, staff, isolation ----------------
test('production moves only on paid orders and keeps history; financial status stays separate', async () => {
  const { lab, owner, artist } = await setup();
  const r = await lab.checkout({ items: [garment()], idempotencyKey: key() });
  await assert.rejects(lab.setProduction(artist, r.orderId, 'in_production'), e => e.code === 'not_paid');
  const o = await lab.getOrder(owner, r.orderId);
  await lab.handleEvent(paidEvent(o, o.payment.sessionId));
  for (const s of ['awaiting_production', 'in_production', 'quality_inspection', 'ready_to_ship']) await lab.setProduction(artist, r.orderId, s);
  await lab.recordShipment(artist, r.orderId, { carrier: 'USPS', tracking: '9400' });
  await lab.addNote(artist, r.orderId, 'Leave the hem raw.');
  const after = await lab.getOrder(owner, r.orderId);
  assert.equal(after.production.status, 'shipped'); assert.equal(after.payment.status, 'paid');
  assert.deepEqual(after.production.history.map(h => h.status), ['payment_confirmed', 'awaiting_production', 'in_production', 'quality_inspection', 'ready_to_ship', 'shipped']);
  await assert.rejects(lab.setProduction(artist, r.orderId, 'teleported'), e => e.code === 'bad_request');
});
test('roles: artists cannot refund, change stock or settings; no token, no access', async () => {
  const { lab, owner, artist } = await setup();
  const r = await lab.checkout({ items: [garment()], idempotencyKey: key() });
  const o = await lab.getOrder(owner, r.orderId); await lab.handleEvent(paidEvent(o, o.payment.sessionId));
  await assert.rejects(lab.refund(artist, r.orderId), e => e.status === 403);
  await assert.rejects(lab.setStock(artist, 'relic-box:M', 9), e => e.status === 403);
  await assert.rejects(lab.saveSettings(artist, { notice: 'x' }), e => e.status === 403);
  await assert.rejects(lab.listOrders(null), e => e.status === 401);
  const ref = await lab.refund(owner, r.orderId, { amountCents: 1000 });
  assert.equal(ref.pending, true);
});
test('customers only see their own order, and never internal notes', async () => {
  const { lab, owner } = await setup();
  const a = await lab.checkout({ items: [garment()], idempotencyKey: key() });
  const b = await lab.checkout({ items: [garment({ size: 'L' })], idempotencyKey: key() });
  await lab.addNote(owner, a.orderId, 'internal: customer is a friend');
  const view = await lab.customerOrder(a.orderId, a.key);
  assert.equal(view.id, a.orderId); assert.ok(!JSON.stringify(view).includes('internal:'));
  assert.ok(!('reservation' in view) && !('customer' in view));
  await assert.rejects(lab.customerOrder(a.orderId, b.key), e => e.status === 404);
  await assert.rejects(lab.customerOrder(a.orderId, ''), e => e.status === 404);
});
test('sign-in locks after repeated failures', async () => {
  const { lab } = await setup();
  for (let i = 0; i < 8; i++) await assert.rejects(lab.login('owner@btr.test', 'wrong password!'), e => e.status === 401);
  await assert.rejects(lab.login('owner@btr.test', 'correct horse battery'), e => e.status === 429);
});
test('archive: drafts stay private, published passports hide the order link', async () => {
  const { lab, artist } = await setup();
  const e = await lab.saveArchive(artist, { title: 'Relic I', garmentType: 'Hoodie', construction: 'Cut & Sew', orderId: 'BTR-ABCDEFGH' });
  assert.equal((await lab.listArchive(null)).length, 0);
  await assert.rejects(lab.getArchive(e.id), e2 => e2.status === 404);
  await lab.saveArchive(artist, { id: e.id, status: 'published' });
  const pub = await lab.getArchive(e.id);
  assert.equal(pub.title, 'Relic I'); assert.ok(!('orderId' in pub)); assert.ok(pub.publishedAt);
  assert.ok(qrSVG('https://x.test/passport?id=' + e.id).startsWith('<svg'));
  assert.equal(encodeQR('https://x.test/passport?id=' + e.id).version, 3);
});

// ---------------- HTTP layer ----------------
test('API: webhook signatures are verified; bad or stale signatures are refused', async () => {
  const { lab, owner } = await setup();
  const env = { STRIPE_WEBHOOK_SECRET: 'whsec_test_secret' };
  const handle = createHandler(async () => lab, env);
  const r = await lab.checkout({ items: [garment()], idempotencyKey: key() });
  const o = await lab.getOrder(owner, r.orderId);
  const raw = JSON.stringify(paidEvent(o, o.payment.sessionId));
  const url = new URL('https://x.test/api/lab/stripe-webhook');
  const bad = await handle({ method: 'POST', url, headers: { 'stripe-signature': signStripePayload(raw, 'wrong') }, rawBody: raw });
  assert.equal(bad.status, 400);
  const stale = await handle({ method: 'POST', url, headers: { 'stripe-signature': signStripePayload(raw, env.STRIPE_WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 3600) }, rawBody: raw });
  assert.equal(stale.status, 400);
  const good = await handle({ method: 'POST', url, headers: { 'stripe-signature': signStripePayload(raw, env.STRIPE_WEBHOOK_SECRET) }, rawBody: raw });
  assert.equal(good.status, 200);
  assert.equal((await lab.getOrder(owner, r.orderId)).payment.status, 'paid');
  assert.equal((await handle({ method: 'GET', url: new URL('https://x.test/api/lab/admin/orders'), headers: {} })).status, 401);
  const status = await handle({ method: 'GET', url: new URL('https://x.test/api/lab/status'), headers: {} });
  assert.equal(JSON.parse(status.body).checkout.available, true);
});
test('API: Netlify function paths map onto the same routes', async () => {
  const { lab } = await setup();
  const handle = createHandler(async () => lab, {});
  const res = await handle({ method: 'GET', url: new URL('https://x.test/.netlify/functions/lab/status'), headers: {} });
  assert.equal(res.status, 200);
});
test('Stripe client: form encoding and signature helper agree', async () => {
  assert.equal(formEncode({ a: 1, line_items: [{ price_data: { unit_amount: 6000 } }] }), 'a=1&line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=6000');
  const raw = '{"x":1}';
  assert.ok(verifyStripeSignature(raw, signStripePayload(raw, 'whsec_a'), 'whsec_a'));
  let seen;
  const stripe = createStripe({ secretKey: 'sk_test_123', fetchImpl: async (u, init) => { seen = { u, init }; return { ok: true, json: async () => ({ id: 'cs_1', url: 'https://checkout' }) }; } });
  assert.equal(stripe.mode, 'test');
  await stripe.createCheckoutSession({ mode: 'payment' }, 'idem-1');
  assert.equal(seen.u, 'https://api.stripe.com/v1/checkout/sessions'); assert.equal(seen.init.headers['Idempotency-Key'], 'idem-1');
  assert.equal(createStripe({ secretKey: 'sk_live_x' }).mode, 'live');
  assert.equal(createStripe({ secretKey: '' }), null);
});
