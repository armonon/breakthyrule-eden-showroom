'use strict';
// Static product/photo slides sourced from the public Break Thy Rule site build.
window.showroomInstagramPosts=(window.showroomCollection||[]).slice(0,10).map((item,index)=>({
  name:'Vault Slide / '+item.id,
  label:'VAULT',
  instagram:true,
  page:index+1,
  file:item.images[0],
  sourceUrl:'https://breakthyrule-co.netlify.app',
  alt:item.imageAlt||item.name,
  type:'image'
}));
window.createInstagramSlideshow=function(T,mesh,{onChange,reducedMotion,isPaused}){
 const canvas=document.createElement('canvas');canvas.width=576;canvas.height=1024;
 const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);
 const outgoing=document.createElement('canvas');outgoing.width=canvas.width;outgoing.height=canvas.height;
 const outgoingCtx=outgoing.getContext('2d');
 // Small edge-extension layer keeps live-video blur inexpensive.
 const backdrop=document.createElement('canvas');backdrop.width=144;backdrop.height=256;
 const backCtx=backdrop.getContext('2d');
 const foreground=document.createElement('canvas'),edgeMask=document.createElement('canvas');
 for(const layer of [foreground,edgeMask]){layer.width=canvas.width;layer.height=canvas.height;}
 const foregroundCtx=foreground.getContext('2d'),maskCtx=edgeMask.getContext('2d');
 let maskLayout='';
 function featherMask(x,y,w,h){
  const layout=[x,y,w,h].join(',');if(layout===maskLayout)return;maskLayout=layout;
  maskCtx.clearRect(0,0,canvas.width,canvas.height);
  maskCtx.fillStyle='#fff';maskCtx.fillRect(x,y,w,h);
  const feather=Math.min(64,Math.min(w,h)*.11);
  function edge(x1,y1,x2,y2,rx,ry,rw,rh){
   const gradient=maskCtx.createLinearGradient(x1,y1,x2,y2);
   for(const [stop,alpha] of [[0,1],[.25,.844],[.5,.5],[.75,.156],[1,0]])gradient.addColorStop(stop,'rgba(255,255,255,'+alpha+')');
   maskCtx.fillStyle=gradient;maskCtx.fillRect(rx,ry,rw,rh);
  }
  maskCtx.save();maskCtx.globalCompositeOperation='destination-out';
  edge(x,y,x,y+feather,x,y,w,feather);
  edge(x,y+h,x,y+h-feather,x,y+h-feather,w,feather);
  edge(x,y,x+feather,y,x,y,feather,h);
  edge(x+w,y,x+w-feather,y,x+w-feather,y,feather,h);
  maskCtx.restore();
 }
 const fadeDuration=900;let fadeElapsed=fadeDuration,backdropMedia=null,backdropTime=-Infinity;
 function drawPost(media,width,height){
  const scale=Math.min(canvas.width/width,canvas.height/height),w=width*scale,h=height*scale;
  const x=(canvas.width-w)/2,y=(canvas.height-h)/2;
  if(backdropMedia!==media||performance.now()-backdropTime>=100){
   backdropMedia=media;backdropTime=performance.now();
   const k=backdrop.width/canvas.width,bx=x*k,by=y*k,bw=w*k,bh=h*k;
   const stripX=Math.max(1,width*.04),stripY=Math.max(1,height*.04);
   backCtx.drawImage(media,bx,by,bw,bh);
   // Extend the actual adjacent edges instead of cropping the post to fill the frame.
   if(by>0){
    backCtx.drawImage(media,0,0,width,stripY,0,0,144,by+1);
    backCtx.drawImage(media,0,height-stripY,width,stripY,0,by+bh-1,144,256-by-bh+1);
   }
   if(bx>0){
    backCtx.drawImage(media,0,0,stripX,height,0,0,bx+1,256);
    backCtx.drawImage(media,width-stripX,0,stripX,height,bx+bw-1,0,144-bx-bw+1,256);
   }
  }
  ctx.save();ctx.filter='blur(48px)';
  // Overscan prevents transparent fringes at the outside of the blur.
  ctx.drawImage(backdrop,-144,-144,canvas.width+288,canvas.height+288);ctx.restore();
  // Feather the sharp post into its blurred surroundings without softening its centre.
  featherMask(x,y,w,h);
  foregroundCtx.clearRect(0,0,canvas.width,canvas.height);
  foregroundCtx.drawImage(media,x,y,w,h);
  foregroundCtx.save();foregroundCtx.globalCompositeOperation='destination-in';
  foregroundCtx.drawImage(edgeMask,0,0);foregroundCtx.restore();
  ctx.drawImage(foreground,0,0);
 }
 texture.colorSpace=T.SRGBColorSpace;mesh.material.map=texture;
 let index=0,timer=null,disposed=false,loaded=false,video=null,failed=false,starting=false;
 let elapsed=0,stalled=0,lastPosition=-1,lastTime=performance.now();const slides=[];
 function paint(){
  ctx.fillStyle='#171819';ctx.fillRect(0,0,canvas.width,canvas.height);
  const slide=slides[index];
  if(slide){
   const media=video&&video.readyState>=2?video:slide.image;
   const width=media.videoWidth||media.naturalWidth,height=media.videoHeight||media.naturalHeight;
   drawPost(media,width,height);
   mesh.userData.poster=slide.post;
  }else{
   ctx.fillStyle='#eee';ctx.textAlign='center';ctx.font='24px sans-serif';ctx.fillText('INSTAGRAM',canvas.width/2,canvas.height/2-12);
   ctx.fillStyle='#aaa';ctx.font='18px sans-serif';ctx.fillText(loaded?'Posts unavailable':'Loading posts…',canvas.width/2,canvas.height/2+28);
  }
  if(fadeElapsed<fadeDuration){
   const t=fadeElapsed/fadeDuration,eased=t*t*(3-2*t);
   ctx.save();ctx.globalAlpha=1-eased;ctx.drawImage(outgoing,0,0);ctx.restore();
  }
  texture.needsUpdate=true;onChange();
 }
 function releaseVideo(){
  if(!video)return;
  const old=video;video=null;old.onerror=null;old.pause();old.removeAttribute('src');old.load();
 }
 function enter(){
  releaseVideo();elapsed=0;stalled=0;lastPosition=-1;failed=false;starting=false;
  const post=slides[index]?.post;
  if(post?.type==='video'&&!reducedMotion){
   video=document.createElement('video');video.muted=true;video.defaultMuted=true;video.playsInline=true;video.preload='auto';video.loop=false;
   video.onerror=()=>{failed=true;};video.src=post.videoFile;video.load();
  }
  paint();
 }
 function advance(){
  if(!reducedMotion){outgoingCtx.drawImage(canvas,0,0);fadeElapsed=0;}
  index=(index+1)%slides.length;enter();
 }
 function tick(){
  if(disposed)return;
  const now=performance.now(),dt=Math.min(1000,now-lastTime);lastTime=now;
  const paused=document.hidden||isPaused();
  const wasFading=fadeElapsed<fadeDuration;
  if(!paused)fadeElapsed=Math.min(fadeDuration,fadeElapsed+dt);
  if(paused){video?.pause();}
  else if(video){
   if(failed||video.ended){advance();}
   else{
    const active=video;
    if(active.paused&&!starting){
     starting=true;
     active.play().catch(()=>{if(video===active)failed=true;}).finally(()=>{if(video===active)starting=false;});
    }
    if(active.currentTime!==lastPosition){stalled=0;lastPosition=active.currentTime;}else stalled+=dt;
    if(stalled>15000)advance();else if(active.readyState>=2)paint();
   }
  }else{elapsed+=dt;if(elapsed>=6000&&slides.length>1)advance();else if(wasFading)paint();}
  timer=setTimeout(tick,!paused&&(video||fadeElapsed<fadeDuration)?33:250);
 }
 paint();
 const ready=Promise.all(window.showroomInstagramPosts.map(post=>new Promise(resolve=>{
  const image=new Image();image.crossOrigin='anonymous';
  image.onload=()=>resolve({image,post});image.onerror=()=>resolve(null);image.src=post.file;
 }))).then(results=>{
  if(disposed)return;loaded=true;slides.push(...results.filter(Boolean));enter();
  if(!reducedMotion&&slides.length){lastTime=performance.now();tick();}
 });
 return {ready,destroy(){disposed=true;clearTimeout(timer);releaseVideo();texture.dispose();}};
};
