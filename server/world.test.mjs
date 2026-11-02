// node --test server/world.test.mjs
// Unit tests for the shared garden state, plus an end-to-end run against a real server process: two accounts,
// a live socket each, a shared weather pull, a ladder result and saved progress.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWorld} from './world.mjs';

function makeWorld() {
  const store = {users: {a: {id: 'a', name: 'Ada', character: {}}, b: {id: 'b', name: 'Bo', character: null}}};
  const emitted = [];
  const world = createWorld({store, save() {}, allow: () => true, emit: p => emitted.push(p)});
  return {store, world, emitted};
}

test('progress is cleaned and only ever grows', () => {
  const {world: {_test: t}} = makeWorld();
  assert.deepEqual(t.cleanProgress({glitches: ['sun', 'sun', 'nope'], found: ['tree', 'x'], toll: true, wraps: 'yes', roadMeters: 12.6, evil: 1}),
    {glitches: ['sun'], found: ['tree'], toll: true, roadMeters: 13});
  const merged = t.mergeProgress({glitches: ['sun'], toll: true, roadMeters: 50}, {glitches: ['bird'], found: ['road'], roadMeters: 10});
  assert.deepEqual(merged, {glitches: ['sun', 'bird'], found: ['road'], toll: true, roadMeters: 50});
});

test('weather needs a character, a valid stage and a change', () => {
  const {store, world, emitted} = makeWorld();
  world.weather(store.users.b, {stage: 1}); assert.equal(emitted.length, 0, 'ghosts cannot pull the lever');
  world.weather(store.users.a, {stage: 0.3}); assert.equal(emitted.length, 0, 'only day, dusk or night');
  world.weather(store.users.a, {stage: 0.5}); assert.equal(emitted.at(-1).weather.stage, 0.5);
  assert.equal(emitted.at(-1).weather.by, 'Ada');
  world.weather(store.users.a, {stage: 0.5}); assert.equal(emitted.length, 1, 'no event when nothing changes');
});

test('ladder validates results and ranks wins, then fastest knockout', () => {
  const {store, world} = makeWorld();
  store.users.c = {id: 'c', name: 'Cy', character: {}};
  assert.throws(() => world.ladder(store.users.b, {result: 'win', seconds: 20}), /character/);
  assert.throws(() => world.ladder(store.users.a, {result: 'win', seconds: 1}), /could not be recorded/);
  world.ladder(store.users.a, {result: 'win', seconds: 40});
  world.ladder(store.users.c, {result: 'win', seconds: 25});
  world.ladder(store.users.a, {result: 'loss', seconds: 120});
  const top = world.state().ladder;
  assert.deepEqual(top.map(r => [r.name, r.wins, r.best, r.losses]), [['Cy', 1, 25, 0], ['Ada', 1, 40, 1]]);
});

// ---------- end to end ----------
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function startServer() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'eden-world-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'eden-server.mjs'), '--port', String(port), '--data', data], {stdio: ['ignore', 'pipe', 'pipe']});
  await new Promise((resolve, reject) => { child.stdout.on('data', d => String(d).includes('Eden server') && resolve()); child.on('exit', reject); setTimeout(() => reject(new Error('server did not start')), 8000); });
  return {base: `http://127.0.0.1:${port}`, child, data};
}
function client(base) {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    async call(action, body) {
      const res = await fetch(base + '/api/social/' + action, {method: body === undefined ? 'GET' : 'POST', headers: {'Content-Type': 'application/json', cookie}, body: body === undefined ? undefined : JSON.stringify(body)});
      const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
      return {status: res.status, data: await res.json()};
    }
  };
}
function live(base, cookie) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/api/social/live?connectionId=' + crypto.randomUUID(), {headers: {cookie}});
  const messages = [];
  ws.onmessage = e => messages.push(JSON.parse(e.data));
  const opened = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const waitFor = (predicate, ms = 4000) => new Promise((resolve, reject) => {
    const started = Date.now(), tick = () => { const m = messages.find(predicate); if (m) return resolve(m); if (Date.now() - started > ms) return reject(new Error('timed out')); setTimeout(tick, 25); }; tick();
  });
  return {ws, opened, waitFor, messages};
}

test('end to end: shared weather, ladder and progress', async t => {
  const server = await startServer();
  t.after(() => { server.child.kill(); fs.rmSync(server.data, {recursive: true, force: true}); });
  const a = client(server.base), b = client(server.base);
  assert.equal((await a.call('register', {name: 'Ada Lovelace', password: 'correct horse'})).status, 200);
  assert.equal((await b.call('register', {name: 'Bo Diddley', password: 'correct horse'})).status, 200);
  for (const c of [a, b]) assert.equal((await c.call('character', {character: {version: 1, skinTone: '#ba8564'}})).status, 200);

  const la = live(server.base, a.cookie), lb = live(server.base, b.cookie);
  await Promise.all([la.opened, lb.opened]);
  const first = await lb.waitFor(m => m.t === 'world');
  assert.equal(first.weather.stage, 0, 'new joiners get the current world at once');

  la.ws.send(JSON.stringify({t: 'weather', stage: 1}));
  const changed = await lb.waitFor(m => m.t === 'world' && m.weather.stage === 1);
  assert.equal(changed.weather.by, 'Ada Lovelace', 'the other visitor sees who pulled the lever');

  const bout = await a.call('ladder', {result: 'win', seconds: 31.24});
  assert.equal(bout.status, 200);
  assert.deepEqual(bout.data.record, {wins: 1, losses: 0, best: 31.2});
  const broadcastLadder = await lb.waitFor(m => m.t === 'world' && m.ladder.length === 1);
  assert.equal(broadcastLadder.ladder[0].name, 'Ada Lovelace');
  assert.equal((await a.call('ladder', {result: 'win', seconds: 20})).status, 429, 'one bout at a time');

  const saved = await a.call('progress', {progress: {glitches: ['sun', 'bird'], found: ['tree'], wraps: true, roadMeters: 140}});
  assert.equal(saved.status, 200);
  const again = await a.call('progress', {progress: {glitches: ['seams'], roadMeters: 3}});
  assert.deepEqual(again.data.progress, {glitches: ['sun', 'bird', 'seams'], found: ['tree'], wraps: true, roadMeters: 140});
  const me = await a.call('me');
  assert.deepEqual(me.data.user.progress.found, ['tree'], 'progress comes back with the account');
  assert.equal((await client(server.base).call('progress', {progress: {}})).status, 401, 'guests cannot save progress');
  const world = await b.call('world');
  assert.equal(world.data.weather.stage, 1);

  la.ws.close(); lb.ws.close();
});
