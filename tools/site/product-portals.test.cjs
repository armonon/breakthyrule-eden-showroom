const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const repo = resolve(__dirname, '../..');
const math = { window: {}, console, URL, location: { href: 'http://localhost/' } };
vm.runInNewContext(readFileSync(resolve(repo, 'assets/three.min.js'), 'utf8'), math);
const T = math.window.THREE;
const source = readFileSync(resolve(repo, 'site/product-portals.mjs'), 'utf8').replace('export function ', 'function ');
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

// Keep real Three geometry, but control visibility, asset completion and paint
// scheduling so a covered-but-intersecting portal exercises its actual lifecycle.
function harness({ covered = false, deferred = false, sharedVisibility = true } = {}) {
  let clock = 100, nextFrame = 0;
  const frames = new Map(), renderers = [], loads = [], pending = [];
  const intersections = [], resizes = [];
  class Element {
    constructor() {
      this.dataset = {}; this.events = new Map(); this.nodes = new Map(); this.attributes = new Map();
      const classes = new Set();
      this.classList = { add: name => classes.add(name), remove: name => classes.delete(name) };
    }
    addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(fn); }
    removeEventListener(name, fn) { this.events.get(name)?.delete(fn); }
    emit(name) { for (const fn of this.events.get(name) || []) fn({}); }
    querySelector(selector) { return this.nodes.get(selector) || null; }
    querySelectorAll(selector) { return this.nodes.get(selector) || []; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getBoundingClientRect() { return { width: 300, height: 300 }; }
    getContext() { return { clearRect() {}, drawImage() {} }; }
  }
  const document = new Element();
  document.hidden = false; document.readyState = 'complete';
  document.getElementById = () => null; document.createElement = () => new Element();
  const media = new Element(); media.matches = false;
  const THREE = { ...T, WebGLRenderer: class {
    constructor({ canvas }) { this.domElement = canvas; this.renders = 0; renderers.push(this); }
    setPixelRatio() {} setClearColor() {} setSize() {}
    render() { this.renders++; }
    dispose() { this.disposed = true; }
    forceContextLoss() { this.lost = true; }
  } };
  const model = () => {
    const root = new T.Group();
    root.add(new T.Mesh(new T.BoxGeometry(1, 1.6, .3), new T.MeshStandardMaterial()));
    return { scene: root };
  };
  const window = {
    THREE, ShowroomGLTFLoader: {}, devicePixelRatio: 1,
    showroomCollection: [
      { slug: 'war-witnesses-tee', name: 'WAR Tee', rackModel: '/war.glb' },
      { slug: 'god-loves-you-tee', name: 'God Loves You Tee', rackModel: '/love.glb' }
    ],
    showroomAssets: { model(url) {
      loads.push(url);
      return deferred ? new Promise(resolve => pending.push(() => resolve(model()))) : Promise.resolve(model());
    } }
  };
  if (sharedVisibility) window.showroomPageActive = () => !covered && !document.hidden;
  const section = new Element(), toggle = new Element();
  const cards = ['eden', 'lab'].map(kind => {
    const link = new Element(), stage = new Element(), canvas = new Element();
    link.dataset.portal = kind; link.nodes.set('[data-portal-stage]', stage);
    stage.nodes.set('[data-portal-canvas]', canvas);
    return { link, stage };
  });
  section.nodes.set('#portal-motion-toggle', toggle);
  section.nodes.set('[data-portal]', cards.map(card => card.link));
  const context = {
    window, document, console, matchMedia: () => media,
    IntersectionObserver: class { constructor(fn) { intersections.push(fn); } observe() {} disconnect() {} },
    ResizeObserver: class { constructor(fn) { resizes.push(fn); } observe() {} disconnect() {} },
    requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id)
  };
  vm.runInNewContext(source + '\nglobalThis.mountPortals = setupProductPortals;', context);
  const api = context.mountPortals(section);
  return {
    api, section, toggle, document, frames, renderers, loads,
    get renders() { return renderers.reduce((total, renderer) => total + renderer.renders, 0); },
    intersect(visible = true) { intersections[0](cards.map(card => ({ target: card.stage, isIntersecting: visible }))); },
    cover(value) { covered = value; document.emit('btr:page-visibility'); },
    resize() { resizes[0](cards.map(card => ({ target: card.stage }))); },
    async settleModels() { pending.splice(0).forEach(resolve => resolve()); await flush(); },
    async advance(duration = 500) {
      const end = clock + duration;
      while (clock < end) {
        clock = Math.min(end, clock + 40);
        const ready = [...frames.values()]; frames.clear(); ready.forEach(fn => fn(clock));
        await flush();
      }
    }
  };
}

test('covered portals defer renderer creation and assets until the page is active', async () => {
  const page = harness({ covered: true });
  page.intersect(); page.resize(); await page.advance();
  assert.equal(page.renderers.length, 0); assert.equal(page.loads.length, 0); assert.equal(page.frames.size, 0);
  page.cover(false); await page.advance();
  assert.equal(page.renderers.length, 1); assert.ok(page.loads.length >= 2); assert.ok(page.renders > 0);
  page.api.destroy();
});

test('opening Codex stops intersecting portals and closing it resumes one existing renderer', async () => {
  const page = harness(); page.intersect(); await page.advance();
  const rendered = page.renders, loaded = page.loads.length;
  page.cover(true); assert.equal(page.frames.size, 0);
  page.resize(); page.intersect(); await page.advance(4000);
  assert.equal(page.renders, rendered); assert.equal(page.loads.length, loaded); assert.equal(page.frames.size, 0);
  page.cover(false); await page.advance();
  assert.ok(page.renders > rendered); assert.equal(page.renderers.length, 1);
  page.api.destroy();
  assert.equal(page.document.events.get('btr:page-visibility').size, 0);
  page.cover(true); page.cover(false); await page.advance();
  assert.equal(page.frames.size, 0); assert.ok(page.renderers[0].disposed); assert.ok(page.renderers[0].lost);
});

test('model completion while covered cannot restart painting or preload another garment', async () => {
  const page = harness({ deferred: true }); page.intersect();
  assert.equal(page.loads.length, 2);
  page.cover(true); await page.settleModels(); await page.advance();
  assert.equal(page.renders, 0); assert.equal(page.frames.size, 0); assert.equal(page.loads.length, 2);
  page.cover(false); await page.advance(); assert.ok(page.renders > 0);
  page.api.destroy(); await page.settleModels();
});

test('Codex visibility preserves manual pause and fallback pages still pause in hidden tabs', async () => {
  const page = harness(); page.intersect(); await page.advance();
  page.toggle.emit('click'); await page.advance(); const paused = page.renders;
  page.cover(true); page.cover(false); await page.advance();
  assert.equal(page.section.dataset.motion, 'paused'); assert.equal(page.renders, paused); assert.equal(page.frames.size, 0);
  page.toggle.emit('click'); await page.advance(); assert.ok(page.renders > paused); page.api.destroy();

  const fallback = harness({ sharedVisibility: false }); fallback.intersect(); await fallback.advance();
  fallback.document.hidden = true; fallback.document.emit('visibilitychange'); const hidden = fallback.renders;
  fallback.resize(); await fallback.advance(); assert.equal(fallback.renders, hidden); assert.equal(fallback.frames.size, 0);
  fallback.document.hidden = false; fallback.document.emit('visibilitychange'); await fallback.advance();
  assert.ok(fallback.renders > hidden); fallback.api.destroy();
});
