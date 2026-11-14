import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const base=new URL('../../',import.meta.url),context=vm.createContext({structuredClone,performance});context.window=context;
for(const file of ['assets/night-pathfinding.js','expedition-world.js','solo-expedition.js'])vm.runInContext(readFileSync(new URL(file,base),'utf8'),context);
const layout={bounds:[-40,40,-110,40],spawn:[0,0],exit:[0,-110],landmarks:[{id:'temple',x:0,z:-30,w:12,d:12,h:7}],pages:[{id:0,title:'Test page',site:'temple',sockets:[[0,0]]}]};
function fixture({angle=0,distance=8,y=0,flareBalance}={}){
  let now=100;const game=context.createSoloExpedition({layout,roofs:{},clock:()=>now,random:()=>0,flareBalance});game.command({action:'solo'});
  const cp=game.exportCheckpoint();cp.room.huntStarted=true;cp.room.huntStartedAt=now;cp.room.players[0].yaw=0;
  Object.assign(cp.room.watcher,{x:Math.sin(angle*Math.PI/180)*distance,z:Math.cos(angle*Math.PI/180)*distance,y});game.restoreCheckpoint(cp);
  return {game,shot:(data={})=>game.command({action:'flare',...data}),advance(seconds){for(let left=seconds;left>1e-8;){const dt=Math.min(left,1/60);now+=dt;left-=dt;game.tick();}return game.snapshot();}};
}
test('direct aim works without assistance; default repulsion is two seconds and ammo stays2+1',()=>{
  const f=fixture(),state=f.shot(),p=state.players[0];
  assert.equal(state.watcher.state,'repelled');assert.equal(p.flareAssisted,false);assert.equal(p.magazine,1);assert.equal(p.reserve,1);assert.equal(p.flares,2);
  assert.equal(state.flareRules.duration,2);assert.ok(Math.abs(state.watcher.repelledUntil-state.serverTime-2)<.01);
  assert.throws(()=>f.shot(),/cooling/);assert.equal(f.game.snapshot().players[0].magazine,1);
  assert.notEqual(f.advance(2.1).watcher.state,'repelled');
});
test('assistance is strictly opt-in, bounded and cannot use client claimed target/yaw',()=>{
  assert.equal(fixture({angle:30}).shot().players[0].flareOutcome,'miss');
  assert.equal(fixture({angle:30}).shot({aimAssist:'true'}).players[0].flareOutcome,'miss');
  const assisted=fixture({angle:30}).shot({aimAssist:true});assert.equal(assisted.players[0].flareAssisted,true);assert.equal(assisted.watcher.state,'repelled');
  for(const angle of [40,90,180])assert.equal(fixture({angle}).shot({aimAssist:true,yaw:angle*Math.PI/180,hit:true}).players[0].flareOutcome,'miss');
  assert.equal(fixture({angle:30,distance:16}).shot({aimAssist:true,range:100}).players[0].flareOutcome,'miss');
  assert.equal(fixture({distance:3,y:3}).shot({aimAssist:true,pitch:1}).players[0].flareOutcome,'miss');
});
test('low cover blocks the muzzle even when eye sight and target path are clear',()=>{
  const f=fixture();f.game.world.boxes.push({minX:.1,maxX:.25,minZ:.1,maxZ:.3,bottom:0,top:1.15});
  const before=f.game.snapshot();assert.equal(f.game.world.sight(before.players[0],before.watcher),true);
  const state=f.shot({aimAssist:true});assert.equal(state.players[0].flareOutcome,'obstructed');assert.equal(state.players[0].magazine,1);assert.notEqual(state.watcher.state,'repelled');
});
test('target cover and rooftop vertical angle cannot be bypassed by assistance',()=>{
  const f=fixture({angle:30});f.game.world.boxes.push({minX:-2,maxX:6,minZ:3,maxZ:3.5,bottom:0,top:5});
  assert.equal(f.shot({aimAssist:true}).players[0].flareOutcome,'obstructed');
  assert.notEqual(fixture({distance:2,y:8}).shot({aimAssist:true}).watcher.state,'repelled');
});
test('busy hands and active reload deny firing without spending rounds',()=>{
  for(const movement of ['bail','ragdoll','hang','mantle','climb','vault','scramble']){
    const f=fixture();f.game.command({action:'pose',seq:1,pose:{x:0,y:0,z:0,yaw:0,movement}});assert.equal(f.game.snapshot().players[0].movement,movement);assert.throws(()=>f.shot({aimAssist:true}),/Hands are busy/);assert.equal(f.game.snapshot().players[0].magazine,2);
  }
  const f=fixture();f.shot();f.game.command({action:'reload'});assert.throws(()=>f.shot({aimAssist:true}),/Reloading/);assert.equal(f.game.snapshot().players[0].magazine,1);
  f.advance(1.6);assert.equal(f.game.snapshot().players[0].magazine,2);assert.equal(f.game.snapshot().players[0].reserve,0);
});
test('only trusted constructor balance changes bounded duration/range/cooldown',()=>{
  const f=fixture({flareBalance:{duration:3,cooldown:1.5,range:12}}),state=f.shot({duration:100,range:100,cooldown:0});
  assert.equal(state.flareRules.duration,3);assert.equal(state.flareRules.cooldown,1.5);assert.equal(state.flareRules.range,12);
  assert.ok(Math.abs(state.watcher.repelledUntil-state.serverTime-3)<.01);
  const bounded=fixture({flareBalance:{duration:999,cooldown:-10,range:NaN}}).game.snapshot().flareRules;
  assert.equal(bounded.duration,6);assert.equal(bounded.cooldown,.25);assert.equal(bounded.range,14);
});

test('vertical aim uses stored pose pitch, not shot claims; upward aim permits elevated target',()=>{
  const lookingAway=fixture();lookingAway.game.command({action:'pose',seq:1,pose:{x:0,y:0,z:0,yaw:0,pitch:-Math.PI/3}});
  assert.equal(lookingAway.shot({aimAssist:true,pitch:0}).players[0].flareOutcome,'miss');
  const elevated=fixture({distance:3,y:3});
  elevated.game.command({action:'pose',seq:1,pose:{x:0,y:0,z:0,yaw:0,pitch:Math.atan2(3.15,3)}});
  assert.equal(elevated.shot().players[0].flareOutcome,'repelled');
  assert.ok(elevated.game.snapshot().players[0].pitch>.7);
});

test('pitch defaults and checkpoint compatibility are safe; invalid pitch is rejected atomically',()=>{
  const f=fixture();assert.equal(f.game.snapshot().players[0].pitch,0);
  for(const pitch of [Infinity,NaN,'0',Math.PI,-Math.PI])assert.throws(()=>f.game.command({action:'pose',seq:1,pose:{x:0,y:0,z:0,yaw:0,pitch}}),/Invalid position/);
  assert.equal(f.game.snapshot().players[0].seq,-1);
  f.game.command({action:'pose',seq:1,pose:{x:0,y:0,z:0,yaw:0,pitch:.4}});
  const saved=f.game.exportCheckpoint();f.game.restoreCheckpoint(saved);assert.equal(f.game.snapshot().players[0].pitch,.4);
  delete saved.room.players[0].pitch;f.game.restoreCheckpoint(saved);assert.equal(f.game.snapshot().players[0].pitch,0);
  saved.room.players[0].pitch=Infinity;assert.throws(()=>f.game.restoreCheckpoint(saved),/checkpoint player/);assert.equal(f.game.snapshot().players[0].pitch,0);
});

test('safe solo exploration reset preserves identity, inventory and sequence but clears movement state',()=>{
  const f=fixture(),cp=f.game.exportCheckpoint();cp.room.huntStarted=false;cp.room.huntStartedAt=null;
  Object.assign(cp.room.players[0],{x:4,y:0,z:5,seq:42,magazine:1,reserve:1,pitch:.5,movement:'hang',checkpoint:{x:4,y:0,z:5},reloadUntil:101});
  f.game.restoreCheckpoint(cp);const reset=f.game.command({action:'reset-exploration'}),p=reset.players[0];
  assert.equal(p.id,'wanderer');assert.equal(p.x,layout.spawn[0]);assert.equal(p.z,layout.spawn[1]);assert.equal(p.y,0);assert.equal(p.pitch,0);
  assert.equal(p.seq,42);assert.equal(p.magazine,1);assert.equal(p.reserve,1);assert.equal(p.checkpoint,null);assert.equal(p.reloadUntil,0);assert.equal(p.movement,'walk');
  const stale=f.game.command({action:'pose',seq:41,pose:{x:4,y:0,z:5,yaw:0}});assert.equal(stale.players[0].x,layout.spawn[0]);
  assert.throws(()=>fixture().game.command({action:'reset-exploration'}),/safe solo exploration/);
  const countdown=structuredClone(cp);countdown.room.countdownUntil=103;f.game.restoreCheckpoint(countdown);assert.throws(()=>f.game.command({action:'reset-exploration'}),/safe solo exploration/);
  const shared=structuredClone(cp);shared.room.solo=false;f.game.restoreCheckpoint(shared);assert.throws(()=>f.game.command({action:'reset-exploration'}),/safe solo exploration/);
  const caught=structuredClone(cp);caught.room.players[0].status='caught';f.game.restoreCheckpoint(caught);assert.throws(()=>f.game.command({action:'reset-exploration'}),/ended/);
});
