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


})();
