import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const root=new URL('../../',import.meta.url),scope=vm.createContext({console,performance,URL,TextEncoder,TextDecoder,location:{href:'file:///headless/'}});scope.window=scope;
for(const file of ['assets/three.min.js','expedition-world.js','movement-state.js','player-motion.js','parkour.js','player-movement.js','expedition-controller.js'])vm.runInContext(readFileSync(new URL(file,root),'utf8'),scope,{filename:file});
const clone=s=>JSON.parse(JSON.stringify(s)),equal=(a,b)=>assert.deepEqual(clone(a),clone(b));
const input=(heldMask=0,edges=0)=>({heldMask,edges,yaw:Math.PI,pitch:0});
function make(walls=[]){
 const layout={bounds:[-100,100,-250,100],spawn:[0,0],landmarks:[]},world=scope.createExpeditionWorld({layout,roofs:{}});world.walls.push(...walls);
 return scope.createExpeditionController({T:scope.THREE,world,layout,character:{height:175,shoulders:1},worldRevision:'momentum-test-world'});
}

test('sprinting builds actual speed and momentum, and stopping dissipates it',()=>{
 const a=make();for(let i=0;i<240;i++)a.step(input(17));
 assert.ok(a.movement.momentum()>.7);assert.ok(Math.hypot(a.readPose().vx,a.readPose().vz)>7.8);
 const b=make();b.restoreState(clone(a.captureState()));
 for(let i=0;i<180;i++){a.step(input());b.step(input());equal(a.captureState(),b.captureState());}
 assert.equal(a.movement.momentum(),0);
});

test('held jumps rise higher than taps and replay exactly from a mid-hold snapshot',()=>{
 const tap=make(),held=make(),restored=make();let tapPeak=0,heldPeak=0;
 for(let i=0;i<100;i++){
  tap.step(input(0,i===0?1:0));held.step(input(i<20?32:0,i===0?1:0));
  tapPeak=Math.max(tapPeak,tap.readPose().y);heldPeak=Math.max(heldPeak,held.readPose().y);
  if(i===6){const saved=clone(held.captureState());assert.ok(saved.movement.jumpHold>0);restored.restoreState(saved);}
  else if(i>6)restored.step(input(i<20?32:0));
  if(i>=6)equal(held.captureState(),restored.captureState());
 }
 assert.ok(heldPeak>tapPeak+.4,`${heldPeak} held peak exceeds ${tapPeak} tap peak`);
 assert.equal(held.captureState().movement.jumpHold,-1);
});

test('older snapshots default optional momentum and wall-jump state',()=>{
 const a=make(),before=clone(a.captureState()),old=clone(before);
 delete old.movement.momentum;delete old.movement.jumpHold;
 for(const key of ['mom','chain','bonus'])delete old.parkour[key];delete old.parkour.cool.walljump;delete old.parkour.stats.walljumps;delete old.parkour.cool.grip;delete old.parkour.stats.grips;
 a.step(input(17,1));a.restoreState(old);equal(a.captureState(),before);
});

test('invalid new snapshot fields reject atomically instead of being silently clamped',()=>{
 const a=make();for(let i=0;i<60;i++)a.step(input(17));const before=clone(a.captureState());
 const cases=[['movement','momentum',-1],['movement','momentum',1.1],['movement','jumpHold',-2],['parkour','mom',-1],['parkour','mom',1.1],['parkour','chain',-.1],['parkour','chain',1.5],['parkour','chain',7],['parkour','bonus',-1],['parkour','bonus',1.1]];
 for(const [part,key,value] of cases){const bad=clone(before);bad[part][key]=value;assert.throws(()=>a.restoreState(bad),`${part}.${key}=${value}`);equal(a.captureState(),before);}
 for(const [part,key,value] of [['cool','walljump',-1],['cool','walljump','later'],['stats','walljumps',-1],['stats','walljumps',.5]]){
  const bad=clone(before);bad.parkour[part][key]=value;assert.throws(()=>a.restoreState(bad),`${part}.${key}=${value}`);equal(a.captureState(),before);
 }
});

test('wall-run kicks respect the six-jump chain cap and round-trip without changing state',()=>{
 const walls=[[.8,-60,.5,200,80]],a=make(walls),b=make(walls);
 a.reset({y:2});a.motion.set(2,2);a.velocity.set(0,0,-6);a.step(input(17));assert.equal(a.parkour.kind(),'wallrun');
 const running=clone(a.captureState());running.parkour.chain=5;a.restoreState(running);a.step(input(17,1));
 assert.equal(a.parkour.chain(),6);assert.equal(a.captureState().parkour.stats.walljumps,1);b.restoreState(clone(a.captureState()));equal(a.captureState(),b.captureState());
 running.parkour.chain=6;running.parkour.stats.walljumps=6;a.restoreState(running);a.step(input(17,1));
 assert.equal(a.parkour.chain(),6);assert.equal(a.captureState().parkour.stats.walljumps,6,'seventh wall-run kick is consumed without adding a jump');
 b.restoreState(clone(a.captureState()));equal(a.captureState(),b.captureState());a.parkour.land(0);assert.equal(a.parkour.chain(),0,'landing starts a fresh chain');
});

test('actual app Space handlers preserve held state, avoid repeat jumps and release after interruption',()=>{
 const app=readFileSync(new URL('app.js',root),'utf8'),handlers={},keys=new Set();let jumps=0,blocked=false;
 const c=vm.createContext({document:{addEventListener:(name,fn)=>handlers[name]=fn},modalOpen:()=>blocked,state:{ready:true},expedition:null,expeditionPrefs:()=>null,keys,moveKeys:new Set(['w','a','s','d']),movement:{jump(){assert.ok(keys.has('space'),'hold is visible when jumping');jumps++;}},renderer:{domElement:{focus(){}}},requestDraw(){},fistsEngaged:()=>false,arena:null,fists:null,thirdOn:false});
 const start=app.indexOf('function setMovement('),end=app.indexOf("document.addEventListener('keydown',event=>{if(modalOpen()",start);vm.runInContext(app.slice(start,end),c);
 for(const line of app.split('\n').filter(line=>line.startsWith("document.addEventListener('keydown',event=>{if(modalOpen()")||line.startsWith("document.addEventListener('keyup',event=>{const key=")))vm.runInContext(line,c);
 const event=(repeat=false)=>({key:' ',code:'Space',repeat,target:{tagName:'CANVAS'},preventDefault(){}});
 handlers.keydown(event());handlers.keydown(event(true));assert.equal(jumps,1);assert.ok(keys.has('space'));
 blocked=true;handlers.keyup(event());assert.equal(keys.has('space'),false,'release still works while a modal blocks presses');
 blocked=false;handlers.keydown(event());assert.equal(jumps,2);handlers.keyup(event());assert.equal(keys.has('space'),false);
 c.setMovement(' ',true);c.setMovement(' ',true);assert.equal(jumps,3,'literal Space uses the same guarded hold');c.setMovement(' ',false);assert.equal(keys.has('space'),false);
 c.freeView=()=>{};const mobileLine=app.split('\n').find(line=>line.trimStart().startsWith('move:(key,pressed)=>setMovement(key,pressed),jump(pressed=true)'));
 assert.ok(mobileLine);vm.runInContext('globalThis.mobile=({'+mobileLine.trim()+'});',c);
 const release=c.mobile.jump();assert.equal(jumps,4);assert.ok(keys.has('space'));blocked=true;release();assert.equal(jumps,4);assert.equal(keys.has('space'),false);c.mobile.jumpUp();assert.equal(keys.has('space'),false);
});
