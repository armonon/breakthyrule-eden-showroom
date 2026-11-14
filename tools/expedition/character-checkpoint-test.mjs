import test from 'node:test';import assert from 'node:assert/strict';
import {loadExpeditionRuntime} from '../../server/expedition-runtime.mjs';
const runtime=await loadExpeditionRuntime(),{T}=runtime,clone=s=>JSON.parse(JSON.stringify(s));
const appearance={version:1,character:'riviera',height:181,shoulders:1.2,legLength:.95};
function tick(model,n){const m=model.motion,p=model.root.position;p.set(Math.sin(n/70)*.3,0,n/60);model.root.rotation.y=Math.sin(n/30)*.8;m.airborne(n%120>50&&n%120<75);m.crouch(n%160>120?1:0);m.holdKind(n%180<90?'pistol':null);m.aimAt(new T.Vector3(p.x+Math.sin(n/30)*3,1.5,p.z+4));m.lookAt(new T.Vector3(p.x,1.5,p.z+3));m.touch('L',new T.Vector3(p.x+.25,1.3,p.z+.35),null,n%180>90&&n%180<120?1:0,'grab');m.touch('R',null,null,0);m.guard(n%220>200?.5:0);if(n%120===3)m.play('pistolReload',{mask:'upper',arms:true});if(n%150===7)m.punch(new T.Vector3(p.x-.25,1.3,p.z+.6));if(n%190===42)m.hit(new T.Vector3(.4,0,.5),.5);m.update(1/60,{velocity:new T.Vector3(Math.cos(n/70),0,n%160<120?5:1),wade:n%140>120?.5:0});}
test('real authored and procedural animation resumes exactly with live springs, clips, contacts and airborne edges',()=>{
 for(const id of ['boulevard','harbor','midnight','coast','riviera','marina','garden','sunset']){
  const a=runtime.characterRig({...appearance,character:id}),b=runtime.characterRig({...appearance,character:id});
  try{for(let n=1;n<=360;n++){tick(a,n);if(n===1||n%29===0)b.motion.restoreState(clone(a.motion.captureState()));else tick(b,n);assert.deepEqual(clone(b.motion.captureState()),clone(a.motion.captureState()),`${id} tick ${n}`);}}
  finally{a.dispose();b.dispose();}
 }
});
test('canonical poses ignore viewer effects and global attention, and reject incompatible snapshots atomically',()=>{
 const a=runtime.characterRig(appearance),b=runtime.characterRig(appearance);
 try{for(let n=1;n<120;n++){runtime.scope.GardenCharacterMotion.attention=new T.Vector3(n,12,4);a.motion.presentation({firstPerson:1,sprint:1,lookYawRate:5});tick(a,n);runtime.scope.GardenCharacterMotion.attention=null;tick(b,n);assert.deepEqual(clone(a.motion.captureState()),clone(b.motion.captureState()));}
  assert.throws(()=>a.motion.knockdown(new T.Vector3(1,0,0)));
  const before=clone(a.motion.captureState());for(const edit of [s=>s.rigKey='other',s=>s.state.speed=NaN,s=>s.sides[0].hand=null,s=>s.bones[2].q=[0,0,0,0],s=>s.view.first=1,s=>s.state.layers=[{id:'missing'}],s=>s.state.velocity={isVector3:true,x:0,y:0,z:0},s=>s.state.crouch=0,s=>s.state.punches=.5,s=>s.bones.find(b=>b.name==='neck01').scale=[.001,.001,.001],s=>Object.defineProperty(s.tune,'guardLift',{get(){throw Error('bad getter');}})]){const bad=clone(before);edit(bad);assert.throws(()=>a.motion.restoreState(bad));assert.deepEqual(clone(a.motion.captureState()),before);}
 }finally{a.dispose();b.dispose();}
});
