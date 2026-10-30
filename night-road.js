'use strict';
window.createNightRoad=function(T,scene,{sections,roadX,roadStart,roadLength,clearingStart=-Infinity,district,sky,bark,leafMat,roadMaterial,vergeMaterial,clouds,mobile}){
 const smooth=T.MathUtils.smoothstep,parts=[],lights=scene.children.filter(o=>o.isLight).map(light=>({light,intensity:light.intensity,color:light.color.clone(),ground:light.groundColor?.clone()}));
 const originalFog=scene.fog.color.clone(),nightFog=new T.Color(0x192a25),originalRoad=roadMaterial.color.clone(),originalVerge=vergeMaterial.color.clone();
 const moonColor=new T.Color(0xa9c8c1),moonGround=new T.Color(0x14261b),nightRoadColor=new T.Color(0x909f97),nightVerge=new T.Color(0x60775a);
 const trunkGeo=new T.CylinderGeometry(.12,.24,1,7),crownGeo=new T.PlaneGeometry(1,1),dummy=new T.Object3D();
 const forestMat=leafMat.clone();forestMat.color.set(0x657952);forestMat.emissiveIntensity=.035;
 const fernMat=new T.MeshStandardMaterial({map:leafMat.map,alphaTest:.45,side:T.DoubleSide,color:0x476844,roughness:1});
 function noise(index,n,salt=0){let v=Math.imul(index+17,73856093)^Math.imul(n+11,19349663)^Math.imul(salt+7,83492791);v=Math.imul(v^(v>>>16),0x45d9f3b);return ((v^(v>>>16))>>>0)/4294967296;}
 function stamp(mesh,index,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){dummy.position.set(x,y,z);dummy.rotation.set(rx,ry,rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);}
 for(const section of sections){
  const root=new T.Group();root.name='Night road woodland';section.add(root);
  const trunks=new T.InstancedMesh(trunkGeo,bark,80),crowns=new T.InstancedMesh(crownGeo,forestMat,80*7),brush=new T.InstancedMesh(crownGeo,fernMat,120);
  for(const mesh of [trunks,crowns,brush]){mesh.frustumCulled=false;mesh.receiveShadow=true;root.add(mesh);}
  const part={section,root,trunks,crowns,brush,index:0};parts.push(part);section.userData.nightPart=part;
 }
 function recycle(section,index){
  const part=section.userData.nightPart;if(!part)return;
  part.index=index;part.root.visible=index>=0&&section.position.z>clearingStart;
  // Keep all architectural footprints and approach paths free of foliage.
  const occupied=(x,z)=>section.position.z+z> -28||district.clearGround(roadX+x,section.position.z+z);
  let n=0,c=0,b=0;
  for(let i=0;i<(mobile?44:68);i++){
   const side=i%2?1:-1,x=side*(4.6+noise(index,i)*47),z=(noise(index,i,1)-.5)*roadLength;
   if(occupied(x,z))continue;
   const h=5+noise(index,i,2)*6.2,r=.8+noise(index,i,3)*.65;
   stamp(part.trunks,n++,x,h*.46,z,r,h*.92,r,0,noise(index,i,4)*6.28,.055*(noise(index,i,5)-.5));
   for(let k=0;k<7;k++)stamp(part.crowns,c++,x+Math.sin(k*2.4)*1.2,h*(.64+(k%3)*.12),z+Math.cos(k*2.4)*1.2,3.7*r,3.2*r,1,k%2?-.35:.7,k*1.7,noise(index,i,k+10)*.6);
  }
  for(let i=0;i<(mobile?55:100);i++){
   const side=i%2?1:-1,x=side*(3.4+noise(index,i,20)*47),z=(noise(index,i,21)-.5)*roadLength;
   if(occupied(x,z))continue;
   stamp(part.brush,b++,x,.55,z,1.2+noise(index,i,22),1.4,1,0,noise(index,i,23)*6.28,.1);
  }
  for(const [mesh,count] of [[part.trunks,n],[part.crowns,c],[part.brush,b]]){mesh.count=count;mesh.instanceMatrix.needsUpdate=true;}
 }
 parts.forEach(part=>recycle(part.section,part.section.userData.roadIndex||0));
 const starPositions=[];for(let i=0;i<280;i++){const az=noise(44,i)*Math.PI*2,y=.16+noise(44,i,1)*.8,r=Math.sqrt(1-y*y);starPositions.push(Math.cos(az)*r*149,y*149,Math.sin(az)*r*149);}
 const starGeo=new T.BufferGeometry();starGeo.setAttribute('position',new T.Float32BufferAttribute(starPositions,3));const stars=new T.Points(starGeo,new T.PointsMaterial({color:0xcfe4da,size:.16,transparent:true,opacity:0,depthWrite:false,fog:false}));sky.add(stars);
 let amount=0;
 function update(time,viewer){
  amount=smooth(roadStart-viewer.position.z,1,17);sky.material.uniforms.roadNight.value=amount;
  scene.fog.color.copy(originalFog).lerp(nightFog,amount);scene.fog.density=T.MathUtils.lerp(.016,.019,amount);
  for(const state of lights){const l=state.light;l.color.copy(state.color).lerp(moonColor,amount);l.intensity=T.MathUtils.lerp(state.intensity,l.isHemisphereLight?.58:state.intensity>1?.52:.16,amount);if(state.ground)l.groundColor.copy(state.ground).lerp(moonGround,amount);}
  roadMaterial.color.copy(originalRoad).lerp(nightRoadColor,amount);vergeMaterial.color.copy(originalVerge).lerp(nightVerge,amount);
  clouds.forEach(cloud=>{cloud.material.opacity=.65*(1-amount);});stars.material.opacity=amount*.8;
 }
 return {recycle,update,blocks:district.blocks,get amount(){return amount;},inspect:()=>({night:amount,sections:parts.length,trees:parts.reduce((n,p)=>n+(p.root.visible?p.trunks.count:0),0),district:district.inspect()})};
};
