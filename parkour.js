'use strict';
// Parkour: a vertical world and the moves to get around it.
//
// The world is the district's box colliders, each with a height (night-district.js walls: [x, z, w, d, height]),
// plus its walkable surfaces (roofs) and crate staircases. Everything is an axis-aligned box, so floors, walls and
// ledges are answered exactly with a little arithmetic instead of raycasts.
//
// Moves (first person, Mirror's Edge; climbing after the MIT-licensed Dynamic Parkour System by Eric Canela, rebuilt
// for this procedural, box-based world):
//   wall-run   jump alongside a tall wall while running: you run along it; jump again to kick off.
//   scramble   jump straight at a wall too tall to grab: you run up it and grab the top if it is in reach.
//   grab       in the air, moving into a ledge within reach: holding W climbs straight up, else you hang.
//   hang       A / D shimmy along the ledge, W or Space climbs up, S or C drops; Space + A / D leaps to a ledge to that
//              side, Space + S kicks off backwards (to a ledge behind you, if there is one).
//   drop       walk off an edge holding C and you catch it and hang.
//   leap       jump towards a ledge or roof across a gap and the jump is guided onto it (jump prediction).
//   roll       press C just before landing from a height to roll out of it at speed; land hard without it and you
//              stagger (and in the match, a long fall hurts).
//
// Host hooks (app.js): createParkour({T, walls:()=>[...], surfaces:()=>[...], ground(x,z), player:{pos, aim, vel,
//   motion, keys, crouchHeld(), sway, footsteps, surface(), requestDraw, onFall(damage)}})
(function(root){
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),smooth=t=>t*t*(3-2*t);
 const EYE=1.75,STEP=.45,REACH=2.25,MANTLE=1.35,HANG_EYE=.3;
 root.createParkour=function({T,walls,surfaces,ground,player}){
  const P=player,up=new T.Vector3(0,1,0);
  let boxes=[],fields=[],sig='',state=null,cool={wallrun:0,grab:0},crouchAt=-9,clock=0,lean=0,fov=0,stats={wallruns:0,scrambles:0,grabs:0,climbs:0,hangs:0,leaps:0,drops:0,rolls:0,hard:0};

  /* ---------------------------------------------------------------- world */
  function refresh(){
   const w=walls()||[],s=surfaces()||[],k=w.length+':'+s.length;if(k===sig)return;sig=k;
   boxes=w.map(([x,z,bw,bd,h=99])=>({minX:x-bw/2,maxX:x+bw/2,minZ:z-bd/2,maxZ:z+bd/2,top:h,bottom:-1,wall:true}))
    .concat(s.filter(b=>!b.field).map(b=>({...b})));
   // Measured rooftops of the building models (assets/roof-heights.js): 1 m height maps.
   fields=s.filter(b=>b.field).map(b=>({...b.field,foot:b.foot||null}));
  }
  function fieldH(F,x,z){const c=Math.floor((x-F.minX)/F.cell),r=Math.floor((z-F.minZ)/F.cell);if(c<0||r<0||c>=F.cols||r>=F.rows)return null;return F.h[r*F.cols+c];}
  const snap=d=>Math.abs(d.x)>Math.abs(d.z)?new T.Vector3(Math.sign(d.x),0,0):new T.Vector3(0,0,Math.sign(d.z));
  const inside=(b,x,z,m=0)=>x>b.minX-m&&x<b.maxX+m&&z>b.minZ-m&&z<b.maxZ+m;
  // Highest walkable top under (x, z) no higher than maxTop (the terrain counts too).
  function floorAt(x,z,maxTop=Infinity,m=.08){refresh();let f=ground(x,z);for(const b of boxes)if(b.top<=maxTop+1e-4&&b.top>f&&inside(b,x,z,m))f=b.top;
   for(const F of fields){const h=fieldH(F,x,z);if(h!=null&&h>.2&&h<=maxTop+1e-4&&h>f)f=h;}return f;}
  // Is there something solid at (x, z) between feet and head (anything taller than a step)?
  function solid(x,z,feet,head,m=.25){refresh();for(const b of boxes)if(inside(b,x,z,m)&&b.top>feet+STEP&&b.bottom<head)return b;
   // Once you are off the ground (on crates, walls or roofs) the measured building is solid wherever it stands taller
   // than you: its facade, and towers and domes up on the roof. At street level the layout walls keep doing the job,
   // so porches and doorways stay open.
   if(feet>ground(x,z)+.6)for(const F of fields)for(const [dx,dz] of [[0,0],[m,0],[-m,0],[0,m],[0,-m]]){const h=fieldH(F,x+dx,z+dz);if(h!=null&&h>feet+STEP)return {field:F,top:h};}
   return null;}
  // Outward face normal of box b seen from point p (axis-aligned).
  function faceNormal(b,p){const dx=p.x<b.minX?b.minX-p.x:p.x>b.maxX?p.x-b.maxX:0,dz=p.z<b.minZ?b.minZ-p.z:p.z>b.maxZ?p.z-b.maxZ:0;
   if(dx>=dz)return new T.Vector3(p.x<(b.minX+b.maxX)/2?-1:1,0,0);return new T.Vector3(0,0,p.z<(b.minZ+b.maxZ)/2?-1:1);}
  // Where a horizontal ray from p along dir first enters box b (t along dir), or null.
  function entry(b,p,dir){let t0=0,t1=Infinity;for(const [o,d,mn,mx] of [[p.x,dir.x,b.minX,b.maxX],[p.z,dir.z,b.minZ,b.maxZ]]){if(Math.abs(d)<1e-6){if(o<=mn||o>=mx)return null;continue;}let a=(mn-o)/d,c=(mx-o)/d;if(a>c)[a,c]=[c,a];t0=Math.max(t0,a);t1=Math.min(t1,c);if(t0>t1)return null;}return t0;}
  // A ledge ahead: the lowest box top between feet+minUp and feet+maxUp within `far` metres along dir, with room to
  // stand on it. Returns the grab point on its edge, the face normal, the top and a standing spot.
  function ledgeAhead(p,feet,dir,minUp,maxUp,far=1.1){
   refresh();let best=null;
   for(const b of boxes){if(b.top<feet+minUp||b.top>feet+maxUp)continue;const t=entry(b,p,dir);if(t==null||t>far)continue;
    const edge=p.clone().addScaledVector(dir,t);edge.y=b.top;const n=faceNormal(b,p.clone().addScaledVector(dir,t-.02));
    const stand=edge.clone().addScaledVector(n,-.45);if(!inside(b,stand.x,stand.z))continue;
    if(floorAt(stand.x,stand.z,b.top+.05)<b.top-.05)continue;if(solid(stand.x,stand.z,b.top,b.top+1.8,.1))continue;
    if(!best||b.top<best.top)best={box:b,point:edge,normal:n,top:b.top,stand,t};}
   // The measured rooftops: march along dir for a step up into reach (a roof edge, a ledge on the facade).
   for(const F of fields){let prev=fieldH(F,p.x,p.z)??-1;for(let k=.15;k<=far+.01;k+=.15){const q=p.clone().addScaledVector(dir,k),h=fieldH(F,q.x,q.z);if(h==null){prev=-1;continue;}
     if(h>=feet+minUp&&h<=feet+maxUp&&h-Math.max(prev,feet)>.3){const st=q.clone().addScaledVector(dir,.4),hs=fieldH(F,st.x,st.z);if(hs==null||Math.abs(hs-h)>.35)break;
      const point=p.clone().addScaledVector(dir,k-.08);point.y=h;const n=snap(dir).negate();const stand=st.clone();stand.y=h;
      if(!best||h<best.top)best={box:{field:F,top:h},point,normal:n,top:h,stand,t:k};break;}
     if(h>feet+maxUp)break;prev=h;}}
   return best;
  }
  // A tall wall beside you (side: 1 right, -1 left of `right`).
  function wallBeside(p,feet,right,side){refresh();const q=p.clone().addScaledVector(right,side*.62);
   for(const b of boxes)if(b.wall&&inside(b,q.x,q.z)&&b.top>feet+2&&b.bottom<=feet+.3){const n=faceNormal(b,p);if(Math.abs(n.dot(right))>.7)return {box:b,normal:n};}
   for(const F of fields){const h=fieldH(F,q.x,q.z),here=fieldH(F,p.x,p.z);if(h!=null&&h>feet+2&&(here==null||here<feet+.6))return {box:{field:F,top:h,wall:true},normal:snap(right.clone().multiplyScalar(-side))};}return null;}
  function wallAhead(p,feet,dir){refresh();const q=p.clone().addScaledVector(dir,.6);for(const b of boxes)if(inside(b,q.x,q.z)&&b.top>feet+STEP&&b.bottom<=feet+1){const n=faceNormal(b,p);if(n.dot(dir)<-.6)return {box:b,normal:n,top:b.top};}
   for(const F of fields){const h=fieldH(F,q.x,q.z),here=fieldH(F,p.x,p.z);if(h!=null&&h>feet+STEP&&(here==null||here<feet+.6))return {box:{field:F,top:h},normal:snap(dir).negate(),top:h};}return null;}

  /* ---------------------------------------------------------------- helpers */
  const feetOf=()=>P.pos.y-EYE,hangFeet=top=>top-HANG_EYE-EYE;
  const flat=v=>{const d=v.clone();d.y=0;return d.lengthSq()>1e-6?d.normalize():d;};
  function view(){const f=flat(P.aim.clone().sub(P.pos));return {f,r:new T.Vector3().crossVectors(f,up)};}
  function wish(){const {f,r}=view(),k=P.keys,z=(k.has('w')||k.has('arrowup')?1:0)-(k.has('s')||k.has('arrowdown')?1:0),x=(k.has('d')||k.has('arrowright')?1:0)-(k.has('a')||k.has('arrowleft')?1:0);return {z,x,dir:f.clone().multiplyScalar(z).addScaledVector(r,x)};}
  // Move the player (and the look target with them) to a feet position.
  function place(x,feet,z){const d=new T.Vector3(x,feet+EYE,z).sub(P.pos);P.pos.add(d);P.aim.add(d);}
  // Leave a state into free motion: falling from where you are with this velocity.
  function release(vel=null,vy=0){const f=feetOf(),fl=floorAt(P.pos.x,P.pos.z,f+STEP);P.motion.set(Math.max(0,f-fl),vy);if(f<fl)place(P.pos.x,fl,P.pos.z);if(vel)P.vel.copy(vel);state=null;}
  function stand(){P.motion.reset();state=null;}

  /* ---------------------------------------------------------------- moves */
  function startHang(ledge,from='grab'){
   const n=ledge.normal,tan=new T.Vector3(n.z,0,-n.x);state={kind:'hang',ledge:{...ledge,tangent:tan},t:0,from};
   P.motion.reset();P.vel.set(0,0,0);place(ledge.point.x+n.x*.38,hangFeet(ledge.top),ledge.point.z+n.z*.38);
   stats.hangs++;P.sway.bump(.45,0);P.footsteps?.land('stone',.35);P.requestDraw();
  }
  function startClimb(ledge,quick){
   state={kind:'climb',t:0,dur:quick?.38:.72,from:P.pos.clone().setY(feetOf()),ledge,quick};P.motion.reset();P.vel.set(0,0,0);stats.climbs++;P.footsteps?.land('stone',.3);P.requestDraw();
  }
  function startWarp(to,{dur,arc,then,ledge=null}){state={kind:'warp',t:0,dur,arc,from:P.pos.clone().setY(feetOf()),to:to.clone(),then,ledge};P.motion.reset();stats.leaps++;P.sway.bump(.35,0);P.requestDraw();}

  // Jump pressed. Returns true if parkour took it.
  function onJump(){
   const f=feetOf(),w=wish(),{f:fwd}=view(),air=P.motion.inspect().airborne;
   if(state?.kind==='hang'){hangJump(w);return true;}
   if(state?.kind==='wallrun'){const s=state;const v=s.tangent.clone().multiplyScalar(s.speed*.9).addScaledVector(s.normal,4.6);state=null;release(v,5.2);cool.wallrun=clock+.35;P.sway.bump(.5,s.side);P.footsteps?.step(P.surface(),7);return true;}
   if(state)return true;if(air)return false;
   const dir=w.dir.lengthSq()>.01?w.dir.clone().normalize():fwd;
   // A wall right in front: climb onto it if the top is in reach, else run up it.
   const wall=wallAhead(P.pos,f,dir);
   if(wall&&w.z>0){const ledge=ledgeAhead(P.pos,f,dir,STEP,REACH+.2,.9);if(ledge){startClimb(ledge,ledge.top-f<=MANTLE);return true;}
    if(wall.top>f+REACH){state={kind:'scramble',t:0,vy:5.2,normal:wall.normal};P.motion.reset();stats.scrambles++;P.footsteps?.step(P.surface(),6);return true;}}
   // Jump prediction: across a gap to a roof or a ledge, guide the jump onto it.
   const speed=Math.hypot(P.vel.x,P.vel.z);
   if(speed>2.5&&w.z>0){const mid=P.pos.clone().addScaledVector(dir,1.3);if(floorAt(mid.x,mid.z,f+STEP)<f-.6){
    for(let d=2;d<=6.5;d+=.5){const q=P.pos.clone().addScaledVector(dir,d);let best=null;refresh();
     for(const b of boxes)if(inside(b,q.x,q.z,-.15)&&b.top>=f-4&&b.top<=f+REACH&&(!best||b.top>best.top))best=b;
     if(!best||solid(q.x,q.z,best.top,best.top+1.8,.05))continue;
     if(best.top<=f+1){startWarp(new T.Vector3(q.x,best.top,q.z),{dur:.32+d*.06,arc:Math.max(.9,best.top-f+.9),then:'land'});return true;}
     const ledge=ledgeAhead(P.pos,f,dir,1,REACH+.4,d+.5);if(ledge){startWarp(new T.Vector3(ledge.point.x+ledge.normal.x*.38,hangFeet(ledge.top),ledge.point.z+ledge.normal.z*.38),{dur:.32+d*.06,arc:.7,then:'hang',ledge});return true;}
     break;}}}
   return false;
  }
  function hangJump(w){
   const L=state.ledge;
   if(w.x){// leap sideways to a ledge along the wall (or another wall at a similar height)
    const s=Math.sign(w.x)*(L.tangent.dot(view().r)>0?1:-1),dir=L.tangent.clone().multiplyScalar(s);
    for(let d=1;d<=3.6;d+=.2){const q=L.point.clone().addScaledVector(dir,d).addScaledVector(L.normal,-.12);refresh();
     for(const b of boxes)if(b!==L.box&&inside(b,q.x,q.z)&&Math.abs(b.top-L.top)<1.6){
      const pt=new T.Vector3(q.x,b.top,q.z).addScaledVector(L.normal,.12);const ledge={box:b,point:pt,normal:L.normal.clone(),top:b.top,stand:pt.clone().addScaledVector(L.normal,-.45)};
      startWarp(new T.Vector3(pt.x+L.normal.x*.38,hangFeet(b.top),pt.z+L.normal.z*.38),{dur:.42,arc:.5,then:'hang',ledge});return;}}
    P.sway.bump(.2,s);return;}
   if(w.z<0){// kick off backwards, onto a ledge or roof behind you if there is one
    const back=L.normal.clone(),f=feetOf(),ledge=ledgeAhead(P.pos,f,back,-1,1.8,5);
    if(ledge){startWarp(new T.Vector3(ledge.point.x+ledge.normal.x*.38,hangFeet(ledge.top),ledge.point.z+ledge.normal.z*.38),{dur:.55,arc:1,then:'hang',ledge});return;}
    state=null;release(back.multiplyScalar(4.6),4.2);return;}
   tryClimb();
  }
  function tryClimb(){const L=state.ledge;if(solid(L.stand.x,L.stand.z,L.top,L.top+1.75,.05)){P.sway.bump(.15,0);return;}startClimb(L,false);}

  // Every frame in the air (outside a state): grab ledges, start wall-runs.
  function air(dt){
   if(state)return;const f=feetOf(),w=wish(),v=P.vel,speed=Math.hypot(v.x,v.z),mv=P.motion.inspect();
   const dir=speed>.8?flat(v):view().f;
   // Grab: moving into a ledge that the hands can reach.
   if(clock>cool.grab&&(w.z>0||speed>2)){const ledge=ledgeAhead(P.pos,f,dir,.25,REACH,.55);
    if(ledge&&!(ledge.top-f<MANTLE&&mv.velocity>2)){stats.grabs++;cool.grab=clock+.4;if(ledge.top-f<=MANTLE||w.z>0)startClimb(ledge,ledge.top-f<=MANTLE);else startHang(ledge);return;}}
   // Wall-run: holding forward at speed with a tall wall beside you, running roughly along it.
   if(clock>cool.wallrun&&w.z>0&&speed>4.2){const {r}=view();for(const side of [1,-1]){const wall=wallBeside(P.pos,f,r,side);if(!wall)continue;
    const tan=new T.Vector3(wall.normal.z,0,-wall.normal.x);if(tan.dot(v)<0)tan.negate();if(tan.dot(flat(v))<.6)continue;
    state={kind:'wallrun',t:0,normal:wall.normal,tangent:tan,speed:Math.max(speed,6.2),vy:Math.max(1.6,mv.velocity*.5+1.6),side,box:wall.box,step:0};P.motion.reset();stats.wallruns++;P.sway.bump(.3,side);P.footsteps?.step(P.surface(),7);return;}}
  }
  // Walk off an edge with C held: catch it and hang.
  function dropToHang(from,to,feet){
   refresh();const b=boxes.find(b=>Math.abs(b.top-feet)<.12&&inside(b,from.x,from.z,.1));
   if(!b){for(const F of fields){const h=fieldH(F,from.x,from.z);if(h==null||Math.abs(h-feet)>.15)continue;const dir=flat(to.clone().sub(from));let k=0;while(k<1.2&&Math.abs((fieldH(F,from.x+dir.x*k,from.z+dir.z*k)??-9)-h)<.3)k+=.1;
     const pt=new T.Vector3(from.x+dir.x*(k-.05),h,from.z+dir.z*(k-.05)),n=snap(dir);if(floorAt(pt.x+n.x*.6,pt.z+n.z*.6,h-1)>h-2.3)return false;
     stats.drops++;startHang({box:{field:F,top:h},point:pt,normal:n,top:h,stand:pt.clone().addScaledVector(n,-.45)},'drop');
     const face=n.clone().negate(),d=P.aim.clone().sub(P.pos);const pitch=Math.atan2(d.y,Math.hypot(d.x,d.z));P.aim.copy(P.pos).add(new T.Vector3(face.x*Math.cos(pitch),Math.sin(pitch),face.z*Math.cos(pitch)).multiplyScalar(5));return true;}
    return false;}
   const pt=new T.Vector3(clamp(to.x,b.minX,b.maxX),b.top,clamp(to.z,b.minZ,b.maxZ)),n=faceNormal(b,to);
   if(floorAt(pt.x+n.x*.6,pt.z+n.z*.6,b.top-1)>b.top-2.3)return false; // too low to bother hanging
   stats.drops++;startHang({box:b,point:pt,normal:n,top:b.top,stand:pt.clone().addScaledVector(n,-.45)},'drop');
   // Turn to face the wall.
   const face=n.clone().negate(),d=P.aim.clone().sub(P.pos);const pitch=Math.atan2(d.y,Math.hypot(d.x,d.z));P.aim.copy(P.pos).add(new T.Vector3(face.x*Math.cos(pitch),Math.sin(pitch),face.z*Math.cos(pitch)).multiplyScalar(5));
   return true;
  }
  // Landing from a fall of `height` metres.
  function land(height,speed){
   if(height<2.2)return null;
   if(clock-crouchAt<.38){stats.rolls++;P.sway.bump(.6,Math.random()<.5?-1:1);P.footsteps?.land(P.surface(),.6);return {kind:'roll'};}
   stats.hard++;P.sway.bump(Math.min(1.6,.6+height*.15),0);P.footsteps?.land(P.surface(),1);P.vel.multiplyScalar(.25);
   if(height>5.5)P.onFall?.(Math.round((height-5.5)*10));return {kind:'hard',stun:Math.min(.7,.2+height*.06)};
  }

  /* ---------------------------------------------------------------- state update */
  function update(dt){
   clock+=dt;
   lean+=((state?.kind==='wallrun'?-state.side*.17:0)-lean)*(1-Math.exp(-10*dt));
   fov+=((state?.kind==='wallrun'?7:state?.kind==='warp'?5:0)-fov)*(1-Math.exp(-8*dt));
   if(!state)return false;const s=state;s.t+=dt;
   if(s.kind==='wallrun'){
    s.vy-=5.5*dt;const f=feetOf()+s.vy*dt,nx=P.pos.x+s.tangent.x*s.speed*dt,nz=P.pos.z+s.tangent.z*s.speed*dt;
    const {r}=view(),wall=wallBeside(new T.Vector3(nx,P.pos.y,nz),f,r,s.side),fl=floorAt(nx,nz,f+STEP);
    if(solid(nx,nz,f,f+1.7,.2)&&!wall){release(s.tangent.clone().multiplyScalar(s.speed*.5),s.vy);return true;}
    place(nx,Math.max(f,fl),nz);
    s.step+=dt;if(s.step>.2){s.step=0;P.footsteps?.step('stone',7);}
    if(fl>=f-.02){stand();P.vel.copy(s.tangent).multiplyScalar(s.speed*.8);return true;}
    if(!wall||s.t>1.25||P.keys.has('s')){release(s.tangent.clone().multiplyScalar(s.speed),s.vy);cool.wallrun=clock+.3;}
    P.requestDraw();return true;
   }
   if(s.kind==='scramble'){
    s.vy-=7*dt;const f=feetOf()+s.vy*dt;place(P.pos.x,f,P.pos.z);
    const ledge=ledgeAhead(P.pos,f,s.normal.clone().negate(),.25,REACH,.8);
    if(ledge){startClimb(ledge,ledge.top-f<=MANTLE);return true;}
    if(s.vy<.6||s.t>.7){release(s.normal.clone().multiplyScalar(2.2),s.vy);cool.grab=clock+.25;}
    P.requestDraw();return true;
   }
   if(s.kind==='climb'){
    const k=Math.min(1,s.t/s.dur),L=s.ledge,a=s.from,e=smooth(k);
    // Up the face first (hands on the edge), then over onto the top.
    const upK=smooth(Math.min(1,k/.6)),overK=smooth(clamp((k-.45)/.55,0,1));
    const wallX=L.point.x+L.normal.x*.3,wallZ=L.point.z+L.normal.z*.3;
    const x=a.x+(wallX-a.x)*Math.min(1,upK*1.3)+(L.stand.x-wallX)*overK,z=a.z+(wallZ-a.z)*Math.min(1,upK*1.3)+(L.stand.z-wallZ)*overK;
    const feet=a.y+(L.top-a.y)*Math.min(1,upK*1.08);place(x,feet-(1-overK)*.5*(1-e*.2),z);
    if(k>=1){place(L.stand.x,L.top,L.stand.z);stand();P.vel.copy(L.normal).multiplyScalar(-1.4);P.footsteps?.step(P.surface(),3);}
    P.requestDraw();return true;
   }
   if(s.kind==='hang'){
    const L=s.ledge,w=wish();
    // Let go: S, or a fresh press of C (holding C from walking off the edge does not drop you).
    if(!P.crouchHeld())s.cReady=true;
    if(w.z<0&&P.keys.has('s')&&s.t>.25||P.crouchHeld()&&s.cReady&&s.t>.25){cool.grab=clock+.5;release(L.normal.clone().multiplyScalar(.6),0);return true;}
    // Climb on a fresh press of W (so holding W while dropping onto a ledge does not climb straight back up).
    if(!P.keys.has('w'))s.wReady=true;
    if(w.z>0&&s.t>.3&&P.keys.has('w')&&s.wReady){tryClimb();return true;}
    // Shimmy along the edge, as long as there is edge.
    if(w.x){const s2=Math.sign(w.x)*(L.tangent.dot(view().r)>0?1:-1),np=L.point.clone().addScaledVector(L.tangent,s2*1.5*dt),q=np.clone().addScaledVector(L.normal,-.1);
     if((L.box.field?Math.abs((fieldH(L.box.field,q.x,q.z)??-9)-L.top)<.4:inside(L.box,q.x,q.z))||boxes.some(b=>Math.abs(b.top-L.top)<.15&&inside(b,q.x,q.z))){L.point.copy(np);L.stand.addScaledVector(L.tangent,s2*1.5*dt);place(np.x+L.normal.x*.38,hangFeet(L.top),np.z+L.normal.z*.38);s.shimmy=(s.shimmy||0)+dt;if(s.shimmy>.4){s.shimmy=0;P.footsteps?.step('stone',2);}}}
    P.requestDraw();return true;
   }
   if(s.kind==='warp'){
    const k=Math.min(1,s.t/s.dur),e=smooth(k),p=s.from.clone().lerp(s.to,e);p.y+=Math.sin(k*Math.PI)*s.arc;place(p.x,p.y,p.z);
    if(k>=1){if(s.then==='hang'&&s.ledge)startHang(s.ledge,'leap');else{stand();const d=flat(s.to.clone().sub(s.from));P.vel.copy(d).multiplyScalar(4);P.footsteps?.land(P.surface(),.5);}}
    P.requestDraw();return true;
   }
   return false;
  }
  // The hands on the ledge (third-person body), or null.
  function hands(){const s=state;if(!s)return null;const L=s.ledge;if(s.kind==='hang'||s.kind==='climb'&&s.t/s.dur<.6){return [L.point.clone().addScaledVector(L.tangent||new T.Vector3(L.normal.z,0,-L.normal.x),.24),L.point.clone().addScaledVector(L.tangent||new T.Vector3(L.normal.z,0,-L.normal.x),-.24)];}return null;}

  return {wallBeside,wallAhead,floorAt,solid,ledgeAhead,update,onJump,air,land,dropToHang,hands,
   crouchPressed(){crouchAt=clock;},active:()=>!!state,kind:()=>state?.kind||null,lean:()=>lean,fov:()=>fov,
   reset(){state=null;},inspect:()=>({state:state?.kind||null,boxes:boxes.length,fields:fields.length,stats:{...stats}})};
 };
})(window);
