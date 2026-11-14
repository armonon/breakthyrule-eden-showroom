import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const root=new URL('../../',import.meta.url),scope=vm.createContext({console,performance,structuredClone,URL,TextDecoder,TextEncoder,location:{href:'file:///headless/'}});scope.window=scope;
for(const f of ['assets/three.min.js','assets/night-pathfinding.js','assets/roof-heights.js','expedition-world.js','movement-state.js','player-motion.js','parkour.js','player-movement.js','expedition-controller.js','expedition-inputs.js','expedition-prediction.js','solo-expedition.js'])vm.runInContext(readFileSync(new URL(f,root),'utf8'),scope,{filename:f});
const layout=JSON.parse(readFileSync(new URL('night-layout.json',root),'utf8')),clone=v=>JSON.parse(JSON.stringify(v));
function make(){let now=100;const game=scope.createSoloExpedition({layout,clock:()=>now,seed:42,controlled:true,worldRevision:'input-test-world'});return {game,step(n=1){for(let i=0;i<n;i++){now+=1/60+1e-10;game.tick();}return game.snapshot();}};}
function enter(f,id='a',action='solo'){return f.game.command({action,id,name:id,character:{height:175,shoulders:1}},id);}
function frames(state,count=3,options={}){const a=state.selfInput,first=Math.max(a.lastFinalizedSeq+1,options.seq??0);return Array.from({length:count},(_,i)=>({seq:first+i,tick:a.anchorTick+first+i,heldMask:17,edges:0,yaw:Math.PI,pitch:0,actions:[],...options.frame}));}
test('input packets do not advance simulation; positions and modes cannot be submitted',()=>{
 const f=make(),start=enter(f);const packet=frames(start);for(let i=0;i<40;i++)f.game.command({action:'inputs',frames:packet},'a');const received=f.game.snapshot('a');assert.equal(received.simulationTick,0);assert.equal(received.players[0].z,start.players[0].z);
 assert.throws(()=>f.game.command({action:'pose',seq:1,pose:{x:1,y:0,z:0,yaw:0}},'a'),/sequenced inputs/);
 for(const extra of [{x:0},{movement:'wallrun'},{dt:100},{height:20},{velocity:[0,0,99]}])assert.throws(()=>f.game.command({action:'inputs',frames:packet.map(p=>({...p,...extra}))},'a'),/Invalid/);
 f.step(8);const after=f.game.snapshot('a');assert.ok(after.players[0].z<start.players[0].z);assert.equal(after.selfInput.lastAppliedSeq,2);assert.equal(after.selfInput.lastFinalizedSeq,2);assert.equal(after.selfInput.controller.tick,8);
});
test('late, duplicate, reordered, unsafe and oversized inputs cannot buy time or replay edges',()=>{
 const f=make(),start=enter(f),packet=frames(start,3,{frame:{edges:1}});f.game.command({action:'inputs',frames:packet},'a');
 for(const bad of [[packet[1],packet[0]],[{...packet[0],seq:Number.MAX_SAFE_INTEGER+1}],[{...packet[0],tick:600}],[{...packet[0],heldMask:128}],Array.from({length:13},(_,i)=>({...packet[0],seq:i,tick:6+i}))])assert.throws(()=>f.game.command({action:'inputs',frames:bad},'a'));
 f.step(30);const old=clone(f.game.snapshot('a'));f.game.command({action:'inputs',frames:packet},'a');assert.deepEqual(clone(f.game.snapshot('a')),old);assert.equal(old.selfInput.lastAppliedSeq,2);assert.equal(old.selfInput.lastFinalizedSeq,24);
});
test('missing releases become neutral while gravity continues and reconnect gets a fresh input anchor',()=>{
 const f=make(),start=enter(f);f.game.command({action:'inputs',frames:frames(start,1,{frame:{heldMask:17,edges:1}})},'a');f.step(6);assert.ok(f.game.snapshot('a').players[0].y>0);
 f.game.command({action:'disconnect'},'a');f.step(120);const end=f.game.snapshot('a');assert.equal(end.players[0].y,0);assert.equal(end.selfInput.controller.heldMask,0);
 const resumed=f.game.resumeInputs('a');assert.equal(resumed.selfInput.lastFinalizedSeq,-1);assert.equal(resumed.selfInput.anchorTick,resumed.simulationTick+6);assert.throws(()=>f.game.command({action:'inputs',frames:frames(start)},'a'));
});
test('six actors use the same controller and input queues survive a tick-boundary checkpoint',()=>{
 const f=make();enter(f,'a','create');for(const id of ['b','c','d','e','f'])enter(f,id,'join');for(const id of ['a','b','c','d','e','f'])f.game.command({action:'ready'},id);f.game.command({action:'start'},'a');
 for(const id of ['a','b','c','d','e','f'])f.game.command({action:'inputs',frames:frames(f.game.snapshot(id),12,{frame:{edges:1}})},id);f.step(10);
 const cp=clone(f.game.exportCheckpoint()),g=make();g.game.restoreCheckpoint(cp);assert.equal(cp.version,2);assert.equal(cp.inputActors.length,6);
 for(let i=0;i<35;i++){f.step();g.step();for(const id of ['a','b','c','d','e','f']){const a=f.game.snapshot(id),b=g.game.snapshot(id);assert.deepEqual(clone(a.selfInput),clone(b.selfInput));assert.deepEqual(clone(a.players.map(p=>[p.x,p.y,p.z,p.movement])),clone(b.players.map(p=>[p.x,p.y,p.z,p.movement])));}}
});
test('shared movement independently replayed in a prediction controller matches room-authoritative state',()=>{
 const f=make(),start=enter(f),prediction=scope.createExpeditionController({T:scope.THREE,world:f.game.world,layout,worldRevision:'input-test-world',character:start.players[0].character});prediction.restoreState(start.selfInput.controller);
 const all=frames(start,12,{frame:{heldMask:17,edges:0}});all[3].edges=1;f.game.command({action:'inputs',frames:all},'a');
 for(let tick=1;tick<=40;tick++){const input=all.find(p=>p.tick===tick)||{heldMask:0,edges:0,yaw:Math.PI,pitch:0};prediction.step(input);f.step();assert.deepEqual(clone(prediction.captureState()),clone(f.game.snapshot('a').selfInput.controller));}
});

test('prediction reconciles complete state under latency, jitter, reordering and dropped requests',()=>{
 for(const delay of [0,6,15]){
  const f=make(),start=enter(f),controller=scope.createExpeditionController({T:scope.THREE,world:f.game.world,layout,worldRevision:'input-test-world',character:start.players[0].character}),prediction=scope.createExpeditionPrediction({controller,leadTicks:delay+6}),requests=[],snapshots=[];prediction.accept(start);
  for(let i=0;i<600;i++){
   prediction.step({heldMask:i<300?17:0,edges:i===80?1:0,yaw:Math.PI,pitch:0,actions:[]});
   if(i%3===0&&i%21!==0&&prediction.batch().length)requests.push({at:i+delay+(i%4),frames:clone(prediction.batch())});
   for(const p of requests.filter(p=>p.at<=i).reverse())f.game.command({action:'inputs',frames:p.frames},'a');for(let j=requests.length-1;j>=0;j--)if(requests[j].at<=i)requests.splice(j,1);
   f.step();if(i%6===0)snapshots.push({at:i+delay+(i%5),value:clone(f.game.snapshot('a'))});
   for(const p of snapshots.filter(p=>p.at<=i).reverse())prediction.accept(p.value);for(let j=snapshots.length-1;j>=0;j--)if(snapshots[j].at<=i)snapshots.splice(j,1);
   assert.ok(prediction.inspect().pending<=60);assert.ok(prediction.inspect().outbound<=60);
  }
  const authoritative=f.game.snapshot('a');assert.equal(authoritative.simulationTick,600);assert.ok(authoritative.players[0].z<start.players[0].z-5,'inputs must actually arrive and move the actor');
  prediction.accept(authoritative);const expected=scope.createExpeditionController({T:scope.THREE,world:f.game.world,layout,worldRevision:'input-test-world',character:start.players[0].character});expected.restoreState(authoritative.selfInput.controller);
  while(expected.tick<controller.tick)expected.step({heldMask:0,edges:0,yaw:Math.PI,pitch:0});
  assert.deepEqual(clone(controller.captureState()),clone(expected.captureState()));
 }
});
test('authoritative checkpoints reject corruption without partially replacing the running room',()=>{
 const f=make();enter(f);f.step(8);const before=clone(f.game.exportCheckpoint());const bad=clone(before);bad.inputActors[0].controller.movement.vault={};assert.throws(()=>f.game.restoreCheckpoint(bad));assert.deepEqual(clone(f.game.exportCheckpoint()),before);
});
