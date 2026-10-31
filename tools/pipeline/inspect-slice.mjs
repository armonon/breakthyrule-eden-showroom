#!/usr/bin/env node
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const inputDir = path.resolve(root, process.argv[2] || 'assets/beyond-eden/optimized');
const reportDir = path.join(root, 'docs/generated');
const bin = process.platform === 'win32' ? 'gltf-transform.cmd' : 'gltf-transform';
const localBin = path.join(root, 'node_modules/.bin', bin);

await mkdir(reportDir, { recursive: true });
const files = (await readdir(inputDir)).filter(name => /\.glb$/i.test(name)).sort();
if (!files.length) throw new Error(`No optimized GLBs found in ${inputDir}.`);

const sections = [];
const sizes = [];
for (const filename of files) {
  const target = path.join(inputDir, filename);
  const result = spawnSync(localBin, ['inspect', target], { cwd: root, encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') throw new Error('Local gltf-transform CLI is missing.');
  if (result.status !== 0) throw new Error(`Inspect failed for ${filename}: ${result.stderr}`);
  const info = await stat(target);
  sizes.push({ file: filename, bytes: info.size, mebibytes: Number((info.size / 1048576).toFixed(3)) });
  sections.push(`===== ${filename} =====\n${result.stdout.trim()}\n`);
}
await writeFile(path.join(reportDir, 'asset-inspection.txt'), `${sections.join('\n')}\n`);
await writeFile(path.join(reportDir, 'asset-sizes.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), files: sizes, totalBytes: sizes.reduce((sum, row) => sum + row.bytes, 0) }, null, 2)}\n`);
console.log(`[Beyond Eden] Inspected ${files.length} GLBs. Reports are in docs/generated/.`);
