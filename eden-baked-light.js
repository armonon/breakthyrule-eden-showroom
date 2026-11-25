'use strict';
// Baked daylight (tools/blender/bake_garden_light.py). Sky and bounce light come from Cycles instead of a uniform sky:
// the terrain reads a lightmap, and every physical material reads a 3D probe grid by world position, so moving things
// (jester, avatars, garments) pass through the same shade as the static garden. The sun stays a real-time light.
// Fades out at the grid's edge and at night, where the existing lighting takes over. Install before materials compile.
// Beyond Eden (always night) has its own bake (tools/blender/bake_beyond_light.py, format 3 in assets/beyond-bake/bake.json):
// a ground lightmap, a coarse probe grid over the district and a fine one over the courtyard packed into the same
// volume, the moon's static shadow, the static shadow of the lamps and altar lights, and contact occlusion on the ground.
window.createEdenBakedLight=function(T,{url='/assets/eden-bake/',beyondUrl='/assets/beyond-bake/',onShadowChange=()=>{}}={}){
 const shared=o=>{o.clone=()=>o;return o;};
 const grid=()=>{const t=new T.Data3DTexture(new Uint8Array(4),1,1,1);t.format=T.RGBAFormat;t.minFilter=t.magFilter=T.LinearFilter;t.wrapS=t.wrapT=t.wrapR=T.ClampToEdgeWrapping;t.unpackAlignment=1;t.needsUpdate=true;return shared(t);};
 const probeA=grid(),probeB=grid(),boxMin=shared(new T.Vector3()),boxSize=shared(new T.Vector3(1,1,1)),params=shared(new T.Vector3(0,1,1)); // x: strength (0 until loaded), y: scale, z: gain
 const state={loaded:false,night:0,gain:1,enabled:true,world:'eden',beyondLoaded:false};
 const beyondA=grid(),beyondB=grid(),beyondMin=shared(new T.Vector3()),beyondSize=shared(new T.Vector3(1,1,1)),beyondParams=shared(new T.Vector3()),beyondBounds=shared(new T.Vector4());
 // The two probe grids share one volume: where each sits in it (in texels), and the fine grid's box in the world (far away until loaded).
 const beyondAtlas=shared(new T.Vector3(1,1,1)),beyondGridC=shared(new T.Vector3(1,1,1)),beyondGridD=shared(new T.Vector3(1,1,1)),beyondGridO=shared(new T.Vector3()),beyondDetailMin=shared(new T.Vector3(1e6,1e6,1e6)),beyondDetailSize=shared(new T.Vector3(1,1,1));
 const image=()=>{const t=new T.DataTexture(new Uint8Array([0,0,0,255]),1,1);t.needsUpdate=true;return shared(t);};
 // Uniform values keep their object identity through UniformsUtils.clone; world changes
 // only mutate shared vectors/textures, never shader defines or material program keys.
 const beyondGround=image(),beyondSun=image(),staticCasters=new Map();let staticOff=false;
 function shadows(off,force=false){if(off===staticOff&&!force)return;staticOff=off;for(const [mesh,cast] of staticCasters)mesh.castShadow=off?false:cast;onShadowChange();}
 function registerStatic(root){root.traverse(o=>{if(!o.isMesh||o.isSkinnedMesh||o.userData.noHit)return;for(let p=o;p;p=p.parent)if(p.userData.dynamicShadow)return;if(!staticCasters.has(o))staticCasters.set(o,o.castShadow);if(staticOff)o.castShadow=false;});}
 function unregisterStatic(root){root.traverse(o=>{const cast=staticCasters.get(o);if(cast!==undefined)o.castShadow=cast;staticCasters.delete(o);});}

 const uniforms={edenProbeA:{value:probeA},edenProbeB:{value:probeB},edenProbeMin:{value:boxMin},edenProbeSize:{value:boxSize},edenBake:{value:params}};
 Object.assign(uniforms,{beyondProbeA:{value:beyondA},beyondProbeB:{value:beyondB},beyondMin:{value:beyondMin},beyondSize:{value:beyondSize},beyondBake:{value:beyondParams},beyondGround:{value:beyondGround},beyondSun:{value:beyondSun},beyondBounds:{value:beyondBounds},beyondAtlas:{value:beyondAtlas},beyondGridC:{value:beyondGridC},beyondGridD:{value:beyondGridD},beyondGridO:{value:beyondGridO},beyondDetailMin:{value:beyondDetailMin},beyondDetailSize:{value:beyondDetailSize}});
 Object.assign(T.ShaderLib.standard.uniforms,uniforms);Object.assign(T.ShaderLib.physical.uniforms,uniforms);
 T.ShaderChunk.lights_physical_pars_fragment=`uniform highp sampler3D edenProbeA,edenProbeB;uniform vec3 edenProbeMin,edenProbeSize,edenBake;\nuniform highp sampler3D beyondProbeA,beyondProbeB;uniform sampler2D beyondGround,beyondSun;uniform vec3 beyondMin,beyondSize,beyondBake,beyondAtlas,beyondGridC,beyondGridD,beyondGridO,beyondDetailMin,beyondDetailSize;uniform vec4 beyondBounds;\n`+T.ShaderChunk.lights_physical_pars_fragment;
 // The live lights are added in a fixed order (point, spot, directional). Noting the running total between them lets the
 // bake shade each kind with its own static shadow: lamps and altar lights, the chest light, the moon.
 {const begin=T.ShaderChunk.lights_fragment_begin,spot='#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )',dir='#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
  if(begin.split(spot).length===2&&begin.split(dir).length===2&&begin.indexOf(spot)<begin.indexOf(dir)){
   T.ShaderChunk.lights_fragment_begin=begin.replace(spot,'#ifdef STANDARD\nvec3 beyondPointD=reflectedLight.directDiffuse,beyondPointS=reflectedLight.directSpecular;\n#endif\n'+spot).replace(dir,'#ifdef STANDARD\nvec3 beyondLocalD=reflectedLight.directDiffuse,beyondLocalS=reflectedLight.directSpecular;\n#endif\n'+dir);
   T.ShaderChunk.lights_physical_pars_fragment='#define BEYOND_SPLIT\n'+T.ShaderChunk.lights_physical_pars_fragment;}}
 T.ShaderChunk.lights_fragment_maps+=`
 #if defined(RE_IndirectDiffuse)&&defined(STANDARD)
 #ifdef USE_LIGHTMAP
 if(edenBake.x<=0.)irradiance-=lightMapIrradiance;
 #endif
 if(edenBake.x>0.){
  mat3 edenInvView=transpose(mat3(viewMatrix));vec3 edenW=cameraPosition+edenInvView*(-vViewPosition),edenBaked;float edenFade;
  #ifdef USE_LIGHTMAP
   edenBaked=lightMapIrradiance*lightMapIrradiance*edenBake.y;edenFade=1.;
   irradiance-=lightMapIrradiance;
  #else
   vec3 edenN=edenInvView*geometryNormal,edenUvw=(edenW-edenProbeMin)/edenProbeSize,edenE=smoothstep(vec3(0.),vec3(.06),edenUvw)*smoothstep(vec3(0.),vec3(.06),1.-edenUvw);
   vec4 edenA=texture(edenProbeA,edenUvw);vec3 edenD=texture(edenProbeB,edenUvw).xyz*2.-1.;
   edenBaked=edenA.rgb*edenA.rgb*edenBake.y*max(1.+dot(edenD,edenN),.05);edenFade=edenE.x*edenE.z*smoothstep(0.,.02,edenUvw.y+.02);
  #endif
  float edenMix=edenFade*edenBake.x;
  irradiance=mix(irradiance,edenBaked*edenBake.z,edenMix);
  #if defined(USE_ENVMAP)&&defined(STANDARD)&&defined(ENVMAP_TYPE_CUBE_UV)
   iblIrradiance*=1.-edenMix;
   #ifdef RE_IndirectSpecular
    radiance*=mix(1.,clamp(dot(edenBaked,vec3(.33))*1.4,.08,1.),edenMix);
   #endif
  #endif
 }
 #endif
 `;
 T.ShaderChunk.lights_fragment_maps+=`
 #if defined(RE_IndirectDiffuse)&&defined(STANDARD)
 if(beyondBake.x>0.){
  mat3 invV=transpose(mat3(viewMatrix));vec3 w=cameraPosition+invV*(-vViewPosition),n=invV*geometryNormal;
  vec3 uvw=(w-beyondMin)/beyondSize;vec2 edge=smoothstep(vec2(0.),vec2(.035),uvw.xz)*smoothstep(vec2(0.),vec2(.035),1.-uvw.xz);
  vec3 light;float vis,local,contact=1.,amount=beyondBake.x*edge.x*edge.y;
  // The lightmap is the ground itself; steps, plinths and porches stand above the plane it was baked on, so they read the probes.
  if(n.y>.65&&w.y<.12){
   vec2 uv=(w.xz-beyondBounds.xy)/beyondBounds.zw;uv.y=1.-uv.y;
   vec3 ground=texture2D(beyondGround,uv).rgb,shade=texture2D(beyondSun,uv).rgb;light=ground*ground*ground*beyondBake.y;vis=shade.r;local=shade.g;contact=shade.b;
  }else{
   // Probes are read a little off the surface, so a wall does not pick up the dark inside itself (further above a step or
   // table top, whose thin slab would otherwise shade itself).
   vec3 cu=clamp((w+n*.5-beyondMin)/beyondSize*beyondGridC,vec3(.5),beyondGridC-.5)/beyondAtlas;
   vec4 a=texture(beyondProbeA,cu),b=texture(beyondProbeB,cu);
   // The fine grid over the courtyard and altar takes over inside its box.
   vec3 du=(w+n*mix(.25,.95,smoothstep(.65,.9,n.y))-beyondDetailMin)/beyondDetailSize,de=smoothstep(vec3(0.),vec3(.08),du)*smoothstep(vec3(0.),vec3(.08),1.-du);float fine=de.x*de.z*smoothstep(0.,.1,1.-du.y);
   if(fine>0.){du=(beyondGridO+clamp(du*beyondGridD,vec3(.5),beyondGridD-.5))/beyondAtlas;a=mix(a,texture(beyondProbeA,du),fine);b=mix(b,texture(beyondProbeB,du),fine);}
   light=a.rgb*a.rgb*a.rgb*beyondBake.y*max(1.+dot(b.xyz*2.-1.,n),.05);vis=b.w;local=a.a;
  }
  irradiance=mix(irradiance,light*beyondBake.z,amount);
  // Static shadows from the bake on the live lights; moving characters still cast onto the ground and each other in
  // the tight live moon map. Lamps and altar lights take their own baked shadow, the chest light a touch of contact
  // occlusion so things sit on the ground it lights, the moon its baked visibility.
  #ifdef BEYOND_SPLIT
   reflectedLight.directDiffuse=beyondPointD*mix(1.,local*.55,amount)+(beyondLocalD-beyondPointD)*mix(1.,contact,amount*.6)+(reflectedLight.directDiffuse-beyondLocalD)*mix(1.,vis,amount);
   reflectedLight.directSpecular=beyondPointS*mix(1.,local,amount)+(beyondLocalS-beyondPointS)+(reflectedLight.directSpecular-beyondLocalS)*mix(1.,vis,amount);
  #else
   reflectedLight.directDiffuse*=mix(1.,vis,amount);
  #endif
  #if defined(USE_ENVMAP)&&defined(STANDARD)&&defined(ENVMAP_TYPE_CUBE_UV)
   iblIrradiance*=1.-amount;
   #ifdef RE_IndirectSpecular
    radiance*=mix(1.,clamp(dot(light,vec3(.33))*1.4,.08,1.),amount);
   #endif
  #endif
 }
 #endif
 `;
 const apply=()=>{params.x=state.enabled&&state.loaded&&state.world==='eden'?1-state.night:0;params.z=state.gain;
  beyondParams.x=state.enabled&&state.beyondLoaded&&state.world==='beyond'?T.MathUtils.smoothstep(state.night,.55,.84):0;beyondParams.z=state.gain*(state.beyondGain??1);shadows(beyondParams.x>.999);
 };
 // Beyond Eden's bake is not needed in the garden, so it waits until someone heads there or the first view has settled.
 let beyondStart=null;const beyondGo=new Promise(resolve=>{beyondStart=resolve;});
 setTimeout(()=>beyondStart(),20000);
 const beyondReady=(async()=>{
  await beyondGo;
  try{
   const meta=await fetch(beyondUrl+'bake.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error(r.status);return r.json();});
   if(meta.format!==3)throw Error('Beyond bake format '+meta.format+' is not the one this build reads (3)');
   // The files change together with bake.json: its hashes keep an older cached lightmap from meeting a newer probe grid.
   const file=name=>beyondUrl+name+'?v='+String(meta.assets?.[name]||'').slice(0,12);
   const [bin,ground,sun]=await Promise.all([fetch(file('probes.bin')).then(r=>{if(!r.ok)throw Error(r.status);return r.arrayBuffer();}),new T.TextureLoader().loadAsync(file('lightmap.jpg')),new T.TextureLoader().loadAsync(file('sun.jpg'))]);
   const [nx,ny,nz]=meta.atlas,n=nx*ny*nz,bytes=new Uint8Array(bin);if(bytes.length!==n*8)throw Error('Invalid Beyond probe data');
   const a=new Uint8Array(n*4),b=new Uint8Array(n*4);for(let i=0;i<n;i++){a.set(bytes.subarray(i*8,i*8+4),i*4);b.set(bytes.subarray(i*8+4,i*8+8),i*4);}
   for(const [texture,data] of [[beyondA,a],[beyondB,b]]){texture.dispose();texture.image={data,width:nx,height:ny,depth:nz};texture.needsUpdate=true;}
   for(const [texture,loaded] of [[beyondGround,ground],[beyondSun,sun]]){texture.dispose();texture.isDataTexture=false;texture.image=loaded.image;texture.colorSpace=T.NoColorSpace;texture.flipY=true;texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.anisotropy=4;texture.needsUpdate=true;loaded.dispose();}
   // Voxel centres: texel 0 sits half a texel inside each grid's box.
   const coarse=meta.grids.coarse,detail=meta.grids.detail;beyondAtlas.set(nx,ny,nz);
   beyondMin.set(...coarse.min.map((v,i)=>v-coarse.step[i]/2));beyondSize.set(...coarse.dims.map((k,i)=>k*coarse.step[i]));beyondGridC.set(...coarse.dims);
   if(detail){beyondDetailMin.set(...detail.min.map((v,i)=>v-detail.step[i]/2));beyondDetailSize.set(...detail.dims.map((k,i)=>k*detail.step[i]));beyondGridD.set(...detail.dims);beyondGridO.set(...detail.offset);}
   const [x0,x1,z0,z1]=meta.bounds;beyondBounds.set(x0,z0,x1-x0,z1-z0);beyondParams.y=meta.scale;state.beyondLoaded=true;state.beyondScale=meta.scale;apply();return meta;
  }catch(error){console.warn('Beyond bake unavailable; keeping live lighting and shadows',error);return null;}
 })();
 const ready=(async()=>{
  try{
   const [meta,bin]=await Promise.all([fetch(url+'bake.json').then(r=>{if(!r.ok)throw Error(r.status);return r.json();}),fetch(url+'probes.bin').then(r=>{if(!r.ok)throw Error(r.status);return r.arrayBuffer();})]);
   const [nx,ny,nz]=meta.dims,bytes=new Uint8Array(bin),n=nx*ny*nz,a=new Uint8Array(n*4),b=new Uint8Array(n*4);
   for(let i=0;i<n;i++){a.set(bytes.subarray(i*8,i*8+4),i*4);b.set(bytes.subarray(i*8+4,i*8+8),i*4);}
   for(const [t,data] of [[probeA,a],[probeB,b]]){t.image={data,width:nx,height:ny,depth:nz};t.needsUpdate=true;}
   // voxel centres: texel 0 sits half a texel inside the texture
   const size=[nx,ny,nz].map((k,i)=>k*meta.step[i]);boxMin.set(meta.min[0]-meta.step[0]/2,meta.min[1]-meta.step[1]/2,meta.min[2]-meta.step[2]/2);boxSize.set(...size);
   params.y=meta.scale;state.loaded=true;state.scale=meta.scale;apply();return meta;
  }catch(error){console.warn('Baked light unavailable; using the live sky only',error);return null;}
 })();
 return {ready,beyondReady,registerStatic,unregisterStatic,refreshShadows(){shadows(staticOff,true);},
  setWorld(world){if(world==='beyond')beyondStart();if(world!==state.world){state.world=world;apply();}},
  loadBeyond(){beyondStart();return beyondReady;},
  nightStrength:()=>beyondParams.x,
  dynamicShadowOnly:()=>staticOff,
  setNight(v){if(v!==state.night){state.night=v;apply();}},
  set(next){Object.assign(state,next);apply();},
  // Terrain: the lightmap for sky + bounce, plus baked sun visibility beyond the live shadow frustum.
  applyToTerrain(material){
   const loader=new T.TextureLoader();
   loader.load(url+'lightmap.jpg',t=>{t.colorSpace=T.NoColorSpace;t.generateMipmaps=true;t.anisotropy=4;material.lightMap=t;material.lightMapIntensity=1;material.needsUpdate=true;});
   return loader.load(url+'sun.jpg',t=>{t.colorSpace=T.NoColorSpace;});
  },
  inspect:()=>({...state,strength:params.x,beyondStrength:beyondParams.x,staticShadowsDisabled:staticOff,registeredStatic:staticCasters.size})};
};
