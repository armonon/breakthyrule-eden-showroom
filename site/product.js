'use strict';
(()=>{
 const el=window.siteEl,$=id=>document.getElementById(id),garments=window.siteGarments();
 const slug=new URLSearchParams(location.search).get('item');
 const g=garments.find(x=>x.slug===slug)||garments[0];if(!g)return;
 document.title='BREAKTHYRULE — '+g.name;
 $('numeral').textContent=g.chapter;$('chapter').textContent='Chapter '+g.chapter+', plate '+g.id;$('name').textContent=g.name;$('price').textContent=g.price;
 $('tagline').textContent=g.tagline;$('description').textContent=g.description;$('model-note').textContent=g.modelNote||'';
 const photos=g.images.map(src=>window.showroomAssets.web(src));
 $('photo').src=photos[0];$('photo').alt=g.imageAlt||g.name;
 window.siteHalo(photos[0]).then(c=>{if(c)$('viewer').style.setProperty('--halo',c);setTimeout(()=>$('halo').classList.add('lit'),300);});
 let showingPhoto=false;
 const viewer=window.createGarmentViewer($('viewer'),{wheelZoom:true});
 function photoMode(on,src){showingPhoto=on;if(src)$('photo').src=src;$('viewer').querySelector('canvas')?.classList.toggle('live',!on&&!!viewer);$('photos').setAttribute('aria-pressed',String(on));}
 photos.forEach((src,i)=>{const b=el('button',{type:'button'},el('img',{src,alt:(g.photoViews?.[i]||'Photo '+(i+1))}));b.onclick=()=>photoMode(true,src);$('thumbs').append(b);});
 if(viewer&&g.model){
  $('viewer-status').textContent='Loading 3D…';
  viewer.load(g.model).then(()=>{$('viewer-status').textContent='3D / drag to turn';photoMode(false);})
   .catch(()=>{$('viewer-status').textContent='3D unavailable — photographs shown';photoMode(true);});
 }else{$('viewer-status').textContent='Photographs';photoMode(true);}
 $('spin').onclick=()=>{photoMode(false);$('spin').setAttribute('aria-pressed',String(viewer?.setAuto(!viewer.isAuto())));};
 $('front').onclick=()=>{photoMode(false);viewer?.view('front');$('spin').setAttribute('aria-pressed','false');};
 $('back').onclick=()=>{photoMode(false);viewer?.view('back');$('spin').setAttribute('aria-pressed','false');};
 $('photos').onclick=()=>photoMode(!showingPhoto,photos[0]);
 // Gallery showcase: this piece's own photographs first, then people wearing the collection, then other pieces.
 (async()=>{
  let items=[];try{items=(await (await fetch('/site/data/gallery.json',{cache:'no-cache'})).json()).items;}catch{}
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
