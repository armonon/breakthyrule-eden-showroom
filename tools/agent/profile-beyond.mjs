// Reproducible Beyond Eden match workload on a real Metal-backed Chromium renderer.
// node tools/agent/profile-beyond.mjs URL OUTPUT.json [low|medium|high] [desktop|mobile]
// EDEN_PROFILE_CPU=4 throttles the CPU (diagnostic; mobile numbers are not physical-phone FPS).
// Phases: arrive at the door, the altar courtyard, down the road, a gunfight (rifle, bots fighting), grenade blasts.
// Each phase: frame times, draw calls, triangles, renders per frame, time inside renderer.render, and the hottest
// functions by self time from a CPU profile. Also: time to a live match, bytes loaded, long tasks.
import fs from 'node:fs';
import path from 'node:path';
import {openPage,sleep} from './headless-chrome.mjs';
const [url='http://127.0.0.1:8798/showroom.html',out='/private/tmp/beyond-profile.json',preset='medium',device='desktop']=process.argv.slice(2);
fs.mkdirSync(path.dirname(out),{recursive:true});
const mobile=device.startsWith('mobile'),cpuRate=Number(process.env.EDEN_PROFILE_CPU)||1;
const viewport={width:mobile?844:1280,height:mobile?390:800,deviceScaleFactor:mobile?(Number(process.env.EDEN_PROFILE_DPR)||2):1,mobile};
const p=await openPage(viewport),S='breakThyRuleShowroom',ev=e=>p.evaluate(e);
const wait=async(f,ms=180000)=>{const t=Date.now();while(Date.now()-t<ms){if(await ev(f))return;await sleep(400);}throw Error('timeout '+f);};
const result={url,preset,device,viewport,cpuRate,phases:[]};
try{
 if(cpuRate>1)await p.send('Emulation.setCPUThrottlingRate',{rate:cpuRate});
 if(mobile)await p.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await p.send('Page.addScriptToEvaluateOnNewDocument',{source:`performance.setResourceTimingBufferSize(5000);localStorage.setItem('eden-graphics',${JSON.stringify(preset)});window.__long=[];new PerformanceObserver(list=>{for(const e of list.getEntries())__long.push({start:e.startTime,ms:e.duration});}).observe({type:'longtask',buffered:true});`});
 await p.goto(url);await p.ready();result.readyMs=await ev('performance.now()');
 await ev(`(()=>{const r=${S}.renderer(),render=r.render.bind(r);window.__measure={frames:[],renders:0,calls:0,tris:0,submit:0};r.render=(...a)=>{const t=performance.now(),c=r.info.autoReset?0:r.info.render.calls,tri=r.info.autoReset?0:r.info.render.triangles;render(...a);const m=__measure;m.submit+=performance.now()-t;m.renders++;m.calls+=r.info.render.calls-c;m.tris+=r.info.render.triangles-tri;};let last=0;function frame(t){const m=__measure;if(last)m.frames.push({ms:t-last,renders:m.renders,calls:m.calls,tris:m.tris,submit:m.submit});last=t;m.renders=m.calls=m.tris=m.submit=0;requestAnimationFrame(frame);}requestAnimationFrame(frame);})()`);
 await sleep(3000);
 const t0=await ev('performance.now()');
 await ev(`${S}.teleport(11.7,-29)`);
 await wait(`${S}.worlds().world()==='beyond'&&!${S}.worlds().loading()&&${S}.battle().inspect().active`);
 result.beyondMs=await ev('performance.now()')-t0;
 await ev(`(()=>{${S}.battle()._debug.god();const C=${S}.combat();C.setTouch(true);C._debug.setLocked(true);})()`);
 const phases=[
  ['arrive',`${S}.battle()._debug.place(11.7,-30,11.7,-100)`],
  ['courtyard',`(()=>{const c=${S}.battle().inspect();${S}.battle()._debug.place(11.7,-52,11.7,-80);})()`],
  ['road',`${S}.battle()._debug.place(11.7,-95,11.7,-20)`],
  ['gunfight',`(()=>{const B=${S}.battle(),C=${S}.combat();B._debug.place(11.7,-48,11.7,-80);C.arsenal.set({owned:['rifle','c4'],reserve:{rifle:900,c4:20},loaded:{rifle:30},variants:{c4:'frag'}});C.equip('rifle');C._debug.setButtons({left:true});window.__fire=setInterval(()=>{const s=C._debug.state.rifle;if(s&&s.ammo<3){s.ammo=30;}},200);B._debug.bots.forEach(b=>{if(b.alive)b.root.position.set(11.7+(Math.random()-.5)*14,b.root.position.y,-62+(Math.random()-.5)*10);});})()`],
  ['blasts',`(()=>{const C=${S}.combat();C._debug.setButtons({left:false});clearInterval(window.__fire);C.equip('c4');let n=0;window.__boom=setInterval(()=>{const P=${S}.getState().position;C._debug.explodeAt(P[0]+(Math.random()-.5)*12,P[2]-10-Math.random()*8);if(++n>5)clearInterval(window.__boom);},1000);})()`]
 ];
 for(const [name,setup] of phases){
  await ev(setup);await sleep(2500);await ev('__measure.frames=[]');
  await p.send('Profiler.enable');await p.send('Profiler.setSamplingInterval',{interval:200});await p.send('Profiler.start');await sleep(6000);const {profile}=await p.send('Profiler.stop');
  const phase=await ev(`(()=>{const m=__measure.frames,r=${S}.renderer(),sort=k=>m.map(f=>f[k]).sort((a,b)=>a-b),q=(a,p)=>a[Math.min(a.length-1,Math.floor(a.length*p))]||0,ms=sort('ms');return {samples:m.length,fps:+(1000/(q(ms,.5)||1)).toFixed(1),medianMs:+q(ms,.5).toFixed(2),p95Ms:+q(ms,.95).toFixed(2),p99Ms:+q(ms,.99).toFixed(2),over33:m.filter(f=>f.ms>33.4).length,over50:m.filter(f=>f.ms>50).length,drawCalls:q(sort('calls'),.5),triangles:q(sort('tris'),.5),renders:q(sort('renders'),.5),submitMs:+q(sort('submit'),.5).toFixed(2),memory:r.info.memory,programs:r.info.programs?.length,quality:${S}.getState().quality,heapMB:performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(0):null}})()`);
  // Self time by function: samples whose node is that function, weighted by the sampling interval.
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])),self=new Map();
  const dt=profile.timeDeltas||[];(profile.samples||[]).forEach((id,i)=>{const f=nodes.get(id).callFrame,k=(f.functionName||'(anon)')+' '+f.url.split('/').pop().split('?')[0]+':'+(f.lineNumber+1);self.set(k,(self.get(k)||0)+(dt[i]||0));});
  const total=[...self.values()].reduce((a,b)=>a+b,0)||1;
  phase.cpu=[...self].filter(([k])=>!/^\((idle|program|garbage collector)\)/.test(k)).sort((a,b)=>b[1]-a[1]).slice(0,25).map(([k,us])=>[k,+(100*us/total).toFixed(1)]);
  phase.idlePct=+(100*([...self].filter(([k])=>/^\(idle\)/.test(k)).reduce((a,[,v])=>a+v,0))/total).toFixed(1);
  phase.gcPct=+(100*([...self].filter(([k])=>/^\(garbage collector\)/.test(k)).reduce((a,[,v])=>a+v,0))/total).toFixed(1);
  result.phases.push({name,...phase});
  console.log(name,JSON.stringify({fps:phase.fps,median:phase.medianMs,p95:phase.p95Ms,calls:phase.drawCalls,tris:phase.triangles,renders:phase.renders,submit:phase.submitMs,idle:phase.idlePct,gc:phase.gcPct,top:phase.cpu.slice(0,6)}));
  await p.shot(out.replace(/\.json$/,`-${name}.jpg`));
 }
 result.longTasks=await ev(`(()=>{const l=__long;return {count:l.length,totalMs:Math.round(l.reduce((a,e)=>a+e.ms,0)),worst:l.sort((a,b)=>b.ms-a.ms).slice(0,8).map(e=>[Math.round(e.start),Math.round(e.ms)])}})()`);
 result.resources=await ev(`(()=>{const r=performance.getEntriesByType('resource');return {requests:r.length,transferMB:+(r.reduce((s,e)=>s+(e.transferSize||0),0)/1048576).toFixed(1),decodedMB:+(r.reduce((s,e)=>s+e.decodedBodySize,0)/1048576).toFixed(1),largest:r.sort((a,b)=>b.decodedBodySize-a.decodedBodySize).slice(0,25).map(e=>[e.name.replace(location.origin,'').split('?')[0],+(e.decodedBodySize/1048576).toFixed(2)])}})()`);
 result.errors=[...new Set(p.problems.filter(x=>x.startsWith('EXC')).map(x=>x.slice(0,300)))];
 console.log('load',JSON.stringify({readyMs:Math.round(result.readyMs),beyondMs:Math.round(result.beyondMs),longTasks:{count:result.longTasks.count,totalMs:result.longTasks.totalMs},requests:result.resources.requests,decodedMB:result.resources.decodedMB,errors:result.errors.length}));
}finally{fs.writeFileSync(out,JSON.stringify(result,null,2));await p.close();}
