'use strict';
(async()=>{
 const el=window.siteEl,$=id=>document.getElementById(id);
 $('ig-link').href=siteConfig.instagram;
 const labels={all:'All',garments:'Garments',models:'Models',worn:'Worn',events:'Events',instagram:'Instagram',graphics:'The codex',adverts:'Broadsides'};
 let data={categories:[],items:[]};
 try{data=await (await fetch('/site/data/gallery.json',{cache:'no-cache'})).json();}catch{}
 const items=data.items;let shown=items,current=0,filter='all';
 const present=['all',...data.categories.filter(c=>items.some(i=>i.category===c))];
 const pending=data.categories.filter(c=>!present.includes(c));
 // Masonry that reads left to right: each plate goes to the shortest column.
 let figures=[];
 function layout(list){
  if(list)figures=list;
  const w=$('masonry').clientWidth||innerWidth,n=w>1100?4:w>760?3:2;
  const cols=Array.from({length:n},()=>el('div',{className:'masonry-col'})),heights=new Array(n).fill(0);
  for(const fig of figures){const k=heights.indexOf(Math.min(...heights));cols[k].append(fig);heights[k]+=(+fig.dataset.ratio||1.2)+.18;}
  $('masonry').replaceChildren(...cols);
 }
 let lastCols=0;addEventListener('resize',()=>{const w=$('masonry').clientWidth,n=w>1100?4:w>760?3:2;if(n!==lastCols){lastCols=n;if(figures.length)layout();}});
 function render(){
  shown=filter==='all'?items:items.filter(i=>i.category===filter);
  layout(shown.map((item,i)=>{
   const picture=el('img',{src:item.thumb||item.src,alt:item.alt,loading:'lazy',decoding:'async'});
   if(item.ratio){picture.width=600;picture.height=Math.round(600*item.ratio);}
   const fig=el('figure',{tabIndex:0,className:'cat-'+item.category},
    el('span',{className:'plate-tag',textContent:'Pl. '+window.siteRoman(i+1)}),
    picture,item.caption?el('figcaption',{textContent:item.caption.split('\n')[0]}):null);
   if(item.category==='graphics')fig.style.setProperty('--tilt',((i*37)%9-4)*.6+'deg');
   fig.onclick=()=>open(i);fig.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(i);}};fig.dataset.ratio=item.ratio||1.2;return fig;}));
  if(!shown.length)$('masonry').replaceChildren(el('div',{className:'empty-state',textContent:'Nothing here yet.'}));
  $('count').textContent=shown.length+' plates'+(pending.length?' · coming soon: '+pending.map(c=>labels[c]).join(', '):'');
 }
 for(const c of present){const n=c==='all'?items.length:items.filter(i=>i.category===c).length;const b=el('button',{type:'button'},labels[c]||c,el('span',{className:'numeral',textContent:' '+n}));b.setAttribute('aria-pressed',String(c==='all'));
  b.onclick=()=>{filter=c;for(const x of $('filters').children)x.setAttribute('aria-pressed',String(x===b));render();};$('filters').append(b);}
 const wanted=new URLSearchParams(location.search).get('filter');
 if(wanted&&present.includes(wanted)){filter=wanted;for(const x of $('filters').children)x.setAttribute('aria-pressed',String(x.textContent.startsWith(labels[wanted])));}
 if(!items.length)$('masonry').replaceChildren(el('div',{className:'empty-state',textContent:'The gallery is being hung. Check back soon.'}));else render();

 function show(){const item=shown[current];$('lb-img').src=item.src;$('lb-img').alt=item.alt;$('lb-caption').textContent=item.caption||'';
  $('lb-count').textContent='Plate '+window.siteRoman(current+1)+' of '+shown.length+(item.source?' — '+item.source:'');$('lightbox').classList.toggle('is-graphic',item.category==='graphics');
  $('lb-product').hidden=!item.product;if(item.product){$('lb-product').href='/product?item='+encodeURIComponent(item.product);$('lb-product').textContent='View in 3D ↗';}}
 function open(i){current=i;show();$('lightbox').showModal();}
 const step=d=>{current=(current+d+shown.length)%shown.length;show();};
 $('lb-prev').onclick=()=>step(-1);$('lb-next').onclick=()=>step(1);$('lb-close').onclick=()=>$('lightbox').close();
 $('lightbox').addEventListener('keydown',e=>{if(e.key==='ArrowLeft')step(-1);if(e.key==='ArrowRight')step(1);});
 let touch=null;$('lightbox').addEventListener('touchstart',e=>touch=e.touches[0].clientX,{passive:true});
 $('lightbox').addEventListener('touchend',e=>{if(touch==null)return;const dx=e.changedTouches[0].clientX-touch;if(Math.abs(dx)>50)step(dx<0?1:-1);touch=null;});

 window.siteDiscussion($('discussion'),{key:'gallery',space:siteConfig.circle.spaces.gallery,title:'Worn by you',prompt:'Post a photo of your fit and tell us where you wore it.'});
})();
