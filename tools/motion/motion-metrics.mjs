// How natural the motion looks, measured and filmed: node tools/motion/motion-metrics.mjs <pageUrl> <outDir> [label]
// Real keys through the real game loop, in third person in the garden. Run once with ?natural=0 and once without.
import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const [base, out, label = 'run'] = process.argv.slice(2); mkdirSync(out, {recursive: true});
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

// Per-frame recorder in the page: feet against the ground, bone turn per frame, the camera's height.
await evaluate(`(()=>{window.S=breakThyRuleShowroom;const T=THREE;window.REC={on:false,frames:[]};const v=new T.Vector3(),q=new T.Quaternion();let last=null;
 const film=new T.PerspectiveCamera(38,16/9,.05,200),R=S.renderer?.(),SC=S.scene?.();
 const tick=()=>{requestAnimationFrame(tick);if(!REC.on)return;const me=[...GardenCharacterMotion.bodies].find(b=>b.root.name==='Player body');if(!me||!me.root.visible)return;me.root.updateMatrixWorld(true);
  const f={t:performance.now()/1000,speed:Math.hypot(...[0,2].map(i=>S.getState().movement.velocity[i])),air:S.getState().movement.airborne,feet:[],turn:0,mode:S.getState().feel?.mode||''};
  for(const n of ['foot.L','foot.R']){const b=me.byName[n];b.getWorldPosition(v);const g=GardenCharacterMotion.ground?.(v.x,v.z,v.y+.6);f.feet.push([v.x,v.y,v.z,Number.isFinite(g)?g:me.root.position.y]);}
  const qs=['spine01','neck01','upperarm01.L','upperarm01.R','lowerarm01.L','lowerarm01.R'].map(n=>me.byName[n].getWorldQuaternion(new T.Quaternion()));
  if(last){let m=0;qs.forEach((x,i)=>{m=Math.max(m,x.angleTo(last[i]));});f.turn=m;}last=qs;
  f.camY=S.getState().position[1];f.rootY=me.root.position.y;f.rx=me.root.position.x;f.rz=me.root.position.z;REC.frames.push(f);
  // A side-on camera framing the whole body, drawn over the game's frame for the video only.
  if(REC.film&&R&&SC){const y=REC.filmYaw??me.root.rotation.y,c=me.root.position;film.aspect=R.domElement.width/R.domElement.height;film.updateProjectionMatrix();const side=REC.filmSide||1;film.position.set(c.x+side*Math.cos(y)*3.4,c.y+1.05,c.z-side*Math.sin(y)*3.4);film.lookAt(c.x,c.y+.75,c.z);const auto=R.autoClear;R.setRenderTarget(null);R.render(SC,film);R.autoClear=auto;}};tick();})();0`);
const K2 = {...K, a: ['a', 'KeyA', 65], d: ['d', 'KeyD', 68]};
const press = (k, type) => cmd('Input.dispatchKeyEvent', {type, key: K2[k][0], code: K2[k][1], windowsVirtualKeyCode: K2[k][2], nativeVirtualKeyCode: K2[k][2]});
let frames = [], recording = false, videoIndex = 0;
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Page.screencastFrame' && m.sessionId === sessionId) { if (recording) frames.push(m.params.data); cmd('Page.screencastFrameAck', {sessionId: m.params.sessionId}).catch(() => {}); } });
async function scenario(name, setup, act, side = 1) {
  await evaluate(setup); await sleep(1200);
  await evaluate(`REC.frames=[];REC.filmYaw=null;REC.film=true;REC.filmSide=${side};REC.on=true;0`); await sleep(50); await evaluate(`(()=>{const me=[...GardenCharacterMotion.bodies].find(b=>b.root.name==='Player body');REC.filmYaw=me?me.root.rotation.y:0;})();0`); recording = true;
  await act();
  recording = false; const data = await evaluate(`(REC.on=false,REC.frames)`);
  const dir = join(out, label + '-' + name); mkdirSync(dir, {recursive: true}); frames.forEach((f, i) => writeFileSync(join(dir, String(i).padStart(4, '0') + '.jpg'), Buffer.from(f, 'base64'))); frames = [];
  return summarise(data);
}
function summarise(F) {
  // Contact: a foot within 4 cm of its lowest height over the run, measured against the ground under it.
  const rest = [0, 1].map(i => Math.min(...F.map(f => f.feet[i][1] - f.feet[i][3])));
  let slide = 0, slideN = 0, err = 0, errN = 0, pops = 0, worst = 0;
  for (let k = 1; k < F.length; k++) { const a = F[k - 1], b = F[k], dt = Math.max(1e-3, b.t - a.t); if (b.air || a.air) continue;
    for (let i = 0; i < 2; i++) { const h = b.feet[i][1] - b.feet[i][3]; if (h < rest[i] + .04 && a.feet[i][1] - a.feet[i][3] < rest[i] + .04) { slide += Math.hypot(b.feet[i][0] - a.feet[i][0], b.feet[i][2] - a.feet[i][2]) / dt; slideN++; err += Math.abs(h - Math.min(...rest)); errN++; } } }
  for (let k = 1; k < F.length; k++) { const dt = Math.max(1e-3, F[k].t - F[k - 1].t), deg = F[k].turn * 180 / Math.PI / (dt * 60); worst = Math.max(worst, deg); if (deg > 12) pops++; }
  let travel = 0; for (let k = 1; k < F.length; k++) travel += Math.hypot(F[k].rx - F[k - 1].rx, F[k].rz - F[k - 1].rz); const span = Math.max(1e-3, F.at(-1).t - F[0].t), rootSpeed = travel / span, footSpeed = slide / Math.max(1, slideN);
  return {frames: F.length, fps: +(F.length / span).toFixed(1), footSlidePerBodySpeed: rootSpeed > .2 ? +(footSpeed / rootSpeed).toFixed(3) : null, footSlide: +footSpeed.toFixed(3), groundError: +(err / Math.max(1, errN)).toFixed(3), popFrames: pops, worstTurnDegPerFrame: +worst.toFixed(1)};
}
await evaluate(`S.teleport(0,-20,Math.PI);0`); await sleep(1500);
await evaluate(`S.third(true);0`); await sleep(800);
await cmd('Page.startScreencast', {format: 'jpeg', quality: 70, maxWidth: 960, maxHeight: 540, everyNthFrame: 1});
const results = {};
for (const variant of ['off', 'on']) {
await evaluate(`Object.keys(GardenCharacterMotion.natural).forEach(k=>GardenCharacterMotion.natural[k]=${variant === 'on'});0`);
const R = results[variant] = {};
const spot = `(()=>{const a=window.showroomAmphitheaterPosition;return a?[a.x,a.z]:[0,8];})()`;
const [ax, az] = await evaluate(spot);
R.walk = await scenario(variant + '-walk', `S.teleport(${ax + 13},${az},-Math.PI/2);S.third(true);0`, async () => { await press('w', 'rawKeyDown'); await sleep(2600); await press('w', 'keyUp'); await sleep(700); });
R.sprintStop = await scenario(variant + '-sprint-stop', `S.teleport(${ax + 15},${az + 3},-Math.PI/2);S.third(true);0`, async () => { await press('w', 'rawKeyDown'); await press('shift', 'rawKeyDown'); await sleep(2000); await press('shift', 'keyUp'); await press('w', 'keyUp'); await sleep(1200); });
R.turnInPlace = await scenario(variant + '-turn', `S.teleport(${ax + 13},${az - 3},0);S.third(true);0`, async () => { for (let i = 0; i < 40; i++) { await evaluate(`S.face(${i * .06});0`); await sleep(50); } await sleep(800); });
R.steps = await scenario(variant + '-steps', `S.teleport(${ax},${az + 9},Math.PI);S.third(true);0`, async () => { await press('w', 'rawKeyDown'); await sleep(3000); await press('w', 'keyUp'); await sleep(600); }, -1);
R.jump = await scenario(variant + '-jump', `S.teleport(${ax + 13},${az + 6},-Math.PI/2);S.third(true);0`, async () => { await press('w', 'rawKeyDown'); await sleep(500); await tap('space'); await sleep(1100); await press('w', 'keyUp'); await sleep(700); });
}
await cmd('Page.stopScreencast');
for (const k of Object.keys(results.off)) { console.log(k.padEnd(12), 'off', JSON.stringify(results.off[k])); console.log(''.padEnd(12), 'on ', JSON.stringify(results.on[k])); }
writeFileSync(join(out, label + '.json'), JSON.stringify(results, null, 1));
console.log('errors', JSON.stringify(errors.filter(e => !/Pointer Lock/.test(e)).slice(0, 6)));
chrome.kill(); process.exit(0);
