import { SHAKA_CHARTS, GARMENT_CHART_IDS } from '/labkit/sizing.mjs';
const h = (tag, props = {}, ...children) => { const el = Object.assign(document.createElement(tag), props); el.append(...children.flat()); return el; };
const names = { tee: 'Tees', hoodie: 'Hoodies', crewneck: 'Crewnecks', sweatpants: 'Sweatpants', longsleeve: 'Long sleeves', shorts: 'Sweat shorts' };
const byId = new Map(SHAKA_CHARTS.map(chart => [chart.id, chart]));
for (const [garment, ids] of Object.entries(GARMENT_CHART_IDS)) {
  const section = h('section', { id: garment, className: 'size-guide-section' }, h('h2', { textContent: names[garment] }));
  for (const id of ids) {
    const chart = byId.get(id);
    const table = h('table', {}, h('caption', { textContent: chart.title + ' · inches' }),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', textContent: 'Measurement' }), chart.sizes.map(size => h('th', { scope: 'col', textContent: size })))),
      h('tbody', {}, chart.rows.map(row => h('tr', {}, h('th', { scope: 'row', textContent: row.label }), row.values.map(value => h('td', { textContent: value }))))));
    section.append(h('div', { className: 'size-chart-scroll', tabIndex: 0, role: 'region', ariaLabel: chart.title + ' measurements' }, table),
      h('p', { className: 'fine' }, h('a', { href: chart.source, target: '_blank', rel: 'noopener', textContent: 'Shaka Wear source and measuring instructions ↗' })));
    if (chart.note) section.append(h('p', { className: 'fine', textContent: chart.note }));
  }
  document.getElementById('supplier-charts').append(section);
}
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
