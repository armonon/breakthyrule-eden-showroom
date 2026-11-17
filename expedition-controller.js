'use strict';
(function(root){
// One fixed-step adapter around the game's actual locomotion and parkour.
// Character dimensions and collision data are supplied by the trusted host.
const DT=1/60, MASK=127, EDGES=3;
root.createExpeditionController=function({T,world,layout,character,worldRevision,unlocked=()=>false,effect=()=>{},canMove=()=>true,momentumEnabled=false,position=null,lookAt=null,velocity=null}){
 if(!T||!world||!layout||typeof worldRevision!=='string'||!worldRevision)throw Error('Controller requires a pinned world.');
 const profile=Object.freeze({...root.playerBodyProfile(character)}),bodyKey=JSON.stringify(profile);
 const pos=position||new T.Vector3(layout.spawn[0],1.75,layout.spawn[1]),aim=lookAt||pos.clone().add(new T.Vector3(0,0,-5)),vel=velocity||new T.Vector3(),keys=new Set(),motion=root.createPlayerMotion();
 let tick=0,heldMask=0,replaying=false,movement;
 const emit=(kind,...args)=>{if(!replaying)effect({tick,kind,args});},noop=()=>{};
 const sway={bump:(...args)=>emit('bump',...args)},footsteps=Object.fromEntries(['step','land','slide'].map(k=>[k,(...args)=>emit('footstep:'+k,...args)]));
 const surface=()=>Math.abs(pos.x-11.7)<2.1?'brick':'grass';
 const parkour=root.createParkour({T,walls:()=>world.walls,surfaces:()=>world.surfaces,ground:()=>0,revision:()=>worldRevision,player:{pos,aim,vel,motion,keys,bodyDimensions:()=>profile,crouchHeld:()=>movement.crouchHeld,sway,footsteps,surface,requestDraw:noop,onFall:noop}});
 const constrain=root.createExpeditionConstraints({layout,unlocked});
 const shiftHeight=d=>{pos.y+=d;aim.y+=d;};
 movement=root.createPlayerMovement({momentumEnabled:()=>momentumEnabled,T,targetPosition:pos,targetAim:aim,walkVelocity:vel,motion,keys,bodyDimensions:()=>profile,sway,footsteps,surfaceAt:surface,puff:(...args)=>emit('puff',...args),hitStop:ms=>emit('hitStop',ms),kick:n=>emit('kick',n),requestDraw:noop,obstacle:()=>false,groundHeight:()=>0,
  prepareWalking(){const h=motion.inspect().height,floor=parkour.supportAt(pos.x,pos.z,pos.y-1.75-h+.45,profile.radius);shiftHeight(1.75+floor+h-pos.y);},shiftHeight,state:{ready:true},modalOpen:()=>false,fistsEngaged:()=>false,parkour:()=>parkour,pk:()=>parkour,parkourOn:()=>true,garden:{constrain},expedition:{canMove,constrain:noop},now:()=>tick*1000/60,playerBody:{downed:()=>false,anim:(...args)=>emit('animation',...args)}});
 function validateInput(f){if(!f||typeof f!=='object'||Array.isArray(f)||!Number.isInteger(f.heldMask)||f.heldMask<0||(f.heldMask&~MASK)||!Number.isInteger(f.edges)||f.edges<0||(f.edges&~EDGES)||!Number.isFinite(f.yaw)||Math.abs(f.yaw)>Math.PI*2||!Number.isFinite(f.pitch)||Math.abs(f.pitch)>1.35)throw Error('Invalid movement input.');}
 function setHeld(mask){keys.clear();for(const [bit,key] of [[1,'w'],[2,'s'],[4,'a'],[8,'d'],[16,'shift'],[32,'space']])if(mask&bit)keys.add(key);movement.crouchHeld=!!(mask&64);heldMask=mask;}
 function step(input,nextTick=tick+1,{replay=false}={}){
  validateInput(input);if(!Number.isSafeInteger(nextTick)||nextTick!==tick+1)throw Error('Movement ticks must be consecutive.');
  tick=nextTick;replaying=replay;
  try{
   const moving=canMove();setHeld(moving?input.heldMask:0);
   aim.copy(pos).add(new T.Vector3(Math.sin(input.yaw)*Math.cos(input.pitch),Math.sin(input.pitch),Math.cos(input.yaw)*Math.cos(input.pitch)).multiplyScalar(5));
   if(!moving){movement.cancelTraversal();parkour.reset();vel.set(0,0,0);return readPose();}
   if(input.edges&2){parkour.crouchPressed();if(movement.crouchHeld)movement.startSlide();}
   if(input.edges&1)movement.jump();
   movement.move(DT,tick);movement.updateJump(DT);movement.updateCrouch(DT);movement.updateAir(DT,Math.hypot(vel.x,vel.z),motion.inspect().airborne,tick);
   return readPose();
  }finally{replaying=false;}
 }
 function readPose(){const d=aim.clone().sub(pos);return {x:pos.x,y:pos.y-1.75,z:pos.z,yaw:Math.atan2(d.x,d.z),pitch:Math.atan2(d.y,Math.hypot(d.x,d.z)),movement:movement.state(),vx:vel.x,vz:vel.z,vy:motion.inspect().velocity};}
 function captureState(){return {version:1,worldRevision,bodyKey,tick,heldMask,position:pos.toArray(),aim:aim.toArray(),velocity:vel.toArray(),motion:motion.captureState(),movement:movement.captureState(),parkour:parkour.captureState()};}
 function restoreState(s){
  const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<1e6);
  if(!s||s.version!==1||s.worldRevision!==worldRevision||s.bodyKey!==bodyKey||!Number.isSafeInteger(s.tick)||s.tick<0||!Number.isInteger(s.heldMask)||s.heldMask<0||(s.heldMask&~MASK)||!['position','aim','velocity'].every(k=>vector(s[k])))throw Error('Incompatible controller snapshot.');
  // Validate every component before changing any live state.
  motion.validateState(s.motion);movement.validateState(s.movement);parkour.validateState(s.parkour);
  pos.fromArray(s.position);aim.fromArray(s.aim);vel.fromArray(s.velocity);tick=s.tick;setHeld(s.heldMask);motion.restoreState(s.motion);movement.restoreState(s.movement);parkour.restoreState(s.parkour);
 }
 const initial=captureState();
 function reset({x=layout.spawn[0],y=0,z=layout.spawn[1],yaw=Math.PI,pitch=0,nextTick=tick}={}){if(![x,y,z,yaw,pitch].every(Number.isFinite)||!Number.isSafeInteger(nextTick)||nextTick<0)throw Error('Invalid controller reset.');restoreState({...initial,tick:nextTick,position:[x,y+1.75,z],aim:[x+Math.sin(yaw)*Math.cos(pitch)*5,y+1.75+Math.sin(pitch)*5,z+Math.cos(yaw)*Math.cos(pitch)*5]});}
 return {step,readPose,captureState,restoreState,reset,validateInput,profile,movement,parkour,motion,position:pos,aim,velocity:vel,keys,get tick(){return tick;}};
};
})(typeof window==='object'?window:globalThis);
