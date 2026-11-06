'use strict';
// Authored animation clips for the shared rig, layered under the procedural motion (character-motion.js).
//
// assets/anim/clips.json (baked by tools/animation/bake-clips.cjs from Quaternius' Universal Animation Libraries,
// CC0, and Microsoft Rocketbox animations, MIT) stores, per clip and bone, the bone's world rotation relative to the
// source skeleton's rest pose, in the rig's axes (x = the character's left, y = up, z = forward), plus each source
// bone's rest direction. For a given character this file corrects for the difference between those rest directions
// and the character's own (a T-pose arm against an A-pose arm), then turns world rotations into the rig's local
// rotations. character-motion.js blends the result over its procedural pose with body masks, so hands on ledges,
// guns on target, planted feet and ragdolls stay procedural.
(function(root){
 let data=null,loading=null;const decoded=new Map();
 const b64=(s,Type)=>{const bin=atob(s),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new Type(u.buffer);};
 function load(){loading??=fetch('/assets/anim/clips.json?v=1').then(r=>r.json()).then(j=>{data=j;return j;}).catch(e=>{console.warn('Animation clips unavailable',e);loading=null;});return loading;}
 function clip(id){if(!data?.clips[id])return null;let c=decoded.get(id);if(!c){const s=data.clips[id];c={...s,q:b64(s.q,Int16Array),hip:b64(s.hip,Int16Array)};decoded.set(id,c);}return c;}
 const MASKS={};
 function masks(){if(MASKS.full)return MASKS;const B=data.bones;
  MASKS.full=B.map(()=>1);
  MASKS.upper=B.map(n=>/^(spine|neck|head|clavicle|upperarm|lowerarm|wrist)/.test(n)?1:0);
  MASKS.torso=B.map(n=>/^(spine|neck|head)/.test(n)?1:0);
  MASKS.arms=B.map(n=>/^(clavicle|upperarm|lowerarm|wrist)/.test(n)?1:0);
  return MASKS;}

 // Per character: the rig bones in clip order, their mapped parents and the rest-direction corrections per source.
 function rig(T,model){
  if(model.userData?.animRig)return model.userData.animRig;
  const bone=n=>model.skeleton.getBoneByName(n),B=data.bones,bones=B.map(bone),set=new Set(bones.filter(Boolean));
  const parent=bones.map(b=>{let p=b?.parent;while(p&&!set.has(p)&&p.isBone)p=p.parent;return p&&set.has(p)?bones.indexOf(p):-1;});
  // Our rest direction: towards the child the bake used (in rest every rig bone is unrotated, so local = world axes).
  const CH={root:'spine03',spine03:'spine02',spine02:'spine01',spine01:'neck01',neck01:'head'};for(const s of 'LR')Object.assign(CH,{[`clavicle.${s}`]:`upperarm01.${s}`,[`upperarm01.${s}`]:`lowerarm01.${s}`,[`lowerarm01.${s}`]:`wrist.${s}`,[`wrist.${s}`]:`middle1.${s}`,[`upperleg01.${s}`]:`lowerleg01.${s}`,[`lowerleg01.${s}`]:`foot.${s}`,[`foot.${s}`]:`toes.${s}`});
  const worldRest=new Map();const wr=b=>{if(!b)return new T.Vector3();if(worldRest.has(b))return worldRest.get(b);const p=b.parent&&b.parent.isBone?wr(b.parent):new T.Vector3();const v=p.clone().add(b.position);worldRest.set(b,v);return v;};
  const ours=B.map((n,i)=>{const b=bones[i],c=CH[n]&&bone(CH[n]);if(!b||!c)return null;const d=wr(c).clone().sub(wr(b));return d.lengthSq()>1e-10?d.normalize():null;});
  const corr={};
  for(const [src,{dirs}] of Object.entries(data.sources))corr[src]=B.map((n,i)=>{const s=dirs[n],o=ours[i];if(!s||!o)return new T.Quaternion();return new T.Quaternion().setFromUnitVectors(o,new T.Vector3(...s));});
  const pelvis=bone('root'),r={bones,parent,corr,hipY:pelvis?pelvis.position.y:1,pelvis,q:B.map(()=>new T.Quaternion()),l:B.map(()=>new T.Quaternion())};
  model.userData||(model.userData={});model.userData.animRig=r;return r;
 }
 // Pose one clip at time t (seconds): world rotations into r.q, returns the hip offset in metres.
 const tmpA=[0,0,0,0];
 function poseWorld(T,r,c,t){
  const n=c.n,f=c.loop?((t*c.fps)%(n-1)+(n-1))%(n-1):Math.min(n-1,Math.max(0,t*c.fps)),f0=Math.floor(f),f1=Math.min(n-1,f0+1),k=f-f0,B=r.bones.length,corr=r.corr[c.src];
  for(let i=0;i<B;i++){const a=(f0*B+i)*4,b=(f1*B+i)*4,q=r.q[i];
   q.set(c.q[a]/32767,c.q[a+1]/32767,c.q[a+2]/32767,c.q[a+3]/32767);
   if(k>1e-3){const q2=r.l[i].set(c.q[b]/32767,c.q[b+1]/32767,c.q[b+2]/32767,c.q[b+3]/32767);q.slerp(q2,k);}
   q.normalize().multiply(corr[i]);}
  return ((c.hip[f0]*(1-k)+c.hip[f1]*k)/10000)*r.hipY;
 }
 // Blend layers [{id, t, weight, mask (array)}] over the current (procedural) pose.
 function apply(T,model,layers){
  if(!data||!layers.length)return;const r=rig(T,model);const B=r.bones.length;
  for(const L of layers){const c=clip(L.id);if(!c||L.weight<=.001)continue;const hip=poseWorld(T,r,c,L.t),m=L.mask||masks().full;
   for(let i=0;i<B;i++){const b=r.bones[i];if(!b||!m[i])continue;const p=r.parent[i];
    const local=p<0?r.l[i].copy(r.q[i]):r.l[i].copy(r.q[p]).invert().multiply(r.q[i]);b.quaternion.slerp(local,L.weight*m[i]);}
   if(m[0]&&r.pelvis)r.pelvis.position.y+=hip*L.weight;}
 }
 root.GardenAnim={load,ready:()=>!!data,clip,masks:()=>data?masks():null,apply,duration:id=>data?.clips[id]?.duration||0,phase0:id=>data?.clips[id]?.phase0||0,has:id=>!!data?.clips[id]};
})(window);
