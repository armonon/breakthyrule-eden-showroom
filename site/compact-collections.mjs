const home = document.body.dataset.page === 'home';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const sections = new Map();
const definitions = [
  {id: 'products', title: 'Garments', grid: '#product-grid', more: '#collection-more'},
  {id: 'necklaces', title: 'Chains', grid: '#pendant-grid', more: '.pendant-more'},
  {id: 'belts', title: 'Belts', grid: '.belt-grid'}
];
const element = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children.flat()) if (child != null) node.append(child);
  return node;
};
const activePage = () => window.showroomPageActive?.() ?? !document.hidden;

function completeBeltGrid(section, grid) {
  const existing = new Set([...grid.querySelectorAll('.belt-card-image')].map(link => new URL(link.href).searchParams.get('item')));
  for (const item of window.BTR_BELTS || []) {
    if (existing.has(item.id)) continue;
    const href = '/product?item=' + encodeURIComponent(item.id);
    const image = element('img', {src: '/btr-belts/' + item.poster, alt: item.name + ', sculptural buckle and black strap', width: 800, height: 500, loading: 'lazy', decoding: 'async'});
    const price = new Intl.NumberFormat('en-US', {style: 'currency', currency: item.currency, maximumFractionDigits: 0}).format(item.price);
    grid.append(element('article', {className: 'belt-card'},
      element('a', {href, className: 'belt-card-image'}, image),
      element('div', {className: 'belt-card-copy'},
        element('h3', {}, element('a', {href, textContent: item.name})),
        element('p', {className: 'accessory-price', textContent: price + ' ' + item.currency + ' · complete belt'}),
        element('div', {className: 'belt-card-actions'}, element('a', {href, className: 'ghost', textContent: 'Explore ↗'})))));
  }
  const status = section.querySelector('.collection-browse-row > .fine');
  if (status) status.textContent = grid.children.length + ' belt designs';
}

function startPhotoCycle(state) {
  let timer = 0, generation = 0, visible = false, pair = 0;
  const photos = [...state.grid.querySelectorAll('.product-card:not([data-accessory-replacement])')].map(card => ({
    src: card.querySelector('img')?.getAttribute('src'),
    alt: card.querySelector('img')?.alt,
    name: card.querySelector('h3')?.textContent || 'Garment'
  })).filter(photo => photo.src);
  function paint() {
    const current = ++generation;
    state.slots.forEach(async (slot, index) => {
      const photo = photos[(pair * 2 + index) % photos.length];
      if (!photo) return;
      const image = new Image(); image.decoding = 'async'; image.src = photo.src;
      try { await image.decode(); } catch { return; }
      if (current !== generation) return;
      const target = slot.querySelector('[data-compact-fallback]');
      target.src = photo.src; target.alt = photo.alt || photo.name;
      slot.querySelector('[data-compact-name]').textContent = photo.name;
      slot.setAttribute('aria-label', 'Expand garments — ' + photo.name);
      if (!reduced.matches && visible) target.animate([{opacity: .3}, {opacity: 1}], {duration: 380, easing: 'ease-out'});
    });
  }
  function schedule() {
    clearTimeout(timer);
    if (!visible || state.expanded || !activePage() || reduced.matches || photos.length < 3) return;
    timer = setTimeout(() => { pair++; paint(); schedule(); }, 5000);
  }
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); }, {threshold: .05});
  observer.observe(state.preview);
  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('btr:page-visibility', schedule);
  reduced.addEventListener('change', schedule);
  state.photoMotion = schedule;
  paint();
}

function mount(definition) {
  const section = document.getElementById(definition.id);
  const grid = section?.querySelector(definition.grid);
  const heading = section?.querySelector(':scope > .section-head');
  if (!section || !grid || !heading || sections.has(definition.id) || !grid.children.length) return;
  const title = heading.querySelector('h2');
  if (title) title.textContent = definition.title;
  const panel = element('div', {className: 'collection-compact-panel', id: definition.id + '-expanded', hidden: true});
  const preview = element('div', {className: 'collection-compact-preview'});
  const slots = Array.from({length: 2}, (_, index) => {
    const source = [...grid.querySelectorAll('img')][index];
    const player = [...grid.querySelectorAll('transparent-spin')][index];
    const slot = element('button', {className: 'collection-compact-slot', type: 'button', ariaLabel: 'Expand ' + definition.title.toLowerCase()});
    slot.dataset.compactSlot = String(index);
    slot.setAttribute('aria-controls', panel.id); slot.setAttribute('aria-expanded', 'false');
    const fallback = element('img', {src: source?.getAttribute('src') || player?.getAttribute('poster') || '', alt: source?.alt || player?.getAttribute('label') || definition.title, loading: 'lazy', decoding: 'async', width: 480, height: 480});
    fallback.dataset.compactFallback = '';
    const name = element('span', {className: 'collection-compact-name', textContent: [...grid.querySelectorAll('h3')][index]?.textContent || definition.title}); name.dataset.compactName = '';
    slot.append(fallback);
    if (definition.id !== 'products') {
      const canvas = element('canvas', {width: 480, height: 480});
      canvas.dataset.compactMetal = definition.id; canvas.dataset.compactSlot = String(index); canvas.setAttribute('aria-hidden', 'true');
      slot.append(canvas);
    }
    slot.append(name); preview.append(slot); return slot;
  });
  const toggle = element('button', {className: 'collection-compact-toggle', type: 'button', textContent: '+'});
  toggle.setAttribute('aria-controls', panel.id);
  const row = element('div', {className: 'collection-compact-row'}, heading, preview, toggle);
  for (const child of [...section.children]) if (child !== heading) panel.append(child);
  section.append(row, panel);
  section.dataset.compactCollection = definition.id;
  const state = {section, grid, preview, slots, toggle, panel, expanded: false, definition};
  sections.set(definition.id, state);
  const collapse = element('button', {className: 'collection-compact-close', type: 'button', textContent: 'Collapse ' + definition.title.toLowerCase() + ' ↑'});
  panel.append(collapse);
  const setExpanded = (expanded, save = true, focus = false) => {
    if (!expanded && panel.contains(document.activeElement)) toggle.focus({preventScroll: true});
    if (expanded && preview.contains(document.activeElement)) toggle.focus({preventScroll: true});
    state.expanded = expanded;
    if (expanded) {
      if (definition.id === 'belts') completeBeltGrid(section, grid);
      const more = definition.more && panel.querySelector(definition.more);
      if (more?.getAttribute('aria-expanded') === 'false') more.click();
      for (const card of grid.children) card.hidden = false;
    }
    panel.hidden = !expanded; preview.hidden = expanded;
    section.dataset.collectionExpanded = String(expanded);
    toggle.textContent = expanded ? '−' : '+';
    toggle.setAttribute('aria-label', (expanded ? 'Collapse ' : 'Expand ') + definition.title.toLowerCase());
    toggle.setAttribute('aria-expanded', String(expanded));
    slots.forEach(slot => slot.setAttribute('aria-expanded', String(expanded)));
    if (save) history.replaceState({...history.state, btrCompactCollections: {...history.state?.btrCompactCollections, [definition.id]: expanded}}, '');
    state.photoMotion?.();
    document.dispatchEvent(new CustomEvent('btr:collection-toggle', {detail: {section: definition.id, element: section, expanded}}));
    if (focus && !expanded) section.scrollIntoView({block: 'start', behavior: reduced.matches ? 'instant' : 'smooth'});
  };
  state.setExpanded = setExpanded;
  toggle.addEventListener('click', () => setExpanded(!state.expanded));
  slots.forEach(slot => slot.addEventListener('click', () => setExpanded(true)));
  heading.addEventListener('click', event => { if (!event.target.closest('a,button')) setExpanded(!state.expanded); });
  collapse.addEventListener('click', () => setExpanded(false, true, true));
  setExpanded(history.state?.btrCompactCollections?.[definition.id] === true, false);
  if (definition.id === 'products') startPhotoCycle(state);
  document.dispatchEvent(new CustomEvent('btr:collection-ready', {detail: {section: definition.id, element: section, slots}}));
}

if (home) {
  const scan = () => definitions.forEach(mount);
  const start = () => {
    scan();
    // Necklaces arrive asynchronously; mount before their intersection observers paint the full shelf.
    if (sections.size < definitions.length) {
      const observer = new MutationObserver(() => { scan(); if (sections.size === definitions.length) observer.disconnect(); });
      observer.observe(document.querySelector('main') || document.body, {subtree: true, childList: true});
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
  addEventListener('popstate', () => sections.forEach((state, id) => state.setExpanded(history.state?.btrCompactCollections?.[id] === true, false)));
}
