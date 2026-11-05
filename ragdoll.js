'use strict';
// Lightweight position-based ragdoll that drives any skinned skeleton.
// Joints become particles linked by distance constraints; each frame the bones are swung so they
// point at their simulated child joints, and the pelvis follows a frame built from the torso.
(function(root){
 const RIGS={
  jester:{
   pelvis:'hips',
   chains:[['spine','neck'],['neck','head'],['head','@head'],
    ['armL','forearmL'],['forearmL','handL'],['handL','@hand'],['armR','forearmR'],['forearmR','handR'],['handR','@hand'],
    ['thighL','shinL'],['shinL','footL'],['footL','@foot'],['thighR','shinR'],['shinR','footR'],['footR','@foot']],
   torso:['hips','spine','neck','armL','armR','thighL','thighR'],
   frame:{up:['hips','neck'],side:['thighL','thighR']},
   head:'head'
  },
  human:{
   pelvis:'root',
   chains:[['spine03','spine01'],['spine01','neck01'],['neck01','head'],['head','@head'],
    ['upperarm01.L','lowerarm01.L'],['lowerarm01.L','wrist.L'],['wrist.L','@hand'],['upperarm01.R','lowerarm01.R'],['lowerarm01.R','wrist.R'],['wrist.R','@hand'],
    ['upperleg01.L','lowerleg01.L'],['lowerleg01.L','foot.L'],['foot.L','@foot'],['upperleg01.R','lowerleg01.R'],['lowerleg01.R','foot.R'],['foot.R','@foot']],
   torso:['root','spine03','spine01','neck01','upperarm01.L','upperarm01.R','upperleg01.L','upperleg01.R'],
   frame:{up:['root','neck01'],side:['upperleg01.L','upperleg01.R']},
   head:'head'
  }
 };
 function createRagdoll(T,{object,rig,groundHeight=()=>0,radius=.07,gravity=9.8}){
  const spec=typeof rig==='string'?RIGS[rig]:rig,bones={};
  object.traverse(n=>{if(n.isBone)bones[n.name]=n;});
  const pelvis=bones[spec.pelvis];if(!pelvis)throw new Error('Ragdoll rig is missing '+spec.pelvis);
  const particles=new Map(),links=[],tips=new Map();
  const tmp=new T.Vector3(),tmp2=new T.Vector3(),q=new T.Quaternion(),q2=new T.Quaternion(),m=new T.Matrix4();
  let active=false,still=0,frameRest=new T.Quaternion(),pelvisRest=new T.Quaternion(),recovery=null;
  function world(bone,target=new T.Vector3()){return bone.getWorldPosition(target);}
  function scale(){return object.getWorldScale(tmp2).x||1;}
  function particle(name,position){let p=particles.get(name);if(!p){p={name,p:new T.Vector3(),v:new T.Vector3(),old:new T.Vector3(),grounded:false};particles.set(name,p);}p.p.copy(position);p.v.set(0,0,0);return p;}
  function frameQuaternion(target){
   const up=tmp.copy(particles.get(spec.frame.up[1]).p).sub(particles.get(spec.frame.up[0]).p).normalize();
   const side=tmp2.copy(particles.get(spec.frame.side[1]).p).sub(particles.get(spec.frame.side[0]).p);side.addScaledVector(up,-side.dot(up)).normalize();
   const forward=new T.Vector3().crossVectors(side,up).normalize();
   m.makeBasis(side,up,forward);return target.setFromRotationMatrix(m);
  }
  function build(){
   particles.clear();links.length=0;tips.clear();object.updateMatrixWorld(true);
   const s=scale(),up=new T.Vector3(0,1,0).applyQuaternion(object.getWorldQuaternion(q)),forward=new T.Vector3(0,0,1).applyQuaternion(q);
   for(const name of spec.torso)if(bones[name])particle(name,world(bones[name]));
   for(const [name,child] of spec.chains){
    const bone=bones[name];if(!bone)continue;particle(name,world(bone));
    if(child[0]==='@'){
     const at=world(bone),tip=at.clone();
     if(child==='@head')tip.addScaledVector(up,.27*s);
     else if(child==='@foot')tip.addScaledVector(forward,.17*s).addScaledVector(up,-.05*s);
     else{const parent=world(bone.parent);tip.add(at.clone().sub(parent).normalize().multiplyScalar(.12*s));}
     particle('@'+name,tip);tips.set(name,bone.worldToLocal(tip.clone()));
     links.push(['@'+name,name,tip.distanceTo(at)]);
    }else if(bones[child]){particle(child,world(bones[child]));}
   }
   for(const [name,child] of spec.chains){const target=child[0]==='@'?null:child;if(target&&particles.has(target))links.push([name,target,particles.get(name).p.distanceTo(particles.get(target).p)]);}
   const torso=spec.torso.filter(n=>particles.has(n));
   for(let i=0;i<torso.length;i++)for(let j=i+1;j<torso.length;j++){const a=particles.get(torso[i]).p,b=particles.get(torso[j]).p;links.push([torso[i],torso[j],a.distanceTo(b),true]);}
   frameQuaternion(frameRest);pelvis.getWorldQuaternion(pelvisRest);
  }
  function start({impulse=new T.Vector3(),at=null,spin=0,lift=1.6}={}){
   build();active=true;still=0;recovery=null;
   const hit=at||particles.get(spec.head)?.p||world(pelvis);
   const center=world(pelvis);
   for(const p of particles.values()){
    const d=p.p.distanceTo(hit),local=Math.max(0,1-d/.9);
    p.v.copy(impulse).multiplyScalar(.45+local*.9);p.v.y+=lift*(.6+local*.6);
    if(spin){tmp.copy(p.p).sub(center);p.v.x+=-tmp.z*spin;p.v.z+=tmp.x*spin;}
   }
  }
  function solve(iterations){
   for(let k=0;k<iterations;k++)for(const [a,b,length,rigid] of links){
    const pa=particles.get(a).p,pb=particles.get(b).p;tmp.copy(pb).sub(pa);const d=tmp.length()||1e-6,diff=(d-length)/d*(rigid?.5:.5);
    pa.addScaledVector(tmp,diff);pb.addScaledVector(tmp,-diff);
   }
  }
  function step(dt){
   if(!active||!(dt>0))return false;
   const sub=Math.max(1,Math.ceil(dt/.012)),h=Math.min(dt,.05)/sub;let fastest=0;
   for(let s=0;s<sub;s++){
    for(const p of particles.values()){p.old.copy(p.p);p.v.y-=gravity*h;p.v.multiplyScalar(.995);p.p.addScaledVector(p.v,h);}
    solve(6);
    for(const p of particles.values()){
     const floor=groundHeight(p.p.x,p.p.z)+radius;p.grounded=p.p.y<=floor;
     if(p.grounded)p.p.y=floor;
     p.v.copy(p.p).sub(p.old).divideScalar(h);
     if(p.grounded){p.v.x*=.86;p.v.z*=.86;if(p.v.y<0)p.v.y*=-.18;}
     fastest=Math.max(fastest,p.v.length());
    }
   }
   still=fastest<.35?still+dt:0;apply();return true;
  }
  function apply(){
   const parent=pelvis.parent;parent.updateWorldMatrix(true,false);
   pelvis.position.copy(parent.worldToLocal(tmp.copy(particles.get(spec.pelvis).p)));
   frameQuaternion(q);q.multiply(q2.copy(frameRest).invert()).multiply(pelvisRest);
   pelvis.quaternion.copy(parent.getWorldQuaternion(q2).invert().multiply(q));pelvis.updateMatrixWorld(true);
   for(const [name,child] of spec.chains){
    const bone=bones[name],target=particles.get(child[0]==='@'?'@'+name:child);if(!bone||!target)continue;
    const at=world(bone),current=child[0]==='@'?bone.localToWorld(tmp.copy(tips.get(name))):world(bones[child],tmp);
    current.sub(at);const desired=tmp2.copy(target.p).sub(at);if(current.lengthSq()<1e-8||desired.lengthSq()<1e-8)continue;
    q.setFromUnitVectors(current.normalize(),desired.normalize());
    const worldQ=bone.getWorldQuaternion(q2).premultiply(q);
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(worldQ));bone.updateMatrixWorld(true);
   }
  }
  // Capture the slumped pose so the owner can blend back into animation after moving the root.
  function recover(){
   if(!active)return null;active=false;
   const names=[spec.pelvis,...spec.chains.map(c=>c[0])].filter((n,i,a)=>bones[n]&&a.indexOf(n)===i);
   const pose=names.map(n=>({bone:bones[n],q:bones[n].getWorldQuaternion(new T.Quaternion()),p:world(bones[n])}));
   const p=particles.get(spec.pelvis).p.clone(),head=particles.get(spec.head)?.p.clone()||p.clone();
   const faceUp=frameQuaternion(new T.Quaternion());const forward=new T.Vector3(0,0,1).applyQuaternion(faceUp);
   recovery={pose,start:null};
   return {pelvis:p,head,faceUp:forward.y>0,yaw:Math.atan2(head.x-p.x,head.z-p.z)};
  }
  function beginBlend(){
   if(!recovery)return;object.updateMatrixWorld(true);
   const stored=new Map(recovery.pose.map(e=>[e.bone,e]));
   recovery.start=recovery.pose.map(e=>{
    const parent=stored.get(e.bone.parent),parentQ=parent?parent.q:e.bone.parent.getWorldQuaternion(new T.Quaternion());
    return {bone:e.bone,q:parentQ.clone().invert().multiply(e.q),p:e.bone===pelvis?pelvis.parent.worldToLocal(e.p.clone()):null};
   });
  }
  function blend(weight){
   if(!recovery)return;if(!recovery.start)beginBlend();
   const w=Math.max(0,Math.min(1,weight)),ease=w*w*(3-2*w);
   for(const e of recovery.start){q.copy(e.bone.quaternion);e.bone.quaternion.copy(e.q).slerp(q,ease);if(e.p)e.bone.position.lerpVectors(e.p,tmp.copy(e.bone.position),ease);}
   if(w>=1)recovery=null;
  }
  return {
   start,step,recover,blend,
   get active(){return active;},get blending(){return !!recovery;},
   get settled(){return active&&still>.6;},
   pelvisPosition:()=>particles.get(spec.pelvis)?.p.clone(),
   push(name,velocity){const p=particles.get(name);if(p)p.v.add(velocity);},
   inspect:()=>({active,blending:!!recovery,still:+still.toFixed(2),particles:particles.size,links:links.length})
  };
 }
 root.createRagdoll=createRagdoll;root.ragdollRigs=RIGS;
 if(typeof module==='object'&&module.exports)module.exports={createRagdoll,RIGS};
})(typeof window==='object'?window:globalThis);
