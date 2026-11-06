'use strict';
// How the player moves: walking, sprinting, jumping, crouching, slides, dives, vaults and landings, with parkour.js for
// the moves on walls and ledges. Host hooks (app.js) give it the player's position and the world; values that exist
// only later in start-up (combat, battle...) are read through getters.
(function(root){
 root.createPlayerMovement=function(h){
 const {T,targetPosition,targetAim,walkVelocity,motion,keys,sway,footsteps,surfaceAt,puff,hitStop,requestDraw,obstacle,groundHeight,prepareWalking,shiftHeight}=h;
 const SLIDE_TIME=.75;
 let crouchHeld=false,crouchAmount=0,slide=null,airTime=0,wasAirborne=false,dive=null,proneT=0,diveCount=0,tackleCount=0,airPeak=0;
 // Forgiveness: a jump still counts just after walking off an edge, and a press made too early is kept for a moment.
 const COYOTE=.12,JUMP_BUFFER=.15;
 let coyote=0,jumpBuffer=0;
function move(dt){
 if(h.parkour()?.active()){if(h.parkourOn())h.parkour().update(dt);else h.parkour().reset();return;}
 if(updateVault(dt))return;
 if((h.expedition&&!h.expedition.canMove())||(h.battle&&!h.battle.canMove())||(h.fists&&!h.fists.canMove())||h.playerBody?.downed()){walkVelocity.set(0,0,0);return;}
 const z=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),x=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
 const forward=targetAim.clone().sub(targetPosition);forward.y=0;forward.normalize();const right=new T.Vector3().crossVectors(forward,new T.Vector3(0,1,0));
 const crouched=crouchAmount>.5&&!slide;
 const wish=forward.multiplyScalar(z).add(right.multiplyScalar(x));if(wish.lengthSq())wish.normalize().multiplyScalar((crouched?motion.speed(false)*.45:motion.speed(keys.has('shift')))*(1-.13*(h.combat?.weight?.()||0))*(1-.38*(h.combat?.ads?.()||0))*(proneT>0?.35:1));
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
  walkVelocity.lerp(wish,1-Math.exp(-(air?(wish.lengthSq()?1.5:.2):wish.lengthSq()?9:11)*dt));}
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
 const next=h.garden.constrain(targetPosition.clone().add(step),targetPosition,P?feet:null);
 // Battles and the firing range take place beyond Eden without an expedition, so its gate (and its entry screen) stays out of them.
 if(!h.battle?.busy?.()&&!h.battle?.active()&&!h.combat?.inRange())h.expedition?.constrain(next,targetPosition);
 if(obstacle(next))return null;
 if(P){
  // Stand on the highest surface under you (roofs, crates, wall tops); walk off an edge and you fall (or, holding C,
  // catch it and hang); land on whatever is under you mid-air.
  if(P.solid(next.x,next.z,feet,feet+1.7,.2))return null;
  const floor=P.floorAt(next.x,next.z,feet+.45),m=motion.inspect();
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
 const speed=Math.hypot(walkVelocity.x,walkVelocity.z),dir=slide.dir.clone();slide=null;
 dive={t:0,dir,speed:Math.max(speed,6.5)*1.15};walkVelocity.copy(dir).multiplyScalar(dive.speed);motion.jump(4.3);diveCount++;
 h.combat?.dropAim?.();sway.bump(.5,0);h.kick(5);footsteps?.step(surfaceAt(targetPosition),8);requestDraw();
}
function landDive(){
 const speed=Math.hypot(walkVelocity.x,walkVelocity.z);
 // Holding a direction as you land turns the belly flop into a roll: back on your feet almost at once, still moving.
 if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].some(k=>keys.has(k))){rolls++;sway.bump(.6,Math.random()<.5?-1:1);footsteps?.land(surfaceAt(targetPosition),.7);{const feet=targetPosition.clone();feet.y-=1.72;puff(feet,6,.7);}
  slide={kind:'slide',dur:.4,t:0,dir:dive.dir.clone(),speed:Math.max(4.5,speed*.85),belly:true,roll:true};proneT=.22;h.kick(3);dive=null;return;}
 sway.bump(1.1,Math.random()<.5?-1:1);footsteps?.land(surfaceAt(targetPosition),1);hitStop(45);
 {const feet=targetPosition.clone();feet.y-=1.72;puff(feet,9,.9);}
 slide={kind:'slide',dur:.55,t:0,dir:dive.dir.clone(),speed:Math.max(3.2,speed*.7),belly:true};footsteps?.slide(surfaceAt(targetPosition),.55);
 proneT=.75;dive=null;
}
// Vault: jump into something low (a chest, a low wall, a bench) and you hop over it to the far side.
let vault=null,vaultCount=0,wallPops=0,rolls=0;
function tryVault(dir){
 if(vault||!h.combat?.worldHits||h.arena?.active())return false;
 const feet=targetPosition.y-1.75-motion.inspect().height,d=dir.clone().setY(0);if(d.lengthSq()<1e-4)return false;d.normalize();
 // Open above: nothing at head height just ahead...
 const head=new T.Vector3(targetPosition.x,feet+1.5,targetPosition.z);if(h.combat.worldHits(head,d,1.1))return false;
 // ...and something low there: a top surface between knee and chest height.
 let top=null;for(const k of [.35,.55,.8]){const h=h.combat.worldHits(head.clone().addScaledVector(d,k),new T.Vector3(0,-1,0),1.5);if(h&&h.point.y>=feet+.3&&h.point.y<=feet+1.3){top=h;break;}}
 if(!top)return false;
 for(const k of [1,1.3,1.6,1.9,2.2]){const to=tryStep(d.clone().multiplyScalar(k));if(to){vault={from:targetPosition.clone(),to,aim:targetAim.clone(),t:0,dur:.42,lift:top.point.y-feet+.25,speed:Math.max(3.5,Math.hypot(walkVelocity.x,walkVelocity.z))};vaultCount++;slide=null;dive=null;motion.reset();sway.bump(.35,0);footsteps?.step(surfaceAt(targetPosition),6);requestDraw();return true;}}
 return false;
}
function updateVault(dt){
 if(!vault)return false;vault.t+=dt;const k=Math.min(1,vault.t/vault.dur),e=k*k*(3-2*k);
 const p=vault.from.clone().lerp(vault.to,e);p.y+=Math.sin(k*Math.PI)*vault.lift;const delta=p.clone().sub(targetPosition);targetPosition.copy(p);targetAim.add(delta);
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
 const t=performance.now(),quick=t-lastTap[key]<260;lastTap[key]=quick?0:t;
 if(!quick||slide||motion.inspect().airborne||h.playerBody?.downed()||!(h.fistsEngaged()||h.battle?.active()||h.combat?.armed()))return;
 const forward=targetAim.clone().sub(targetPosition).setY(0).normalize(),side=new T.Vector3().crossVectors(forward,new T.Vector3(0,1,0)).multiplyScalar(key==='d'?1:-1);
 prepareWalking();slide={kind:'dash',dur:.26,t:0,dir:side,speed:8};h.fists?.dodge();footsteps?.step(surfaceAt(targetPosition),7);requestDraw();
}
// Running or sliding into something: a jolt through the view (rolled towards the side that hit), a thud, and on a
// hard hit a short frame hold.
let lastBump=0,bumpCount=0;
function wallHit(into){
 const impact=into.length(),t=performance.now();if(impact<2.4||t-lastBump<300)return;lastBump=t;bumpCount++;
 const forward=targetAim.clone().sub(targetPosition).setY(0).normalize(),right=new T.Vector3().crossVectors(forward,new T.Vector3(0,1,0));
 const k=Math.min(1.4,impact/6);sway.bump(k,Math.sign(into.dot(right))||0);footsteps?.land(surfaceAt(targetPosition),Math.min(1,impact/8));
 h.kick(-(4*k));if(impact>5.5)hitStop(40+impact*4);{const feet=targetPosition.clone();feet.y-=1.72;puff(feet,Math.round(3+4*k),.6);}requestDraw();
}
function jump(){if(!h.state.ready||h.modalOpen()||h.expedition&&!h.expedition.canMove()||h.fists&&!h.fists.canMove())return;
 const P=h.pk(),m=motion.inspect(),late=coyote>0&&m.airborne&&m.velocity<=0;
 if(P?.busy()||vault){jumpBuffer=JUMP_BUFFER;return;}
 if(P?.onJump({late})){slide=null;dive=null;jumpBuffer=0;coyote=0;requestDraw();return;}
 if(m.airborne&&!late){jumpBuffer=JUMP_BUFFER;return;}prepareWalking();
 // Jumping out of a slide carries its speed and a little more.
 if(slide?.kind==='slide'){walkVelocity.multiplyScalar(1.12);slide=null;}
 if(late)motion.set(m.height,motion.impulse);else motion.jump();jumpBuffer=0;coyote=0;airPeak=targetPosition.y-1.75-(late?m.height:0);requestDraw();}
function updateJump(dt){coyote=Math.max(0,coyote-dt);if(jumpBuffer>0){jumpBuffer=Math.max(0,jumpBuffer-dt);if(!motion.inspect().airborne&&!vault&&!h.parkour()?.active())jump();}if(!motion.inspect().airborne)return;const before=motion.inspect().height;if(h.expedition&&!h.expedition.canMove())motion.reset();else motion.step(dt);shiftHeight(motion.inspect().height-before);}
 function updateCrouch(dt){crouchAmount+=(((crouchHeld||slide?.kind==='slide')&&!h.arena?.active()?1:0)-crouchAmount)*(1-Math.exp(-14*dt));}
 // Landings, wall and ledge moves in the air, and what follows from them.
 function updateAir(dt,speed,airborne){
 const Pk=h.parkourOn()?h.parkour():null;if(Pk&&!Pk.active()){Pk.update(dt);if(airborne)Pk.air(dt);}
 // Parkour owns the player while it is active: a caught ledge is not a landing, and a later fall counts from where you let go.
 if(h.parkour()?.active()){slide=null;dive=null;airTime=0;wasAirborne=false;airPeak=targetPosition.y-1.75;proneT=Math.max(0,proneT-dt);return;}
 if(airborne){airTime+=dt;airPeak=Math.max(airPeak,targetPosition.y-1.75);}else if(wasAirborne){
  const fell=airPeak-(targetPosition.y-1.75),res=Pk?.land(fell);airPeak=targetPosition.y-1.75;
  if(res?.kind==='roll'){proneT=0;h.kick(4);h.playerBody?.anim?.('roll',{fade:.06,speed:1.9});{const feet=targetPosition.clone();feet.y-=1.72;puff(feet,8,.8);}}else if(res?.kind==='hard'){proneT=res.stun;h.playerBody?.anim?.('jumpLand',{fade:.06,speed:1.6});}footsteps?.land(surfaceAt(targetPosition),Math.min(1,airTime/.7));if(airTime>.45){const feet=targetPosition.clone();feet.y-=1.72;puff(feet,5,.7);}airTime=0;
  if(dive)landDive();
  // Land with C held at speed and you go straight into a slide.
  else if(crouchHeld&&!slide&&speed>4.2){slide={kind:'slide',dur:SLIDE_TIME,t:0,dir:walkVelocity.clone().setY(0).normalize(),speed:speed*1.15,noDive:true};footsteps?.slide(surfaceAt(targetPosition),SLIDE_TIME);}}
 wasAirborne=airborne;
 if(slide?.kind==='slide'&&!slide.belly&&crouchHeld&&slide.t>DIVE_HOLD&&slide.t<.4&&!airborne&&!slide.noDive)startDive();
 if(dive)dive.t+=dt;proneT=Math.max(0,proneT-dt);
 tryTackle();
 }
 const api={move,jump,updateJump,tryVault,tryStep,startSlide,tapDodge,updateCrouch,updateAir,
  needsStep:()=>!!(keys.size||walkVelocity.lengthSq()||slide||vault||h.parkour()?.active()),
  get slide(){return slide;},set slide(v){slide=v;},get dive(){return dive;},set dive(v){dive=v;},get vault(){return vault;},
  // Exactly one answer to "what is the player doing".
  state:()=>h.parkour()?.kind()||(vault?'vault':dive?'dive':slide?slide.kind:motion.inspect().airborne?'air':proneT>0?'prone':'ground'),
  get proneT(){return proneT;},set proneT(v){proneT=v;},get crouchHeld(){return crouchHeld;},set crouchHeld(v){crouchHeld=v;},get crouchAmount(){return crouchAmount;},
  counts:()=>({vaults:vaultCount,wallPops,rolls,dives:diveCount,tackles:tackleCount,bumps:bumpCount})};
 return api;
 };
})(window);
