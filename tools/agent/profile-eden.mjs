// Reproducible Eden workload on a real Metal-backed Chromium renderer.
// node tools/agent/profile-eden.mjs URL OUTPUT.json [low|medium|high] [mobile]
import fs from 'node:fs';
import path from 'node:path';
import {openPage,sleep} from './headless-chrome.mjs';
const [url='http://127.0.0.1:8794/showroom.html',out='/private/tmp/eden-profile.json',preset='medium',device='desktop']=process.argv.slice(2);
const mobile=device==='mobile',p=await openPage({width:mobile?390:1280,height:mobile?844:800,deviceScaleFactor:1,mobile});
const result={url,preset,device,phases:[]};
try{
 await p.send('Page.addScriptToEvaluateOnNewDocument',{source:`performance.setResourceTimingBufferSize(3000);localStorage.setItem('eden-graphics',${JSON.stringify(preset)});window.__long=[];new PerformanceObserver(list=>{for(const e of list.getEntries())__long.push({start:e.startTime,ms:e.duration});}).observe({type:'longtask',buffered:true});`});
 await p.goto(url);await p.ready();
 result.readyMs=await p.evaluate('performance.now()');
 await p.evaluate(`(()=>{const r=breakThyRuleShowroom.renderer(),render=r.render.bind(r);window.__measure={frames:[],renders:0,calls:0,tris:0,submit:0};r.render=(...args)=>{const t=performance.now(),c=r.info.autoReset?0:r.info.render.calls,tri=r.info.autoReset?0:r.info.render.triangles;render(...args);const m=__measure;m.submit+=performance.now()-t;m.renders++;m.calls+=r.info.render.calls-c;m.tris+=r.info.render.triangles-tri;};let last=0;function frame(t){const m=__measure;if(last)m.frames.push({ms:t-last,renders:m.renders,calls:m.calls,tris:m.tris,submit:m.submit});last=t;m.renders=m.calls=m.tris=m.submit=0;requestAnimationFrame(frame);}requestAnimationFrame(frame);})()`);
 await sleep(15000);
 const phases=[['garden',null],['library',[6.8,0,7,-6]],['museum',[-1011,-1,-1018,-1]],['return',[0,10,0,0]]];
 for(const [name,view] of phases){
  if(view)await p.evaluate(`breakThyRuleShowroom.place(${view.join(',')})`);
  await sleep(2500);await p.evaluate('__measure.frames=[]');
  await p.send('Profiler.enable');await p.send('Profiler.start');await sleep(6500);const {profile}=await p.send('Profiler.stop');
  const phase=await p.evaluate(`(()=>{const m=__measure.frames,s=breakThyRuleShowroom.getState(),r=breakThyRuleShowroom.renderer(),sort=k=>m.map(f=>f[k]).sort((a,b)=>a-b),q=(a,p)=>a[Math.min(a.length-1,Math.floor(a.length*p))]||0,ms=sort('ms');return {samples:m.length,medianMs:q(ms,.5),p95Ms:q(ms,.95),p99Ms:q(ms,.99),over50:m.filter(f=>f.ms>50).length,drawCalls:q(sort('calls'),.5),triangles:q(sort('tris'),.5),submitMs:q(sort('submit'),.5),quality:s.quality,memory:r.info.memory,prewarm:breakThyRuleShowroom.prewarm(),world:breakThyRuleShowroom.worlds().inspect(),position:s.position}})()`);
  const counts=new Map(),nodes=new Map(profile.nodes.map(n=>[n.id,n]));
  for(const id of profile.samples||[])counts.set(id,(counts.get(id)||0)+1);
  phase.cpu=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,22).map(([id,count])=>{const f=nodes.get(id).callFrame;return {fn:f.functionName,file:f.url.split('/').pop(),line:f.lineNumber+1,samples:count};});
  result.phases.push({name,...phase});console.log(name,JSON.stringify({median:phase.medianMs,p95:phase.p95Ms,calls:phase.drawCalls,tris:phase.triangles,cpu:phase.cpu.slice(0,5)}));
  if(name==='garden'||name==='museum')await p.shot(out.replace(/\.json$/,`-${name}.jpg`));
 }
 result.resources=await p.evaluate(`(()=>{const r=performance.getEntriesByType('resource');return {requests:r.length,decodedBytes:r.reduce((s,e)=>s+e.decodedBodySize,0),largest:r.sort((a,b)=>b.decodedBodySize-a.decodedBodySize).slice(0,15).map(e=>({name:e.name.split('/').pop(),bytes:e.decodedBodySize})),longTasks:__long}})()`);
 result.errors=[...new Set(p.problems.filter(x=>x.startsWith('EXC')))];
}finally{fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));await p.close();}
