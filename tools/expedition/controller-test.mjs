import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../../',import.meta.url),c=vm.createContext({console,performance,URL,TextDecoder,TextEncoder,location:{href:'file:///headless/'}});c.window=c;
for(const f of ['assets/three.min.js','assets/roof-heights.js','expedition-world.js','movement-state.js','player-motion.js','parkour.js','player-movement.js','expedition-controller.js'])vm.runInContext(readFileSync(new URL(f,root),'utf8'),c,{filename:f});
const layout=JSON.parse(readFileSync(new URL('night-layout.json',root),'utf8'));
const clone=s=>JSON.parse(JSON.stringify(s)),equal=(a,b)=>assert.deepEqual(clone(a),clone(b));
const input=(heldMask=0,edges=0,yaw=Math.PI,pitch=0)=>({heldMask,edges,yaw,pitch});
function make({height=175,shoulders=1,custom,unlocked=()=>false,effect=()=>{}}={}){
 const map=custom?{bounds:[-80,80,-180,30],spawn:[0,0],landmarks:[]}:layout,world=c.createExpeditionWorld({layout:map,roofs:custom?{}:c.edenRoofs});
 if(custom){world.walls.push(...(custom.walls||[]));world.surfaces.push(...(custom.surfaces||[]));}
 return c.createExpeditionController({T:c.THREE,world,layout:map,character:{height,shoulders},worldRevision:'test-pinned-world-1',unlocked,effect});
}
test('ledge grace jumps work across body sizes and roof fields, replay exactly, and cannot double-jump',()=>{
 const field={minX:-4,minZ:-4,cell:1,cols:8,rows:4,h:Array(32).fill(4)};
 for(const height of [145,175,210])for(const shoulders of [.9,1.3])for(const custom of [{walls:[[0,-2,8,4,4]]},{surfaces:[{field}]}]){
  const a=make({height,shoulders,custom}),b=make({height,shoulders,custom});a.reset({x:0,y:4,z:-2,yaw:0});
  assert.equal(a.captureState().motion.height,0,'starts supported on the roof');
  let left=false;for(let i=0;i<120;i++){a.step(input(1,0,0));if(a.captureState().motion.height>0){left=true;break;}}
  assert.ok(left,'walks off the actual support edge');assert.ok(a.readPose().y>3.9,'departure is from the roof, not ground level');
  for(let i=0;i<3;i++)a.step(input(1,0,0));const edge=clone(a.captureState());assert.ok(edge.movement.coyote>0);
  b.restoreState(edge);a.step(input(33,1,0));b.step(input(33,1,0));equal(a.captureState(),b.captureState());
  assert.ok(a.readPose().vy>5,'press within the grace period launches upward');assert.equal(a.captureState().movement.coyote,0);
  const launch=a.readPose().vy;a.step(input(1,1,0));assert.ok(a.readPose().vy<launch,'another press cannot buy a second jump');
  b.restoreState(edge);for(let i=0;i<8;i++)b.step(input(1,0,0));b.step(input(1,1,0));
  assert.ok(b.readPose().vy<0,'an expired grace window cannot launch a mid-air jump');
 }
});
test('actual controller replays walking, sprint, jump, crouch and dive identically after complete restoration',()=>{
 for(const height of [145,175,210]){
  const a=make({height}),b=make({height});let edges=0;
  for(let tick=1;tick<=360;tick++){
   const held=tick<240?17:0;edges=tick===80?1:tick===150?2:0;
   const f=input(held|(tick>=150&&tick<185?64:0),edges);a.step(f);
   if(tick===1||tick%17===0)b.restoreState(clone(a.captureState()));else b.step(f);
   equal(a.captureState(),b.captureState());
  }
 }
});
test('non-arena expedition movement does not charge or retain momentum boosts',()=>{
 const a=make({custom:{}});for(let i=0;i<240;i++)a.step(input(17));
 assert.equal(a.movement.momentum(),0);assert.ok(Math.hypot(a.readPose().vx,a.readPose().vz)<=6.01);
 const carried=clone(a.captureState());carried.movement.momentum=1;carried.parkour.mom=1;a.restoreState(carried);
 a.step(input(17,1));assert.equal(a.movement.momentum(),0);assert.equal(a.captureState().parkour.mom,0);assert.ok(a.readPose().vy<=5.4,'leaving an arena cannot retain the boosted jump');
});
test('fixed input replay preserves a live vault and climb without serializing geometry',()=>{
 for(const top of [.8,2.55]){
  const spec={walls:[top<1?[0,-.875,2,.65,top]:[0,-1.4,2,1.5,top]]},a=make({custom:spec}),b=make({custom:spec});let snapshots=0;
  for(let tick=1;tick<=200;tick++){
   const f=input(1,tick===1||tick===60?1:0);a.step(f);
   if(['climb','vault','hang'].includes(a.readPose().movement)){const saved=clone(a.captureState());assert.ok(JSON.stringify(saved).length<6000);b.restoreState(saved);snapshots++;}
   else if(tick===1)b.restoreState(clone(a.captureState()));else b.step(f);
   equal(a.captureState(),b.captureState());
  }
  assert.ok(snapshots>0,`top ${top} produced an actual traversal`);assert.ok(a.readPose().z<-.8);
 }
});
test('bad snapshots fail atomically and cannot change character or world revision',()=>{
 const a=make();a.step(input(17,1));const before=clone(a.captureState());
 for(const change of [s=>s.worldRevision='other',s=>s.bodyKey='other',s=>s.motion.velocity=Infinity,s=>s.movement.slide={},s=>s.parkour.state={kind:'hang',t:0},s=>s.parkour.lastUpdateTick=-1,s=>s.position=[0,NaN,0]]){
  const bad=clone(before);change(bad);assert.throws(()=>a.restoreState(bad));equal(a.captureState(),before);
 }
});
test('parkour advances exactly once when an active state ends on a tick',()=>{
 const a=make({custom:{walls:[[0,-1.4,2,1.5,2.55]]}});let active=false,ended=false;
 for(let tick=1;tick<=200;tick++){const was=a.parkour.active();a.step(input(1,tick===1?1:0));const s=a.captureState();assert.ok(Math.abs(s.parkour.clock-tick/60)<1e-9);active||=a.parkour.active();ended||=was&&!a.parkour.active();}
 assert.ok(active&&ended);
});
test('replaying movement suppresses effects and does not alter the simulation',()=>{
 const events=[],a=make({effect:e=>events.push(e)}),b=make();
 for(let tick=1;tick<150;tick++){const f=input(17,tick===2?1:0);a.step(f,tick,{replay:true});b.step(f);}
 equal(a.captureState(),b.captureState());assert.equal(events.length,0);
});
test('shared pyramid gate, gathering cards and world bounds constrain actual inputs',()=>{
 let open=false;const a=make({unlocked:()=>open});a.reset({x:11.7,z:-109.5,yaw:Math.PI});for(let i=0;i<120;i++)a.step(input(17));assert.ok(a.readPose().z>-109.9);
 open=true;for(let i=0;i<120;i++)a.step(input(17));assert.ok(a.readPose().z<-110.9);
 const collision=c.createPyramidCollision({unlocked:()=>true}),guest=c.pyramidGatheringGuests()[0];assert.equal(collision.gathering(guest.x,guest.z),true);
 a.reset({x:layout.bounds[0]+.01,z:-24,yaw:-Math.PI/2});for(let i=0;i<60;i++)a.step(input(17,0,-Math.PI/2));assert.ok(a.readPose().x>=layout.bounds[0]);
});
test('crouch departure catches the actual support edge across character sizes and roof fields',()=>{
 const F={minX:-4,minZ:-4,cell:1,cols:8,rows:4,h:Array(32).fill(4)};
 for(const height of [145,175,210])for(const shoulders of [.9,1.3])for(const custom of [{walls:[[0,-2,8,4,4]]},{surfaces:[{field:F}]}]){
  const a=make({height,shoulders,custom}),b=make({height,shoulders,custom});a.reset({x:0,y:4,z:-2,yaw:0});let hang=false;
  for(let tick=1;tick<160;tick++){a.step(input(65,0,0));if(a.readPose().movement==='hang'){hang=true;break;}}
  assert.ok(hang,`${height}/${shoulders} catches`);assert.equal(a.captureState().parkour.stats.drops,1);b.restoreState(clone(a.captureState()));
  // Shimmy from the grabbed edge, then climb using actual controls.
  for(let i=0;i<15;i++){const f=input(8,0,Math.PI);a.step(f);b.step(f);equal(a.captureState(),b.captureState());}
  for(let i=0;i<90;i++){const f=input(1,i===0?1:0,Math.PI);a.step(f);b.step(f);equal(a.captureState(),b.captureState());}
  assert.ok(a.readPose().y>=3.99,'climbs back to the roof');
 }
});
test('drop catches reject occupied hanging space, descent obstacles, corners, and short drops',()=>{
 const cases=[{walls:[[0,-2,8,4,4]],surfaces:[{minX:-.8,maxX:.8,minZ:.2,maxZ:.6,bottom:1.7,top:2.1}],start:[0,-2],yaw:0},
  {walls:[[0,-2,8,4,4]],surfaces:[{minX:.1,maxX:.14,minZ:.2,maxZ:.6,bottom:3.8,top:3.82}],start:[0,-2],yaw:0},
  {walls:[[0,-2,8,4,4]],surfaces:[{minX:-4,maxX:4,minZ:0,maxZ:4,bottom:1.5,top:1.8}],start:[0,-2],yaw:0},
  {walls:[[0,-2,8,4,4]],start:[2,-2],yaw:Math.PI/4}];
 for(const spec of cases){const a=make({custom:spec});a.reset({x:spec.start[0],y:4,z:spec.start[1],yaw:spec.yaw});for(let i=0;i<170;i++)a.step(input(65,0,spec.yaw));assert.equal(a.captureState().parkour.stats.drops,0);}
});
