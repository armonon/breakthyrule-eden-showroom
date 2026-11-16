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
 await key('r','KeyR');await sleep(1900);
 assert.equal(await p.evaluate(`${S}.combat().inspect().ammo`),12,'reload remains reachable');
 console.log('PASS native mouse: three pistol shots; R reload; closed reader remains mounted');
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
 await p.evaluate(`${S}.teleport(11.7,-46);document.exitPointerLock();`);
 assert.deepEqual(p.problems.filter(v=>v.startsWith('EXC')),[]);
}finally{await p.close();}
