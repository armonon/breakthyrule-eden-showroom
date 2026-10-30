'use strict';
window.createGarmentShop=function({collection,onOpen,onSelect,onClose}){
 const $=id=>document.getElementById(id),dialog=$('shop-dialog'),grid=$('shop-grid');
 const entries=collection.map((item,index)=>({item,index,photos:(item.images||[]).filter(src=>src.startsWith('/products/'))})).filter(entry=>entry.photos.length);
 function category(item){
  if(/hoodie/i.test(item.name))return 'Hoodies';
  if(/crewneck/i.test(item.name))return 'Sweatshirts';
  if(/tank/i.test(item.name))return 'Tanks';
  if(/longsleeve|sleeve|thermal/i.test(item.name))return 'Long sleeves';
  if(/tee|crop/i.test(item.name))return 'Tees';
  return 'Accessories';
 }
 const categories=[...new Set(entries.map(e=>category(e.item)))].sort();
 for(const name of categories){const option=document.createElement('option');option.value=option.textContent=name;$('shop-category').append(option);}
 const cards=entries.map(entry=>{
  const li=document.createElement('li'),button=document.createElement('button'),media=document.createElement('span'),image=document.createElement('img'),name=document.createElement('strong'),meta=document.createElement('span');
  button.type='button';button.className='shop-piece';button.dataset.collectionIndex=entry.index;button.setAttribute('aria-label','View photos of '+entry.item.name);
  media.className='shop-photo';image.src=entry.photos[0];image.alt=entry.item.imageAlt||entry.item.name;image.loading='lazy';image.decoding='async';image.width=600;image.height=750;
  image.onerror=()=>{image.hidden=true;media.classList.add('unavailable');media.textContent='Photo unavailable';};
  media.append(image);name.textContent=entry.item.name;meta.className='shop-piece-meta';meta.textContent=category(entry.item)+(entry.photos.length>1?' / '+entry.photos.length+' photos':'');
  button.append(media,name,meta);button.onclick=()=>onSelect(entry.index);li.append(button);
  return {...entry,li};
 });
 grid.replaceChildren(...cards.map(c=>c.li));
 function filter(){
  const query=$('shop-search').value.trim().toLowerCase(),kind=$('shop-category').value;
  let count=0;
  for(const c of cards){const match=(!kind||category(c.item)===kind)&&(!query||(c.item.name+' '+c.item.slug).toLowerCase().includes(query));c.li.hidden=!match;if(match)count++;}
  $('shop-count').textContent=count+' '+(count===1?'piece':'pieces');$('shop-empty').hidden=count!==0;
  $('shop-clear-search').hidden=!query;
 }
 function open(){
  onOpen();filter();if(!dialog.open)dialog.showModal();
 }
 $('shop-search').oninput=filter;$('shop-category').onchange=filter;
 $('shop-clear-search').onclick=()=>{$('shop-search').value='';filter();$('shop-search').focus();};
 $('shop-reset').onclick=()=>{$('shop-search').value='';$('shop-category').value='';filter();};
 $('close-shop').onclick=()=>dialog.close();
 dialog.addEventListener('close',onClose);
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
 filter();window.lucide?.createIcons();
 return {open,isOpen:()=>dialog.open};
};
