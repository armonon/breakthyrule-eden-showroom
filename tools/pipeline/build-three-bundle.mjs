#!/usr/bin/env node
// Build assets/three.min.js for the classic-script site: current three.js as window.THREE plus GLTFLoader wired for
// KTX2 and meshopt (window.ShowroomGLTFLoader), BufferGeometryUtils and SkeletonUtils (three.BufferGeometryUtils etc).
import { build } from 'esbuild';
const entry = `
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
let ktx2 = null;
class ShowroomGLTFLoader extends GLTFLoader {
  constructor(manager) { super(manager); this.setMeshoptDecoder(MeshoptDecoder); if (ktx2) this.setKTX2Loader(ktx2); }
}
window.THREE = THREE;
window.ShowroomGLTFLoader = ShowroomGLTFLoader;
window.ShowroomBufferGeometryUtils = BufferGeometryUtils;
// The KTX2 transcoder needs one renderer to learn which GPU formats exist; call once at startup.
window.showroomEnableKTX2 = renderer => { if (!ktx2) ktx2 = new KTX2Loader().setTranscoderPath('/assets/basis/').setWorkerLimit(2).detectSupport(renderer); return ktx2; };
`;
await build({ stdin: { contents: entry, resolveDir: process.cwd() }, bundle: true, minify: true, format: 'iife', target: 'es2020', legalComments: 'none', define: { 'import.meta.url': 'location.href' },
  outfile: 'assets/three.min.js', banner: { js: '// three.js r187 and addons (MIT, see three-LICENSE.txt). Built by tools/pipeline/build-three-bundle.mjs' } });
