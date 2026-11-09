'use strict';
(()=>{
 const el=window.siteEl,garments=window.siteGarments(),$=id=>document.getElementById(id);
 const productURL=g=>'/product?item='+encodeURIComponent(g.slug);

 // Hero: the first tailored garment, spinning, draggable.
 const featured=garments.find(g=>g.model)||garments[0];
 if(featured){
  $('hero-stage').href=productURL(featured);$('hero-name').textContent=featured.id+' / '+featured.name;$('hero-price').textContent=featured.price;
  $('hero-photo').src=featured.photo;$('hero-photo').alt=featured.imageAlt||featured.name;
  const viewer=window.createGarmentViewer?.($('hero-viewer'));
  if(viewer&&featured.model)viewer.load(featured.model).then(()=>{$('hero-viewer').querySelector('canvas').classList.add('live');}).catch(()=>{});
  // Dragging the hero turns the garment; a click without a drag opens the product.
  let moved=0;$('hero-stage').addEventListener('pointerdown',e=>{moved=e.clientX;});
  $('hero-stage').addEventListener('click',e=>{if(Math.abs(e.clientX-moved)>6)e.preventDefault();});
 }

 // Product grid with chapter filter.
 const cards=garments.map(g=>{
  const canvas=el('canvas',{ariaHidden:'true'}),img=el('img',{src:g.photo,alt:g.imageAlt||g.name,loading:'lazy'});
  const card=el('a',{className:'product-card',href:productURL(g)},
   el('div',{className:'card-media'},el('span',{className:'card-badge',textContent:'Ch. '+g.chapter}),canvas,img),
   el('div',{className:'card-body'},el('h3',{textContent:g.name}),el('span',{textContent:g.price})));
  card.dataset.chapter=g.chapter;return {g,card,canvas};
 });
 $('product-grid').append(...cards.map(c=>c.card));
 const withModels=cards.filter(c=>c.g.rackModel||c.g.model);
 const carousel=window.createGarmentCarousel?.(withModels.map(c=>({canvas:c.canvas,url:c.g.rackModel||c.g.model})));
 $('grid-status').textContent=garments.length+' pieces'+(carousel?' / '+withModels.length+' in 3D — hover to spin faster, open a piece to turn it yourself.':' / 3D unavailable on this device, showing photographs.');

 const chapters=['All',...[...new Set(garments.map(g=>g.chapter))].sort()];
 for(const ch of chapters){
  const b=el('button',{type:'button',textContent:ch==='All'?'All':'Chapter '+ch});b.setAttribute('aria-pressed',String(ch==='All'));
  b.onclick=()=>{for(const x of $('chapter-filter').children)x.setAttribute('aria-pressed',String(x===b));
   for(const c of cards)c.card.hidden=ch!=='All'&&c.g.chapter!==ch;carousel?.request();};
  $('chapter-filter').append(b);
 }
})();
