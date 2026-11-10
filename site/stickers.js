'use strict';
// The Break Thy Rule graphics on the public site: the rubric ticker and pasted-up sticker board on the
// home page, the worn-photo strip, marginalia stickers and the A–Z index of the codex on the Archive.
// Data: breakthyrule-assets.js. Lightbox: breakthyrule-cover.js (window.breakthyruleGallery.openLightbox).
(()=>{
 const assets=window.breakthyruleAssets||{},graphics=assets.graphics||[],favs=assets.favs||[],adverts=assets.adverts||[];
 if(!graphics.length)return;
 const el=window.siteEl,$=id=>document.getElementById(id);
 const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const rand=(a,b)=>a+Math.random()*(b-a);
 const shuffle=list=>{const a=list.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 const img=(src,alt='',extra={})=>el('img',{src,alt,loading:'lazy',decoding:'async',draggable:false,...extra});
 const openGraphic=item=>window.breakthyruleGallery?.openLightbox(graphics,graphics.indexOf(item),'graphics');
 const readable=n=>n.length<=24&&/[a-z]{2}/i.test(n)&&!/\d{3,}|^img\b|chatgpt|gemini|copy|[a-z0-9]{12,}/i.test(n);

 // Drag to move, click to open. Works for any sticker inside `root`.
 function stickerDrag(root){
  let drag=null;
  root.addEventListener('pointerdown',e=>{const s=e.target.closest('.paste');if(!s||e.button)return;
   drag={s,x:e.clientX,y:e.clientY,left:s.offsetLeft,top:s.offsetTop,moved:false,id:e.pointerId};});
  addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;
   const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
   if(!drag.moved&&Math.hypot(dx,dy)>6){drag.moved=true;drag.s.classList.add('lifted');}
   if(drag.moved){drag.s.style.left=drag.left+dx+'px';drag.s.style.top=drag.top+dy+'px';}});
  addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.id)return;const {s,moved}=drag;drag=null;s.classList.remove('lifted');
   if(moved){s.dataset.dragged='1';s.style.setProperty('--r',rand(-14,14).toFixed(1)+'deg');}});
  root.addEventListener('click',e=>{const s=e.target.closest('.paste');if(!s)return;
   if(s.dataset.dragged){delete s.dataset.dragged;return;}openGraphic(graphics[+s.dataset.index]);});
 }
 function paste(item,x,y,size,eager=false){
  const b=el('button',{type:'button',className:'paste',title:item.name},img(item.thumb,item.name,eager?{loading:'eager'}:{}));
  b.setAttribute('aria-label','Open '+item.name);b.dataset.index=graphics.indexOf(item);
  b.style.cssText=`left:${x}px;top:${y}px;width:${size}px;--r:${rand(-13,13).toFixed(1)}deg`;return b;
 }

 // Home: the colour collage behind the hero leans with the pointer (the drift itself is CSS).
 const collageHero=document.querySelector('.codex-hero.has-collage');
 if(collageHero&&!reduceMotion){
  let raf=0,tx=0,ty=0;
  collageHero.addEventListener('pointermove',e=>{const r=collageHero.getBoundingClientRect();tx=(e.clientX-r.left)/r.width-.5;ty=(e.clientY-r.top)/r.height-.5;
   if(!raf)raf=requestAnimationFrame(()=>{raf=0;collageHero.style.setProperty('--px',tx.toFixed(3));collageHero.style.setProperty('--py',ty.toFixed(3));});});
  collageHero.addEventListener('pointerleave',()=>{collageHero.style.setProperty('--px',0);collageHero.style.setProperty('--py',0);});
 }

 // Home: running rubric of graphic names under the hero.
 const ticker=$('rubric-ticker');
 if(ticker){
  const names=[...new Set(shuffle(graphics).map(g=>g.name).filter(readable))].slice(0,70);
  const track=el('div',{className:'ticker-track'});
  for(let i=0;i<2;i++)for(const n of names)track.append(el('span',{textContent:n}),el('i',{textContent:'✠'}));
  ticker.append(track);
 }

 // Home: the pasted-up board.
 const wall=$('board-wall');
 if(wall){
  stickerDrag(wall);
  const fill=()=>{
   const w=wall.clientWidth,h=wall.clientHeight,cell=w<600?96:132;
   const cols=Math.max(3,Math.round(w/cell)),rows=Math.max(2,Math.round(h/(cell*.85)));
   const cw=w/cols,ch=h/rows,pick=shuffle(graphics).slice(0,cols*rows);
   wall.replaceChildren(...pick.map((g,i)=>{const c=i%cols,r=Math.floor(i/cols);const size=Math.round(cell*rand(.85,1.3));
    return paste(g,(c+.5)*cw-size/2+rand(-cw*.22,cw*.22),(r+.5)*ch-size/2+rand(-ch*.2,ch*.2),size,true);}));
  };
  fill();$('wall-shuffle')?.addEventListener('click',fill);
  $('wall-cover')?.addEventListener('click',()=>window.breakthyruleGallery?.openCover());
  if($('wall-count'))$('wall-count').textContent=graphics.length;
  let t,lastW=wall.clientWidth;new ResizeObserver(()=>{if(Math.abs(wall.clientWidth-lastW)<40)return;lastW=wall.clientWidth;clearTimeout(t);t=setTimeout(fill,300);}).observe(wall);
  // Clicking bare board slaps a new sticker down.
  wall.addEventListener('click',e=>{if(e.target!==wall)return;const r=wall.getBoundingClientRect(),size=Math.round(rand(110,170));
   const s=paste(graphics[Math.floor(Math.random()*graphics.length)],e.clientX-r.left-size/2,e.clientY-r.top-size/2,size);s.classList.add('slapped');wall.append(s);});
  for(const side of document.querySelectorAll('.board-rail')){
   const track=el('div',{className:'rail-track'});
   const list=side.classList.contains('right')?adverts.slice().reverse():adverts;
   for(let i=0;i<2;i++)for(let k=0;k<3;k++)for(const a of list)track.append(img(a.full,'',{loading:'eager'}));
   side.append(track);side.setAttribute('aria-hidden','true');
  }
 }

 // Home: worn photos as a strip of pinned polaroids.
 const strip=$('witness-strip');
 if(strip&&favs.length){
  strip.replaceChildren(...shuffle(favs).slice(0,7).map((f,i)=>{
   const a=el('a',{className:'polaroid',href:'/gallery?filter=worn'},img(f.thumb,'Break Thy Rule worn in real life',{loading:'eager'}),el('span',{textContent:['Witness','Believer','Disciple','Heretic','Pilgrim','Convert','Saint'][i]}));
   a.style.setProperty('--r',rand(-6,6).toFixed(1)+'deg');return a;}));
 }
 // Home: the gallery teaser shows a worn photo instead of the collage.
 const teaser=document.querySelector('.teaser[href="/gallery"] .teaser-img');
 if(teaser&&favs.length)teaser.style.backgroundImage=`url("${favs[Math.floor(Math.random()*favs.length)].full}")`;

 // Archive: a few stickers pasted in the margins of the page head.
 const margin=$('archive-marginalia');
 if(margin){
  stickerDrag(margin);
  const spots=[[2,8,120],[14,58,96],[72,4,110],[70,50,118],[40,62,84]];
  margin.replaceChildren(...shuffle(graphics).slice(0,spots.length).map((g,i)=>{const [x,y,s]=spots[i];
   const p=paste(g,0,0,s);p.style.left=x+'%';p.style.top=y+'%';return p;}));
 }

 // Archive: the index of the codex, A–Z, hover to peek, click to open.
 const columns=$('index-columns');
 if(columns){
  const groups=new Map();
  const seen=new Set();
  for(const g of graphics.slice().sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true}))){
   const key=g.name.toLowerCase();if(seen.has(key))continue;seen.add(key);
   const first=g.name.trim()[0]?.toUpperCase()||'#',letter=/[A-Z]/.test(first)?first:'#';
   if(!groups.has(letter))groups.set(letter,[]);groups.get(letter).push(g);
  }
  const peek=el('img',{className:'index-peek',alt:''});peek.setAttribute('aria-hidden','true');document.body.append(peek);
  const letters=$('index-letters');
  for(const [letter,list] of groups){
   const id='index-'+(letter==='#'?'num':letter);
   const jump=el('a',{href:'#'+id,textContent:letter});letters?.append(jump);
   const block=el('section',{className:'index-letter',id},el('h3',{textContent:letter}),
    el('ol',{},...list.map(g=>{
     const b=el('button',{type:'button'},el('span',{className:'entry',textContent:g.name}),el('span',{className:'leader'}),el('span',{className:'folio-no',textContent:window.siteRoman(graphics.indexOf(g)+1)}));
     b.onclick=()=>openGraphic(g);
     b.onpointerenter=()=>{peek.src=g.thumb;peek.classList.add('on');};
     b.onpointerleave=()=>peek.classList.remove('on');
     return el('li',{},b);})));
   columns.append(block);
  }
  addEventListener('pointermove',e=>{if(!peek.classList.contains('on'))return;
   const x=Math.min(innerWidth-190,e.clientX+22),y=Math.min(innerHeight-190,e.clientY+16);
   peek.style.transform=`translate(${x}px,${y}px) rotate(-4deg)`;},{passive:true});
  if($('index-count'))$('index-count').textContent=seen.size;
 }
})();
