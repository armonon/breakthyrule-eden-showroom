'use strict';
// One owner per finger; every held action has a matching release, including interruption.
(function(root){
 root.createTouchControls=function({host=null,look,combat,third,visible,armed,expedition=()=>false,move,jump,crouch,onReset}){
  const media=matchMedia('(pointer:coarse), (any-pointer:coarse)');
  if(!media.matches&&!('ontouchstart'in root))return null;
  const abort=new AbortController(),listen=(node,type,fn,options={})=>node.addEventListener(type,fn,{...options,signal:abort.signal});
  const key=(k,down)=>{const code=k===' '?'Space':/^\d$/.test(k)?'Digit'+k:k.length===1?'Key'+k.toUpperCase():k==='Shift'?'ShiftLeft':k;document.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:k,code,bubbles:true}));};
  const movementKey=move||key,cap=(node,id)=>{try{node.setPointerCapture(id);}catch{}};
  const uncap=(node,id)=>{try{if(id!==null&&node.hasPointerCapture(id))node.releasePointerCapture(id);}catch{}};
  const el=document.createElement('div');el.id='touch-controls';el.hidden=true;el.setAttribute('aria-label','Touch game controls');
  el.innerHTML=`<div class="tc-look" aria-hidden="true"></div><div class="tc-stick" role="group" aria-label="Movement joystick; push forward fully to sprint"><i></i><span class="tc-stick-label">MOVE</span></div>
   <button type="button" class="tc-fire" aria-label="Fire">FIRE</button><button type="button" class="tc-aim" aria-label="Aim">AIM</button>
   <button type="button" class="tc-jump" aria-label="Jump">JUMP</button><button type="button" class="tc-slide" aria-label="Hold to crouch or slide while running">CROUCH</button>
   <button type="button" class="tc-use" aria-label="Interact">USE</button><button type="button" class="tc-reload" aria-label="Reload">RELOAD</button>
   <button type="button" class="tc-swap" aria-label="Next weapon">SWAP</button><button type="button" class="tc-melee" aria-label="Melee">HIT</button>
   <button type="button" class="tc-third" aria-label="Switch camera view">VIEW</button>`;
  (host||document.body).append(el);const q=s=>el.querySelector(s),stick=q('.tc-stick'),nub=stick.querySelector('i'),pad=q('.tc-look');
  let disposed=false,shown=false,sid=null,lid=null,origin=null,lastLook=null,held=new Set(),slot=0,lastMode=null;
  const releases=new Map(),blocked=()=>!!document.querySelector('dialog[open],#night-chat:not([hidden]),#social-panel:not([hidden])');
  const canInput=()=>!disposed&&!document.hidden&&visible()&&!blocked();
  function setKeys(x,y){const want=new Set();if(y<-.25)want.add('w');if(y>.25)want.add('s');if(x<-.25)want.add('a');if(x>.25)want.add('d');if(Math.hypot(x,y)>.88&&y<-.25)want.add('Shift');
   for(const k of held)if(!want.has(k))movementKey(k,false);for(const k of want)if(!held.has(k))movementKey(k,true);held=want;
   stick.classList.toggle('running',want.has('Shift'));stick.querySelector('.tc-stick-label').textContent=want.has('Shift')?'RUNNING':'MOVE';
  }
  function endStick(){const id=sid;sid=null;origin=null;nub.style.transform='';setKeys(0,0);uncap(stick,id);}
  function endLook(){const id=lid;lid=null;lastLook=null;uncap(pad,id);}
  function reset(){endStick();endLook();for(const end of [...releases.values()])end();combat()?.touchFire?.(false);onReset?.();}
  function begin(e){if(e.button!==0||!canInput())return false;e.preventDefault();return true;}
  function updateStick(e){if(e.pointerId!==sid||!origin)return;if(!canInput()||(e.pointerType==='mouse'&&!(e.buttons&1))){endStick();return;}e.preventDefault();let dx=e.clientX-origin.x,dy=e.clientY-origin.y;const r=Math.hypot(dx,dy),max=origin.r;if(r>max){dx*=max/r;dy*=max/r;}nub.style.transform=`translate(${dx}px,${dy}px)`;setKeys(dx/max,dy/max);}
  listen(stick,'pointerdown',e=>{if(sid!==null||!begin(e))return;sid=e.pointerId;const r=stick.getBoundingClientRect();origin={x:r.x+r.width/2,y:r.y+r.height/2,r:r.width*.36};cap(stick,sid);updateStick(e);});
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
  hold('.tc-jump',()=>{if(jump){jump();return;}return heldKey(' ');});
  hold('.tc-slide',()=>{if(crouch){crouch(true);return()=>crouch(false);}return heldKey('c');});
  hold('.tc-use',()=>heldKey(expedition()?'e':'f'));
  hold('.tc-reload',()=>heldKey('r'));
  hold('.tc-melee',()=>{combat()?.touchMelee?.();});
  hold('.tc-third',()=>{third();});
  hold('.tc-swap',()=>{const c=combat(),ids=c?.arsenal?.inspect?.()?.owned||['axe','pistol'],guns=ids.length?ids:['pistol'];slot=(slot+1)%(guns.length+1);if(slot===guns.length){if(c?.armed())heldKey('x')();}else heldKey(String(slot+1))();});
  function sync(){if(disposed)return;const on=!!canInput(),isExpedition=!!expedition(),mode=isExpedition?'expedition':armed()?'armed':'unarmed';
   if(lastMode!==mode){reset();lastMode=mode;}
   if(on!==shown){shown=on;el.hidden=!on;document.body.classList.toggle('touch-play',on);if(!on)reset();}
   el.classList.toggle('armed',mode!=='unarmed');el.classList.toggle('tc-expedition',isExpedition);
   for(const selector of ['.tc-aim','.tc-swap','.tc-melee'])q(selector).hidden=isExpedition;
   q('.tc-fire').textContent=isExpedition?'FLARE':mode==='armed'?'FIRE':'PUNCH';q('.tc-fire').setAttribute('aria-label',isExpedition?'Fire nonlethal flare':mode==='armed'?'Fire':'Punch');
   combat()?.setTouch?.(on&&!isExpedition);
  }
  const timer=setInterval(sync,180),observer=new MutationObserver(()=>{if(blocked()&&shown){reset();sync();}});
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  for(const id of ['night-chat','social-panel']){const panel=document.getElementById(id);if(panel)observer.observe(panel,{attributes:true,attributeFilter:['hidden']});}
  for(const type of ['blur','pagehide','resize','orientationchange'])listen(root,type,reset);
  listen(document,'visibilitychange',()=>{reset();sync();});listen(document,'btr:page-visibility',()=>{reset();sync();});
  if(document.body.classList.contains('expedition-entry'))document.body.classList.add('entry-touch');sync();
  return {element:el,reset,dispose(){if(disposed)return;disposed=true;clearInterval(timer);observer.disconnect();abort.abort();reset();combat()?.setTouch?.(false);document.body.classList.remove('touch-play','entry-touch');el.remove();},inspect:()=>({shown,keys:[...held],stick:sid!==null,look:lid!==null,actions:releases.size,mode:lastMode})};
 };
})(window);
