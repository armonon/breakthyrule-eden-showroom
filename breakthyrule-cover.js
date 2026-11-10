'use strict';
// The codex cover (a sticker-bombed wall of every graphic above the garden),
// the image gallery, and the lightbox they share. Data: breakthyrule-assets.js.
(function(){
 const assets=window.breakthyruleAssets||{graphics:[],favs:[],adverts:[]};
 const graphics=assets.graphics||[],favs=assets.favs||[],adverts=assets.adverts||[];
 const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const rand=(a,b)=>a+Math.random()*(b-a);
 const LOGO='/assets/brand/logo.webp?v=1';
 const logo=(cls='')=>el('img',{className:'btr-logo '+cls,src:LOGO,alt:'BreakThyRule, anonymous archive',width:1400,height:381,decoding:'async'});
 const pick=list=>list[Math.floor(Math.random()*list.length)];
 const clickThrough=id=>()=>document.getElementById(id)?.click();
 // Two homes: the public site (header .site-top, pages /, /gallery, /archive) and the 3D showroom.
 const siteMode=!!document.querySelector('.site-top');
 const sitePage=document.body.dataset.page||'';
 const go=href=>()=>{location.href=href;};
 const actions=siteMode?{
  enterLabel:'ENTER',
  enter:()=>closeCover(),
  shop:()=>{if(sitePage==='home'){closeCover();setTimeout(()=>document.getElementById('products')?.scrollIntoView({behavior:'smooth'}),reduceMotion?60:700);}else location.href='/#products';},
  gallery:go('/gallery'),archive:go('/archive'),eden:go('/showroom')
 }:{
  enterLabel:'ENTER EDEN',
  enter:()=>closeCover(),
  shop:clickThrough('view-product'),gallery:()=>openGallery('favs'),archive:clickThrough('open-library'),eden:()=>closeCover()
 };
 const shuffle=list=>{const a=list.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 const el=(tag,props={},children=[])=>{const node=Object.assign(document.createElement(tag),props);for(const child of [].concat(children))if(child!=null)node.append(child);return node;};
 const img=(src,alt,extra={})=>el('img',{src,alt,loading:'lazy',decoding:'async',draggable:false,...extra});

 /* ---------- Lightbox ---------- */
 const lightbox=el('dialog',{id:'btr-lightbox'});
 lightbox.setAttribute('aria-label','Image viewer');
 const lbCount=el('span',{className:'btr-lb-count'});
 const lbClose=el('button',{type:'button',textContent:'×',title:'Close'});lbClose.setAttribute('aria-label','Close image viewer');
 const lbStage=el('div',{className:'btr-lb-stage'});
 const lbPrev=el('button',{type:'button',className:'btr-lb-nav prev',textContent:'←',title:'Previous'});lbPrev.setAttribute('aria-label','Previous image');
 const lbNext=el('button',{type:'button',className:'btr-lb-nav next',textContent:'→',title:'Next'});lbNext.setAttribute('aria-label','Next image');
 const lbKicker=el('small'),lbTitle=el('strong');
 lightbox.append(el('div',{className:'btr-lb-top'},[lbCount,lbClose]),lbStage,el('div',{className:'btr-lb-caption'},[lbKicker,lbTitle]));
 let lbList=[],lbIndex=0,lbKind='graphics';
 const kindLabel={graphics:'GRAPHIC',favs:'PHOTO',adverts:'ADVERT',gallery:'GALLERY'};
 function renderLightbox(){
  const item=lbList[lbIndex];if(!item)return;
  const picture=el('img',{src:item.full,alt:item.name,decoding:'async'});
  lbStage.className='btr-lb-stage'+(lbKind==='graphics'?' graphic':'');
  lbStage.replaceChildren(picture,lbPrev,lbNext);
  lbCount.textContent=`${String(lbIndex+1).padStart(3,'0')} / ${lbList.length}`;
  lbKicker.textContent=`BREAKTHYRULE / ${kindLabel[lbKind]}`;
  lbTitle.textContent=lbKind==='favs'?'Worn by the believers':item.name;
  lbPrev.hidden=lbNext.hidden=lbList.length<2;
 }
 function openLightbox(list,index,kind){
  lbList=list;lbIndex=index;lbKind=kind;renderLightbox();
  if(!lightbox.open)lightbox.showModal();lbClose.focus();
 }
 function step(d){lbIndex=(lbIndex+d+lbList.length)%lbList.length;renderLightbox();}
 lbPrev.onclick=()=>step(-1);lbNext.onclick=()=>step(1);lbClose.onclick=()=>lightbox.close();
 lightbox.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();step(-1);}if(e.key==='ArrowRight'){e.preventDefault();step(1);}});
 lightbox.addEventListener('click',e=>{if(e.target===lightbox||e.target===lbStage)lightbox.close();});
 let touchX=null;
 lbStage.addEventListener('touchstart',e=>{touchX=e.touches[0].clientX;},{passive:true});
 lbStage.addEventListener('touchend',e=>{if(touchX==null)return;const dx=e.changedTouches[0].clientX-touchX;if(Math.abs(dx)>50)step(dx<0?1:-1);touchX=null;});

 /* ---------- Gallery ---------- */
 const gallery=el('dialog',{id:'btr-gallery'});gallery.setAttribute('aria-labelledby','btr-gallery-title');
 const tabsDef=[['favs','PHOTOS',favs],['graphics','GRAPHICS',graphics],['adverts','ADVERTS',adverts]].filter(t=>t[2].length);
 const tabs=el('div',{className:'btr-tabs',role:'tablist'});tabs.setAttribute('aria-label','Gallery sections');
 const search=el('input',{type:'search',className:'btr-search',placeholder:'Search graphics',autocomplete:'off'});search.setAttribute('aria-label','Search graphics by name');
 const galleryClose=el('button',{type:'button',className:'btr-close',textContent:'×',title:'Close gallery'});galleryClose.setAttribute('aria-label','Close gallery');
 const galleryTitle=el('h2',{id:'btr-gallery-title'});
 const galleryBody=el('div',{className:'btr-gallery-body'});
 gallery.append(el('header',{className:'btr-gallery-head'},[galleryTitle,tabs,search,galleryClose]),galleryBody);
 const subtitles={favs:['THE WITNESSES','Worn in the wild'],graphics:['THE CODEX','Every graphic'],adverts:['BROADSIDES','Posted on the wall']};
 let activeTab=tabsDef[0]?.[0];
 const tabButtons=tabsDef.map(([key,label,list])=>{
  const b=el('button',{type:'button',role:'tab'},[label,el('span',{textContent:list.length})]);
  b.onclick=()=>showTab(key);tabs.append(b);return [key,b];
 });
 function showTab(key){
  activeTab=key;const list=tabsDef.find(t=>t[0]===key)[2];
  for(const [k,b] of tabButtons)b.setAttribute('aria-selected',String(k===key));
  galleryTitle.replaceChildren(el('small',{},[logo('btr-logo-head'),el('span',{textContent:subtitles[key][0]})]),subtitles[key][1]);
  search.hidden=key!=='graphics';
  const query=key==='graphics'?search.value.trim().toLowerCase():'';
  const shown=query?list.filter(item=>item.name.toLowerCase().includes(query)):list;
  const grid=el('div',{className:'btr-grid '+(key==='favs'?'photos':key)});
  shown.forEach((item,i)=>{
   const tile=el('button',{type:'button',className:'btr-tile'},[
    img(item.thumb,key==='favs'?'Photo of the collection being worn':item.name,key==='favs'?{width:640,height:Math.round(640*item.ratio)}:{}),
    key==='adverts'?null:el('span',{textContent:key==='favs'?'No. '+String(i+1).padStart(2,'0'):item.name})
   ]);
   tile.setAttribute('aria-label','Open '+(key==='favs'?'photo '+(i+1):item.name));
   if(key==='favs')tile.style.setProperty('--r',rand(-2.5,2.5).toFixed(2)+'deg');
   tile.onclick=()=>openLightbox(shown,i,key);
   grid.append(tile);
  });
  galleryBody.replaceChildren(shown.length?grid:el('p',{className:'btr-empty',textContent:'No graphic by that name. Try another word.'}));
  galleryBody.scrollTop=0;
 }
 search.addEventListener('input',()=>showTab('graphics'));
 galleryClose.onclick=()=>gallery.close();
 gallery.addEventListener('click',e=>{if(e.target===gallery)gallery.close();});
 function openGallery(key){showTab(key&&tabsDef.some(t=>t[0]===key)?key:activeTab);if(!gallery.open)gallery.showModal();}

 /* ---------- About ---------- */
 const about=el('dialog',{id:'btr-about'});about.setAttribute('aria-labelledby','btr-about-title');
 const aboutClose=el('button',{type:'button',className:'btr-close',textContent:'×',title:'Close about'});aboutClose.setAttribute('aria-label','Close about');
 aboutClose.onclick=()=>about.close();about.addEventListener('click',e=>{if(e.target===about)about.close();});
 const aboutCollage=el('div',{className:'btr-about-collage'});aboutCollage.setAttribute('aria-hidden','true');
 const aboutGo=(label,action)=>{const b=el('button',{type:'button',className:'btr-btn',textContent:label});b.onclick=()=>{about.close();action();};return b;};
 about.append(
  el('header',{className:'btr-gallery-head'},[el('h2',{id:'btr-about-title'},[el('small',{},[logo('btr-logo-head'),el('span',{textContent:'ABOUT'})]),'Break thy rule']),aboutClose]),
  el('div',{className:'btr-about-body'},[
   aboutCollage,
   el('div',{className:'btr-about-copy'},[
    el('p',{className:'btr-about-kicker',textContent:'Los Angeles, California'}),
    el('p',{className:'btr-about-lede',textContent:'A clothing brand from LA.'}),
    el('p',{textContent:'Everything is printed in house. We work with artists on every drop, and we print on vintage pieces, random blank garments, or our own cut and sew. No two runs come out the same.'}),
    el('div',{className:'btr-about-cats'},[
     el('div',{className:'btr-about-cat'},[el('span',{className:'btr-about-num',textContent:'I'}),el('h3',{textContent:'Cut & sew'}),el('p',{textContent:'A handcrafted, brand-new piece. Cut, sewn and printed by us.'})]),
     el('div',{className:'btr-about-cat'},[el('span',{className:'btr-about-num',textContent:'II'}),el('h3',{textContent:'Ready to ship'}),el('p',{textContent:'Printed on a random blank or a vintage find, ready to go out now.'})])
    ]),
    el('h3',{textContent:'Made with artists'}),
    el('p',{textContent:'Every graphic is a collaboration. The artists bring the work; we print it by hand in our shop.'}),
    el('div',{className:'btr-about-actions'},[
     aboutGo('ENTER EDEN',actions.eden),aboutGo('SHOP',actions.shop),aboutGo('GALLERY',actions.gallery),aboutGo('ARCHIVE',actions.archive)
    ])
   ])
  ])
 );
 function openAbout(){
  if(!aboutCollage.childElementCount){
   // About is about the clothes: real photos of them being worn (artwork and collages left out).
   const notPhotos=new Set(['82dec1eb-dce2-4a7e-80f6-7b0a12cbbe4f','theodore']);
   const picks=shuffle(favs.filter(f=>!notPhotos.has(f.id))).slice(0,12).map(f=>[f,'photo']);
   shuffle(picks).forEach(([item,kind])=>{const f=el('figure',{className:'btr-about-piece '+kind},img(item.thumb,''));f.style.setProperty('--r',rand(-9,9).toFixed(1)+'deg');aboutCollage.append(f);});
  }
  if(!about.open)about.showModal();aboutClose.focus();
 }

 /* ---------- Cover ---------- */
 const cover=el('section',{id:'btr-cover'});cover.setAttribute('aria-label','Break Thy Rule cover');
 const scroller=el('div',{className:'btr-wall-scroll'});
 const wall=el('div',{className:'btr-wall'});scroller.append(wall);
 const wallOrder=shuffle(graphics);
 function stickerFor(item,x,y,size,stamped=false){
  const s=el('button',{type:'button',className:'btr-sticker'+(stamped?' stamped':'')},img(item.thumb,item.name));
  s.setAttribute('aria-label',item.name);s.title=item.name;
  s.style.cssText=`left:${x}px;top:${y}px;width:${size}px;--r:${rand(-16,16).toFixed(1)}deg;--fx:${rand(-900,900).toFixed(0)}px;--fy:${rand(-900,900).toFixed(0)}px`;
  s.dataset.index=graphics.indexOf(item);return s;
 }
 function layoutWall(){
  const width=scroller.clientWidth||innerWidth,cell=width<600?104:width<1100?140:158;
  const cols=Math.max(3,Math.floor(width/cell)),cw=width/cols,ch=cell*.86;
  const rows=Math.ceil(wallOrder.length/cols);
  wall.style.height=Math.max(innerHeight*1.4,rows*ch+ch)+'px';
  wall.replaceChildren(...wallOrder.map((item,i)=>{
   const col=i%cols,row=Math.floor(i/cols);
   return stickerFor(item,(col+.5)*cw+rand(-cw*.28,cw*.28)+(row%2?cw*.25:0),(row+.6)*ch+rand(-ch*.25,ch*.25),Math.round(cell*rand(.78,1.3)));
  }));
 }
 // Drag stickers to rearrange them; a click without a drag opens the graphic.
 let drag=null;
 wall.addEventListener('pointerdown',e=>{
  const s=e.target.closest('.btr-sticker');if(!s||e.button)return;
  drag={s,x:e.clientX,y:e.clientY,left:parseFloat(s.style.left),top:parseFloat(s.style.top),moved:false,id:e.pointerId};
 });
 addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.moved&&Math.hypot(dx,dy)>6){drag.moved=true;drag.s.classList.add('dragging');drag.s.setPointerCapture?.(e.pointerId);}
  if(drag.moved){drag.s.style.left=drag.left+dx+'px';drag.s.style.top=drag.top+dy+'px';}
 });
 addEventListener('pointerup',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const {s,moved}=drag;drag=null;s.classList.remove('dragging');
  if(moved){s.style.setProperty('--r',rand(-18,18).toFixed(1)+'deg');s.dataset.dragged='1';}
 });
 wall.addEventListener('click',e=>{
  const s=e.target.closest('.btr-sticker');
  if(s){if(s.dataset.dragged){delete s.dataset.dragged;return;}openLightbox(graphics,+s.dataset.index,'graphics');return;}
  // Clicking bare wall slaps a fresh sticker exactly there.
  if(!graphics.length)return;
  const r=wall.getBoundingClientRect();
  wall.append(stickerFor(pick(graphics),e.clientX-r.left,e.clientY-r.top,Math.round(rand(130,210)),true));
 });

 const rail=(side,list)=>{
  const track=el('div',{className:'btr-rail-track'});
  for(let i=0;i<2;i++)for(let k=0;k<4;k++)for(const a of list)track.append(img(a.full,'',{loading:'eager'}));
  const r=el('div',{className:'btr-rail '+side},track);r.setAttribute('aria-hidden','true');return r;
 };
 const leftRail=rail('left',adverts.length?adverts:[]),rightRail=rail('right',adverts.length?adverts.slice().reverse():[]);

 const wordmark=el('h1',{className:'btr-wordmark'},[el('span',{textContent:'BREAK'}),el('span',{textContent:'THY'}),el('span',{textContent:'RULE'})]);
 wordmark.setAttribute('aria-label','Break Thy Rule');
 const favPool=shuffle(favs);let favCursor=0;
 const nextFav=()=>favPool.length?favPool[favCursor++%favPool.length]:null;
 function paintWordmark(){
  if(!favPool.length)return;
  wordmark.style.backgroundImage=[nextFav(),nextFav(),nextFav()].map(f=>`url("${f.full}")`).join(',');
 }
 const enter=el('button',{type:'button',className:'btr-btn primary'},[actions.enterLabel,el('span',{textContent:'→',ariaHidden:'true'})]);
 const navButton=(label,action)=>{const b=el('button',{type:'button',className:'btr-btn',textContent:label});b.onclick=action;return b;};
const coverNav=el('nav',{className:'btr-cover-nav'},[
  navButton('SHOP',actions.shop),
  navButton('GALLERY',actions.gallery),
  navButton(siteMode?'ARCHIVE':'ARCHIVES',actions.archive),
  navButton('ABOUT',()=>openAbout())
 ]);coverNav.setAttribute('aria-label','Break Thy Rule sections');
 const plate=el('div',{className:'btr-plate'},[
  logo('btr-logo-plate'),
  el('div',{className:'btr-kicker'},[el('span',{textContent:'CHAPTER 00'}),el('span',{textContent:'IN THE BEGINNING'}),el('span',{textContent:'EST. EDEN'})]),
  wordmark,
  el('p',{className:'btr-tagline',textContent:'A CODEX WORN ON THE BODY'}),
  el('div',{className:'btr-tally'},[
   el('span',{},[el('b',{textContent:graphics.length}),'GRAPHICS']),
   el('span',{},[el('b',{textContent:favs.length}),'WITNESSES']),
   el('span',{},[el('b',{textContent:adverts.length}),'BROADSIDES'])
  ]),
  el('div',{className:'btr-actions'},[enter]),
  coverNav,
  el('p',{className:'btr-hint',textContent:'Drag the stickers. Click the wall to slap one down. Scroll to dig deeper.'})
 ]);
 const polaroids=[1,2,3,4].map(n=>{
  const f=nextFav();if(!f)return null;
  const p=el('figure',{className:'btr-polaroid p'+n},[img(f.thumb,'',{loading:'eager'}),el('figcaption',{textContent:['WITNESS','BELIEVER','DISCIPLE','HERETIC'][n-1]})]);
  p.setAttribute('aria-hidden','true');return p;
 });
 const tickerTrack=el('div',{className:'btr-ticker-track'});
 const readable=n=>n.length<=24&&/[a-z]{2}/i.test(n)&&!/\d{3,}|^img\b|chatgpt|gemini|copy|[a-z0-9]{12,}/i.test(n);
 const names=[...new Set(shuffle(graphics).map(g=>g.name.toUpperCase()).filter(readable))].slice(0,80);
 for(let i=0;i<2;i++)for(const n of names)tickerTrack.append(el('span',{textContent:n}),el('i',{textContent:'✦'}));
 const ticker=el('div',{className:'btr-ticker'},tickerTrack);ticker.setAttribute('aria-hidden','true');
 cover.append(scroller,leftRail,rightRail,...polaroids.filter(Boolean),plate,ticker);

 // Pointer parallax and a slow idle drift keep the wall breathing.
 let idleSince=performance.now(),driftAcc=0;
 const wake=()=>{idleSince=performance.now();};
 cover.addEventListener('pointermove',e=>{
  wake();if(reduceMotion)return;
  const nx=e.clientX/innerWidth-.5,ny=e.clientY/innerHeight-.5;
  wall.style.transform=`translate3d(${(-nx*26).toFixed(1)}px,${(-ny*18).toFixed(1)}px,0)`;
 });
 scroller.addEventListener('wheel',wake,{passive:true});scroller.addEventListener('touchstart',wake,{passive:true});
 function drift(now){
  if(cover.hidden||cover.classList.contains('leaving'))return;
  if(!reduceMotion&&!drag&&now-idleSince>2500){
   driftAcc+=.35;if(driftAcc>=1){const px=Math.floor(driftAcc);driftAcc-=px;
    if(scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-2)scroller.scrollTop=0;else scroller.scrollTop+=px;}
  }
  requestAnimationFrame(drift);
 }
 let wordTimer=null,polaroidTimer=null;
 function startLife(){
  paintWordmark();clearInterval(wordTimer);clearInterval(polaroidTimer);
  if(reduceMotion)return;
  wordTimer=setInterval(paintWordmark,4200);
  polaroidTimer=setInterval(()=>{
   const p=pick(polaroids.filter(Boolean)),f=nextFav();if(!p||!f)return;
   const picture=p.querySelector('img');picture.style.opacity=0;
   setTimeout(()=>{picture.src=f.thumb;picture.onload=()=>{picture.style.opacity=1;};},800);
  },3300);
  requestAnimationFrame(drift);
 }
 function openCover(){
  cover.hidden=false;cover.classList.remove('leaving');document.body.classList.add('btr-cover-open');
  if(!wall.childElementCount)layoutWall();
  startLife();enter.focus({preventScroll:true});
 }
 function closeCover(){
  if(cover.hidden||cover.classList.contains('leaving'))return;
  cover.classList.add('leaving');document.body.classList.remove('btr-cover-open');
  clearInterval(wordTimer);clearInterval(polaroidTimer);
  setTimeout(()=>{cover.hidden=true;cover.classList.remove('leaving');wall.replaceChildren();window.dispatchEvent(new Event('resize'));},reduceMotion?50:1150);
 }
 enter.onclick=actions.enter;
 cover.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]')){e.preventDefault();closeCover();}});
 let resizeTimer;addEventListener('resize',()=>{if(cover.hidden)return;clearTimeout(resizeTimer);resizeTimer=setTimeout(layoutWall,250);});

 /* ---------- Header entries ---------- */
 function decorateSiteHeader(){
  const top=document.querySelector('.site-top');if(!top)return;
  const codex=el('button',{type:'button',className:'btr-header-button codex',title:'Open the codex cover'},[graphics[0]?img(pick(graphics).thumb,'',{loading:'eager'}):null,el('span',{textContent:'CODEX'})]);
  codex.setAttribute('aria-label','Open the codex cover');codex.onclick=openCover;
  const about=el('button',{type:'button',className:'btr-about-link',textContent:'About'});about.onclick=openAbout;
  top.querySelector('.tabs')?.append(about);
  (top.querySelector('.enter-showroom')||top.lastChild).before(codex);
 }
 function decorateHeader(){
  const actions=document.querySelector('.header-actions');
  if(actions){
   const codex=el('button',{type:'button',className:'btr-header-button codex',title:'Back to the codex cover'},[graphics[0]?img(pick(graphics).thumb,'',{loading:'eager'}):null,el('span',{textContent:'CODEX'})]);
   codex.setAttribute('aria-label','Open the codex cover');codex.onclick=openCover;
   const gal=el('button',{type:'button',className:'btr-header-button gallery',title:'Open the gallery'},[el('span',{textContent:'GALLERY'})]);
   gal.setAttribute('aria-label','Open the gallery');gal.onclick=()=>openGallery();
   const ab=el('button',{type:'button',className:'text-button btr-about-link',textContent:'ABOUT'});
   ab.setAttribute('aria-label','About Break Thy Rule');ab.onclick=openAbout;
   actions.prepend(codex,gal);
   const shopButton=document.getElementById('view-product');(shopButton||actions.lastChild).after(ab);
  }
  const label=document.querySelector('.site-header .header-label');
  if(label&&graphics.length){
   const track=el('div',{className:'btr-strip-track'});
   const strip=shuffle(graphics).slice(0,40);
   for(let i=0;i<2;i++)for(const g of strip){const t=img(g.thumb,'');t.style.setProperty('--r',rand(-10,10).toFixed(0)+'deg');track.append(t);}
   const holder=el('div',{className:'btr-header-strip'},track);holder.setAttribute('aria-hidden','true');
   label.replaceWith(holder);
  }
 }

 // Buttons for the in-world gallery wall's media row (called from app.js).
 function decoratePosterLinks(nav){
  if(!nav)return;
  const add=(key,label,count)=>{if(!count)return;const b=el('button',{type:'button',textContent:`${label} · ${count}`});b.setAttribute('aria-label',`Open the gallery: ${count} ${label.toLowerCase()}`);b.onclick=()=>openGallery(key);nav.prepend(b);};
  add('adverts','ADVERTS',adverts.length);add('graphics','GRAPHICS',graphics.length);add('favs','WITNESSES',favs.length);
 }

 window.breakthyruleGallery={open:openGallery,openAbout,openCover,closeCover,decoratePosterLinks,openLightbox};
 document.body.append(cover,gallery,about,lightbox);
 const params=new URLSearchParams(location.search);
 if(siteMode){
  decorateSiteHeader();
  // The cover greets a visitor on the home page once per visit; the CODEX button brings it back anywhere.
  let seen=false;try{seen=sessionStorage.getItem('btr-cover-seen')==='1';sessionStorage.setItem('btr-cover-seen','1');}catch{}
  if(params.has('cover')||(sitePage==='home'&&!seen&&!params.has('nocover')))openCover();else cover.hidden=true;
 }else{
  decorateHeader();
  if(params.has('nocover'))cover.hidden=true;else openCover();
 }
})();
