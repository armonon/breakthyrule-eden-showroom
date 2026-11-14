import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=fileURLToPath(new URL('../../',import.meta.url));
class Grid{setWalkableAt(){}clone(){return this;}}
class AStarFinder{findPath(a,b,c,d){return [[a,b],[c,d]];}}
function setup({clockStart=0,spawn=[0,0],bounds=[-3,3,-3,3],boxes=[]}={}){
 let time=clockStart;const c={structuredClone,performance,console,NightPathfinding:{Grid,AStarFinder}};vm.createContext(c);
 for(const name of ['expedition-world.js','solo-expedition.js'])vm.runInContext(fs.readFileSync(fs.existsSync(path.join(root,name))?path.join(root,name):path.join(__dirname,'test-support',name),'utf8'),c);
 const layout={bounds,spawn,exit:[0,-3],landmarks:[],pages:[{id:0,title:'Test page',site:'test',sockets:[[0,0]]}]};
 const world=c.createExpeditionWorld({layout,roofs:{}});world.boxes.push(...boxes);
 const rules=c.createSoloExpedition({layout,world,clock:()=>time,seed:1});rules.command({action:'solo'});
 const checkpoint=rules.exportCheckpoint();checkpoint.room.bell={x:0,y:0,z:0};
 // Production's trusted restore restores the canonical bell; supply a test
 // landmark-free spawn at that bell when a bell interaction is needed instead.
 return {rules,world,clock:()=>time,advance:delta=>{time+=delta;return rules.tick();},run:seconds=>{let s;for(let i=0;i<Math.ceil(seconds*60);i++){time+=1/60;s=rules.tick();}return s;}};
}
function hunt(s,extra={}){const cp=s.rules.exportCheckpoint();cp.room.huntStarted=true;cp.room.huntStartedAt=s.clock()-20;cp.room.countdownUntil=null;cp.room.watcher={x:0,y:0,z:-2,yaw:0,state:'waiting',repelledUntil:0,...extra};s.rules.restoreCheckpoint(cp);return s.rules.snapshot();}
test('countdown HUD uses the same pause policy after a long scheduling gap',()=>{
 const s=setup({clockStart:10});const cp=s.rules.exportCheckpoint();cp.room.countdownUntil=13;cp.room.watcher={x:0,y:0,z:-2,yaw:0,state:'waiting',repelledUntil:0};s.rules.restoreCheckpoint(cp);
 const after=s.advance(10);assert.equal(after.huntStarted,false);assert.ok(after.countdownUntil-after.serverTime>2.7);assert.ok(after.serverTime<10.3);
 const active=s.run(3);assert.equal(active.huntStarted,true);assert.equal(active.countdownUntil,null);
});
test('flare cooldown and reload share simulation time during suspension',()=>{
 const s=setup({clockStart:20});hunt(s);
 const pose={x:0,y:0,z:0,yaw:Math.PI,pitch:0,movement:'ground'};
 const shot=s.rules.command({action:'flare',seq:1,pose});assert.equal(shot.players[0].magazine,1);
 s.advance(10);assert.throws(()=>s.rules.command({action:'flare'}),/cooling down/);
 s.run(1);s.rules.command({action:'reload'});s.advance(10);assert.equal(s.rules.snapshot().players[0].magazine,1);
 s.run(1.6);assert.equal(s.rules.snapshot().players[0].magazine,2);assert.equal(s.rules.snapshot().players[0].reserve,0);
});
test('shot uses latest validated aim rather than the previous periodic pose',()=>{
 const s=setup({clockStart:20});hunt(s,{z:2});
 s.rules.command({action:'pose',seq:1,pose:{x:0,y:0,z:0,yaw:Math.PI,pitch:0,movement:'ground'}});
 const shot=s.rules.command({action:'flare',seq:2,pose:{x:0,y:0,z:0,yaw:0,pitch:0,movement:'ground'}});
 assert.equal(shot.players[0].flareOutcome,'repelled');assert.equal(shot.players[0].magazine,1);assert.equal(shot.players[0].seq,2);
});
test('invalid or stale action poses do not spend ammunition',()=>{
 const s=setup({clockStart:20});hunt(s);
 s.rules.command({action:'pose',seq:1,pose:{x:0,y:0,z:0,yaw:0,pitch:0,movement:'ground'}});
 assert.throws(()=>s.rules.command({action:'flare',seq:1,pose:{x:0,y:0,z:0,yaw:Math.PI,pitch:0,movement:'ground'}}),/Stale/);
 assert.throws(()=>s.rules.command({action:'flare',seq:2,pose:{x:2,y:0,z:2,yaw:Math.PI,pitch:0,movement:'ground'}}),/synchronizing/);
 assert.equal(s.rules.snapshot().players[0].magazine,2);
});
test('traversal pose interrupts reload before the next regular pose send',()=>{
 const s=setup({clockStart:20});hunt(s);s.rules.command({action:'flare'});s.rules.command({action:'reload'});
 assert.throws(()=>s.rules.command({action:'reload',seq:1,pose:{x:0,y:0,z:0,yaw:0,pitch:0,movement:'ragdoll'}}),/Hands are busy/);
 assert.equal(s.rules.snapshot().players[0].reloadUntil,0);s.run(2);assert.equal(s.rules.snapshot().players[0].magazine,1);
});
test('checkpoint timers retain remaining time after paused simulation',()=>{
 const s=setup({clockStart:20});hunt(s);s.rules.command({action:'flare'});s.rules.command({action:'reload'});s.advance(10);
 const cp=s.rules.exportCheckpoint(),remaining=cp.room.players[0].reloadUntil-cp.savedAt;
 const other=setup({clockStart:100});const result=other.rules.restoreCheckpoint(cp);
 assert.ok(Math.abs(result.players[0].reloadUntil-result.serverTime-remaining)<1e-8);assert.equal(result.players[0].magazine,1);
});
test('Watcher fallback ascent never crosses an overhead slab',()=>{
 const s=setup({clockStart:20,spawn:[1.5,0],boxes:[{minX:1,maxX:3,minZ:-1,maxZ:1,bottom:-1,top:2},{minX:-1,maxX:.95,minZ:-1,maxZ:1,bottom:1.8,top:2.1}]});
 const cp=s.rules.exportCheckpoint();cp.room.players[0].y=2;cp.room.players[0].yaw=Math.PI;cp.room.watcher={x:0,y:0,z:0,yaw:0,state:'stalking',repelledUntil:0};cp.room.huntStarted=true;cp.room.huntStartedAt=0;s.rules.restoreCheckpoint(cp);
 let highest=0;for(let i=0;i<360;i++){const state=s.advance(1/60);highest=Math.max(highest,state.watcher.y);}
 assert.ok(highest<=.151,'Watcher entered the overhead slab: feet height '+highest);
});

test('rejected movement cannot change accepted aim, stance or interrupt reload',()=>{
 const s=setup({clockStart:20});hunt(s);s.rules.command({action:'flare'});s.rules.command({action:'reload'});
 const before=s.rules.snapshot().players[0];const after=s.rules.command({action:'pose',seq:1,pose:{x:2,y:50,z:2,yaw:1,pitch:.5,movement:'ragdoll'}}).players[0];
 assert.equal(after.poseRejected,true);for(const key of ['x','y','z','yaw','pitch','movement','reloadUntil'])assert.equal(after[key],before[key],key);
});
test('unsafe, unbounded and unknown-mode inputs cannot consume the sequence or pose',()=>{
 const s=setup({clockStart:20}),before=s.rules.snapshot().players[0],pose={x:0,y:0,z:0,yaw:0,movement:'ground'};
 for(const seq of [-1,257,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>s.rules.command({action:'pose',seq,pose}),/Invalid/);
 assert.throws(()=>s.rules.command({action:'pose',seq:1,pose:{...pose,movement:'flying'}}),/Invalid/);assert.deepEqual(s.rules.snapshot().players[0],before);
});
test('public interruption cancels reload without clearing an accepted busy stance',()=>{
 const s=setup({clockStart:20});hunt(s);s.rules.command({action:'pose',seq:1,pose:{x:0,y:0,z:0,yaw:0,movement:'ragdoll'}});s.rules.command({action:'interrupt',reason:'walk'});assert.equal(s.rules.snapshot().players[0].movement,'ragdoll');assert.throws(()=>s.rules.command({action:'flare'}),/Hands are busy/);
});
test('disconnecting during the hunt leaves a capturable body and no frozen gaze',()=>{
 const s=setup({clockStart:20});hunt(s,{x:0,y:0,z:.6});s.rules.command({action:'disconnect'});s.run(.8);const end=s.rules.snapshot();assert.equal(end.players[0].status,'caught');assert.equal(end.phase,'lost');
});
