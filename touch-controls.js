'use strict';
// On-screen controls for phones and tablets: a movement stick on the left (W A S D, sprint at full tilt), a look pad on
// the right half (drag), and buttons that send the same keys the keyboard does, so every mechanic (slides, dives,
// pages, chests, weapons) works the same. Fire, melee, aim and look go straight to combat.js (no pointer lock on touch).
//
// Host hooks (app.js): createTouchControls({look(dx,dy), combat:()=>combat, third(), visible:()=>bool, armed:()=>bool})
(function(root){
 root.createTouchControls=function({host=null,look,combat,third,visible,armed}){
  const coarse=matchMedia('(pointer:coarse)').matches||'ontouchstart'in root;
  if(!coarse)return null;
  const key=(k,down)=>{const code=k===' '?'Space':k.length===1?'Key'+k.toUpperCase():k;document.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:k,code,bubbles:true}));};
  const cap=(node,id)=>{try{node.setPointerCapture(id);}catch{}};
  const el=document.createElement('div');el.id='touch-controls';el.hidden=true;
  el.innerHTML=`<div class="tc-look"></div><div class="tc-stick"><i></i></div>
   <button class="tc-fire" aria-label="Fire">FIRE</button><button class="tc-aim" aria-label="Aim">AIM</button>
   <button class="tc-jump" aria-label="Jump">JUMP</button><button class="tc-slide" aria-label="Slide, hold to dive">SLIDE</button>
   <button class="tc-use" aria-label="Use">USE</button><button class="tc-reload" aria-label="Reload">R</button>
   <button class="tc-swap" aria-label="Next weapon">SWAP</button><button class="tc-melee" aria-label="Melee">HIT</button>
   <button class="tc-third" aria-label="Third person">3RD</button>`;
  (host||document.body).append(el);const q=s=>el.querySelector(s);
  // Stick: up to 56 px from where the thumb landed; past 90% it sprints.
  const stick=q('.tc-stick'),nub=stick.querySelector('i');let sid=null,origin=null,held=new Set();
  function setKeys(x,y){const want=new Set();if(y<-.35)want.add('w');if(y>.35)want.add('s');if(x<-.35)want.add('a');if(x>.35)want.add('d');if(Math.hypot(x,y)>.9&&y<-.3)want.add('Shift');
   for(const k of held)if(!want.has(k))key(k,false);for(const k of want)if(!held.has(k))key(k,true);held=want;}
  stick.addEventListener('pointerdown',e=>{sid=e.pointerId;origin={x:e.clientX,y:e.clientY};cap(stick,sid);e.preventDefault();});
  stick.addEventListener('pointermove',e=>{if(e.pointerId!==sid)return;let dx=e.clientX-origin.x,dy=e.clientY-origin.y;const r=Math.hypot(dx,dy),max=56;if(r>max){dx*=max/r;dy*=max/r;}nub.style.transform=`translate(${dx}px,${dy}px)`;setKeys(dx/max,dy/max);});
  const endStick=e=>{if(e.pointerId!==sid)return;sid=null;nub.style.transform='';setKeys(0,0);};
  stick.addEventListener('pointerup',endStick);stick.addEventListener('pointercancel',endStick);
  // Look pad: any finger on the right half drags the view.
  const pad=q('.tc-look');const fingers=new Map();
  pad.addEventListener('pointerdown',e=>{fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});cap(pad,e.pointerId);});
  pad.addEventListener('pointermove',e=>{const f=fingers.get(e.pointerId);if(!f||fingers.size>1)return;const dx=e.clientX-f.x,dy=e.clientY-f.y;f.x=e.clientX;f.y=e.clientY;look(dx,dy);});
  const endLook=e=>fingers.delete(e.pointerId);pad.addEventListener('pointerup',endLook);pad.addEventListener('pointercancel',endLook);
  // Buttons. Fire can be dragged to aim while held (thumb on fire, sliding to look).
  const hold=(sel,down,up)=>{const b=q(sel);let last=null;b.addEventListener('pointerdown',e=>{e.preventDefault();cap(b,e.pointerId);last={x:e.clientX,y:e.clientY};b.classList.add('on');down?.();});
   b.addEventListener('pointermove',e=>{if(!last||sel!=='.tc-fire')return;look(e.clientX-last.x,e.clientY-last.y);last={x:e.clientX,y:e.clientY};});
   const end=()=>{if(!last)return;last=null;b.classList.remove('on');up?.();};b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end);};
  hold('.tc-fire',()=>{const c=combat();if(c?.armed())c.touchFire(true);else key('f',true);},()=>{const c=combat();if(c?.armed())c.touchFire(false);else key('f',false);});
  hold('.tc-aim',()=>combat()?.toggleZoom?.());
  hold('.tc-jump',()=>key(' ',true),()=>key(' ',false));
  hold('.tc-slide',()=>key('c',true),()=>key('c',false));
  hold('.tc-use',()=>key('f',true),()=>key('f',false));
  hold('.tc-reload',()=>key('r',true),()=>key('r',false));
  hold('.tc-melee',()=>combat()?.touchMelee?.());
  hold('.tc-third',()=>third());
  let slot=0;hold('.tc-swap',()=>{const c=combat(),ids=c?.arsenal?.inspect?.()?.owned||['axe','pistol'];const guns=ids.length?ids:['pistol'];slot=(slot+1)%(guns.length+1);if(slot===guns.length){if(c?.armed())key('x',true),key('x',false);}else key(String(slot+1),true),key(String(slot+1),false);});
  // Show while playing; combat gets touch mode so it fires without pointer lock.
  let shown=false;
  setInterval(()=>{const on=!!visible();if(on!==shown){shown=on;el.hidden=!on;document.body.classList.toggle('touch-play',on);if(!on){setKeys(0,0);combat()?.touchFire?.(false);}}
   el.classList.toggle('armed',!!armed());combat()?.setTouch?.(on);},300);
  return {element:el,inspect:()=>({shown,keys:[...held]})};
 };
})(window);
