'use strict';
(function(root){
// Canonical world pose: actual character-motion/clip evaluator, normal head scale,
// no camera-derived contacts, attention, brush or first-person presentation.
root.createExpeditionPose=function({T,model,tick=0}){
 let yaw=null,turning=false,handRise=0,handsOn=false;
 const probe=new T.Vector3(),still=new T.Vector3(),motion=model.motion;
 function advance(nextTick){if(!Number.isSafeInteger(nextTick)||nextTick!==tick+1)throw Error('Pose ticks must be consecutive.');tick=nextTick;}
 function step(controller,nextTick){advance(nextTick);const m=controller.movement,p=controller.readPose(),dt=1/60,velocity=controller.velocity,airborne=controller.motion.inspect().airborne;
  ({yaw,turning}=root.GardenCharacterMotion.turnBody(yaw,turning,p.yaw,Math.hypot(velocity.x,velocity.z),dt));
  model.root.position.set(p.x,p.y,p.z);model.root.rotation.y=yaw;
  const dive=m.dive?Math.min(1,m.dive.t*4):m.proneT>0?Math.min(1,m.proneT/.4):0,slide=m.slide?.kind==='slide'&&!m.slide.belly?1-m.slide.t/m.slide.dur:0;
  const drop=m.crouchAmount*.55+(m.dive?Math.min(1,m.dive.t*5)*.55:0)+(m.proneT>0?Math.min(1,m.proneT/.25)*.75:0);
  motion.airborne(airborne);motion.crouch(Math.min(drop,.55)/.55);motion.guard(0);
  ({handRise,handsOn}=root.GardenCharacterMotion.traverseBody(T,model,{hands:controller.parkour.hands(),handRise,handsOn,pose:{traversal:m.traversal(),dive,slide},dt,probe}));
  motion.holdKind(controller.parkour.handsFull()?null:'pistol');motion.aimAt(controller.aim);motion.lookAt(controller.aim);motion.update(dt,{velocity,wade:0});model.root.updateMatrixWorld(true);
 }
 function recoveryPose(dt){handRise=0;handsOn=false;motion.airborne(false);motion.crouch(0);motion.guard(0);motion.touch('L',null,null,0);motion.touch('R',null,null,0);motion.holdKind(null);motion.update(dt,{velocity:still,wade:0});}
 function action(kind,args=[]){if(kind==='animation')motion.play(...args);else if(kind==='flare')motion.play('pistolShoot',{fade:.04,mask:'upper',arms:true});else if(kind==='reload')motion.play('pistolReload',{fade:.1,mask:'upper',arms:true,speed:(root.GardenAnim.duration('pistolReload')||1.5)/1.5});else if(kind==='interrupt'||kind==='bail')motion.stop('pistolReload',0);else if(kind==='collect')motion.play('pickup',{fade:.08,mask:'upper',weight:.65,arms:true});else if(kind==='ring-bell')motion.play('interact',{fade:.1,mask:'upper',weight:.7,arms:true});}
 return {step,pauseTick:advance,recoveryPose,action,captureState:()=>({version:1,tick,yaw,turning,handRise,handsOn,motion:motion.captureState()}),restoreState(value){
  if(!value||value.version!==1||!Number.isSafeInteger(value.tick)||value.tick<0||value.yaw!==null&&!Number.isFinite(value.yaw)||typeof value.turning!=='boolean'||typeof value.handsOn!=='boolean'||!Number.isFinite(value.handRise)||value.handRise<0||value.handRise>.71)throw Error('Invalid canonical pose checkpoint.');motion.validateState(value.motion);
  motion.restoreState(value.motion);tick=value.tick;yaw=value.yaw;turning=value.turning;handRise=value.handRise;handsOn=value.handsOn;
 },get tick(){return tick;}};
};
})(typeof window==='object'?window:globalThis);
