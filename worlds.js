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
  const BEYOND=new Set(['Arena','Pyramid at the end of the road','Beyond Eden / the old civilization','The Attendant','Eden combat range']);
  const SHARED=new Set(['Garden of Eden','Eden sky box','Player body','Combat effects']);
  const classify=c=>c.isLight||c.isCamera||c.isSprite||(c.type==='Object3D'&&!c.children.length)||SHARED.has(c.name)?'shared':BEYOND.has(c.name)?'beyond':'eden';
  let world='eden',busy=false,hidden=new Set(),manifest=null,loadedScripts=new Map(),stats={switches:0,hiddenLast:0};
  // Hide the other world's roots (only those we hid get shown again, so code that hides its own objects is respected).
  function apply(){
   for(const c of hidden)if(c.parent===scene)c.visible=true;hidden.clear();
   for(const c of scene.children){const k=classify(c);if(k==='shared'||k===world)continue;if(c.visible){c.visible=false;hidden.add(c);}}
   stats.hiddenLast=hidden.size;
  }
  // Loading screen.
  const el=document.createElement('div');el.id='world-loading';el.hidden=true;el.setAttribute('role','status');el.setAttribute('aria-live','polite');
  el.innerHTML='<div class="wl-card"><small class="wl-kicker"></small><h2 class="wl-title"></h2><p class="wl-sub"></p><div class="wl-meter"><div class="wl-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><span class="wl-pct">0%</span></div></div><span class="wl-brand" aria-hidden="true">BREAK THY RULE</span>';
  document.body.append(el);const q=s=>el.querySelector(s);
  function show(title,sub='',kicker='BREAKTHYRULE'){q('.wl-kicker').textContent=kicker;q('.wl-title').textContent=title;q('.wl-sub').textContent=sub;progress(0);el.hidden=false;el.classList.remove('out');void el.offsetWidth;el.classList.add('in');}
  function progress(k){const n=Math.round(Math.max(0,Math.min(1,k))*100);q('.wl-bar i').style.width=n+'%';q('.wl-bar').setAttribute('aria-valuenow',n);q('.wl-pct').textContent=n+'%';}
  function hide(){el.classList.remove('in');el.classList.add('out');setTimeout(()=>{if(el.classList.contains('out'))el.hidden=true;},620);}
  const frame=()=>new Promise(r=>requestAnimationFrame(()=>r()));
  // Compile shaders up front, but never hold a loading screen longer than `cap` ms: the rest finishes behind it.
  async function compile(cap=4000){const job=(async()=>{try{if(renderer.compileAsync)await renderer.compileAsync(scene,camera);else renderer.compile(scene,camera);}catch(e){console.warn('Precompile skipped',e);}})();await Promise.race([job,new Promise(r=>setTimeout(r,cap))]);}
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
  let cardTimer=0;function card(title,sub,kicker='BREAKTHYRULE',ms=2600){show(title,sub,kicker);progress(1);el.classList.add('card');clearTimeout(cardTimer);cardTimer=setTimeout(()=>{el.classList.remove('card');hide();},ms);}
  // Chapters: status from the manifest, and their scripts fetched only when asked for.
  async function chapters(){if(manifest)return manifest;try{const r=await fetch('/assets/worlds/chapters.json?v=2');manifest=(await r.json()).chapters||{};}catch{manifest={};}return manifest;}
  async function chapter(id){const m=(await chapters())[id];if(!m)return {id,status:'sealed'};
   if(m.script&&m.status!=='sealed'){if(!loadedScripts.has(m.script))loadedScripts.set(m.script,new Promise((res,rej)=>{const s=document.createElement('script');s.src=m.script;s.onload=res;s.onerror=rej;document.head.append(s);}));try{await loadedScripts.get(m.script);}catch{return {id,...m,status:'sealed'};}}
   return {id,...m};}
  return {enter,veil,card,chapter,chapters,world:()=>world,loading:()=>busy,apply,inspect:()=>({world,busy,...stats})};
 };
})(window);
