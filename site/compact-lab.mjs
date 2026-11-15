// Compact home-page lab. A single viewer follows four independent garment designs.
import { createPrinter } from '/site/garment-print.mjs';
import { createGraphicPicker } from '/site/graphic-picker.mjs?v=2';
import { createWallMotion } from '/site/sticker-wall-motion.mjs?v=1';
import { uploadArtworkFile } from '/site/artwork-upload.mjs?v=1';
import { uploadedArtworkUrl } from '/labkit/custom-artwork.mjs';
import { OFFERINGS, formatCents } from '/labkit/catalog.mjs';
import { POOL_IDS } from '/labkit/artwork-pool.mjs';

const host = document.getElementById('codex-lab');
const configs = [
  { id: 'tee', name: 'Tee', url: '/models/blanks/tee.glb', kind: 'tee', construction: 'canvas', garment: 'tee', color: 'white' },
  { id: 'thermal', name: 'Thermal', url: '/rack-models/eternal-thermal-tailored-v6.glb', kind: 'tee', construction: 'cut-sew', garment: 'longsleeve', color: 'white' },
  { id: 'hoodie', name: 'Hoodie', url: '/models/blanks/hoodie.glb', kind: 'hoodie', construction: 'canvas', garment: 'hoodie', color: 'black' },
  { id: 'crew', name: 'Crewneck', url: '/models/blanks/crewneck.glb', kind: 'crewneck', construction: 'canvas', garment: 'crewneck', color: 'black' }
];
const fabric = { white: '#eeece6', black: '#1b1a19' };
const eligible = new Set(POOL_IDS);
const allGraphics = window.breakthyruleAssets?.graphics || [];
const graphics = allGraphics.filter(g => eligible.has(g.id));
const originalIndex = new Map(allGraphics.map((g, index) => [g.id, index]));
const graphicById = new Map(graphics.map(g => [g.id, g]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const h = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children.flat()) if (child != null) node.append(child);
  return node;
};
const button = (label, run, className = '') => {
  const node = h('button', { type: 'button', textContent: label, className });
  node.addEventListener('click', run);
  return node;
};
const encode = value => btoa(unescape(encodeURIComponent(JSON.stringify(value)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

if (host) {
  const wall = host.dataset.stickerWall ? document.getElementById(host.dataset.stickerWall) : null;
  const unified = !!wall;
  host.classList.add('compact-lab');
  host.classList.toggle('cgl-unified', unified);
  host.classList.toggle('cgl-studio', unified);
  const designs = new Map(configs.map(c => [c.id, { ...c, front: [], back: [], uploads: [], side: 'front', spin: !reduced.matches }]));
  let activeId = 'tee', viewer = null, printer = null, loadedId = null;
  let revision = 0, rendering = false, visible = false, unavailable = false, page = 0, uploading = false;
  const state = () => designs.get(activeId);
  const status = h('p', { className: 'cgl-status', id: 'compact-lab-status', role: 'status', ariaLive: 'polite', textContent: unified ? 'Tap a sticker to print it, or drag one onto the garment.' : 'Choose a garment, then tap a graphic or drag one from the sticker board.' });
  const announce = message => { status.textContent = message; };
  const consoleRoot = unified ? host.closest('.workshop-console') : null;
  const title = h('strong', { className: 'cgl-garment-title' });
  const price = h('span', { className: 'cgl-price' });
  const type = h('span', { className: 'cgl-construction' });
  const tabs = h('div', { className: 'cgl-garments', role: 'group', ariaLabel: 'Choose a garment' });
  for (const config of configs) {
    const tab = button(config.name, () => {
      if (activeId === config.id) return;
      activeId = config.id;
      if (unavailable) { unavailable = false; loadedId = null; retry.hidden = true; }
      refresh();
      requestRender();
      announce(config.name + ' selected. Your other garment designs are kept while you explore.');
    });
    tab.dataset.garment = config.id;
    tabs.append(tab);
  }

  const fallback = h('div', { className: 'cgl-fallback', ariaHidden: 'true' });
  fallback.innerHTML = '<svg viewBox="0 0 280 300" fill="none"><path d="M92 28 62 40 15 92 56 129 82 105 82 274 198 274 198 105 224 129 265 92 218 40 188 28C181 53 99 53 92 28Z" fill="var(--garment-color)" stroke="currentColor" stroke-width="2"/><path d="M92 28C99 65 181 65 188 28" stroke="currentColor" stroke-width="2"/><path d="M86 264H194" stroke="currentColor" opacity=".25"/></svg>';
  const fallbackArt = h('div', { className: 'cgl-fallback-art' });
  fallback.append(fallbackArt);
  const loading = h('span', { className: 'cgl-loading', textContent: '3D preview loads as you arrive' });
  const drop = h('span', { className: 'cgl-drop', textContent: 'Drop graphic to print', ariaHidden: 'true' });
  const stage = h('div', { className: 'cgl-stage', tabIndex: 0, role: 'img', ariaLabel: 'Interactive garment preview. Use left and right arrow keys to turn the garment.' }, fallback, loading, drop);
  const spin = button('Pause turn', () => { state().spin = !state().spin; refresh(); viewer?.setAuto(state().spin); });
  spin.className = 'cgl-spin';
  const retry = button('Retry 3D', () => { unavailable = false; loadedId = null; retry.hidden = true; requestRender(); });
  retry.className = 'cgl-retry'; retry.hidden = true;
  stage.addEventListener('pointerdown', event => {
    if (event.target.closest('button,a')) return;
    state().spin = false;
    refreshSpin();
  });
  stage.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { state().spin = false; refreshSpin(); }
  });
  const sideButtons = h('div', { className: 'cgl-segment', role: 'group', ariaLabel: 'Print side' });
  for (const side of ['front', 'back']) {
    const control = button(side === 'front' ? 'Front' : 'Back', () => {
      state().side = side; state().spin = false; refresh(); requestRender();
      announce(side === 'front' ? 'Front selected. Add up to three graphics.' : 'Back selected. Add one large graphic.');
    });
    control.dataset.side = side;
    sideButtons.append(control);
  }
  const swatches = h('div', { className: 'cgl-swatches', role: 'group', ariaLabel: 'Garment color' });
  for (const color of ['white', 'black']) {
    const control = button(color === 'white' ? 'White' : 'Black', () => { state().color = color; refresh(); requestRender(); announce(color + ' fabric selected.'); });
    control.dataset.color = color;
    control.style.setProperty('--swatch', fabric[color]);
    swatches.append(control);
  }
  const chips = h('div', { className: 'cgl-picks', ariaLabel: 'Selected graphics on this side' });
  const selectedCount = h('span', { className: 'cgl-count' });
  const make = h('a', { className: 'cgl-make', href: '/lab#build', textContent: 'Continue this design ↗' });
  const reset = button('Clear this side', () => {
    state()[state().side] = []; refresh(); requestRender(); announce('Graphics cleared from the ' + state().side + '.');
  }, 'cgl-text-button');
  const shuffle = button('✦ Shuffle', () => {
    if (!graphics.length) return;
    const list = graphics.slice();
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    state()[state().side] = list.slice(0, state().side === 'back' ? 1 : Math.min(3, 1 + Math.floor(Math.random() * 3))).map(g => g.id);
    refresh(); requestRender(); announce('New graphics on the ' + state().side + '. Keep shuffling or choose your own.');
  }, 'cgl-shuffle');

  // The wall stays a loose collage; the full searchable library lives in a dialog.
  const search = h('input', { type: 'search', id: 'compact-art-search', placeholder: 'Find a graphic', autocomplete: 'off' });
  const palette = unified ? wall : h('div', { className: 'cgl-palette', role: 'group', ariaLabel: 'Graphics: choose one to print' });
  const pageCount = h('span', { className: 'cgl-page-count', ariaLive: 'polite' });
  const prev = button('←', () => { page--; renderPalette(); });
  const next = button('→', () => { page++; renderPalette(); });
  prev.setAttribute('aria-label', 'Previous graphics'); next.setAttribute('aria-label', 'Next graphics');
  search.addEventListener('input', () => { page = 0; renderPalette(); });
  const toolbar = h('div', { className: 'cgl-toolbar' }, ...(unified ? [swatches] : [sideButtons, swatches]));
  const controls = h('div', { className: 'cgl-editor' });
  if (!unified) controls.append(
    h('div', { className: 'cgl-editor-heading' }, h('span', { className: 'cgl-step', textContent: '02 / MAKE YOUR MARK' }), selectedCount), toolbar,
    h('label', { className: 'cgl-search-label', htmlFor: 'compact-art-search' }, h('span', { textContent: 'Pick your artwork' }), search),
    palette, h('div', { className: 'cgl-pagination' }, pageCount, h('div', {}, prev, next)));
  if (unified) {
    reset.textContent = 'Clear'; reset.setAttribute('aria-label', 'Clear graphics from this side');
    status.classList.add('snapshot-a11y');
    controls.append(h('div', { className: 'cgl-selection' }, chips, reset), status, make);
  } else controls.append(chips, h('div', { className: 'cgl-actions' }, shuffle, reset), status, make,
    h('p', { className: 'cgl-note', textContent: 'Choose your size and finish in the full Lab. This preview is a guide to placement.' }));
  const view = h('div', { className: 'cgl-view' }, h('span', { className: 'cgl-step', textContent: unified ? 'CHOOSE YOUR GARMENT' : '01 / CHOOSE YOUR CANVAS' }), tabs);
  const turnTools = unified ? h('div', { className: 'cgl-turn-tools' }, sideButtons, spin) : null;
  const stageWrap = h('div', { className: 'cgl-stage-wrap' }, stage, retry);
  const itemInfo = h('div', { className: 'cgl-item-info' }, h('div', {}, title, type), price);
  if (unified) view.append(stageWrap, turnTools, h('div', { className: 'cgl-fabric-row' }, itemInfo, swatches));
  else { stageWrap.append(h('span', { className: 'cgl-drag-hint', textContent: 'DRAG TO TURN' }), spin); view.append(stageWrap, itemInfo); }
  host.replaceChildren(
    h('div', { className: 'cgl-console-top' }, h('span', { textContent: 'THE GARMENT LAB / BUILD MODE' }), h('span', { className: 'cgl-live', textContent: 'YOUR RULES' })),
    h('div', { className: 'cgl-layout' }, view, controls));
  let picker = null, wallMotion = null;
  if (unified) {
    picker = createGraphicPicker({ items: graphics, onPick: addGraphic, getSelected: () => state()[state().side], onClose: () => wallMotion?.restart() });
    const browse = document.getElementById('wall-browse');
    browse.addEventListener('click', () => picker.open(browse));
    document.getElementById('wall-library-count').textContent = String(graphics.length);
    const uploadButton = document.getElementById('wall-upload'), fileInput = document.getElementById('wall-upload-input');
    const uploadMessage = document.getElementById('wall-upload-message');
    uploadButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0]; if (!file) return;
      const targetId = activeId, targetSide = state().side;
      uploading = true; refresh();
      uploadButton.disabled = true; uploadButton.textContent = 'Uploading…'; uploadButton.setAttribute('aria-busy', 'true');
      uploadMessage.hidden = false; uploadMessage.textContent = 'Uploading your artwork…';
      try {
        const { asset } = await uploadArtworkFile(file), target = designs.get(targetId);
        const url = uploadedArtworkUrl(asset);
        graphicById.set(asset.id, { id: asset.id, name: asset.name, thumb: url });
        target.uploads.push(asset);
        const limit = targetSide === 'back' ? 1 : 3;
        target[targetSide] = [...target[targetSide], asset.id].slice(-limit);
        target.spin = false;
        pruneUploads(target); refresh(); requestRender();
        uploadMessage.textContent = asset.name + ' added to ' + target.name + ' · ' + targetSide + '.';
        announce(uploadMessage.textContent);
      } catch (error) {
        uploadMessage.textContent = error.message || 'Your artwork could not be uploaded. Please try again.';
        announce(uploadMessage.textContent);
      } finally {
        uploading = false; refresh();
        fileInput.value = ''; uploadButton.disabled = false; uploadButton.textContent = 'Upload ↑'; uploadButton.removeAttribute('aria-busy');
        wallMotion?.restart();
      }
    });
  }

  if (unified) {
    const smallScreen = matchMedia('(max-width: 600px)');
    const bench = consoleRoot.querySelector('.workshop-bench');
    const art = consoleRoot.querySelector('.workshop-art');
    const layout = host.querySelector('.cgl-layout');
    const step = view.querySelector('.cgl-step');
    const fabricRow = view.querySelector('.cgl-fabric-row');
    const siteHeader = document.querySelector('.site-top');
    step.textContent = 'Garment preview';
    // Put both equally sized surfaces first, with their controls close below.
    art.append(art.querySelector('.workshop-art-heading'), art.querySelector('.sticker-board'),
      art.querySelector('.workshop-art-tools'), art.querySelector('.workshop-wall-hint'),
      art.querySelector('.workshop-upload-message'));
    function arrangeWorkshop() {
      layout.append(view, controls);
      if (smallScreen.matches) {
        view.append(step, stageWrap, art, turnTools, tabs, fabricRow);
      } else {
        bench.append(art);
        view.append(step, stageWrap, turnTools, tabs, fabricRow);
      }
      requestAnimationFrame(updateScrollOffset);
    }
    // The page owns vertical scrolling. Only explicit navigation returns to the shirt.
    function updateScrollOffset() {
      const headerPinned = siteHeader && ['sticky', 'fixed'].includes(getComputedStyle(siteHeader).position);
      const headerHeight = headerPinned ? siteHeader.getBoundingClientRect().height : 0;
      consoleRoot.style.setProperty('--workshop-top', (headerHeight + 6) + 'px');
      host.closest('.unified-workshop')?.style.setProperty('--workshop-top', (headerHeight + 6) + 'px');
    }
    smallScreen.addEventListener('change', arrangeWorkshop);
    if (siteHeader) new ResizeObserver(updateScrollOffset).observe(siteHeader);
    window.addEventListener('resize', updateScrollOffset, { passive: true });
    arrangeWorkshop();
  }


  function pruneUploads(s) {
    const selected = new Set([...s.front, ...s.back]);
    s.uploads = s.uploads.filter(asset => selected.has(asset.id));
  }
  function designPayload(s) {
    pruneUploads(s);
    return { product: 'garment', construction: s.construction, garment: s.garment, fit: s.construction === 'cut-sew' ? 'regular' : 'blank', color: s.color, artwork: 'pick', picks: { front: [...s.front], back: [...s.back] }, backSize: 'full', quantity: 1, ...(s.uploads.length ? { uploads: s.uploads } : {}) };
  }
  function refreshSpin() {
    spin.textContent = state().spin ? 'Ⅱ Pause turn' : '↻ Rotate';
    spin.setAttribute('aria-pressed', String(state().spin));
  }
  function refresh() {
    const s = state();
    tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.garment === s.id)));
    sideButtons.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.side === s.side)));
    swatches.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === s.color)));
    title.textContent = s.name;
    type.textContent = s.construction === 'cut-sew' ? 'Cut & sew · made from scratch' : 'The Canvas · printed in house';
    price.textContent = formatCents(OFFERINGS[s.construction][s.garment].priceCents);
    selectedCount.textContent = s[ s.side ].length + '/' + (s.side === 'front' ? '3 front' : '1 back');
    const destination = '/lab?design=' + encode(designPayload(s)) + '#build';
    if (uploading) make.removeAttribute('href'); else make.href = destination;
    make.setAttribute('aria-disabled', String(uploading));
    reset.disabled = s[s.side].length === 0;
    if (unified) { reset.hidden = reset.disabled; controls.querySelector('.cgl-selection').hidden = reset.disabled; }
    fallback.style.setProperty('--garment-color', fabric[s.color]);
    fallbackArt.replaceChildren(...s[s.side].map(id => h('img', { src: graphicById.get(id).thumb, alt: '' })));
    fallbackArt.dataset.count = String(s[s.side].length);
    chips.replaceChildren(...s[s.side].map(id => {
      const chip = button(graphicById.get(id).name + ' ×', () => { const current = state(); current[current.side] = current[current.side].filter(x => x !== id); refresh(); requestRender(); announce('Removed ' + graphicById.get(id).name + '.'); });
      chip.setAttribute('aria-label', 'Remove ' + graphicById.get(id).name + ' from ' + s.side);
      return chip;
    }));
    stage.setAttribute('aria-label', s.color + ' ' + s.name + ', ' + s.side + '. ' + s[s.side].length + ' graphics selected. Use left and right arrow keys to turn.');
    refreshSpin(); updatePaletteSelection(); picker?.refresh();
  }
  function addGraphic(id) {
    if (!graphicById.has(id)) { announce('This graphic is for the archive. Choose a printable sticker from the wall.'); return; }
    const s = state(), limit = s.side === 'front' ? 3 : 1;
    if (s[s.side].includes(id)) { announce(graphicById.get(id).name + ' is already on the ' + s.side + '.'); return; }
    const replaced = s[s.side].length >= limit;
    s[s.side] = [...s[s.side], id].slice(-limit);
    s.spin = false;
    refresh(); requestRender();
    announce(graphicById.get(id).name + ' added to the ' + s.side + (replaced ? ', replacing the oldest graphic.' : '.'));
    host.classList.remove('cgl-printed');
    requestAnimationFrame(() => host.classList.add('cgl-printed'));
  }
  function updatePaletteSelection() {
    palette.querySelectorAll('button[data-graphic]').forEach(b => {
      const selected = state()[state().side].includes(b.dataset.graphic);
      b.setAttribute('aria-pressed', String(selected));
      b.classList.toggle('is-selected', selected);
      b.setAttribute('aria-label', 'Print ' + graphicById.get(b.dataset.graphic).name + ' on the ' + state().side + (selected ? ', already selected' : ''));
    });
  }
  const random = (min, max) => min + Math.random() * (max - min);
  const shuffleWallOrder = () => {
    for (let i = wallOrder.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [wallOrder[i], wallOrder[j]] = [wallOrder[j], wallOrder[i]]; }
  };
  let wallOrder = graphics.slice();
  if (unified) {
    shuffleWallOrder();
    // The wall is the palette. Sticker dragging stays in stickers.js so the same
    // pointer gesture and floating graphic work throughout the site.
    palette.setAttribute('role', 'group');
    palette.setAttribute('aria-label', 'Printable sticker wall. Tap a graphic to print it on the selected garment.');
    document.addEventListener('btr-sticker-select', event => {
      if (event.detail?.item) addGraphic(event.detail.item.id);
    });
    const wallShuffle = document.getElementById('wall-shuffle');
    const wallPlay = h('button', { type: 'button', textContent: 'Ⅱ', className: 'workshop-icon-button wall-motion-toggle' });
    wallPlay.id = 'wall-motion';
    wallShuffle.textContent = '↻';
    wallShuffle.title = 'New wall';
    wallShuffle.setAttribute('aria-label', 'Shuffle a new sticker wall');
    const wallTools = h('div', { className: 'wall-motion-tools' }, wallPlay);
    wallShuffle.before(wallTools); wallTools.append(wallShuffle);
    wallShuffle.addEventListener('click', () => {
      freshWall(); wallMotion?.restart();
      announce('New wall. Your garment design is kept.');
    });
    wallMotion = createWallMotion({ wall, button: wallPlay, shuffle: freshWall, rearrange: rearrangeWall, isBusy: () => uploading });
    // Restore the original bare-paper gesture without changing the garment design.
    wall.addEventListener('click', event => {
      if (event.target !== wall) return;
      const term = search.value.trim().toLowerCase();
      const pool = graphics.filter(g => g.name.toLowerCase().includes(term));
      if (!pool.length) return;
      const graphic = pool[Math.floor(Math.random() * pool.length)];
      const rect = wall.getBoundingClientRect(), cell = wall.clientWidth < 600 ? 96 : 132;
      const size = Math.round(cell * random(.85, 1.3));
      const sticker = makeWallSticker(graphic, event.clientX - rect.left - size / 2, event.clientY - rect.top - size / 2, size);
      sticker.classList.add('slapped'); sticker.dataset.extra = 'true';
      const extras = wall.querySelectorAll('[data-extra]');
      if (extras.length >= 12) extras[0].remove();
      wall.append(sticker); updatePaletteSelection();
      wallMotion?.restart();
      announce('A new sticker on the wall. Tap it to print it on your garment.');
    });
    let width = wall.clientWidth, height = wall.clientHeight, frame;
    new ResizeObserver(() => {
      if (Math.abs(wall.clientWidth - width) < 10 && Math.abs(wall.clientHeight - height) < 10) return;
      width = wall.clientWidth; height = wall.clientHeight;
      cancelAnimationFrame(frame); frame = requestAnimationFrame(renderPalette);
    }).observe(wall);
  }
  function freshWall() {
    shuffleWallOrder(); page = 0; renderPalette();
    wall.dataset.wallArrangement = 'shuffle';
    if (!reduced.matches) wall.querySelectorAll('.wall-print').forEach((sticker, i) => {
      sticker.style.setProperty('--slap-delay', (i % 8) * 28 + 'ms');
      sticker.classList.add('wall-arrive');
    });
  }
  function rearrangeWall() {
    const stickers = [...wall.querySelectorAll('.wall-print')];
    if (!stickers.length) return;
    const cell = wall.clientWidth < 600 ? 96 : 132;
    const cols = Math.max(3, Math.round(wall.clientWidth / cell));
    const rows = Math.max(2, Math.ceil(stickers.length / cols));
    const cw = wall.clientWidth / cols, ch = wall.clientHeight / rows;
    const positions = stickers.map((_, i) => i);
    for (let i = positions.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [positions[i], positions[j]] = [positions[j], positions[i]]; }
    stickers.forEach((sticker, i) => {
      const oldX = sticker.offsetLeft, oldY = sticker.offsetTop, oldSize = sticker.offsetWidth;
      const oldRotation = sticker.style.getPropertyValue('--r');
      const size = Math.round(cell * random(.85, 1.3)), position = positions[i];
      const x = (position % cols + .5) * cw - size / 2 + random(-cw * .22, cw * .22);
      const y = (Math.floor(position / cols) + .5) * ch - size / 2 + random(-ch * .2, ch * .2);
      const rotation = random(-13, 13).toFixed(1) + 'deg';
      sticker.getAnimations().forEach(animation => animation.cancel());
      sticker.classList.remove('wall-arrive', 'slapped');
      sticker.style.left = x + 'px'; sticker.style.top = y + 'px'; sticker.style.width = size + 'px';
      sticker.style.setProperty('--r', rotation);
      if (!reduced.matches) sticker.animate([
        { transform: `translate(${oldX - x}px,${oldY - y}px) rotate(${oldRotation}) scale(${oldSize / size})` },
        { transform: `translate(0,0) rotate(${rotation}) scale(1)` }
      ], { duration: 780, delay: (i % 6) * 35, easing: 'cubic-bezier(.22,.8,.25,1)', fill: 'backwards' });
    });
    wall.dataset.wallArrangement = 'rearrange';
  }
  function makeWallSticker(graphic, left, top, size) {
    const sticker = h('button', { type: 'button', className: 'paste wall-print' });
    sticker.dataset.graphic = graphic.id;
    sticker.dataset.index = originalIndex.get(graphic.id);
    sticker.title = graphic.name;
    sticker.setAttribute('aria-label', 'Print ' + graphic.name + ' on the ' + state().side);
    // Natural image proportions, varied scale and loose placement restore the pasted-up wall.
    sticker.style.cssText = `left:${left}px;top:${top}px;width:${size}px;--r:${random(-13, 13).toFixed(1)}deg`;
    sticker.append(h('img', { src: graphic.thumb, alt: '', loading: 'eager', decoding: 'async', draggable: false }));
    return sticker;
  }
  function renderPalette() {
    if (unified && !wall.clientWidth) return;
    const term = unified ? '' : search.value.trim().toLowerCase(), matches = (unified ? wallOrder : graphics).filter(g => g.name.toLowerCase().includes(term));
    // The original wall's density responds to the paper, instead of forcing square inventory slots.
    const cell = unified && wall.clientWidth < 600 ? 96 : 132;
    const cols = unified ? Math.max(3, Math.round(wall.clientWidth / cell)) : 4;
    const rows = unified ? Math.max(2, Math.round(wall.clientHeight / (cell * .85))) : 2;
    const pageSize = unified ? cols * rows : 8;
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    page = Math.max(0, Math.min(page, totalPages - 1));
    const visible = unified ? matches.slice(0, pageSize) : matches.slice(page * pageSize, (page + 1) * pageSize);
    const cellW = unified ? wall.clientWidth / cols : 0, cellH = unified ? wall.clientHeight / rows : 0;
    palette.replaceChildren(...visible.map((g, index) => {
      if (unified) {
        const size = Math.round(cell * random(.85, 1.3));
        return makeWallSticker(g,
          (index % cols + .5) * cellW - size / 2 + random(-cellW * .22, cellW * .22),
          (Math.floor(index / cols) + .5) * cellH - size / 2 + random(-cellH * .2, cellH * .2), size);
      }
      const b = button('', () => addGraphic(g.id)); b.dataset.graphic = g.id; b.title = g.name;
      b.setAttribute('aria-label', 'Print ' + g.name + ' on the ' + state().side);
      b.append(h('img', { src: g.thumb, alt: '', loading: 'lazy', decoding: 'async', draggable: false }), h('span', { textContent: g.name }));
      return b;
    }));
    if (!matches.length) palette.append(h('p', { className: 'cgl-no-art', textContent: term ? 'No stickers found. Try another word.' : 'Graphics are unavailable. Continue in the full Lab.' }));
    pageCount.textContent = matches.length ? (unified ? 'Wall ' + (page + 1) + ' / ' + totalPages : 'Art ' + (page * pageSize + 1) + '–' + Math.min(matches.length, (page + 1) * pageSize) + ' / ' + matches.length) : '0 graphics';
    prev.disabled = page === 0; next.disabled = page === totalPages - 1;
    updatePaletteSelection();
  }

  // A queue, rather than parallel load() calls, keeps fast garment switching from
  // displaying an older request after a newer selection. States and links update immediately.
  function requestRender() { revision++; if (visible && !rendering && !unavailable) void render(); }
  async function render() {
    if (rendering || unavailable) return;
    rendering = true;
    try {
      if (!viewer) {
        viewer = window.createGarmentViewer?.(stage, { spin: .38 });
        if (!viewer || !window.THREE) throw new Error('3D unavailable');
        printer = createPrinter(viewer);
      }
      let completedRevision = -1;
      while (completedRevision !== revision) {
        const currentRevision = revision, s = state();
        if (loadedId !== s.id) {
          stage.classList.remove('is-ready'); loading.hidden = false; loading.textContent = 'Loading ' + s.name + '…';
          try { await viewer.load(s.url); }
          catch (error) { if (s.id !== activeId) continue; throw error; }
          loadedId = s.id;
          if (s.id !== activeId) continue;
        }
        const latest = state();
        await printer.apply({ kind: latest.kind, plan: { front: latest.front.length ? { kind: 'refs', ids: [...latest.front] } : null, back: latest.back.length ? { kind: 'big', ids: [...latest.back] } : null }, color: new window.THREE.Color(fabric[latest.color]), backSize: 'full', uploads: latest.uploads });
        if (latest.id !== activeId || currentRevision !== revision) continue;
        viewer.view(latest.side); viewer.setAuto(latest.spin);
        stage.classList.add('is-ready'); stage.querySelector('canvas')?.classList.add('live'); loading.hidden = true;
        completedRevision = currentRevision;
      }
    } catch {
      // Keep the actual design, palette and deep-link usable even without WebGL/assets.
      unavailable = true; stage.classList.remove('is-ready'); loading.hidden = false; retry.hidden = false;
      loading.textContent = '2D placement guide · continue in the full Lab';
      announce('The 3D preview is unavailable. Your design is kept; you can still choose graphics and continue in the full Lab.');
    } finally { rendering = false; }
  }

  const overStage = event => { const r = stage.getBoundingClientRect(); return event.detail.x >= r.left && event.detail.x <= r.right && event.detail.y >= r.top && event.detail.y <= r.bottom; };
  document.addEventListener('btr-sticker-drag', event => stage.classList.toggle('is-over', overStage(event)));
  document.addEventListener('btr-sticker-drop', event => {
    stage.classList.remove('is-over');
    if (overStage(event) && event.detail.item) { event.preventDefault(); addGraphic(event.detail.item.id); }
  });
  reduced.addEventListener('change', event => { if (event.matches) { designs.forEach(s => s.spin = false); refreshSpin(); viewer?.setAuto(false); } });
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { visible = true; observer.disconnect(); requestRender(); }
  }, { rootMargin: '180px' });
  observer.observe(stage);
  renderPalette(); refresh();
}
