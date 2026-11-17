import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createHandler, createLab, MemoryStore, ARTWORK_POOL } from './storefront-api.mjs';
import { createSquare, squareConfiguration, verifySquareSignature } from './square.mjs';

const item = { product: 'garment', construction: 'canvas', labMode: 'blank', garment: 'hoodie', size: 'M', fit: 'blank', color: 'black', artwork: 'artists-choice', quantity: 1, unitCents: 1 };
const owner = { email: 'owner@example.test', role: 'owner' };
const envBase = { LAB_PAYMENT_PROVIDER: 'square', SQUARE_ACCESS_TOKEN: 'test-token-not-a-real-credential', SQUARE_LOCATION_ID: 'LOCATION_TEST', SQUARE_ENVIRONMENT: 'sandbox', SQUARE_SHIPPING_CENTS: '500', SQUARE_TAX_MODE: 'none', SQUARE_WEBHOOK_SIGNATURE_KEY: 'local-webhook-fixture', SQUARE_WEBHOOK_URL: 'https://shop.example.test/api/lab/square-webhook', LAB_PUBLIC_URL: 'https://shop.example.test', CONTEXT: 'deploy-preview' };
const sign = (raw, env) => crypto.createHmac('sha256', env.SQUARE_WEBHOOK_SIGNATURE_KEY).update(env.SQUARE_WEBHOOK_URL + raw).digest('base64');
async function fixture(overrides = {}) {
  const env = { ...envBase, ...overrides }, store = new MemoryStore(), links = new Map(), orders = new Map(), payments = new Map(), refunds = new Map(), calls = [];
  const faults = { loseCreateResponse: false, cancelFails: false, createReject: false }, time = { value: Date.now() };
  await store.set('capacity', { slots: { 'canvas:hoodie': { limit: 10, used: 0, reserved: 0, open: true } } });
  const fakeFetch = async (url, options) => {
    const route = new URL(url).pathname.replace('/v2/', ''), body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, method: options.method, body });
    const ok = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (options.method === 'POST' && route === 'online-checkout/payment-links') {
      if (faults.createReject) return new Response(JSON.stringify({errors:[{code:'INVALID_VALUE'}]}), {status:400});
      if (!links.has(body.idempotency_key)) {
        const n = links.size + 1, id = 'SQ_ORDER_' + n;
        const subtotal = body.order.line_items.reduce((sum, line) => sum + line.base_price_money.amount * Number(line.quantity), 0), shipping = body.checkout_options.shipping_fee?.charge.amount || 0;
        const order = { ...body.order, id, state: 'OPEN', total_money: { amount: subtotal + shipping, currency: 'USD' }, total_discount_money: { amount: 0, currency: 'USD' }, total_tax_money: { amount: 0, currency: 'USD' } };
        orders.set(id, order);
        links.set(body.idempotency_key, { payment_link: { id: 'LINK_' + n, order_id: id, url: 'https://square.link/u/fixture-' + n }, related_resources: { orders: [order] } });
      }
      if (faults.loseCreateResponse) { faults.loseCreateResponse = false; throw new Error('Simulated lost response after Square created the link'); }
      return ok(links.get(body.idempotency_key));
    }
    if (options.method === 'DELETE' && route.startsWith('online-checkout/payment-links/')) {
      if (faults.cancelFails) return new Response('{}', { status: 503 });
      const link = [...links.values()].find(value => route.endsWith(value.payment_link.id));
      if (link) {
        const order = orders.get(link.payment_link.order_id);
        if (![...payments.values()].some(payment => payment.order_id === order.id && payment.status === 'COMPLETED')) order.state = 'CANCELED';
      }
      return ok({});
    }
    if (route.startsWith('orders/')) return ok({ order: orders.get(route.slice(7)) });
    if (route.startsWith('payments/')) return ok({ payment: payments.get(route.slice(9)) });
    if (options.method === 'POST' && route === 'refunds') {
      if (!refunds.has(body.idempotency_key)) refunds.set(body.idempotency_key, { id: 'REFUND_' + (refunds.size + 1), payment_id: body.payment_id, location_id: env.SQUARE_LOCATION_ID, status: 'PENDING', amount_money: body.amount_money });
      return ok({ refund: refunds.get(body.idempotency_key) });
    }
    if (route.startsWith('refunds/')) return ok({ refund: [...refunds.values()].find(refund => refund.id === route.slice(8)) });
    throw new Error('Unexpected mocked Square request: ' + route);
  };
  const square = createSquare({ env, fetchImpl: fakeFetch });
  const lab = createLab({ store, env, square, artworkPool: ARTWORK_POOL.map(a => a.id), now: () => time.value });
  const handler = createHandler(() => lab, env);
  const http = async (path, body, method = 'POST', headers = {}) => {
    const response = await handler({ url: new URL('https://shop.example.test/api/lab/' + path), method, rawBody: body ? JSON.stringify(body) : '', headers });
    return { status: response.status, body: JSON.parse(response.body) };
  };
  const checkout = (key = 'fixture_checkout_key_12345', items = [item]) => http('checkout', { items, idempotencyKey: key });
  const pay = (id = 'PAYMENT_1', changes = {}) => {
    const order = [...orders.values()].at(-1);
    const payment = { id, order_id: order.id, location_id: env.SQUARE_LOCATION_ID, status: 'COMPLETED', total_money: order.total_money, amount_money: order.total_money, buyer_email_address: 'buyer@example.test', shipping_address: { address_line_1: 'Fixture address', country: 'US' }, ...changes };
    payments.set(id, payment); order.tenders = [...(order.tenders || []), {payment_id:id}]; return payment;
  };
  const webhook = async (eventId, paymentId = 'PAYMENT_1', extra = {}) => {
    const event = { event_id: eventId, type: 'payment.updated', data: { object: { payment: { id: paymentId } } }, ...extra };
    const raw = JSON.stringify(event);
    return http('square-webhook', event, 'POST', { 'x-square-hmacsha256-signature': sign(raw, env) });
  };
  return { env, store, lab, square, checkout, http, pay, webhook, links, orders, payments, refunds, calls, faults, time };
}

test('Square runtime checkout uses canonical prices, shipping and a stable idempotency key', async () => {
  const f = await fixture(), first = await f.checkout();
  assert.equal(first.status, 200);
  const body = f.calls.find(c => c.body?.order).body;
  assert.equal(body.order.line_items[0].base_price_money.amount, 7000);
  assert.equal(body.order.line_items[0].quantity, '1');
  assert.equal(body.checkout_options.shipping_fee.charge.amount, 500);
  assert.equal(body.checkout_options.ask_for_shipping_address, true);
  assert.equal(body.checkout_options.enable_coupon, false);
  assert.equal((await f.checkout()).body.duplicate, true);
  assert.equal(f.links.size, 1);
  assert.equal((await f.store.get('capacity')).value.slots['canvas:hoodie'].reserved, 1);
  const changed = await f.checkout('fixture_checkout_key_12345', [{ ...item, quantity: 2 }]);
  assert.equal(changed.status, 409);
  const key = new URL(body.checkout_options.redirect_url).searchParams.get('key');
  assert.equal((await f.lab.customerOrder(first.body.orderId, key)).payment.status, 'pending');
  await assert.rejects(() => f.lab.customerOrder(first.body.orderId, 'wrong'));
});

test('lost Square create response recovers same order, URL and resource hold', async () => {
  const f = await fixture(); f.faults.loseCreateResponse = true;
  assert.equal((await f.checkout()).status, 502);
  assert.equal((await f.checkout()).status, 200);
  assert.equal(f.links.size, 1);
  const creations = f.calls.filter(c => c.body?.order);
  assert.deepEqual(creations[0].body, creations[1].body);
  assert.equal((await f.store.get('capacity')).value.slots['canvas:hoodie'].reserved, 1);
});

test('concurrent Square checkout and events consume capacity once', async () => {
  const f = await fixture();
  const results = await Promise.all([f.checkout(), f.checkout(), f.checkout()]);
  assert(results.every(r => [200,409].includes(r.status)));
  assert.equal(new Set(results.filter(r=>r.status===200).map(r => r.body.orderId)).size, 1); assert.equal(f.links.size, 1);
  f.pay();
  const events = await Promise.all([f.webhook('evt_one'), f.webhook('evt_two'), f.webhook('evt_one')]);
  assert(events.every(r => r.status === 200));
  const slot = (await f.store.get('capacity')).value.slots['canvas:hoodie'];
  assert.equal(slot.used, 1); assert.equal(slot.reserved, 0);
  assert.equal((await f.store.get('orders/' + results.find(r=>r.status===200).body.orderId)).value.production.history.length, 1);
  assert.equal((await f.webhook('evt_one')).body.duplicate, true);
});

test('webhook requires exact URL/body signature; ignores browser-supplied payment details', async () => {
  const f = await fixture(); const result = await f.checkout(); f.pay();
  const event = { event_id: 'evt_signed', type: 'payment.updated', data: { object: { payment: { id: 'PAYMENT_1', total_money: { amount: 1, currency: 'USD' } } } } };
  const raw = JSON.stringify(event), signature = sign(raw, f.env);
  assert(verifySquareSignature(raw, signature, f.env.SQUARE_WEBHOOK_SIGNATURE_KEY, f.env.SQUARE_WEBHOOK_URL));
  assert(!verifySquareSignature(raw + ' ', signature, f.env.SQUARE_WEBHOOK_SIGNATURE_KEY, f.env.SQUARE_WEBHOOK_URL));
  assert(!verifySquareSignature(raw, signature, f.env.SQUARE_WEBHOOK_SIGNATURE_KEY, 'https://different.example.test/hook'));
  assert.equal((await f.http('square-webhook', event)).status, 400);
  assert.equal((await f.http('square-webhook', event, 'POST', { 'x-square-hmacsha256-signature': signature })).status, 200);
  const order = (await f.store.get('orders/' + result.body.orderId)).value;
  assert.equal(order.payment.status, 'paid'); assert.equal(order.payment.amountTotal, 7500);
});

test('pending and foreign payments cannot fulfill; amount mismatch goes to review', async () => {
  const f = await fixture(), result = await f.checkout();
  f.pay('PENDING', { status: 'PENDING' }); await f.webhook('evt_pending', 'PENDING');
  f.pay('FOREIGN', { location_id: 'OTHER_LOCATION' }); await f.webhook('evt_foreign', 'FOREIGN');
  assert.equal((await f.store.get('orders/' + result.body.orderId)).value.payment.status, 'pending');
  f.pay('MISMATCH', { total_money: { amount: 1, currency: 'USD' } });
  assert.equal((await f.webhook('evt_mismatch', 'MISMATCH')).body.review, true);
  const order = (await f.store.get('orders/' + result.body.orderId)).value;
  assert.equal(order.payment.status, 'review'); assert.equal(order.production.status, null);
  assert.equal((await f.store.get('capacity')).value.slots['canvas:hoodie'].used, 0);
});

test('Square holds survive elapsed time and only release after provider cancellation', async () => {
  const f = await fixture(), result = await f.checkout(); f.time.value += 24 * 60 * 60 * 1000;
  f.faults.cancelFails = true;
  await f.lab.listOrders(owner);
  assert.equal((await f.store.get('capacity')).value.slots['canvas:hoodie'].reserved, 1);
  await assert.rejects(() => f.lab.cancelOrder(owner, result.body.orderId));
  assert.equal((await f.store.get('capacity')).value.slots['canvas:hoodie'].reserved, 1);
  f.faults.cancelFails = false;
  assert.equal((await f.lab.cancelOrder(owner, result.body.orderId)).ok, true);
  assert.equal((await f.store.get('capacity')).value.slots['canvas:hoodie'].reserved, 0);
  assert.equal((await f.checkout()).status, 409);
});

test('payment racing cancellation retains the hold until payment confirmation', async () => {
  const f = await fixture(), result = await f.checkout(); f.pay();
  await assert.rejects(() => f.lab.cancelOrder(owner, result.body.orderId), error => error.code === 'payment_processing');
  assert.equal((await f.store.get('capacity')).value.slots['canvas:hoodie'].used, 1);
  await f.webhook('evt_paid_after_cancel');
  assert.equal((await f.store.get('orders/' + result.body.orderId)).value.payment.status, 'paid');
});

test('definitive rejected creation releases its hold and closes the request', async () => {
  const f = await fixture(); f.faults.createReject = true;
  const result = await f.checkout();
  assert.equal(result.status, 502); assert.equal(result.body.code, 'checkout_rejected');
  assert.equal((await f.store.get('capacity')).value.slots['canvas:hoodie'].reserved, 0);
  assert.equal(f.links.size, 0);
  assert.equal((await f.checkout()).body.code, 'checkout_finished');
});

test('admin cancellation recovers an ambiguous creation with its original idempotency key', async () => {
  const f = await fixture(); f.faults.loseCreateResponse = true;
  assert.equal((await f.checkout()).status, 502);
  const key = (await f.store.list('orders/'))[0], order = (await f.store.get(key)).value;
  assert.equal(order.payment.sessionId, null);
  assert.equal((await f.lab.cancelOrder(owner, order.id)).ok, true);
  assert.equal(f.links.size, 1);
  assert.equal((await f.store.get('capacity')).value.slots['canvas:hoodie'].reserved, 0);
  assert.equal((await f.store.get(key)).value.payment.status, 'canceled');
});

test('expiry cancels abandoned links but preserves asynchronous payments', async () => {
  const empty = await fixture(); await empty.checkout(); empty.time.value += 3600000;
  assert.equal(await empty.lab.sweepExpired(), 1);
  assert.equal((await empty.store.get('capacity')).value.slots['canvas:hoodie'].reserved, 0);
  const pending = await fixture(); await pending.checkout(); pending.pay('ACH_PENDING', {status:'PENDING'});
  await pending.webhook('evt_ach', 'ACH_PENDING'); pending.time.value += 3600000;
  assert.equal(await pending.lab.sweepExpired(), 0);
  assert.equal((await pending.store.get('capacity')).value.slots['canvas:hoodie'].reserved, 1);
  assert.equal(pending.calls.some(c=>c.method==='DELETE'), false);
});

test('refund reconciliation also handles provider totals net of completed refunds', async () => {
  const f = await fixture(), result = await f.checkout(); const payment = f.pay(); await f.webhook('evt_net_paid');
  payment.total_money = {amount:6500,currency:'USD'}; payment.refunded_money = {amount:1000,currency:'USD'};
  await f.webhook('evt_net_partial');
  const order = (await f.store.get('orders/' + result.body.orderId)).value;
  assert.equal(order.payment.status,'partially_refunded'); assert.equal(order.payment.amountTotal,7500);
  assert.equal(order.payment.amountRefunded,1000);
});

test('Square refund requests retry idempotently and completed refunds update once', async () => {
  const f = await fixture(), result = await f.checkout(); const payment = f.pay(); await f.webhook('evt_paid');
  assert.equal((await f.lab.refund(owner, result.body.orderId, { amountCents: 1000 })).pending, true);
  await f.lab.refund(owner, result.body.orderId, { amountCents: 1000 }); assert.equal(f.refunds.size, 1);
  const refund = [...f.refunds.values()][0]; refund.status = 'COMPLETED'; payment.refunded_money = { amount: 1000, currency: 'USD' };
  const event = { event_id: 'evt_refund', type: 'refund.updated', data: { object: { refund: { id: refund.id } } } };
  await f.http('square-webhook', event, 'POST', { 'x-square-hmacsha256-signature': sign(JSON.stringify(event), f.env) });
  let order = (await f.store.get('orders/' + result.body.orderId)).value;
  assert.equal(order.payment.status, 'partially_refunded'); assert.equal(order.payment.amountRefunded, 1000);
  payment.refunded_money.amount = 7500; await f.webhook('evt_full_refund');
  order = (await f.store.get('orders/' + result.body.orderId)).value; assert.equal(order.payment.status, 'refunded');
  await assert.rejects(() => f.lab.refund(owner, result.body.orderId, { amountCents: 1 }));
  assert.equal((await f.store.get('capacity')).value.slots['canvas:hoodie'].used, 1);
});

test('Square remains closed without explicit config, launch gates and live permission', async () => {
  const empty = await fixture({ SQUARE_ACCESS_TOKEN: '', SQUARE_ENVIRONMENT: '', SQUARE_SHIPPING_CENTS: '', SQUARE_TAX_MODE: '' });
  assert.equal((await empty.checkout()).status, 503);
  assert(squareConfiguration({}).reasons.length >= 5);
  const previewLive = await fixture({ SQUARE_ENVIRONMENT: 'production', LAB_ALLOW_LIVE: 'true' });
  assert.equal((await previewLive.checkout()).status, 503);
  const live = await fixture({ SQUARE_ENVIRONMENT: 'production', CONTEXT: 'production' });
  assert.equal((await live.checkout()).status, 503);
  const ready = await fixture({ SQUARE_ENVIRONMENT: 'production', CONTEXT: 'production', LAB_ALLOW_LIVE: 'true' });
  assert.equal((await ready.checkout()).status, 503);
  await ready.store.set('settings', { launch: { sizeChartsVerified: true, shippingTaxConfigured: true } });
  assert.equal((await ready.checkout()).status, 200); // Mock HTTP only; no real payment or account access.
});

test('live public readiness reports launch gates and empty stock while sandbox is unaffected', async () => {
  const f=await fixture({SQUARE_ENVIRONMENT:'production',CONTEXT:'production',LAB_ALLOW_LIVE:'true'});
  let status=await f.lab.publicStatus();
  assert.equal(status.checkout.available,false);
  assert(status.checkout.reasons.some(reason=>reason.includes('Size charts')));
  assert(status.checkout.reasons.some(reason=>reason.includes('Shipping and tax')));
  await f.store.set('settings',{launch:{sizeChartsVerified:true,shippingTaxConfigured:true,relicPoliciesPublished:false}});
  await f.store.delete('capacity');
  status=await f.lab.publicStatus();
  assert.equal(status.checkout.available,false);
  assert.deepEqual(status.checkout.reasons,['Product availability has not been configured yet.']);
  await f.store.set('capacity',{slots:{'canvas:hoodie':{limit:2,used:0,reserved:0,open:true}}});
  assert.equal((await f.lab.publicStatus()).checkout.available,true);
  const sandbox=await fixture(); await sandbox.store.delete('capacity');
  assert.equal((await sandbox.lab.publicStatus()).checkout.available,true);
});

test('live last-slot checkout remains retryable after its hold exhausts availability', async () => {
  const f=await fixture({SQUARE_ENVIRONMENT:'production',CONTEXT:'production',LAB_ALLOW_LIVE:'true'});
  await f.store.set('settings',{launch:{sizeChartsVerified:true,shippingTaxConfigured:true,relicPoliciesPublished:false}});
  await f.store.set('capacity',{slots:{'canvas:hoodie':{limit:1,used:0,reserved:0,open:true}}});
  const first=await f.checkout(); assert.equal(first.status,200);
  const status=await f.lab.publicStatus();
  assert.equal(status.slots['canvas:hoodie'].available,0);
  assert.equal(status.checkout.available,true);
  const retry=await f.checkout(); assert.equal(retry.status,200);
  assert.equal(retry.body.duplicate,true); assert.equal(retry.body.orderId,first.body.orderId);
  assert.equal(f.links.size,1);
  assert.equal((await f.store.get('capacity')).value.slots['canvas:hoodie'].reserved,1);
  assert.equal((await f.checkout('another_buyer_checkout_key_123')).status,409);
});

test('regional shipping uses authoritative $10 US and $25 international rates', async () => {
  const env = {SQUARE_SHIPPING_MODE:'regional',SQUARE_US_SHIPPING_CENTS:'1000',SQUARE_INTERNATIONAL_SHIPPING_CENTS:'2500'};
  const us = await fixture(env);
  assert.deepEqual((await us.lab.publicStatus()).shipping,{mode:'regional',usCents:1000,internationalCents:2500,label:'First-class shipping'});
  assert.equal((await us.checkout()).body.code,'shipping_region_required');
  const request={items:[item],idempotencyKey:'regional_us_checkout_key_123',shippingRegion:'us',shippingCents:1};
  const result=await us.http('checkout',request); assert.equal(result.status,200);
  const body=us.calls.find(c=>c.body?.order).body;
  assert.equal(body.checkout_options.shipping_fee.charge.amount,1000);
  assert.equal(body.checkout_options.shipping_fee.name,'First-class shipping');
  assert.equal(body.pre_populated_data.buyer_address.country,'US');
  assert.equal((await us.store.get('orders/'+result.body.orderId)).value.payment.expectedTotal,8000);
  assert.equal((await us.http('checkout',{...request,shippingRegion:'international'})).body.code,'checkout_changed');
  us.pay(); await us.webhook('evt_region_us');
  assert.equal((await us.store.get('orders/'+result.body.orderId)).value.payment.status,'paid');
  const intl=await fixture(env);
  const international=await intl.http('checkout',{items:[item],idempotencyKey:'regional_intl_checkout_key_123',shippingRegion:'international',shippingCents:0});
  assert.equal(international.status,200);
  assert.equal(intl.calls.find(c=>c.body?.order).body.checkout_options.shipping_fee.charge.amount,2500);
  intl.pay('INTL',{shipping_address:{country:'CA'}}); await intl.webhook('evt_region_intl','INTL');
  assert.equal((await intl.store.get('orders/'+international.body.orderId)).value.payment.status,'paid');
});

test('paid address mismatch or missing country requires review before production', async () => {
  for(const [region,country] of [['us','CA'],['international','US'],['us',null]]) {
    const f=await fixture({SQUARE_SHIPPING_MODE:'regional',SQUARE_US_SHIPPING_CENTS:'1000',SQUARE_INTERNATIONAL_SHIPPING_CENTS:'2500'});
    const result=await f.http('checkout',{items:[item],idempotencyKey:'regional_mismatch_key_12345',shippingRegion:region});
    f.pay('MISMATCH_ADDRESS',{shipping_address:country?{country}:null});
    const event=await f.webhook('evt_address_mismatch','MISMATCH_ADDRESS'); assert.equal(event.body.review,true);
    const order=(await f.store.get('orders/'+result.body.orderId)).value;
    assert.equal(order.payment.status,'review'); assert.equal(order.production.status,null);
    assert.match(order.payment.reviewReason,/shipping country/);
    assert.equal((await f.store.get('capacity')).value.slots['canvas:hoodie'].used,0);
  }
});

test('full refund of a reviewed shipping mismatch releases held capacity without production', async () => {
  const f=await fixture({SQUARE_SHIPPING_MODE:'regional',SQUARE_US_SHIPPING_CENTS:'1000',SQUARE_INTERNATIONAL_SHIPPING_CENTS:'2500'});
  const result=await f.http('checkout',{items:[item],idempotencyKey:'regional_refund_key_12345',shippingRegion:'us'});
  const payment=f.pay('ADDRESS_REVIEW',{shipping_address:{country:'CA'}});
  await f.webhook('evt_address_review','ADDRESS_REVIEW');
  await f.lab.refund(owner,result.body.orderId,{});
  payment.refunded_money={amount:8000,currency:'USD'};
  await f.webhook('evt_address_refunded','ADDRESS_REVIEW');
  await f.webhook('evt_address_refunded_duplicate','ADDRESS_REVIEW');
  const order=(await f.store.get('orders/'+result.body.orderId)).value;
  assert.equal(order.payment.status,'refunded'); assert.equal(order.reservation.state,'released');
  assert.equal(order.production.status,null);
  assert.equal((await f.store.get('capacity')).value.slots['canvas:hoodie'].reserved,0);
  assert.equal((await f.store.get('capacity')).value.slots['canvas:hoodie'].used,0);
});
