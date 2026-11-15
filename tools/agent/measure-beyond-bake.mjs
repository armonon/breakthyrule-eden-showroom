#!/usr/bin/env node
// Fixed-view evidence on a real Chrome GPU. Same settings, poses and sampling before/after.
import fs from 'node:fs';import path from 'node:path';import {openPage,sleep} from './headless-chrome.mjs';
const args=Object.fromEntries(process.argv.slice(2).map((a,i,v)=>a.startsWith('--')?[a.slice(2),v[i+1]]:null).filter(Boolean)),out=args.out||'docs/beyond-bake/before';fs.mkdirSync(out,{recursive:true});
const page=await openPage({width:1280,height:800});
const views=[['entry',11.7,-28,-12,-43,5],['commons',11.7,-62,-15,-74,5],['observatory',27,-27,37,-42,6],['hotel',28,-61,39,-77,7],['gardens',0,-91,-14,-101,4]];
try{
 await page.send('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('eden-graphics','medium');window._testClock=Date.now;Date.now=()=>Math.floor(_testClock()/340000)*340000+230000;"});await page.goto(args.url||'http://127.0.0.1:8790/showroom.html?perf=1');await page.ready();await sleep(18000);
 const S='breakThyRuleShowroom';
 const eden=await page.evaluate(`(()=>{const S=${S};return {perf:S.perf(),state:S.getState(),bake:edenBaked.inspect()};})()`);
 await page.shot(path.join(out,'eden.jpg'));
 await page.evaluate(`(async()=>{const S=${S},g=S.garden();while(!g.warmNight())await new Promise(r=>setTimeout(r,50));S.teleport(10,-65);await new Promise(r=>setTimeout(r,2000));while(S.worlds().loading())await new Promise(r=>setTimeout(r,100));S.battle()._debug.god();S.battle()._debug.night();g.district.prepare(nightLayout.landmarks.map(s=>s.id));const start=performance.now();while(Object.values(g.district.inspect().models).some(v=>v==='waiting'||v==='loading')){if(performance.now()-start>150000)throw Error('models timed out');await new Promise(r=>setTimeout(r,200));}})()`);
 await sleep(6000);const results={eden,views:{},size:[1280,800],graphics:'medium'};
 for(const [id,x,z,lx,lz,ly] of views){
  await page.evaluate(`${S}.battle()._debug.night();${S}.combat().holster();${S}.place(${x},${z},${lx},${lz},${ly})`);await sleep(1800);
  results.views[id]=await page.evaluate(`new Promise(resolve=>{const S=${S},samples=[],t0=performance.now();let last=t0;function tick(t){const d=Math.sin((t-t0)/900)*.3;S.place(${x}+d,${z},${lx}+d,${lz},${ly});if(t>t0+500)samples.push(t-last);last=t;if(t-t0<5000)return requestAnimationFrame(tick);samples.sort((a,b)=>a-b);const q=p=>samples[Math.min(samples.length-1,Math.floor(samples.length*p))];let meshes=0,triangles=0,points=0;S.scene().traverseVisible(o=>{if(o.isPointLight)points++;if(o.isMesh&&o.castShadow){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position?.count||0)/3*(o.isInstancedMesh?o.count:1);}});const r=S.renderer(),gl=r.getContext(),gpu=gl.getExtension('WEBGL_debug_renderer_info');resolve({frame:{mean:samples.reduce((a,b)=>a+b,0)/samples.length,p50:q(.5),p95:q(.95),max:q(1),samples:samples.length},shadow:{meshes,triangles},gpu:gpu?gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL):'unknown',points,perf:S.perf(),programKeys:r.info.programs.map(p=>p.cacheKey),bake:edenBaked.inspect(),lighting:edenLighting.inspect()});}requestAnimationFrame(tick);})`);
  await page.shot(path.join(out,id+'.jpg'));results.views[id].gpuFinishedMs=await page.evaluate('edenLighting.bench(20)');console.log(id,JSON.stringify({frame:results.views[id].frame,shadow:results.views[id].shadow}));
 }
 results.problems=page.problems;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));
}finally{await page.close();}
