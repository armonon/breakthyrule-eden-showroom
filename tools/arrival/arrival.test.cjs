const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(resolve(__dirname, '../../site/arrival.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

// A small controllable browser surface: requests, clocks, and paint frames remain independent.
function browser({ search = '', reduced = false, hidden = false, navigationType = 'navigate' } = {}) {
  class Target {
    constructor() { this.events = new Map(); }
    addEventListener(type, callback, options = {}) {
      if (!this.events.has(type)) this.events.set(type, []);
      this.events.get(type).push({ callback, once: options.once });
    }
    removeEventListener(type, callback) {
      this.events.set(type, (this.events.get(type) || []).filter(entry => entry.callback !== callback));
    }
    dispatchEvent(event) {
      for (const entry of [...(this.events.get(event.type) || [])]) {
        if (entry.once) this.removeEventListener(event.type, entry.callback);
        entry.callback(event);
      }
    }
  }
  const document = new Target(), window = new Target(), observers = [];
  window.performance = { getEntriesByType: type => type === 'navigation' ? [{ type: navigationType }] : [] };
  class Element extends Target {
    constructor(tag) {
      super(); this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {};
      this.attributes = new Map(); this.inert = false; this.hidden = false; this.isConnected = true;
      const classes = new Set();
      this.classList = { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) };
      this.rect = { width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100 };
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } notify(this); }
    prepend(child) { child.parentElement = this; this.children.unshift(child); notify(this); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.isConnected = false; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    focus() { document.activeElement = this; }
    getBoundingClientRect() { return this.rect; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
      const matches = element => selector.startsWith('.') ? element.classList.contains(selector.slice(1))
        : selector.startsWith('#') ? element.id === selector.slice(1)
        : element.tagName.toLowerCase() === selector;
      return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    set innerHTML(value) {
      // Only the loading cover's queried controls need a parsed representation.
      for (const name of ['arrival-film', 'arrival-status', 'arrival-pause', 'arrival-continue']) {
        if (!value.includes(name)) continue;
        const child = new Element(name.endsWith('pause') || name.endsWith('continue') ? 'button' : 'div');
        child.classList.add(name); child.hidden = child.tagName === 'BUTTON'; this.append(child);
      }
    }
  }
  function notify(target) { for (const observer of observers) if (observer.target === target) queueMicrotask(() => { if (observer.target) observer.callback(); }); }
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.target = null; }
  }
  document.documentElement = new Element('html'); document.body = new Element('body');
  const main = new Element('main'); document.body.append(main);
  document.activeElement = document.body; document.readyState = 'loading'; document.hidden = hidden;
  document.images = []; document.fonts = { ready: Promise.resolve() };
  document.createElement = tag => new Element(tag);
  document.querySelector = selector => document.body.querySelector(selector);
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  const timers = new Map(), frames = new Map(); let id = 0, now = 0;
  const setTimeout = (callback, delay = 0) => { const handle = ++id; timers.set(handle, { callback, at: now + delay }); return handle; };
  const requestAnimationFrame = callback => { const handle = ++id; frames.set(handle, callback); return handle; };
  vm.runInNewContext(source, {
    window, document, location: { search }, URLSearchParams, Event, MutationObserver,
    innerHeight: 800, innerWidth: 1200, getComputedStyle: () => ({ visibility: 'visible' }),
    setTimeout, clearTimeout: handle => timers.delete(handle),
    requestAnimationFrame, cancelAnimationFrame: handle => frames.delete(handle),
    matchMedia: () => ({ matches: reduced }),
  }, { filename: 'arrival.js', importModuleDynamically: () => Promise.reject(new Error('Film unavailable in test')) });
  const tick = async milliseconds => {
    const until = now + milliseconds;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]); now = next[1].at; next[1].callback(); await flush();
    }
    now = until; await flush();
  };
  const paint = async () => { const batch = [...frames.values()]; frames.clear(); for (const callback of batch) callback(now); await flush(); };
  return {
    window, document, main, Element, tick, paint,
    get arrival() { return window.btrArrival; },
    get overlay() { return document.querySelector('#btr-arrival'); },
    async domReady() { document.readyState = 'interactive'; document.dispatchEvent(new Event('DOMContentLoaded')); await flush(); await tick(0); },
    async finishPaints() { for (let i = 0; i < 5; i++) { await tick(0); await paint(); } },
  };
}

test('early holds survive DOM readiness and a new task during the reveal paint window', async () => {
  const page = browser();
  const finishCatalog = page.arrival.hold('catalog');
  page.arrival.mount(); await page.tick(0);
  assert.equal(page.arrival.active, true);
  assert.deepEqual(Array.from(page.arrival.pending), ['page layout', 'catalog']);
  await page.domReady(); await page.finishPaints();
  assert.equal(page.arrival.active, true);
  finishCatalog(); await page.paint();
  const finishLate = page.arrival.hold('late visible content');
  await page.finishPaints();
  assert.equal(page.arrival.active, true);
  finishLate(); await page.finishPaints();
  assert.equal(page.arrival.active, false);
  assert.equal(page.document.documentElement.dataset.arrivalState, 'ready');
});

test('a task failure settles once and releases the fallback after remaining work', async () => {
  const page = browser();
  const fail = page.arrival.hold('catalog'), complete = page.arrival.hold('other content');
  await page.domReady();
  fail(new Error('offline')); fail(); fail(new Error('duplicate'));
  await page.finishPaints();
  assert.equal(page.arrival.active, true);
  assert.deepEqual(Array.from(page.arrival.failures), ['catalog']);
  complete(); await page.finishPaints();
  assert.equal(page.document.documentElement.dataset.arrivalState, 'fallback');
  page.arrival.hold('after release')(new Error('ignored'));
  assert.deepEqual(Array.from(page.arrival.failures), ['catalog']);
});

test('visible image decoding blocks reveal while offscreen images do not', async () => {
  const page = browser(); let finishDecode;
  const image = new page.Element('img'); image.complete = true; image.naturalWidth = 800;
  image.decode = () => new Promise(resolve => { finishDecode = resolve; });
  const offscreen = new page.Element('img'); offscreen.complete = false;
  offscreen.rect = { width: 100, height: 100, top: 3000, bottom: 3100, left: 0, right: 100 };
  page.document.images.push(image, offscreen); page.main.append(image, offscreen);
  await page.domReady(); await page.finishPaints();
  assert.equal(page.arrival.active, true);
  assert.equal(image.loading, 'eager'); assert.equal(offscreen.loading, undefined);
  finishDecode(); await flush(); await page.finishPaints();
  assert.equal(page.arrival.active, false);
});

test('new visible content mounted by an async task is decoded before revealing', async () => {
  const page = browser(); const finishCatalog = page.arrival.hold('catalog');
  await page.domReady();
  let finishDecode;
  const image = new page.Element('img'); image.complete = true; image.naturalWidth = 800;
  image.decode = () => new Promise(resolve => { finishDecode = resolve; });
  page.document.images.push(image); page.main.append(image); finishCatalog();
  await page.finishPaints(); assert.equal(page.arrival.active, true);
  finishDecode(); await flush(); await page.finishPaints();
  assert.equal(page.arrival.active, false);
});

test('a stalled visible image reaches a handled fallback instead of trapping entry', async () => {
  const page = browser(); const image = new page.Element('img'); image.complete = false;
  page.document.images.push(image); page.main.append(image);
  await page.domReady(); await page.tick(14999); await page.finishPaints();
  assert.equal(page.arrival.active, true);
  await page.tick(1); await page.finishPaints();
  assert.equal(page.arrival.active, false);
  assert.equal(page.document.documentElement.dataset.arrivalState, 'fallback');
  assert.deepEqual(Array.from(page.arrival.failures), ['visible image']);
});

test('slow work exposes an escape button without claiming loading completed', async () => {
  const page = browser(); page.arrival.hold('stalled request');
  const alreadyInert = new page.Element('aside'); alreadyInert.inert = true; page.document.body.append(alreadyInert);
  page.arrival.mount(); await page.domReady(); await page.tick(18000);
  assert.equal(page.arrival.active, true);
  const button = page.overlay.querySelector('.arrival-continue');
  assert.equal(button.hidden, false);
  assert.equal(page.main.inert, true);
  button.focus(); button.dispatchEvent(new Event('click'));
  assert.equal(page.arrival.active, false);
  assert.equal(page.document.documentElement.dataset.arrivalState, 'continued');
  assert.equal(page.main.inert, false); assert.equal(alreadyInert.inert, true);
  assert.equal(page.document.activeElement, page.main);
});

test('explicit Codex and About entries opt out; normal and nocover entries get arrival', () => {
  for (const search of ['?cover', '?cover=1', '?about']) assert.equal(browser({ search }).arrival, undefined);
  for (const search of ['', '?nocover=1']) assert.equal(browser({ search }).arrival.active, true);
});

test('Back and Forward reloads keep the collection usable without an arrival overlay', async () => {
  for (const search of ['', '?nocover=1']) {
    const page = browser({ search, navigationType: 'back_forward' });
    assert.equal(page.arrival.active, false);
    // Callers can still mount/settle catalog readiness without reopening any cover.
    page.arrival.mount(); page.arrival.hold('necklace catalog')();
    await page.domReady(); await page.finishPaints(); await page.tick(20000);
    assert.equal(page.overlay, null);
    assert.equal(page.main.inert, false);
    assert.equal(page.document.activeElement, page.document.body);
    assert.equal(page.document.documentElement.classList.contains('btr-arriving'), false);
    assert.equal(page.document.documentElement.dataset.arrivalState, 'history');
  }
  assert.equal(browser({ navigationType: 'reload' }).arrival.active, true);
  assert.equal(browser({ search: '?cover', navigationType: 'back_forward' }).arrival, undefined);
});

test('hidden tabs wait to reveal and pagehide restores a usable BFCache page', async () => {
  const page = browser({ hidden: true });
  await page.domReady(); await page.finishPaints();
  assert.equal(page.arrival.active, true);
  page.document.hidden = false; page.document.dispatchEvent(new Event('visibilitychange'));
  await page.finishPaints(); assert.equal(page.arrival.active, false);

  const cached = browser(); cached.arrival.hold('pending navigation');
  await cached.domReady(); assert.equal(cached.main.inert, true);
  cached.window.dispatchEvent(new Event('pagehide'));
  assert.equal(cached.arrival.active, false); assert.equal(cached.main.inert, false);
  assert.equal(cached.document.documentElement.classList.contains('btr-arriving'), false);
  cached.window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  assert.equal(cached.arrival.active, false);
  assert.equal(cached.overlay, null, 'A cached return removes the leaving overlay without waiting for its old timer');
});
