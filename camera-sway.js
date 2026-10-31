'use strict';
// First-person head motion: a footstep bob and side-to-side sway that follow the actual walking speed, a slight
// lean into strafes and turns, a dip when landing from a jump and a slow breathing drift at rest. It is applied as
// an offset on top of the eased camera and removed before the next frame's easing, so it never moves the player.
(function(root){
 function createCameraSway(T,{reduced=false}={}){
  const offset=new T.Vector3(),applied=new T.Vector3(),right=new T.Vector3(),forward=new T.Vector3(),up=new T.Vector3(0,1,0),look=new T.Vector3();
  let phase=0,intensity=0,roll=0,clock=0,landing=0,landingVelocity=0,wasAirborne=false,lastYaw=null,turn=0;
  return {
   // Undo last frame's offset, unless something else has since placed the camera (a view change or teleport).
   remove(camera){if(camera.position.equals(applied))camera.position.sub(offset);offset.set(0,0,0);},
   apply(camera,aim,dt,{velocity,airborne=false,walkSpeed=3.4}={}){
    if(reduced||!(dt>0)){camera.lookAt(aim);return;}
    clock+=dt;
    forward.subVectors(aim,camera.position);forward.y=0;forward.normalize();right.crossVectors(forward,up);
    const speed=velocity?Math.hypot(velocity.x,velocity.z):0,strafe=velocity?velocity.dot(right)/walkSpeed:0;
    intensity+=((airborne?0:Math.min(speed/walkSpeed,1.6))-intensity)*(1-Math.exp(-6*dt));
    phase+=speed*dt*Math.PI*2/2.6; // one sway cycle = two footsteps every 2.6 m
    // Landing: a damped spring kicked downward by the fall.
    if(wasAirborne&&!airborne)landingVelocity-=.55;
    wasAirborne=airborne;
    landingVelocity+=(-landing*140-landingVelocity*16)*dt;landing+=landingVelocity*dt;
    // Turning lean from the change in view direction.
    const yaw=Math.atan2(forward.x,forward.z);
    if(lastYaw!==null){let d=yaw-lastYaw;d=Math.atan2(Math.sin(d),Math.cos(d));turn+=(T.MathUtils.clamp(d/dt*.012,-.02,.02)-turn)*(1-Math.exp(-5*dt));}
    lastYaw=yaw;
    const rest=Math.max(0,1-intensity);
    const bob=(Math.abs(Math.sin(phase))-.64)*.045*intensity; // centred on the mean of |sin| so eye height is unchanged
    const sway=Math.sin(phase)*.024*intensity+Math.sin(clock*.7)*.004*rest;
    const breath=Math.sin(clock*1.55)*.006*rest;
    roll+=((-Math.sin(phase)*.007*intensity)-strafe*.014-turn-roll)*(1-Math.exp(-8*dt));
    offset.copy(right).multiplyScalar(sway).addScaledVector(up,bob+breath+landing);
    camera.position.add(offset);applied.copy(camera.position);
    camera.lookAt(look.copy(aim).add(offset));camera.rotateZ(roll);
   },
   inspect:()=>({intensity:+intensity.toFixed(3),roll:+roll.toFixed(4),offset:offset.toArray().map(v=>+v.toFixed(4)),landing:+landing.toFixed(4)})
  };
 }
 root.createCameraSway=createCameraSway;
})(typeof window==='object'?window:globalThis);
