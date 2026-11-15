'use strict';
(()=>{
 const $=id=>document.getElementById(id),baseURL=new URL('/btr-belts/',location.href);
 window.renderBeltProduct=function(belt){
  const index=BTR_BELTS.indexOf(belt);document.title='BREAKTHYRULE — '+belt.name;
  document.body.classList.add('belt-product');$('numeral').textContent=window.siteRoman(index+1);$('chapter').textContent='Metalwork / Belt '+String(index+1).padStart(2,'0');
  $('name').textContent=belt.name;$('price').textContent=new Intl.NumberFormat('en-US',{style:'currency',currency:belt.currency,maximumFractionDigits:0}).format(belt.price)+' USD';
  $('tagline').textContent='Sculptural buckle. Simple black strap.';
  $('description').textContent='An expressive sculptural buckle paired with a simple black strap. Turn the design to explore every angle.';
  $('model-note').textContent='Complete belt · buckle and strap included.';$('thumbs').hidden=true;
  const buy=$('buy');buy.textContent='Explore all 21 belts ↗';buy.href='/belts.html';buy.removeAttribute('target');buy.removeAttribute('rel');
  buy.parentElement.querySelector('a[href="/showroom"]')?.remove();
  const viewer=$('viewer');viewer.setAttribute('aria-label','Interactive 3D '+belt.name);viewer.removeAttribute('tabindex');
  const media=window.mountBeltMedia(viewer,belt.designSlug,{baseURL,customization:true});window.BTRProductMedia={...media,item:belt};
  const nav=document.createElement('div');nav.className='belt-product-actions';
  for(const [offset,label] of [[-1,'← Previous belt'],[1,'Next belt →']]){const p=BTR_BELTS[(index+offset+BTR_BELTS.length)%BTR_BELTS.length];const a=document.createElement('a');a.className='ghost';a.href='/product?item='+p.id;a.textContent=label;nav.append(a);}$('model-note').after(nav);
  $('showcase')?.closest('section')?.remove();return media;
 };
 document.addEventListener('DOMContentLoaded',()=>{
  const stage=$('belt-collection-stage');if(!stage)return;
  const media=window.mountBeltMedia(stage,'neon-shamrock',{baseURL});
  document.querySelectorAll('[data-preview-belt]').forEach(button=>button.addEventListener('click',()=>{
   const p=BTR_BELTS.find(p=>p.designSlug===button.dataset.previewBelt);$('featured-belt-name').textContent=p.name;$('featured-belt-link').href='/product?item='+p.id;media.load(p.designSlug);
   document.querySelectorAll('[data-preview-belt]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
   stage.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }));
 });
})();
