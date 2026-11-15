'use strict';
// Do the expensive first-time work while the player is not looking: upload every texture the GPU has not seen,
// compile the shaders of the worlds that are hidden right now (Beyond Eden, pockets, the arena), and build the match
// and weapons, in small idle-time slices after the page is ready. Without this each of those happens the first
// moment something new comes into view, which on a desktop GPU is the classic "random" stutter.
//   const warm=createPrewarm({T,renderer,scene,camera,tasks:[()=>combat?.ready(),()=>battle?.prewarm?.()]});
//   warm.start();  warm.inspect()
(function(root){
 root.createPrewarm=function({T,renderer,scene,camera,tasks=[],budgetMs=6,startDelay=2500}={}){
  const stats={textures:0,compiled:0,tasks:0,slices:0,done:false,ms:0};let started=false,stopped=false,queue=[];const seen=new WeakSet();
  const uploaded=t=>{try{return !!renderer.properties.get(t).__webglInit;}catch{return false;}};
  const idle=fn=>(root.requestIdleCallback?root.requestIdleCallback(fn,{timeout:1500}):setTimeout(()=>fn({timeRemaining:()=>budgetMs,didTimeout:true}),60));
  function texturesOf(object){const out=new Set();object.traverse(o=>{for(const m of [].concat(o.material||[])){for(const v of Object.values(m))if(v?.isTexture)out.add(v);
   for(const u of Object.values(m.uniforms||{})){if(u?.value?.isTexture)out.add(u.value);else if(Array.isArray(u?.value))for(const v of u.value)if(v?.isTexture)out.add(v);}}});return out;}
  const ready=img=>Array.isArray(img)?img.every(ready):!!img&&(Number(img.width)>0||Number(img.videoWidth)>0||img.data);
  function plan(){
   queue=[];
   // 1. match, weapons and anything else the host asks for (each may build meshes, so textures/shaders follow)
   for(const t of tasks)queue.push({kind:'task',run:t});
   queue.push({kind:'scan'});
  }
  function scan(){
   // 2. textures anywhere in the scene, hidden worlds included; 3. shaders of each hidden top-level world
   for(const tex of texturesOf(scene))if(!seen.has(tex)&&!tex.isRenderTargetTexture&&!tex.isVideoTexture&&ready(tex.image)&&!uploaded(tex)){seen.add(tex);queue.push({kind:'texture',tex});}
   for(const child of scene.children)if(!child.visible&&!seen.has(child)&&!child.isLight&&!child.isCamera){seen.add(child);queue.push({kind:'compile',object:child});}
  }
  function step(item){
   if(item.kind==='task'){try{const r=item.run();if(r?.then)r.catch(()=>{});}catch(e){console.warn('Prewarm task failed',e);}stats.tasks++;return;}
   if(item.kind==='scan'){scan();return;}
   if(item.kind==='texture'){if(uploaded(item.tex))return;try{renderer.initTexture(item.tex);stats.textures++;}catch{}return;}
   if(item.kind==='compile'){const o=item.object;if(o.visible||!o.parent)return;
    // Visible only for the synchronous part of compile(), inside one idle callback: never drawn like this.
    o.visible=true;try{o.updateMatrixWorld(true);const job=renderer.compileAsync?renderer.compileAsync(o,camera,scene):renderer.compile(o,camera,scene);job?.catch?.(()=>{});stats.compiled++;}catch(e){console.warn('Prewarm compile failed',e);}finally{o.visible=false;}}
  }
  function slice(deadline){
   if(stopped)return;stats.slices++;const t0=performance.now();
   while(queue.length&&(performance.now()-t0<budgetMs)&&(deadline.didTimeout||deadline.timeRemaining()>1)){step(queue.shift());if(queue[0]?.kind==='compile'||queue[0]?.kind==='task')break;}
   stats.ms+=performance.now()-t0;
   if(queue.length)idle(slice);else stats.done=true;
  }
  return {
   start(){if(started)return;started=true;plan();setTimeout(()=>idle(slice),startDelay);},
   // Something new joined the scene (a world loaded later): scan again for new textures and hidden worlds.
   // Follow-up work jumps the queue: it is the step that the work before it was waiting for.
   add(fn){if(stopped)return;queue.unshift({kind:'task',run:fn});if(stats.done){stats.done=false;idle(slice);}},
   rescan(){if(!started||stopped)return;queue.push({kind:'scan'});if(stats.done){stats.done=false;idle(slice);}},
   stop(){stopped=true;queue=[];},
   inspect:()=>({...stats,queued:queue.length,ms:+stats.ms.toFixed(1)})
  };
 };
})(window);
