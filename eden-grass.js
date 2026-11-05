'use strict';
// Near-field grass: crossed cutout cards of real scanned blades (assets/eden-textures/foliage/grass-card.webp), placed
// from a stable hash grid around the viewer, so tufts stay put as you walk and fade out by scale at the ring's edge. A
// top-down mask from the bake keeps them out of stones, floors and the pond. Backlit blades glow (see eden-translucency).
window.edenTranslucency=(shader,strength=.7)=>{
 // Thin leaves let sunlight through: bright when looking toward the sun. Sun direction matches garden.js and app.js.
 shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
 {vec3 edenSunV=normalize((viewMatrix*vec4(-.38,.32,-.8,0.)).xyz);float edenBack=pow(clamp(dot(-normalize(vViewPosition),edenSunV),0.,1.),3.)*.8+.2;
 reflectedLight.directDiffuse+=diffuseColor.rgb*vec3(1.,.93,.62)*edenBack*${strength.toFixed(2)}*max(edenBake.x,0.)*(.35+.65*smoothstep(.3,1.,length(reflectedLight.directDiffuse)));}`);
};
window.createEdenGrass=function(T,garden,{openGround,height,mobile=false,wind,zMax=-9.2}){
 const R=mobile?16:30,CELL=mobile?.95:.58,capacity=Math.ceil(Math.PI*R*R/(CELL*CELL)*1.15);
 const quad=(ax,az)=>[[-.5*ax,0,-.5*az,0,0],[.5*ax,0,.5*az,1,0],[.5*ax,1,.5*az,1,1],[-.5*ax,1,-.5*az,0,1]];
 const p=[],n=[],uv=[],ix=[];let base=0;
 for(const [ax,az] of [[1,0],[.5,.866],[.5,-.866]]){for(const v of quad(ax,az)){p.push(v[0],v[1],v[2]);n.push(0,1,0);uv.push(v[3],v[4]);}ix.push(base,base+1,base+2,base,base+2,base+3);base+=4;}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(p,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(n,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(ix);
 const map=new T.TextureLoader().load('/assets/eden-textures/foliage/grass-card.webp');map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;map.wrapS=T.RepeatWrapping;
 const material=new T.MeshStandardMaterial({map,alphaTest:.5,alphaToCoverage:!mobile,side:T.DoubleSide,roughness:.86,metalness:0,color:0xb4c690});
 material.onBeforeCompile=shader=>{
  shader.uniforms.edenTime=wind;
  shader.vertexShader='uniform float edenTime;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   {vec3 r=instanceMatrix[3].xyz;float h=position.y*position.y;transformed.x+=h*(sin(edenTime*1.4+r.x*.7+r.z*.4)*.09+sin(edenTime*3.3+r.z*2.1)*.025);transformed.z+=h*cos(edenTime*1.1+r.z*.6)*.07;}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',T.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;',''));
  window.edenTranslucency(shader,.28);
 };
 material.customProgramCacheKey=()=>'eden-grass';
 const mesh=new T.InstancedMesh(geometry,material,capacity);mesh.name='Eden grass';mesh.count=0;mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.castShadow=false;mesh.visible=false;garden.add(mesh);
 let mask=null,N=0;
 const ready=new Promise(resolve=>{const img=new Image();img.onload=()=>{N=img.width;const c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);const d=g.getImageData(0,0,N,N).data;mask=new Uint8Array(N*N);for(let i=0;i<N*N;i++)mask[i]=d[i*4];resolve();};img.onerror=()=>{console.warn('Grass mask unavailable; grass off');resolve();};img.src='/assets/eden-bake/grass-mask.png';});
 const blocked=(x,z)=>{const u=Math.floor((x+120)/240*N),v=Math.floor((z+120)/240*N);for(const [a,b] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){if(mask[(v+b)*N+u+a])return true;}return false;};
 const hash=(a,b,s)=>{const t=Math.sin(a*127.1+b*311.7+s*74.7)*43758.5453;return t-Math.floor(t);};
 const m=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),pos=new T.Vector3(),scl=new T.Vector3();let cx=Infinity,cz=Infinity;
 function rebuild(x,z){
  let count=0;const i0=Math.floor((x-R)/CELL),i1=Math.floor((x+R)/CELL),j0=Math.floor((z-R)/CELL),j1=Math.floor((z+R)/CELL);
  for(let j=j0;j<=j1&&count<capacity;j++)for(let i=i0;i<=i1&&count<capacity;i++){
   const px=(i+hash(i,j,1))*CELL,pz=(j+hash(i,j,2))*CELL;if(pz<zMax)continue;const d=Math.hypot(px-x,pz-z);if(d>R)continue;
   if(blocked(px,pz)||openGround(px,pz))continue;
   const fade=1-T.MathUtils.smoothstep(d,R*.72,R),density=hash(i,j,5);if(density<.12+.2*T.MathUtils.smoothstep(d,R*.4,R))continue;
   const s=(.6+hash(i,j,3)*.5)*(.25+.75*fade);pos.set(px,height(px,pz)-.02,pz);q.setFromEuler(e.set(0,hash(i,j,4)*6.283,0));scl.set(s*1.1,s*.4,s*1.1);m.compose(pos,q,scl);mesh.setMatrixAt(count++,m);
  }
  mesh.count=count;mesh.instanceMatrix.needsUpdate=true;
 }
 return {ready,mesh,
  update(viewer){if(!mask||!N)return false;const far=viewer.z<zMax-R;mesh.visible=!far;if(far||Math.hypot(viewer.x-cx,viewer.z-cz)<3)return false;cx=viewer.x;cz=viewer.z;rebuild(cx,cz);return true;},
  inspect:()=>({count:mesh.count,capacity,radius:R})};
};
