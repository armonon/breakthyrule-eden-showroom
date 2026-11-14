// Shared solo/server physical character. Only the persistence byte codec is host-specific.
import {createPlayerBailWithWorld,physicsBoxesForWorld} from './player-bail.js';
import {captureJoltState,restoreJoltState} from './jolt-state.js';
export function createExpeditionPhysicalActor({T,model,physics,controller,world,createPose,worldRevision,encodePhysics=bytes=>bytes.slice(),decodePhysics=bytes=>bytes.slice()}){
 let disposed=false;
  const driver=createPose({T,model,tick:controller.tick});let recovered=null;
  const bail=createPlayerBailWithWorld({T,world:physics,getModel:()=>model,bodyDimensions:()=>controller.profile,
   collisionBoxes:p=>physicsBoxesForWorld(world,p),groundHeight:()=>0,floorAt:(x,z,top)=>world.floorAt(x,z,top),canStand:(x,z,y,height,radius)=>world.clearance.fits({x,y,z},height,radius),recoveryPose:driver.recoveryPose,
   onStart(){driver.action('bail');},onRecover(value){recovered=value.position;}});
  function placeProxy(){const pose=bail.pose(),view=controller.readPose();if(pose)controller.reset({...pose,yaw:view.yaw,pitch:view.pitch,nextTick:controller.tick});else if(recovered){controller.reset({x:recovered[0],y:recovered[1],z:recovered[2],yaw:view.yaw,pitch:view.pitch,nextTick:controller.tick});recovered=null;}}
  const api={
   get active(){return bail.active;},
   step(tick){if(bail.active){driver.pauseTick(tick);bail.update(1/60);placeProxy();}else driver.step(controller,tick);return api.pose();},
   action(kind,args){if(kind==='bail'){if(bail.active)return bail.requestRecovery();const p=controller.readPose();const ok=bail.start({velocity:new T.Vector3(controller.velocity.x,p.vy,controller.velocity.z),dt:1/60});placeProxy();return ok;}driver.action(kind,args);},
   pose(){return {...controller.readPose(),...(bail.active?{...bail.pose(),movement:'ragdoll'}:{})};},
   publicState(){if(!bail.active)return null;const round=n=>Math.round(n*1e5)/1e5;return {phase:bail.state,rigRevision:model.rigRevision,root:[...model.root.position.toArray(),...model.root.quaternion.toArray()].map(round),pelvis:model.byName.root.position.toArray().map(round),rotations:model.skeleton.bones.map(b=>b.quaternion.toArray().map(round)),settled:bail.inspect().settled};},
   captureState(){const state=bail.captureState(),bytes=state.rig?captureJoltState(physics):null;return {version:1,worldRevision:worldRevision,rigRevision:model.rigRevision,driver:driver.captureState(),bail:state,physics:bytes?encodePhysics(bytes):null};},
   restoreState(value){
    if(!value||value.version!==1||value.worldRevision!==worldRevision||value.rigRevision!==model.rigRevision||value.driver?.tick!==controller.tick||!!value.bail?.rig!==!!value.physics)throw Error('Incompatible physical character checkpoint.');
    const bytes=value.physics?decodePhysics(value.physics):null;
    // A native restore can partially mutate its target. Failure retires the
    // entire actor; callers must fail room recovery rather than keep simulating.
    try{driver.restoreState(value.driver);bail.restoreState(value.bail);if(bytes)restoreJoltState(physics,bytes);}catch(error){api.dispose();throw error;}
   },
   inspect:()=>({rigRevision:model.rigRevision,bail:bail.inspect(),poseTick:driver.tick,heapBytes:physics.heapBytes()}),
   dispose(){if(disposed)return;disposed=true;bail.dispose();physics.dispose();model.dispose();}
  };return api;
}
