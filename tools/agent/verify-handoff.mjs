#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.join(root, 'agent/HANDOFF_VERIFICATION.json');
const checks = [];

function record(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail: String(detail || '') });
  const prefix = ok ? 'ok ' : 'FAIL';
  console.log(`${prefix}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function exists(relative) {
  try { await stat(path.join(root, relative)); return true; }
  catch { return false; }
}

async function walk(directory) {
  const rows = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await walk(full));
    else rows.push(full);
  }
  return rows;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  return { ok: result.status === 0, output: `${result.stdout || ''}${result.stderr || ''}`.trim() };
}

const required = [
  'AGENT_START_HERE.md',
  'AGENTS.md',
  'README.md',
  'agent/HANDOFF_STATE.json',
  'agent/EXECUTION_PLAN.md',
  'agent/ACCEPTANCE_TESTS.md',
  'docs/COORDINATE_CONVENTIONS.md',
  'references/Beyond_Eden_Selected_Architecture_Atlas_Revised.docx',
  'beyond-eden.html',
  'beyond-eden.css',
  'beyond-eden/main.js',
  'beyond-eden/config.js',
  'beyond-eden/assets/slice-manifest.json',
  'beyond-eden/assets/tree-manifest.json',
  'tools/apply-to-project.sh',
  'tools/blender/build_scottish_rite_slice.py',
  'tools/blender/prepare_approved_tree.py',
  'tools/pipeline/optimize-slice.mjs',
  'tools/pipeline/validate-tree-assets.mjs',
  'tools/agent/doctor.sh',
  'tools/agent/generate-source-manifest.mjs',
];
for (const relative of required) record(`required file: ${relative}`, await exists(relative));

let packageJson = null;
try {
  packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  record('package.json parses', true);
  record('three version pinned', packageJson.devDependencies?.three === '0.187.0', packageJson.devDependencies?.three);
  record('glTF Transform version pinned', packageJson.devDependencies?.['@gltf-transform/cli'] === '4.5.1', packageJson.devDependencies?.['@gltf-transform/cli']);
} catch (error) {
  record('package.json parses', false, error.message);
}

for (const relative of ['SOURCE-MANIFEST.json', 'agent/HANDOFF_STATE.json', 'beyond-eden/assets/slice-manifest.json', 'beyond-eden/assets/tree-manifest.json', 'assets/beyond-eden/trees/tree-source-ledger.json']) {
  try {
    JSON.parse(await readFile(path.join(root, relative), 'utf8'));
    record(`JSON parses: ${relative}`, true);
  } catch (error) {
    record(`JSON parses: ${relative}`, false, error.message);
  }
}

const html = await readFile(path.join(root, 'beyond-eden.html'), 'utf8');
record('import map uses local three r187', html.includes('/assets/vendor/three-r187/build/three.webgpu.js'));
record('runtime page has no CDN URL', !/https?:\/\//i.test(html));

const runtimeFiles = [
  path.join(root, 'beyond-eden.html'),
  path.join(root, 'beyond-eden.css'),
  ...(await walk(path.join(root, 'beyond-eden'))).filter(file => /\.(js|json)$/i.test(file)),
];
const externalRuntimeReferences = [];
for (const file of runtimeFiles) {
  const text = await readFile(file, 'utf8');
  if (/https?:\/\//i.test(text)) externalRuntimeReferences.push(path.relative(root, file));
}
record('runtime source contains no external HTTP reference', externalRuntimeReferences.length === 0, externalRuntimeReferences.join(', '));

const proxyTempleSource = await readFile(path.join(root, 'beyond-eden/scene/proxy-temple.js'), 'utf8');
const blenderTempleSource = await readFile(path.join(root, 'tools/blender/build_scottish_rite_slice.py'), 'utf8');
record('proxy relief bays are attached to facade', proxyTempleSource.includes('-38.68') && proxyTempleSource.includes('-38.28'));
record('Blender temple follows x,-z,y coordinate conversion', blenderTempleSource.includes('(0, 48.5, 10)') && blenderTempleSource.includes('(0, -65, -.11)'));
record('interactive door excluded from static GLB export', blenderTempleSource.includes('if "_runtime_dynamic" in original.name'));
const mainSource = await readFile(path.join(root, 'beyond-eden/main.js'), 'utf8');
record('screenshot uses backend-independent render-target readback', mainSource.includes('readRenderTargetPixelsAsync') && mainSource.includes('new THREE.RenderTarget'));
record('screenshot no longer depends on deprecated renderAsync', !mainSource.includes('renderer.renderAsync'));

const executableScripts = [
  path.join(root, 'tools/apply-to-project.sh'),
  ...(await walk(path.join(root, 'tools/agent'))),
  ...(await walk(path.join(root, 'tools/pipeline'))),
].filter(file => /\.(sh|mjs)$/i.test(file));
const forbidden = [];
for (const file of executableScripts) {
  const text = await readFile(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/\bgit\s+push\b|\bnetlify\b.*\b(deploy|link|sites?)\b|\bcurl\b|\bwget\b/i.test(line) && !/do not|never|forbidden|grep|scan/i.test(line)) {
      forbidden.push(`${path.relative(root, file)}:${index + 1}: ${line.trim()}`);
    }
  });
}
record('executable scripts contain no remote/deploy command', forbidden.length === 0, forbidden.join(' | '));

const jsFiles = (await walk(root)).filter(file => /\.(js|mjs)$/i.test(file) && !file.includes(`${path.sep}assets${path.sep}vendor${path.sep}`));
let jsOk = true;
for (const file of jsFiles) {
  const result = run(process.execPath, ['--check', file]);
  if (!result.ok) {
    jsOk = false;
    console.error(result.output);
  }
}
record(`JavaScript syntax (${jsFiles.length} files)`, jsOk);

const pyFiles = (await walk(path.join(root, 'tools/blender'))).filter(file => file.endsWith('.py'));
const py = run('python3', ['-m', 'py_compile', ...pyFiles]);
record(`Python syntax (${pyFiles.length} files)`, py.ok, py.ok ? '' : py.output);

const shFiles = (await walk(path.join(root, 'tools'))).filter(file => file.endsWith('.sh'));
let shellOk = true;
for (const file of shFiles) {
  const result = run('bash', ['-n', file]);
  if (!result.ok) {
    shellOk = false;
    console.error(result.output);
  }
}
record(`Shell syntax (${shFiles.length} files)`, shellOk);

try {
  const manifest = JSON.parse(await readFile(path.join(root, 'beyond-eden/assets/slice-manifest.json'), 'utf8'));
  const files = manifest.sectors.flatMap(sector => sector.files);
  record('slice manifest declares fifteen LOD GLBs', files.length === 15, `${files.length}`);
  record('slice manifest has five sectors', manifest.sectors.length === 5, `${manifest.sectors.length}`);
} catch (error) {
  record('slice manifest structure', false, error.message);
}

try {
  const tree = JSON.parse(await readFile(path.join(root, 'beyond-eden/assets/tree-manifest.json'), 'utf8'));
  record('tree selection marked resolved', tree.selectionResolvedExternally === true);
  record('tree runtime has three derivative paths', Boolean(tree.lod0 && tree.lod1 && tree.billboard));
} catch (error) {
  record('tree manifest structure', false, error.message);
}

const files = await walk(root);
let bytes = 0;
const hashes = [];
for (const file of files) {
  if (file === reportPath || file.endsWith('.zip') || file.includes(`${path.sep}__pycache__${path.sep}`) || file.endsWith('.pyc')) continue;
  const data = await readFile(file);
  bytes += data.length;
  hashes.push({ path: path.relative(root, file), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}

const failed = checks.filter(check => !check.ok);
const report = {
  schema: 'beyond-eden-handoff-verification-v1',
  generatedAt: new Date().toISOString(),
  root: '.',
  passed: failed.length === 0,
  checks,
  totals: { files: hashes.length, bytes },
  files: hashes,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nWrote ${path.relative(root, reportPath)}`);
console.log(`${report.passed ? 'PASS' : 'FAIL'} — ${checks.length - failed.length}/${checks.length} checks passed.`);
if (!report.passed) process.exit(1);
