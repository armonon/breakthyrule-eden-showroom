// Minimal headless Chrome driver over the DevTools Protocol, real GPU via Metal (no Puppeteer download).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function openPage({ width = 1280, height = 800, deviceScaleFactor = 1, mobile = false } = {}) {
  const port = 11000 + Math.floor(Math.random() * 4000), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'eden-cdp-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--no-first-run', '--no-default-browser-check', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore' });
  let page; for (let i = 0; i < 150 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {} await sleep(200); }
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let nextId = 1; const pending = new Map(), problems = [];
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); const p = pending.get(m.id);
    if (p) { pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') problems.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 500));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) problems.push(m.params.type + ' ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 500));
  });
  const send = (method, params = {}) => { const id = nextId++; ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); };
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)).slice(0, 800)); return r.result.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile });
  const shot = async file => { const r = await Promise.race([send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true }), sleep(20000).then(() => null)]); if (r) fs.writeFileSync(file, Buffer.from(r.data, 'base64')); return !!r; };
  const ready = () => evaluate(`new Promise((res,rej)=>{const t=performance.now();(function w(){const s=window.breakThyRuleShowroom?.getState?.();if(s?.ready)res(true);else if(performance.now()-t>180000)rej(Error('never ready'));else setTimeout(w,250);})();})`);
  const close = async () => { chrome.kill('SIGTERM'); await sleep(1500); fs.rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 }); };
  return { send, evaluate, shot, ready, close, problems, goto: url => send('Page.navigate', { url }) };
}
