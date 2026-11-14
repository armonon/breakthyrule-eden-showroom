'use strict';
// Faint monochrome bitmap motifs, cached once and drawn on one low-resolution canvas.
(() => {
 if(document.body.dataset.page!=='home'||document.getElementById('codex-backdrop'))return;
 const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/site/bitmap-background.css?v=1';sheet.dataset.btrBitmapBackground='';document.head.append(sheet);
 const graphics=(window.breakthyruleAssets?.graphics||[]).filter(item=>item.thumb);
 if(!graphics.length)return;
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 const canvas=document.createElement('canvas');canvas.id='codex-backdrop';canvas.dataset.bitmapBackground='true';canvas.setAttribute('aria-hidden','true');document.body.prepend(canvas);
 const ctx=canvas.getContext('2d');if(!ctx){canvas.remove();return;}
 const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
 const rand=(a,b)=>a+Math.random()*(b-a),cache=new Map(),rejected=new Set();
 let W=0,H=0,sprites=[],queue=[],mouseX=0,mouseY=0,targetX=0,targetY=0;
 let raf=0,timer=0,resizeTimer=0,last=0,disposed=false,scrollOffset=scrollY;
 const active=()=>!disposed&&!document.hidden&&!document.body.classList.contains('btr-cover-open');
 const count=()=>Math.round(Math.min(26,Math.max(12,innerWidth*innerHeight/62000)));
 function nextItem(){
  if(!queue.length)queue=graphics.filter(item=>!rejected.has(item.thumb)).sort(()=>Math.random()-.5);
  return queue.pop();
 }
 function makeBitmap(image){
  const probe=document.createElement('canvas');probe.width=probe.height=24;
  const p=probe.getContext('2d',{willReadFrequently:true});if(!p)throw Error('Canvas unavailable');
  p.drawImage(image,0,0,24,24);const alpha=p.getImageData(0,0,24,24).data;
  const corners=[[0,0],[23,0],[0,23],[23,23],[12,0],[0,12],[23,12],[12,23]];
  if(corners.filter(([px,py])=>alpha[(py*24+px)*4+3]<24).length<6)return null;
  const c=document.createElement('canvas');c.width=c.height=96;
  const x=c.getContext('2d',{willReadFrequently:true});if(!x)throw Error('Canvas unavailable');
  const k=Math.min(92/image.naturalWidth,92/image.naturalHeight),w=image.naturalWidth*k,h=image.naturalHeight*k;
  x.drawImage(image,(96-w)/2,(96-h)/2,w,h);
  const pixels=x.getImageData(0,0,96,96),data=pixels.data;
  const histogram=new Uint32Array(256);let total=0;
  for(let i=0;i<data.length;i+=4)if(data[i+3]>24){histogram[Math.round(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)]++;total++;}
  if(!total)return null;
  let low=0,high=255,sum=0,found=false;
  for(let i=0;i<256;i++){sum+=histogram[i];if(!found&&sum>=total*.03){low=i;found=true;}if(sum>=total*.97){high=i;break;}}
  const range=Math.max(80,high-low);
  for(let py=0;py<96;py++)for(let px=0;px<96;px++){
   const i=(py*96+px)*4,threshold=(BAYER[(py&3)*4+(px&3)]+.5)/16;
   if(data[i+3]/255<=threshold){data[i+3]=0;continue;}
   const light=Math.min(1,Math.max(0,(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722-low)/range));
   // Print the dark ink as white dots on the black page. No colored pixels survive.
   const value=light>threshold?0:255;data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
  }
  x.putImageData(pixels,0,0);return c;
 }
 function loadBitmap(item){
  if(cache.has(item.thumb)){const value=cache.get(item.thumb);cache.delete(item.thumb);cache.set(item.thumb,value);return value;}
  const promise=new Promise(resolve=>{
   const image=new Image();image.decoding='async';
   image.onload=()=>{try{const result=makeBitmap(image);if(!result)rejected.add(item.thumb);resolve(result);}catch{rejected.add(item.thumb);resolve(null);}};
   image.onerror=()=>{rejected.add(item.thumb);resolve(null);};image.src=item.thumb;
  });
  cache.set(item.thumb,promise);while(cache.size>72)cache.delete(cache.keys().next().value);
  return promise;
 }
 async function load(sprite,attempt=0){
  const item=nextItem();if(!item)return;
  const generation=++sprite.generation,result=await loadBitmap(item);
  if(disposed||generation!==sprite.generation)return;
  if(!result){if(attempt<12)load(sprite,attempt+1);return;}
  sprite.bitmap=result;if(active())draw(performance.now(),false);
 }
 function build(){
  sprites.forEach(sprite=>sprite.generation++);
  const n=count();sprites=Array.from({length:n},(_,i)=>{
   const depth=rand(.4,1);
   const sprite={depth,size:rand(110,210)*(.65+depth*.45),x:((i%5)+rand(.12,.88))/5,y:(Math.floor(i/5)+rand(.1,.9))/Math.ceil(n/5),rot:rand(-.3,.3),spin:rand(-.012,.012),rise:rand(3,7)*depth,sway:rand(0,Math.PI*2),alpha:rand(.055,.095),bitmap:null,generation:0};
   load(sprite);return sprite;
  });
 }
 function draw(now,advance=true){
  const dt=advance&&last?Math.min(.07,(now-last)/1000):0;if(advance)last=now;
  if(!media.matches){mouseX+=(targetX-mouseX)*.08;mouseY+=(targetY-mouseY)*.08;}
  ctx.clearRect(0,0,W,H);
  for(const sprite of sprites){
   if(!media.matches&&advance){
    sprite.y-=sprite.rise*dt/H;sprite.rot+=sprite.spin*dt;sprite.sway+=dt*.25;
    if(sprite.y<-.22){sprite.y=1.16;sprite.x=rand(.02,.98);sprite.bitmap=null;load(sprite);}
   }
   if(!sprite.bitmap)continue;
   const span=H*1.35,scroll=media.matches?0:scrollOffset*sprite.depth*.1;
   const y=((sprite.y*span-scroll)%span+span)%span-H*.15;
   const x=sprite.x*W+(media.matches?0:Math.sin(sprite.sway)*9*sprite.depth+mouseX*15*sprite.depth);
   ctx.save();ctx.translate(Math.round(x/2)*2,Math.round((y+(media.matches?0:mouseY*10*sprite.depth))/2)*2);ctx.rotate(sprite.rot);
   ctx.globalAlpha=sprite.alpha;ctx.drawImage(sprite.bitmap,-sprite.size/2,-sprite.size/2,sprite.size,sprite.size);ctx.restore();
  }
 }
 function stop(){clearTimeout(timer);cancelAnimationFrame(raf);timer=raf=0;last=0;}
 function schedule(){
  if(timer||raf||!active()||media.matches)return;
  timer=setTimeout(()=>{timer=0;if(!active()||media.matches)return;raf=requestAnimationFrame(now=>{raf=0;if(!active())return;draw(now);schedule();});},33);
 }
 function sync(){stop();if(active()){draw(performance.now(),false);schedule();}}
 function resize(){
  W=innerWidth;H=innerHeight;
  // Two CSS pixels per backing pixel keeps the bitmap crisp and inexpensive.
  canvas.width=Math.ceil(W/2);canvas.height=Math.ceil(H/2);ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.imageSmoothingEnabled=false;
  if(sprites.length!==count())build();sync();
 }
 addEventListener('pointermove',event=>{if(media.matches||!active())return;targetX=event.clientX/Math.max(W,1)-.5;targetY=event.clientY/Math.max(H,1)-.5;},{passive:true});
 addEventListener('scroll',()=>{scrollOffset=scrollY;},{passive:true});
 addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,160);});
 document.addEventListener('visibilitychange',sync);media.addEventListener('change',sync);
 addEventListener('btr:cover-performance-state',sync);
 const coverObserver=new MutationObserver(sync);coverObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
 addEventListener('pagehide',()=>{stop();clearTimeout(resizeTimer);});
 addEventListener('pageshow',sync);
 resize();
})();
