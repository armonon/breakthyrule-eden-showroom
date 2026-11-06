// Side-by-side comparison of the hand-written ragdoll and the Jolt prototype. Time advances in fixed steps, so a busy
// machine changes how long a run takes but not what it computes.
import { createJoltWorld, createRagdoll } from '/ragdoll-jolt.js';

const T = window.THREE, STEP = 1 / 60, SPACING = 1.25, WALL_Z = -.75;
const out = document.getElementById('out');
const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); document.body.prepend(renderer.domElement);
const scene = new T.Scene(); scene.background = new T.Color('#c9d2cf');
const camera = new T.PerspectiveCamera(42, 1, .05, 80);
scene.add(new T.HemisphereLight('#ffffff', '#77705f', 1.6));
const sun = new T.DirectionalLight('#ffffff', 1.5); sun.position.set(2, 5, 4); scene.add(sun);
const floor = new T.Mesh(new T.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ color: '#9b9f96' })); scene.add(floor);
const wallMesh = new T.Mesh(new T.BoxGeometry(12, 3, .3), new T.MeshLambertMaterial({ color: '#b9855f' })); wallMesh.position.set(0, 1.5, WALL_Z - .15); wallMesh.visible = false; scene.add(wallMesh);

function view(z = 4.4, y = 1.1) { camera.position.set(0, y + .35, z); camera.lookAt(0, y * .62, 0); }
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 68 : 42; camera.updateProjectionMatrix(); draw(); }
function draw() { renderer.render(scene, camera); }
addEventListener('resize', resize);

const look = id => ({ version: 1, character: id, height: 178, weight: 76, build: .4, shoulders: 1, waist: 1, hips: 1, legLength: 1 });
async function person(id, x, z = 0) { const a = look(id); await GardenCharacter.load(a); const model = GardenCharacter.create(T, a); model.root.position.set(x, 0, z); scene.add(model.root); model.motion.update(STEP, {}); return model; }

const world = await createJoltWorld();
world.box([0, -.5, 0], [30, .5, 30]);
const left = await person('harbor', -SPACING / 1), right = await person('boulevard', SPACING / 1), joltBody = createRagdoll(world, T, right);
let wall = null, state = 'idle', clock = 0, peak = null, drive = 1, limp = false, recover = 0, snapshot = null, snapRoot = new T.Vector3();
const sideHit = (strength, z) => y => { const h = Math.min(Math.max(y / 1.6, 0), 1), s = (.63 + 1.8 * h) * strength; return new T.Vector3(0, -.5 * strength * h, z * s); };

function setWall(on) {
  wallMesh.visible = on; wall?.remove(); wall = on ? world.box([0, 1.5, WALL_Z - .15], [6, 1.5, .15]) : null;
  GardenCharacterMotion.solid = on ? p => p.z < WALL_Z : null;
}
function rendered(model) { model.root.updateMatrixWorld(true); const v = new T.Vector3(); return model.skeleton.bones.filter(b => !/^(thumb|index|middle|ring|pinky)/.test(b.name)).map(b => [b.name, b.getWorldPosition(v.clone())]); }
function kneeForward(model) {
  // Degrees a shin has bent forward past straight: human knees allow none.
  let worst = 0;
  for (const s of ['L', 'R']) { const shin = model.byName['lowerleg01.' + s], rest = model.byName['foot.' + s].position.clone().normalize(), d = rest.clone().applyQuaternion(shin.quaternion); worst = Math.max(worst, (Math.atan2(d.z, -d.y) - Math.atan2(rest.z, -rest.y)) * 180 / Math.PI); }
  return worst;
}
function elbowBack(model) {
  // Degrees an elbow has bent away from the arm's natural direction.
  let worst = 0; const q = new T.Quaternion();
  for (const s of ['L', 'R']) { const fore = model.byName['lowerarm01.' + s]; q.copy(fore.quaternion); const axis = model.byName['wrist.' + s].position.clone().normalize(), bent = axis.clone().applyQuaternion(q), forward = new T.Vector3(0, 0, 1).addScaledVector(axis, -axis.z).normalize(), a = Math.atan2(bent.clone().cross(axis).length(), bent.dot(axis)) * 180 / Math.PI; if (bent.dot(forward) < 0) worst = Math.max(worst, a); }
  return worst;
}
function fresh() { peak = { current: { wall: 0, ground: 0, knee: 0, elbow: 0 }, jolt: { wall: 0, ground: 0, knee: 0, elbow: 0, gap: 0 } }; }
function measure(name, model) {
  const m = peak[name];
  for (const [bone, p] of rendered(model)) { m.ground = Math.max(m.ground, .0 - p.y); if (wall) m.wall = Math.max(m.wall, WALL_Z - p.z); if (!Number.isFinite(p.x + p.y + p.z)) m.nan = true; }
  m.knee = Math.max(m.knee, kneeForward(model)); m.elbow = Math.max(m.elbow, elbowBack(model));
}
const timings = { current: [], jolt: [] };
function tick() {
  clock += STEP;
  let t = performance.now(); left.motion.update(STEP, {}); timings.current.push(performance.now() - t);
  if (state === 'idle') { right.motion.update(STEP, {}); joltBody.remember(); return; }
  if (state === 'limp' || state === 'active') {
    right.motion.update(STEP, {}); // procedural target (and overwritten below)
    let force = 0;
    t = performance.now();
    if (state === 'active' && !limp) { drive = Math.min(1, .35 + clock * 1.1); const off = joltBody.drive(drive); if (off > .6) { limp = true; joltBody.limp(); } }
    world.step(STEP); timings.jolt.push(performance.now() - t);
    joltBody.apply(); right.root.updateMatrixWorld(true);
    peak.jolt.gap = Math.max(peak.jolt.gap, joltBody.jointGap());
    const settled = joltBody.maxSpeed() < .25 && clock > 1.6, staggerDone = state === 'active' && !limp && clock > 1.4;
    if (settled || clock > 6 || staggerDone) beginRecover();
  } else if (state === 'recover') {
    const k = 1 - recover; recover = Math.max(0, recover - STEP / (blendSeconds));
    right.motion.update(STEP, {}); const e = 1 - recover, s = e * e * (3 - 2 * e);
    right.skeleton.bones.forEach((b, i) => b.quaternion.slerpQuaternions(snapshot[i], b.quaternion.clone(), s));
    const hip = right.byName.root; hip.position.lerpVectors(snapRoot, hip.position.clone(), s);
    if (!recover) { state = 'idle'; joltBody.remember(); }
  }
}
let blendSeconds = 1.1;
function beginRecover() {
  // Stand up where the body landed: move the character under its pelvis, then blend out of the fallen pose.
  const staggered = state === 'active' && !limp; const pelvis = joltBody.pelvis();
  joltBody.end();
  if (!staggered) { right.root.position.x = pelvis.x; right.root.position.z = pelvis.z; right.byName.root.position.copy(right.root.worldToLocal(pelvis.clone())); }
  blendSeconds = staggered ? .3 : 1.1;
  snapshot = right.skeleton.bones.map(b => b.quaternion.clone()); snapRoot.copy(right.byName.root.position); recover = 1; state = 'recover';
}
function advance(seconds) {
  for (let n = Math.round(seconds / STEP); n > 0; n--) { tick(); left.root.updateMatrixWorld(true); right.root.updateMatrixWorld(true); if (state !== 'recover') { measure('current', left); measure('jolt', right); } }
  draw();
}
function reset() {
  joltBody.end(); left.root.position.set(-SPACING, 0, 0); right.root.position.set(SPACING, 0, 0); state = 'idle'; clock = 0; limp = false;
  // Let any earlier knockdown finish, so both begin standing.
  for (let i = 0; i < 480 && (left.motion.inspect().ragdoll !== 'standing'); i++) left.motion.update(STEP, {});
  for (let i = 0; i < 40; i++) tick();
  fresh();
}
function hit(kind) {
  reset(); setWall(kind === 'wall'); clock = 0;
  if (kind === 'stagger') { left.motion.hit(new T.Vector3(0, 0, -1), 1.1); joltBody.start({ impulse: sideHit(.75, -1), dt: STEP, active: true }); state = 'active'; }
  else { const strength = kind === 'wall' ? 2.2 : 1.7; left.motion.knockdown(new T.Vector3(0, 0, -1), strength); joltBody.start({ impulse: sideHit(strength, -1), dt: STEP }); state = 'limp'; }
  joltBody.apply(); draw();
}
const percentile = (list, p) => { const s = [...list].sort((a, b) => a - b); return s.length ? +s[Math.floor((s.length - 1) * p)].toFixed(3) : null; };
async function bench(counts = [1, 3, 8], seconds = 3) {
  // Physics only, no drawing: extra people fall together and every frame's solver time is recorded.
  const results = [];
  setWall(false);
  for (const n of counts) {
    const people = [], ragdolls = [], lefts = [];
    for (let i = 0; i < n; i++) { const m = await person('boulevard', 3 + (i % 4) * 2, -6 - Math.floor(i / 4) * 2); m.root.visible = false; people.push(m); ragdolls.push(createRagdoll(world, T, m)); const c = await person('harbor', -3 - (i % 4) * 2, -6 - Math.floor(i / 4) * 2); c.root.visible = false; lefts.push(c); }
    for (const mode of ['limp', 'powered']) {
      const times = [];
      ragdolls.forEach((r, i) => { people[i].motion.update(STEP, {}); r.remember(); people[i].motion.update(STEP, {}); r.start({ impulse: sideHit(1.7, -1), dt: STEP, active: mode === 'powered' }); });
      for (let f = 0; f < seconds * 60; f++) { const a = performance.now(); if (mode === 'powered') ragdolls.forEach(r => r.drive(1)); world.step(STEP); times.push(performance.now() - a); }
      ragdolls.forEach(r => r.end());
      results.push({ engine: 'jolt ' + mode, ragdolls: n, meanMs: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(3), p95Ms: percentile(times, .95), maxMs: percentile(times, 1) });
    }
    const times = []; lefts.forEach(c => c.motion.knockdown(new T.Vector3(0, 0, -1), 1.7));
    for (let f = 0; f < seconds * 60; f++) { const a = performance.now(); lefts.forEach(c => c.motion.update(STEP, {})); times.push(performance.now() - a); }
    results.push({ engine: 'current', ragdolls: n, meanMs: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(3), p95Ms: percentile(times, .95), maxMs: percentile(times, 1) });
    for (const m of [...people, ...lefts]) GardenCharacter.dispose(m);
  }
  return results;
}
const report = () => ({ state, clock: +clock.toFixed(2), current: left.motion.inspect().ragdoll, peak: JSON.parse(JSON.stringify(peak, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v)) });
window.lab = { hit, advance, report, bench, draw, view, initMs: world.initMs, heapBytes: world.heapBytes, parts: joltBody.parts, revision: T.REVISION, ready: true };

let playing = 0;
function play(kind) {
  hit(kind); out.textContent = ''; const started = performance.now(); let last = started; cancelAnimationFrame(playing);
  const frame = now => { advance(Math.min((now - last) / 1000, .05)); last = now; if (now - started < 6000) playing = requestAnimationFrame(frame); else out.textContent = JSON.stringify(report(), null, 1); };
  playing = requestAnimationFrame(frame);
}
for (const button of document.querySelectorAll('[data-run]')) button.onclick = async () => {
  if (button.dataset.run !== 'bench') return play(button.dataset.run);
  out.textContent = 'Benchmark running…'; await new Promise(r => setTimeout(r, 50));
  out.textContent = `Jolt start-up ${world.initMs.toFixed(0)} ms, Wasm memory ${(world.heapBytes() / 1048576).toFixed(0)} MB\n` + (await bench()).map(r => `${r.engine}, ${r.ragdolls}: ${r.meanMs} ms mean, ${r.p95Ms} ms p95`).join('\n');
};
fresh(); view(); resize();
