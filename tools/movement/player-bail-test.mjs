import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import * as T from 'three';
import {createJoltWorld,createRagdoll} from '../../ragdoll-jolt.js';
import {createPlayerBail,recoverySpot,physicsBoxesForWorld,supportedProxyFeet} from '../../player-bail.js';
const scope={window:{}};vm.runInNewContext(readFileSync(new URL('../../assets/character-human-base.js',import.meta.url),'utf8'),scope);
// The shipped human's exact joint hierarchy and bind positions, without rendering materials.
function human(){const data=scope.window.GardenHumanBase,root=new T.Group(),scale=1.75/16.6589;
 const points=data.bones.map(b=>new T.Vector3(b.position[0],b.position[1]+8.1676,b.position[2]).multiplyScalar(scale));
 const bones=data.bones.map((b,i)=>{const bone=new T.Bone();bone.name=b.name;bone.position.copy(points[i]);if(b.parent>=0)bone.position.sub(points[b.parent]);return bone;});
 data.bones.forEach((b,i)=>{if(b.parent>=0)bones[b.parent].add(bones[i]);else root.add(bones[i]);});
 const skeleton=new T.Skeleton(bones);root.updateMatrixWorld(true);skeleton.calculateInverses();
 return {root,skeleton,byName:Object.fromEntries(bones.map(b=>[b.name,b])),motion:{update(){}}};}
const upright={pelvis:{x:0,y:.95,z:0},supportPoints:[{point:{x:.16,y:.07,z:.04},radius:.06}],floorAt:()=>0};
assert.equal(supportedProxyFeet(upright),0,'partially upright body reports same grounded floor as contacting foot');
assert.equal(supportedProxyFeet({...upright,supportPoints:[{point:{x:.16,y:.4,z:0},radius:.06}]}),null,'truly airborne body is not floor projected');
assert.equal(supportedProxyFeet({...upright,pelvis:{x:0,y:1.8,z:0}}),null,'unreachable high pelvis is not grounded by a low point');
assert.equal(supportedProxyFeet({...upright,floorAt:x=>x<-.1?-2:0}),null,'unsupported pelvis footprint cannot snap across ledge');
assert.equal(supportedProxyFeet({...upright,supportPoints:[{point:{x:1,y:.07,z:0},radius:.06}]}),null,'distant limb cannot ground pelvis');
assert.equal(supportedProxyFeet({...upright,supportPoints:[{point:{x:.16,y:1.07,z:0},radius:.06}],floorAt:x=>x>.1?1:0}),null,'different-height limb surface cannot ground pelvis');
const world=await createJoltWorld({moduleURL:new URL('../../assets/vendor/jolt-physics-1.1.1/jolt-physics.wasm.js',import.meta.url).href,moduleOptions:{wasmBinary:readFileSync(new URL('../../assets/vendor/jolt-physics-1.1.1/jolt-physics.wasm.wasm',import.meta.url))}});
const floor=world.box([0,-.5,0],[100,.5,100]),wall=world.box([2,2,0],[.15,2,10]);
const model=human();model.root.position.y=2;const rag=createRagdoll(world,T,model);
rag.start({velocity:new T.Vector3(6,-2,0)});assert.ok(rag.velocity().distanceTo(new T.Vector3(6,-2,0))<1e-5,'full initial velocity preserved');
const initialPelvis=rag.pelvis(),initialVelocity=rag.velocity();assert.ok(rag.translate(new T.Vector3(0,.5,0)));assert.ok(rag.pelvis().distanceTo(initialPelvis.clone().add(new T.Vector3(0,.5,0)))<1e-5);assert.ok(rag.velocity().distanceTo(initialVelocity)<1e-5,'correction preserves momentum');
let gap=0;for(let i=0;i<1200;i++){world.step(1/120);rag.apply();gap=Math.max(gap,rag.jointGap());assert.ok(rag.pelvis().x<2.1,'wall prevents pelvis crossing');assert.ok(rag.pelvis().y>-.15,'floor collision');}
assert.equal(rag.supportPoints().length,28,'two exact sphere endpoints per capsule');
assert.equal(supportedProxyFeet({pelvis:rag.pelvis(),supportPoints:rag.supportPoints(),floorAt:()=>0}),0,'actual resting Jolt capsule support is grounded');
assert.ok(gap<.15,`joint separation ${gap}`);assert.ok(rag.maxSpeed()<.45,'body settles');
rag.dispose();wall.remove();floor.remove();
assert.equal(recoverySpot({pelvis:{x:0,y:2,z:0},floorAt:()=>0,canStand:()=>true}),null,'no airborne recovery');
assert.equal(recoverySpot({pelvis:{x:0,y:.3,z:0},floorAt:()=>0,canStand:()=>false}),null,'headroom blocked');
assert.equal(recoverySpot({pelvis:{x:0,y:.3,z:0},floorAt:(x)=>x>.1?-2:0,canStand:()=>true}),null,'ledge footprint blocked');
let open=false,recovered=0,starts=0;const second=human();
const bail=await createPlayerBail({T,world,getModel:()=>second,floorAt:()=>0,canStand:()=>open,onStart:()=>starts++,onRecover:({position})=>{assert.ok(Math.abs(position[1])<1e-6);recovered++;}});
assert.ok(bail.start({velocity:new T.Vector3(2,0,0)}));assert.equal(bail.start(),false,'repeated bail ignored');
const beforeCorrection=bail.pose(),cameraBefore=bail.cameraTarget.clone();assert.equal(bail.correct({position:[beforeCorrection.x+1,beforeCorrection.y,beforeCorrection.z]}),true);assert.equal(bail.state,'ragdoll','authority correction never stands up');assert.ok(Math.abs(bail.pose().vx-2)<1e-5,'correction keeps player momentum');assert.ok(Math.abs(bail.cameraTarget.x-cameraBefore.x-1)<1e-5,'camera follows physical correction');assert.equal(bail.correct({position:[1000,0,0]}),false,'large correction bounded');assert.equal(bail.correct({position:[NaN,0,0]}),false);assert.equal(recovered,0,'correction does not invoke get-up callback');bail.requestRecovery();
for(let i=0;i<600;i++)bail.update(1/60);assert.equal(bail.state,'ragdoll','never recover through low ceiling');
open=true;for(let i=0;i<300&&bail.active;i++)bail.update(1/60);
assert.equal(bail.state,'idle','settled supported recovery completes');assert.equal(recovered,1);assert.equal(starts,1);
assert.ok(bail.start());bail.cancel();assert.equal(bail.state,'idle');assert.equal(recovered,1,'cancel does not place recovered player');
bail.dispose();
const roofWorld={boxes:[{minX:-4,maxX:4,minZ:-4,maxZ:4,bottom:8,top:8.2}],surfaces:[{field:{minX:-8,minZ:-8,cell:1,cols:16,rows:16,h:Array(256).fill(5)}}]};
const roofBoxes=physicsBoxesForWorld(roofWorld,{x:0,z:0});
assert.equal(roofBoxes.length,2,'uniform roof merges into one slab plus explicit ceiling');
assert.equal(roofBoxes.find(b=>b.top===5).bottom,4.8,'roof is thin, not filled volume');
assert.ok(roofBoxes.some(b=>b.bottom===8),'explicit ceiling preserved');
assert.equal(physicsBoxesForWorld(roofWorld,{x:1000,z:1000}).length,0,'distant roofs excluded');
const rooftop=human();rooftop.root.position.y=5;let roofRecovered=null;
const roofBail=await createPlayerBail({T,world,getModel:()=>rooftop,collisionBoxes:p=>physicsBoxesForWorld(roofWorld,p),groundHeight:()=>0,
 floorAt:(x,z,max=Infinity)=>Math.abs(x)<8&&Math.abs(z)<8&&max>=5?5:0,canStand:()=>true,onRecover:r=>roofRecovered=r});
assert.ok(roofBail.start({velocity:new T.Vector3(.4,0,0)}));
for(let i=0;i<360;i++){roofBail.update(1/60);assert.ok(roofBail.pose().y>=4.99,'real Jolt roof bail never falls through measured roof');}
roofBail.requestRecovery();for(let i=0;i<180&&roofBail.active;i++)roofBail.update(1/60);
assert.ok(roofRecovered,'roof recovery finishes');assert.equal(roofRecovered.position[1],5,'recover on roof, not ground below');
roofBail.dispose();world.dispose();console.log(JSON.stringify({passed:true,engine:'vendored Jolt 1.1.1 WASM',parts:14,maxJointGap:gap,checks:['momentum','wall','floor','joint stability','settling','airborne gate','headroom gate','ledge gate','recovery blend','repeat bail','cancel/dispose','measured roof collision','roof-height recovery','roof merge/locality','ceiling preservation']}));
