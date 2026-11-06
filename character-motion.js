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
  // Ragdoll: Verlet particles at the joints, held by distance constraints, a braced torso, knee and elbow stops,
  // ground contact and friction. While it runs it drives the bones by aiming each one at its particles; afterwards
  // the pose blends back into the procedural animation as the character gets up.
  const ragdoll=(()=>{
   const order=['root','spine03','spine02','spine01','neck01','head','clavicle.L','upperarm01.L','lowerarm01.L','wrist.L','clavicle.R','upperarm01.R','lowerarm01.R','wrist.R','upperleg01.L','lowerleg01.L','foot.L','upperleg01.R','lowerleg01.R','foot.R'].map(bone).filter(Boolean);
   const at=b=>order.indexOf(b),P=[],Q=[],links=[],stops=[];let active=false,clock=0,ground=0,acc=0,recover=0,snapshot=null,snapPelvis=new T.Vector3();
   // Leaf bones get a tip particle so their direction is simulated too.
   const tips=new Map();
   for(const b of order){const child=order.find(c=>c.parent===b);if(child)continue;const t=b.name.startsWith('head')?new T.Vector3(0,.22,.02):b.name.startsWith('wrist')?local(b).sub(local(b.parent)).setLength(.17):b.name.startsWith('foot')?new T.Vector3(0,-.04,.17):new T.Vector3(0,.1,0);tips.set(b,{local:t,index:order.length+tips.size});}
   const endOf=b=>{const child=order.find(c=>c.parent===b);return child?at(child):tips.get(b).index;};
   const tipWorld=(b)=>{const t=tips.get(b);return b.localToWorld(v1.copy(t.local)).clone();};
   const pick=n=>at(bone(n));
   const bind={};
   const capture=()=>{order.forEach((b,i)=>{P[i]=b.getWorldPosition(new T.Vector3());});for(const [b,t] of tips)P[t.index]=tipWorld(b);};
   let stayDown=false;
   // stay: a death; the body never gets back up (and stops simulating once it has settled).
   function start(impulse,strength,stay=false){stayDown=stay;
    group.updateMatrixWorld(true);capture();Q.length=0;
    const up=new T.Vector3(0,1,0);P.forEach((p,i)=>{const h=clamp((p.y-group.getWorldPosition(v2).y)/1.6,0,1);Q[i]=p.clone().addScaledVector(impulse,-(.007+.02*h)*strength).addScaledVector(up,-.008*strength*h);});
    links.length=0;stops.length=0;const add=(a,b,list=links)=>{if(a>=0&&b>=0)list.push([a,b,P[a].distanceTo(P[b])]);};
    order.forEach((b,i)=>{if(order.includes(b.parent))add(at(b.parent),i);});for(const [b,t] of tips)add(at(b),t.index);
    const L=pick('upperarm01.L'),R=pick('upperarm01.R'),hl=pick('upperleg01.L'),hr=pick('upperleg01.R'),chest=pick('spine01'),neck=pick('neck01'),hd=pick('head'),root=pick('root');
    for(const [a,b] of [[L,R],[hl,hr],[L,hl],[R,hr],[L,hr],[R,hl],[neck,L],[neck,R],[hd,L],[hd,R],[chest,hl],[chest,hr],[root,L],[root,R],[tips.get(bone('head'))?.index,neck],[tips.get(bone('head'))?.index,chest]])add(a,b);
    for(const [a,b] of [[pick('upperleg01.L'),pick('foot.L')],[pick('upperleg01.R'),pick('foot.R')],[pick('upperarm01.L'),pick('wrist.L')],[pick('upperarm01.R'),pick('wrist.R')]])if(a>=0&&b>=0)stops.push([a,b,P[a].distanceTo(P[b])*.55]);
    ground=group.getWorldPosition(v2).y;active=true;clock=0;acc=0;recover=0;
   }
   function step(dt){
    clock+=dt;acc+=dt;const h=1/90;let n=0;
    while(acc>=h&&n++<8){acc-=h;
     P.forEach((p,i)=>{const prev=Q[i],vx=(p.x-prev.x)*.995,vy=(p.y-prev.y)*.995,vz=(p.z-prev.z)*.995;prev.copy(p);p.x+=vx;p.y+=vy-9.8*h*h;p.z+=vz;});
     for(let k=0;k<10;k++){
      for(const [a,b,len] of links){const d=v1.subVectors(P[b],P[a]),l=d.length()||1e-6,c=(l-len)/l*.5;P[a].addScaledVector(d,c);P[b].addScaledVector(d,-c);}
      for(const [a,b,min] of stops){const d=v1.subVectors(P[b],P[a]),l=d.length()||1e-6;if(l<min){const c=(l-min)/l*.5;P[a].addScaledVector(d,c);P[b].addScaledVector(d,-c);}}
      P.forEach((p,i)=>{const floor=ground+.05;if(p.y<floor){p.y=floor;Q[i].x+=(p.x-Q[i].x)*.35;Q[i].z+=(p.z-Q[i].z)*.35;}});
     }
     // Walls and props: a joint that would enter something solid stays where it was across the floor plan.
     const solid=root.GardenCharacterMotion.solid;
     if(solid)P.forEach((p,i)=>{if(p.y<ground+2.2&&solid(p)&&!solid(Q[i])){p.x=Q[i].x;p.z=Q[i].z;}});
    }
   }
   // Pelvis and chest take their full orientation from a left-right pair and an up direction; limbs just aim.
   const basisFrom=(xa,xb,ya,yb)=>basis(P[xa].clone().sub(P[xb]),P[ya].clone().sub(P[yb]));
   const bindBasis=(xa,xb,ya,yb)=>basis(local(order[xa]).sub(local(order[xb])),(order[ya]?local(order[ya]):new T.Vector3()).sub(local(order[yb])));
   for(const b of model.skeleton.bones)b.quaternion.identity();group.updateMatrixWorld(true);
   const frames={root:[pick('upperleg01.L'),pick('upperleg01.R'),pick('spine03'),pick('root')],spine01:[pick('upperarm01.L'),pick('upperarm01.R'),pick('neck01'),pick('spine01')]};
   for(const [name,f] of Object.entries(frames))if(f.every(i=>i>=0))bind[name]=bindBasis(...f).invert();
   function pose(){
    for(const b of model.skeleton.bones)b.quaternion.identity();
    const root=order[0];root.position.copy(group.worldToLocal(P[0].clone()));group.updateMatrixWorld(true);
    for(const [i,b] of order.entries()){
     const f=frames[b.name];
     if(f&&bind[b.name]){orient(b,basisFrom(...f).multiply(bind[b.name]));continue;}
     const e=endOf(b),from=e<order.length?order[e].getWorldPosition(new T.Vector3()):tipWorld(b);
     aim(b,b.getWorldPosition(new T.Vector3()),from,P[e]);
    }
    for(const s of sides)for(const f of s.fingers)f.chain.forEach((b,j)=>b.quaternion.setFromAxisAngle(f.axis,.5*(f.thumb?.4:1)));
   }
   return {
    get active(){return active;},get recovering(){return recover>0;},start,
    update(dt){if(stayDown&&clock>6)return; // a settled corpse keeps its last pose
     step(dt);pose();
     // Lie still for a moment, then get up: the procedural pose takes over from the ragdoll over about a second.
     const still=Q.every((q,i)=>q.distanceToSquared(P[i])<1e-7);
     if(!stayDown&&clock>2.2&&(still||clock>4.5)){active=false;recover=1;snapshot=model.skeleton.bones.map(b=>b.quaternion.clone());snapPelvis.copy(order[0].position);}},
    blend(dt){recover=Math.max(0,recover-dt/1.1);const k=smooth(0,1,1-recover);model.skeleton.bones.forEach((b,i)=>b.quaternion.slerpQuaternions(snapshot[i],b.quaternion.clone(),k));order[0].position.lerpVectors(snapPelvis,order[0].position.clone(),k);},
    get recoverLeft(){return recover;},
    inspect:()=>active?'down':recover>0?'getting up':'standing'
   };
  })();
  const state={time:null,phase:0,speed:0,weight:0,velocity:new T.Vector3(),last:new T.Vector3(),lastYaw:null,yawRate:0,walkHold:0,
   lean:{x:0,v:0},bank:{x:0,v:0},hitPitch:{x:0,v:0},hitRoll:{x:0,v:0},headPitch:{x:0,v:0},stumble:{x:new T.Vector3(),v:new T.Vector3()},
   guard:{x:0,v:0},guardTarget:0,wave:{x:0,v:0},wade:{x:0,v:0},look:null,lookYaw:{x:0,v:0},lookPitch:{x:0,v:0},airborne:false,treadmill:0,punches:0,hold:{x:0,v:0},held:null,aimPoint:null,layers:[],locoK:0,idleK:0};
  if(root.GardenAnim&&!root.GardenAnim.ready())setTimeout(()=>root.GardenAnim.load(),3000);
  const toLocal=p=>group.worldToLocal(v3.copy(p)).clone(),toWorld=p=>group.localToWorld(p.clone());
  const api={
   tune:{guardLift:0,wadeLift:0},
   // A layer asks for a hand on a world point; weight 0 lets the hand go back to swinging.
   touch(side,point,normal=null,weight=1,kind='press'){const s=sides[side==='L'?0:1];s.touch=weight>0&&point?{point:point.clone(),normal:normal?.clone()||null,kind}:s.touch;s.touchTarget=weight;},
   lookAt(point){state.look=point?point.clone():null;},
   guard(weight){state.guardTarget=clamp(weight,0,1);},
   airborne(value){state.airborne=!!value;},
   // 0 standing .. 1 full crouch: the pelvis drops and the torso leans in; the leg IK bends the knees.
   crouch(value){state.crouchTarget=clamp(value,0,1);},
   // Hold a weapon in both hands (mesh: a model whose barrel points down its -z; kind: its weapon id) and point it at
   // aimAt's world point. The mesh lives beside the character (in its parent) and follows the right hand every frame.
   hold(mesh,kind=null){if(state.held?.mesh&&state.held.mesh!==mesh)state.held.mesh.parent?.remove(state.held.mesh);state.held=mesh?{mesh,kind}:null;if(mesh){mesh.traverse(n=>{n.userData.noHit=true;n.raycast=()=>{};});mesh.visible=false;}},
   held:()=>state.held,
   aimAt(point){state.aimPoint=point?point.clone():null;},
   // Authored clips (character-anim.js) layered over the procedural pose. mask: 'full' | 'upper' | 'torso' | 'arms';
   // arms: true lets the clip move the arms even while they hold a gun or grip something; hold: stay on the last frame.
   play(id,{fade=.15,speed=1,loop=null,mask='full',weight=1,arms=false,hold=false,start=0}={}){
    const A=root.GardenAnim;if(!A?.ready()||!A.has(id))return null;state.layers=state.layers.filter(L=>L.id!==id||L.out);
    const L={id,t:start,speed,fade,loop:loop??A.clip(id).loop,mask,weight,arms,hold,w:0,out:false,dur:A.duration(id)};state.layers.push(L);return L;},
   stop(id=null,fade=.2){for(const L of state.layers)if(!id||L.id===id){L.out=true;L.fade=fade;}},
   playing:id=>state.layers.some(L=>L.id===id&&!L.out),
   animTune:{loco:true},
   // Jab with the hand furthest back; returns the seconds until the fist lands.
   punch(target){const s=sides[state.punches++%2];s.punch={t:0,target:target?toLocal(target):s.shoulder.clone().add(new T.Vector3(-s.sign*.08,.02,.62))};return .12;},
   hit(direction,strength=1){const d=direction.clone().applyQuaternion(group.getWorldQuaternion(new T.Quaternion()).invert());d.y=0;if(d.lengthSq()>1e-6)d.normalize();
    state.hits=(state.hits||[]).filter(t=>state.time-t<1.3);state.hits.push(state.time);if(!ragdoll.active&&!root.GardenCharacterMotion.serverDecides&&(strength>=1.8||state.hits.length>=3)){state.hits=[];api.knockdown(direction,Math.max(strength,1.4));return 'down';}
    state.flinch=state.time+2.5;state.hitPitch.v+=d.z*7*strength;state.hitRoll.v-=d.x*7*strength;state.headPitch.v+=d.z*11*strength;state.stumble.v.addScaledVector(d,.9*strength);return 'hit';},
   // Knocked down: an explicit call, a hard hit, or the third hit in quick succession.
   // 1 while knocked down, falling to 0 as the character gets up; 0 when standing.
   downAmount:()=>ragdoll.active?1:ragdoll.recovering?ragdoll.recoverLeft:0,
   knockdown(direction,strength=1.5,{stay=false}={}){if(ragdoll.active&&!stay)return;const d=direction.clone().setY(0);if(d.lengthSq()<1e-6)d.set(0,0,-1);d.normalize();ragdoll.start(d,strength,stay);},
   update(dt,options={}){
    dt=clamp(dt||0,0,1/20);
    if(ragdoll.active){state.time=(state.time||0)+dt;ragdoll.update(dt);if(state.held)state.held.mesh.visible=false;return;}
    api.procedural(dt,options);
    if(ragdoll.recovering)ragdoll.blend(dt);
   },
   procedural(dt,{velocity=null,treadmill=0,wave=false,wade=0}={}){
const scale=group.scale.x||1;group.updateMatrixWorld(true);
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
    state.crouch??={x:0,v:0};scalar(state.crouch,state.crouchTarget||0,dt,9,.95);const crouch=clamp(state.crouch.x,0,1);
    pelvis.position.add(v3.set(sway+state.stumble.x.x,bob+breath+(state.airborne?.06:0)-pelvisRest.y*.34*crouch,state.stumble.x.z+pelvisRest.y*.06*crouch));
    pelvis.rotation.set(0,.13*w*Math.sin(ph)*(1-.4*run),0);
    // Reaching for something beyond arm's length bends the whole torso towards it.
    let reachLean=0;for(const s of sides)if(s.touch&&s.touchWeight.x>.01){const t=toLocal(s.touch.point);reachLean=Math.max(reachLean,clamp((t.distanceTo(s.shoulder)-s.reach*.92)*1.6,0,.45)*clamp(s.touchWeight.x,0,1)*smooth(0,.2,t.z-s.shoulder.z));}
    scalar(state.lean,clamp(moving.z*.035+run*.08,-.12,.22)+reachLean,dt,2.5,.7);
    scalar(state.bank,clamp(-state.yawRate*.05*w,-.12,.12),dt,2,.8);
    scalar(state.hitPitch,0,dt,2.4,.32);scalar(state.hitRoll,0,dt,2.4,.32);scalar(state.headPitch,0,dt,3.2,.3);
    scalar(state.guard,Math.max(state.guardTarget,state.time<(state.flinch||0)?1:0),dt,4,.9);
    scalar(state.wave,wave?1:0,dt,3,.9);scalar(state.hold,state.held&&state.held.kind!=='axe'&&state.held.kind!=='c4'?1:0,dt,4,.9);
    // Holding a gun: the chest and head follow the aim.
    const aimLocal=state.aimPoint&&state.hold.x>.01?toLocal(state.aimPoint):null;scalar(state.wade,clamp(wade,0,1),dt,2.2,.8);
    let twist=0;
    for(const s of sides)if(s.punch){const t=s.punch.t;twist+=-s.sign*.42*(t<.06?-t/.06*.3:t<.2?Math.sin((t-.06)/.14*Math.PI/2):Math.max(0,1-(t-.2)/.18));}
    spineLow.rotation.set(state.lean.x+state.hitPitch.x*.6+.38*clamp(state.crouch.x,0,1),-pelvis.rotation.y*1.6+twist*.4,state.bank.x+state.hitRoll.x*.6);
    // Head and chest share the turn towards whatever the character is looking at.
    let lookYaw=0,lookPitch=0;
    // Without a set target, glance at the local player when they come close and stand in front.
    let focus=aimLocal?state.aimPoint:state.look;const near=root.GardenCharacterMotion.attention;
    if(!focus&&near){const d=toLocal(near).sub(headRest);const r=Math.hypot(d.x,d.z)*scale;if(r>.6&&r<4.5&&d.z>0)focus=near;}
    if(focus){const t=toLocal(focus).sub(headRest);lookYaw=clamp(Math.atan2(t.x,t.z),-1.1,1.1);lookPitch=clamp(-Math.atan2(t.y,Math.hypot(t.x,t.z)),-.6,.6);if(Math.abs(Math.atan2(t.x,t.z))>1.9)lookYaw=lookPitch=0;}
    scalar(state.lookYaw,lookYaw,dt,1.6,.85);scalar(state.lookPitch,lookPitch,dt,1.6,.85);
    spineHigh.rotation.set(state.lookPitch.x*(.2+.25*state.hold.x)+state.hitPitch.x*.4+breath*2,state.lookYaw.x*(.25+.35*state.hold.x)+twist*.6,state.hitRoll.x*.4);
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
     // Wading through brush: hands rise to the chest and sweep outwards in time with the stride, parting the leaves.
     if(state.wade.x>.001){const sweep=Math.sin((state.phase+i*.5)*Math.PI*2);const lift=api.tune.wadeLift;target.lerp(s.shoulder.clone().add(v3.set(s.sign*(.27+.1*sweep)*(1-lift*1.5),-.03+lift+.05*Math.max(0,-sweep),.17+lift*1.4+.07*sweep)),state.wade.x*.85);}
     if(s.sign<0&&state.wave.x>.001)target.lerp(s.shoulder.clone().add(v3.set(-.34,.42+.04*Math.sin(state.time*9),.08+.07*Math.sin(state.time*7))),state.wave.x);
     scalar(s.touchWeight,s.touchTarget||0,dt,3.2,.85);
     let pose=null,hz=6,zeta=.72;
     // Gun grip: right hand on the grip under the right shoulder, left hand forward on the barrel (a pistol is held out
     // in both hands), both turned up or down to the aim's pitch.
     if(state.hold.x>.01){const R=sides[1],pistol=state.held?.kind==='pistol',sh=R.shoulder;
      const off=pistol?(s===R?v3.set(.06,-.1,.44):v3.set(.1,-.12,.4)):(s===R?v3.set(.04,-.16,.26):v3.set(.2,-.15,.56));
      let pitch=0;if(aimLocal){const d=aimLocal.clone().sub(sh);pitch=clamp(Math.atan2(d.y,Math.hypot(d.x,d.z)),-.9,.9);}
      const y=off.y*Math.cos(pitch)+off.z*Math.sin(pitch),z=off.z*Math.cos(pitch)-off.y*Math.sin(pitch);
      target.lerp(bend.set(sh.x+off.x,sh.y+y,sh.z+z),state.hold.x);hz=10;zeta=.8;}
     if(s.touch&&s.touchWeight.x>.001){const t=toLocal(s.touch.point);target.lerp(t,clamp(s.touchWeight.x,0,1));pose=s.touch;hz=8;}
     if(s.punch){
      const t=s.punch.t,guardPos=s.shoulder.clone().add(v3.set(-s.sign*.07,.1+api.tune.guardLift,.24+api.tune.guardLift*.6));
      const out=t<.06?0:t<.2?smooth(0,1,(t-.06)/.14):1-smooth(.2,.38,t);
      target.copy(guardPos).lerp(s.punch.target,out);hz=t<.2?16:9;zeta=t<.2?.55:.8;pose={kind:'punch'};
      s.punch.t+=dt;if(s.punch.t>.4)s.punch=null;
     }
     spring(s.hand,target,dt,hz,zeta);
     // Elbows trail behind in a swing but drop under the hands when they come up to guard, punch or touch.
     const up=Math.max(state.guard.x,s.punch?1:0,clamp(s.touchWeight.x,0,1)*.7,state.hold.x);
     const pole=v2.set(s.sign*.5,-.2,-1).lerp(bend.set(s.sign*.45,-1,-.1),up).lerp(bend.set(s.sign,-.3,-.3),state.wade.x*(1-up));
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
     const curl=state.hold.x>.5?1.15:s.punch||state.guard.x>.5?1.45:kind==='grab'?.6:kind==='press'?.03:state.wade.x>.4?.12:s.sign<0&&state.wave.x>.5?.08:.25;
     scalar(s.curl,curl,dt,s.punch?10:5,.85);
     // A fist closes the splay and folds the thumb across; a flat hand on a wall keeps the fingers apart.
     const close=clamp((s.curl.x-.3)/1.1,0,1);
     for(const f of s.fingers)f.chain.forEach((b,j)=>{b.quaternion.setFromAxisAngle(f.axis,s.curl.x*(f.thumb?[.55,.6,.5][j]:[1.55,1.1,.7][j]));
      if(j===0&&close>0){b.quaternion.premultiply(q1.setFromAxisAngle(f.across,f.spread*.9*close));if(f.thumb)b.quaternion.premultiply(q1.setFromAxisAngle(f.long,f.wrapSign*.85*close));}});
     if(s.touchWeight.x<.002&&!s.touchTarget)s.touch=null;
    }
    // Authored clips over the procedural pose: queued clips, and an upper-body walk / run (timed to our own footfalls)
    // and idle, which give the arms, shoulders and spine their swing while the feet stay planted procedurally.
    const A=root.GardenAnim;
    if(A?.ready()){
     const busy=state.hold.x>.05||sides.some(s=>s.touchWeight.x>.05||s.punch)||state.guard.x>.08;
     let full=0;for(const L of state.layers){L.t+=dt*L.speed;if(!L.loop&&L.t>=L.dur){if(L.hold)L.t=L.dur;else L.out=true;}
      const target=L.out?0:1,rate=dt/Math.max(.01,L.fade);L.w=target>L.w?Math.min(1,L.w+rate):Math.max(0,L.w-rate);if(L.mask==='full')full=Math.max(full,L.w*L.weight);}
     state.layers=state.layers.filter(L=>!(L.out&&L.w<=0));
     const M=A.masks(),noArms=k=>{const key=k+'-noarms';M[key]??=M[k].map((v,i)=>M.arms[i]?0:v);return M[key];},list=[];
     if(api.animTune.loco&&!state.airborne){const gait=state.weight,run=smooth(3.5,6,state.speed),id=run>.6?'sprint':run>.15?'jog':'walk';
      state.locoK+=((gait>.05?1:0)-state.locoK)*(1-Math.exp(-6*dt));state.idleK+=((gait<.05?1:0)-state.idleK)*(1-Math.exp(-3*dt));
      const ph=(state.phase+A.phase0(id))%1;if(state.locoK>.01)list.push({id,t:ph*A.duration(id),weight:.85*state.locoK*(1-full),mask:busy?noArms('upper'):M.upper});
      if(state.idleK>.01)list.push({id:'idle',t:(state.time||0)%A.duration('idle'),weight:.55*state.idleK*(1-full),mask:busy?noArms('upper'):M.upper});}
     for(const L of state.layers)list.push({id:L.id,t:L.t,weight:L.w*L.weight,mask:busy&&!L.arms?noArms(L.mask):M[L.mask]});
     A.apply(T,model,list);
    }
    // The held weapon follows the right hand: a gun points from the grip at the aim, the axe hangs from the hand.
    if(state.held){const m=state.held.mesh,par=group.parent;if(par){if(m.parent!==par)par.add(m);m.visible=true;group.updateMatrixWorld(true);
     const hand=sides[1].arm.end.getWorldPosition(new T.Vector3()),fwd=new T.Vector3(0,0,1).applyQuaternion(group.getWorldQuaternion(new T.Quaternion()));
     m.position.copy(par.worldToLocal(hand.clone()));
     if(state.hold.x>.01){const aim=state.aimPoint&&state.aimPoint.distanceTo(hand)>1.2?state.aimPoint:hand.clone().addScaledVector(fwd,10);m.lookAt(aim);m.rotateY(Math.PI);}
     else{m.quaternion.copy(group.getWorldQuaternion(new T.Quaternion()));if(par.parent)m.quaternion.premultiply(par.getWorldQuaternion(new T.Quaternion()).invert());m.rotateX(-1.2);m.position.y-=.05;}}}
   },
   // The old animate(t, stride, waving) signature: callers that only know "walking or not" still get a full gait.
   animate(t,stride=0,waving=false){
    const dt=api._t===undefined?0:t-api._t;api._t=t;
    if(Math.abs(stride)>.015)state.walkHold=.3;else state.walkHold=Math.max(0,state.walkHold-Math.max(0,dt));
    api.update(dt>0?dt:0,{treadmill:state.walkHold>0?1.45:0,wave:waving});
   },
   inspect:()=>({phase:+state.phase.toFixed(3),speed:+state.speed.toFixed(2),weight:+state.weight.toFixed(2),guard:+state.guard.x.toFixed(2),ragdoll:ragdoll.inspect(),wade:+state.wade.x.toFixed(2),hit:+state.hitPitch.x.toFixed(2),touch:sides.map(s=>+s.touchWeight.x.toFixed(2)),punching:sides.some(s=>s.punch)})
  };
  return api;
 }
 // bodies: every rigged character alive, so interactions can find who is within reach.
 // solid(point): optional floor-plan collision the world provides, so ragdolls stop at walls and props.
 // applyHit: play a hit that arrived from the network on the visitor it names (a server-decided outcome wins).
 function applyHit(visitorId,direction,{strength=1.2,knockdown=false}={}){
  for(const body of root.GardenCharacterMotion.bodies)if(body.root.userData.visitorId===visitorId){const d=body.root.position.clone().set(direction.x,0,direction.z);
   return knockdown?(body.motion.knockdown(d,Math.max(strength,1.4)),'down'):body.motion.hit(d,Math.min(strength,1.7));}
  return null;
 }
 // serverDecides: true while a live server judges knockdowns, so local hits only flinch.
 root.GardenCharacterMotion={create,applyHit,attention:null,bodies:new Set(),solid:null,serverDecides:false};
})(typeof window==='object'?window:globalThis);
