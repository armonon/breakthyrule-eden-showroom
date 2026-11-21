// Natural motion (character-motion.js), measured on the real rig without a browser: planted feet stay put in the
// world, feet follow the ground, standing turns step, landings sink into the knees, clip changes do not pop.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as T from 'three';

const root=new URL('../../',import.meta.url);
async function rig({ground=null,natural=true}={}){
 const scope={console,atob,AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>JSON.parse(readFileSync(new URL('assets/anim/clips.json',root),'utf8'))})};scope.window=scope;
 for(const name of ['movement-state.js','assets/character-human-base.js','character-anim.js','character-motion.js'])vm.runInNewContext(readFileSync(new URL(name,root),'utf8'),scope);
 await scope.GardenAnim.load();
 const M=scope.GardenCharacterMotion;for(const k of Object.keys(M.natural))M.natural[k]=natural;M.ground=ground;
 const data=scope.GardenHumanBase,group=new T.Group(),scale=1.75/16.6589;
 const points=data.bones.map(b=>new T.Vector3(b.position[0],b.position[1]+8.1676,b.position[2]).multiplyScalar(scale));
 const bones=data.bones.map((b,i)=>{const bone=new T.Bone();bone.name=b.name;bone.position.copy(points[i]);if(b.parent>=0)bone.position.sub(points[b.parent]);return bone;});
 data.bones.forEach((b,i)=>{if(b.parent>=0)bones[b.parent].add(bones[i]);else group.add(bones[i]);});
 const scene=new T.Group();scene.add(group);
 const skeleton=new T.Skeleton(bones);group.updateMatrixWorld(true);skeleton.calculateInverses();
 const model={root:group,skeleton},motion=M.create(T,model);
 const foot=n=>skeleton.getBoneByName(n).getWorldPosition(new T.Vector3());
 return {M,motion,group,skeleton,foot,bone:n=>skeleton.getBoneByName(n)};
}
const flat=()=>0;
// Walk the root forward at `speed` for `seconds`, turning at `turn` rad/s, sampling both feet each frame.
function walk(r,{speed=1.6,seconds=3,turn=0,dt=1/60,ground=null}={}){
 const out=[];let yaw=0;
 for(let t=0;t<seconds;t+=dt){yaw+=turn*dt;r.group.rotation.y=yaw;r.group.position.x+=Math.sin(yaw)*speed*dt;r.group.position.z+=Math.cos(yaw)*speed*dt;if(ground)r.group.position.y=ground(r.group.position.x,r.group.position.z);
  r.motion.update(dt,{});r.group.updateMatrixWorld(true);out.push({L:r.foot('foot.L'),R:r.foot('foot.R'),root:r.group.position.clone()});}
 return out;
}
// Mean horizontal speed of a foot while it is down (within 2 cm of its lowest point over the run).
function slide(frames,side,dt=1/60){const lowest=Math.min(...frames.map(f=>f[side].y-f.root.y));let sum=0,n=0;
 for(let i=1;i<frames.length;i++){const a=frames[i-1][side],b=frames[i][side];if(a.y-frames[i-1].root.y<lowest+.02&&b.y-frames[i].root.y<lowest+.02){sum+=Math.hypot(b.x-a.x,b.z-a.z)/dt;n++;}}
 return {speed:sum/Math.max(1,n),frames:n};}

test('planted feet stay put in the world while walking, also through a turn',async()=>{
 for(const turn of [0,1.2]){
  const off=await rig({natural:false,ground:flat}),on=await rig({ground:flat});
  const a=walk(off,{turn}).slice(60),b=walk(on,{turn}).slice(60);
  const before=(slide(a,'L').speed+slide(a,'R').speed)/2,after=(slide(b,'L').speed+slide(b,'R').speed)/2;
  assert.ok(slide(b,'L').frames>20,'feet spend time planted');
  assert.ok(after<.08,`planted feet barely move (turn ${turn}): ${after.toFixed(3)} m/s, was ${before.toFixed(3)}`);
  assert.ok(after<before,'better than before');
 }
});

test('feet follow the ground: on a slope each foot meets the ground under it',async()=>{
 const slope=(x,z)=>z*.25,r=await rig({ground:slope}),frames=walk(r,{ground:slope,speed:1.4}).slice(90);
 const lowest=[];for(const f of frames)for(const s of ['L','R'])lowest.push(f[s].y-slope(f[s].x,f[s].z));
 const contact=Math.min(...lowest);
 // the lowest point of each step sits on the ground under that foot (ankle height above it), not on the root's level
 const off=await rig({natural:false,ground:slope}),frames2=walk(off,{ground:slope,speed:1.4}).slice(90);
 const err=f=>Math.min(...['L','R'].map(s=>Math.abs(f[s].y-slope(f[s].x,f[s].z)-contact)));
 const mean=a=>a.reduce((s,f)=>s+err(f),0)/a.length;
 assert.ok(mean(frames)<mean(frames2),`closer to the ground under the foot: ${mean(frames).toFixed(3)} vs ${mean(frames2).toFixed(3)}`);
});

test('a step: the pelvis drops so the lower foot can reach',async()=>{
 const step=(x)=>x>.05?-.2:0,ground=(x,z)=>step(x),r=await rig({ground});
 r.group.position.set(0,0,0);for(let i=0;i<60;i++)r.motion.update(1/60,{});r.group.updateMatrixWorld(true);
 const L=r.foot('foot.L'),R=r.foot('foot.R'),low=L.x>R.x?L:R,high=L.x>R.x?R:L;
 assert.ok(high.y-low.y>.12,`the foot over the drop stands lower: ${(high.y-low.y).toFixed(3)} m`);
});

test('turning on the spot steps: both feet lift and come down, and stay put while down',async()=>{
 const r=await rig({ground:flat});for(let i=0;i<30;i++)r.motion.update(1/60,{});
 const frames=[];for(let i=0;i<150;i++){r.group.rotation.y+=1.4/60;r.motion.update(1/60,{});r.group.updateMatrixWorld(true);frames.push({L:r.foot('foot.L'),R:r.foot('foot.R'),root:r.group.position.clone()});}
 for(const s of ['L','R']){const ys=frames.map(f=>f[s].y),low=Math.min(...ys);let lifts=0,up=false;for(const y of ys){if(!up&&y>low+.025){lifts++;up=true;}else if(up&&y<low+.01)up=false;}
  assert.ok(lifts>=2,`${s} foot lifts ${lifts} times`);assert.ok(slide(frames,s).speed<.08,`${s} foot stays put while down: ${slide(frames,s).speed.toFixed(3)} m/s`);}
});

test('a landing sinks into the knees, deeper from higher up',async()=>{
 const dip=async(height)=>{const r=await rig({ground:flat});const hip=r.bone('root');for(let i=0;i<30;i++)r.motion.update(1/60,{});r.group.updateMatrixWorld(true);const rest=hip.getWorldPosition(new T.Vector3()).y;
  // fall from `height`: airborne while the root drops, then land
  r.motion.airborne(true);let y=height,v=0;while(y>0){v-=15/60;y=Math.max(0,y+v/60);r.group.position.y=y;r.motion.update(1/60,{});}
  r.motion.airborne(false);let low=rest;for(let i=0;i<40;i++){r.group.position.y=0;r.motion.update(1/60,{});r.group.updateMatrixWorld(true);low=Math.min(low,hip.getWorldPosition(new T.Vector3()).y);}
  return rest-low;};
 const small=await dip(.4),big=await dip(2.5);
 assert.ok(big>small+.02,`a 2.5 m fall dips the hips more (${big.toFixed(3)} m) than a hop (${small.toFixed(3)} m)`);
 assert.ok(big<.45,'but stays a dip, not a collapse');
});

test('a clip change blends instead of popping',async()=>{
 const pop=async(natural)=>{const r=await rig({ground:flat,natural});r.motion.animTune.loco=false;for(let i=0;i<20;i++)r.motion.update(1/60,{});
  const names=['spine01','neck01','upperarm01.L','upperarm01.R','lowerarm01.L','lowerarm01.R'],q=()=>names.map(n=>r.bone(n).quaternion.clone());
  let before=q(),worst=0;r.motion.play('wave',{fade:0,arms:true});
  for(let i=0;i<10;i++){r.motion.update(1/60,{});const now=q();worst=Math.max(worst,...now.map((x,j)=>x.angleTo(before[j])));before=now;}return worst;};
 const hard=await pop(false),soft=await pop(true);
 assert.ok(soft<hard*.7,`largest single-frame bone turn: ${(soft*57.3).toFixed(1)} deg with blending, ${(hard*57.3).toFixed(1)} deg without`);
});

test('the body reports its own bob for the camera',async()=>{
 const r=await rig({ground:flat});const bobs=walk(r,{speed:2.4,seconds:2}).map(()=>0);let lo=9,hi=-9;
 for(let i=0;i<120;i++){r.group.position.z+=2.4/60;r.motion.update(1/60,{});const b=r.motion.bob();lo=Math.min(lo,b);hi=Math.max(hi,b);}
 assert.ok(hi-lo>.01&&hi-lo<.12,`bob range ${(hi-lo).toFixed(3)} m`);
});

test('switched off, the motion matches the original exactly',async()=>{
 const a=await rig({natural:false,ground:null}),b=await rig({natural:false,ground:flat});
 walk(a,{seconds:1});walk(b,{seconds:1});
 for(const n of ['foot.L','foot.R','upperarm01.L','spine01'])assert.ok(a.foot(n).distanceTo(b.foot(n))<1e-9,n);
});

test('wall run: the hand on the wall side lies on the wall face',async()=>{
 const run=async({natural=true,wall=.41}={})=>{
  const r=await rig({natural,ground:flat}),model={root:r.group,skeleton:r.skeleton,motion:r.motion,byName:{}};
  r.skeleton.bones.forEach(b=>model.byName[b.name]=b);r.group.updateMatrixWorld(true);
  // The wall stands on the side of the right hand, `wall` metres from the body; its normal points back at the body.
  const sx=Math.sign(r.bone('wrist.R').getWorldPosition(new T.Vector3()).x),face=sx*wall,normal=[-sx,0];
  let handRise=0,handsOn=false;const gaps=[],ys=[],dt=1/60;
  for(let t=0;t<1.2;t+=dt){r.group.position.set(0,0,r.group.position.z+6*dt);
   ({handRise,handsOn}=r.M.traverseBody(T,model,{hands:null,handRise,handsOn,pose:{traversal:{kind:'wallrun',time:t,duration:0,side:1,normal,wall:Number.isFinite(wall)?wall:undefined}},dt}));
   r.motion.update(dt,{velocity:new T.Vector3(0,0,6)});r.group.updateMatrixWorld(true);
   if(t>.5){const h=r.bone('wrist.R').getWorldPosition(new T.Vector3());gaps.push(Math.abs(face-h.x));ys.push(h.y);}}
  run.height=Math.max(...ys)-Math.min(...ys);return gaps.reduce((s,x)=>s+x,0)/gaps.length;
 };
 const on=await run(),steady=run.height,off=await run({natural:false}),far=await run({wall:.55});
 console.log('wall-run wrist to wall face (m):',{on:+on.toFixed(3),off:+off.toFixed(3),widerGap:+far.toFixed(3)});
 assert.ok(on<.07,`the wrist sits a palm's thickness off the wall, got ${on.toFixed(3)} m`);
 assert.ok(steady<.2,`the hand stays put on the wall instead of paddling, moved ${steady.toFixed(2)} m`);
 assert.ok(far<.08,`a wider gap still reaches the wall, got ${far.toFixed(3)} m`);
 assert.ok(off>on+.15,'with natural hands off the hand does not reach for the wall');
});
