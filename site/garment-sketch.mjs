// Conceptual garment drawings for the Garment Lab: an SVG silhouette in the chosen colour with the
// artwork direction laid on top. Always labelled as a concept — never presented as the finished piece.
import { artworkThumb } from '/labkit/artwork-pool.mjs';

// Front outlines in a 200×220 box. Back views reuse them without the front details.
const SHAPES = {
  tee: 'M62 18 L84 10 Q100 22 116 10 L138 18 L182 46 L166 82 L146 72 L146 206 L54 206 L54 72 L34 82 L18 46 Z',
  longsleeve: 'M64 18 L84 10 Q100 22 116 10 L136 18 L166 40 L194 176 L174 182 L146 84 L146 206 L54 206 L54 84 L26 182 L6 176 L34 40 Z',
  crewneck: 'M62 20 L84 12 Q100 24 116 12 L138 20 L168 42 L192 172 L172 180 L148 88 L150 196 Q150 206 140 206 L60 206 Q50 206 50 196 L52 88 L28 180 L8 172 L32 42 Z',
  hoodie: 'M70 30 Q66 4 100 2 Q134 4 130 30 L140 28 L168 46 L192 174 L172 182 L148 90 L150 196 Q150 206 140 206 L60 206 Q50 206 50 196 L52 90 L28 182 L8 174 L32 46 L60 28 Z',
  pants: 'M52 12 L148 12 L156 108 L162 206 L114 206 L102 70 L98 70 L86 206 L38 206 L44 108 Z',
  shorts: 'M48 24 L152 24 L162 124 L112 132 L102 70 L98 70 L88 132 L38 124 Z'
};
const DETAILS = {
  tee: '<path d="M84 10 Q100 30 116 10" fill="none" stroke="var(--line-ink)" stroke-width="2"/>',
  longsleeve: '<path d="M84 10 Q100 30 116 10" fill="none" stroke="var(--line-ink)" stroke-width="2"/><path d="M24 172 L8 168 M176 172 L192 168" stroke="var(--line-ink)" stroke-width="2"/>',
  crewneck: '<path d="M84 12 Q100 30 116 12" fill="none" stroke="var(--line-ink)" stroke-width="3"/><path d="M52 194 L148 194" stroke="var(--line-ink)" stroke-width="2"/>',
  hoodie: '<path d="M78 30 Q100 50 122 30" fill="none" stroke="var(--line-ink)" stroke-width="2"/><path d="M92 40 L90 78 M108 40 L110 78" stroke="var(--line-ink)" stroke-width="1.6"/><path d="M68 142 L132 142 L124 176 L76 176 Z" fill="none" stroke="var(--line-ink)" stroke-width="2"/>',
  pants: '<path d="M52 24 L148 24" stroke="var(--line-ink)" stroke-width="2"/><path d="M96 24 L94 40 M104 24 L106 40" stroke="var(--line-ink)" stroke-width="1.6"/>',
  shorts: '<path d="M48 36 L152 36" stroke="var(--line-ink)" stroke-width="2"/>'
};
const ART_ZONE = { tee: [64, 70, 72], longsleeve: [64, 74, 72], crewneck: [62, 74, 76], hoodie: [64, 82, 72], pants: [108, 96, 40], shorts: [108, 62, 38] };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function fillFor(color, customColor) {
  if (color === 'black') return { fill: '#161514', ink: 'rgba(255,255,255,.28)' };
  if (color === 'white') return { fill: '#f3f0e8', ink: 'rgba(0,0,0,.22)' };
  if (color === 'custom') {
    const ok = typeof CSS !== 'undefined' && customColor && CSS.supports('color', customColor);
    return { fill: ok ? customColor : 'url(#custom-hatch)', ink: 'rgba(0,0,0,.3)', label: customColor ? `Custom: ${customColor}` : 'Custom color' };
  }
  return { fill: 'url(#random-fill)', ink: 'rgba(0,0,0,.25)', label: 'Random color — the house picks' };
}

// opts: { silhouette, color, customColor, artwork, art (with references), side: 'front'|'back', id }
export function garmentSVG({ silhouette = 'tee', color = 'black', customColor = '', artwork = 'artists-choice', art = null, side = 'front', id = 'g', print = null } = {}) {
  const shape = SHAPES[silhouette] || SHAPES.tee, { fill, ink, label } = fillFor(color, customColor);
  let [ax, ay, aw] = ART_ZONE[silhouette] || ART_ZONE.tee;
  if (print) { const s = print.scale || 1, nw = aw * s; ax += (aw - nw) / 2 + (side === 'front' ? (print.x || 0) * 200 : 0); ay += (aw - nw) / 2 - (print.y || 0) * 220; aw = nw; }
  let artLayer = '';
  const refs = art?.references || [];
  const showOnSide = !art || art.placement === 'Front and back' || (side === 'front' ? art.placement !== 'Back' : art.placement === 'Back' || art.placement === 'Front and back');
  if (artwork === 'random-experimental' && refs.length && showOnSide) {
    const main = refs[0], extra = refs.slice(1);
    artLayer += `<image href="${artworkThumb(main)}" x="${ax}" y="${ay}" width="${aw}" height="${aw}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${id}-clip)"/>`;
    extra.forEach((r, i) => { artLayer += `<image href="${artworkThumb(r)}" x="${ax + (i ? aw * .62 : -aw * .18)}" y="${ay + aw * (.62 + i * .1)}" width="${aw * .5}" height="${aw * .5}" opacity=".92" clip-path="url(#${id}-clip)"/>`; });
  } else if (artwork === 'minimal') {
    artLayer = side === 'front' ? `<text x="${ax + aw * .78}" y="${ay + 16}" font-family="Pirata One, serif" font-size="16" fill="${ink}" text-anchor="middle">✠</text>` : '';
  } else if (artwork === 'expressive') {
    artLayer = `<g opacity=".55" clip-path="url(#${id}-clip)"><path d="M20 ${ay + 10} C 70 ${ay - 30}, 130 ${ay + 70}, 190 ${ay + 20}" stroke="#c9473b" stroke-width="14" fill="none"/><path d="M10 ${ay + 70} C 80 ${ay + 30}, 120 ${ay + 120}, 200 ${ay + 60}" stroke="#e0b44c" stroke-width="10" fill="none"/><circle cx="${ax + aw / 2}" cy="${ay + aw / 2}" r="${aw / 3}" fill="none" stroke="${ink}" stroke-width="3" stroke-dasharray="4 5"/></g>`;
  } else if (artwork === 'artists-choice' && side === 'front') {
    artLayer = `<g><circle cx="${ax + aw / 2}" cy="${ay + aw / 2}" r="${aw / 2.6}" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="3 4"/><text x="${ax + aw / 2}" y="${ay + aw / 2 + 9}" font-family="Pirata One, serif" font-size="26" fill="${ink}" text-anchor="middle">?</text></g>`;
  }
  return `<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(`Conceptual ${side} view${label ? ', ' + label : ''}`)}" style="--line-ink:${ink}">
<defs>
 <clipPath id="${id}-clip"><path d="${shape}"/></clipPath>
 <linearGradient id="random-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9473b"/><stop offset=".35" stop-color="#e0b44c"/><stop offset=".65" stop-color="#3f7d5a"/><stop offset="1" stop-color="#3554a5"/></linearGradient>
 <pattern id="custom-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#b9a98f"/><path d="M0 0 L0 8" stroke="#8d7b62" stroke-width="3"/></pattern>
</defs>
<path d="${shape}" fill="${fill}" stroke="var(--line-ink)" stroke-width="1.5"/>
${side === 'front' ? (DETAILS[silhouette] || '') : ''}
${artLayer}
</svg>`;
}

// Little icon-sized drawings for carts and dashboards; also handles the bundles.
export function itemSketch(item, describe, id) {
  if (item.product === 'relic-box') return `<svg viewBox="0 0 200 220" role="img" aria-label="The Relic Box"><path d="M30 80 L100 50 L170 80 L170 180 L100 210 L30 180 Z" fill="#2a221b" stroke="#b08a4a" stroke-width="3"/><path d="M30 80 L100 110 L170 80 M100 110 L100 210" stroke="#b08a4a" stroke-width="3" fill="none"/><text x="100" y="168" font-family="Pirata One, serif" font-size="40" fill="#e0695b" text-anchor="middle">?</text></svg>`;
  if (item.product === 'trinity') return `<svg viewBox="0 0 200 220" role="img" aria-label="The Trinity, three tees">${[0, 1, 2].map(i => `<g transform="translate(${-30 + i * 30} ${i * 14}) scale(.7)"><path d="${SHAPES.tee}" fill="${['#161514', '#f3f0e8', '#8f2a22'][i]}" stroke="#b08a4a" stroke-width="2"/></g>`).join('')}</svg>`;
  return garmentSVG({ silhouette: describe?.silhouette || 'tee', color: item.color, customColor: item.customColor, artwork: item.artwork, art: item.art, print: item.print, id: id || 'i' + Math.random().toString(36).slice(2, 7) });
}
