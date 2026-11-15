'use strict';
// Worlds and chapters.
//
// Eden (the garden) and Beyond Eden (the district and the open match) are separate worlds: only the one you are in is
// drawn. Crossing the hidden door shows a loading screen while Beyond Eden is built and its shaders are compiled up
// front (so nothing stalls mid-fight); stepping back brings the garden back. Entering the black cube shows one too.
//
// Chapters (assets/worlds/chapters.json) are delivered separately: each can be live, preview or sealed, and can name
// a script that is only fetched when its door is reached, so the game works before every place exists.
//
// Host hooks (app.js): createWorlds({T, scene, renderer, camera, requestDraw})
(function(root){
 root.createWorlds=function({T,scene,renderer,camera,requestDraw}){
  // Scene roots that belong to Beyond Eden (managed by their own code too) and roots shared by both worlds.
  const BEYOND=new Set(['Arena','Pyramid at the end of the road','Beyond Eden / the old civilization','The Attendant','Eden combat range','Parkour grips']);
  const SHARED=new Set(['Garden of Eden','Eden sky box','Player body','Combat effects','Prewarm stand-ins','Pyramid lighting']);
  const classify=c=>c.isLight||c.isCamera||c.isSprite||(c.type==='Object3D'&&!c.children.length)||SHARED.has(c.name)?'shared':BEYOND.has(c.name)?'beyond':'eden';
  let world='eden',busy=false,hidden=new Set(),manifest=null,loadedScripts=new Map(),stats={switches:0,hiddenLast:0};
  // Hidden mesh groups must not change the renderer's light-count defines. Keep
  // a stable light proxy in the scene; its source continues to own animation and
  // local coordinates, and hidden ancestors simply give the proxy zero intensity.
  const stableLights=new Map(),lightPosition=new T.Vector3();
  function syncLights(discover=false){
   if(discover){const found=[];scene.traverse(o=>{if(o.isLight&&!o.castShadow&&o.parent!==scene&&!stableLights.has(o)&&!o.userData.stableProxy)found.push(o);});
    for(const source of found){const mirror=source.clone();mirror.name='Stable light · '+(source.parent.name||source.type);mirror.userData.stableProxy=true;const mask=source.layers.mask;source.layers.disableAll();mirror.layers.mask=mask;scene.add(mirror);stableLights.set(source,{mirror,mask});}}
   for(const [source,{mirror}] of stableLights){let shown=true,p=source;while(p&&p!==scene){shown=shown&&p.visible;p=p.parent;}shown=shown&&p===scene;
    mirror.intensity=shown?source.intensity:0;mirror.color.copy(source.color);mirror.position.copy(source.getWorldPosition(lightPosition));
    if(source.groundColor)mirror.groundColor.copy(source.groundColor);for(const key of ['distance','decay','angle','penumbra'])if(key in source)mirror[key]=source[key];}
  }

  // Hide the other world's roots (only those we hid get shown again, so code that hides its own objects is respected).
  function apply(){
   window.edenBaked?.setWorld(world);
   for(const c of hidden)if(c.parent===scene)c.visible=true;hidden.clear();
   for(const c of scene.children){const k=classify(c);if(['Garden of Eden','Beyond Eden / the old civilization','Parkour grips','Pyramid at the end of the road'].includes(c.name))window.edenBaked?.registerStatic(c);if(k==='shared'||k===world)continue;if(c.visible){c.visible=false;hidden.add(c);}}
   syncLights(true);stats.hiddenLast=hidden.size;
  }
  // Loading screen.
  const el=document.createElement('div');el.id='world-loading';el.hidden=true;el.setAttribute('role','status');el.setAttribute('aria-live','polite');
  el.innerHTML='<div class="wl-card"><small class="wl-kicker"></small><h2 class="wl-title"></h2><p class="wl-sub"></p><div class="wl-meter"><div class="wl-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><span class="wl-pct">0%</span></div></div><span class="wl-brand" aria-hidden="true">BREAK THY RULE</span>';
  document.body.append(el);const q=s=>el.querySelector(s);
  // Full loading screens play the site's bitmapped hero film (site/video-dot-renderer.mjs, the same renderer
  // and footage as the product page hero). It resolves out of dots on entry and dissolves back out on exit;
  // without WebGL it shows the poster. Chapter cards skip it and stay a light plate over the live world.
  const film=(()=>{
   const A=n=>'https://apple-cover-assets--breakthyrule-eden-showroom.netlify.app/'+n,still=matchMedia('(prefers-reduced-motion: reduce)');
   let cv=null,video=null,poster=null,r=null,failed=false,raf=0,last=0,shown=-3,uploaded=-1e9,on=false,dis=1,target=1,mx=-9999,my=-9999,rx=-9999,ry=-9999,born=-1e4,loading=null;
   function size(){if(!r)return;const w=innerWidth,h=innerHeight;r.resize(w,h,Math.max(w<700?2:2.8,Math.sqrt(w*h/95000)));}
   function init(){
    if(loading)return loading;
    poster=new Image();poster.crossOrigin='anonymous';poster.decoding='async';poster.className='wl-poster';poster.alt='';poster.src=A('hero-film-poster.jpg');
    video=document.createElement('video');video.crossOrigin='anonymous';video.muted=video.defaultMuted=video.loop=video.playsInline=true;video.preload='auto';video.setAttribute('muted','');video.setAttribute('playsinline','');video.disablePictureInPicture=true;video.src=A('hero-film.mp4');
    cv=document.createElement('canvas');cv.className='wl-film';cv.setAttribute('aria-hidden','true');el.prepend(poster,cv);
    el.addEventListener('pointermove',e=>{mx=e.clientX;my=e.clientY;});el.addEventListener('pointerleave',()=>{mx=my=-9999;});
    el.addEventListener('pointerdown',e=>{rx=e.clientX;ry=e.clientY;born=performance.now();});
    addEventListener('resize',size);
    return loading=import('/site/video-dot-renderer.mjs?v=site-audit-1').then(({createVideoDotRenderer})=>{r=createVideoDotRenderer(cv);size();}).catch(()=>{failed=true;cv.remove();el.classList.add('wl-still');});
   }
   function tick(now){
    raf=0;if(!r)return;const dt=Math.min(.1,last?(now-last)/1000:.016);last=now;dis+=(target-dis)*(still.matches?1:1-Math.exp(-dt*(target?3.2:2.4)));
    const src=video.readyState>=2&&!video.paused?video:poster.complete&&poster.naturalWidth?poster:null;
    // Upload only a new picture: a changed video frame (at most 30 a second) or the poster once.
    const stamp=src===video?Math.floor(video.currentTime*30):src?-1:-2,fresh=src&&stamp!==shown&&now-uploaded>=33;
    if(fresh&&r.setFrame(src)){shown=stamp;uploaded=now;}
    if(src&&shown!==-3){r.draw({scrollDissolve:still.matches?0:dis,mouseX:mx,mouseY:my,hover:mx>-9999&&!still.matches?1:0,rippleX:rx,rippleY:ry,rippleAge:still.matches?10:(now-born)/1000});cv.classList.add('on');}
    if(on||dis<.985)raf=requestAnimationFrame(tick);else{last=0;cv.classList.remove('on');}
   }
   return {
    async start(){if(failed){el.classList.add('wl-still');return;}on=true;target=0;dis=Math.max(dis,.85);await init();if(!on||!r)return;size();if(!still.matches)video.play().catch(()=>{});if(!raf)raf=requestAnimationFrame(tick);},
    stop(){on=false;target=1;video?.pause();if(r&&!raf)raf=requestAnimationFrame(tick);},
    inspect:()=>({ready:!!r,failed,playing:!!video&&!video.paused,dissolve:+dis.toFixed(2)})};
  })();
  function show(title,sub='',kicker='BREAKTHYRULE',quick=false){q('.wl-kicker').textContent=kicker;q('.wl-title').textContent=title;q('.wl-sub').textContent=sub;progress(0);el.hidden=false;el.classList.remove('out','card');void el.offsetWidth;el.classList.add('in');if(!quick)film.start();}
  function progress(k){const n=Math.round(Math.max(0,Math.min(1,k))*100);q('.wl-bar i').style.width=n+'%';q('.wl-bar').setAttribute('aria-valuenow',n);q('.wl-pct').textContent=n+'%';}
  function hide(){film.stop();el.classList.remove('in');el.classList.add('out');setTimeout(()=>{if(el.classList.contains('out'))el.hidden=true;},620);}
  const frame=()=>new Promise(r=>requestAnimationFrame(()=>r()));
  // Compile shaders up front, but never hold a loading screen longer than `cap` ms: the rest finishes behind it.
  let primed=false;
  async function compile(cap=12000){
   const changed=[];for(const c of scene.children)if(c.visible&&!c.isLight)c.traverse(o=>{if(o.isMesh||o.isSprite||o.isGroup){changed.push([o,o.visible,o.frustumCulled,o.castShadow]);o.visible=true;o.frustumCulled=false;if(o.isMesh)o.castShadow=true;}});
   const target=renderer.getRenderTarget();
   try{const job=renderer.compileAsync?renderer.compileAsync(scene,camera):Promise.resolve(renderer.compile(scene,camera));await Promise.race([job,new Promise(r=>setTimeout(r,cap))]);
    // Force initial geometry, depth shaders and textures with the final display color space
    // while the opaque loading card covers the world. Live frames reuse the GPU resources.
    renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);root.breakThyRuleShowroom?.combat()?.primeView?.();renderer.getContext().finish();primed=true;
   }catch(e){console.warn('World warm-up failed; live rendering will retry.',e);}finally{renderer.setRenderTarget(target);for(const [o,v,f,cast]of changed){o.visible=v;o.frustumCulled=f;o.castShadow=cast;}window.edenBaked?.refreshShadows();root.breakThyRuleShowroom?.battle()?.refreshShadows?.();renderer.shadowMap.needsUpdate=true;}
  }

  // Switch world behind a loading screen. steps: async work to do while it shows (build, start the match...).
  async function enter(next,{title,sub,kicker,steps=[],min=900}={}){
   if(busy||next===world)return;busy=true;const t0=performance.now();
   try{
    if(title)show(title,sub,kicker);await frame();await frame();
    world=next;apply();stats.switches++;
    for(let i=0;i<steps.length;i++){await steps[i]();progress((i+1)/(steps.length+1));await frame();}
    await compile();progress(1);apply();requestDraw();
    const left=min-(performance.now()-t0);if(title&&left>0)await new Promise(r=>setTimeout(r,left));
   }finally{if(title)hide();busy=false;requestDraw();}
  }
  // A loading screen without a world change (the black cube): compile what is about to be seen.
  async function veil({title,sub,kicker,min=800}={}){if(busy)return;busy=true;const t0=performance.now();try{show(title,sub,kicker);await frame();await frame();progress(.5);await compile(1500);progress(1);const left=min-(performance.now()-t0);if(left>0)await new Promise(r=>setTimeout(r,left));}finally{hide();busy=false;requestDraw();}}
  // A short card (a sealed door, a milestone).
  let cardTimer=0;function card(title,sub,kicker='BREAKTHYRULE',ms=2600){show(title,sub,kicker,true);film.stop();progress(1);el.classList.add('card');clearTimeout(cardTimer);cardTimer=setTimeout(()=>{el.classList.remove('card');hide();},ms);}
  // Chapters: status from the manifest, and their scripts fetched only when asked for.
  async function chapters(){if(manifest)return manifest;try{const r=await fetch('/assets/worlds/chapters.json?v=2');manifest=(await r.json()).chapters||{};}catch{manifest={};}return manifest;}
  async function chapter(id){const m=(await chapters())[id];if(!m)return {id,status:'sealed'};
   if(m.script&&m.status!=='sealed'){if(!loadedScripts.has(m.script))loadedScripts.set(m.script,new Promise((res,rej)=>{const s=document.createElement('script');s.src=m.script;s.onload=res;s.onerror=rej;document.head.append(s);}));try{await loadedScripts.get(m.script);}catch{return {id,...m,status:'sealed'};}}
   return {id,...m};}
  // Compile the scene's shaders exactly as they will be in another world (same visible lights, so the same program
  // variants), then switch straight back: all synchronous, inside one call, so nothing is drawn in between.
  // prewarm.js uses this so the first frames after crossing the door do not compile ~100 programs.
  // Roots of that world that hide themselves while the viewer is elsewhere (the district does) are shown for the
  // compile too, so their lights count and their meshes compile; each gets its own visibility back afterwards.
  function compileFor(name){if(busy||name===world)return null;const was=world;world=name;apply();let job=null;const self=[];
   for(const c of scene.children)if(classify(c)===name&&!c.visible){self.push(c);c.visible=true;}
   try{job=renderer.compileAsync?renderer.compileAsync(scene,camera):renderer.compile(scene,camera);job?.catch?.(()=>{});}catch(e){console.warn('Prewarm compile failed',e);}finally{for(const c of self)c.visible=false;world=was;apply();}return job;}
  return {enter,veil,card,chapter,chapters,world:()=>world,loading:()=>busy,apply,syncLights,compileFor,inspect:()=>({world,busy,primed,stableLights:stableLights.size,...stats,film:film.inspect()})};
 };
})(window);
