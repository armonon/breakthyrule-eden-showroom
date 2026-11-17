import { enableGalleryScroll } from './horizontal-gallery.mjs?v=1';

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
 // Keep a wearer beside a garment while making the whole archive scrollable.
 // Repeated display references share one entry in the full-size photo viewer.
 const worn=items.filter(item=>item.category==='worn'),garments=items.filter(item=>item.category==='garments');
 const deck=worn.length&&garments.length?Array.from({length:Math.max(worn.length,garments.length)},(_,n)=>[worn[n%worn.length],garments[n%garments.length]]).flat():items;
 const itemIndex=new Map(items.map((item,n)=>[item,n]));
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),mobile=matchMedia('(max-width: 560px)'),canHover=matchMedia('(hover: hover)');
 let index=0,timer=0,visible=false,hover=false,focused=false,inDialog=false,manualUntil=0,direction=1,scrollFrame=0;
 let count=Math.min(mobile.matches?2:3,deck.length),opened=0,returnTo=null;
 const viewport=h('div',{className:'studio-gallery-window'}),track=h('div',{className:'studio-gallery-track'});
 viewport.append(track);
 const prev=h('button',{type:'button',ariaLabel:'Previous gallery slide',textContent:'←'}),next=h('button',{type:'button',ariaLabel:'Next gallery slide',textContent:'→'});
 host.classList.add('studio-postcard','studio-photo-gallery');host.style.setProperty('--gallery-visible',count);
 host.append(viewport,h('footer',{className:'studio-postcard-footer'},h('div',{className:'studio-gallery-tools'},prev,next),galleryLink()));
 host.setAttribute('aria-roledescription','carousel');host.dataset.galleryCount=String(items.length);
 const dialog=h('dialog',{className:'studio-gallery-dialog',ariaLabel:'Gallery photograph'}),full=h('img',{alt:''}),caption=h('p'),dialogCount=h('span');
 const close=h('button',{type:'button',ariaLabel:'Close gallery photograph',textContent:'Close ×'}),dp=h('button',{type:'button',ariaLabel:'Previous photograph',textContent:'←'}),dn=h('button',{type:'button',ariaLabel:'Next photograph',textContent:'→'});
 dialog.append(h('header',{},dialogCount,close),full,h('footer',{},dp,caption,dn));document.body.append(dialog);
 function showFull(){const item=items[opened];full.src=item.src;full.alt=item.alt||'Break Thy Rule garment photograph';caption.textContent=item.caption||'';dialogCount.textContent=`${opened+1} / ${items.length}`;}
 function stopScroll(){viewport.scrollTo({left:viewport.scrollLeft,behavior:'instant'});}
 function openPhoto(item,button){if(inDialog)return;stopScroll();opened=itemIndex.get(item);returnTo=button;inDialog=true;syncTimer();showFull();dialog.showModal();close.focus();}
 function makeSlide(item,n){
  const image=h('img',{src:item.thumb||item.src,alt:item.alt||'Break Thy Rule garment photograph',decoding:'async',loading:n<count?'eager':'lazy',draggable:false});
  const button=h('button',{type:'button',className:'studio-gallery-slide',ariaLabel:`Open gallery photograph ${itemIndex.get(item)+1} of ${items.length}`},image);
  button.dataset.galleryId=item.id||item.src;button.dataset.category=item.category;
  button.onclick=()=>openPhoto(item,button);return button;
 }
 const slides=deck.map(makeSlide);track.append(...slides);
 const distance=()=>slides.length>1?slides[1].offsetLeft-slides[0].offsetLeft:viewport.clientWidth;
 function markVisible(){
  scrollFrame=0;
  const step=distance()||1,left=viewport.scrollLeft,first=Math.floor(left/step),last=Math.ceil((left+viewport.clientWidth)/step)-1;
  index=Math.max(0,Math.min(deck.length-1,Math.round(left/step)));
  slides.forEach((button,n)=>{const shown=String(n>=first&&n<=last);if(button.dataset.galleryVisible!==shown)button.dataset.galleryVisible=shown;});
  host.dataset.galleryIndex=String(index);
  prev.disabled=left<=1;next.disabled=left>=viewport.scrollWidth-viewport.clientWidth-1;
 }
 const eligible=()=>deck.length>count&&visible&&!document.hidden&&!reduced.matches&&!hover&&!focused&&!inDialog;
 function syncTimer(){
  clearTimeout(timer);timer=0;
  const playing=eligible()&&performance.now()>=manualUntil;host.dataset.motion=playing?'playing':'still';
  if(eligible())timer=setTimeout(()=>step(direction,true),Math.max(3400,manualUntil-performance.now()));
 }
 function hold(source){manualUntil=performance.now()+10000;if(['pointer','keyboard','button'].includes(source))stopScroll();syncTimer();}
 function step(change,automatic=false){
  if(automatic&&(!eligible()||performance.now()<manualUntil)){syncTimer();return;}
  if(!automatic)hold('button');
  const limit=viewport.scrollWidth-viewport.clientWidth;
  if(automatic&&((change>0&&viewport.scrollLeft>=limit-1)||(change<0&&viewport.scrollLeft<=1)))change=direction=-change;
  viewport.scrollTo({left:Math.max(0,Math.min(limit,(Math.round(viewport.scrollLeft/distance())+change)*distance())),behavior:reduced.matches?'instant':'smooth'});
  syncTimer();
 }
 enableGalleryScroll(viewport,{label:'Garment and wearer photographs',onInteract:hold});
 viewport.addEventListener('scroll',()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(markVisible);syncTimer();},{passive:true});
 prev.onclick=()=>step(-1);next.onclick=()=>step(1);
 close.onclick=()=>dialog.close();dp.onclick=()=>{opened=modulo(opened-1,items.length);showFull();};dn.onclick=()=>{opened=modulo(opened+1,items.length);showFull();};
 dialog.addEventListener('close',()=>{inDialog=false;full.removeAttribute('src');(returnTo?.isConnected?returnTo:viewport).focus({preventScroll:true});syncTimer();});
 dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'){event.preventDefault();dp.click();}if(event.key==='ArrowRight'){event.preventDefault();dn.click();}});
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 host.addEventListener('focusin',()=>{focused=true;stopScroll();syncTimer();});
 host.addEventListener('focusout',event=>{focused=host.contains(event.relatedTarget);syncTimer();});
 host.addEventListener('pointerenter',event=>{if(event.pointerType==='touch')return;hover=true;stopScroll();syncTimer();});
 host.addEventListener('pointerleave',event=>{if(event.pointerType==='touch')return;hover=false;syncTimer();});
 new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;syncTimer();},{threshold:.15}).observe(host);
 const resize=()=>{const saved=index;count=Math.min(mobile.matches?2:3,deck.length);host.style.setProperty('--gallery-visible',count);viewport.scrollTo({left:saved*distance(),behavior:'instant'});markVisible();syncTimer();};
 mobile.addEventListener('change',resize);
 let width=0;new ResizeObserver(([entry])=>{const nextWidth=Math.round(entry.contentRect.width);if(width!==nextWidth)resize();width=nextWidth;}).observe(viewport);
 const resume=()=>{hover=canHover.matches&&host.matches(':hover');focused=host.contains(document.activeElement);syncTimer();};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopScroll();resume();});addEventListener('pageshow',resume);addEventListener('pagehide',()=>{stopScroll();clearTimeout(timer);cancelAnimationFrame(scrollFrame);scrollFrame=0;});
 reduced.addEventListener('change',()=>{stopScroll();syncTimer();});
 markVisible();resume();
}
