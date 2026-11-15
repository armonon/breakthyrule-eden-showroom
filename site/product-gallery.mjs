const h=(tag,props={},...kids)=>{const e=Object.assign(document.createElement(tag),props);for(const k of kids.flat())if(k!=null)e.append(k);return e;};
const galleryLink=()=>h('a',{href:'/gallery',ariaLabel:'Open full gallery',textContent:'↗'});
const appleStamp=()=>h('a',{href:'/about',className:'studio-postcard-stamp',ariaLabel:'About Break Thy Rule'},h('img',{src:'/site/eden-apple-red-bitmap.png',alt:'',width:40,height:42,decoding:'async'}));

export async function mountProductGallery(host){
 if(!host)return;
 host.removeAttribute('aria-labelledby');
 host.setAttribute('aria-label','Studio photographs');
 let items;
 try{
  const response=await fetch('/site/data/product-gallery.json',{cache:'no-cache'});
  if(!response.ok)throw Error();
  const data=await response.json(),seen=new Set();
  items=(data.items||[]).filter(item=>{if(!item?.src||seen.has(item.id||item.src))return false;seen.add(item.id||item.src);return true;});
 }catch{
  host.classList.add('studio-postcard');
  host.append(appleStamp(),h('footer',{className:'studio-postcard-footer'},galleryLink()));
  return;
 }
 if(!items.length){host.hidden=true;return;}
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),canHover=matchMedia('(hover: hover)');
 let index=0,timer=0,visible=false,hover=false,focused=false,inDialog=false;
 const track=h('div',{className:'studio-gallery-track'});
 const prev=h('button',{type:'button',ariaLabel:'Previous gallery slide',textContent:'←'}),next=h('button',{type:'button',ariaLabel:'Next gallery slide',textContent:'→'});
 const tools=h('div',{className:'studio-gallery-tools'},prev,next);
 host.classList.add('studio-postcard');
 host.append(appleStamp(),track,h('footer',{className:'studio-postcard-footer'},tools,galleryLink()));
 host.setAttribute('aria-roledescription','carousel');host.dataset.galleryCount=String(items.length);
 const dialog=h('dialog',{className:'studio-gallery-dialog',ariaLabel:'Gallery photograph'}),full=h('img',{alt:''}),caption=h('p'),dialogCount=h('span');
 const close=h('button',{type:'button',ariaLabel:'Close gallery photograph',textContent:'Close ×'}),dp=h('button',{type:'button',ariaLabel:'Previous photograph',textContent:'←'}),dn=h('button',{type:'button',ariaLabel:'Next photograph',textContent:'→'});
 let opened=0,returnTo=null;
 dialog.append(h('header',{},dialogCount,close),full,h('footer',{},dp,caption,dn));document.body.append(dialog);
 function showFull(){const item=items[opened];full.src=item.src;full.alt=item.alt||item.caption||'From the Break Thy Rule gallery';caption.textContent=item.caption||'';dialogCount.textContent=`${opened+1} / ${items.length}`;}
 function openPhoto(n,button){opened=n;returnTo=button;inDialog=true;syncTimer();showFull();dialog.showModal();close.focus();}
 function render(){
  host.dataset.galleryIndex=String(index);
  track.replaceChildren(...Array.from({length:Math.min(3,items.length)},(_,offset)=>{
   const n=(index+offset)%items.length,item=items[n];
   const image=h('img',{src:item.thumb||item.src,alt:item.alt||item.caption||'From the Break Thy Rule gallery',decoding:'async',loading:'lazy'});
   const button=h('button',{type:'button',className:'studio-gallery-slide',ariaLabel:`Open gallery photograph ${n+1} of ${items.length}`},image);
   button.dataset.galleryId=item.id||String(n);button.onclick=()=>openPhoto(n,button);return button;
  }));
 }
 function syncTimer(){
  clearTimeout(timer);timer=0;
  if(items.length>1&&visible&&!document.hidden&&!reduced.matches&&!hover&&!focused&&!inDialog){
   timer=setTimeout(()=>{index=(index+1)%items.length;render();syncTimer();},4200);
  }
 }
 const step=direction=>{index=(index+direction+items.length)%items.length;render();syncTimer();};
 prev.onclick=()=>step(-1);next.onclick=()=>step(1);
 close.onclick=()=>dialog.close();dp.onclick=()=>{opened=(opened+items.length-1)%items.length;showFull();};dn.onclick=()=>{opened=(opened+1)%items.length;showFull();};
 dialog.addEventListener('close',()=>{inDialog=false;full.removeAttribute('src');returnTo?.focus({preventScroll:true});syncTimer();});
 dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'){event.preventDefault();dp.click();}if(event.key==='ArrowRight'){event.preventDefault();dn.click();}});
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 host.addEventListener('focusin',()=>{focused=host.contains(document.activeElement);syncTimer();});
 host.addEventListener('focusout',event=>{focused=host.contains(event.relatedTarget);syncTimer();});
 host.addEventListener('pointerenter',event=>{if(event.pointerType==='touch')return;hover=true;syncTimer();});
 host.addEventListener('pointerleave',event=>{if(event.pointerType==='touch')return;hover=false;syncTimer();});
 let touch=null,suppressClickUntil=0;
 track.addEventListener('touchstart',event=>{const point=event.touches[0];touch=point?{x:point.clientX,y:point.clientY}:null;},{passive:true});
 track.addEventListener('touchend',event=>{
  const point=event.changedTouches[0];
  if(touch&&point){const dx=point.clientX-touch.x,dy=point.clientY-touch.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)){suppressClickUntil=performance.now()+400;step(dx<0?1:-1);}}
  touch=null;
 },{passive:true});
 track.addEventListener('touchcancel',()=>{touch=null;},{passive:true});
 track.addEventListener('click',event=>{if(performance.now()<suppressClickUntil){event.preventDefault();event.stopPropagation();}},true);
 const io=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;syncTimer();},{threshold:.05});io.observe(host);
 const resume=()=>{hover=canHover.matches&&host.matches(':hover');focused=host.contains(document.activeElement);syncTimer();};
 document.addEventListener('visibilitychange',resume);addEventListener('pageshow',resume);addEventListener('pagehide',()=>{clearTimeout(timer);timer=0;});
 reduced.addEventListener('change',syncTimer);
 render();resume();
}
