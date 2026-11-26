import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as T from 'three';

const root=new URL('../../',import.meta.url),source=name=>readFileSync(new URL(name,root),'utf8');
async function rig({canonical=false}={}){
 const scope={console,atob,structuredClone,AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>JSON.parse(source('assets/anim/clips.json'))})};scope.window=scope;
 for(const file of ['movement-state.js','assets/character-human-base.js','character-anim.js','character-motion.js'])vm.runInNewContext(source(file),scope);
 await scope.GardenAnim.load();assert.ok(scope.GardenAnim.ready());
 const data=scope.GardenHumanBase,group=new T.Group(),scale=1.75/16.6589;
 const points=data.bones.map(b=>new T.Vector3(b.position[0],b.position[1]+8.1676,b.position[2]).multiplyScalar(scale));
 const bones=data.bones.map((b,i)=>{const bone=new T.Bone();bone.name=b.name;bone.position.copy(points[i]);if(b.parent>=0)bone.position.sub(points[b.parent]);return bone;});
 data.bones.forEach((b,i)=>{if(b.parent>=0)bones[b.parent].add(bones[i]);else group.add(bones[i]);});
 const skeleton=new T.Skeleton(bones);group.updateMatrixWorld(true);skeleton.calculateInverses();
 const model={root:group,skeleton},motion=scope.GardenCharacterMotion.create(T,model,{canonical});motion.animTune.loco=false;
 return {scope,A:scope.GardenAnim,model,motion,bones,layer:id=>motion.captureState().state.layers.find(L=>L.id===id&&!L.out)};
}
const clone=x=>JSON.parse(JSON.stringify(x));
const maxAngle=(a,b)=>Math.max(...a.map((q,i)=>q.angleTo(b[i])));

test('both games receive authored ladder, ledge-hop, wall-climb and roll poses from shared traversal metadata',async()=>{
 const r=await rig();
 for(const [move,id] of [
  [{kind:'wallclimb',vertical:1,moving:true},'pkScramble'],
  [{kind:'pipe',phase:'enter',duration:.3},'pkLadderEnter'],
  [{kind:'pipe',phase:'loop',vertical:1},'pkLadder'],
  [{kind:'ladderExit'},'pkLadderExit'],
  [{kind:'warp',action:'hopLeft'},'pkHopL'],[{kind:'warp',action:'hopRight'},'pkHopR'],[{kind:'warp',action:'hopUp'},'pkHopUp'],
  [{kind:'warp',action:'leap'},'pkLeap'],[{kind:'climb'},'pkClimb'],[{kind:'hangdrop'},'pkHangDrop'],[{kind:'roll'},'pkRoll'],
 ]){
  assert.ok(r.A.has(id),'baked clip exists: '+id);
  r.motion.traversal({time:.1,duration:.8,...move});r.motion.update(1/60);assert.ok(r.motion.playing(id),JSON.stringify(move)+' selects '+id);
 }
 assert.ok(r.bones.every(b=>b.quaternion.toArray().concat(b.position.toArray()).every(Number.isFinite)));
});

test('controller-timed one-shots seek to the current phase without restarting or advancing twice',async()=>{
 const r=await rig();
 for(const time of [.1,.32,.51]){
  r.motion.traversal({kind:'climb',time,duration:.8});r.motion.update(.1);
  assert.ok(Math.abs(r.layer('pkClimb').t-time/.8*r.A.duration('pkClimb'))<1e-9);
 }
 r.motion.traversal({kind:'climb',time:.2,duration:.4});r.motion.update(1/120);
 assert.ok(Math.abs(r.layer('pkClimb').t-r.A.duration('pkClimb')*.5)<1e-9,'a duration change resynchronizes the active layer');
 r.motion.traversal({kind:'climb',time:0,duration:.8});r.motion.update(1/60);
 assert.equal(r.layer('pkClimb').t,0,'an immediately repeated mantle begins at its own movement clock');
});

test('wall climbing pauses and reverses in place; rapid shimmy direction changes do not leak layers',async()=>{
 const r=await rig(),drive=(move,dt=1/60)=>{r.motion.traversal({kind:'wallclimb',time:1,vertical:1,moving:true,...move});r.motion.update(dt);};
 drive({},.2);const before=r.layer('pkScramble').t;
 for(let i=0;i<30;i++)drive({vertical:0,moving:false});
 assert.equal(r.layer('pkScramble').t,before,'idle holds the current hand/foot cycle');
 drive({vertical:-1});assert.ok(r.layer('pkScramble').t<before,'descending reverses the same cycle');
 for(let i=0;i<180;i++)drive({vertical:0,lateral:i%2?-1:1});
 const layers=r.motion.captureState().state.layers;
 assert.ok(layers.length<=3,'reversals reuse fading layers');
 assert.equal(new Set(layers.map(L=>L.id)).size,layers.length,'no duplicate traversal clips accumulate');
});

test('accelerated controller loops preserve their active phase while matching the requested pace',async()=>{
 for(const [move,id] of [[{kind:'pipe',vertical:1},'pkLadder'],[{kind:'rope',vertical:-1},'pkLadder'],[{kind:'hang',shimmy:1},'pkShimmyR'],[{kind:'bar',shimmy:-1},'pkShimmyL'],[{kind:'scramble'},'pkScramble']]){
  const r=await rig(),dt=1/60;r.motion.traversal({...move,time:.5,speed:1});r.motion.update(dt);const previous=r.layer(id).t;
  r.motion.traversal({...move,time:.7,speed:2});r.motion.update(dt);
  assert.ok(Math.abs(r.layer(id).t-previous-(move.vertical===-1?-2*dt:2*dt))<1e-9,id+' advances without resetting when controller pace changes');
 }
});

test('ladder contact pace uses actual travel and immutable fitted height, with idle and reverse preserved',async()=>{
 const r=await rig(),dt=1/60,hip=r.motion.bindHipHeight(),pelvis=r.model.skeleton.getBoneByName('root');
 r.model.userData.animBindHipY=99;pelvis.position.y=0;r.model.root.scale.y=1.25;
 assert.equal(r.motion.bindHipHeight(),hip*1.25,'fitted height ignores mutable holder metadata and the current pose');
 const sourceRate=.474849/.766667,expected=2.1/(hip*1.25*sourceRate);
 for(const kind of ['pipe','rope']){
  r.motion.traversal({kind,time:1,vertical:1,travelSpeed:2.1,speed:2});r.motion.update(dt);
  assert.ok(Math.abs(r.layer('pkLadder').speed-expected)<1e-9,'travelSpeed already includes controller pace');
  const held=r.layer('pkLadder').t;r.motion.traversal({kind,time:2,vertical:1,travelSpeed:0});r.motion.update(dt);
  assert.equal(r.layer('pkLadder').t,held,'blocked traversal freezes contact even with held upward input');
  r.motion.traversal({kind,time:3,vertical:-1,travelSpeed:2.1});r.motion.update(dt);
  assert.ok(Math.abs(r.layer('pkLadder').speed+expected)<1e-9,'descending preserves contact speed and reverses phase');
 }
 r.motion.traversal({kind:'wallclimb',time:1,vertical:1,speed:4.78});r.motion.update(dt);assert.equal(r.layer('pkScramble').speed,4.78);
});

test('paired root paths interpolate in normalized rig axes and leave translation under caller control',async()=>{
 const r=await rig(),out={x:123,z:456};
 for(const id of ['stealthAssassin','stealthVictim']){
  const c=r.A.clip(id);assert.equal(c.rootXZ.length,c.n*2);
  const frame=61,k=.5,at=r.A.rootOffset(id,(frame+k)/c.fps,out);
  assert.equal(at,out,'callers can reuse a destination');
  assert.ok(Math.abs(at.x-(c.rootXZ[frame*2]+c.rootXZ[(frame+1)*2])/20000)<1e-9);
  assert.ok(Math.abs(at.z-(c.rootXZ[frame*2+1]+c.rootXZ[(frame+1)*2+1])/20000)<1e-9);
  assert.deepEqual(clone(r.A.rootOffset(id,-10)),{x:0,z:0},'path clamps before its start');
  assert.deepEqual(clone(r.A.rootOffset(id,100)),{x:c.rootXZ.at(-2)/10000,z:c.rootXZ.at(-1)/10000},'path clamps after its end');
  const pelvis=r.model.skeleton.getBoneByName('root'),before={x:pelvis.position.x,z:pelvis.position.z};
  r.A.apply(T,r.model,[{id,t:4,weight:1}]);assert.deepEqual({x:pelvis.position.x,z:pelvis.position.z},before,'pose application does not duplicate caller root motion');
 }
 assert.ok(r.A.rootOffset('stealthAssassin',2).z>r.A.rootOffset('stealthVictim',2).z+1,'caller can subtract the cropped approach independently for each actor');
 assert.deepEqual(clone(r.A.rootOffset('pkClimb',2,out)),{x:0,z:0});assert.deepEqual(clone(r.A.rootOffset('missing',2,out)),{x:0,z:0});
});

test('animation loader rejects a truncated optional paired path',async()=>{
 const library=JSON.parse(source('assets/anim/clips.json'));library.clips.stealthAssassin.rootXZ='AAAA';const warnings=[];
 const scope={console:{warn:(...args)=>warnings.push(args)},atob,AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>library})};scope.window=scope;
 vm.runInNewContext(source('character-anim.js'),scope);await scope.GardenAnim.load();
 assert.equal(scope.GardenAnim.ready(),false);assert.match(String(warnings[0]?.[1]),/Invalid animation clip: stealthAssassin/);
});

test('short ledge release uses the start of its clip at normal speed, not a compressed full landing',async()=>{
 const r=await rig();r.motion.traversal({kind:'hangdrop',time:.25,duration:.4});r.motion.airborne(true);r.motion.update(1/60);
 assert.equal(r.layer('pkHangDrop').t,.25);assert.equal(r.layer('pkHangDrop').speed,1);
 assert.ok(!r.motion.playing('jumpStart'),'generic jump cannot interrupt a ledge release');
 r.motion.traversal(null);for(let i=0;i<20;i++)r.motion.update(1/60);
 assert.ok(!r.motion.playing('pkHangDrop'),'fall takes ownership after release');
});

test('normalized traversal crossfade preserves an identical pose through the midpoint',async()=>{
 const a=await rig(),b=await rig(),id='pkClimb',t=a.A.duration(id)*.4;
 for(const r of [a,b])for(const bone of r.bones)bone.quaternion.identity();
 a.A.apply(T,a.model,[{id,t,weight:1,blend:'traversal'}]);
 b.A.apply(T,b.model,[{id,t,weight:.5,blend:'traversal'},{id,t,weight:.5,blend:'traversal'}]);
 assert.ok(maxAngle(a.bones.map(v=>v.quaternion),b.bones.map(v=>v.quaternion))<1e-6,'two halves do not fade back toward the procedural bind pose');
 assert.ok(Math.abs(a.model.skeleton.getBoneByName('root').position.y-b.model.skeleton.getBoneByName('root').position.y)<1e-9);
});

test('new full-body ladder and stealth actions retain authored knees instead of being overwritten by ground IK',async()=>{
 for(const id of ['pkLadder','pkLadderExit','pkHopL','stealthAssassin','stealthVictim']){
  const a=await rig(),b=await rig(),t=a.A.duration(id)*.4;
  assert.ok(a.A.has(id));const layer=a.motion.play(id,{weight:1,arms:true,fade:0,hold:true});layer.t=t;layer.w=1;a.motion.update(0);
  for(const bone of b.bones)bone.quaternion.identity();b.A.apply(T,b.model,[{id,t,weight:1}]);
  for(const name of ['upperleg01.L','lowerleg01.L','upperleg01.R','lowerleg01.R'])assert.ok(a.model.skeleton.getBoneByName(name).quaternion.angleTo(b.model.skeleton.getBoneByName(name).quaternion)<1e-6,id+' preserves '+name);
 }
});

test('canonical traversal checkpoints resume exactly, including a pending synchronized pose',async()=>{
 const a=await rig({canonical:true}),b=await rig({canonical:true});
 a.motion.traversal({kind:'warp',action:'hopUp',time:.3,duration:.65});b.motion.restoreState(clone(a.motion.captureState()));
 a.motion.update(1/60);b.motion.update(1/60);assert.deepEqual(clone(a.motion.captureState()),clone(b.motion.captureState()));
 for(let i=0;i<35;i++){
  const move={kind:'pipe',phase:'loop',time:i/60,vertical:i<15?1:i<25?0:-1};
  a.motion.traversal(move);a.motion.update(1/60);
  if(i%7===0)b.motion.restoreState(clone(a.motion.captureState()));else{b.motion.traversal(move);b.motion.update(1/60);}
  assert.deepEqual(clone(a.motion.captureState()),clone(b.motion.captureState()));
 }
 const bad=clone(a.motion.captureState());bad.state.layers[0].syncTime='invalid';assert.throws(()=>a.motion.restoreState(bad));
});

test('climb, pause, shimmy, hop and mantle transitions remain bounded at common render rates',async()=>{
 for(const hz of [30,60,120]){
  const r=await rig(),dt=1/hz,steps=Math.round(.35*hz),moves=[
   {kind:'wallclimb',vertical:1,moving:true},{kind:'wallclimb',vertical:0,moving:false},
   {kind:'wallclimb',vertical:0,lateral:-1,moving:true},{kind:'wallclimb',vertical:0,lateral:1,moving:true},
   {kind:'warp',action:'hopUp',duration:.7},{kind:'hang'},
   {kind:'climb',duration:.7},null,
  ];
  for(let i=0;i<hz;i++){r.motion.traversal({kind:'hang',time:i*dt});r.motion.update(dt);}
  let previous=r.bones.map(b=>b.quaternion.clone()),largestBoundary=0;
  for(const move of moves)for(let i=0;i<steps;i++){
   r.motion.traversal(move?{time:i*dt,...move}:null);r.motion.update(dt);
   const now=r.bones.map(b=>b.quaternion.clone());if(i===0)largestBoundary=Math.max(largestBoundary,maxAngle(previous,now));previous=now;
   assert.ok(r.bones.every(b=>b.quaternion.toArray().concat(b.position.toArray()).every(Number.isFinite)));
  }
  assert.ok(largestBoundary<.8,`${hz} Hz transition boundary rotates less than 46 degrees: ${largestBoundary}`);
 }
});

test('landing rolls do not double the authored tuck with the controller prone visual',async()=>{
 const a=await rig(),b=await rig();
 for(const [r,crouch] of [[a,1],[b,0]]){
  r.model.byName=Object.fromEntries(r.bones.map(bone=>[bone.name,bone]));r.model.motion=r.motion;
  r.motion.crouch(crouch);const L=r.motion.play('pkRoll',{weight:1,arms:true,speed:0,start:.4,hold:true});L.w=1;
  for(let i=0;i<60;i++)r.motion.update(1/60);
 }
 const hips=r=>r.model.skeleton.getBoneByName('root').position;
 assert.ok(hips(a).distanceTo(hips(b))<1e-9,'visual crouch cannot add a second pelvis drop under the roll');
 a.scope.GardenCharacterMotion.traverseBody(T,a.model,{hands:null,handRise:0,handsOn:false,pose:{traversal:{kind:'roll',time:.2,duration:.8},dive:1,slide:.5},dt:1/60});
 assert.equal(a.model.root.rotation.x,0,'roll gets no prone pitch');assert.equal(a.model.root.position.y,0,'roll gets no dive lift');
});
