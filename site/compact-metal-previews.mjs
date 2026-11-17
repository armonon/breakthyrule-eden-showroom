// Four visible canvases share one studio renderer. Each pair keeps its pieces for
// two complete turns, then advances through its entire collection in catalog order.
const TAU = Math.PI * 2;
const TURN_SECONDS = 5;
const SIZE = 480;
const CACHE_LIMIT = 8;
const rows = new Map(), cache = new Map(), pending = new Map(), queue = [];
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const pageActive = () => window.showroomPageActive?.() ?? !document.hidden;
let renderer, scene, camera, environment, frame = 0, last = 0, loads = 0, dead = false, contextLost = false;

export function compactMetalPair(items, round) {
  return items.length ? [0, 1].map(slot => items[(round * 2 + slot) % items.length]) : [];
}

function disposeModel(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [].concat(object.material || [])) {
      materials.add(material);
      for (const [key, value] of Object.entries(material)) if (key !== 'envMap' && value?.isTexture) textures.add(value);
    }
  });
  textures.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
  geometries.forEach(value => value.dispose());
}

function makeEnvironment(T) {
  const room = new T.Scene(); room.background = new T.Color(.22, .24, .28);
  room.add(new T.Mesh(new T.BoxGeometry(12, 10, 12), new T.MeshBasicMaterial({color: 0x626873, side: T.BackSide})));
  for (const [position, width, height, intensity] of [[[-3, 2, 4], 4, 6, 3], [[4, 1, 2], 3, 5, 2], [[0, 4, -1], 4, 4, 2.5]]) {
    const panel = new T.Mesh(new T.PlaneGeometry(width, height), new T.MeshBasicMaterial({color: new T.Color(intensity, intensity, intensity), side: T.DoubleSide, toneMapped: false}));
    panel.position.set(...position); panel.lookAt(0, 0, 0); room.add(panel);
  }
  const generator = new T.PMREMGenerator(renderer), target = generator.fromScene(room, .04, .1, 100);
  generator.dispose(); disposeModel(room); return target;
}

function ensureRenderer() {
  if (renderer) return true;
  const T = window.THREE;
  if (!T || !window.showroomAssets?.model) return false;
  try {
    renderer = new T.WebGLRenderer({canvas: document.createElement('canvas'), antialias: true, alpha: true});
    window.showroomEnableKTX2?.(renderer);
    renderer.setPixelRatio(1); renderer.setSize(SIZE, SIZE, false);
    renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
    scene = new T.Scene();
    if (window.showroomProductLights) window.showroomProductLights(scene);
    else {
      scene.add(new T.HemisphereLight(0xffffff, 0x8d8583, 2));
      for (const [position, intensity] of [[[-3, 5, 5], 2.6], [[4, 1, -4], 1.2]]) {
        const light = new T.DirectionalLight(0xffffff, intensity); light.position.set(...position); scene.add(light);
      }
    }
    environment = makeEnvironment(T); scene.environment = environment.texture;
    camera = new T.PerspectiveCamera(30, 1, .05, 40);
    renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault(); contextLost = true; cancelAnimationFrame(frame); frame = 0;
      for (const row of rows.values()) for (const slot of row.slots) slot.host.dataset.modelReady = 'false';
    });
    renderer.domElement.addEventListener('webglcontextrestored', () => { contextLost = false; last = 0; request(); });
    return true;
  } catch {
    renderer?.dispose(); renderer = null; return false;
  }
}

function trim() {
  const protectedURLs = new Set();
  for (const row of rows.values()) {
    for (const item of row.items || []) protectedURLs.add(item.model);
    if (row.next) for (const item of compactMetalPair(row.catalog, row.round + 1)) protectedURLs.add(item.model);
  }
  for (const [url, entry] of cache) {
    if (cache.size <= CACHE_LIMIT) break;
    if (protectedURLs.has(url)) continue;
    cache.delete(url); disposeModel(entry.root);
  }
}

function active(row) { return !dead && pageActive() && !row.expanded && row.visible.size > 0; }
function pump() {
  if (dead || !pageActive()) return;
  while (loads < 2 && queue.length) {
    const task = queue.shift(); loads++;
    window.showroomAssets.model(task.item.model, {priority: 'low'}).then(gltf => {
      const T = window.THREE, source = gltf.scene;
      const box = new T.Box3().setFromObject(source), size = box.getSize(new T.Vector3());
      source.position.sub(box.getCenter(new T.Vector3()));
      const root = new T.Group(); root.add(source);
      root.scale.setScalar(1.8 / Math.max(size.x, size.y, size.z, .001));
      root.updateMatrixWorld(true);
      const dimensions = new T.Box3().setFromObject(root).getSize(new T.Vector3());
      const entry = {root, radius: Math.hypot(dimensions.x, dimensions.z) / 2, halfHeight: dimensions.y / 2};
      if (dead) { disposeModel(root); task.resolve(null); return; }
      cache.set(task.item.model, entry); task.resolve(entry); trim();
    }).catch(() => task.resolve(null)).finally(() => {
      pending.delete(task.item.model); loads--; pump(); request();
    });
  }
}

function load(item) {
  const found = cache.get(item.model);
  if (found) { cache.delete(item.model); cache.set(item.model, found); return Promise.resolve(found); }
  if (pending.has(item.model)) return pending.get(item.model);
  const promise = new Promise(resolve => queue.push({item, resolve})); pending.set(item.model, promise); pump(); return promise;
}

function publish(row, slot, item) {
  const price = new Intl.NumberFormat('en-US', {style: 'currency', currency: item.currency || 'USD', maximumFractionDigits: 0}).format(item.price);
  slot.image.src = item.poster; slot.image.alt = item.name;
  slot.name.textContent = item.name;
  slot.host.setAttribute('aria-label', `${item.name}, ${price}. Explore the ${row.key === 'belts' ? 'belt' : 'necklace'} collection`);
  slot.host.dataset.modelReady = 'false'; slot.canvas.dataset.product = item.id;
  slot.canvas.dataset.round = String(row.round); slot.canvas.dataset.turn = '0';
}

function prepareNext(row) {
  if (row.next || !row.catalog.length || !active(row) || motion.matches) return;
  row.next = Promise.all(compactMetalPair(row.catalog, row.round + 1).map(load));
}

async function advance(row) {
  if (row.changing || !active(row)) return;
  row.changing = true;
  const nextItems = compactMetalPair(row.catalog, row.round + 1);
  const entries = await (row.next || Promise.all(nextItems.map(load)));
  if (dead) return;
  row.round++; row.angle = 0; row.items = nextItems; row.entries = entries; row.next = null; row.changing = false;
  row.slots.forEach((slot, index) => publish(row, slot, row.items[index]));
  trim(); request();
}

function fit(row, entry) {
  const elevation = (row.key === 'belts' ? 18 : 4) * Math.PI / 180, c = Math.cos(elevation), s = Math.sin(elevation);
  const halfV = Math.PI / 12;
  const horizontal = entry.radius * Math.sqrt(1 / Math.tan(halfV) ** 2 + c * c) + entry.halfHeight * s;
  const vertical = (entry.radius * s + entry.halfHeight * c) / Math.tan(halfV) + entry.radius * c + entry.halfHeight * s;
  const distance = Math.max(horizontal, vertical) * 1.08;
  camera.position.set(0, distance * s, distance * c); camera.lookAt(0, 0, 0);
}

function request() {
  if (!dead && !contextLost && !frame && pageActive() && [...rows.values()].some(active)) frame = requestAnimationFrame(draw);
}

function draw(time) {
  frame = 0;
  if (!pageActive()) { last = 0; return; }
  if (last && time - last < 33) { request(); return; }
  const dt = Math.min((time - (last || time)) / 1000, .08); last = time;
  let moving = false;
  for (const row of rows.values()) {
    if (!active(row) || !row.entries) continue;
    if (!motion.matches && !row.changing) {
      row.angle = Math.min(TAU * 2, row.angle + dt * TAU / TURN_SECONDS);
      if (row.angle >= TAU) prepareNext(row);
      if (row.angle >= TAU * 2) advance(row);
      moving = true;
    }
    row.slots.forEach((slot, index) => {
      if (!row.visible.has(slot.host)) return;
      slot.canvas.dataset.turn = String(Math.min(2, Math.floor(row.angle / TAU)));
      const entry = row.entries[index]; if (!entry) return;
      entry.root.rotation.y = row.angle % TAU; fit(row, entry);
      scene.add(entry.root); renderer.render(scene, camera); scene.remove(entry.root);
      slot.ctx.clearRect(0, 0, SIZE, SIZE); slot.ctx.drawImage(renderer.domElement, 0, 0);
      slot.host.dataset.modelReady = 'true';
    });
  }
  if (moving) request(); else last = 0;
}

let necklaceCatalog;
async function catalogFor(key) {
  if (key === 'belts') return (window.BTR_BELTS || []).map(item => ({...item, model: '/btr-belts/' + item.model, poster: '/btr-belts/' + item.poster}));
  necklaceCatalog ||= fetch('/pendant-collection/catalog.json?v=prices-2').then(response => {
    if (!response.ok) throw new Error('Necklace catalog unavailable'); return response.json();
  });
  return (await necklaceCatalog).map(item => ({...item, id: 'pendant-' + item.slug, name: item.name + ' Necklace', model: '/pendant-collection/models/' + item.slug + '-discovery.glb', poster: item.media + item.slug + '-full-poster.png'}));
}

async function mount(element) {
  const key = element.dataset.compactCollection;
  if (!['belts', 'necklaces'].includes(key) || rows.has(key)) return;
  const hosts = [...element.querySelectorAll('.collection-compact-slot')].slice(0, 2);
  if (hosts.length !== 2) return;
  const row = {key, element, visible: new Set(), expanded: element.dataset.collectionExpanded === 'true', catalog: [], round: 0, angle: 0, next: null, entries: null, changing: false};
  row.slots = hosts.map(host => {
    const canvas = host.querySelector('canvas'), image = host.querySelector('[data-compact-fallback]'), name = host.querySelector('[data-compact-name]');
    canvas.width = canvas.height = SIZE; canvas.setAttribute('aria-hidden', 'true');
    return {host, canvas, image, name, ctx: canvas.getContext('2d')};
  });
  rows.set(key, row);
  try {
    row.catalog = await catalogFor(key); if (!row.catalog.length || dead) return;
    row.items = compactMetalPair(row.catalog, 0); row.slots.forEach((slot, index) => publish(row, slot, row.items[index]));
    const begin = async () => {
      if (row.started || !active(row) || !ensureRenderer()) return;
      row.started = true; row.entries = await Promise.all(row.items.map(load)); request();
    };
    row.begin = begin;
    row.observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) row.visible.add(entry.target); else row.visible.delete(entry.target);
      last = 0; begin(); request();
    });
    row.slots.forEach(slot => row.observer.observe(slot.host));
  } catch { element.dataset.compactPreviewError = 'true'; }
}

function scan() { document.querySelectorAll('[data-compact-collection]').forEach(mount); }
document.addEventListener('btr:collection-ready', event => event.detail?.element ? mount(event.detail.element) : scan());
document.addEventListener('btr:collection-toggle', event => {
  const row = rows.get(event.detail?.section); if (!row) return;
  row.expanded = !!event.detail.expanded; last = 0;
  if (!row.expanded) { row.begin?.(); request(); }
});
function visibility() {
  last = 0;
  if (!pageActive()) { cancelAnimationFrame(frame); frame = 0; }
  else { pump(); rows.forEach(row => row.begin?.()); request(); }
}
document.addEventListener('visibilitychange', visibility);
document.addEventListener('btr:page-visibility', visibility);
motion.addEventListener('change', () => { last = 0; request(); });
window.addEventListener('pagehide', event => {
  cancelAnimationFrame(frame); frame = 0; last = 0;
  if (event.persisted) return;
  dead = true; rows.forEach(row => row.observer?.disconnect());
  cache.forEach(entry => disposeModel(entry.root)); cache.clear(); environment?.dispose(); renderer?.dispose();
});
window.addEventListener('pageshow', visibility);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan, {once: true}); else scan();
