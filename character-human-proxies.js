'use strict';
// Realistic MakeHuman / MPFB 2 layers for GardenCharacter: textured skin, eyes,
// brows, lashes and hair. Every asset is a MakeHuman proxy defined against the
// hm08 base mesh, so it follows the creator's body and face morphs exactly.
// Data: assets/character-human-assets.js and assets/mh/ (CC0, see LICENSE.txt).
window.GardenHumanProxies=(()=>{
 const BASE=16054,ROOT='/assets/mh/',textures=new Map(),hair=new Map();
 const linear=(T,rgb)=>new T.Color().setRGB(rgb[0],rgb[1],rgb[2],T.SRGBColorSpace);
 function texture(T,file){
  let t=textures.get(file);
  if(!t){t=new T.TextureLoader().load(ROOT+file);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;t.userData.shared=true;textures.set(file,t);}
  return t;
 }
 // Nearest of light / medium / dark textures by brightness, then tinted to the exact creator tone.
 function skinMaterial(T,a){
  const H=window.GardenHumanAssets,tone=new T.Color(a.skinTone),age=a.age<.4?'young':a.age<.72?'middleage':'old';
  const lum=c=>.2126*c.r+.7152*c.g+.0722*c.b;
  let best=null;
  for(const name of ['light','medium','dark']){const s=H.skins[name+'-'+age],d=Math.abs(lum(linear(T,s.mean))-lum(tone));if(!best||d<best.d)best={s,d};}
  const mean=linear(T,best.s.mean),tint=new T.Color(tone.r/mean.r,tone.g/mean.g,tone.b/mean.b);
  for(const k of ['r','g','b'])tint[k]=Math.max(.25,Math.min(2.2,tint[k]));
  return new T.MeshStandardMaterial({map:texture(T,best.s.file),color:tint,roughness:.62,metalness:0,vertexColors:true});
 }
 function eyeFile(T,color){
  const target=new T.Color(color),H=window.GardenHumanAssets;let best=null;
  for(const e of Object.values(H.eyeTextures)){const c=new T.Color().setRGB(...e.iris,T.SRGBColorSpace),d=(c.r-target.r)**2+(c.g-target.g)**2+(c.b-target.b)**2;if(!best||d<best.d)best={e,d};}
  return best.e.file;
 }
 // Grey tintable textures carry their median (sRGB). Dividing it out lands the median on the chosen colour;
 // the floor keeps very dark sources (afro, braid) from blowing out their highlights.
 function tintFor(T,color,median,gain=1){return new T.Color(color).multiplyScalar(gain/Math.max(.15,Math.pow(median,2.2)));}
 // MakeHuman fitting: barycentric blend of three base vertices plus an offset scaled per axis.
 function fit(proxy,P,morph,data,shape){
  const ex=[];for(let i=0;i<proxy.extra.p.length;i+=3)ex.push(...morph(proxy.extra.p.slice(i,i+3)));
  const get=(i,j)=>i<BASE?P[i*3+j]:ex[(i-BASE)*3+j],src=i=>i<BASE?i:proxy.extra.from[i-BASE];
  const s=proxy.scale.map(([a,b,den],j)=>Math.abs(P[a*3+j]-P[b*3+j])/den);
  const n=proxy.refs.length/3,pos=new Float32Array(n*3),bones=new Uint16Array(n*4),weights=new Float32Array(n*4);
  for(let i=0;i<n;i++){
   const v=[0,0,0];
   for(let k=0;k<3;k++){const ref=proxy.refs[i*3+k],w=proxy.w[i*3+k];for(let j=0;j<3;j++)v[j]+=w*get(ref,j);}
   for(let j=0;j<3;j++)v[j]+=proxy.off[i*3+j]*s[j];
   if(shape)shape(v);
   pos.set(v,i*3);
   const mix=new Map();
   for(let k=0;k<3;k++){const w=Math.max(0,proxy.w[i*3+k]),from=src(proxy.refs[i*3+k]);for(let b=0;b<4;b++){const bone=data.indices[from*4+b];mix.set(bone,(mix.get(bone)||0)+w*data.weights[from*4+b]);}}
   const top=[...mix].sort((x,y)=>y[1]-x[1]).slice(0,4),total=top.reduce((t,x)=>t+x[1],0)||1;
   top.forEach(([bone,w],b)=>{bones[i*4+b]=bone;weights[i*4+b]=w/total;});
  }
  return {pos,bones,weights};
 }
 // Expand per-vertex data to UV-split corners. Normals come from the welded mesh so seams stay invisible.
 function geometry(T,pos,normals,bones,weights,corners,uv,tris,colors){
  if(!normals){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));g.setIndex(tris.map(c=>corners[c]));g.computeVertexNormals();normals=g.attributes.normal.array;g.dispose();}
  const n=corners.length,p=new Float32Array(n*3),nn=new Float32Array(n*3),si=new Uint16Array(n*4),sw=new Float32Array(n*4);
  for(let c=0;c<n;c++){const v=corners[c];for(let j=0;j<3;j++){p[c*3+j]=pos[v*3+j];nn[c*3+j]=normals[v*3+j];}for(let j=0;j<4;j++){si[c*4+j]=bones[v*4+j];sw[c*4+j]=weights[v*4+j];}}
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.BufferAttribute(p,3));g.setAttribute('normal',new T.BufferAttribute(nn,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  g.setAttribute('skinIndex',new T.BufferAttribute(si,4));g.setAttribute('skinWeight',new T.BufferAttribute(sw,4));
  if(colors)g.setAttribute('color',new T.BufferAttribute(colors,3));
  g.setIndex(tris);return g;
 }
 function loadHair(asset){
  if(!hair.has(asset))hair.set(asset,fetch(ROOT+'hair-'+asset+'.json').then(r=>{if(!r.ok)throw new Error('Hair '+asset+' failed to load');return r.json();}).then(j=>{hair.set(asset,j);return j;},e=>{hair.delete(asset);throw e;}));
  return hair.get(asset);
 }
 // ---- Leaf coverings -------------------------------------------------------------
 let leafTexture=null;const anchors=new Map();
 function leafMap(T){
  if(leafTexture)return leafTexture;
  const c=document.createElement('canvas');c.width=256;c.height=512;const g=c.getContext('2d');
  // Lobed fig leaf, stem at the top of the canvas.
  const outline=[[128,18],[150,40],[196,46],[214,92],[246,118],[232,170],[250,224],[214,250],[226,316],[188,330],[176,404],[146,420],[128,498],[110,420],[80,404],[68,330],[30,316],[42,250],[6,224],[24,170],[10,118],[42,92],[60,46],[106,40]];
  g.beginPath();outline.forEach(([x,y],i)=>{const [px,py]=outline[(i+outline.length-1)%outline.length];if(i)g.quadraticCurveTo(px,py,(px+x)/2,(py+y)/2);else g.moveTo(x,y);});g.closePath();
  const fill=g.createRadialGradient(128,200,20,128,240,280);fill.addColorStop(0,'#6f9a3e');fill.addColorStop(.6,'#4f7a2c');fill.addColorStop(1,'#33561f');g.fillStyle=fill;g.fill();
  g.save();g.clip();
  for(let i=0;i<900;i++){g.fillStyle='rgba('+(i%2?'20,45,10':'150,190,90')+','+(.04+Math.random()*.05)+')';g.fillRect(Math.random()*256,Math.random()*512,2+Math.random()*5,2+Math.random()*5);}
  g.strokeStyle='rgba(190,215,140,.75)';g.lineCap='round';
  g.lineWidth=5;g.beginPath();g.moveTo(128,10);g.quadraticCurveTo(132,250,128,490);g.stroke();
  g.lineWidth=2.4;for(const [y,dx,dy] of [[70,96,20],[130,112,60],[200,118,50],[270,100,62],[340,62,60]])for(const s of [-1,1]){g.beginPath();g.moveTo(128,y);g.quadraticCurveTo(128+s*dx*.5,y+dy*.25,128+s*dx,y+dy);g.stroke();}
  g.restore();
  leafTexture=new T.CanvasTexture(c);leafTexture.colorSpace=T.SRGBColorSpace;leafTexture.anisotropy=4;leafTexture.userData.shared=true;
  return leafTexture;
 }
 // Torso vertex (hm08 coordinates, arms excluded) in a horizontal band facing a direction around the body.
 function anchor(data,y,dx,dz,cz,band=.12){
  const key=[y,dx.toFixed(3),dz.toFixed(3),cz].join();if(anchors.has(key))return anchors.get(key);
  let best=-1,score=-Infinity;const P=data.positions;
  const arm=i=>{let w=0;for(let k=0;k<4;k++)if([5,6,7,11,12,13].includes(data.indices[i*4+k]))w+=data.weights[i*4+k];return w>.2;};
  for(let i=0;i<13380;i++){const py=P[i*3+1];if(Math.abs(py-y)>band||arm(i))continue;const x=P[i*3],z=P[i*3+2]-cz,l=Math.hypot(x,z)||1,sc=(x*dx+z*dz)/l+l*.01;if(sc>score){score=sc;best=i;}}
  anchors.set(key,best);return best;
 }
 function leaves(T,data,morph,rigged){
  const pos=[],uv=[],color=[],bones=[],weights=[],index=[],P=data.positions;
  const base=i=>[P[i*3],P[i*3+1],P[i*3+2]];
  const weightsOf=i=>{bones.push(...data.indices.slice(i*4,i*4+4));weights.push(...data.weights.slice(i*4,i*4+4));};
  const tone=(k,v)=>{const c=new T.Color().setHSL(.24+((k*37)%11)/110,.55,.42+((k*53)%7)/70);return [c.r*v,c.g*v,c.b*v];};
  // Radial body surface at height y in direction th (hm08 units), measured from the torso axis.
  const radius=(y,dx,dz,cz)=>{const b=base(anchor(data,y,dx,dz,cz));return Math.max(.3,b[0]*dx+(b[2]-cz)*dz);};
  // One leaf that hangs from yTop to yBottom and rests on the body surface, flaring outward at the hem.
  function leaf(k,th,yTop,yBottom,cz,lift,width,flare){
   const start=pos.length/3,cols=4,rows=7,dx=Math.sin(th),dz=Math.cos(th),id=anchor(data,yTop,dx,dz,cz);
   for(let r=0;r<=rows;r++){
    const t=r/rows,y=yTop+(yBottom-yTop)*t,rad=radius(y,dx,dz,cz)+lift+flare*t*t;
    for(let c=0;c<=cols;c++){
     const u=c/cols,across=(u-.5)*width*(1-.25*t*t),cup=.08*width*(1-(2*u-1)**2);
     const p=[dx*(rad+cup)+dz*across,y,cz+dz*(rad+cup)-dx*across];
     pos.push(...morph(p));uv.push(u,1-t);color.push(...tone(k,.9+.1*Math.sin(u*3+t*2)));weightsOf(id);
     if(r<rows&&c<cols){const q=start+r*(cols+1)+c;index.push(q,q+1,q+cols+1,q+1,q+cols+2,q+cols+1);}
    }
   }
  }
  // Vine that holds a ring of leaves.
  function vine(y,cz,lift,count=24){
   const start=pos.length/3,sides=5,r=.04;
   for(let i=0;i<=count;i++){
    const th=i/count*Math.PI*2,dx=Math.sin(th),dz=Math.cos(th),id=anchor(data,y,dx,dz,cz),rad=radius(y,dx,dz,cz)+lift;
    for(let s=0;s<=sides;s++){const a=s/sides*Math.PI*2,rr=rad+Math.cos(a)*r;pos.push(...morph([dx*rr,y+Math.sin(a)*r,cz+dz*rr]));uv.push(.5,.02);color.push(.34,.27,.16);weightsOf(id);
     if(i<count&&s<sides){const q=start+i*(sides+1)+s;index.push(q,q+sides+1,q+1,q+1,q+sides+1,q+sides+2);}}
   }
  }
  // Hip girdle: two staggered rings of overlapping leaves from the hip bone to mid-thigh.
  vine(1.0,.2,.05);
  for(const [ring,count,top,bottom,lift,width,flare] of [[0,16,1.0,-1.25,.06,.82,.35],[1,16,.9,-1.6,.11,.9,.45]])
   for(let i=0;i<count;i++)leaf(i+ring*20,(i+ring*.5)/count*Math.PI*2,top,bottom,.2,lift,width,flare);
  // Chest band: a vine under the arms and a ring of leaves wrapping the chest.
  vine(4.6,.25,.04);
  for(const [ring,count,top,bottom,lift,width] of [[0,14,4.6,3.35,.05,.78],[1,14,4.5,3.2,.09,.82]])
   for(let i=0;i<count;i++)leaf(50+i+ring*20,(i+ring*.5)/count*Math.PI*2,top,bottom,.25,lift,width,.08);
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('color',new T.Float32BufferAttribute(color,3));
  g.setAttribute('skinIndex',new T.Uint16BufferAttribute(bones,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));g.setIndex(index);g.computeVertexNormals();
  const m=new T.MeshStandardMaterial({map:leafMap(T),vertexColors:true,alphaTest:.5,side:T.DoubleSide,roughness:.72,metalness:0});
  return rigged(g,m,'Leaf coverings');
 }
 return {
  ready:()=>!!window.GardenHumanAssets,
  // Builds every realistic layer. `rigged(geometry,material,name)` binds a mesh to the shared skeleton.
  build({T,a,data,positions,normals,morph,rigged,headCenter,isDisposed,smooth}){
   const H=window.GardenHumanAssets,meshes={};
   // Skin: the real hm08 UV layout over the whole body; Eden avatars wear only leaves.
   const body=H.skin,tris=body.tris;
   const skin=skinMaterial(T,a),shaved=a.hairStyle==='none';
   // Scalp under the hair takes the hair colour so alpha gaps between strands read as dense hair.
   const scalp=new T.Color(a.hairColor),tone=new T.Color(a.skinTone),colors=new Float32Array(body.corners.length*3);
   const ratio=['r','g','b'].map(k=>Math.min(2.5,scalp[k]/Math.max(.001,tone[k])));
   for(let c=0;c<body.corners.length;c++){
    const i=body.corners[c],x=Math.abs(data.positions[i*3]),y=data.positions[i*3+1],z=data.positions[i*3+2];
    const line=7.07+smooth(.35,1.1,z)*.69+.08*x,edge=line+(Math.max(line,7.68)-line)*smooth(.68,.82,x);
    const t=shaved?0:smooth(.03,.2,y-edge);
    for(let j=0;j<3;j++)colors[c*3+j]=1+(ratio[j]-1)*t;
   }
   const bodyBones=new Uint16Array(data.indices),bodyWeights=new Float32Array(data.weights);
   meshes.skin=rigged(geometry(T,new Float32Array(positions),normals,bodyBones,bodyWeights,body.corners,body.uv,tris,colors),skin,'Human skin');
   const layer=(proxy,material,name,shape)=>{const f=fit(proxy,positions,morph,data,shape);const mesh=rigged(geometry(T,f.pos,null,f.bones,f.weights,proxy.corners,proxy.uv,proxy.tris),material,name);return mesh;};
   meshes.eyes=layer(H.eyes,new T.MeshStandardMaterial({map:texture(T,eyeFile(T,a.eyeColor)),alphaTest:.5,roughness:.18,metalness:0}),'Eyes');
   const brow=new T.MeshStandardMaterial({map:texture(T,'eyebrow.webp'),color:tintFor(T,a.hairColor,H.tint.eyebrow,.85),transparent:true,depthWrite:false,roughness:.9,alphaTest:Math.max(.08,Math.min(.6,.32-(a.browWeight-1)*.55)),polygonOffset:true,polygonOffsetFactor:-2,side:T.DoubleSide});
   meshes.brows=layer(H.eyebrows,brow,'Eyebrows');meshes.brows.castShadow=false;meshes.brows.renderOrder=2;
   const lash=new T.MeshStandardMaterial({map:texture(T,'eyelashes.webp'),color:tintFor(T,a.hairColor,H.tint.eyelashes,.35),transparent:true,depthWrite:false,roughness:.8,alphaTest:.05,side:T.DoubleSide});
   meshes.lashes=layer(H.eyelashes,lash,'Eyelashes');meshes.lashes.castShadow=false;meshes.lashes.renderOrder=2;
   const style=H.hair[a.hairStyle],asset=style?.asset;
   if(asset){
    const volume=a.hairVolume??1,length=a.hairLength??1,c=headCenter;
    const shape=v=>{
     const k=1+(volume-1)*.35;v[0]=c.x+(v[0]-c.x)*k;v[2]=c.z+(v[2]-c.z)*k;if(v[1]>c.y)v[1]=c.y+(v[1]-c.y)*(1+(volume-1)*.2);
     else v[1]=c.y+(v[1]-c.y)*length;
    };
    const make=proxy=>{
     if(isDisposed())return;
     const m=new T.MeshStandardMaterial({map:texture(T,'hair-'+asset+'.webp'),color:tintFor(T,a.hairColor,style.median),alphaTest:.42,alphaToCoverage:true,side:T.DoubleSide,roughness:asset==='afro01'?.95:.68,metalness:0});
     meshes.hair=layer(proxy,m,'MakeHuman hair',shape);
    };
    const cached=hair.get(asset);
    if(cached&&!(cached instanceof Promise))make(cached);else loadHair(asset).then(make,e=>console.warn(e));
   }
   meshes.leaves=leaves(T,data,morph,rigged);
   return meshes;
  },
  preload(style){const asset=window.GardenHumanAssets?.hair[style]?.asset;if(asset)loadHair(asset).catch(()=>{});}
 };
})();
