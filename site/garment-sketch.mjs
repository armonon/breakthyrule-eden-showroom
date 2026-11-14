// Thumbnails for carts, orders, the studio and the Lab's special products — no drawings: the garment colour with
// the actual graphics chosen for it, or a typographic mark for the boxes.
import { artworkThumb } from '/labkit/artwork-pool.mjs';
import { sidesFor } from '/labkit/pricing.mjs';
import { OFFERINGS, COLORS } from '/labkit/catalog.mjs';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function swatch(item) {
  if (item.color === 'custom') return typeof CSS !== 'undefined' && item.customColor && CSS.supports('color', item.customColor) ? item.customColor : '#9c8f7a';
  if (item.color === 'random') return 'linear-gradient(135deg,#c9473b,#e0b44c,#3f7d5a,#3554a5)';
  return COLORS[item.color]?.swatch || '#1d1915';
}
export function itemSketch(item) {
  if (item.product === 'relic-box') return '<div class="thumb-mark" role="img" aria-label="The Relic Box"><span>?</span><b>Relic Box</b></div>';
  if (item.product === 'trinity') return '<div class="thumb-mark" role="img" aria-label="The Trinity"><span>III</span><b>Trinity</b></div>';
  const s = item.artwork ? sidesFor(item) : { front: [], back: [] };
  const ids = [...s.front, ...s.back].slice(0, 2);
  const name = OFFERINGS[item.construction]?.[item.garment]?.name || 'Garment';
  const label = { 'artists-choice': "Artist's choice", minimal: 'Minimal', expressive: 'Expressive' }[item.artwork] || '';
  return `<div class="thumb-garment" role="img" aria-label="${esc(name)}" style="background:${esc(swatch(item))}">${ids.length
    ? ids.map(id => `<img src="${artworkThumb(id)}" alt="" loading="lazy">`).join('')
    : `<span>${esc(label || name)}</span>`}</div>`;
}
// Kept for older callers: no drawings any more.
export const garmentSVG = () => '';
