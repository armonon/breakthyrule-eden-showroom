'use strict';
// Section breaks become Break Thy Rule ad boxes (cut from the advert sheets), each a door into Eden.
// Every .ornament divider is replaced by one ad; pages without dividers get one before the footer.
// A page never shows the same ad twice. Data: site/data/ad-boxes.json (tools/assets/cut-adverts.mjs).
(()=>{
 const css=document.createElement('style');
 // Each ad spans 80% of the screen width (10% clear on each side), whatever container the divider sits in.
 css.textContent=`html,body{overflow-x:clip}
.ad-break{display:flex;flex-direction:column;align-items:center;gap:10px;width:80vw;margin:64px 0 0 calc(50% - 40vw);text-decoration:none;color:var(--ink,#1d1a17)}
.ad-break .ad-box{position:relative;display:block;width:100%;line-height:0;background:#000;padding:10px 0 0;box-shadow:0 1px 0 rgba(0,0,0,.5),0 -1px 0 rgba(0,0,0,.5);overflow:hidden}
.ad-break img{width:100%;height:auto;display:block;transition:transform .5s cubic-bezier(.2,.7,.2,1),filter .3s}
.ad-break .ad-url{display:block;background:#000;color:#fff;font:700 clamp(13px,1.6vw,20px)/1 var(--sans,system-ui);letter-spacing:.04em;text-align:center;padding:10px 0 9px}
.ad-break .ad-cta{font:600 12px/1 var(--sans,system-ui);letter-spacing:.2em;text-transform:uppercase;opacity:.75;transition:opacity .2s,letter-spacing .25s}
.ad-break:hover img,.ad-break:focus-visible img{transform:scale(1.02);filter:saturate(1.15) brightness(1.05)}
.ad-break:hover .ad-cta,.ad-break:focus-visible .ad-cta{opacity:1;letter-spacing:.28em}
.ad-break:focus-visible{outline:none}.ad-break:focus-visible .ad-box{outline:3px solid var(--rubric,#a3322a);outline-offset:-3px}
@media(max-width:600px){.ad-break{margin-top:44px}.ad-break .ad-box{padding-top:6px}.ad-break .ad-url{padding:7px 0 6px}}
.ad-break .ad-box{animation:ad-strobe var(--t,1.25s) steps(1,end) infinite;animation-delay:var(--d,0s)}
.ad-break:hover .ad-box,.ad-break:focus-visible .ad-box{animation-play-state:paused}
/* Strobe: hard on/off flashes. Speeds vary per ad (1.25 s, 1 s or 0.8 s a cycle — two flashes each, so at most 2.5 a
   second, under the 3-a-second photosensitivity limit). */
@keyframes ad-strobe{0%{filter:none;opacity:1}20%{filter:brightness(2.1) saturate(1.6);opacity:1}40%{filter:none;opacity:1}60%{filter:brightness(.25);opacity:.35}80%{filter:none;opacity:1}}
@media(prefers-reduced-motion:reduce){.ad-break img{transition:none}.ad-break .ad-box{animation:none}}`;
 document.head.append(css);
 const spots=[...document.querySelectorAll('main .ornament, body > .ornament')];
 if(!spots.length){const footer=document.querySelector('footer, .site-footer');if(!footer)return;const s=document.createElement('div');footer.before(s);spots.push(s);}
 fetch('/site/data/ad-boxes.json').then(r=>r.json()).then(({boxes=[]})=>{
  if(!boxes.length)return;
  const pool=boxes.slice();for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  const speed0=Math.floor(Math.random()*3);
  spots.forEach((spot,i)=>{
   const ad=pool[i%pool.length];
   const a=document.createElement('a');a.className='ad-break';a.href='/showroom';
   a.setAttribute('aria-label',`${ad.name} — enter the Garden of Eden`);
   const t=[1.25,1,.8][(i+speed0)%3];a.style.setProperty('--t',t+'s');a.style.setProperty('--d',(-Math.random()*t).toFixed(2)+'s'); // some faster, all out of step
   a.innerHTML=`<span class="ad-box"><img alt="" loading="lazy" decoding="async" width="${Math.round(ad.ratio*100)}" height="100"><span class="ad-url">www.breakthyrule.com</span></span><span class="ad-cta">Enter Eden →</span>`;
   a.querySelector('img').src=ad.src;
   spot.replaceWith(a);
  });
 }).catch(()=>{});
})();
