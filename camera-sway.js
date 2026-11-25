'use strict';
// View motion is an offset, never player movement. First and third person share
// distance-driven footsteps, with separate amplitudes and a smooth view transition.
(function(root){
 function createCameraSway(T,{reduced=false}={}){
  const offset=new T.Vector3(),applied=new T.Vector3(),right=new T.Vector3(),forward=new T.Vector3(),up=new T.Vector3(0,1,0),look=new T.Vector3();
  let slideK=0,sprintK=0,phase=0,intensity=0,roll=0,clock=0,landing=0,landingVelocity=0,wasAirborne=false,lastYaw=null,turn=0,shake=0,rollKick=0,rollKickV=0,perspectiveK=0,strafeK=0,bodyK=0;
  // Chest-mounted camera (Beyond Eden): the lens rides the sternum, so it takes each footfall, breathes, and follows the look a beat late.
  let chestK=0,jolt=0,joltV=0,nod=0,nodV=0,stepRoll=0,stepRollV=0,stepSide=1,exert=0,breathPhase=0,lagYaw=null,lagPitch=0,lagErr=0;const lagDir=new T.Vector3();
  const spring=(dt)=>{const n=Math.max(1,Math.ceil(dt*120)),h=dt/n;for(let i=0;i<n;i++){landingVelocity+=(-landing*140-landingVelocity*16)*h;landing+=landingVelocity*h;rollKickV+=(-rollKick*160-rollKickV*14)*h;rollKick+=rollKickV*h;
   if(chestK>0||jolt||nod||stepRoll){joltV+=(-jolt*520-joltV*30)*h;jolt+=joltV*h;nodV+=(-nod*420-nodV*26)*h;nod+=nodV*h;stepRollV+=(-stepRoll*300-stepRollV*20)*h;stepRoll+=stepRollV*h;}}};
  return {
   // A teleport or camera-mode owner may replace the pose between frames.
   remove(camera){if(camera.position.equals(applied))camera.position.sub(offset);offset.set(0,0,0);},
   bump(strength=1,side=0){landingVelocity-=.55*strength;rollKickV+=side*1.4*strength;shake=Math.min(1,shake+.55*strength);},
   // perspective: 0 first person, 1 shoulder camera. Controls isolate each effect.
   // bodyBob: the visible body's own stride and landing bob (metres); when given, the view rides it instead of its own.
   apply(camera,aim,dt,{velocity,airborne=false,walkSpeed=3.4,crouch=0,lean=0,slide=0,sprint=0,weight=0,ads=0,effects=null,perspective=0,bodyBob=null,chest=0,chestDrop=.25,turnLag=1}={}){
    dt=Math.min(.1,Math.max(0,Number.isFinite(dt)?dt:0));
    const speed=velocity?Math.hypot(velocity.x,velocity.z):0,before=Math.floor(phase/Math.PI);
    phase+=speed*dt*Math.PI*2/2.6;
    // Comfort preferences affect visuals, not the sound cadence or movement.
    const footstep=!airborne&&speed>.6&&Math.floor(phase/Math.PI)!==before;
    if((effects?!effects.cameraEffects:reduced)||!dt){
     chestK=chest?1:0;jolt=joltV=nod=nodV=stepRoll=stepRollV=0;lagYaw=null;lagErr=0;
     offset.set(0,-crouch-(chest?chestDrop*(1-T.MathUtils.clamp(perspective,0,1)):0),0);camera.position.add(offset);applied.copy(camera.position);camera.lookAt(look.copy(aim).add(offset));
     landing=landingVelocity=roll=rollKick=rollKickV=shake=turn=strafeK=0;lastYaw=null;wasAirborne=airborne;return footstep;
    }
    clock+=dt;
    forward.subVectors(aim,camera.position);forward.y=0;if(forward.lengthSq()<1e-8)forward.set(0,0,-1);else forward.normalize();right.crossVectors(forward,up);
    const strafe=velocity?T.MathUtils.clamp(velocity.dot(right)/Math.max(.1,walkSpeed),-1.6,1.6):0;
    intensity+=((airborne?0:Math.min(speed/Math.max(.1,walkSpeed),1.6))-intensity)*(1-Math.exp(-6*dt));
    if(wasAirborne&&!airborne)landingVelocity-=.75;wasAirborne=airborne;spring(dt);
    const yaw=Math.atan2(forward.x,forward.z);
    if(lastYaw!==null){const d=Math.atan2(Math.sin(yaw-lastYaw),Math.cos(yaw-lastYaw));turn+=(T.MathUtils.clamp(d/dt*.012,-.025,.025)-turn)*(1-Math.exp(-7*dt));}lastYaw=yaw;
    perspectiveK+=(T.MathUtils.clamp(perspective,0,1)-perspectiveK)*(1-Math.exp(-12*dt));
    strafeK+=(strafe-strafeK)*(1-Math.exp(-7*dt));
    chestK+=((chest?1:0)-chestK)*(1-Math.exp(-6*dt));if(!chest&&chestK<.002){chestK=0;jolt=joltV=nod=nodV=stepRoll=stepRollV=0;lagYaw=null;lagErr=0;}
    const cw=chestK*(1-perspectiveK);
    if(cw>0){
     // A footfall arrives through the body: a short drop, a nod forward and a tip toward the planted foot.
     if(footstep){stepSide=-stepSide;const hard=(.32+.34*sprintK)*Math.min(1.3,intensity+.3)*(1-slideK);joltV-=hard;nodV-=hard*.75;stepRollV+=stepSide*hard*.5;}
     exert+=((sprint>.5&&speed>4?1:0)-exert)*(1-Math.exp(-(sprint>.5&&speed>4?.45:.16)*dt));breathPhase+=dt*(1.5+3.4*exert);
    }
    const rest=Math.max(0,1-intensity);
    slideK+=(slide-slideK)*(1-Math.exp(-10*dt));sprintK+=(sprint-sprintK)*(1-Math.exp(-5*dt));
    const carry=(1+weight*.55)*(1-ads*.65),vertical=1-.45*perspectiveK,lateral=1+.65*perspectiveK;
    const own=bodyBob!=null&&Number.isFinite(bodyBob)&&perspectiveK<.5;bodyK+=((own?1:0)-bodyK)*(1-Math.exp(-6*dt));
    const bob=(Math.abs(Math.sin(phase))-.64)*(.045+.025*sprintK)*intensity*(1-slideK)*carry*vertical*(1-bodyK)+(own?bodyBob*1.8*(1-slideK)*carry*bodyK:0);
    const sway=(Math.sin(phase)*(.024+.012*sprintK)*intensity*(1-slideK)*carry+Math.sin(clock*.7)*.004*rest)*lateral
      +Math.sin(clock*9.3)*.03*slideK+(strafe-strafeK)*.018*perspectiveK;
    // Bounded deterministic harmonics avoid random frame-rate-dependent shake.
    const judder=slideK*(Math.sin(clock*53)*.012+Math.sin(clock*23)*.012),rock=slideK*(Math.sin(clock*7.1)*.035+Math.sin(clock*17.3)*.012);
    const breath=Math.sin(clock*1.55)*.006*rest*vertical*(1-cw)+(cw>0?(Math.sin(breathPhase)*(.0035+.0065*exert)+jolt)*cw:0);
    roll+=((-Math.sin(phase)*(.007+.006*sprintK)*intensity*(1+.25*perspectiveK))-strafeK*(.02+.022*cw)-turn*1.3+lean-roll)*(1-Math.exp(-8*dt));
    shake=Math.max(0,shake-dt*3.2);const jitter=shake*shake*.035;
    offset.copy(right).multiplyScalar((effects?.sway===false?0:sway)+(effects?.shake===false?0:Math.sin(clock*71)*jitter*.5))
      .addScaledVector(up,(effects?.bob===false?0:bob+breath+landing*vertical*(1-bodyK*.7))-crouch-chestDrop*cw+(effects?.shake===false?0:judder+Math.sin(clock*89)*jitter*.5));
    camera.position.add(offset);applied.copy(camera.position);look.copy(aim).add(offset);
    if(cw>0){
     // Turn lag: the chest comes round after the eyes. The lens trails the look by a few degrees on a fast turn and
     // catches up as it stops; the hips also swing a little with each stride.
     lagDir.subVectors(look,camera.position);const reach=lagDir.length()||1;lagDir.divideScalar(reach);
     const wantYaw=Math.atan2(lagDir.x,-lagDir.z),wantPitch=Math.asin(T.MathUtils.clamp(lagDir.y,-1,1));
     if(lagYaw===null||!(turnLag>0)){lagYaw=wantYaw;lagPitch=wantPitch;}
     else{let d=Math.atan2(Math.sin(wantYaw-lagYaw),Math.cos(wantYaw-lagYaw));if(Math.abs(d)>1){lagYaw=wantYaw;lagPitch=wantPitch;d=0;}
      const k=1-Math.exp(-15*dt);lagYaw+=d*k;lagPitch+=(wantPitch-lagPitch)*k;
      const m=.13;d=Math.atan2(Math.sin(wantYaw-lagYaw),Math.cos(wantYaw-lagYaw));if(Math.abs(d)>m)lagYaw=wantYaw-Math.sign(d)*m;if(Math.abs(wantPitch-lagPitch)>m)lagPitch=wantPitch-Math.sign(wantPitch-lagPitch)*m;}
     const w=cw*T.MathUtils.clamp(turnLag,0,1),dy=Math.atan2(Math.sin(lagYaw-wantYaw),Math.cos(lagYaw-wantYaw))*w,dp=(lagPitch-wantPitch)*w;lagErr=Math.hypot(dy,dp);
     const yaw=wantYaw+dy+Math.sin(phase)*.0055*intensity*(1-slideK)*cw,pitch=T.MathUtils.clamp(wantPitch+dp+(Math.sin(breathPhase+.7)*(.002+.004*exert)+nod*.9)*cw,-1.5,1.5);
     look.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(reach).add(camera.position);
    }else lagErr=0;
    camera.lookAt(look);
    if(effects?.roll!==false)camera.rotateZ(roll+rollKick*.06+stepRoll*cw*.8+(effects?.shake===false?0:rock));
    return footstep;
   },
   inspect:()=>({perspective:+perspectiveK.toFixed(3),sprint:+sprintK.toFixed(3),phase:+phase.toFixed(3),slide:+slideK.toFixed(2),intensity:+intensity.toFixed(3),roll:+roll.toFixed(4),offset:offset.toArray().map(v=>+v.toFixed(4)),landing:+landing.toFixed(4),chest:+chestK.toFixed(3),jolt:+jolt.toFixed(4),lag:+lagErr.toFixed(4),exert:+exert.toFixed(2)})
  };
 }
 root.createCameraSway=createCameraSway;
})(typeof window==='object'?window:globalThis);
