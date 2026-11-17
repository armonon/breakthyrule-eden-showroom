// Square's hosted checkout. Card details stay on Square; this module runs only on the server.
import crypto from 'node:crypto';

export const SQUARE_API_VERSION = '2026-09-16';
const money = value => Number.isSafeInteger(value) && value >= 0;
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,192}$/.test(value);

export function squareConfiguration(env = {}) {
  const reasons = [];
  if (!env.SQUARE_ACCESS_TOKEN || !validId(env.SQUARE_LOCATION_ID)) reasons.push('Square payments are not connected yet.');
  if (!['sandbox', 'production'].includes(env.SQUARE_ENVIRONMENT)) reasons.push('Square payment environment is not configured.');
  if (!env.SQUARE_WEBHOOK_SIGNATURE_KEY || !/^https:\/\//.test(env.SQUARE_WEBHOOK_URL || '')) reasons.push('Square payment confirmation is not configured.');
  if (!/^https:\/\//.test(env.LAB_PUBLIC_URL || '')) reasons.push('The checkout return address is not configured.');
  const parseCents = value => /^(0|[1-9][0-9]*)$/.test(value || '') ? Number(value) : NaN;
  const shippingMode = env.SQUARE_SHIPPING_MODE || 'flat';
  const shipping = parseCents(env.SQUARE_SHIPPING_CENTS);
  const usCents = parseCents(env.SQUARE_US_SHIPPING_CENTS), internationalCents = parseCents(env.SQUARE_INTERNATIONAL_SHIPPING_CENTS);
  if (!['flat', 'regional'].includes(shippingMode) || shippingMode === 'flat' && !money(shipping) || shippingMode === 'regional' && (!money(usCents) || !money(internationalCents))) reasons.push('Square shipping has not been configured.');
  const shippingPolicy = shippingMode === 'regional' ? { mode: 'regional', usCents: money(usCents) ? usCents : null, internationalCents: money(internationalCents) ? internationalCents : null, label: 'First-class shipping' } : { mode: 'flat', amountCents: money(shipping) ? shipping : null, label: 'Shipping' };
  const taxIds = (env.SQUARE_TAX_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!['catalog', 'none'].includes(env.SQUARE_TAX_MODE) || env.SQUARE_TAX_MODE === 'catalog' && (!taxIds.length || !taxIds.every(validId))) reasons.push('Square tax treatment has not been configured.');
  if (env.CONTEXT && env.CONTEXT !== 'production' && env.SQUARE_ENVIRONMENT === 'production') reasons.push('Live Square payments are disabled in previews.');
  return { reasons, shipping, shippingPolicy, taxIds };
}

export function createSquare({ env = {}, fetchImpl = globalThis.fetch } = {}) {
  if (!env.SQUARE_ACCESS_TOKEN || !['sandbox', 'production'].includes(env.SQUARE_ENVIRONMENT) || !validId(env.SQUARE_LOCATION_ID)) return null;
  const base = env.SQUARE_ENVIRONMENT === 'production' ? 'https://connect.squareup.com/v2/' : 'https://connect.squareupsandbox.com/v2/';
  async function call(method, route, body) {
    let response;
    try {
      response = await fetchImpl(base + route, { method, headers: { Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, 'Square-Version': SQUARE_API_VERSION, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    } catch { const error = new Error('Square could not be reached. Retry the same request.'); error.code = 'SQUARE_UNAVAILABLE'; throw error; }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.errors?.length) { const error = new Error('Square could not complete the request.'); error.code = 'SQUARE_UNAVAILABLE'; error.status = response.status; throw error; }
    return result;
  }
  return {
    mode: env.SQUARE_ENVIRONMENT === 'production' ? 'live' : 'test', locationId: env.SQUARE_LOCATION_ID,
    createPaymentLink: body => call('POST', 'online-checkout/payment-links', body),
    deletePaymentLink: id => call('DELETE', `online-checkout/payment-links/${encodeURIComponent(id)}`),
    getOrder: async id => (await call('GET', `orders/${encodeURIComponent(id)}`)).order,
    getPayment: async id => (await call('GET', `payments/${encodeURIComponent(id)}`)).payment,
    getRefund: async id => (await call('GET', `refunds/${encodeURIComponent(id)}`)).refund,
    refundPayment: async body => (await call('POST', 'refunds', body)).refund
  };
}

export function verifySquareSignature(rawBody, signature, secret, notificationUrl) {
  if (typeof rawBody !== 'string' || typeof signature !== 'string' || !secret || !notificationUrl) return false;
  const expected = crypto.createHmac('sha256', secret).update(notificationUrl + rawBody).digest();
  const actual = Buffer.from(signature, 'base64');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
