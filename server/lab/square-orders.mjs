import crypto from 'node:crypto';
import { CURRENCY, skuFor, slotFor } from '../../labkit/catalog.mjs';
import { describeItem, unitsFor, expectedUnitsFor } from '../../labkit/pricing.mjs';
import { squareConfiguration } from './square.mjs';

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const amount = value => Number.isSafeInteger(value) && value >= 0;
const cents = value => value?.currency === CURRENCY.toUpperCase() && amount(value.amount) ? value.amount : null;
const cleanNote = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 500) : '';

// These records share the existing order store and order views. Every resource mutation carries
// an order receipt so webhook retries and concurrent event deliveries cannot double-consume stock.
export function createSquareOrders({ store, env, square, now, LabError }) {
  const currency = CURRENCY.toUpperCase();
  const configuration = squareConfiguration(env);
  const fail = (status, code, message) => { throw new LabError(status, code, message); };
  const orderKey = id => 'orders/' + id;
  function sameAccount(order) {
    if (order.mode !== square?.mode || order.payment.squareLocationId !== square?.locationId) fail(409, 'square_account_changed', 'Reconnect the Square environment and location that created this checkout.');
  }
  async function get(id) {
    const order = (await store.get(orderKey(id)))?.value;
    if (!order || order.provider !== 'square') fail(404, 'not_found', 'Square order not found.');
    return order;
  }
  function needsFor(items) {
    const needs = { skus: {}, slots: {} };
    for (const item of items) {
      const sku = skuFor(item), slot = slotFor(item);
      if (sku) needs.skus[sku] = (needs.skus[sku] || 0) + item.quantity;
      if (slot) needs.slots[slot] = (needs.slots[slot] || 0) + item.quantity;
    }
    return needs;
  }
  async function resource(order, bucket, operation) {
    const group = bucket === 'inventory' ? 'skus' : 'slots', needs = order.reservation.needs[group];
    if (!Object.keys(needs).length) return;
    await store.update(bucket, current => {
      const record = current || { [group]: {} };
      record.squareReservations ||= {};
      const prior = record.squareReservations[order.id];
      if (operation === 'hold' && ['held', 'committed'].includes(prior) || operation === 'commit' && prior === 'committed' || operation === 'release' && prior !== 'held') return undefined;
      if (operation === 'commit' && prior !== 'held') fail(409, 'reservation_missing', 'Payment needs studio review because its inventory hold is unavailable.');
      for (const [key, quantity] of Object.entries(needs)) {
        const item = record[group][key];
        if (operation === 'hold') {
          const available = group === 'skus' ? item?.unlimited === true ? Infinity : (item?.onHand ?? 0) - (item?.reserved ?? 0) : item && item.open !== false ? item.unlimited === true ? Infinity : Number.isInteger(item.limit) ? item.limit - (item.used || 0) - (item.reserved || 0) : 0 : 0;
          if (available < quantity) fail(409, group === 'skus' ? 'out_of_stock' : 'at_capacity', 'That piece is unavailable in the selected quantity.');
          item.reserved = (item.reserved || 0) + quantity;
        } else {
          if (!item || item.reserved < quantity) fail(409, 'reservation_missing', 'The inventory hold needs studio review.');
          if (operation === 'commit' && group === 'skus' && item.unlimited !== true && (!Number.isInteger(item.onHand) || item.onHand < quantity)) fail(409, 'reservation_missing', 'Finite stock no longer covers this paid order. The studio must review it.');
          item.reserved -= quantity;
          if (operation === 'commit') {
            if (group === 'skus') { if (item.unlimited !== true) item.onHand -= quantity; }
            else item.used = (item.used || 0) + quantity;
          }
        }
      }
      record.squareReservations[order.id] = { hold: 'held', commit: 'committed', release: 'released' }[operation];
      return record;
    });
  }
  async function resources(order, operation) {
    await resource(order, 'inventory', operation);
    try { await resource(order, 'capacity', operation); }
    catch (error) { if (operation === 'hold') await resource(order, 'inventory', 'release'); throw error; }
  }
  function checkoutBody(order, successUrl, key) {
    return {
      idempotency_key: 'btr-' + digest(key),
      description: 'Break Thy Rule ' + order.id,
      payment_note: order.id,
      ...(order.shipping.region === 'us' ? { pre_populated_data: { buyer_address: { country: 'US' } } } : {}),
      order: {
        location_id: square.locationId, reference_id: order.id,
        line_items: order.items.map((item, i) => ({ uid: 'item-' + i, name: item.describe.title.slice(0, 512), note: item.describe.spec.join(' · ').slice(0, 2000), quantity: String(item.quantity), base_price_money: { amount: item.unitCents, currency } })),
        ...(env.SQUARE_TAX_MODE === 'catalog' ? { taxes: configuration.taxIds.map((id, i) => ({ uid: 'tax-' + i, catalog_object_id: id, scope: 'ORDER' })) } : {}),
        pricing_options: { auto_apply_discounts: false, auto_apply_taxes: false }
      },
      checkout_options: {
        redirect_url: successUrl, ask_for_shipping_address: true, allow_tipping: false, enable_coupon: false, enable_loyalty: false,
        ...(order.shipping.amountCents > 0 ? { shipping_fee: { name: order.shipping.label, charge: { amount: order.shipping.amountCents, currency } } } : {})
      }
    };
  }
  function validateSquareOrder(local, remote) {
    if (!remote || remote.reference_id !== local.id || remote.location_id !== square.locationId || !Array.isArray(remote.line_items) || remote.line_items.length !== local.items.length) return false;
    const lines = new Map(remote.line_items.map(line => [line.uid, line]));
    return local.items.every((item, i) => {
      const line = lines.get('item-' + i);
      return line && line.quantity === String(item.quantity) && cents(line.base_price_money) === item.unitCents;
    }) && (remote.total_discount_money == null || cents(remote.total_discount_money) === 0) && (remote.total_tip_money == null || cents(remote.total_tip_money) === 0) && cents(remote.total_money) !== null;
  }
  async function createOrRecoverLink(local) {
    sameAccount(local);
    const requestKey = local.payment.squareRequestKey, lease = crypto.randomUUID();
    let attempt;
    await store.update(requestKey, request => {
      if (!request?.body) fail(409, 'checkout_pending', 'The saved checkout request is incomplete. Retry this cart first.');
      if (request.leaseUntil > now()) fail(409, 'in_progress', 'This checkout is already being prepared. Please retry shortly.');
      attempt = (request.attempts || 0) + 1;
      return { ...request, attempts: attempt, lease, leaseUntil: now() + 60000 };
    });
    const saved = (await store.get(requestKey)).value;
    try {
      const result = await square.createPaymentLink(saved.body), link = result.payment_link;
      if (!link?.id || !link.order_id || !/^https:\/\//.test(link.url || '')) fail(502, 'payment_unavailable', 'Square did not return a checkout page. Please retry.');
      await store.update(orderKey(local.id), order => { order.payment.sessionId = link.id; order.payment.squareOrderId = link.order_id; return order; });
      return result;
    } catch (error) {
      // Only a first, definitive rejection proves no remote checkout was created.
      // After a timeout or earlier attempt, keep the hold until recovery confirms cancellation.
      if (attempt === 1 && [400, 401, 403, 404, 422].includes(error.status)) {
        await resources(local, 'release');
        await store.update(orderKey(local.id), order => { order.payment.status = 'failed'; order.payment.error = 'Square rejected checkout configuration.'; order.reservation.state = 'released'; return order; });
        fail(502, 'checkout_rejected', 'Square could not create this checkout. Nothing was charged. Please contact the studio.');
      }
      if (error instanceof LabError) throw error;
      fail(502, 'payment_unavailable', 'Square could not be reached. Your cart and checkout are saved. Please retry.');
    } finally {
      await store.update(requestKey, request => request.lease === lease ? { ...request, lease: null, leaseUntil: 0 } : undefined);
    }
  }
  async function checkout({ priced, note, idempotencyKey, shippingRegion }) {
    if (!square) fail(503, 'checkout_unavailable', 'Square payments are not connected yet.');
    const policy = configuration.shippingPolicy;
    if (policy.mode === 'regional' && !['us', 'international'].includes(shippingRegion)) fail(400, 'shipping_region_required', 'Choose United States or international shipping before checkout.');
    const shipping = { mode: policy.mode, region: policy.mode === 'regional' ? shippingRegion : null, amountCents: policy.mode === 'regional' ? shippingRegion === 'us' ? policy.usCents : policy.internationalCents : policy.amountCents, label: policy.label };
    const customerNote = cleanNote(note), fingerprint = digest(JSON.stringify({ items: priced.items, customerNote, shipping }));
    const requestKey = 'square-checkout-requests/' + digest(idempotencyKey);
    const alphabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
    const id = 'BTR-' + Array.from(crypto.randomBytes(8), byte => alphabet[byte % alphabet.length]).join('');
    const key = crypto.randomBytes(24).toString('base64url');
    const successUrl = env.LAB_PUBLIC_URL.replace(/\/$/, '') + '/lab-order?ref=' + id + '&key=' + encodeURIComponent(key);
    await store.set(requestKey, { fingerprint, id, keyHash: digest(key), successUrl, createdAt: now() }, { ifNew: true });
    const request = (await store.get(requestKey)).value;
    if (request.fingerprint !== fingerprint) fail(409, 'checkout_changed', 'This checkout key belongs to a different cart. Refresh your cart before trying again.');
    if (request.url) {
      const previous = await get(request.id);
      sameAccount(previous);
      if (previous.payment.status !== 'pending') fail(409, 'checkout_finished', 'This checkout is already complete or closed. Start a new checkout.');
      return { orderId: request.id, url: request.url, duplicate: true };
    }
    const initial = {
      id: request.id, createdAt: new Date(request.createdAt).toISOString(), accessKeyHash: request.keyHash, mode: square.mode, provider: 'square',
      items: priced.items.map(item => ({ ...item, describe: describeItem(item), units: unitsFor(item), ...(expectedUnitsFor(item) ? { expectedUnits: expectedUnitsFor(item) } : {}) })),
      subtotalCents: priced.subtotalCents, currency: CURRENCY, customerNote, shipping,
      payment: { status: 'pending', sessionId: null, squareLocationId: square.locationId, squareRequestKey: requestKey }, production: { status: null, history: [] },
      // Square links do not auto-expire. Release only after Square confirms cancellation.
      reservation: { needs: needsFor(priced.items), state: 'held', expiresAt: request.createdAt + 35 * 60000 },
      internalNotes: [], assignee: '', progressImages: [], shipment: null, relic: {}, customer: null
    };
    await store.set(orderKey(request.id), initial, { ifNew: true });
    const local = await get(request.id);
    if (local.accessKeyHash !== request.keyHash) fail(409, 'checkout_collision', 'This checkout could not be allocated. Start a new checkout.');
    sameAccount(local);
    if (local.payment.status !== 'pending') fail(409, 'checkout_finished', 'This checkout is already complete or closed.');
    await resources(local, 'hold');
    // Persist the exact outbound request: a timed-out create may already have succeeded.
    await store.update(requestKey, value => { if (!value.body) value.body = checkoutBody(local, request.successUrl, idempotencyKey); return value; });
    const result = await createOrRecoverLink(local), link = result.payment_link;
    const remote = result.related_resources?.orders?.find(order => order.id === link.order_id) || await square.getOrder(link.order_id);
    if (!validateSquareOrder(local, remote)) fail(502, 'payment_mismatch', 'Square returned a different order. The studio must review this checkout.');
    await store.update(orderKey(local.id), order => {
      order.payment.sessionId = link.id; order.payment.squareOrderId = link.order_id;
      order.payment.expectedTotal = cents(remote.total_money); order.payment.amountTax = cents(remote.total_tax_money);
      order.payment.amountShipping = local.shipping.amountCents;
      return order;
    });
    await store.update(requestKey, value => ({ ...value, url: link.url }));
    return { orderId: local.id, url: link.url };
  }
  async function reconcilePayment(paymentId) {
    const payment = await square.getPayment(paymentId);
    if (!payment || payment.id !== paymentId || payment.location_id !== square.locationId || !payment.order_id) return { ignored: true };
    const remote = await square.getOrder(payment.order_id);
    if (!/^BTR-[A-Z0-9]{8}$/.test(remote?.reference_id || '')) return { ignored: true };
    const local = (await store.get(orderKey(remote.reference_id)))?.value;
    if (!local || local.provider !== 'square') return { ignored: true };
    if (!local.payment.squareOrderId || !Number.isSafeInteger(local.payment.expectedTotal)) fail(503, 'checkout_pending', 'Checkout is still being saved. Retry this payment notification.');
    if (payment.order_id !== local.payment.squareOrderId || remote.id !== local.payment.squareOrderId || remote.location_id !== square.locationId) fail(400, 'payment_mismatch', 'Payment does not match this order.');
    if (payment.status !== 'COMPLETED') {
      if (['APPROVED', 'PENDING'].includes(payment.status)) await store.update(orderKey(local.id), order => { order.payment.squarePendingId = payment.id; return order; });
      return { ok: true, waiting: payment.status };
    }
    const refunded = payment.refunded_money == null ? 0 : cents(payment.refunded_money);
    const reportedTotal = cents(payment.total_money), expected = local.payment.expectedTotal;
    // Square integrations may report refunded payments as gross or remaining money.
    // Accept either only when it reconciles exactly to our saved gross checkout total.
    const total = reportedTotal === expected || reportedTotal !== null && refunded !== null && reportedTotal + refunded === expected ? expected : null;
    const recipient = remote.fulfillments?.find(f => f.shipment_details?.recipient)?.shipment_details.recipient;
    const address = payment.shipping_address || recipient?.address || null;
    const country = typeof address?.country === 'string' ? address.country.trim().toUpperCase() : '';
    const addressValid = local.shipping.mode !== 'regional' || /^[A-Z]{2}$/.test(country) && (local.shipping.region === 'us' ? country === 'US' : country !== 'US');
    const paidBaseline = amount(local.payment.amountTotal) && local.payment.amountTotal > 0 ? local.payment.amountTotal : expected;
    const paidGross = reportedTotal === paidBaseline || reportedTotal !== null && refunded !== null && reportedTotal + refunded === paidBaseline ? paidBaseline : reportedTotal;
    if (paidGross > 0 && refunded === paidGross && (!local.payment.paymentIntent || local.payment.paymentIntent === payment.id)) {
      // A reviewed address/amount must still be recoverable by returning the entire payment.
      // Release only unconsumed holds; already-made inventory is not restocked by a refund.
      if (local.reservation.state === 'held') await resources(local, 'release');
      await store.update(orderKey(local.id), order => {
        order.payment = { ...order.payment, status: 'refunded', paymentIntent: payment.id, amountTotal: paidGross, amountRefunded: refunded, reviewReason: null };
        if (order.reservation.state === 'held') order.reservation.state = 'released';
        return order;
      });
      return { ok: true, orderId: local.id };
    }
    const valid = addressValid && validateSquareOrder(local, remote) && total === expected && cents(remote.total_money) === expected && refunded !== null && refunded <= expected && (!local.payment.paymentIntent || local.payment.paymentIntent === payment.id);
    if (!valid) {
      await store.update(orderKey(local.id), order => {
        if (order.payment.status === 'refunded') return undefined;
        order.payment.status = 'review'; order.payment.reviewReason = !addressValid ? 'The shipping country does not match the selected shipping rate. Contact the customer before production.' : 'Square payment, amount, or order details do not match the saved checkout.';
        order.payment.paymentIntent ||= payment.id; order.payment.amountTotal = paidGross; return order;
      });
      return { ok: true, review: true };
    }
    try { await resources(local, 'commit'); }
    catch (error) {
      if (error.code !== 'reservation_missing') throw error;
      await store.update(orderKey(local.id), order => { if (order.payment.status === 'refunded') return undefined; order.payment.status = 'review'; order.payment.paymentIntent = payment.id; order.payment.amountTotal = total; order.payment.reviewReason = error.message; return order; });
      return { ok: true, review: true };
    }
    await store.update(orderKey(local.id), order => {
      const cumulativeRefund = Math.max(order.payment.amountRefunded || 0, refunded);
      order.payment = { ...order.payment, status: cumulativeRefund >= expected ? 'refunded' : cumulativeRefund > 0 ? 'partially_refunded' : 'paid', paymentIntent: payment.id, amountTotal: total, amountRefunded: cumulativeRefund, paidAt: order.payment.paidAt || new Date(now()).toISOString(), reviewReason: null };
      order.customer = { email: payment.buyer_email_address || recipient?.email_address || null, name: recipient?.display_name || null, shipping: payment.shipping_address ? { name: recipient?.display_name || null, address: payment.shipping_address } : recipient ? { name: recipient.display_name || null, address: recipient.address || null } : null };
      order.reservation.state = 'committed';
      if (!order.production.status) order.production = { status: 'payment_confirmed', history: [{ status: 'payment_confirmed', at: new Date(now()).toISOString(), by: 'payment' }] };
      return order;
    });
    return { ok: true, orderId: local.id };
  }
  async function handleEvent(event) {
    if (!square) fail(503, 'checkout_unavailable', 'Square payments are not connected yet.');
    if (typeof event?.event_id !== 'string' || event.event_id.length > 192 || !event.type) fail(400, 'bad_event', 'Malformed Square event.');
    const eventKey = 'square-events/' + digest(event.event_id);
    if ((await store.get(eventKey))?.value?.complete) return { duplicate: true };
    let paymentId;
    if (['payment.created', 'payment.updated'].includes(event.type)) paymentId = event.data?.object?.payment?.id;
    else if (['refund.created', 'refund.updated'].includes(event.type)) {
      const refundId = event.data?.object?.refund?.id;
      if (!refundId) fail(400, 'bad_event', 'Refund notification has no refund.');
      const refund = await square.getRefund(refundId);
      if (refund?.location_id !== square.locationId) return { ignored: true };
      paymentId = refund.payment_id;
    } else return { ignored: true };
    if (typeof paymentId !== 'string' || paymentId.length > 192) fail(400, 'bad_event', 'Payment notification has no payment.');
    const result = await reconcilePayment(paymentId);
    await store.set(eventKey, { complete: true, at: now(), type: event.type });
    return result;
  }
  async function cancel(id) {
    if (!square) fail(503, 'checkout_unavailable', 'Square payments are not connected yet.');
    let order = await get(id);
    sameAccount(order);
    if (order.payment.status !== 'pending') fail(409, 'not_pending', 'Only an unpaid checkout can be canceled.');
    if (!order.payment.sessionId || !order.payment.squareOrderId) {
      await createOrRecoverLink(order);
      order = await get(id);
    }
    const before = await square.getOrder(order.payment.squareOrderId);
    if (before?.id !== order.payment.squareOrderId || before.location_id !== square.locationId || before.reference_id !== order.id) fail(409, 'payment_mismatch', 'Square could not verify the checkout to cancel.');
    const knownPayments = new Set([order.payment.squarePendingId, ...(before?.tenders || []).map(tender => tender.payment_id)].filter(Boolean));
    for (const paymentId of knownPayments) {
      const payment = await square.getPayment(paymentId);
      if (payment?.order_id === order.payment.squareOrderId && ['APPROVED', 'PENDING', 'COMPLETED'].includes(payment.status)) {
        if (payment.status === 'COMPLETED') await reconcilePayment(paymentId);
        fail(409, 'payment_processing', 'Square is processing or has completed this payment. Inventory remains held until confirmation.');
      }
    }
    try { await square.deletePaymentLink(order.payment.sessionId); }
    catch (error) { if (error.status !== 404) throw error; }
    const remote = await square.getOrder(order.payment.squareOrderId);
    if (remote?.state !== 'CANCELED' || remote.id !== order.payment.squareOrderId || remote.location_id !== square.locationId || remote.reference_id !== order.id) fail(409, 'not_canceled', 'Square has not confirmed cancellation. Inventory remains held; check the payment in Square.');
    await resources(order, 'release');
    await store.update(orderKey(id), current => {
      if (current.payment.status !== 'pending') fail(409, 'not_pending', 'This order changed while it was being canceled.');
      current.payment.status = 'canceled'; current.payment.endedAt = new Date(now()).toISOString(); current.reservation.state = 'released'; return current;
    });
    return { ok: true };
  }
  async function refund(id, staff, amountCents) {
    if (!square) fail(503, 'checkout_unavailable', 'Square payments are not connected yet.');
    const order = await get(id);
    sameAccount(order);
    if (!['paid', 'partially_refunded', 'review'].includes(order.payment.status) || !order.payment.paymentIntent) fail(409, 'not_refundable', 'Nothing to refund on this order.');
    const payment = await square.getPayment(order.payment.paymentIntent);
    if (payment.location_id !== square.locationId || payment.order_id !== order.payment.squareOrderId || payment.status !== 'COMPLETED') fail(409, 'not_refundable', 'Square could not verify this payment.');
    const reportedTotal = cents(payment.total_money), refunded = payment.refunded_money ? cents(payment.refunded_money) : 0;
    const total = amount(order.payment.amountTotal) && order.payment.amountTotal > 0 ? order.payment.amountTotal : order.payment.expectedTotal;
    if (!amount(total) || reportedTotal === null || refunded === null || !(reportedTotal === total || reportedTotal + refunded === total)) fail(409, 'not_refundable', 'Square could not verify this amount.');
    const requested = amountCents == null ? total - refunded : Number(amountCents);
    if (!Number.isSafeInteger(requested) || requested < 1 || requested > total - refunded) fail(400, 'bad_request', 'Refund amount is out of range.');
    const idempotencyKey = 'btr-' + digest(`${id}:${payment.id}:${refunded}:${requested}`).slice(0, 40);
    const result = await square.refundPayment({ idempotency_key: idempotencyKey, payment_id: payment.id, amount_money: { amount: requested, currency }, reason: 'Break Thy Rule ' + id });
    if (!result?.id) fail(502, 'refund_unavailable', 'Square did not confirm the refund request. Retry the same amount.');
    await store.update(orderKey(id), current => {
      current.payment.refundRequests ||= [];
      if (!current.payment.refundRequests.some(r => r.squareRefundId === result.id)) current.payment.refundRequests.push({ at: new Date(now()).toISOString(), by: staff.email, amountCents: requested, squareRefundId: result.id, status: result.status });
      return current;
    });
    await reconcilePayment(payment.id);
    return { ok: true, pending: result.status === 'PENDING', status: result.status };
  }
  async function sweepExpired() {
    if (!square) return 0;
    const candidates = [];
    for (const key of await store.list('orders/')) {
      const order = (await store.get(key))?.value;
      if (order?.provider === 'square' && order.payment.status === 'pending' && order.reservation.expiresAt > 0 && order.reservation.expiresAt < now()) candidates.push(order);
    }
    // Rotate checks so an ACH payment awaiting settlement cannot starve newer abandoned carts.
    candidates.sort((a, b) => (a.reservation.lastReconciledAt || a.reservation.expiresAt) - (b.reservation.lastReconciledAt || b.reservation.expiresAt));
    const order = candidates[0];
    if (!order) return 0;
    await store.update(orderKey(order.id), current => { current.reservation.lastReconciledAt = now(); return current; });
    try { await cancel(order.id); return 1; }
    catch { return 0; } // Never release on a failed cancellation or a payment still processing.
  }
  return { checkout, handleEvent, cancel, refund, sweepExpired };
}
