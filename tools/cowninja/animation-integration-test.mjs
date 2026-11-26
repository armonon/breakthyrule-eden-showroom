import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { animationPath, clearAnimationPath, pairedAnchor } from '../../cowninja/animation-path.js';

const root = new URL('../../', import.meta.url);
const source = name => readFileSync(new URL(name, root), 'utf8');
const durations = { pkClimb: 1.1333, pkLadderExit: 4, stealthAssassin: 7, stealthVictim: 7 };
function harness() {
  const s = vm.createContext({ console, performance, structuredClone, URL, TextDecoder, TextEncoder, location: { href: 'http://localhost/' } }); s.window = s;
  for (const file of ['assets/three.min.js', 'expedition-world.js', 'movement-state.js', 'player-motion.js', 'parkour.js', 'player-movement.js', 'expedition-controller.js']) vm.runInContext(source(file), s);
  const T = s.THREE, animations = [], layers = [];
  Object.assign(s, { animationPath, clearAnimationPath });
  const motion = {
    traversal(move) { animations.push(move ? { ...move } : null); }, stop(id) { for (const l of layers) if (!id || l.id === id) l.out = true; },
    play(id, options = {}) { const l = { id, dur: durations[id] || 1, t: 0, ...options }; layers.push(l); return l; },
    airborne() {}, crouch() {}, guard() {}, touch() {}, lookAt() {}, update() {},
  };
  const person = { root: new T.Group(), motion };
  s.createNinja = () => ({ person, dress() {} });
  s.GardenAnim = { has: () => true, duration: id => durations[id] || 1 };
  s.GardenCharacterMotion = { traverseBody: (T, p, o) => { p.motion.traversal(o.pose.traversal); return { handRise: 0, handsOn: false }; } };
  const text = source('cowninja/foot.js').replace(/^import .*;\n/gm, '').replace('export function createFoot', 'function createFoot');
  vm.runInContext(text, s);
  const world = { spawn: { x: 0, z: 0 }, solids: [], grips: [], bounds: [-30, 30, -30, 30], hay: [],
    solidAt(x, y, z, pad = .15) { return this.solids.some(b => x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad && y > b.bottom - pad && y < b.top + pad); },
  };
  const scene = new T.Group(), effects = [];
  const make = () => s.createFoot({ scene, world, onEffect: e => effects.push(e) });
  return { s, T, world, make, animations, layers, effects, person };
}
const held = (...keys) => new Set(keys);

test('pipe ascent advances one controller tick and presents its actual travel pace', () => {
  const h = harness(); h.world.grips.push({ type: 'pipe', x: 0, z: .5, y0: 0, y1: 10, n: [0, -1] });
  const f = h.make(); f.enter(0, 0, 0); f.step(held('space'), 0);
  assert.equal(f.state.movement, 'pipe');
  for (let i = 0; i < 60; i++) {
    const tick = f.controller.tick, y = f.state.y;
    f.step(held('w'), 0);
    assert.equal(f.controller.tick - tick, 1, 'the ladder does not receive a second climb tick');
    assert.equal(h.animations.at(-1).kind, 'pipe');
    assert.ok(Math.abs(h.animations.at(-1).travelSpeed - (f.state.y - y) * 60) < 1e-8);
  }
  assert.equal(h.layers.some(layer => layer.id === 'cnLadder'), false, 'the merged COWNinja ladder bake does not stack over shared traversal');
});

test('the merged hay-leap animation uses the shared jump transition when available', () => {
  const h = harness(); h.world.hay.push([0, 3, 2]);
  const f = h.make(); f.enter(0, 0, 0);
  f.controller.reset({ x: 0, y: 4, z: 0, yaw: 0, nextTick: f.controller.tick }); f.controller.motion.set(4, -3);
  f.step(held(), 0);
  assert.ok(f.state.airborne);
  assert.equal(h.animations.at(-1).kind, 'warp'); assert.equal(h.animations.at(-1).action, 'leap');
  assert.equal(h.layers.some(layer => layer.id === 'cnLeap'), false, 'the incoming hay leap feature shares the normal transition layer');
});

test('free wall climb sends actual vertical, lateral and idle motion to shared authored traversal', () => {
  const h = harness(); h.world.solids.push({ minX: -8, maxX: 8, minZ: .6, maxZ: 2.6, bottom: 0, top: 12 });
  h.person.motion.bindHipHeight = () => .865407;
  const f = h.make(); f.enter(0, 0, 0);
  for (let i = 0; i < 25; i++) f.step(held('w', 'shift'), 0);
  assert.equal(f.state.movement, 'wallclimb'); assert.ok(f.state.y > 0);
  assert.equal(h.animations.at(-1).kind, 'wallclimb'); assert.equal(h.animations.at(-1).vertical, 1);
  assert.ok(Math.abs(h.animations.at(-1).speed - 2.5 / (.865407 * .60398)) < 1e-9, 'climb stride matches controller meters per second and fitted hip height');
  const before = { ...f.state }; f.step(held(), 0);
  assert.equal(h.animations.at(-1).moving, false); assert.equal(f.state.y, before.y);
  f.step(held('s'), 0); assert.equal(h.animations.at(-1).vertical, -1); assert.ok(f.state.y < before.y);
  const x = f.state.x; f.step(held('d'), 0);
  assert.equal(h.animations.at(-1).lateral, 1); assert.ok(f.state.x < x, 'D follows camera-right and the right-shimmy clip');
  assert.ok(Math.abs(h.animations.at(-1).speed - 1.7 / (.865407 * .48516859)) < 1e-9, 'lateral stride uses the distinct shimmy travel');
  f.step(held('a'), 0); assert.equal(h.animations.at(-1).lateral, -1);
  assert.equal(h.layers.some(l => l.id === 'climbUp'), false, 'short legacy mantle is not looped');
});

test('free-climb top exit interpolates through a timed mantle instead of teleporting', () => {
  const h = harness(); h.world.solids.push({ minX: -4, maxX: 4, minZ: .6, maxZ: 3, bottom: 0, top: 4 });
  const f = h.make(); f.enter(0, 0, 0);
  let sawMantle = false, completed = false, last = { x: 0, y: 0, z: 0 }, maxStep = 0;
  for (let i = 0; i < 300; i++) {
    f.step(held('w', 'shift'), 0);
    maxStep = Math.max(maxStep, Math.hypot(f.state.x - last.x, f.state.y - last.y, f.state.z - last.z)); last = { ...f.state };
    if (f.state.busy && f.state.movement === 'climb') {
      sawMantle = true;
      assert.equal(h.world.solidAt(f.state.x, f.state.y + .35, f.state.z, .24), false, 'the rising capsule clears the lip before moving across it');
    }
    if (sawMantle && !f.state.busy) { completed = true; break; }
  }
  assert.ok(sawMantle && completed, 'a real wall contact reaches and completes the mantle');
  assert.ok(maxStep < .3, `root displacement remains bounded per tick (${maxStep})`);
  assert.ok(Math.abs(f.state.y - 4) < 1e-6); assert.ok(f.state.z > .6);
  const poses = h.animations.filter(a => a?.kind === 'climb');
  assert.ok(poses.length > 30); assert.equal(poses.at(-1).time, poses.at(-1).duration);
  assert.equal(h.effects.filter(e => e.kind === 'footstep:land').length, 1);
});

test('wall release and kick-off preserve height before shared gravity resumes', () => {
  for (const key of ['crouch', 'space']) {
    const h = harness(); h.world.solids.push({ minX: -4, maxX: 4, minZ: .6, maxZ: 3, bottom: 0, top: 12 });
    const f = h.make(); f.enter(0, 0, 0);
    for (let i = 0; i < 60; i++) f.step(held('w', 'shift'), 0);
    const y = f.state.y; assert.ok(y > 2);
    f.step(held(key), 0); assert.ok(f.state.airborne); assert.equal(f.state.y, y);
    f.step(held('s'), 0); assert.ok(f.state.y > y - .1, 'walking does not reset an elevated release to ground');
    const tr = h.animations.at(-1);
    assert.equal(tr.kind, key === 'space' ? 'warp' : 'hangdrop');
    if (key === 'space') assert.ok(f.state.velocity.y > 0); else assert.ok(f.state.velocity.y < 0);
  }
});

test('paired action uses one normalized clock, suppresses movement, and supports cancellation', () => {
  const h = harness(), f = h.make(); f.enter(0, 0, 0);
  const times = []; let done = 0, cancelled = 0;
  assert.ok(f.beginAction({ x: .4, z: .2, yaw: .8, duration: 1, onProgress: t => times.push(t), onFinish: () => done++, onCancel: () => cancelled++ }));
  assert.equal(f.beginAction({ x: 0, z: 0, yaw: 0, duration: 1 }), false, 'cannot overlap an action');
  for (let i = 0; i < 100 && !done; i++) f.step(held('w', 'space', 'shift'), 0);
  assert.equal(done, 1); assert.equal(cancelled, 0); assert.equal(times.at(-1), 1);
  assert.ok(times.every((t, i) => i === 0 || t >= times[i - 1]));
  assert.ok(Math.abs(f.state.x - .4) < 1e-8 && Math.abs(f.state.z - .2) < 1e-8, 'held movement cannot pull the attacker from the pair');
  const layer = h.layers.find(l => l.id === 'stealthAssassin');
  assert.equal(layer.t, 7); assert.equal(layer.speed, 0); assert.equal(layer.hold, true); assert.equal(layer.arms, true);
  assert.equal(f.state.busy, false);
  assert.ok(f.beginAction({ x: .4, z: .2, yaw: .8, duration: 1, onCancel: () => cancelled++ }));
  f.leave(); assert.equal(cancelled, 1); assert.equal(f.state.busy, false);
});

test('paired alignment rejects obstructions and a lost victim cancels without completing', () => {
  const h = harness(), f = h.make(); f.enter(0, 0, 0);
  h.world.solids.push({ minX: .2, maxX: .4, minZ: -.5, maxZ: .5, bottom: 0, top: 3 });
  assert.equal(f.beginAction({ x: .8, z: 0, yaw: 0, duration: 1 }), false);
  h.world.solids.length = 0;
  let cancelled = 0, finished = 0;
  assert.ok(f.beginAction({ x: 0, z: .2, yaw: 0, duration: 1, valid: () => false, onCancel: () => cancelled++, onFinish: () => finished++ }));
  f.step(held(), 0); assert.equal(cancelled, 1); assert.equal(finished, 0); assert.equal(f.state.busy, false);
});

test('victim stays frozen, shares the attacker clock, and hands its final pose to a settled ragdoll once', () => {
  const h = harness(), updates = [], events = [], starts = [];
  const vMotion = { stop() {}, airborne() {}, crouch() {}, guard() {}, touch() {}, play(id, opts) { this.layer = { id, dur: 7, t: 0, ...opts }; return this.layer; }, update(dt, opts) { updates.push({ dt, t: this.layer?.t, opts }); } };
  h.s.GardenCharacter = { create: () => ({ root: new h.T.Group(), skeleton: {}, motion: vMotion }) };
  h.s.createRagdoll = () => ({ start: o => starts.push(o), apply() {}, pelvis: () => ({ y: 1 }), velocity: () => ({ x: 0, z: 0 }) });
  vm.runInContext(source('cowninja/farmers.js').replace(/^import .*;\n/gm, '').replace('export function createFarmers', 'function createFarmers'), h.s);
  const world = { patrols: [[[0, 0], [3, 0]]], solidAt: () => false, walk(p, x, z) { p.x += x; p.z += z; return true; } };
  const api = h.s.createFarmers({ scene: new h.T.Group(), physics: { world: {} }, world, cow: { state: { x: 0, z: -1, forward: new h.T.Vector3(), velocity: new h.T.Vector3(), speed: 0 } }, onEvent: e => events.push(e) });
  const farmer = api.farmers[0];
  assert.ok(api.beginTakedown(farmer)); assert.equal(api.beginTakedown(farmer), false);
  api.poseTakedown(farmer, .5); api.update(1 / 30, 1, true);
  assert.equal(vMotion.layer.t, 3.5); assert.equal(farmer.p.x, 0); assert.equal(farmer.p.z, 0); assert.equal(api.nearest(0, 0), null);
  assert.equal(events.length, 0, 'a seized farmer does not spot or stab the player');
  api.cancelTakedown(farmer); assert.equal(farmer.state, 'patrol'); assert.equal(farmer.fork.visible, true);
  assert.ok(api.beginTakedown(farmer)); api.finishTakedown(farmer); api.finishTakedown(farmer);
  assert.equal(events.length, 1); assert.equal(events[0].by, 'takedown'); assert.equal(farmer.state, 'out');
  assert.equal(updates.at(-1).t, 7); assert.equal(updates.at(-1).dt, 0);
  assert.equal(starts.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(starts[0].velocity)), { x: 0, y: 0, z: 0 });
  assert.deepEqual(Array.from(starts[0].impulse(1).toArray()), [0, 0, 0]);
});

test('cropped paired root tracks rebase, rotate, and preserve the source contact separation', () => {
  const model = { userData: { animBindHipY: 1 }, root: { scale: { y: 1 } } };
  const anim = { duration: () => 7, rootOffset: (id, t) => ({ x: 0, z: id === 'stealthAssassin' ? t * .8 : t * .1 }) };
  const anchor = pairedAnchor(anim, model, model, { x: 2, z: 3, yaw: 0, start: 2 });
  assert.ok(Math.abs(anchor.z - 2.57) < 1e-9, 'source approach is subtracted from the original 1.83 hip-height spacing');
  const p = animationPath(anim, 'stealthAssassin', model, { x: 2, z: 3, yaw: Math.PI / 2, start: 2, end: 7 });
  assert.deepEqual(p.sample(0), { x: 2, z: 3, time: 2 });
  const end = p.sample(1); assert.ok(Math.abs(end.x - 6) < 1e-9 && Math.abs(end.z - 3) < 1e-9);
  assert.equal(clearAnimationPath({ solidAt: (x) => x > 3 && x < 3.04 }, p, 0), false, 'swept paths catch a thin obstruction between endpoints');
  assert.equal(clearAnimationPath({ solidAt: () => false }, p, 0), true);
});

test('attacker root track reaches the controller final position without an exit snap', () => {
  const h = harness(); h.s.GardenAnim.rootOffset = (id, t) => ({ x: .05 * t, z: .2 * t });
  const f = h.make(); f.enter(0, 0, 0);
  const times = []; let done = false;
  assert.ok(f.beginAction({ x: .2, z: .1, yaw: 0, duration: 1, sourceStart: 2, sourceEnd: 7, onProgress: t => times.push(t), onFinish: () => { done = true; } }));
  for (let i = 0; i < 100 && !done; i++) f.step(held(), 0);
  assert.ok(done); assert.ok(Math.abs(f.state.x - .45) < 1e-9); assert.ok(Math.abs(f.state.z - 1.1) < 1e-9);
  const finish = { x: f.state.x, z: f.state.z }; f.step(held(), 0);
  assert.ok(Math.hypot(f.state.x - finish.x, f.state.z - finish.z) < 1e-9, 'controller resumes where authored motion ended');
  assert.equal(h.layers.find(l => l.id === 'stealthAssassin').t, 7);
});

test('paired paths use the fitted Rocketbox bind height through the character holder', () => {
  const h = harness(), s = h.s, T = h.T;
  delete s.GardenAnim;
  for (const file of ['character-rocketbox.js', 'character-motion.js', 'character-model.js']) vm.runInContext(source(file), s);
  const binary = readFileSync(new URL('assets/characters/midnight/mesh.bin', root));
  const mesh = JSON.parse(binary.subarray(4, 4 + binary.readUInt32LE(0)).toString());
  const buildRig = s.GardenCharacterRocketbox.buildRig;
  // Use the actual fitted character holder and actual shaped skeleton; GPU meshes and textures do not affect this contract.
  Object.assign(s.GardenCharacterRocketbox, { loaded: () => true, build: (T, id, a, group) => buildRig(T, mesh, a, group) });
  const model = s.GardenCharacter.create(T, { character: 'midnight', height: 176, weight: 70, build: .4, shoulders: 1, waist: 1, hips: 1, legLength: 1 });
  const rootIndex = model.skeleton.bones.findIndex(b => b.name === 'root');
  const bindY = model.skeleton.boneInverses[rootIndex].clone().invert().elements[13];
  assert.ok(bindY > .7 && bindY < 1.2, 'actual Rocketbox hips are measured in meters');
  const physicalHip = bindY * model.root.scale.y;
  assert.ok(Math.abs(model.motion.bindHipHeight() - physicalHip) < 1e-9);
  model.userData = { animBindHipY: 23 }; // stale classic-holder metadata must not control root travel
  model.skeleton.bones[rootIndex].position.y = .2; // an animated crouch must not shorten the authored path
  const anim = { duration: () => 1, rootOffset: (id, t) => ({ x: 0, z: t }) };
  const path = animationPath(anim, 'stealthAssassin', model, { x: 0, z: 0, yaw: 0 });
  assert.ok(Math.abs(path.sample(1).z - physicalHip) < 1e-9);
  model.root.scale.multiplyScalar(1.25);
  assert.ok(Math.abs(model.motion.bindHipHeight() - physicalHip * 1.25) < 1e-9, 'current character scale is applied to immutable bind height');
  const anchor = pairedAnchor(anim, model, model, { x: 0, z: 0, yaw: 0, start: 0 });
  assert.ok(Math.abs(anchor.z + 1.83 * physicalHip * 1.25) < 1e-9);
});
