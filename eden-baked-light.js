'use strict';
// Baked daylight (tools/blender/bake_garden_light.py). Sky and bounce light come from Cycles instead of a uniform sky:
// the terrain reads a lightmap, and every physical material reads a 3D probe grid by world position, so moving things
// (jester, avatars, garments) pass through the same shade as the static garden. The sun stays a real-time light.
// Fades out at the grid's edge and at night, where the existing lighting takes over. Install before materials compile.
window.createEdenBakedLight=function(T,{url='/assets/eden-bake/'}={}){
 const shared=o=>{o.clone=()=>o;return o;};
 const grid=()=>{const t=new T.Data3DTexture(new Uint8Array(4),1,1,1);t.format=T.RGBAFormat;t.minFilter=t.magFilter=T.LinearFilter;t.wrapS=t.wrapT=t.wrapR=T.ClampToEdgeWrapping;t.unpackAlignment=1;t.needsUpdate=true;return shared(t);};
 const probeA=grid(),probeB=grid(),boxMin=shared(new T.Vector3()),boxSize=shared(new T.Vector3(1,1,1)),params=shared(new T.Vector3(0,1,1)); // x: strength (0 until loaded), y: scale, z: gain
 const state={loaded:false,night:0,gain:1,enabled:true};
 const uniforms={edenProbeA:{value:probeA},edenProbeB:{value:probeB},edenProbeMin:{value:boxMin},edenProbeSize:{value:boxSize},edenBake:{value:params}};
 Object.assign(T.ShaderLib.standard.uniforms,uniforms);Object.assign(T.ShaderLib.physical.uniforms,uniforms);
 T.ShaderChunk.lights_physical_pars_fragment=`uniform highp sampler3D edenProbeA,edenProbeB;uniform vec3 edenProbeMin,edenProbeSize,edenBake;\n`+T.ShaderChunk.lights_physical_pars_fragment;
 T.ShaderChunk.lights_fragment_maps+=`
 #if defined(RE_IndirectDiffuse)&&defined(STANDARD)
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
 const apply=()=>{params.x=state.enabled&&state.loaded?1-state.night:0;params.z=state.gain;};
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
 return {ready,
  setNight(v){if(v!==state.night){state.night=v;apply();}},
  set(next){Object.assign(state,next);apply();},
  // Terrain: the lightmap for sky + bounce, plus baked sun visibility beyond the live shadow frustum.
  applyToTerrain(material){
   const loader=new T.TextureLoader();
   loader.load(url+'lightmap.jpg',t=>{t.colorSpace=T.NoColorSpace;t.generateMipmaps=true;t.anisotropy=4;material.lightMap=t;material.lightMapIntensity=1;material.needsUpdate=true;});
   return loader.load(url+'sun.jpg',t=>{t.colorSpace=T.NoColorSpace;});
  },
  inspect:()=>({...state,strength:params.x})};
};
