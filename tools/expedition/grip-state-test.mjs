import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {physicsBoxesForWorld} from '../../player-bail.js';

const root=new URL('../../',import.meta.url),scope=vm.createContext({console,performance,URL,TextEncoder,TextDecoder,location:{href:'file:///headless/'}});scope.window=scope;
for(const file of ['assets/three.min.js','expedition-world.js','movement-state.js','player-motion.js','parkour-grips.js','parkour.js','player-movement.js','expedition-controller.js'])vm.runInContext(readFileSync(new URL(file,root),'utf8'),scope,{filename:file});
const clone=s=>JSON.parse(JSON.stringify(s)),equal=(a,b)=>assert.deepEqual(clone(a),clone(b)),input=(heldMask=0,edges=0)=>({heldMask,edges,yaw:Math.PI,pitch:0});
function make(){
 const layout={bounds:[-100,100,-250,100],spawn:[0,0],landmarks:[]},world=scope.createExpeditionWorld({layout,roofs:{}});
 const controller=scope.createExpeditionController({T:scope.THREE,world,layout,character:{height:175,shoulders:1},worldRevision:'shared-grip-world'});return {controller,world};
}
function catchGrip(kind){
 const f=make(),a=f.controller,g=scope.parkourGrips.grips.find(g=>g.type===kind);
 if(kind==='pipe'){a.reset({x:g.x+g.n[0]*.45,z:g.z+g.n[1]*.45});a.step(input(0,1));}
 else{const x=kind==='bar'?(g.a[0]+g.b[0])/2:g.x,z=kind==='bar'?(g.a[2]+g.b[2])/2:g.z,y=kind==='bar'?g.a[1]-2.15:.6;a.reset({x,y,z});a.motion.set(y,1);a.step(input());}
 assert.equal(a.parkour.kind(),kind,'actual movement catches the '+kind);return f;
}

for(const kind of ['bar','pipe','rope'])test('actual '+kind+' motion survives complete snapshots and deterministic continuation',()=>{
 const a=catchGrip(kind).controller,b=make().controller;b.restoreState(clone(a.captureState()));
 for(let tick=0;tick<100;tick++){
  const frame=input(kind==='rope'?24:kind==='bar'?1:1);a.step(frame);
  if(tick%17===0)b.restoreState(clone(a.captureState()));else b.step(frame);
  equal(a.captureState(),b.captureState());if(a.parkour.kind()===kind)assert.equal(a.parkour.hands().length,2);
 }
 assert.ok(a.captureState().parkour.stats.grips>=1);
});

test('grip snapshots reject wrong prop types, missing timers and invalid ranges atomically',()=>{
 for(const kind of ['bar','pipe','rope']){
  const a=catchGrip(kind).controller,before=clone(a.captureState()),changes=[s=>s.parkour.state.id=scope.parkourGrips.grips.find(g=>g.type!==kind).id,s=>delete s.parkour.state.cReady,s=>s.parkour.cool.grip=-1,s=>s.parkour.stats.grips=.5];
  if(kind==='bar')changes.push(s=>s.parkour.state.u=-1,s=>s.parkour.state.ang=2);
  if(kind==='pipe')changes.push(s=>delete s.parkour.state.step,s=>s.parkour.state.y=100);
  if(kind==='rope')changes.push(s=>s.parkour.state.s=0,s=>s.parkour.state.qx=2);
  for(const change of changes){const bad=clone(before);change(bad);assert.throws(()=>a.restoreState(bad));equal(a.captureState(),before);}
 }
});

test('grip launch keeps a full chain restorable and still releases the player',()=>{
 const a=catchGrip('bar').controller,b=make().controller;for(let i=0;i<9;i++)a.step(input());
 const saved=clone(a.captureState());saved.parkour.chain=6;a.restoreState(saved);a.step(input(0,1));
 assert.equal(a.parkour.chain(),6);assert.equal(a.parkour.active(),false);assert.ok(a.motion.inspect().airborne);b.restoreState(clone(a.captureState()));equal(a.captureState(),b.captureState());
});

test('grip colliders agree across movement, authority, camera clearance and ragdoll geometry',()=>{
 const {controller:a,world}=make();assert.equal(world.boxes.filter(b=>b.grip).length,scope.parkourGrips.boxes.length);
 for(const box of scope.parkourGrips.boxes){
  const p={x:(box.minX+box.maxX)/2,y:0,z:(box.minZ+box.maxZ)/2};assert.equal(world.clearance.fits(p,1.75,.26),false);assert.equal(a.parkour.bodyFits(p),false);assert.equal(world.floorAt(p.x,p.z,box.top+.01),box.top);
 }
 const from={x:-1.5,y:0,z:-33},to={x:2.8,y:0,z:-33},fraction=world.clearance.fraction(from,to,1.75,.26);assert.ok(fraction<1);assert.equal(a.parkour.bodySweep(from,to),fraction);
 assert.equal(world.validPose({...from,yaw:0},{...to,yaw:0},1),false);
 const physics=physicsBoxesForWorld(world,{x:.6,z:-33});assert.ok(physics.some(b=>b.grip&&Math.abs(b.minX+.5)<1e-9&&b.top===4.2),'ragdoll receives the actual grip tower');
});
