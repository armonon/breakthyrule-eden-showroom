import test from 'node:test';import assert from 'node:assert/strict';
import {loadExpeditionRuntime} from '../../server/expedition-runtime.mjs';
import {createPlayerBailWithWorld} from '../../player-bail.js';
import {createRagdoll} from '../../ragdoll-jolt.js';
const runtime=await loadExpeditionRuntime(),{T}=runtime;
test('all eight selected Rocketbox rigs use real shaped joints at small and large character sizes',async()=>{
 for(const id of ['boulevard','harbor','midnight','coast','riviera','marina','garden','sunset'])for(const height of [145,210]){
  const model=runtime.characterRig({version:1,character:id,height,shoulders:height===145?.8:1.3,hips:height===145?.8:1.35,legLength:height===145?.9:1.1}),world=await runtime.physicsWorld();let recovered=null,steps=0;
  const step=world.step;world.step=dt=>{steps++;assert.equal(dt,1/120);step(dt);};
  model.root.position.set(0,2,0);model.root.updateMatrixWorld(true);
  const bail=createPlayerBailWithWorld({T,world,getModel:()=>model,bodyDimensions:()=>runtime.scope.playerBodyProfile(model.appearance),groundHeight:()=>0,floorAt:()=>0,canStand:()=>true,collisionBoxes:()=>[{minX:2,maxX:2.3,minZ:-20,maxZ:20,bottom:-1,top:20}],onRecover:p=>recovered=p});
  try{assert.equal(model.skeleton.bones.length,52);assert.equal(model.root.scale.x,height/175);assert.equal(bail.start({velocity:new T.Vector3(6,-2,0)}),true);assert.equal(bail.inspect().parts,14);assert.ok(Math.abs(bail.pose().vx-6)<1e-6);let gap=0;
   for(let i=0;i<600;i++){bail.update(1/60);const s=bail.inspect();gap=Math.max(gap,s.jointGap);assert.ok(bail.pose().x<2.1,`${id}/${height}: wall`);assert.ok(bail.pose().y>=-.01,`${id}/${height}: floor`);}
   assert.equal(steps,1200,'each actor world steps exactly twice per room tick');assert.ok(gap<.15,`${id}/${height}: joint gap ${gap}`);assert.equal(bail.inspect().settled,true,`${id}/${height}: settles`);bail.requestRecovery();for(let i=0;i<60;i++)bail.update(1/60);assert.ok(recovered,`${id}/${height}: recovers`);assert.equal(recovered.position[1],0);assert.equal(bail.active,false);
  }finally{bail.dispose();world.dispose();model.dispose();}
 }
});
test('six selected characters can bail simultaneously in independent worlds without extra world steps',async()=>{
 const characters=['boulevard','harbor','midnight','coast','riviera','marina'],actors=await Promise.all(characters.map(async(id,i)=>{const model=runtime.characterRig({version:1,character:id,height:145+i*13}),world=await runtime.physicsWorld();let steps=0;const step=world.step;world.step=dt=>{steps++;step(dt);};model.root.position.set(i*2,3,0);model.root.updateMatrixWorld(true);const bail=createPlayerBailWithWorld({T,world,getModel:()=>model,groundHeight:()=>0,floorAt:()=>0,canStand:()=>true,bodyDimensions:()=>runtime.scope.playerBodyProfile(model.appearance)});bail.start({velocity:new T.Vector3(i*.5,-1,0)});return {model,world,bail,steps:()=>steps};}));
 try{for(let i=0;i<360;i++)for(const a of actors)a.bail.update(1/60);for(const a of actors){assert.equal(a.steps(),720);assert.equal(a.bail.inspect().parts,14);assert.equal(a.bail.inspect().settled,true);assert.ok(a.bail.inspect().jointGap<.08);}}finally{for(const a of actors){a.bail.dispose();a.world.dispose();a.model.dispose();}}
});
test('repeated selected-rig creation releases native constructor allocations',async()=>{
 const world=await runtime.physicsWorld(),floor=world.box([0,-.5,0],[100,.5,100]),characters=['boulevard','harbor','midnight','coast','riviera','marina','garden','sunset'];let baseline;
 try{for(let i=0;i<128;i++){const model=runtime.characterRig({version:1,character:characters[i%8],height:i%16<8?145:210}),rag=createRagdoll(world,T,model);rag.start({velocity:new T.Vector3(1,-1,0)});for(let n=0;n<8;n++)world.step(1/120);rag.dispose();model.dispose();assert.equal(world.system.GetNumBodies(),1);const bytes=world.jolt.sGetTotalMemory()-world.jolt.sGetFreeMemory();if(i===15)baseline=bytes;else if(i>15)assert.equal(bytes,baseline,'native allocations plateau after all shapes have warmed');}}
 finally{floor.remove();world.dispose();}
});
