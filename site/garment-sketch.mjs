// Thumbnails for carts, orders, the studio and the Lab's special products — no drawings: the garment colour with
// the actual graphics chosen for it, or a typographic mark for the boxes.
import { artworkThumb } from '/labkit/artwork-pool.mjs';
import { sidesFor } from '/labkit/pricing.mjs';
import { OFFERINGS, COLORS, MYSTERY_PACKAGES } from '/labkit/catalog.mjs';
import { isUploadId, uploadForId, uploadedArtworkUrl } from '/labkit/custom-artwork.mjs';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function swatch(item) {
  if (item.color === 'custom') return typeof CSS !== 'undefined' && item.customColor && CSS.supports('color', item.customColor) ? item.customColor : '#9c8f7a';
  if (item.color === 'random') return 'linear-gradient(135deg,#c9473b,#e0b44c,#3f7d5a,#3554a5)';
  return COLORS[item.color]?.swatch || '#1d1915';
}
export function itemSketch(item) {
  if (item.product === 'mystery-pack') {
    const name = esc(MYSTERY_PACKAGES[item.package]?.name || 'Mystery package');
    return `<div class="thumb-mark package-mark" role="img" aria-label="${name}"><span aria-hidden="true"><svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 18 32 7l24 11v29L32 59 8 47ZM8 18l24 12 24-12M32 30v29M20 12l24 12v10"/><path d="m15 34 9 4m-9 2 9 4"/></svg></span><b>${name}</b></div>`;
  }
  if (item.product === 'relic-box') return '<div class="thumb-mark" role="img" aria-label="The Relic Box"><span>?</span><b>Relic Box</b></div>';
  if (item.product === 'trinity') return '<div class="thumb-mark" role="img" aria-label="The Trinity"><span>III</span><b>Trinity</b></div>';
  const s = item.artwork ? sidesFor(item) : { front: [], back: [] };
  const ids = [...s.front, ...s.back].slice(0, 2);
  const name = OFFERINGS[item.construction]?.[item.garment]?.name || 'Garment';
  const label = { 'artists-choice': "Artist's choice", minimal: 'Minimal', expressive: 'Expressive' }[item.artwork] || '';
  return `<div class="thumb-garment" role="img" aria-label="${esc(name)}" style="background:${esc(swatch(item))}">${ids.length
    ? ids.map(id => {
      if (!isUploadId(id)) return `<img src="${esc(artworkThumb(id))}" alt="" loading="lazy">`;
      const asset = uploadForId(id, item.uploads);
      try { return `<img src="${esc(uploadedArtworkUrl(asset))}" alt="${esc(asset.name || 'Uploaded graphic')}" loading="lazy">`; }
      catch { return '<span>Uploaded graphic unavailable</span>'; }
    }).join('')
    : `<span>${esc(label || name)}</span>`}</div>`;
}
// Kept for older callers: no drawings any more.
export const garmentSVG = () => '';
