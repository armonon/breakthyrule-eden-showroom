'use strict';
// Procedural motion for the shared 17-bone rig. Nothing is keyframed: a speed-matched gait plants the feet, springs
// add weight and follow-through, and two-bone IK puts hands and feet on targets chosen by layers (arm swing, guard,
// waving, wall contact, grabbing, punches). Hits kick springs on the spine, head and pelvis as a light physical reaction.
(function(root){
 const clamp=(n,l,h)=>Math.max(l,Math.min(h,n)),smooth=(l,h,n)=>{const t=clamp((n-l)/(h-l),0,1);return t*t*(3-2*t);};
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 function create(T,model,{reduced=false}={}){
  const bone=name=>model.skeleton.getBoneByName(name),group=model.root;
  const pelvis=bone('root'),spineLow=bone('spine03'),spineHigh=bone('spine01'),neck=bone('neck01'),head=bone('head');
  for(const b of model.skeleton.bones)b.quaternion.identity();
  group.updateMatrixWorld(true);
  const local=b=>group.worldToLocal(b.getWorldPosition(new T.Vector3()));
  const pelvisRest=pelvis.position.clone(),headRest=local(head);
  const v1=new T.Vector3(),v2=new T.Vector3(),v3=new T.Vector3(),dir=new T.Vector3(),bend=new T.Vector3(),mid=new T.Vector3(),end=new T.Vector3();
  const q1=new T.Quaternion(),q2=new T.Quaternion(),m=new T.Matrix4(),e=new T.Euler();
  // Two-bone IK in world space: place the middle joint in the plane of the pole, then aim each bone at its joint.
  function aim(b,origin,from,to){v1.subVectors(from,origin).normalize();v2.subVectors(to,origin).normalize();q1.setFromUnitVectors(v1,v2);b.getWorldQuaternion(q2).premultiply(q1);b.parent.getWorldQuaternion(q1).invert();b.quaternion.copy(q1.multiply(q2));b.updateMatrixWorld(true);}
  function solve(limb,target,pole){
   const a=limb.upper.getWorldPosition(new T.Vector3()),b=limb.lower.getWorldPosition(new T.Vector3()),c=limb.end.getWorldPosition(new T.Vector3());
   const l1=a.distanceTo(b),l2=b.distanceTo(c);dir.subVectors(target,a);const d=clamp(dir.length(),Math.abs(l1-l2)+1e-4,(l1+l2)*.999);dir.normalize();
   const cos=(l1*l1+d*d-l2*l2)/(2*l1*d),sin=Math.sqrt(Math.max(0,1-cos*cos));
   bend.copy(pole).addScaledVector(dir,-pole.dot(dir));if(bend.lengthSq()<1e-8)bend.set(0,0,1);bend.normalize();
   mid.copy(a).addScaledVector(dir,l1*cos).addScaledVector(bend,l1*sin);aim(limb.upper,a,b,mid);
   limb.lower.getWorldPosition(b);limb.end.getWorldPosition(c);end.copy(a).addScaledVector(dir,d);aim(limb.lower,b,c,end);
  }
  // A basis (forward, palm) turned into a world rotation for the hand or foot.
  const basis=(x,y)=>{const z=v3.crossVectors(x,y).normalize();y=v2.crossVectors(z,x).normalize();return q1.setFromRotationMatrix(m.makeBasis(x.clone().normalize(),y,z)).clone();};
  function orient(b,world){b.parent.getWorldQuaternion(q2).invert();b.quaternion.copy(q2.multiply(world));b.updateMatrixWorld(true);}
  // Damped springs, substepped so stiff ones stay stable through long frames.
  const steps=(dt,w)=>Math.min(24,Math.max(1,Math.ceil(dt*w*4)));
  const spring=(s,target,dt,hz,zeta)=>{const w=2*Math.PI*hz,n=steps(dt,w),h=dt/n;for(let i=0;i<n;i++){s.v.addScaledVector(v1.subVectors(target,s.x).multiplyScalar(w*w),h).addScaledVector(s.v,-2*zeta*w*h);s.x.addScaledVector(s.v,h);}return s.x;};
  const scalar=(s,target,dt,hz,zeta)=>{const w=2*Math.PI*hz,n=steps(dt,w),h=dt/n;for(let i=0;i<n;i++){s.v+=(w*w*(target-s.x)-2*zeta*w*s.v)*h;s.x+=s.v*h;}return s.x;};
  const sides=[['L',1],['R',-1]].map(([name,sign])=>{
   const arm={upper:bone('upperarm01.'+name),lower:bone('lowerarm01.'+name),end:bone('wrist.'+name)},leg={upper:bone('upperleg01.'+name),lower:bone('lowerleg01.'+name),end:bone('foot.'+name)};
   const shoulder=local(arm.upper),elbow=local(arm.lower),wrist=local(arm.end),hip=local(leg.upper),ankle=local(leg.end);
   const reach=shoulder.distanceTo(elbow)+elbow.distanceTo(wrist);
   // The bind pose is an A-pose: remember which way the hand points in it so reaches can turn the palm.
   const finger=wrist.clone().sub(elbow).normalize(),palm=new T.Vector3(-sign,-.35,0).addScaledVector(finger,-new T.Vector3(-sign,-.35,0).dot(finger)).normalize();
   const handRest=shoulder.clone().add(new T.Vector3(sign*.16*reach,-.92*reach,.08*reach));
   // Fingers (when the rig has them) curl about the axis that swings each finger towards the palm.
   // The palm faces the side of the knuckle plane the thumb sits on.
   const fingers=['thumb','index','middle','ring','pinky'].map(f=>[1,2,3].map(k=>bone(f+k+'.'+name))).filter(c=>c.every(Boolean));
   const inPalm=fingers.length===5?local(fingers[1][0]).sub(local(fingers[4][0])).cross(local(fingers[2][0]).sub(wrist)).normalize():palm.clone();
   if(fingers.length===5&&inPalm.dot(local(fingers[0][2]).sub(wrist))<0)inPalm.negate();
   // Each finger also knows how far it is splayed from the middle finger, so a fist can pull them together.
   const flat=v=>v.addScaledVector(inPalm,-v.dot(inPalm)).normalize(),toward=k=>fingers.length===5?flat(local(fingers[k][1]).sub(local(fingers[k][0]))):null,middle=toward(2),index=toward(1);
   const curlers=fingers.map(chain=>{const d=local(chain[1]).sub(local(chain[0])).normalize(),thumb=chain[0].name.startsWith('thumb'),f=flat(d.clone());
    const aim=thumb?index:middle,spread=aim?Math.atan2(f.clone().cross(aim).dot(inPalm),f.dot(aim))*(thumb?.5:1):0;
    // The thumb folds over the fingers by swinging about the hand's long axis, towards the palm.
    const long=middle?middle.clone():d.clone(),wrapSign=long.clone().cross(d).dot(inPalm)>0?-1:1;
    return {chain,thumb,axis:d.clone().cross(inPalm).normalize(),spread,across:inPalm.clone(),long,wrapSign};});
   return {name,sign,arm,leg,shoulder,hip,ankle,reach,handRest,bindHand:basis(finger,inPalm.clone()).invert(),fingers:curlers,curl:{x:.3,v:0},
    hand:{x:handRest.clone(),v:new T.Vector3()},foot:{x:ankle.clone(),v:new T.Vector3()},touch:null,touchWeight:{x:0,v:0},punch:null};
  });
  const state={time:null,phase:0,speed:0,weight:0,velocity:new T.Vector3(),last:new T.Vector3(),lastYaw:null,yawRate:0,walkHold:0,
   lean:{x:0,v:0},bank:{x:0,v:0},hitPitch:{x:0,v:0},hitRoll:{x:0,v:0},headPitch:{x:0,v:0},stumble:{x:new T.Vector3(),v:new T.Vector3()},
   guard:{x:0,v:0},guardTarget:0,wave:{x:0,v:0},look:null,lookYaw:{x:0,v:0},lookPitch:{x:0,v:0},airborne:false,treadmill:0,punches:0};
  const toLocal=p=>group.worldToLocal(v3.copy(p)).clone(),toWorld=p=>group.localToWorld(p.clone());
  const api={
   tune:{guardLift:0},
   // A layer asks for a hand on a world point; weight 0 lets the hand go back to swinging.
   touch(side,point,normal=null,weight=1,kind='press'){const s=sides[side==='L'?0:1];s.touch=weight>0&&point?{point:point.clone(),normal:normal?.clone()||null,kind}:s.touch;s.touchTarget=weight;},
   lookAt(point){state.look=point?point.clone():null;},
   guard(weight){state.guardTarget=clamp(weight,0,1);},
   airborne(value){state.airborne=!!value;},
   // Jab with the hand furthest back; returns the seconds until the fist lands.
   punch(target){const s=sides[state.punches++%2];s.punch={t:0,target:target?toLocal(target):s.shoulder.clone().add(new T.Vector3(-s.sign*.08,.02,.62))};return .12;},
   hit(direction,strength=1){const d=direction.clone().applyQuaternion(group.getWorldQuaternion(new T.Quaternion()).invert());d.y=0;if(d.lengthSq()>1e-6)d.normalize();
    state.flinch=state.time+2.5;state.hitPitch.v+=d.z*7*strength;state.hitRoll.v-=d.x*7*strength;state.headPitch.v+=d.z*11*strength;state.stumble.v.addScaledVector(d,.9*strength);},
   update(dt,{velocity=null,treadmill=0,wave=false}={}){
    dt=clamp(dt||0,0,1/20);const scale=group.scale.x||1;group.updateMatrixWorld(true);
    // Measured motion in the character's own frame, so network smoothing or player input both drive the gait.
    const worldPos=group.getWorldPosition(v1).clone();
    if(velocity)state.velocity.copy(velocity);else if(dt>0&&state.time!==null&&worldPos.distanceTo(state.last)<1.5)state.velocity.subVectors(worldPos,state.last).divideScalar(dt);else state.velocity.set(0,0,0); // a jump in position is a teleport, not a sprint
    if(state.velocity.length()>9)state.velocity.setLength(9);
    state.last.copy(worldPos);state.time=(state.time||0)+dt;
    const yaw=group.rotation.y;if(state.lastYaw!==null&&dt>0)state.yawRate+=(wrap(yaw-state.lastYaw)/dt-state.yawRate)*(1-Math.exp(-10*dt));state.lastYaw=yaw;
    const moving=v2.copy(state.velocity).setY(0).applyAxisAngle(new T.Vector3(0,1,0),-yaw).divideScalar(scale);
    if(treadmill>0&&moving.lengthSq()<.04)moving.set(0,0,treadmill/scale);
    const speed=moving.length(),turning=Math.abs(state.yawRate)*.45;
    state.speed+=(Math.max(speed,turning)-state.speed)*(1-Math.exp(-8*dt));
    const gait=state.speed,w=smooth(.04,.5,gait);state.weight=w;
    const heading=speed>.05?moving.clone().normalize():new T.Vector3();
    const stance=T.MathUtils.lerp(.62,.42,smooth(3,6,gait)),cycle=Math.min(1.15+.22*gait,.85/stance),stride=stance*cycle;
    if(!reduced)state.phase=(state.phase+gait*dt/cycle)%1;
    const run=smooth(3.5,5.5,gait),offsets=[];
    pelvis.position.copy(pelvisRest);for(const b of model.skeleton.bones)b.quaternion.identity();
    // Pelvis: drop on each footfall, shift over the planted foot, twist with the stride. Springs keep it heavy.
    const ph=state.phase*Math.PI*2,bob=-(.018+.03*run)*w*(.5+.5*Math.cos(2*ph)),sway=.02*w*(1-run)*Math.sin(ph);
    const breath=reduced?0:Math.sin(state.time*1.6)*.004*(1-w);
    spring(state.stumble,v3.set(0,0,0),dt,2.2,.55);
    pelvis.position.add(v3.set(sway+state.stumble.x.x,bob+breath+(state.airborne?.06:0),state.stumble.x.z));
    pelvis.rotation.set(0,.13*w*Math.sin(ph)*(1-.4*run),0);
    // Reaching for something beyond arm's length bends the whole torso towards it.
    let reachLean=0;for(const s of sides)if(s.touch&&s.touchWeight.x>.01){const t=toLocal(s.touch.point);reachLean=Math.max(reachLean,clamp((t.distanceTo(s.shoulder)-s.reach*.92)*1.6,0,.45)*clamp(s.touchWeight.x,0,1)*smooth(0,.2,t.z-s.shoulder.z));}
    scalar(state.lean,clamp(moving.z*.035+run*.08,-.12,.22)+reachLean,dt,2.5,.7);
    scalar(state.bank,clamp(-state.yawRate*.05*w,-.12,.12),dt,2,.8);
    scalar(state.hitPitch,0,dt,2.4,.32);scalar(state.hitRoll,0,dt,2.4,.32);scalar(state.headPitch,0,dt,3.2,.3);
    scalar(state.guard,Math.max(state.guardTarget,state.time<(state.flinch||0)?1:0),dt,4,.9);
    scalar(state.wave,wave?1:0,dt,3,.9);
    let twist=0;
    for(const s of sides)if(s.punch){const t=s.punch.t;twist+=-s.sign*.42*(t<.06?-t/.06*.3:t<.2?Math.sin((t-.06)/.14*Math.PI/2):Math.max(0,1-(t-.2)/.18));}
    spineLow.rotation.set(state.lean.x+state.hitPitch.x*.6,-pelvis.rotation.y*1.6+twist*.4,state.bank.x+state.hitRoll.x*.6);
    // Head and chest share the turn towards whatever the character is looking at.
    let lookYaw=0,lookPitch=0;
    // Without a set target, glance at the local player when they come close and stand in front.
    let focus=state.look;const near=root.GardenCharacterMotion.attention;
    if(!focus&&near){const d=toLocal(near).sub(headRest);const r=Math.hypot(d.x,d.z)*scale;if(r>.6&&r<4.5&&d.z>0)focus=near;}
    if(focus){const t=toLocal(focus).sub(headRest);lookYaw=clamp(Math.atan2(t.x,t.z),-1.1,1.1);lookPitch=clamp(-Math.atan2(t.y,Math.hypot(t.x,t.z)),-.6,.6);if(Math.abs(Math.atan2(t.x,t.z))>1.9)lookYaw=lookPitch=0;}
    scalar(state.lookYaw,lookYaw,dt,1.6,.85);scalar(state.lookPitch,lookPitch,dt,1.6,.85);
    spineHigh.rotation.set(state.lookPitch.x*.2+state.hitPitch.x*.4+breath*2,state.lookYaw.x*.25+twist*.6,state.hitRoll.x*.4);
    neck.rotation.set(state.lookPitch.x*.35,state.lookYaw.x*.3,0);
    head.rotation.set(state.lookPitch.x*.45+state.headPitch.x,state.lookYaw.x*.45,0);
    group.updateMatrixWorld(true);
    // Legs: each foot moves back at walking speed while planted and arcs forward while lifted, so it never slides.
    for(const [i,s] of sides.entries()){
     const p=(state.phase+i*.5)%1;let offset,lift;
     if(p<stance){offset=stride*(.5-p/stance);lift=0;}else{const t=(p-stance)/(1-stance);offset=stride*(smooth(0,1,t)-.5);lift=Math.sin(t*Math.PI)*(.07+.05*run);}
     offsets[i]=offset*w;
     const target=s.ankle.clone().addScaledVector(heading,offset*w).add(v3.set(0,lift*w,0));
     if(state.airborne)target.add(v3.set(0,.16,.05+i*.06));
     spring(s.foot,target,dt,14,.9);
     solve(s.leg,toWorld(s.foot.x),group.localToWorld(v3.set(s.sign*.15,0,1).add(s.hip))
      .sub(group.localToWorld(s.hip.clone())));
     e.set(-Math.sin(p<stance?0:((p-stance)/(1-stance))*Math.PI)*.35*w,0,0);
     orient(s.leg.end,group.getWorldQuaternion(new T.Quaternion()).multiply(new T.Quaternion().setFromEuler(e)));
    }
    // Arms: swing opposite the legs, then blend towards guard, wave, touch and punch targets.
    for(const [i,s] of sides.entries()){
     const swing=-offsets[i]*.55*(1+run*.4);
     const target=s.handRest.clone().add(v3.set(-s.sign*.03*run,.12*run+.18*Math.max(0,swing),swing+.05*run));
     if(state.airborne)target.add(v3.set(s.sign*.12,.2,0));
     const lift=api.tune.guardLift;target.lerp(s.shoulder.clone().add(v3.set(-s.sign*.08,.02+lift+(i?0:.03),.3+lift*.6)),state.guard.x);
     if(s.sign<0&&state.wave.x>.001)target.lerp(s.shoulder.clone().add(v3.set(-.34,.42+.04*Math.sin(state.time*9),.08+.07*Math.sin(state.time*7))),state.wave.x);
     scalar(s.touchWeight,s.touchTarget||0,dt,3.2,.85);
     let pose=null,hz=6,zeta=.72;
     if(s.touch&&s.touchWeight.x>.001){const t=toLocal(s.touch.point);target.lerp(t,clamp(s.touchWeight.x,0,1));pose=s.touch;hz=8;}
     if(s.punch){
      const t=s.punch.t,guardPos=s.shoulder.clone().add(v3.set(-s.sign*.07,.1+api.tune.guardLift,.24+api.tune.guardLift*.6));
      const out=t<.06?0:t<.2?smooth(0,1,(t-.06)/.14):1-smooth(.2,.38,t);
      target.copy(guardPos).lerp(s.punch.target,out);hz=t<.2?16:9;zeta=t<.2?.55:.8;pose={kind:'punch'};
      s.punch.t+=dt;if(s.punch.t>.4)s.punch=null;
     }
     spring(s.hand,target,dt,hz,zeta);
     // Elbows trail behind in a swing but drop under the hands when they come up to guard, punch or touch.
     const up=Math.max(state.guard.x,s.punch?1:0,clamp(s.touchWeight.x,0,1)*.7);
     const pole=v2.set(s.sign*.5,-.2,-1).lerp(bend.set(s.sign*.45,-1,-.1),up);
     solve(s.arm,toWorld(s.hand.x),group.localToWorld(v3.copy(pole).add(s.shoulder)).sub(group.localToWorld(s.shoulder.clone())));
     // Turn the palm to suit the contact: flat on a wall, reaching into a grab, knuckles forward in a punch.
     if(!pose&&state.guard.x>.05)pose={kind:'guard'};
     if(pose){
      const rootQ=group.getWorldQuaternion(new T.Quaternion());let finger,palm;
      if(pose.kind==='press'&&pose.normal){const n=pose.normal.clone().normalize();finger=new T.Vector3(0,1,0).addScaledVector(n,-n.y);if(finger.lengthSq()<1e-4)finger.set(0,0,1);finger.normalize().applyAxisAngle(n,s.sign*.35);palm=n.clone().negate();}
      else if(pose.kind==='guard'){finger=new T.Vector3(0,.8,.6).applyQuaternion(rootQ);palm=new T.Vector3(-s.sign,0,-.25).applyQuaternion(rootQ);}
      else{const from=toWorld(s.shoulder),to=toWorld(s.hand.x);finger=to.sub(from).normalize();palm=new T.Vector3(0,-1,0).applyQuaternion(rootQ);if(pose.kind!=='punch')palm.lerp(new T.Vector3(-s.sign,0,0).applyQuaternion(rootQ),.6);}
      const wq=basis(finger,palm.addScaledVector(finger,-palm.dot(finger)).normalize()).multiply(s.bindHand);
      const weight=pose.kind==='punch'?1:pose.kind==='guard'?clamp(state.guard.x,0,1):clamp(s.touchWeight.x,0,1);
      orient(s.arm.end,s.arm.end.getWorldQuaternion(new T.Quaternion()).slerp(wq,weight));
     }
     // Fists for guard and punches, a half grip when reaching to grab, flat palms on walls, relaxed otherwise.
     const kind=s.touch&&s.touchWeight.x>.3?s.touch.kind:null;
     const curl=s.punch||state.guard.x>.5?1.45:kind==='grab'?.6:kind==='press'?.03:s.sign<0&&state.wave.x>.5?.08:.25;
     scalar(s.curl,curl,dt,s.punch?10:5,.85);
     // A fist closes the splay and folds the thumb across; a flat hand on a wall keeps the fingers apart.
     const close=clamp((s.curl.x-.3)/1.1,0,1);
     for(const f of s.fingers)f.chain.forEach((b,j)=>{b.quaternion.setFromAxisAngle(f.axis,s.curl.x*(f.thumb?[.55,.6,.5][j]:[1.55,1.1,.7][j]));
      if(j===0&&close>0){b.quaternion.premultiply(q1.setFromAxisAngle(f.across,f.spread*.9*close));if(f.thumb)b.quaternion.premultiply(q1.setFromAxisAngle(f.long,f.wrapSign*.85*close));}});
     if(s.touchWeight.x<.002&&!s.touchTarget)s.touch=null;
    }
   },
   // The old animate(t, stride, waving) signature: callers that only know "walking or not" still get a full gait.
   animate(t,stride=0,waving=false){
    const dt=api._t===undefined?0:t-api._t;api._t=t;
    if(Math.abs(stride)>.015)state.walkHold=.3;else state.walkHold=Math.max(0,state.walkHold-Math.max(0,dt));
    api.update(dt>0?dt:0,{treadmill:state.walkHold>0?1.45:0,wave:waving});
   },
   inspect:()=>({phase:+state.phase.toFixed(3),speed:+state.speed.toFixed(2),weight:+state.weight.toFixed(2),guard:+state.guard.x.toFixed(2),hit:+state.hitPitch.x.toFixed(2),touch:sides.map(s=>+s.touchWeight.x.toFixed(2)),punching:sides.some(s=>s.punch)})
  };
  return api;
 }
 // bodies: every rigged character alive, so interactions can find who is within reach.
 root.GardenCharacterMotion={create,attention:null,bodies:new Set()};
})(typeof window==='object'?window:globalThis);
