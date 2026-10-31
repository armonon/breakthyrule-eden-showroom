#!/usr/bin/env node
import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const directory = path.resolve(process.argv[2] || 'assets/beyond-eden/trees');
const required = [
  'hero-tree-lod0.glb',
  'hero-tree-lod1.glb',
  'hero-tree-billboard.ktx2',
  'hero-tree-source-manifest.json',
  'tree-source-ledger.json',
];
let failed = false;
for (const name of required) {
  const file = path.join(directory, name);
  try {
    await access(file);
    const info = await stat(file);
    if (!info.size) throw new Error('empty file');
    console.log(`ok  ${name}  ${(info.size / 1048576).toFixed(2)} MiB`);
  } catch (error) {
    failed = true;
    console.error(`MISSING/INVALID  ${name}: ${error.message}`);
  }
}

try {
  const ledger = JSON.parse(await readFile(path.join(directory, 'tree-source-ledger.json'), 'utf8'));
  const requiredLedger = ['sourceAssetName', 'sourceUrl', 'authorOrPublisher', 'license', 'commercialUseConfirmed'];
  const incomplete = requiredLedger.filter(key => ledger[key] == null || ledger[key] === '');
  if (incomplete.length) {
    console.warn(`pending provenance: ${incomplete.join(', ')}`);
  } else if (ledger.commercialUseConfirmed !== true) {
    console.warn('pending provenance: commercialUseConfirmed is not true');
  } else {
    console.log('ok  tree provenance ledger complete');
  }
} catch (error) {
  failed = true;
  console.error(`INVALID ledger: ${error.message}`);
}

if (failed) process.exit(1);
