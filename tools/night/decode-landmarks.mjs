#!/usr/bin/env node
// Decode the shipped landmark GLBs (meshopt + quantized) into plain GLBs Blender can import.
//   node tools/night/decode-landmarks.mjs OUTDIR [assets/night/x.glb ...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [out, ...files] = process.argv.slice(2);
const list = files.length ? files : fs.readdirSync('assets/night').filter(f => f.endsWith('.glb')).map(f => 'assets/night/' + f);
fs.mkdirSync(out, { recursive: true });
for (const f of list) {
  const doc = await io.read(f);
  for (const e of doc.getRoot().listExtensionsUsed()) if (/meshopt_compression|mesh_quantization/.test(e.extensionName)) e.dispose();
  await doc.transform(dequantize());
  await io.write(path.join(out, path.basename(f)), doc);
  console.log('decoded', path.basename(f));
}
