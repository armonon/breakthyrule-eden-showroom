'use strict';
// Gameplay drags are gestures, not document selection. Reading/editing stays native.
(function(){
 const surfaces='#world,#touch-controls,#fight-pad,#social-move,#eden-mobile-hud,.world-footer,.entry-header,.entry-footer';
 const readable='dialog,[role="dialog"],input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],#social-panel,#night-chat,[data-allow-selection]';
 const gestures='#scene canvas,.em-look,.em-stick,.tc-look,.tc-stick';
 const element=target=>target instanceof Element?target:target?.parentElement;
 const isGame=target=>{const el=element(target);return !!el?.closest(surfaces)&&!el.closest(readable);};
 const pointers=new Set();
 function cancelNative(event){if(isGame(event.target)&&event.cancelable)event.preventDefault();}
 for(const type of ['selectstart','contextmenu','dragstart'])document.addEventListener(type,cancelNative,{capture:true,passive:false});
 document.addEventListener('pointerdown',event=>{
  if(event.button!==0||!isGame(event.target)||!element(event.target).closest(gestures))return;
  pointers.add(event.pointerId);
  // Clear a previous accidental highlight only when returning to the world.
  const selection=window.getSelection();if(selection&&!selection.isCollapsed)selection.removeAllRanges();
  if(event.cancelable)event.preventDefault();
  // Cancelling pointerdown also cancels native focus. Return desktop keyboard
  // control to the world after using a HUD button, without disturbing touch UI.
  const canvas=element(event.target).closest('#scene canvas');
  if(canvas&&event.isPrimary!==false&&(event.pointerType==='mouse'||event.pointerType==='pen')){
   if(!canvas.hasAttribute('tabindex'))canvas.tabIndex=-1;
   canvas.focus({preventScroll:true});
  }
 },{capture:true,passive:false});
 document.addEventListener('pointermove',event=>{
  if(!pointers.has(event.pointerId))return;
  if(event.pointerType==='mouse'&&!(event.buttons&1)){pointers.delete(event.pointerId);return;}
  if(event.cancelable)event.preventDefault();
 },{capture:true,passive:false});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,event=>pointers.delete(event.pointerId),true);
 for(const type of ['blur','pagehide'])window.addEventListener(type,()=>pointers.clear());
 document.addEventListener('visibilitychange',()=>pointers.clear());
})();
