#!/usr/bin/env node
// Image side of the asset pipeline (models: optimize-models.mjs).
//
// 1. WebP copies for the 3D world: every image in /products (and /logo.png) gets a <=1024 px WebP under
//    /products/web/<lower-case name>.webp. asset-loader.js (showroomAssets.web) points world textures at them and falls
//    back to the original; the shop, product pages and the full-size poster view keep the original PNGs.
// 2. JPEG textures re-encoded in place (MozJPEG, <=2048 px), same file names, only when that saves over 10%.
// 3. A few loose PNGs replaced by WebP; their references are updated in the code by hand (see CONVERT below).
//
// Setup once:  npm install --prefix tools/asset-pipeline
// Run:         node tools/asset-pipeline/optimize-images.mjs
import sharp from 'sharp';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const at = p => path.join(root, p);
let before = 0, after = 0;
const log = (what, a, b) => { before += a; after += b; console.log(`${what}: ${(a / 1e3).toFixed(0)} KB -> ${(b / 1e3).toFixed(0)} KB`); };

// 1. WebP copies for world textures.
await mkdir(at('products/web'), { recursive: true });
const sources = (await readdir(at('products'))).filter(f => /\.(png|jpe?g)$/i.test(f)).map(f => 'products/' + f);
for (const source of [...sources, 'logo.png']) {
  const out = 'products/web/' + path.basename(source).replace(/\.(png|jpe?g)$/i, '').toLowerCase() + '.webp';
  const buffer = await sharp(at(source)).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90, effort: 5 }).toBuffer();
  await writeFile(at(out), buffer);
  log(out, (await stat(at(source))).size, buffer.length);
}

// 2. JPEG textures in place.
const jpegDirs = ['assets/eden-textures', 'assets'];
for (const dir of jpegDirs) for (const f of (await readdir(at(dir))).filter(f => /\.jpe?g$/i.test(f))) {
  const file = dir + '/' + f, original = await readFile(at(file));
  const buffer = await sharp(original).resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  if (buffer.length < original.length * .9) { await writeFile(at(file), buffer); log(file, original.length, buffer.length); }
}

// 3. Loose PNGs that become WebP (references updated in pyramid-gathering.js, character-creator.css, flowers.json
//    and eden-flora.js).
const CONVERT = [
  ['assets/pyramid-masked-guests.png', 2048], ['assets/character-miami-backdrop.png', 1280],
  ['assets/flora/flower-agapanthus.png', 1024], ['assets/flora/flower-daisies.png', 1024], ['assets/flora/flower-lavender.png', 1024],
  ['assets/flora/flower-poppies.png', 1024], ['assets/flora/flower-roses.png', 1024], ['assets/flora/jacaranda-blossom.png', 1024],
  ['assets/flora/jacaranda_billboard.png', 1024],
];
for (const [file, size] of CONVERT) {
  try { await stat(at(file)); } catch { continue; } // already converted
  const original = await readFile(at(file)), out = file.replace(/\.png$/, '.webp');
  const buffer = await sharp(original).resize(size, size, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 84, alphaQuality: 92, effort: 5 }).toBuffer();
  await writeFile(at(out), buffer); await unlink(at(file));
  log(out, original.length, buffer.length);
}
console.log(`total ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
