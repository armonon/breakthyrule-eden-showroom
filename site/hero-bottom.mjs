
const clamp=(n,lo=0,hi=1)=>Math.min(hi,Math.max(lo,n));
const asset=name=>new URL(name,'https://apple-cover-assets--breakthyrule-eden-showroom.netlify.app/').href;
const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];

async function mount(){
 const hero=document.getElementById('wearer-hero');if(!hero||hero.dataset.videoHero)return;
 let createVideoDotRenderer=null;
 try{({createVideoDotRenderer}=await import('/site/video-dot-renderer.mjs?v=site-audit-1'));}catch{/* Keep the bitmap poster if the GPU renderer cannot load. */}
 const scene=hero.querySelector('.wearer-scenes'),title=hero.querySelector('#wearer-title');if(!scene||!title)return;
 hero.dataset.mastheadEdge='true';hero.dataset.videoHero='true';hero.dataset.particleHero='true';hero.dataset.bitmapHero='film';
 delete hero.dataset.current;delete hero.dataset.photoInterval;
 hero.querySelectorAll('.wearer-actions,.wearer-topline,.wearer-bottomline,.wearer-gallery-link').forEach(el=>el.remove());
 const shortcut=document.createElement('span');shortcut.id='btr-hero-shortcut';shortcut.className='btr-hero-sr';shortcut.textContent='Moving Break Thy Rule artwork. Press Space to pause or resume the film.';
 hero.append(shortcut);hero.tabIndex=0;hero.setAttribute('aria-describedby',shortcut.id);hero.setAttribute('aria-keyshortcuts','Space');

 const poster=scene.querySelector('img.btr-particle-fallback')||new Image();poster.className='btr-particle-fallback';poster.crossOrigin='anonymous';poster.alt='Break Thy Rule film, rendered as fine color bitmap dots.';poster.decoding='async';
 const video=document.createElement('video');video.className='btr-video-source';video.crossOrigin='anonymous';video.muted=true;video.defaultMuted=true;video.loop=true;video.playsInline=true;video.preload='metadata';video.setAttribute('muted','');video.setAttribute('playsinline','');video.setAttribute('aria-hidden','true');video.disablePictureInPicture=true;
 const canvas=document.createElement('canvas');canvas.className='btr-particle-photo';canvas.setAttribute('aria-hidden','true');
 const still=document.createElement('canvas');still.className='btr-particle-static';still.setAttribute('aria-hidden','true');still.hidden=true;
 scene.replaceChildren(poster,video,canvas,still);
 let renderer=null,rendererFailed=!createVideoDotRenderer;
 if(rendererFailed){canvas.hidden=true;still.hidden=false;}
 function ensureRenderer(){
  if(renderer||rendererFailed)return;
  try{renderer=createVideoDotRenderer(canvas);renderer.resize(width,height,Math.max(width<700?2:2.8,Math.sqrt(width*height/95000)));}
  catch{rendererFailed=true;canvas.hidden=true;still.hidden=false;}
 }
 const sample=document.createElement('canvas'),sampleContext=sample.getContext('2d',{willReadFrequently:true});
 const fallbackContext=still.getContext('2d');
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 let wanted=!media.matches,visible=false,pageHidden=false,playPending=false,hasVideoFrame=false,failed=false,videoAssigned=false;
 let width=0,height=0,frameId=0,uiFrame=0,resizeTimer=0,lastSample=-1000,lastVideoTime=-1;
 let scrollDissolve=0,maskLevel=-1,source=null;
 let pointer={x:-10000,y:-10000,hover:0},ripple={x:-10000,y:-10000,birth:-10000};
 const videoCallbacks=typeof video.requestVideoFrameCallback==='function';
 const active=()=>visible&&!document.hidden&&!pageHidden&&!document.body.classList.contains('btr-cover-open');
 const shouldPlay=()=>active()&&wanted&&!failed&&scrollDissolve<.985;

 const typeMeasure=document.createElement('canvas').getContext('2d');
 function fitMasthead(){
  if(!typeMeasure)return;
  const css=getComputedStyle(title);typeMeasure.font=`${css.fontStyle} ${css.fontWeight} 100px ${css.fontFamily}`;
  const metrics=typeMeasure.measureText(title.textContent),inkWidth=metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight;
  if(!(inkWidth>0))return;
  const size=hero.clientWidth*.98/inkWidth*100;
  title.style.setProperty('--btr-masthead-size',size.toFixed(2)+'px');title.style.setProperty('--btr-masthead-shift',(metrics.actualBoundingBoxLeft*size/100).toFixed(2)+'px');
  // Position visible ink rather than the font's generous swash line box.
  const ratio=size/100,inkHeight=(metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent)*ratio;
  const ascent=(metrics.fontBoundingBoxAscent||metrics.actualBoundingBoxAscent)*ratio;
  const descent=(metrics.fontBoundingBoxDescent||metrics.actualBoundingBoxDescent)*ratio;
  const inkTop=(size-ascent-descent)/2+ascent-metrics.actualBoundingBoxAscent*ratio;
  hero.style.setProperty('--btr-ink-height',inkHeight.toFixed(2)+'px');
  hero.style.setProperty('--btr-ink-offset',inkTop.toFixed(2)+'px');

 }
 const masks=new Map(),grainOrder=Array.from({length:64},(_,i)=>i);let seed=7231;
 for(let i=63;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[grainOrder[i],grainOrder[j]]=[grainOrder[j],grainOrder[i]];}
 function letteringMask(level){
  if(!level)return 'none';if(masks.has(level))return masks.get(level);
  let cells='';for(let i=0;i<64;i++)if(grainOrder[i]>=level*2)cells+=`<rect x="${(i%8)*2}" y="${Math.floor(i/8)*2}" width="2" height="2"/>`;
  const mask=`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="white">${cells}</svg>`)}")`;masks.set(level,mask);return mask;
 }
 function updateScroll(){
  if(document.body.classList.contains('btr-cover-open'))return;
  const rect=hero.getBoundingClientRect(),header=parseFloat(hero.style.getPropertyValue('--btr-hero-header'))||0;
  scrollDissolve=clamp((header-rect.top)/Math.max(1,scene.clientHeight*.82));hero.dataset.scrollDissolve=scrollDissolve.toFixed(3);
  const inkHeight=parseFloat(hero.style.getPropertyValue('--btr-ink-height'))||title.clientHeight;
  const inkTop=rect.top+scene.clientHeight-inkHeight*.02;
  const inkDissolve=clamp((header-inkTop)/Math.max(1,inkHeight*1.5));
  hero.style.setProperty('--btr-scroll-ink',String(1-inkDissolve*.45));hero.style.setProperty('--btr-scroll-photo',String(1-scrollDissolve));
  canvas.style.opacity=media.matches?String(1-scrollDissolve):'1';
  const level=media.matches?0:Math.round(inkDissolve*32);
  if(level!==maskLevel){maskLevel=level;const mask=letteringMask(level);title.style.maskImage=mask;title.style.webkitMaskImage=mask;}
  title.style.opacity=media.matches?String(1-inkDissolve):'';
 }
 function fallbackFrame(frame){
  if(!sampleContext||!fallbackContext)return false;
  const sw=frame.videoWidth||frame.naturalWidth,sh=frame.videoHeight||frame.naturalHeight;if(!sw||!sh)return false;
  const w=sample.width,h=sample.height,scale=Math.max(w/sw,h/sh);
  sampleContext.drawImage(frame,(w-sw*scale)/2,(h-sh*scale)/2,sw*scale,sh*scale);
  const image=sampleContext.getImageData(0,0,w,h),pixels=image.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const p=(y*w+x)*4,offset=(BAYER[(y&3)*4+(x&3)]/15-.5)*22;
   for(let c=0;c<3;c++)pixels[p+c]=clamp(Math.round(((pixels[p+c]-128)*1.08+128+offset)/(255/7))*(255/7),0,255);
  }
  fallbackContext.putImageData(image,0,0);return true;
 }
 function paint(upload=false,now=performance.now()){
  if(!source||!width||!height||!active())return;
  const needsUpload=!renderer;ensureRenderer();upload=upload||needsUpload;
  try{
   if(renderer){
    if(upload&&!renderer.setFrame(source))return;
    renderer.draw({scrollDissolve:media.matches?0:scrollDissolve,mouseX:pointer.x,mouseY:pointer.y,hover:media.matches?0:pointer.hover,rippleX:ripple.x,rippleY:ripple.y,rippleAge:media.matches?10:(now-ripple.birth)/1000});
   }else if(upload&&!fallbackFrame(source)){hero.classList.remove('is-dot-ready');return;}
   else if(!upload&&!hero.classList.contains('is-dot-ready'))return;
   hero.classList.add('is-dot-ready');hero.dataset.videoRenderer=renderer?'webgl':'bitmap-fallback';
  }catch{
   if(renderer){renderer.destroy();renderer=null;rendererFailed=true;canvas.hidden=true;still.hidden=false;paint(true,now);}
   else hero.classList.remove('is-dot-ready');
  }
 }
 function cancelFrames(){
  if(frameId){if(videoCallbacks)video.cancelVideoFrameCallback(frameId);else cancelAnimationFrame(frameId);frameId=0;}
 }
 function scheduleFrame(){
  if(frameId||!shouldPlay()||video.paused)return;
  frameId=videoCallbacks?video.requestVideoFrameCallback(onFrame):requestAnimationFrame(onFrame);
 }
 function onFrame(now){
  frameId=0;if(!shouldPlay()||video.paused)return;
  if(video.readyState>=2&&video.currentTime!==lastVideoTime&&(renderer||now-lastSample>=80)){
   lastVideoTime=video.currentTime;lastSample=now;hasVideoFrame=true;source=video;paint(true,now);
  }
  scheduleFrame();
 }
 function syncPlayback(){
  hero.dataset.playing=String(wanted);
  if(!shouldPlay()){video.pause();cancelFrames();return;}
  if(!videoAssigned){videoAssigned=true;video.src=asset('hero-film.mp4');}
  if(!video.paused){scheduleFrame();return;}
  if(playPending)return;playPending=true;let aborted=false;
  video.play().then(()=>{
   hero.dataset.autoplayBlocked='false';
   if(shouldPlay())scheduleFrame();else video.pause();
  }).catch(error=>{aborted=error.name==='AbortError';if(!aborted)hero.dataset.autoplayBlocked='true';}).finally(()=>{playPending=false;if(aborted&&shouldPlay())syncPlayback();});
 }
 function requestDraw(){
  if(uiFrame||!active())return;
  uiFrame=requestAnimationFrame(now=>{uiFrame=0;updateScroll();syncPlayback();paint(false,now);});
 }
 function sync(){
  updateScroll();syncPlayback();
  if(!active()){cancelAnimationFrame(uiFrame);uiFrame=0;pointer.hover=0;}
  else paint(false);
 }
 function resize(){
  hero.style.setProperty('--btr-hero-header',Math.round(document.querySelector('.site-top')?.getBoundingClientRect().height||72)+'px');fitMasthead();updateScroll();
  const w=Math.round(scene.clientWidth),h=Math.round(scene.clientHeight);if(!w||!h)return;
  if(w===width&&h===height){requestDraw();return;}width=w;height=h;
  const step=Math.max(w<700?2:2.8,Math.sqrt(w*h/95000));
  if(renderer)renderer.resize(w,h,step);
  sample.width=still.width=Math.ceil(w/Math.max(3,step));sample.height=still.height=Math.ceil(h/Math.max(3,step));
  paint(true);syncPlayback();
 }
 poster.addEventListener('load',()=>{if(!hasVideoFrame){source=poster;paint(true);}});
 video.addEventListener('loadeddata',()=>{if(wanted){hasVideoFrame=true;source=video;paint(true);}syncPlayback();});
 video.addEventListener('playing',()=>{hero.dataset.videoState='playing';scheduleFrame();});
 video.addEventListener('pause',()=>{hero.dataset.videoState='paused';cancelFrames();});
 video.addEventListener('error',()=>{failed=true;hasVideoFrame=false;source=poster;hero.dataset.videoState='poster';cancelFrames();paint(true);});
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();renderer=null;rendererFailed=true;canvas.hidden=true;still.hidden=false;paint(true);});
 hero.addEventListener('keydown',event=>{if(event.target!==hero||event.code!=='Space')return;event.preventDefault();if(event.repeat)return;wanted=!wanted;syncPlayback();});
 hero.addEventListener('pointermove',event=>{if(media.matches||event.pointerType!=='mouse')return;const r=hero.getBoundingClientRect();pointer={x:event.clientX-r.left,y:event.clientY-r.top,hover:1};requestDraw();});
 hero.addEventListener('pointerleave',()=>{pointer.hover=0;requestDraw();});
 hero.addEventListener('pointerup',event=>{if(media.matches)return;const r=hero.getBoundingClientRect();ripple={x:event.clientX-r.left,y:event.clientY-r.top,birth:performance.now()};syncPlayback();requestDraw();});
 const intersection=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();},{threshold:.02});intersection.observe(hero);
 const observer=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,100);});observer.observe(hero);const header=document.querySelector('.site-top');if(header)observer.observe(header);
 window.addEventListener('scroll',requestDraw,{passive:true});document.addEventListener('visibilitychange',sync);window.addEventListener('btr:cover-performance-state',sync);
 window.addEventListener('pagehide',()=>{pageHidden=true;sync();clearTimeout(resizeTimer);});window.addEventListener('pageshow',()=>{pageHidden=false;sync();});
 media.addEventListener('change',()=>{wanted=!media.matches;sync();});document.fonts?.ready.then(fitMasthead);document.fonts?.addEventListener('loadingdone',fitMasthead);
 resize();
 if(poster.complete&&poster.naturalWidth){source=poster;paint(true);}
 else if(!poster.src)poster.src=asset('hero-film-poster.jpg');
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
