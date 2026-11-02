#!/usr/bin/env node
// Shrinks the showroom's glTF models in place: WebP textures (EXT_texture_webp, decoded natively by the GLTFLoader),
// simplified meshes where the source is far denser than the view needs, and quantized geometry
// (KHR_mesh_quantization) only for models whose code never reads raw vertex positions.
//
// Node names, extras and animations are left as they are: the code looks objects up by name (HeroTree, SnakeHead,
// LibBookcase, ...), and the hero tree keeps its twig tips in extras.
//
// Setup once:  npm install --prefix tools/asset-pipeline
// Run:         node tools/asset-pipeline/optimize-models.mjs [--dry] [file.glb ...]
// Already-optimized files (all textures WebP within the size cap) are skipped, so re-running is safe.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const scene = JSON.parse(await readFile(path.join(root, 'assets/props/scene.json'), 'utf8'));
const propsInUse = new Set(scene.props.map(p => p.url.replace(/^\//, '').split('?')[0]));

// Per-model rules. ratio: fraction of triangles kept; size: texture cap in px; quantize: see header.
const rules = [
  { match: f => f === 'residents/violet-trickster.glb', ratio: 0.25, error: 0.002, size: 2048, quantize: false },
  { match: f => propsInUse.has(f), ratio: 0.3, error: 0.002, size: 1024, quantize: true },
  { match: f => f.startsWith('assets/props/'), skip: true }, // older prop versions are not loaded by the site
  { match: () => true, size: 2048, quantize: false },
];

const args = process.argv.slice(2), dry = args.includes('--dry');
const listed = args.filter(a => !a.startsWith('--'));
const files = listed.length ? listed : [
  'residents/violet-trickster.glb',
  ...propsInUse,
  'assets/eden-hero/hero-tree.glb', 'assets/eden-hero/pit-viper.glb', 'assets/library/library-set.glb',
  'assets/flora/jacaranda.glb', 'assets/librarian-seated.glb',
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.simplifier': MeshoptSimplifier });
await MeshoptSimplifier.ready;
const triangles = doc => doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);

let before = 0, after = 0;
for (const file of files) {
  const rule = rules.find(r => r.match(file));
  if (rule.skip) continue;
  const full = path.join(root, file), size0 = (await stat(full)).size;
  const doc = await io.read(full);
  const textures = doc.getRoot().listTextures();
  const done = textures.every(t => t.getMimeType() === 'image/webp' && Math.max(...(t.getSize() || [0])) <= rule.size);
  const tris0 = triangles(doc);
  if (done && !rule.ratio) { console.log(`skip  ${file} (already optimized)`); continue; }
  const steps = [dedup()];
  if (rule.ratio && tris0 > 6000) steps.push(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: rule.ratio, error: rule.error, lockBorder: false }));
  if (!done) steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [rule.size, rule.size], quality: 82 }));
  if (rule.quantize) steps.push(quantize());
  steps.push(prune({ keepAttributes: true, keepLeaves: true, keepExtras: true }));
  await doc.transform(...steps);
  const out = await io.writeBinary(doc);
  before += size0; after += out.byteLength;
  console.log(`${dry ? 'would' : 'wrote'} ${file}: ${(size0 / 1e6).toFixed(2)} MB -> ${(out.byteLength / 1e6).toFixed(2)} MB, triangles ${Math.round(tris0)} -> ${Math.round(triangles(doc))}`);
  if (!dry) await (await import('node:fs/promises')).writeFile(full, out);
}
console.log(`total ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
