import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as T from 'three';

const root=new URL('../../',import.meta.url);
const names=['spine03','spine02','spine01','neck01','head','clavicle.L','upperarm01.L','lowerarm01.L','wrist.L','clavicle.R','upperarm01.R','lowerarm01.R','wrist.R'];
const difference=(a,b)=>Math.max(...a.map((q,i)=>q.angleTo(b[i])));

async function rig(){
 const scope={console,atob,AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>JSON.parse(readFileSync(new URL('assets/anim/clips.json',root),'utf8'))})};scope.window=scope;
 for(const name of ['assets/character-human-base.js','character-anim.js','character-motion.js'])vm.runInNewContext(readFileSync(new URL(name,root),'utf8'),scope);
 await scope.GardenAnim.load();assert.ok(scope.GardenAnim.ready());
 const data=scope.GardenHumanBase,group=new T.Group(),scale=1.75/16.6589;
 const points=data.bones.map(b=>new T.Vector3(b.position[0],b.position[1]+8.1676,b.position[2]).multiplyScalar(scale));
 const bones=data.bones.map((b,i)=>{const bone=new T.Bone();bone.name=b.name;bone.position.copy(points[i]);if(b.parent>=0)bone.position.sub(points[b.parent]);return bone;});
 data.bones.forEach((b,i)=>{if(b.parent>=0)bones[b.parent].add(bones[i]);else group.add(bones[i]);});
 const skeleton=new T.Skeleton(bones);group.updateMatrixWorld(true);skeleton.calculateInverses();
 const model={root:group,skeleton},motion=scope.GardenCharacterMotion.create(T,model);motion.animTune.loco=false;
 // Sample the actual motion-to-clip pipeline at an exact animation time,
 // keeping the layer fully weighted so a fade cannot disguise a frozen clip.
 function sample(layer,t){layer.t=t;layer.w=1;motion.update(0);return names.map(name=>skeleton.getBoneByName(name).quaternion.clone());}
 return {api:scope.GardenAnim,motion,sample};
}

test('explicit looping repeats a shipped one-shot clip instead of freezing at its last pose',async()=>{
 const {api,motion,sample}=await rig(),clip=api.clip('wave'),period=(clip.n-1)/clip.fps;
 assert.equal(clip.loop,false);
 const layer=motion.play('wave',{loop:true,arms:true});
 const early=sample(layer,.5),later=sample(layer,1),nextCycle=sample(layer,period+.5);
 assert.ok(difference(early,later)>.02,'the source poses differ within a cycle');
 assert.ok(difference(early,nextCycle)<1e-6,'a repeated cycle returns to the same animated pose');
 assert.equal(motion.playing('wave'),true);assert.equal(clip.loop,false,'override must not alter shared clip metadata');
});

test('explicit one-shot on a looping clip keeps its final pose throughout fade-out',async()=>{
 const {api,motion,sample}=await rig(),clip=api.clip('dance'),period=(clip.n-1)/clip.fps;
 assert.equal(clip.loop,true);
 const layer=motion.play('dance',{loop:false,arms:true});
 const early=sample(layer,.25),end=sample(layer,period),fading=sample(layer,period+.25);
 assert.ok(difference(early,end)>.02,'the end pose is distinguishable from a restarted cycle');
 assert.ok(difference(end,fading)<1e-6,'fading one-shot cannot restart the source loop');
 assert.equal(motion.playing('dance'),false);assert.equal(clip.loop,true);
});

test('omitted overrides retain shipped loop and one-shot behavior',async()=>{
 for(const id of ['wave','dance']){
  const {api,motion,sample}=await rig(),clip=api.clip(id),period=(clip.n-1)/clip.fps;
  const layer=motion.play(id,{arms:true}),reference=sample(layer,clip.loop?.5:period),after=sample(layer,period+.5);
  assert.equal(layer.loop,clip.loop);assert.ok(difference(reference,after)<1e-6,id+' uses its baked playback behavior');
  assert.equal(motion.playing(id),clip.loop);
 }
});

test('holding a one-shot preserves its final pose and stopping still releases the layer',async()=>{
 const {api,motion,sample}=await rig(),clip=api.clip('wave'),layer=motion.play('wave',{hold:true,arms:true});
 const end=sample(layer,clip.duration),later=sample(layer,clip.duration+2);
 assert.ok(difference(end,later)<1e-6);assert.equal(layer.t,clip.duration);assert.equal(motion.playing('wave'),true);
 motion.stop('wave',.01);motion.update(.05);assert.equal(motion.playing('wave'),false);assert.equal(motion.inspect().actions.length,0);
});
