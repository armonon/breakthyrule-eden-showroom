const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const repo = path.resolve(__dirname, '../..');
const math = { window: {}, console, URL, location: { href: 'http://localhost/' } };
vm.runInNewContext(fs.readFileSync(path.join(repo, 'assets/three.min.js'), 'utf8'), math);
const T = math.window.THREE;
const script = fs.readFileSync(path.join(repo, 'site/discovery-stage.mjs'), 'utf8').replace(/export (function|const) /g, '$1 ');

function harness({ reduced = false, deferred = false } = {}) {
  let clock = 100, next = 0, renderer;
  const frames = new Map(), intersections = [], loads = [], pending = new Map(), disposed = new Set();
  class Element {
    constructor() { this.dataset = {}; this.events = new Map(); this.children = []; this.clientWidth = 700; this.clientHeight = 600; }
    setAttribute() {} append(x) { this.children.push(x); } remove() {}
    addEventListener(k, fn) { if (!this.events.has(k)) this.events.set(k, new Set()); this.events.get(k).add(fn); }
    removeEventListener(k, fn) { this.events.get(k)?.delete(fn); }
    emit(k, detail = {}) { for (const fn of this.events.get(k) || []) fn({ button: 0, target: { closest: () => false }, clientX: 0, clientY: 0, pointerId: 1, preventDefault() {}, ...detail }); }
    setPointerCapture() {}
    getBoundingClientRect() { return {width:this.clientWidth,height:this.clientHeight,top:0,bottom:this.clientHeight}; }
    getContext() { return { fillRect() {}, strokeRect() {}, fillText() {} }; }
  }
  const document = new Element(); document.hidden = false; document.createElement = () => new Element();
  const THREE = { ...T, WebGLRenderer: class {
    constructor() { renderer = this; this.capabilities = { getMaxAnisotropy: () => 8 }; this.renders = 0; }
    setPixelRatio() {} setSize() {} dispose() { this.disposed = true; }
    render(scene, camera) { this.renders++; this.scene = scene; this.camera = camera; }
  }, PMREMGenerator: class { fromScene() { return { texture: new T.Texture(), dispose() {} }; } dispose() {} } };
  const model = key => { const root = new T.Group(), material = new T.MeshStandardMaterial({ color: key==='gloves-white'?'#ffffff':'#c67845',map:key==='gloves-white'?new T.DataTexture(new Uint8Array([230,20,20,255,20,40,220,255]),2,1):null }), geometry = new T.BoxGeometry(1.1, 1.8, .3); material.name = 'Fabric'; root.add(new T.Mesh(geometry, material)); geometry.addEventListener('dispose', () => disposed.add(key)); root.userData.key = key; return { scene: root }; };
  const window = { addEventListener(){},removeEventListener(){},THREE, showroomAssets: { model: key => { loads.push(key); if (!deferred) return Promise.resolve(model(key)); return new Promise(resolve => pending.set(key, () => resolve(model(key)))); } } };
  const context = { innerHeight:900, window, document, console, performance: { now: () => clock }, matchMedia: () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }), ResizeObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { constructor(fn) { intersections.push(fn); } observe() {} disconnect() {} }, requestAnimationFrame: fn => { frames.set(++next, fn); return next; }, cancelAnimationFrame: id => frames.delete(id) };
  vm.runInNewContext(script + '\nglobalThis.createStage = createDiscoveryStage;', context);
  const mount = new Element(), turns = [], stage = context.createStage(mount, { onTurn: n => turns.push(n) });
  const descriptor = key => ({ id: key, model: key, renderKind: 'garment' });
  async function advance(ms) { const end = clock + ms; while (clock < end) { clock = Math.min(end, clock + 1000 / 60); const pendingFrames = [...frames.values()]; frames.clear(); pendingFrames.forEach(fn => fn(clock)); await Promise.resolve(); } }
  return { stage, descriptor, advance, mount, document, intersections, frames, loads, pending, disposed, turns, renderer: () => renderer };
}

test('latest asynchronous model wins; a stale completion cannot replace it', async () => {
  const h = harness({ deferred: true }), first = h.stage.show(h.descriptor('old')), second = h.stage.show(h.descriptor('new'));
  h.pending.get('new')(); assert.equal(await second, true); h.pending.get('old')(); assert.equal(await first, false);
  assert.equal(h.stage.model().children[0].userData.key, 'new'); h.stage.destroy();
});

test('model cache is bounded and disposal covers replaced and active resources', async () => {
  const h = harness(); for (const key of ['a', 'b', 'c', 'd', 'e']) await h.stage.show(h.descriptor(key));
  assert.ok(h.disposed.has('a')); assert.ok(h.disposed.has('b')); assert.ok(!h.disposed.has('e'));
  await h.stage.show(h.descriptor('c')); assert.equal(h.loads.filter(k => k === 'c').length, 1);
  h.stage.destroy(); assert.equal(h.disposed.size, 5); assert.ok(h.renderer().disposed); assert.equal(h.frames.size, 0);
});

test('only one speculative preload runs at a time', async () => {
  const h = harness({ deferred: true }); const a = h.stage.preload(h.descriptor('a')), b = h.stage.preload(h.descriptor('b'));
  assert.deepEqual(h.loads, ['a']); h.pending.get('a')(); await Promise.all([a, b]); h.stage.destroy();
});

test('offscreen and hidden stages stop rendering and turns; reduced motion remains still', async () => {
  const h = harness(); await h.stage.show(h.descriptor('a')); await h.advance(6700); assert.equal(h.turns.length, 1);
  h.intersections[0]([{ isIntersecting: false }]); const rendered = h.renderer().renders; await h.advance(10000); assert.equal(h.renderer().renders, rendered); assert.equal(h.turns.length, 1);
  h.intersections[0]([{ isIntersecting: true }]); await h.advance(100); assert.ok(h.renderer().renders > rendered);
  h.document.hidden = true; h.document.emit('visibilitychange'); const hidden = h.renderer().renders; await h.advance(1000); assert.equal(h.renderer().renders, hidden); h.stage.destroy();
  const still = harness({ reduced: true }); await still.stage.show(still.descriptor('a')); await still.advance(9000); assert.equal(still.turns.length, 0); assert.equal(still.frames.size, 0); still.stage.destroy();
});

test('rainbow composes with the print shader and uses uniforms rather than replacing textures', async () => {
  const h = harness(); let material;
  await h.stage.show({ ...h.descriptor('generated'), renderKind:'generated',garment:'tee',rainbow: true }, { prepare(root) {
    material = root.children[0].children[0].material;
    material.userData.decal = { decalMap: { value: new T.Texture() } };
    material.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nvec4 d=vec4(1.0);diffuseColor.rgb=mix(diffuseColor.rgb, d.rgb, d.a * .96);'); };
    material.customProgramCacheKey = () => 'original-printer';
  } });
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <map_fragment>' }; material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /discoveryInk\(d.rgb\)/); assert.equal(shader.uniforms.discoveryRainbow.value, 1);
  const texture = material.userData.decal.decalMap.value; await h.advance(1000); assert.ok(shader.uniforms.discoveryHue.value > 0); assert.equal(material.userData.decal.decalMap.value, texture);
  h.stage.setRainbow(false); assert.equal(shader.uniforms.discoveryRainbow.value, 0); h.stage.destroy();
});

test('mystery stage creates a real cube and five depth-aware 3D question glyphs', async () => {
  const h = harness(); await h.stage.show({ id: 'box', renderKind: 'mystery', mystery: { questionMarks: true } }); await h.advance(100);
  const root = h.stage.model(); assert.ok(root.children[0].children.some(o => o.geometry?.type === 'BoxGeometry'));
  const questions = h.renderer().scene.children.find(o => o.isGroup && o !== root); assert.equal(questions.children.length, 5);
  assert.ok(questions.children.every(g => g.children[0].geometry.type === 'TubeGeometry' && g.children[1].geometry.type === 'SphereGeometry')); h.stage.destroy();
});


test('a complete turn takes 6.5 seconds and pausing prevents automatic turns', async () => {
  const h=harness();await h.stage.show(h.descriptor('tee'));
  assert.equal(h.mount.dataset.turnSeconds,'6.5');
  await h.advance(6400);assert.equal(h.turns.length,0);
  await h.advance(250);assert.equal(h.turns.length,1);
  h.stage.setAuto(false);const yaw=h.stage.yaw();await h.advance(9000);
  assert.equal(h.stage.yaw(),yaw);assert.equal(h.turns.length,1);
  h.stage.setAuto(true);await h.advance(6600);assert.equal(h.turns.length,2);h.stage.destroy();
});

test('Daily Apple keeps clear-plastic exposure and other products restore normal lighting', async () => {
  const h=harness();await h.stage.show({...h.descriptor('bag'),sourceItem:{family:'daily-apple'}});
  assert.equal(h.renderer().toneMappingExposure,.72);
  await h.stage.show(h.descriptor('tee'));assert.equal(h.renderer().toneMappingExposure,1.05);h.stage.destroy();
});


test('white gloves keep white fabric and original red/blue print after rainbow garments', async () => {
  const h=harness();
  await h.stage.show({...h.descriptor('generated'),renderKind:'generated',garment:'tee',rainbow:true});
  await h.advance(1000);
  await h.stage.show({...h.descriptor('gloves-white'),sourceItem:{family:'gloves'},rainbow:true});
  const material=h.stage.model().children[0].children[0].material,texture=material.map;
  const ink=Array.from(texture.image.data);
  h.stage.setRainbow(true);await h.advance(15000);
  assert.equal(material.color.getHexString(),'ffffff');assert.equal(material.map,texture);assert.deepEqual(Array.from(texture.image.data),ink);
  h.stage.destroy();
});
