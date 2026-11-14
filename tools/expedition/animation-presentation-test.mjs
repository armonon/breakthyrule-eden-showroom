import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as T from 'three';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),candidate=process.env.EDEN_ANIMATION_SOURCE||root;
const source=name=>readFileSync(candidate+name,'utf8');
function camera(){const c=new T.PerspectiveCamera(60,1,.05,100);c.position.set(0,1.75,0);return c;}
const aim=new T.Vector3(0,1.75,-5),all={cameraEffects:true,bob:true,sway:true,shake:true,roll:true};
function sway(){const s={};s.window=s;vm.runInNewContext(source('camera-sway.js'),s);return s.createCameraSway(T);}
async function rig(){
 const scope={console,atob,AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,status:200,json:async()=>JSON.parse(readFileSync(root+'assets/anim/clips.json','utf8'))})};scope.window=scope;
 for(const file of ['assets/character-human-base.js','character-anim.js'])vm.runInNewContext(readFileSync(root+file,'utf8'),scope);
 await scope.GardenAnim.load();assert.ok(scope.GardenAnim.ready(),'shipped animation library loaded');vm.runInNewContext(source('character-motion.js'),scope);
 const data=scope.GardenHumanBase,group=new T.Group(),scale=1.75/16.6589;
 const points=data.bones.map(b=>new T.Vector3(b.position[0],b.position[1]+8.1676,b.position[2]).multiplyScalar(scale));
 const bones=data.bones.map((b,i)=>{const bone=new T.Bone();bone.name=b.name;bone.position.copy(points[i]);if(b.parent>=0)bone.position.sub(points[b.parent]);return bone;});
 data.bones.forEach((b,i)=>{if(b.parent>=0)bones[b.parent].add(bones[i]);else group.add(bones[i]);});
 const skeleton=new T.Skeleton(bones);group.updateMatrixWorld(true);skeleton.calculateInverses();const model={root:group,skeleton};
 const motion=scope.GardenCharacterMotion.create(T,model);return {scope,model,motion,bones};
}
test('comfort effects never silence distance-driven footsteps or alter input vectors',()=>{
 let counts=[];for(const cameraEffects of [true,false]){const s=sway(),c=camera(),v=new T.Vector3(0,0,-5),a=aim.clone();let count=0;for(let i=0;i<600;i++){c.position.set(0,1.75,0);count+=Number(s.apply(c,a,1/60,{velocity:v,effects:{...all,cameraEffects}}));}assert.deepEqual(v.toArray(),[0,0,-5]);assert.deepEqual(a.toArray(),aim.toArray());counts.push(count);}assert.ok(counts[0]>30);assert.equal(counts[0],counts[1]);
});
test('third-person sprint profile has broader lateral motion and gentler vertical bob',()=>{
 const ranges=[];for(const perspective of [0,1]){const s=sway(),c=camera();let x=0,y=0;for(let i=0;i<300;i++){c.position.set(0,1.75,0);s.apply(c,aim,1/60,{velocity:new T.Vector3(0,0,-6),sprint:1,perspective,effects:all});if(i>120){x=Math.max(x,Math.abs(c.position.x));y=Math.max(y,Math.abs(c.position.y-1.75));}}ranges.push({x,y});}assert.ok(ranges[1].x>ranges[0].x*1.4);assert.ok(ranges[1].y<ranges[0].y*.7);
});
test('view changes, landings, and long frames remain bounded and return to untouched pose',()=>{
 const s=sway(),c=camera();for(let i=0;i<600;i++){s.remove(c);if(i%60===0)s.bump(1,1);s.apply(c,aim,i%90===0?.2:1/60,{velocity:new T.Vector3(2,0,-5),airborne:i%100<25,perspective:i%120<60?1:0,sprint:1,effects:all});assert.ok(c.position.toArray().every(Number.isFinite));assert.ok(c.position.distanceTo(new T.Vector3(0,1.75,0))<.3);}s.remove(c);s.apply(c,aim,1/60,{effects:{cameraEffects:false}});assert.ok(c.position.distanceTo(new T.Vector3(0,1.75,0))<1e-9);assert.ok(Math.abs(c.rotation.z)<1e-9);
});
test('authored walk/jog/sprint crossfades, crouch, and airborne transitions use shipped clips',async()=>{
 const {motion}=await rig();const step=(speed,count=180)=>{for(let i=0;i<count;i++)motion.update(1/60,{velocity:new T.Vector3(0,0,speed)});return motion.inspect();};
 const mid=step(3.5);assert.ok(mid.locomotion.some(l=>l.id==='walk'));assert.ok(mid.locomotion.some(l=>l.id==='jog'));
 assert.ok(step(6.6).locomotion.some(l=>l.id==='sprint'));
 motion.crouch(1);assert.ok(step(1.4).locomotion.some(l=>l.id==='crouchWalk'));assert.ok(step(0).locomotion.some(l=>l.id==='crouchIdle'));
 motion.airborne(true);let state=step(2,1);assert.ok(state.actions.includes('jumpStart'));assert.ok(state.locomotion.some(l=>l.id==='jumpLoop'));
 motion.airborne(false);state=step(2,1);assert.ok(state.actions.includes('jumpLand'));assert.ok(!state.actions.includes('jumpStart'));
});
test('first-person hand inertia and sprint carry differ from third person without moving root',async()=>{
 const a=await rig(),b=await rig();const sceneA=new T.Scene(),sceneB=new T.Scene();sceneA.add(a.model.root);sceneB.add(b.model.root);
 for(const [r,first] of [[a,1],[b,0]]){r.motion.hold(new T.Group(),'pistol');r.motion.aimAt(new T.Vector3(0,1.5,8));for(let i=0;i<180;i++){r.motion.presentation({firstPerson:first,sprint:1,lookYawRate:3,effects:all});r.motion.update(1/60,{velocity:new T.Vector3(0,0,6)});}}
 const wrist=r=>r.model.skeleton.getBoneByName('wrist.R').getWorldPosition(new T.Vector3());assert.ok(wrist(a).distanceTo(wrist(b))>.005);assert.deepEqual(a.model.root.position.toArray(),[0,0,0]);assert.deepEqual(b.model.root.position.toArray(),[0,0,0]);assert.ok(a.motion.inspect().presentation.firstPerson>.99);
 const disabled=await rig();disabled.motion.presentation({firstPerson:1,lookYawRate:3,effects:{...all,cameraEffects:false}});disabled.motion.update(1/60);assert.equal(disabled.motion.inspect().presentation.lookLag,false);
});
test('mixed animation states remain finite at 30/60/120 Hz and do not leak layers',async()=>{
 for(const hz of [30,60,120]){const {motion,bones,model}=await rig();for(let i=0;i<hz*8;i++){const t=i/hz;motion.crouch(t>4&&t<5?1:0);motion.airborne(t>2&&t<2.6);motion.presentation({firstPerson:t<4?1:0,sprint:t>1&&t<4?1:0,lookYawRate:Math.sin(t)*3,effects:all});motion.update(1/hz,{velocity:new T.Vector3(Math.sin(t),0,t<1?0:5)});assert.ok(bones.every(b=>b.position.toArray().concat(b.quaternion.toArray()).every(Number.isFinite)));assert.deepEqual(model.root.position.toArray(),[0,0,0]);}assert.equal(motion.inspect().actions.length,0);}
});
test('direct entry anchors player separately, smooths FOV, and keeps physics presentation guarded',()=>{
 const entry=source('expedition-entry.js'),body=source('player-body.js');assert.ok(entry.includes('position:targetPosition'));assert.ok(entry.includes('manageFov:false'));assert.ok(entry.includes('perspective:thirdBlend'));assert.ok(entry.includes('T.MathUtils.lerp(p.firstFov,p.thirdFov,thirdBlend)'));assert.ok(body.includes('if(physicsActive){model.root.visible=true;requestDraw();return;}'));assert.ok(body.includes('if(!model||physicsActive)return;'));
});
test('real player body uses unswayed anchor and ignores animation/view requests during physics',async()=>{
 const {scope,model,motion,bones}=await rig(),scene=new T.Scene(),c=camera();
 model.motion=motion;model.byName=Object.fromEntries(bones.map(b=>[b.name,b]));
 scope.document={addEventListener(){},removeEventListener(){}};scope.localStorage={length:0};scope.addEventListener=()=>{};scope.removeEventListener=()=>{};
 scope.fetch=async()=>({json:async()=>({})});scope.GardenCharacter={load:async()=>{},create:()=>model,dispose(){model.root.removeFromParent();}};
 vm.runInNewContext(source('player-body.js'),scope);const body=scope.createPlayerBody({T,scene,camera:c});
 const anchor=new T.Vector3(2,1.75,3),target=new T.Vector3(2,1.75,-2);body.update(1/60,{aim:target,position:anchor,manageFov:false});await new Promise(resolve=>setImmediate(resolve));
 c.position.set(2.06,1.78,3.04);body.update(1/60,{aim:target,position:anchor,manageFov:false});const first=model.root.position.clone();
 c.position.set(1.94,1.72,2.96);body.update(1/60,{aim:target,position:anchor,manageFov:false});assert.ok(model.root.position.distanceTo(first)<1e-9);assert.equal(model.root.position.y,0);assert.equal(c.fov,60);
 body.third(1);body.update(1/60,{aim:target,position:anchor,manageFov:false});const planted=model.root.position.clone();body.update(1/60,{aim:target.clone().setY(-2),position:anchor,manageFov:false});assert.ok(model.root.position.distanceTo(planted)<1e-9,'third-person look does not translate feet');body.cameraClearance(.2);assert.ok(model.byName.neck01.scale.x<.01);body.cameraClearance(.8);assert.equal(model.byName.neck01.scale.x,1);

 for(const height of [1.45,1.75,2.1]){const eyeOffset=height*.94-1.75;body.third(1);c.position.copy(anchor);c.position.y+=eyeOffset;body.update(1/60,{aim:target.clone().setY(target.y+eyeOffset),eyeOffset,position:anchor,manageFov:false});assert.equal(model.root.position.y,0,'view height must not lift the feet');assert.ok(Math.abs(c.position.y-height*.94)<1e-9,'camera follows actual body height');assert.ok(Math.abs(body.inspect().yaw-Math.PI)<.002,'raised view preserves heading');}
 body.setPhysicsActive(true);model.root.position.set(7,.4,8);const before=model.byName.neck01.scale.clone();body.third(1);assert.equal(body.anim('wave'),null);body.update(1/60,{aim:target,position:anchor});assert.deepEqual(model.root.position.toArray(),[7,.4,8]);assert.ok(model.byName.neck01.scale.equals(before));body.dispose();assert.equal(model.root.parent,null);
});

test('direct entry declares its render warmup before strict-mode initialization',()=>{
 const entry=source('expedition-entry.js');
 const declarations=entry.match(/let movement=null[^;]+;/)[0];
 const initialize=entry.match(/warmup=window\.createRenderWarmup\([^;]+;/)[0];
 const prepared={inspect:()=>({models:0})};
 const actual=vm.runInNewContext("'use strict';"+declarations+initialize+'warmup;', {window:{createRenderWarmup:()=>prepared},renderer:{},camera:{},scene:{},lifetime:{signal:{}}});
 assert.equal(actual,prepared);
});

test('third-person bail retains collision-aware camera distance from the physics target',()=>{
 const entry=source('expedition-entry.js');
 const offset=entry.split('\n').find(line=>line.includes('const forward=new T.Vector3();camera.getWorldDirection(forward)'));
 assert.ok(offset,'third-person follow offset exists');
 for(const blocked of [false,true]){
  const c=camera(),anchor=c.position.clone();
  vm.runInNewContext(offset,{T,camera:c,thirdBlend:1,thirdSide:1,body:{},bail:{active:true},world:{clearance:{fits:()=>!blocked}}});
  const distance=c.position.distanceTo(anchor);
  assert.ok(distance>0,'bail must not remove the third-person offset');
  if(blocked)assert.ok(distance<=.201,'walls still limit the follow camera');else assert.ok(distance>2.7,'character stays in front of follow camera');
 }
});
test('explicit hard landing and roll retain ownership of their transition',async()=>{
 for(const id of ['jumpLand','roll']){const {motion}=await rig();motion.airborne(true);motion.update(1/60);const layer=motion.play(id,{speed:1.6,mask:'full',fade:.05});assert.ok(layer);motion.airborne(false);motion.update(1/60);assert.ok(layer.t>0,'explicit layer is advanced rather than replaced');assert.equal(layer.speed,1.6);if(id==='roll')assert.equal(motion.playing('jumpLand'),false);}
});
test('authored full-body gestures cannot detach an active reachable hand contact',async()=>{
 const {motion,model}=await rig(),point=new T.Vector3(.26,1.25,.3);motion.touch('L',point,null,1,'grab');for(let i=0;i<180;i++)motion.update(1/60);
 const wrist=model.skeleton.getBoneByName('wrist.L'),error=()=>wrist.getWorldPosition(new T.Vector3()).distanceTo(point);assert.ok(error()<.025,'contact is reachable before the gesture');
 motion.play('wave',{mask:'full',weight:1,arms:true,loop:true,fade:.05});let peak=0;for(let i=0;i<240;i++){motion.update(1/60);peak=Math.max(peak,error());}assert.ok(peak<.04,`wrist stayed on contact: ${peak}`);
});
