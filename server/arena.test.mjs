// The online arena sword: a tapped slash and a held heavy lunge (the client's shared melee rule, melee-core.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createArena} from './arena.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// createArena starts a respawn timer; remember the timers it starts so each test can stop them.
const timers = [], nativeSetInterval = globalThis.setInterval;
globalThis.setInterval = (...args) => { const id = nativeSetInterval(...args); timers.push(id); return id; };
const stopTimers = () => { while (timers.length) clearInterval(timers.pop()); };

function setup() {
  const presence = new Map(), events = [];
  const arena = createArena({root, presence, emit: list => events.push(...list)});
  const [cx, cz] = arena.layout.center;
  const fighter = (id, x, z, yaw) => {
    const p = {userId: 'u-' + id, pose: {x: cx + x, z: cz + z, yaw}};
    presence.set(id, p);
    arena.pose(p, {zone: 'arena', x: cx + x, z: cz + z, weapon: 'sword'});
    return p;
  };
  // a faces +z (yaw 0) toward b, 2 m away; b faces a.
  const a = fighter('a', 0, 0, 0), b = fighter('b', 0, 2, Math.PI);
  return {arena, events, a, b, rules: arena.layout.rules.sword, hits: () => events.filter(e => e.type === 'hit')};
}

test('a heavy swing hits harder than a slash and is flagged for the clients', t => {
  const s = setup();
  t.after(stopTimers);
  s.arena.action('a', s.a, {t: 'attack'});
  assert.equal(s.hits()[0].amount, s.rules.damage);
  assert.equal(s.hits()[0].weapon, 'sword');
  s.a.arena.lastSwing -= 2000;
  s.arena.action('a', s.a, {t: 'attack', heavy: true});
  assert.equal(s.hits()[1].amount, s.rules.heavyDamage);
  assert.equal(s.hits()[1].weapon, 'sword-heavy');
  assert.equal(s.events.filter(e => e.type === 'swing')[1].heavy, true);
});

test('a heavy swing keeps its longer cooldown; a blocked heavy pushes more through', t => {
  const s = setup();
  t.after(stopTimers);
  s.arena.action('a', s.a, {t: 'attack', heavy: true});
  s.a.arena.lastSwing -= s.rules.cooldownMs + 10;          // long enough for a slash, not after a heavy
  s.arena.action('a', s.a, {t: 'attack'});
  assert.equal(s.hits().length, 1, 'still recovering from the heavy');
  s.a.arena.lastSwing -= s.rules.heavyCooldownMs;
  s.arena.pose(s.b, {zone: 'arena', x: s.b.pose.x, z: s.b.pose.z, weapon: 'sword', blocking: true});
  s.arena.action('a', s.a, {t: 'attack', heavy: true});
  assert.equal(s.hits()[1].weapon, 'sword-blocked');
  assert.equal(s.hits()[1].amount, s.rules.heavyBlockedDamage);
});
