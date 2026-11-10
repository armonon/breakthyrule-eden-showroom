'use strict';
// The cover's BREAK THY RULE: the rule is always being broken.
//  · Looking: the letters are cut out of the paper; Eden moves slowly behind them, shifting with the pointer.
//  · The rule changes: every few seconds a red marker strikes THY and scrawls another word over it, then it's rubbed out.
//  · Pointing: a word lifts, a stamp thumps a label under it, and the view in its letters becomes that place.
//    BREAK → Shop · RULE → Archive · the middle word → wherever the graffiti says (SILENCE, CHAINS, FLESH, WALLS).
//  · Clicking: the title cracks into shards that fly apart while that place fills the screen — then you arrive.
//    ENTER shatters all three words into Eden. Coming back (Back button), the pieces fly home.
// Video loops: assets/eden-loops (tools/site/record-eden-loops.mjs). Used by breakthyrule-cover.js.
window.createCoverTitle=function({actions,reduceMotion=false,photos=[]}){
 const LOOPS='/assets/eden-loops/';
 const PLACES={
  garden:{video:'garden'},
  shop:{label:'SHOP',video:'shop',go:actions.shop},
  archive:{label:'ARCHIVE',video:'library',go:actions.archive},
  broadcast:{label:'BROADCAST ROOM',video:'broadcast',go:()=>{location.href='/broadcast';}},
  lab:{label:'GARMENT LAB',video:'lab',go:()=>{location.href='/lab';}},
  gallery:{label:'GALLERY',photos:true,go:actions.gallery},
  eden:{label:'EDEN',video:'eden',go:actions.eden}
 };
 const GRAFFITI=[['SILENCE','broadcast'],['CHAINS','lab'],['FLESH','gallery'],['WALLS','eden']];
 const touch=matchMedia('(hover: none)').matches;
 const el=(tag,cls,props={})=>Object.assign(document.createElement(tag),{className:cls},props);

 // ---------- sources (video loops, or a slow slideshow of worn photos) ----------
 // Videos live in a hidden holder on the page (Safari only decodes frames for videos in the document).
 const holder=el('div','ct-holder');holder.setAttribute('aria-hidden','true');
 const sources={};
 function source(key){
  if(sources[key])return sources[key];
  const p=PLACES[key];let s;
  if(p.photos&&photos.length){
   const imgs=photos.slice(0,8).map(src=>{const i=new Image();i.decoding='async';i.src=src;return i;});
   s={ready:()=>imgs.some(i=>i.complete&&i.naturalWidth),frame(){const t=performance.now()/2600,k=Math.floor(t)%imgs.length,i=imgs[k];return i.complete&&i.naturalWidth?i:imgs.find(x=>x.complete&&x.naturalWidth);},w:i=>i.naturalWidth,h:i=>i.naturalHeight,play(){},pause(){}};
  }else{
   const v=el('video','',{muted:true,loop:true,playsInline:true,preload:'auto',poster:LOOPS+(p.video||'garden')+'.jpg'});
   v.setAttribute('muted','');v.setAttribute('playsinline','');v.src=LOOPS+(p.video||'garden')+'.mp4';holder.append(v);
   const poster=new Image();poster.src=LOOPS+(p.video||'garden')+'.jpg';
   s={video:v,ready:()=>v.readyState>=2||poster.complete,frame:()=>v.readyState>=2?v:poster,w:x=>x.videoWidth||x.naturalWidth,h:x=>x.videoHeight||x.naturalHeight,play(){v.play().catch(()=>{});},pause(){v.pause();}};
  }
  return sources[key]=s;
 }

 // ---------- the words ----------
 const root=el('h1','ct');root.setAttribute('aria-label','Break Thy Rule');
 const WORDS=[{text:'BREAK',door:'shop'},{text:'THY',door:'broadcast',middle:true},{text:'RULE',door:'archive'}];
 for(const w of WORDS){
  w.link=el('a','ct-word'+(w.middle?' ct-middle':''),{href:'#'});
  w.canvas=el('canvas','ct-canvas');w.canvas.setAttribute('aria-hidden','true');
  w.stamp=el('span','ct-stamp');w.stamp.setAttribute('aria-hidden','true');
  w.link.append(w.canvas,w.stamp);
  if(w.middle){w.graffiti=el('span','ct-graffiti');w.graffiti.setAttribute('aria-hidden','true');w.graffiti.innerHTML='<svg viewBox="0 0 100 20" preserveAspectRatio="none"><path class="ct-strike" d="M2 12 C 30 8, 60 14, 98 9" pathLength="1"/></svg><b></b>';w.link.append(w.graffiti);}
  w.src='garden';w.prev=null;w.mix=1;
  root.append(w.link);
 }
 root.append(holder);
 root.insertAdjacentHTML('beforeend','<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="ct-rough"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="3.5"/></filter></svg>');
 const middle=WORDS[1];
 function label(w){const p=PLACES[w.door];w.stamp.textContent=p.label;w.link.setAttribute('aria-label',`${w.text} — go to the ${p.label.toLowerCase()}`);}
 WORDS.forEach(label);

 // ---------- drawing ----------
 let fontReady=false,size={w:0},px=0,py=0,tx=0,ty=0;
 const FONT=fs=>`700 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`;
 function layout(){
  const W=root.clientWidth;if(!W)return;
  const probe=document.createElement('canvas').getContext('2d');probe.font=FONT(100);
  const wide=Math.max(probe.measureText('BREAK').width,probe.measureText('RULE').width);
  const big=Math.min(196,W*.98/(wide/100*(1-.035))),dpr=Math.min(devicePixelRatio||1,2);
  for(const w of WORDS){
   const fs=w.middle?big*.5:big,h=Math.round(fs*(w.middle?.92:.76));
   w.fs=fs;w.h=h;w.canvas.width=Math.round(W*dpr);w.canvas.height=Math.round(h*dpr);
   w.canvas.style.width=W+'px';w.canvas.style.height=h+'px';w.dpr=dpr;w.W=W;
  }
  size.w=W;draw(true);
 }
 function cover(ctx,s,img,W,H,alpha){
  if(!img)return;const iw=s.w(img),ih=s.h(img);if(!iw||!ih)return;
  // Cover-fit the whole title box (so the three words read as one window), then the pointer pans it a little.
  const k=Math.max(W/iw,H/ih)*1.12,dw=iw*k,dh=ih*k;
  ctx.globalAlpha=alpha;ctx.drawImage(img,(W-dw)/2-px*(dw-W)*.5,(H-dh)/2-py*(dh-H)*.5,dw,dh);ctx.globalAlpha=1;
 }
 function draw(force){
  if(!fontReady||!size.w)return;
  const total=WORDS.reduce((a,w)=>a+w.h,0);let y=0;
  for(const w of WORDS){
   const c=w.canvas.getContext('2d'),W=w.W,H=w.h;
   c.setTransform(w.dpr,0,0,w.dpr,0,0);c.globalCompositeOperation='source-over';c.clearRect(0,0,W,H);
   // The window: draw this slice of a title-sized picture, so the view runs continuously through all three words.
   c.save();c.translate(0,-y);
   if(w.prev&&w.mix<1){const s=source(w.prev);cover(c,s,s.frame(),W,total,1);}
   const s=source(w.src);cover(c,s,s.frame(),W,total,w.prev&&w.mix<1?w.mix:1);
   c.restore();
   // Cut the letters out of the paper.
   c.globalCompositeOperation='destination-in';c.font=FONT(w.fs);c.textAlign='center';c.textBaseline='alphabetic';
   if('letterSpacing' in c)c.letterSpacing=w.middle?(w.fs*.32)+'px':(-w.fs*.035)+'px';
   const base=H*(w.middle?.84:.955),x=W/2+(w.middle?w.fs*.16:0);
   c.fillStyle='#000';c.fillText(w.text,x,base);
   c.globalCompositeOperation='source-over';c.lineWidth=Math.max(1.5,w.fs/90);c.strokeStyle=w.middle?'#c8102e':'#111';c.strokeText(w.text,x,base);
   w.base=base;w.x=x;y+=H;
  }
 }
 // ---------- life ----------
 let running=false,raf=0,last=0;
 function loop(t){
  raf=0;if(!running)return;
  if(t-last>=33){
   last=t;
   tx+=((reduceMotion?0:targetX)-tx)*.06;ty+=((reduceMotion?0:targetY)-ty)*.06;
   const drift=reduceMotion?0:Math.sin(t/9000)*.25;px=tx+drift;py=ty+Math.cos(t/11000)*.15*(reduceMotion?0:1);
   for(const w of WORDS)if(w.prev&&w.mix<1){w.mix=Math.min(1,w.mix+.07);if(w.mix>=1){source(w.prev).pause?.();w.prev=null;}}
   draw();
  }
  raf=requestAnimationFrame(loop);
 }
 let targetX=0,targetY=0;
 function onMove(e){const r=root.getBoundingClientRect();targetX=Math.max(-1,Math.min(1,(e.clientX-(r.left+r.width/2))/(innerWidth/2)));targetY=Math.max(-1,Math.min(1,(e.clientY-(r.top+r.height/2))/(innerHeight/2)));}
 function show(w,key){if(w.src===key)return;w.prev=w.src;w.mix=0;w.src=key;source(key).play();}

 // Hover/focus: lift, stamp, and the window shows that place.
 for(const w of WORDS){
  const enter=()=>{w.link.classList.add('on');show(w,PLACES[w.door].video||PLACES[w.door].photos?w.door:'garden');};
  const leave=()=>{w.link.classList.remove('on');show(w,'garden');};
  if(!touch){w.link.addEventListener('pointerenter',enter);w.link.addEventListener('pointerleave',leave);}
  w.link.addEventListener('focus',enter);w.link.addEventListener('blur',leave);
  w.link.addEventListener('click',e=>{e.preventDefault();shatter(w,w.door);});
 }

 // ---------- the graffiti on THY ----------
 let gi=Math.floor(Math.random()*GRAFFITI.length),gTimer=0;
 function setMiddle(key){middle.door=key;label(middle);if(middle.link.classList.contains('on'))show(middle,key);}
 function graffitiCycle(){
  const [word,key]=GRAFFITI[gi++%GRAFFITI.length];
  const g=middle.graffiti;g.querySelector('b').textContent=word;
  g.classList.remove('rub');void g.offsetWidth;g.classList.add('mark');setMiddle(key);
  gTimer=setTimeout(()=>{g.classList.add('rub');gTimer=setTimeout(()=>{g.classList.remove('mark','rub');gTimer=setTimeout(graffitiCycle,2600);},900);},3800);
 }

 // ---------- the break ----------
 let overlay=null,anims=[];
 function shatter(origin,key){
  if(overlay)return;
  const p=PLACES[key];if(!p)return;
  const r0=(origin?.link||root).getBoundingClientRect();
  overlay=el('div','ct-break');
  // What was behind the letters fills the screen, growing out of the word.
  const back=el('div','ct-break-back'),s=source(key);s.play();
  const frame=s.frame();
  if(s.video){const v=s.video;v.className='ct-break-media';back.append(v);}
  else if(frame){const i=el('img','ct-break-media');i.src=frame.src;back.append(i);}
  overlay.append(back);
  const clipFrom=`inset(${r0.top}px ${innerWidth-r0.right}px ${innerHeight-r0.bottom}px ${r0.left}px)`;
  document.body.append(overlay);
  anims.push(back.animate([{clipPath:clipFrom,opacity:reduceMotion?0:1},{clipPath:'inset(0px 0px 0px 0px)',opacity:1}],{duration:reduceMotion?300:950,easing:'cubic-bezier(.6,0,.2,1)',fill:'forwards'}));
  if(!reduceMotion){
   // Every word cracks into shards; the one you hit flies hardest.
   const cx=r0.left+r0.width/2,cy=r0.top+r0.height/2;
   for(const w of WORDS){
    const r=w.canvas.getBoundingClientRect(),snap=document.createElement('canvas');snap.width=Math.round(r.width);snap.height=Math.round(r.height);snap.getContext('2d').drawImage(w.canvas,0,0,snap.width,snap.height);
    const url=snap.toDataURL('image/png'),cols=9,rows=3,pts=[];
    for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){const edge=i===0||j===0||i===cols||j===rows;pts.push([i/cols*100+(edge?0:(Math.random()-.5)*7),j/rows*100+(edge?0:(Math.random()-.5)*20)]);}
    const P=(i,j)=>pts[j*(cols+1)+i];
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++)for(const tri of [[P(i,j),P(i+1,j),P(i,j+1)],[P(i+1,j),P(i+1,j+1),P(i,j+1)]]){
     const sh=el('div','ct-shard');
     sh.style.cssText=`left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;background-image:url(${url});clip-path:polygon(${tri.map(([a,b])=>a.toFixed(1)+'% '+b.toFixed(1)+'%').join(',')})`;
     overlay.append(sh);
     const mx=r.left+r.width*(tri[0][0]+tri[1][0]+tri[2][0])/300,my=r.top+r.height*(tri[0][1]+tri[1][1]+tri[2][1])/300;
     const dx=mx-cx,dy=my-cy,d=Math.hypot(dx,dy)||1,force=(w===origin?1.6:1)*(260+Math.random()*520);
     anims.push(sh.animate([{transform:'translate(0,0) rotate(0)',opacity:1},{transform:`translate(${dx/d*force}px,${dy/d*force+160}px) rotate(${(Math.random()-.5)*160}deg) scale(${.6+Math.random()*.5})`,opacity:0}],{duration:900+Math.random()*300,easing:'cubic-bezier(.2,.6,.4,1)',fill:'forwards'}));
    }
   }
   root.classList.add('broken');
  }
  setTimeout(()=>{
   p.go?.();
   // In-page destinations (Shop on the home page, Enter in the showroom): let the scene settle, then tidy up.
   setTimeout(()=>{if(document.visibilityState==='visible'&&overlay&&!document.hidden)clearBreak(true);},1400);
  },reduceMotion?320:880);
 }
 function clearBreak(fade){
  if(!overlay)return;const o=overlay;overlay=null;
  const done=()=>{for(const s of Object.values(sources))if(s.video&&s.video.parentNode!==holder){s.video.className='';holder.append(s.video);}o.remove();anims=[];root.classList.remove('broken');const g=sources.garden;g&&WORDS.forEach(w=>{w.prev=null;w.src='garden';w.mix=1;w.link.classList.remove('on');});};
  if(fade){o.animate([{opacity:1},{opacity:0}],{duration:500,fill:'forwards'}).finished.then(done);}else done();
 }
 // Back to this page: the pieces fly home.
 addEventListener('pageshow',e=>{
  if(!overlay||!e.persisted)return;
  for(const a of anims){a.playbackRate=1.6;a.reverse();}
  Promise.all(anims.map(a=>a.finished)).then(()=>clearBreak(false));
 });

 return {
  el:root,
  start(){
   if(running)return;running=true;
   (document.fonts?.load(FONT(100)).catch(()=>{})||Promise.resolve()).then(()=>{fontReady=true;layout();});
   if(!layout._ro){layout._ro=new ResizeObserver(()=>layout());layout._ro.observe(root);}
   source('garden').play();addEventListener('pointermove',onMove);
   if(!reduceMotion){clearTimeout(gTimer);gTimer=setTimeout(graffitiCycle,2200);}
   raf=requestAnimationFrame(loop);
  },
  stop(){running=false;cancelAnimationFrame(raf);clearTimeout(gTimer);removeEventListener('pointermove',onMove);Object.values(sources).forEach(s=>s.pause());},
  enter:()=>shatter(null,'eden')
 };
};
