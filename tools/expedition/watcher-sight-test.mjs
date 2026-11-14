import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const context=vm.createContext({structuredClone,performance});
for(const file of ['assets/night-pathfinding.js','expedition-world.js','solo-expedition.js']){
 vm.runInContext(readFileSync(new URL('../../'+file,import.meta.url),'utf8'),context);
}

// Trusted checkpoints arrange geometry fixtures only. These tests exercise the
// actual fixed-step hunt rules, not browser route or animation acceptance.
function fixture({height=175,movement='ground',pitch=0,yaw=0,watcher={x:0,y:0,z:3},boxes=[],field=null}={}){
 let now=100;
 const layout={bounds:[-8,8,-8,8],spawn:[0,0],exit:[0,-8],landmarks:[],pages:[{id:0,title:'Page',site:'test',sockets:[[0,0]]}]};
 if(field)layout.landmarks.push({id:'test',x:0,z:0,w:4,d:4,h:field.h[0]});
 const world=context.createExpeditionWorld({layout,roofs:field?{test:field}:{}});
 world.boxes.push(...boxes);
 const game=context.createSoloExpedition({layout,world,clock:()=>now,seed:1});
 game.command({action:'solo',character:{height}});
 const checkpoint=game.exportCheckpoint();
 checkpoint.room.huntStarted=true;checkpoint.room.huntStartedAt=80;
 Object.assign(checkpoint.room.players[0],{movement,pitch,yaw});
 Object.assign(checkpoint.room.watcher,watcher);
 game.restoreCheckpoint(checkpoint);
 return {game,world,advance(seconds){for(let left=seconds;left>1e-8;){const dt=Math.min(left,1/60);now+=dt;left-=dt;game.tick();}return game.snapshot();}};
}

test('looking straight up or down cannot observe a Watcher ahead at ground level',()=>{
 const facing=fixture().advance(.5);
 assert.equal(facing.watcher.state,'observed');assert.ok(facing.players[0].dread>0);
 for(const pitch of [Math.PI/2,-Math.PI/2]){
  const lookingAway=fixture({pitch}).advance(.5);
  assert.equal(lookingAway.watcher.state,'stalking');
  assert.equal(lookingAway.players[0].dread,0);
  assert.ok(lookingAway.watcher.z<facing.watcher.z,'unobserved pursuit is not slowed');
 }
});

test('elevated Watchers require vertical aim and can be observed when correctly aimed at',()=>{
 for(const height of [145,175,210]){
  const watcher={x:0,y:5,z:3},pitch=Math.atan2(5+1.3-height/100*.94,3);
  assert.equal(fixture({height,watcher}).advance(.1).watcher.state,'stalking');
  const aimed=fixture({height,watcher,pitch}).advance(.1);
  assert.equal(aimed.watcher.state,'observed');assert.ok(aimed.players[0].dread>0);
 }
});

test('standing and crouched sight use the selected character height',()=>{
 const cover={minX:-2,maxX:2,minZ:1.45,maxZ:1.55,bottom:-1,top:1.4};
 assert.equal(fixture({height:145,boxes:[cover]}).advance(.1).watcher.state,'stalking');
 assert.equal(fixture({height:210,boxes:[cover]}).advance(.1).watcher.state,'observed');
 assert.equal(fixture({height:210,movement:'crouch',boxes:[cover]}).advance(.1).watcher.state,'stalking');
});

test('steady crouch gaze matches the rendered eye offset instead of the collision capsule height',()=>{
 const edge=top=>({minX:-2,maxX:2,minZ:.35,maxZ:.45,bottom:-1,top});
 // The short player's eye is 81.3cm, not 92.7cm: a nearby 93cm edge hides it.
 const short=fixture({height:145,movement:'crouch',boxes:[edge(.93)]}).advance(.1);
 assert.equal(short.watcher.state,'stalking');assert.equal(short.players[0].dread,0);
 // The tall player's eye is 142.4cm, not 134.2cm: a 137cm edge remains visible over.
 const tall=fixture({height:210,movement:'crouch',boxes:[edge(1.37)]}).advance(.1);
 assert.equal(tall.watcher.state,'observed');assert.ok(tall.players[0].dread>0);
});

for(const measured of [false,true])test(`ragdoll cannot be captured through a ${measured?'measured':'box'} low roof`,()=>{
 const slab={minX:-2,maxX:2,minZ:-2,maxZ:2,bottom:.75,top:.95};
 const field={minX:-2,minZ:-2,cell:1,cols:4,rows:4,h:Array(16).fill(.95),eave:.95};
 const f=fixture({movement:'ragdoll',watcher:{x:0,y:.95,z:0},...(measured?{field}:{boxes:[slab]})});
 const initial=f.game.snapshot();
 assert.ok(f.world.clearance.fits(initial.players[0],.65,.26),'ragdoll fits below the roof');
 assert.ok(f.world.clearance.fits(initial.watcher,1.65,.26),'Watcher fits above the roof');
 assert.ok(f.world.clearance.ray({x:.1,y:.35,z:.1},{x:0,y:1,z:0},2),'solid roof separates their bodies');
 const result=f.advance(1);
 assert.equal(result.players[0].status,'alive');assert.equal(result.phase,'playing');
});

test('standing, crouched and ragdolled players remain capturable without cover at every body size',()=>{
 for(const height of [145,175,210])for(const movement of ['ground','crouch','ragdoll']){
  const result=fixture({height,movement,yaw:Math.PI,watcher:{x:0,y:0,z:.6}}).advance(.8);
  assert.equal(result.players[0].status,'caught',`${height}cm ${movement}`);
  assert.equal(result.phase,'lost');
 }
});

test('solid walls block both observation and capture instead of relying on distance alone',()=>{
 const wall={minX:-8,maxX:8,minZ:.25,maxZ:.35,bottom:-1,top:8};
 const result=fixture({watcher:{x:0,y:0,z:.6},boxes:[wall]}).advance(1);
 assert.equal(result.players[0].status,'alive');assert.equal(result.players[0].dread,0);
 assert.notEqual(result.watcher.state,'observed');
});
