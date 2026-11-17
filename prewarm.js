'use strict';
// Idle preparation for the active world. Hidden destinations are prepared behind
// their own loading screen, not while the player is trying to explore Eden.
//   const warm=createPrewarm({T,renderer,scene,camera,canRun:()=>!playerMoving});
//   warm.start();  warm.inspect()
(function(root){
 root.createPrewarm=function({T,renderer,scene,camera,tasks=[],budgetMs=3,startDelay=2500,includeHidden=false,canRun=()=>true}={}){
  const stats={textures:0,compiled:0,tasks:0,slices:0,done:false,ms:0};let started=false,armed=false,stopped=false,queue=[],scheduled=false,scanQueued=false,waiting=false;const seen=new WeakSet();
  const uploaded=t=>{try{return !!renderer.properties.get(t).__webglInit;}catch{return false;}};
  function schedule(){if(!armed||scheduled||stopped||waiting)return;scheduled=true;setTimeout(()=>{if(stopped)return;if(root.requestIdleCallback)root.requestIdleCallback(slice,{timeout:1500});else slice({timeRemaining:()=>budgetMs});},60);}
  function texturesOf(object){const out=new Set();object[includeHidden?'traverse':'traverseVisible'](o=>{for(const m of [].concat(o.material||[])){for(const v of Object.values(m))if(v?.isTexture)out.add(v);
   for(const u of Object.values(m.uniforms||{})){if(u?.value?.isTexture)out.add(u.value);else if(Array.isArray(u?.value))for(const v of u.value)if(v?.isTexture)out.add(v);}}});return out;}
  const ready=img=>Array.isArray(img)?img.every(ready):!!img&&(Number(img.width)>0||Number(img.videoWidth)>0||img.data);
  function plan(){
   queue=[];
   // Optional host tasks run before scanning any meshes they add.
   for(const t of tasks)queue.push({kind:'task',run:t});
   queue.push({kind:'scan'});scanQueued=true;
  }
  function scan(){
   scanQueued=false;
   for(const tex of texturesOf(scene))if(!seen.has(tex)&&!tex.isRenderTargetTexture&&!tex.isVideoTexture&&ready(tex.image)&&!uploaded(tex)){seen.add(tex);queue.push({kind:'texture',tex});}
   if(includeHidden)for(const child of scene.children)if(!child.visible&&!seen.has(child)&&!child.isLight&&!child.isCamera){seen.add(child);queue.push({kind:'compile',object:child});}
  }
  function step(item){
   if(item.kind==='task'){stats.tasks++;return item.run();}
   if(item.kind==='scan'){scan();return;}
   if(item.kind==='texture'){if(uploaded(item.tex))return;try{renderer.initTexture(item.tex);stats.textures++;}catch{}return;}
   if(item.kind==='compile'){const o=item.object;if(o.visible||!o.parent)return;
    // Visible only for the synchronous part of compile(), inside one idle callback: never drawn like this.
    o.visible=true;try{o.updateMatrixWorld(true);const job=renderer.compileAsync?renderer.compileAsync(o,camera,scene):renderer.compile(o,camera,scene);stats.compiled++;return job;}finally{o.visible=false;}}
  }
  function slice(deadline){
   scheduled=false;if(stopped)return;
   // A timed-out idle callback is not spare frame time. Never force uploads
   // into an already busy frame or run hidden-tab background work.
   if(root.document?.hidden||!canRun()||deadline.timeRemaining()<=1){schedule();return;}
   stats.slices++;const t0=performance.now();
   while(queue.length&&performance.now()-t0<budgetMs&&deadline.timeRemaining()>1){
    const item=queue.shift();let result;try{result=step(item);}catch(e){console.warn('Prewarm task failed',e);}
    if(result?.then){waiting=true;Promise.resolve(result).catch(e=>console.warn('Prewarm task failed',e)).finally(()=>{waiting=false;if(queue.length)schedule();else stats.done=true;});break;}
    if(item.kind==='task'||item.kind==='compile')break;
   }
   stats.ms+=performance.now()-t0;
   if(!waiting){if(queue.length)schedule();else stats.done=true;}
  }
  return {
   start(){if(started)return;started=true;plan();setTimeout(()=>{armed=true;schedule();},startDelay);},
   // Something joined the scene: scan the visible world again (hidden roots are opt-in).
   // Follow-up work jumps the queue: it is the step that the work before it was waiting for.
   add(fn){if(stopped)return;queue.unshift({kind:'task',run:fn});stats.done=false;if(started)schedule();},
   rescan(){if(!started||stopped||scanQueued)return;scanQueued=true;queue.push({kind:'scan'});stats.done=false;schedule();},
   stop(){stopped=true;queue=[];},
   inspect:()=>({...stats,queued:queue.length,ms:+stats.ms.toFixed(1)})
  };
 };
})(window);
