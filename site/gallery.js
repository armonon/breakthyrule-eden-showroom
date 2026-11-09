'use strict';
(async()=>{
 const el=window.siteEl,$=id=>document.getElementById(id);
 $('ig-link').href=siteConfig.instagram;
 const labels={all:'All',garments:'Garments',models:'Models',worn:'Worn by you',events:'Events',instagram:'Instagram'};
 let data={categories:[],items:[]};
 try{data=await (await fetch('/site/data/gallery.json',{cache:'no-cache'})).json();}catch{}
 const items=data.items;let shown=items,current=0,filter='all';
 const present=['all',...data.categories.filter(c=>items.some(i=>i.category===c))];
 const pending=data.categories.filter(c=>!present.includes(c));
 function render(){
  shown=filter==='all'?items:items.filter(i=>i.category===filter);
  $('masonry').replaceChildren(...shown.map((item,i)=>{
   const fig=el('figure',{tabIndex:0},el('img',{src:item.src,alt:item.alt,loading:'lazy'}),item.caption?el('figcaption',{textContent:item.caption.split('\n')[0]}):null);
   fig.onclick=()=>open(i);fig.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(i);}};return fig;}));
  if(!shown.length)$('masonry').replaceChildren(el('div',{className:'empty-state',textContent:'Nothing here yet.'}));
  $('count').textContent=shown.length+' images'+(pending.length?' / coming soon: '+pending.map(c=>labels[c]).join(', '):'');
 }
 for(const c of present){const b=el('button',{type:'button',textContent:labels[c]||c});b.setAttribute('aria-pressed',String(c==='all'));
  b.onclick=()=>{filter=c;for(const x of $('filters').children)x.setAttribute('aria-pressed',String(x===b));render();};$('filters').append(b);}
 if(!items.length)$('masonry').replaceChildren(el('div',{className:'empty-state',textContent:'The gallery is being hung. Check back soon.'}));else render();

 function show(){const item=shown[current];$('lb-img').src=item.src;$('lb-img').alt=item.alt;$('lb-caption').textContent=item.caption||'';
  $('lb-count').textContent=(current+1)+' / '+shown.length+(item.source?' — '+item.source:'');
  $('lb-product').hidden=!item.product;if(item.product){$('lb-product').href='/product?item='+encodeURIComponent(item.product);$('lb-product').textContent='View in 3D ↗';}}
 function open(i){current=i;show();$('lightbox').showModal();}
 const step=d=>{current=(current+d+shown.length)%shown.length;show();};
 $('lb-prev').onclick=()=>step(-1);$('lb-next').onclick=()=>step(1);$('lb-close').onclick=()=>$('lightbox').close();
 $('lightbox').addEventListener('keydown',e=>{if(e.key==='ArrowLeft')step(-1);if(e.key==='ArrowRight')step(1);});
 let touch=null;$('lightbox').addEventListener('touchstart',e=>touch=e.touches[0].clientX,{passive:true});
 $('lightbox').addEventListener('touchend',e=>{if(touch==null)return;const dx=e.changedTouches[0].clientX-touch;if(Math.abs(dx)>50)step(dx<0?1:-1);touch=null;});

 window.siteDiscussion($('discussion'),{key:'gallery',space:siteConfig.circle.spaces.gallery,title:'Worn by you',prompt:'Post a photo of your fit and tell us where you wore it.'});
})();
