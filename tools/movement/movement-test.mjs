// Scripted movement runs in headless Chrome, stepped at fixed time so a busy machine cannot change the result.
//   node tools/movement/movement-test.mjs <baseUrl> trace <out.json>   record what each scenario does
//   node tools/movement/movement-test.mjs <baseUrl> check              assert how movement should feel
import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const [base, mode = 'check', outFile] = process.argv.slice(2);
const port = 9700 + Math.floor(Math.random() * 200), profile = mkdtempSync(join(tmpdir(), 'eden-move-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', 'about:blank'], {stdio: 'ignore'});
const errors = [];
for (const stop of ['uncaughtException', 'unhandledRejection']) process.on(stop, error => { console.log('FAILED', error?.stack || error, errors.slice(0, 6)); chrome.kill(); process.exit(1); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let version; for (let i = 0; i < 100 && !version; i++) { await sleep(200); try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch {} }
const ws = new WebSocket(version.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 200)); };
const send = (method, params = {}, sessionId) => new Promise((r, j) => { const i = ++id, t = setTimeout(() => j(Error('timeout ' + method)), 120000); pending.set(i, m => { clearTimeout(t); r(m); }); ws.send(JSON.stringify({id: i, method, params, sessionId})); });
const {result: {targetId}} = await send('Target.createTarget', {url: 'about:blank'});
const {result: {sessionId}} = await send('Target.attachToTarget', {targetId, flatten: true});
const cmd = (m, q) => send(m, q, sessionId);
const evaluate = async expr => { const r = await cmd('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true, replMode: true}); if (r.result?.exceptionDetails) throw Error(r.result.exceptionDetails.exception?.description || 'eval failed'); return r.result?.result?.value; };
await cmd('Page.enable'); await cmd('Runtime.enable');
await cmd('Emulation.setDeviceMetricsOverride', {width: 800, height: 500, deviceScaleFactor: 1, mobile: false});
await cmd('Page.navigate', {url: base});
for (let i = 0; i < 240; i++) { await sleep(500); if (await evaluate(`!!window.breakThyRuleShowroom?.getState?.()?.ready`).catch(() => false)) break; }
// The helpers run one whole scenario in a single task, so the page's own frames cannot step movement in between.
if (!(await evaluate(`!!window.breakThyRuleShowroom?.getState?.()?.ready`))) { console.log('GAME DID NOT START', errors.slice(0, 5)); chrome.kill(); process.exit(1); }
await evaluate(`window.S=breakThyRuleShowroom;S.teleport(0,-20,Math.PI);0`);
for (let i = 0; i < 120 && !(await evaluate(`S.climbs().length>0`)); i++) await sleep(500);
await evaluate(`(()=>{const c=S.climbs()[0];S.teleport(c.x+6,c.z,0);})();0`);
for (let i = 0; i < 60 && !(await evaluate(`!!S.parkour?.()`)); i++) await sleep(250);
await evaluate(`
 S.battle().enter=()=>{};
 window.seed=n=>{let s=n>>>0;Math.random=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};};
 window.pressC=down=>document.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:'c',bubbles:true}));
 window.feet=()=>S.getState().position[1]-1.75;
 window.settle=()=>{S.parkour().reset();pressC(false);for(let i=0;i<4;i++)S.sim(30,1/60,[]);};
 // A crate with open ground on one side: where to stand and which way to run at it.
 window.crateSpot=(c,back=4)=>{const P=S.parkour();for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){let ok=true;for(let d=1.3;d<=back+1;d+=.4)if(P.solid(c.x+dx*d,c.z+dz*d,0,1.7,.3))ok=false;if(ok&&Math.abs(P.floorAt(c.x+dx*(back),c.z+dz*(back),1))<.6)return {x:c.x+dx*back,z:c.z+dz*back,ax:c.x,az:c.z};}return null;};
 window.spot=()=>{const list=S.climbs().filter(c=>c.top<3);for(const c of list){const s=crateSpot(c);if(s)return {...s,top:c.top};}throw Error('no crate spot');};
 window.tall=()=>{for(const c of S.climbs().filter(c=>c.top>6)){const s=crateSpot(c);if(s)return {...s,top:c.top};}return null;};
 window.at=s=>{settle();S.sprintTo(1e-6);S.place(s.x,s.z,s.ax,s.az);};
 window.record=(steps)=>{const out=[];for(const step of steps){if(step.c!==undefined){pressC(step.c);continue;}const n=step.n||30,hold=step.hold||[];for(let i=0;i<n;i+=6){const r=S.sim(Math.min(6,n-i),1/60,hold,step.jump&&i===0);out.push([...r.pos,r.pk?.state||'-']);}}return out;};
 0`);
const scenarios = {
  run: `(()=>{const s=spot();at(s);return record([{n:40,hold:['w']}]);})()`,
  sprint: `(()=>{const s=spot();at(s);return record([{n:30,hold:['w','shift']}]);})()`,
  sprintJump: `(()=>{const s=spot();at(s);return record([{n:12,hold:['w','shift']},{n:50,hold:['w','shift'],jump:true}]);})()`,
  jumpInPlace: `(()=>{const s=spot();at(s);return record([{n:50,jump:true}]);})()`,
  climbCrate: `(()=>{const s=spot();at(s);return record([{n:12,hold:['w','shift']},{n:90,hold:['w','shift'],jump:true},{n:30,hold:[]}]);})()`,
  slide: `(()=>{const s=spot();at({...s,x:s.x,z:s.z});return record([{n:12,hold:['w','shift']},{c:true},{n:6,hold:['w','shift']},{c:false},{n:60,hold:['w','shift']}]);})()`,
  dive: `(()=>{const s=spot();at(s);return record([{n:12,hold:['w','shift']},{c:true},{n:60,hold:['w','shift']},{c:false},{n:30}]);})()`,
  walkOffCrate: `(()=>{const s=spot();at(s);const up=record([{n:12,hold:['w','shift']},{n:90,hold:['w','shift'],jump:true},{n:30}]);S.face(Math.atan2(s.x-s.ax,-(s.z-s.az)));return up.concat(record([{n:90,hold:['w']}]));})()`,
};
const results = {}; let failed = 0;
if (mode === 'trace') {
  for (const [name, code] of Object.entries(scenarios)) results[name] = await evaluate(`seed(7);${code}`);
  writeFileSync(outFile, JSON.stringify(results));
  console.log(Object.entries(results).map(([k, v]) => `${k}: ${v.length} samples, last ${JSON.stringify(v[v.length - 1])}`).join('\n'));
}
if (errors.length) { console.log('PAGE ERRORS', errors.slice(0, 5)); failed++; }
if (mode === 'check') { const {checks} = await import('./movement-checks.mjs'); failed += await checks(evaluate); }
chrome.kill(); process.exit(failed ? 1 : 0);
