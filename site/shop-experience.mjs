
const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const node = (tag, props = {}, ...children) => {
  const element = Object.assign(document.createElement(tag), props);
  children.flat().forEach(child => { if (child != null) element.append(child); });
  return element;
};

// Feature original tee photographs; keep the rest of the collection expandable.
const garments = window.siteGarments?.() || [];
const featuredSlugs = ["war-witnesses-tee", "dance-to-your-vibration-tee", "cross-tee", "jesus-star-tee", "sacred-masters-tee", "project-star-gate-tee", "wanted-jesus-tee", "divine-mother-tee", "oh-allah-tee"];
const featuredCount = featuredSlugs.length;
const ordered = [...featuredSlugs.map(slug => garments.find(g => g.slug === slug)).filter(Boolean), ...garments.filter(g => !featuredSlugs.includes(g.slug))];
const accessoryModels = [];
for (const [index, garment] of ordered.entries()) {
  const accessory = garment.accessoryPreview;
  const image = node('img', {src: garment.photo, alt: garment.imageAlt || garment.name, loading: 'lazy', decoding: 'async'});
  // The three featured garment previews own the live rotation; the collection keeps its original photography.
  const media = node('div', {className: 'card-media'}, node('div', {className: 'halo lit'}), node('span', {className: 'card-badge', textContent: 'Plate ' + garment.id}), node('span', {className: 'card-numeral', textContent: garment.chapter}), image);
  const card = node('a', {className: 'product-card', href: '/product?item=' + encodeURIComponent(garment.slug), hidden: index >= featuredCount}, media,
    node('div', {className: 'card-body'}, node('h3', {textContent: garment.name}), node('span', {className: 'price', textContent: garment.price})));
  if(garment.model?.startsWith('/graphic-models/'))card.dataset.archiveHq='true';
  if(accessory){card.dataset.accessoryReplacement='true';accessoryModels.push({canvas:node('canvas'),url:accessory.model,family:accessory.family,item:accessory});media.append(accessoryModels.at(-1).canvas);}
  $('product-grid').append(card);
  const haloObserver = new IntersectionObserver(([entry], observer) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    window.siteHalo?.(garment.photo).then(color => { if (color) media.style.setProperty('--halo', color); });
  }, {rootMargin: '150px'});
  haloObserver.observe(card);
}
const mountReplacementHats=()=>window.createAccessoryCarousel?.(accessoryModels);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountReplacementHats,{once:true});else mountReplacementHats();

function expandable(gridId, buttonId, visibleCount, label, onChange) {
  const grid = $(gridId), button = $(buttonId);
  const cards = [...grid.children];
  // Keep this choice on its collection history entry, including a Back reload
  // when the browser cannot retain the original document in its page cache.
  let expanded = history.state?.btrCollectionExpanded?.[gridId] === true;
  const update = () => {
    cards.forEach((card, index) => card.hidden = !expanded && index >= visibleCount);
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? 'Show featured' : `View all ${cards.length}`;
    button.hidden = cards.length <= visibleCount;
    onChange?.(expanded, cards.length);
  };
  button.addEventListener('click', () => {
    expanded = !expanded; update();
    history.replaceState({ ...history.state, btrCollectionExpanded: { ...history.state?.btrCollectionExpanded, [gridId]: expanded } }, '');
    if (!expanded) grid.scrollIntoView({block: 'start', behavior: reduced ? 'instant' : 'smooth'});
  });
  update();
}
expandable('product-grid', 'collection-more', featuredCount, 'More of the collection', (expanded, count) => {
  $('grid-status').textContent = `${expanded ? count : Math.min(featuredCount, count)} of ${count} pieces`;
});

// These are collection previews, not purchasable or invented catalog SKUs.
const metal = [
  ['Necklaces', 'chain', 'Something close to the heart.'],
  ['Pendants', 'pendant', 'A small object with a presence.'],
  ['Metal objects', 'ring', 'Hardware for your everyday.'],
  ['Belts', 'belt', 'Hold the whole thing together.'],
  ['Layered chains', 'chain', 'More is a state of mind.'],
  ['Belt chains', 'beltchain', 'A little weight. A little movement.'],
  ['Charms', 'charm', 'Keep your symbols with you.'],
  ['Buckles', 'buckle', 'The detail that changes everything.']
];
const accessories = [
  ['Hats', 'cap', 'Top it off.'], ['Headbands', 'headband', 'Keep your head in it.'],
  ['Skullys', 'beanie', 'A close fit. A loud point of view.'], ['More accessories', 'glove', 'The finishing touches.'],
  ['Gloves', 'glove', 'Hands in the story.'], ['Bandanas', 'bandana', 'Wear it your way.']
];
const shapes = {
  chain: '<ellipse cx="80" cy="72" rx="46" ry="50"/><ellipse cx="80" cy="72" rx="36" ry="40"/><path d="M55 25l4 12m-19 0 11 8M33 58l13 4m-13 19 13-3m-3 26 10-8m17 21 3-13m20 13-3-13m20-2-10-8m25-14-13-3m12-18-13 4m5-26-10 8m-13-20-3 12"/>',
  pendant: '<path d="M46 18c-36 62-7 78 34 88 41-10 70-26 34-88"/><circle cx="80" cy="110" r="8"/><path d="M72 117v12H59v12h13v15h16v-15h13v-12H88v-12z" fill="url(#metal-SLOT)"/>',
  ring: '<ellipse cx="80" cy="85" rx="49" ry="38" transform="rotate(-25 80 85)"/><ellipse cx="80" cy="85" rx="34" ry="25" transform="rotate(-25 80 85)"/><path d="M44 73l9 20m9-33 9 21m10-28 9 19m11-21 9 18"/>',
  belt: '<path d="M22 72h116v31H22z" fill="#3b3b32" stroke="#24271f"/><rect x="47" y="62" width="52" height="52" rx="8" fill="url(#metal-SLOT)"/><rect x="58" y="73" width="30" height="30" rx="3" fill="#30372c"/><path d="M60 87h36m12 0h1m10 0h1m10 0h1"/>',
  beltchain: '<path d="M28 42q30 100 104 0M28 42q37 73 104 0"/><rect x="22" y="25" width="13" height="26" rx="5"/><rect x="126" y="25" width="13" height="26" rx="5"/><path d="m43 72 3 10m16 2 2 12m19-8 1 13m18-18 5 10m14-23 6 9"/>',
  charm: '<circle cx="80" cy="33" r="16"/><path d="m80 52 12 27 30 3-23 20 7 30-26-16-26 16 7-30-23-20 30-3z" fill="url(#metal-SLOT)"/>',
  buckle: '<rect x="27" y="44" width="106" height="78" rx="20" fill="url(#metal-SLOT)"/><rect x="42" y="58" width="76" height="50" rx="10" fill="#5d6557"/><path d="M47 82h80"/>',
  cap: '<path d="M35 96c-6-70 90-92 91-7l21 18c-32 21-77 23-116 0z" fill="#535d45"/><path d="M35 96q44-21 91-7M78 37q-22 16-13 53M35 103q60 20 112 4"/><circle cx="78" cy="36" r="4" fill="#e6dfbd"/>',
  headband: '<path d="M26 117C4 10 154 10 134 117l-18-3C129 36 34 35 44 114z" fill="#626956"/><path d="M34 86c-6-69 96-69 94 0" stroke-dasharray="3 5"/>',
  beanie: '<path d="M34 105V78c0-74 92-74 92 0v27z" fill="#575e4b"/><rect x="25" y="97" width="110" height="34" rx="8" fill="#747b63"/><path d="M49 54v41m20-60v60m21-60v60m21-42v42M38 104v20m13-20v20m13-20v20m13-20v20m13-20v20m13-20v20m13-20v20" stroke-width="2"/>',
  glove: '<path d="M43 135V92L27 67c-8-13 5-21 14-9l11 16V33c0-16 15-16 15 0v30-44c0-16 15-16 15 0v44-39c0-16 15-16 15 0v39-28c0-16 15-16 15 0v64l-10 36z" fill="#646c57"/><path d="M46 117h59"/>',
  bandana: '<path d="M23 45h114L80 138z" fill="#636d52"/><path d="M39 55h82l-41 63z" stroke-dasharray="3 5"/><path d="m80 65 8 15-8 15-8-15z" fill="#ddd6b8"/>'
};
function slotCard([name, type, copy], index, prefix) {
  const card = node('article', {className: 'equipment-card', hidden: index >= 4});
  const art = node('div', {className: 'equipment-art'});
  // Fixed, local SVG illustrations communicate the category; they are not product photographs.
  const graphic = (shapes[type] || shapes.charm).replaceAll('SLOT', `${prefix}${index}`);
  art.innerHTML = `<svg viewBox="0 0 160 160" fill="none" stroke="#e6e7df" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><defs><linearGradient id="metal-${prefix}${index}" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#fafbf5"/><stop offset=".35" stop-color="#7c827b"/><stop offset=".55" stop-color="#edf0e5"/><stop offset="1" stop-color="#6b7267"/></linearGradient></defs><g>${graphic}</g></svg>`;
  art.append(node('span', {className: 'slot-number', textContent: `${prefix}—0${index + 1}`}), node('span', {className: 'slot-status', textContent: 'Coming soon'}));
  card.append(art, node('h3', {textContent: name}), node('p', {textContent: copy}));
  return card;
}
$('metal-grid').append(...metal.map((item, i) => slotCard(item, i, 'M')));
// The accessory collection now has live 3D product cards.
expandable('metal-grid', 'metal-more', 4, 'More metal + belts');


// Reveal once as each shelf enters view; no scroll hijacking or hidden content without JS.
if (!reduced) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.remove('is-waiting'); observer.unobserve(entry.target); }
  }), {threshold: .06});
  document.querySelectorAll('.shop-shelf,.compact-workshop,.production-band,.mystery-drop,.photo-player').forEach(section => {
    section.classList.add('shop-reveal');
    if (section.getBoundingClientRect().top > innerHeight) section.classList.add('is-waiting');
    observer.observe(section);
  });
}

