'use strict';
(function(root){
 function createPlayerMotion(){
  let height=0,velocity=0;
  const gravity=15,impulse=5.4;
  return {
   impulse,
   speed:sprinting=>sprinting?6:3.4,
   jump(v=impulse){if(velocity||height)return false;velocity=v;return true;},
   step(dt){if(!Number.isFinite(dt)||dt<=0)return height;height+=velocity*dt-gravity*dt*dt/2;velocity-=gravity*dt;if(height<=1e-8){height=0;velocity=0;}return height;},
   reset(){height=0;velocity=0;},
   // Parkour hands control back: falling from h metres above the floor at vertical speed v.
   set(h,v=0){height=Math.max(0,h);velocity=v;},
   inspect:()=>({height,velocity,airborne:height>0||velocity>0})
  };
 }
 root.createPlayerMotion=createPlayerMotion;
 if(typeof module==='object'&&module.exports)module.exports={createPlayerMotion};
})(typeof window==='object'?window:globalThis);
