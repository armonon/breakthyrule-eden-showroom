#!/usr/bin/env node
// Drive the Beyond Eden proof in a throwaway headless Chrome (real GPU via Metal/WebGPU) and save evidence:
// benchmark JSON and screenshots. Uses the Chrome DevTools Protocol directly (no Puppeteer download).
//
//   node tools/agent/run-headless-bench.mjs [--url http://127.0.0.1:8777/beyond-eden.html] [--out docs/beyond-eden/evidence/DATE]
//        [--runs 3] [--presets high,medium,low] [--force-webgl] [--probe] [--shots]
//
// --probe only reports the GPU adapter and renderer backend; --eval FILE runs a JS expression and prints it.
// --shots captures the fixed screenshot set after the benchmarks (a stalled headless capture can't block them); --uncapped disables vsync/frame-rate limits so frame times show headroom.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : null).filter(Boolean));
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9555 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'be-bench-'));
const base = args.url || 'http://127.0.0.1:8777/beyond-eden.html';
const url = base + (args['force-webgl'] ? (base.includes('?') ? '&' : '?') + 'forceWebGL=1' : '');
const out = args.out || `docs/beyond-eden/evidence/${new Date().toISOString().slice(0, 10)}`;
fs.mkdirSync(out, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1280,800',
  '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--no-first-run', '--no-default-browser-check',
  ...(args.uncapped ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : []),
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 50; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const page = list.find(t => t.type === 'page'); if (page) return page; } catch {}
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}
let ws, nextId = 1; const pending = new Map();
function send(method, params = {}) { const id = nextId++; ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); }
async function evaluate(expression, timeout = 3600000) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
  return r.result.value;
}
// Headless capture can wait forever for a frame; never let one stalled screenshot block the benchmark.
async function shot(file) {
  const r = await Promise.race([send('Page.captureScreenshot', { format: 'png', fromSurface: true }), sleep(10000).then(() => null)]);
  if (!r) return `${file} (skipped: capture timed out)`;
  fs.writeFileSync(file, Buffer.from(r.data, 'base64')); return file;
}

try {
  const page = await target();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url });
  const ready = await evaluate(`new Promise((resolve, reject) => { const t0 = performance.now(); (function wait(){ if (window.__BEYOND_EDEN__) resolve(true); else if (performance.now() - t0 > 60000) reject(new Error('proof did not start')); else setTimeout(wait, 200); })(); })`);
  await sleep(6000); // let streaming, KTX2 transcode and shader compiles settle
  const probe = await evaluate(`(async () => { const a = navigator.gpu ? await navigator.gpu.requestAdapter() : null; const info = a?.info || {}; return { webgpuAvailable: !!a, adapter: { vendor: info.vendor, architecture: info.architecture, description: info.description }, backend: window.__BEYOND_EDEN__.inspect().backend, sectors: window.__BEYOND_EDEN__.inspect().streaming, vegetation: window.__BEYOND_EDEN__.inspect().vegetation }; })()`);
  console.log(JSON.stringify({ url, ready, probe }, null, 1));
  if (args.eval) console.log(JSON.stringify(await evaluate(fs.readFileSync(args.eval, 'utf8')), null, 1));
  if (args.probe || args.eval) process.exit(0);

  const tag = args['force-webgl'] ? 'webgl2' : 'webgpu';
  const runs = Number(args.runs ?? 1), presets = String(args.presets || 'high,medium,low').split(',');
  const reports = [];
  for (let i = 0; i < runs; i++) {
    const report = await evaluate(`window.__BEYOND_EDEN__.bench.runSuite(${JSON.stringify(presets)})`);
    reports.push(report);
    const file = path.join(out, `bench-${tag}-run${i + 1}.json`);
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(file, report.results.map(r => `${r.preset}: ${r.samples} samples, median ${r.medianFrameMs.toFixed(2)} ms, p99 ${r.p99FrameMs.toFixed(2)} ms, ${r.drawCalls} calls, ${r.triangles} tris`).join(' | '));
  }
  if (args.shots) {
    await evaluate(`(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); return true; })()`); // the benchmark result panel
    const views = { 'spawn-south': [0, 72, 0, -.03], 'plaza-approach': [0, 22, 0, .12], 'west-approach': [-30, 30, -.75, .06], 'east-approach': [34, 18, .9, .05] };
    for (const [name, [x, z, yaw, pitch]] of Object.entries(views)) {
      await evaluate(`(() => { const B = window.__BEYOND_EDEN__; B.controls.position.set(${x}, 1.72, ${z}); B.controls.yaw = ${yaw}; B.controls.pitch = ${pitch}; return true; })()`);
      await sleep(2500);
      console.log('screenshot', await shot(path.join(out, `${tag}-${name}.png`)));
    }
  }
} catch (error) {
  console.error('ERROR', error.message); process.exitCode = 1;
} finally {
  chrome.kill('SIGTERM'); await sleep(500); fs.rmSync(profile, { recursive: true, force: true });
}
