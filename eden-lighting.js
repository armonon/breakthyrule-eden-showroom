'use strict';
// Daylight environment lighting (image-based, from a procedural sky that fades with the night road) and a sun
// shadow frustum that follows the viewer instead of covering a fixed 56 m square around the origin.
window.createEdenLighting=function(T,renderer,scene,{sun,hemi,camera,mobile=false,getNight=null}){
 let disposed=false;const lifetime=new AbortController();
 const original={hemi:hemi.intensity,mapSize:sun.shadow.mapSize.x,frustum:(({left,right,top,bottom,near,far})=>({left,right,top,bottom,near,far}))(sun.shadow.camera),position:sun.position.clone()};
 const settings={environment:true,followShadow:true,hemi:.6,strength:.7};
 // Shadow re-renders are the uneven frames while walking: the map now follows in 2.5 m steps (it was 0.5 m, and small
// camera turns crossed that), over a slightly larger area so coverage near the player is unchanged, and never more
// often than every 120 ms. That is about a fifth of the shadow passes.
const SHADOW_STEP=2.5,SHADOW_GAP=120;let shadowAt=-1e9,shadowPending=false;
// The GPU's own limit: phones lower capabilities.maxTextureSize to shrink image uploads (app.js), not shadow maps.
const maxSize=Math.min(4096,(()=>{try{const gl=renderer.getContext();return gl.getParameter(gl.MAX_TEXTURE_SIZE)||renderer.capabilities.maxTextureSize;}catch{return renderer.capabilities.maxTextureSize;}})()),dayHalf=mobile?20:25;let half=dayHalf,size=mobile?2048:maxSize,texel=2*half/size,step=texel*Math.max(1,Math.round(SHADOW_STEP/texel));
 const offset=original.position.clone(),look=new T.Matrix4().lookAt(offset,new T.Vector3(),new T.Vector3(0,1,0)),toLight=look.clone().invert();
 const forward=new T.Vector3(),centre=new T.Vector3();
 scene.add(sun.target);

 // Sky colours follow garden.js's sky dome in linear radiance, with the zenith desaturated so lit stone stays warm;
 // below the horizon is grass bounce light.
 const uniforms={night:{value:getNight?Math.max(0,Math.min(1,getNight())):0},strength:{value:settings.strength},sunDir:{value:offset.clone().normalize()},skyMap:{value:null},hasSky:{value:0},skyTurn:{value:0},skyGain:{value:.55}};
 const envScene=new T.Scene();
 envScene.add(new T.Mesh(new T.SphereGeometry(1,64,32),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms,
  vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec3 vDir;uniform float night,strength,hasSky,skyTurn,skyGain;uniform vec3 sunDir;uniform sampler2D skyMap;
 void main(){vec3 d=normalize(vDir);float h=d.y;
 vec3 sky=mix(vec3(.73,.78,.62),vec3(.30,.43,.56),pow(max(h,0.),.55));
 vec3 ground=mix(vec3(.30,.34,.19),vec3(.06,.09,.035),smoothstep(0.,-.4,h));
 vec3 c=mix(ground,sky,smoothstep(-.04,.04,h));
 c+=vec3(1.,.74,.42)*pow(max(dot(d,sunDir),0.),10.)*.5;
 // Photographed sky (assets/eden-sky.hdr), turned so its sun sits over the scene's sun; grass bounce below.
 if(hasSky>.5){vec2 uv=vec2(fract(atan(d.z,d.x)/6.2831853+.5+skyTurn),.5-asin(clamp(h,-1.,1.))/3.1415927);
  vec3 photo=texture2D(skyMap,uv).rgb*skyGain;c=mix(ground*.9,photo,smoothstep(-.06,.02,h));}
 vec3 moonlit=mix(vec3(.012,.02,.016),vec3(.002,.004,.005),pow(max(h,0.),.45));
 gl_FragColor=vec4(mix(c,moonlit,night)*strength,1.);}`})));
 const pmrem=new T.PMREMGenerator(renderer);
 let envTarget=null,bakedNight=-1,skyUniform=null,bakes=0,skyStarted=false;
 // The environment map is baked at six night levels and cached: walking the road from day into night used to
 // re-bake it (a multi-pass GPU render) every 4% of darkness, a hitch every few steps. Now each level bakes once
 // (the rest pre-bake in idle time after load) and switching is free. Anything that changes the bake clears it.
 const ENV_STEPS=5,envCache=new Map(),levelOf=n=>Math.round(Math.max(0,Math.min(1,n))*ENV_STEPS)/ENV_STEPS;
 function invalidateEnvironment(){for(const t of envCache.values())if(t!==envTarget)t.dispose();envCache.clear();}
 function bakeLevel(level){let target=envCache.get(level);if(!target){const keep=uniforms.night.value;uniforms.night.value=level;target=pmrem.fromScene(envScene);bakes++;uniforms.night.value=keep;envCache.set(level,target);}return target;}
 function bakeEnvironment(){
  if(disposed)return;
  const level=levelOf(uniforms.night.value),target=bakeLevel(level);
  if(envTarget&&envTarget!==target&&![...envCache.values()].includes(envTarget))envTarget.dispose();
  envTarget=target;bakedNight=level;
  scene.environment=settings.environment?target.texture:null;
  // Do not prepare five night skies while a visitor is browsing sunny Eden.
  if(level>0)prebakeSoon();
 }
 let prebakeTimer=0;
 function prebakeSoon(){if(prebakeTimer||disposed||!settings.environment)return;prebakeTimer=setTimeout(function next(){prebakeTimer=0;if(disposed||!settings.environment)return;
  for(let i=0;i<=ENV_STEPS;i++){const level=i/ENV_STEPS;if(!envCache.has(level)){const run=()=>{if(!disposed&&!envCache.has(level))bakeLevel(level);prebakeTimer=setTimeout(next,400);};(window.requestIdleCallback||setTimeout)(run,{timeout:2000});prebakeTimer=-1;return;}}},1500);}
 function nightAmount(){
  if(getNight)return Math.max(0,Math.min(1,getNight()));
  if(!skyUniform)scene.getObjectByName('Garden of Eden')?.children.some(o=>(skyUniform=o.material?.uniforms?.roadNight));
  return skyUniform?skyUniform.value:0;
 }
 function applyShadowFrustum(){
  const cam=sun.shadow.camera;
  // The graphics setting picks the shadow map size (settings.shadowSize).
  if(settings.shadowSize){size=Math.min(maxSize,settings.shadowSize);texel=2*half/size;step=texel*Math.max(1,Math.round(SHADOW_STEP/texel));}
  if(settings.followShadow){sun.shadow.mapSize.set(size,size);Object.assign(cam,{left:-half,right:half,top:half,bottom:-half,near:1,far:130});}
  else{sun.shadow.mapSize.set(original.mapSize,original.mapSize);Object.assign(cam,original.frustum);sun.position.copy(original.position);sun.target.position.set(0,0,0);sun.target.updateMatrixWorld();}
  cam.updateProjectionMatrix();sun.shadow.map?.dispose();sun.shadow.map=null;renderer.shadowMap.needsUpdate=true;
 }
 function apply(){
  hemi.intensity=settings.environment?settings.hemi:original.hemi;
  uniforms.strength.value=settings.strength;
  bakeEnvironment();applyShadowFrustum();
 }
 apply();
 // High-dynamic-range sky (flat RGBE written by tools/asset-pipeline/shrink-hdr.py), loaded after start-up.
 const SKY_SUN_U=.5947; // where the photographed sun sits across the image
 async function loadSky(url){
  try{
   const response=await fetch(url,{signal:lifetime.signal});if(!response.ok)throw new Error('HTTP '+response.status);const buf=new Uint8Array(await response.arrayBuffer());if(disposed)return;let i=0,line='';const lines=[];
   while(lines.length<4&&i<buf.length){const c=buf[i++];if(c===10){lines.push(line);line='';}else line+=String.fromCharCode(c);}
   const [,h,,w]=lines.find(l=>/^-Y /.test(l)).split(' ').map(Number),px=new Uint16Array(w*h*4),f=T.DataUtils.toHalfFloat;
   for(let p=0;p<w*h;p++){const e=buf[i+p*4+3],k=e?Math.pow(2,e-136):0;px[p*4]=f(buf[i+p*4]*k);px[p*4+1]=f(buf[i+p*4+1]*k);px[p*4+2]=f(buf[i+p*4+2]*k);px[p*4+3]=f(1);}
   const tex=new T.DataTexture(px,w,h,T.RGBAFormat,T.HalfFloatType);tex.magFilter=tex.minFilter=T.LinearFilter;tex.wrapS=T.RepeatWrapping;tex.needsUpdate=true;
   const sunU=Math.atan2(offset.z,offset.x)/(Math.PI*2)+.5;
   uniforms.skyMap.value?.dispose();uniforms.skyMap.value=tex;uniforms.skyTurn.value=SKY_SUN_U-sunU;uniforms.hasSky.value=1;invalidateEnvironment();if(nightAmount()<.999)bakeEnvironment();
  }catch(error){if(disposed||error.name==='AbortError')return;console.warn('HDR sky unavailable; keeping the painted one.',error);}
 }
 function ensureSky(){if(skyStarted||disposed||nightAmount()>=.999)return;skyStarted=true;loadSky('/assets/eden-sky.hdr?v=1');}
 ensureSky();

 return {
  update(){
   if(disposed)return;
   const night=nightAmount();ensureSky();
   window.edenBaked?.setNight(night);
   const nextHalf=window.edenBaked?.dynamicShadowOnly()?8:dayHalf;
   if(settings.followShadow&&half!==nextHalf){half=nextHalf;texel=2*half/size;step=texel*Math.max(1,Math.round(SHADOW_STEP/texel));Object.assign(sun.shadow.camera,{left:-half,right:half,top:half,bottom:-half});sun.shadow.camera.updateProjectionMatrix();shadowPending=true;}
   if(settings.environment&&levelOf(night)!==bakedNight){uniforms.night.value=night;bakeEnvironment();}
   if(!settings.followShadow)return;
   // Centre the frustum a little ahead of the viewer, snapped to a whole-texel grid in light space so shadow
   // edges do not shimmer, and in ~0.5 m steps so the shadow map re-renders only when the viewer has moved.
   camera.getWorldDirection(forward);forward.y=0;forward.normalize();
   centre.copy(camera.position).addScaledVector(forward,half*.4).setY(half===8?Math.max(0,camera.position.y-1.75):0).applyMatrix4(toLight);
   centre.x=Math.round(centre.x/step)*step;centre.y=Math.round(centre.y/step)*step;centre.applyMatrix4(look);
   if(centre.distanceToSquared(sun.target.position)>1e-6)shadowPending=true;
   if(shadowPending&&performance.now()-shadowAt>=SHADOW_GAP){shadowPending=false;shadowAt=performance.now();sun.target.position.copy(centre);sun.target.updateMatrixWorld();sun.position.copy(centre).add(offset);renderer.shadowMap.needsUpdate=true;}
  },
  set(next={}){if(disposed)return;
   const changed=Object.keys(next).filter(key=>next[key]!==settings[key]);if(!changed.length)return;
   Object.assign(settings,next);hemi.intensity=settings.environment?settings.hemi:original.hemi;uniforms.strength.value=settings.strength;
   if(settings.environment&&(changed.includes('strength')||changed.includes('environment'))){invalidateEnvironment();uniforms.night.value=nightAmount();bakeEnvironment();}
   else scene.environment=settings.environment?envTarget?.texture:null;
   if(changed.includes('followShadow')||changed.includes('shadowSize'))applyShadowFrustum();
  },
  // Development aid: average ms per frame for n synchronous renders (GPU-finished), optionally re-rendering shadows each frame.
  bench(n=60,{shadows=true}={}){const gl=renderer.getContext();renderer.render(scene,camera);gl.finish();const t0=performance.now();for(let i=0;i<n;i++){if(shadows)renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);}gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));return +((performance.now()-t0)/n).toFixed(2);},
  dispose(){
   if(disposed)return;disposed=true;lifetime.abort();
   if(scene.environment===envTarget?.texture)scene.environment=null;
   clearTimeout(prebakeTimer);for(const t of envCache.values())if(t!==envTarget)t.dispose();envCache.clear();envTarget?.dispose();envTarget=null;uniforms.skyMap.value?.dispose();uniforms.skyMap.value=null;
   envScene.traverse(o=>{o.geometry?.dispose();for(const material of [].concat(o.material||[]))material.dispose();});envScene.clear();pmrem.dispose();
  },
  inspect:()=>({...settings,bakes,skyRequested:skyStarted,shadowMapSize:sun.shadow.mapSize.x,shadowHalfExtent:settings.followShadow?half:original.frustum.right,shadowCentre:sun.target.position.toArray().map(v=>+v.toFixed(2)),night:bakedNight})
 };
};
