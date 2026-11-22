'use strict';
// One owner per finger; every held action has a matching release, including interruption.
(function(root){
 root.createTouchControls=function({host=null,look,combat,third,visible,armed,expedition=()=>false,arena=()=>false,leave=null,actions=()=>({}),move,jump,jumpUp=null,crouch,onReset}){
  const media=matchMedia('(pointer:coarse), (any-pointer:coarse)');
  if(!media.matches&&!('ontouchstart'in root))return null;
  const abort=new AbortController(),listen=(node,type,fn,options={})=>node.addEventListener(type,fn,{...options,signal:abort.signal});
  // Touch buttons describe game actions, not the physical keys the player remapped.
  const key=(k,down)=>{const code=k===' '?'Space':/^\d$/.test(k)?'Digit'+k:k.length===1?'Key'+k.toUpperCase():k==='Shift'?'ShiftLeft':k;const event=new KeyboardEvent(down?'keydown':'keyup',{key:k,code,bubbles:true});Object.defineProperty(event,'edenTouchAction',{value:true});document.dispatchEvent(event);};
  const movementKey=move||key,cap=(node,id)=>{try{node.setPointerCapture(id);}catch{}};
  const uncap=(node,id)=>{try{if(id!==null&&node.hasPointerCapture(id))node.releasePointerCapture(id);}catch{}};
  const el=document.createElement('div');el.id='touch-controls';el.hidden=true;el.setAttribute('aria-label','Touch game controls');
  el.innerHTML=`<div class="tc-look" aria-hidden="true"></div><div class="tc-stick" role="group" aria-label="Movement joystick; drag inside the circle to walk, outside it to sprint"><i></i><span class="tc-stick-label">MOVE</span></div>
   <button type="button" class="tc-fire" aria-label="Fire">FIRE</button><button type="button" class="tc-aim" aria-label="Aim">AIM</button>
   <button type="button" class="tc-jump" aria-label="Jump">JUMP</button><button type="button" class="tc-slide" aria-label="Hold to crouch or slide while running">CROUCH</button>
   <button type="button" class="tc-use" aria-label="Interact">USE</button><button type="button" class="tc-reload" aria-label="Reload">RELOAD</button>
   <button type="button" class="tc-swap" aria-label="Next weapon">SWAP</button><button type="button" class="tc-melee" aria-label="Melee (hold for a slam)">HIT</button><button type="button" class="tc-guard" aria-label="Block (tap just before a hit to parry)">BLOCK</button>
   <button type="button" class="tc-third" aria-label="Switch camera view">VIEW</button><button type="button" class="tc-leave" aria-label="Leave arena and return to Eden" hidden>EDEN</button>`;
  (host||document.body).append(el);const q=s=>el.querySelector(s),stick=q('.tc-stick'),nub=stick.querySelector('i'),pad=q('.tc-look');
  let disposed=false,shown=false,sid=null,lid=null,origin=null,lastLook=null,held=new Set(),slot=0,lastMode=null;
  const releases=new Map(),blocked=()=>!!document.querySelector('dialog[open],#night-chat:not([hidden]),#social-panel:not([hidden])');
  const canInput=()=>!disposed&&!document.hidden&&visible()&&!blocked();
  function setKeys(x,y,sprint=false){const want=new Set();if(y<-.25)want.add('w');if(y>.25)want.add('s');if(x<-.25)want.add('a');if(x>.25)want.add('d');if(sprint&&want.size)want.add('Shift');
   for(const k of held)if(!want.has(k))movementKey(k,false);for(const k of want)if(!held.has(k))movementKey(k,true);held=want;
   if(stick.classList.contains('running')!==want.has('Shift')){stick.classList.toggle('running',want.has('Shift'));stick.querySelector('.tc-stick-label').textContent=want.has('Shift')?'SPRINTING':'MOVE';}
  }
  function endStick(){const id=sid;sid=null;origin=null;nub.style.transform='';setKeys(0,0);uncap(stick,id);}
  function endLook(){const id=lid;lid=null;lastLook=null;uncap(pad,id);}
  function reset(){endStick();endLook();for(const end of [...releases.values()])end();combat()?.touchFire?.(false);onReset?.();}
  function begin(e){if(e.button!==0||!canInput())return false;e.preventDefault();return true;}
  function updateStick(e){if(e.pointerId!==sid||!origin)return;if(!canInput()||(e.pointerType==='mouse'&&!(e.buttons&1))){endStick();return;}e.preventDefault();let dx=e.clientX-origin.x,dy=e.clientY-origin.y;const r=Math.hypot(dx,dy),max=origin.r,sprint=r>(held.has('Shift')?origin.walkRadius:origin.sprintRadius);if(r>max){dx*=max/r;dy*=max/r;}nub.style.transform=`translate(${dx}px,${dy}px)`;setKeys(dx/max,dy/max,sprint);}
  // Sprint holds until the finger is clearly back inside the circle, so resting on the edge does not flicker.
  const stickOrigin=()=>{const r=stick.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,r:r.width*.36,sprintRadius:r.width/2,walkRadius:r.width*.42};};
  listen(stick,'pointerdown',e=>{if(sid!==null||!begin(e))return;sid=e.pointerId;origin=stickOrigin();cap(stick,sid);updateStick(e);});
  listen(stick,'pointermove',updateStick,{passive:false});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(stick,type,e=>{if(e.pointerId===sid)endStick();});
  listen(pad,'pointerdown',e=>{if(lid!==null||!begin(e))return;lid=e.pointerId;lastLook={x:e.clientX,y:e.clientY};cap(pad,lid);});
  listen(pad,'pointermove',e=>{if(e.pointerId!==lid||!lastLook)return;if(!canInput()||(e.pointerType==='mouse'&&!(e.buttons&1))){endLook();return;}e.preventDefault();const dx=e.clientX-lastLook.x,dy=e.clientY-lastLook.y;lastLook={x:e.clientX,y:e.clientY};look(dx,dy);},{passive:false});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(pad,type,e=>{if(e.pointerId===lid)endLook();});
  // The release callback is captured at press time; switching modes cannot strand a key.
  function hold(selector,start,{dragLook=false}={}){const b=q(selector);let pointer=null,last=null,release=null;
   const end=()=>{if(pointer===null)return;const id=pointer;pointer=null;last=null;b.classList.remove('on');releases.delete(b);const finish=release;release=null;finish?.();uncap(b,id);};
   listen(b,'pointerdown',e=>{if(pointer!==null||!begin(e))return;pointer=e.pointerId;last={x:e.clientX,y:e.clientY};cap(b,pointer);b.classList.add('on');releases.set(b,end);release=start();});
   listen(b,'pointermove',e=>{if(e.pointerId!==pointer)return;if(!canInput()||(e.pointerType==='mouse'&&!(e.buttons&1))){end();return;}e.preventDefault();if(dragLook&&last){look(e.clientX-last.x,e.clientY-last.y);last={x:e.clientX,y:e.clientY};}},{passive:false});
   for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(b,type,e=>{if(e.pointerId===pointer)end();});
   listen(b,'click',e=>{if(e.detail===0&&canInput()){const finish=start();finish?.();}});
  }
  const heldKey=k=>{key(k,true);return()=>key(k,false);};
  hold('.tc-fire',()=>{const c=combat();if(expedition())return heldKey('g');if(c?.armed()){c.touchFire(true);return()=>c.touchFire(false);}return heldKey('f');},{dragLook:true});
  hold('.tc-aim',()=>{combat()?.toggleZoom?.();});
  hold('.tc-jump',()=>{if(jump){const release=jump(true);return typeof release==='function'?release:jumpUp||(()=>jump(false));}return heldKey(' ');});
  hold('.tc-slide',()=>{if(crouch){crouch(true);return()=>crouch(false);}return heldKey('c');});
  hold('.tc-use',()=>heldKey(expedition()?'e':'f'));
  hold('.tc-reload',()=>heldKey('r'));
  // HIT follows the keyboard melee rule: tap to bash, hold to slam. BLOCK raises the guard while held.
  hold('.tc-melee',()=>{const c=combat();if(c?.touchMeleeDown){c.touchMeleeDown();return()=>c.touchMeleeUp();}c?.touchMelee?.();});
  hold('.tc-guard',()=>{const c=combat();if(!c?.touchGuard)return;c.touchGuard(true);return()=>c.touchGuard(false);});
  hold('.tc-third',()=>{third();});
  hold('.tc-leave',()=>{reset();leave?.();});
  hold('.tc-swap',()=>{const c=combat(),ids=c?.arsenal?.inspect?.()?.owned||['axe','pistol'],guns=ids.length?ids:['pistol'];slot=(slot+1)%(guns.length+1);if(slot===guns.length){if(c?.armed())heldKey('x')();}else heldKey(String(slot+1))();});
  function sync(){if(disposed)return;const on=!!canInput(),isExpedition=!!expedition(),mode=isExpedition?'expedition':armed()?'armed':'unarmed';
   if(lastMode!==mode){reset();lastMode=mode;}
   if(on!==shown){shown=on;el.hidden=!on;document.body.classList.toggle('touch-play',on);if(!on)reset();}
   el.classList.toggle('armed',mode!=='unarmed');el.classList.toggle('tc-expedition',isExpedition);el.classList.toggle('tc-arena',arena());document.body.classList.toggle('touch-arena',on&&arena());
   const hide=(selector,hidden)=>{const button=q(selector);if(hidden)releases.get(button)?.();button.hidden=hidden;};
   hide('.tc-leave',!arena()||!leave);
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
  const remeasure=()=>{if(sid!==null)origin=stickOrigin();};listen(root,'resize',remeasure);if(root.visualViewport)listen(root.visualViewport,'resize',remeasure);
  listen(document,'visibilitychange',()=>{reset();sync();});listen(document,'btr:page-visibility',()=>{reset();sync();});
  if(document.body.classList.contains('expedition-entry'))document.body.classList.add('entry-touch');sync();
  return {element:el,reset,dispose(){if(disposed)return;disposed=true;clearInterval(timer);observer.disconnect();abort.abort();reset();combat()?.setTouch?.(false);document.body.classList.remove('touch-play','touch-arena','entry-touch');el.remove();},inspect:()=>({shown,keys:[...held],stick:sid!==null,look:lid!==null,actions:releases.size,mode:lastMode})};
 };
})(window);
