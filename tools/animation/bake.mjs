// Animation bake (driven by tools/animation/bake-clips.cjs). Loads source clips with three.js and retargets each onto
// the showroom rig (the bone names character-motion.js uses, rest pose = every bone unrotated in world axes).
//
// For every clip and mapped bone it stores the bone's world rotation relative to the source's rest pose, expressed in
// our axes (x = the character's left, y = up, z = forward): delta(t) = W(t) * W(rest)^-1. It also stores, once per
// source skeleton, each bone's rest direction (bone to child). At runtime character-anim.js corrects for the
// difference between that direction and the target character's own (an A-pose arm versus a T-pose arm, say) and
// turns the world rotations into the rig's local rotations. Hip height over time is stored relative to hip height.
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const OURS=['root','spine03','spine02','spine01','neck01','head'];
for(const s of 'LR')OURS.push(`clavicle.${s}`,`upperarm01.${s}`,`lowerarm01.${s}`,`wrist.${s}`,`upperleg01.${s}`,`lowerleg01.${s}`,`foot.${s}`,`toes.${s}`);
// Which source bone drives each of ours, and which source bone marks the end of it (for its rest direction).
const SOURCES={
 ual:{bone:{root:'pelvis',spine03:'spine_01',spine02:'spine_02',spine01:'spine_03',neck01:'neck_01',head:'Head',
   ...Object.fromEntries([...'LR'].flatMap(s=>{const l=s.toLowerCase();return [[`clavicle.${s}`,`clavicle_${l}`],[`upperarm01.${s}`,`upperarm_${l}`],[`lowerarm01.${s}`,`lowerarm_${l}`],[`wrist.${s}`,`hand_${l}`],[`upperleg01.${s}`,`thigh_${l}`],[`lowerleg01.${s}`,`calf_${l}`],[`foot.${s}`,`foot_${l}`],[`toes.${s}`,`ball_${l}`]];}))},
  end:{...Object.fromEntries([...'LR'].flatMap(s=>{const l=s.toLowerCase();return [[`wrist.${s}`,`middle_01_${l}`],[`toes.${s}`,`ball_leaf_${l}`]];}))}},
 rb:{bone:{root:'Bip01 Pelvis',spine03:'Bip01 Spine',spine02:'Bip01 Spine1',spine01:'Bip01 Spine2',neck01:'Bip01 Neck',head:'Bip01 Head',
   ...Object.fromEntries([...'LR'].flatMap(s=>[[`clavicle.${s}`,`Bip01 ${s} Clavicle`],[`upperarm01.${s}`,`Bip01 ${s} UpperArm`],[`lowerarm01.${s}`,`Bip01 ${s} Forearm`],[`wrist.${s}`,`Bip01 ${s} Hand`],[`upperleg01.${s}`,`Bip01 ${s} Thigh`],[`lowerleg01.${s}`,`Bip01 ${s} Calf`],[`foot.${s}`,`Bip01 ${s} Foot`],[`toes.${s}`,`Bip01 ${s} Toe0`]]))},
  end:{head:'Bip01 HeadNub',...Object.fromEntries([...'LR'].flatMap(s=>[[`wrist.${s}`,`Bip01 ${s} Finger2`],[`toes.${s}`,`Bip01 ${s} Toe0Nub`]]))}}
};
// Our rig's chain: the child that marks each bone's direction.
const CHILD={root:'spine03',spine03:'spine02',spine02:'spine01',spine01:'neck01',neck01:'head'};
for(const s of 'LR')Object.assign(CHILD,{[`clavicle.${s}`]:`upperarm01.${s}`,[`upperarm01.${s}`]:`lowerarm01.${s}`,[`lowerarm01.${s}`]:`wrist.${s}`,[`upperleg01.${s}`]:`lowerleg01.${s}`,[`lowerleg01.${s}`]:`foot.${s}`,[`foot.${s}`]:`toes.${s}`});

const key=n=>n.replace(/[_\s]+/g,' ').trim().toLowerCase();
async function load(url){if(url.endsWith('.fbx'))return await new FBXLoader().loadAsync(url);const g=await new GLTFLoader().loadAsync(url);g.scene.animations=g.animations;return g.scene;}
function bonesByName(scene){const m=new Map();scene.traverse(o=>{if(o.isBone||o.type==='Object3D'||o.isObject3D)m.set(key(o.name),o);});return m;}
function restPose(scene){scene.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.pose();});scene.updateMatrixWorld(true);}

// Rest pose of a source skeleton: world rotations and positions of the mapped bones, and the basis to our axes.
function measureRest(scene,src){
 const S=SOURCES[src],by=bonesByName(scene);restPose(scene);const get=n=>by.get(key(n));
 const wq={},wp={};for(const [ours,name] of Object.entries(S.bone)){const b=get(name);if(!b)throw new Error('missing bone '+name);wq[ours]=b.getWorldQuaternion(new THREE.Quaternion());wp[ours]=b.getWorldPosition(new THREE.Vector3());}
 const end={};for(const [ours,name] of Object.entries(S.end||{})){const b=get(name);if(b)end[ours]=b.getWorldPosition(new THREE.Vector3());}
 // Our axes in source space: left = left arm minus right arm, up = pelvis to head, forward = left x up.
 const up=wp.head.clone().sub(wp.root).normalize(),left=wp['upperarm01.L'].clone().sub(wp['upperarm01.R']);left.addScaledVector(up,-left.dot(up)).normalize();
 const fwd=new THREE.Vector3().crossVectors(left,up).normalize();
 const M=new THREE.Matrix4().makeBasis(left,up,fwd),Mq=new THREE.Quaternion().setFromRotationMatrix(M),Mi=Mq.clone().invert();
 const toOurs=v=>v.clone().applyQuaternion(Mi);
 const dirs={};for(const ours of OURS){const tail=CHILD[ours]&&wp[CHILD[ours]]||end[ours];if(!tail)continue;dirs[ours]=toOurs(tail.clone().sub(wp[ours])).normalize().toArray().map(v=>+v.toFixed(4));}
 const floor=Math.min(...['foot.L','foot.R','toes.L','toes.R'].map(n=>toOurs(wp[n]).y)),hipH=toOurs(wp.root).y-floor;
 return {wq,wp,Mq,Mi,toOurs,dirs,hipH,by};
}

// Sample one clip: per frame, each bone's world-rotation change from rest in our axes, and the hip's height change.
function sample(scene,clip,rest,src,fps,hipFirst=false,maxDur=0){let base=null;
 const S=SOURCES[src],by=bonesByName(scene),mixer=new THREE.AnimationMixer(scene),act=mixer.clipAction(clip);act.play();
 const dur=Math.min(clip.duration,maxDur||Infinity),n=Math.max(2,Math.round(dur*fps)+1),q=new Int16Array(n*OURS.length*4),hip=new Int16Array(n),prev=OURS.map(()=>null);
 const restInv=Object.fromEntries(Object.entries(rest.wq).map(([k,v])=>[k,v.clone().invert()]));
 let leftFwd=-1e9,phase0=0;const tmp=new THREE.Quaternion();
 for(let f=0;f<n;f++){
  mixer.setTime(Math.min(dur,f/fps));scene.updateMatrixWorld(true);
  OURS.forEach((ours,i)=>{const b=by.get(key(S.bone[ours]));const w=b.getWorldQuaternion(tmp);const d=w.clone().multiply(restInv[ours]);
   const dq=rest.Mi.clone().multiply(d).multiply(rest.Mq);if(prev[i]&&prev[i].dot(dq)<0){dq.x*=-1;dq.y*=-1;dq.z*=-1;dq.w*=-1;}prev[i]=dq.clone();
   q.set([dq.x,dq.y,dq.z,dq.w].map(v=>Math.round(v*32767)),(f*OURS.length+i)*4);});
  const pel=rest.toOurs(by.get(key(S.bone.root)).getWorldPosition(new THREE.Vector3()));if(f===0&&base==null)base=pel.y;const restPel=hipFirst?{y:base}:rest.toOurs(rest.wp.root);
  hip[f]=Math.round(Math.max(-3,Math.min(3,(pel.y-restPel.y)/rest.hipH))*10000);
  // Where in the cycle the left foot is furthest forward (to sync a walk with our own gait).
  const lf=rest.toOurs(by.get(key(S.bone['foot.L'])).getWorldPosition(new THREE.Vector3())).z-pel.z;if(lf>leftFwd){leftFwd=lf;phase0=f/(n-1);}
 }
 mixer.stopAllAction();mixer.uncacheRoot(scene);restPose(scene);
 const b64=a=>{const u=new Uint8Array(a.buffer);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode(...u.subarray(i,i+0x8000));return btoa(s);};
 return {fps,n,duration:+dur.toFixed(3),phase0:+phase0.toFixed(3),q:b64(q),hip:b64(hip)};
}

// jobs: [{id, src:'ual'|'rb', url, clip (name in file, or first), loop}], restUrl: {rb:'avatar.fbx'}
window.bake=async(jobs,restUrls,fps=30)=>{
 const out={version:1,bones:OURS,sources:{},clips:{}},cache=new Map(),rests={};
 const scene=async u=>{if(!cache.has(u))cache.set(u,await load(u));return cache.get(u);};
 for(const j of jobs){
  if(!rests[j.src]){const r=restUrls[j.src]?await scene(restUrls[j.src]):await scene(j.url);rests[j.src]=measureRest(r,j.src);out.sources[j.src]={dirs:rests[j.src].dirs};}
  const s=await scene(j.url),clip=j.clip?s.animations.find(a=>a.name===j.clip):s.animations[0];if(!clip)throw new Error('no clip '+j.clip+' in '+j.url);
  out.clips[j.id]={src:j.src,loop:!!j.loop,...sample(s,clip,rests[j.src],j.src,j.fps||fps,j.src==='rb',j.maxDur||0)};
 }
 return out;
};
window.ready=true;
