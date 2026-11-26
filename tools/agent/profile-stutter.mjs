// Stutter hunt: plays a long Beyond Eden route (garden walk, the road, arrival, the city's streets, a gunfight,
// grenades, loot) and records every long frame with what caused it.
// node tools/agent/profile-stutter.mjs URL OUTPUT.json [low|medium|high] [desktop|mobile]
// EDEN_PROFILE_CPU=4 slows the CPU (diagnostic).
// Long frames come from Chrome's Long Animation Frame API, which names the scripts (file, function, character
// position) that ran inside each slow frame, plus time spent in style/layout and rendering.
import fs from 'node:fs';
import path from 'node:path';
import {openPage,sleep} from './headless-chrome.mjs';
const [url='http://127.0.0.1:8798/showroom.html',out='/private/tmp/stutter.json',preset='medium',device='desktop']=process.argv.slice(2);
const mobile=device.startsWith('mobile'),cpu=Number(process.env.EDEN_PROFILE_CPU)||1;
const p=await openPage({width:mobile?844:1280,height:mobile?390:800,deviceScaleFactor:mobile?2:1,mobile}),S='breakThyRuleShowroom',ev=e=>p.evaluate(e);
const wait=async(f,ms=180000)=>{const t=Date.now();while(Date.now()-t<ms){if(await ev(f))return;await sleep(300);}throw Error('timeout '+f);};
const key=(type,k,code,vk,text)=>p.send('Input.dispatchKeyEvent',{type,key:k,code,windowsVirtualKeyCode:vk,...(text?{text}:{})});
const result={url,preset,device,cpu,phases:[]};
try{
 if(mobile)await p.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await p.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.alert=()=>{};localStorage.setItem('eden-graphics',${JSON.stringify(preset)});
  window.__loaf=[];window.__phase='load';try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.duration>=50)__loaf.push({phase:__phase,at:Math.round(e.startTime),ms:Math.round(e.duration),block:Math.round(e.blockingDuration||0),render:Math.round(e.renderStart?e.startTime+e.duration-e.renderStart:0),style:Math.round(e.styleAndLayoutStart?e.startTime+e.duration-e.styleAndLayoutStart:0),scripts:[...(e.scripts||[])].sort((a,b)=>b.duration-a.duration).slice(0,4).map(s=>({ms:Math.round(s.duration),src:(s.sourceURL||'').split('/').pop().split('?')[0],fn:s.sourceFunctionName||'',pos:s.sourceCharPosition,inv:(s.invoker||'').slice(0,60),type:s.invokerType}))});}).observe({type:'long-animation-frame',buffered:true});}catch(e){}`});
 await p.goto(url);await p.ready();
 if(cpu>1)await p.send('Emulation.setCPUThrottlingRate',{rate:cpu});
 // Frame times per phase.
 await ev(`(()=>{window.__frames=[];let last=0;(function f(t){if(last)__frames.push([__phase,t-last]);last=t;requestAnimationFrame(f);})(performance.now());})()`);
 const phase=async(name,run)=>{await ev(`window.__phase=${JSON.stringify(name)}`);const t=Date.now();await run();result.phases.push({name,seconds:+((Date.now()-t)/1000).toFixed(1)});};
 const hold=async(ms,keys=['w'])=>{for(const k of keys)await key('keyDown',k,k==='Shift'?'ShiftLeft':'Key'+k.toUpperCase(),k==='Shift'?16:k.toUpperCase().charCodeAt(0),k==='Shift'?undefined:k);await sleep(ms);for(const k of keys)await key('keyUp',k,k==='Shift'?'ShiftLeft':'Key'+k.toUpperCase(),k==='Shift'?16:k.toUpperCase().charCodeAt(0));};
 await phase('garden-walk',async()=>{await sleep(2000);await ev(`${S}.place(0,8,0,-30)`);await hold(6000,['w','Shift']);});
 await phase('road-to-beyond',async()=>{await ev(`${S}.place(11.7,-12,11.7,-40)`);await hold(5000,['w','Shift']);await ev(`${S}.teleport(11.7,-29)`);await wait(`${S}.worlds().world()==='beyond'&&!${S}.worlds().loading()&&${S}.battle().inspect().active`);});
 await ev(`${S}.battle()._debug.god()`);
 await phase('arrive',async()=>{await ev(`${S}.battle()._debug.place(11.7,-32,11.7,-100)`);await sleep(4000);});
 await phase('streets',async()=>{for(const r of [[11.7,-40,11.7,-110],[-35,-60,50,-60],[45,-80,-30,-80],[0,-100,40,-40]]){await ev(`${S}.battle()._debug.place(${r.join(',')})`);await hold(4500,['w','Shift']);}});
 await phase('gunfight',async()=>{await ev(`(()=>{const B=${S}.battle(),C=${S}.combat();C.setTouch(true);C._debug.setLocked(true);B._debug.place(11.7,-48,11.7,-80);C.arsenal.set({owned:['rifle','c4','pistol'],reserve:{rifle:900,c4:20,pistol:60},loaded:{rifle:30,pistol:12},variants:{c4:'frag',rifle:'vigil'}});C.equip('rifle');C._debug.setButtons({left:true});window.__fire=setInterval(()=>{const s=C._debug.state.rifle;if(s&&s.ammo<3)s.ammo=30;},200);B._debug.bots.forEach(b=>{if(b.alive)b.root.position.set(11.7+(Math.random()-.5)*14,b.root.position.y,-62+(Math.random()-.5)*10);});})()`);await sleep(6000);await ev(`${S}.combat()._debug.setButtons({left:false});clearInterval(window.__fire);`);});
 await phase('weapon-swaps',async()=>{for(const id of ['pistol','rifle','c4','pistol','rifle'])
  {await ev(`${S}.combat().equip('${id}')`);await sleep(700);}});
 await phase('grenades',async()=>{await ev(`${S}.combat().equip('c4')`);for(let i=0;i<4;i++){await ev(`${S}.combat()._debug.fire()`);await sleep(1300);}await sleep(2500);});
 await phase('blasts-near',async()=>{for(let i=0;i<3;i++){await ev(`(()=>{const P=${S}.getState().position;${S}.combat()._debug.explodeAt(P[0]+3,P[2]-4);})()`);await sleep(1800);}});
 await phase('loot-run',async()=>{const spots=JSON.parse(await ev(`JSON.stringify(${S}.battle()._debug.loot.filter(l=>l.item.type==='weapon').slice(0,5).map(l=>[l.pos.x,l.pos.z]))`));for(const [x,z] of spots){await ev(`${S}.battle()._debug.place(${x},${z+1.3},${x},${z})`);await sleep(600);await ev(`${S}.battle()._debug.interact()`);await sleep(900);}});
 const r=JSON.parse(await ev(`JSON.stringify({frames:__frames,loaf:__loaf})`));
 const byPhase={};for(const [ph,ms] of r.frames){(byPhase[ph]??=[]).push(ms);}
 for(const ph of result.phases){const f=(byPhase[ph.name]||[]).sort((a,b)=>a-b),q=k=>f[Math.min(f.length-1,Math.floor(f.length*k))]||0;
  Object.assign(ph,{frames:f.length,median:+q(.5).toFixed(1),p95:+q(.95).toFixed(1),p99:+q(.99).toFixed(1),max:+(f.at(-1)||0).toFixed(0),over50:f.filter(x=>x>50).length,over100:f.filter(x=>x>100).length,
   loaf:r.loaf.filter(l=>l.phase===ph.name).sort((a,b)=>b.ms-a.ms).slice(0,6)});}
 result.loafLoad=r.loaf.filter(l=>l.phase==='load').sort((a,b)=>b.ms-a.ms).slice(0,6);
 // Which script functions cost the most across all long frames (outside the initial load).
 const cost=new Map();for(const l of r.loaf)if(l.phase!=='load')for(const s of l.scripts){const k=s.src+' '+(s.fn||s.inv)+(s.pos!=null?'@'+s.pos:'');cost.set(k,(cost.get(k)||0)+s.ms);}
 result.topScripts=[...cost].sort((a,b)=>b[1]-a[1]).slice(0,20);
 result.errors=[...new Set(p.problems.filter(x=>x.startsWith('EXC')).map(x=>x.slice(0,200)))];
 for(const ph of result.phases)console.log(ph.name.padEnd(15),'median',ph.median,'p95',ph.p95,'p99',ph.p99,'max',ph.max,'>50ms',ph.over50,'>100ms',ph.over100,'| worst:',ph.loaf.slice(0,2).map(l=>l.ms+'ms '+(l.scripts[0]?l.scripts[0].src+' '+(l.scripts[0].fn||l.scripts[0].inv)+(l.scripts[0].pos!=null?'@'+l.scripts[0].pos:''):'(render '+l.render+'ms)')).join(' ; '));
 console.log('top scripts in long frames:');for(const [k,ms] of result.topScripts.slice(0,12))console.log('  ',ms+'ms',k);
 console.log('errors',result.errors.length);
}finally{fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));await p.close();}
