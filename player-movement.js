'use strict';
// How the player moves: walking, sprinting, jumping, crouching, slides, dives, vaults and landings, with parkour.js for
// the moves on walls and ledges. Host hooks (app.js) give it the player's position and the world; values that exist
// only later in start-up (combat, battle...) are read through getters.
(function(root){
 root.createPlayerMovement=function(h){
 const {T,targetPosition,targetAim,walkVelocity,motion,keys,sway,footsteps,surfaceAt,puff,hitStop,requestDraw,obstacle,groundHeight,prepareWalking,shiftHeight}=h;
 const SLIDE_TIME=.75;
 let crouchHeld=false,crouchAmount=0,slide=null,airTime=0,wasAirborne=false,dive=null,proneT=0,diveCount=0,tackleCount=0,airPeak=0,blastFlight=false;
 // Forgiveness: a jump still counts just after walking off an edge, and a press made too early is kept for a moment.
 const COYOTE=.12,JUMP_BUFFER=.15;
 let coyote=0,jumpBuffer=0;
 // Momentum (0..1): hold a sprint and it builds (about 4 s to full); it raises sprint speed (up to +45%), the first
 // jump's power, and through parkour.js the length of wall-runs, the height of wall-climbs and the kick of wall jumps.
 // Jumps go higher the longer Space is held (up to HOLD_MAX seconds of extra lift). Both live in the snapshot so the
 // shared simulation and prediction stay in step.
 const MOM={build:1/3.2,air:.04,walk:.55,stop:1.6,speed:.45,jump:.22},HOLD_MAX=.28,HOLD_LIFT=9;
 let momentum=0,jumpHold=-1,rollTime=null;
 const ROLL_TIME=.8;
 // Safety net: whatever left the body overlapping solid geometry (a climb that began and failed on a crate edge, a
 // respawn on a prop, a world edit), step it out to the nearest free spot: up onto the obstacle if it is low enough,
 // else outward in widening rings at the same height (in the air) or on the floor there (on the ground). Pure
 // geometry, so the shared simulation does the same.
 let unsticks=0;
 function unstick(){
  const P=h.pk();if(!P||P.active?.()||vault)return false;const f=feetPoint();if(fits(f))return false;
  const air=motion.inspect().airborne,height=bodyHeight();let to=null;
  const top=P.floorAt(f.x,f.z,f.y+1.3);if(top>f.y+1e-3&&fits({x:f.x,y:top,z:f.z},height))to={x:f.x,y:top,z:f.z};
  for(let r=.12;!to&&r<=2.41;r+=.12)for(let a=0;a<16&&!to;a++){const x=f.x+Math.cos(a*Math.PI/8)*r,z=f.z+Math.sin(a*Math.PI/8)*r;
   const y=air?f.y:(P.supportAt||P.floorAt)(x,z,f.y+.45,profile().radius);if(y<=f.y+.46&&fits({x,y,z},height))to={x,y,z};}
  if(!to)return false;
  const d=new T.Vector3(to.x-f.x,to.y-f.y,to.z-f.z);targetPosition.add(d);targetAim.add(d);unsticks++;
  if(!air){motion.reset();}else motion.set(Math.max(0,motion.inspect().height+d.y),motion.inspect().velocity);
  slide=null;return true;
 }
 function updateMomentum(dt){
  // Hosts opt out outside an arena. Clear carried charge and parkour bonuses
  // together, so returning to Eden cannot keep a boosted sprint or jump.
  if(h.momentumEnabled?.()===false){momentum=0;h.parkour?.()?.setMomentum?.(0);h.parkour?.()?.takeMomentumBonus?.();return;}
  const P=h.parkour?.(),kind=P?.active?.()?P.kind?.():null,air=motion.inspect().airborne,sp=Math.hypot(walkVelocity.x,walkVelocity.z);
  const bonus=P?.takeMomentumBonus?.()||0;if(bonus)momentum=Math.min(1,momentum+bonus);
  if(kind==='hang')momentum=Math.max(0,momentum-dt*.25);
  else if(kind)momentum=Math.min(1,momentum+dt*.06);
  else if(air)momentum=Math.max(0,momentum-dt*MOM.air);
  else if(keys.has('shift')&&(keys.has('w')||keys.has('arrowup'))&&sp>4.6&&crouchAmount<.3&&proneT<=0)momentum=Math.min(1,momentum+dt*MOM.build*(1-.35*momentum));
  else if(slide)momentum=Math.max(0,momentum-dt*.2);
  else momentum=Math.max(0,momentum-dt*(sp>.5?MOM.walk:MOM.stop));
  if(momentum<1e-4)momentum=0;P?.setMomentum?.(momentum);
 }
 const profile=()=>h.bodyDimensions?.()||root.playerBodyProfile?.(root.GardenPlayerCharacter)||{height:1.75,radius:.26,crouch:1.19};
 const bodyHeight=()=>{const p=profile();return p.height+(p.crouch-p.height)*crouchAmount;};
 const feetPoint=(p=targetPosition)=>({x:p.x,y:p.y-1.75,z:p.z});
 const fits=(p,height=bodyHeight())=>h.pk()?.bodyFits?.(p,height,profile().radius)??!(h.pk()?.solid(p.x,p.z,p.y,p.y+height,profile().radius));
 const sweep=(a,b,height=bodyHeight())=>h.pk()?.bodySweep?.(a,b,height,profile().radius)??(fits(b,height)?1:0);
function move(dt,tick=null){
 updateMomentum(dt);
 moveStep(dt,tick);unstick();
}
function moveStep(dt,tick=null){
 if((h.expedition&&!h.expedition.canMove())||h.playerBody?.downed()){cancelTraversal();walkVelocity.set(0,0,0);return;}
 if(h.parkour()?.active()){if(h.parkourOn())h.parkour().update(dt,tick);else h.parkour().reset();return;}
 if(updateVault(dt))return;
 if((h.expedition&&!h.expedition.canMove())||(h.battle&&!h.battle.canMove())||(h.fists&&!h.fists.canMove())||h.playerBody?.downed()){walkVelocity.set(0,0,0);return;}
 const z=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),x=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
 const forward=targetAim.clone().sub(targetPosition);forward.y=0;forward.normalize();const right=new T.Vector3().crossVectors(forward,new T.Vector3(0,1,0));
 const crouched=crouchAmount>.5&&!slide;
 const wish=forward.multiplyScalar(z).add(right.multiplyScalar(x));if(wish.lengthSq())wish.normalize().multiplyScalar((crouched?motion.speed(false)*.45:motion.speed(keys.has('shift'))*(keys.has('shift')?1+MOM.speed*momentum:1))*(1-.13*(h.combat?.weight?.()||0))*(1-.38*(h.combat?.ads?.()||0))*(proneT>0?.35:1));
 if(slide){
  // A slide keeps its own heading (steerable a little) and bleeds speed from a sprint burst down to a crawl.
  slide.t+=dt;const k=slide.t/slide.dur;
  if(k>=1||motion.inspect().airborne)slide=null;
  else{
   // Downhill slides keep going and pick up speed; uphill ones bleed out sooner.
   if(slide.kind==='slide'){const dh=groundHeight(targetPosition.clone().addScaledVector(slide.dir,.6))-groundHeight(targetPosition);slide.speed=Math.min(11,Math.max(1.5,slide.speed-dh*14*dt));if(dh<-.01)slide.t=Math.max(0,slide.t-dt*Math.min(.85,-dh*12));}
   if(wish.lengthSq())slide.dir.lerp(wish.clone().normalize(),Math.min(1,dt*1.6)).normalize();walkVelocity.copy(slide.dir).multiplyScalar(T.MathUtils.lerp(slide.speed,slide.kind==='dash'?2:1.6,k*k));}
 }
 // Ease up to speed (~0.25 s) and glide to a stop instead of starting and stopping instantly; keep momentum in the air.
 if(!slide){const air=motion.inspect().airborne;
  // In the air nothing slows you unless you steer against it: letting go of a key or of sprint keeps the run-up's speed.
  if(air&&wish.lengthSq())wish.setLength(Math.max(wish.length(),Math.hypot(walkVelocity.x,walkVelocity.z)));
  // At a run the body cannot turn on a coin: the heading swings round at a limited rate, widest at a full sprint.
  const run=Math.hypot(walkVelocity.x,walkVelocity.z);
  if(!air&&run>4.2&&wish.lengthSq()){const now=Math.atan2(walkVelocity.x,walkVelocity.z),want=Math.atan2(wish.x,wish.z),d=Math.atan2(Math.sin(want-now),Math.cos(want-now)),limit=dt*T.MathUtils.lerp(9,3.4,T.MathUtils.smoothstep(run,4.2,6.4));
   if(Math.abs(d)>limit&&Math.abs(d)<2.2){const a=now+Math.sign(d)*limit,len=wish.length();wish.set(Math.sin(a)*len,0,Math.cos(a)*len);}}
  walkVelocity.lerp(wish,1-Math.exp(-(air?(blastFlight?.06:wish.lengthSq()?1.5:.2):wish.lengthSq()?9:11)*dt));}
 if(walkVelocity.lengthSq()<1e-4){walkVelocity.set(0,0,0);return;}
 if(x||z)prepareWalking();
 // Try the full step, then each axis alone, so walls, props and the pond edge slide the player along.
 const step=walkVelocity.clone().multiplyScalar(dt);
 const commit=next=>{const actual=next.clone().sub(targetPosition);targetPosition.copy(next);targetAim.add(actual);};
 const full=step.lengthSq()>1e-10?tryStep(step):null;
 if(full){commit(full);return;}
 if(h.parkour()?.active())return; // the step was taken over (caught an edge)
 // Blocked. Find which way the wall faces, react to the hit, bounce off it and keep moving along it: a slide is
 // redirected along the bounce instead of ending.
 const byX=Math.abs(step.x)>1e-7?tryStep(new T.Vector3(step.x,0,0)):null,byZ=Math.abs(step.z)>1e-7?tryStep(new T.Vector3(0,0,step.z)):null;
 const into=new T.Vector3(byX?0:walkVelocity.x,0,byZ?0:walkVelocity.z);
 // Jumping (or diving) into something low vaults it.
 if((motion.inspect().airborne||dive||keys.has('space'))&&tryVault(walkVelocity))return;
 // A slide that clips a wall at a glancing angle pops off it, keeping (and adding to) the speed along it.
 const sp=Math.hypot(walkVelocity.x,walkVelocity.z),glance=sp>0?into.length()/sp:1;
 if(slide?.kind==='slide'&&!slide.belly&&sp>4&&glance>.15&&glance<.75&&!motion.inspect().airborne){const along=walkVelocity.clone().sub(into);const n=into.clone().normalize().multiplyScalar(-1.8);walkVelocity.copy(along.multiplyScalar(1.12)).add(n);slide=null;motion.jump(3.6);wallPops++;sway.bump(.7,Math.sign(into.dot(right))||0);h.kick(4);footsteps?.land(surfaceAt(targetPosition),.6);requestDraw();return;}
 wallHit(into);
 const bounce=slide?.38:into.length()>4?.18:0;
 if(!byX)walkVelocity.x*=-bounce;if(!byZ)walkVelocity.z*=-bounce;
 if(slide){if(walkVelocity.lengthSq()>.25){slide.dir.copy(walkVelocity).setY(0).normalize();slide.speed=Math.max(2.4,slide.speed*.62);}else slide=null;}
 const along=byX&&byZ?(Math.abs(step.x)>Math.abs(step.z)?byX:byZ):byX||byZ;
 if(along)commit(along);else if(walkVelocity.lengthSq()<.04){walkVelocity.set(0,0,0);slide=null;}
}
function tryStep(step){
 if(h.parkour()?.active())return null;
 if(h.arena?.active()){const next=targetPosition.clone().add(step);if(!h.arena.allowed(next))return null;next.y=1.75+motion.inspect().height;return next;}
 if(h.pockets?.inside(targetPosition)){const next=targetPosition.clone().add(step);if(h.pockets.blocks(next))return null;next.y=1.75+motion.inspect().height;return next;}
 const feet=targetPosition.y-1.75,P=h.pk();
 const next=h.garden.constrain(targetPosition.clone().add(step),targetPosition,P?feet:null,{height:bodyHeight(),radius:profile().radius});
 // Battles and the firing range take place beyond Eden without an expedition, so its gate (and its entry screen) stays out of them.
 if(!h.battle?.busy?.()&&!h.battle?.active()&&!h.combat?.inRange())h.expedition?.constrain(next,targetPosition);
 if(obstacle(next)||Math.hypot(next.x-targetPosition.x,next.z-targetPosition.z)<1e-8)return null;
 if(P){
  // Stand on the highest surface under you (roofs, crates, wall tops); walk off an edge and you fall (or, holding C,
  // catch it and hang); land on whatever is under you mid-air.
  const floor=(P.supportAt||P.floorAt)(next.x,next.z,feet+.45,profile().radius),m=motion.inspect();
  // Ascend a walkable step before crossing it, with clearance above both ends.
  const start=feetPoint(),raised={...start,y:Math.max(feet,floor)},end={x:next.x,y:raised.y,z:next.z};
  if(!fits(end)||sweep(start,raised)<1||sweep(raised,end)<1)return null;
  if(!m.airborne&&floor<feet-.4){if(crouchHeld&&!slide&&P.dropToHang(targetPosition,next,feet))return null;motion.set(feet-floor,0);airPeak=feet;coyote=COYOTE;}
  else if(m.airborne)motion.set(Math.max(0,feet-floor),m.velocity);
  next.y=1.75+floor+motion.inspect().height;return next;
 }
 next.y=1.75+groundHeight(next)+motion.inspect().height;
 return next;
}
// Hold C through the start of a slide and you launch into a dolphin dive: a low flat leap that lands on your chest
// and skids. Sliding or diving into someone in the open match tackles them: they go down and drop their weapon.
const DIVE_HOLD=.16;
function startDive(){
 const speed=Math.hypot(walkVelocity.x,walkVelocity.z),dir=slide.dir.clone();
 if(!motion.jump(4.3))return;
 slide=null;rollTime=null;dive={t:0,dir,speed:Math.max(speed,6.5)*1.15};walkVelocity.copy(dir).multiplyScalar(dive.speed);diveCount++;
 // Launch happens after this frame's landing check. Record it now so a correction
 // or interrupted frame that grounds us before the next sample still lands the dive.
 wasAirborne=true;airTime=0;airPeak=targetPosition.y-1.75;
 h.combat?.dropAim?.();sway.bump(.5,0);h.kick(5);footsteps?.step(surfaceAt(targetPosition),8);requestDraw();
}
function landDive(){
 const speed=Math.hypot(walkVelocity.x,walkVelocity.z);
 // Holding a direction as you land turns the belly flop into a roll: back on your feet almost at once, still moving.
 if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].some(k=>keys.has(k))){rolls++;rollTime=0;sway.bump(.6,rolls%2?-1:1);footsteps?.land(surfaceAt(targetPosition),.7);{const feet=targetPosition.clone();feet.y-=1.72;puff(feet,6,.7);}
  slide={kind:'slide',dur:.4,t:0,dir:dive.dir.clone(),speed:Math.max(4.5,speed*.85),belly:true,roll:true};proneT=.22;h.kick(3);dive=null;return;}
 sway.bump(1.1,diveCount%2?-1:1);footsteps?.land(surfaceAt(targetPosition),1);hitStop(45);
 {const feet=targetPosition.clone();feet.y-=1.72;puff(feet,9,.9);}
 slide={kind:'slide',dur:.55,t:0,dir:dive.dir.clone(),speed:Math.max(3.2,speed*.7),belly:true};footsteps?.slide(surfaceAt(targetPosition),.55);
 proneT=.75;dive=null;
}
// Vault: jump into something low (a chest, a low wall, a bench) and you hop over it to the far side.
let vault=null,vaultCount=0,wallPops=0,rolls=0;
function cancelTraversal(){vault=null;slide=null;dive=null;proneT=0;jumpBuffer=0;coyote=0;rollTime=null;}
function vaultPoint(v,k){
 // Carry on over the planted take-off foot (v.lead metres, at about its pace) while rising, so it does not slide back;
 // finish rising outside the near face, cross above the obstacle, then settle. Older snapshots have no lead: 0.
 const span=Math.hypot(v.to.x-v.from.x,v.to.z-v.from.z)||1,lead=Math.min(.95,(v.lead||0)/span);
 const p=v.from.clone(),horizontal=k<.28?lead*Math.min(1,k/.16):k>.78?1:lead+(1-lead)*T.MathUtils.smoothstep(k,.28,.78);
 p.lerp(v.to,horizontal);
 const lift=k<.28?T.MathUtils.smoothstep(k,0,.28):k>.78?1-T.MathUtils.smoothstep(k,.78,1):1;
 p.y=(k<.78?v.from.y:v.to.y)+v.lift*lift;return p;
}
// How far the vault path has raised the body above the ground right now (metres): the vault clip carries its own
// rise over the obstacle, so character-motion.js lowers the model by this much to plant the hand on the top.
function vaultLift(v){const k=Math.min(1,v.t/v.dur);return v.lift*(k<.28?T.MathUtils.smoothstep(k,0,.28):k>.78?1-T.MathUtils.smoothstep(k,.78,1):1);}
function tryVault(dir){
 const P=h.pk(),probe=P?.raycast?((o,d,n)=>P.raycast(o,d,n)):h.combat?.worldHits?.bind(h.combat);
 if(vault||!probe||h.arena?.active()||P?.active?.())return false;
 const feet=targetPosition.y-1.75,d=dir.clone().setY(0);if(d.lengthSq()<1e-4)return false;d.normalize();
 const head=new T.Vector3(targetPosition.x,feet+1.5,targetPosition.z);if(probe(head,d,1.1))return false;
 let top=null,topAt=0;for(const k of [.35,.55,.8,1.0]){const hit=probe(head.clone().addScaledVector(d,k),new T.Vector3(0,-1,0),1.5);if(hit&&hit.point.y>=feet+.3&&hit.point.y<=feet+1.2){top=hit;topAt=k;break;}}
 if(!top)return false;
 for(const distance of [1,1.3,1.6,1.9,2.2]){
  const to=targetPosition.clone().addScaledVector(d,distance),floor=P?.floorAt(to.x,to.z,feet+.2)??groundHeight(to),radius=profile().radius;
  if(Math.abs(floor-feet)>.18)continue;to.y=floor+1.75;
  const constrained=h.garden.constrain(to.clone(),targetPosition,P?feet:null,{height:profile().height,radius});
  if(Math.hypot(constrained.x-to.x,constrained.z-to.z)>.02||obstacle(to)||obstacle(to.clone().addScaledVector(d,-.25))||// land a stride clear, so the trailing leg does not clip the far face
!fits(feetPoint(to),profile().height))continue;
  if(P&&[[radius,radius],[-radius,radius],[radius,-radius],[-radius,-radius]].some(([x,z])=>Math.abs(P.floorAt(to.x+x,to.z+z,feet+.2)-floor)>.18))continue;
  const plan={from:targetPosition.clone(),to,t:0,dur:.62,lift:top.point.y-feet+.035,speed:Math.max(3.5,Math.hypot(walkVelocity.x,walkVelocity.z)),lead:T.MathUtils.clamp(topAt-.2-profile().radius,0,.35)};
  // The take-off lead is a nicety: where it would brush the near face, vault straight up as before.
  const clear=()=>{let previous=feetPoint();for(let i=1;i<=32;i++){const next=feetPoint(vaultPoint(plan,i/32));if(sweep(previous,next,profile().height)<1)return false;previous=next;}return true;};
  if(!clear()){if(!plan.lead)continue;plan.lead=0;if(!clear())continue;}
  vault=plan;vaultCount++;slide=null;dive=null;motion.reset();sway.bump(.35,0);footsteps?.step(surfaceAt(targetPosition),6);requestDraw();return true;
 }return false;
}
function updateVault(dt){
 if(!vault)return false;vault.t+=dt;const k=Math.min(1,vault.t/vault.dur),p=vaultPoint(vault,k);
 if(sweep(feetPoint(),feetPoint(p),profile().height)<1){const floor=h.pk()?.floorAt(targetPosition.x,targetPosition.z,targetPosition.y-1.75+.05)??groundHeight(targetPosition);cancelTraversal();motion.set(Math.max(0,targetPosition.y-1.75-floor),0);return true;}
 const delta=p.clone().sub(targetPosition);targetPosition.copy(p);targetAim.add(delta);
 if(k>=1){const d=vault.to.clone().sub(vault.from).setY(0).normalize();walkVelocity.copy(d).multiplyScalar(vault.speed);footsteps?.land(surfaceAt(targetPosition),.4);sway.bump(.3,0);vault=null;}
 requestDraw();return true;
}
function tryTackle(){
 if(!h.battle?.active?.()||!(slide?.kind==='slide'||dive))return;
 const speed=Math.hypot(walkVelocity.x,walkVelocity.z);if(speed<4)return;
 const feet=targetPosition.clone();feet.y-=1.75;
 const hit=h.battle.tackle?.(feet,walkVelocity.clone().setY(0).normalize(),speed);
 if(hit){tackleCount++;h.playerBody?.anim?.('dash',{fade:.05,speed:1.4});sway.bump(.9,0);hitStop(70);footsteps?.land('grass',.8);walkVelocity.multiplyScalar(.45);if(slide)slide.speed*=.45;if(dive)dive.speed*=.45;}
}
function startSlide(){
 const speed=Math.hypot(walkVelocity.x,walkVelocity.z);
 if(slide||dive||vault||!keys.has('shift')||speed<4.2||motion.inspect().airborne||h.playerBody?.downed()||h.modalOpen())return;
 slide={kind:'slide',dur:SLIDE_TIME,t:0,dir:walkVelocity.clone().setY(0).normalize(),speed:Math.max(speed*1.25,7.2)};footsteps?.slide(surfaceAt(targetPosition),SLIDE_TIME);
 // Dropping into a slide: the view dips and kicks to one side.
 sway.bump(.45,Math.random()<.5?-1:1);h.kick(3);requestDraw();
}
// Dodge: double-tap A or D in a fight (the jester, a battle, a weapon drawn) for a quick side-step; blows from the
// jester miss during it (fists.dodge()).
const lastTap={a:0,d:0};
function tapDodge(key){
 const t=h.now?.()??performance.now(),quick=t-lastTap[key]<260;lastTap[key]=quick?0:t;
 if(!quick||slide||motion.inspect().airborne||h.playerBody?.downed()||!(h.fistsEngaged()||h.battle?.active()||h.combat?.armed()))return;
 const forward=targetAim.clone().sub(targetPosition).setY(0).normalize(),side=new T.Vector3().crossVectors(forward,new T.Vector3(0,1,0)).multiplyScalar(key==='d'?1:-1);
 prepareWalking();slide={kind:'dash',dur:.26,t:0,dir:side,speed:8};h.fists?.dodge();footsteps?.step(surfaceAt(targetPosition),7);requestDraw();
}
// Running or sliding into something: a jolt through the view (rolled towards the side that hit), a thud, and on a
// hard hit a short frame hold.
let lastBump=0,bumpCount=0;
function wallHit(into){
 const impact=into.length(),t=h.now?.()??performance.now();if(impact<2.4||t-lastBump<300)return;if(impact>4)momentum*=.4;lastBump=t;bumpCount++;
 const forward=targetAim.clone().sub(targetPosition).setY(0).normalize(),right=new T.Vector3().crossVectors(forward,new T.Vector3(0,1,0));
 const k=Math.min(1.4,impact/6);sway.bump(k,Math.sign(into.dot(right))||0);footsteps?.land(surfaceAt(targetPosition),Math.min(1,impact/8));
 h.kick(-(4*k));if(impact>5.5)hitStop(40+impact*4);{const feet=targetPosition.clone();feet.y-=1.72;puff(feet,Math.round(3+4*k),.6);}requestDraw();
}
function jump(){if(!h.state.ready||h.modalOpen()||h.expedition&&!h.expedition.canMove()||h.fists&&!h.fists.canMove())return;
 if(h.momentumEnabled?.()===false)updateMomentum(0);
 const P=h.pk(),m=motion.inspect(),late=coyote>0&&m.airborne&&m.velocity<=0;
 if(P?.busy()||vault){jumpBuffer=JUMP_BUFFER;return;}
 if(!P?.active?.()&&!m.airborne&&tryVault(walkVelocity.lengthSq()>.1?walkVelocity:targetAim.clone().sub(targetPosition))){jumpBuffer=0;coyote=0;return;}
 if(P?.onJump({late})){slide=null;dive=null;jumpBuffer=0;coyote=0;requestDraw();return;}
 if(m.airborne&&!late){jumpBuffer=JUMP_BUFFER;return;}prepareWalking();
 // Jumping out of a slide carries its speed and a little more.
 if(slide?.kind==='slide'){walkVelocity.multiplyScalar(1.12);slide=null;}
 const power=motion.impulse*(1+MOM.jump*momentum);if(late)motion.set(m.height,power);else motion.jump(power);jumpHold=0;jumpBuffer=0;coyote=0;airPeak=targetPosition.y-1.75-(late?m.height:0);requestDraw();}
function updateJump(dt){
 coyote=Math.max(0,coyote-dt);if(jumpBuffer>0){jumpBuffer=Math.max(0,jumpBuffer-dt);if(!motion.inspect().airborne&&!vault&&!h.parkour()?.active())jump();}
 if(!motion.inspect().airborne){jumpHold=-1;return;}
 if(jumpHold>=0){const mi=motion.inspect();if(mi.velocity<=0||h.parkour?.()?.active?.()||!keys.has('space')||jumpHold>=HOLD_MAX)jumpHold=-1;else{const k=Math.min(dt,HOLD_MAX-jumpHold);motion.set(mi.height,mi.velocity+HOLD_LIFT*(1+.3*momentum)*k);jumpHold+=dt;}}
 const before=motion.inspect().height,start=feetPoint();
 if(h.expedition&&!h.expedition.canMove())motion.reset();else motion.step(dt);
 let delta=motion.inspect().height-before;
 if(delta>0){const t=sweep(start,{...start,y:start.y+delta});if(t<1){delta*=t;motion.set(before+delta,0);}}
 shiftHeight(delta);
}
 function updateCrouch(dt){
  const p=profile(),want=(crouchHeld||slide?.kind==='slide'||proneT>0)&&!h.arena?.active()?1:0;
  const next=crouchAmount+(want-crouchAmount)*(1-Math.exp(-14*dt));
  // Releasing C, losing focus or ending a slide cannot expand into a ceiling.
  if(next<crouchAmount&&!fits(feetPoint(),p.height+(p.crouch-p.height)*next))return;
  crouchAmount=next<.001?0:next>.999?1:next;
 }
 // Landings, wall and ledge moves in the air, and what follows from them.
 function updateAir(dt,speed,airborne,tick=null){
 if(rollTime!==null){rollTime+=dt;if(rollTime>=ROLL_TIME||airborne)rollTime=null;}
 const Pk=h.parkourOn()?h.parkour():null;if(Pk&&!Pk.active()&&!Pk.updated?.(tick)){Pk.update(dt,tick);if(airborne)Pk.air(dt);}
 // Parkour owns the player while it is active: a caught ledge is not a landing, and a later fall counts from where you let go.
 if(h.parkour()?.active()){slide=null;dive=null;rollTime=null;airTime=0;wasAirborne=false;airPeak=targetPosition.y-1.75;proneT=Math.max(0,proneT-dt);return;}
 // Thrown by a blast: the landing is a hard one (a moment on the ground) but the blast already did its damage.
 if(blastFlight&&!airborne&&wasAirborne){blastFlight=false;airPeak=targetPosition.y-1.75;proneT=Math.max(proneT,.85);momentum=0;h.playerBody?.anim?.('jumpLand',{fade:.06,speed:1.3});h.kick(7);sway.bump(1.6,Math.random()<.5?-1:1);footsteps?.land(surfaceAt(targetPosition),1);{const feet=targetPosition.clone();feet.y-=1.72;puff(feet,10,.9);}wasAirborne=false;return;}
 if(airborne){airTime+=dt;airPeak=Math.max(airPeak,targetPosition.y-1.75);}else if(wasAirborne){
  const fell=airPeak-(targetPosition.y-1.75),res=Pk?.land(fell);airPeak=targetPosition.y-1.75;
  if(res?.kind==='roll'){proneT=0;rollTime=0;h.kick(4);{const feet=targetPosition.clone();feet.y-=1.72;puff(feet,8,.8);}}else if(res?.kind==='hard'){proneT=res.stun;momentum=0;h.playerBody?.anim?.('jumpLand',{fade:.06,speed:1.6});}footsteps?.land(surfaceAt(targetPosition),Math.min(1,airTime/.7));if(airTime>.45){const feet=targetPosition.clone();feet.y-=1.72;puff(feet,5,.7);}airTime=0;
  if(dive)landDive();
  // Land with C held at speed and you go straight into a slide.
  else if(crouchHeld&&!slide&&speed>4.2){slide={kind:'slide',dur:SLIDE_TIME,t:0,dir:walkVelocity.clone().setY(0).normalize(),speed:speed*1.15,noDive:true};footsteps?.slide(surfaceAt(targetPosition),SLIDE_TIME);}}
 wasAirborne=airborne;
 if(slide?.kind==='slide'&&!slide.belly&&crouchHeld&&slide.t>DIVE_HOLD&&slide.t<.4&&!airborne&&!slide.noDive)startDive();
 if(dive)dive.t+=dt;proneT=Math.max(0,proneT-dt);
 tryTackle();
 }
 function captureState(){return root.createMovementStateCodec({T}).encode({version:1,crouchHeld,crouchAmount,slide,airTime,wasAirborne,dive,proneT,diveCount,tackleCount,airPeak,coyote,jumpBuffer,vault,vaultCount,wallPops,rolls,lastTap,lastBump,bumpCount,momentum,jumpHold,rollTime});}
 function validateState(value){const s=root.createMovementStateCodec({T}).decode(value);
  if(s.version!==1||typeof s.crouchHeld!=='boolean'||typeof s.wasAirborne!=='boolean'||!['crouchAmount','airTime','proneT','diveCount','tackleCount','airPeak','coyote','jumpBuffer','vaultCount','wallPops','rolls','lastBump','bumpCount'].every(k=>Number.isFinite(s[k]))||s.crouchAmount<0||s.crouchAmount>1||!s.lastTap||!Number.isFinite(s.lastTap.a)||!Number.isFinite(s.lastTap.d))throw Error('Incompatible locomotion snapshot.');
  const nonnegative=['airTime','proneT','diveCount','tackleCount','coyote','jumpBuffer','vaultCount','wallPops','rolls','lastBump','bumpCount'];
  if(nonnegative.some(k=>s[k]<0)||['diveCount','tackleCount','vaultCount','wallPops','rolls','bumpCount'].some(k=>!Number.isSafeInteger(s[k])))throw Error('Invalid locomotion counters.');
  const vec=v=>v?.isVector3&&[v.x,v.y,v.z].every(Number.isFinite),numbers=(v,ks)=>ks.every(k=>Number.isFinite(v[k]));
  if(s.slide!==null&&(!s.slide||!['slide','dash'].includes(s.slide.kind)||!vec(s.slide.dir)||!numbers(s.slide,['speed','t','dur'])||s.slide.t<0||s.slide.dur<=0))throw Error('Invalid slide snapshot.');
  if(s.dive!==null&&(!s.dive||!vec(s.dive.dir)||!numbers(s.dive,['t','speed'])||s.dive.t<0))throw Error('Invalid dive snapshot.');
  if(s.vault!==null&&(!s.vault||!vec(s.vault.from)||!vec(s.vault.to)||!numbers(s.vault,['t','dur','lift','speed'])||s.vault.lead!==undefined&&!(Number.isFinite(s.vault.lead)&&s.vault.lead>=0&&s.vault.lead<=.5)||s.vault.t<0||s.vault.dur<=0))throw Error('Invalid vault snapshot.');
  if(s.momentum!==undefined&&(!Number.isFinite(s.momentum)||s.momentum<0||s.momentum>1)||s.jumpHold!==undefined&&(!Number.isFinite(s.jumpHold)||s.jumpHold<-1||s.jumpHold>1))throw Error('Invalid momentum snapshot.');
  if(s.rollTime!=null&&(!Number.isFinite(s.rollTime)||s.rollTime<0||s.rollTime>=ROLL_TIME))throw Error('Invalid landing roll clock.');
  return s;
 }
 function restoreState(value){const s=validateState(value);momentum=s.momentum??0;jumpHold=s.jumpHold??-1;rollTime=s.rollTime??null;
  ({crouchHeld,crouchAmount,slide,airTime,wasAirborne,dive,proneT,diveCount,tackleCount,airPeak,coyote,jumpBuffer,vault,vaultCount,wallPops,rolls,lastBump,bumpCount}=s);Object.assign(lastTap,s.lastTap);
 }
 // A blast throws the player: vel in m/s (up and away). Nearly ballistic until the landing.
 function launch(vel){if(!vel||h.playerBody?.downed?.())return false;cancelTraversal();slide=null;dive=null;rollTime=null;prepareWalking();
  const m=motion.inspect();motion.set(Math.max(m.height,.02),Math.max(vel.y,m.velocity||0));walkVelocity.set(vel.x,0,vel.z);blastFlight=true;wasAirborne=true;airPeak=targetPosition.y-1.75;jumpHold=-1;requestDraw();return true;}
 const api={launch,blastFlying:()=>blastFlight,captureState,restoreState,validateState,move,jump,updateJump,tryVault,cancelTraversal,bodyHeight,tryStep,startSlide,tapDodge,updateCrouch,updateAir,
  needsStep:()=>!!(keys.size||walkVelocity.lengthSq()||slide||vault||h.parkour()?.active()||momentum>0||rollTime!==null),
  momentum:()=>h.momentumEnabled?.()===false?0:momentum,
  traversal:()=>h.parkour()?.presentation?.()||(vault?{kind:'vault',time:vault.t,duration:vault.dur,lift:vaultLift(vault)}:dive?{kind:'dive',time:dive.t}:rollTime!==null?{kind:'roll',time:rollTime,duration:ROLL_TIME}:slide?{kind:slide.kind,time:slide.t,duration:slide.dur}:null),
  get slide(){return slide;},set slide(v){slide=v;},get dive(){return dive;},set dive(v){dive=v;},get vault(){return vault;},set vault(v){if(v===null)cancelTraversal();},
  // Exactly one answer to "what is the player doing".
  state:()=>h.parkour()?.kind()||(vault?'vault':dive?'dive':slide?slide.kind:motion.inspect().airborne?'air':proneT>0?'prone':crouchAmount>.1?'crouch':'ground'),
  get proneT(){return proneT;},set proneT(v){proneT=v;},get crouchHeld(){return crouchHeld;},set crouchHeld(v){crouchHeld=v;},get crouchAmount(){return crouchAmount;},
  unsticks:()=>unsticks,
  counts:()=>({vaults:vaultCount,wallPops,rolls,dives:diveCount,tackles:tackleCount,bumps:bumpCount})};
 return api;
 };
})(window);
