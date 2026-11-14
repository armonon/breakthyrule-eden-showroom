// A garment passport: the public record of one finished piece, with a QR code pointing back here.
import { qrSVG } from '/labkit/qr.mjs';
const $ = id => document.getElementById(id);
const h = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids.flat()) if (k != null) n.append(k); return n; };
const id = new URLSearchParams(location.search).get('id') || '';
(async () => {
  let e = null;
  try { const r = await fetch('/api/lab/archive/' + encodeURIComponent(id), { cache: 'no-store' }); if (r.ok) e = await r.json(); } catch {}
  if (!e) { $('passport').replaceChildren(h('h1', { textContent: 'No passport found' }), h('p', { className: 'lede', textContent: 'Check the number on the tag, or browse the Reliquary.' })); return; }
  document.title = 'BREAKTHYRULE — ' + (e.title || e.id);
  const url = `${location.origin}/passport?id=${encodeURIComponent(e.id)}`;
  const qr = h('figure', { className: 'passport-qr' }); qr.innerHTML = qrSVG(url, { label: 'QR code for passport ' + e.id }); qr.append(h('figcaption', { textContent: e.id }));
  const rows = [['Garment', e.garmentType], ['Construction', e.construction], ['Materials', e.materials], ['Technique', e.technique], ['Made', e.createdOn ? new Date(e.createdOn + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : ''], ['Edition', e.edition]].filter(([, v]) => v);
  $('passport').replaceChildren(
    h('header', {}, h('p', { className: 'folio', textContent: 'Garment passport' }), h('h1', { textContent: e.title || e.id })),
    h('div', { className: 'passport-grid' },
      h('div', { className: 'passport-photos' }, ...(e.photos.length ? e.photos.map(p => h('img', { src: '/api/lab/uploads/' + p, alt: e.title, loading: 'lazy' })) : [h('span', { className: 'relic-mark', textContent: '✠' })])),
      h('div', {}, h('dl', { className: 'passport-kv' }, ...rows.flatMap(([k, v]) => [h('dt', { textContent: k }), h('dd', { textContent: v })])),
        e.description ? h('p', { className: 'drop-para passport-desc', textContent: e.description }) : null, qr)));
})();
