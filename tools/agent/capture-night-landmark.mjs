#!/usr/bin/env node
// Visit a night-district viewpoint in the garden in a throwaway headless Chrome (real GPU via Metal), measure frame
// times while the camera drifts (the garden draws on demand, so a still camera would measure nothing), and screenshot.
//
//   node tools/agent/capture-night-landmark.mjs --out DIR [--url http://127.0.0.1:8777/] [--seconds 12] [--only gardens,hotel]
//
// Views are [x, z, lookX, lookY, lookZ] in world metres; every landmark's main facade faces +Z.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : null).filter(Boolean));
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9555 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'night-cap-'));
const url = args.url || 'http://127.0.0.1:8777/showroom.html';
const out = args.out || `docs/night/evidence/${new Date().toISOString().slice(0, 10)}`;
const seconds = Number(args.seconds || 12);
fs.mkdirSync(out, { recursive: true });
const views = {   // [x, z, lookX, lookY, lookZ, landmark id whose model must be loaded before measuring]
  'theatre-approach': [-11, -48, -15, 6, -66, 'playhouse'],
  'theatre-facade': [-13.5, -56, -15, 5.5, -66, 'playhouse'],
  'temple-approach': [-8, -22, -12, 7, -35, 'temple'],
  'observatory-approach': [33, -20, 37, 6, -34, 'observatory'],
  'hotel-approach': [24, -57, 39, 6, -67, 'hotel'],
  'gardens-approach': [1, -85, -13, 5, -93, 'gardens'],
  'gardens-court': [-14, -91.5, -14, 2.5, -104, 'gardens'],
  'road-to-theatre': [11.7, -40, -15, 6, -70, 'playhouse'],
  'girard-approach': [-40, -22, -46, 5, -34, 'girard'],
  'latheatre-approach': [-38, -48, -46, 7, -58, 'latheatre'],
  'stjames-approach': [-44, -80, -46, 5, -88, 'stjames'],
  'vibiana-approach': [-62, -24, -68, 9, -39, 'vibiana'],
  'methodist-approach': [-74, -62, -68, 8, -73, 'methodist'],
  'immanuel-approach': [72, -22, 64, 9, -31, 'immanuel'],
  'baptist-approach': [52, -56, 64, 6, -65, 'baptist'],
  'christian-approach': [79, -86, 64, 8, -90, 'christian'],
  'firstcong-approach': [92, -22, 88, 12, -49, 'firstcong'],
};

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1280,800',
  '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, nextId = 1; const pending = new Map();
function send(method, params = {}) { const id = nextId++; ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); }
async function evaluate(expression) {
  const r = await Promise.race([send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }), sleep(90000).then(() => { throw new Error('evaluate timed out'); })]);
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
  return r.result.value;
}
async function shot(file) {
  const r = await Promise.race([send('Page.captureScreenshot', { format: 'png', fromSurface: true }), sleep(10000).then(() => null)]);
  if (!r) return `${file} (skipped: capture timed out)`;
  fs.writeFileSync(file, Buffer.from(r.data, 'base64')); return file;
}

try {
  let page;
  for (let i = 0; i < 50 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {} if (!page) await sleep(200); }
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', e => { const m = JSON.parse(e.data);
    // surface page errors: a silent exception otherwise shows up only as a district that never builds
    if (m.method === 'Runtime.exceptionThrown') console.log('PAGE EXCEPTION', (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 400));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) console.log('PAGE', m.params.type, m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  });
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url });
  await evaluate(`new Promise((resolve, reject) => { const t0 = performance.now(); (function wait(){ if (window.breakThyRuleShowroom?.getState?.().ready) resolve(true); else if (performance.now() - t0 > 60000) reject(new Error('garden did not start')); else setTimeout(wait, 250); })(); })`);
  await evaluate(`(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); return true; })()`);
  const [x0, z0, lx0, ly0, lz0] = views['theatre-approach'];  // the district builds on first approach
  // walk in so the night section builds, then wait for the theatre model
  const status = await evaluate(`new Promise(resolve => { const S = window.breakThyRuleShowroom, t0 = performance.now();
    (function wait(){ S.place(${x0}, ${z0}, ${lx0}, ${lz0}, ${ly0}); const d = S.getState().district;
      if (d?.models?.playhouse === 'model' || performance.now() - t0 > 60000) resolve(d); else setTimeout(wait, 300); })(); })`);
  console.log('district', JSON.stringify(status));
  await sleep(3000);
  const results = {};
  // --only a,b limits the run to views whose names contain one of the given substrings
  const only = args.only ? String(args.only).split(',') : null;
  await evaluate(`(() => { window.__longTasks = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__longTasks.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch {} return true; })()`);
  for (const [name, [x, z, lx, ly, lz, id]] of Object.entries(views)) {
    if (only && !only.some(o => name.includes(o))) continue;
    // stand at the viewpoint until that landmark's model has streamed in (or 30 s), then measure
    const state = await evaluate(`new Promise(resolve => { const S = window.breakThyRuleShowroom, t0 = performance.now();
      (function wait(){ S.place(${x}, ${z}, ${lx}, ${lz}, ${ly}); const m = S.getState().district?.models?.['${id}'];
        if (m === 'model' || m === 'fallback' || m === undefined && performance.now() - t0 > 3000 || performance.now() - t0 > 30000) resolve(m ?? 'none'); else setTimeout(wait, 250); })(); })`);
    if (state !== 'model') console.log(name, 'model state', state);
    await sleep(1500);
    // drift the camera 0.6 m side to side so every frame redraws, and record frame intervals
    results[name] = await evaluate(`new Promise(resolve => { const S = window.breakThyRuleShowroom, ft = [], t0 = performance.now(); let last = t0;
      (function frame(now){ ft.push(now - last); last = now; const k = Math.sin((now - t0) / 900) * .3;
        S.place(${x} + k, ${z}, ${lx} + k, ${lz}, ${ly});
        if (now - t0 < ${seconds * 1000}) requestAnimationFrame(frame); else {
          const s = ft.slice(10).sort((a, b) => a - b), q = p => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2);
          resolve({ samples: s.length, meanFps: +(1000 / (s.reduce((a, b) => a + b, 0) / s.length)).toFixed(1), p50: q(.5), p95: q(.95), p99: q(.99), over33: s.filter(v => v > 33.4).length }); } })(t0); })`);
    await evaluate(`(() => { const [x, z, lx, ly, lz] = ${JSON.stringify([x, z, lx, ly, lz])}; window.breakThyRuleShowroom.place(x, z, lx, lz, ly); return true; })()`);
    await sleep(1200);
    const longTasks = await evaluate(`(() => { const l = window.__longTasks.splice(0); return l.filter(d => d > 200); })()`);
    if (longTasks.length) console.log(name, 'long tasks >200 ms:', JSON.stringify(longTasks));
    console.log(name, JSON.stringify(results[name]), await shot(path.join(out, `${name}.png`)));
    // written after every view so a stalled capture never loses the timings already measured
    fs.writeFileSync(path.join(out, 'night-landmark-bench.json'), JSON.stringify({ url, measured: new Date().toISOString(), viewport: '1280x800 @2x', district: status, results }, null, 1));
  }
} catch (error) {
  console.error('ERROR', error.message); process.exitCode = 1;
} finally {
  chrome.kill('SIGTERM'); await sleep(500); fs.rmSync(profile, { recursive: true, force: true });
  process.exit(process.exitCode ?? 0); // an open DevTools socket would otherwise keep node alive
}
