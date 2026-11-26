#!/usr/bin/env node
// Compress the Blender pass's output for the web like the shipped landmarks (KHR_mesh_quantization + EXT_meshopt_compression),
// geometry and material names only (night-district.js takes the textures from the original GLB by material name).
//   node tools/night/pack-built.mjs IN_DIR OUT_DIR
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const [src, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let total = 0, totalOld = 0;
for (const f of fs.readdirSync(src).filter(f => f.endsWith('.glb')).sort()) {
  const doc = await io.read(path.join(src, f));
  for (const t of doc.getRoot().listTextures()) t.dispose();
  await doc.transform(weld(), dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH] }), reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12, quantizeGeneric: 8 }), prune({ keepAttributes: true }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(path.join(out, f), doc);
  const size = fs.statSync(path.join(out, f)).size, orig = fs.statSync(path.join('assets/night', f)).size; total += size; totalOld += orig;
  let tris = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() || 0) / 3;
  console.log(`${f}: ${(size / 1024).toFixed(0)} KB geometry (${tris} triangles) on top of the ${(orig / 1024).toFixed(0)} KB original: +${(100 * size / orig).toFixed(0)}%`);
}
console.log(`total ${(total / 1048576).toFixed(2)} MB added to ${(totalOld / 1048576).toFixed(2)} MB`);
