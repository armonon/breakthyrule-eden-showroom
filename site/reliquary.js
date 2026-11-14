// The Reliquary: published one-of-one garments (public fields only; no customer information).
const $ = id => document.getElementById(id);
const h = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids.flat()) if (k != null) n.append(k); return n; };
(async () => {
  let list = null;
  try { const r = await fetch('/api/lab/archive', { cache: 'no-store' }); if (r.ok) list = await r.json(); } catch {}
  if (!list) { $('relics').replaceChildren(h('p', { className: 'fine', textContent: 'The reliquary opens when the studio service is connected.' })); return; }
  if (!list.length) { $('relics').replaceChildren(h('p', { className: 'empty-state', textContent: 'No passports published yet. The first one-of-ones are still on the bench.' })); return; }
  $('relics').replaceChildren(...list.map((e, i) => h('a', { className: 'relic', href: '/passport?id=' + encodeURIComponent(e.id) },
    h('div', { className: 'relic-img' }, e.photos[0] ? h('img', { src: '/api/lab/uploads/' + e.photos[0], alt: e.title, loading: 'lazy' }) : h('span', { className: 'relic-mark', textContent: '✠' })),
    h('span', { className: 'plate-tag', textContent: e.id }), h('strong', { textContent: e.title || e.garmentType || 'Untitled' }),
    h('span', { className: 'relic-meta', textContent: [e.construction, e.garmentType, e.edition].filter(Boolean).join(' · ') }))));
})();
