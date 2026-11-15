'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 // The home category is upgraded by home.js at DOMContentLoaded; run after it.
 queueMicrotask(()=>{
  const cards=[];
  for(const link of document.querySelectorAll('.belt-card-image,.btr-belt-category')){
   const url=new URL(link.href,location.href),id=url.searchParams.get('item');
   const slug=id?.startsWith('belt-')?id.slice(5):link.classList.contains('btr-belt-category')?'neon-shamrock':null;if(!slug)continue;
   const target=link.classList.contains('btr-belt-category')?link.querySelector('.equipment-art'):link;
   const canvas=document.createElement('canvas');canvas.className='belt-thumb-canvas';canvas.setAttribute('aria-hidden','true');canvas.dataset.beltSlug=slug;target.append(canvas);
   cards.push({canvas,slug,url:'/btr-belts/models/'+slug+'.glb'});
  }
  const carousel=window.createBeltGarmentCarousel?.(cards);if(!carousel)return;
  const shelf=document.querySelector('.belt-grid')?.closest('section');
  if(shelf){const bar=document.createElement('div'),button=document.createElement('button');bar.className='belt-preview-motion';button.type='button';button.className='ghost';const sync=()=>{button.textContent=carousel.isAuto()?'Pause previews':'Play previews';button.setAttribute('aria-pressed',String(carousel.isAuto()));};button.addEventListener('click',()=>{carousel.setAuto(!carousel.isAuto());sync();});sync();bar.append(button);shelf.querySelector('.belt-grid').before(bar);}
  window.addEventListener('pagehide',event=>{if(!event.persisted)carousel.destroy();});
 });
});
