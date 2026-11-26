'use strict';
// Post-processing for the Eden scene: depth-based ambient occlusion (contact shadows where things meet the ground),
// soft bloom on bright highlights and a warm colour grade, all in display space. The scene target is flagged as an
// XR target so three r158 applies tone mapping and sRGB output while rendering into it (it does neither for ordinary
// targets): it then holds exactly what the canvas used to show, including garden.js's sky and water shaders, which
// write display-referred colour directly (clamped here, as the canvas used to clip it: the sky's sun disc is ~3x white).
window.createEdenPost=function(T,renderer,scene,camera,{enabled=true}={}){
 let disposed=false;
 const settings={enabled,ao:.8,aoRadius:.7,aoIntensity:4.5,bloom:.26,bloomThreshold:.9,warmth:.025,saturation:1.06,vignette:.22,flare:.8,rays:.7,glare:.9,contrast:.12,split:.035,taa:true,taaFeedback:.88,sharpen:.6,grain:.028,lut:1,
  // realism (each costs nothing when 0): auto-exposure, distance haze, cloud shadows, wet ground at night, depth of field, motion blur
  exposure:1,haze:.3,clouds:0,wet:0,dof:0,motionBlur:0,
  // body-camera look (Beyond Eden): wide-lens barrel bend, colour fringing at the edges, light hanging in the air round lamps, night grade
  lens:0,chroma:0,air:0,grade:0,
  // body-camera sensor (all neutral here, so Eden is untouched): auto exposure that settles at its own pace each way
  // (exposureUp/Down, per second), a steady gain toward a key level (exposureAuto, exposureKey) inside hard limits
  // (exposureMin/Max); blur from turning (turnBlur), sensor noise that rises in the dark (sensor), compression blocks
  // (block) and the clip and recovery of a muzzle flash (flashClip, fired with flash()).
  exposureUp:.7,exposureDown:.7,exposureAuto:0,exposureKey:.18,exposureMin:.55,exposureMax:1.6,turnBlur:0,sensor:0,block:0,flashClip:0,
  // Dirt on the lens that a lamp behind it lights up (dirt) and the rolling shutter's lean on fast turns (shutter): -1 follows
  // the body camera (dirt with its sensor noise, the lean with its turn blur, which reduced motion switches off), 0 is off.
  dirt:-1,shutter:-1};
 const webgl2=true,size=new T.Vector2(),last=new T.Vector2();
 const target=(type=T.HalfFloatType,extra={})=>new T.WebGLRenderTarget(1,1,{type,depthBuffer:false,...extra});
 const depth=new T.DepthTexture(1,1);depth.type=T.UnsignedIntType;
 const sceneRT=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:webgl2?4:0,depthTexture:depth});sceneRT.texture.colorSpace=T.SRGBColorSpace;sceneRT.isXRRenderTarget=true;
 const aoA=target(),aoB=target(),down=Array.from({length:5},()=>target()),up=Array.from({length:4},()=>target()),rayA=target(),rayB=target();
 // Eye adaptation state, ping-ponged 1x1: r = adapted scene luminance, g = exposure factor, b = focus distance (m).
 const lum=[0,1].map(()=>new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false,minFilter:T.NearestFilter,magFilter:T.NearestFilter}));let lumIndex=0,lumValid=false,lastTime=0;
 const wetRT=target(),lensRT=target();
 // Something drawn in front of the lens but seen by the same sensor (the weapon in hand): it gets the frame's exposure, grade,
 // noise and compression instead of being pasted over them. Its own depth, clear alpha, tone-mapped like the scene.
 let overlayDraw=null,viewRT=null;
 const overlayTarget=()=>{if(!viewRT){viewRT=new T.WebGLRenderTarget(size.x||1,size.y||1,{type:T.HalfFloatType,samples:Math.min(4,sceneRT.samples)});viewRT.texture.colorSpace=T.SRGBColorSpace;viewRT.isXRRenderTarget=true;}
  if(viewRT.width!==size.x||viewRT.height!==size.y)viewRT.setSize(size.x,size.y);if(viewRT.samples!==Math.min(4,sceneRT.samples)){viewRT.samples=Math.min(4,sceneRT.samples);viewRT.dispose();}return viewRT;};
 const overlayClear=new T.Color();
 // Tileable value-noise (4 octaves): drifting cloud shadows and, at a finer scale, where puddles lie.
 const NOISE=128,noiseData=new Uint8Array(NOISE*NOISE*4);{
  const lattice=n=>{const g=new Float32Array(n*n);let seed=1013;for(let i=0;i<g.length;i++){seed=(seed*1664525+1013904223)>>>0;g[i]=seed/4294967296;}return g;};
  const octaves=[4,8,16,32].map(n=>({n,g:lattice(n)})),fade=t=>t*t*(3-2*t);
  for(let y=0;y<NOISE;y++)for(let x=0;x<NOISE;x++){let v=0,amp=.5,total=0;
   for(const {n,g} of octaves){const fx=x/NOISE*n,fy=y/NOISE*n,ix=Math.floor(fx),iy=Math.floor(fy),tx=fade(fx-ix),ty=fade(fy-iy),at=(i,j)=>g[((j%n+n)%n)*n+((i%n+n)%n)];
    v+=amp*((at(ix,iy)*(1-tx)+at(ix+1,iy)*tx)*(1-ty)+(at(ix,iy+1)*(1-tx)+at(ix+1,iy+1)*tx)*ty);total+=amp;amp*=.5;}
   const b=Math.round(v/total*255),k=(y*NOISE+x)*4;noiseData[k]=noiseData[k+1]=noiseData[k+2]=b;noiseData[k+3]=255;}}
 const noise=new T.DataTexture(noiseData,NOISE,NOISE);noise.wrapS=noise.wrapT=T.RepeatWrapping;noise.magFilter=noise.minFilter=T.LinearFilter;noise.needsUpdate=true;
 const NIGHT_AIR=new T.Color(.022,.028,.036),HAZE_NIGHT=new T.Color(.05,.07,.085),airNear=[];
 const tmpMatrix=new T.Matrix4(),camRot=new T.Matrix3(),camPos=new T.Vector3(),cloudOffset=new T.Vector2(),hazeColor=new T.Color(),moveReproject=new T.Matrix4(),prevCamPos=new T.Vector3(),moveMatrix=new T.Matrix4();let moveSpeed=0;
 const prevView=new T.Matrix4(),prevQuat=new T.Quaternion(),camQuat=new T.Quaternion();let turnSpeed=0,turnK=0,flashNow=0,flashDip=0,prevViewValid=false;
 // Rolling shutter: the signed turn rate across the picture (rad/s, + to the right) and the lean it gives. A hard hit: frames
 // left of lost sync (jolt()), and whether the weapon was drawn in front of the lens this frame (overlayMask()).
 const turnQ=new T.Quaternion();let yawRate=0,joltFrames=0,joltK=0,overlayShown=false;
 // Light sources for the lens effects: the sky's sun disc, the night district's lanterns and any flashlights
 // (set by setLights); a flashlight glares hard, but only while its beam points at the camera.
 // Texel 0 of `visible` is the sun's unoccluded fraction, texel i+1 lamp i's, measured from the depth buffer.
 const LAMPS=16,visible=new T.WebGLRenderTarget(LAMPS+1,1,{type:T.HalfFloatType,depthBuffer:false,minFilter:T.NearestFilter,magFilter:T.NearestFilter});
 const SUN=new T.Vector3(-.38,.32,-.8).normalize(),SUN_RADIUS=.03,sunUv=new T.Vector2(),tmp=new T.Vector3(),toCamera=new T.Vector3(),lampList=[];
 const LANTERN=new T.Color(1,.7,.4),TORCH=new T.Color(.85,.95,1);
 let lights={sky:null,lamps:()=>null,torches:()=>null},sunGate=0,night=0,lampCount=0;

 const quadCamera=new T.OrthographicCamera(-1,1,1,-1,0,1),quad=new T.Mesh(new T.PlaneGeometry(2,2));quad.frustumCulled=false;
 const vertexShader='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
 const raw=(fragmentShader,uniforms)=>new T.ShaderMaterial({vertexShader,fragmentShader,uniforms,depthTest:false,depthWrite:false,toneMapped:false});
 function pass(material,output){quad.material=material;renderer.setRenderTarget(output);renderer.render(quad,quadCamera);}

 // Alchemy-style AO from depth alone: view-space position from depth, normal from the flatter neighbour on each
 // axis (so silhouettes do not smear), 12 spiral samples in a world-space radius rotated by a 4x4 ordered pattern
 // (which the 9-tap blur fully removes; random rotation left stipple), faded out with distance (fog).
 const aoMaterial=raw(`varying vec2 vUv;uniform sampler2D tDepth;uniform mat4 projInv;uniform vec2 texel;uniform float radius,projScale,intensity,frameTurn;
 vec3 viewPos(vec2 uv){float d=texture2D(tDepth,uv).x;vec4 p=projInv*vec4(vec3(uv,d)*2.-1.,1.);return p.xyz/p.w;}
 void main(){
  float d=texture2D(tDepth,vUv).x;if(d>=1.){gl_FragColor=vec4(1.,1e4,0.,1.);return;}
  vec3 p=viewPos(vUv);
  vec3 r=viewPos(vUv+vec2(texel.x,0.))-p,l=p-viewPos(vUv-vec2(texel.x,0.)),u=viewPos(vUv+vec2(0.,texel.y))-p,b=p-viewPos(vUv-vec2(0.,texel.y));
  vec3 n=normalize(cross(abs(r.z)<abs(l.z)?r:l,abs(u.z)<abs(b.z)?u:b));if(dot(n,p)>0.)n=-n;
  float screenRadius=radius*projScale*.5/-p.z,occ=0.;
  vec2 cell=mod(floor(gl_FragCoord.xy),4.);float turn=(dot(cell,vec2(4.,1.))*7.+.5)/16.*6.2832+frameTurn,jitter=mod(cell.x+cell.y*2.,4.)/4.;
  for(int i=0;i<12;i++){float t=(float(i)+jitter)/12.;float a=turn+t*18.85;vec2 s=vUv+vec2(cos(a),sin(a))*screenRadius*t;
   vec3 v=viewPos(s)-p;float len=length(v);occ+=max(0.,dot(v/len,n)-.12)*clamp(1.-len/radius,0.,1.);}
  float ao=clamp(1.-occ/12.*intensity,0.,1.);
  gl_FragColor=vec4(mix(ao,1.,smoothstep(22.,40.,-p.z)),-p.z,0.,1.);}`,
  {tDepth:{value:depth},projInv:{value:new T.Matrix4()},texel:{value:new T.Vector2()},radius:{value:settings.aoRadius},projScale:{value:1},intensity:{value:1},frameTurn:{value:0}});
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
 // Occlusion of each light: 12 taps in a disc the size of the source; a tap counts when nothing in the depth buffer
 // is nearer than the source (for the sun: when it is sky). Leaves passing over the sun then dim the flare smoothly.
 const visibleMaterial=raw(`varying vec2 vUv;uniform sampler2D tDepth;uniform mat4 projInv;uniform vec4 sources[${LAMPS+1}];uniform float aspect;
 float viewDist(vec2 uv){float d=texture2D(tDepth,uv).x;if(d>=1.)return 1e9;vec4 p=projInv*vec4(vec3(uv,d)*2.-1.,1.);return -p.z/p.w;}
 void main(){int i=int(gl_FragCoord.x);vec4 s=sources[0];for(int k=1;k<=${LAMPS};k++)if(k==i)s=sources[k];
  if(s.w<=0.){gl_FragColor=vec4(0.);return;}float v=0.;
  for(int k=0;k<12;k++){float t=sqrt((float(k)+.5)/12.),a=float(k)*2.39996;vec2 uv=s.xy+vec2(cos(a)/aspect,sin(a))*s.w*t;
   if(uv.x>0.&&uv.x<1.&&uv.y>0.&&uv.y<1.)v+=step(s.z,viewDist(uv));}
  gl_FragColor=vec4(v/12.,0.,0.,1.);}`,
  {tDepth:{value:depth},projInv:{value:new T.Matrix4()},sources:{value:Array.from({length:LAMPS+1},()=>new T.Vector4())},aspect:{value:1}});
 // God rays: open sky around the sun (sky = nothing in the depth buffer), blurred radially toward the sun in two
 // passes at quarter resolution (24 x 24 effective samples), so beams fan out through gaps in the canopy.
 const rayMaskMaterial=raw(`varying vec2 vUv;uniform sampler2D tDepth,tScene;uniform vec2 sun;uniform float aspect;
 void main(){float sky=step(1.,texture2D(tDepth,vUv).x);vec2 q=(vUv-sun)*vec2(aspect,1.);
  gl_FragColor=vec4(min(texture2D(tScene,vUv).rgb,1.5)*sky*exp(-length(q)*4.5),1.);}`,{tDepth:{value:depth},tScene:{value:sceneRT.texture},sun:{value:sunUv},aspect:{value:1}});
 const rayBlurMaterial=raw(`varying vec2 vUv;uniform sampler2D tSrc;uniform vec2 sun;uniform float span,decay;
 void main(){vec2 delta=(vUv-sun)*span/24.;vec2 uv=vUv-delta*fract(52.9829*fract(dot(gl_FragCoord.xy,vec2(.0671106,.0058372))));
  vec3 sum=vec3(0.);float w=1.,total=0.;for(int i=0;i<24;i++){sum+=texture2D(tSrc,uv).rgb*w;total+=w;w*=decay;uv-=delta;}
  gl_FragColor=vec4(sum/total,1.);}`,{tSrc:{value:null},sun:{value:sunUv},span:{value:1},decay:{value:1}});
 // Eye adaptation, transient only: the eye's adapted level (centre-weighted log-average luminance of 64 taps) lags the
 // scene by ~1.5 s, and the exposure factor is (scene / adapted)^0.6 — stepping into the dark looks darker and then
 // recovers, stepping into sunlight blows out and settles — while every steady view keeps exactly its tuned exposure.
 // The same pass tracks the focus distance at screen centre for depth of field.
 const lumMaterial=raw(`varying vec2 vUv;uniform sampler2D tScene,tPrev,tDepth;uniform mat4 projInv;uniform float rate,rateUp,rateDown,strength,first,autoGain,key,lo,hi;
 float dist(vec2 uv){float d=texture2D(tDepth,uv).x;if(d>=1.)return 200.;vec4 p=projInv*vec4(vec3(uv,d)*2.-1.,1.);return min(length(p.xyz/p.w),200.);}
 void main(){float sum=0.,wsum=0.;
  for(int y=0;y<8;y++)for(int x=0;x<8;x++){vec2 uv=(vec2(float(x),float(y))+.5)/8.,q=uv-.5;float w=exp(-dot(q,q)*5.);sum+=log(max(dot(min(texture2D(tScene,uv).rgb,1.),vec3(.2126,.7152,.0722)),.002))*w;wsum+=w;}
  float avg=exp(sum/wsum),f=(dist(vec2(.5))*2.+dist(vec2(.47,.5))+dist(vec2(.53,.5))+dist(vec2(.5,.46))+dist(vec2(.5,.54)))/6.;
  vec4 prev=texture2D(tPrev,vec2(.5));float adapted=first>.5?avg:mix(prev.r,avg,avg>prev.r?rateUp:rateDown),focus=first>.5?f:mix(prev.b,f,min(1.,rate*3.));
  gl_FragColor=vec4(adapted,clamp(pow(avg/adapted,.6*strength)*pow(key/max(adapted,.004),autoGain),lo,hi),focus,1.);}`,
  {tScene:{value:sceneRT.texture},tPrev:{value:null},tDepth:{value:depth},projInv:{value:new T.Matrix4()},rate:{value:.05},rateUp:{value:.05},rateDown:{value:.05},strength:{value:1},first:{value:1},autoGain:{value:0},key:{value:.18},lo:{value:.55},hi:{value:1.6}});
 // Wet ground at night (half resolution): on upward-facing surfaces, march the reflected view ray through the depth buffer
 // (24 growing steps) and take the scene colour it hits; puddles (noise) mirror, the rest is merely damp. a = dampness.
 const wetMaterial=raw(`varying vec2 vUv;uniform sampler2D tDepth,tScene,tNoise;uniform mat4 projInv,proj;uniform mat3 camRot;uniform vec3 camPos;uniform vec2 texel;
 vec3 viewPos(vec2 uv){float d=texture2D(tDepth,uv).x;vec4 p=projInv*vec4(vec3(uv,d)*2.-1.,1.);return p.xyz/p.w;}
 void main(){float d=texture2D(tDepth,vUv).x;if(d>=1.){gl_FragColor=vec4(0.);return;}
  vec3 p=viewPos(vUv),n=normalize(cross(viewPos(vUv+vec2(texel.x,0.))-p,viewPos(vUv+vec2(0.,texel.y))-p));if(dot(n,p)>0.)n=-n;
  float dist=length(p);if((camRot*n).y<.9||dist>45.){gl_FragColor=vec4(0.);return;}
  vec3 wp=camPos+camRot*p;float puddle=smoothstep(.5,.66,texture2D(tNoise,wp.xz*.07).r),damp=.3+.7*puddle;
  vec3 v=p/dist,r=reflect(v,n),pos=p,hit=vec3(0.);float stepLen=.12+dist*.015,found=0.;
  pos+=r*stepLen*fract(52.9829*fract(dot(gl_FragCoord.xy,vec2(.0671106,.0058372))));
  for(int i=0;i<24;i++){pos+=r*stepLen;stepLen*=1.13;if(pos.z>-.05)break;vec4 c=proj*vec4(pos,1.);vec2 uv=c.xy/c.w*.5+.5;
   if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.)break;float diff=-pos.z+viewPos(uv).z;
   if(diff>0.&&diff<stepLen*2.+.15){vec2 e=smoothstep(0.,.12,uv)*smoothstep(1.,.88,uv);found=e.x*e.y*(1.-float(i)/24.);hit=min(texture2D(tScene,uv).rgb,1.);break;}}
  float fres=.08+.92*pow(1.-max(dot(-v,n),0.),5.);
  gl_FragColor=vec4(hit*found*fres*damp*(1.-smoothstep(25.,45.,dist)),damp*(1.-smoothstep(25.,45.,dist)));}`,
  {tDepth:{value:depth},tScene:{value:sceneRT.texture},tNoise:{value:noise},projInv:{value:new T.Matrix4()},proj:{value:new T.Matrix4()},camRot:{value:camRot},camPos:{value:camPos},texel:{value:new T.Vector2()}});
 // Depth of field (while inspecting: focus on what is at screen centre) and motion blur from the camera's own movement
 // (not from turning, which is where blur turns people's stomachs). Runs only when one of them has something to do.
 const lensMaterial=raw(`varying vec2 vUv;uniform sampler2D tSrc,tDepth,tLum;uniform mat4 projInv,moveReproject;uniform vec2 texel;uniform float dof,motion,aspect,reach,dither;
 void main(){vec3 c=texture2D(tSrc,vUv).rgb;float d=texture2D(tDepth,vUv).x;
  if(dof>0.){vec4 p=projInv*vec4(vec3(vUv,d)*2.-1.,1.);float dist=d>=1.?200.:length(p.xyz/p.w),focus=texture2D(tLum,vec2(.5)).b;
   float coc=clamp((abs(dist-focus)-.15)/(focus*.6+.4),0.,1.)*dof;
   if(coc>.03){vec3 sum=c;for(int i=0;i<16;i++){float t=sqrt((float(i)+.5)/16.),a=float(i)*2.39996;sum+=texture2D(tSrc,vUv+vec2(cos(a)/aspect,sin(a))*t*coc*.011).rgb;}c=sum/17.;}}
  if(motion>0.){vec4 q=moveReproject*vec4(vec3(vUv,d)*2.-1.,1.);vec2 vel=(vUv-(q.xy/q.w*.5+.5))*motion;float len=length(vel/texel);
   if(len>1.){vel*=min(1.,reach/len);float j=dither*(fract(52.9829*fract(dot(gl_FragCoord.xy,vec2(.0671106,.0058372))))-.5);vec3 sum=vec3(0.);for(int i=0;i<8;i++)sum+=texture2D(tSrc,vUv-vel*((float(i)+j)/7.-.5)).rgb;c=mix(c,sum/8.,smoothstep(1.,4.,len));}}
  gl_FragColor=vec4(c,1.);}`,
  {tSrc:{value:null},tDepth:{value:depth},tLum:{value:null},projInv:{value:new T.Matrix4()},moveReproject:{value:moveReproject},texel:{value:new T.Vector2()},dof:{value:0},motion:{value:0},aspect:{value:1},reach:{value:32},dither:{value:0}});
 // Final pass: AO, cloud shadows, wet ground, haze, bloom (screen blend so highlights never clip), lens effects, exposure, warm grade, saturation, vignette.
 const composite=new T.ShaderMaterial({vertexShader,depthTest:false,depthWrite:false,toneMapped:false,
  uniforms:{tScene:{value:sceneRT.texture},tAO:{value:aoA.texture},tBloom:{value:up[0].texture},tRays:{value:rayA.texture},tVisible:{value:visible.texture},ao:{value:0},bloom:{value:0},warmth:{value:0},saturation:{value:1},vignette:{value:0},contrast:{value:0},split:{value:0},view:{value:0},
   sun:{value:sunUv},sunGate:{value:0},flare:{value:0},rays:{value:0},glare:{value:0},aspect:{value:1},lamps:{value:Array.from({length:LAMPS},()=>new T.Vector4())},lampColors:{value:Array.from({length:LAMPS},()=>new T.Color())},
   tDepth:{value:depth},tLum:{value:lum[0].texture},tNoise:{value:noise},tWet:{value:wetRT.texture},projInv:{value:new T.Matrix4()},camRot:{value:camRot},camPos:{value:camPos},cloudOffset:{value:cloudOffset},hazeColor:{value:hazeColor},exposure:{value:0},haze:{value:0},clouds:{value:0},wet:{value:0},grade:{value:0},air:{value:0},airPos:{value:Array.from({length:6},()=>new T.Vector4())},airColor:{value:Array.from({length:6},()=>new T.Color())}},
  fragmentShader:`varying vec2 vUv;uniform sampler2D tScene,tAO,tBloom,tRays,tVisible,tDepth,tLum,tNoise,tWet;uniform mat4 projInv;uniform mat3 camRot;uniform vec3 camPos,hazeColor;uniform vec2 cloudOffset;uniform float exposure,haze,clouds,wet,grade,air;uniform vec4 airPos[6];uniform vec3 airColor[6];uniform float ao,bloom,warmth,saturation,vignette,contrast,split,view,sunGate,flare,rays,glare,aspect;uniform vec2 sun;uniform vec4 lamps[${LAMPS}];uniform vec3 lampColors[${LAMPS}];
 // A ghost is the sun reflected between lens elements: a soft disc with a brighter rim, each colour a slightly different size.
 vec3 ghost(vec2 centre,float r){float d=length((vUv-centre)*vec2(aspect,1.));vec3 rr=r*vec3(1.,1.05,1.1);
  return smoothstep(rr,rr*.45,vec3(d))*.5+smoothstep(rr,rr*.9,vec3(d))*smoothstep(rr*.76,rr*.94,vec3(d))*.5;}
 vec3 lensFlare(){vec2 q=(vUv-sun)*vec2(aspect,1.),axis=sun-.5;float d=length(q),a=atan(q.y,q.x);
  vec3 f=vec3(1.,.84,.62)*(exp(-d*12.)*.3+exp(-d*40.)*.7);
  f+=vec3(1.,.9,.75)*(pow(abs(cos(a*3.)),90.)+pow(abs(cos(a*5.+.4)),140.)*.6)*(.65+.35*sin(a*23.))*exp(-d*6.)*.5;
  f+=ghost(.5-axis*.18,.014)*vec3(1.,.8,.55)*.22+ghost(.5-axis*.42,.032)*vec3(.75,.85,1.)*.12+ghost(.5-axis*.7,.06)*vec3(.55,.9,.7)*.07
   +ghost(.5-axis*1.15,.11)*vec3(.7,.6,1.)*.045+ghost(.5+axis*.38,.022)*vec3(1.,.65,.45)*.1;
  vec3 ring=vec3(d)-vec3(.4,.41,.42);f+=exp(-ring*ring/.0007)*.035;
  return f*texture2D(tVisible,vec2(.5/${LAMPS+1}.,.5)).r;}
 // Lamp glare: a core in the lamp's colour, a long horizontal streak and a faint four-point star, sized in screen-height units.
 vec3 lampGlare(){vec3 g=vec3(0.);
  for(int i=0;i<${LAMPS};i++){vec4 l=lamps[i];if(l.z<=0.)continue;float v=texture2D(tVisible,vec2((float(i)+1.5)/${LAMPS+1}.,.5)).r*l.z;if(v<=0.)continue;
   vec2 q=abs((vUv-l.xy)*vec2(aspect,1.))/l.w;float d=length(q);vec3 tint=lampColors[i],pale=mix(tint,vec3(1.),.4);
   // The body camera's small lens only blooms a little: no streak and no star.
   g+=v*(tint*(exp(-d*10.)*.35+exp(-d*38.)*.6)*(1.-.45*grade)+(pale*exp(-q.y*110.-q.x*4.)*.3+pale*(exp(-q.x*190.-q.y*11.)+exp(-q.y*190.-q.x*11.))*.12)*(1.-grade));}
  return g;}
 void main(){vec4 s=texture2D(tScene,vUv);
  if(view>.5){gl_FragColor=vec4(view<1.5?vec3(texture2D(tAO,vUv).x):view<2.5?texture2D(tBloom,vUv).rgb:view<3.5?vec3(s.a):view<4.5?texture2D(tRays,vUv).rgb*4.:texture2D(tWet,vUv).rgb*3.,1.);return;}vec3 c=clamp(s.rgb,0.,1.)*mix(1.,texture2D(tAO,vUv).x,ao);
  if(air>0.){float d=texture2D(tDepth,vUv).x;vec4 p=projInv*vec4(vec3(vUv,min(d,.99999))*2.-1.,1.);vec3 ray=camRot*(p.xyz/p.w);float reach=min(length(ray),60.);ray=normalize(ray);vec3 fog=vec3(0.);
   // Light scattered by damp air: the exact integral of each lamp's falloff along the view ray.
   for(int i=0;i<6;i++){vec4 l=airPos[i];if(l.w<=0.)continue;vec3 q=camPos-l.xyz;float b=dot(ray,q),s=1./sqrt(max(dot(q,q)-b*b,.02));fog+=airColor[i]*l.w*min(s*(atan((reach+b)*s)-atan(b*s)),7.);}
   float n=texture2D(tNoise,(camPos.xz+ray.xz*min(reach,14.))*.05+cloudOffset*40.).r;c=1.-(1.-c)*(1.-clamp(fog*air*(.55+.9*n),0.,.85));}
  if(clouds+wet+haze>0.){float d=texture2D(tDepth,vUv).x;if(d<1.){vec4 p=projInv*vec4(vec3(vUv,d)*2.-1.,1.);vec3 vp=p.xyz/p.w;float dist=length(vp);vec3 wp=camPos+camRot*vp;
   // cloud shadows: drifting noise on the ground plane dims what is lit (bright pixels) more than what is already in shade
   if(clouds>0.){float n=texture2D(tNoise,wp.xz*.011+cloudOffset).r*.65+texture2D(tNoise,wp.xz*.027-cloudOffset*1.6).r*.35;
    c*=1.-clouds*smoothstep(.48,.68,n)*(1.-smoothstep(35.,70.,dist))*smoothstep(.1,.5,dot(c,vec3(.2126,.7152,.0722)));}
   if(wet>0.){vec4 w=texture2D(tWet,vUv);c*=1.-.3*w.a*wet;c=1.-(1.-c)*(1.-w.rgb*wet);}
   // aerial perspective: past ~12 m colour fades toward the air's own colour
   if(haze>0.)c=mix(c,hazeColor,(1.-exp(-max(dist-12.,0.)*.02))*haze);}}
  c=1.-(1.-c)*(1.-clamp(texture2D(tBloom,vUv).rgb*bloom,0.,1.));
  vec3 lens=vec3(0.);if(sunGate>0.){if(flare>0.)lens+=lensFlare()*flare*sunGate;if(rays>0.)lens+=texture2D(tRays,vUv).rgb*vec3(1.,.86,.62)*rays*sunGate;}if(glare>0.)lens+=lampGlare()*glare;
  c=1.-(1.-c)*(1.-clamp(lens,0.,1.));
  if(exposure>0.)c*=texture2D(tLum,vec2(.5)).g;
  c*=vec3(1.+warmth,1.,1.-warmth);c=max(mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,saturation),0.);
  // Film-like grade: a gentle S-curve for contrast, cool shadows and warm highlights (split toning).
  {float l=dot(c,vec3(.2126,.7152,.0722));vec3 s=c*c*(3.-2.*clamp(c,0.,1.));c=mix(c,s,contrast);
   c+=split*(mix(vec3(-.35,.05,.45),vec3(.5,.18,-.4),smoothstep(.15,.75,l)))*(1.-abs(l*2.-1.)*.5);}
  // Night grade: cool neutral shadows, skin and flame kept warm, a filmic shoulder.
  if(grade>0.){float l=dot(c,vec3(.2126,.7152,.0722));vec3 g=c*mix(vec3(.95,.99,1.04),vec3(1.04,1.,.95),smoothstep(.06,.5,l));g=g*(1.+g*.22)/(1.+g*.30);g=mix(vec3(l),g,.94);c=mix(c,g,grade);}
  vec2 q=vUv-.5;c*=1.-vignette*dot(q,q)*2.;
  gl_FragColor=vec4(clamp(c,0.,1.),s.a);
 }`});

 // Temporal anti-aliasing: the projection is jittered a sub-pixel each frame (Halton 2,3) and the frames accumulate along
 // depth-based reprojection, with history clipped to the current neighbourhood so moving leaves do not ghost. It removes
 // the shimmer of grass and leaf edges. Then sharpening (TAA softens), the grading LUT and a little film grain.
 const taaCurrent=target(),taaHistory=[target(),target()];let taaIndex=0,taaValid=false,taaStill=0;
 const halton=(i,b)=>{let f=1,r=0;while(i>0){f/=b;r+=f*(i%b);i=Math.floor(i/b);}return r;};
 const JITTER=Array.from({length:8},(_,i)=>[halton(i+1,2)-.5,halton(i+1,3)-.5]);
 // prev × inverse(current) is multiplied here in doubles and sent as one matrix: pocket worlds sit hundreds of metres from
 // the origin, where a 32-bit inverse followed by a 32-bit reprojection in the shader turns the history blocky.
 const viewProj=new T.Matrix4(),prevViewProj=new T.Matrix4(),invViewProj=new T.Matrix4(),reproject=new T.Matrix4(),lastCam=new T.Vector3();
 const resolve=raw(`varying vec2 vUv;uniform sampler2D tCur,tHist,tDepth;uniform mat4 reproject;uniform vec2 texel;uniform float feedback;
 vec3 toY(vec3 c){return vec3(dot(c,vec3(.25,.5,.25)),dot(c,vec3(.5,0.,-.5)),dot(c,vec3(-.25,.5,-.25)));}
 vec3 toR(vec3 c){return vec3(c.x+c.y-c.z,c.x+c.z,c.x-c.y-c.z);}
 // Catmull-Rom history sampling (5 taps): bilinear blurs the image a little more every frame the camera moves or sways.
 vec3 catmull(vec2 uv){vec2 size=1./texel,p=uv*size-.5,i=floor(p),f=p-i;vec2 w0=f*(-.5+f*(1.-.5*f)),w1=1.+f*f*(-2.5+1.5*f),w2=f*(.5+f*(2.-1.5*f)),w3=f*f*(-.5+.5*f),w12=w1+w2,t0=(i-.5)*texel,t3=(i+2.5)*texel,t12=(i+.5+w2/w12)*texel;
  vec3 c=texture2D(tHist,vec2(t12.x,t0.y)).rgb*(w12.x*w0.y)+texture2D(tHist,vec2(t0.x,t12.y)).rgb*(w0.x*w12.y)+texture2D(tHist,t12).rgb*(w12.x*w12.y)+texture2D(tHist,vec2(t3.x,t12.y)).rgb*(w3.x*w12.y)+texture2D(tHist,vec2(t12.x,t3.y)).rgb*(w12.x*w3.y);
  return max(c/(w12.x*w0.y+w0.x*w12.y+w12.x*w12.y+w3.x*w12.y+w12.x*w3.y),vec3(0.));}
 void main(){vec3 cur=texture2D(tCur,vUv).rgb,m=vec3(0.),q=vec3(0.);
  float d=1.;vec2 dv=vec2(0.);for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 o=vec2(float(x),float(y))*texel;vec3 c=toY(texture2D(tCur,vUv+o).rgb);m+=c;q+=c*c;float z=texture2D(tDepth,vUv+o).x;if(z<d){d=z;dv=o;}}
  m/=9.;vec3 sd=sqrt(max(q/9.-m*m,0.))*1.25;
  vec4 p=reproject*vec4(vec3(vUv+dv,d)*2.-1.,1.);vec2 uv=p.xy/p.w*.5+.5-dv;
  if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.){gl_FragColor=vec4(cur,1.);return;}
  vec3 h=toY(catmull(uv));vec3 e=h-m;vec3 u=e/max(sd,vec3(1e-4));float k=max(max(abs(u.x),abs(u.y)),abs(u.z));if(k>1.)h=m+e/k;
  float speed=length((uv-vUv)/texel);float keep=feedback*(1.-smoothstep(1.5,24.,speed)*.5);
  gl_FragColor=vec4(mix(toR(toY(cur)),toR(h),keep),1.);}`,{tCur:{value:taaCurrent.texture},tHist:{value:null},tDepth:{value:depth},reproject:{value:reproject},texel:{value:new T.Vector2()},feedback:{value:.9}});
 const LUT_SIZE=24,lutData=new Uint8Array(LUT_SIZE**3*4);{let n=0;const smooth=x=>x*x*(3-2*x);
  for(let b=0;b<LUT_SIZE;b++)for(let g=0;g<LUT_SIZE;g++)for(let r=0;r<LUT_SIZE;r++){const c=[r,g,b].map(v=>v/(LUT_SIZE-1)),l=c[0]*.2126+c[1]*.7152+c[2]*.0722;
   // film look: a gentle S curve, cool lifted shadows, warm highlights and a little more colour
   const out=c.map((v,i)=>{let x=v+(l-v)*-.14;x=x+(smooth(Math.min(1,Math.max(0,x)))-x)*.5;const shadow=(1-l)*(1-l),light=l*l;return x+[-.008,.0,.014][i]*shadow+[.007,.002,-.008][i]*light;});
   for(const v of out)lutData[n++]=Math.round(Math.min(1,Math.max(0,v))*255);lutData[n++]=255;}}
 const lut=new T.Data3DTexture(lutData,LUT_SIZE,LUT_SIZE,LUT_SIZE);lut.format=T.RGBAFormat;lut.minFilter=lut.magFilter=T.LinearFilter;lut.wrapS=lut.wrapT=lut.wrapR=T.ClampToEdgeWrapping;lut.needsUpdate=true;
 // Lens dirt: smudges, a few wiped streaks and specks of dust (a fixed seed, so the same lens every visit). Dark until a
 // light source sits behind it.
 const dirtTex=(()=>{const w=384,h=216,d=new Uint8Array(w*h*4);let seed=7;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296;
  const blob=(x0,y0,r,v,stretch=1,angle=0)=>{const ca=Math.cos(angle),sa=Math.sin(angle),R=Math.ceil(r*Math.max(1,stretch))+1;
   for(let y=Math.max(0,Math.floor(y0-R));y<Math.min(h,y0+R);y++)for(let x=Math.max(0,Math.floor(x0-R));x<Math.min(w,x0+R);x++){const dx=x-x0,dy=y-y0,u=(dx*ca+dy*sa)/stretch,t=-dx*sa+dy*ca,k=1-Math.hypot(u,t)/r;if(k>0){const i=(y*w+x)*4;d[i]=Math.min(255,d[i]+v*k*k*255);}}};
  for(let i=0;i<46;i++)blob(rnd()*w,rnd()*h,6+rnd()*30,.05+rnd()*.16);
  for(let i=0;i<7;i++){const x=rnd()*w,y=rnd()*h,a=rnd()*Math.PI;for(let j=0;j<14;j++)blob(x+Math.cos(a)*j*5,y+Math.sin(a)*j*5+Math.sin(j*.6)*3,4+rnd()*3,.05+rnd()*.05,2.2,a);}
  for(let i=0;i<220;i++)blob(rnd()*w,rnd()*h,.8+rnd()*1.6,.25+rnd()*.5);
  for(let i=0;i<w*h;i++){d[i*4+1]=d[i*4+2]=d[i*4];d[i*4+3]=255;}
  const t=new T.DataTexture(d,w,h);t.minFilter=t.magFilter=T.LinearFilter;t.needsUpdate=true;return t;})();
 const finish=raw(`varying vec2 vUv;uniform sampler2D tSrc;uniform highp sampler3D tLut;uniform sampler2D tLum,tDirt,tVisible;uniform vec2 texel,sun;uniform float sharpen,grain,lutMix,seed,lens,chroma,aspect,sensor,dark,block,blockPx,smear,flash,dip,dirt,shutter,sunGate;uniform vec4 tear,lamps[${LAMPS}];uniform vec3 lampColors[${LAMPS}];
 float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
 vec2 bend(vec2 v){vec2 q=(v-.5)*vec2(aspect,1.);return .5+(v-.5)*(1.-lens*(1.-dot(q,q)/(aspect*aspect*.25+.25)));}
 void main(){vec2 at=vUv;float torn=0.;
  // Struck hard, the camera loses sync for a few frames: the picture rolls and, below a torn line, slides sideways.
  if(tear.x>0.){at.y=at.y-tear.w;torn=step(at.y,tear.y);at.x+=torn*(tear.z+(hash(vec2(floor(at.y*90.),seed))-.5)*.012*tear.x);if(at.y<0.)at.y+=1.;}
  // Rolling shutter: rows read out later see the turn further on, so uprights lean while the lens swings.
  at.x+=shutter*(.5-at.y);
  vec2 q=(at-.5)*vec2(aspect,1.);float r2=dot(q,q)/(aspect*aspect*.25+.25);vec2 uv=.5+(at-.5)*(1.-lens*(1.-r2));vec3 c=texture2D(tSrc,uv).rgb,n=texture2D(tSrc,uv+vec2(0.,texel.y)).rgb,s=texture2D(tSrc,uv-vec2(0.,texel.y)).rgb,e=texture2D(tSrc,uv+vec2(texel.x,0.)).rgb,w=texture2D(tSrc,uv-vec2(texel.x,0.)).rgb;
  if(chroma>0.){vec2 o=(at-.5)*r2*chroma;c.r=texture2D(tSrc,uv+o).r;c.b=texture2D(tSrc,uv-o).b;}
  // contrast-adaptive sharpening: weaker where the neighbourhood is already contrasty, so edges do not ring
  vec3 lo=min(c,min(n,min(s,min(e,w)))),hi=max(c,max(n,max(s,max(e,w))));vec3 amp=sqrt(clamp(min(lo,1.-hi)/max(hi,vec3(1e-3)),0.,1.));
  vec3 wgt=-amp*sharpen*.2;c=clamp((c+(n+s+e+w)*wgt)/(1.+4.*wgt),0.,1.);
  // Video compression at a low bit rate: colour is kept once per block, and flat areas (dark walls, sky) collapse to
  // the block's own level; both grow while the picture moves, when the encoder has least to spend.
  if(block>0.){vec3 cb=texture2D(tSrc,bend((floor(at/(blockPx*texel))+.5)*blockPx*texel)).rgb;float k=block*(.3+.7*smear),lb=dot(cb,vec3(.2126,.7152,.0722)),lc=dot(c,vec3(.2126,.7152,.0722));
   c=mix(c,vec3(lc)+(cb-lb),min(k*.85,1.));c+=(lb-lc)*(1.-smoothstep(.012,.05+.05*smear,abs(lc-lb)))*min(k,1.)*.7;c=clamp(c,0.,1.);}
  // A muzzle flash is brighter than the sensor's range: the frame clips and washes warm, then the exposure, having
  // closed against it, takes a moment to open again.
  if(flash+dip>0.){c=min(c*(1.+flash*1.1)+flash*vec3(.09,.07,.04),1.)*(1.-dip);}
  // Dirt on the glass catches the light of a lamp (or the sun) behind it, in a wide pool round where that light falls.
  if(dirt>0.){vec3 lit=vec3(0.);for(int i=0;i<${LAMPS};i++){vec4 l=lamps[i];if(l.z<=0.)continue;float v=texture2D(tVisible,vec2((float(i)+1.5)/${LAMPS+1}.,.5)).r*l.z;if(v<=0.)continue;
    float d=length((uv-l.xy)*vec2(aspect,1.));lit+=lampColors[i]*v*(exp(-d*5.)*.55+exp(-d*14.)*.9);}
   if(sunGate>0.){float d=length((uv-sun)*vec2(aspect,1.));lit+=vec3(1.,.9,.75)*sunGate*texture2D(tVisible,vec2(.5/${LAMPS+1}.,.5)).r*(exp(-d*3.)*1.2+exp(-d*10.)*1.5);}
   c=1.-(1.-c)*(1.-clamp(lit*texture2D(tDirt,vUv).r*dirt*1.6,0.,1.));}
  // The torn line itself: a thin bright, noisy seam.
  if(tear.x>0.){float seam=exp(-abs(at.y-tear.y)*900.)+exp(-abs(vUv.y-tear.w)*700.)*.6;c=mix(c,vec3(hash(gl_FragCoord.xy+seed)*.7+.2),clamp(seam*tear.x,0.,.8));c*=1.-.08*torn*tear.x;}
  vec3 scale=vec3(${((LUT_SIZE-1)/LUT_SIZE).toFixed(6)}),off=vec3(${(.5/LUT_SIZE).toFixed(6)});c=mix(c,texture(tLut,c*scale+off).rgb,lutMix);
  float l=dot(c,vec3(.2126,.7152,.0722));c+=(hash(gl_FragCoord.xy+seed)-.5)*grain*(1.-l*.7);
  // Sensor noise: gain goes up as the scene gets darker, and the noise with it, in brightness and a little in colour, part of it two pixels wide.
  if(sensor>0.){float dk=dark<0.?1.-smoothstep(.03,.3,texture2D(tLum,vec2(.5)).r):dark;vec2 p=gl_FragCoord.xy+seed*1.7,p2=floor(gl_FragCoord.xy*.5)+seed*2.3;
   float y=(hash(p)-.5)*.65+(hash(p2)-.5)*.35;vec3 cn=vec3(hash(p2+11.),hash(p+23.),hash(p2+37.))-.5;c+=(vec3(y)+cn*.45)*sensor*(.3+1.7*dk)*(1.-l*.55);}
  gl_FragColor=vec4(c,1.);}`,{tSrc:{value:null},tLut:{value:lut},texel:{value:new T.Vector2()},sharpen:{value:0},grain:{value:0},lutMix:{value:1},seed:{value:0},lens:{value:0},chroma:{value:0},aspect:{value:1},tLum:{value:lum[0].texture},sensor:{value:0},dark:{value:.5},block:{value:0},blockPx:{value:8},smear:{value:0},flash:{value:0},dip:{value:0},
  tDirt:{value:dirtTex},dirt:{value:0},tVisible:{value:visible.texture},lamps:{value:composite.uniforms.lamps.value},lampColors:{value:composite.uniforms.lampColors.value},sun:{value:sunUv},sunGate:{value:0},shutter:{value:0},tear:{value:new T.Vector4()}});
 const merge=raw(`varying vec2 vUv;uniform sampler2D tBase,tView,tLum;uniform float gain,vignette,grade,split,saturation,contrast,warmth,shutter;
 // The rolling shutter leans only the world: the weapon turns with the lens, so it reads out the same on every row.
 void main(){vec4 v=texture2D(tView,vUv);vec3 b=texture2D(tBase,vUv+vec2(shutter*(.5-vUv.y),0.)).rgb;if(v.a<=0.&&dot(v.rgb,vec3(1.))<=0.){gl_FragColor=vec4(b,1.);return;}
  float a=clamp(v.a,0.,1.);vec3 c=clamp(v.rgb,0.,1.);if(gain>0.)c*=texture2D(tLum,vec2(.5)).g;c*=vec3(1.+warmth,1.,1.-warmth);
  c=max(mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,saturation),0.);
  // The same film grade as the frame (composite). Premultiplied: light with no cover (a muzzle flash) only adds.
  float l=dot(c,vec3(.2126,.7152,.0722));c=mix(c,c*c*(3.-2.*clamp(c,0.,1.)),contrast*a);c=max(c+a*split*(mix(vec3(-.35,.05,.45),vec3(.5,.18,-.4),smoothstep(.15,.75,l)))*(1.-abs(l*2.-1.)*.5),0.);
  l=dot(c,vec3(.2126,.7152,.0722));vec3 g=c*mix(vec3(.95,.99,1.04),vec3(1.04,1.,.95),smoothstep(.06,.5,l));g=g*(1.+g*.22)/(1.+g*.30);c=mix(c,mix(vec3(l),g,.94),grade);
  vec2 q=vUv-.5;c*=1.-vignette*dot(q,q)*2.;gl_FragColor=vec4(min(b*(1.-a)+c,1.),1.);}`,{tBase:{value:null},tView:{value:null},tLum:{value:lum[0].texture},shutter:{value:0},gain:{value:0},vignette:{value:0},grade:{value:0},split:{value:0},saturation:{value:1},contrast:{value:0},warmth:{value:0}});
 const mergeRT=target();
 function drawOverlay(color){
  const v=overlayTarget(),alpha=renderer.getClearAlpha();renderer.getClearColor(overlayClear);renderer.setRenderTarget(v);renderer.setClearColor(0x000000,0);renderer.clear(true,true,false);
  let drew=false;try{drew=overlayDraw()!==false;}finally{renderer.setClearColor(overlayClear,alpha);}
  if(!drew)return color;overlayShown=true;
  const u=merge.uniforms;u.tBase.value=color;u.tView.value=v.texture;u.tLum.value=composite.uniforms.tLum.value;u.gain.value=composite.uniforms.exposure.value;u.vignette.value=settings.vignette;u.saturation.value=settings.saturation;u.contrast.value=settings.contrast;u.grade.value=settings.grade;u.split.value=settings.split;u.warmth.value=settings.warmth;
  if(mergeRT.width!==size.x||mergeRT.height!==size.y)mergeRT.setSize(size.x,size.y);pass(merge,mergeRT);return mergeRT.texture;
 }
 function resize(){
  renderer.getDrawingBufferSize(size);if(size.equals(last))return;last.copy(size);
  const w=size.x,h=size.y,hw=Math.max(1,w>>1),hh=Math.max(1,h>>1);
  sceneRT.setSize(w,h);taaCurrent.setSize(w,h);taaHistory.forEach(t=>t.setSize(w,h));taaValid=false;resolve.uniforms.texel.value.set(1/w,1/h);finish.uniforms.texel.value.set(1/w,1/h);aoA.setSize(hw,hh);aoB.setSize(hw,hh);
  down.forEach((t,i)=>t.setSize(Math.max(1,w>>(i+1)),Math.max(1,h>>(i+1))));up.forEach((t,i)=>t.setSize(Math.max(1,w>>(i+1)),Math.max(1,h>>(i+1))));
  rayA.setSize(Math.max(1,w>>2),Math.max(1,h>>2));rayB.setSize(Math.max(1,w>>2),Math.max(1,h>>2));
  wetRT.setSize(hw,hh);wetMaterial.uniforms.texel.value.set(1/hw,1/hh);lensRT.setSize(w,h);lensMaterial.uniforms.texel.value.set(1/w,1/h);
  aoMaterial.uniforms.texel.value.set(1/hw,1/hh);
  for(const m of [visibleMaterial,rayMaskMaterial,composite,lensMaterial,finish])m.uniforms.aspect.value=w/h;
 }
 // Screen position (uv) of a world point and its distance along the view axis; 0 when behind the camera.
 function project(world,out){tmp.copy(world).applyMatrix4(camera.matrixWorldInverse);const dist=-tmp.z;if(dist<.1)return 0;tmp.applyMatrix4(camera.projectionMatrix);out.set(tmp.x*.5+.5,tmp.y*.5+.5);return dist;}
 // Per frame: where the sun and the nearest lanterns are on screen, how strongly each should flare, and the disc
 // each is tested over for occlusion. Returns true when any lens effect has something to draw.
 const lampUv=new T.Vector2();
 function updateSources(){
  const sources=visibleMaterial.uniforms.sources.value,lamps=composite.uniforms.lamps.value,colors=composite.uniforms.lampColors.value,projScale=camera.projectionMatrix.elements[5];
  const sky=lights.sky;night=sky?sky.material.uniforms.roadNight.value:1;sunGate=0;
  if(sky&&night<1&&settings.flare+settings.rays>0){
   tmp.copy(SUN).multiplyScalar(160).applyMatrix4(sky.matrixWorld);
   if(project(tmp,sunUv)){const edge=Math.max(Math.abs(sunUv.x-.5),Math.abs(sunUv.y-.5))*2;sunGate=(1-T.MathUtils.smoothstep(night,0,.45))*(1-T.MathUtils.smoothstep(edge,1,1.4));}
  }
  sources[0].set(sunUv.x,sunUv.y,1e8,sunGate>0?Math.tan(SUN_RADIUS)*projScale*.5:0);
  lampList.length=0;const all=settings.glare>0&&night>.05?lights.lamps():null;
  const add=(p,weight,scale,color,radius)=>{const dist=project(p,lampUv);if(!dist||dist>70||weight<=.001||lampUv.x<-.1||lampUv.x>1.1||lampUv.y<-.1||lampUv.y>1.1)return;
   // Nearer lamps flare harder and wider; beyond ~40 m they are only a pin-point.
   lampList.push({x:lampUv.x,y:lampUv.y,dist,weight:weight/(1+dist*dist/500),size:scale*(.55+.6/(1+dist/8)),color,radius});};
  if(all)for(const p of all)add(p,1.6*night,1.3,LANTERN,.12);
  // Flashlights: {position, direction (unit), strength}. Looking down the beam is blinding, off-axis there is none.
  const torches=settings.glare>0?lights.torches():null;
  if(torches)for(const t of torches){toCamera.copy(camera.position).sub(t.position).normalize();
   const facing=T.MathUtils.smoothstep(t.direction.dot(toCamera),.8,.985);add(t.position,(t.strength??1)*facing*(.6+2.4*facing*facing)*(.35+.65*night),1.7,TORCH,.05);}
  lampList.sort((a,b)=>b.weight-a.weight);lampCount=Math.min(LAMPS,lampList.length);
  for(let i=0;i<LAMPS;i++){const l=lampList[i];
   if(i>=lampCount){lamps[i].set(0,0,0,1);sources[i+1].set(0,0,0,0);continue;}
   lamps[i].set(l.x,l.y,l.weight,l.size);colors[i].copy(l.color);
   sources[i+1].set(l.x,l.y,l.dist-l.radius*2.5,l.radius*projScale*.5/l.dist);
  }
  return sunGate>0||lampCount>0;
 }
 // The six lamps that matter most to the air around the viewer; altar({position,color,power}) comes through lights.air.
 function updateAir(){const pos=composite.uniforms.airPos.value,col=composite.uniforms.airColor.value;airNear.length=0;
  for(const p of lights.lamps()||[])airNear.push({p,w:.020,c:LANTERN,d:p.distanceToSquared(camPos)});for(const a of lights.air?.()||[])airNear.push({p:a.position,w:a.power,c:a.color,d:a.position.distanceToSquared(camPos)*.2});
  airNear.sort((a,b)=>a.d-b.d);for(let i=0;i<6;i++){const a=airNear[i];if(!a||a.d>3600){pos[i].w=0;continue;}pos[i].set(a.p.x,a.p.y,a.p.z,a.w*(1-T.MathUtils.smoothstep(a.d,1600,3600)));col[i].copy(a.c);}}
 function render(){
  if(disposed)return;overlayShown=false;
  if(!settings.enabled){renderer.info.autoReset=true;renderer.render(scene,camera);return;}
  resize();
  const previous=renderer.getRenderTarget();renderer.info.autoReset=false;renderer.info.reset(); // stats cover the whole processed frame
  const taa=settings.taa&&composite.uniforms.view.value===0,e=camera.projectionMatrix.elements,baseX=e[8],baseY=e[9];
  if(taa){const j=JITTER[taaIndex%8];e[8]=baseX+j[0]*1.1/size.x;e[9]=baseY+j[1]*1.1/size.y;camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();aoMaterial.uniforms.frameTurn.value=(taaIndex%8)*2.399963;}
  renderer.setRenderTarget(sceneRT);renderer.render(scene,camera);
  if(settings.ao>0){
   const u=aoMaterial.uniforms;u.projInv.value.copy(camera.projectionMatrixInverse);u.projScale.value=camera.projectionMatrix.elements[5];u.radius.value=settings.aoRadius;u.intensity.value=settings.aoIntensity;
   pass(aoMaterial,aoA);
   blurMaterial.uniforms.tAO.value=aoA.texture;blurMaterial.uniforms.dir.value.set(1/aoA.width,0);pass(blurMaterial,aoB);
   blurMaterial.uniforms.tAO.value=aoB.texture;blurMaterial.uniforms.dir.value.set(0,1/aoA.height);pass(blurMaterial,aoA);
  }
  if(settings.bloom>0){
   brightMaterial.uniforms.threshold.value=settings.bloomThreshold-.3*flashNow*settings.flashClip;pass(brightMaterial,down[0]);
   const levels=settings.grade>0?5:3;for(let i=1;i<levels;i++){downMaterial.uniforms.tSrc.value=down[i-1].texture;downMaterial.uniforms.texel.value.set(.5/down[i-1].width,.5/down[i-1].height);pass(downMaterial,down[i]);}
   for(let i=levels-2;i>=0;i--){const src=i===levels-2?down[levels-1]:up[i+1];upMaterial.uniforms.tSrc.value=src.texture;upMaterial.uniforms.tBase.value=down[i].texture;upMaterial.uniforms.texel.value.set(.5/src.width,.5/src.height);pass(upMaterial,up[i]);}
  }
  // Realism passes: eye adaptation / focus (1x1), wet ground (half resolution, at night).
  const now=performance.now(),dt=lastTime?Math.min(.25,(now-lastTime)/1000):1/60;lastTime=now;
  camera.updateMatrixWorld();camRot.setFromMatrix4(camera.matrixWorld);camera.getWorldPosition(camPos);
  cloudOffset.set(now*.0000065,now*.0000025);hazeColor.setRGB(.62,.71,.78).lerp(settings.grade>0?NIGHT_AIR:HAZE_NIGHT,night);
  const wetAmount=settings.wet*T.MathUtils.smoothstep(night,.3,.8);
  if(camPos.distanceTo(prevCamPos)>6)lumValid=false; // a teleport (new world, loading screen) starts adapted, not with a flash
  if(settings.exposure>0||settings.dof>0){
   const u=lumMaterial.uniforms;u.tPrev.value=lum[lumIndex^1].texture;u.projInv.value.copy(camera.projectionMatrixInverse);u.rate.value=1-Math.exp(-dt*.7);u.rateUp.value=1-Math.exp(-dt*settings.exposureUp);u.rateDown.value=1-Math.exp(-dt*settings.exposureDown);u.autoGain.value=settings.exposureAuto;u.key.value=settings.exposureKey;u.lo.value=settings.exposureMin;u.hi.value=settings.exposureMax;u.strength.value=settings.exposure;u.first.value=lumValid?0:1;
   pass(lumMaterial,lum[lumIndex]);composite.uniforms.tLum.value=lensMaterial.uniforms.tLum.value=lum[lumIndex].texture;lumIndex^=1;lumValid=true;
  }else lumValid=false;
  if(wetAmount>0){const u=wetMaterial.uniforms;u.projInv.value.copy(camera.projectionMatrixInverse);u.proj.value.copy(camera.projectionMatrix);pass(wetMaterial,wetRT);}
  if(updateSources()){
   visibleMaterial.uniforms.projInv.value.copy(camera.projectionMatrixInverse);pass(visibleMaterial,visible);
   if(sunGate>0&&settings.rays>0){
    pass(rayMaskMaterial,rayB);
    rayBlurMaterial.uniforms.tSrc.value=rayB.texture;rayBlurMaterial.uniforms.span.value=.9;rayBlurMaterial.uniforms.decay.value=.95;pass(rayBlurMaterial,rayA);
    rayBlurMaterial.uniforms.tSrc.value=rayA.texture;rayBlurMaterial.uniforms.span.value=.9/24;rayBlurMaterial.uniforms.decay.value=1;pass(rayBlurMaterial,rayB);
   }
  }
  const c=composite.uniforms;c.ao.value=settings.ao;c.bloom.value=settings.bloom*(1+1.2*flashNow*settings.flashClip);c.warmth.value=settings.warmth;c.saturation.value=settings.saturation;c.vignette.value=settings.vignette;c.contrast.value=settings.contrast;c.split.value=settings.split;
  c.projInv.value.copy(camera.projectionMatrixInverse);c.exposure.value=lumValid?settings.exposure:0;c.haze.value=settings.haze;c.clouds.value=settings.clouds*(1-night);c.wet.value=wetAmount;
  c.grade.value=settings.grade;c.air.value=settings.air*night;if(settings.air>0)updateAir();
  c.sunGate.value=sunGate;c.flare.value=settings.flare;c.rays.value=settings.rays;c.glare.value=lampCount?settings.glare:0;c.tRays.value=rayB.texture;
  // Raw diagnostic views intentionally bypass the grade; ordinary non-TAA
  // rendering still owns grain, LUT and sharpening in the finish pass.
  if(composite.uniforms.view.value!==0){pass(composite,previous);return;}
  e[8]=baseX;e[9]=baseY;camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  pass(composite,taaCurrent);let color=taaCurrent.texture;
  if(taa){
   camera.getWorldPosition(tmp);const moved=tmp.distanceTo(lastCam);lastCam.copy(tmp);if(moved>6)taaValid=false;taaStill=moved>.0005?0:taaStill+1;
   viewProj.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);invViewProj.copy(viewProj).invert();reproject.multiplyMatrices(prevViewProj,invViewProj);
   const dest=taaHistory[taaIndex&1],hist=taaHistory[(taaIndex&1)^1],r=resolve.uniforms;
   r.tHist.value=hist.texture;r.feedback.value=taaValid?settings.taaFeedback:0;pass(resolve,dest);prevViewProj.copy(viewProj);taaValid=true;color=dest.texture;
  }else taaValid=false;
  // Motion blur from translation only: reproject with the previous camera position but the current orientation.
  moveSpeed=dt>0?tmp.copy(camPos).distanceTo(prevCamPos)/dt:0;
  const blur=settings.motionBlur>0&&moveSpeed>4.5&&moveSpeed<60;
  // Blur from turning (body camera): how far the lens swung since the last frame. A cut (teleport, a new view) is not a turn.
  camera.getWorldQuaternion(camQuat);turnSpeed=prevViewValid&&dt>0?2*Math.acos(Math.min(1,Math.abs(camQuat.dot(prevQuat))))/dt:0;if(turnSpeed>40||moveSpeed>=60)turnSpeed=0;
  // Signed: the turn about the lens's own up axis (to the right is +), eased a little so one uneven frame does not twitch it.
  turnQ.copy(prevQuat).invert().multiply(camQuat);const yawNow=turnSpeed>0?-2*turnQ.y*Math.sign(turnQ.w||1)/dt:0;yawRate+=(yawNow-yawRate)*Math.min(1,dt*18);prevQuat.copy(camQuat);
  turnK+=(T.MathUtils.smoothstep(Math.max(turnSpeed,moveSpeed*.35),.8,3.6)-turnK)*Math.min(1,dt*14);
  // (the shutter stays about 1/60 s however long the frame took, so a slow frame does not smear the whole picture)
  const turnAmount=settings.turnBlur>0?settings.turnBlur*T.MathUtils.smoothstep(turnSpeed,.9,3.2)*Math.min(1.3,.022/Math.max(dt,1e-3)):0,moveAmount=blur?settings.motionBlur*T.MathUtils.smoothstep(moveSpeed,4.5,9):0;
  if(turnAmount>0)moveReproject.multiplyMatrices(camera.projectionMatrix,prevView).multiply(tmpMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).invert());
  else if(blur){moveMatrix.copy(camera.matrixWorld).setPosition(prevCamPos).invert();moveReproject.multiplyMatrices(camera.projectionMatrix,moveMatrix).multiply(tmpMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).invert());}
  prevCamPos.copy(camPos);prevView.copy(camera.matrixWorldInverse);prevViewValid=true;
  if(settings.dof>0||blur||turnAmount>0){const u=lensMaterial.uniforms;u.tSrc.value=color;u.projInv.value.copy(camera.projectionMatrixInverse);u.dof.value=settings.dof;u.motion.value=Math.max(turnAmount,moveAmount);u.reach.value=turnAmount>0?48:32;u.dither.value=turnAmount>0?1:0;pass(lensMaterial,lensRT);color=lensRT.texture;}
  // Rolling shutter (~10 ms top to bottom) only on very fast turns: the shift from top row to bottom row, as a share of the width.
  const shutterK=settings.shutter>=0?settings.shutter:settings.turnBlur>0?1:0,hfov=2*Math.atan(Math.tan(camera.fov*Math.PI/360)/(camera.zoom||1)*camera.aspect);
  const lean=shutterK>0?Math.sign(yawRate)*Math.min(.03,Math.abs(yawRate)*.010/hfov)*T.MathUtils.smoothstep(Math.abs(yawRate),2,5)*shutterK:0;
  finish.uniforms.shutter.value=merge.uniforms.shutter.value=lean;overlayShown=false;
  if(overlayDraw)color=drawOverlay(color);
  const f=finish.uniforms;if(overlayShown)f.shutter.value=0;
  f.dirt.value=(settings.dirt>=0?settings.dirt:settings.sensor>0?1:0)*(lampCount||sunGate>0?1:0);f.sunGate.value=sunGate;
  if(joltFrames>0){joltFrames--;const k=joltK;f.tear.value.set(k,.2+Math.random()*.6,(Math.random()<.5?-1:1)*(.02+Math.random()*.05)*k,(.02+Math.random()*.1)*k);if(!joltFrames)joltK=0;}else f.tear.value.x=0;f.sensor.value=settings.sensor;f.dark.value=lumValid?-1:.5;f.tLum.value=composite.uniforms.tLum.value;f.block.value=settings.block;f.blockPx.value=Math.max(6,Math.round(size.y/110));f.smear.value=turnK;
  f.flash.value=flashNow*settings.flashClip;f.dip.value=flashDip*(1-flashNow)*.24*settings.flashClip;flashNow*=Math.exp(-dt*24);if(flashNow<.01)flashNow=0;flashDip*=Math.exp(-dt*5.5);if(flashDip<.01)flashDip=0;
  f.tSrc.value=color;f.sharpen.value=settings.sharpen;f.grain.value=settings.grain;f.lutMix.value=settings.lut;f.lens.value=settings.lens;f.chroma.value=settings.chroma;f.seed.value=(taaIndex%64)*7.13;pass(finish,previous);
  taaIndex++;
 }
 return {
  render,
  dispose(){
   if(disposed)return;disposed=true;
   for(const resource of [...(viewRT?[viewRT]:[]),mergeRT,merge,sceneRT,aoA,aoB,...down,...up,rayA,rayB,visible,...lum,wetRT,lensRT,noise,dirtTex,lumMaterial,wetMaterial,lensMaterial,taaCurrent,...taaHistory,lut,quad.geometry,aoMaterial,blurMaterial,brightMaterial,downMaterial,upMaterial,visibleMaterial,rayMaskMaterial,rayBlurMaterial,composite,resolve,finish])resource.dispose();
   lights={sky:null,lamps:()=>null,torches:()=>null};lampList.length=0;
  },
  // Still scenes need a few more frames for the temporal filter to converge (reduced-motion idle stops the loop).
  settling:()=>settings.enabled&&settings.taa&&taaStill<16,
  set(next={}){if(['enabled','taa','samples'].some(key=>next[key]!==undefined&&next[key]!==settings[key])){taaValid=false;taaStill=0;}if(next.samples!==undefined&&webgl2&&next.samples!==sceneRT.samples){sceneRT.samples=next.samples;sceneRT.dispose();}Object.assign(settings,next);},
  // sky: garden.js's sky dome (its sun disc and night fade); lamps: () => world positions of lit lanterns, or null;
  // torches: () => [{position, direction, strength}] flashlights, or null.
  setLights(next){lights={...lights,...next};},
  // draw(): renders into the bound target, or returns false. null: nothing in front of the lens.
  setOverlay(draw){if(!draw&&overlayDraw&&viewRT){viewRT.dispose();mergeRT.dispose();}overlayDraw=draw;},get overlays(){return settings.enabled&&composite.uniforms.view.value===0&&!!overlayDraw;},
  // A muzzle flash (0..1) in front of the lens: clips the frame for a few frames where flashClip is set (Beyond Eden).
  flash(strength=1){if(!(settings.flashClip>0))return;flashNow=Math.max(flashNow,Math.min(1,strength));flashDip=Math.max(flashDip,flashNow);},
  // A hard hit on the wearer (0..1): the picture loses sync for 2-4 frames, rolling and tearing sideways (Beyond Eden only, like flash).
  jolt(strength=1){if(!(settings.flashClip>0)||!settings.enabled)return;const k=Math.min(1,Math.max(0,strength));if(k<=0)return;joltFrames=Math.max(joltFrames,2+Math.round(k*2));joltK=Math.max(joltK,k);},
  // The barrel bend the finished picture gets (0 when off): things drawn over it afterwards (shot bloom) bend their own lookups to match.
  bend:()=>settings.enabled&&composite.uniforms.view.value===0?settings.lens:0,
  // The weapon drawn in front of the lens this frame (its alpha is its outline), in unbent coordinates, or null.
  overlayMask:()=>overlayShown&&viewRT?viewRT.texture:null,
  // Development aid: the adapted luminance and the exposure factor as the sensor holds them now (reads one pixel).
  exposureState(){if(!lumValid)return null;const px=new Uint16Array(4);try{renderer.readRenderTargetPixels(lum[lumIndex^1],0,0,1,1,px);}catch{return null;}const h=T.DataUtils.fromHalfFloat;return {adapted:+h(px[0]).toFixed(4),factor:+h(px[1]).toFixed(3),focus:+h(px[2]).toFixed(2)};},
  // How far into night the sky is (0 day, 1 night), as the lens effects last saw it.
  night:()=>night,
  inspect:()=>({...settings,webgl2,size:size.toArray(),moveSpeed:+moveSpeed.toFixed(1),turnSpeed:+turnSpeed.toFixed(2),yawRate:+yawRate.toFixed(2),lean:+merge.uniforms.shutter.value.toFixed(4),jolt:joltFrames,flash:+flashNow.toFixed(2),lens:{sun:sunGate>0?{uv:sunUv.toArray().map(v=>+v.toFixed(3)),gate:+sunGate.toFixed(2)}:null,night:+night.toFixed(2),lamps:lampCount}}),
  // Development aid: average ms per frame for n full renders (GPU-finished).
  bench(n=60){const gl=renderer.getContext();render();gl.finish();const t0=performance.now();for(let i=0;i<n;i++)render();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));return +((performance.now()-t0)/n).toFixed(2);},
  // Development aid: per scene group (and the garden's children), the draw calls and triangles it adds to a frame,
  // measured by hiding it. Counts are exact even in a background tab, where timings are not.
  profile(){
   const count=()=>{render();return [renderer.info.render.calls,renderer.info.render.triangles];},[calls,tris]=count(),rows=[];
   const groups=scene.children.flatMap(o=>o.name==='Garden of Eden'?[o,...o.children]:[o]);
   for(const o of groups){if(!o.visible||(!o.children.length&&!o.isMesh))continue;o.visible=false;const [c,t]=count();o.visible=true;
    if(calls-c||tris-t)rows.push({name:(o.parent===scene?'':'  ')+(o.name||o.type),calls:calls-c,ktris:Math.round((tris-t)/1e3)});}
   return {calls,ktris:Math.round(tris/1e3),rows:rows.sort((a,b)=>b.calls-a.calls)};
  },
  // Development aid: show one buffer full-screen ('ao' | 'bloom' | 'rays' | 'wet') to tune them.
  debug(view){composite.uniforms.view.value=view==='ao'?1:view==='bloom'?2:view==='alpha'?3:view==='rays'?4:view==='wet'?5:0;}
 };
};
