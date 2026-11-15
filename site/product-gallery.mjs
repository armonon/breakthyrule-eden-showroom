const h=(tag,props={},...kids)=>{const e=Object.assign(document.createElement(tag),props);for(const k of kids.flat())if(k!=null)e.append(k);return e;};
export async function mountProductGallery(host){
 // The gallery enhancement supplies the full curated archive, including its removals.
 if(document.readyState!=='complete')await new Promise(r=>addEventListener('load',r,{once:true}));
 let items;
 try{const r=await fetch('/site/data/product-gallery.json',{cache:'no-cache'});if(!r.ok)throw Error();const data=await r.json();const seen=new Set();items=(data.items||[]).filter(x=>{if(!x?.src||seen.has(x.id||x.src))return false;seen.add(x.id||x.src);return true;});}catch{host.append(h('a',{href:'/gallery',textContent:'Visit the gallery ↗'}));return;}
 if(!items.length){host.hidden=true;return;}
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let index=0,timer=0,visible=false,paused=reduced.matches,hover=false,focused=false,inDialog=false,dead=false;
 const track=h('div',{className:'studio-gallery-track'}),count=h('span',{className:'studio-gallery-count'}),title=h('h2',{id:'product-gallery-title',textContent:'From the archive, in motion.'});
 const prev=h('button',{type:'button',ariaLabel:'Previous gallery slide',textContent:'←'}),next=h('button',{type:'button',ariaLabel:'Next gallery slide',textContent:'→'}),play=h('button',{type:'button',ariaLabel:'Pause gallery slideshow',textContent:'Pause'});
 const tools=h('div',{className:'studio-gallery-tools'},count,prev,play,next,h('a',{href:'/gallery',textContent:'Full gallery ↗'}));
 host.append(h('header',{className:'studio-gallery-head'},h('div',{},h('p',{className:'studio-eyebrow',textContent:'The entire gallery / '+items.length+' frames'}),title),tools),track);
 host.setAttribute('aria-roledescription','carousel');host.dataset.galleryCount=String(items.length);
 const dialog=h('dialog',{className:'studio-gallery-dialog',ariaLabel:'Gallery photograph'}),full=h('img',{alt:''}),caption=h('p'),dialogCount=h('span');
 const close=h('button',{type:'button',ariaLabel:'Close gallery photograph',textContent:'Close ×'}),dp=h('button',{type:'button',ariaLabel:'Previous photograph',textContent:'←'}),dn=h('button',{type:'button',ariaLabel:'Next photograph',textContent:'→'});
 let opened=0,returnTo=null;
 dialog.append(h('header',{},dialogCount,close),full,h('footer',{},dp,caption,dn));document.body.append(dialog);
 function showFull(){const item=items[opened];full.src=item.src;full.alt=item.alt||item.caption||'From the Break Thy Rule gallery';caption.textContent=item.caption||'';dialogCount.textContent=`${opened+1} / ${items.length}`;}
 function openPhoto(n,button){opened=n;returnTo=button;inDialog=true;syncTimer();showFull();dialog.showModal();close.focus();}
 function render(){
  count.textContent=`${String(index+1).padStart(3,'0')} / ${items.length}`;host.dataset.galleryIndex=String(index);
  track.replaceChildren(...Array.from({length:3},(_,offset)=>{const n=(index+offset)%items.length,item=items[n],image=h('img',{src:item.thumb||item.src,alt:item.alt||item.caption||'From the Break Thy Rule gallery',decoding:'async',loading:'lazy'}),button=h('button',{type:'button',className:'studio-gallery-slide',ariaLabel:`Open gallery photograph ${n+1} of ${items.length}`},image,h('span',{textContent:item.caption?.split('\n')[0]||'Break Thy Rule / archive'}));button.dataset.galleryId=item.id||String(n);button.onclick=()=>openPhoto(n,button);return button;}));
 }
 function syncTimer(){clearTimeout(timer);timer=0;play.textContent=paused?'Play':'Pause';play.setAttribute('aria-label',(paused?'Play':'Pause')+' gallery slideshow');play.setAttribute('aria-pressed',String(!paused));if(!dead&&visible&&!document.hidden&&!paused&&!focused&&!inDialog)timer=setTimeout(()=>{index=(index+1)%items.length;render();syncTimer();},4200);}
 const step=d=>{index=(index+d+items.length)%items.length;render();syncTimer();};
 prev.onclick=()=>step(-1);next.onclick=()=>step(1);play.onclick=()=>{paused=!paused;syncTimer();};
 close.onclick=()=>dialog.close();dp.onclick=()=>{opened=(opened+items.length-1)%items.length;showFull();};dn.onclick=()=>{opened=(opened+1)%items.length;showFull();};
 dialog.addEventListener('close',()=>{inDialog=false;full.removeAttribute('src');returnTo?.focus({preventScroll:true});syncTimer();});
 dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();dp.click();}if(e.key==='ArrowRight'){e.preventDefault();dn.click();}});
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 host.addEventListener('focusin',()=>{focused=track.contains(document.activeElement);syncTimer();});host.addEventListener('focusout',e=>{focused=track.contains(e.relatedTarget);syncTimer();});
 let touch=null;track.addEventListener('touchstart',e=>touch=e.touches[0]?.clientX,{passive:true});track.addEventListener('touchend',e=>{const x=e.changedTouches[0]?.clientX;if(touch!=null&&Math.abs(x-touch)>50)step(x<touch?1:-1);touch=null;},{passive:true});
 const io=new IntersectionObserver(([e])=>{visible=e.isIntersecting;syncTimer();},{threshold:.05});io.observe(host);
 const resume=()=>{hover=false;syncTimer();};document.addEventListener('visibilitychange',resume);addEventListener('pageshow',resume);addEventListener('pagehide',()=>{clearTimeout(timer);timer=0;});reduced.addEventListener('change',()=>{if(reduced.matches)paused=true;syncTimer();});
 render();syncTimer();
}
