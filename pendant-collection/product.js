import './transparent-spin.js?v=site-audit-1';

const byId = id => document.getElementById(id);
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function loadPlayerStyles() {
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link =>
    new URL(link.href, location.href).pathname === '/pendant-collection/transparent-spin.css')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/pendant-collection/transparent-spin.css?v=1';
  document.head.append(link);
}

function showMessage(viewer, title, message) {
  document.title = 'BREAKTHYRULE — ' + title;
  byId('name').textContent = title;
  byId('price').textContent = '';
  byId('description').textContent = message;
  const status = element('p', 'pendant-product-status', title);
  status.setAttribute('role', 'status');
  viewer.replaceChildren(status);
}

export async function renderPendantProduct(slug) {
  const viewer = byId('viewer');
  if (!viewer) return false;
  document.body.classList.add('pendant-product');
  viewer.classList.remove('viewer', 'card-media');
  viewer.classList.add('pendant-product-viewer');
  viewer.removeAttribute('tabindex');
  viewer.removeAttribute('aria-label');
  for (const id of ['numeral', 'chapter', 'tagline', 'model-note']) byId(id).textContent = '';
  byId('thumbs').hidden = true;
  byId('showcase')?.closest('section')?.remove();
  const buy = byId('buy');
  buy.textContent = 'Back to necklaces';
  buy.href = '/?nocover=1#necklaces';
  buy.removeAttribute('target');
  buy.removeAttribute('rel');
  buy.parentElement.querySelector('a[href="/showroom"]')?.remove();
  const loading = element('p', 'pendant-product-status', 'Loading necklace…');
  loading.setAttribute('role', 'status');
  viewer.replaceChildren(loading);

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    showMessage(viewer, 'Product not found', 'This necklace is not in the collection.');
    return false;
  }

  let item;
  try {
    const response = await fetch('/pendant-collection/catalog.json?v=prices-2');
    if (!response.ok) throw new Error('Catalog unavailable');
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error('Invalid catalog');
    item = items.find(candidate => candidate.slug === slug);
  } catch {
    showMessage(viewer, 'Necklace unavailable', 'The collection could not load. Please try again or return to the collection.');
    return false;
  }
  if (!item) {
    showMessage(viewer, 'Product not found', 'This necklace is not in the collection.');
    return false;
  }

  loadPlayerStyles();
  document.title = 'BREAKTHYRULE — ' + item.name;
  byId('name').textContent = item.name;
  if(!document.body.dataset.productStudio) byId('price').textContent = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: item.currency, maximumFractionDigits: 0
  }).format(item.price) + ' ' + item.currency;
  const includes = Array.isArray(item.priceIncludes) ? item.priceIncludes : [];
  byId('description').textContent = includes.length
    ? 'Includes ' + includes.join(' and ') + '.'
    : '';
  if (Number.isFinite(item.widthMm) && Number.isFinite(item.heightMm)) {
    byId('model-note').textContent = 'Pendant dimensions: ' + item.widthMm + ' × ' + item.heightMm + ' mm.';
  }

  const stage = element('div', 'pendant-product-stage');
  stage.dataset.view = 'full';
  const views = element('div', 'pendant-product-views');
  views.setAttribute('role', 'group');
  views.setAttribute('aria-label', 'Choose necklace view');
  const buttons = new Map();
  function render(view) {
    stage.dataset.view = view;
    for (const [name, button] of buttons) button.setAttribute('aria-pressed', String(name === view));
    const player = document.createElement('transparent-spin');
    player.setAttribute('src', `${item.media}${item.slug}-${view}-packed.mp4`);
    player.setAttribute('poster', `${item.media}${item.slug}-${view}-poster.png`);
    player.setAttribute('width', view === 'full' ? '640' : '1220');
    player.setAttribute('height', '900');
    player.setAttribute('label', item.name + (view === 'full' ? ' necklace with chain' : ' pendant detail'));
    player.setAttribute('autoplay', '');
    stage.replaceChildren(player);
  }
  for (const [view, label] of [['full', 'Full necklace'], ['detail', 'Pendant detail']]) {
    const button = element('button', 'ghost', label);
    button.type = 'button';
    button.addEventListener('click', () => render(view));
    buttons.set(view, button);
    views.append(button);
  }
  viewer.replaceChildren(stage, views);
  render('full');
  return true;
}
