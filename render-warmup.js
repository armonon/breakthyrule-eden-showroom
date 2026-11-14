'use strict';
// Prepare each texture version once per renderer. Cancellation/deadline cover
// uploads, yielding and compilation; a late GPU completion cannot publish a model.
window.createRenderWarmup=function(renderer,camera,scene,{signal,yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0)),timeoutMs=20000}={}){
 const stats={models:0,textures:0,cachedTextures:0,compileMs:0,uploadMs:0},uploaded=new WeakMap(),pending=new WeakMap();
 function prepare(model,{waitForImages=false}={}){
  if(pending.has(model))return pending.get(model);
  let failure=null,timer,abort,fail;
  const stopped=new Promise((_,reject)=>{fail=error=>{if(failure)return;failure=error;reject(error);};});
  const check=()=>{if(failure)throw failure;if(signal?.aborted)throw new DOMException('Loading cancelled','AbortError');};
  abort=()=>fail(new DOMException('Loading cancelled','AbortError'));
  signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>fail(new Error('Landmark preparation timed out')),timeoutMs);
  const wait=task=>Promise.race([task,stopped]);
  const work=async()=>{
   check();const textures=new Set();model.traverse(o=>{for(const material of [].concat(o.material||[])){
    for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    for(const uniform of Object.values(material.uniforms||{})){if(uniform.value?.isTexture)textures.add(uniform.value);else if(Array.isArray(uniform.value))for(const value of uniform.value)if(value?.isTexture)textures.add(value);}
   }});
   for(const texture of textures){check();
    if(waitForImages&&!texture.isRenderTargetTexture){const ready=image=>Array.isArray(image)?image.every(ready):!!image&&Number(image.width)>0&&Number(image.height)>0;while(!ready(texture.image)){check();await wait(yieldTask());}}
    if(uploaded.get(texture)===texture.version){stats.cachedTextures++;continue;}
    const start=performance.now();renderer.initTexture(texture);uploaded.set(texture,texture.version);stats.uploadMs+=performance.now()-start;stats.textures++;await wait(yieldTask());
   }
   check();model.updateMatrixWorld(true);const start=performance.now();
   if(renderer.compileAsync)await wait(renderer.compileAsync(model,camera,scene));else renderer.compile(model,camera,scene);
   check();stats.compileMs+=performance.now()-start;stats.models++;
  };
  const result=Promise.race([work(),stopped]).finally(()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);pending.delete(model);});
  pending.set(model,result);return result;
 }
 return {prepare,inspect:()=>({...stats})};
};
