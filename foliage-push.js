'use strict';
// Plants part around people: every instanced wind-swayed material (eden-flora's leaves, ferns, blooms) gets a
// second vertex step that bends the upper part of a plant away from up to six nearby characters. It chains onto
// the material's own onBeforeCompile, so the flora code stays untouched and its wind keeps working.
(function(root){
 const MAX=6;
 function createFoliagePush(T,scene){
  const pushers=Array.from({length:MAX},()=>new T.Vector4()),patched=new WeakSet();let scanned=-1e9;
  const chunk=`#include <begin_vertex>
   {mat4 edenM=modelMatrix*instanceMatrix;vec3 edenW=(edenM*vec4(transformed,1.)).xyz,edenD=vec3(0.);
    for(int i=0;i<${MAX};i++){vec4 p=edenPushers[i];if(p.w<=0.)continue;vec2 d=edenW.xz-p.xz;float l=length(d);
     float f=(1.-smoothstep(p.w*.25,p.w,l))*clamp((edenW.y-p.y)/1.4,0.,1.);edenD.xz+=d/max(l,1e-3)*f*.32;edenD.y-=f*.1;}
    transformed+=inverse(mat3(edenM))*edenD;}`;
  function patch(material){
   if(patched.has(material)||!material.onBeforeCompile||!String(material.onBeforeCompile).includes('edenTime'))return;
   patched.add(material);const own=material.onBeforeCompile,key=material.customProgramCacheKey?.bind(material);
   material.onBeforeCompile=(shader,renderer)=>{own.call(material,shader,renderer);shader.uniforms.edenPushers={value:pushers};
    shader.vertexShader='uniform vec4 edenPushers['+MAX+'];\n'+shader.vertexShader.replace('#include <begin_vertex>',chunk);};
   material.customProgramCacheKey=()=>(key?key():'')+'|eden-push';material.needsUpdate=true;
  }
  return {
   // people: [{x, y (feet), z}] nearest first; time in seconds, used to rescan for flora that loaded late.
   update(people,time){
    if(time-scanned>4){scanned=time;scene.traverse(node=>{if(node.isInstancedMesh)for(const m of [].concat(node.material))patch(m);});}
    for(let i=0;i<MAX;i++){const p=people[i];if(p)pushers[i].set(p.x,p.y,p.z,.6);else pushers[i].w=0;}
   }
  };
 }
 root.createFoliagePush=createFoliagePush;
})(typeof window==='object'?window:globalThis);
