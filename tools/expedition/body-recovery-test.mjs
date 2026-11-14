import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as T from 'three';
import {createJoltWorld} from '../../ragdoll-jolt.js';
import {createPlayerBail} from '../../player-bail.js';
const scope={window:{}};
for(const file of ['assets/character-human-base.js','expedition-world.js'])vm.runInNewContext(readFileSync(new URL('../../'+file,import.meta.url),'utf8'),scope);
function human(height){const data=scope.window.GardenHumanBase,root=new T.Group(),scale=height/16.6589;
 const points=data.bones.map(b=>new T.Vector3(b.position[0],b.position[1]+8.1676,b.position[2]).multiplyScalar(scale));
 const bones=data.bones.map((b,i)=>{const bone=new T.Bone();bone.name=b.name;bone.position.copy(points[i]);if(b.parent>=0)bone.position.sub(points[b.parent]);return bone;});
 data.bones.forEach((b,i)=>{if(b.parent>=0)bones[b.parent].add(bones[i]);else root.add(bones[i]);});
 const skeleton=new T.Skeleton(bones);root.rotation.z=Math.PI/2;root.position.y=.5;root.updateMatrixWorld(true);skeleton.calculateInverses();
 return {root,skeleton,byName:Object.fromEntries(bones.map(b=>[b.name,b])),motion:{update(){}}};}
test('real Jolt recovery respects small and large standing dimensions under a low roof',async()=>{
 const world=await createJoltWorld({moduleURL:new URL('../../assets/vendor/jolt-physics-1.1.1/jolt-physics.wasm.js',import.meta.url).href,moduleOptions:{wasmBinary:readFileSync(new URL('../../assets/vendor/jolt-physics-1.1.1/jolt-physics.wasm.wasm',import.meta.url))}});
 try{for(const [height,ceiling,shouldRecover] of [[145,1.7,true],[210,1.7,false],[210,3,true]]){
  const model=human(height/100),profile=scope.window.playerBodyProfile({height}),boxes=[{minX:-5,maxX:5,minZ:-5,maxZ:5,bottom:ceiling,top:ceiling+.2}],geometry=scope.window.createBodyClearance({boxes:()=>boxes});let recovered=0;
  const bail=await createPlayerBail({T,world,getModel:()=>model,bodyDimensions:()=>profile,collisionBoxes:()=>boxes,floorAt:()=>0,canStand:(x,z,y,h,r)=>geometry.fits({x,y,z},h,r),canTranslate:geometry.canTranslate,onRecover:()=>recovered++});
  try{assert.ok(bail.start());bail.requestRecovery();for(let i=0;i<600&&bail.active;i++)bail.update(1/60);assert.equal(recovered,shouldRecover?1:0,`${height} cm / roof ${ceiling} m`);assert.equal(bail.state,shouldRecover?'idle':'ragdoll');}
  finally{bail.dispose();}
 }}finally{world.dispose();}
});
