// HTTP routing for the Garment Lab, shared by the local server (server/eden-server.mjs) and the
// Netlify Function (netlify/functions/lab.mjs). Request in, response out; no framework.
import { createLab, LabError } from './service.mjs';
import { openStore } from './store.mjs';
import { createStripe, verifyStripeSignature } from './stripe.mjs';
import { ARTWORK_POOL } from '../../labkit/artwork-pool.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (status, data, extra = {}) => ({ status, headers: { ...JSON_HEADERS, ...extra }, body: JSON.stringify(data) });
export const MAX_BODY = 5 * 1024 * 1024;

let cached = null;
export async function labFromEnv(env = process.env) {
  if (cached && cached.env === env) return cached.lab;
  const store = await openStore(env);
  const stripe = createStripe({ secretKey: env.STRIPE_SECRET_KEY });
  const lab = createLab({ store, env, stripe, artworkPool: ARTWORK_POOL.map(a => a.id) });
  cached = { env, lab };
  return lab;
}

export function createHandler(getLab, env = process.env) {
  return async function handle({ method, url, headers, rawBody = '' }) {
    try {
      const path = url.pathname.replace(/^\/\.netlify\/functions\/lab/, '/api/lab').replace(/\/+$/, '');
      if (!path.startsWith('/api/lab')) return json(404, { error: 'Not found.' });
      const route = path.slice('/api/lab'.length) || '/';
      if (rawBody.length > MAX_BODY) throw new LabError(413, 'too_large', 'Request too large.');
      const lab = await getLab();
      const body = () => { try { return rawBody ? JSON.parse(rawBody) : {}; } catch { throw new LabError(400, 'bad_json', 'Malformed JSON.'); } };
      const auth = String(headers.authorization || '');
      const staff = auth.startsWith('Bearer ') ? await lab.staffFromToken(auth.slice(7)) : null;
      const origin = env.LAB_PUBLIC_URL || `${url.protocol}//${url.host}`;
      const seg = route.split('/').filter(Boolean);
      const is = (m, ...parts) => method === m && seg.length === parts.length && parts.every((p, i) => p === '*' || p === seg[i]);

      // Public
      if (is('GET', 'status')) return json(200, await lab.publicStatus());
      if (is('POST', 'checkout')) { const b = body(); return json(200, await lab.checkout({ items: b.items, note: b.note, idempotencyKey: b.idempotencyKey, origin })); }
      if (is('GET', 'orders', '*')) return json(200, await lab.customerOrder(seg[1], url.searchParams.get('key')));
      if (is('POST', 'stripe-webhook')) {
        if (!verifyStripeSignature(rawBody, headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET)) return json(400, { error: 'Invalid signature.' });
        return json(200, await lab.handleEvent(JSON.parse(rawBody)));
      }
      if (is('POST', 'test-gateway', '*')) return json(200, await lab.testGateway(seg[1], body()));
      if (is('POST', 'waitlist')) return json(200, await lab.joinWaitlist(body()));
      if (is('GET', 'archive')) return json(200, await lab.listArchive(null));
      if (is('GET', 'archive', '*')) return json(200, await lab.getArchive(seg[1]));
      if (is('GET', 'uploads', '*')) { const u = await lab.getUpload(seg[1], staff); return { status: 200, headers: { 'Content-Type': u.mime, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' }, body: u.bytes }; }

      // Studio (staff only; every action checks its own permission)
      if (seg[0] === 'admin') {
        if (is('POST', 'admin', 'login')) { const b = body(); return json(200, await lab.login(b.email, b.password)); }
        if (!staff) throw new LabError(401, 'unauthorized', 'Sign in to the studio.');
        if (is('GET', 'admin', 'me')) return json(200, staff);
        if (is('GET', 'admin', 'orders')) return json(200, await lab.listOrders(staff, Object.fromEntries(url.searchParams)));
        if (is('GET', 'admin', 'orders', '*')) return json(200, await lab.getOrder(staff, seg[2]));
        if (method === 'POST' && seg[1] === 'orders' && seg.length === 4) {
          const id = seg[2], b = body();
          switch (seg[3]) {
            case 'production': return json(200, await lab.setProduction(staff, id, b.status));
            case 'note': return json(200, await lab.addNote(staff, id, b.text));
            case 'assign': return json(200, await lab.assign(staff, id, b.assignee));
            case 'shipment': return json(200, await lab.recordShipment(staff, id, b));
            case 'relic': return json(200, await lab.assignRelic(staff, id, b.index, b.contents));
            case 'cancel': return json(200, await lab.cancelOrder(staff, id));
            case 'refund': return json(200, await lab.refund(staff, id, b));
          }
        }
        if (is('GET', 'admin', 'stock')) return json(200, await lab.stock(staff));
        if (is('POST', 'admin', 'stock')) { const b = body(); return json(200, await lab.setStock(staff, b.sku, b.onHand)); }
        if (is('POST', 'admin', 'capacity')) { const b = body(); return json(200, await lab.setSlot(staff, b.slot, b)); }
        if (is('GET', 'admin', 'settings')) return json(200, await lab.getSettings(staff));
        if (is('POST', 'admin', 'settings')) return json(200, await lab.saveSettings(staff, body()));
        if (is('GET', 'admin', 'waitlist')) return json(200, await lab.listWaitlist(staff));
        if (is('POST', 'admin', 'uploads')) return json(200, await lab.upload(staff, body()));
        if (is('GET', 'admin', 'archive')) return json(200, await lab.listArchive(staff));
        if (is('POST', 'admin', 'archive')) return json(200, await lab.saveArchive(staff, body()));
        if (is('GET', 'admin', 'staff')) return json(200, await lab.listStaff(staff));
        if (is('POST', 'admin', 'staff')) return json(200, await lab.addStaff(staff, body()));
        if (is('POST', 'admin', 'staff', 'active')) { const b = body(); return json(200, await lab.setStaffActive(staff, b.email, b.active)); }
      }
      return json(404, { error: 'Not found.' });
    } catch (e) {
      if (e instanceof LabError) return json(e.status, { error: e.message, code: e.code, ...(e.extra || {}) });
      if (e.code === 'STORE_UNAVAILABLE') return json(503, { error: 'The order store is not set up yet.', code: 'store_unavailable' });
      if (e.code === 'CONFLICT') return json(409, { error: 'Busy — please try again.', code: 'conflict' });
      console.error('[lab]', e);
      return json(500, { error: 'Something went wrong. Nothing was charged.' });
    }
  };
}
