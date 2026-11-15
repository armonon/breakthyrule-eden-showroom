// Original loose sticker-wall layout, scoped to a product's shared graphic library.
import { createWallMotion } from './graphic-board-motion.mjs';
const shuffled=items=>{const result=items.slice();for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;};
const random=(a,b)=>a+Math.random()*(b-a);
export function createGraphicStickerBoard({surface,pause,shuffle,getSelected,getActive,onPick,onImage,isBusy}){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),nodes=new Map();let items=[],order=[],expanded=false,signature='',rendered='',frame=0,destroyed=false;
 const empty=document.createElement('p');empty.className='ge-no-results';empty.textContent='No graphics match. Try another name or category.';empty.setAttribute('role','status');
 function tile(item){
  if(nodes.has(item.id))return nodes.get(item.id);
  const b=document.createElement('button');b.type='button';b.className='ge-tile ge-sticker';b.title=item.display||item.name;b.setAttribute('aria-label','Add '+b.title);b.dataset.id=item.id;
  const img=new Image();img.alt='';img.decoding='async';img.draggable=false;img.loading='lazy';img.src=item.thumb;
  img.addEventListener('load',()=>onImage(item.id,img));img.addEventListener('error',()=>{b.classList.add('ge-image-missing');});
  const label=document.createElement('span');label.textContent=b.title;b.append(img,label);b.onclick=()=>onPick(item.id);nodes.set(item.id,b);return b;
 }
 function updateSelection(){
  const selected=new Set(getSelected());let active=surface.querySelector('[data-id="'+CSS.escape(getActive()||'')+'"]')||surface.querySelector('button');
  if(surface.contains(document.activeElement)&&document.activeElement.matches('button'))active=document.activeElement;
  for(const b of surface.querySelectorAll('button')){b.setAttribute('aria-pressed',String(selected.has(b.dataset.id)));b.classList.toggle('is-active',b.dataset.id===getActive());b.tabIndex=b===active?0:-1;}
 }
 function positions(animate=false){
  const buttons=[...surface.querySelectorAll('button')];if(!buttons.length||expanded||!surface.clientWidth)return;
  const width=surface.clientWidth,height=surface.clientHeight,cols=Math.max(3,Math.round(width/115)),rows=Math.max(2,Math.ceil(buttons.length/cols)),cw=width/cols,ch=height/rows;
  const places=shuffled(buttons.map((_,i)=>i));
  buttons.forEach((b,i)=>{const oldX=b.offsetLeft,oldY=b.offsetTop,oldW=b.offsetWidth,oldRotation=b.style.getPropertyValue('--r')||'0deg';
   const size=Math.round(Math.min(140,cw*random(.83,1.18))),index=places[i];
   const x=Math.max(3,Math.min(width-size-3,(index%cols+.5)*cw-size/2+random(-cw*.15,cw*.15)));
   const y=Math.max(5,Math.min(height-90,(Math.floor(index/cols)+.5)*ch-55+random(-ch*.12,ch*.12)));
   const rotation=random(-13,13).toFixed(1)+'deg';b.getAnimations().forEach(a=>a.cancel());b.style.left=x+'px';b.style.top=y+'px';b.style.width=size+'px';b.style.setProperty('--r',rotation);
   if(animate&&!reduced.matches)b.animate([{transform:`translate(${oldX-x}px,${oldY-y}px) rotate(${oldRotation}) scale(${oldW/size})`},{transform:`translate(0,0) rotate(${rotation}) scale(1)`}],{duration:780,delay:i%6*35,easing:'cubic-bezier(.22,.8,.25,1)',fill:'backwards'});
  });
 }
 function paint(force=false){
  if(destroyed||!surface.clientWidth)return;
  surface.dataset.view=expanded?'archive':'wall';
  const cols=Math.max(3,Math.round(surface.clientWidth/115)),count=expanded?items.length:Math.min(items.length,cols*2),visible=expanded?items:order.slice(0,count);
  const key=(expanded?'archive:':'wall:')+visible.map(a=>a.id).join('|');
  if(force||rendered!==key){const focus=surface.contains(document.activeElement)?document.activeElement.dataset.id:null;rendered=key;surface.replaceChildren(...visible.map((item,i)=>{const b=tile(item);if(expanded){b.getAnimations().forEach(a=>a.cancel());for(const property of ['left','top','width','--r'])b.style.removeProperty(property);}b.querySelector('img').loading=expanded&&i>23?'lazy':'eager';return b;}));if(!visible.length)surface.append(empty);surface.scrollTop=0;positions();if(focus)surface.querySelector('[data-id="'+CSS.escape(focus)+'"]')?.focus({preventScroll:true});}
  updateSelection();
 }
 function fresh(){if(expanded)return;order=shuffled(items);paint(true);surface.dataset.wallArrangement='shuffle';}
 function rearrange(){if(expanded)return;positions(true);surface.dataset.wallArrangement='rearrange';}
 const motion=createWallMotion({wall:surface,button:pause,shuffle:fresh,rearrange,isBusy:()=>expanded||isBusy()});
 shuffle.onclick=()=>{fresh();motion.restart();};
 surface.addEventListener('focusin',e=>{if(!e.target.matches('button'))return;for(const b of surface.querySelectorAll('button'))b.tabIndex=b===e.target?0:-1;});
 surface.addEventListener('keydown',e=>{if(!e.target.matches('button')||e.altKey||e.ctrlKey||e.metaKey)return;const buttons=[...surface.querySelectorAll('button')],i=buttons.indexOf(e.target),cols=expanded?getComputedStyle(surface).gridTemplateColumns.trim().split(/\s+/).length:Math.max(3,Math.round(surface.clientWidth/115));let next;if(e.key==='ArrowRight')next=i+1;else if(e.key==='ArrowLeft')next=i-1;else if(e.key==='ArrowDown')next=i+cols;else if(e.key==='ArrowUp')next=i-cols;else if(e.key==='Home')next=0;else if(e.key==='End')next=buttons.length-1;else return;e.preventDefault();const b=buttons[Math.max(0,Math.min(buttons.length-1,next))];b?.focus({preventScroll:true});if(expanded&&b){const box=b.getBoundingClientRect(),viewport=surface.getBoundingClientRect();if(box.top<viewport.top)surface.scrollTop+=box.top-viewport.top;else if(box.bottom>viewport.bottom)surface.scrollTop+=box.bottom-viewport.bottom;}});
 const resize=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{paint();positions();});});resize.observe(surface);
 return {prime(next){if(signature)return;items=next;signature=items.map(a=>a.id).join('|');order=shuffled(items);for(const item of order.slice(0,12))tile(item).querySelector('img').loading='eager';},render(next,{open=false}={}){items=next;const key=items.map(a=>a.id).join('|');if(key!==signature){signature=key;order=shuffled(items);}const changed=expanded!==open;expanded=open;pause.hidden=shuffle.hidden=open;paint(changed);motion.restart();},destroy(){destroyed=true;resize.disconnect();cancelAnimationFrame(frame);motion.destroy();nodes.clear();}};
}
