'use strict';
window.createRoadPyramid=function(T,scene,{roadX,roadEnd,stone,onChange,reduced}){
 const centerZ=roadEnd-28,half=24,height=34,root=new T.Group();root.name='Pyramid at the end of the road';root.position.set(roadX,0,centerZ);scene.add(root);
 const masonry=stone.clone();masonry.color.set(0xb8beb2);masonry.roughness=.94;masonry.emissive.set(0x687568);masonry.emissiveIntensity=.045;
 const courses=[masonry,masonry.clone(),masonry.clone()];courses[1].color.set(0xa6b0a4);courses[2].color.set(0xc3c5b6);
 const cube=new T.BoxGeometry(1,1,1);
 function box(w,h,d,x,y,z,material=masonry){const mesh=new T.Mesh(cube,material);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);mesh.receiveShadow=true;root.add(mesh);return mesh;}
 const court=stone.clone();court.color.set(0x757f75);
 box(88,.10,96,0,-.035,0,court);
 for(const s of [-1,1]){box(.5,.18,49,s*24.25,.09,0);box(22.6,.18,.5,s*13.2,.09,24.25);}box(49,.18,.5,0,.09,-24.25);
 // Open shell courses leave a true doorway and do not cap the occupied interior.
 for(let i=0;i<48;i++){
  const bottom=half*(1-i/48),top=half*(1-(i+1)/48),h=height/48;
  const vertices=[],uvs=[];
  function face(side,leftBottom,rightBottom,leftTop,rightTop){
   const y0=.18+i*h,y1=y0+h*.985,a=side*Math.PI/2,c=Math.cos(a),s=Math.sin(a),points=[[leftBottom,y0,bottom],[rightBottom,y0,bottom],[rightTop,y1,top],[leftTop,y1,top]],uv=[[0,0],[1,0],[1,1],[0,1]];
   for(const n of [0,1,2,0,2,3]){const [x,y,z]=points[n];vertices.push(x*c+z*s,y,z*c-x*s);uvs.push(...uv[n]);}
  }
  for(let side=0;side<4;side++){if(side===0&&i<6){face(side,-bottom,-1.7,-top,-1.7);face(side,1.7,bottom,1.7,top);}else face(side,-bottom,bottom,-top,top);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();
  const course=new T.Mesh(geometry,courses[i%3]);course.receiveShadow=true;root.add(course);
 }
 for(const s of [-1,1])box(.5,4.65,1.0,s*1.98,2.325,24.4);box(4.5,.55,1.0,0,4.55,24.4);
 const metal=new T.MeshStandardMaterial({color:0x8c9989,metalness:.6,roughness:.38});
 const cap=new T.Mesh(new T.ConeGeometry(1.02,1.44,4),metal);cap.rotation.y=Math.PI/4;cap.position.y=height-.5;root.add(cap);
 const lampMaterial=new T.MeshStandardMaterial({color:0xffe4ba,emissive:0xffbb64,emissiveIntensity:2.2,roughness:.45});
 const lamps=[];
 for(const side of [-1,1]){
  box(1.4,.2,1.4,side*5,.1,31);box(.62,3.8,.62,side*5,2.0,31);
  box(.94,.12,.94,side*5,3.96,31,metal);box(.54,.38,.54,side*5,4.2,31,lampMaterial);box(.82,.1,.82,side*5,4.46,31,metal);
  const lamp=new T.PointLight(0xffca85,12,22,1.7);lamp.position.set(side*5,4.3,30);root.add(lamp);lamps.push(lamp);
 }
 const gathering=window.createPyramidGathering(T,root,{stone,onChange,reduced});
 let unlocked=false;
 const gate=box(3.35,4.1,.4,0,2.05,24.25,metal);
 const seals=[];for(let i=0;i<8;i++)seals.push(box(.20,.22,.045,(i-3.5)*.35,2.15,24.48,lampMaterial.clone()));
 return {
  setPages(count){unlocked=count===8;gate.visible=!unlocked;seals.forEach((s,i)=>{s.visible=!unlocked;s.material.emissiveIntensity=i<count?2.2:.05;});},
  centerZ,clearingStart:roadEnd+24,gathering,ready:gathering.ready,
  blocks(p){const x=p.x-roadX,z=p.z-centerZ;if(!unlocked&&Math.abs(x)<2&&Math.abs(z-24.25)<.7)return true;if(Math.abs(Math.abs(x)-1.98)<.5&&Math.abs(z-24.4)<.8)return true;if(Math.abs(x)>=half+.55||Math.abs(z)>=half+.55)return false;return gathering.blocks(x,z);},
  constrain(p){const width=T.MathUtils.lerp(32,42,T.MathUtils.smoothstep(roadEnd+36-p.z,0,24));p.x=T.MathUtils.clamp(p.x,roadX-width,roadX+width);p.z=Math.max(centerZ-45,p.z);},
  update(viewer,time=0){const proximity=T.MathUtils.smoothstep(roadEnd+48-viewer.position.z,0,40);scene.fog.density=T.MathUtils.lerp(scene.fog.density,.01,proximity);root.visible=viewer.position.z<roadEnd+80;lamps.forEach(l=>{l.intensity=12*proximity;});gathering.update(time,viewer);},
  inspect:()=>({x:roadX,z:centerZ,roadEnd,height,halfWidth:half,backLimit:centerZ-45,visible:root.visible,unlocked})
 };
};
