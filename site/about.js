/* Bitmap dissolves for the two printed images. No layout or copy animation. */
(() => {
 'use strict';
 const page = document.querySelector('#about-paper, [data-bitmap-about]');
 if (!page) return;
 const zone = page.querySelector('.printed-images');
 const motionButton = page.querySelector('#print-motion, [data-print-motion]');
 const hint = page.querySelector('#print-hint, [data-print-hint]');
 const status = page.querySelector('#print-status, [data-print-status]');
 if (!zone || !motionButton) return;
 const media = matchMedia('(prefers-reduced-motion: reduce)');
 const collections = [
  {selector:'.garment-print',name:'garment photo',fit:'cover',position:.45,images:[
   ['/images/breakthyrule/favs/full/img-0155.webp','Black-and-white print of a person wearing a Break Thy Rule graphic top.'],
   ['/images/breakthyrule/favs/full/img-0381.webp','Black-and-white print of an illustrated jacket with ribbons at the shoulders.'],
   ['/images/breakthyrule/favs/full/img-0367.webp','Black-and-white print of a hooded sweatshirt worn with wide white trousers.'],
   ['/images/breakthyrule/favs/full/img-0694.webp','Black-and-white print of an illustrated off-shoulder T-shirt worn outdoors.']
  ]},
  {selector:'.graphic-print',name:'graphic',fit:'contain',position:.5,images:[
   ['/images/breakthyrule/graphics/thumb/love-gives-wings.webp','Love Gives Wings: a winged heart graphic, printed in black and white.'],
   ['/images/breakthyrule/graphics/thumb/stay-weird.webp','Stay Weird: alien figures and lettering, printed in black and white.'],
   ['/images/breakthyrule/graphics/thumb/cult-leader.webp','Cult Leader: lettering and an illustrated symbol, printed in black and white.'],
   ['/images/breakthyrule/graphics/thumb/red-heart.webp','A heart and rosary graphic, printed in black and white.']
  ]}
 ];
 const cache = new Map();
 const slots = [];
 let motion = true;
 let inView = true;
 let timer = 0;
 let turn = 0;
 let epoch = 0;
 const animated = () => motion && !media.matches && !document.hidden && inView;
 function load(src) {
  if (cache.has(src)) return cache.get(src);
  const promise = new Promise((resolve,reject) => {
   const img = new Image();
   img.decoding = 'async';
   img.onload = async () => { try { await img.decode(); } catch (_) {} resolve(img); };
   img.onerror = () => reject(new Error('Print image unavailable'));
   img.src = src;
  });
  cache.set(src,promise);
  promise.catch(() => cache.delete(src));
  return promise;
 }
 function stopTimer() { clearTimeout(timer); timer = 0; epoch++; }
 function schedule() {
  clearTimeout(timer); timer = 0;
  if (!animated() || !slots.length) return;
  timer = setTimeout(async () => {
   timer = 0;
   const slot = slots[turn++ % slots.length];
   await advance(slot,false);
   schedule();
  }, 6800);
 }
 function announce(slot) {
  status.textContent = `${slot.name === 'graphic' ? 'Graphic' : 'Garment photo'} ${slot.index + 1} of ${slot.images.length}. ${slot.images[slot.index][1]}`;
 }
 function commit(slot,index,manual) {
  slot.index = index;
  slot.img.src = slot.images[index][0];
  slot.img.alt = slot.images[index][1];
  slot.description.textContent = slot.images[index][1];
  slot.button.dataset.printIndex = String(index);
  slot.button.setAttribute('aria-label',`Next ${slot.name} (${index + 1} of ${slot.images.length})`);
  slot.canvas.hidden = true;
  slot.button.classList.remove('is-dissolving');
  if (manual) announce(slot); else status.textContent = '';
  load(slot.images[(index + 1) % slot.images.length][0]).catch(() => {});
 }
 function raster(image,w,h,slot) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#fff';ctx.fillRect(0,0,w,h);
  const scale = slot.fit === 'cover' ? Math.max(w/image.naturalWidth,h/image.naturalHeight) : Math.min(w/image.naturalWidth,h/image.naturalHeight);
  const dw=image.naturalWidth*scale, dh=image.naturalHeight*scale;
  ctx.drawImage(image,(w-dw)/2,(h-dh)*slot.position,dw,dh);
  return canvas;
 }
 function dissolve(slot,from,to,index,manual) {
  return new Promise(resolve => {
   const width = slot.button.clientWidth, height = slot.button.clientHeight;
   const ratio = Math.min(devicePixelRatio || 1,1.5,600/Math.max(width,height));
   const w = Math.max(1,Math.round(width*ratio)), h = Math.max(1,Math.round(height*ratio));
   const canvas = slot.canvas;
   canvas.width=w;canvas.height=h;
   const ctx=canvas.getContext('2d');
   if (!ctx || width < 1 || height < 1) {commit(slot,index,manual);resolve();return;}
   let source,target;
   try {source=raster(from,w,h,slot);target=raster(to,w,h,slot);} catch (_) {commit(slot,index,manual);resolve();return;}
   ctx.drawImage(source,0,0);ctx.fillStyle='#fff';
   // Each square switches once: old ink -> a short paper-white gap -> new ink.
   // The random rank stays fixed throughout a dissolve, avoiding noisy flicker.
   const cell=Math.max(2,Math.round(3.5*ratio));
   const cols=Math.ceil(w/cell),rows=Math.ceil(h/cell);
   const events=[];
   let seed=5731+(slot.index+1)*151+(slot.name==='graphic'?729:0)+slot.cycle++*881;
   const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   const backwards=slot.cycle%2===0;
   for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const diagonal=(x/cols+y/rows)*.5;
    const rank=.62*rand()+.38*(backwards?1-diagonal:diagonal);
    const start=rank*.82;
    const region={x:x*cell,y:y*cell,w:Math.min(cell,w-x*cell),h:Math.min(cell,h-y*cell)};
    events.push({at:start,clear:true,region});
    events.push({at:Math.min(.995,start+.095+rand()*.055),clear:false,region});
   }
   events.sort((a,b)=>a.at-b.at);
   let cursor=0,frame=0,last=0,done=false;
   const start=performance.now(), duration=1150;
   canvas.hidden=false;slot.button.classList.add('is-dissolving');
   const finish=()=>{
    if(done)return;done=true;cancelAnimationFrame(frame);slot.finish=null;
    commit(slot,index,manual);resolve();
   };
   slot.finish=finish;
   const tick=now=>{
    if(done)return;
    if(!animated()){finish();return;}
    const progress=Math.min(1,(now-start)/duration);
    if(!last || now-last>=30 || progress===1){
     last=now;
     while(cursor<events.length && events[cursor].at<=progress){
      const event=events[cursor++],r=event.region;
      if(event.clear)ctx.fillRect(r.x,r.y,r.w,r.h);
      else ctx.drawImage(target,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h);
     }
    }
    if(progress>=1){finish();return;}
    frame=requestAnimationFrame(tick);
   };
   frame=requestAnimationFrame(tick);
  });
 }
 async function advance(slot,manual) {
  if(slot.busy)return;
  slot.busy=true;slot.button.setAttribute('aria-busy','true');
  const token=++slot.token, ownEpoch=epoch;
  const next=(slot.index+1)%slot.images.length;
  try {
   const [from,to]=await Promise.all([load(slot.images[slot.index][0]),load(slot.images[next][0])]);
   if(token!==slot.token || (!manual && (ownEpoch!==epoch || !animated())))return;
   if(animated())await dissolve(slot,from,to,next,manual);
   else commit(slot,next,manual);
  } catch (_) {
   if(manual && token===slot.token)status.textContent='That print could not load. The current image is still here.';
  } finally {
   if(token===slot.token){slot.busy=false;slot.button.removeAttribute('aria-busy');}
  }
 }
 function settle() {
  slots.forEach(slot=>{
   if(slot.finish)slot.finish();
   else if(slot.busy){slot.token++;slot.busy=false;slot.button.removeAttribute('aria-busy');}
  });
 }
 function sync() {
  stopTimer();
  if(!animated())settle();
  motionButton.disabled=media.matches;
  motionButton.textContent=media.matches?'Motion reduced':motion?'Pause images':'Resume images';
  schedule();
 }
 collections.forEach((collection,i)=>{
  const figure=zone.querySelector(collection.selector),img=figure?.querySelector('img');
  if(!figure||!img)return;
  const button=document.createElement('button');button.type='button';button.className='print-swap';
  button.setAttribute('aria-label',`Next ${collection.name} (1 of ${collection.images.length})`);
  button.title=`Next ${collection.name}`;button.dataset.printIndex='0';
  img.before(button);button.append(img);
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');canvas.hidden=true;button.append(canvas);
  const description=document.createElement('span');description.className='sr-only';description.id=`print-description-${i}`;description.textContent=collection.images[0][1];figure.append(description);
  button.setAttribute('aria-describedby',description.id);
  const slot={...collection,img,button,canvas,description,index:0,cycle:0,token:0,busy:false,finish:null};
  slots.push(slot);
  button.addEventListener('click',async()=>{stopTimer();await advance(slot,true);schedule();});
  load(collection.images[0][0]).catch(()=>{});
  load(collection.images[1][0]).catch(()=>{});
 });
 if(!slots.length)return;
 motionButton.hidden=false;if(hint)hint.hidden=false;
 motionButton.addEventListener('click',()=>{motion=!motion;sync();});
 media.addEventListener('change',sync);
 document.addEventListener('visibilitychange',sync);
 const observer=new IntersectionObserver(entries=>{inView=entries[0]?.isIntersecting??true;sync();});
 observer.observe(zone);
 const resize=new ResizeObserver(()=>{slots.forEach(slot=>{if(slot.finish)slot.finish();});});
 slots.forEach(slot=>resize.observe(slot.button));
 window.addEventListener('pagehide',()=>{stopTimer();settle();});
 window.addEventListener('pageshow',sync);
 sync();
})();
