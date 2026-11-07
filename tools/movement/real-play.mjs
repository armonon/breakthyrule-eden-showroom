// Real keys through the real game loop, in real time: node tools/movement/real-play.mjs <baseUrl> <screenshotDir>
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
const look = `(()=>{const s=S.getState();return {mode:s.feel.mode,state:s.parkour?.state||null,height:+s.movement.height.toFixed(2),y:+s.position[1].toFixed(2),stats:s.parkour?.stats,fps:null}})()`;
await evaluate(`window.S=breakThyRuleShowroom;S.teleport(0,-20,Math.PI);0`);
for (let i = 0; i < 120 && !(await evaluate(`S.climbs().length>0`)); i++) await sleep(500);
await evaluate(`(()=>{const c=S.climbs().find(c=>c.top<3&&c.id==='temple')||S.climbs()[0];window.C=c;S.teleport(c.x-7,c.z,Math.PI/2);})();0`);
await sleep(3000); console.log('start', JSON.stringify(await evaluate(look)));
// Run at a crate, jump, climb.
await down('w'); await down('shift'); await sleep(450); await tap('space');
let seen = new Set(), peak = 0; for (let i = 0; i < 30; i++) { await sleep(70); const r = await evaluate(look); seen.add(r.mode); peak = Math.max(peak, r.y); if (r.mode === 'climb' && !seen.has('shot')) { seen.add('shot'); await shot('climb'); } }
await up('w'); await up('shift'); console.log('run, jump, climb', JSON.stringify({modes: [...seen], peakEye: peak}));
await sleep(800); console.log('on top', JSON.stringify(await evaluate(look))); await shot('on-top');
// Jump pressed just before landing, in real time, on open ground.
await evaluate(`S.teleport(C.x-7,C.z,Math.PI/2);0`); await sleep(600); await tap('space'); await sleep(620); await tap('space'); const heights = []; for (let i = 0; i < 10; i++) { await sleep(60); heights.push((await evaluate(look)).height); }
console.log('second jump heights', JSON.stringify(heights));
// Slide and dive for real.
await evaluate(`S.teleport(C.x-20,C.z,Math.PI/2);0`); await sleep(600); await down('w'); await down('shift'); await sleep(500); await down('c'); seen = new Set(); for (let i = 0; i < 16; i++) { await sleep(70); seen.add((await evaluate(look)).mode); } await up('c'); await up('w'); await up('shift');
console.log('slide', JSON.stringify([...seen])); await shot('slide');
// Hands on a ledge: the gun goes away, the body shows and each hand reaches its own side; afterwards the gun returns.
await evaluate(`(()=>{const c=S.climbs().find(c=>c.top>=5&&c.id==='temple');window.C=c;S.teleport(c.x-7,c.z,Math.PI/2);})();0`); await sleep(900);
const facing = `(()=>{const s=S.getState(),p=s.position,dx=s.aim[0]-p[0],dz=s.aim[2]-p[2],wx=C.x-p[0],wz=C.z-p[2];return Math.atan2(wx*dz-wz*dx,wx*dx+wz*dz);})()`;
for (let i = 0; i < 12; i++) { const e = await evaluate(facing); if (Math.abs(e) < .03) break; await evaluate(`S.combat().touchLook(${-e / .0042},0);0`); await sleep(160); }
await evaluate(`(()=>{S.dropAt(C.x-1.45,C.z,C.top-1.9,C.x,C.z);S.sprintTo(3);})();0`);
for (let i = 0; i < 40 && (await evaluate(`S.parkour().inspect().state`)) !== 'hang'; i++) await sleep(60);
await sleep(700);
const grip = await evaluate(`(()=>{const me=[...GardenCharacterMotion.bodies].find(b=>b.root.name==='Player body'),T=THREE,h=S.parkour().hands();me.root.updateMatrixWorld(true);const d=n=>Math.min(...h.map(p=>me.byName[n].getWorldPosition(new T.Vector3()).distanceTo(p)));return {state:S.parkour().inspect().state,gun:S.getState().feel.weaponShown,bodyShown:me.root.visible,left:+d('wrist.L').toFixed(3),right:+d('wrist.R').toFixed(3)};})()`);
console.log('hanging', JSON.stringify(grip), grip.state === 'hang' && !grip.gun && grip.bodyShown && grip.left < .12 && grip.right < .12 ? 'PASS' : 'FAIL'); await shot('hang');
await evaluate(`S.third(true);0`); await sleep(1100); await shot('hang-third'); await evaluate(`S.third(false);0`); await sleep(1100);
await down('w'); await sleep(60); await up('w'); await sleep(170); await shot('climb-hands'); await sleep(1500);
const back = await evaluate(`({state:S.parkour().inspect().state,gun:S.getState().feel.weaponShown})`); console.log('after climbing', JSON.stringify(back), !back.state && back.gun ? 'PASS' : 'FAIL');
await sleep(1000); console.log('fps', await evaluate(`await new Promise(done=>{let n=0;const s=performance.now();const t=()=>{n++;if(performance.now()-s<2000)requestAnimationFrame(t);else done(+(n/((performance.now()-s)/1000)).toFixed(1));};requestAnimationFrame(t);})`));
console.log('battle', JSON.stringify(await evaluate(`(()=>{const b=S.battle().inspect();return {active:b.active,alive:b.alive}})()`)));
console.log('errors', JSON.stringify(errors.filter(e => !/Pointer Lock/.test(e)).slice(0, 6)));
chrome.kill(); process.exit(0);
