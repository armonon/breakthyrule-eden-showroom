'use strict';
// Beyond Eden as a program. One shared kit, window.edenMatrix, used by the night road, the district and the match:
//  sky(T)          the night sky: rain of binary (it really spells scripture in ASCII), Hebrew and Greek letters, with
//                  lines of a God-centred program typing themselves between the columns
//  surface(T,root) photographic stone detail, grime, damp and faint running code on walls; scanned paving on the ground
//  form(T,object)  a model crystallises out of glyphs instead of popping in
//  altar(T,...)    the altar and the cross at the centre of the Commons
// Desktop gets all of it; phones keep the sky, the altar and the forming effect without per-pixel stone detail.
(function(root){
 const GREEN='vec3(.16,1.,.42)';
 const time={value:0},strength={value:0},kit={value:null},program={value:null},stoneMap={value:null},stoneNormal={value:null},paveMap={value:null},paveNormal={value:null},cobbleMap={value:null},cobbleNormal={value:null};
 const phone=()=>!!root.edenRenderProfile?.().mobile,still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 // What the binary says, eight bits to a letter, top to bottom down each column.
 const VERSES='IN THE BEGINNING WAS THE WORD · I AM THE ALPHA AND THE OMEGA · THE LIGHT SHINES IN THE DARKNESS AND THE DARKNESS HAS NOT OVERCOME IT · JESUS IS LORD · BE STILL AND KNOW THAT I AM GOD · '.replace(/·/g,'+');
 const LINES=['// Genesis 1:3','let there = new Light();','if (darkness) { light.shines(); }  // John 1:5','const WORD = "in the beginning";','while (true) { grace.abound(); }','class Man extends Dust { breath = God }','import { mercy } from "everlasting";','death.sting = null;  // 1 Cor 15:55','return to(Me);  // Joel 2:12','await resurrection(3, "days");','function forgive(debt) { return 0; }','I_AM === I_AM;  // Exodus 3:14','try { self } catch { Father.run(to) }','veil.tear("top", "bottom");','for (const sheep of lost) seek(sheep);','assert(God.is(Love));  // 1 John 4:8','stone.rollAway();','export default Kingdom;  // without end','sin.length = 0;','new Heaven(); new Earth();  // Rev 21'];
 function build(T){
  if(kit.value)return;
  // Glyph atlas, 8x8 cells: 0 and 1 first, then Hebrew, Greek, operators and crosses.
  const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d'),glyphs=['0','1',...'אבגדהוזחטיכלמנסעפצקרשת','Α','Ω','Χ','Ρ','Θ','Σ','Ι','Η','Λ','Φ','{','}','(',')','=','>','/','*','+','✝','☧','†','7','3','Ψ','Δ','Π','Ξ','<',';','#','&','%','!','?',':','~','^','|','_'];
  g.fillStyle='#000';g.fillRect(0,0,512,512);g.fillStyle='#fff';g.font='600 46px "SF Mono",Menlo,Consolas,"Noto Sans Hebrew",monospace';g.textAlign='center';g.textBaseline='middle';
  for(let i=0;i<64;i++)g.fillText(glyphs[i%glyphs.length],(i%8)*64+32,(i>>3)*64+34);
  // The program, one line per 32 px row.
  const p=document.createElement('canvas');p.width=1024;p.height=LINES.length*48;const h=p.getContext('2d');h.fillStyle='#000';h.fillRect(0,0,p.width,p.height);h.fillStyle='#fff';h.font='500 34px "SF Mono",Menlo,Consolas,monospace';h.textBaseline='middle';LINES.forEach((l,i)=>h.fillText(l,6,i*48+25,1010));
  program.value=new T.CanvasTexture(p);program.value.flipY=false;program.value.anisotropy=4;
  // One 512 px texture for everything, because a lit material here already uses most of the GPU's 16: r glyphs,
  // g broad tileable noise, b fine tileable noise, a the bits of the verses (read with texelFetch, 1024 of them).
  const N=512,data=new Uint8Array(g.getImageData(0,0,N,N).data.buffer.slice(0));let seed=77;const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296),fade=t=>t*t*(3-2*t);
  const layer=n=>{const l=Float32Array.from({length:n*n},rnd);return(x,y)=>{const fx=x/N*n,fy=y/N*n,ix=Math.floor(fx),iy=Math.floor(fy),tx=fade(fx-ix),ty=fade(fy-iy),at=(i,j)=>l[(j%n)*n+i%n];return(at(ix,iy)*(1-tx)+at(ix+1,iy)*tx)*(1-ty)+(at(ix,iy+1)*(1-tx)+at(ix+1,iy+1)*tx)*ty;};};
  const a=layer(4),b=layer(8),d=layer(16),e=layer(32),f=layer(64),m=layer(160);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const k=(y*N+x)*4;data[k+1]=255*(a(x,y)*.45+b(x,y)*.3+d(x,y)*.25);data[k+2]=255*(d(x,y)*.36+e(x,y)*.3+f(x,y)*.2+m(x,y)*.14);data[k+3]=0;}
  for(let i=0;i<1024;i++){const ch=VERSES.charCodeAt((i>>3)%VERSES.length);data[i*4+3]=((ch>>(7-(i&7)))&1)*255;}
  kit.value=new T.DataTexture(data,N,N);kit.value.wrapS=kit.value.wrapT=T.RepeatWrapping;kit.value.magFilter=T.LinearFilter;kit.value.minFilter=T.LinearMipmapLinearFilter;kit.value.generateMipmaps=true;kit.value.anisotropy=4;kit.value.needsUpdate=true;
  if(phone())return;
  const L=new T.TextureLoader(),load=(u,srgb)=>{const t=L.load(u);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;if(srgb)t.colorSpace=T.SRGBColorSpace;return t;};
  stoneMap.value=load('/assets/castle/wall.webp?v=1',true);stoneNormal.value=load('/assets/castle/wall-nor.webp?v=1');
  paveMap.value=load('/assets/eden-textures/monastery_stone_floor_diff.jpg',true);paveNormal.value=load('/assets/eden-textures/monastery_stone_floor_nor.jpg');
  cobbleMap.value=load('/assets/castle/cobble.webp?v=1',true);cobbleNormal.value=load('/assets/castle/cobble-nor.webp?v=1');
 }
 const HASH='\nfloat mxHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}\n';

 // ---- the sky
 function sky(T){
  build(T);
  const uniforms={time,strength,kit,program};
  const dome=new T.Mesh(new T.SphereGeometry(146,64,40),new T.ShaderMaterial({side:T.BackSide,transparent:true,depthWrite:false,fog:false,toneMapped:false,uniforms,
   vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:`varying vec3 vDir;uniform float time,strength;uniform highp sampler2D kit,program;${HASH}
   float bit(float n){int i=int(mod(n,1024.));return texelFetch(kit,ivec2(i%512,i/512),0).a;}
   const float PI=3.14159265;
   float glyph(vec2 cell,vec2 f,float id){f=clamp(f,.06,.94);vec2 c=vec2(mod(id,8.),floor(id/8.));return textureGrad(kit,(c+f)/8.,dFdx(cell)/8.,dFdy(cell)/8.).r;}
   // One curtain of rain: n columns around the horizon, heads falling at their own speeds, tails fading behind them.
   vec3 rain(float az,float el,float n,float speed,float keep,float seedy){
    vec2 p=vec2(az*n,el*n*.62);vec2 cell=floor(p),f=fract(p);float col=mod(cell.x,n),h=mxHash(vec2(col,seedy));if(h>keep)return vec3(0.);
    float len=22.+30.*mxHash(vec2(col,seedy+3.)),v=speed*(.45+.9*mxHash(vec2(col,seedy+7.)));
    float d=mod(cell.y+time*v+h*191.,len+14.),tail=d<len?exp(-d*.16):0.;if(d<0.||tail<.004)return vec3(0.);
    // Six columns in ten are the binary of the verses; the others are letters that slowly change.
    float id;float kind=mxHash(vec2(col,seedy+11.));
    if(kind<.6)id=step(.5,bit(-cell.y+col*88.));
    else id=2.+floor(mxHash(vec2(col*7.+floor(time*(.4+h)+cell.y*.13),cell.y))*61.);
    float g=glyph(p,vec2(f.x,1.-f.y),id),head=exp(-d*1.4);
    return mix(${GREEN}*.75,vec3(.78,1.,.86)*1.25,head)*g*tail;}
   void main(){vec3 d=normalize(vDir);float el=asin(clamp(d.y,-1.,1.))/(PI*.5),az=atan(d.x,-d.z)/(2.*PI)+.5;
    float up=max(d.y,0.),cloud=texture2D(kit,d.xz/(up+.28)*.085+time*.0011).g,wisps=texture2D(kit,d.xz/(up+.2)*.21-time*.0017).b;
    vec3 c=mix(vec3(.010,.034,.024),vec3(.0015,.006,.006),pow(up,.42));
    c+=vec3(.018,.09,.05)*exp(-up*7.)*(.5+.5*texture2D(kit,vec2(az*3.,.3)).g);
    float veil=smoothstep(.42,.75,cloud*.7+wisps*.3);c+=vec3(.008,.03,.021)*veil;
    // A soft break in the clouds above the altar's end of the sky: the light the program is about.
    float glory=pow(max(dot(d,normalize(vec3(.0,.82,-.57))),0.),14.);c+=vec3(.10,.085,.045)*glory*(.6+.4*wisps);
    float fade=smoothstep(-.02,.06,el)*(1.-smoothstep(.62,.86,el));
    if(fade>0.){vec3 r=rain(az,el,170.,5.5,.72,1.)+rain(az+.0013,el,340.,7.,.8,5.)*.55+rain(az+.004,el,74.,3.4,.26,9.)*.6;
     // the program: lines written left to right on panels of the sky, read and then erased
     vec2 q=vec2(az*9.,(el-.10)*17.);vec2 panel=floor(q),pf=fract(q);float ph=mxHash(panel+31.),t=time*.07+ph*9.,cyc=floor(t),tt=fract(t);
     if(panel.y>=0.&&panel.y<9.&&mxHash(panel+cyc*17.)>.72){vec2 w=vec2((pf.x-.06)/.88,(pf.y-.3)/.4);if(w.x>0.&&w.x<1.&&w.y>0.&&w.y<1.){float line=floor(mxHash(panel+cyc*5.)*${LINES.length}.);
      float typed=smoothstep(0.,.35,tt),gone=smoothstep(.85,1.,tt);float lit=step(w.x,typed)*(1.-gone);
      float s=textureGrad(program,vec2(w.x,(line+1.-w.y)/${LINES.length}.),dFdx(q)*vec2(1.13,0.),dFdy(q)*vec2(0.,2.5/${LINES.length}.)).r;
      r*=1.-.85*step(w.x,typed)*(1.-gone)*.7;r+=mix(vec3(.45,1.,.62),vec3(1.,.9,.6),step(.8,ph))*s*lit*.85;
      r+=vec3(.6,1.,.75)*step(abs(w.x-typed),.006)*(1.-gone)*step(typed,.995);}}
     c+=r*fade*(1.-.45*veil);}
    // stars where the rain thins out overhead
    vec2 sp=d.xz/(up+.15)*38.;vec2 sc=floor(sp);float st=mxHash(sc);c+=vec3(.6,.9,.75)*step(.985,st)*smoothstep(.22,.0,length(fract(sp)-.5))*smoothstep(.45,.8,up)*(.5+.5*sin(time*2.+st*90.));
    gl_FragColor=vec4(c,strength);}`}));
  dome.name='Matrix sky';dome.frustumCulled=false;dome.renderOrder=-5;dome.visible=false;dome.raycast=()=>{};
  return dome;
 }
 function update(seconds,amount){time.value=still()?20+seconds*.08:seconds;strength.value=amount;tick();}

 // ---- materials: forming + stone detail
 const patched=new WeakMap();
 // kind: 'model' (own textures: detail, grime, damp, running code), 'stone' (procedural walls: scanned stone projected in
 // world space), 'ground' (paving near the Commons and the road, wet cobble and earth elsewhere), 'form' (forming only).
 function patch(T,material,kind='form',wash=false){
  if(!material?.isMeshStandardMaterial)return null;const had=patched.get(material);if(had)return had;build(T);
  if(phone())kind=kind==='ground'?'ground0':'form';
  const form={value:new T.Vector4(1,0,1,0)},own=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
  patched.set(material,form);
  if(kind==='ground0')return form;
  const lean=kind==='model'&&!!(material.aoMap||material.lightMap||material.emissiveMap);
  material.onBeforeCompile=(sh,r)=>{own.call(material,sh,r);
   Object.assign(sh.uniforms,{mxForm:form,mxTime:time,mxOn:strength,mxKit:kit});
   if(kind!=='form')Object.assign(sh.uniforms,kind==='ground'?{mxMapA:paveMap,mxNorA:paveNormal,mxMapB:cobbleMap,mxNorB:cobbleNormal}:kind==='stone'?{mxMapA:stoneMap,mxNorA:stoneNormal}:lean?{}:{mxNorA:stoneNormal});
   sh.vertexShader='varying vec3 vMx;uniform vec4 mxForm;\n'+sh.vertexShader.replace('#include <project_vertex>',`
    if(mxForm.x<1.){float mxS=max(length(modelMatrix[0].xyz),.0001)*mix(9.,2.2,(1.-mxForm.x)*(1.-mxForm.x)),mxK=(1.-mxForm.x)*(1.-mxForm.x);transformed=mix(transformed,floor(transformed*mxS+.5)/mxS,mxK);}
    #include <project_vertex>
    {vec4 mxW=vec4(transformed,1.);
    #ifdef USE_BATCHING
     mxW=batchingMatrix*mxW;
    #endif
    #ifdef USE_INSTANCING
     mxW=instanceMatrix*mxW;
    #endif
    vMx=(modelMatrix*mxW).xyz;}`);
   let head=`varying vec3 vMx;uniform vec4 mxForm;uniform float mxTime,mxOn;uniform highp sampler2D mxKit;float mxGlow=0.;\nfloat mxBit(float n){int i=int(mod(n,1024.));return texelFetch(mxKit,ivec2(i%512,i/512),0).a;}\n`;
   if(kind!=='form')head+=`${kind==='model'?'':'uniform sampler2D mxMapA;'}${lean?'':'uniform sampler2D mxNorA;'}${kind==='ground'?'uniform sampler2D mxMapB,mxNorB;':''}vec3 mxWn=vec3(0.,1.,0.);vec2 mxUv=vec2(0.);float mxDamp=0.,mxNear=0.,mxPave=0.;\n`;
   let f=sh.fragmentShader;
   f=head+HASH+f.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
    if(mxForm.x<1.){float mxH=clamp((vMx.y-mxForm.y)/mxForm.z,0.,1.);vec3 mxC=floor(vMx*4.5);float mxN=mxHash(mxC.xz+mxC.y*17.3);float mxK=(mxForm.x*1.55-mxH*.5-mxN*.45)/.2;if(mxK<=0.)discard;mxGlow=1.-clamp((mxK-.2)*.5,0.,1.);}`);
   f=f.replace('#include <map_fragment>',`#include <map_fragment>
    diffuseColor.rgb*=1.-mxGlow*.9;`+(kind==='form'?'':`
    {vec3 mxD=vMx-cameraPosition;mxNear=1.-smoothstep(14.,42.,length(mxD));mxWn=normalize(cross(dFdx(vMx),dFdy(vMx)));vec3 mxA=abs(mxWn);
    mxUv=mxA.y>max(mxA.x,mxA.z)?vMx.xz:(mxA.x>mxA.z?vMx.zy:vMx.xy);
    float mxBroad=texture2D(mxKit,mxUv*.023).g,mxFine=texture2D(mxKit,mxUv*.19).b;`+(kind==='ground'?`
    float mxPlaza=max(1.-smoothstep(8.2,9.8,length(vMx.xz-vec2(12.,-62.))+mxBroad*2.-1.),(1.-smoothstep(1.8,3.4,abs(vMx.z+63.5)+mxFine*1.6-.8))*(1.-smoothstep(26.,32.,abs(vMx.x-12.)))),mxRoad=1.-smoothstep(2.6,4.4,abs(vMx.x-11.7)+mxFine*2.-1.);
    mxPave=max(mxPlaza,mxRoad)*step(vMx.z,-20.);float mxEarth=smoothstep(.50,.62,mxBroad+.12*(mxFine-.5));
    vec3 mxG=diffuseColor.rgb*vec3(.50,.62,.40)*(.55+.7*mxFine),mxCob=texture2D(mxMapB,vMx.xz*.36).rgb*vec3(.52,.55,.5),mxPav=texture2D(mxMapA,vMx.xz*.27).rgb*vec3(.62,.63,.60);
    float mxMoss=smoothstep(.45,.6,mxFine)*smoothstep(.4,.6,mxBroad);
    diffuseColor.rgb=mix(mix(mxG,mxCob*.8,mxEarth*.85),mix(mxPav,mxG*.9,mxMoss*.35),mxPave);mxDamp=smoothstep(.45,.62,mxBroad)*(.45+.55*mxPave);mxPave=max(mxPave,mxEarth*.8);
    diffuseColor.rgb*=1.-.45*mxDamp;`:`
    ${kind==='stone'?`vec3 mxStone=texture2D(mxMapA,mxUv*.42).rgb;diffuseColor.rgb=diffuseColor.rgb*mix(.55,1.1,mxBroad)*mxStone*1.75;`:`diffuseColor.rgb*=mix(1.,.55+.95*texture2D(mxKit,mxUv*1.7).b,.6*mxNear);`}
    // Rain streaks down the walls, soot under ledges, damp and moss near the ground, broad tone changes that break the tiling.
    float mxWall=1.-smoothstep(.4,.75,mxA.y),mxStreak=texture2D(mxKit,vec2(mxUv.x*.17,mxUv.y*.035)).b;
    diffuseColor.rgb*=1.-mxWall*.42*smoothstep(.5,.72,mxStreak)*smoothstep(.35,.6,mxBroad);diffuseColor.rgb*=.78+.44*mxBroad;
    mxDamp=exp(-max(vMx.y,0.)*1.1)*(.4+.6*mxFine)*mxWall+(1.-mxWall)*step(.5,mxWn.y)*smoothstep(.45,.65,mxBroad);
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.45,.56,.40),clamp(mxDamp,0.,1.)*.75);`)+`}`));
   if(kind!=='form'){
    f=f.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    roughnessFactor=clamp(mix(roughnessFactor,.3,clamp(mxDamp,0.,1.)*${kind==='ground'?'(.12+.5*mxPave)':'.62'}),.14,1.);`);
    // Detail normals in world space on the dominant plane.
    if(!lean)f=f.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    {vec3 mxA=abs(mxWn);vec2 mxB=(texture2D(mxNorA,mxUv*${kind==='stone'?'.42':kind==='ground'?'.27':'.9'}).xy*2.-1.)*${kind==='model'?'.35*mxNear':'.9'};${kind==='ground'?`mxB=mix((texture2D(mxNorB,vMx.xz*.36).xy*2.-1.),mxB,step(.5,mxPave))*mix(.25,1.,mxPave);mxB*=1.-.6*mxDamp;`:''}
     vec3 mxT=mxA.y>max(mxA.x,mxA.z)?vec3(mxB.x,0.,mxB.y):(mxA.x>mxA.z?vec3(0.,mxB.y,mxB.x):vec3(mxB.x,mxB.y,0.));normal=normalize(normal+(viewMatrix*vec4(mxT,0.)).xyz);}`);
   }
   f=f.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
    if(mxGlow>0.){vec3 mxFn=abs(normalize(cross(dFdx(vMx),dFdy(vMx))));vec2 mxP=(mxFn.x>mxFn.z?vMx.zy:vMx.xy)*7.;if(mxFn.y>.7)mxP=vMx.xz*7.;vec2 mxCell=floor(mxP),mxF=clamp(fract(mxP),.08,.92);float mxId=floor(mxHash(mxCell+floor(mxTime*9.))*64.);
     float mxG=texture2D(mxKit,(vec2(mod(mxId,8.),floor(mxId/8.))+vec2(mxF.x,1.-mxF.y))/8.).r;vec2 mxEdge=abs(fract(mxP*.5)-.5);
     totalEmissiveRadiance+=${GREEN}*mxGlow*(mxG*.62+.018+smoothstep(.44,.5,max(mxEdge.x,mxEdge.y))*.16+pow(mxGlow,8.)*.25);}`+(kind==='model'||kind==='stone'?`
    ${wash?`{ // Architectural uplights: pools of warm light climbing the walls between the piers, cool moonlight on what faces up.
     float mxPool=.35+.65*pow(.5+.5*cos(mxUv.x*1.05),3.);totalEmissiveRadiance+=diffuseColor.rgb*mxOn*(vec3(1.,.62,.30)*(1.-abs(mxWn.y))*mxPool*(exp(-max(vMx.y,0.)*.42)*.5+exp(-max(vMx.y,0.)*.16)*.13)+vec3(.16,.30,.27)*max(mxWn.y,0.)*.16+vec3(.03,.06,.048));}`:''}
    {float mxWall=1.-smoothstep(.3,.5,abs(mxWn.y));if(mxWall*mxOn>0.){vec2 mxP=vec2(mxUv.x*3.6,vMx.y*3.6),mxCell=floor(mxP);float mxCh=mxHash(vec2(mxCell.x,11.));
     // A column here and there down a wall still shows the program running.
     if(mxCh>.972){float mxLen=26.,mxDrop=mod(mxCell.y+mxTime*(2.+mxCh*3.)*1.6+mxCh*997.,90.),mxTail=mxDrop<mxLen?exp(-mxDrop*.15):0.;
      if(mxTail>.01){float mxId=step(.5,mxBit(-mxCell.y+mxCell.x*64.));vec2 mxF=clamp(fract(mxP),.08,.92);float mxG=texture2D(mxKit,(vec2(mxId,0.)+vec2(mxF.x,1.-mxF.y))/8.).r;totalEmissiveRadiance+=${GREEN}*mxG*mxTail*.5*mxOn;}}}}`:''));
   sh.fragmentShader=f;};
  material.customProgramCacheKey=()=>key()+'|mx7'+kind+lean+wash+(own&&own!==T.Material.prototype.onBeforeCompile?String(own).length:'');
  material.needsUpdate=true;return form;
 }
 function surface(T,object,{kind='model',skip=null,wash=false}={}){
  if(!object)return;object.traverse(o=>{if(!o.isMesh||o.isSkinnedMesh||skip?.(o))return;for(const m of [].concat(o.material||[])){if(!m?.isMeshStandardMaterial||m.transparent||m.alphaTest>0)continue;
   const glows=m.emissive&&m.emissiveIntensity>.5&&!m.emissiveMap&&m.emissive.getHex();patch(T,m,glows||(m.metalness>.5&&!m.metalnessMap)?'form':kind==='auto'?(m.normalMap||m.map&&m.map.image?.width>300?'model':'stone'):kind,wash);
   if(m.map&&!phone())m.map.anisotropy=Math.max(m.map.anisotropy,8);}});
 }

 // ---- forming: models crystallise out of a cloud of glyphs
 const forming=[],up=[];let pointMaterial=null;
 function points(T,object,parent){
  pointMaterial??=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,uniforms:{kit,time,k:{value:0},px:{value:1}},
   vertexShader:`attribute vec3 rnd;uniform float time,k,px;varying float vA,vId;void main(){float t=clamp((k*1.5-rnd.x*.5),0.,1.),e=1.-pow(1.-t,3.);vec3 away=vec3(cos(rnd.y*6.283),1.2+rnd.z*2.2,sin(rnd.y*6.283))*(1.-e)*(.5+rnd.z*1.6);vec3 p=position+away;
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(px*(46.+40.*rnd.x)/max(-mv.z,.4),2.,30.);vA=smoothstep(0.,.12,t)*(1.-smoothstep(.72,1.,k));vId=floor(mod(rnd.y*64.+floor(time*(5.+rnd.x*9.)),64.));}`,
   fragmentShader:`uniform sampler2D kit;varying float vA,vId;void main(){float g=texture2D(kit,(vec2(mod(vId,8.),floor(vId/8.))+clamp(gl_PointCoord,.06,.94))/8.).r;if(g*vA<.02)discard;gl_FragColor=vec4(mix(${GREEN},vec3(.8,1.,.88),.25)*g*vA*1.6,1.);}`});
  const meshes=[];object.updateWorldMatrix(true,true);object.traverse(o=>{if(o.isMesh&&o.visible&&o.geometry?.attributes.position&&!o.isInstancedMesh&&!o.isBatchedMesh)meshes.push(o);});if(!meshes.length)return null;
  const box=new T.Box3();for(const m of meshes)box.expandByObject(m);if(box.isEmpty())return null;const size=box.getSize(new T.Vector3()),n=Math.min(phone()?160:1400,Math.max(70,Math.round((size.x+size.y+size.z)*(phone()?14:46))));
  const pos=new Float32Array(n*3),rnd=new Float32Array(n*3),v=new T.Vector3();
  for(let i=0;i<n;i++){const m=meshes[i%meshes.length],a=m.geometry.attributes.position;v.fromBufferAttribute(a,Math.floor(Math.random()*a.count));m.localToWorld(v);pos.set([v.x,v.y,v.z],i*3);rnd.set([Math.random(),Math.random(),Math.random()],i*3);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('rnd',new T.BufferAttribute(rnd,3));box.expandByScalar(3);g.boundingSphere=box.getBoundingSphere(new T.Sphere());
  const mat=pointMaterial.clone();Object.assign(mat.uniforms,{kit,time,k:{value:0},px:{value:(root.breakThyRuleShowroom?.renderer?.()?.getPixelRatio?.()||1)*(phone()?1.4:2.6)}});
  const p=new T.Points(g,mat);p.name='Forming glyphs';p.renderOrder=6;p.raycast=()=>{};p.userData.noHit=true;parent.add(p);return p;
 }
 function form(T,object,{delay=0,duration=1.9,cloud=true,scene=root.edenScene}={}){
  if(!object||!scene)return;if(forming.some(f=>f.object===object))return;build(T);
  const box=new T.Box3().setFromObject(object),states=new Set();if(box.isEmpty())return;
  object.traverse(o=>{if(!o.isMesh)return;for(const m of [].concat(o.material||[])){const s=patched.get(m);if(s)states.add(s);}});
  // Reduced motion: the models simply appear.
  if(still())return;
  const h=Math.max(.2,box.max.y-box.min.y);for(const s of states)s.value.set(0,box.min.y,h,0);
  forming.push({T,object,scene,states,start:performance.now()+delay*1000,duration:duration*1000*(.75+Math.min(1.2,h*.07)),cloud,points:null});
 }
 function tick(){
  if(!forming.length)return;const now=performance.now();
  for(let i=forming.length-1;i>=0;i--){const f=forming[i],k=(now-f.start)/f.duration;if(k<0)continue;
   if(f.cloud&&!f.points&&k<.8&&up.length<14){f.points=points(f.T,f.object,f.scene);if(f.points)up.push(f.points);f.cloud=false;}
   const e=Math.min(1,Math.max(0,k));for(const s of f.states)s.value.x=e>=1?1:e;
   if(f.points)f.points.material.uniforms.k.value=e;
   if(k>=1||!f.object.parent){for(const s of f.states)s.value.x=1;if(f.points){f.points.removeFromParent();f.points.geometry.dispose();f.points.material.dispose();up.splice(up.indexOf(f.points),1);}forming.splice(i,1);}}
 }
 // Everything listed forms outward from the viewer, nearest first (on entering Beyond Eden).
 function wave(T,objects,from,speed=26){for(const o of objects){if(!o?.parent)continue;const box=new T.Box3().setFromObject(o);if(box.isEmpty())continue;form(T,o,{delay:.25+Math.min(3.4,box.distanceToPoint(from)/speed),duration:2.4});}}

 // ---- the altar and the cross, at the centre of the Commons
 function altar(T,parent,{x,z}){
  build(T);const g=new T.Group();g.name='Altar of the cross';g.position.set(x,0,z);parent.add(g);
  const L=new T.TextureLoader(),tex=(u,srgb,rx=1,ry=1)=>{const t=L.load(u);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(rx,ry);t.anisotropy=8;if(srgb)t.colorSpace=T.SRGBColorSpace;return t;};
  const stone=new T.MeshStandardMaterial({color:0xb9b3a4,roughness:.82}),dark=new T.MeshStandardMaterial({color:0x6d6a62,roughness:.9});
  const wood=new T.MeshStandardMaterial({map:tex('/assets/eden-textures/bark_brown_02_diff.jpg',true,.7,3.2),normalMap:tex('/assets/eden-textures/bark_brown_02_nor.jpg',false,.7,3.2),color:0xa07a56,roughness:.86});
  const gold=new T.MeshStandardMaterial({color:0xd9ac55,metalness:.9,roughness:.28,emissive:0x3a2506,emissiveIntensity:.35}),linen=new T.MeshStandardMaterial({color:0xe9e2d2,roughness:.95,side:T.DoubleSide}),wax=new T.MeshStandardMaterial({color:0xf2e6cc,roughness:.6,emissive:0x8a5520,emissiveIntensity:.35}),flame=new T.MeshBasicMaterial({color:new T.Color(3,1.9,.8),toneMapped:false});
  const add=(geo,m,px,py,pz,o=g)=>{const e=new T.Mesh(geo,m);e.position.set(px,py,pz);e.castShadow=e.receiveShadow=true;o.add(e);return e;};
  const bevel=(w,h,d,b=.05)=>{const s=new T.Shape();s.moveTo(-w/2+b,-d/2);s.lineTo(w/2-b,-d/2);s.lineTo(w/2,-d/2+b);s.lineTo(w/2,d/2-b);s.lineTo(w/2-b,d/2);s.lineTo(-w/2+b,d/2);s.lineTo(-w/2,d/2-b);s.lineTo(-w/2,-d/2+b);const e=new T.ExtrudeGeometry(s,{depth:h-b,bevelEnabled:true,bevelSize:b*.6,bevelThickness:b*.5,bevelSegments:2});e.rotateX(-Math.PI/2);e.translate(0,b*.5,0);return e;};
  // three octagonal steps, each walkable
  const STEPS=[[4.4,.16],[3.6,.32],[2.85,.48]];for(const [r,top] of STEPS){const s=add(new T.CylinderGeometry(r,r+.06,.16,8),r===3.6?dark:stone,0,top-.08,0);s.rotation.y=Math.PI/8;const trim=add(new T.TorusGeometry(r*.99,.028,6,8),gold,0,top-.02,0);trim.rotation.x=Math.PI/2;trim.rotation.z=Math.PI/8;}
  // the altar table
  add(bevel(2.5,.16,1.25),stone,0,.48,.55);add(bevel(2.05,.78,.9),dark,0,.62,.55);add(bevel(2.6,.17,1.35),stone,0,1.38,.55);
  for(const sx of [-.95,.95])for(const sz of [.17,.93]){add(new T.CylinderGeometry(.085,.1,.74,14),stone,sx,1.0,sz);}
  for(let i=-2;i<=2;i++){const a=add(new T.TorusGeometry(.15,.022,6,20,Math.PI),gold,i*.36,1.08,1.005);add(new T.BoxGeometry(.04,.26,.02),gold,i*.36,.94,1.005);a.castShadow=false;}
  // linen across the table, hanging over the front, embroidered with a cross
  const cloth=new T.PlaneGeometry(.95,2.2,10,28);{const p=cloth.attributes.position;for(let i=0;i<p.count;i++){const u=p.getX(i),v=p.getY(i)+1.1;let y,zz;if(v<1.38){y=1.575;zz=-.12+v;}else{y=1.575-(v-1.38);zz=1.262+.018*Math.sin(u*19.)*(v-1.38)/.8;}p.setXYZ(i,u*(1+.03*Math.sin(v*5.)),y,zz);}cloth.computeVertexNormals();}add(cloth,linen,0,0,0);
  add(new T.BoxGeometry(.035,.36,.008),gold,0,1.2,1.285);add(new T.BoxGeometry(.2,.035,.008),gold,0,1.27,1.285);
  // an open book on the table
  for(const s of [-1,1]){const page=add(new T.BoxGeometry(.3,.035,.4),linen,s*.155,1.6,.62);page.rotation.z=s*-.09;}
  // the cross: rough-hewn timber, socketed in stone, with linen over its arms, the title board and a crown of thorns
  const cross=new T.Group();cross.name='The cross';cross.position.set(0,.48,-.75);g.add(cross);
  const beam=(w,h,d)=>{const b=new T.BoxGeometry(w,h,d,4,22,4),p=b.attributes.position;for(let i=0;i<p.count;i++){const X=p.getX(i),Y=p.getY(i),Z=p.getZ(i),n=Math.sin(Y*9.1+X*23.)*.011+Math.sin(Y*23.7+Z*31.)*.007,k=1-.16*Math.pow(Math.abs(X/w*2)*Math.abs(Z/d*2),3.);p.setXYZ(i,X*k+n,Y,Z*k+n*.8);}b.computeVertexNormals();return b;};
  add(bevel(1.5,.55,1.1,.07),stone,0,0,0,cross);add(beam(.42,6.7,.34),wood,0,3.75,0,cross);const arms=add(beam(.38,3.7,.32),wood,0,5.35,.03,cross);arms.rotation.z=Math.PI/2;
  const boardCanvas=document.createElement('canvas');boardCanvas.width=256;boardCanvas.height=96;{const c=boardCanvas.getContext('2d');c.fillStyle='#cdb891';c.fillRect(0,0,256,96);for(let i=0;i<90;i++){c.fillStyle=`rgba(80,55,25,${.04+.1*((i*37%10)/10)})`;c.fillRect((i*53)%256,(i*29)%96,40,1.5);}c.fillStyle='#24160a';c.font='700 62px Georgia';c.textAlign='center';c.textBaseline='middle';c.fillText('I N R I',128,51);}
  const boardMap=new T.CanvasTexture(boardCanvas);boardMap.colorSpace=T.SRGBColorSpace;const board=add(new T.BoxGeometry(.86,.32,.05),[wood,wood,wood,wood,new T.MeshStandardMaterial({map:boardMap,roughness:.9}),wood],0,6.45,.22,cross);board.rotation.z=.04;
  const drape=new T.PlaneGeometry(3.1,.42,60,6);{const p=drape.attributes.position;for(let i=0;i<p.count;i++){const X=p.getX(i),Y=p.getY(i),s=Math.abs(X)/1.55;const sag=-.62*(1-Math.min(1,Math.abs(s-.0)))*Math.pow(1-s,.6);p.setXYZ(i,X,5.52+Y*.8+(s>.8?-(s-.8)*4.2:sag*.75),.24+.07*Math.sin(Y*26.+X*3.)+(s<.7?.09:0));}drape.computeVertexNormals();}add(drape,linen,0,0,0,cross);
  const thorn=new T.MeshStandardMaterial({color:0x3a2413,roughness:.9}),crown=new T.Group();crown.position.set(0,5.33,.3);crown.rotation.x=1.25;cross.add(crown);
  for(let k=0;k<3;k++){const pts=[];for(let i=0;i<40;i++){const a=i/40*Math.PI*2;pts.push(new T.Vector3(Math.cos(a)*(.24+.02*Math.sin(a*7+k*2)),Math.sin(a*5+k*2.1)*.03,Math.sin(a)*(.24+.02*Math.cos(a*6+k))));}add(new T.TubeGeometry(new T.CatmullRomCurve3(pts,true),80,.013,5,true),thorn,0,0,0,crown);}
  for(let i=0;i<26;i++){const a=i/26*Math.PI*2,c=add(new T.ConeGeometry(.011,.1,4),thorn,Math.cos(a)*.26,(i%3-1)*.02,Math.sin(a)*.26,crown);c.rotation.set(Math.sin(i*4.1)*1.3,-a,-Math.PI/2+Math.sin(i*2.3)*.7);}
  // candles
  const candles=[],flames=[];for(const [cx,cz,h,b] of [[-.95,.75,.34,1.57],[.95,.75,.34,1.57],[-.72,.5,.24,1.57],[.72,.5,.24,1.57],[-2.2,.9,.5,.48],[2.2,.9,.5,.48],[-1.9,1.5,.36,.48],[1.9,1.5,.36,.48],[-1.5,-1.4,.42,.48],[1.5,-1.4,.42,.48]]){add(new T.CylinderGeometry(.045,.05,h,12),wax,cx,b+h/2,cz);const fl=add(new T.SphereGeometry(.03,10,8),flame,cx,b+h+.05,cz);fl.scale.set(.8,2.1,.8);fl.castShadow=false;flames.push(fl);candles.push(new T.Vector3(x+cx,b+h+.1,z+cz));}
  // Light falling from the break in the sky onto the cross.
  const shaft=new T.Mesh(new T.CylinderGeometry(1.1,3.9,26,48,1,true),new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,toneMapped:false,uniforms:{time,kit},
   vertexShader:'varying vec3 vW,vN;varying vec2 vUv;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}',
   fragmentShader:'uniform float time;uniform sampler2D kit;varying vec3 vW,vN;varying vec2 vUv;void main(){float e=pow(abs(dot(normalize(vN),normalize(cameraPosition-vW))),2.2);float n=texture2D(kit,vec2(vUv.x*3.+time*.006,vUv.y*.25-time*.012)).g;float a=e*(.35+.9*smoothstep(.35,.7,n))*smoothstep(0.,.25,vUv.y)*smoothstep(1.,.45,vUv.y)*.16*smoothstep(1.,6.,distance(cameraPosition,vW));gl_FragColor=vec4(vec3(1.,.86,.58)*a,1.);}'}));
  shaft.position.set(0,12.6,-.4);shaft.renderOrder=5;shaft.raycast=()=>{};shaft.userData.noHit=true;g.add(shaft);
  const warm=new T.PointLight(0xffb868,26,17,1.55);warm.position.set(0,2.5,2.5);warm.name='Altar light';g.add(warm);
  const high=new T.PointLight(0xffe3b0,34,17,1.6);high.position.set(0,6.6,3.2);high.name='Altar light';g.add(high);
  surface(T,g,{kind:'stone',skip:o=>o.material===wood||o.material===linen||o.material===gold||o.material===wax||Array.isArray(o.material)});for(const m of [wood,linen,gold,wax,thorn])patch(T,m,'form');
  g.updateMatrixWorld(true);g.traverse(o=>{o.matrixAutoUpdate=false;});
  // Steps are walkable; only the table and the cross's base block. Off in an expedition, whose server has no altar.
  const surfaces=STEPS.map(([r,top])=>({minX:x-r*.86,maxX:x+r*.86,minZ:z-r*.86,maxZ:z+r*.86,top,bottom:-1,wall:false,prop:'altar'}));
  const table={minX:x-1.3,maxX:x+1.3,minZ:z-.15,maxZ:z+1.25,top:1.56,bottom:-1,wall:true,prop:'altar'};surfaces.push(table);
  const walls=[[x,z+.55,2.6,1.35,1.56],[x,z-.75,1.5,1.1,1.03],[x,z-.75,.5,.4,7]];
  return {group:g,surfaces,walls,candles,flames,air:[{position:new T.Vector3(x,2.2,z+1.2),color:new T.Color(1,.66,.3),power:.016},{position:new T.Vector3(x,6.2,z-.5),color:new T.Color(1,.85,.55),power:.016}],lights:[warm,high],
   covers:(px,pz,m=0)=>Math.hypot(px-x,pz-z)<5+m,
   update(t){const k=still()?1:1+.07*Math.sin(t*9.)+.05*Math.sin(t*23.7);warm.intensity=26*k;if(still())return;flames.forEach((f,i)=>{f.scale.y=2.1+.35*Math.sin(t*11.+i*1.7);f.updateMatrix();});}};
 }
 root.edenMatrix={sky,update,patch,surface,form,wave,altar,build,strength,time,verses:VERSES,lines:LINES,inspect:()=>({strength:strength.value,forming:forming.length,clouds:up.length})};
})(window);
