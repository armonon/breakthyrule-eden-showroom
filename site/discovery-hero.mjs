import { createSmoke } from './discovery-smoke.mjs?v=tab-loop-5';
import { buildDiscoveryCatalog, createDiscoveryScheduler, curatedDiscoveryPicks } from './discovery-catalog.mjs?v=curated-rotation-3';
import { createDiscoveryStage } from './discovery-stage.mjs?v=rotation-3';
import { OFFERINGS, MYSTERY_PACKAGES } from '/labkit/catalog.mjs';
import { normalizeItem, priceItem, sidesFor } from '/labkit/pricing.mjs';
import { newSeed, isSeed } from '/labkit/random.mjs';
import { ARTWORK_POOL } from '/labkit/artwork-pool.mjs';
import { createPrinter, BLANKS, preloadArt } from './discovery-print.mjs?v=1';

const $ = id => document.getElementById(id), section = $('photo-story'), mount = $('discovery-stage');
const standalone = document.body.dataset.discoveryProduct === 'true';
const mysteryPage = standalone && /^\/mystery-box(?:\.html)?\/?$/.test(location.pathname);
const pageParams = new URLSearchParams(location.search);
const pageGarment = ['tee', 'hoodie', 'crewneck'].includes(pageParams.get('g')) ? pageParams.get('g') : 'tee';
const pageActive = () => window.showroomPageActive?.() ?? !document.hidden;
let nearby = false;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const artPool = ARTWORK_POOL.map(a => a.id);
const explicitArt = new Set(ARTWORK_POOL.filter(a => a.explicit).map(a => a.id));
const money = cents => '$' + (cents / 100).toFixed(cents % 100 ? 2 : 0);
const encode = value => btoa(unescape(encodeURIComponent(JSON.stringify(value)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function draw(garment, seed, legacy = false) {
  if (!legacy) {
    const chosenSeed = isSeed(seed) ? seed : newSeed();
    const raw = { product: 'garment', construction: 'canvas', garment, size: 'M', fit: 'blank', color: 'random', artwork: 'pick', picks: curatedDiscoveryPicks(chosenSeed, artPool), seed: chosenSeed, quantity: 1 };
    const normalized = normalizeItem(raw, { artworkPool: artPool });
    if (!normalized.ok) throw new Error('Could not prepare a featured Lab design.');
    return { raw, item: normalized.item, sides: sidesFor(normalized.item) };
  }
  // Previously shared seeded URLs keep their exact original designs.
  let result;
  for (let i = 0; i < 36; i++) {
    const raw = { product: 'garment', construction: 'canvas', garment, size: 'M', fit: 'blank', color: 'random', artwork: 'random-experimental', seed: i === 0 && isSeed(seed) ? seed : newSeed(), quantity: 1 };
    const normalized = normalizeItem(raw, { artworkPool: artPool });
    if (!normalized.ok) continue;
    const sides = sidesFor(normalized.item);
    if ([...sides.front, ...sides.back].some(id => explicitArt.has(id))) continue;
    result = { raw, item: normalized.item, sides };
    if (isSeed(seed) || result.sides.front.length && result.sides.back.length) break;
  }
  if (!result) throw new Error('Could not prepare a Lab design.');
  return result;
}
function labLink(piece) { const { size, ...design } = piece.raw; return '/lab?design=' + encode(design) + '#build'; }
function randomProductLink(piece) { return '/random-shirt?g=' + piece.raw.garment + '&seed=' + piece.raw.seed + (piece.raw.artwork === 'pick' ? '&art=curated-1' : ''); }
function generated({ sequence = 1, random = Math.random, garment = ['tee', 'tee', 'hoodie', 'crewneck'][Math.floor(random() * 4)], seed, legacy = false } = {}) {
  const piece = draw(garment, seed, legacy), priceCents = priceItem(piece.item).totalCents;
  return {
    id: 'lab-random-' + sequence + '-' + piece.raw.seed, origin: 'generated', category: 'generated', renderKind: 'generated',
    name: 'Random ' + OFFERINGS.canvas[garment].name, description: 'A fresh draw from the Garment Lab. Artwork and color keep changing as this piece turns.',
    priceCents, priceText: money(priceCents), currency: 'USD', href: standalone ? labLink(piece) : randomProductLink(piece), ctaText: standalone ? 'Choose size + customize' : 'View random piece',
    model: BLANKS[garment], rainbow: true, garment, piece,
    colorway: { kind: 'random', name: 'Rainbow / constantly changing' },
    mystery: { questionMarks: true, offerOnly: false }
  };
}
function prepareDescriptor(descriptor) {
  if (descriptor.origin === 'generated') return descriptor;
  if (descriptor.renderKind === 'core' && window.BTRCoreCycle?.palette?.length) {
    const palette = window.BTRCoreCycle.palette, graphicIndex = Math.floor(Math.random() * palette.length);
    return { ...descriptor, colorway: { ...descriptor.colorway, graphicIndex, name: descriptor.colorway.name + ' fabric / ' + palette[graphicIndex].name.toLowerCase() + ' artwork' } };
  }
  if (descriptor.mystery?.visualization === 'garment') {
    const garment = descriptor.mystery.garmentType;
    return { ...descriptor, renderKind: 'generated', rainbow: true, garment, piece: draw(garment), model: BLANKS[garment] };
  }
  return descriptor;
}
function printPlan(piece) { return { front: piece.sides.front.length ? { kind: 'refs', ids: piece.sides.front } : null, back: piece.sides.back.length ? { kind: 'big', ids: piece.sides.back } : null }; }
const categoryNames = { garment: 'Original / Garments', core: 'FW27 / Original artwork', accessory: 'Accessories / In rotation', belt: 'Metal / Belts', necklace: 'Metal / Necklaces', mystery: 'Mystery / House-picked', generated: 'Garment Lab / Random design' };
let stage, printer, scheduler, catalog, current, next, started = false, busy = false, artBusy = false;
let paused = reduced.matches, elapsed = 0, lastArt = 0, sequence = 0, revision = 0, keyboardFocus = false, disposed = false;
const history = []; let historyIndex = -1;
let firstLoadRetries = 0, retryTimer = 0, retryPending = false;
function retryFirstPiece() {
  if (disposed || current) return;
  if (firstLoadRetries >= 2) {
    retryPending = false;
    $('discovery-loading').textContent = '3D preview unavailable. Explore the collection below.';
    return;
  }
  retryPending = true;
  if (retryTimer || !nearby || !pageActive()) return;
  retryTimer = setTimeout(() => {
    retryTimer = 0;
    if (disposed || current || !retryPending || !nearby || !pageActive()) return;
    retryPending = false; firstLoadRetries++;
    void advance();
  }, 1500);
}
let mysteryOpen = false, selectedPackage = Object.hasOwn(MYSTERY_PACKAGES, pageParams.get('package')) ? pageParams.get('package') : 'one-tee', detailsHovered = false, boxPaused = reduced.matches;
let smoke = null, turnPending = false, switchTimer = 0;
function controls() {
  stage?.setAuto(!paused && !mysteryOpen && !detailsHovered && !keyboardFocus && !busy && !artBusy);
  if ($('discovery-random-shirt').tagName === 'BUTTON') $('discovery-random-shirt').disabled = !stage || busy || artBusy || disposed;
}

function labels(item, manual) {
  section.dataset.discoveryId = item.id;
  section.dataset.discoveryKind = item.renderKind;
  section.dataset.discoveryOrigin = item.origin;
  section.dataset.discoveryRainbow = String(!!item.rainbow);
  $('discovery-category').textContent = categoryNames[item.category] || 'The collection';
  $('discovery-number').textContent = String(++sequence).padStart(2, '0');
  $('discovery-name').textContent = item.name;
  $('discovery-description').textContent = item.description;
  $('discovery-price').textContent = item.priceText;
  $('discovery-price-note').textContent = item.priceRangeCents ? 'USD · Random to Cut & Sew' : Number.isFinite(item.priceCents) ? 'USD' : 'Explore available options';
  $('discovery-variation').textContent = item.rainbow ? '↻ Color-shifting fabric + graphics' : item.mystery ? item.mystery.countLabel + ' / a surprise inside' : item.colorway?.name || 'Original artwork';
  $('discovery-link').href = item.href;
  $('discovery-link').replaceChildren(document.createTextNode(item.ctaText || 'View piece'), Object.assign(document.createElement('span'), { textContent: '↗' }));
  $('discovery-link').lastElementChild.setAttribute('aria-hidden', 'true');
  $('discovery-footnote').textContent = item.mystery?.offerOnly ? 'Illustrative preview. Mystery contents and colors are selected by the house.' : item.origin === 'generated' ? 'Featured artwork + house-selected color. Rainbow animation represents the possibilities.' : item.priceRangeCents ? 'Choose your base, size and artwork on the product page.' : item.priceCents == null ? 'Design preview. Visit the piece for customization and availability.' : 'Original design. Open the piece for details and available sizes.';
  mount.setAttribute('aria-label', item.name + ', ' + item.priceText + '. Rotating 3D preview. Drag or use the arrow keys to turn.');
  $('discovery-fallback').hidden = true;
  if (manual) $('discovery-status').textContent = item.name + ', ' + item.priceText;
  if (standalone) {
    document.title = 'BREAKTHYRULE — ' + item.name;
    // Keep a reload/share URL for this draw without adding an entry every animation frame.
    const url = new URL(randomProductLink(item.piece), location.origin);
    window.history.replaceState(window.history.state, '', url);
  }
}
async function print(piece) {
  return printer.apply({ kind: piece.raw.garment, plan: printPlan(piece), color: new window.THREE.Color('#b9d974'), backSize: 'full', print: piece.item.print });
}
function prepareNext() {
  if (standalone || disposed || !nearby || !pageActive() || next) return;
  next = prepareDescriptor(scheduler.next());
  void stage.preload(next);
  if (next.piece) void preloadArt([...next.piece.sides.front, ...next.piece.sides.back]);
}
async function show(item, { manual = false, append = true, historyTarget = null } = {}) {
  if (busy || artBusy || disposed) return false;
  busy = true; controls(); const my = ++revision;
  $('discovery-loading').hidden = false;
  $('discovery-loading').textContent = 'Finding your next piece…';
  section.querySelector('.discovery-details').setAttribute('aria-busy', 'true');
  try {
    const ready = await stage.show(item, { prepare: item.piece ? () => print(item.piece) : undefined });
    if (!ready || my !== revision || disposed) return false;
    current = item; elapsed = lastArt = 0;
    clearTimeout(retryTimer); retryTimer = 0; retryPending = false; firstLoadRetries = 0;
    if (append) { history.splice(historyIndex + 1); history.push(item); if (history.length > 20) history.shift(); historyIndex = history.length - 1; }
    else if (historyTarget !== null) historyIndex = historyTarget;
    labels(item, manual);
    mount.querySelector('canvas')?.animate(reduced.matches ? [{ opacity: 1 }] : [{ opacity: .15, transform: 'translateY(10px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 550, easing: 'ease-out' });
    $('discovery-loading').hidden = true;
    return true;
  } catch (error) {
    console.warn('Discovery could not show this piece:', item.id, error);
    $('discovery-loading').textContent = 'This preview is unavailable. Another piece will appear shortly.';
    return false;
  } finally { busy = false; controls(); section.querySelector('.discovery-details').setAttribute('aria-busy', 'false'); }
}
async function advance(manual = false) {
  if (standalone) {
    if (stage && !busy && !artBusy && !disposed && !mysteryPage) {
      const seed = Number(pageParams.get('seed'));
      const ok = await show(generated({ garment: pageGarment, seed, legacy: isSeed(seed) && pageParams.get('art') !== 'curated-1' }), { manual });
      if (!ok && !current) retryFirstPiece();
    }
    return;
  }
  if (!scheduler || !stage || busy || artBusy || disposed) return;
  if (historyIndex < history.length - 1) { await show(history[historyIndex + 1], { manual, append: false, historyTarget: historyIndex + 1 }); return; }
  const item = next || prepareDescriptor(scheduler.next()); next = null;
  const ok = await show(item, { manual });
  if (!ok) elapsed = lastArt = 0;
  prepareNext();
  if (!ok && !current) { $('discovery-link').textContent = 'Explore the collection ↗'; retryFirstPiece(); }
}
async function randomShirt() {
  if (!stage || busy || artBusy || disposed || mysteryOpen) return;
  clearTimeout(switchTimer); switchTimer = 0; turnPending = false;
  smoke?.clear();
  try {
    await show(generated({ sequence: sequence + 1, garment: standalone ? pageGarment : 'tee' }), { manual: true });
    prepareNext();
  } catch (error) {
    console.warn('Could not prepare a random shirt:', error);
    $('discovery-status').textContent = 'Could not prepare a random shirt. Please try again.';
  }
}
function selectPackage(id) {
  const offer = MYSTERY_PACKAGES[id]; if (!offer) return;
  selectedPackage = id;
  for (const button of section.querySelectorAll('#mystery button[data-package]')) button.setAttribute('aria-pressed', String(button.dataset.package === id));
  $('mystery-stage').classList.toggle('relic', id === 'heavy-pack' || id === 'super-package');
  $('mystery-stage').dataset.package = id;
  $('box-label').textContent = offer.countLabel; $('box-name').textContent = offer.name;
  $('box-copy').textContent = offer.blurb;
  $('box-cta').href = '/lab?package=' + encodeURIComponent(id) + '#packages';
  $('box-cta').textContent = 'Choose ' + offer.name + ' ↗';
  if (mysteryPage) document.title = 'BREAKTHYRULE — Mystery ' + offer.name;
}
function updateBoxMotion() {
  $('mystery-stage').classList.toggle('paused', !mysteryOpen || boxPaused || !pageActive());
  $('box-spin').setAttribute('aria-pressed', String(boxPaused));
  $('box-spin').textContent = boxPaused ? 'Resume rotation ↻' : 'Pause rotation Ⅱ';
}
function selectMode(mode, focus = false) {
  mysteryOpen = mode === 'mystery';
  clearTimeout(switchTimer); switchTimer = 0; turnPending = false; detailsHovered = keyboardFocus = false;
  smoke?.clear();
  $('discovery-chance').hidden = mysteryOpen;
  $('mystery').hidden = !mysteryOpen;
  if ($('discovery-open-mystery').tagName === 'BUTTON') $('discovery-open-mystery').setAttribute('aria-expanded', String(mysteryOpen));
  if (focus) $(mysteryOpen ? 'discovery-back-to-rotation' : 'discovery-open-mystery').focus({ preventScroll: true });
  section.dataset.discoveryMode = mysteryOpen ? 'mystery' : 'chance';
  stage?.setVisible(!mysteryOpen); controls(); updateBoxMotion();
  if (!mysteryOpen) { stage?.resume(); if (nearby && pageActive() && !started) void start(); }
}
function completeTurn() {
  if (standalone || !current || mysteryOpen || paused || disposed || !pageActive()) return;
  smoke?.puff();
  turnPending = true;
}
function finishTurn() {
  if (!turnPending || switchTimer || busy || artBusy || detailsHovered || keyboardFocus || mysteryOpen || !nearby || !pageActive()) return;
  turnPending = false;
  switchTimer = setTimeout(() => {
    switchTimer = 0;
    if (disposed || mysteryOpen) return;
    if (!pageActive() || !nearby || detailsHovered || keyboardFocus || paused || busy || artBusy) { turnPending = true; return; }
    void advance();
  }, 260);
}

async function changeArt() {
  if (!current?.rainbow || artBusy || busy) return;
  artBusy = true; controls(); const my = revision;
  try {
    const piece = draw(current.garment);
    await print(piece);
    if (my !== revision || disposed) return;
    current.piece = piece;
    stage.setRainbow(true);
    if (current.origin === 'generated') { current.href = standalone ? labLink(piece) : randomProductLink(piece); $('discovery-link').href = current.href; }
  } catch (error) { console.warn('Keeping the previous random artwork.', error); }
  finally { artBusy = false; controls(); }
}
function onFrame({ dt, auto, progress }) {
  if (!current || mysteryOpen || busy || !auto || paused) return;
  elapsed += dt;
  $('discovery-progress').style.transform = `scaleX(${progress / (Math.PI * 2)})`;
  finishTurn();
  if (!turnPending && !switchTimer && current.rainbow && elapsed - lastArt >= 3.8) { lastArt = elapsed; void changeArt(); }
}
async function start() {
  if (started || disposed) return; started = true;
  try {
    catalog ||= standalone ? [] : await buildDiscoveryCatalog();
    if (disposed) return;
    if (!nearby || !pageActive() || mysteryOpen) { started = false; return; }
    smoke ||= createSmoke(mount, { colors: ['148,155,142', '179,185,174', '205,208,196'] });
    stage = createDiscoveryStage(mount, { onFrame, onTurn: completeTurn, onInteraction: phase => { if (phase === 'end') { elapsed = 0; lastArt = 0; } } });
    stage.setVisible(!mysteryOpen); printer = createPrinter(stage); controls();
    if (!standalone) scheduler = createDiscoveryScheduler(catalog, { makeGenerated: generated });
    controls();
    // Optional isolated preview used to review a particular product; regular visits use the weighted shuffle.
    const choice = new URLSearchParams(location.search).get('discovery-preview');
    next = choice === 'generated' ? generated() : catalog.find(item => item.id === choice);
    if (next) next = prepareDescriptor(next);
    await advance();
  } catch (error) {
    console.warn('Discovery initialization:', error);
    $('discovery-loading').textContent = 'Explore the collection below.';
    $('discovery-price').textContent = '';
    section.querySelector('.discovery-details').setAttribute('aria-busy', 'false');
  }
}
if (section && mount) {
  for (const button of section.querySelectorAll('#mystery button[data-package]')) {
    const offer = MYSTERY_PACKAGES[button.dataset.package];
    button.querySelector('.package-price').textContent = money(offer.priceCents);
    button.addEventListener('click', () => {
      if (mysteryPage && offer.id !== selectedPackage) location.assign('/mystery-box?package=' + encodeURIComponent(offer.id));
      else selectPackage(offer.id);
    });
  }
  selectPackage(selectedPackage);
  $('box-spin').addEventListener('click', () => { boxPaused = !boxPaused; updateBoxMotion(); });
  if ($('discovery-random-shirt').tagName === 'BUTTON') $('discovery-random-shirt').addEventListener('click', randomShirt);
  selectMode(mysteryPage ? 'mystery' : 'chance');
  const details = section.querySelector('.discovery-details');
  details.addEventListener('pointerenter', event => { detailsHovered = event.pointerType === 'mouse'; controls(); });
  details.addEventListener('pointerleave', () => { detailsHovered = false; controls(); });
  controls();
  const maybeStart = () => {
    updateBoxMotion();
    if (disposed || !nearby || !pageActive() || mysteryOpen) { clearTimeout(retryTimer); retryTimer = 0; smoke?.clear(); return; }
    controls(); stage?.resume();
    if (retryPending) retryFirstPiece();
    if (!started) void start();
    else if (current && !busy && !artBusy && !next) prepareNext();
  };
  const observer = new IntersectionObserver(entries => { nearby = entries.some(e => e.isIntersecting); maybeStart(); }, { rootMargin: '120px' }); observer.observe(section);
  document.addEventListener('btr:page-visibility', maybeStart);
  document.addEventListener('visibilitychange', maybeStart);
  section.addEventListener('focusin', event => { keyboardFocus = !!event.target.closest('.discovery-details') && event.target.matches(':focus-visible'); controls(); });
  section.addEventListener('focusout', () => queueMicrotask(() => { keyboardFocus = details.contains(document.activeElement) && document.activeElement.matches(':focus-visible'); controls(); }));
  section.addEventListener('pointerdown', () => { keyboardFocus = false; controls(); }, { passive: true });
  reduced.addEventListener('change', () => { paused = reduced.matches; boxPaused = reduced.matches; smoke?.clear(); controls(); updateBoxMotion(); });
  addEventListener('pageshow', maybeStart);
  section.addEventListener('pointercancel', () => { detailsHovered = keyboardFocus = false; controls(); stage?.resume(); });
  addEventListener('pagehide', event => { if (event.persisted) return; disposed = true; revision++; clearTimeout(switchTimer); smoke?.destroy(); clearTimeout(retryTimer); retryTimer = 0; observer.disconnect(); document.removeEventListener('btr:page-visibility', maybeStart); document.removeEventListener('visibilitychange', maybeStart); removeEventListener('pageshow', maybeStart); stage?.destroy(); });
}
