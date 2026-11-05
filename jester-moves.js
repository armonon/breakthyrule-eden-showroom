'use strict';
// The Violet Trickster's move set. Poses are written in rig space (the jester faces +Z, rest pose
// hangs the arms down), then baked into ordinary AnimationClips for his skeleton. Any Mixamo clips
// listed in /residents/animations/manifest.json replace the hand-made versions at load time.
(function(root){
 const BONES=['hips','spine','neck','head','armL','forearmL','handL','armR','forearmR','handR','thighL','shinL','footL','thighR','shinR','footR'];
 const SIDE={L:-1,R:1};
 // Helpers return rig-space Euler deltas [x,y,z] (applied Y·X·Z) relative to the rest pose.
 const arm=(side,forward=0,out=0,twist=0)=>[-forward,SIDE[side]*twist,SIDE[side]*out];
 const leg=(side,forward=0,out=0,twist=0)=>[-forward,SIDE[side]*twist,SIDE[side]*out];
 const bend=a=>[-a,0,0],knee=a=>[a,0,0];
 function guard(bounce=0,turn=.32){
  return {hips:[0,turn,0],hipsPos:[0,-.09-bounce,0],spine:[.14,-turn*.6,0],neck:[.05,0,0],head:[.06,-turn*.3,0],
   armR:arm('R',.95,-.12,.3),forearmR:bend(2.15),handR:[0,0,-.2],armL:arm('L',.8,-.1,.3),forearmL:bend(2.25),handL:[0,0,.2],
   thighL:leg('L',.32,.06),shinL:knee(.48+bounce*2),footL:[-.12,0,0],thighR:leg('R',-.14,.08),shinR:knee(.36+bounce*2),footR:[.1,0,0]};
 }
 const stand={hipsPos:[0,0,0]};
 function crouch(){return {hipsPos:[0,-.5,0],hips:[.35,0,0],spine:[.3,0,0],thighL:leg('L',1.5,.25),shinL:knee(2.25),footL:[-.6,0,0],thighR:leg('R',1.45,.3),shinR:knee(2.2),footR:[-.6,0,0],armR:arm('R',.6,.2),forearmR:bend(.3),armL:arm('L',1.0,.1),forearmL:bend(.6)};}
 function toprock(beat,side){
  const s=side==='R'?1:-1,other=side==='R'?'L':'R';
  if(beat===0)return {hips:[0,.32*s,0],hipsPos:[0,-.05,0],spine:[-.06,-.2*s,.08*s],head:[0,.2*s,0],
   ['thigh'+side]:leg(side,.55,-.32),['shin'+side]:knee(.5),['foot'+side]:[-.3,0,0],['thigh'+other]:leg(other,-.08,.05),['shin'+other]:knee(.18),
   ['arm'+side]:arm(side,.35,.95,.3),['forearm'+side]:bend(1.1),['arm'+other]:arm(other,.15,1.15,-.2),['forearm'+other]:bend(.7)};
  return {hips:[0,0,0],hipsPos:[0,-.14,0],spine:[.12,0,0],head:[.08,0,0],thighL:leg('L',.25,.12),shinL:knee(.45),thighR:leg('R',.25,.12),shinR:knee(.45),
   armR:arm('R',.5,.55),forearmR:bend(1.6),armL:arm('L',.5,.55),forearmL:bend(1.6)};
 }
 function back(spin){return {hips:[-Math.PI/2+.08,spin,0],hipsPos:[0,-.76,0],spine:[.35,0,0],head:[.35,0,0],thighL:leg('L',1.75,.3),shinL:knee(2.15),thighR:leg('R',1.7,.32),shinR:knee(2.1),armL:arm('L',1.4,.2),forearmL:bend(1.4),armR:arm('R',1.4,.2),forearmR:bend(1.4)};}
 function headstand(spin){return {hips:[-Math.PI,spin,0],hipsPos:[0,.24,0],spine:[-.08,0,0],head:[-.1,0,0],thighL:leg('L',-.12,.62),shinL:knee(.05),footL:[.5,0,0],thighR:leg('R',-.12,.62),shinR:knee(.05),footR:[.5,0,0],armL:arm('L',.2,1.45),forearmL:bend(.15),armR:arm('R',.2,1.45),forearmR:bend(.15)};}
 const CLIPS={
  Guard:{loop:true,keys:[[0,guard(0)],[.32,guard(.04)],[.64,guard(0)]]},
  Jab:{hit:.16,keys:[[0,guard()],[.08,{...guard(),armL:arm('L',.9,-.05,.2),forearmL:bend(2.4)}],[.16,{...guard(),hips:[0,.5,0],spine:[.2,-.1,0],armL:arm('L',1.52,-.22,0),forearmL:bend(.08),handL:[0,0,0]}],[.26,{...guard(),hips:[0,.5,0],armL:arm('L',1.45,-.2),forearmL:bend(.2)}],[.42,guard()]]},
  Cross:{hit:.22,keys:[[0,guard()],[.1,{...guard(),hips:[0,.48,0],spine:[.1,-.1,0],armR:arm('R',.7,-.05,.3),forearmR:bend(2.45)}],[.22,{...guard(),hips:[0,-.18,0],hipsPos:[0,-.12,.06],spine:[.26,.32,0],armR:arm('R',1.55,-.28,0),forearmR:bend(.05),handR:[0,0,0],thighR:leg('R',-.3,.05),shinR:knee(.2)}],[.34,{...guard(),hips:[0,-.1,0],spine:[.22,.25,0],armR:arm('R',1.45,-.25),forearmR:bend(.2)}],[.56,guard()]]},
  Uppercut:{hit:.3,keys:[[0,guard()],[.14,{...guard(.12),hips:[0,.55,0],spine:[.35,-.3,0],armR:arm('R',.25,.05),forearmR:bend(1.6)}],[.3,{...guard(),hips:[0,-.25,0],hipsPos:[0,.04,0],spine:[-.25,.4,0],head:[-.2,0,0],armR:arm('R',2.6,-.15),forearmR:bend(.9)}],[.5,{...guard(),spine:[-.15,.2,0],armR:arm('R',2.3,-.1),forearmR:bend(1.1)}],[.8,guard()]]},
  Tackle:{hit:.38,keys:[[0,guard()],[.14,{...crouch(),hipsPos:[0,-.3,0],armL:arm('L',-.4,.2),armR:arm('R',-.4,.2)}],[.32,{hips:[1.15,0,0],hipsPos:[0,-.32,.35],spine:[.15,0,0],head:[-.6,0,0],armL:arm('L',2.7,.15),forearmL:bend(.2),armR:arm('R',2.7,.15),forearmR:bend(.2),thighL:leg('L',-.4,.1),shinL:knee(.4),thighR:leg('R',-.65,.1),shinR:knee(.2)}],[.62,{hips:[1.42,0,0],hipsPos:[0,-.72,.55],head:[-.8,0,0],armL:arm('L',2.9,.4),forearmL:bend(.2),armR:arm('R',2.9,.4),forearmR:bend(.2),thighL:leg('L',-.3,.2),shinL:knee(.7),thighR:leg('R',-.2,.2),shinR:knee(.9)}],[.9,{hips:[1.45,0,0],hipsPos:[0,-.76,.55],head:[-.9,.4,0],armL:arm('L',2.6,.7),forearmL:bend(.4),armR:arm('R',2.8,.6),forearmR:bend(.3),thighL:leg('L',-.1,.3),shinL:knee(1.2),thighR:leg('R',-.3,.25),shinR:knee(.5)}]]},
  Hit:{keys:[[0,guard()],[.07,{...guard(),hipsPos:[0,-.06,-.08],spine:[-.42,.25,.12],neck:[-.25,0,0],head:[-.55,.3,0],armR:arm('R',.5,.7),forearmR:bend(1.2),armL:arm('L',.4,.9),forearmL:bend(.9)}],[.22,{...guard(),spine:[-.2,.1,0],head:[-.2,.1,0]}],[.45,guard()]]},
  Taunt:{loop:true,keys:[[0,{...stand,hips:[0,.2,0],spine:[-.28,0,0],head:[-.4,0,0],armR:arm('R',1.5,.1,0),forearmR:bend(.1),armL:arm('L',.65,-.35),forearmL:bend(1.9),thighL:leg('L',.1,.1),shinL:knee(.2)}],
   [.2,{hipsPos:[0,-.07,0],hips:[0,.2,0],spine:[.18,0,.05],head:[.15,0,0],armR:arm('R',1.4,.15),forearmR:bend(.2),armL:arm('L',.75,-.35),forearmL:bend(2),thighL:leg('L',.15,.1),shinL:knee(.35)}],
   [.4,{...stand,hips:[0,.2,0],spine:[-.3,0,-.05],head:[-.45,0,0],armR:arm('R',1.55,.05),forearmR:bend(.1),armL:arm('L',.65,-.35),forearmL:bend(1.9),thighL:leg('L',.1,.1),shinL:knee(.2)}],
   [.6,{hipsPos:[0,-.08,0],hips:[0,.2,0],spine:[.2,0,.06],head:[.18,0,0],armR:arm('R',1.3,.25),forearmR:bend(.3),armL:arm('L',.75,-.35),forearmL:bend(2),thighL:leg('L',.15,.1),shinL:knee(.35)}],
   [.8,{...stand,hips:[0,.2,0],spine:[-.28,0,0],head:[-.4,0,0],armR:arm('R',1.5,.1,0),forearmR:bend(.1),armL:arm('L',.65,-.35),forearmL:bend(1.9),thighL:leg('L',.1,.1),shinL:knee(.2)}]]},
  Toprock:{loop:true,keys:[[0,toprock(1)],[.4,toprock(0,'R')],[.8,toprock(1)],[1.2,toprock(0,'L')],[1.6,toprock(1)]]},
  Dizzy:{loop:true,keys:[[0,{hips:[0,0,.08],hipsPos:[0,-.04,0],spine:[0,0,-.18],head:[0,0,.35],armL:arm('L',.2,.5),forearmL:bend(.4),armR:arm('R',.2,.5),forearmR:bend(.4),thighL:leg('L',.1,.15),shinL:knee(.2)}],
   [.6,{hips:[0,0,-.08],hipsPos:[0,-.07,0],spine:[0,0,.18],head:[0,0,-.35],armL:arm('L',.3,.6),forearmL:bend(.5),armR:arm('R',.1,.4),forearmR:bend(.3),thighR:leg('R',.1,.15),shinR:knee(.2)}],
   [1.2,{hips:[0,0,.08],hipsPos:[0,-.04,0],spine:[0,0,-.18],head:[0,0,.35],armL:arm('L',.2,.5),forearmL:bend(.4),armR:arm('R',.2,.5),forearmR:bend(.4),thighL:leg('L',.1,.15),shinL:knee(.2)}]]}
 };
 // The full breakdance routine: toprock, drop, backspin, headspin on the hat, flip back up.
 (function(){
  const keys=[];let t=0;
  for(let round=0;round<2;round++){keys.push([t,toprock(1)],[t+.4,toprock(0,'R')],[t+.8,toprock(1)],[t+1.2,toprock(0,'L')]);t+=1.6;}
  keys.push([t,toprock(1)],[t+.35,crouch()]);t+=.75;
  keys.push([t,{...crouch(),hips:[-.6,0,0],hipsPos:[0,-.62,-.1]}]);t+=.3;
  for(let i=0;i<=24;i++)keys.push([t+i*.09,back(-i*Math.PI/4)]);t+=24*.09+.25;
  keys.push([t,{...back(0),hips:[-2.3,0,0],hipsPos:[0,-.35,0]}]);t+=.3;
  for(let i=0;i<=16;i++)keys.push([t+i*.1,headstand(i*Math.PI/4)]);t+=16*.1+.15;
  keys.push([t,{...headstand(0),hips:[-3*Math.PI/2,0,0],hipsPos:[0,-.55,.3],armL:arm('L',2.8,.2),armR:arm('R',2.8,.2)}]);t+=.3;
  keys.push([t,{...crouch(),hips:[-2*Math.PI+.35,0,0]}]);t+=.35;
  keys.push([t,{hips:[-2*Math.PI,0,0],spine:[-.25,0,0],head:[-.3,0,0],armL:arm('L',.2,2.6),forearmL:bend(.2),armR:arm('R',.2,2.6),forearmR:bend(.2)}]);t+=.6;
  keys.push([t,{hips:[-2*Math.PI,0,0],hipsPos:[0,-.05,0]}]);
  CLIPS.Breakdance={keys};
 })();
 function restData(T,object){
  object.updateMatrixWorld(true);
  const inverse=new T.Matrix4().copy(object.matrixWorld).invert(),bones={},rest={};
  object.traverse(n=>{if(n.isBone)bones[n.name]=n;});
  const objectQ=object.getWorldQuaternion(new T.Quaternion()).invert();
  for(const [name,bone] of Object.entries(bones)){
   rest[name]={local:bone.quaternion.clone(),position:bone.position.clone(),world:objectQ.clone().multiply(bone.getWorldQuaternion(new T.Quaternion())),parentWorld:objectQ.clone().multiply(bone.parent.getWorldQuaternion(new T.Quaternion())),at:new T.Vector3().setFromMatrixPosition(bone.matrixWorld).applyMatrix4(inverse)};
  }
  return {bones,rest};
 }
 function bake(T,{rest},name,{keys}){
  const euler=new T.Euler(0,0,0,'YXZ'),delta=new T.Quaternion(),times=keys.map(k=>k[0]),tracks=[];
  for(const bone of BONES){
   if(!rest[bone])continue;const r=rest[bone],values=[],parentInverse=r.parentWorld.clone().invert();let previous=null;
   for(const [,pose] of keys){
    const angles=pose[bone]||[0,0,0];delta.setFromEuler(euler.set(angles[0],angles[1],angles[2],'YXZ'));
    const local=parentInverse.clone().multiply(delta).multiply(r.world);
    if(previous&&previous.dot(local)<0)local.set(-local.x,-local.y,-local.z,-local.w);previous=local;values.push(local.x,local.y,local.z,local.w);
   }
   tracks.push(new T.QuaternionKeyframeTrack(bone+'.quaternion',times,values));
  }
  if(rest.hips){const p=rest.hips.position,values=[];for(const [,pose] of keys){const o=pose.hipsPos||[0,0,0];values.push(p.x+o[0],p.y+o[1],p.z+o[2]);}tracks.push(new T.VectorKeyframeTrack('hips.position',times,values));}
  return new T.AnimationClip(name,times[times.length-1],tracks);
 }
 // Retarget a Mixamo clip (FBX converted to GLB) onto the jester by matching world-space bone swings.
 const MIXAMO={Hips:'hips',Spine1:'spine',Neck:'neck',Head:'head',Arm:'arm',ForeArm:'forearm',Hand:'hand',UpLeg:'thigh',Leg:'shin',Foot:'foot'};
 const TARGET_CHILD={hips:'spine',spine:'neck',neck:'head',arm:'forearm',forearm:'hand',thigh:'shin',shin:'foot'};
 function retarget(T,target,source,clip,{inPlace=true,fps=30}={}){
  const src={};source.traverse(n=>{if(!n.isBone)return;const name=n.name.replace(/^mixamorig\d*[:_]?/,'');let side='',base=name;const m=/^(Left|Right)(.+)$/.exec(name);if(m){side=m[1];base=m[2];}if(MIXAMO[base])src[(MIXAMO[base])+(side?':'+side:'')]=n;});
  source.updateMatrixWorld(true);
  const sourceInverse=new T.Matrix4().copy(source.matrixWorld).invert(),srcRestQ={},srcRestP={};
  for(const [key,bone] of Object.entries(src)){srcRestQ[key]=bone.getWorldQuaternion(new T.Quaternion());srcRestP[key]=new T.Vector3().setFromMatrixPosition(bone.matrixWorld).applyMatrix4(sourceInverse);}
  // Pair sides by their rest x so mirrored naming conventions still line up.
  const map={};
  for(const bone of BONES){
   const base=bone.replace(/[LR]$/,''),side=bone.endsWith('L')&&bone!=='hips'?'L':bone.endsWith('R')?'R':'';
   if(!side){if(src[base])map[bone]=base;continue;}
   const x=target.rest[bone]?.at.x||0,candidates=['Left','Right'].map(s=>base+':'+s).filter(k=>src[k]);
   const pick=candidates.find(k=>Math.sign(srcRestP[k].x)===Math.sign(x))||candidates[side==='L'?0:1];if(pick)map[bone]=pick;
  }
  const align={},q=new T.Quaternion();
  for(const bone of BONES){
   const key=map[bone];if(!key)continue;const base=bone.replace(/[LR]$/,''),side=bone===base?'':bone.slice(-1),childBase=TARGET_CHILD[base];
   const child=childBase&&(childBase+(['spine','neck','head'].includes(childBase)?'':side)),childKey=child&&map[child];
   if(child&&childKey&&target.rest[child]){
    const tDir=target.rest[child].at.clone().sub(target.rest[bone].at).normalize(),sDir=srcRestP[childKey].clone().sub(srcRestP[key]).normalize();
    align[bone]=new T.Quaternion().setFromUnitVectors(tDir,sDir);
   }else align[bone]=align[target.bones[bone].parent?.name]?.clone()||new T.Quaternion();
  }
  const mixer=new T.AnimationMixer(source),action=mixer.clipAction(clip).play(),duration=clip.duration,frames=Math.max(2,Math.ceil(duration*fps)+1);
  const times=[],values=Object.fromEntries(BONES.map(b=>[b,[]])),hips=[];
  const hipsKey=map.hips,height=target.rest.hips.at.y/(Math.abs(srcRestP[hipsKey]?.y)||1);
  for(let f=0;f<frames;f++){
   const t=Math.min(duration,f/fps);times.push(t);mixer.setTime(t);source.updateMatrixWorld(true);
   const worldT={};
   for(const bone of BONES){
    const r=target.rest[bone];if(!r)continue;const key=map[bone];
    let w;if(key){const delta=src[key].getWorldQuaternion(q).multiply(srcRestQ[key].clone().invert());w=delta.clone().multiply(align[bone]).multiply(r.world);}
    else{const parent=worldT[target.bones[bone].parent.name];w=parent?parent.clone().multiply(r.parentWorld.clone().invert()).multiply(r.world):r.world.clone();}
    worldT[bone]=w;const parentW=worldT[target.bones[bone].parent.name]||r.parentWorld;
    const local=parentW.clone().invert().multiply(w);const list=values[bone];
    if(list.length>=4&&list[list.length-4]*local.x+list[list.length-3]*local.y+list[list.length-2]*local.z+list[list.length-1]*local.w<0)local.set(-local.x,-local.y,-local.z,-local.w);
    list.push(local.x,local.y,local.z,local.w);
   }
   if(hipsKey){const p=new T.Vector3().setFromMatrixPosition(src[hipsKey].matrixWorld).applyMatrix4(sourceInverse).sub(srcRestP[hipsKey]).multiplyScalar(height);if(inPlace){p.x=0;p.z=0;}const base=target.rest.hips.position;hips.push(base.x+p.x,base.y+p.y,base.z+p.z);}
  }
  action.stop();mixer.uncacheRoot(source);
  const tracks=BONES.filter(b=>values[b].length).map(b=>new T.QuaternionKeyframeTrack(b+'.quaternion',times,values[b]));
  if(hips.length)tracks.push(new T.VectorKeyframeTrack('hips.position',times,hips));
  return new T.AnimationClip(clip.name,duration,tracks);
 }
 function createJesterMoves(T,object){
  const data=restData(T,object),clips={},meta={};
  for(const [name,spec] of Object.entries(CLIPS)){clips[name]=bake(T,data,name,spec);meta[name]={loop:!!spec.loop,hit:spec.hit,duration:clips[name].duration,source:'procedural'};}
  return {
   clips,meta,
   async loadMixamo(url='/residents/animations/manifest.json'){
    let manifest;try{const response=await fetch(url,{signal:AbortSignal.timeout(8000)});if(!response.ok)return [];manifest=await response.json();}catch{return [];}
    const loaded=[];
    for(const [name,entry] of Object.entries(manifest.clips||{})){
     const file=typeof entry==='string'?{file:entry}:entry;
     try{
      const gltf=await window.showroomAssets.model(new URL(file.file,new URL(url,location.href)).href);
      const clip=gltf.animations.find(c=>!file.clip||c.name===file.clip)||gltf.animations[0];if(!clip)continue;
      clips[name]=retarget(T,data,gltf.scene,clip,{inPlace:file.inPlace!==false});clips[name].name=name;
      meta[name]={loop:file.loop??meta[name]?.loop??false,hit:file.hit??meta[name]?.hit,duration:clips[name].duration,source:'mixamo'};loaded.push(name);
     }catch(error){console.warn('Mixamo clip unavailable:',name,error);}
    }
    return loaded;
   },
   retarget:(source,clip,options)=>retarget(T,data,source,clip,options)
  };
 }
 root.createJesterMoves=createJesterMoves;
})(typeof window==='object'?window:globalThis);
