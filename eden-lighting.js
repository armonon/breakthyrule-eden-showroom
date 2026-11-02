'use strict';
// Daylight environment lighting (image-based, from a procedural sky that fades with the night road) and a sun
// shadow frustum that follows the viewer instead of covering a fixed 56 m square around the origin.
window.createEdenLighting=function(T,renderer,scene,{sun,hemi,camera,mobile=false}){
 const original={hemi:hemi.intensity,mapSize:sun.shadow.mapSize.x,frustum:(({left,right,top,bottom,near,far})=>({left,right,top,bottom,near,far}))(sun.shadow.camera),position:sun.position.clone()};
 const settings={environment:true,followShadow:true,hemi:.6,strength:.7};
 const maxSize=Math.min(4096,renderer.capabilities.maxTextureSize),half=mobile?18:22;let size=mobile?2048:maxSize,texel=2*half/size,step=texel*Math.max(1,Math.round(.5/texel));
 const offset=original.position.clone(),look=new T.Matrix4().lookAt(offset,new T.Vector3(),new T.Vector3(0,1,0)),toLight=look.clone().invert();
 const forward=new T.Vector3(),centre=new T.Vector3();
 scene.add(sun.target);

 // Sky colours follow garden.js's sky dome in linear radiance, with the zenith desaturated so lit stone stays warm;
 // below the horizon is grass bounce light.
 const uniforms={night:{value:0},strength:{value:settings.strength},sunDir:{value:offset.clone().normalize()},skyMap:{value:null},hasSky:{value:0},skyTurn:{value:0},skyGain:{value:.55}};
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
 let envTarget=null,bakedNight=-1,skyUniform=null;
 function bakeEnvironment(){
  const target=pmrem.fromScene(envScene);
  envTarget?.dispose();envTarget=target;bakedNight=uniforms.night.value;
  scene.environment=settings.environment?target.texture:null;
 }
 function nightAmount(){
  if(!skyUniform)scene.getObjectByName('Garden of Eden')?.children.some(o=>(skyUniform=o.material?.uniforms?.roadNight));
  return skyUniform?skyUniform.value:0;
 }
 function applyShadowFrustum(){
  const cam=sun.shadow.camera;
  // The graphics setting picks the shadow map size (settings.shadowSize).
  if(settings.shadowSize){size=Math.min(maxSize,settings.shadowSize);texel=2*half/size;step=texel*Math.max(1,Math.round(.5/texel));}
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
   const buf=new Uint8Array(await (await fetch(url)).arrayBuffer());let i=0,line='';const lines=[];
   while(lines.length<4&&i<buf.length){const c=buf[i++];if(c===10){lines.push(line);line='';}else line+=String.fromCharCode(c);}
   const [,h,,w]=lines.find(l=>/^-Y /.test(l)).split(' ').map(Number),px=new Uint16Array(w*h*4),f=T.DataUtils.toHalfFloat;
   for(let p=0;p<w*h;p++){const e=buf[i+p*4+3],k=e?Math.pow(2,e-136):0;px[p*4]=f(buf[i+p*4]*k);px[p*4+1]=f(buf[i+p*4+1]*k);px[p*4+2]=f(buf[i+p*4+2]*k);px[p*4+3]=f(1);}
   const tex=new T.DataTexture(px,w,h,T.RGBAFormat,T.HalfFloatType);tex.magFilter=tex.minFilter=T.LinearFilter;tex.wrapS=T.RepeatWrapping;tex.needsUpdate=true;
   const sunU=Math.atan2(offset.z,offset.x)/(Math.PI*2)+.5;
   uniforms.skyMap.value=tex;uniforms.skyTurn.value=SKY_SUN_U-sunU;uniforms.hasSky.value=1;bakeEnvironment();
  }catch(error){console.warn('HDR sky unavailable; keeping the painted one.',error);}
 }
 loadSky('/assets/eden-sky.hdr?v=1');

 return {
  update(){
   const night=nightAmount();
   if(settings.environment&&(Math.abs(night-bakedNight)>.04||(night!==bakedNight&&(night===0||night===1)))){uniforms.night.value=night;bakeEnvironment();}
   if(!settings.followShadow)return;
   // Centre the frustum a little ahead of the viewer, snapped to a whole-texel grid in light space so shadow
   // edges do not shimmer, and in ~0.5 m steps so the shadow map re-renders only when the viewer has moved.
   camera.getWorldDirection(forward);forward.y=0;forward.normalize();
   centre.copy(camera.position).addScaledVector(forward,half*.4).setY(0).applyMatrix4(toLight);
   centre.x=Math.round(centre.x/step)*step;centre.y=Math.round(centre.y/step)*step;centre.applyMatrix4(look);
   if(centre.distanceToSquared(sun.target.position)>1e-6){sun.target.position.copy(centre);sun.target.updateMatrixWorld();sun.position.copy(centre).add(offset);renderer.shadowMap.needsUpdate=true;}
  },
  set(next={}){Object.assign(settings,next);apply();},
  // Development aid: average ms per frame for n synchronous renders (GPU-finished), optionally re-rendering shadows each frame.
  bench(n=60,{shadows=true}={}){const gl=renderer.getContext();renderer.render(scene,camera);gl.finish();const t0=performance.now();for(let i=0;i<n;i++){if(shadows)renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);}gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));return +((performance.now()-t0)/n).toFixed(2);},
  inspect:()=>({...settings,shadowMapSize:sun.shadow.mapSize.x,shadowHalfExtent:settings.followShadow?half:original.frustum.right,shadowCentre:sun.target.position.toArray().map(v=>+v.toFixed(2)),night:bakedNight})
 };
};
