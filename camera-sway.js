'use strict';
// First-person head motion: a footstep bob and side-to-side sway that follow the actual walking speed, a slight
// lean into strafes and turns, a dip when landing from a jump and a slow breathing drift at rest. It is applied as
// an offset on top of the eased camera and removed before the next frame's easing, so it never moves the player.
(function(root){
 function createCameraSway(T,{reduced=false}={}){
  const offset=new T.Vector3(),applied=new T.Vector3(),right=new T.Vector3(),forward=new T.Vector3(),up=new T.Vector3(0,1,0),look=new T.Vector3();
  let slideK=0,sprintK=0,phase=0,intensity=0,roll=0,clock=0,landing=0,landingVelocity=0,wasAirborne=false,lastYaw=null,turn=0,shake=0,rollKick=0,rollKickV=0;
  return {
   // Undo last frame's offset, unless something else has since placed the camera (a view change or teleport).
   remove(camera){if(camera.position.equals(applied))camera.position.sub(offset);offset.set(0,0,0);},
   // crouch: metres the eye is lowered (crouching, sliding). Returns true on the frame a footstep lands.
   // A jolt (running or sliding into a wall, a heavy landing): drops and rolls the view and shakes it briefly.
   // strength ~0..1.5; side -1 left .. 1 right.
   bump(strength=1,side=0){landingVelocity-=.55*strength;rollKickV+=side*1.4*strength;shake=Math.min(1,shake+.55*strength);},
   // lean: radians the view rolls into a slide.
   // slide: 0..1 how hard a slide is scraping along (a rattling judder and rocking roll); sprint: 0/1, a heavier stride.
   apply(camera,aim,dt,{velocity,airborne=false,walkSpeed=3.4,crouch=0,lean=0,slide=0,sprint=0}={}){
    if(reduced||!(dt>0)){offset.set(0,-crouch,0);camera.position.add(offset);applied.copy(camera.position);camera.lookAt(look.copy(aim).add(offset));return false;}
    clock+=dt;
    forward.subVectors(aim,camera.position);forward.y=0;forward.normalize();right.crossVectors(forward,up);
    const speed=velocity?Math.hypot(velocity.x,velocity.z):0,strafe=velocity?velocity.dot(right)/walkSpeed:0;
    intensity+=((airborne?0:Math.min(speed/walkSpeed,1.6))-intensity)*(1-Math.exp(-6*dt));
    const before=Math.floor(phase/Math.PI);phase+=speed*dt*Math.PI*2/2.6; // one sway cycle = two footsteps every 2.6 m
    const footstep=!airborne&&speed>.6&&Math.floor(phase/Math.PI)!==before;
    // Landing: a damped spring kicked downward by the fall.
    if(wasAirborne&&!airborne)landingVelocity-=.75;
    wasAirborne=airborne;
    landingVelocity+=(-landing*140-landingVelocity*16)*dt;landing+=landingVelocity*dt;
    // Turning lean from the change in view direction.
    const yaw=Math.atan2(forward.x,forward.z);
    if(lastYaw!==null){let d=yaw-lastYaw;d=Math.atan2(Math.sin(d),Math.cos(d));turn+=(T.MathUtils.clamp(d/dt*.012,-.02,.02)-turn)*(1-Math.exp(-5*dt));}
    lastYaw=yaw;
    const rest=Math.max(0,1-intensity);
    slideK+=(slide-slideK)*(1-Math.exp(-10*dt));sprintK+=(sprint-sprintK)*(1-Math.exp(-4*dt));
    const bob=(Math.abs(Math.sin(phase))-.64)*(.045+.025*sprintK)*intensity*(1-slideK); // centred on the mean of |sin| so eye height is unchanged
    const sway=Math.sin(phase)*(.024+.012*sprintK)*intensity*(1-slideK)+Math.sin(clock*.7)*.004*rest+Math.sin(clock*9.3)*.03*slideK;
    // Sliding: the ground rattles up through the view, and it rocks side to side.
    const judder=slideK*((Math.random()-.5)*.03+Math.sin(clock*23)*.012),rock=slideK*(Math.sin(clock*7.1)*.035+Math.sin(clock*17.3)*.012);
    const breath=Math.sin(clock*1.55)*.006*rest;
    roll+=((-Math.sin(phase)*(.007+.006*sprintK)*intensity)-strafe*.02-turn*1.3+lean-roll)*(1-Math.exp(-8*dt));
    rollKickV+=(-rollKick*160-rollKickV*14)*dt;rollKick+=rollKickV*dt;
    shake=Math.max(0,shake-dt*3.2);const jitter=shake*shake*.035;
    offset.copy(right).multiplyScalar(sway+(Math.random()-.5)*jitter).addScaledVector(up,bob+breath+landing-crouch+judder+(Math.random()-.5)*jitter);
    camera.position.add(offset);applied.copy(camera.position);
    camera.lookAt(look.copy(aim).add(offset));camera.rotateZ(roll+rollKick*.06+rock);
    return footstep;
   },
   inspect:()=>({slide:+slideK.toFixed(2),intensity:+intensity.toFixed(3),roll:+roll.toFixed(4),offset:offset.toArray().map(v=>+v.toFixed(4)),landing:+landing.toFixed(4)})
  };
 }
 root.createCameraSway=createCameraSway;
})(typeof window==='object'?window:globalThis);
