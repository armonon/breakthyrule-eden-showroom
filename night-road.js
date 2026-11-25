'use strict';
window.createNightRoad=function(T,scene,{sections,roadX,roadStart,nightStart=roadStart,roadLength,clearingStart=-Infinity,district,sky,bark,forest,roadMaterial,vergeMaterial,clouds,mobile}){
 const smooth=T.MathUtils.smoothstep,parts=[],lights=scene.children.filter(o=>o.isLight&&!o.userData.bodyLight).map(light=>({light,intensity:light.intensity,color:light.color.clone(),ground:light.groundColor?.clone()}));
 const originalFog=scene.fog.color.clone(),nightFog=new T.Color(0x0a0d12),originalRoad=roadMaterial.color.clone(),originalVerge=vergeMaterial.color.clone();
 const moonColor=new T.Color(0xa8bcd8),moonGround=new T.Color(0x10141a),nightRoadColor=new T.Color(0x97999c),nightVerge=new T.Color(0x62685c);
 const dummy=new T.Object3D(),leafTint=new T.Color();
 function noise(index,n,salt=0){let v=Math.imul(index+17,73856093)^Math.imul(n+11,19349663)^Math.imul(salt+7,83492791);v=Math.imul(v^(v>>>16),0x45d9f3b);return ((v^(v>>>16))>>>0)/4294967296;}
 function stamp(mesh,index,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){dummy.position.set(x,y,z);dummy.rotation.set(rx,ry,rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);}
 for(const section of sections){
  const root=new T.Group();root.name='Night road woodland';section.add(root);
  // Woodland uses the garden's tree and fern templates (eden-flora.js); one wood + one leaf mesh per template.
  const trees=forest.trees.map(kind=>({kind,wood:new T.InstancedMesh(kind.wood,kind.woodMaterial||bark,68),leaves:new T.InstancedMesh(kind.foliage,kind.material,68)})),brush=new T.InstancedMesh(forest.fern.geometry,forest.fern.material,120);
  for(const mesh of [...trees.flatMap(t=>[t.wood,t.leaves]),brush]){mesh.receiveShadow=true;root.add(mesh);}
  const part={section,root,trees,brush,index:0};parts.push(part);section.userData.nightPart=part;
 }
 function recycle(section,index){
  const part=section.userData.nightPart;if(!part)return;
  part.index=index;part.active=index>=0&&section.position.z>clearingStart;part.root.visible=part.active;
  // Keep all architectural footprints and approach paths free of foliage.
  const occupied=(x,z)=>section.position.z+z> -28||district.clearGround(roadX+x,section.position.z+z);
  const counts=part.trees.map(()=>0);let b=0;
  for(let i=0;i<(mobile?44:68);i++){
   const side=i%2?1:-1,x=side*(4.6+noise(index,i)*47),z=(noise(index,i,1)-.5)*roadLength;
   if(occupied(x,z))continue;
   const h=5+noise(index,i,2)*6.2,t=Math.floor(noise(index,i,6)*part.trees.length),tree=part.trees[t],s=h/tree.kind.height,k=counts[t]++;
   for(const mesh of [tree.wood,tree.leaves])stamp(mesh,k,x,0,z,s,s,s,0,noise(index,i,4)*6.28,.04*(noise(index,i,5)-.5));
   tree.leaves.setColorAt(k,leafTint.setHSL(.25+noise(index,i,7)*.05,.22,.5+noise(index,i,8)*.12));
  }
  for(let i=0;i<(mobile?55:100);i++){
   const side=i%2?1:-1,x=side*(3.4+noise(index,i,20)*47),z=(noise(index,i,21)-.5)*roadLength;
   if(occupied(x,z))continue;
   const f=1.1+noise(index,i,22)*.8;stamp(part.brush,b++,x,-.02,z,f,f,f,0,noise(index,i,23)*6.28,0);
  }
  part.trees.forEach((tree,t)=>{for(const mesh of [tree.wood,tree.leaves]){mesh.count=counts[t];mesh.instanceMatrix.needsUpdate=true;}if(tree.leaves.instanceColor)tree.leaves.instanceColor.needsUpdate=true;});
  part.brush.count=b;part.brush.instanceMatrix.needsUpdate=true;
  // Bounds over the stamped instances, so sections out of view are culled like any other mesh.
  for(const mesh of [...part.trees.flatMap(t=>[t.wood,t.leaves]),part.brush])mesh.computeBoundingSphere();
 }
 parts.forEach(part=>recycle(part.section,part.section.userData.roadIndex||0));
 const starPositions=[];for(let i=0;i<280;i++){const az=noise(44,i)*Math.PI*2,y=.16+noise(44,i,1)*.8,r=Math.sqrt(1-y*y);starPositions.push(Math.cos(az)*r*149,y*149,Math.sin(az)*r*149);}
 const starGeo=new T.BufferGeometry();starGeo.setAttribute('position',new T.Float32BufferAttribute(starPositions,3));const stars=new T.Points(starGeo,new T.PointsMaterial({color:0xcfe4da,size:.16,transparent:true,opacity:0,depthWrite:false,fog:false}));sky.add(stars);
 // The night is the program's: its sky (matrix-world.js) closes over the old one as the road darkens.
 const matrixSky=window.edenMatrix?.sky(T)||null;if(matrixSky)sky.add(matrixSky);
 let amount=0,enabled=true,override=null,stage=0,stageTarget=0;
 function update(time,viewer){
  stage+=(stageTarget-stage)*.04;amount=override??Math.max(smooth(nightStart-viewer.position.z,.5,15),stage);sky.material.uniforms.roadNight.value=amount;
  if(matrixSky){matrixSky.visible=amount>.002;window.edenMatrix.update(time,amount);}
  // Sections beyond the fog (~120 m) are not drawn at all.
  for(const part of parts)part.root.visible=enabled&&part.active&&Math.abs(part.section.position.z-viewer.position.z)<roadLength*.5+120;
  scene.fog.color.copy(originalFog).lerp(nightFog,amount);scene.fog.density=T.MathUtils.lerp(.016,matrixSky?.0125:.019,amount);
  // Where the night bake is in force (eden-baked-light.js) it replaces the hemisphere light on every standard surface with
  // far darker measured sky light; what is left of the hemisphere lights the characters and the land beyond the bake, and
  // comes down with it so they do not glow against the baked dark.
  const skyFill=.8-.45*(window.edenBaked?.nightStrength()||0);
  for(const state of lights){const l=state.light;l.color.copy(state.color).lerp(moonColor,amount);l.intensity=T.MathUtils.lerp(state.intensity,l.isHemisphereLight?skyFill:state.intensity>1?2.1:.34,amount);if(state.ground)l.groundColor.copy(state.ground).lerp(moonGround,amount);}
  roadMaterial.color.copy(originalRoad).lerp(nightRoadColor,amount);vergeMaterial.color.copy(originalVerge).lerp(nightVerge,amount);
  clouds.forEach(cloud=>{cloud.material.opacity=.65*(1-amount);});stars.material.opacity=matrixSky?0:amount*.8;
 }
 return {recycle,update,setOverride(v){override=v;},setStage(value){stageTarget=Math.max(0,Math.min(1,value));},get stage(){return stageTarget;},setEnabled(value){enabled=value;if(!value)for(const part of parts)part.root.visible=false;},blocks:district.blocks,get amount(){return amount;},inspect:()=>({night:amount,sections:parts.length,trees:parts.reduce((n,p)=>n+(p.root.visible?p.trees.reduce((m,t)=>m+t.wood.count,0):0),0),district:district.inspect()})};
};
