'use strict';
// The running strip of Break Thy Rule graphics. On the public site it runs as a band under the header;
// in the 3D showroom it runs inside the header, where it first appeared. Pauses on hover; still for
// reduced-motion visitors. Data: breakthyrule-assets.js.
(()=>{
 const graphics=(window.breakthyruleAssets&&window.breakthyruleAssets.graphics)||[];
 if(!graphics.length)return;
 const readable=n=>n.length<=24&&/[a-z]{2}/i.test(n)&&!/\d{3,}|^img\b|chatgpt|gemini|copy|[a-z0-9]{12,}/i.test(n);
 const pool=graphics.filter(g=>readable(g.name));
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 const pick=pool.slice(0,44);
 const css=document.createElement('style');
 css.textContent=`.graphic-strip{overflow:hidden;position:relative;-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.graphic-strip .strip-track{display:flex;align-items:center;gap:18px;width:max-content;height:100%;animation:graphic-strip 170s linear infinite}
.graphic-strip:hover .strip-track{animation-play-state:paused}
.graphic-strip a{display:block;flex:0 0 auto;line-height:0}
.graphic-strip img{height:var(--strip-h,46px);width:auto;transform:rotate(var(--r));transition:transform .2s}
.graphic-strip a:hover img,.graphic-strip a:focus-visible img{transform:rotate(0) scale(1.18)}
.graphic-band{height:62px;padding:8px 0;background:color-mix(in srgb,var(--paper,#f2ebdd) 92%,transparent);box-shadow:0 1px 0 var(--line,#d6cab3)}
.site-header .graphic-strip{flex:1;min-width:0;height:54px;--strip-h:42px}
@keyframes graphic-strip{to{transform:translateX(-50%)}}
@media(prefers-reduced-motion:reduce){.graphic-strip .strip-track{animation:none}}
@media(max-width:1000px){.site-header .graphic-strip{display:none}}`;
 document.head.append(css);
 const strip=document.createElement('div');strip.className='graphic-strip';strip.setAttribute('aria-hidden','true');
 const track=document.createElement('div');track.className='strip-track';
 for(let k=0;k<2;k++)for(const g of pick){
  const a=document.createElement('a');a.href='/lab';a.tabIndex=-1;
  const img=document.createElement('img');img.src=g.thumb;img.alt='';img.loading='lazy';img.decoding='async';
  img.style.setProperty('--r',(Math.random()*20-10).toFixed(0)+'deg');a.append(img);track.append(a);
 }
 strip.append(track);
 const siteTop=document.querySelector('.site-top');
 if(siteTop){strip.classList.add('graphic-band');siteTop.after(strip);return;}
 const label=document.querySelector('.site-header .header-label');
 if(label)label.replaceWith(strip);
})();
