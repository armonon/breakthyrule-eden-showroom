import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SITE = 'https://breakthyrule-eden-showroom.netlify.app';
// The CreatingCo vanity-domain proxy only exposes its existing API routes.
// Send signed server calls to the same Circle app's canonical hosting origin.
const UPSTREAM = 'https://momentium-collaboration.armonon.chatgpt.site/api/community/breakthyrule';
const COOKIE = '__Host-btr-forum-guest';
const AGE = 30 * 86400;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CATEGORIES = new Set(['general', 'garments', 'art', 'music', 'reading']);
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' };
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const hmac = (secret, value) => createHmac('sha256', secret).update(value).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const clean = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max) : '';

async function readJson(stream, max) {
  if (!stream) throw fail(400, 'A JSON body is required.', 'bad_request');
  const reader = stream.getReader(), parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw fail(413, 'This message is too large.', 'too_large');
      parts.push(value);
    }
    try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
    catch { throw fail(400, 'Invalid JSON.', 'bad_request'); }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
}

function guestPresentation(value) {
  return value && typeof value.name === 'string' ? { name: clean(value.name, 60) } : null;
}
function itemPresentation(item, kind) {
  if (!item || !UUID.test(item.id || '') || !Number.isFinite(Date.parse(item.createdAt || ''))) throw new Error('Invalid forum response');
  const value = { id: item.id, body: clean(item.body, 5000), name: clean(item.name, 60) || 'Guest', handle: clean(item.handle, 30), createdAt: new Date(item.createdAt).toISOString(), likes: Math.max(0, Number.isSafeInteger(item.likes) ? item.likes : 0) };
  if (kind === 'post') return { ...value, category: CATEGORIES.has(item.category) ? item.category : 'general', comments: Math.max(0, Number.isSafeInteger(item.comments) ? item.comments : 0) };
  return { ...value, parent: UUID.test(item.parent || '') ? item.parent : null };
}

export function createGuestHandler({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now, random = () => randomBytes(32).toString('hex'), siteOrigin = SITE, timeoutMs = 8000 } = {}) {
  const bridgeSecret = env.BTR_COMMUNITY_BRIDGE_SECRET || '';
  const sessionSecret = env.BTR_COMMUNITY_SESSION_SECRET || '';
  function session(request) {
    const matches = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).filter(v => v.startsWith(COOKIE + '='));
    if (matches.length !== 1) return null;
    const value = matches[0].slice(COOKIE.length + 1), segments = value.split('.');
    if (segments.length !== 3) return null;
    const [token, expires, signature] = segments;
    if (!/^[a-f0-9]{64}$/.test(token || '') || !/^\d{10}$/.test(expires || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return null;
    if (Number(expires) <= Math.floor(now() / 1000) || Number(expires) > Math.floor(now() / 1000) + AGE + 60) return null;
    return equal(signature, hmac(sessionSecret, `session\n${token}\n${expires}`)) ? { token, expires } : null;
  }
  const csrf = s => hmac(sessionSecret, `csrf\n${s.token}\n${s.expires}`);
  async function upstream(action, s, input, context) {
    // context.ip is Netlify's trusted edge metadata, never a forwarded client header.
    if (typeof context?.ip !== 'string' || !context.ip || context.ip.length > 100) throw fail(503, 'Guest posting is temporarily unavailable. Your draft is saved.', 'community_unavailable');
    const timestamp = String(Math.floor(now() / 1000));
    const body = JSON.stringify({ action, guestToken: s.token, clientKey: hmac(sessionSecret, `client\n${Math.floor(now() / 86400000)}\n${context.ip}`), ...input });
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      // The dedicated bridge identifies this integration by its canonical site
      // origin plus HMAC. It does not use Circle's browser-cookie write endpoint.
      const response = await fetchImpl(UPSTREAM, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Origin: SITE, 'X-BTR-Timestamp': timestamp, 'X-BTR-Signature': hmac(bridgeSecret, timestamp + '\n' + body) }, body, signal: abort.signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
      if (response.redirected || !response.headers.get('content-type')?.startsWith('application/json')) throw new Error('Invalid bridge response');
      const result = await readJson(response.body, 128 * 1024);
      if (!response.ok) {
        if ([400, 401, 403, 404, 409, 429].includes(response.status)) throw fail(response.status, clean(result.error, 200) || 'Could not send this message. Please try again.', response.status === 429 ? 'rate_limited' : 'message_rejected');
        throw new Error('Forum unavailable');
      }
      return result;
    } finally { clearTimeout(timer); }
  }
  return async function guest(request, context, route) {
    try {
      if (!['session', 'posts', 'replies'].includes(route)) return json(404, { error: 'Forum endpoint not found.', code: 'not_found' });
      const methods = route === 'session' ? ['GET', 'POST'] : ['POST'];
      if (!methods.includes(request.method)) return json(405, { error: 'Method not allowed.', code: 'method_not_allowed' }, { Allow: methods.join(', ') });
      if (new URL(request.url).search) throw fail(400, 'Unexpected query parameters.', 'bad_request');
      if (bridgeSecret.length < 32 || sessionSecret.length < 32 || env.CONTEXT && env.CONTEXT !== 'production') throw fail(503, 'Guest posting is temporarily unavailable. Your draft is saved.', 'community_unavailable');
      let s = session(request);
      if (request.method === 'GET') {
        if (!s) return json(200, { guest: null, csrfToken: null });
        const data = await upstream('session', s, { create: false }, context);
        const guest = guestPresentation(data.guest);
        return json(200, { guest, csrfToken: guest ? csrf(s) : null });
      }
      if (new URL(request.url).origin !== siteOrigin || request.headers.get('origin') !== siteOrigin || request.headers.get('sec-fetch-site') === 'cross-site') throw fail(403, 'Please send messages from Break Thy Rule.', 'bad_origin');
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw fail(415, 'JSON is required.', 'bad_content_type');
      const input = await readJson(request.body, 12 * 1024);
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail(400, 'Invalid request.', 'bad_request');
      if (route === 'session') {
        if (Object.keys(input).length) throw fail(400, 'Unexpected session fields.', 'bad_request');
        if (!s) s = { token: random(), expires: String(Math.floor(now() / 1000) + AGE) };
        const data = await upstream('session', s, { create: true }, context);
        const guest = guestPresentation(data.guest);
        if (!guest) throw new Error('Invalid guest session');
        const cookie = `${COOKIE}=${s.token}.${s.expires}.${hmac(sessionSecret, `session\n${s.token}\n${s.expires}`)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(0, Number(s.expires) - Math.floor(now() / 1000))}`;
        return json(200, { guest, csrfToken: csrf(s) }, { 'Set-Cookie': cookie });
      }
      if (!s) throw fail(401, 'Your guest session expired. Please try sending again.', 'session_expired');
      if (!equal(request.headers.get('x-csrf-token'), csrf(s))) throw fail(403, 'Refresh the page before sending again. Your draft is saved.', 'bad_csrf');
      const keys = route === 'posts' ? ['body', 'category', 'requestId'] : ['body', 'postId', 'requestId'];
      if (Object.keys(input).some(key => !keys.includes(key)) || typeof input.body !== 'string' || !input.body.trim() || input.body.trim().length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.body) || !UUID.test(input.requestId || '')) throw fail(400, 'Write a message of 1–2,000 characters.', 'bad_request');
      const value = { body: input.body.trim(), requestId: input.requestId.toLowerCase() };
      if (route === 'posts') {
        if (!CATEGORIES.has(input.category)) throw fail(400, 'Choose a category.', 'bad_request');
        const data = await upstream('post', s, { ...value, category: input.category }, context);
        return json(200, { post: itemPresentation(data.post, 'post') });
      }
      if (!UUID.test(input.postId || '')) throw fail(400, 'Choose a conversation.', 'bad_request');
      const data = await upstream('reply', s, { ...value, postId: input.postId.toLowerCase() }, context);
      return json(200, { reply: itemPresentation(data.reply, 'reply') });
    } catch (error) {
      const status = error.status || 503;
      return json(status, { error: error.status ? error.message : 'Guest posting is temporarily unavailable. Your draft is saved; please retry.', code: error.code || 'community_unavailable' }, status === 429 ? { 'Retry-After': '60' } : {});
    }
  };
}
