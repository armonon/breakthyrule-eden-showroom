import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createGuestHandler } from '../../server/community/guest.mjs';

const SITE = 'https://breakthyrule-eden-showroom.netlify.app';
const UPSTREAM = 'https://momentium-collaboration.armonon.chatgpt.site/api/community/breakthyrule';
const COOKIE = '__Host-btr-forum-guest';
const AGE = 30 * 86400;
const env = { CONTEXT: 'production', BTR_COMMUNITY_BRIDGE_SECRET: 'fixture-bridge-secret-'.repeat(3), BTR_COMMUNITY_SESSION_SECRET: 'fixture-session-secret-'.repeat(3) };
const id = 'f2b376d4-4a60-49d6-ab2d-ae2152cba17b';
const replyId = 'ee63b634-6bc5-4e02-ae5a-11cea722b3ea';
const hmac = (secret, value) => createHmac('sha256', secret).update(value).digest('hex');
const upstream = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const req = (route, { method = 'POST', body = {}, cookie, csrf, headers = {}, origin = SITE, url = SITE + '/api/community/' + route } = {}) => new Request(url, {
  method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers }, ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
});
const post = (extra = {}) => ({ body: 'A real draft', category: 'music', requestId: id, ...extra });

function fixture(options = {}) {
  const clock = { value: 1794960000000 }, calls = [], profiles = new Map();
  let next = 0;
  const now = () => clock.value;
  const fetchImpl = async (url, init) => {
    assert.equal(url, UPSTREAM);
    assert.equal(init.method, 'POST');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    assert.deepEqual(Object.keys(init.headers).sort(), ['Accept', 'Content-Type', 'Origin', 'X-BTR-Signature', 'X-BTR-Timestamp'].sort());
    assert.equal(init.headers.Origin, SITE);
    assert.equal(init.headers['X-BTR-Timestamp'], String(Math.floor(now() / 1000)));
    assert.equal(init.headers['X-BTR-Signature'], hmac(env.BTR_COMMUNITY_BRIDGE_SECRET, init.headers['X-BTR-Timestamp'] + '\n' + init.body));
    const data = JSON.parse(init.body);
    assert.match(data.guestToken, /^[a-f0-9]{64}$/);
    assert.match(data.clientKey, /^[a-f0-9]{64}$/);
    calls.push({ url, init, data });
    if (options.respond) return options.respond(data, calls.length);
    if (data.action === 'session') {
      if (data.create && !profiles.has(data.guestToken)) profiles.set(data.guestToken, { name: 'Guest ' + data.guestToken.slice(-4) });
      return upstream({ guest: profiles.get(data.guestToken) || null });
    }
    const item = { id: data.requestId, body: data.body, name: profiles.get(data.guestToken)?.name || 'Guest', handle: 'guest_fixture', createdAt: new Date(now()).toISOString(), likes: 0, comments: 0, category: data.category, parent: null, author: 'private-user-id', guestToken: data.guestToken, email: 'private@example.test' };
    return upstream(data.action === 'post' ? { post: item } : { reply: item });
  };
  const handle = createGuestHandler({ env, now, random: () => (++next).toString(16).padStart(64, '0'), fetchImpl, ...options });
  const context = { ip: '192.0.2.42' };
  const call = (route, requestOptions, ctx = context) => handle(req(route, requestOptions), ctx, route);
  async function boot(cookie) {
    const response = await call('session', { cookie });
    assert.equal(response.status, 200);
    const data = await response.json(), setCookie = response.headers.get('set-cookie');
    return { ...data, cookie: setCookie?.split(';')[0], setCookie };
  }
  return { handle, call, boot, clock, calls, context, profiles };
}

test('anonymous reads do not create guests; two browsers receive isolated private sessions', async () => {
  const f = fixture();
  const anonymous = await f.call('session', { method: 'GET' });
  assert.deepEqual(await anonymous.json(), { guest: null, csrfToken: null });
  assert.equal(anonymous.headers.get('set-cookie'), null);
  assert.equal(f.calls.length, 0);
  const a = await f.boot(), b = await f.boot();
  assert.notEqual(a.cookie, b.cookie);
  assert.notEqual(a.csrfToken, b.csrfToken);
  assert.notDeepEqual(a.guest, b.guest);
  for (const session of [a, b]) {
    assert.match(session.setCookie, /^__Host-btr-forum-guest=/);
    for (const directive of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=2592000']) assert.ok(session.setCookie.includes(directive));
    assert.equal(session.setCookie.includes('Domain='), false);
    const response = await f.call('session', { method: 'GET', cookie: session.cookie });
    assert.deepEqual(await response.json(), { guest: session.guest, csrfToken: session.csrfToken });
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('vary'), 'Cookie');
  }
  assert.equal(f.calls.at(-1).data.create, false);
});

test('signed bridge uses only trusted IP metadata, never account credentials or forwarded IP headers', async () => {
  const f = fixture(), session = await f.boot();
  const forged = { Authorization: 'Bearer private-account-token', 'X-Forwarded-For': '198.51.100.1', 'CF-Connecting-IP': '198.51.100.2', 'X-Real-IP': '198.51.100.3' };
  const response = await f.call('posts', { cookie: session.cookie + '; account=private-account-cookie', csrf: session.csrfToken, body: post(), headers: forged });
  assert.equal(response.status, 200);
  const data = await response.json(), sent = f.calls.at(-1);
  assert.equal(sent.data.clientKey, hmac(env.BTR_COMMUNITY_SESSION_SECRET, `client\n${Math.floor(f.clock.value / 86400000)}\n${f.context.ip}`));
  assert.equal(sent.init.body.includes(f.context.ip), false);
  assert.equal(JSON.stringify(sent).includes('private-account'), false);
  assert.deepEqual(Object.keys(data.post).sort(), ['id', 'body', 'name', 'handle', 'createdAt', 'likes', 'category', 'comments'].sort());
  assert.equal(JSON.stringify(data).includes('private'), false);
  assert.equal(JSON.stringify(data).includes(sent.data.guestToken), false);
  const before = f.calls.length;
  assert.equal((await f.call('posts', { cookie: session.cookie, csrf: session.csrfToken, body: post(), headers: forged }, {})).status, 503);
  assert.equal(f.calls.length, before);
});

test('same origin and JSON are enforced before session creation or writing', async () => {
  const f = fixture();
  for (const options of [
    { origin: 'https://attacker.invalid' }, { origin: '' },
    { url: 'https://preview.invalid/api/community/session' },
    { headers: { 'Sec-Fetch-Site': 'cross-site' } },
  ]) assert.equal((await f.call('session', options)).status, 403);
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'application/jsonp']) {
    assert.equal((await f.call('session', { headers: { 'Content-Type': type } })).status, 415);
  }
  assert.equal(f.calls.length, 0);
  assert.equal((await f.call('session', { headers: { 'Content-Type': 'application/json; charset=utf-8' } })).status, 200);
});

test('writes require the current guest CSRF token and never accept another browser token', async () => {
  const f = fixture(), a = await f.boot(), b = await f.boot(), before = f.calls.length;
  assert.equal((await f.call('posts', { body: post() })).status, 401);
  for (const csrf of [undefined, 'f'.repeat(64), b.csrfToken]) {
    const response = await f.call('posts', { cookie: a.cookie, csrf, body: post() });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'bad_csrf');
  }
  assert.equal(f.calls.length, before);
  assert.equal((await f.call('posts', { cookie: a.cookie, csrf: a.csrfToken, body: post() })).status, 200);
});

test('tampered, duplicate and expired cookies cannot resume or write; expiry is not renewed', async () => {
  const f = fixture(), session = await f.boot();
  const token = session.cookie.split('=')[1], [raw, expires, signature] = token.split('.');
  const forgedCookies = [
    `${COOKIE}=${'f'.repeat(64)}.${expires}.${signature}`,
    `${COOKIE}=${raw}.${Number(expires) + AGE}.${signature}`,
    `${COOKIE}=${raw}.${expires}.${'f'.repeat(64)}`,
    session.cookie + '.unexpected-suffix',
    session.cookie + '; ' + session.cookie,
    `${COOKIE}=malformed`,
  ];
  for (const cookie of forgedCookies) {
    assert.deepEqual(await (await f.call('session', { method: 'GET', cookie })).json(), { guest: null, csrfToken: null });
    assert.equal((await f.call('posts', { cookie, csrf: session.csrfToken, body: post() })).status, 401);
  }
  f.clock.value += 3600 * 1000;
  const resumed = await f.boot(session.cookie);
  assert.equal(resumed.cookie, session.cookie);
  assert.ok(resumed.setCookie.includes('Max-Age=' + (AGE - 3600)));
  f.clock.value = Number(expires) * 1000;
  assert.equal((await f.call('posts', { cookie: session.cookie, csrf: session.csrfToken, body: post() })).status, 401);
  assert.deepEqual(await (await f.call('session', { method: 'GET', cookie: session.cookie })).json(), { guest: null, csrfToken: null });
});

test('production configuration is required and preview contexts cannot mint guests', async () => {
  for (const badEnv of [
    { ...env, CONTEXT: 'deploy-preview' }, { ...env, CONTEXT: 'branch-deploy' },
    { ...env, BTR_COMMUNITY_BRIDGE_SECRET: 'short' }, { ...env, BTR_COMMUNITY_SESSION_SECRET: '' },
  ]) {
    const f = fixture({ env: badEnv });
    const response = await f.call('session');
    assert.equal(response.status, 503);
    assert.equal(f.calls.length, 0);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(JSON.stringify(await response.json()).includes('secret'), false);
  }
});

test('invalid shapes, URLs, excessive bodies and controls cannot become upstream mutations', async () => {
  const f = fixture(), session = await f.boot(), auth = { cookie: session.cookie, csrf: session.csrfToken }, before = f.calls.length;
  for (const body of [null, [], 'not-json', { guestToken: 'f'.repeat(64) }, { create: true }]) {
    assert.equal((await f.call('session', { body })).status, 400);
  }
  for (const body of [
    post({ body: '  ' }), post({ body: 'x'.repeat(2001) }), post({ body: 'a\u0000b' }),
    post({ requestId: 'https://attacker.invalid' }), post({ category: 'private' }),
    post({ guestToken: 'f'.repeat(64) }), post({ upstream: 'https://attacker.invalid' }),
  ]) assert.equal((await f.call('posts', { ...auth, body })).status, 400);
  assert.equal((await f.call('replies', { ...auth, body: { body: 'Reply', postId: 'https://attacker.invalid', requestId: replyId } })).status, 400);
  assert.equal((await f.call('session', { body: { padding: 'x'.repeat(13000) } })).status, 413);
  assert.equal((await f.call('posts', { ...auth, body: post(), url: SITE + '/api/community/posts?url=https://attacker.invalid' })).status, 400);
  assert.equal(f.calls.length, before);
});

test('post and reply retries preserve request IDs and normalized content without leaking internal fields', async () => {
  const f = fixture(), session = await f.boot(), auth = { cookie: session.cookie, csrf: session.csrfToken };
  for (let i = 0; i < 2; i++) {
    assert.equal((await f.call('posts', { ...auth, body: post({ requestId: id.toUpperCase(), body: '  A real draft  ' }) })).status, 200);
    const response = await f.call('replies', { ...auth, body: { requestId: replyId.toUpperCase(), postId: id.toUpperCase(), body: '  A reply  ' } });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.reply.id, replyId);
    assert.deepEqual(Object.keys(data.reply).sort(), ['id', 'body', 'name', 'handle', 'createdAt', 'likes', 'parent'].sort());
  }
  const writes = f.calls.filter(call => call.data.action !== 'session').map(call => call.data);
  assert.deepEqual(writes[0], writes[2]);
  assert.deepEqual(writes[1], writes[3]);
  assert.equal(writes[0].requestId, id);
  assert.equal(writes[0].body, 'A real draft');
  assert.equal(writes[1].postId, id);
  assert.equal(writes[1].body, 'A reply');
});

test('upstream rate limits and rejected writes retain status without issuing a new cookie', async () => {
  for (const status of [400, 401, 403, 404, 409, 429]) {
    const f = fixture({ respond: data => data.action === 'session' ? upstream({ guest: { name: 'Guest' } }) : upstream({ error: status === 429 ? 'Posting limit reached.' : 'Message unavailable.' }, status) });
    const session = await f.boot();
    const response = await f.call('posts', { cookie: session.cookie, csrf: session.csrfToken, body: post() });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('retry-after'), status === 429 ? '60' : null);
    assert.equal((await response.json()).code, status === 429 ? 'rate_limited' : 'message_rejected');
  }
});

test('unexpected upstream failures do not expose secrets or untrusted response objects', async () => {
  for (const bad of [
    () => { throw new Error('secret-server-detail'); },
    () => upstream({ error: 'secret-server-detail', token: env.BTR_COMMUNITY_BRIDGE_SECRET }, 500),
    () => new Response('<html>secret-server-detail</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('', { status: 302, headers: { Location: 'https://attacker.invalid' } }),
    () => upstream({ guest: null, token: env.BTR_COMMUNITY_SESSION_SECRET }),
  ]) {
    const f = fixture({ fetchImpl: bad });
    const response = await f.call('session');
    assert.equal(response.status, 503);
    const body = JSON.stringify(await response.json());
    for (const forbidden of ['secret-server-detail', env.BTR_COMMUNITY_BRIDGE_SECRET, env.BTR_COMMUNITY_SESSION_SECRET, 'attacker.invalid']) assert.equal(body.includes(forbidden), false);
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('bridge calls have a bounded deadline and interrupted requests retain a recoverable error', async () => {
  let aborted = false;
  const f = fixture({ timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('secret timeout details')); }, { once: true });
  }) });
  const response = await f.call('session');
  assert.equal(response.status, 503);
  assert.equal(aborted, true);
  assert.equal((await response.json()).code, 'community_unavailable');
});

test('route and method allowlists reject unused capabilities without upstream calls', async () => {
  const f = fixture();
  assert.equal((await f.call('moderation')).status, 404);
  for (const route of ['posts', 'replies']) {
    const response = await f.call(route, { method: 'GET' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
  }
  for (const method of ['PUT', 'DELETE', 'PATCH', 'OPTIONS']) assert.equal((await f.call('session', { method })).status, 405);
  assert.equal(f.calls.length, 0);
});
