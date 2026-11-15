'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const old=[...document.querySelectorAll('#metal-grid .equipment-card')].find(c=>c.querySelector('h3')?.textContent==='Belts');
 if(!old)return;const link=document.createElement('a');link.className=old.className+' btr-belt-category';link.href='/belts.html';link.innerHTML=old.innerHTML;
 const art=link.querySelector('.equipment-art');art.querySelector('svg')?.remove();const image=document.createElement('img');image.src='/btr-belts/posters/neon-shamrock.webp';image.alt='Neon Shamrock sculptural buckle with a black belt strap';image.loading='lazy';art.prepend(image);
 link.querySelector('.slot-status').textContent='Explore 21 designs';link.querySelector('p').textContent='Turn the collection in live 3D.';old.replaceWith(link);
});
