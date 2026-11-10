// Stripe Checkout over its REST API (no SDK). Prices are always the server-computed cents.
// Webhooks are verified with the signing secret (HMAC-SHA256, 5-minute tolerance).
import crypto from 'node:crypto';

const API = 'https://api.stripe.com/v1/';

// application/x-www-form-urlencoded with Stripe's bracket notation.
export function formEncode(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') formEncode(v, key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return out.join('&');
}

export function createStripe({ secretKey, fetchImpl = globalThis.fetch }) {
  if (!secretKey) return null;
  const mode = secretKey.startsWith('sk_live_') ? 'live' : 'test';
  async function call(method, path, params, idempotencyKey) {
    const res = await fetchImpl(API + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + secretKey, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
      },
      body: method === 'GET' ? undefined : formEncode(params || {})
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(json?.error?.message || 'Stripe request failed'); e.status = res.status; e.stripe = json?.error; throw e; }
    return json;
  }
  return {
    mode,
    createCheckoutSession: (params, idempotencyKey) => call('POST', 'checkout/sessions', params, idempotencyKey),
    expireCheckoutSession: id => call('POST', `checkout/sessions/${encodeURIComponent(id)}/expire`, {}),
    createRefund: (params, idempotencyKey) => call('POST', 'refunds', params, idempotencyKey)
  };
}

export function verifyStripeSignature(rawBody, header, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  if (!secret || !header || typeof rawBody !== 'string') return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')).filter(p => p.length === 2).map(([k, v]) => [k.trim(), v]));
  const sigs = header.split(',').filter(p => p.trim().startsWith('v1=')).map(p => p.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const want = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  return sigs.some(s => { const got = Buffer.from(s, 'hex'); return got.length === want.length && crypto.timingSafeEqual(got, want); });
}

// For tests and the local test gateway: sign an event exactly as Stripe does.
export function signStripePayload(rawBody, secret, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=` + crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
}
