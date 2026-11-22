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
  // Phones (eden-quality.js profile) are short of memory exactly while a world loads, so there the loading screen shows
  // the film's still poster instead of a second WebGL renderer decoding video, and the hidden Eden roots give their
  // textures back to the GPU while the player is in Beyond Eden (and Beyond's do the same back in Eden). three.js keeps each image and uploads it again the
  // next time it is drawn: the return trip's warm-up render (compile below) does that under the loading screen.
  const phone=!!root.edenRenderProfile?.().mobile;
  function releaseHidden(){
   if(!phone)return 0;const keep=new Set(),drop=new Set();
   const each=(o,fn)=>{for(const m of [].concat(o.material||[])){for(const v of Object.values(m))if(v?.isTexture)fn(v);for(const u of Object.values(m.uniforms||{}))if(u?.value?.isTexture)fn(u.value);}};
   // The other world's roots, whether hidden here or by their own code (the district hides itself away from Beyond).
   const away=scene.children.filter(c=>!c.visible&&!c.isLight&&classify(c)!=='shared'&&classify(c)!==world);
   for(const c of scene.children)if(!away.includes(c))c.traverse(o=>each(o,t=>keep.add(t)));
   for(const c of away)c.traverse(o=>each(o,t=>{if(!keep.has(t)&&!t.isRenderTargetTexture&&!t.isVideoTexture&&!t.isCanvasTexture)drop.add(t);}));
   for(const t of drop)t.dispose();stats.released=(stats.released||0)+drop.size;return drop.size;
  }
  let world='eden',busy=false,hidden=new Set(),manifest=null,loadedScripts=new Map(),stats={switches:0,hiddenLast:0};
  // A fixed pool keeps world switches from changing light-count defines without
  // paying for every remote lamp in every fragment. Sources still own animation.
  const stableLights=new Map(),pointSources=new Map(),lightPosition=new T.Vector3(),nearest=Array(6).fill(null),scores=Array(6).fill(0);
  const pointPool=Array.from({length:6},()=>{const l=new T.PointLight(0xffffff,0,1,2);l.name='World light pool';l.userData.stableProxy=true;scene.add(l);return l;});
  function shown(source){for(let p=source;p;p=p.parent){if(!p.visible)return false;if(p===scene)return true;}return false;}
  function syncLights(discover=false){
   if(discover){const found=[];scene.traverse(o=>{if(o.isLight&&!o.castShadow&&!o.userData.stableProxy&&!pointSources.has(o)&&!stableLights.has(o)&&(o.isPointLight||o.parent!==scene))found.push(o);});
    for(const source of found){const mask=source.layers.mask;source.layers.disableAll();if(source.isPointLight){pointSources.set(source,{source,mask,position:new T.Vector3()});continue;}
     const mirror=source.clone();mirror.name='Stable light · '+(source.parent.name||source.type);mirror.userData.stableProxy=true;mirror.layers.mask=mask;scene.add(mirror);stableLights.set(source,{mirror,mask});}}
   nearest.fill(null);scores.fill(0);
   for(const entry of pointSources.values()){const source=entry.source;if(source.intensity<=0||!shown(source))continue;source.getWorldPosition(entry.position);const score=source.intensity/(1+entry.position.distanceToSquared(camera.position));
    for(let i=0;i<6;i++)if(score>scores[i]){for(let j=5;j>i;j--){scores[j]=scores[j-1];nearest[j]=nearest[j-1];}scores[i]=score;nearest[i]=entry;break;}}
   for(let i=0;i<6;i++){const mirror=pointPool[i],entry=nearest[i];mirror.intensity=entry?entry.source.intensity:0;if(!entry)continue;const source=entry.source;mirror.position.copy(entry.position);mirror.color.copy(source.color);mirror.distance=source.distance;mirror.decay=source.decay;mirror.layers.mask=entry.mask;}
   for(const [source,{mirror}] of stableLights){mirror.intensity=shown(source)?source.intensity:0;mirror.color.copy(source.color);mirror.position.copy(source.getWorldPosition(lightPosition));
    if(source.groundColor)mirror.groundColor.copy(source.groundColor);for(const key of ['distance','decay','angle','penumbra'])if(key in source)mirror[key]=source[key];}
  }

  // Hide the other world's roots (only those we hid get shown again, so code that hides its own objects is respected).
  function apply(){
   window.edenBaked?.setWorld(world);
   for(const c of hidden)if(c.parent===scene)c.visible=true;hidden.clear();
   for(const c of scene.children){const k=classify(c);if(['Garden of Eden','Beyond Eden / the old civilization','Parkour grips','Pyramid at the end of the road'].includes(c.name))window.edenBaked?.registerStatic(c);if(k==='shared'||k===world)continue;if(c.visible){c.visible=false;hidden.add(c);}}
   syncLights(true);splitGarden();stats.hiddenLast=hidden.size;stats.gardenHidden=gardenHidden.size;
  }
  // The garden root is shared (it carries the road and the terrain that runs under both worlds), but in Beyond Eden
  // its parts that lie wholly on the garden side of the door are behind the sky-box walls: hidden too, like the other
  // Eden roots, so the GPU does not draw ~200k unseen triangles whenever the player looks back.
  const gardenSide=new WeakMap(),gardenHidden=new Map(),gardenBox=new T.Box3();
  function splitGarden(){
   // Off the render layers rather than invisible: the garden's own code sets .visible on its foliage every frame.
   for(const [o,mask] of gardenHidden)o.layers.mask=mask;gardenHidden.clear();if(world!=='beyond')return;
   const g=scene.getObjectByName('Garden of Eden');if(!g)return;
   for(const c of g.children){if(c.isLight)continue;let side=gardenSide.get(c);
    if(side===undefined){c.updateMatrixWorld(true);gardenBox.setFromObject(c);side=!gardenBox.isEmpty()&&gardenBox.min.z>-19.5;gardenSide.set(c,side);}
    if(side)c.traverse(o=>{if(!o.isLight&&!gardenHidden.has(o)){gardenHidden.set(o,o.layers.mask);o.layers.mask=0;}});}
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
    async start(){if(phone&&!poster){poster=new Image();poster.decoding='async';poster.className='wl-poster';poster.alt='';poster.src=A('hero-film-poster.jpg');el.prepend(poster);}
     if(failed||phone){el.classList.add('wl-still');return;}on=true;target=0;dis=Math.max(dis,.85);await init();if(!on||!r)return;size();if(!still.matches)video.play().catch(()=>{});if(!raf)raf=requestAnimationFrame(tick);},
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
    world=next;apply();releaseHidden();stats.switches++;
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
  // Interior entry streams only nearby assets. No second WebGL/video renderer
  // and no forced compile of every room, hidden artwork and character at once.
  async function prepareInterior(title,task){
   if(busy)return;busy=true;
   try{show(title,'Preparing the nearby exhibits…','THE LOST EDEN ARCHIVE',true);await frame();await frame();await task(progress);progress(1);await frame();}
   catch(error){console.warn('Interior preparation deferred:',error.message);}
   finally{hide();busy=false;requestDraw();}
  }
  syncLights(true);
  return {enter,veil,card,prepareInterior,chapter,chapters,world:()=>world,loading:()=>busy||!el.hidden,apply,syncLights,compileFor,inspect:()=>({world,busy,primed,stableLights:stableLights.size+pointPool.length,pointSources:pointSources.size,...stats,film:film.inspect()})};
 };
})(window);
