#!/usr/bin/env node
// Builds site/data/gallery.json, the list the Gallery page shows.
//
//   node tools/site/build-gallery.mjs
//   node tools/site/build-gallery.mjs --instagram-export ~/Downloads/instagram-breakthyrule-2026-11-09
//
// Sources, in order:
//  1. Photos you drop into site/gallery/<category>/ (garments, models, worn, events).
//     An optional caption file next to a photo (same name + .txt) becomes its caption.
//  2. An Instagram data export (Instagram → Settings → Accounts Center → Your information
//     and permissions → Download your information → JSON). Post media is copied into
//     site/gallery/instagram/ with the post caption and date.
//  3. The product photography already in products/web/, named from garment-catalog.js.
//  4. The Break Thy Rule source folder, imported by tools/assets/import-breakthyrule.mjs into
//     breakthyrule-assets.js: favourite photos (worn), every graphic (graphics), the adverts (adverts).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') && a.push([v.slice(2), all[i + 1]]), a), []));
const IMAGE = /\.(jpe?g|png|webp|avif|gif)$/i;
const CATEGORIES = ['worn', 'garments', 'models', 'events', 'instagram', 'graphics', 'adverts'];
const entries = [];

function walk(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]) : []; }
const web = file => '/' + path.relative(ROOT, file).split(path.sep).join('/');

// 2. Instagram export → site/gallery/instagram/
if (args['instagram-export']) {
  const exportDir = path.resolve(args['instagram-export'].replace(/^~/, process.env.HOME));
  const postFiles = walk(exportDir).filter(f => /posts_\d+\.json$/.test(f));
  if (!postFiles.length) throw new Error('No posts_*.json found in ' + exportDir + ' — choose JSON format when requesting the export.');
  const out = path.join(ROOT, 'site/gallery/instagram');fs.mkdirSync(out, { recursive: true });
  const captions = {};let copied = 0;
  // Instagram writes text as Latin-1 escaped UTF-8; this restores emoji and accents.
  const fix = s => { try { return Buffer.from(s || '', 'latin1').toString('utf8'); } catch { return s || ''; } };
  for (const file of postFiles) for (const post of JSON.parse(fs.readFileSync(file, 'utf8'))) {
    for (const media of post.media || []) {
      if (!IMAGE.test(media.uri || '')) continue;
      const src = path.join(exportDir, media.uri);if (!fs.existsSync(src)) continue;
      const stamp = media.creation_timestamp || post.creation_timestamp || 0;
      const name = new Date(stamp * 1000).toISOString().slice(0, 10) + '-' + path.basename(media.uri);
      fs.copyFileSync(src, path.join(out, name));copied++;
      captions[name] = { caption: fix(post.title || media.title).trim(), date: new Date(stamp * 1000).toISOString().slice(0, 10) };
    }
  }
  fs.writeFileSync(path.join(out, 'captions.json'), JSON.stringify(captions, null, 1) + '\n');
  console.log('Instagram export: copied', copied, 'images into site/gallery/instagram/');
}

// 1. Uploaded folders.
for (const category of CATEGORIES) {
  const dir = path.join(ROOT, 'site/gallery', category);
  const captions = fs.existsSync(path.join(dir, 'captions.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'captions.json'), 'utf8')) : {};
  for (const file of walk(dir).filter(f => IMAGE.test(f)).sort().reverse()) {
    const meta = captions[path.basename(file)] || {};
    const txt = file.replace(IMAGE, '.txt');
    const caption = meta.caption || (fs.existsSync(txt) ? fs.readFileSync(txt, 'utf8').trim() : '');
    entries.push({ src: web(file), category, caption, date: meta.date || '', alt: caption.split('\n')[0].slice(0, 140) || 'Break Thy Rule ' + category, source: category === 'instagram' ? 'Instagram @breakthyrule' : '' });
  }
}

// 3. Product photography.
const sandbox = { window: {} };vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'garment-catalog.js'), 'utf8'), sandbox);
const byFile = new Map();
for (const g of sandbox.window.showroomCollection) g.images.forEach((img, i) => byFile.set(path.basename(img).toLowerCase(), { g, view: g.photoViews?.[i] || '' }));
for (const file of walk(path.join(ROOT, 'products/web')).filter(f => IMAGE.test(f) && !/logo/i.test(f)).sort()) {
  const hit = byFile.get(path.basename(file).toLowerCase());
  entries.push({ src: web(file), category: 'garments', caption: hit ? hit.g.name + (hit.view && !/^PHOTO/.test(hit.view) ? ' — ' + hit.view.toLowerCase() : '') : 'From the vault', alt: hit ? (hit.g.imageAlt || hit.g.name) : 'Break Thy Rule product photograph', product: hit?.g.slug || '', source: 'Product photography' });
}

// 4. Imported Break Thy Rule assets (WebP thumbnails for the grid, larger files for the lightbox).
const assetsFile = path.join(ROOT, 'breakthyrule-assets.js');
if (fs.existsSync(assetsFile)) {
  const box = { window: {} };vm.runInNewContext(fs.readFileSync(assetsFile, 'utf8'), box);
  const a = box.window.breakthyruleAssets || {};
  (a.favs || []).forEach((f, i) => entries.push({ src: f.full, thumb: f.thumb, ratio: f.ratio, category: 'worn', caption: '', alt: 'Break Thy Rule worn in real life, photo ' + (i + 1), source: 'Worn in the wild' }));
  (a.graphics || []).forEach(g => entries.push({ src: g.full, thumb: g.thumb, ratio: g.ratio, category: 'graphics', caption: g.name, alt: g.name + ' — Break Thy Rule graphic', source: 'The codex of graphics' }));
  (a.adverts || []).forEach((g, i) => entries.push({ src: g.full, thumb: g.thumb, ratio: g.ratio, category: 'adverts', caption: 'Broadside ' + (i + 1), alt: 'Break Thy Rule sticker sheet advert ' + (i + 1), source: 'Broadsides' }));
}
// Photos of people first, the garments next, the graphics and broadsides last.
entries.sort((x, y) => CATEGORIES.indexOf(x.category) - CATEGORIES.indexOf(y.category));

fs.mkdirSync(path.join(ROOT, 'site/data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'site/data/gallery.json'), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), categories: CATEGORIES, items: entries }, null, 1) + '\n');
const counts = entries.reduce((c, e) => (c[e.category] = (c[e.category] || 0) + 1, c), {});
console.log('site/data/gallery.json:', entries.length, 'images', counts);
