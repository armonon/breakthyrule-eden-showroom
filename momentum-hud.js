'use strict';
// Momentum meter (player-movement.js momentum, parkour.js wall-jump chain). A thin arc under the crosshair that fills
// as a sprint builds speed, warms from pale to ember at full, shows the chain count (x2, x3...) while you string
// wall jumps, bar swings and rope launches together, and fades away when momentum is spent.
//   const hud=createMomentumHud({host:document.body});  then every frame: hud.update({momentum, chain, mode})
(function(root){
 root.createMomentumHud=function({host=document.body}={}){
  const el=document.createElement('div');el.id='momentum-hud';el.setAttribute('aria-hidden','true');
  el.innerHTML='<svg viewBox="0 0 120 40"><path class="mh-track" d="M8 8 A60 60 0 0 0 112 8"/><path class="mh-fill" d="M8 8 A60 60 0 0 0 112 8"/></svg><span class="mh-label">MOMENTUM</span><b class="mh-chain"></b>';
  host.append(el);
  const fill=el.querySelector('.mh-fill'),chainEl=el.querySelector('.mh-chain'),length=fill.getTotalLength?.()||120;
  fill.style.strokeDasharray=String(length);fill.style.strokeDashoffset=String(length);
  let shown=-1,lastChain=0,level=-1,full=false,bumpUntil=0;
  return {
   element:el,
   update({momentum=0,chain=0,mode=''}={}){
    const m=Math.max(0,Math.min(1,momentum)),visible=m>.03||chain>1;
    if(visible!==(shown===1)){shown=visible?1:0;el.classList.toggle('on',visible);}
    if(!visible)return;
    const q=Math.round(m*100)/100;if(q!==level){level=q;fill.style.strokeDashoffset=String(length*(1-q));el.style.setProperty('--m',q);}
    const isFull=m>.97;if(isFull!==full){full=isFull;el.classList.toggle('full',isFull);}
    if(chain!==lastChain){if(chain>lastChain&&chain>1){chainEl.textContent='×'+chain;el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');}if(chain<=1)chainEl.textContent='';lastChain=chain;}
    el.dataset.mode=mode||'';
   },
   dispose(){el.remove();}
  };
 };
})(window);
