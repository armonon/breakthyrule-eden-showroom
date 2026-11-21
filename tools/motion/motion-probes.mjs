// First-person camera probe in the real game: node tools/motion/motion-probes.mjs <pageUrl> <outDir>
// Walks in the garden with natural motion off and on in the same page and compares the camera's bob with the body's.
// (Feet, landings and blending are covered without a browser by natural-motion-test.mjs.)
import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const [base, out] = process.argv.slice(2); mkdirSync(out, {recursive: true});
const port = 9900 + Math.floor(Math.random() * 90), profile = mkdtempSync(join(tmpdir(), 'eden-move-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', 'about:blank'], {stdio: 'ignore'});
const errors = [];
for (const stop of ['uncaughtException', 'unhandledRejection']) process.on(stop, error => { console.log('FAILED', error?.stack || error, errors.slice(0, 6)); chrome.kill(); process.exit(1); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let version; for (let i = 0; i < 100 && !version; i++) { await sleep(200); try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch {} }
const ws = new WebSocket(version.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
const send = (method, params = {}, sessionId) => new Promise((r, j) => { const i = ++id, t = setTimeout(() => j(Error('timeout ' + method)), 90000); pending.set(i, m => { clearTimeout(t); r(m); }); ws.send(JSON.stringify({id: i, method, params, sessionId})); });
const {result: {targetId}} = await send('Target.createTarget', {url: 'about:blank'});
const {result: {sessionId}} = await send('Target.attachToTarget', {targetId, flatten: true});
const cmd = (m, q) => send(m, q, sessionId);
const evaluate = async expr => { const r = await cmd('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true, replMode: true}); if (r.result?.exceptionDetails) throw Error(r.result.exceptionDetails.exception?.description || 'eval failed'); return r.result?.result?.value; };
await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Emulation.setFocusEmulationEnabled', {enabled: true});
await cmd('Emulation.setDeviceMetricsOverride', {width: 1280, height: 720, deviceScaleFactor: 1, mobile: false});
await cmd('Page.navigate', {url: base});
for (let i = 0; i < 240; i++) { await sleep(500); if (await evaluate(`!!window.breakThyRuleShowroom?.getState?.()?.ready`).catch(() => false)) break; }
const shot = async n => { try { const r = await cmd('Page.captureScreenshot', {format: 'png'}); writeFileSync(join(out, n + '.png'), Buffer.from(r.result.data, 'base64')); } catch {} };
const K = {w: ['w', 'KeyW', 87], s: ['s', 'KeyS', 83], shift: ['Shift', 'ShiftLeft', 16], c: ['c', 'KeyC', 67], space: [' ', 'Space', 32]};
const key = (type, k) => cmd('Input.dispatchKeyEvent', {type, key: K[k][0], code: K[k][1], windowsVirtualKeyCode: K[k][2], nativeVirtualKeyCode: K[k][2]});
const down = k => key('rawKeyDown', k), up = k => key('keyUp', k), tap = async k => { await down(k); await sleep(40); await up(k); };

await evaluate(`window.S=breakThyRuleShowroom;window.ME=()=>[...GardenCharacterMotion.bodies].find(b=>b.root.name==='Player body');window.NAT=on=>Object.keys(GardenCharacterMotion.natural).forEach(k=>GardenCharacterMotion.natural[k]=on);0`);
const result = {};
// First-person camera bob: walk on flat ground in the garden; compare the camera's vertical motion with the body's.
await evaluate(`S.teleport(0,6,Math.PI);S.third(false);0`); await sleep(1500);
for (const on of [false, true]) {
  await evaluate(`NAT(${on});0`); await sleep(300);
  await evaluate(`window.__cam=[];window.__run=true;(()=>{const tick=()=>{if(!__run)return;const me=ME();__cam.push([camera_y(),me?.motion?.bob?.()??0]);requestAnimationFrame(tick);};window.camera_y=()=>S.getState().position[1];tick();})();0`);
  await down('w'); await sleep(3200); await up('w'); await sleep(200);
  const r = await evaluate(`(()=>{__run=false;const ys=__cam.slice(4).map(x=>x[0]),bs=__cam.slice(4).map(x=>x[1]);const m=a=>a.reduce((s,x)=>s+x,0)/a.length;const my=m(ys),mb=m(bs);let c=0,vy=0,vb=0;ys.forEach((y,i)=>{c+=(y-my)*(bs[i]-mb);vy+=(y-my)**2;vb+=(bs[i]-mb)**2;});return {samples:ys.length,cameraBobRange:+(Math.max(...ys)-Math.min(...ys)).toFixed(3),bodyBobRange:+(Math.max(...bs)-Math.min(...bs)).toFixed(3),correlation:+(c/Math.sqrt(vy*vb||1)).toFixed(2)};})()`);
  result['camera ' + (on ? 'on' : 'off')] = r; console.log('camera ', on ? 'on ' : 'off', JSON.stringify(r));
  await evaluate(`S.teleport(0,6,Math.PI);0`); await sleep(800);
}
console.log('errors', JSON.stringify(errors.filter(e => !/Pointer Lock/.test(e)).slice(0, 6)));
writeFileSync(join(out, 'probes.json'), JSON.stringify(result, null, 1));
chrome.kill(); process.exit(0);
