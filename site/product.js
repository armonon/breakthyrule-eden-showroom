'use strict';
(()=>{
 const el=window.siteEl,$=id=>document.getElementById(id);
 const slug=new URLSearchParams(location.search).get('item');
 if(slug==='core-thermal'){location.replace('/core.html');return;}
 if(slug?.startsWith('pendant-')){
  document.body.classList.add('pendant-product');
  $('name').textContent='Loading necklace…';
  $('thumbs').hidden=true;
  $('showcase')?.closest('section')?.remove();
  const buy=$('buy');buy.textContent='Back to necklaces';buy.href='/?nocover=1#necklaces';buy.removeAttribute('target');buy.removeAttribute('rel');
  buy.parentElement.querySelector('a[href="/showroom"]')?.remove();
  import('/pendant-collection/product.js?v=site-audit-1').then(module=>module.renderPendantProduct(slug.slice(8))).catch(()=>{
   document.title='BREAKTHYRULE — Necklace unavailable';
   $('name').textContent='Necklace unavailable';
   $('description').textContent='This necklace could not load. Please try again or return to the collection.';
   $('viewer').removeAttribute('tabindex');$('viewer').removeAttribute('aria-label');
   $('viewer').textContent='Preview unavailable';
  });
  return;
 }
 const garments=window.siteGarments();
 const core=window.BTR_CORE?.find(p=>p.id===slug);
 if(core){window.renderCoreProduct(core);return;}
 const accessory=window.BTR_ACCESSORIES?.find(p=>p.id===slug);
 if(accessory){window.renderAccessoryProduct(accessory);return;}
 const belt=window.BTR_BELTS?.find(p=>p.id===slug||p.designSlug===slug);
 if(belt){window.renderBeltProduct(belt);return;}
 const g=garments.find(x=>x.slug===slug);
 if(!g){
  document.title='BREAKTHYRULE — Product not found';
  $('name').textContent='Product not found';$('description').textContent='This piece is no longer available at this address. Explore the collection to find another.';
  $('viewer').hidden=true;$('thumbs').hidden=true;$('showcase')?.closest('section')?.remove();
  const buy=$('buy');buy.textContent='Back to the collection ↗';buy.href='/?nocover=1#products';buy.removeAttribute('target');buy.removeAttribute('rel');
  buy.parentElement.querySelector('a[href="/showroom"]')?.remove();
  return;
 }
 if(g.accessoryId){const replacement=window.BTR_ACCESSORIES?.find(p=>p.id===g.accessoryId);if(replacement){window.renderAccessoryProduct({...replacement,name:g.name,price:g.price});return;}}
 const archiveModel=g.model?.startsWith('/graphic-models/');if(archiveModel)document.body.classList.add('archive-product');
 document.title='BREAKTHYRULE — '+g.name;
 $('numeral').textContent=g.chapter;$('chapter').textContent='Chapter '+g.chapter+', plate '+g.id;$('name').textContent=g.name;$('price').textContent=g.price;
 $('tagline').textContent=g.tagline;$('description').textContent=g.description;$('model-note').textContent=g.modelNote||'';
 const photos=g.images.map(src=>window.showroomAssets.web(src));
 $('photo').src=photos[0];$('photo').alt=g.imageAlt||g.name;
 window.siteHalo(photos[0]).then(c=>{if(c)$('viewer').style.setProperty('--halo',c);setTimeout(()=>$('halo').classList.add('lit'),300);});
 let showingPhoto=false,modelReady=false;
 for(const id of ['spin','front','back'])$(id).disabled=true;
 const viewer=window.createGarmentViewer($('viewer'),{wheelZoom:true});
 function photoMode(on,src){on=on||!modelReady;showingPhoto=on;viewer?.setVisible?.(!on);if(src)$('photo').src=src;$('viewer').querySelector('canvas')?.classList.toggle('live',!on&&!!viewer);$('photos').setAttribute('aria-pressed',String(on));}
 photos.forEach((src,i)=>{const b=el('button',{type:'button'},el('img',{src,alt:(g.photoViews?.[i]||'Photo '+(i+1)),loading:'lazy',decoding:'async'}));b.onclick=()=>photoMode(true,src);$('thumbs').append(b);});
 if(viewer&&g.model){
  $('viewer-status').textContent='Loading 3D…';
  viewer.load(g.slug==='apple-gloves'&&new URLSearchParams(location.search).get('glove')==='black'?'/accessory-collection/models/apple-gloves-black.glb?v=quality-3':g.model).then(committed=>{if(committed===false)return;modelReady=true;for(const id of ['spin','front','back'])$(id).disabled=false;$('spin').setAttribute('aria-pressed',String(viewer.isAuto()));$('viewer-status').textContent='3D / drag to turn';photoMode(false);if(archiveModel){const T=window.THREE,size=new T.Box3().setFromObject(viewer.model()).getSize(new T.Vector3()),aspect=$('viewer').clientWidth/$('viewer').clientHeight,d=Math.max(4.4,2.2/Math.tan(Math.PI/12)/aspect/2.4);viewer.setZoom(Math.min(2,.76*2*d*Math.tan(Math.PI/12)/Math.max(size.y,Math.hypot(size.x,size.z)/aspect)));if(g.defaultView==='back'){viewer.view('back');viewer.setAuto(!matchMedia('(prefers-reduced-motion: reduce)').matches);}$('spin').setAttribute('aria-pressed',String(viewer.isAuto()));}window.mountAppleGloveColors?.({viewer,garment:g,photoMode});})
   .catch(()=>{$('viewer-status').textContent='3D unavailable — photographs shown';photoMode(true);});
 }else{$('viewer-status').textContent='Photographs';photoMode(true);}
 $('spin').onclick=()=>{photoMode(false);$('spin').setAttribute('aria-pressed',String(viewer?.setAuto(!viewer.isAuto())));};
 $('front').onclick=()=>{photoMode(false);viewer?.view('front');$('spin').setAttribute('aria-pressed','false');};
 $('back').onclick=()=>{photoMode(false);viewer?.view('back');$('spin').setAttribute('aria-pressed','false');};
 $('photos').onclick=()=>photoMode(!showingPhoto,photos[0]);
 // Gallery showcase: this piece's own photographs first, then people wearing the collection, then other pieces.
 (async()=>{
  let items=[];try{const data=await (await fetch('/site/data/gallery.json',{cache:'no-cache'})).json();if(Array.isArray(data?.items))items=data.items;}catch{}
  const mix=list=>list.slice().sort(()=>Math.random()-.5);
  const own=items.filter(i=>i.product===g.slug),worn=mix(items.filter(i=>['worn','models','events','instagram'].includes(i.category)));
  const others=mix(items.filter(i=>i.category==='garments'&&i.product&&i.product!==g.slug));
  const picks=[...own,...worn,...others].slice(0,18);
  const strip=$('showcase');if(!picks.length){strip.closest('section').hidden=true;return;}
  const list=picks.map(i=>({full:i.src,thumb:i.thumb||i.src,name:i.caption?i.caption.split('\n')[0]:(i.category==='garments'?'From the vault':'Worn in real life')}));
  strip.replaceChildren(...picks.map((item,n)=>{
   const tag=item.product===g.slug?'This piece':item.category==='garments'?'The collection':'Worn';
   const fig=el('button',{type:'button',className:'showcase-plate'+(item.product===g.slug?' is-own':'')},
    el('img',{src:item.thumb||item.src,alt:item.alt,loading:'lazy',decoding:'async'}),
    el('span',{className:'plate-tag',textContent:'Pl. '+window.siteRoman(n+1)}),
    el('span',{className:'plate-note',textContent:tag}));
   fig.setAttribute('aria-label','Open '+(list[n].name||'photograph'));
   fig.onclick=()=>window.breakthyruleGallery?.openLightbox(list,n,'gallery');
   return fig;}));
  const by=d=>strip.scrollBy({left:d*strip.clientWidth*.8,behavior:'smooth'});
  $('showcase-prev').onclick=()=>by(-1);$('showcase-next').onclick=()=>by(1);
 })();
})();
