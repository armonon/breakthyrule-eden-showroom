'use strict';
// The Eden shop: a grid of the collection's product photographs. Choosing a piece opens the site's real
// product page (product.html?item=…&embed=eden, see site/eden-embed.js) inside the dialog, so the price,
// sizes, made-to-order options and bag are exactly the site's. "View in 3D" hands the piece to the showroom viewer.
window.createGarmentShop=function({collection,onOpen,onSelect,onClose}){
 const $=id=>document.getElementById(id),dialog=$('shop-dialog'),grid=$('shop-grid'),frame=$('shop-frame'),pane=$('shop-product');
 const web=src=>window.showroomAssets?.web?.(src)||src;
 const entries=collection.map((item,index)=>({item,index,photos:(item.images||[]).filter(src=>src.startsWith('/products/'))})).filter(entry=>entry.photos.length&&entry.item.slug);
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
 function photo(src,alt,className){
  const image=document.createElement('img');image.className=className;image.src=web(src);image.srcset=web(src)+' 1024w, '+src+' 2048w';
  image.sizes='(max-width:650px) 46vw, (max-width:950px) 30vw, 300px';image.alt=alt;image.loading='lazy';image.decoding='async';image.width=600;image.height=750;
  image.onerror=()=>{if(image.src!==location.origin+src){image.srcset='';image.src=src;return;}image.hidden=true;};
  return image;
 }
 const cards=entries.map(entry=>{
  const li=document.createElement('li'),button=document.createElement('button'),media=document.createElement('span'),name=document.createElement('strong'),meta=document.createElement('span');
  button.type='button';button.className='shop-piece';button.dataset.collectionIndex=entry.index;button.setAttribute('aria-label',entry.item.name+', open the product page');
  media.className='shop-photo';
  const front=photo(entry.photos[0],entry.item.imageAlt||entry.item.name,'shop-front');
  front.addEventListener('error',()=>{if(front.hidden){media.classList.add('unavailable');media.dataset.label='Photo unavailable';}});
  media.append(front);
  if(entry.photos[1]){const back=photo(entry.photos[1],'','shop-back-photo');back.setAttribute('aria-hidden','true');media.append(back);media.classList.add('has-back');}
  name.textContent=entry.item.name;meta.className='shop-piece-meta';
  const kind=document.createElement('span');kind.textContent=category(entry.item);meta.append(kind);
  if(entry.photos.length>1){const count=document.createElement('span');count.textContent=entry.photos.length+' photos';meta.append(count);}
  button.append(media,name,meta);button.onclick=()=>openProduct(entry);li.append(button);
  return {...entry,li,button};
 });
 grid.replaceChildren(...cards.map(c=>c.li));
 function filter(){
  const query=$('shop-search').value.trim().toLowerCase(),kind=$('shop-category').value;
  let count=0;
  for(const c of cards){const match=(!kind||category(c.item)===kind)&&(!query||(c.item.name+' '+c.item.slug).toLowerCase().includes(query));c.li.hidden=!match;if(match)count++;}
  $('shop-count').textContent=count+' '+(count===1?'piece':'pieces');$('shop-empty').hidden=count!==0;
  $('shop-clear-search').hidden=!query;
 }

 // Product view: the real product page in a frame.
 let current=null,lastCard=null,scrollTop=0,bag=0;
 const bySlug=new Map(entries.map(e=>[e.item.slug,e]));
 function setHeading(kicker,title){$('shop-kicker').textContent=kicker;$('shop-title').textContent=title;}
 function showBag(){$('shop-bag').hidden=!current;$('shop-bag-count').textContent=String(bag);$('shop-bag').classList.toggle('filled',bag>0);}
 function openProduct(entry){
  current=entry;lastCard=cards.find(c=>c.index===entry.index)?.button||null;scrollTop=dialog.querySelector('.shop-scroll').scrollTop;
  dialog.classList.add('viewing-product');pane.hidden=false;$('shop-back').hidden=false;$('shop-view-3d').hidden=!onSelect;
  $('shop-frame-status').hidden=false;$('shop-frame-status').textContent='Opening '+entry.item.name+'…';frame.classList.remove('ready');
  setHeading(category(entry.item).toUpperCase()+' / '+entry.item.id,entry.item.name);showBag();
  const url='/product.html?item='+encodeURIComponent(entry.item.slug)+'&embed=eden';
  if(frame.contentWindow&&frame.src&&frame.src!=='about:blank')frame.contentWindow.location.replace(url);else frame.src=url;
  $('shop-back').focus({preventScroll:true});
 }
 function closeProduct({focus=true}={}){
  if(!current)return;current=null;
  dialog.classList.remove('viewing-product');pane.hidden=true;$('shop-back').hidden=true;$('shop-view-3d').hidden=true;
  frame.classList.remove('ready');frame.src='about:blank'; // stops the product page's 3D renderer
  setHeading('BREAKTHYRULE / THE COLLECTION','Shop the collection');showBag();filter();
  dialog.querySelector('.shop-scroll').scrollTop=scrollTop;if(focus)lastCard?.focus({preventScroll:true});
 }
 addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.source!=='eden-embed')return;
  const data=event.data;
  if(data.type==='ready'){
   $('shop-frame-status').hidden=true;frame.classList.add('ready');
   if(data.slug&&bySlug.has(data.slug)&&data.slug!==current?.item.slug){current=bySlug.get(data.slug);setHeading(category(current.item).toUpperCase()+' / '+current.item.id,current.item.name);}
   if(Number.isFinite(data.cart)){bag=data.cart;showBag();}
  }else if(data.type==='cart'&&Number.isFinite(data.cart)){bag=data.cart;showBag();}
  else if(data.type==='escape'||data.type==='back')closeProduct();
  else if(data.type==='inspect')view3D();
 });
 frame.addEventListener('load',()=>{if(current&&frame.src!=='about:blank')setTimeout(()=>{$('shop-frame-status').hidden=true;frame.classList.add('ready');},1500);});
 function view3D(){if(current&&onSelect)onSelect(current.index);} // the 3D viewer opens above the shop; closing it returns here

 function open(){
  onOpen();filter();showBag();if(!dialog.open)dialog.showModal();
 }
 function openPiece(index){const entry=entries.find(e=>e.index===index);open();if(entry)openProduct(entry);}
 $('shop-search').oninput=filter;$('shop-category').onchange=filter;
 $('shop-clear-search').onclick=()=>{$('shop-search').value='';filter();$('shop-search').focus();};
 $('shop-reset').onclick=()=>{$('shop-search').value='';$('shop-category').value='';filter();};
 $('close-shop').onclick=()=>dialog.close();
 $('shop-back').onclick=()=>closeProduct();
 $('shop-view-3d').onclick=view3D;
 $('shop-bag').onclick=()=>frame.contentWindow?.postMessage({source:'eden-shop',type:'open-cart'},location.origin);
 // Escape steps back from a product to the grid before it closes the shop.
 dialog.addEventListener('cancel',event=>{if(current){event.preventDefault();closeProduct();}});
 dialog.addEventListener('close',()=>{closeProduct({focus:false});onClose();});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
 filter();window.lucide?.createIcons();
 return {open,openPiece,isOpen:()=>dialog.open};
};
