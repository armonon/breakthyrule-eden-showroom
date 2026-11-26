'use strict';
// Beyond Eden as a program. One shared kit, window.edenMatrix, used by the night road, the district and the match:
//  sky(T)          the night sky: rain of binary (it really spells scripture in ASCII), Hebrew and Greek letters, with
//                  lines of a God-centred program typing themselves between the columns
//  surface(T,root) photo-scanned asphalt, concrete, paving, plaster, brick and rust (assets/beyond-eden/scan, CC0), with grime, damp,
//                  puddles and faint running code
//  form(T,object)  a model crystallises out of glyphs instead of popping in
//  altar(T,...)    the altar and the cross at the centre of the Commons
//  ground(x,z)     what is underfoot at a world position: {type:'asphalt'|'paving'|'concrete'|'earth'|'stone'|'brick', wet, damp}
// Desktop gets all of it; phones keep the sky, the altar, the forming effect and the scanned ground (albedo only, 512 px).
(function(root){
 // The expedition's own page keeps the sky and walls it was built with.
 const OLD=!!document.body?.classList.contains('expedition-entry');
 const GREEN='vec3(.16,1.,.42)';
 const time={value:0},strength={value:0},kit={value:null},program={value:null},scanA={value:null},scanB={value:null},detail={value:null};
 // The scans, one layer each of two texture arrays (a lit material here is at the GPU's 16 samplers, so no surface may
 // cost more than it did): A rgb albedo + a height, B rg normal + b roughness. SCALE is tiles per metre of each scan.
 // 'planks' (weathered boards) dresses the landmarks' timber; its -m file carries a third band, one random tone per board
 // (tools/night/fetch-building-scans.py), which goes into B.a.
 const LAYERS=['asphalt','concrete','paving','plaster','brick','rust','eden','planks'],SCALE=['.25','.5','.556','.556','.667','.5','.36','.6'];let kitData=null;
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
  kit.value=new T.DataTexture(data,N,N);kit.value.wrapS=kit.value.wrapT=T.RepeatWrapping;kit.value.magFilter=T.LinearFilter;kit.value.minFilter=T.LinearMipmapLinearFilter;kit.value.generateMipmaps=true;kit.value.anisotropy=4;kit.value.needsUpdate=true;kitData=data;
 }
 // The scans are fetched when the first material that reads them is patched (the expedition page never asks for the
 // arrays). Phones: the three ground scans only, albedo and height, 512 px. Layers fill in as their files arrive.
 // Eden's side of the door keeps the cobble it always had: layer 'eden' is A its colour, B.rg its normal, B.ba the normal of
 // the old paving (so it costs no extra sampler).
 const EDEN=['/assets/castle/cobble.webp?v=1','/assets/castle/cobble-nor.webp?v=1','/assets/eden-textures/monastery_stone_floor_nor.jpg'];
 const files=new Map();let pane=null;
 function scans(T,a,b){
  if((!a||scanA.value)&&(!b||scanB.value))return;
  let low=false;try{low=localStorage.getItem('eden-graphics')==='low';}catch{}
  const n=phone()?3:LAYERS.length,S=phone()||low?512:1024,make=(fill,srgb)=>{const d=new Uint8Array(S*S*4*n);for(let i=0;i<d.length;i+=4){d[i]=fill[0];d[i+1]=fill[1];d[i+2]=fill[2];d[i+3]=fill[3];}
   const t=new T.DataArrayTexture(d,S,S,n);t.format=T.RGBAFormat;t.type=T.UnsignedByteType;t.wrapS=t.wrapT=T.RepeatWrapping;t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=phone()?2:8;if(srgb)t.colorSpace=T.SRGBColorSpace;t.onUpdate=()=>{t.userData.sent=true;};t.needsUpdate=true;return t;};
  if(!pane){const cv=document.createElement('canvas');cv.width=S;cv.height=S*3;pane=cv.getContext('2d',{willReadFrequently:true});}
  const image=u=>files.get(u)||files.set(u,new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=u[0]==='/'?u:'/assets/beyond-eden/scan/'+u+'.webp?v=1';})).get(u);
  // Rows bottom first, like any other texture here, so a wall's scan stands the right way up. -m is roughness above
  // height; turned over, height is the first S rows and roughness the rest.
  const pixels=(img,h)=>{pane.setTransform(1,0,0,-1,0,h);pane.drawImage(img,0,0,S,h);pane.setTransform(1,0,0,1,0,0);return pane.getImageData(0,0,S,h).data;};
  const sent=(t,i)=>{if(t.userData.sent)t.addLayerUpdate(i);t.needsUpdate=true;},e=S*S;
  if(a&&!scanA.value){const t=scanA.value=make([120,112,100,128],true);LAYERS.slice(0,n).forEach(async(name,i)=>{try{if(name==='eden'){t.image.data.set(pixels(await image(EDEN[0]),S),i*e*4);sent(t,i);return;}
   const [d,m]=await Promise.all([image(name+'-d'),image(name+'-m')]);const A=t.image.data,o=i*e*4;A.set(pixels(d,S),o);const three=m.height>=m.width*2.5,mp=pixels(m,three?S*3:S*2),h=three?e:0;for(let k=0;k<e;k++)A[o+k*4+3]=mp[(h+k)*4];sent(t,i);}catch{}});}
  if(b&&!scanB.value){const t=scanB.value=make([128,128,215,255],false);LAYERS.slice(0,n).forEach(async(name,i)=>{try{if(name==='eden'){const B=t.image.data,o=i*e*4,c=pixels(await image(EDEN[1]),S),p=pixels(await image(EDEN[2]),S);for(let k=0;k<e;k++){B[o+k*4]=c[k*4];B[o+k*4+1]=c[k*4+1];B[o+k*4+2]=p[k*4];B[o+k*4+3]=p[k*4+1];}sent(t,i);return;}
   const [nor,m]=await Promise.all([image(name+'-n'),image(name+'-m')]);const B=t.image.data,o=i*e*4,np=pixels(nor,S);
   // three bands (roughness, height, tone), turned over: tone first, then height, then roughness
   if(m.height>=m.width*2.5){const mp=pixels(m,S*3);for(let k=0;k<e;k++){B[o+k*4]=np[k*4];B[o+k*4+1]=np[k*4+1];B[o+k*4+2]=mp[(2*e+k)*4];B[o+k*4+3]=mp[k*4];}}
   else{const mp=pixels(m,S*2);for(let k=0;k<e;k++){B[o+k*4]=np[k*4];B[o+k*4+1]=np[k*4+1];B[o+k*4+2]=mp[(e+k)*4];}}sent(t,i);}catch{}});}
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
    vec3 c=${OLD?'mix(vec3(.010,.034,.024),vec3(.0015,.006,.006),pow(up,.42))':'mix(vec3(.018,.024,.032),vec3(.003,.005,.008),pow(up,.42))'};
    c+=${OLD?'vec3(.018,.09,.05)':'vec3(.020,.030,.034)'}*exp(-up*7.)*(.5+.5*texture2D(kit,vec2(az*3.,.3)).g);
    float veil=smoothstep(.42,.75,cloud*.7+wisps*.3);c+=${OLD?'vec3(.008,.03,.021)':'vec3(.014,.018,.024)'}*veil;
    // A soft break in the clouds above the altar's end of the sky: the light the program is about.
    float glory=pow(max(dot(d,normalize(vec3(.0,.82,-.57))),0.),14.);c+=vec3(.10,.085,.045)*glory*(.6+.4*wisps);
    float fade=${OLD?'smoothstep(-.02,.06,el)':'smoothstep(.05,.16,el)'}*(1.-smoothstep(.62,.86,el));
    if(fade>0.){vec3 r=rain(az,el,170.,5.5,.72,1.)+rain(az+.0013,el,340.,7.,.8,5.)*.55+rain(az+.004,el,74.,3.4,.26,9.)*.6;
     // the program: lines written left to right on panels of the sky, read and then erased
     vec2 q=vec2(az*9.,(el-.10)*17.);vec2 panel=floor(q),pf=fract(q);float ph=mxHash(panel+31.),t=time*.07+ph*9.,cyc=floor(t),tt=fract(t);
     if(panel.y>=0.&&panel.y<9.&&mxHash(panel+cyc*17.)>.72){vec2 w=vec2((pf.x-.06)/.88,(pf.y-.3)/.4);if(w.x>0.&&w.x<1.&&w.y>0.&&w.y<1.){float line=floor(mxHash(panel+cyc*5.)*${LINES.length}.);
      float typed=smoothstep(0.,.35,tt),gone=smoothstep(.85,1.,tt);float lit=step(w.x,typed)*(1.-gone);
      float s=textureGrad(program,vec2(w.x,(line+1.-w.y)/${LINES.length}.),dFdx(q)*vec2(1.13,0.),dFdy(q)*vec2(0.,2.5/${LINES.length}.)).r;
      r*=1.-.85*step(w.x,typed)*(1.-gone)*.7;r+=mix(vec3(.45,1.,.62),vec3(1.,.9,.6),step(.8,ph))*s*lit*.85;
      r+=vec3(.6,1.,.75)*step(abs(w.x-typed),.006)*(1.-gone)*step(typed,.995);}}
     // Far off and faint: something in the weather rather than a screen over the street.
     c+=r*fade*${OLD?'(1.-.45*veil)':'(1.-.6*veil)*.30'};}
    // stars where the rain thins out overhead
    vec2 sp=d.xz/(up+.15)*38.;vec2 sc=floor(sp);float st=mxHash(sc);c+=${OLD?'vec3(.6,.9,.75)':'vec3(.75,.82,.95)'}*step(.985,st)*smoothstep(.22,.0,length(fract(sp)-.5))*smoothstep(.45,.8,up)*(.5+.5*sin(time*2.+st*90.));
    gl_FragColor=vec4(c,strength);}`}));
  dome.name='Matrix sky';dome.frustumCulled=false;dome.renderOrder=-5;dome.visible=false;dome.raycast=()=>{};
  return dome;
 }
 function update(seconds,amount){time.value=still()?20+seconds*.08:seconds;strength.value=amount;tick();}

 // ---- materials: forming + stone detail
 const patched=new WeakMap();
 // kind: 'model' (own textures: detail, grime, damp, running code), 'stone' (procedural walls: scanned plaster with the
 // brick showing where it has come away, paving on slopes, concrete on what faces up), 'concrete' (scanned concrete all
 // over: the altar), 'metal' (bare metal: scanned rust), 'ground' (the land beside the road: paving round the altar and
 // down the lane, asphalt shoulders, cracked concrete slabs, earth), 'road' (the road itself: Eden's brick up to the
 // door, asphalt beyond it), 'form' (forming only). Everything scanned is read in world space.
 const ZONES=`float mxPlaza=max(1.-smoothstep(8.2,9.8,length(vMx.xz-vec2(12.,-62.))+mxBroad*2.-1.),(1.-smoothstep(1.8,3.4,abs(vMx.z+63.5)+mxFine*1.6-.8))*(1.-smoothstep(26.,32.,abs(vMx.x-12.)))),mxRoad=1.-smoothstep(2.6,4.4,abs(vMx.x-11.7)+mxFine*2.-1.);`;
 function patch(T,material,kind='form',wash=false){
  if(!material?.isMeshStandardMaterial)return null;const had=patched.get(material);if(had)return had;build(T);
  // garden.js hands the road over as a 'model': it is the one material painted and embossed from canvases.
  if(kind==='model'&&material.map?.isCanvasTexture&&material.bumpMap?.isCanvasTexture&&!material.normalMap)kind='road';
  const lite=phone();if(lite&&kind!=='ground'&&kind!=='road'){
   // Phones keep each building's own textures; its wall scans are laid at twice the density, closer to their real size.
   if((kind==='facade'&&material.userData.mxLayer!=='own'||kind==='planks')&&!OLD)for(const t of [material.map,material.normalMap,material.roughnessMap,material.metalnessMap])t?.repeat.set(2,2);
   kind='form';}
  // facade: a landmark's wall. Layer 'own' (material.userData.mxLayer) keeps the building's own scan but lays it in world
  // space, 2.5 m to a tile, so it neither stretches nor seams from face to face; any other layer (plaster, brick, concrete)
  // replaces a texture that reads as fake however it is laid (the observatory's trowelled rings) with that world-space
  // scan, keeping only its average colour. Both are weathered. planks: timber and doors, with the boards scan.
  // interior: window glass with a room behind it.
  const ownMap=kind==='facade'&&material.userData.mxLayer==='own'&&!OLD;if(ownMap)kind='own';
  const facade=kind==='facade'||kind==='planks',interior=kind==='interior'&&!OLD,fill=!OLD&&!wash&&!!material.userData.mxFill,weathered=!OLD&&!!material.userData.mxWeather&&(facade||ownMap);
  const layer=kind==='planks'?'planks':LAYERS.includes(material.userData.mxLayer)?material.userData.mxLayer:'plaster',layerIndex=LAYERS.indexOf(layer);
  if(facade){const img=material.map?.image;if(img){try{const c=document.createElement('canvas');c.width=c.height=8;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0,8,8);const d=g.getImageData(0,0,8,8).data;let r=0,gg=0,b=0,n=0;for(let i=0;i<d.length;i+=4){if(d[i]+d[i+1]+d[i+2]<6)continue;r+=d[i];gg+=d[i+1];b+=d[i+2];n++;}if(n)material.color.multiply(new T.Color().setRGB(r/n/255,gg/n/255,b/n/255,T.SRGBColorSpace));}catch{}}
   material.map=material.normalMap=material.roughnessMap=material.metalnessMap=material.aoMap=null;material.metalness=0;material.roughness=1;}
  if(interior){material.color.setRGB(.02,.022,.025);material.roughness=.08;material.metalness=0;}
  const form={value:new T.Vector4(1,0,1,0)},own=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
  patched.set(material,form);
  const ground=kind==='ground',road=kind==='road',wall=kind==='stone'||kind==='concrete'||facade,metal=kind==='metal',model=kind==='model';
  const lean=model&&!!(material.aoMap||material.lightMap||material.emissiveMap),useA=ground||road||wall||metal,useB=!lite&&useA,useD=(model&&!lean)||road&&!lite;scans(T,useA,useB);
  // A model keeps its own textures; close to, the stone grain is laid over its normals (the same one Eden and the expedition have always had).
  if(useD&&!detail.value){const t=detail.value=new T.TextureLoader().load('/assets/castle/wall-nor.webp?v=1');t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;}
  material.onBeforeCompile=(sh,r)=>{own.call(material,sh,r);
   Object.assign(sh.uniforms,{mxForm:form,mxTime:time,mxOn:strength,mxKit:kit});
   if(useA)sh.uniforms.mxScanA=scanA;if(useB)sh.uniforms.mxScanB=scanB;if(useD)sh.uniforms.mxNorA=detail;
   sh.vertexShader='varying vec3 vMx;uniform vec4 mxForm;\n'+(weathered?'attribute vec2 _weather;varying vec2 vMxW;\n':'')+sh.vertexShader.replace('#include <project_vertex>',`${weathered?'vMxW=_weather;':''}
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
   let head=`${weathered?'varying vec2 vMxW;':''}varying vec3 vMx;uniform vec4 mxForm;uniform float mxTime,mxOn;uniform highp sampler2D mxKit;float mxGlow=0.;\nfloat mxBit(float n){int i=int(mod(n,1024.));return texelFetch(mxKit,ivec2(i%512,i/512),0).a;}\n`;
   // One read of a scan: p in metres, l the layer, s its tiles per metre. Explicit gradients, so a change of layer or
   // of projection from one pixel to the next does not pick the wrong mip.
   if(kind!=='form')head+=`${useA?'uniform highp sampler2DArray mxScanA;vec4 mxA4(vec2 p,float l,float s){return textureGrad(mxScanA,vec3(p*s,l),dFdx(p)*s,dFdy(p)*s);}':''}${useB?'uniform highp sampler2DArray mxScanB;vec4 mxB4(vec2 p,float l,float s){return textureGrad(mxScanB,vec3(p*s,l),dFdx(p)*s,dFdy(p)*s);}':''}${useD?'uniform sampler2D mxNorA;':''}
    vec3 mxWn=vec3(0.,1.,0.),mxN0=vec3(0.);vec2 mxUv=vec2(0.),mxBump=vec2(0.);float mxFine2=.5,mxDamp=0.,mxNear=0.,mxPave=0.,mxRough=-1.,mxWet=0.,mxIn=1.,mxLit=0.;\n`;
   // What a street collects: hairline cracks where the surface has moved, dirt in the gutters, two worn wheel tracks, fallen
   // leaves. Drawn in world space, faded out before it can shimmer.
   const street=!(ground||road)?'':`vec3 mxStreet(vec3 c,vec2 p,float edge,float wheels,float litter,inout float wet,inout float dirt){
    float near=1.-smoothstep(9.,26.,length(vMx-cameraPosition)),n1=texture2D(mxKit,p*.047).g,n2=texture2D(mxKit,p*.61).b,n3=texture2D(mxKit,p*.13+n2*.012).g;
    vec2 dq=fwidth(p);
    float crack=(1.-smoothstep(.002,.013,abs(n3-.5+(n2-.5)*.06)))*smoothstep(.42,.6,n1)${lite?'':'+(1.-smoothstep(.0015,.008,abs(texture2D(mxKit,p*.29+n2*.02).g-.46)))*smoothstep(.5,.66,n1)*.8'};
    c*=1.-.62*clamp(crack,0.,1.)*near;
    float w=wheels*(.55+.45*n1);c*=1.-.24*w;dirt=edge*smoothstep(.3,.62,n2+.45*edge);
    c=mix(c,vec3(.052,.043,.032)*(.6+.8*n2),dirt*.75);wet*=1.-.6*dirt;
    ${lite?'':`if(litter*near>0.){for(int k=0;k<2;k++){vec2 q=p*(k==0?5.5:8.3)+float(k)*17.,id=floor(q),f=fract(q)-.5;float h=mxHash(id),a=h*41.;if(h>litter*(.35+.9*n1))continue;f+=(vec2(mxHash(id+3.),mxHash(id+7.))-.5)*.45;
     f=mat2(cos(a),-sin(a),sin(a),cos(a))*f;float L=.17+.14*mxHash(id+13.),d=abs(f.y)-(.42*L)*(1.-pow(abs(f.x)/L,2.));float m=(1.-smoothstep(-.012,.02+(k==0?5.5:8.3)*max(dq.x,dq.y),d))*step(abs(f.x),L)*near;
     vec3 leaf=mix(vec3(.085,.060,.026),vec3(.048,.046,.022),mxHash(id+19.))*(.55+.7*mxHash(id+23.))*(1.-.4*(1.-smoothstep(.0,.012,abs(f.y))));c=mix(c,leaf,m);wet*=1.-m*.8;dirt=max(dirt,m);}}`}
    return c;}\n`;
   let f=sh.fragmentShader;
   f=head+HASH+street+f.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
    if(mxForm.x<1.){float mxH=clamp((vMx.y-mxForm.y)/mxForm.z,0.,1.);vec3 mxC=floor(vMx*4.5);float mxN=mxHash(mxC.xz+mxC.y*17.3);float mxK=(mxForm.x*1.55-mxH*.5-mxN*.45)/.2;if(mxK<=0.)discard;mxGlow=1.-clamp((mxK-.2)*.5,0.,1.);}`);
   // Rain streaks down the walls, soot under ledges, damp and moss near the ground, broad tone changes that break the tiling.
   const GRIME=`
    float mxWall=1.-smoothstep(.4,.75,mxA.y),mxStreak=texture2D(mxKit,vec2(mxUv.x*.17,mxUv.y*.035)).b;
    diffuseColor.rgb*=1.-mxWall*.42*smoothstep(.5,.72,mxStreak)*smoothstep(.35,.6,mxBroad);diffuseColor.rgb*=.78+.44*mxBroad;
    mxDamp=exp(-max(vMx.y,0.)*1.1)*(.4+.6*mxFine)*mxWall+(1.-mxWall)*step(.5,mxWn.y)*smoothstep(.45,.65,mxBroad);
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.45,.56,.40),clamp(mxDamp,0.,1.)*.75);`;
   // Weathering (Beyond Eden's own build only; the expedition page keeps the walls it was built with): dirt and rain splash
   // on the bottom 40 cm, damp and moss on faces turned from the moon (it stands at (-.38,.62,-.64)), and where the
   // landmark pass left its vertex attribute (_weather, tools/night/build-landmarks.py), rain streaks under every sill and
   // ledge and the occlusion of corners. Walls stand on ground at y 0 here, give or take a plinth.
   const WEATHER=OLD?'':`
    {float mxV=1.-smoothstep(.4,.75,abs(mxWn.y)),mxH=max(vMx.y,0.)+(mxFine-.5)*.16,mxIn2=1.-smoothstep(-24.,-20.,vMx.z);mxV*=mxIn2;
     float mxBase=1.-smoothstep(.1,.48,mxH),mxSpl=smoothstep(.62,.8,texture2D(mxKit,mxUv*2.3).b+.35*mxBase)*(1.-smoothstep(.2,.75,mxH));
     diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.40,.36,.31),mxBase*.75*mxV);diffuseColor.rgb*=1.-.3*mxSpl*mxV;
     float mxAway=clamp(-dot(mxWn.xz,vec2(-.51,-.86)),0.,1.)*mxV,mxLow=1.-smoothstep(.3,3.,mxH);
     float mxMoss=mxAway*smoothstep(.5,.72,mxBroad*.7+mxFine*.3+.22*mxLow)*(.35+.65*mxLow);
     diffuseColor.rgb=mix(diffuseColor.rgb,vec3(dot(diffuseColor.rgb,vec3(.3333)))*vec3(.55,.74,.40),clamp(mxMoss,0.,1.)*.6);
     diffuseColor.rgb*=1.-.18*mxAway*smoothstep(.4,.65,mxBroad);
     mxDamp=max(mxDamp,mxBase*.55*mxV+mxMoss*.5);${weathered?`
     float mxRun=vMxW.x*smoothstep(.42,.8,texture2D(mxKit,vec2(mxUv.x*1.1,vMx.y*.045+mxUv.x*.031)).b*.55+texture2D(mxKit,vec2(mxUv.x*3.7,vMx.y*.09)).b*.55);
     diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.5,.47,.42),clamp(mxRun,0.,1.)*.75*mxIn2);mxDamp=max(mxDamp,mxRun*.45);
     diffuseColor.rgb*=1.-.6*vMxW.y*mxIn2;`:''}}`;
   // Standing water: in the broad damp patches, where the scan's height says the surface is low.
   // MID is each ground scan's mean height: cracks and joints lie well below it, so they fill first and read darker.
   const WET=`smoothstep(0.,.1,(mxBroad-${OLD?'.6':'.55'})+(mxMid-mxT.a)*.9+(mxFine-.5)*.08)`,MID=`float mxMid=mxL>1.5?.545:(mxL>.5?.51:.40);`,CREVICE=`(1.-.5*smoothstep(.04,.25,mxMid-mxT.a))`;
   f=f.replace('#include <map_fragment>',`#include <map_fragment>
    diffuseColor.rgb*=1.-mxGlow*.9;`+(kind==='form'||interior?'':`
    {vec3 mxD=vMx-cameraPosition;mxNear=1.-smoothstep(14.,42.,length(mxD));mxWn=normalize(cross(dFdx(vMx),dFdy(vMx)));vec3 mxA=abs(mxWn);
    mxUv=mxA.y>max(mxA.x,mxA.z)?vMx.xz:(mxA.x>mxA.z?vMx.zy:vMx.xy);
    float mxBroad=texture2D(mxKit,mxUv*.023).g,mxFine=texture2D(mxKit,mxUv*.19).b;mxFine2=mxFine;`+(ground?`
    // Past the door (z -20) the land is a street: paving round the altar and down the lane, asphalt beside the road,
    // cracked slabs across the Commons and in patches further out, earth and weeds between. Eden's side keeps its tone.
    mxIn=1.-smoothstep(-24.,-20.,vMx.z);${ZONES}
    float mxSlab=smoothstep(.46,.56,mxBroad+.12*(mxFine-.5)+.24*mxIn*(1.-smoothstep(16.,30.,length(vMx.xz-vec2(12.,-62.)))));
    float mxL=mxIn*mxPlaza>.5?2.:(mxIn*mxRoad>.5?0.:1.),mxS=mxL>1.5?${SCALE[2]}:(mxL>.5?${SCALE[1]}:${SCALE[0]});vec4 mxT=mxA4(vMx.xz,mxL,mxS);${MID}
    mxPave=max(mxPlaza,mxRoad)*mxIn;float mxCover=smoothstep(.36,.64,max(mxPave,mxSlab)+(mxT.a-mxMid)*.9);
    vec3 mxG=diffuseColor.rgb*vec3(.50,.62,.40)*(.55+.7*mxFine),mxC=mxT.rgb*(mxL>1.5?vec3(.39,.39,.38):(mxL>.5?vec3(.28):vec3(.48)))*(.8+.4*mxBroad)*${CREVICE};
    float mxMoss=smoothstep(.45,.6,mxFine)*smoothstep(.4,.6,mxBroad)*smoothstep(-.02,.12,mxMid-mxT.a);mxC=mix(mxC,mxG*.9,mxMoss*.45*mxIn);
    float mxEarth=smoothstep(.50,.62,mxBroad+.12*(mxFine-.5));vec3 mxWas=${lite?'diffuseColor.rgb':`mix(mxG,mxA4(vMx.xz,6.,.36).rgb*vec3(.52,.55,.5)*.8,mxEarth*.85)`};
    diffuseColor.rgb=mix(mxWas,mix(mxG,mxC,mxCover),mxIn);
    mxDamp=smoothstep(.45,.62,mxBroad)*(.45+.55*max(mxPave,mxCover*mxIn))*${lite?'mxIn':'1.'};mxWet=${WET}*mxCover*mxIn;
    if(${OLD?'false':'true'}){float mxDirt=0.,mxDry=mxWet;vec3 mxS2=mxStreet(diffuseColor.rgb,vMx.xz,.35*(1.-mxCover),0.,.38*mxIn,mxDry,mxDirt);diffuseColor.rgb=mix(diffuseColor.rgb,mxS2,mxIn);mxWet=mix(mxWet,mxDry,mxIn);mxLit=mxDirt*mxIn;}
    diffuseColor.rgb*=(1.-.45*mxDamp)*(1.-.35*mxWet);mxPave=max(mxPave,mix(mxEarth,mxCover,mxIn)*.8);
    ${useB?`vec4 mxN=mxB4(vMx.xz,mxL,mxS);mxBump=(mxN.xy*2.-1.)*mxCover;if(mxIn<1.){vec2 mxOld=mxPave<.5?mxB4(vMx.xz,6.,.36).xy:mxB4(vMx.xz,6.,.27).zw;mxBump=mix(mxOld*2.-1.,mxBump,mxIn);}mxRough=mix(1.,mxN.b,mxCover*mxIn);`:''}`:road?`
    ${lite?'':`diffuseColor.rgb*=mix(1.,.55+.95*texture2D(mxKit,mxUv*1.7).b,.6*mxNear);${GRIME}`}
    mxIn=1.-smoothstep(-24.,-20.,vMx.z);${ZONES}
    float mxL=mxPlaza>.5?2.:0.,mxS=mxL>1.5?${SCALE[2]}:${SCALE[0]};vec4 mxT=mxA4(vMx.xz,mxL,mxS);${MID}mxWet=${WET}*mxIn;mxPave=mxL*.5;
    diffuseColor.rgb=mix(diffuseColor.rgb,mxT.rgb*(mxL>1.5?vec3(.39,.39,.38):vec3(.48))*(.8+.4*mxBroad)*${CREVICE}*(1.-.45*smoothstep(.45,.62,mxBroad))*(1.-.35*mxWet),mxIn);
    if(${OLD?'false':'true'}){float mxX=abs(vMx.x-11.7),mxDirt=0.,mxDry=mxWet;vec3 mxS2=mxStreet(diffuseColor.rgb,vMx.xz,smoothstep(1.25,2.,mxX+mxFine*.5-.2),(1.-smoothstep(.1,.34,abs(mxX-.78)))*(1.-mxPave),mix(.10,.42,smoothstep(.7,1.9,mxX)),mxDry,mxDirt);diffuseColor.rgb=mix(diffuseColor.rgb,mxS2,mxIn);mxWet=mix(mxWet,mxDry,mxIn);mxLit=mxDirt*mxIn;}
    ${useB?`vec4 mxN=mxB4(vMx.xz,mxL,mxS);mxBump=mxN.xy*2.-1.;mxRough=mxN.b;`:''}`:wall?`
    ${kind==='concrete'?`float mxL=1.,mxS=${SCALE[1]},mxBr=-1.;`:facade&&layer!=='plaster'?`float mxBr=-1.,mxL=mxA.y>.82&&${layer!=='planks'}?1.:${layerIndex}.,mxS=mxL<1.5?${SCALE[1]}:${SCALE[layerIndex]};`:facade?`
    // a plastered landmark wall: the brick shows through in patches, more of them near the ground
    float mxBr=mxBroad*.6+mxFine*.4+.22*exp(-max(vMx.y,0.)*.45)-.80;
    float mxL=mxA.y>.82?1.:(mxBr>0.?4.:3.),mxS=mxL>3.5?${SCALE[4]}:(mxL>2.5?${SCALE[3]}:${SCALE[1]});`:`
    // Warm-coloured walls are brick under their plaster; any wall shows brick in patches, more of it near the ground.
    float mxRed=(diffuseColor.r-diffuseColor.b)/max(diffuseColor.r,.05),mxBr=mxBroad*.6+mxFine*.4+.4*smoothstep(.3,.6,mxRed)+.2*exp(-max(vMx.y,0.)*.45)-.64;
    float mxL=mxA.y>.82?1.:(mxA.y>.3?2.:(mxBr>0.?4.:3.)),mxS=mxL>3.5?${SCALE[4]}:(mxL>1.5?${SCALE[3]}:${SCALE[1]});`}
    vec4 mxT=mxA4(mxUv,mxL,mxS);if(mxL>3.5&&mxL<4.5)diffuseColor.rgb=mix(diffuseColor.rgb,vec3(dot(diffuseColor.rgb,vec3(.3333))),.65);
    ${facade?`// the scan's grain and light, mostly in the building's own colour; one tone per block or board
    if(mxL>2.5&&mxL<4.5){float mxG2=dot(mxT.rgb,vec3(.3333));mxT.rgb=mix(vec3(.36),mix(vec3(mxG2),mxT.rgb,.5),.62);}  // softer: a wall, not a sample swatch
    if(mxL>6.5){mxT.rgb=mix(vec3(dot(mxT.rgb,vec3(.3333))),mxT.rgb,.35)*1.08;${useB?`diffuseColor.rgb*=.8+.4*mxB4(mxUv,mxL,mxS).a;`:''}}`:''}
    diffuseColor.rgb=diffuseColor.rgb*mix(.55,1.1,mxBroad)*mxT.rgb*(mxL>3.5?2.1:(mxL>1.5?2.:2.25))${facade?'*1.2':''};
    if(mxL>2.5)diffuseColor.rgb*=1.-.4*(1.-smoothstep(0.,.03,abs(mxBr)));${GRIME}${WEATHER}
    ${useB?`vec4 mxN=mxB4(mxUv,mxL,mxS);mxBump=mxN.xy*2.-1.;mxRough=mxN.b;`:''}`:metal?`
    // Paint where it has held, rust where it has not (mxPave carries how far through the rust is).
    vec4 mxT=mxA4(mxUv,5.,${SCALE[5]});mxPave=smoothstep(.07,.24,mxT.r-mxT.b);
    diffuseColor.rgb=mix(diffuseColor.rgb*(.62+.5*mxBroad),mxT.rgb*vec3(.8,.6,.48),mxPave*.85);${GRIME}
    ${useB?`vec4 mxN=mxB4(mxUv,5.,${SCALE[5]});mxBump=mxN.xy*2.-1.;mxRough=mxN.b;`:''}`:`
    diffuseColor.rgb*=mix(1.,.55+.95*texture2D(mxKit,mxUv*1.7).b,.6*mxNear);${GRIME}${model||ownMap?WEATHER:''}`)+`}`));
   if(kind!=='form'){
    // The scan's own roughness, then damp (duller, darker) and standing water (a mirror for the lamps).
    f=f.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    {float mxR=roughnessFactor;${ground||road?`if(mxRough>=0.)mxR=mix(mxR,min(1.,mxRough*(.74+.5*mxFine2)),mxIn);`:wall?`if(mxRough>=0.)mxR=clamp(mxR*(.45+.75*mxRough)*(.78+.4*mxFine2),.2,1.);`:metal?`if(mxRough>=0.)mxR=mix(mxR*(.7+.6*mxRough),.88,mxPave);`:''}
    roughnessFactor=clamp(mix(mix(mxR,${(ground||road)&&!OLD?'mix(.3,.22,mxIn)':'.3'},clamp(mxDamp,0.,1.)*(1.-.8*mxLit)*${ground?'(.12+.5*mxPave)':'.62'}),.05,mxWet),${ground||road?'.07':'.14'},1.);}`);
    if(metal)f=f.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
    metalnessFactor*=1.-.85*mxPave;`);
    // Detail normals in world space on the dominant plane. The road loses Eden's embossed bricks where it turns to asphalt.
    const NORMAL='#include <normal_fragment_maps>';
    if(useB||useD)f=f.replace(NORMAL,`${NORMAL}
    {vec3 mxA=abs(mxWn);vec2 mxB=${model?`(texture2D(mxNorA,mxUv*.9).xy*2.-1.)*.35*mxNear`:ground?`mxBump*mix(1.,.9,mxIn)*mix(.25,1.,mxPave)*(1.-.6*mxDamp)*(1.-mxWet)`:road?lite?'mxBump':`mix((texture2D(mxNorA,mxUv*.9).xy*2.-1.)*.35*mxNear,mxBump*.9*(1.-mxWet),mxIn)`:`mxBump*.9`};
     vec3 mxT=mxA.y>max(mxA.x,mxA.z)?vec3(mxB.x,0.,mxB.y):(mxA.x>mxA.z?vec3(0.,mxB.y,mxB.x):vec3(mxB.x,mxB.y,0.));normal=normalize(normal+(viewMatrix*vec4(mxT,0.)).xyz);}`);
    if(road)f=f.replace(NORMAL,`mxN0=normal;
    ${NORMAL}
    normal=normalize(mix(normal,mxN0,mxIn));`);
   }
   f=f.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
    if(mxGlow>0.){vec3 mxFn=abs(normalize(cross(dFdx(vMx),dFdy(vMx))));vec2 mxP=(mxFn.x>mxFn.z?vMx.zy:vMx.xy)*7.;if(mxFn.y>.7)mxP=vMx.xz*7.;vec2 mxCell=floor(mxP),mxF=clamp(fract(mxP),.08,.92);float mxId=floor(mxHash(mxCell+floor(mxTime*9.))*64.);
     float mxG=texture2D(mxKit,(vec2(mod(mxId,8.),floor(mxId/8.))+vec2(mxF.x,1.-mxF.y))/8.).r;vec2 mxEdge=abs(fract(mxP*.5)-.5);
     totalEmissiveRadiance+=${GREEN}*mxGlow*(mxG*.62+.018+smoothstep(.44,.5,max(mxEdge.x,mxEdge.y))*.16+pow(mxGlow,8.)*.25);}`+(interior?`
    { // A room behind the glass (interior mapping): the view ray, from the pane into a grid of rooms 3.4 x 3.1 x 4.2 m, meets
      // a back wall, a side wall, the floor or the ceiling. Some rooms have a lamp on, some curtains, most are dark.
     vec3 mxV=normalize(vMx-cameraPosition),mxN=normalize(cross(dFdx(vMx),dFdy(vMx)));if(dot(mxN,mxV)>0.)mxN=-mxN;
     vec3 mxTg=cross(vec3(0.,1.,0.),mxN);mxTg=length(mxTg)<.2?vec3(1.,0.,0.):normalize(mxTg);
     vec3 mxD=vec3(dot(mxV,mxTg),mxV.y,max(dot(mxV,-mxN),.05)),mxO=vec3(dot(vMx,mxTg),vMx.y,0.),mxCs=vec3(3.4,3.1,4.2);
     vec3 mxC=floor(mxO/mxCs);mxC.z=0.;vec3 mxB=(mxC+step(0.,mxD))*mxCs;mxB.z=mxCs.z;
     vec3 mxT3=(mxB-mxO)/mxD;float mxTm=min(mxT3.x,min(mxT3.y,mxT3.z));vec3 mxHp=mxO+mxD*mxTm,mxFr=(mxHp-mxC*mxCs)/mxCs;
     vec2 mxRid=mxC.xy+vec2(floor(dot(vMx,mxN)*1.7)*7.13,mxN.x*3.1);float mxOn2=step(.62,mxHash(mxRid)),mxTone=mxHash(mxRid+7.);
     vec3 mxSurf=mxTm==mxT3.z?mix(vec3(.50,.42,.33),vec3(.36,.40,.36),step(.5,mxTone))*(.86+.14*step(.5,fract(mxFr.x*7.))):(mxTm==mxT3.y?(mxD.y<0.?vec3(.22,.15,.10):vec3(.62,.58,.52)):vec3(.44,.38,.31));
     vec3 mxLamp=(vec3(.5,.86,.45)-mxFr)*vec3(mxCs.x,mxCs.y,mxCs.z);float mxFall=1./(1.+dot(mxLamp,mxLamp)*.35);
     vec3 mxRoom=mxSurf*mix(vec3(.010,.012,.016),vec3(1.,.70,.42)*(.55+.5*mxTone)*mxFall*1.6,mxOn2);
     float mxCur=step(.72,mxHash(mxRid+13.))*(1.-smoothstep(.18,.24,min(fract(mxO.x/mxCs.x),1.-fract(mxO.x/mxCs.x))));
     mxRoom=mix(mxRoom,vec3(.30,.12,.09)*(.75+.25*sin(mxO.x*40.))*mix(.02,.55,mxOn2),mxCur);
     totalEmissiveRadiance=mxRoom*mxOn*(1.-mxGlow);}`:'')+(model||ownMap||wall||metal?`
    ${wash?`{ // Architectural uplights: pools of warm light climbing the walls between the piers, cool moonlight on what faces up.
${OLD?`     float mxPool=.35+.65*pow(.5+.5*cos(mxUv.x*1.05),3.);totalEmissiveRadiance+=diffuseColor.rgb*mxOn*(vec3(1.,.62,.30)*(1.-abs(mxWn.y))*mxPool*(exp(-max(vMx.y,0.)*.42)*.5+exp(-max(vMx.y,0.)*.16)*.13)+vec3(.16,.30,.27)*max(mxWn.y,0.)*.16+vec3(.03,.06,.048));`:`     float mxPool=.08+.92*pow(.5+.5*cos(mxUv.x*1.05),5.);totalEmissiveRadiance+=diffuseColor.rgb*mxOn*(vec3(1.,.66,.36)*(1.-abs(mxWn.y))*mxPool*(exp(-max(vMx.y,0.)*.55)*.34+exp(-max(vMx.y,0.)*.22)*.06)+vec3(.20,.25,.32)*max(mxWn.y,0.)*.16+vec3(.028,.034,.042));`}}`:fill?`
    // the unwashed landmark walls keep the wash's cool part only: the moonlit sky on what faces up, a faint fill elsewhere
    totalEmissiveRadiance+=diffuseColor.rgb*mxOn*(vec3(.20,.25,.32)*max(mxWn.y,0.)*.16+vec3(.028,.034,.042));`:''}${OLD?`
    {float mxWall=1.-smoothstep(.3,.5,abs(mxWn.y));if(mxWall*mxOn>0.){vec2 mxP=vec2(mxUv.x*3.6,vMx.y*3.6),mxCell=floor(mxP);float mxCh=mxHash(vec2(mxCell.x,11.));
     // A column here and there down a wall still shows the program running.
     if(mxCh>.972){float mxLen=26.,mxDrop=mod(mxCell.y+mxTime*(2.+mxCh*3.)*1.6+mxCh*997.,90.),mxTail=mxDrop<mxLen?exp(-mxDrop*.15):0.;
      if(mxTail>.01){float mxId=step(.5,mxBit(-mxCell.y+mxCell.x*64.));vec2 mxF=clamp(fract(mxP),.08,.92);float mxG=texture2D(mxKit,(vec2(mxId,0.)+vec2(mxF.x,1.-mxF.y))/8.).r;totalEmissiveRadiance+=${GREEN}*mxG*mxTail*.5*mxOn;}}}}`:''}`:''));
   if(ownMap){ // the building's own maps, read at world-space coordinates (normal maps follow: three derives their frame from the uv)
    f=f.replace(/#include <(map_fragment|normal_fragment_begin|normal_fragment_maps|roughnessmap_fragment|metalnessmap_fragment|aomap_fragment|emissivemap_fragment)>/g,(m,n)=>T.ShaderChunk[n]); // the uv names live inside these chunks
    const at=f.indexOf('void main()');f=f.slice(0,at)+'vec2 mxWuv=vec2(0.);\n'+f.slice(at).replace(/\bv(Map|NormalMap|RoughnessMap|MetalnessMap|AoMap|EmissiveMap)Uv\b/g,'mxWuv')
     .replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
    {vec3 mxQ=abs(normalize(cross(dFdx(vMx),dFdy(vMx))));mxWuv=(mxQ.y>max(mxQ.x,mxQ.z)?vMx.xz:(mxQ.x>mxQ.z?vec2(vMx.z,-vMx.y):vec2(vMx.x,-vMx.y)))*.4;}`);}
   sh.fragmentShader=f;};
  material.customProgramCacheKey=()=>key()+'|mx11'+kind+lean+wash+lite+(facade?layer:'')+(weathered?'w':'')+(fill?'f':'')+(own&&own!==T.Material.prototype.onBeforeCompile?String(own).length:'');
  material.needsUpdate=true;return form;
 }
 function surface(T,object,{kind='model',skip=null,wash=false}={}){
  if(!object)return;object.traverse(o=>{if(!o.isMesh||o.isSkinnedMesh||skip?.(o))return;for(const m of [].concat(o.material||[])){if(!m?.isMeshStandardMaterial||m.transparent||m.alphaTest>0)continue;
   // A material may name its own kind and wash (night-district.js does, for the landmarks' walls, timber and glass).
   const glows=m.emissive&&m.emissiveIntensity>.5&&!m.emissiveMap&&m.emissive.getHex();const bare=m.metalness>.5&&!m.metalnessMap;patch(T,m,m.userData.mxKind||(glows?'form':bare?(kind==='auto'&&!m.map&&m.roughness>.3?'metal':'form'):kind==='auto'?(m.normalMap||m.map&&m.map.image?.width>300?'model':'stone'):kind),m.userData.mxWash??wash);
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
  const gold=new T.MeshStandardMaterial({color:0xd9ac55,metalness:.9,roughness:.28,emissive:0x3a2506,emissiveIntensity:.35}),linen=new T.MeshStandardMaterial({color:0x5c5344,roughness:.95,side:T.DoubleSide}),wax=new T.MeshStandardMaterial({color:0xb79a6c,roughness:.6,emissive:0x8a5520,emissiveIntensity:.35}),flame=new T.MeshBasicMaterial({color:new T.Color(3,1.9,.8),toneMapped:false});
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
  const warm=new T.PointLight(0xffb868,20,17,1.55);warm.position.set(0,2.5,2.5);warm.name='Altar light';g.add(warm);
  const high=new T.PointLight(0xffe3b0,24,17,1.6);high.position.set(0,6.6,3.2);high.name='Altar light';g.add(high);
  surface(T,g,{kind:'concrete',skip:o=>o.material===wood||o.material===linen||o.material===gold||o.material===wax||Array.isArray(o.material)});for(const m of [wood,linen,gold,wax,thorn])patch(T,m,'form');
  g.updateMatrixWorld(true);g.traverse(o=>{o.matrixAutoUpdate=false;});
  // Steps are walkable; only the table and the cross's base block. Off in an expedition, whose server has no altar.
  const surfaces=STEPS.map(([r,top])=>({minX:x-r*.86,maxX:x+r*.86,minZ:z-r*.86,maxZ:z+r*.86,top,bottom:-1,wall:false,prop:'altar'}));
  const table={minX:x-1.3,maxX:x+1.3,minZ:z-.15,maxZ:z+1.25,top:1.56,bottom:-1,wall:true,prop:'altar'};surfaces.push(table);
  const walls=[[x,z+.55,2.6,1.35,1.56],[x,z-.75,1.5,1.1,1.03],[x,z-.75,.5,.4,7]];
  return {group:g,surfaces,walls,candles,flames,air:[{position:new T.Vector3(x,2.2,z+1.2),color:new T.Color(1,.66,.3),power:.016},{position:new T.Vector3(x,6.2,z-.5),color:new T.Color(1,.85,.55),power:.016}],lights:[warm,high],
   covers:(px,pz,m=0)=>Math.hypot(px-x,pz-z)<5+m,
   update(t){const k=still()?1:1+.07*Math.sin(t*9.)+.05*Math.sin(t*23.7);warm.intensity=20*k;if(still())return;flames.forEach((f,i)=>{f.scale.y=2.1+.35*Math.sin(t*11.+i*1.7);f.updateMatrix();});}};
 }
 // ---- what is underfoot (for footsteps, splashes, decals): the same zones the ground shader draws, from the same noise.
 function noise(u,v,ch){const N=512,x=(u-Math.floor(u))*N-.5,y=(v-Math.floor(v))*N-.5,x0=Math.floor(x),y0=Math.floor(y),tx=x-x0,ty=y-y0,at=(i,j)=>kitData[(((j+N)%N)*N+(i+N)%N)*4+ch]/255;return(at(x0,y0)*(1-tx)+at(x0+1,y0)*tx)*(1-ty)+(at(x0,y0+1)*(1-tx)+at(x0+1,y0+1)*tx)*ty;}
 const smooth=(a,b,v)=>{v=Math.min(1,Math.max(0,(v-a)/(b-a)));return v*v*(3-2*v);};
 // type: 'brick' (Eden's road, before the door at z -22), 'asphalt' (the road beyond it and its shoulders), 'paving' (round
 // the altar and down the lane), 'concrete' (cracked slabs), 'earth' (soil and weeds), 'stone' (the altar's steps);
 // null on Eden's side off the road, which is not this file's ground. wet: standing water. damp 0..1.
 function ground(x,z){
  const onRoad=Math.abs(x-11.7)<1.97;if(z>-22)return {type:onRoad?'brick':null,wet:false,damp:0};
  const A=root.nightLayout?.arena||{x:12,z:-62},d=Math.hypot(x-A.x,z-A.z);if(d<4.1)return {type:'stone',wet:false,damp:0};
  if(!kitData)return {type:onRoad?'asphalt':'earth',wet:false,damp:0};
  const broad=noise(x*.023,z*.023,1),fine=noise(x*.19,z*.19,2),damp=smooth(.45,.62,broad),puddle=(broad-(OLD?.6:.55))+(fine-.5)*.08>.05;
  const plaza=Math.max(1-smooth(8.2,9.8,d+broad*2-1),(1-smooth(1.8,3.4,Math.abs(z+63.5)+fine*1.6-.8))*(1-smooth(26,32,Math.abs(x-12)))),road=1-smooth(2.6,4.4,Math.abs(x-11.7)+fine*2-1);
  const slab=smooth(.46,.56,broad+.12*(fine-.5)+.24*(1-smooth(16,30,d)));
  const type=plaza>.5?'paving':onRoad||road>.5?'asphalt':slab>.5?'concrete':'earth';
  const edge=onRoad&&!OLD?smooth(1.25,2,Math.abs(x-11.7)+fine*.5-.2):0,dirt=edge*smooth(.3,.62,noise(x*.61,z*.61,2)+.45*edge);
  return {type,wet:type!=='earth'&&puddle&&dirt<.6,damp:type==='earth'?damp*.45:damp};
 }
 root.edenMatrix={sky,update,patch,surface,form,wave,altar,build,ground,groundType:(x,z)=>ground(x,z).type,layers:LAYERS,strength,time,verses:VERSES,lines:LINES,inspect:()=>({strength:strength.value,forming:forming.length,clouds:up.length})};
})(window);
