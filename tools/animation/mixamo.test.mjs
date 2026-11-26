import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {mergeLibrary} from './mixamo-postprocess.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const read=f=>fs.readFileSync(path.join(ROOT,f));
const lib=JSON.parse(read('assets/anim/clips.json'));
const manifest=JSON.parse(read('assets/anim/mixamo-manifest.json'));
const want=JSON.parse(read('tools/animation/mixamo-clips.json'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const decode=s=>{const b=Buffer.from(s,'base64');return new Int16Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));};
function angle(q,a,b,bone){
 let dot=0,aa=0,bb=0;
 for(let k=0;k<4;k++){const x=q[(a*lib.bones.length+bone)*4+k],y=q[(b*lib.bones.length+bone)*4+k];dot+=x*y;aa+=x*x;bb+=y*y;}
 return 2*Math.acos(Math.min(1,Math.abs(dot)/Math.sqrt(aa*bb)));
}

test('all 15 exports are traceable to the committed runtime bake',()=>{
 assert.equal(want.length,15);assert.equal(new Set(want.map(w=>w.id)).size,15);
 assert.equal(manifest.runtimeSha256,sha(read('assets/anim/clips.json')));
 assert.ok(read('assets/anim/CREDITS.txt').toString().includes(manifest.runtimeSha256));
 for(const w of want){
  const record=manifest.clips.find(c=>c.id===w.id),clip=lib.clips[w.id];
  assert.ok(record&&clip,w.id);assert.equal(record.file,w.file);
  assert.equal(record.sourceSha256,sha(read('assets/cowninja/mixamo/'+w.file)),w.id);
  assert.equal(clip.src,'mixamoX');assert.equal(clip.fps,30);assert.equal(clip.loop,w.loop);
  assert.equal(clip.n,record.frames);assert.equal(clip.duration,record.duration);
 }
});

test('runtime loader accepts the complete library and every new quaternion is normalized',async()=>{
 const context={window:{},console,atob:s=>Buffer.from(s,'base64').toString('binary'),AbortController,setTimeout,clearTimeout,
  fetch:async()=>({ok:true,json:async()=>lib})};
 vm.runInNewContext(read('character-anim.js').toString(),context);
 await context.window.GardenAnim.load();assert.equal(context.window.GardenAnim.ready(),true);
 for(const w of want){
  const c=context.window.GardenAnim.clip(w.id);
  assert.equal(c.q.length,c.n*lib.bones.length*4,w.id);assert.equal(c.hip.length,c.n,w.id);
  for(let p=0;p<c.q.length;p+=4){
   const norm=Math.hypot(c.q[p],c.q[p+1],c.q[p+2],c.q[p+3])/32767;
   assert.ok(Math.abs(norm-1)<.0001,`${w.id} invalid quaternion at ${p}`);
  }
 }
});

test('controller-driven moves do not add a second root trajectory; loops close smoothly',()=>{
 for(const w of want){
  const c=lib.clips[w.id],hip=decode(c.hip),q=decode(c.q);
  if(w.rootMotion==='flat')assert.ok(hip.every(n=>n===0),w.id+' duplicates movement translation');
  if(w.loop){
   assert.equal(hip[0],hip.at(-1),w.id+' hip seam');
   for(let bone=0;bone<lib.bones.length;bone++)assert.ok(angle(q,0,c.n-1,bone)<.001,w.id+' rotation seam: '+lib.bones[bone]);
   // A corrected loop must not introduce an abrupt whole-body spin at its wrap.
   for(let f=1;f<c.n;f++)for(let bone=0;bone<lib.bones.length;bone++)assert.ok(angle(q,f-1,f,bone)<.65,w.id+' discontinuity');
  }
 }
 const roll=decode(lib.clips.pkRoll.hip);
 assert.equal(lib.clips.pkRoll.n,51); // Begins at first ground contact, source frame 14.
 assert.ok(Math.min(...roll)>-10000&&Math.min(...roll)<-5000,'roll retains body compression without the preceding fall');
 assert.equal(lib.clips.stealthAssassin.duration,lib.clips.stealthVictim.duration,'paired takedown timing');
 assert.notEqual(lib.clips.pkShimmyL.q,lib.clips.pkShimmyR.q,'mirrored shimmy must be a distinct motion');
});

test('paired stealth clips retain synchronized actor root trajectories in game axes',()=>{
 for(const w of want){
  const c=lib.clips[w.id];
  if(!w.rootXZ){assert.equal(c.rootXZ,undefined,w.id+' must keep translation in the movement controller');continue;}
  const track=decode(c.rootXZ);assert.equal(track.length,c.n*2,w.id);
  assert.equal(track[0],0);assert.equal(track[1],0);
  // Both source actors advance forward during the takedown; the assassin also
  // approaches before contact. A flattened path cannot preserve the hand contact.
  assert.ok(track[track.length-1]>12000,w.id+' missing forward travel');
 }
 const assassin=decode(lib.clips.stealthAssassin.rootXZ),victim=decode(lib.clips.stealthVictim.rootXZ);
 assert.ok(assassin[61]>victim[61]+7000,'attacker approach before synchronized contact');
 assert.equal(lib.clips.stealthAssassin.n,lib.clips.stealthVictim.n);
});

test('merging a new source preserves unrelated clips and refuses to reinterpret retained skeletons',()=>{
 const old={version:1,bones:['root'],sources:{mixamo:{dirs:{root:[0,1,0]}}},clips:{hang:{src:'mixamo',q:'old-hang'},climb:{src:'mixamo',q:'old-climb'}}};
 const before=JSON.stringify(old),newSource={dirs:{root:[0,.9,.1]}};
 const baked={bones:['root'],sources:{mixamoX:newSource},clips:{climb:{src:'mixamoX',q:'new-climb'}}};
 const merged=mergeLibrary(old,baked);
 assert.equal(JSON.stringify(old),before);assert.equal(merged.clips.hang,old.clips.hang);
 assert.equal(merged.sources.mixamo,old.sources.mixamo);assert.equal(merged.clips.climb,baked.clips.climb);
 assert.throws(()=>mergeLibrary(old,{...baked,sources:{mixamo:newSource}}),/retained clips/);
 assert.throws(()=>mergeLibrary(old,{...baked,bones:['other']}),/Bone list changed/);
});
