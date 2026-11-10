'use strict';
// Section breaks become Break Thy Rule ad boxes (cut from the advert sheets), each a door into Eden.
// Every .ornament divider is replaced by one ad; pages without dividers get one before the footer.
// A page never shows the same ad twice. Data: site/data/ad-boxes.json (tools/assets/cut-adverts.mjs).
(()=>{
 const css=document.createElement('style');
 css.textContent=`.ad-break{display:flex;flex-direction:column;align-items:center;gap:8px;margin:64px auto 0;width:min(760px,92vw);text-decoration:none;color:var(--ink,#1d1a17)}
.ad-break .ad-box{position:relative;display:block;width:100%;line-height:0;background:#000;padding:6px;box-shadow:0 0 0 1px rgba(0,0,0,.4),8px 8px 0 rgba(0,0,0,.85);transform:rotate(var(--r,-.6deg));transition:transform .25s cubic-bezier(.2,.7,.2,1),box-shadow .25s}
.ad-break .ad-box::before,.ad-break .ad-box::after{content:'';position:absolute;top:-12px;width:84px;height:22px;background:rgba(255,225,77,.78);box-shadow:0 2px 3px rgba(0,0,0,.12)}
.ad-break .ad-box::before{left:-18px;transform:rotate(-18deg)}.ad-break .ad-box::after{right:-18px;transform:rotate(16deg)}
.ad-break img{width:100%;height:auto;display:block}
.ad-break .ad-url{display:block;background:#000;color:#fff;font:700 clamp(12px,1.6vw,15px)/1 var(--sans,system-ui);letter-spacing:.04em;text-align:center;padding:7px 0 3px}
.ad-break .ad-cta{font:600 12px/1 var(--sans,system-ui);letter-spacing:.2em;text-transform:uppercase;opacity:.75;transition:opacity .2s,letter-spacing .25s}
.ad-break:hover .ad-box,.ad-break:focus-visible .ad-box{transform:rotate(0) translateY(-4px) scale(1.015);box-shadow:0 0 0 1px rgba(0,0,0,.4),12px 14px 0 rgba(0,0,0,.85)}
.ad-break:hover .ad-cta,.ad-break:focus-visible .ad-cta{opacity:1;letter-spacing:.28em}
.ad-break:focus-visible{outline:none}.ad-break:focus-visible .ad-box{outline:3px solid var(--rubric,#a3322a);outline-offset:4px}
@media(max-width:600px){.ad-break{margin-top:44px}.ad-break .ad-box{padding:4px;box-shadow:0 0 0 1px rgba(0,0,0,.4),5px 5px 0 rgba(0,0,0,.85)}}
@media(prefers-reduced-motion:reduce){.ad-break .ad-box{transition:none}}`;
 document.head.append(css);
 const spots=[...document.querySelectorAll('main .ornament, body > .ornament')];
 if(!spots.length){const footer=document.querySelector('footer, .site-footer');if(!footer)return;const s=document.createElement('div');footer.before(s);spots.push(s);}
 fetch('/site/data/ad-boxes.json').then(r=>r.json()).then(({boxes=[]})=>{
  if(!boxes.length)return;
  const pool=boxes.slice();for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  spots.forEach((spot,i)=>{
   const ad=pool[i%pool.length];
   const a=document.createElement('a');a.className='ad-break';a.href='/showroom';
   a.setAttribute('aria-label',`${ad.name} — enter the Garden of Eden`);
   a.style.setProperty('--r',((i%2?1:-1)*(.4+Math.random()*.8)).toFixed(2)+'deg');
   a.innerHTML=`<span class="ad-box"><img alt="" loading="lazy" decoding="async" width="${Math.round(ad.ratio*100)}" height="100"><span class="ad-url">www.breakthyrule.com</span></span><span class="ad-cta">Enter Eden →</span>`;
   a.querySelector('img').src=ad.src;
   spot.replaceWith(a);
  });
 }).catch(()=>{});
})();
