// Reproducible pistol/traversal workload on mobile emulation, with a real Metal GPU.
// CPU throttling is diagnostic; these numbers are not physical-phone FPS.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {openPage,sleep} from './headless-chrome.mjs';
const [url='http://127.0.0.1:8794/showroom.html',out='/private/tmp/arena-mobile.json']=process.argv.slice(2);
fs.mkdirSync(path.dirname(out),{recursive:true});
const p=await openPage({width:844,height:390,deviceScaleFactor:3,mobile:true});
const result={url,physicalPhone:false,cpuThrottle:4,viewport:[844,390],dpr:3,phases:[]};
const wait=async expr=>{for(let i=0;i<720;i++){if(await p.evaluate(expr))return;await sleep(250);}throw Error('Timed out: '+expr);};
try{
 await p.send('Page.addScriptToEvaluateOnNewDocument',{source:`let seed=17;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};localStorage.setItem('eden-graphics','low');`});
 await p.goto(url);await p.ready();await p.evaluate(`window.S=breakThyRuleShowroom;document.getElementById('battle-launch').click()`);
 await wait(`S.battle().active()&&!S.worlds().loading()&&S.combat().inspect().weapon==='pistol'`);
 await p.evaluate(`S.battle()._debug.god();S.battle()._debug.place(11.7,-44,11.7,-80);S.combat().arsenal.addAmmo('pistol',500);window.key=(k,down)=>document.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:k,bubbles:true}));`);
 await sleep(10000);await p.send('Emulation.setCPUThrottlingRate',{rate:4});
 await p.evaluate(`(()=>{const r=S.renderer(),render=r.render.bind(r);window.M={frames:[],calls:0,tris:0,renders:0,mutations:0,modes:{},on:true};r.render=(...a)=>{const c=r.info.autoReset?0:r.info.render.calls,t=r.info.autoReset?0:r.info.render.triangles;render(...a);M.calls+=r.info.render.calls-c;M.tris+=r.info.render.triangles-t;M.renders++;};new MutationObserver(ms=>M.mutations+=ms.length).observe(document.getElementById('battle-hud'),{subtree:true,childList:true,characterData:true,attributes:true});let last=0;(function frame(t){if(!M.on)return;if(last)M.frames.push({ms:t-last,calls:M.calls,tris:M.tris,renders:M.renders});last=t;M.calls=M.tris=M.renders=0;const mode=S.parkour()?.inspect().state||S.getState().feel.mode;M.modes[mode]=(M.modes[mode]||0)+1;requestAnimationFrame(frame);})(performance.now());})()`);
 for(const name of ['idle','pistol','parkour','pistol-parkour']){
  await p.evaluate(`key('w',false);key('Shift',false);key(' ',false);S.combat().touchFire(false);S.battle()._debug.place(11.7,-44,11.7,-80);`);
  await sleep(700);await p.evaluate(`M.frames=[];M.mutations=0;M.modes={};window.beforeShots=S.combat().inspect().stats.shots;window.actionAt=performance.now();window.lastFire=-1;window.lastJump=-1;window.doActions=true;(function action(){if(!doActions)return;const t=(performance.now()-actionAt)/1000;${name.includes('pistol')?`const n=Math.floor(t/.18);if(n!==lastFire){lastFire=n;const c=S.combat();if(c.inspect().ammo===0){key('r',true);key('r',false);}else{c.touchFire(true);c.touchFire(false);}}`:''}${name.includes('parkour')?`key('w',true);key('Shift',true);const jumpN=Math.floor(t/.85);if(jumpN!==lastJump){lastJump=jumpN;key(' ',true);}else key(' ',false);`:''}requestAnimationFrame(action);})();`);
  await p.send('Profiler.enable');await p.send('Profiler.start');await sleep(8500);const {profile}=await p.send('Profiler.stop');
  const data=await p.evaluate(`doActions=false;(()=>{const q=(k,p)=>{const a=M.frames.map(f=>f[k]).sort((a,b)=>a-b);return a[Math.floor(a.length*p)]||0;};return {samples:M.frames.length,medianMs:q('ms',.5),p95Ms:q('ms',.95),p99Ms:q('ms',.99),over50:M.frames.filter(f=>f.ms>50).length,drawCalls:q('calls',.5),triangles:q('tris',.5),renderPasses:q('renders',.5),mutations:M.mutations,modes:M.modes,shots:S.combat().inspect().stats.shots-beforeShots,quality:S.getState().quality,memory:S.renderer().info.memory};})()`);
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])),counts=new Map();for(const id of profile.samples||[])counts.set(id,(counts.get(id)||0)+1);
  data.cpu=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,24).map(([id,samples])=>{const f=nodes.get(id).callFrame;return {fn:f.functionName,file:f.url.split('/').pop(),line:f.lineNumber+1,samples};});
  result.phases.push({name,...data});console.log(name,JSON.stringify(data));if(name==='pistol-parkour')await p.shot(out.replace('.json','.jpg'));
  if(name.includes('pistol'))assert.ok(data.shots>=12,'pistol workload actually fires repeatedly');
 }
 await p.evaluate(`M.on=false;key('w',false);key('Shift',false);key(' ',false)`);
 result.errors=p.problems.filter(s=>s.startsWith('EXC'));assert.deepEqual(result.errors,[]);
}finally{fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');await p.close();}
