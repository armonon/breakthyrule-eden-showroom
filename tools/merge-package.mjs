#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const target = path.resolve(process.argv[2] || 'package.json');
let pkg = {};
try { pkg = JSON.parse(await readFile(target, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

pkg.name ||= 'breakthyrule-eden-showroom';
pkg.private ??= true;
pkg.type ||= 'module';
pkg.engines = { ...(pkg.engines || {}), node: pkg.engines?.node || '>=20.18' };
pkg.devDependencies = {
  ...(pkg.devDependencies || {}),
  '@gltf-transform/cli': '4.5.1',
  three: '0.187.0',
};
pkg.scripts = {
  ...(pkg.scripts || {}),
  'proof:check': 'node tools/pipeline/check-runtime.mjs',
  'proof:vendor-three': 'node tools/vendor/copy-three.mjs',
  'proof:build-temple': 'blender --background --factory-startup --python tools/blender/build_scottish_rite_slice.py -- --output assets/beyond-eden/raw --bake-ao --samples 48 --keep-blend',
  'proof:optimize': 'node tools/pipeline/optimize-slice.mjs',
  'proof:inspect': 'node tools/pipeline/inspect-slice.mjs',
  'proof:validate-tree': 'node tools/pipeline/validate-tree-assets.mjs',
  'proof:verify-handoff': 'node tools/agent/verify-handoff.mjs',
  'proof:serve-source': 'node tools/agent/serve-handoff.mjs',
  'proof:smoke-server': 'node tools/agent/check-server-static.mjs',
  'proof:summarize-benchmarks': 'node tools/agent/summarize-benchmarks.mjs',
  'proof:assets': 'npm run proof:build-temple && npm run proof:optimize && npm run proof:inspect',
};
await writeFile(target, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`[Beyond Eden] Merged pinned proof-slice scripts into ${target}; no package was downloaded.`);
