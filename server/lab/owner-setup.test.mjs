import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createHandler } from './api.mjs';
import { createLab, MemoryStore } from './storefront-api.mjs';

const claimKey = 'auth/owner-setup-claim';
const password = () => crypto.randomBytes(24).toString('base64url');
function fixture({ store = new MemoryStore(), patch = {} } = {}) {
  let clock = Date.parse('2026-11-17T12:00:00.000Z');
  const bytes = crypto.randomBytes(32), token = bytes.toString('hex');
  const env = {
    LAB_SESSION_SECRET: crypto.randomBytes(48).toString('base64url'),
    LAB_SETUP_OWNER_EMAIL: ' Owner@Example.test ',
    LAB_SETUP_TOKEN_SHA256: crypto.createHash('sha256').update(bytes).digest('hex'),
    LAB_SETUP_EXPIRES_AT: new Date(clock + 60_000).toISOString(),
    ...patch,
  };
  const now = () => clock;
  const lab = createLab({ store, env, now });
  const handle = createHandler(() => lab, env);
  const request = async (method, route = 'setup-owner', input, headers = {}) => {
    const response = await handle({ method, url: new URL('https://shop.example.test/api/lab/' + route), headers,
      rawBody: input === undefined ? '' : JSON.stringify(input) });
    return { ...response, data: JSON.parse(response.body) };
  };
  return { store, token, env, lab, handle, request, now, advance: (ms) => { clock += ms; } };
}

test('runtime setup creates only the configured owner and existing login authenticates it', async () => {
  const f = fixture(), chosen = password();
  const status = await f.request('GET');
  assert.deepEqual(status.data, { available: true });
  assert.equal(status.headers['Cache-Control'], 'no-store');
  const response = await f.request('POST', 'setup-owner', { token: f.token, password: chosen, email: 'other@example.test', role: 'artist' });
  assert.equal(response.status, 201);
  assert.deepEqual(response.data, { ok: true, email: 'owner@example.test' });
  assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
  assert.deepEqual(await f.store.list('staff/'), ['staff/owner@example.test']);
  const saved = (await f.store.get('staff/owner@example.test')).value;
  assert.equal(saved.role, 'owner');
  assert.equal(saved.active, true);
  assert.match(saved.passwordHash, /^scrypt\$/);
  assert.equal(JSON.stringify(saved).includes(chosen), false);
  assert.equal(JSON.stringify((await f.store.get(claimKey)).value).includes(f.token), false);
  const login = await f.request('POST', 'admin/login', { email: 'OWNER@example.test', password: chosen });
  assert.equal(login.status, 200);
  assert.equal(login.data.role, 'owner');
  const me = await f.request('GET', 'admin/me', undefined, { authorization: 'Bearer ' + login.data.token });
  assert.deepEqual(me.data, { email: 'owner@example.test', role: 'owner' });
  assert.deepEqual((await f.request('GET')).data, { available: false });
});

test('invalid tokens and bounded invalid passwords never consume owner setup', async () => {
  const f = fixture();
  for (const token of [undefined, '', crypto.randomBytes(32).toString('hex'), [], f.token + '00']) {
    const r = await f.request('POST', 'setup-owner', { token, password: password() });
    assert.equal(r.status, 403);
    assert.equal(r.data.code, 'invalid_setup');
    assert.equal(r.body.includes('owner@example.test'), false);
  }
  for (const value of [undefined, null, 123, password().slice(0, 11), password().repeat(5)]) {
    const r = await f.request('POST', 'setup-owner', { token: f.token, password: value });
    assert.equal(r.status, 400);
  }
  for (const input of [null, []]) assert.equal((await f.request('POST', 'setup-owner', input)).status, 400);
  assert.equal(await f.store.get(claimKey), null);
  assert.deepEqual(await f.store.list('staff/'), []);
  assert.deepEqual((await f.request('GET')).data, { available: true });
});

test('expired, invalid or incomplete setup configuration is unavailable without revealing email', async () => {
  const patches = [
    { LAB_SETUP_EXPIRES_AT: '2026-11-17T12:00:00.000Z' },
    { LAB_SETUP_EXPIRES_AT: '2026-11-17T11:59:59.999Z' },
    { LAB_SETUP_EXPIRES_AT: '2027-02-30T12:00:00.000Z' },
    { LAB_SETUP_EXPIRES_AT: 'tomorrow' },
    { LAB_SETUP_EXPIRES_AT: '' },
    { LAB_SETUP_TOKEN_SHA256: 'invalid' },
    { LAB_SETUP_OWNER_EMAIL: 'invalid' },
    { LAB_SESSION_SECRET: '' },
    { LAB_BOOTSTRAP_OWNER: 'configured-legacy-bootstrap' },
  ];
  for (const patch of patches) {
    const f = fixture({ patch });
    assert.deepEqual((await f.request('GET')).data, { available: false });
    const r = await f.request('POST', 'setup-owner', { token: f.token, password: password() });
    assert.equal(r.status, 409);
    assert.equal(r.data.code, 'setup_unavailable');
    assert.equal(r.body.includes('owner@example.test'), false);
    assert.deepEqual(await f.store.list('staff/'), []);
  }
  const f = fixture();
  f.advance(60_000);
  assert.equal((await f.request('POST', 'setup-owner', { token: f.token, password: password() })).status, 409);
});

test('any existing staff record prevents first-owner setup and is never changed', async () => {
  for (const role of ['owner', 'artist']) {
    const f = fixture(), existing = { email: 'existing@example.test', role, active: false, passwordHash: 'unchanged-marker' };
    await f.store.set('staff/existing@example.test', existing);
    assert.deepEqual((await f.request('GET')).data, { available: false });
    assert.equal((await f.request('POST', 'setup-owner', { token: f.token, password: password() })).status, 409);
    assert.deepEqual((await f.store.get('staff/existing@example.test')).value, existing);
    assert.equal(await f.store.get(claimKey), null);
  }
});

test('replay remains denied after restart, token rotation, and removal of the created staff record', async () => {
  const f = fixture();
  assert.equal((await f.request('POST', 'setup-owner', { token: f.token, password: password() })).status, 201);
  assert.equal((await f.request('POST', 'setup-owner', { token: f.token, password: password() })).status, 409);
  await f.store.delete('staff/owner@example.test');
  const restarted = fixture({ store: f.store });
  assert.deepEqual((await restarted.request('GET')).data, { available: false });
  assert.equal((await restarted.request('POST', 'setup-owner', { token: restarted.token, password: password() })).status, 409);
  assert.deepEqual(await f.store.list('staff/'), []);
});

test('concurrent independent runtime instances create exactly one owner with the winning password', async () => {
  const f = fixture(), passwords = [password(), password()];
  const other = createHandler(() => createLab({ store: f.store, env: f.env, now: f.now }), f.env);
  const responses = await Promise.all([f.handle, other].map((handle, index) => handle({
    method: 'POST', url: new URL('https://shop.example.test/api/lab/setup-owner'), headers: {},
    rawBody: JSON.stringify({ token: f.token, password: passwords[index] }),
  })));
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  assert.deepEqual(await f.store.list('staff/'), ['staff/owner@example.test']);
  const winner = responses.findIndex(r => r.status === 201);
  assert.equal((await f.request('POST', 'admin/login', { email: 'owner@example.test', password: passwords[winner] })).status, 200);
  assert.equal((await f.request('POST', 'admin/login', { email: 'owner@example.test', password: passwords[1 - winner] })).status, 401);
});

test('conditional staff creation never overwrites an account appearing after the availability check', async () => {
  const existing = { email: 'owner@example.test', role: 'artist', active: true, passwordHash: 'unchanged-marker' };
  class ContendedStore extends MemoryStore {
    async set(key, value, options = {}) {
      if (key === 'staff/owner@example.test' && options.ifNew) await super.set(key, existing);
      return super.set(key, value, options);
    }
  }
  const f = fixture({ store: new ContendedStore() });
  assert.equal((await f.request('POST', 'setup-owner', { token: f.token, password: password() })).status, 409);
  assert.deepEqual((await f.store.get('staff/owner@example.test')).value, existing);
  assert.deepEqual((await f.request('GET')).data, { available: false });
});

test('creation failure after the atomic claim fails closed instead of allowing password replacement', async () => {
  class FailingStore extends MemoryStore {
    async set(key, value, options) {
      if (key.startsWith('staff/')) throw new Error('simulated unavailable store');
      return super.set(key, value, options);
    }
  }
  const f = fixture({ store: new FailingStore() });
  await assert.rejects(() => f.lab.setupOwner({ token: f.token, password: password() }), /simulated unavailable/);
  assert.deepEqual(await f.lab.ownerSetupStatus(), { available: false });
  await assert.rejects(() => f.lab.setupOwner({ token: f.token, password: password() }), e => e.code === 'setup_unavailable');
});

test('setup rejects cross-origin submissions and oversized bodies before consuming the token', async () => {
  const f = fixture(), body = { token: f.token, password: password() };
  for (const headers of [{ origin: 'https://other.example.test' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await f.request('POST', 'setup-owner', body, headers)).status, 403);
    assert.equal((await f.request('POST', '/setup-owner', body, headers)).status, 403);
  }
  assert.equal((await f.request('POST', 'setup-owner', { ...body, unused: 'x'.repeat(2048) })).status, 413);
  assert.equal((await f.request('POST', '/setup-owner', { ...body, unused: 'x'.repeat(2048) })).status, 413);
  assert.deepEqual((await f.request('GET')).data, { available: true });
  assert.equal((await f.request('POST', 'setup-owner', body, { origin: 'https://shop.example.test', 'sec-fetch-site': 'same-origin' })).status, 201);
});
