'use strict';
(()=>{
 const el=window.siteEl,garments=window.siteGarments(),$=id=>document.getElementById(id);
 const productURL=g=>'/product?item='+encodeURIComponent(g.slug);
 const glow=(node,src)=>window.siteHalo(src).then(color=>{if(color)node.style.setProperty('--halo',color);});

 // Hero: the featured garment on the altar, spinning in its own glow, draggable.
 const featured=garments.find(g=>g.model)||garments[0];
 if(featured){
  $('hero-stage').href=productURL(featured);$('hero-plate').textContent='Plate '+featured.id;$('hero-name').textContent=featured.name;$('hero-price').textContent=featured.price;
  $('hero-chapter').textContent='Chapter '+featured.chapter+' — '+featured.tagline;
  $('hero-photo').src=featured.photo;$('hero-photo').alt=featured.imageAlt||featured.name;
  glow($('hero-stage'),featured.photo);
  const light=()=>setTimeout(()=>$('hero-halo').classList.add('lit'),250);
  // With data-lab-hero, site/hero-lab.mjs spins Garment Lab pieces here instead; the featured photo is the fallback.
  const viewer=$('hero-stage').hasAttribute('data-lab-hero')?null:window.createGarmentViewer?.($('hero-viewer'));
  if(viewer&&featured.model)viewer.load(featured.model).then(()=>{$('hero-viewer').querySelector('canvas').classList.add('live');light();}).catch(light);else if(!$('hero-stage').hasAttribute('data-lab-hero'))light();
  // Dragging the hero turns the garment; a click without a drag opens the product.
  let moved=0;$('hero-stage').addEventListener('pointerdown',e=>{moved=e.clientX;});
  $('hero-stage').addEventListener('click',e=>{if(Math.abs(e.clientX-moved)>6)e.preventDefault();});
  // A candle-light spot follows the pointer across the altar.
  $('hero-stage').addEventListener('pointermove',e=>{const r=$('hero-stage').getBoundingClientRect();
   $('hero-spot').style.setProperty('--mx',(e.clientX-r.left)+'px');$('hero-spot').style.setProperty('--my',(e.clientY-r.top)+'px');});
 }

 // Catalogue plates with chapter filter.
 const cards=garments.map(g=>{
  const canvas=el('canvas',{ariaHidden:'true'}),img=el('img',{src:g.photo,alt:g.imageAlt||g.name,loading:'lazy'});
  const media=el('div',{className:'card-media'},el('div',{className:'halo lit'}),el('span',{className:'card-badge',textContent:'Plate '+g.id}),el('span',{className:'card-numeral',textContent:g.chapter,title:'Chapter '+g.chapter}),canvas,img);
  const card=el('a',{className:'product-card',href:productURL(g)},media,
   el('div',{className:'card-body'},el('h3',{textContent:g.name}),el('span',{className:'price',textContent:g.price}),g.tagline?el('span',{className:'plate-line',textContent:g.tagline}):null));
  card.dataset.chapter=g.chapter;
  // Only sample a glow colour once the plate is near the screen.
  new IntersectionObserver((entries,io)=>{if(entries[0].isIntersecting){glow(media,g.photo);io.disconnect();}},{rootMargin:'300px'}).observe(media);
  return {g,card,canvas};
 });
 $('product-grid').append(...cards.map(c=>c.card));
 const withModels=cards.filter(c=>c.g.rackModel||c.g.model);
 const carousel=window.createGarmentCarousel?.(withModels.map(c=>({canvas:c.canvas,url:c.g.rackModel||c.g.model})));
 $('grid-status').textContent=window.siteRoman(garments.length)+' plates — '+garments.length+' pieces'+(carousel?', '+withModels.length+' turning in 3D. Hover a plate to quicken it; open one to turn it by hand.':'. 3D is unavailable on this device, so the photographs are shown.');

// Chapters are Roman numerals; order them by value, not alphabetically.
 const roman=r=>{const v={I:1,V:5,X:10,L:50};let n=0;for(let i=0;i<r.length;i++){const a=v[r[i]]||0,b=v[r[i+1]]||0;n+=a<b?-a:a;}return n||99;};
 const chapters=['All',...[...new Set(garments.map(g=>g.chapter))].sort((a,b)=>roman(a)-roman(b))];
 for(const ch of chapters){
  const b=el('button',{type:'button'});
  if(ch==='All')b.textContent='All chapters';else b.append('Chapter',el('span',{className:'numeral',textContent:ch}));
  b.setAttribute('aria-pressed',String(ch==='All'));
  b.onclick=()=>{for(const x of $('chapter-filter').children)x.setAttribute('aria-pressed',String(x===b));
   for(const c of cards)c.card.hidden=ch!=='All'&&c.g.chapter!==ch;carousel?.request();};
  $('chapter-filter').append(b);
 }
})();
