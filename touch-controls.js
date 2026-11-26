'use strict';
// One owner per finger; every held action has a matching release, including interruption.
(function(root){
 root.createTouchControls=function({host=null,look,combat,third,visible,armed,expedition=()=>false,arena=()=>false,leave=null,settings=null,actions=()=>({}),move,jump,jumpUp=null,crouch,onReset}){
  const media=matchMedia('(pointer:coarse), (any-pointer:coarse)');
  if(!media.matches&&!('ontouchstart'in root))return null;
  const abort=new AbortController(),listen=(node,type,fn,options={})=>node.addEventListener(type,fn,{...options,signal:abort.signal});
  // Touch buttons describe game actions, not the physical keys the player remapped.
  const key=(k,down)=>{const code=k===' '?'Space':/^\d$/.test(k)?'Digit'+k:k.length===1?'Key'+k.toUpperCase():k==='Shift'?'ShiftLeft':k;const event=new KeyboardEvent(down?'keydown':'keyup',{key:k,code,bubbles:true});Object.defineProperty(event,'edenTouchAction',{value:true});document.dispatchEvent(event);};
  const movementKey=move||key,cap=(node,id)=>{try{node.setPointerCapture(id);}catch{}};
  const uncap=(node,id)=>{try{if(id!==null&&node.hasPointerCapture(id))node.releasePointerCapture(id);}catch{}};
  const el=document.createElement('div');el.id='touch-controls';el.hidden=true;el.setAttribute('aria-label','Touch game controls');
  el.innerHTML=`<div class="tc-look" aria-hidden="true"></div><div class="tc-stick-zone" aria-hidden="true"></div><div class="tc-stick" role="group" aria-label="Movement joystick; drag inside the circle to walk, outside it to sprint"><i></i><span class="tc-stick-label">MOVE</span></div>
   <button type="button" class="tc-fire" aria-label="Fire">FIRE</button><button type="button" class="tc-aim" aria-label="Aim">AIM</button>
   <button type="button" class="tc-jump" aria-label="Jump">JUMP</button><button type="button" class="tc-slide" aria-label="Hold to crouch or slide while running">CROUCH</button>
   <button type="button" class="tc-use" aria-label="Interact">USE</button><button type="button" class="tc-reload" aria-label="Reload">RELOAD</button>
   <button type="button" class="tc-swap" aria-label="Next weapon">SWAP</button><button type="button" class="tc-melee" aria-label="Melee (hold for a slam)">HIT</button><button type="button" class="tc-guard" aria-label="Block (tap just before a hit to parry)">BLOCK</button>
   <button type="button" class="tc-third" aria-label="Switch camera view">VIEW</button><button type="button" class="tc-leave" aria-label="Leave arena and return to Eden" hidden>EDEN</button><button type="button" class="tc-settings" aria-label="Settings: look sensitivity, aim assist, graphics" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 0 0 1.7 1L11 21h4l.4-2.9a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg></button>`;
  (host||document.body).append(el);const q=s=>el.querySelector(s),stick=q('.tc-stick'),nub=stick.querySelector('i'),pad=q('.tc-look'),zone=q('.tc-stick-zone');
  let disposed=false,shown=false,sid=null,lid=null,origin=null,lastLook=null,held=new Set(),slot=0,lastMode=null;
  const releases=new Map(),blocked=()=>!!document.querySelector('dialog[open],#night-chat:not([hidden]),#social-panel:not([hidden])');
  const canInput=()=>!disposed&&!document.hidden&&visible()&&!blocked();
  function setKeys(x,y,sprint=false){const want=new Set();if(y<-.25)want.add('w');if(y>.25)want.add('s');if(x<-.25)want.add('a');if(x>.25)want.add('d');if(sprint&&want.size)want.add('Shift');
   for(const k of held)if(!want.has(k))movementKey(k,false);for(const k of want)if(!held.has(k))movementKey(k,true);held=want;
   if(stick.classList.contains('running')!==want.has('Shift')){stick.classList.toggle('running',want.has('Shift'));stick.querySelector('.tc-stick-label').textContent=want.has('Shift')?'SPRINTING':'MOVE';}
  }
  function endStick(){const id=sid;sid=null;origin=null;nub.style.transform='';stick.style.transform='';stick.classList.remove('floating');setKeys(0,0);uncap(stick,id);uncap(zone,id);}
  function endLook(){const id=lid;lid=null;lastLook=null;uncap(pad,id);}
  function reset(){endStick();endLook();for(const end of [...releases.values()])end();combat()?.touchFire?.(false);onReset?.();}
  function begin(e){if(e.button!==0||!canInput())return false;e.preventDefault();return true;}
  function updateStick(e){if(e.pointerId!==sid||!origin)return;if(!canInput()||(e.pointerType==='mouse'&&!(e.buttons&1))){endStick();return;}e.preventDefault();let dx=e.clientX-origin.x,dy=e.clientY-origin.y;const r=Math.hypot(dx,dy),max=origin.r,sprint=r>(held.has('Shift')?origin.walkRadius:origin.sprintRadius);if(r>max){dx*=max/r;dy*=max/r;}nub.style.transform=`translate(${dx}px,${dy}px)`;setKeys(dx/max,dy/max,sprint);}
  // Sprint holds until the finger is clearly back inside the circle, so resting on the edge does not flicker.
  const stickOrigin=()=>{const r=stick.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,r:r.width*.36,sprintRadius:r.width/2,walkRadius:r.width*.42};};
  listen(stick,'pointerdown',e=>{if(sid!==null||!begin(e))return;sid=e.pointerId;origin=stickOrigin();cap(stick,sid);updateStick(e);});
  listen(stick,'pointermove',updateStick,{passive:false});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(stick,type,e=>{if(e.pointerId===sid)endStick();});
  // Floating stick: a thumb landing anywhere on the lower left brings the stick to it, so a press that misses the
  // ring still walks. It goes home on release. Buttons on that side sit above the zone and keep their taps.
  listen(zone,'pointerdown',e=>{if(sid!==null||!begin(e))return;const home=stick.getBoundingClientRect(),cx=home.x+home.width/2,cy=home.y+home.height/2,half=home.width/2;
   const x=Math.max(half+4,Math.min(innerWidth*.5,e.clientX)),y=Math.max(innerHeight*.3,Math.min(innerHeight-half-4,e.clientY));
   stick.style.transform=`translate(${x-cx}px,${y-cy}px)`;stick.classList.add('floating');sid=e.pointerId;
   origin={x,y,r:home.width*.36,sprintRadius:half,walkRadius:home.width*.42};cap(zone,sid);updateStick(e);});
  listen(zone,'pointermove',updateStick,{passive:false});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(zone,type,e=>{if(e.pointerId===sid)endStick();});
  // Phone look: a touch pixel is worth more than a mouse pixel, and fast swipes turn further
  // (gentle acceleration) so one thumb can turn around while slow drags stay precise.
  // A small dead zone keeps a tap from nudging the view; the movement past it is kept.
  const LOOK_GAIN=1.7,LOOK_DEAD=5,touchSens=()=>{const v=+root.edenSettings?.get?.('touchSens');return Number.isFinite(v)&&v>0?v:1;};
  const lookFrom=(e,from)=>{const now=e.timeStamp||performance.now();return {x:e.clientX,y:e.clientY,t:now,live:from?.live??false,sx:from?.sx??e.clientX,sy:from?.sy??e.clientY,speed:from?.speed??0};};
  function lookMove(e,state){let dx=e.clientX-state.x,dy=e.clientY-state.y;const next=lookFrom(e,state);
   if(!state.live){if(Math.hypot(e.clientX-state.sx,e.clientY-state.sy)<LOOK_DEAD)return state;next.live=true;const d=Math.hypot(dx,dy)||1,keep=Math.max(0,d-LOOK_DEAD)/d;dx*=keep;dy*=keep;}
   const dt=Math.max(4,Math.min(50,next.t-state.t)),v=Math.hypot(dx,dy)/dt;next.speed=state.speed*.6+v*.4;
   const gain=LOOK_GAIN*touchSens()*(1+Math.min(1.1,Math.max(0,next.speed-.35)*.7));if(dx||dy)look(dx*gain,dy*gain);return next;}
  // A new finger always takes over looking, so a look finger iOS never released cannot block it.
  listen(pad,'pointerdown',e=>{if(!begin(e))return;if(lid!==null)endLook();lid=e.pointerId;lastLook=lookFrom(e);cap(pad,lid);});
  listen(pad,'pointermove',e=>{if(e.pointerId!==lid||!lastLook)return;if(!canInput()||(e.pointerType==='mouse'&&!(e.buttons&1))){endLook();return;}e.preventDefault();lastLook=lookMove(e,lastLook);},{passive:false});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(pad,type,e=>{if(e.pointerId===lid)endLook();});
  // The release callback is captured at press time; switching modes cannot strand a key.
  function hold(selector,start,{dragLook=false}={}){const b=q(selector);let pointer=null,last=null,release=null;
   const end=()=>{if(pointer===null)return;const id=pointer;pointer=null;last=null;b.classList.remove('on');releases.delete(b);const finish=release;release=null;finish?.();uncap(b,id);};
   listen(b,'pointerdown',e=>{if(pointer!==null||!begin(e))return;pointer=e.pointerId;last=lookFrom(e);cap(b,pointer);b.classList.add('on');releases.set(b,end);release=start();});
   listen(b,'pointermove',e=>{if(e.pointerId!==pointer)return;if(!canInput()||(e.pointerType==='mouse'&&!(e.buttons&1))){end();return;}e.preventDefault();if(dragLook&&last)last=lookMove(e,last);},{passive:false});
   for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(b,type,e=>{if(e.pointerId===pointer)end();});
   listen(b,'click',e=>{if(e.detail===0&&canInput()){const finish=start();finish?.();}});
  }
  const heldKey=k=>{key(k,true);return()=>key(k,false);};
  hold('.tc-fire',()=>{const c=combat();if(expedition())return heldKey('g');if(c?.armed()){c.touchFire(true);return()=>c.touchFire(false);}return c?.canRaise?.()?(c.touchFire(true),()=>c.touchFire(false)):heldKey('f');},{dragLook:true});
  hold('.tc-aim',()=>{combat()?.toggleZoom?.();},{dragLook:true});
  hold('.tc-jump',()=>{if(jump){const release=jump(true);return typeof release==='function'?release:jumpUp||(()=>jump(false));}return heldKey(' ');},{dragLook:true});
  hold('.tc-slide',()=>{if(crouch){crouch(true);return()=>crouch(false);}return heldKey('c');},{dragLook:true});
  hold('.tc-use',()=>heldKey(expedition()?'e':'f'));
  hold('.tc-reload',()=>heldKey('r'));
  // HIT follows the keyboard melee rule: tap to bash, hold to slam. BLOCK raises the guard while held.
  hold('.tc-melee',()=>{const c=combat();if(c?.touchMeleeDown){c.touchMeleeDown();return()=>c.touchMeleeUp();}c?.touchMelee?.();},{dragLook:true});
  hold('.tc-guard',()=>{const c=combat();if(!c?.touchGuard)return;c.touchGuard(true);return()=>c.touchGuard(false);},{dragLook:true});
  hold('.tc-third',()=>{third();});
  hold('.tc-leave',()=>{reset();leave?.();});
  hold('.tc-settings',()=>{reset();settings?.();});
  hold('.tc-swap',()=>{const c=combat();if(c?.cycle&&c.arsenal?.inspect?.()){c.cycle();return;}const ids=c?.arsenal?.inspect?.()?.owned||['axe','pistol'],guns=ids.length?ids:['pistol'];slot=(slot+1)%(guns.length+1);if(slot===guns.length){if(c?.armed())heldKey('x')();}else heldKey(String(slot+1))();});
  function sync(){if(disposed)return;const on=!!canInput(),isExpedition=!!expedition(),mode=isExpedition?'expedition':armed()?'armed':'unarmed';
   // Holstering or drawing changes the buttons, not the fingers: release button holds only,
   // so the move thumb and the look thumb keep working through SWAP.
   if(lastMode!==mode){for(const end of [...releases.values()])end();combat()?.touchFire?.(false);lastMode=mode;}
   if(on!==shown){shown=on;el.hidden=!on;document.body.classList.toggle('touch-play',on);if(!on)reset();}
   el.classList.toggle('armed',mode!=='unarmed');el.classList.toggle('tc-expedition',isExpedition);el.classList.toggle('tc-arena',arena());document.body.classList.toggle('touch-arena',on&&arena());
   const hide=(selector,hidden)=>{const button=q(selector);if(hidden)releases.get(button)?.();button.hidden=hidden;};
   hide('.tc-leave',!arena()||!leave);hide('.tc-settings',!settings);
   for(const selector of ['.tc-aim','.tc-melee'])hide(selector,mode!=='armed');hide('.tc-swap',isExpedition);
   const available=actions();hide('.tc-fire',isExpedition&&available.fire===false);hide('.tc-reload',mode==='unarmed'||isExpedition&&available.reload===false);
   q('.tc-fire').textContent=isExpedition?'FLARE':mode==='armed'?'FIRE':'PUNCH';q('.tc-fire').setAttribute('aria-label',isExpedition?'Fire nonlethal flare':mode==='armed'?'Fire':'Punch');
   combat()?.setTouch?.(on&&!isExpedition);
  }
  const timer=setInterval(sync,180),observer=new MutationObserver(()=>{if(blocked()&&shown){reset();sync();}});
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  for(const id of ['night-chat','social-panel']){const panel=document.getElementById(id);if(panel)observer.observe(panel,{attributes:true,attributeFilter:['hidden']});}
  for(const type of ['blur','pagehide','orientationchange'])listen(root,type,reset);
  // iOS resizes the viewport as its address bar slides: keep held fingers, re-measure the stick.
  const remeasure=()=>{if(sid!==null&&!stick.classList.contains('floating'))origin=stickOrigin();};listen(root,'resize',remeasure);if(root.visualViewport)listen(root.visualViewport,'resize',remeasure);
  listen(document,'visibilitychange',()=>{reset();sync();});listen(document,'btr:page-visibility',()=>{reset();sync();});
  if(document.body.classList.contains('expedition-entry'))document.body.classList.add('entry-touch');sync();
  return {element:el,reset,dispose(){if(disposed)return;disposed=true;clearInterval(timer);observer.disconnect();abort.abort();reset();combat()?.setTouch?.(false);document.body.classList.remove('touch-play','touch-arena','entry-touch');el.remove();},inspect:()=>({shown,keys:[...held],stick:sid!==null,look:lid!==null,actions:releases.size,mode:lastMode})};
 };
})(window);
