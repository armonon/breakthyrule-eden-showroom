'use strict';
// The living page: Break Thy Rule graphics printed faintly into the paper behind the home page.
// They drift upward like ash, lean with the pointer and the scroll (nearer ones move more), and
// every few seconds one of them "inks in" to full colour before fading back into the page.
// One fixed canvas, about thirty sprites, paused when the tab is hidden; still for reduced motion.
(()=>{
 const graphics=window.breakthyruleAssets?.graphics||[];
 if(!graphics.length)return;
 const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const canvas=document.createElement('canvas');canvas.id='codex-backdrop';canvas.setAttribute('aria-hidden','true');
 document.body.prepend(canvas);
 const ctx=canvas.getContext('2d');
 const rand=(a,b)=>a+Math.random()*(b-a);
 const INK='#6b3a22';             // the brown-red the ghosts are tinted toward
 let W=0,H=0,dpr=1,sprites=[],mouseX=0,mouseY=0,targetX=0,targetY=0;

 const count=()=>Math.round(Math.min(34,Math.max(14,innerWidth*innerHeight/52000)));
 function resize(){
  dpr=Math.min(1.5,devicePixelRatio||1);W=innerWidth;H=innerHeight;
  canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if(sprites.length!==count())build();
  if(reduceMotion)draw(performance.now());
 }

 // Each sprite keeps two pictures: a ghost tinted toward ink, and the original colours for the bloom.
 function tint(image,size){
  const c=document.createElement('canvas'),s=Math.ceil(size*dpr);c.width=c.height=s;
  const x=c.getContext('2d'),k=Math.min(s/image.width,s/image.height),w=image.width*k,h=image.height*k;
  x.drawImage(image,(s-w)/2,(s-h)/2,w,h);
  x.globalCompositeOperation='source-atop';x.globalAlpha=.72;x.fillStyle=INK;x.fillRect(0,0,s,s);
  return c;
 }
 // Only cut-out graphics make good ghosts: ones whose corners are transparent (no solid backing box).
 const cutout=new Map();
 function isCutout(image){
  const c=document.createElement('canvas');c.width=c.height=24;const x=c.getContext('2d',{willReadFrequently:true});
  x.drawImage(image,0,0,24,24);const d=x.getImageData(0,0,24,24).data,a=(px,py)=>d[(py*24+px)*4+3];
  return [a(0,0),a(23,0),a(0,23),a(23,23),a(12,0),a(0,12),a(23,12),a(12,23)].filter(v=>v<24).length>=6;
 }
 let queue=[];
 const nextItem=()=>{while(queue.length){const g=queue.pop();if(cutout.get(g)!==false)return g;}queue=graphics.filter(g=>cutout.get(g)!==false).sort(()=>Math.random()-.5);return queue.pop();};
 function load(s,item,tries=0){
  s.item=item;const img=new Image();img.decoding='async';
  img.onload=()=>{
   let ok=cutout.get(item);if(ok===undefined){ok=isCutout(img);cutout.set(item,ok);}
   if(!ok&&tries<12){load(s,nextItem(),tries+1);return;}
   s.image=img;s.ghost=tint(img,s.size);if(reduceMotion)draw(performance.now());
  };
  img.src=item.thumb;
 }
 function build(){
  queue=[];const pool=Array.from({length:count()},nextItem);
  sprites=pool.map(item=>{
   const depth=rand(.35,1);
   const s={item,depth,size:rand(90,210)*(.55+depth*.6),x:rand(0,1),y:rand(0,1),
    rot:rand(-.5,.5),spin:rand(-.02,.02),rise:rand(4,11)*depth,sway:rand(0,Math.PI*2),
    alpha:rand(.07,.13)*(.6+depth*.5),bloom:0,bloomAt:-1,ghost:null,image:null};
   load(s,item);return s;
  });
 }

 let last=performance.now(),nextBloom=last+1800;
 function draw(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  mouseX+=(targetX-mouseX)*.04;mouseY+=(targetY-mouseY)*.04;
  ctx.clearRect(0,0,W,H);
  const scroll=scrollY;
  if(!reduceMotion&&now>nextBloom){
   const ready=sprites.filter(s=>s.image&&s.bloomAt<0);
   if(ready.length){const s=ready[Math.floor(Math.random()*ready.length)];s.bloomAt=now;}
   nextBloom=now+rand(2600,4200);
  }
  for(const s of sprites){
   if(!reduceMotion){
    s.y-=s.rise*dt/H;s.rot+=s.spin*dt;s.sway+=dt*.35;
    if(s.y<-.25){s.y=1.2;s.x=rand(0,1);s.ghost=null;s.bloomAt=-1;load(s,nextItem());}
   }
   if(!s.ghost)continue;
   // Bloom: 1.4s in, 1.2s held, 3s out.
   if(s.bloomAt>=0){const t=(now-s.bloomAt)/1000;
    s.bloom=t<1.4?t/1.4:t<2.6?1:t<5.6?1-(t-2.6)/3:0;if(t>=5.6){s.bloom=0;s.bloomAt=-1;}}
   const span=H*1.45;
   let y=((s.y*span-scroll*s.depth*.18)%span+span)%span-H*.2;
   const x=s.x*W+Math.sin(s.sway)*14*s.depth+mouseX*26*s.depth;
   y+=mouseY*18*s.depth;
   const size=s.size*(1+s.bloom*.12);
   ctx.save();ctx.translate(x,y);ctx.rotate(s.rot+s.bloom*.08);
   ctx.globalAlpha=s.alpha*(1-s.bloom*.6);
   ctx.drawImage(s.ghost,-size/2,-size/2,size,size);
   if(s.bloom>0){
    const k=Math.min(size/s.image.width,size/s.image.height),w=s.image.width*k,h=s.image.height*k;
    ctx.globalAlpha=s.bloom*.62;ctx.drawImage(s.image,-w/2,-h/2,w,h);
   }
   ctx.restore();
  }
 }
 function frame(now){if(!document.hidden)draw(now);requestAnimationFrame(frame);}

 addEventListener('pointermove',e=>{targetX=e.clientX/innerWidth-.5;targetY=e.clientY/innerHeight-.5;},{passive:true});
 let t;addEventListener('resize',()=>{clearTimeout(t);t=setTimeout(resize,200);});
 resize();
 if(reduceMotion)addEventListener('scroll',()=>draw(performance.now()),{passive:true});
 else requestAnimationFrame(frame);
})();
