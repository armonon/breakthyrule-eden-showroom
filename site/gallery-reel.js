'use strict';
// A moving filmstrip of every gallery photo (garments and worn), under the home/shop hero.
// Mixed order each visit, pauses on hover/focus, still and scrollable with reduced motion. Data: site/data/gallery.json.
(()=>{
 const host=document.getElementById('gallery-reel');if(!host)return;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const css=document.createElement('style');
 css.textContent=`.gallery-reel{position:relative;overflow:hidden;background:#15120f;padding:16px 0 18px;border-top:1px solid #2b241d;border-bottom:1px solid #2b241d}
.gallery-reel::before,.gallery-reel::after{content:'';position:absolute;top:0;bottom:0;width:min(120px,12vw);z-index:2;pointer-events:none}
.gallery-reel::before{left:0;background:linear-gradient(90deg,#15120f,transparent)}.gallery-reel::after{right:0;background:linear-gradient(270deg,#15120f,transparent)}
.reel-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:0 clamp(16px,4vw,48px) 12px;color:#e9dfcd;font-family:var(--serif,Georgia,serif)}
.reel-head b{font-family:var(--blackletter,serif);color:#d7604f;font-weight:400;font-size:20px;margin-right:8px}
.reel-head a{color:#e9dfcd;font-size:14px;font-style:italic;text-underline-offset:3px}
.reel-track{display:flex;gap:12px;width:max-content;animation:reel 160s linear infinite}
.gallery-reel:hover .reel-track,.gallery-reel:focus-within .reel-track{animation-play-state:paused}
.reel-track a{position:relative;display:block;flex:0 0 auto;height:var(--reel-h,230px);border-radius:3px;overflow:hidden;background:#221d18;box-shadow:0 8px 22px rgba(0,0,0,.45);transform:rotate(var(--r));transition:transform .25s}
.reel-track a:hover,.reel-track a:focus-visible{transform:rotate(0) scale(1.04);z-index:1}
.reel-track img{display:block;height:100%;width:100%;object-fit:cover}
.reel-track a span{position:absolute;left:8px;bottom:7px;font:600 11px/1 var(--sans,system-ui);letter-spacing:.12em;text-transform:uppercase;color:#fff;background:rgba(0,0,0,.55);padding:4px 6px;border-radius:2px;opacity:0;transition:opacity .2s}
.reel-track a:hover span,.reel-track a:focus-visible span{opacity:1}
@keyframes reel{to{transform:translateX(-50%)}}
@media(max-width:700px){.gallery-reel{--reel-h:150px;padding:12px 0 14px}.reel-head{font-size:14px}}
@media(prefers-reduced-motion:reduce){.reel-track{animation:none}.gallery-reel{overflow-x:auto}}`;
 document.head.append(css);
 fetch('/site/data/gallery.json',{cache:'no-cache'}).then(r=>r.json()).then(data=>{
  const items=(data.items||[]).filter(i=>i.thumb||i.src);if(!items.length){host.hidden=true;return;}
  for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
  const label={garments:'Garment',worn:'Worn'};
  const tile=(it,hidden)=>{
   const a=document.createElement('a');a.href='/gallery'+(it.category?'?filter='+encodeURIComponent(it.category):'');
   a.style.aspectRatio=String(it.ratio||1);a.style.setProperty('--r',(Math.random()*3-1.5).toFixed(2)+'deg');
   if(hidden){a.tabIndex=-1;a.setAttribute('aria-hidden','true');}else a.setAttribute('aria-label',(it.alt||'Gallery photo')+' — open the gallery');
   const img=document.createElement('img');img.src=it.thumb||it.src;img.alt='';img.loading='lazy';img.decoding='async';img.draggable=false;
   const tag=document.createElement('span');tag.textContent=label[it.category]||'Gallery';
   a.append(img,tag);return a;
  };
  const track=document.createElement('div');track.className='reel-track';
  // Two copies, so the strip loops seamlessly (the second copy is hidden from screen readers and the keyboard).
  track.append(...items.map(it=>tile(it,false)),...(reduce?[]:items.map(it=>tile(it,true))));
  const head=document.createElement('div');head.className='reel-head';
  head.innerHTML=`<span><b>The gallery</b>Garments and the people wearing them</span><a href="/gallery">See all ${items.length} ↗</a>`;
  host.replaceChildren(head,track);
 }).catch(()=>{host.hidden=true;});
})();
