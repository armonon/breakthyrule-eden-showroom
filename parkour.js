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
 root.createParkour=function({T,walls,surfaces,ground,player,revision=()=>null}){
  const P=player,up=new T.Vector3(0,1,0);
  let lastUpdateTick=null;
  const codec=()=>root.createMovementStateCodec({T,boxes:()=>{refresh();return boxes;},fields:()=>{refresh();return fields;}});
  // Momentum from player-movement.js (0..1) and the wall-jump chain since the last landing.
  let mom=0,chain=0,bonus=0,dropAt=null;const CHAIN_MAX=6;
  let boxes=[],fields=[],sig='',state=null,cool={wallrun:0,grab:0,walljump:0,grip:0,auto:0},crouchAt=-9,clock=0,lean=0,fov=0,lift=0,stats={wallruns:0,scrambles:0,grabs:0,climbs:0,hangs:0,leaps:0,drops:0,rolls:0,hard:0,walljumps:0,grips:0,auto:0};

  const profile=()=>P.bodyDimensions?.()||root.playerBodyProfile?.(root.GardenPlayerCharacter)||{height:1.75,radius:.26,crouch:1.19};
  const clearance=root.createBodyClearance?.({boxes:()=>{refresh();return boxes;},fields:()=>{refresh();return fields;}});
  const bodyFits=(p,height=profile().height,radius=profile().radius)=>clearance?clearance.fits(p,height,radius):!solid(p.x,p.z,p.y,p.y+height,radius);
  const bodySweep=(a,b,height=profile().height,radius=profile().radius)=>clearance?clearance.fraction(a,b,height,radius):(bodyFits(b,height,radius)?1:0);
  const raycast=(o,d,n)=>clearance?.ray(o,d,n)||null;
  /* ---------------------------------------------------------------- world */
  let cells=new Map();const NONE=[];
  const boxesAt=(x,z,m)=>m>1?boxes:cells.get(Math.floor(x/4)*65536+Math.floor(z/4))||NONE;
  function refresh(){
   const w=walls()||[],s=surfaces()||[],gb=root.parkourGrips?.boxes||[],k=String(revision()??'legacy')+':'+w.length+':'+s.length+(gb.length?':g'+gb.length:'');if(k===sig)return;sig=k;
   boxes=w.map(([x,z,bw,bd,h=99])=>({minX:x-bw/2,maxX:x+bw/2,minZ:z-bd/2,maxZ:z+bd/2,top:h,bottom:-1,wall:true}))
    .concat(s.filter(b=>!b.field).map(b=>({...b})),gb.map(b=>({...b})));
   // Measured rooftops of the building models (assets/roof-heights.js): 1 m height maps.
   fields=s.filter(b=>b.field).map(b=>({...b.field,foot:b.foot||null}));
   // A 4 m grid of the boxes (each listed 1 m beyond its edges), in their original order, for queries at a point.
   cells=new Map();for(const b of boxes){const x0=Math.floor((b.minX-1)/4),x1=Math.floor((b.maxX+1)/4),z0=Math.floor((b.minZ-1)/4),z1=Math.floor((b.maxZ+1)/4);
    for(let cx=x0;cx<=x1;cx++)for(let cz=z0;cz<=z1;cz++){const k=cx*65536+cz,list=cells.get(k);if(list)list.push(b);else cells.set(k,[b]);}}
  }
  function fieldH(F,x,z){const c=Math.floor((x-F.minX)/F.cell),r=Math.floor((z-F.minZ)/F.cell);if(c<0||r<0||c>=F.cols||r>=F.rows)return null;return F.h[r*F.cols+c];}
  const snap=d=>Math.abs(d.x)>Math.abs(d.z)?new T.Vector3(Math.sign(d.x),0,0):new T.Vector3(0,0,Math.sign(d.z));
  const inside=(b,x,z,m=0)=>x>b.minX-m&&x<b.maxX+m&&z>b.minZ-m&&z<b.maxZ+m;
  // Highest walkable top under (x, z) no higher than maxTop (the terrain counts too).
  function floorAt(x,z,maxTop=Infinity,m=.08){refresh();let f=ground(x,z);for(const b of boxesAt(x,z,m))if(b.top<=maxTop+1e-4&&b.top>f&&inside(b,x,z,m))f=b.top;
   for(const F of fields){const h=fieldH(F,x,z);if(h!=null&&h>0&&h<=maxTop+1e-4&&h>f)f=h;}return f;}
  function supportAt(x,z,maxTop=Infinity,radius=profile().radius){let h=floorAt(x,z,maxTop);for(const dx of [-radius,0,radius])for(const dz of [-radius,0,radius])h=Math.max(h,floorAt(x+dx,z+dz,maxTop));return h;}
  // Is there something solid at (x, z) between feet and head (anything taller than a step)?
  function solid(x,z,feet,head,m=.25){refresh();for(const b of boxesAt(x,z,m))if(inside(b,x,z,m)&&b.top>feet+STEP&&b.bottom<head)return b;
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
   for(const b of boxes){if(inside(b,p.x,p.z)||b.top<feet+minUp||b.top>feet+maxUp)continue;const t=entry(b,p,dir);if(t==null||t>far)continue;
    const edge=p.clone().addScaledVector(dir,t);edge.y=b.top;const n=faceNormal(b,p.clone().addScaledVector(dir,t-.02));
    const stand=edge.clone().addScaledVector(n,-.45);if(!inside(b,stand.x,stand.z))continue;
    if(floorAt(stand.x,stand.z,b.top+.05)<b.top-.05)continue;if(!bodyFits(stand))continue;
    if(!best||b.top<best.top)best={box:b,point:edge,normal:n,top:b.top,stand,t};}
   // The measured rooftops: march along dir for a step up into reach (a roof edge, a ledge on the facade).
   for(const F of fields){let prev=fieldH(F,p.x,p.z)??-1;for(let k=.15;k<=far+.01;k+=.15){const q=p.clone().addScaledVector(dir,k),h=fieldH(F,q.x,q.z);if(h==null){prev=-1;continue;}
     if(h>=feet+minUp&&h<=feet+maxUp&&h-Math.max(prev,feet)>.3){const st=q.clone().addScaledVector(dir,.4),hs=fieldH(F,st.x,st.z);if(hs==null||Math.abs(hs-h)>.35)break;
      const point=p.clone().addScaledVector(dir,k-.08);point.y=h;const n=snap(dir).negate();const stand=st.clone();stand.y=h;if(!bodyFits(stand))break;
      if(!best||h<best.top)best={box:{field:F,top:h},point,normal:n,top:h,stand,t:k};break;}
     if(h>feet+maxUp)break;prev=h;}}
   return best;
  }
  // A tall wall beside you (side: 1 right, -1 left of `right`).
  function wallBeside(p,feet,right,side){refresh();const q=p.clone().addScaledVector(right,side*.62);
   for(const b of boxes)if(b.wall&&inside(b,q.x,q.z)&&b.top>feet+2&&b.bottom<=feet+.3){const n=faceNormal(b,p);if(Math.abs(n.dot(right))>.7)return {box:b,normal:n};}
   for(const F of fields){const h=fieldH(F,q.x,q.z),here=fieldH(F,p.x,p.z);if(h!=null&&h>feet+2&&(here==null||here<feet+.6))return {box:{field:F,top:h,wall:true},normal:snap(right.clone().multiplyScalar(-side))};}return null;}
  // How far the player stands from the face of the wall they run along (null for terrain walls with no face).
  function wallGap(s){const b=s.box,n=s.normal;if(!b||b.field||!n||b.minX===undefined)return null;
   const d=n.x>.5?P.pos.x-b.maxX:n.x<-.5?b.minX-P.pos.x:n.z>.5?P.pos.z-b.maxZ:n.z<-.5?b.minZ-P.pos.z:null;return d===null?null:Math.max(0,d);}
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
  function stand(){P.motion.reset();state=null;chain=0;}
  function safePlace(x,y,z){const from={x:P.pos.x,y:feetOf(),z:P.pos.z},to={x,y,z};
   if(bodySweep(from,to)<1){release(P.vel.clone().multiplyScalar(.5),0);cool.grab=clock+.35;return false;}
   place(x,y,z);return true;
  }

  /* ---------------------------------------------------------------- moves */
  function startHang(ledge,from='grab'){
   dropAt=null;
   const n=ledge.normal,tan=new T.Vector3(n.z,0,-n.x);state={kind:'hang',ledge:{...ledge,tangent:tan},t:0,from};
   P.motion.reset();P.vel.set(0,0,0);place(ledge.point.x+n.x*.38,hangFeet(ledge.top),ledge.point.z+n.z*.38);
   stats.hangs++;P.sway.bump(.45,0);P.footsteps?.land('stone',.35);P.requestDraw();
  }
  function startClimb(ledge,quick){
   const style=state?.kind==='pipe'?'ladderExit':null;dropAt=null;
   state={kind:'climb',t:0,dur:style?1.1:quick?.38:.72,from:P.pos.clone().setY(feetOf()),ledge,quick,style,entry:Math.hypot(P.vel.x,P.vel.z)};P.motion.reset();P.vel.set(0,0,0);stats.climbs++;P.footsteps?.land('stone',.3);P.requestDraw();
  }
  function startWarp(to,{dur,arc,then,ledge=null,action='leap'}){dropAt=null;state={kind:'warp',t:0,dur,arc,from:P.pos.clone().setY(feetOf()),to:to.clone(),then,ledge,action,entry:Math.hypot(P.vel.x,P.vel.z)};P.motion.reset();stats.leaps++;P.sway.bump(.35,0);P.requestDraw();}

  // Jump pressed. Returns true if parkour took it.
  function onJump({late=false}={}){
   const f=feetOf(),w=wish(),{f:fwd}=view(),air=P.motion.inspect().airborne&&!late;
   if(state&&['bar','pipe','rope'].includes(state.kind)){if(state.t>.12)gripJump();return true;}
   if(state?.kind==='hang'){hangJump(w);return true;}
   if(state?.kind==='wallrun'){if(chain>=CHAIN_MAX)return true;const s=state;const v=s.tangent.clone().multiplyScalar(s.speed*.9).addScaledVector(s.normal,4.8+1.2*mom);state=null;release(v,(6.3+1.6*mom)*Math.pow(.94,chain));chain++;bonus+=.06;stats.walljumps++;cool.wallrun=clock+.2;cool.walljump=clock+.15;P.sway.bump(.5,s.side);P.footsteps?.step(P.surface(),7);return true;}
   if(state)return true;if(air)return wallKick(f,w,fwd);
   {const hit=findGrip(true);if(hit){startGrip(hit);return true;}}
   const dir=w.dir.lengthSq()>.01?w.dir.clone().normalize():fwd;
   // A wall right in front: climb onto it if the top is in reach, else run up it.
   const wall=wallAhead(P.pos,f,dir);
   if(wall&&w.z>0){const ledge=ledgeAhead(P.pos,f,dir,STEP,REACH+.2,.9);if(ledge){startClimb(ledge,ledge.top-f<=MANTLE);return true;}
    if(wall.top>f+REACH){state={kind:'scramble',t:0,vy:5.2+2.4*mom,normal:wall.normal};P.motion.reset();stats.scrambles++;P.footsteps?.step(P.surface(),6);return true;}}
   // Jump prediction: across a gap to a roof or a ledge, guide the jump onto it.
   const speed=Math.hypot(P.vel.x,P.vel.z);
   if(speed>2.5&&w.z>0){const mid=P.pos.clone().addScaledVector(dir,1.3);if(floorAt(mid.x,mid.z,f+STEP)<f-.6){
    for(let d=2;d<=6.5;d+=.5){const q=P.pos.clone().addScaledVector(dir,d);let best=null;refresh();
     for(const b of boxes)if(inside(b,q.x,q.z,-.15)&&b.top>=f-4&&b.top<=f+REACH&&(!best||b.top>best.top))best=b;
     if(!best||!bodyFits({x:q.x,y:best.top,z:q.z}))continue;
     if(best.top<=f+1){startWarp(new T.Vector3(q.x,best.top,q.z),{dur:.32+d*.06,arc:Math.max(.9,best.top-f+.9),then:'land'});return true;}
     const ledge=ledgeAhead(P.pos,f,dir,1,REACH+.4,d+.5);if(ledge){startWarp(new T.Vector3(ledge.point.x+ledge.normal.x*.38,hangFeet(ledge.top),ledge.point.z+ledge.normal.z*.38),{dur:.32+d*.06,arc:.7,then:'hang',ledge});return true;}
     break;}}}
   return false;
  }
  /* ---------------------------------------------------------------- free running (one button, AC-style) */
  function autoRun(){
   const w=wish();if(w.z<=0)return false;const speed=Math.hypot(P.vel.x,P.vel.z);if(speed<2.2)return false;
   const f=feetOf(),dir=w.dir.lengthSq()>.01?w.dir.clone().normalize():view().f,go=k=>{cool.auto=clock+k;stats.auto++;return true;};
   // Something to get over in front, or a drop to leap across: the same moves as pressing jump.
   const wall=wallAhead(P.pos,f,dir),mid=P.pos.clone().addScaledVector(dir,.9);
   if((wall&&wall.top>f+STEP+.05||floorAt(mid.x,mid.z,f+STEP)<f-.6)&&onJump())return go(.4);
   // A tall wall alongside at a run: hop onto it, and air() takes it into a wall-run.
   if(speed>4.2&&clock>cool.wallrun){const {r}=view();for(const side of [1,-1]){const wb=wallBeside(P.pos,f,r,side);if(!wb)continue;
    const tan=new T.Vector3(wb.normal.z,0,-wb.normal.x);if(Math.abs(tan.dot(flat(P.vel)))>.6){P.motion.set(.02,4.2);return go(.6);}}}
   return false;
  }
  /* ---------------------------------------------------------------- bars, pipes, ropes (parkour-grips.js) */
  const BAR_EYE=.42,GRIP_REACH=.62,V=a=>new T.Vector3(a[0],a[1],a[2]),gripOf=id=>root.parkourGrips?.grips?.[id]||null;
  function findGrip(onlyPipes=false){const list=root.parkourGrips?.grips;if(!list)return null;const h=new T.Vector3(P.pos.x,P.pos.y+.4,P.pos.z),f=feetOf();let best=null,bd=1e9;
   for(const g of list){
    if(g.type==='bar'&&!onlyPipes){const a=V(g.a),ab=V(g.b).sub(a),t=clamp(h.clone().sub(a).dot(ab)/ab.lengthSq(),.06,.94),pt=a.clone().addScaledVector(ab,t),d=pt.distanceTo(h);if(d<GRIP_REACH&&h.y>pt.y-.35&&d<bd){bd=d;best={g,t};}}
    else if(g.type==='pipe'){const d=Math.hypot(P.pos.x-g.x,P.pos.z-g.z);if(d<.75&&f<g.y1-1.05&&d<bd){bd=d;best={g,y:clamp(f,g.y0-.2,g.y1-1.05)};}}
    else if(g.type==='rope'&&!onlyPipes){const d=Math.hypot(P.pos.x-g.x,P.pos.z-g.z);if(d<.7&&h.y>g.top-g.len+.2&&h.y<g.top-.4&&d<bd){bd=d;best={g,s:clamp(g.top-h.y,.5,g.len-.1)};}}
   }
   return best;}
  function startGrip(hit){
   const g=hit.g,v=P.vel.clone().setY(0),groundEntry=!P.motion.inspect().airborne;dropAt=null;P.motion.reset();stats.grips++;P.sway.bump(.35,0);P.footsteps?.land('stone',.3);
   if(g.type==='bar'){const ab=V(g.b).sub(V(g.a)).setY(0).normalize(),n=new T.Vector3(ab.z,0,-ab.x);if(v.dot(n)<0)n.negate();state={kind:'bar',id:g.id,t:0,u:hit.t,n,ang:0,av:clamp(v.dot(n)/1.5,0,3.2)*(1+.25*mom),cReady:false};}
   else if(g.type==='pipe'){state={kind:'pipe',id:g.id,t:0,y:hit.y,n:new T.Vector3(g.n[0],0,g.n[1]),step:0,cReady:false,groundEntry};P.vel.set(0,0,0);}
   else{const L=hit.s+.9;state={kind:'rope',id:g.id,t:0,s:hit.s,qx:0,qz:0,wx:clamp(v.x/L,-2.5,2.5),wz:clamp(v.z/L,-2.5,2.5),cReady:false};}
   P.vel.set(0,0,0);P.requestDraw();
  }
  function gripJump(){
   const s=state,g=gripOf(s.id),{f,r}=view(),w=wish(),k=1+.25*mom;let vel,vy;
   if(s.kind==='bar'){const L=1.5,tv=s.av*L;vel=s.n.clone().multiplyScalar(Math.cos(s.ang)*tv).addScaledVector(f,1.6);vy=Math.sin(s.ang)*tv+3.6;}
   else if(s.kind==='pipe'){vel=s.n.clone().multiplyScalar(4.2+1.2*mom).addScaledVector(r,w.x*2);vy=5.4+1.2*mom;}
   else{const L=s.s+.9;vel=new T.Vector3(s.wx*L,0,s.wz*L).addScaledVector(f,1.8);vy=4.6+Math.max(0,new T.Vector3(s.wx,0,s.wz).dot(f))*1.2;}
   vel.multiplyScalar(k);vy=Math.min(vy*k,7.5+1.5*mom);if(vel.length()>8+2*mom)vel.setLength(8+2*mom);state=null;release(vel,vy);chain=Math.min(CHAIN_MAX,chain+1);bonus+=.04;cool.grip=clock+.22;cool.grab=clock+.15;P.sway.bump(.45,0);P.footsteps?.step(P.surface(),6);P.requestDraw();
  }
  function letGo(){const s=state;state=null;release(s.kind==='pipe'?s.n.clone().multiplyScalar(.8):new T.Vector3(),0);cool.grip=clock+.5;}
  function updateGrip(dt){
   const s=state,g=gripOf(s.id);if(!g){release(null,0);return;}const w=wish(),{f,r}=view();
   if(!P.crouchHeld())s.cReady=true;if(P.crouchHeld()&&s.cReady&&s.t>.2){letGo();return;}
   if(s.kind==='bar'){
    const a=V(g.a),b=V(g.b),ab=b.clone().sub(a);
    if(w.x){const dir=Math.sign(ab.clone().normalize().dot(r)*w.x);s.u=clamp(s.u+dir*1.3*dt/ab.length(),.06,.94);}
    // A pendulum about the bar; W / S pump it like a playground swing (toward where you face, or away).
    const L=1.5,face=Math.sign(f.dot(s.n))||1;let acc=-(15/L)*Math.sin(s.ang)-.3*s.av;
    // Holding W pumps in time with the swing (energy every half-swing, up to the bar's height); S brakes it.
    if(w.z>0)acc+=(4.2+1.8*mom)*(Math.abs(s.av)<.2?face:Math.sign(s.av))*(Math.abs(s.ang)<1.45?1:0);else if(w.z<0)acc-=s.av*2.4;
    s.av+=acc*dt;s.ang+=s.av*dt;if(Math.abs(s.ang)>1.65){s.ang=Math.sign(s.ang)*1.65;s.av*=-.2;}
    const pt=a.clone().addScaledVector(ab,s.u),x=pt.x+s.n.x*Math.sin(s.ang)*.75,z=pt.z+s.n.z*Math.sin(s.ang)*.75,eye=pt.y-BAR_EYE*Math.cos(s.ang);
    safePlace(x,eye-EYE,z);return;
   }
   if(s.kind==='pipe'){
    const up=w.z>0?1:w.z<0?-1:0,floor=floorAt(g.x+g.n[0]*.45,g.z+g.n[1]*.45,s.y+STEP);
    const previousY=s.y;
    s.y=clamp(s.y+up*(2.1+1.4*mom)*dt,Math.max(g.y0-.2,floor),g.y1-1.05);
    s.travelSpeed=dt>0?Math.abs(s.y-previousY)/dt:0;
    if(up){s.step+=dt;if(s.step>.32){s.step=0;P.footsteps?.step('stone',3);}}
    if(!safePlace(g.x+g.n[0]*.45,s.y,g.z+g.n[1]*.45))return;
    // At the top, climb over onto whatever the pipe runs up (the tower roof).
    if(up>0&&s.y>=g.y1-1.06){const ledge=ledgeAhead(P.pos,feetOf(),s.n.clone().negate(),.25,REACH+.4,1.4);if(ledge){startClimb(ledge,false);return;}}
    if(up<0&&s.y<=floor+.02){stand();return;}
    return;
   }
   // Rope: a two-axis pendulum from the anchor. W / S climb; Shift pumps toward where you look, A / D to the side.
   const previousLength=s.s;
   s.s=clamp(s.s-(w.z>0?1:w.z<0?-1:0)*(1.5+1*mom)*dt,.5,g.len-.1);
   s.travelSpeed=dt>0?Math.abs(s.s-previousLength)/dt:0;
   // Pumping adds energy along the chosen direction in time with the swing (from rest it starts toward that way).
   const L=s.s+.9,dirP=f.clone().multiplyScalar(P.keys.has('shift')?1:0).addScaledVector(r,w.x),pk=(3.6+1.6*mom)*(Math.hypot(s.qx,s.qz)<1.1?1:0);
   let px=0,pz=0;if(dirP.lengthSq()>.01){dirP.normalize();const along=s.wx*dirP.x+s.wz*dirP.z,sg=Math.abs(along)<.2?1:Math.sign(along);px=dirP.x*sg*pk;pz=dirP.z*sg*pk;}
   s.wx+=(-(15/L)*Math.sin(s.qx)-.22*s.wx+px)*dt;s.wz+=(-(15/L)*Math.sin(s.qz)-.22*s.wz+pz)*dt;
   s.qx=clamp(s.qx+s.wx*dt,-1.2,1.2);s.qz=clamp(s.qz+s.wz*dt,-1.2,1.2);
   const q=Math.min(1.3,Math.hypot(s.qx,s.qz)),hx=g.x+s.s*Math.sin(s.qx),hz=g.z+s.s*Math.sin(s.qz),hy=g.top-s.s*Math.cos(q);
   if(!safePlace(hx,hy-.42-EYE,hz))return;
   if(w.z<0&&s.s>=g.len-.11&&feetOf()-floorAt(P.pos.x,P.pos.z,feetOf()+STEP)<.6)letGo();
  }
  function ropePose(){const s=state;if(s?.kind!=='rope')return null;return {id:s.id,dx:Math.sin(s.qx),dz:Math.sin(s.qz)};}

  // Wall jump: in the air against a wall, kick off it; chains wall to wall until you land (each kick a little weaker).
  function wallKick(f,w,fwd){
   if(clock<cool.walljump||chain>=CHAIN_MAX)return false;
   const v=P.vel,dir=Math.hypot(v.x,v.z)>.8?flat(v):w.dir.lengthSq()>.01?w.dir.clone().normalize():fwd,{r}=view();
   let wall=wallAhead(P.pos,f,dir);if(wall&&wall.top<f+.8)wall=null;
   if(!wall)for(const side of [1,-1]){const b=wallBeside(P.pos,f,r,side);if(b){wall=b;break;}}
   if(!wall)return false;
   const n=wall.normal,out=v.clone().setY(0),into=out.dot(n);if(into<0)out.addScaledVector(n,-into);
   out.multiplyScalar(.85).addScaledVector(n,4.8+1.5*mom);
   const h=P.motion.inspect().height;P.motion.set(h,(6+1.4*mom)*Math.pow(.92,chain));P.vel.copy(out);
   chain++;bonus+=.05;stats.walljumps++;cool.walljump=clock+.18;cool.wallrun=clock+.12;
   P.sway.bump(.55,Math.sign(n.dot(r))||0);P.footsteps?.step(P.surface(),7);P.requestDraw();return true;
  }
  function hangJump(w){
   const L=state.ledge;
   if(w.x){// leap sideways to a ledge along the wall (or another wall at a similar height)
    const s=Math.sign(w.x)*(L.tangent.dot(view().r)>0?1:-1),dir=L.tangent.clone().multiplyScalar(s);
    for(let d=1;d<=3.6;d+=.2){const q=L.point.clone().addScaledVector(dir,d).addScaledVector(L.normal,-.12);refresh();
     for(const b of boxes)if(b!==L.box&&inside(b,q.x,q.z)&&Math.abs(b.top-L.top)<1.6){
      const pt=new T.Vector3(q.x,b.top,q.z).addScaledVector(L.normal,.12);const ledge={box:b,point:pt,normal:L.normal.clone(),top:b.top,stand:pt.clone().addScaledVector(L.normal,-.45)};
      startWarp(new T.Vector3(pt.x+L.normal.x*.38,hangFeet(b.top),pt.z+L.normal.z*.38),{dur:.56,arc:.5,then:'hang',ledge,action:w.x<0?'hopLeft':'hopRight'});return;}}
    P.sway.bump(.2,s);return;}
   if(w.z<0){// kick off backwards, onto a ledge or roof behind you if there is one
    const back=L.normal.clone(),f=feetOf(),ledge=ledgeAhead(P.pos,f,back,-1,1.8,5);
    if(ledge){startWarp(new T.Vector3(ledge.point.x+ledge.normal.x*.38,hangFeet(ledge.top),ledge.point.z+ledge.normal.z*.38),{dur:.55,arc:1,then:'hang',ledge});return;}
    state=null;release(back.multiplyScalar(4.6),4.2);return;}
   // Space + forward reaches the next handhold when one is above the current ledge.
   // The same swept, collision-checked path is used by the client and server.
   if(w.z>0){const f=feetOf(),upper=ledgeAhead(P.pos,f,L.normal.clone().negate(),L.top-f+.4,L.top-f+1.6,1.2);
    if(upper){const to=new T.Vector3(upper.point.x+upper.normal.x*.38,hangFeet(upper.top),upper.point.z+upper.normal.z*.38);
     if(bodyFits(to)){startWarp(to,{dur:.65,arc:.35,then:'hang',ledge:upper,action:'hopUp'});return;}}}
   tryClimb();
  }
  function tryClimb(){const L=state.ledge;if(!bodyFits(L.stand)){P.sway.bump(.15,0);return;}startClimb(L,false);}

  // Every frame in the air (outside a state): grab ledges, start wall-runs.
  function air(dt){
   if(state)return;if(clock>cool.grip){const hit=findGrip();if(hit){startGrip(hit);return;}}
   const f=feetOf(),w=wish(),v=P.vel,speed=Math.hypot(v.x,v.z),mv=P.motion.inspect();
   const dir=speed>.8?flat(v):view().f;
   // Grab: moving into a ledge that the hands can reach.
   if(clock>cool.grab&&(w.z>0||speed>2)){const reach=REACH+(mv.velocity<0?.25:0),lookDir=view().f;let ledge=ledgeAhead(P.pos,f,dir,.25,reach,.75);if(!ledge&&w.z>0&&lookDir.dot(dir)<.98)ledge=ledgeAhead(P.pos,f,lookDir,.25,reach,.75);
    if(ledge&&!(ledge.top-f<MANTLE&&mv.velocity>2)){stats.grabs++;cool.grab=clock+.4;if(ledge.top-f<=MANTLE||w.z>0)startClimb(ledge,ledge.top-f<=MANTLE);else startHang(ledge);return;}}
   // Wall-run: holding forward at speed with a tall wall beside you, running roughly along it.
   if(clock>cool.wallrun&&w.z>0&&speed>4.2){const {r}=view();for(const side of [1,-1]){const wall=wallBeside(P.pos,f,r,side);if(!wall)continue;
    const tan=new T.Vector3(wall.normal.z,0,-wall.normal.x);if(tan.dot(v)<0)tan.negate();if(tan.dot(flat(v))<.6)continue;
    state={kind:'wallrun',t:0,normal:wall.normal,tangent:tan,speed:Math.max(speed,6.2),vy:Math.max(1.6,mv.velocity*.5+1.6),side,box:wall.box,step:0};P.motion.reset();stats.wallruns++;P.sway.bump(.3,side);P.footsteps?.step(P.surface(),7);return;}}
  }
  // Walk off an edge with C held: catch it and hang.
  function dropToHang(from,to,feet){
   refresh();const radius=profile().radius,dir=flat(to.clone().sub(from));
   if(!clearance||dir.lengthSq()<1e-8||supportAt(to.x,to.z,feet+STEP,radius)>=feet-.4)return false;
   const samples=[];for(const dx of [-radius,0,radius])for(const dz of [-radius,0,radius])samples.push({x:from.x+dx,z:from.z+dz});
   const candidates=[];
   for(const b of boxes)if(Math.abs(b.top-feet)<.12&&samples.some(p=>inside(b,p.x,p.z,.08)))candidates.push({box:b,shape:b});
   for(const F of fields){const seen=new Set();for(const p of samples){
    const col=Math.floor((p.x-F.minX)/F.cell),row=Math.floor((p.z-F.minZ)/F.cell);
    if(col<0||row<0||col>=F.cols||row>=F.rows)continue;
    const id=row*F.cols+col,h=F.h[id];if(seen.has(id)||!(h>0)||Math.abs(h-feet)>.15)continue;seen.add(id);
    const x=F.minX+col*F.cell,z=F.minZ+row*F.cell;
    candidates.push({box:{field:F,top:h},shape:{minX:x,maxX:x+F.cell,minZ:z,maxZ:z+F.cell,bottom:h-.2,top:h}});
   }}
   // Cell bounds are projection geometry only; snapshots retain the registered field.
   for(const c of candidates){const b=c.shape;c.point=new T.Vector3(clamp(to.x,b.minX,b.maxX),b.top,clamp(to.z,b.minZ,b.maxZ));c.normal=faceNormal(b,to);}
   candidates.sort((a,b)=>a.point.distanceToSquared(to)-b.point.distanceToSquared(to));
   for(const {box,shape:b,point:pt,normal:n} of candidates){
    if(n.dot(dir)<=0)continue;
    const supported=p=>box.field?Math.abs((fieldH(box.field,p.x,p.z)??-Infinity)-b.top)<.15:inside(b,p.x,p.z);
    const tangent=new T.Vector3(n.z,0,-n.x),inset=pt.clone().addScaledVector(n,-.05),stand=pt.clone().addScaledVector(n,-.45);
    if(!supported(stand)||!supported(inset.clone().addScaledVector(tangent,.19))||!supported(inset.clone().addScaledVector(tangent,-.19)))continue;
    if(floorAt(pt.x+n.x*.6,pt.z+n.z*.6,b.top-1)>b.top-2.3)continue;
    // Match startHang's placement; clear the lip at feet height before descending.
    const hang={x:pt.x+n.x*.38,y:hangFeet(b.top),z:pt.z+n.z*.38},outside={...hang,y:feet},start={x:from.x,y:feet,z:from.z};
    if(!bodyFits(stand)||!bodyFits(hang)||bodySweep(start,outside)<1||bodySweep(outside,hang)<1)continue;
    const face=n.clone().negate(),d=P.aim.clone().sub(P.pos),pitch=Math.atan2(d.y,Math.hypot(d.x,d.z));
    stats.drops++;startHang({box,point:pt,normal:n,top:b.top,stand},'drop');
    P.aim.copy(P.pos).add(new T.Vector3(face.x*Math.cos(pitch),Math.sin(pitch),face.z*Math.cos(pitch)).multiplyScalar(5));return true;
   }
   return false;
  }
  // Landing from a fall of `height` metres.
  function land(height,speed){
   chain=0;dropAt=null;if(height<2.2+1.2*mom)return null;
   if(clock-crouchAt<.38){stats.rolls++;P.sway.bump(.6,stats.rolls%2?-1:1);P.footsteps?.land(P.surface(),.6);return {kind:'roll'};}
   stats.hard++;stats.lastFall=+height.toFixed(2);P.sway.bump(Math.min(1.6,.6+height*.15),0);P.footsteps?.land(P.surface(),1);P.vel.multiplyScalar(height<4?.55:.25);
   if(height>5.5)P.onFall?.(Math.round((height-5.5)*10));return {kind:'hard',stun:Math.min(.7,.2+height*.06)};
  }

  /* ---------------------------------------------------------------- state update */
  function update(dt,tick=null){
   if(tick!==null&&lastUpdateTick===tick)return false;lastUpdateTick=tick;
   clock+=dt;
   if(dropAt!==null&&clock-dropAt>=.4)dropAt=null;
   lean+=((state?.kind==='wallrun'?-state.side*.17:0)-lean)*(1-Math.exp(-10*dt));
   fov+=((state?.kind==='wallrun'?7:state?.kind==='warp'?5:0)+(Math.hypot(P.vel.x,P.vel.z)>4?mom*6:0)-fov)*(1-Math.exp(-8*dt));
   // First person, the eye rises towards a ledge you hold so your hands on it are in view; it settles again as you climb.
   const wantLift=state?.kind==='hang'?.2:state?.kind==='climb'&&state.ledge?(1-clamp(state.t/state.dur/.6,0,1))*(state.from.y<state.ledge.top-1.4?.2:0):0;lift+=(wantLift-lift)*(1-Math.exp(-12*dt));
   // Free running: hold sprint and forward, and the ground moves (vault, climb, gap leap, wall-run) fire on their own.
   if(!state&&P.keys.has('shift')&&clock>cool.auto&&!P.motion.inspect().airborne&&autoRun())return true;
   if(!state)return false;const s=state;s.t+=dt;
   if(s.kind==='wallrun'){
    s.vy-=5.5*(1-.4*mom)*dt;const f=feetOf()+s.vy*dt,nx=P.pos.x+s.tangent.x*s.speed*dt,nz=P.pos.z+s.tangent.z*s.speed*dt;
    const {r}=view(),wall=wallBeside(new T.Vector3(nx,P.pos.y,nz),f,r,s.side),fl=floorAt(nx,nz,f+STEP);
    if(solid(nx,nz,f,f+1.7,.2)&&!wall){release(s.tangent.clone().multiplyScalar(s.speed*.5),s.vy);return true;}
    if(!safePlace(nx,Math.max(f,fl),nz))return true;
    s.step+=dt;if(s.step>.2){s.step=0;P.footsteps?.step('stone',7);}
    if(fl>=f-.02){stand();P.vel.copy(s.tangent).multiplyScalar(s.speed*.8);return true;}
    if(!wall||s.t>1.25+1.1*mom||wish().z<0){release(s.tangent.clone().multiplyScalar(s.speed),s.vy);cool.wallrun=clock+.3;}
    P.requestDraw();return true;
   }
   if(s.kind==='scramble'){
    s.vy-=7*(1-.3*mom)*dt;const f=feetOf()+s.vy*dt;if(!safePlace(P.pos.x,f,P.pos.z))return true;
    const ledge=ledgeAhead(P.pos,f,s.normal.clone().negate(),.25,REACH,.8);
    if(ledge){startClimb(ledge,ledge.top-f<=MANTLE);return true;}
    if(s.vy<.6||s.t>.7+.45*mom){release(s.normal.clone().multiplyScalar(2.2),s.vy);cool.grab=clock+.25;}
    P.requestDraw();return true;
   }
   if(s.kind==='climb'){
    const k=Math.min(1,s.t/s.dur),L=s.ledge,a=s.from,e=smooth(k);
    // Up the face first (hands on the edge), then over onto the top.
    const upK=smooth(Math.min(1,k/.6)),overK=smooth(clamp((k-.62)/.38,0,1));
    // Keep the torso outside the face until its feet clear the lip. Wide
    // characters need more than the default 30 cm offset.
    const faceOffset=Math.max(.3,profile().radius+.04),wallX=L.point.x+L.normal.x*faceOffset,wallZ=L.point.z+L.normal.z*faceOffset;
    const x=a.x+(wallX-a.x)*Math.min(1,upK*1.3)+(L.stand.x-wallX)*overK,z=a.z+(wallZ-a.z)*Math.min(1,upK*1.3)+(L.stand.z-wallZ)*overK;
    const feet=a.y+(L.top-a.y)*upK;if(!bodyFits(L.stand)||!safePlace(x,feet,z))return true;
    if(k>=1){place(L.stand.x,L.top,L.stand.z);stand();P.vel.copy(L.normal).multiplyScalar(-Math.max(1.4,s.entry*(s.quick?.8:.5)));P.footsteps?.step(P.surface(),3);}
    P.requestDraw();return true;
   }
   if(s.kind==='hang'){
    const L=s.ledge,w=wish();
    // Let go: S, or a fresh press of C (holding C from walking off the edge does not drop you).
    if(!P.crouchHeld())s.cReady=true;
    if(w.z<0&&s.t>.25||P.crouchHeld()&&s.cReady&&s.t>.25){cool.grab=clock+.5;dropAt=clock;release(L.normal.clone().multiplyScalar(.6),0);return true;}
    // Climb on a fresh press of W (so holding W while dropping onto a ledge does not climb straight back up).
    const held=P.keys.has('w')||P.keys.has('arrowup');if(!held)s.wReady=true;
    if(w.z>0&&s.t>.3&&s.wReady){tryClimb();return true;}
    // Shimmy along the edge, as long as there is edge.
    if(w.x){const s2=Math.sign(w.x)*(L.tangent.dot(view().r)>0?1:-1),np=L.point.clone().addScaledVector(L.tangent,s2*1.5*dt),q=np.clone().addScaledVector(L.normal,-.1);
     if((L.box.field?Math.abs((fieldH(L.box.field,q.x,q.z)??-9)-L.top)<.4:inside(L.box,q.x,q.z))||boxes.some(b=>Math.abs(b.top-L.top)<.15&&inside(b,q.x,q.z))){if(!safePlace(np.x+L.normal.x*.38,hangFeet(L.top),np.z+L.normal.z*.38))return true;L.point.copy(np);L.stand.addScaledVector(L.tangent,s2*1.5*dt);s.shimmy=(s.shimmy||0)+dt;if(s.shimmy>.4){s.shimmy=0;P.footsteps?.step('stone',2);}}}
    P.requestDraw();return true;
   }
   if(['bar','pipe','rope'].includes(s.kind)){updateGrip(dt);P.requestDraw();return true;}
   if(s.kind==='warp'){
    const k=Math.min(1,s.t/s.dur),e=smooth(k),p=s.from.clone().lerp(s.to,e);p.y+=Math.sin(k*Math.PI)*s.arc;if(!safePlace(p.x,p.y,p.z))return true;
    if(k>=1){if(s.then==='hang'&&s.ledge)startHang(s.ledge,'leap');else{stand();const d=flat(s.to.clone().sub(s.from));P.vel.copy(d).multiplyScalar(Math.max(4,s.entry*.9));P.footsteps?.land(P.surface(),.5);}}
    P.requestDraw();return true;
   }
   return false;
  }
  // The hands on the ledge (third-person body), or null.
  function hands(){const s=state;if(!s)return null;
   if(s.kind==='bar'){const g=gripOf(s.id);if(!g)return null;const a=V(g.a),ab=V(g.b).sub(a),pt=a.clone().addScaledVector(ab,s.u),d=ab.normalize().multiplyScalar(.19);return [pt.clone().add(d),pt.clone().sub(d)];}
   if(s.kind==='pipe'){const g=gripOf(s.id);if(!g)return null;return [new T.Vector3(g.x,s.y+EYE+.35,g.z),new T.Vector3(g.x,s.y+EYE-.05,g.z)];}
   if(s.kind==='rope'){const g=gripOf(s.id);if(!g)return null;const q=Math.min(1.3,Math.hypot(s.qx,s.qz)),k=x=>new T.Vector3(g.x+x*Math.sin(s.qx),g.top-x*Math.cos(q),g.z+x*Math.sin(s.qz));return [k(s.s-.05),k(s.s+.22)];}
   const L=s.ledge;if(s.kind==='hang'||s.kind==='climb'&&s.t/s.dur<.85){const tan=L.tangent||new T.Vector3(L.normal.z,0,-L.normal.x);return [L.point.clone().addScaledVector(tan,.19),L.point.clone().addScaledVector(tan,-.19)];}return null;}

  function captureState(){refresh();return codec().encode({version:1,sig,state,cool,crouchAt,clock,lean,fov,lift,stats,lastUpdateTick,mom,chain,bonus,dropAt});}
  function validateState(value){refresh();const s=codec().decode(value);
   if(s.version!==1||s.sig!==sig||!['crouchAt','clock','lean','fov','lift'].every(k=>Number.isFinite(s[k]))||!s.cool||!Number.isFinite(s.cool.wallrun)||!Number.isFinite(s.cool.grab)||s.state&&!['hang','climb','warp','scramble','wallrun','bar','pipe','rope'].includes(s.state.kind))throw Error('Incompatible parkour snapshot.');
   if(s.lastUpdateTick!==null&&(!Number.isSafeInteger(s.lastUpdateTick)||s.lastUpdateTick<0)||s.clock<0||!s.stats||['wallruns','scrambles','grabs','climbs','hangs','leaps','drops','rolls','hard'].some(k=>!Number.isSafeInteger(s.stats[k])||s.stats[k]<0))throw Error('Invalid parkour counters.');
   if(s.mom!==undefined&&(!Number.isFinite(s.mom)||s.mom<0||s.mom>1)||s.chain!==undefined&&(!Number.isSafeInteger(s.chain)||s.chain<0||s.chain>CHAIN_MAX)||s.bonus!==undefined&&(!Number.isFinite(s.bonus)||s.bonus<0||s.bonus>1)||s.cool.walljump!==undefined&&(!Number.isFinite(s.cool.walljump)||s.cool.walljump<0)||s.stats.walljumps!==undefined&&(!Number.isSafeInteger(s.stats.walljumps)||s.stats.walljumps<0))throw Error('Invalid parkour momentum snapshot.');
   if(s.cool.grip!==undefined&&(!Number.isFinite(s.cool.grip)||s.cool.grip<0)||s.stats.grips!==undefined&&(!Number.isSafeInteger(s.stats.grips)||s.stats.grips<0))throw Error('Invalid grip counters.');
   if(s.cool.auto!==undefined&&(!Number.isFinite(s.cool.auto)||s.cool.auto<0)||s.stats.auto!==undefined&&(!Number.isSafeInteger(s.stats.auto)||s.stats.auto<0))throw Error('Invalid free-run counters.');
   if(s.dropAt!=null&&(!Number.isFinite(s.dropAt)||s.dropAt<0||s.dropAt>s.clock))throw Error('Invalid ledge release clock.');
   const v=s.state,vec=p=>p?.isVector3&&[p.x,p.y,p.z].every(Number.isFinite),nums=(o,ks)=>ks.every(k=>Number.isFinite(o[k]));
   const ledge=L=>L&&L.box&&vec(L.point)&&vec(L.normal)&&vec(L.stand)&&Number.isFinite(L.top)&&(!L.tangent||vec(L.tangent));
   if(v){if(!Number.isFinite(v.t)||v.t<0)throw Error('Invalid parkour timer.');
    if(['hang','climb'].includes(v.kind)&&!ledge(v.ledge))throw Error('Invalid ledge snapshot.');
    if(v.kind==='hang'&&(typeof v.from!=='string'||v.cReady!==undefined&&typeof v.cReady!=='boolean'||v.wReady!==undefined&&typeof v.wReady!=='boolean'))throw Error('Invalid hang snapshot.');
    if(v.kind==='climb'&&(!vec(v.from)||!nums(v,['dur','entry'])||v.dur<=0||typeof v.quick!=='boolean'))throw Error('Invalid climb snapshot.');
    if(v.kind==='climb'&&v.style!=null&&v.style!=='ladderExit'||v.kind==='pipe'&&v.groundEntry!==undefined&&typeof v.groundEntry!=='boolean')throw Error('Invalid ladder presentation.');
    if(v.kind==='warp'&&(!vec(v.from)||!vec(v.to)||!nums(v,['dur','arc','entry'])||v.dur<=0||!['hang','land'].includes(v.then)||v.then==='hang'&&!ledge(v.ledge)))throw Error('Invalid leap snapshot.');
    if(v.kind==='warp'&&v.action!==undefined&&!['leap','hopLeft','hopRight','hopUp'].includes(v.action))throw Error('Invalid ledge hop presentation.');
    if(v.kind==='scramble'&&(!vec(v.normal)||!nums(v,['vy'])))throw Error('Invalid scramble snapshot.');
    if(['bar','pipe','rope'].includes(v.kind)){
     const g=gripOf(v.id);
     if(v.travelSpeed!==undefined&&(!Number.isFinite(v.travelSpeed)||v.travelSpeed<0))throw Error('Invalid grip presentation speed.');
     if(!Number.isSafeInteger(v.id)||!g||g.type!==v.kind||typeof v.cReady!=='boolean'||v.kind==='bar'&&(!vec(v.n)||!nums(v,['ang','av','u'])||v.u<.06||v.u>.94||Math.abs(v.ang)>1.65)||v.kind==='pipe'&&(!vec(v.n)||!nums(v,['y','step'])||v.y<g.y0-.2||v.y>g.y1-1.05||v.step<0)||v.kind==='rope'&&(!nums(v,['s','qx','qz','wx','wz'])||v.s<.5||v.s>g.len-.1||Math.abs(v.qx)>1.2||Math.abs(v.qz)>1.2))throw Error('Invalid grip snapshot.');
    }
    if(v.kind==='wallrun'&&(!vec(v.normal)||!vec(v.tangent)||!nums(v,['speed','vy','side','step'])||!v.box))throw Error('Invalid wallrun snapshot.');
   }
   return s;
  }
  function restoreState(value){const s=validateState(value);
   ({state,cool,crouchAt,clock,lean,fov,lift,stats,lastUpdateTick}=s);cool.walljump??=0;cool.grip??=0;cool.auto??=0;stats.walljumps??=0;stats.grips??=0;stats.auto??=0;
   mom=s.mom??0;chain=s.chain??0;bonus=s.bonus??0;dropAt=s.dropAt??null;
  }
  function presentation(){
   if(!state)return dropAt!==null&&P.motion.inspect().airborne?{kind:'hangdrop',time:clock-dropAt,duration:.4}:null;
   const s=state,enter=s.kind==='pipe'&&s.groundEntry&&s.t<.7;
   return {kind:s.style||s.kind,time:s.t||0,duration:enter?.7:s.dur||0,side:s.side||0,normal:s.kind==='wallrun'&&s.normal?[s.normal.x,s.normal.z]:null,
    wall:s.kind==='wallrun'?wallGap(s):null,shimmy:s.kind==='hang'?wish().x:0,vertical:['pipe','rope'].includes(s.kind)?wish().z:undefined,travelSpeed:['pipe','rope'].includes(s.kind)?s.travelSpeed:undefined,
    phase:s.kind==='pipe'?(enter?'enter':'loop'):undefined,action:s.kind==='warp'?s.action||'leap':undefined,landing:s.then||null};
  }
  return {ropePose,setMomentum(v){mom=clamp(+v||0,0,1);},takeMomentumBonus(){const b=bonus;bonus=0;return b;},chain:()=>chain,captureState,restoreState,validateState,updated:tick=>tick!==null&&lastUpdateTick===tick,wallBeside,wallAhead,floorAt,supportAt,solid,ledgeAhead,bodyFits,bodySweep,raycast,update,onJump,air,land,dropToHang,hands,
   crouchPressed(){crouchAt=clock;},active:()=>!!state,busy:()=>['climb','warp','scramble'].includes(state?.kind),kind:()=>state?.kind||null,lean:()=>lean,fov:()=>fov,lift:()=>lift,handsFull:()=>['hang','climb','scramble','bar','pipe','rope'].includes(state?.kind),
   presentation,
   reset(){state=null;dropAt=null;},inspect:()=>({state:state?.kind||null,boxes:boxes.length,fields:fields.length,stats:{...stats}})};
 };
})(window);
