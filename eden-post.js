'use strict';
// Post-processing for the Eden scene: depth-based ambient occlusion (contact shadows where things meet the ground),
// soft bloom on bright highlights and a warm colour grade, all in display space. The scene target is flagged as an
// XR target so three r158 applies tone mapping and sRGB output while rendering into it (it does neither for ordinary
// targets): it then holds exactly what the canvas used to show, including garden.js's sky and water shaders, which
// write display-referred colour directly (clamped here, as the canvas used to clip it: the sky's sun disc is ~3x white).
window.createEdenPost=function(T,renderer,scene,camera,{enabled=true}={}){
 const settings={enabled,ao:.8,aoRadius:.7,aoIntensity:4.5,bloom:.18,bloomThreshold:.9,warmth:.025,saturation:1.06,vignette:.22};
 const webgl2=renderer.capabilities.isWebGL2,size=new T.Vector2(),last=new T.Vector2();
 const target=(type=T.HalfFloatType,extra={})=>new T.WebGLRenderTarget(1,1,{type,depthBuffer:false,...extra});
 const depth=new T.DepthTexture(1,1);depth.type=T.UnsignedIntType;
 const sceneRT=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:webgl2?4:0,depthTexture:depth});sceneRT.texture.colorSpace=T.SRGBColorSpace;sceneRT.isXRRenderTarget=true;
 const aoA=target(),aoB=target(),down=[target(),target(),target()],up=[target(),target()];

 const quadCamera=new T.OrthographicCamera(-1,1,1,-1,0,1),quad=new T.Mesh(new T.PlaneGeometry(2,2));quad.frustumCulled=false;
 const vertexShader='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
 const raw=(fragmentShader,uniforms)=>new T.ShaderMaterial({vertexShader,fragmentShader,uniforms,depthTest:false,depthWrite:false,toneMapped:false});
 function pass(material,output){quad.material=material;renderer.setRenderTarget(output);renderer.render(quad,quadCamera);}

 // Alchemy-style AO from depth alone: view-space position from depth, normal from the flatter neighbour on each
 // axis (so silhouettes do not smear), 12 spiral samples in a world-space radius rotated by a 4x4 ordered pattern
 // (which the 9-tap blur fully removes; random rotation left stipple), faded out with distance (fog).
 const aoMaterial=raw(`varying vec2 vUv;uniform sampler2D tDepth;uniform mat4 projInv;uniform vec2 texel;uniform float radius,projScale,intensity;
 vec3 viewPos(vec2 uv){float d=texture2D(tDepth,uv).x;vec4 p=projInv*vec4(vec3(uv,d)*2.-1.,1.);return p.xyz/p.w;}
 void main(){
  float d=texture2D(tDepth,vUv).x;if(d>=1.){gl_FragColor=vec4(1.,1e4,0.,1.);return;}
  vec3 p=viewPos(vUv);
  vec3 r=viewPos(vUv+vec2(texel.x,0.))-p,l=p-viewPos(vUv-vec2(texel.x,0.)),u=viewPos(vUv+vec2(0.,texel.y))-p,b=p-viewPos(vUv-vec2(0.,texel.y));
  vec3 n=normalize(cross(abs(r.z)<abs(l.z)?r:l,abs(u.z)<abs(b.z)?u:b));if(dot(n,p)>0.)n=-n;
  float screenRadius=radius*projScale*.5/-p.z,occ=0.;
  vec2 cell=mod(floor(gl_FragCoord.xy),4.);float turn=(dot(cell,vec2(4.,1.))*7.+.5)/16.*6.2832,jitter=mod(cell.x+cell.y*2.,4.)/4.;
  for(int i=0;i<12;i++){float t=(float(i)+jitter)/12.;float a=turn+t*18.85;vec2 s=vUv+vec2(cos(a),sin(a))*screenRadius*t;
   vec3 v=viewPos(s)-p;float len=length(v);occ+=max(0.,dot(v/len,n)-.12)*clamp(1.-len/radius,0.,1.);}
  float ao=clamp(1.-occ/12.*intensity,0.,1.);
  gl_FragColor=vec4(mix(ao,1.,smoothstep(22.,40.,-p.z)),-p.z,0.,1.);}`,
  {tDepth:{value:depth},projInv:{value:new T.Matrix4()},texel:{value:new T.Vector2()},radius:{value:settings.aoRadius},projScale:{value:1},intensity:{value:1}});
 // Depth-aware separable blur so AO never bleeds across silhouettes.
 const blurMaterial=raw(`varying vec2 vUv;uniform sampler2D tAO;uniform vec2 dir;
 void main(){vec2 c=texture2D(tAO,vUv).xy;float sum=c.x,w=1.;
  for(int i=-4;i<=4;i++){if(i==0)continue;vec2 s=texture2D(tAO,vUv+dir*float(i)).xy;float k=exp(-abs(s.y-c.y)/(.05*c.y+.02))*(1.-abs(float(i))/5.);sum+=s.x*k;w+=k;}
  gl_FragColor=vec4(sum/w,c.y,0.,1.);}`,{tAO:{value:null},dir:{value:new T.Vector2()}});
 // Bloom: soft-threshold bright pass, then a dual-filter (Kawase) down/up chain.
 const brightMaterial=raw(`varying vec2 vUv;uniform sampler2D tScene;uniform float threshold;
 void main(){vec3 c=min(texture2D(tScene,vUv).rgb,1.);float l=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*smoothstep(threshold,1.,l),1.);}`,{tScene:{value:sceneRT.texture},threshold:{value:settings.bloomThreshold}});
 const downMaterial=raw(`varying vec2 vUv;uniform sampler2D tSrc;uniform vec2 texel;
 void main(){vec3 c=texture2D(tSrc,vUv).rgb*4.;c+=texture2D(tSrc,vUv+texel*vec2(-1,-1)).rgb+texture2D(tSrc,vUv+texel*vec2(1,-1)).rgb+texture2D(tSrc,vUv+texel*vec2(-1,1)).rgb+texture2D(tSrc,vUv+texel).rgb;gl_FragColor=vec4(c/8.,1.);}`,{tSrc:{value:null},texel:{value:new T.Vector2()}});
 const upMaterial=raw(`varying vec2 vUv;uniform sampler2D tSrc,tBase;uniform vec2 texel;
 void main(){vec3 c=vec3(0.);
  c+=texture2D(tSrc,vUv+texel*vec2(-2,0)).rgb+texture2D(tSrc,vUv+texel*vec2(2,0)).rgb+texture2D(tSrc,vUv+texel*vec2(0,-2)).rgb+texture2D(tSrc,vUv+texel*vec2(0,2)).rgb;
  c+=(texture2D(tSrc,vUv+texel*vec2(-1,-1)).rgb+texture2D(tSrc,vUv+texel*vec2(1,-1)).rgb+texture2D(tSrc,vUv+texel*vec2(-1,1)).rgb+texture2D(tSrc,vUv+texel).rgb)*2.;
  gl_FragColor=vec4(c/12.+texture2D(tBase,vUv).rgb,1.);}`,{tSrc:{value:null},tBase:{value:null},texel:{value:new T.Vector2()}});
 // Final pass: AO, bloom (screen blend so highlights never clip), warm grade, saturation, vignette.
 const composite=new T.ShaderMaterial({vertexShader,depthTest:false,depthWrite:false,toneMapped:false,
  uniforms:{tScene:{value:sceneRT.texture},tAO:{value:aoA.texture},tBloom:{value:up[0].texture},ao:{value:0},bloom:{value:0},warmth:{value:0},saturation:{value:1},vignette:{value:0},view:{value:0}},
  fragmentShader:`varying vec2 vUv;uniform sampler2D tScene,tAO,tBloom;uniform float ao,bloom,warmth,saturation,vignette,view;
 void main(){vec4 s=texture2D(tScene,vUv);
  if(view>.5){gl_FragColor=vec4(view<1.5?vec3(texture2D(tAO,vUv).x):view<2.5?texture2D(tBloom,vUv).rgb:vec3(s.a),1.);return;}vec3 c=clamp(s.rgb,0.,1.)*mix(1.,texture2D(tAO,vUv).x,ao);c=1.-(1.-c)*(1.-clamp(texture2D(tBloom,vUv).rgb*bloom,0.,1.));
  c*=vec3(1.+warmth,1.,1.-warmth);c=max(mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,saturation),0.);
  vec2 q=vUv-.5;c*=1.-vignette*dot(q,q)*2.;
  gl_FragColor=vec4(clamp(c,0.,1.),s.a);
 }`});

 function resize(){
  renderer.getDrawingBufferSize(size);if(size.equals(last))return;last.copy(size);
  const w=size.x,h=size.y,hw=Math.max(1,w>>1),hh=Math.max(1,h>>1);
  sceneRT.setSize(w,h);aoA.setSize(hw,hh);aoB.setSize(hw,hh);
  down.forEach((t,i)=>t.setSize(Math.max(1,w>>(i+1)),Math.max(1,h>>(i+1))));up[0].setSize(hw,hh);up[1].setSize(Math.max(1,w>>2),Math.max(1,h>>2));
  aoMaterial.uniforms.texel.value.set(1/hw,1/hh);
 }
 function render(){
  if(!settings.enabled){renderer.info.autoReset=true;renderer.render(scene,camera);return;}
  resize();
  const previous=renderer.getRenderTarget();renderer.info.autoReset=false;renderer.info.reset(); // stats cover the whole processed frame
  renderer.setRenderTarget(sceneRT);renderer.render(scene,camera);
  if(settings.ao>0){
   const u=aoMaterial.uniforms;u.projInv.value.copy(camera.projectionMatrixInverse);u.projScale.value=camera.projectionMatrix.elements[5];u.radius.value=settings.aoRadius;u.intensity.value=settings.aoIntensity;
   pass(aoMaterial,aoA);
   blurMaterial.uniforms.tAO.value=aoA.texture;blurMaterial.uniforms.dir.value.set(1/aoA.width,0);pass(blurMaterial,aoB);
   blurMaterial.uniforms.tAO.value=aoB.texture;blurMaterial.uniforms.dir.value.set(0,1/aoA.height);pass(blurMaterial,aoA);
  }
  if(settings.bloom>0){
   brightMaterial.uniforms.threshold.value=settings.bloomThreshold;pass(brightMaterial,down[0]);
   for(let i=1;i<3;i++){downMaterial.uniforms.tSrc.value=down[i-1].texture;downMaterial.uniforms.texel.value.set(.5/down[i-1].width,.5/down[i-1].height);pass(downMaterial,down[i]);}
   for(let i=1;i>=0;i--){const src=i===1?down[2]:up[1];upMaterial.uniforms.tSrc.value=src.texture;upMaterial.uniforms.tBase.value=down[i].texture;upMaterial.uniforms.texel.value.set(.5/src.width,.5/src.height);pass(upMaterial,up[i]);}
  }
  const c=composite.uniforms;c.ao.value=settings.ao;c.bloom.value=settings.bloom;c.warmth.value=settings.warmth;c.saturation.value=settings.saturation;c.vignette.value=settings.vignette;
  pass(composite,previous);
 }
 return {
  render,
  set(next={}){Object.assign(settings,next);},
  inspect:()=>({...settings,webgl2,size:size.toArray()}),
  // Development aid: average ms per frame for n full renders (GPU-finished).
  bench(n=60){const gl=renderer.getContext();render();gl.finish();const t0=performance.now();for(let i=0;i<n;i++)render();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));return +((performance.now()-t0)/n).toFixed(2);},
  // Development aid: show one buffer full-screen ('ao' | 'bloom') to tune them.
  debug(view){composite.uniforms.view.value=view==='ao'?1:view==='bloom'?2:view==='alpha'?3:0;}
 };
};
