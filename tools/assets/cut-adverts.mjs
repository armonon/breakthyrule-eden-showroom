#!/usr/bin/env node
// Cuts the two advert sheets (stacks of banner ads, each over "www.breakthyrule.com" on black) into one image per ad.
// Finds each banner as a run of colourful rows between the black gaps, then crops it with cwebp.
//   node tools/assets/cut-adverts.mjs [folder with the sheets]   (default ~/Downloads/breakthyrule/ADVERTS)
// Writes images/breakthyrule/adverts/boxes/NN-slug.webp and site/data/ad-boxes.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SRC = process.argv[2] || path.join(os.homedir(), 'Downloads/breakthyrule/ADVERTS');
const OUT = 'images/breakthyrule/adverts/boxes';
// Ad names, top to bottom, sheet by sheet (sheets sorted by file name).
const NAMES = [
  ['The time is NOW!', 'Stay Weird', 'Buzzin Like a Bee', 'Beyond Mind', 'I Am Light', 'Love Gives Wings', 'Currently Creating', 'Destroy Attachment', 'Keep Dancing', "Life's a Party"],
  ['Star Power', 'Contact High', 'Music Is My Savior', 'Pretty in Punk', 'World Wide Connection', 'Fallen Angel', "Cupid's Secret", 'Metamorphosis', 'lovebomb!', 'Grape']
];
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const size = file => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim().split(',').map(Number);
function banners(file) {
  const [w, h] = size(file);
  const rgb = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: w * h * 3 + 1024 });
  // Gap rows: pure black, or only the white "www.breakthyrule.com" lettering on black. A dark banner (navy, purple)
  // still has colour in it, so it never reads as a gap.
  const gap = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    let lit = 0, colour = 0;
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 3, r = rgb[i], g = rgb[i + 1], b2 = rgb[i + 2], mx = Math.max(r, g, b2), mn = Math.min(r, g, b2);
      if (mx > 14) lit++; if (mx - mn > 40) colour++; }
    gap[y] = colour / w < .01 && lit / w < .6 ? 1 : 0;
  }
  const seps = []; let s0 = -1;
  for (let y = 0; y <= h; y++) { const d = y < h && gap[y]; if (d && s0 < 0) s0 = y; if (!d && s0 >= 0) { if (y - s0 >= 25 || s0 === 0 || y === h) seps.push([s0, y]); s0 = -1; } }
  if (!seps.length || seps[0][0] > 0) seps.unshift([0, 0]);
  if (seps[seps.length - 1][1] < h) seps.push([h, h]);
  const runs = [];
  for (let k = 0; k + 1 < seps.length; k++) { const y0 = seps[k][1], y1 = seps[k + 1][0]; if (y1 - y0 > h * .03) runs.push([y0, y1]); }
  // Side margins: columns that are lit inside the banner rows.
  return runs.map(([y0, y1]) => {
    let x0 = 0, x1 = w;
    const colLit = x => { let n = 0; for (let y = y0; y < y1; y++) { const i = (y * w + x) * 3; if (Math.max(rgb[i], rgb[i + 1], rgb[i + 2]) > 24) n++; } return n / (y1 - y0); };
    while (x0 < w / 4 && colLit(x0) < .5) x0++; while (x1 > w * .75 && colLit(x1 - 1) < .5) x1--;
    const inset = 2; return { x: x0 + inset, y: y0 + inset, w: x1 - x0 - inset * 2, h: y1 - y0 - inset * 2 };
  });
}

fs.mkdirSync(OUT, { recursive: true });
const sheets = fs.readdirSync(SRC).filter(f => /\.png$/i.test(f)).sort();
const boxes = []; let n = 0;
sheets.forEach((sheet, s) => {
  const file = path.join(SRC, sheet), found = banners(file), names = NAMES[s] || [];
  if (found.length !== names.length) console.warn(`${sheet}: found ${found.length} banners, expected ${names.length}`);
  found.forEach((b, i) => {
    const name = names[i] || `Advert ${s + 1}-${i + 1}`, id = String(++n).padStart(2, '0') + '-' + slug(name);
    execFileSync('cwebp', ['-quiet', '-q', '86', '-m', '5', '-crop', String(b.x), String(b.y), String(b.w), String(b.h), file, '-o', path.join(OUT, id + '.webp')]);
    boxes.push({ id, name, src: `/${OUT}/${id}.webp`, ratio: +(b.w / b.h).toFixed(3) });
  });
});
fs.writeFileSync('site/data/ad-boxes.json', JSON.stringify({ generated: new Date().toISOString().slice(0, 10), boxes }, null, 1) + '\n');
console.log(boxes.length, 'ad boxes →', OUT);
for (const b of boxes) console.log(' ', b.id, b.ratio);
