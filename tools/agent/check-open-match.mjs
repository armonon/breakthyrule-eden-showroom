// Native desktop input: headless Chrome cannot grant pointer lock.
// Uses an isolated profile, real mouse/key events, and never calls debug.fire.
import assert from 'node:assert/strict';
import {openPage,sleep} from './headless-chrome.mjs';
const p=await openPage({headless:false}),S='breakThyRuleShowroom';
const wait=async expression=>{for(let i=0;i<240;i++){if(await p.evaluate(expression))return;await sleep(500);}throw Error('Timed out: '+expression);};
const click=async()=>{await p.send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:400,button:'left',buttons:1,clickCount:1});await p.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:400,button:'left',buttons:0,clickCount:1});};
const key=async(key,code)=>{await p.send('Input.dispatchKeyEvent',{type:'keyDown',key,code});await p.send('Input.dispatchKeyEvent',{type:'keyUp',key,code});};
try{
 await p.send('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('eden-graphics','low');"});
 await p.goto(process.argv[2]||'http://127.0.0.1:8790/showroom.html');await p.ready();await key('w','KeyW');
 await p.evaluate(`${S}.teleport(11.7,-29)`);
 await wait(`${S}.battle().active()&&!${S}.worlds().loading()`);
 await p.evaluate(`${S}.battle()._debug.god();${S}.combat().arsenal.give('pistol',12);${S}.combat().equip('pistol');`);await sleep(800);
 assert.equal(await p.evaluate('edenControls.modalOpen()'),false,'closed reader does not capture input');
 await p.send('Page.bringToFront');
 // Actual browser permission, not a spoofed document.pointerLockElement.
 const lock=await p.send('Runtime.evaluate',{expression:`${S}.renderer().domElement.requestPointerLock()`,userGesture:true,awaitPromise:true});
 assert.ok(!lock.exceptionDetails,'native pointer lock succeeds');await wait(`${S}.combat().inspect().locked`);
 const before=await p.evaluate(`${S}.combat().inspect()`);
 for(let i=0;i<3;i++){await click();await sleep(400);}
 const after=await p.evaluate(`${S}.combat().inspect()`);
 assert.equal(after.stats.shots-before.stats.shots,3);assert.equal(after.ammo,before.ammo-3);
 await key('r','KeyR');await wait(`${S}.combat().inspect().ammo===12`);
 assert.equal(await p.evaluate(`${S}.combat().inspect().ammo`),12,'reload remains reachable');
 console.log('PASS native mouse: three pistol shots; R reload; closed reader remains mounted');
 const hud=await p.evaluate(`(()=>{const m=document.getElementById('momentum-hud'),s=getComputedStyle(m);return {on:m.classList.contains('on'),armed:m.classList.contains('armed'),opacity:+s.opacity,z:+s.zIndex,world:+getComputedStyle(document.getElementById('world')).zIndex,label:m.textContent}})()`);
 assert.ok(hud.on&&hud.armed&&hud.opacity>.9&&hud.z>hud.world,'armed momentum meter is above the combat viewport');
 console.log('PASS armed momentum display',hud);
 // Offset the target beyond the old narrow cone. Real click, real hit test.
 await p.evaluate(`(()=>{
  const S=${S},B=S.battle(),b=B._debug.bots.find(b=>b.alive);window.assistVictim=b;
  S.place(11.7,-60,11.7,-72,1.45);S.combat().syncLook();
  b.root.position.set(12.25,0,-70);b.hp=1000;b.lastHurt=1e9;b.shield=0;b.armor=0;b.state='roam';b.think=999;b.goal=null;b.path.length=0;b.fireT=999;b.aimT=999;b.lastFlinch=1e9;
  edenSettings.set('aimAssist','high');
 })()`);await sleep(900);
 const hp=await p.evaluate('assistVictim.hp');await click();await sleep(250);
 const damage=hp-await p.evaluate('assistVictim.hp');assert.ok(damage>=30,'assisted pistol shot has stronger damage');
 console.log('PASS stronger assisted near-miss shot',damage);
 const impact=await p.evaluate(`(()=>{
  const S=${S},B=S.battle(),P=S._player(),b=B._debug.bots.find(b=>b.alive);
  S.combat().holster();S.third(true);S.teleport(11.7,-50);
  const saved=P.movement.captureState();saved.momentum=1;P.movement.restoreState(saved);
  b.root.position.set(11.7,0,-50);b.tackledUntil=0;b.lastFlinch=1e9;b.aimT=10;b.fireT=10;b.goal=null;b.path.length=0;
  const before=B.inspect().player.stomps;
  const sample=(x,h,vy)=>{P.targetPosition.set(x,1.75+h,-50);P.walkVelocity.set(8,0,0);P.motion.set(h,vy);B.update(performance.now()/1000,1/60);};
  sample(9.7,0,0);sample(10.1,.4,5);sample(11.4,2,0);sample(11.8,1.3,-5);
  const result={stomps:B.inspect().player.stomps-before,down:b.model.motion.downAmount(),momentum:P.movement.momentum()};
  P.motion.reset();P.walkVelocity.set(0,0,0);return result;
 })()`);
 assert.equal(impact.stomps,1);assert.ok(impact.down>0);assert.ok(impact.momentum>=.9);
 console.log('PASS live match: full-momentum descending contact activates opponent ragdoll',impact);
 const ram=await p.evaluate(`(()=>{
  const S=${S},B=S.battle(),P=S._player(),b=B._debug.bots.find(b=>b.alive&&!b.model.motion.downAmount());
  S.teleport(11.7,-48);const saved=P.movement.captureState();saved.momentum=1;P.movement.restoreState(saved);
  b.root.position.set(11.7,0,-50);b.tackledUntil=0;b.lastFlinch=1e9;b.think=999;b.fireT=999;b.goal=null;b.path.length=0;b.state='roam';
  const before=B.inspect().player.rams;
  for(const z of [-48.4,-49]){P.targetPosition.set(11.7,1.75,z);P.walkVelocity.set(0,0,-8);P.motion.reset();B.update(performance.now()/1000,1/60);}
  const result={rams:B.inspect().player.rams-before,down:b.model.motion.downAmount()};P.walkVelocity.set(0,0,0);return result;
 })()`);
 assert.equal(ram.rams,1);assert.ok(ram.down>0);console.log('PASS running shoulder tackle without jump',ram);
 await p.evaluate(`${S}.teleport(11.7,-42);${S}.combat().equip('pistol');${S}.third(true);`);await sleep(800);
 await key('r','KeyR');await sleep(250);await p.shot('/private/tmp/eden-third-person-combat.jpg');
 await p.evaluate(`${S}.teleport(11.7,-46);document.exitPointerLock();`);
 assert.deepEqual(p.problems.filter(v=>v.startsWith('EXC')),[]);
}catch(error){console.error('Browser errors',p.problems);console.error('State',await p.evaluate(`${S}.combat().inspect()`));throw error;}finally{await p.close();}
