#!/usr/bin/env node
// Picture → game-ready garden prop, using Modly (https://github.com/lightningpixel/modly) on this Mac.
//
//   node tools/3d-gen/modly-prop.mjs --image photo.png --name "stone lantern" --height 1.4
//   node tools/3d-gen/modly-prop.mjs --glb exported.glb --name "stone lantern" --height 1.4   # a GLB exported from the Modly app
//
// Modly must be running (the desktop app starts its local API on 127.0.0.1:8765). The script calls Modly's own CLI,
// tools/modly-cli/agent.py, from your Modly checkout: --modly ~/modly or MODLY_DIR. Pick a model with --model <id>
// (`python3 agent.py model list`); otherwise Modly uses the active one.
//
// Then it makes the mesh fit garden-props.js: Y-up metres, scaled to --height, centred on x/z and standing on y=0,
// simplified to --triangles, textures as WebP at --texture px, quantized geometry. It writes
// assets/props/<name>-vNNN.glb (never overwrites) and adds it to assets/props/catalog.json. Place it in the garden
// with the prop editor: node server/eden-server.mjs, open http://127.0.0.1:8777/?edit, pick it under Add, Save.
//
// Options: --rotate-x/-y/-z <degrees> if the model comes out lying down or facing away; --radius <m> to set the
// collision circle by hand; --keep-raw to keep Modly's untouched output next to the prop (git-ignored *.raw.glb).
// Setup once: npm install --prefix tools/asset-pipeline
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const pipeline = path.join(root, 'tools/asset-pipeline');
let core, functions, extensions, meshopt, sharp;
try {
  const need = createRequire(path.join(pipeline, 'package.json'));
  [core, functions, extensions, meshopt, sharp] = await Promise.all(['@gltf-transform/core', '@gltf-transform/functions', '@gltf-transform/extensions', 'meshoptimizer', 'sharp'].map(m => import(need.resolve(m))));
  sharp = sharp.default;
} catch { fail('Model tools are not installed. Run once: npm install --prefix tools/asset-pipeline'); }
const { NodeIO } = core, { ALL_EXTENSIONS } = extensions, { MeshoptSimplifier } = meshopt;
const { dedup, weld, simplify, textureCompress, quantize, prune, getBounds } = functions;

function fail(message) { console.error(message); process.exit(1); }
const argv = process.argv.slice(2), opt = {};
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (!a.startsWith('--')) fail(`Unexpected argument: ${a}`); const next = argv[i + 1]; if (next === undefined || next.startsWith('--')) opt[a.slice(2)] = true; else { opt[a.slice(2)] = next; i++; } }
const name = String(opt.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
if (!name || !/^[a-z0-9 -]{2,40}$/.test(name)) fail('Give the prop a --name: 2-40 letters, numbers, spaces or dashes, e.g. --name "stone lantern".');
const height = Number(opt.height);
if (!(height > 0.02 && height < 30)) fail('Give its real height in metres with --height, e.g. --height 1.4 (AI models come out at an arbitrary size).');
if (!opt.image === !opt.glb) fail('Give exactly one of --image <picture> (Modly generates it) or --glb <file> (already generated).');
const triangleBudget = Number(opt.triangles || 20000), textureSize = Number(opt.texture || 1024);
const degrees = axis => Number(opt['rotate-' + axis] || 0) * Math.PI / 180;

// ---------- 1. generate with Modly ----------
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'modly-prop-'));
let rawFile;
if (opt.glb) {
  rawFile = path.resolve(String(opt.glb));
  if (!fs.existsSync(rawFile)) fail(`No such file: ${rawFile}`);
} else {
  const image = path.resolve(String(opt.image));
  if (!fs.existsSync(image)) fail(`No such picture: ${image}`);
  const modly = path.resolve(String(opt.modly || process.env.MODLY_DIR || path.join(os.homedir(), 'modly')).replace(/^~(?=$|\/)/, os.homedir()));
  const cli = path.join(modly, 'tools/modly-cli/agent.py');
  if (!fs.existsSync(cli)) fail(`Modly's CLI is not at ${cli}. Point --modly (or MODLY_DIR) at your Modly folder, or export a GLB from the Modly app and use --glb.`);
  const python = process.env.PYTHON || 'python3', call = args => execFileSync(python, [cli, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  try { call(['health', '--compact']); } catch { fail('Modly is not answering. Open the Modly app (it starts the local API), then run this again.'); }
  rawFile = path.join(work, 'modly.glb');
  console.log(`Generating "${name}" with Modly${opt.model ? ` (${opt.model})` : ''}. This can take a few minutes on a Mac.`);
  const out = call(['generate', '--image', image, '--output', rawFile, '--progress', ...(opt.model ? ['--model', String(opt.model)] : [])]);
  if (!fs.existsSync(rawFile)) fail(`Modly finished without writing a model. Its answer was:\n${out}`);
}

// ---------- 2. clean up for the game ----------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.simplifier': MeshoptSimplifier });
await MeshoptSimplifier.ready;
const doc = await io.read(rawFile);
const triangles = () => doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
const tris0 = triangles();
if (!tris0) fail('That model has no geometry.');
const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];

const steps = [dedup(), weld()];
if (tris0 > triangleBudget) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: triangleBudget / tris0, error: 0.01, lockBorder: false }));
if (doc.getRoot().listTextures().length) steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [textureSize, textureSize], quality: 82 }));
await doc.transform(...steps);

// One root node carries rotation, scale and the offset that centres it and stands it on the ground.
const wrap = doc.createNode('prop-root');
for (const child of scene.listChildren()) { scene.removeChild(child); wrap.addChild(child); }
scene.addChild(wrap);
const [rx, ry, rz] = ['x', 'y', 'z'].map(degrees);
const q = eulerToQuaternion(rx, ry, rz);
wrap.setRotation(q);
let box = getBounds(scene), size = box.max.map((v, i) => v - box.min[i]);
if (!(size[1] > 0)) fail('The model is flat in the up direction. Try --rotate-x 90.');
const scale = height / size[1];
wrap.setScale([scale, scale, scale]);
box = getBounds(scene);
wrap.setTranslation([-(box.min[0] + box.max[0]) / 2, -box.min[1], -(box.min[2] + box.max[2]) / 2]);
await doc.transform(quantize(), prune({ keepAttributes: true, keepLeaves: false, keepExtras: true }));
box = getBounds(scene); size = box.max.map((v, i) => +(v - box.min[i]).toFixed(3));

// ---------- 3. save and list it ----------
const slug = name.replace(/ /g, '-'), props = path.join(root, 'assets/props');
let n = 1; while (fs.existsSync(path.join(props, `${slug}-v${String(n).padStart(3, '0')}.glb`))) n++;
const version = `v${String(n).padStart(3, '0')}`, file = path.join(props, `${slug}-${version}.glb`), url = `/assets/props/${slug}-${version}.glb`;
const bytes = await io.writeBinary(doc);
fs.writeFileSync(file, bytes);
if (opt['keep-raw']) fs.copyFileSync(rawFile, file.replace(/\.glb$/, '.raw.glb'));
const radius = opt.radius ? Number(opt.radius) : +(0.425 * (size[0] + size[2]) / 2).toFixed(3); // matches the workshop props
const catalogFile = path.join(props, 'catalog.json'), catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
catalog.push({ name: `${name} ${version}`, url, job: `${stamp}-modly-${slug}-${version}`, size_m: size, radius });
fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 1) + '\n');
fs.rmSync(work, { recursive: true, force: true });

console.log(`Wrote ${path.relative(root, file)}: ${(bytes.byteLength / 1e6).toFixed(2)} MB, ${Math.round(tris0)} -> ${Math.round(triangles())} triangles, ${size.join(' x ')} m, collision radius ${radius} m.`);
console.log(`Added "${name} ${version}" to assets/props/catalog.json. Place it: node server/eden-server.mjs, then open http://127.0.0.1:8777/?edit and pick it under Add.`);

function eulerToQuaternion(x, y, z) { // XYZ order, same as three.js
  const [c1, c2, c3, s1, s2, s3] = [Math.cos(x / 2), Math.cos(y / 2), Math.cos(z / 2), Math.sin(x / 2), Math.sin(y / 2), Math.sin(z / 2)];
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3];
}
