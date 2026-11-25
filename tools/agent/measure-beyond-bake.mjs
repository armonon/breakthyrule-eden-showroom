#!/usr/bin/env node
// Fixed-view evidence for the Beyond Eden bake on a real Chrome GPU: the same settings and poses before and after.
//   node tools/agent/measure-beyond-bake.mjs --url http://127.0.0.1:8790/showroom.html --out DIR [--timing 1]
// Writes one still per view and report.json: the bake's state, the page's errors and, per view, how bright the frame is
// (mean and percentiles of luminance) with the bake and with it switched off. Frame times and render cost are only
// taken with --timing 1: they mean nothing while other work shares the GPU.
import fs from 'node:fs';import path from 'node:path';import {openPage,sleep} from './headless-chrome.mjs';
const args=Object.fromEntries(process.argv.slice(2).map((a,i,v)=>a.startsWith('--')?[a.slice(2),v[i+1]]:null).filter(Boolean)),out=args.out||'docs/beyond-bake/before',timing=!!args.timing;fs.mkdirSync(out,{recursive:true});
const page=await openPage({width:1280,height:800});
// x, z, look x, look z. The courtyard views stand on its paths between the models (world-props-layout.js).
const views=[['altar',12,-53,12,-62],['altar-close',14.5,-56.5,12,-62.5],['courtyard-east',22,-63.5,28,-58],['courtyard-west',-5,-64,0,-60],['courtyard-south',17,-67,22,-73],['lamp',11.7,-66,7,-73],['road',11.7,-36,11.7,-60],['doorway',-12,-29,-12,-43],['entry',11.7,-28,-12,-43],['observatory',27,-27,37,-42],['gardens',0,-91,-14,-101]];
// Luminance of a still, measured in the page from the screenshot itself (what a viewer sees, after tone mapping and grade).
const luminance=async file=>page.evaluate(`(async()=>{const b=await createImageBitmap(await (await fetch('data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}')).blob()),c=document.createElement('canvas');c.width=320;c.height=200;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(b,0,0,320,200);const d=x.getImageData(0,0,320,200).data,l=[];for(let i=0;i<d.length;i+=4)l.push((.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255);l.sort((a,b)=>a-b);const q=p=>+l[Math.min(l.length-1,Math.floor(l.length*p))].toFixed(3);return {mean:+(l.reduce((a,b)=>a+b,0)/l.length).toFixed(3),p10:q(.1),p50:q(.5),p90:q(.9),p99:q(.99)};})()`).catch(()=>null);
try{
 await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('eden-graphics','${args.graphics||'medium'}');window._testClock=Date.now;Date.now=()=>Math.floor(_testClock()/340000)*340000+230000;`});await page.goto(args.url||'http://127.0.0.1:8790/showroom.html?perf=1');await page.ready();await sleep(18000);
 const S='breakThyRuleShowroom';
 // Fix internal resolution so both runs draw the same picture.
 await page.evaluate(`(()=>{const r=${S}.renderer(),set=r.setPixelRatio.bind(r);r.setPixelRatio=()=>set(.75);r.setPixelRatio(.75);})()`);
 await page.evaluate(`(async()=>{const S=${S};await S.garden().ready;const start=performance.now();while(!S.prewarm()?.done&&performance.now()-start<45000)await new Promise(r=>setTimeout(r,250));S.place(0,12,0,3,1.6);})()`);await sleep(5000);
 const eden={state:await page.evaluate(`({bake:edenBaked.inspect()})`)};
 await page.shot(path.join(out,'eden.jpg'));eden.luminance=await luminance(path.join(out,'eden.jpg'));
 await page.evaluate(`(async()=>{const S=${S},g=S.garden();while(!g.warmNight())await new Promise(r=>setTimeout(r,50));S.teleport(10,-65);await new Promise(r=>setTimeout(r,2000));while(S.worlds().loading())await new Promise(r=>setTimeout(r,100));S.battle()._debug.god();S.battle()._debug.night();await edenBaked.loadBeyond();g.district.prepare(nightLayout.landmarks.map(s=>s.id));const start=performance.now();while(Object.values(g.district.inspect().models).some(v=>v==='waiting'||v==='loading')){if(performance.now()-start>150000)throw Error('models timed out');await new Promise(r=>setTimeout(r,200));}})()`);
 await sleep(6000);const results={eden,views:{},size:[1280,800],graphics:args.graphics||'medium',bakeFiles:await page.evaluate(`fetch('/assets/beyond-bake/bake.json',{cache:'no-store'}).then(r=>r.json()).then(m=>({format:m.format,scale:m.scale,atlas:m.atlas,grids:m.grids&&Object.fromEntries(Object.entries(m.grids).map(([k,g])=>[k,{dims:g.dims,step:g.step}])),weights:m.weights,dims:m.dims}))`).catch(()=>null)};
 const hold=(x,z,lx,lz,ms)=>page.evaluate(`new Promise(r=>{const t=performance.now();(function f(){${S}.battle()._debug.god();${S}.place(${x},${z},${lx},${lz});performance.now()-t<${ms}?requestAnimationFrame(f):r(1)})()})`);
 for(const [id,x,z,lx,lz] of views){
  await page.evaluate(`${S}.battle()._debug.night();${S}.combat().holster();document.querySelectorAll('.ar-hud,#combat-hud').forEach(e=>e.style.opacity=0)`);await hold(x,z,lx,lz,6000);
  const view=results.views[id]={bake:await page.evaluate('edenBaked.inspect()'),lighting:await page.evaluate('edenLighting.inspect()')};
  await page.shot(path.join(out,id+'.jpg'));view.luminance=await luminance(path.join(out,id+'.jpg'));
  // The same frame on live lighting only, to show what the bake contributes.
  await page.evaluate('edenBaked.set({enabled:false})');await hold(x,z,lx,lz,1200);await page.shot(path.join(out,id+'-live.jpg'));view.liveLuminance=await luminance(path.join(out,id+'-live.jpg'));await page.evaluate('edenBaked.set({enabled:true})');
  if(timing){await hold(x,z,lx,lz,800);Object.assign(view,await page.evaluate(`new Promise(resolve=>{const S=${S},samples=[],t0=performance.now();let last=t0;function tick(t){const d=Math.sin((t-t0)/900)*.3;S.place(${x}+d,${z},${lx}+d,${lz});if(t>t0+500)samples.push(t-last);last=t;if(t-t0<5000)return requestAnimationFrame(tick);samples.sort((a,b)=>a-b);const q=p=>samples[Math.min(samples.length-1,Math.floor(samples.length*p))];let meshes=0,triangles=0,points=0;S.scene().traverseVisible(o=>{if(o.isPointLight&&o.layers.test(edenCamera.layers))points++;if(o.isMesh&&o.castShadow){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position?.count||0)/3*(o.isInstancedMesh?o.count:1);}});const r=S.renderer(),gl=r.getContext(),gpu=gl.getExtension('WEBGL_debug_renderer_info');resolve({frame:{mean:samples.reduce((a,b)=>a+b,0)/samples.length,p50:q(.5),p95:q(.95),max:q(1),samples:samples.length},shadow:{meshes,triangles},gpu:gpu?gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL):'unknown',points,perf:S.perf(),programKeys:r.info.programs.map(p=>p.cacheKey)});}requestAnimationFrame(tick);})`));
   view.gpuFinishedTrials=await page.evaluate('(()=>{edenLighting.bench(10);return [edenLighting.bench(20),edenLighting.bench(20),edenLighting.bench(20)];})()');view.gpuFinishedMs=[...view.gpuFinishedTrials].sort((a,b)=>a-b)[1];}
  console.log(id,JSON.stringify({baked:view.luminance,live:view.liveLuminance,strength:view.bake.beyondStrength}));
 }
 results.problems=[...new Set(page.problems)];fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));console.log('problems',JSON.stringify(results.problems.slice(0,12)));
}finally{await page.close();}
