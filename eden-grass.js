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
// Plants part around you: four "pushers" — your feet now and where they were 0.35, 0.8 and 1.4 s ago, each weaker —
// so grass and flowers lean away as you walk through and spring back over a second or so behind you.
window.edenPush=(()=>{let uniform=null,lastSample=-1;const trail=[],AGES=[0,.35,.8,1.4],WEIGHTS=[1,.55,.25,.1];
 return {
  uniform(T){uniform??={value:AGES.map(()=>new T.Vector4())};return uniform;},
  // feet: world position of the visitor's feet; seconds: any steady clock
  update(feet,seconds){if(!uniform)return;
   if(!trail.length||seconds-lastSample>.1){trail.unshift({x:feet.x,y:feet.y,z:feet.z,t:seconds});lastSample=seconds;if(trail.length>20)trail.pop();}
   else Object.assign(trail[0],{x:feet.x,y:feet.y,z:feet.z});
   AGES.forEach((age,i)=>{const p=trail.find(q=>seconds-q.t>=age)||trail[trail.length-1];uniform.value[i].set(p.x,p.y,p.z,WEIGHTS[i]);});},
  clear(){uniform?.value.forEach(v=>{v.w=0;});trail.length=0;}
 };
})();
// Bend an instanced plant material away from the pushers: the top of each plant (0.55 m and up from its root) leans up
// to `amount` metres and dips a little; anything more than 0.85 m away or on another floor is untouched.
window.edenBend=(T,shader,amount)=>{
 shader.uniforms.edenPush=window.edenPush.uniform(T);
 shader.vertexShader='uniform vec4 edenPush[4];\n'+shader.vertexShader.replace('#include <project_vertex>',`#ifdef USE_INSTANCING
 {mat4 edenM=modelMatrix*instanceMatrix;vec3 edenRootW=(edenM*vec4(0.,0.,0.,1.)).xyz,edenW=(edenM*vec4(transformed,1.)).xyz;vec2 edenOff=vec2(0.);
  for(int i=0;i<4;i++){vec4 p=edenPush[i];if(p.w<=0.)continue;vec2 d=edenRootW.xz-p.xz;float r=length(d);edenOff+=(r>.001?d/r:vec2(0.))*p.w*(1.-smoothstep(.15,.85,r))*step(abs(edenRootW.y-p.y),1.2);}
  float edenL=length(edenOff);if(edenL>.001){float k=clamp((edenW.y-edenRootW.y)/.55,0.,1.)*${amount.toFixed(3)};vec2 lean=edenOff/max(edenL,1.)*k;
   transformed+=inverse(mat3(edenM))*vec3(lean.x,-min(edenL,1.)*k*.4,lean.y);}}
 #endif
 #include <project_vertex>`);
};
// verge(x,z): extra ground past zMax that should still grow grass (the brick road's verges inside the garden).
window.createEdenGrass=function(T,garden,{openGround,height,mobile=false,wind,zMax=-9.2,cell=0,radius=0,tall=1,verge=null,vergeMin=zMax}){
 const R=radius||(mobile?16:30),CELL=cell||(mobile?.95:.58),capacity=Math.ceil(Math.PI*R*R/(CELL*CELL)*1.15);
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
  window.edenBend(T,shader,.32);
 };
 material.customProgramCacheKey=()=>'eden-grass-bend';
 const mesh=new T.InstancedMesh(geometry,material,capacity);mesh.name='Eden grass';mesh.count=0;mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.castShadow=false;mesh.visible=false;garden.add(mesh);
 let mask=null,N=0;
 const ready=new Promise(resolve=>{const img=new Image();img.onload=()=>{N=img.width;const c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);const d=g.getImageData(0,0,N,N).data;mask=new Uint8Array(N*N);for(let i=0;i<N*N;i++)mask[i]=d[i*4];resolve();};img.onerror=()=>{console.warn('Grass mask unavailable; grass off');resolve();};img.src='/assets/eden-bake/grass-mask.png';});
 const blocked=(x,z)=>{const u=Math.floor((x+120)/240*N),v=Math.floor((z+120)/240*N);for(const [a,b] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){if(mask[(v+b)*N+u+a])return true;}return false;};
 const hash=(a,b,s)=>{const t=Math.sin(a*127.1+b*311.7+s*74.7)*43758.5453;return t-Math.floor(t);};
 const m=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),pos=new T.Vector3(),scl=new T.Vector3();let cx=Infinity,cz=Infinity;
 function rebuild(x,z){
  let count=0;const i0=Math.floor((x-R)/CELL),i1=Math.floor((x+R)/CELL),j0=Math.floor((z-R)/CELL),j1=Math.floor((z+R)/CELL);
  for(let j=j0;j<=j1&&count<capacity;j++)for(let i=i0;i<=i1&&count<capacity;i++){
   const px=(i+hash(i,j,1))*CELL,pz=(j+hash(i,j,2))*CELL;const onVerge=pz<zMax;if(onVerge&&!(verge&&verge(px,pz)))continue;const d=Math.hypot(px-x,pz-z);if(d>R)continue;
   // The bake's mask treats ground past zMax as floor, so verge tufts rely on verge() and openGround() instead.
   if((!onVerge&&blocked(px,pz))||openGround(px,pz))continue;
   const fade=1-T.MathUtils.smoothstep(d,R*.72,R),density=hash(i,j,5);if(density<.12+.2*T.MathUtils.smoothstep(d,R*.4,R))continue;
   const s=(.6+hash(i,j,3)*.5)*(.25+.75*fade);pos.set(px,height(px,pz)-.02,pz);q.setFromEuler(e.set(0,hash(i,j,4)*6.283,0));scl.set(s*1.1,s*.4*tall,s*1.1);m.compose(pos,q,scl);mesh.setMatrixAt(count++,m);
  }
  mesh.count=count;mesh.instanceMatrix.needsUpdate=true;
 }
 return {ready,mesh,reset(){cx=cz=Infinity;},
  update(viewer){if(!mask||!N)return false;const far=viewer.z<Math.min(zMax,vergeMin)-R;mesh.visible=!far;if(far||Math.hypot(viewer.x-cx,viewer.z-cz)<3)return false;cx=viewer.x;cz=viewer.z;rebuild(cx,cz);return true;},
  inspect:()=>({count:mesh.count,capacity,radius:R})};
};
