'use strict';
(()=>{
 const $=id=>document.getElementById(id),list=window.BTR_ACCESSORIES||[];
 window.renderAccessoryProduct=function(item){
  document.title='BREAKTHYRULE — '+item.name;document.body.classList.add('accessory-product');
  $('numeral').textContent='A';$('chapter').textContent='Accessories / '+({headband:'Headbands',gloves:'Gloves',skully:'Skullies',trucker:'Custom hats'}[item.family]);$('name').textContent=item.name;$('price').textContent=item.price&&item.price!=='Customize'?item.price:'Design preview';$('tagline').textContent=item.tagline;$('description').textContent=item.description;$('model-note').textContent='';$('thumbs').hidden=true;
  const buy=$('buy');buy.textContent='Explore all accessories ↗';buy.href='/accessories.html';buy.removeAttribute('target');buy.removeAttribute('rel');buy.parentElement.querySelector('a[href="/showroom"]')?.remove();
  // Load only the chosen shape on entry, including a saved design or shared URL.
  if(item.family==='trucker'){
   let saved;try{saved=JSON.parse(localStorage.getItem('btr-hat-design-v3:'+item.slug)||'null');}catch{}
   const choice=new URLSearchParams(location.search).get('hat')||saved?.style||item.hatStyle;
   if((window.BTR_HAT_STYLES||[]).some(s=>s.id===choice))item={...item,hatStyle:choice};
  }
  const media=window.mountAccessoryMedia($('viewer'),item);window.BTRProductMedia={...media,item};
  $('viewer').setAttribute('aria-label','Interactive 3D '+item.name);
  if(item.family==='trucker'){document.body.classList.add('hat-product');$('name').textContent='Custom Hat';document.title='BREAKTHYRULE — Custom Hat';$('tagline').textContent='Two shapes. Your colors. Your artwork.';$('description').textContent='Choose an airy mesh trucker or a solid six-panel baseball cap. Mix the panel colors and arrange your graphics on the front.';const customizer=document.createElement('section');$('description').after(customizer);window.mountHatCustomizer(customizer,item,media);}$('showcase')?.closest('section')?.remove();
  const nav=document.createElement('div');nav.className='accessory-downloads';const index=list.findIndex(x=>x.slug===item.slug);
  for(const [step,label] of [[-1,'← Previous'],[1,'Next →']]){const n=list[(index+step+list.length)%list.length],a=document.createElement('a');a.className='ghost';a.href=n.href;a.textContent=label;nav.append(a);}
  $('model-note').after(nav);
 };
 document.addEventListener('DOMContentLoaded',()=>{
  const cards=[...document.querySelectorAll('[data-accessory-model]')].map(a=>{const item=list.find(x=>x.slug===a.dataset.accessoryModel);if(!item)return null;const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');a.append(canvas);return {canvas,url:item.model,family:item.family,item,colorCycle:document.body.dataset.page==='home'&&!!a.closest('#accessories')};}).filter(Boolean);
  const carousel=window.createAccessoryCarousel(cards);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)for(const b of document.querySelectorAll('[data-accessory-motion]')){b.setAttribute('aria-pressed','false');b.textContent='Play previews';}
  for(const b of document.querySelectorAll('[data-accessory-motion]'))b.addEventListener('click',()=>{const auto=b.getAttribute('aria-pressed')!=='true';carousel?.setAuto(auto);b.setAttribute('aria-pressed',String(auto));b.textContent=auto?'Pause previews':'Play previews';});
  document.querySelectorAll('[data-accessory-filter]').forEach(b=>b.addEventListener('click',()=>{const family=b.dataset.accessoryFilter;document.querySelectorAll('[data-accessory-family]').forEach(c=>c.hidden=family!=='all'&&c.dataset.accessoryFamily!==family);document.querySelectorAll('[data-accessory-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));const count=[...document.querySelectorAll('[data-accessory-family]')].filter(c=>!c.hidden).length;const status=$('accessory-count');if(status)status.textContent=count+' designs';}));
 });
})();
