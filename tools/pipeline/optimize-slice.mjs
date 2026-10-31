#!/usr/bin/env node
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const rawDir = path.resolve(root, process.argv[2] || 'assets/beyond-eden/raw');
const outDir = path.resolve(root, process.argv[3] || 'assets/beyond-eden/optimized');
const bin = process.platform === 'win32' ? 'gltf-transform.cmd' : 'gltf-transform';
const localBin = path.join(root, 'node_modules/.bin', bin);

function verifyTool(command, args, expected, label) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env: process.env });
  if (result.error?.code === 'ENOENT') throw new Error(`${label} is missing. Installation requires explicit approval unless already approved locally.`);
  if (result.status !== 0) throw new Error(`${label} check failed: ${(result.stderr || result.stdout || '').trim()}`);
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (expected && !output.includes(expected)) throw new Error(`${label} version mismatch. Expected ${expected}; received ${output || 'unknown'}.`);
  console.log(`[Beyond Eden] ${label}: ${output.split(/\r?\n/)[0] || 'available'}`);
}

verifyTool(localBin, ['--version'], '4.5.1', 'glTF Transform CLI');
verifyTool('toktx', ['--version'], null, 'KTX toktx');

function run(args) {
  const result = spawnSync(localBin, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error?.code === 'ENOENT') {
    throw new Error('Local gltf-transform CLI is missing. Package installation requires explicit approval first.');
  }
  if (result.status !== 0) throw new Error(`${bin} ${args.join(' ')} failed with exit code ${result.status}`);
}

function textureSizeFor(filename) {
  if (/-lod0\.glb$/i.test(filename)) return 2048;
  if (/-lod1\.glb$/i.test(filename)) return 1024;
  return 512;
}

await mkdir(outDir, { recursive: true });
const inputs = (await readdir(rawDir)).filter(name => /-lod[0-2]\.glb$/i.test(name)).sort();
if (!inputs.length) throw new Error(`No raw LOD GLBs found in ${rawDir}. Run the Blender build first.`);

const manifest = {
  schema: 'beyond-eden-optimized-assets-v1',
  generatedAt: new Date().toISOString(),
  geometryCompression: 'EXT_meshopt_compression/high',
  textureCompression: 'KHR_texture_basisu: UASTC for normal/ORM, ETC1S for remaining slots',
  files: [],
};

for (const filename of inputs) {
  const input = path.join(rawDir, filename);
  const output = path.join(outDir, filename);
  const textureSize = textureSizeFor(filename);
  await rm(output, { force: true });
  console.log(`\n[Beyond Eden] Optimizing ${filename} (max texture ${textureSize}px)…`);
  run([
    'optimize', input, output,
    '--compress', 'meshopt',
    '--meshopt-level', 'high',
    '--texture-compress', 'ktx2',
    '--texture-size', String(textureSize),
    '--simplify', 'false',
    '--instance', 'true',
    '--flatten', 'true',
    '--join', 'true',
    '--join-named', 'false',
    '--prune', 'true',
    '--sparse', 'true',
  ]);
  run(['validate', output]);
  const [before, after] = await Promise.all([stat(input), stat(output)]);
  manifest.files.push({
    file: filename,
    rawBytes: before.size,
    optimizedBytes: after.size,
    ratio: Number((after.size / before.size).toFixed(4)),
    maxTextureSize: textureSize,
  });
}

const totals = manifest.files.reduce((acc, row) => ({ rawBytes: acc.rawBytes + row.rawBytes, optimizedBytes: acc.optimizedBytes + row.optimizedBytes }), { rawBytes: 0, optimizedBytes: 0 });
manifest.totals = { ...totals, ratio: Number((totals.optimizedBytes / Math.max(1, totals.rawBytes)).toFixed(4)) };
await writeFile(path.join(outDir, 'optimization-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n[Beyond Eden] Wrote ${path.relative(root, path.join(outDir, 'optimization-manifest.json'))}.`);
