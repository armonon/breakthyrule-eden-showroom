#!/usr/bin/env node
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const required = [
  'beyond-eden.html',
  'beyond-eden.css',
  'beyond-eden/main.js',
  'beyond-eden/config.js',
  'beyond-eden/assets/slice-manifest.json',
  'beyond-eden/assets/tree-manifest.json',
  'tools/blender/build_scottish_rite_slice.py',
  'tools/pipeline/optimize-slice.mjs',
];
let failed = false;
for (const relative of required) {
  try { await access(path.join(root, relative)); console.log(`ok       ${relative}`); }
  catch { console.error(`MISSING  ${relative}`); failed = true; }
}

try {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (packageJson.devDependencies?.three !== '0.187.0') throw new Error(`three is ${packageJson.devDependencies?.three || 'missing'}`);
  if (packageJson.devDependencies?.['@gltf-transform/cli'] !== '4.5.1') throw new Error(`@gltf-transform/cli is ${packageJson.devDependencies?.['@gltf-transform/cli'] || 'missing'}`);
  console.log('ok       pinned package contract');
} catch (error) {
  console.error(`INVALID  package contract (${error.message})`);
  failed = true;
}

const vendorManifest = path.join(root, 'assets/vendor/three-r187/VENDOR-MANIFEST.json');
try {
  const manifest = JSON.parse(await readFile(vendorManifest, 'utf8'));
  if (manifest.version !== '0.187.0') throw new Error(`unexpected version ${manifest.version}`);
  console.log('ok       three.js vendor 0.187.0');
} catch (error) {
  console.warn(`pending  three.js vendor (${error.message}) — expected before approved package setup.`);
}

const optimizedDir = path.join(root, 'assets/beyond-eden/optimized');
const glbs = (await readdir(optimizedDir).catch(() => [])).filter(name => name.endsWith('.glb'));
if (glbs.length) {
  const bytes = (await Promise.all(glbs.map(name => stat(path.join(optimizedDir, name))))).reduce((sum, row) => sum + row.size, 0);
  const label = glbs.length === 15 ? 'ok      ' : 'partial ';
  console.log(`${label} ${glbs.length}/15 optimized GLBs (${(bytes / 1048576).toFixed(2)} MiB)`);
} else {
  console.warn('pending  optimized GLBs — procedural runtime fallback will be used.');
}

const treeDirectory = path.join(root, 'assets/beyond-eden/trees');
const treeFiles = ['hero-tree-lod0.glb', 'hero-tree-lod1.glb', 'hero-tree-billboard.ktx2'];
const treeStatus = await Promise.all(treeFiles.map(async name => {
  try { await access(path.join(treeDirectory, name)); return true; }
  catch { return false; }
}));
if (treeStatus.every(Boolean)) console.log('ok       approved tree derivatives');
else console.warn(`pending  approved tree derivatives (${treeStatus.filter(Boolean).length}/3); proxy fallback remains active.`);

if (failed) process.exit(1);
