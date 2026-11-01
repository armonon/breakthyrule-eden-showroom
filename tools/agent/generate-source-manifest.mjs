#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = path.join(root, 'SOURCE-MANIFEST.json');
const excludedNames = new Set([
  'SOURCE-MANIFEST.json',
  'SHA256SUMS.txt',
  '.DS_Store',
]);

function excluded(file) {
  const relative = path.relative(root, file);
  return excludedNames.has(relative)
    || relative === 'agent/HANDOFF_VERIFICATION.json'
    || relative.endsWith('.zip')
    || relative.endsWith('.pyc')
    || relative.split(path.sep).includes('__pycache__');
}

async function walk(directory) {
  const rows = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await walk(full));
    else if (!excluded(full)) rows.push(full);
  }
  return rows;
}

let handoffVersion = '2.0.0';
try {
  const versionText = await readFile(path.join(root, 'VERSION.txt'), 'utf8');
  handoffVersion = versionText.match(/(?:HANDOFF_VERSION\s*=|Version:)\s*([^\s]+)/i)?.[1] || handoffVersion;
} catch {}

const files = [];
for (const file of (await walk(root)).sort()) {
  const data = await readFile(file);
  files.push({
    path: path.relative(root, file),
    bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
  });
}

const manifest = {
  schema: 'beyond-eden-source-handoff-v2',
  handoffVersion,
  generatedAt: new Date().toISOString(),
  packageDownloadsPerformed: false,
  externalAssetsDownloaded: false,
  remoteWritesPerformed: false,
  targetMachineBuildPerformed: false,
  notes: [
    'The bundle is source-complete and agent-ready.',
    'Target-machine package installation, Blender/KTX2 generation, screenshots, and benchmarks remain intentionally unperformed.',
    'SOURCE-MANIFEST.json, SHA256SUMS.txt, and agent/HANDOFF_VERIFICATION.json are excluded to avoid self-referential hashes.',
  ],
  totals: {
    files: files.length,
    bytes: files.reduce((total, file) => total + file.bytes, 0),
  },
  files,
};

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${path.relative(root, outputPath)} with ${manifest.totals.files} files.`);
