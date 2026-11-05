'use strict';
// Post-processing for the Eden scene: depth-based ambient occlusion (contact shadows where things meet the ground),
// soft bloom on bright highlights and a warm colour grade, all in display space. The scene target is flagged as an
// XR target so three r158 applies tone mapping and sRGB output while rendering into it (it does neither for ordinary
// targets): it then holds exactly what the canvas used to show, including garden.js's sky and water shaders, which
// write display-referred colour directly (clamped here, as the canvas used to clip it: the sky's sun disc is ~3x white).
window.createEdenPost=function(T,renderer,scene,camera,{enabled=true}={}){
 const settings={enabled,ao:.8,aoRadius:.7,aoIntensity:4.5,bloom:.26,bloomThreshold:.9,warmth:.025,saturation:1.06,vignette:.22,flare:.8,rays:.7,glare:.9,contrast:.12,split:.035,taa:true,taaFeedback:.88,sharpen:.6,grain:.028,lut:1};
 const webgl2=true,size=new T.Vector2(),last=new T.Vector2();
 const target=(type=T.HalfFloatType,extra={})=>new T.WebGLRenderTarget(1,1,{type,depthBuffer:false,...extra});
 const depth=new T.DepthTexture(1,1);depth.type=T.UnsignedIntType;
 const sceneRT=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:webgl2?4:0,depthTexture:depth});sceneRT.texture.colorSpace=T.SRGBColorSpace;sceneRT.isXRRenderTarget=true;
 const aoA=target(),aoB=target(),down=[target(),target(),target()],up=[target(),target()],rayA=target(),rayB=target();
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
 // Final pass: AO, bloom (screen blend so highlights never clip), lens effects, warm grade, saturation, vignette.
 const composite=new T.ShaderMaterial({vertexShader,depthTest:false,depthWrite:false,toneMapped:false,
  uniforms:{tScene:{value:sceneRT.texture},tAO:{value:aoA.texture},tBloom:{value:up[0].texture},tRays:{value:rayA.texture},tVisible:{value:visible.texture},ao:{value:0},bloom:{value:0},warmth:{value:0},saturation:{value:1},vignette:{value:0},contrast:{value:0},split:{value:0},view:{value:0},
   sun:{value:sunUv},sunGate:{value:0},flare:{value:0},rays:{value:0},glare:{value:0},aspect:{value:1},lamps:{value:Array.from({length:LAMPS},()=>new T.Vector4())},lampColors:{value:Array.from({length:LAMPS},()=>new T.Color())}},
  fragmentShader:`varying vec2 vUv;uniform sampler2D tScene,tAO,tBloom,tRays,tVisible;uniform float ao,bloom,warmth,saturation,vignette,contrast,split,view,sunGate,flare,rays,glare,aspect;uniform vec2 sun;uniform vec4 lamps[${LAMPS}];uniform vec3 lampColors[${LAMPS}];
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
   g+=v*(tint*(exp(-d*10.)*.35+exp(-d*38.)*.6)+pale*exp(-q.y*110.-q.x*4.)*.3+pale*(exp(-q.x*190.-q.y*11.)+exp(-q.y*190.-q.x*11.))*.12);}
  return g;}
 void main(){vec4 s=texture2D(tScene,vUv);
  if(view>.5){gl_FragColor=vec4(view<1.5?vec3(texture2D(tAO,vUv).x):view<2.5?texture2D(tBloom,vUv).rgb:view<3.5?vec3(s.a):texture2D(tRays,vUv).rgb*4.,1.);return;}vec3 c=clamp(s.rgb,0.,1.)*mix(1.,texture2D(tAO,vUv).x,ao);c=1.-(1.-c)*(1.-clamp(texture2D(tBloom,vUv).rgb*bloom,0.,1.));
  vec3 lens=vec3(0.);if(sunGate>0.){if(flare>0.)lens+=lensFlare()*flare*sunGate;if(rays>0.)lens+=texture2D(tRays,vUv).rgb*vec3(1.,.86,.62)*rays*sunGate;}if(glare>0.)lens+=lampGlare()*glare;
  c=1.-(1.-c)*(1.-clamp(lens,0.,1.));
  c*=vec3(1.+warmth,1.,1.-warmth);c=max(mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,saturation),0.);
  // Film-like grade: a gentle S-curve for contrast, cool shadows and warm highlights (split toning).
  {float l=dot(c,vec3(.2126,.7152,.0722));vec3 s=c*c*(3.-2.*clamp(c,0.,1.));c=mix(c,s,contrast);
   c+=split*(mix(vec3(-.35,.05,.45),vec3(.5,.18,-.4),smoothstep(.15,.75,l)))*(1.-abs(l*2.-1.)*.5);}
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
 const finish=raw(`varying vec2 vUv;uniform sampler2D tSrc;uniform highp sampler3D tLut;uniform vec2 texel;uniform float sharpen,grain,lutMix,seed;
 float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
 void main(){vec3 c=texture2D(tSrc,vUv).rgb,n=texture2D(tSrc,vUv+vec2(0.,texel.y)).rgb,s=texture2D(tSrc,vUv-vec2(0.,texel.y)).rgb,e=texture2D(tSrc,vUv+vec2(texel.x,0.)).rgb,w=texture2D(tSrc,vUv-vec2(texel.x,0.)).rgb;
  // contrast-adaptive sharpening: weaker where the neighbourhood is already contrasty, so edges do not ring
  vec3 lo=min(c,min(n,min(s,min(e,w)))),hi=max(c,max(n,max(s,max(e,w))));vec3 amp=sqrt(clamp(min(lo,1.-hi)/max(hi,vec3(1e-3)),0.,1.));
  vec3 wgt=-amp*sharpen*.2;c=clamp((c+(n+s+e+w)*wgt)/(1.+4.*wgt),0.,1.);
  vec3 scale=vec3(${((LUT_SIZE-1)/LUT_SIZE).toFixed(6)}),off=vec3(${(.5/LUT_SIZE).toFixed(6)});c=mix(c,texture(tLut,c*scale+off).rgb,lutMix);
  float l=dot(c,vec3(.2126,.7152,.0722));c+=(hash(gl_FragCoord.xy+seed)-.5)*grain*(1.-l*.7);
  gl_FragColor=vec4(c,1.);}`,{tSrc:{value:null},tLut:{value:lut},texel:{value:new T.Vector2()},sharpen:{value:0},grain:{value:0},lutMix:{value:1},seed:{value:0}});
 function resize(){
  renderer.getDrawingBufferSize(size);if(size.equals(last))return;last.copy(size);
  const w=size.x,h=size.y,hw=Math.max(1,w>>1),hh=Math.max(1,h>>1);
  sceneRT.setSize(w,h);taaCurrent.setSize(w,h);taaHistory.forEach(t=>t.setSize(w,h));taaValid=false;resolve.uniforms.texel.value.set(1/w,1/h);finish.uniforms.texel.value.set(1/w,1/h);aoA.setSize(hw,hh);aoB.setSize(hw,hh);
  down.forEach((t,i)=>t.setSize(Math.max(1,w>>(i+1)),Math.max(1,h>>(i+1))));up[0].setSize(hw,hh);up[1].setSize(Math.max(1,w>>2),Math.max(1,h>>2));
  rayA.setSize(Math.max(1,w>>2),Math.max(1,h>>2));rayB.setSize(Math.max(1,w>>2),Math.max(1,h>>2));
  aoMaterial.uniforms.texel.value.set(1/hw,1/hh);
  for(const m of [visibleMaterial,rayMaskMaterial,composite])m.uniforms.aspect.value=w/h;
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
 function render(){
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
   brightMaterial.uniforms.threshold.value=settings.bloomThreshold;pass(brightMaterial,down[0]);
   for(let i=1;i<3;i++){downMaterial.uniforms.tSrc.value=down[i-1].texture;downMaterial.uniforms.texel.value.set(.5/down[i-1].width,.5/down[i-1].height);pass(downMaterial,down[i]);}
   for(let i=1;i>=0;i--){const src=i===1?down[2]:up[1];upMaterial.uniforms.tSrc.value=src.texture;upMaterial.uniforms.tBase.value=down[i].texture;upMaterial.uniforms.texel.value.set(.5/src.width,.5/src.height);pass(upMaterial,up[i]);}
  }
  if(updateSources()){
   visibleMaterial.uniforms.projInv.value.copy(camera.projectionMatrixInverse);pass(visibleMaterial,visible);
   if(sunGate>0&&settings.rays>0){
    pass(rayMaskMaterial,rayB);
    rayBlurMaterial.uniforms.tSrc.value=rayB.texture;rayBlurMaterial.uniforms.span.value=.9;rayBlurMaterial.uniforms.decay.value=.95;pass(rayBlurMaterial,rayA);
    rayBlurMaterial.uniforms.tSrc.value=rayA.texture;rayBlurMaterial.uniforms.span.value=.9/24;rayBlurMaterial.uniforms.decay.value=1;pass(rayBlurMaterial,rayB);
   }
  }
  const c=composite.uniforms;c.ao.value=settings.ao;c.bloom.value=settings.bloom;c.warmth.value=settings.warmth;c.saturation.value=settings.saturation;c.vignette.value=settings.vignette;c.contrast.value=settings.contrast;c.split.value=settings.split;
  c.sunGate.value=sunGate;c.flare.value=settings.flare;c.rays.value=settings.rays;c.glare.value=lampCount?settings.glare:0;c.tRays.value=rayB.texture;
  if(!taa){pass(composite,previous);return;}
  e[8]=baseX;e[9]=baseY;camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  pass(composite,taaCurrent);
  camera.getWorldPosition(tmp);const moved=tmp.distanceTo(lastCam);lastCam.copy(tmp);if(moved>6)taaValid=false;taaStill=moved>.0005?0:taaStill+1;
  viewProj.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);invViewProj.copy(viewProj).invert();reproject.multiplyMatrices(prevViewProj,invViewProj);
  const dest=taaHistory[taaIndex&1],hist=taaHistory[(taaIndex&1)^1],r=resolve.uniforms;
  r.tHist.value=hist.texture;r.feedback.value=taaValid?settings.taaFeedback:0;pass(resolve,dest);prevViewProj.copy(viewProj);taaValid=true;
  const f=finish.uniforms;f.tSrc.value=dest.texture;f.sharpen.value=settings.sharpen;f.grain.value=settings.grain;f.lutMix.value=settings.lut;f.seed.value=(taaIndex%64)*7.13;pass(finish,previous);
  taaIndex++;
 }
 return {
  render,
  // Still scenes need a few more frames for the temporal filter to converge (reduced-motion idle stops the loop).
  settling:()=>settings.enabled&&settings.taa&&taaStill<16,
  set(next={}){if(next.samples!==undefined&&webgl2&&next.samples!==sceneRT.samples){sceneRT.samples=next.samples;sceneRT.dispose();}Object.assign(settings,next);},
  // sky: garden.js's sky dome (its sun disc and night fade); lamps: () => world positions of lit lanterns, or null;
  // torches: () => [{position, direction, strength}] flashlights, or null.
  setLights(next){lights={...lights,...next};},
  inspect:()=>({...settings,webgl2,size:size.toArray(),lens:{sun:sunGate>0?{uv:sunUv.toArray().map(v=>+v.toFixed(3)),gate:+sunGate.toFixed(2)}:null,night:+night.toFixed(2),lamps:lampCount}}),
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
  // Development aid: show one buffer full-screen ('ao' | 'bloom' | 'rays') to tune them.
  debug(view){composite.uniforms.view.value=view==='ao'?1:view==='bloom'?2:view==='alpha'?3:view==='rays'?4:0;}
 };
};
