import test from 'node:test';import assert from 'node:assert/strict';
import {loadExpeditionRuntime} from '../../server/expedition-runtime.mjs';
import {createPlayerBailWithWorld} from '../../player-bail.js';
import {captureJoltState,restoreJoltState} from '../../jolt-state.js';
const runtime=await loadExpeditionRuntime(),{T}=runtime;
async function actor(){const model=runtime.characterRig({version:1,character:'midnight',height:193,shoulders:1.18}),world=await runtime.physicsWorld();model.root.position.set(0,3,0);model.root.updateMatrixWorld(true);
 const bail=createPlayerBailWithWorld({T,world,getModel:()=>model,groundHeight:()=>0,floorAt:()=>0,canStand:()=>true,bodyDimensions:()=>runtime.scope.playerBodyProfile(model.appearance),collisionBoxes:()=>[{minX:2,maxX:2.3,minZ:-20,maxZ:20,bottom:-1,top:20}]});
 return {model,world,bail,dispose(){bail.dispose();world.dispose();model.dispose();}};
}
const observed=a=>({pose:a.bail.pose(),state:a.bail.inspect(),root:a.model.root.position.toArray(),bones:a.model.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray()])});
for(const at of [19,100,360])test(`actual selected ragdoll restores complete solver state after ${at} ticks`,async()=>{
 const source=await actor();let restored;
 try{
  source.bail.start({velocity:new T.Vector3(6,-2,.3)});for(let i=0;i<at;i++)source.bail.update(1/60);
  const js=JSON.parse(JSON.stringify(source.bail.captureState())),bytes=captureJoltState(source.world),owned=bytes.slice(),expected=[];
  for(let i=0;i<120;i++){source.bail.update(1/60);expected.push(observed(source));}
  assert.deepEqual(bytes,owned,'checkpoint owns memory independent of later solver writes');
  restored=await actor();restored.bail.restoreState(js);assert.equal(restoreJoltState(restored.world,bytes),true);
  for(let i=0;i<120;i++){restored.bail.update(1/60);assert.deepEqual(observed(restored),expected[i],`continued step ${i}`);}
 }finally{source.dispose();restored?.dispose();}
});
