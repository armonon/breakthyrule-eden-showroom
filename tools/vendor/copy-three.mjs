#!/usr/bin/env node
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const source = path.join(root, 'node_modules/three');
const destination = path.join(root, 'assets/vendor/three-r187');

async function exists(target) {
  try { await stat(target); return true; } catch { return false; }
}

if (!await exists(path.join(source, 'package.json'))) {
  console.error('three@0.187.0 is not installed. Do not run npm install until package approval has been given.');
  process.exit(2);
}

const pkg = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
if (pkg.version !== '0.187.0') {
  console.error(`Expected three@0.187.0, found ${pkg.version}. Refusing to vendor an unpinned version.`);
  process.exit(3);
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(path.join(source, 'build'), path.join(destination, 'build'), { recursive: true });
await cp(path.join(source, 'examples/jsm'), path.join(destination, 'examples/jsm'), { recursive: true });
for (const file of ['LICENSE', 'package.json']) {
  if (await exists(path.join(source, file))) await cp(path.join(source, file), path.join(destination, file));
}

const manifest = {
  package: 'three',
  version: pkg.version,
  source: 'https://www.npmjs.com/package/three',
  copiedAt: new Date().toISOString(),
  copied: ['build/**', 'examples/jsm/**', 'LICENSE', 'package.json'],
  runtimeNetworkDependency: false,
};
await writeFile(path.join(destination, 'VENDOR-MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[Beyond Eden] Vendored three@${pkg.version} into ${path.relative(root, destination)}.`);
