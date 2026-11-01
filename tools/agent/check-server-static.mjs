#!/usr/bin/env node
import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const base = process.env.BASE_URL || 'http://127.0.0.1:8777';
const root = process.cwd();
const tests = [
  ['/beyond-eden.html', /text\/html/],
  ['/beyond-eden.css', /text\/css/],
  ['/beyond-eden/main.js', /(text|application)\/javascript/],
  ['/beyond-eden/config.js', /(text|application)\/javascript/],
  ['/beyond-eden/assets/slice-manifest.json', /application\/json/],
  ['/beyond-eden/assets/tree-manifest.json', /application\/json/],
];

async function localExists(relative) {
  try { await access(path.join(root, relative)); return true; }
  catch { return false; }
}

if (await localExists('assets/vendor/three-r187/build/three.webgpu.js')) {
  tests.push(['/assets/vendor/three-r187/build/three.webgpu.js', /(text|application)\/javascript/]);
  tests.push(['/assets/vendor/three-r187/examples/jsm/libs/basis/basis_transcoder.wasm', /application\/wasm|application\/octet-stream/]);
}
if (await localExists('assets/beyond-eden/optimized/temple-core-lod0.glb')) {
  tests.push(['/assets/beyond-eden/optimized/temple-core-lod0.glb', /model\/gltf-binary|application\/octet-stream/]);
}
if (await localExists('assets/beyond-eden/trees/hero-tree-billboard.ktx2')) {
  tests.push(['/assets/beyond-eden/trees/hero-tree-billboard.ktx2', /image\/ktx2|application\/octet-stream/]);
}

let failed = 0;
for (const [pathname, expectedType] of tests) {
  const url = new URL(pathname, base);
  try {
    const response = await fetch(url, { cache: 'no-store' });
    const type = response.headers.get('content-type') || '';
    const ok = response.ok && expectedType.test(type);
    console.log(`${ok ? 'ok ' : 'FAIL'}  ${response.status}  ${type || '(no content-type)'}  ${url}`);
    if (!ok) failed += 1;
    await response.body?.cancel?.();
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${url} — ${error.message}`);
  }
}

if (failed) {
  console.error(`\n${failed} static-serving check(s) failed.`);
  process.exit(1);
}
console.log(`\nPASS — ${tests.length} local static resources served with acceptable MIME types.`);
