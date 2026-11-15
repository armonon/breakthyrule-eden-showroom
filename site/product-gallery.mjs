const h=(tag,props={},...kids)=>{const e=Object.assign(document.createElement(tag),props);for(const k of kids.flat())if(k!=null)e.append(k);return e;};
const galleryLink=()=>h('a',{href:'/gallery',ariaLabel:'Open full gallery',textContent:'↗'});
const modulo=(n,length)=>(n%length+length)%length;

export async function mountProductGallery(host){
 if(!host)return;
 host.removeAttribute('aria-labelledby');host.setAttribute('aria-label','Garments and people wearing Break Thy Rule');
 let items;
 try{
  const response=await fetch('/site/data/product-gallery.json',{cache:'no-cache'});
  if(!response.ok)throw Error();
  const data=await response.json(),seen=new Set();
  items=(data.items||[]).filter(item=>{if(!item?.src||!['worn','garments'].includes(item.category)||seen.has(item.id||item.src))return false;seen.add(item.id||item.src);return true;});
 }catch{
  host.classList.add('studio-postcard','studio-photo-gallery');host.append(h('footer',{className:'studio-postcard-footer'},galleryLink()));return;
 }
 if(!items.length){host.hidden=true;return;}
 // Every two-photo window pairs a garment with a wearer, including the loop seam.
 // The full-size viewer still uses the unique list, not repeated display references.
 const worn=items.filter(item=>item.category==='worn'),garments=items.filter(item=>item.category==='garments');
 const deck=worn.length&&garments.length?Array.from({length:Math.max(worn.length,garments.length)},(_,n)=>[worn[n%worn.length],garments[n%garments.length]]).flat():items;
 const itemIndex=new Map(items.map((item,n)=>[item,n]));
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),mobile=matchMedia('(max-width: 560px)'),canHover=matchMedia('(hover: hover)');
 let index=0,timer=0,visible=false,hover=false,focused=false,inDialog=false,touching=false,busy=false,generation=0,motion=null,pending=0,prepended=false;
 let count=Math.min(mobile.matches?2:3,deck.length),opened=0,returnTo=null,returnId=null;
 const viewport=h('div',{className:'studio-gallery-window'}),track=h('div',{className:'studio-gallery-track'});
 viewport.append(track);
 const prev=h('button',{type:'button',ariaLabel:'Previous gallery slide',textContent:'←'}),next=h('button',{type:'button',ariaLabel:'Next gallery slide',textContent:'→'});
 host.classList.add('studio-postcard','studio-photo-gallery');host.style.setProperty('--gallery-visible',count);
 host.append(viewport,h('footer',{className:'studio-postcard-footer'},h('div',{className:'studio-gallery-tools'},prev,next),galleryLink()));
 host.setAttribute('aria-roledescription','carousel');host.dataset.galleryCount=String(items.length);
 const dialog=h('dialog',{className:'studio-gallery-dialog',ariaLabel:'Gallery photograph'}),full=h('img',{alt:''}),caption=h('p'),dialogCount=h('span');
 const close=h('button',{type:'button',ariaLabel:'Close gallery photograph',textContent:'Close ×'}),dp=h('button',{type:'button',ariaLabel:'Previous photograph',textContent:'←'}),dn=h('button',{type:'button',ariaLabel:'Next photograph',textContent:'→'});
 dialog.append(h('header',{},dialogCount,close),full,h('footer',{},dp,caption,dn));document.body.append(dialog);
 const itemAt=n=>deck[modulo(n,deck.length)];
 function showFull(){const item=items[opened];full.src=item.src;full.alt=item.alt||'Break Thy Rule garment photograph';caption.textContent=item.caption||'';dialogCount.textContent=`${opened+1} / ${items.length}`;}
 function openPhoto(item,button){if(inDialog)return;stopTransition();opened=itemIndex.get(item);returnTo=button.isConnected?button:[...track.children].find(node=>node.dataset.galleryId===(item.id||item.src));returnId=item.id||item.src;inDialog=true;syncTimer();showFull();dialog.showModal();close.focus();}
 function makeSlide(position){
  const item=itemAt(position),image=h('img',{src:item.thumb||item.src,alt:item.alt||'Break Thy Rule garment photograph',decoding:'async'});
  const button=h('button',{type:'button',className:'studio-gallery-slide',ariaLabel:`Open gallery photograph ${itemIndex.get(item)+1} of ${items.length}`},image);
  button.dataset.galleryId=item.id||item.src;button.dataset.category=item.category;
  button.onclick=()=>openPhoto(item,button);return button;
 }
 function markVisible(){
  [...track.children].forEach((button,n)=>{const buffer=n>=count;button.inert=buffer;button.tabIndex=buffer?-1:0;button.toggleAttribute('aria-hidden',buffer);if(buffer)button.setAttribute('aria-hidden','true');});
  host.dataset.galleryIndex=String(index);
 }
 function render(){track.replaceChildren(...Array.from({length:Math.min(count+1,deck.length)},(_,offset)=>makeSlide(index+offset)));markVisible();}
 const canPlay=()=>deck.length>count&&visible&&!document.hidden&&!reduced.matches&&!hover&&!focused&&!inDialog&&!touching;
 function syncTimer(){
  if(motion){const inspecting=touching||track.contains(document.activeElement)||(canHover.matches&&viewport.matches(':hover'));if(inspecting)motion.pause();else motion.play();}
  clearTimeout(timer);timer=0;host.dataset.motion=canPlay()?'playing':'still';
  if(!busy&&canPlay())timer=setTimeout(()=>step(1,true),3400);
 }
 function stopTransition(){
  if(!busy)return;
  generation++;motion?.cancel();motion=null;busy=false;pending=0;
  // Roll back the strip without replacing the button under an arriving click.
  if(prepended){track.firstElementChild.remove();track.append(makeSlide(index+count));prepended=false;}
  host.removeAttribute('aria-busy');markVisible();
 }
 function readyImage(image){
  if(image.complete)return Promise.resolve();
  return new Promise(resolve=>{let timeout;const finish=()=>{clearTimeout(timeout);image.removeEventListener('load',finish);image.removeEventListener('error',finish);resolve();};image.addEventListener('load',finish,{once:true});image.addEventListener('error',finish,{once:true});timeout=setTimeout(finish,1800);});
 }
 async function step(direction,automatic=false){
  if(deck.length<=count)return;
  if(busy){if(!automatic)pending=direction;return;}
  if(automatic&&!canPlay())return;
  clearTimeout(timer);timer=0;busy=true;host.setAttribute('aria-busy','true');const token=++generation;
  const incoming=direction>0?track.lastElementChild:makeSlide(index-1);
  await readyImage(incoming.querySelector('img'));
  if(token!==generation)return;
  if(automatic&&!canPlay()){busy=false;host.removeAttribute('aria-busy');const queued=pending;pending=0;if(queued)step(queued);else syncTimer();return;}
  if(direction<0){track.lastElementChild.remove();track.prepend(incoming);prepended=true;[...track.children].forEach((node,n)=>{node.inert=n===0;node.tabIndex=n===0?-1:0;node.toggleAttribute('aria-hidden',n===0);if(n===0)node.setAttribute('aria-hidden','true');});}
  const distance=track.children[1].offsetLeft-track.children[0].offsetLeft;
  if(!reduced.matches&&track.animate){
   motion=track.animate([{transform:`translateX(${direction>0?0:-distance}px)`},{transform:`translateX(${direction>0?-distance:0}px)`}],{duration:850,easing:'cubic-bezier(.22,.72,.16,1)',fill:'forwards'});
   syncTimer();
   try{await motion.finished;}catch{if(token!==generation)return;}
  }
  if(token!==generation)return;
  index=modulo(index+direction,deck.length);
  if(direction>0){track.firstElementChild.remove();track.append(makeSlide(index+count));}
  motion?.cancel();motion=null;busy=false;prepended=false;host.removeAttribute('aria-busy');markVisible();
  const queued=pending;pending=0;if(queued)step(queued);else syncTimer();
 }
 prev.onclick=()=>step(-1);next.onclick=()=>step(1);
 close.onclick=()=>dialog.close();dp.onclick=()=>{opened=modulo(opened-1,items.length);showFull();};dn.onclick=()=>{opened=modulo(opened+1,items.length);showFull();};
 dialog.addEventListener('close',()=>{inDialog=false;full.removeAttribute('src');const target=returnTo?.isConnected&&!returnTo.inert?returnTo:[...track.children].find(node=>node.dataset.galleryId===returnId&&!node.inert)||next;target.focus({preventScroll:true});syncTimer();});
 dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'){event.preventDefault();dp.click();}if(event.key==='ArrowRight'){event.preventDefault();dn.click();}});
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 host.addEventListener('focusin',()=>{focused=host.contains(document.activeElement);syncTimer();});
 host.addEventListener('focusout',event=>{focused=host.contains(event.relatedTarget);syncTimer();});
 viewport.addEventListener('pointerenter',syncTimer);viewport.addEventListener('pointerleave',syncTimer);
 host.addEventListener('pointerenter',event=>{if(event.pointerType==='touch')return;hover=true;syncTimer();});
 host.addEventListener('pointerleave',event=>{if(event.pointerType==='touch')return;hover=false;syncTimer();});
 let touch=null,suppressClickUntil=0;
 viewport.addEventListener('touchstart',event=>{
  const point=event.touches.length===1?event.touches[0]:null,button=event.target.closest('.studio-gallery-slide');
  touch=point?{x:point.clientX,y:point.clientY,button,item:items.find(item=>(item.id||item.src)===button?.dataset.galleryId)}:null;
  touching=true;stopTransition();syncTimer();
 },{passive:true});
 viewport.addEventListener('touchend',event=>{
  const point=event.changedTouches[0],start=touch;touch=null;touching=false;
  if(start&&point){
   const dx=point.clientX-start.x,dy=point.clientY-start.y;
   if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)){suppressClickUntil=performance.now()+500;step(dx<0?1:-1);}
   else if(Math.abs(dx)<10&&Math.abs(dy)<10&&start.item&&!start.button.inert){suppressClickUntil=performance.now()+500;openPhoto(start.item,start.button);}
  }
  syncTimer();
 },{passive:true});
 viewport.addEventListener('touchcancel',()=>{touch=null;touching=false;syncTimer();},{passive:true});
 viewport.addEventListener('click',event=>{if(performance.now()<suppressClickUntil){event.preventDefault();event.stopPropagation();}},true);
 const io=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;syncTimer();},{threshold:.15});io.observe(host);
 const resize=()=>{const focusId=track.contains(document.activeElement)?document.activeElement.dataset.galleryId:null;stopTransition();count=Math.min(mobile.matches?2:3,deck.length);host.style.setProperty('--gallery-visible',count);render();if(focusId)([...track.children].find(node=>node.dataset.galleryId===focusId&&!node.inert)||next).focus({preventScroll:true});syncTimer();};
 mobile.addEventListener('change',resize);
 let width=0;new ResizeObserver(([entry])=>{const nextWidth=Math.round(entry.contentRect.width);if(width&&width!==nextWidth)resize();width=nextWidth;}).observe(viewport);
 const resume=()=>{hover=canHover.matches&&host.matches(':hover');focused=host.contains(document.activeElement);syncTimer();};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTransition();resume();});addEventListener('pageshow',resume);addEventListener('pagehide',()=>{stopTransition();clearTimeout(timer);timer=0;});
 reduced.addEventListener('change',()=>{stopTransition();syncTimer();});
 render();resume();
}
