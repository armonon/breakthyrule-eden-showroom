import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as T from 'three';
function setup({boxes=[],fields=[],height=175,shoulders=1,dt=1/60,ground=()=>0}={}){
 const c={window:{},performance};vm.createContext(c);
 for(const file of ['expedition-world.js','player-motion.js','parkour.js','player-movement.js'])vm.runInContext(readFileSync(new URL('../../'+file,import.meta.url),'utf8'),c);
 const root=c.window,profile=root.playerBodyProfile({height,shoulders}),pos=new T.Vector3(0,ground(0,0)+1.75,0),aim=pos.clone().add(new T.Vector3(0,0,-5)),vel=new T.Vector3(),motion=root.createPlayerMotion(),keys=new Set(),noop=()=>{};
 let movement;const parkour=root.createParkour({T,walls:()=>[],surfaces:()=>[...boxes,...fields.map(field=>({field}))],ground,player:{pos,aim,vel,motion,keys,bodyDimensions:()=>profile,crouchHeld:()=>movement.crouchHeld,sway:{bump:noop},surface:()=>'',requestDraw:noop}});
 movement=root.createPlayerMovement({T,targetPosition:pos,targetAim:aim,walkVelocity:vel,motion,keys,bodyDimensions:()=>profile,sway:{bump:noop},surfaceAt:()=>'',puff:noop,hitStop:noop,requestDraw:noop,obstacle:()=>false,groundHeight:p=>ground(p.x,p.z),prepareWalking:noop,shiftHeight:d=>{pos.y+=d;aim.y+=d;},kick:noop,state:{ready:true},modalOpen:()=>false,fistsEngaged:()=>false,parkour:()=>parkour,pk:()=>parkour,parkourOn:()=>true,garden:{constrain:n=>n},expedition:{canMove:()=>true,constrain:n=>n}});
 const tick=()=>{movement.move(dt);movement.updateJump(dt);movement.updateCrouch(dt);movement.updateAir(dt,vel.length(),motion.inspect().airborne);};
 const run=seconds=>{for(let i=0;i<Math.ceil(seconds/dt);i++)tick();};
 return {root,movement,parkour,pos,aim,vel,motion,keys,profile,tick,run};
}
const slab=(bottom,top=bottom+.02)=>({minX:-30,maxX:30,minZ:-30,maxZ:30,bottom,top});
const field=(top)=>({minX:-4,minZ:-4,cell:1,cols:8,rows:8,h:Array(64).fill(top)});
for(const dt of [1/30,1/60,1/120,.05])test(`jump clips a thin ceiling and falls normally at dt=${dt}`,()=>{
 const f=setup({boxes:[slab(2)],dt});f.keys.add('a');f.movement.jump();let peak=0,hit=false;
 for(let i=0;i<Math.ceil(2/dt);i++){f.tick();peak=Math.max(peak,f.pos.y-1.75);hit||=f.motion.inspect().velocity===0&&f.pos.y>1.76;assert.ok(f.pos.y-1.75+f.profile.height<=2.006);}
 assert.ok(hit);assert.ok(peak>.2);assert.ok(f.pos.x< -3);assert.ok(Math.abs(f.pos.y-1.75)<1e-6);assert.equal(f.motion.inspect().airborne,false);
});
test('measured slab covers footprint corners without filling empty space underneath',()=>{
 const f=setup({fields:[field(2.2)]});f.movement.jump();let peak=0;for(let i=0;i<120;i++){f.tick();peak=Math.max(peak,f.pos.y-1.75);assert.ok(f.pos.y-1.75<=.256);}assert.ok(peak>.2);
 const high=setup({fields:[field(6)]});high.movement.jump();high.keys.add('a');high.run(.3);assert.ok(high.pos.x<-.15);assert.ok(high.pos.y>2.3);
 const tiny={minX:.18,minZ:.18,cell:.1,cols:1,rows:1,h:[1.8]};const corner=setup({fields:[tiny]});assert.equal(corner.parkour.bodyFits({x:0,y:0,z:0}),false);
});
test('crouch passes a low tunnel; release stays low until outside',()=>{
 const box={minX:-2,maxX:2,minZ:-4,maxZ:-2,bottom:1.35,top:1.5};const f=setup({boxes:[box]});f.keys.add('w');f.run(1);assert.ok(f.pos.z> -1.75);
 f.movement.crouchHeld=true;for(let i=0;i<130&&f.pos.z> -2.8;i++)f.tick();assert.ok(f.pos.z< -2.5,'crouched passage');f.movement.crouchHeld=false;f.keys.clear();f.run(.4);assert.equal(f.movement.state(),'crouch');assert.ok(f.movement.bodyHeight()<=1.356);
 f.keys.add('w');for(let i=0;i<300;i++){f.tick();if(f.pos.z> -4.25)assert.ok(f.movement.bodyHeight()<=1.356);}assert.ok(f.pos.z< -4.3);assert.equal(f.movement.state(),'ground');
});
test('positive 15 cm measured steps agree with walking floors',()=>{const f=setup({fields:[field(.15)]});assert.equal(f.parkour.floorAt(0,0,.45),.15);});
const obstacle={minX:-1,maxX:1,minZ:-1.2,maxZ:-.55,bottom:-1,top:.8};
test('low vault is selected before a mantle and crosses using input',()=>{
 const f=setup({boxes:[obstacle]});f.keys.add('w');f.movement.jump();assert.equal(f.movement.state(),'vault');for(let i=0;i<45;i++){f.tick();assert.ok(f.parkour.bodyFits({x:f.pos.x,y:f.pos.y-1.75,z:f.pos.z}));}assert.ok(f.pos.z< -1.5);assert.equal(f.movement.counts().vaults,1);assert.ok(f.pos.y<1.76);
});
test('vault rejects a mid-path ceiling, a wide obstacle and missing far support without changing the player',()=>{
 for(const options of [
  {boxes:[obstacle,{minX:-1,maxX:1,minZ:-1.4,maxZ:-.6,bottom:2.3,top:2.4}]},
  {boxes:[{...obstacle,minZ:-5}]},
  {boxes:[obstacle],ground:(x,z)=>z< -1.25?-5:0}
 ]){const f=setup(options),before=f.pos.clone();assert.equal(f.movement.tryVault(new T.Vector3(0,0,-1)),false);assert.ok(f.pos.equals(before));assert.equal(f.motion.inspect().height,0);assert.equal(f.movement.vault,null);}
});
test('cancelled vault cannot restart after bail or a retry',()=>{const f=setup({boxes:[obstacle]});assert.ok(f.movement.tryVault(new T.Vector3(0,0,-1)));f.run(.1);f.movement.cancelTraversal();const before=f.pos.clone();f.run(.3);assert.equal(f.movement.vault,null);assert.ok(f.pos.distanceTo(before)<.01);});
test('strict standing clearance uses actual small and large body profiles',()=>{
 const small=setup({boxes:[slab(1.7)],height:145}),tall=setup({boxes:[slab(1.7)],height:210});assert.equal(small.parkour.bodyFits({x:0,y:0,z:0}),true);assert.equal(tall.parkour.bodyFits({x:0,y:0,z:0}),false);
});
test('measured and explicit mantle endpoints both require standing headroom',()=>{
 for(const fields of [[],[{minX:-1,minZ:-2,cell:1,cols:2,rows:2,h:[1,1,1,1]}]]){
  const ledge={...obstacle,minZ:-2,top:1},ceiling={minX:-2,maxX:2,minZ:-3,maxZ:-.3,bottom:2.2,top:2.4};const f=setup({boxes:fields.length?[ceiling]:[ledge,ceiling],fields});assert.equal(f.parkour.ledgeAhead(f.pos,0,new T.Vector3(0,0,-1),.45,1.5,1.2),null);
 }
});
test('swept ragdoll correction cannot translate a capsule through a thin wall',()=>{
 const f=setup(),wall={minX:.5,maxX:.52,minZ:-4,maxZ:4,bottom:-1,top:4},clearance=f.root.createBodyClearance({boxes:()=>[wall]});
 const points=[{point:{x:0,y:.5,z:0},radius:.1},{point:{x:0,y:1,z:0},radius:.1}];assert.equal(clearance.canTranslate(points,{x:1,y:0,z:0}),false);assert.equal(clearance.canTranslate(points,{x:0,y:0,z:1}),true);
});

test('wide tall characters can mantle without pushing their torso through the wall',()=>{
 const box={minX:-2,maxX:2,minZ:-3,maxZ:-1,bottom:-1,top:2.55};
 for(const [height,shoulders] of [[145,.8],[175,1],[210,1.3]]){
  const f=setup({boxes:[box],height,shoulders});f.keys.add('w');
  for(let i=0;i<300&&f.pos.y-1.75<2.54;i++){if(i%50===0&&!f.parkour.active())f.movement.jump();f.tick();assert.ok(f.parkour.bodyFits({x:f.pos.x,y:f.pos.y-1.75,z:f.pos.z}),'body stays clear during mantle');}
  assert.ok(f.pos.y-1.75>=2.54,`height ${height}, shoulders ${shoulders} reaches the top`);
 }
});

test('airborne correction preserves a falling body instead of snapping to street level',()=>{
 const f=setup();f.pos.set(27.78,7.16+1.75,-42.48);f.aim.copy(f.pos).add(new T.Vector3(1,0,0));f.motion.set(7.16,-4);
 const source=readFileSync(new URL('../../expedition-entry.js',import.meta.url),'utf8'),start=source.indexOf(' function correctPose(p)'),end=source.indexOf(' function prepareWalking()',start);
 const scope={bail:null,T,body:{bodyDimensions:()=>f.profile},world:{supportAt:()=>0},motion:f.motion,place(x,z,lx,lz,y){f.movement.cancelTraversal();f.parkour.reset();f.motion.reset();f.vel.set(0,0,0);f.pos.set(x,y+1.75,z);f.aim.set(lx,y+1.75,lz);}};
 vm.createContext(scope);vm.runInContext(source.slice(start,end)+';this.correct=correctPose;',scope);
 scope.correct({x:27.77,y:7.66,z:-42.44,yaw:Math.PI/2});assert.equal(f.motion.inspect().height,7.66);assert.equal(f.motion.inspect().velocity,-4);
 f.keys.add('w');f.tick();assert.ok(f.pos.y-1.75>7.5);assert.ok(f.pos.y-1.75<7.66);assert.equal(f.motion.inspect().airborne,true);
});
test('sampled descent around a roof lip validates its clear swept legs, never a blocked wall',()=>{
 const f=setup(),layout={bounds:[-10,10,-10,10],landmarks:[]},world=f.root.createExpeditionWorld({layout,roofs:{}});
 world.boxes.push({minX:0,maxX:3,minZ:-3,maxZ:3,bottom:8.8,top:9});
 const a={x:-.3,y:7.6,z:0,yaw:0,movement:'air'},b={x:.15,y:7.2,z:0,yaw:0,movement:'air'};
 assert.ok(world.clearance.fraction(a,b,1.45,.234)<1);assert.equal(world.validPose(a,b,.1,{height:145,shoulders:.8}),true);
 world.boxes.push({minX:-.05,maxX:.05,minZ:-3,maxZ:3,bottom:-1,top:8.7});assert.equal(world.validPose(a,b,.1,{height:145,shoulders:.8}),false);
});
