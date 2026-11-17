// Real Chrome touch input at phone DPR, including concurrent move/look/jump.
// Emulation exercises input/layout/render settings; it is not a phone GPU benchmark.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {openPage,sleep} from './headless-chrome.mjs';
const url=process.argv[2]||'http://127.0.0.1:8794/showroom.html',out=process.argv[3]||'/private/tmp/eden-mobile-input';
fs.mkdirSync(out,{recursive:true});
const p=await openPage({width:390,height:844,deviceScaleFactor:3,mobile:true}),S='breakThyRuleShowroom',results=[];
const wait=async(expression,timeout=10000)=>{const until=Date.now()+timeout;while(Date.now()<until){if(await p.evaluate(expression))return;await sleep(100);}throw Error('Timed out: '+expression);};
const rect=selector=>p.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);
const point=(id,x,y)=>({id,x,y,radiusX:5,radiusY:5,force:.6});
const send=(type,touchPoints)=>p.send('Input.dispatchTouchEvent',{type,touchPoints});
const tap=async selector=>{const r=await rect(selector);await send('touchStart',[point(0,r.x,r.y)]);await send('touchEnd',[]);};
try{
 await p.goto(url);await p.ready();await wait(`${S}.touch()?.playing`);
 for(const [orientation,width,height]of [['portrait',390,844],['landscape',844,390]]){
  await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:3,mobile:true});
  await sleep(300);await p.evaluate(`${S}.place(0,14,0,8)`);await wait(`${S}.touch()?.playing`);
  const settings=await p.evaluate(`({coarse:matchMedia('(pointer:coarse)').matches,quality:${S}.getState().quality,aa:${S}.renderer().getContext().getContextAttributes().antialias,overflow:document.documentElement.scrollWidth>innerWidth+1})`);
  assert.equal(settings.coarse,true);assert.equal(settings.aa,false);assert.equal(settings.quality.max,1);assert.equal(settings.quality.targetFps,60);assert.equal(settings.overflow,false);
  for(const selector of ['.em-stick','.em-jump','.em-crouch','.em-view','.em-use','.em-fight']){
   const r=await rect(selector);assert.ok(r.w>=44&&r.h>=44&&r.x-r.w/2>=0&&r.x+r.w/2<=width&&r.y-r.h/2>=0&&r.y+r.h/2<=height,`${selector} stays reachable in ${orientation}`);
  }
  assert.ok((await rect('.em-fight')).y>height/2,'Fight is in the lower action area');
  assert.equal(await p.evaluate(`!!document.querySelector('.em-fight').closest('.em-top')`),false);
  const r=await rect('.em-stick'),j=await rect('.em-jump'),stick=point(0,r.x,r.y),look=point(1,width*.66,height*.46),jump=point(2,j.x,j.y);
  await send('touchStart',[stick]);stick.y-=r.h*.7;await send('touchMove',[stick]);
  await wait(`${S}.touch().run`);
  const before=await p.evaluate(`${S}.getState().aim`);await send('touchStart',[stick,look]);look.x+=35;look.y-=10;await send('touchMove',[stick,look]);
  const after=await p.evaluate(`${S}.getState().aim`);assert.notDeepEqual(after,before,'a second finger looks while sprinting');assert.equal(await p.evaluate(`${S}.touch().run`),true);
  await p.evaluate(`window.__mobileJump=[];window.__sampleJump=true;(function sample(){if(!__sampleJump)return;const s=${S}.getState();__mobileJump.push({vy:s.movement.vy,air:s.movement.airborne});requestAnimationFrame(sample);})();`);
  await send('touchStart',[stick,look,jump]);await sleep(180);await send('touchEnd',[jump]);
  const jumpSamples=await p.evaluate('window.__sampleJump=false;__mobileJump');assert.ok(jumpSamples.some(s=>s.air&&s.vy>0),'third finger launches a held jump');
  assert.equal(await p.evaluate(`${S}.touch().run`),true,'jump release does not release the joystick');
  await send('touchCancel',[]);await wait(`!${S}.touch().run&&!${S}.touch().look`);assert.deepEqual(await p.evaluate(`${S}.touch().keys`),[]);
  assert.equal(await p.evaluate('String(getSelection())'),'','look gestures do not select page text');
  assert.equal(await p.evaluate(`${S}._player().movement.momentum()`),0,'Eden does not charge momentum');
  assert.equal(await p.evaluate(`document.getElementById('momentum-hud')?.classList.contains('on')||false`),false);
  await tap('[data-command="menu"]');await wait('document.getElementById("eden-mobile-menu").open');assert.equal(await p.evaluate(`${S}.touch().playing`),false);
  await tap('#eden-mobile-menu .em-close');await wait(`${S}.touch().playing`);
  await p.shot(path.join(out,orientation+'.jpg'));results.push({orientation,settings,multitouch:true,menu:true,selection:false});console.log('PASS',orientation,'move + look + jump, cancellation, menu, viewport bounds and mobile rendering');
 }
 // Rotation during a held gesture must release it, not leave sprint stuck on.
 const r=await rect('.em-stick');await send('touchStart',[point(0,r.x,r.y-r.h*.3)]);
 await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});await sleep(300);await send('touchCancel',[]);
 assert.deepEqual(await p.evaluate(`${S}.touch().keys`),[]);assert.equal(await p.evaluate(`${S}.touch().stick`),false);
 // Enter the actual Open Match from Eden's touch menu, without debug entry or
 // pointer lock. Test-only invulnerability keeps bots from interrupting input checks.
 await tap('[data-command="menu"]');await wait('document.getElementById("eden-mobile-menu").open');
 await tap('#eden-mobile-menu [data-command="battle-launch"]');
 await wait(`${S}.battle().active()&&!${S}.worlds().loading()&&${S}.combat().inspect().weapon==='pistol'`,180000);
 await p.evaluate(`${S}.battle()._debug.god()`);await wait(`${S}.touch()?.mode==='armed'`);
 for(const [orientation,width,height]of [['portrait',390,844],['landscape',844,390]]){
  await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:3,mobile:true});await sleep(500);
  const boxes=await p.evaluate(`Array.from(document.querySelectorAll('#touch-controls button:not([hidden]),#touch-controls .tc-stick')).map(b=>{const r=b.getBoundingClientRect();return {name:b.className,x:r.x,y:r.y,w:r.width,h:r.height};})`);
  for(const r of boxes)assert.ok(r.w>=44&&r.h>=44&&r.x>=0&&r.y>=0&&r.x+r.w<=width+1&&r.y+r.h<=height+1,'arena control fits: '+JSON.stringify(r));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(!(a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h),a.name+' overlaps '+b.name);}
  const before=await p.evaluate(`${S}.combat().inspect().stats.shots`);await tap('.tc-fire');await sleep(450);
  assert.equal(await p.evaluate(`${S}.combat().inspect().stats.shots`),before+1,'touch pistol fires');
  await tap('.tc-reload');await wait(`${S}.combat().inspect().ammo===12`);
  await p.shot(path.join(out,'arena-'+orientation+'.jpg'));results.push({orientation,arena:true,controlsDoNotOverlap:true,pistol:true,reload:true});
  console.log('PASS arena',orientation,'touch entry, pistol, reload and control bounds');
 }
 await p.evaluate(`${S}.place(11.7,-44,11.7,-90);${S}.combat().syncLook()`);
 await p.evaluate(`window.__run={peak:0,frames:0,on:true};(function sample(){if(!__run.on)return;__run.peak=Math.max(__run.peak,${S}._player().movement.momentum());__run.frames++;requestAnimationFrame(sample);})();`);
 const a=await rect('.tc-stick'),thumb=point(0,a.x,a.y);await send('touchStart',[thumb]);thumb.y-=a.h*.7;await send('touchMove',[thumb]);await sleep(4300);
 const run=await p.evaluate(`__run.on=false;({samples:__run,movement:${S}.getState().movement,touch:${S}.touch(),position:${S}.getState().position,canMove:${S}.battle().canMove()})`);console.log('Arena sprint',JSON.stringify(run));
 assert.ok(run.samples.peak>.5,'arena sprint builds momentum');
 assert.equal(await p.evaluate(`document.getElementById('momentum-hud').classList.contains('on')`),true);
 await send('touchCancel',[]);await tap('.tc-leave');await wait(`${S}.touch()?.playing&&!${S}.battle().active()`,60000);
 assert.equal(await p.evaluate(`${S}._player().movement.momentum()`),0);assert.equal(await p.evaluate(`document.getElementById('momentum-hud').classList.contains('on')`),false);
 results.push({arenaMomentum:true,returnToEden:true,momentumClearsOnExit:true});
 assert.deepEqual(p.problems.filter(s=>s.startsWith('EXC')),[]);
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({url,deviceScaleFactor:3,physicalDevice:false,results,rotationResetsInput:true,runtimeExceptions:[]},null,2)+'\n');
}catch(error){console.error('Browser errors:',p.problems);console.error('State:',await p.evaluate(`({touch:${S}.touch(),world:${S}.worlds().inspect(),view:${S}.getState().view,position:${S}.getState().position,battle:${S}.battle().active()})`));await p.shot(path.join(out,'failure.jpg'));throw error;}finally{await p.close();}
