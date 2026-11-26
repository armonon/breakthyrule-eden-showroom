import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const root=new URL('../../',import.meta.url);
const scope=vm.createContext({console,performance,URL,TextEncoder,TextDecoder,location:{href:'file:///headless/'}});scope.window=scope;
for(const file of ['assets/three.min.js','expedition-world.js','movement-state.js','player-motion.js','parkour-grips.js','parkour.js','player-movement.js','expedition-controller.js'])vm.runInContext(readFileSync(new URL(file,root),'utf8'),scope,{filename:file});
const clone=s=>JSON.parse(JSON.stringify(s)),frame=(heldMask=0,edges=0,yaw=Math.PI)=>({heldMask,edges,yaw,pitch:0});
function make(spec={}){
 const layout={bounds:[-100,100,-250,100],spawn:[0,0],landmarks:[]},world=scope.createExpeditionWorld({layout,roofs:{}});
 world.walls.push(...(spec.walls||[]));world.surfaces.push(...(spec.surfaces||[]));
 return scope.createExpeditionController({T:scope.THREE,world,layout,character:{height:175,shoulders:1},worldRevision:'parkour-animation-test'});
}
const platforms={walls:[[0,-2,2,4,4],[-3,-2,2,4,4],[3,-2,2,4,4]]};
function hang(spec=platforms){
 const a=make(spec);a.reset({x:0,y:4,z:-2,yaw:0});
 for(let i=0;i<180&&a.parkour.kind()!=='hang';i++)a.step(frame(65,0,0));
 assert.equal(a.parkour.kind(),'hang');
 for(let i=0;i<22;i++)a.step(frame());
 return a;
}
function replay(a,b,inputs){
 b.restoreState(clone(a.captureState()));
 for(const input of inputs){a.step(input);b.step(input);assert.deepEqual(clone(a.captureState()),clone(b.captureState()));assert.deepEqual(clone(a.movement.traversal()),clone(b.movement.traversal()));}
}

test('actual left/right ledge hops select distinct clips and replay through the catch',()=>{
 for(const [held,action] of [[4,'hopLeft'],[8,'hopRight']]){
  const a=hang(),b=make(platforms);a.step(frame(held|32,1));
  assert.equal(a.movement.traversal()?.action,action);assert.equal(a.parkour.kind(),'warp');
  replay(a,b,Array.from({length:40},()=>frame()));
  assert.equal(a.parkour.kind(),'hang');assert.equal(a.movement.traversal().kind,'hang');
 }
});

test('upward ledge hop reaches a higher shelf and replays through its catch',()=>{
 const spec={walls:[[0,-2,4,4,4]],surfaces:[{minX:-.6,maxX:.6,minZ:-.6,maxZ:0,bottom:4.8,top:5}]};
 const a=make(spec),b=make(spec);
 // Approach the lower ledge beside the shelf, then shimmy beneath it. Starting
 // above it would correctly fail standing clearance against the upper shelf.
 a.reset({x:-1.3,y:4,z:-2,yaw:0});
 for(let i=0;i<180&&a.parkour.kind()!=='hang';i++)a.step(frame(65,0,0));
 assert.equal(a.parkour.kind(),'hang');
 for(let i=0;i<22;i++)a.step(frame());
 for(let i=0;i<60;i++)a.step(frame(8));
 assert.ok(Math.abs(a.readPose().x)<.6,'shimmy beneath the upper handhold');
 a.step(frame(33,1));
 assert.equal(a.movement.traversal()?.action,'hopUp');assert.equal(a.parkour.kind(),'warp');
 replay(a,b,Array.from({length:45},()=>frame()));
 assert.equal(a.parkour.kind(),'hang');assert.equal(a.captureState().parkour.state.ledge.top,5);
 assert.ok(Math.abs(a.readPose().y-2.95)<1e-8,'caught the upper shelf without stacking animation root motion');
});

test('ledge release presents only the release segment and expires during free fall',()=>{
 const a=hang(),b=make(platforms);a.step(frame(2));
 assert.equal(a.parkour.active(),false);assert.equal(a.movement.traversal()?.kind,'hangdrop');
 replay(a,b,Array.from({length:28},()=>frame()));
 assert.notEqual(a.movement.traversal()?.kind,'hangdrop');
 const saved=clone(a.captureState()),before=clone(saved);saved.parkour.dropAt=saved.parkour.clock+1;
 assert.throws(()=>a.restoreState(saved));assert.deepEqual(clone(a.captureState()),before);
});

test('pipe animation changes from entry to a reversible loop and then a ladder exit',()=>{
 const a=make(),b=make(),g=scope.parkourGrips.grips.find(g=>g.type==='pipe');
 a.reset({x:g.x+g.n[0]*.45,z:g.z+g.n[1]*.45});a.step(frame(0,1));
 assert.equal(a.movement.traversal().phase,'enter');
 replay(a,b,Array.from({length:44},()=>frame(1)));
 assert.equal(a.movement.traversal().phase,'loop');assert.equal(a.movement.traversal().vertical,1);
 a.step(frame());assert.equal(a.movement.traversal().vertical,0);
 a.step(frame(2));assert.equal(a.movement.traversal().vertical,-1);
 let exit=false;for(let i=0;i<200;i++){a.step(frame(1));if(a.movement.traversal()?.kind==='ladderExit'){exit=true;break;}}
 assert.ok(exit,'pipe reaches a real roof mantle');replay(a,b,Array.from({length:80},()=>frame()));
 assert.equal(a.parkour.active(),false);
});

test('old movement snapshots default new presentation clocks and metadata safely',()=>{
 const a=hang(),saved=clone(a.captureState());delete saved.parkour.dropAt;delete saved.movement.rollTime;
 a.restoreState(saved);assert.equal(a.captureState().parkour.dropAt,null);assert.equal(a.captureState().movement.rollTime,null);
 assert.equal(a.movement.traversal().kind,'hang');
});

test('landing roll clock drives both games and survives restore without an animation input edge',()=>{
 const a=make(),b=make();a.reset({x:20,y:4,z:10});a.motion.set(4,-3);
 let rolled=false;
 for(let i=0;i<180;i++){
  const p=a.readPose();a.step(frame(p.y<.65?64:0,p.y<.65?2:0));
  if(a.movement.traversal()?.kind==='roll'){rolled=true;break;}
 }
 assert.ok(rolled,'timed crouch landing creates a persistent roll presentation');
 const at=clone(a.captureState());assert.equal(at.movement.rollTime,0);
 replay(a,b,Array.from({length:55},()=>frame()));assert.equal(a.captureState().movement.rollTime,null);
 const bad=clone(a.captureState());bad.movement.rollTime=-1;assert.throws(()=>a.restoreState(bad));
});
