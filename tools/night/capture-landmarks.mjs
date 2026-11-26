#!/usr/bin/env node
// Stills of every night-district landmark in Beyond Eden (showroom), for before/after comparisons of the buildings.
//   node tools/night/capture-landmarks.mjs --out DIR [--url http://127.0.0.1:8761] [--quality high|medium|low] [--mobile]
//        [--only temple,hotel] [--views facade,close,corner]
// Each landmark's main facade faces +Z (night-layout.json). Views: facade (whole front), close (the door at 4 m),
// corner (a wall corner and its base, for edges and weathering). Prints page problems at the end.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, sleep } from '../agent/headless-chrome.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : null).filter(Boolean));
const base = (args.url || 'http://127.0.0.1:8761').replace(/\/$/, ''), out = args.out || 'shots', quality = args.quality || 'high';
const mobile = !!args.mobile, only = args.only ? String(args.only).split(',') : null, kinds = String(args.views || 'facade,close,corner').split(',');
fs.mkdirSync(out, { recursive: true });
const layout = JSON.parse(fs.readFileSync(new URL('../../night-layout.json', import.meta.url)));
const page = await openPage(mobile ? { width: 390, height: 844, mobile: true, deviceScaleFactor: 2 } : { width: 1280, height: 800 });
await page.goto(base + '/showroom.html'); await sleep(500);
await page.evaluate(`localStorage.setItem('eden-graphics',${JSON.stringify(quality)});true`);
await page.goto(base + '/showroom.html'); await page.ready();
await page.evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());true`);
// Hold the camera somewhere every frame for ms milliseconds (the game re-seats the player otherwise).
const hold = (x, z, lx, lz, ly, ms) => page.evaluate(`new Promise(res=>{const S=breakThyRuleShowroom,t0=performance.now();(function f(){S.place(${x},${z},${lx},${lz},${ly});if(performance.now()-t0>${ms})res(true);else requestAnimationFrame(f);})();})`);
await page.evaluate(`new Promise((res,rej)=>{const S=breakThyRuleShowroom,t0=performance.now();(function f(){S.place(11.7,-24,12,-62,1.6);const w=S.worlds();if(w.world()==='beyond'&&!w.loading())res(true);else if(performance.now()-t0>180000)rej(Error('never reached beyond'));else requestAnimationFrame(f);})();})`);
await page.evaluate(`(()=>{try{breakThyRuleShowroom.battle()?._debug?.god(true);}catch{}return true;})()`);
await hold(11.7, -30, 12, -62, 1.6, 3000);
const models = () => page.evaluate(`(()=>{const g=breakThyRuleShowroom.garden?.();return g?.district?.inspect?.().models||{};})()`);
for (const s of layout.landmarks) {
  if (only && !only.includes(s.id)) continue;
  const front = s.z + s.d / 2;
  const views = {
    facade: [s.x + s.w * .18, Math.min(-21.5, front + Math.max(9, s.h * 1.25)), s.x, s.z, s.h * .45],   // stay past the door (z -20)
    close: [s.x + .6, front + 4.2, s.x, front - 2, 2.2],
    corner: [s.x + s.w / 2 + 3.2, front + 3.4, s.x + s.w / 2 - 1.5, front - 1.5, 1.4],
  };
  // walk up and wait for the model
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) { await hold(...views.facade, 600); if ((await models())[s.id] === 'model') break; }
  // and for it to finish crystallising out of glyphs
  for (let t1 = Date.now(); Date.now() - t1 < 15000;) { await hold(...views.facade, 500); if (!(await page.evaluate(`window.edenMatrix?.inspect().forming||0`))) break; }
  for (const k of kinds) { await hold(...views[k], 2600); await page.shot(path.join(out, `${s.id}-${k}.jpg`)); }
  console.log(s.id, (await models())[s.id]);
}
const problems = [...new Set(page.problems)];
console.log('problems:', problems.length ? '\n' + problems.slice(0, 20).join('\n') : 'none');
await page.close();
