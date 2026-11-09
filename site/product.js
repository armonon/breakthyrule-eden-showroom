'use strict';
(()=>{
 const el=window.siteEl,$=id=>document.getElementById(id),garments=window.siteGarments();
 const slug=new URLSearchParams(location.search).get('item');
 const g=garments.find(x=>x.slug===slug)||garments[0];if(!g)return;
 document.title='BREAKTHYRULE — '+g.name;
 $('chapter').textContent='Chapter '+g.chapter+' / No. '+g.id;$('name').textContent=g.name;$('price').textContent=g.price;
 $('tagline').textContent=g.tagline;$('description').textContent=g.description;$('model-note').textContent=g.modelNote||'';
 const photos=g.images.map(src=>window.showroomAssets.web(src));
 $('photo').src=photos[0];$('photo').alt=g.imageAlt||g.name;
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
 window.siteDiscussion($('discussion'),{key:'product:'+g.slug,space:siteConfig.circle.spaces.forum,title:g.name,prompt:'Wearing it? Questions about the print?'});
})();
