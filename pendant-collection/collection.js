import './transparent-spin.js?v=site-audit-1';

const ready = document.readyState === 'loading'
  ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once: true}))
  : Promise.resolve();
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children.flat()) if (child != null) node.append(child);
  return node;
};
const price = item => new Intl.NumberFormat('en-US', {style: 'currency', currency: item.currency, maximumFractionDigits: 0}).format(item.price) + ' USD';
const url = (item, view, suffix) => `${item.media}${item.slug}-${view}-${suffix}`;
const spin = (item, view, autoplay = true) => {
  const node = document.createElement('transparent-spin');
  node.setAttribute('src', url(item, view, 'packed.mp4'));
  node.setAttribute('poster', url(item, view, 'poster.png'));
  node.setAttribute('width', view === 'full' ? '640' : '1220');
  node.setAttribute('height', '900');
  node.setAttribute('label', item.name + (view === 'full' ? ' necklace with chain' : ' pendant detail'));
  if (autoplay) node.setAttribute('autoplay', '');
  return node;
};

await ready;
const metalwork = document.getElementById('metalwork');
if (metalwork && !document.getElementById('necklaces')) {
  try {
    const response = await fetch('/pendant-collection/catalog.json?v=prices-2');
    if (!response.ok) throw new Error('Collection unavailable');
    const items = await response.json();
    if (!Array.isArray(items) || !items.length) throw new Error('Incomplete collection');
    mount(items);
  } catch (error) {
    console.warn('Necklace collection:', error.message);
  }
}

function mount(items) {
  const section = el('section', {className: 'section wrap pendant-shelf', id: 'necklaces'});
  section.setAttribute('aria-labelledby', 'necklace-title');
  const title = el('h2', {id: 'necklace-title'}, el('span', {className: 'sect', textContent: '§'}), 'Close to the heart.');
  const heading = el('div', {className: 'section-head'},
    el('div', {}, el('p', {className: 'kicker', textContent: 'Metalwork / The necklace collection'}), title),
    el('span', {className: 'pendant-count', textContent: `${items.length} designs · 360°`}));
  const intro = el('p', {className: 'lede', textContent: 'Sculptural pendants. French cable chains. Every side, in motion.'});
  const grid = el('div', {className: 'pendant-grid', id: 'pendant-grid'});
  const status = el('p', {className: 'fine', textContent: `${Math.min(4, items.length)} of ${items.length} necklaces`});
  status.setAttribute('role', 'status');
  const more = el('button', {className: 'ghost pendant-more collection-browse-action', type: 'button', textContent: `View all ${items.length}`});
  more.setAttribute('aria-controls', 'pendant-grid');
  more.setAttribute('aria-expanded', 'false');
  let expanded = false;
  const dialog = createDialog(items);
  items.forEach((item, index) => {
    const preview = spin(item, 'detail');
    const href = '/product?item=pendant-' + encodeURIComponent(item.slug);
    const open = el('a', {className: 'pendant-product-link', href, ariaLabel: 'View ' + item.name});
    preview.setAttribute('aria-hidden', 'true');
    const card = el('article', {className: 'pendant-card', hidden: index >= 4},
      el('div', {className: 'pendant-media'}, preview, open),
      el('div', {className: 'pendant-copy'}, el('h3', {}, el('a', {href, textContent: item.name})),
        el('p', {className: 'accessory-price', textContent: price(item) + ' · pendant + chain'})));
    grid.append(card);
  });
  more.addEventListener('click', () => {
    expanded = !expanded;
    [...grid.children].forEach((card, index) => { card.hidden = !expanded && index >= 4; });
    more.setAttribute('aria-expanded', String(expanded));
    more.textContent = expanded ? 'Show featured' : `View all ${items.length}`;
    status.textContent = `${expanded ? items.length : Math.min(4, items.length)} of ${items.length} necklaces`;
    if (!expanded) section.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});
  });
  section.append(heading, intro, grid, el('div', {className: 'shelf-bottom collection-browse-row'}, status, more));
  metalwork.after(section);
  const note = metalwork.querySelector('.shelf-bottom .fine');
  if (note) note.textContent = '21 belt designs in 3D. Explore the necklace collection below. More metal objects are coming soon.';
  // Upgrade only the two necklace placeholders; preserve the existing belt card and all other categories.
  function upgradeCategories() {
  for (const card of metalwork.querySelectorAll('.equipment-card:not(.pendant-category)')) {
    const category = card.querySelector('h3')?.textContent;
    if (!['Necklaces', 'Pendants'].includes(category)) continue;
    const item = category === 'Necklaces' ? items.find(x => x.slug === 'crimson-screamer') || items[0] : items.find(x => x.slug === 'neon-shamrock') || items[1];
    const view = category === 'Necklaces' ? 'full' : 'detail';
    const art = card.querySelector('.equipment-art');
    card.classList.add('pendant-category');
    art.replaceChildren(el('a', {href: '#necklaces', ariaLabel: `Explore all ${items.length} necklaces`},
      el('img', {src: url(item, view, 'poster.png'), alt: item.name + ' necklace', loading: 'lazy', decoding: 'async'})));
    const caption = card.querySelector('p');
    caption.replaceChildren(el('a', {href: '#necklaces', textContent: `Explore ${items.length} designs in motion ↗`}));
  }
  }
  upgradeCategories();
  const categoryGrid = document.getElementById('metal-grid');
  if (categoryGrid) new MutationObserver(upgradeCategories).observe(categoryGrid, {childList: true});
  // Direct links open the matching piece without changing navigation or the rest of the shop.
  const requested = new URLSearchParams(location.search).get('necklace');
  const match = items.findIndex(item => item.slug === requested);
  if (match >= 0) dialog.open(match, more);
  const showCollection = () => {
    if (location.hash !== '#necklaces') return;
    window.breakthyruleGallery?.closeCover?.();
    requestAnimationFrame(() => section.scrollIntoView({block: 'start', behavior: 'instant'}));
  };
  addEventListener('hashchange', showCollection);
  if (match < 0) showCollection();
}

function createDialog(items) {
  const dialog = el('dialog', {className: 'pendant-dialog'});
  dialog.setAttribute('aria-labelledby', 'pendant-dialog-title');
  const heading = el('h2', {id: 'pendant-dialog-title'});
  const productPrice = el('p', {className: 'price pendant-dialog-price'});
  const close = el('button', {className: 'pendant-close', type: 'button', textContent: 'Close ×'});
  const stage = el('div', {className: 'pendant-dialog-stage'});
  const full = el('button', {type: 'button', textContent: 'Full necklace'});
  const detail = el('button', {type: 'button', textContent: 'Pendant detail'});
  const views = el('div', {className: 'pendant-view-switch'}, full, detail);
  views.setAttribute('role', 'group'); views.setAttribute('aria-label', 'Choose necklace view');
  const previous = el('button', {type: 'button', textContent: '← Previous'});
  const next = el('button', {type: 'button', textContent: 'Next →'});
  const download = el('a', {className: 'pendant-download', textContent: 'Download 360° video ↓'});
  download.setAttribute('download', '');
  const actions = el('div', {className: 'pendant-dialog-actions'}, download);
  const counter = el('span', {className: 'pendant-dialog-count'});
  const nav = el('div', {className: 'pendant-dialog-nav'}, previous, counter, next);
  nav.setAttribute('aria-label', 'Browse necklaces');
  const copy = el('p', {className: 'pendant-dialog-note', textContent: 'Complete necklace · pendant and French cable chain included'});
  dialog.append(el('div', {className: 'pendant-dialog-head'}, el('div', {}, el('p', {className: 'pendant-dialog-eyebrow', textContent: 'BREAKTHYRULE / NECKLACES'}), heading, productPrice), close),
    views, stage, el('div', {className: 'pendant-dialog-footer'}, copy, actions), nav);
  document.body.append(dialog);
  let current = 0, view = 'full', returnFocus = null;
  function render() {
    // The playback control moves out of the player into this footer. Remove its
    // old instance before replacing the player, so controls never accumulate.
    actions.querySelector('.pendant-dialog-playback')?.remove();
    const item = items[current];
    heading.textContent = item.name;
    productPrice.textContent = price(item);
    counter.textContent = String(current + 1).padStart(2, '0') + ' / ' + items.length;
    download.href = item.media + item.slug + '-with-chain-360.mp4';
    download.download = item.slug + '-with-chain-360.mp4';
    full.setAttribute('aria-pressed', String(view === 'full'));
    detail.setAttribute('aria-pressed', String(view === 'detail'));
    stage.dataset.view = view;
    const player = spin(item, view);
    stage.replaceChildren(player);
    // Preserve the player's own state, event handler and accessible label, but
    // keep its playback control below the necklace rather than over the pendant.
    const playback = player.querySelector('.transparent-spin__toggle');
    if (playback) {
      playback.classList.add('pendant-dialog-playback');
      actions.prepend(playback);
    }
  }
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    stage.replaceChildren();
    actions.querySelector('.pendant-dialog-playback')?.remove();
    document.querySelectorAll('#pendant-grid transparent-spin').forEach(player => player.resume?.());
    returnFocus?.focus({preventScroll: true});
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  full.addEventListener('click', () => { view = 'full'; render(); });
  detail.addEventListener('click', () => { view = 'detail'; render(); });
  previous.addEventListener('click', () => { current = (current + items.length - 1) % items.length; render(); });
  next.addEventListener('click', () => { current = (current + 1) % items.length; render(); });
  return {open(index, trigger) {
    current = index; view = 'full'; returnFocus = trigger;
    document.querySelectorAll('#pendant-grid transparent-spin').forEach(player => player.suspend?.());
    render(); if (!dialog.open) dialog.showModal(); close.focus();
  }};
}
