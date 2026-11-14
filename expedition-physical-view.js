'use strict';
(function(root){
const tuple=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<1e4);
const quaternion=q=>tuple(q,4)&&Math.abs(Math.hypot(...q)-1)<=.001;
const valid=pose=>pose&&['ragdoll','recovering'].includes(pose.phase)&&tuple(pose.root,7)&&quaternion(pose.root.slice(3))&&tuple(pose.pelvis,3)&&Array.isArray(pose.rotations)&&pose.rotations.length>0&&pose.rotations.length<=128&&pose.rotations.every(quaternion);
root.applyExpeditionPhysicalPose=function(model,pose){
 if(!model?.skeleton||!model.byName?.root||!valid(pose)||pose.rotations.length!==model.skeleton.bones.length)return false;
 model.root.position.fromArray(pose.root);model.root.quaternion.fromArray(pose.root,3).normalize();
 model.byName.root.position.fromArray(pose.pelvis);for(let i=0;i<pose.rotations.length;i++)model.skeleton.bones[i].quaternion.fromArray(pose.rotations[i]).normalize();model.byName.neck01?.scale.setScalar(1);model.root.updateMatrixWorld(true);return true;
};
root.interpolateExpeditionPhysical=function(a,b,k){
 k=Number.isFinite(k)?Math.max(0,Math.min(1,k)):0;
 if(!valid(a)||!valid(b)||a.phase!==b.phase||a.rigRevision!==b.rigRevision||a.rotations.length!==b.rotations.length)return k===1?b:a;
 const lerp=(a,b)=>a.map((v,i)=>v+(b[i]-v)*k),quat=(a,b)=>{const sign=a.reduce((n,v,i)=>n+v*b[i],0)<0?-1:1,q=a.map((v,i)=>v+(b[i]*sign-v)*k),length=Math.hypot(...q)||1;return q.map(v=>v/length);};
 return {...a,root:[...lerp(a.root.slice(0,3),b.root.slice(0,3)),...quat(a.root.slice(3),b.root.slice(3))],pelvis:lerp(a.pelvis,b.pelvis),rotations:a.rotations.map((q,i)=>quat(q,b.rotations[i]))};
};
})(typeof window==='object'?window:globalThis);
