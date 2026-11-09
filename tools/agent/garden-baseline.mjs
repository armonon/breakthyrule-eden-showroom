#!/usr/bin/env node
// Measure the Eden garden in a throwaway headless Chrome (real GPU via Metal): per device class and viewpoint, a
// screenshot, GPU-finished frame time (edenPost.bench), draw calls and triangles (edenPost.profile), plus cold-load
// bytes before first view. Uses the Chrome DevTools Protocol directly.
//
//   node tools/agent/garden-baseline.mjs --url http://127.0.0.1:8790/ --out docs/graphics/baseline [--classes desktop,laptop,phone] [--views spawn,road]
//
// Device classes change viewport, pixel ratio and CPU throttling only: every run uses this machine's GPU, so "laptop"
// and "phone" show the relative cost of their settings, not the speed of that hardware.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : null).filter(Boolean));
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const base = args.url || 'http://127.0.0.1:8790/showroom.html', out = args.out || 'docs/graphics/baseline', frames = Number(args.frames || 20);
const CLASSES = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false, cpu: 1 },
  laptop: { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false, cpu: 2 },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, cpu: 4 },
};
// [camera x, z, look x, z, look y]
const VIEWS = {
  spawn: null,
  'apple-tree': [-7, 8, 2, -6, 3],
  lawn: [6, 16, -8, -4, 1.6],
  pavilion: [5, 0, 0, -14, 2.2],
  road: [11.7, -18, 11.7, -60, 2],
  theatre: [-12, -50, -15, -66, 6],
};
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = { url: base, date: new Date().toISOString(), classes: {} };

for (const name of String(args.classes || 'desktop,laptop,phone').split(',')) {
  const device = CLASSES[name], port = 9900 + Object.keys(results.classes).length * 7 + Math.floor(Math.random() * 3000), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'eden-base-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${device.width},${device.height}`, '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--no-first-run', '--no-default-browser-check', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore' });
  let ws, nextId = 1; const pending = new Map(), problems = []; let bytes = 0, requests = 0, firstView = null, settled = false; const biggest = new Map(), urls = new Map();
  const send = (method, params = {}) => { const id = nextId++; ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); };
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result.value; };
  const shot = async file => { const r = await Promise.race([send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true }), sleep(20000).then(() => null)]); if (r) fs.writeFileSync(file, Buffer.from(r.data, 'base64')); return !!r; };
  try {
    let page; for (let i = 0; i < 150 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {} await sleep(200); }
    ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
    ws.addEventListener('message', e => { const m = JSON.parse(e.data); const p = pending.get(m.id);
      if (p) { pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); return; }
      if (m.method === 'Runtime.exceptionThrown') problems.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 400));
      if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) problems.push(m.params.type + ' ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 400));
      if (m.method === 'Network.responseReceived') urls.set(m.params.requestId, m.params.response.url);
      if (m.method === 'Network.loadingFinished') { const n = m.params.encodedDataLength; if (!settled) { bytes += n; requests++; const u = urls.get(m.params.requestId) || '?'; biggest.set(u, n); } }
    });
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: device.width, height: device.height, deviceScaleFactor: device.deviceScaleFactor, mobile: device.mobile });
    if (device.cpu > 1) await send('Emulation.setCPUThrottlingRate', { rate: device.cpu });
    const t0 = Date.now(); await send('Page.navigate', { url: base });
    await evaluate(`new Promise((res,rej)=>{const t=performance.now();(function w(){const s=window.breakThyRuleShowroom?.getState?.();if(s?.ready)res(true);else if(performance.now()-t>${Number(args['ready-timeout'] || 180) * 1000})rej(Error('never ready'));else setTimeout(w,250);})();})`);
    firstView = Date.now() - t0;
    const bytesAtFirstView = bytes;
    await sleep(10000); settled = true;
    const row = { firstViewMs: firstView, bytesAtFirstView, coldBytesAfter10s: bytes, coldRequests: requests, largest: [...biggest].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([u, n]) => [u.replace(base, '/'), n]), views: {} };
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);
    for (const view of String(args.views || Object.keys(VIEWS).join(',')).split(',')) {
      const v = VIEWS[view];
      await evaluate(v ? `breakThyRuleShowroom.place(${v.join(',')})` : `breakThyRuleShowroom.go('spawn',true)`);
      await sleep(view === 'theatre' || view === 'road' ? 9000 : 3500);
      const m = await evaluate(`(()=>{const P=window.edenPost,S=breakThyRuleShowroom.getState(),p=P.profile();P.bench(5);const b=[P.bench(${frames}),P.bench(${frames}),P.bench(${frames})].sort((x,y)=>x-y);return {ms:b[1],calls:p.calls,ktris:p.ktris,top:p.rows.slice(0,6),pixelRatio:S.quality?.pixelRatio,post:P.inspect().size,mem:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null};})()`);
      row.views[view] = m;
      await sleep(1000);
      m.shot = await shot(path.join(out, `${name}-${view}.jpg`));
      console.log(name, view, `${m.ms} ms`, `${m.calls} calls`, `${m.ktris}k tris`);
    }
    row.problems = [...new Set(problems)].slice(0, 40); if (row.problems.length) console.log(name, 'console problems:\n ' + row.problems.join('\n '));
    results.classes[name] = row;
    console.log(name, 'first view', firstView, 'ms', (bytesAtFirstView / 1048576).toFixed(1), 'MB then', (row.coldBytesAfter10s / 1048576).toFixed(1), 'MB,', requests, 'requests');
  } catch (e) { console.error(name, 'ERROR', e.message.slice(0, 200), '\n ' + [...new Set(problems)].join('\n ')); results.classes[name] = { error: e.message }; process.exitCode = 1; }
  finally { chrome.kill('SIGTERM'); await sleep(1500); fs.rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 }); }
}
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 1));
