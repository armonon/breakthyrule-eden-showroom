#!/usr/bin/env node
// Records the short Eden video loops shown inside the cover's BREAK THY RULE letters.
// Steps the 3D world frame by frame on a virtual clock (so motion is smooth however slow the capture), drifts the
// camera a little, then ping-pongs the frames into a seamless loop with ffmpeg.
//   node tools/site/record-eden-loops.mjs [--url http://127.0.0.1:8795] [--only garden,shop]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openPage, sleep } from '../agent/headless-chrome.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]] : null).filter(Boolean));
const BASE = args.url || 'http://127.0.0.1:8795';
const OUT = path.resolve('assets/eden-loops');
const FPS = 24, SECONDS = 4; // ping-pong → an 8 s loop
// [x0, z0] → [x1, z1] camera drift, looking at [lx, ly, lz]
const VIEWS = {
  garden: { from: [0, 16], to: [0.9, 15.3], look: [2, 3, -10] },
  shop: { from: [-1014.6, -2.6], to: [-1013.0, -2.3], look: [-1013.8, 1.3, 2.1] },
  library: { from: [2.2, -0.9], to: [1.3, -0.4], look: [3.6, 1.6, -7.4] },
  broadcast: { from: [-996.6, -51], to: [-995.6, -51.5], look: [-996.1, 1.4, -56.8] },
  eden: { from: [8.4, 8.2], to: [7.2, 8.8], look: [-4, 4, -12] }
};
const only = args.only ? args.only.split(',') : [...Object.keys(VIEWS), 'lab'];
fs.mkdirSync(OUT, { recursive: true });

const CLOCK = `(()=>{ if (window.__fake) return; const real = performance.now.bind(performance), raf = window.requestAnimationFrame.bind(window);
  window.__fake = real(); performance.now = () => window.__fake; const d0 = Date.now() - window.__fake; Date.now = () => d0 + window.__fake;
  window.requestAnimationFrame = cb => raf(() => cb(window.__fake)); return 1; })()`;
const nextFrame = `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`;

function encode(name, dir, w, h) {
  const file = path.join(OUT, name + '.mp4');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, '%04d.jpg'),
    '-filter_complex', `[0]scale=${w}:${h}:flags=lanczos,split[a][b];[b]reverse,trim=start_frame=1[r];[a][r]concat=n=2:v=1,format=yuv420p[v]`,
    '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-movflags', '+faststart', '-an', file]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(dir, '0001.jpg'), '-vf', `scale=${w}:${h}`, '-q:v', '5', path.join(OUT, name + '.jpg')]);
  console.log(name, (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
}

const garden = only.filter(n => VIEWS[n]);
if (garden.length) {
  const p = await openPage({ width: 1280, height: 720 });
  await p.goto(BASE + '/showroom?nocover'); await p.ready();
  await p.evaluate(`(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close()); const s=document.createElement('style'); s.textContent='body>*:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}'; document.head.append(s); return 1})()`);
  for (const name of garden) {
    const v = VIEWS[name], dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-' + name + '-'));
    const at = t => [v.from[0] + (v.to[0] - v.from[0]) * t, v.from[1] + (v.to[1] - v.from[1]) * t];
    const place = t => { const [x, z] = at(t); return `window.breakThyRuleShowroom.place(${x},${z},${v.look[0]},${v.look[2]},${v.look[1]})`; };
    await p.evaluate(place(0)); await sleep(12000); // let the place load (textures, models)
    await p.evaluate(CLOCK);
    const n = FPS * SECONDS;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), e = t * t * (3 - 2 * t); // ease in-out, so the ping-pong turnaround is soft
      await p.evaluate(`window.__fake += ${1000 / FPS}; ${place(e)}; ${nextFrame}`);
      await p.shot(path.join(dir, String(i + 1).padStart(4, '0') + '.jpg'));
    }
    encode(name, dir, 960, 540);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (p.problems.length) console.log('page problems:', p.problems.slice(0, 5));
  await p.close();
}

// The Lab: one random Lab piece turning once (a full turn loops seamlessly), cropped to the hero's garment.
if (only.includes('lab')) {
  const p = await openPage({ width: 900, height: 1100 });
  await p.goto(BASE + '/?nocover&heroloop');
  await p.evaluate(`new Promise((res, rej) => { const t = performance.now(); (function w(){ if (document.querySelector('#hero-viewer canvas.live')) res(1); else if (performance.now() - t > 60000) rej(Error('hero never loaded')); else setTimeout(w, 250); })(); })`);
  await p.evaluate(`(()=>{ const s = document.createElement('style'); s.textContent = '.site-top,.hero-copy,.hero-top,.hero-label,.hero-collage,.rubric-ticker,header{visibility:hidden!important} .hero-stage{transform:none!important}'; document.head.append(s); document.getElementById('hero-stage').scrollIntoView({ block: 'center' }); return 1; })()`);
  await sleep(2500);
  const r = await p.evaluate(`(()=>{ const b = document.getElementById('hero-viewer').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
  await p.evaluate(CLOCK);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-lab-')), spin = .75, n = Math.round((Math.PI * 2 / spin) * FPS);
  for (let i = 0; i < n; i++) {
    await p.evaluate(`window.__fake += ${1000 / FPS}; ${nextFrame}`);
    const shot = await p.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
    fs.writeFileSync(path.join(dir, String(i + 1).padStart(4, '0') + '.jpg'), Buffer.from(shot.data, 'base64'));
  }
  const file = path.join(OUT, 'lab.mp4'), w = 720, h = Math.round(720 * r.h / r.w / 2) * 2;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, '%04d.jpg'), '-vf', `scale=${w}:${h}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-movflags', '+faststart', '-an', file]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(dir, '0001.jpg'), '-vf', `scale=${w}:${h}`, '-q:v', '5', path.join(OUT, 'lab.jpg')]);
  console.log('lab', (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
  fs.rmSync(dir, { recursive: true, force: true });
  await p.close();
}
