#!/usr/bin/env node
// Compress the site's runtime GLBs in place: meshopt geometry, KTX2 textures (UASTC normal and data maps, ETC1S colour), 2K maximum. URLs do not change. Scene structure, names and animation stay intact.
// Already-compressed files are skipped, so it can be re-run after new assets arrive. Originals live in git history.
//
//   source tools/ktx-env.sh; node tools/pipeline/compress-site-models.mjs [--jobs 3] [dir ...]
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
const run = promisify(execFile);
const argv = process.argv.slice(2), jobsAt = argv.indexOf('--jobs'), jobs = jobsAt >= 0 ? Number(argv.splice(jobsAt, 2)[1]) : 2;
// assets/flora and assets/eden-hero stay out: eden-flora.js edits their raw vertex data, and meshopt's quantization moves
// scale into node transforms and stores integer attributes. Compress their textures separately (gltf-transform etc1s).
const roots = argv.length ? argv : ['residents', 'assets/night', 'assets/props', 'assets/library', 'rack-models', 'models'];
const CLI = 'node_modules/.bin/gltf-transform', tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-'));
const files = roots.flatMap(r => fs.readdirSync(r, { recursive: true }).map(f => path.join(r, String(f))).filter(f => f.endsWith('.glb')));
function compressed(file) { const b = fs.readFileSync(file), len = b.readUInt32LE(12); return b.subarray(20, 20 + len).includes('EXT_meshopt_compression'); }
const queue = files.filter(f => !compressed(f)); let before = 0, after = 0; const failed = [];
console.log(`${files.length} GLBs, ${queue.length} to compress`);
await Promise.all(Array.from({ length: jobs }, async (_, worker) => {
  while (queue.length) {
    const file = queue.shift(), out = path.join(tmp, `${worker}.glb`);
    try {
      // Fast, bounded settings (the optimize command's UASTC level 4 plus unlimited encoders swamps this machine).
      const step = (cmd, from, to, ...rest) => run(CLI, [cmd, from, to, ...rest], { maxBuffer: 1 << 26 }), a1 = `${out}.a.glb`, a2 = `${out}.b.glb`;
      await step('uastc', file, a1, '--slots', '{normalTexture,occlusionTexture,metallicRoughnessTexture}', '--level', '1', '--rdo', '--rdo-lambda', '2', '--zstd', '18', '--resize', '2048', '--jobs', '2');
      await step('etc1s', a1, a2, '--quality', '180', '--resize', '2048', '--jobs', '2');
      await step('meshopt', a2, out);
      const a = fs.statSync(file).size; let b = fs.statSync(out).size, note = '';
      // Tiny-JPEG models where UASTC grows the download a lot keep their images and take meshopt only.
      if (b > a * 1.5) { await step('meshopt', file, out); b = fs.statSync(out).size; note = ' (meshopt only)'; }
      before += a; after += Math.min(a, b);
      if (b < a) fs.copyFileSync(out, file);
      console.log(`${file} ${(a / 1048576).toFixed(2)} -> ${(b / 1048576).toFixed(2)} MB${note}`);
    } catch (e) { failed.push(file); console.log(`FAILED ${file}: ${String(e.message).slice(0, 300)}`); }
  }
}));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`done: ${(before / 1048576).toFixed(0)} -> ${(after / 1048576).toFixed(0)} MB, ${failed.length} failed`);
