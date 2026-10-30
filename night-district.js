'use strict';
window.createNightDistrict=function(T,scene,{stone,leafMat,layout,reduced}){
 const root=new T.Group();root.name='Beyond Eden / the old civilization';scene.add(root);
 const cube=new T.BoxGeometry(1,1,1),shaft=new T.CylinderGeometry(1,1,1,12),orb=new T.SphereGeometry(1,24,16),dome=new T.SphereGeometry(1,32,16,0,Math.PI*2,0,Math.PI/2);
 const plasterCanvas=document.createElement('canvas');plasterCanvas.width=plasterCanvas.height=256;const pc=plasterCanvas.getContext('2d');pc.fillStyle='#d9dbd5';pc.fillRect(0,0,256,256);for(let i=0;i<9000;i++){const shade=185+(i*17%55);pc.fillStyle=`rgba(${shade},${shade},${shade},.18)`;pc.fillRect((i*71)%256,(i*131+Math.floor(i/256)*7)%256,1+(i%3),1+(i%2));}const plasterMap=new T.CanvasTexture(plasterCanvas);plasterMap.colorSpace=T.SRGBColorSpace;plasterMap.wrapS=plasterMap.wrapT=T.RepeatWrapping;
 const plaster=new T.MeshStandardMaterial({map:plasterMap,color:0xbec5bd,roughness:.94,bumpMap:plasterMap,bumpScale:.018});
 const marble=plaster.clone();marble.color.set(0xd9d8c5);marble.roughness=.63;
 const charcoal=new T.MeshStandardMaterial({color:0x151d20,roughness:.92});
 const brass=new T.MeshStandardMaterial({color:0x948455,metalness:.72,roughness:.38});
 const copper=new T.MeshStandardMaterial({color:0x6a9c93,emissive:0x1e3432,emissiveIntensity:.3,metalness:.3,roughness:.49});
 const velvet=new T.MeshStandardMaterial({color:0x621f36,roughness:1});
 const glow=new T.MeshStandardMaterial({color:0xe6cd9e,emissive:0xffb34f,emissiveIntensity:.7,roughness:.45});
 const water=new T.MeshStandardMaterial({color:0x214f50,metalness:.65,roughness:.2});
 const walls=[],lamps=[],staticRoot=new T.Group();root.add(staticRoot);
 function mesh(parent,geometry,material,x,y,z,sx=1,sy=1,sz=1){const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.receiveShadow=true;parent.add(m);return m;}
 const box=(p,m,x,y,z,w,h,d)=>mesh(p,cube,m,x,y,z,w,h,d);
 function column(p,x,z,h=4,r=.3){mesh(p,shaft,marble,x,h/2,z,r,h,r);box(p,marble,x,.12,z,r*3,.24,r*3);box(p,marble,x,h,z,r*3,.28,r*3);mesh(p,shaft,brass,x,h-.22,z,r*1.1,.09,r*1.1);}
 function arch(p,x,y,z,r,material=marble){const m=mesh(p,new T.TorusGeometry(r,.17,6,20,Math.PI),material,x,y,z);return m;}
 function windowBay(p,x,y,z,w=1,h=1.8){box(p,charcoal,x,y,z,w+.2,h+.2,.13);box(p,glow,x,y,z+.08,w,h,.06);box(p,brass,x,y,z+.13,.065,h,.09);box(p,brass,x,y,z+.13,w,.055,.09);box(p,marble,x,y-h/2-.1,z+.12,w+.45,.16,.35);}
 function lantern(p,x,z,y=2.4){mesh(p,shaft,brass,x,y/2,z,.055,y,.055);box(p,glow,x,y,z,.22,.38,.22);box(p,brass,x,y+.25,z,.4,.08,.4);const v=new T.Vector3(x,y,z);p.localToWorld(v);lamps.push(v);}
 function glyphTexture(label){const c=document.createElement('canvas');c.width=512;c.height=256;const g=c.getContext('2d');g.fillStyle='#122328';g.fillRect(0,0,512,256);g.strokeStyle='#ac9564';g.lineWidth=3;g.strokeRect(10,10,492,236);g.beginPath();g.arc(256,87,31,0,Math.PI*2);g.moveTo(224,111);g.lineTo(256,40);g.lineTo(288,111);g.closePath();g.stroke();g.fillStyle='#e6d8b4';g.font='22px Georgia';g.textAlign='center';g.fillText(label.toUpperCase(),256,183,470);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
 for(const s of layout.landmarks){
  const p=new T.Group();p.name=s.name;p.position.set(s.x,0,s.z);staticRoot.add(p);p.updateWorldMatrix(true,false);
  const facade=plaster.clone();facade.color.set(s.color);
  box(p,marble,0,-.07,0,s.w+3,.12,s.d+3);
  // Physical walls and server collision use the same doorway dimensions.
  if(s.id!=='gardens'){
   for(const side of [-1,1]){
    box(p,facade,side*s.w/2,s.h/2,0,.5,s.h,s.d);walls.push([s.x+side*s.w/2,s.z,.5,s.d]);
    for(const end of [-1,1]){const x=side*(s.w/4+.9),z=end*s.d/2,w=s.w/2-1.8;box(p,facade,x,s.h/2,z,w,s.h,.5);walls.push([s.x+x,s.z+z,w,.5]);}
   }
   const spandrel=new T.Shape();spandrel.moveTo(-1.8,s.h);spandrel.lineTo(1.8,s.h);spandrel.lineTo(1.8,2.9);spandrel.lineTo(1.65,2.9);spandrel.absarc(0,2.9,1.65,0,Math.PI,false);spandrel.lineTo(-1.8,2.9);spandrel.closePath();const archWall=new T.ExtrudeGeometry(spandrel,{depth:.5,bevelEnabled:false,curveSegments:20});
   for(const end of [-1,1]){mesh(p,archWall,facade,0,0,end*s.d/2-.25);arch(p,0,2.9,end*(s.d/2+.28),1.65);}
   for(const y of [.35,s.h-.5,s.h]){box(p,marble,0,y,s.d/2+.3,s.w+.7,.16,.5);box(p,marble,0,y,-s.d/2-.3,s.w+.7,.16,.5);}
   for(let x=-s.w/2+.3;x<s.w/2;x+=.7)box(p,marble,x,s.h-.24,s.d/2+.26,.23,.26,.34);
  }
  const plaque=new T.Mesh(new T.PlaneGeometry(3.8,1.9),new T.MeshStandardMaterial({map:glyphTexture(s.name),roughness:.7,emissive:0x75654b,emissiveIntensity:.14}));plaque.position.set(-s.w/2+2.3,1.75,s.d/2+.32);p.add(plaque);
  for(const side of [-1,1])lantern(p,side*2.5,s.d/2+2);
  if(s.id==='temple'){
   mesh(p,shaft,marble,0,s.h+.9,0,5.7,1.8,5.7);mesh(p,dome,copper,0,s.h+1.8,0,5.6,5,5.6);mesh(p,shaft,brass,0,s.h+1.8,0,5.8,.2,5.8);
   mesh(p,orb,brass,0,14.5,0,.22,.22,.22);mesh(p,shaft,brass,0,14,0,.045,1.5,.045);
   for(const side of [-1,1]){const x=side*6.6;column(p,x,6.6,9,.55);mesh(p,dome,copper,x,9.2,6.6,.9,1.2,.9);for(let z=-5;z<=5;z+=5)column(p,side*5.7,z,4.1,.24);}
   for(let x=-6;x<=6;x+=3){if(Math.abs(x)<2)continue;arch(p,x,3.8,8.38,1);windowBay(p,x,2.75,8.3,1.2,1.8);}
   for(let x=-7.4;x<8;x+=.9){const m=box(p,brass,x,5.85,8.29,.42,.42,.06);m.rotation.z=Math.PI/4;}
   box(p,copper,0,.025,0,9,.05,10);for(let x=-4;x<=4;x+=2)for(let z=-4;z<=4;z+=2){const m=box(p,marble,x,.06,z,.75,.025,.75);m.rotation.y=Math.PI/4;}
  }else if(s.id==='observatory'){
   mesh(p,shaft,marble,0,s.h+1,-1,6.2,2,6.2);mesh(p,dome,copper,0,s.h+2,-1,6,4.8,6);mesh(p,shaft,brass,0,s.h+2,-1,6.25,.2,6.25);
   const slit=mesh(p,new T.TorusGeometry(5.95,.12,6,32,Math.PI/2),charcoal,0,s.h+2,-1);slit.rotation.y=Math.PI/2;
   for(const side of [-1,1]){column(p,side*6.3,7.6,6,.48);mesh(p,dome,copper,side*6.3,6.3,6,.95,1.2,.95);for(let x=3;x<=6;x+=3)windowBay(p,side*x,2.7,8.29,1.25,2.1);}
   column(p,0,-1,1.5,.45);const scope=mesh(p,shaft,brass,0,2.5,-1,.35,4,.35);scope.rotation.z=.9;
   for(const angle of [0,Math.PI/2]){const ring=mesh(p,new T.TorusGeometry(1.3,.055,8,48),brass,0,2.6,3);ring.rotation.y=angle;}mesh(p,orb,copper,0,2.6,3,.55,.55,.55);
   box(p,charcoal,0,.025,0,9,.04,10);for(let a=0;a<12;a++){const n=box(p,brass,Math.sin(a*Math.PI/6)*3,.065,Math.cos(a*Math.PI/6)*3,.08,.04,.4);n.rotation.y=a*Math.PI/6;}
  }else if(s.id==='playhouse'){
   for(const side of [-1,1])for(let z=-5;z<=5;z+=5){column(p,side*6.5,z,4.1,.24);arch(p,side*6.5,3.8,z,1.2);}
   for(let x=-7;x<=7;x+=2.8){if(Math.abs(x)<2)continue;windowBay(p,x,4.8,8.3,1.3,1.6);}
   box(p,charcoal,0,.025,-4,12,.05,5);box(p,velvet,0,5.4,-6.6,12,1.4,.5);
   for(const side of [-1,1])for(let i=0;i<7;i++)mesh(p,shaft,velvet,side*(4.4+i*.23),2.7,-6.5,.22,5.4,.2);
   for(const side of [-1,1]){box(p,marble,side*5.8,3.6,-1,4,.25,8);for(let z=-4;z<=2;z+=1)mesh(p,shaft,brass,side*3.9,4.15,z,.035,1,.035);box(p,brass,side*3.9,4.65,-1,.09,.09,8);}
   for(const x of [-4,-2,2,4])for(const z of [-1,1.5,4]){box(p,velvet,x,.43,z,.85,.16,.8);box(p,velvet,x,.85,z+.38,.85,.9,.12);}
   box(p,charcoal,0,6,8.7,10,.8,1.1);for(let x=-4.7;x<=4.7;x+=.4)mesh(p,orb,glow,x,5.7,9.2,.065,.065,.065);
  }else if(s.id==='hotel'){
   box(p,charcoal,0,11.2,0,16.5,.5,20.5);
   const roof=mesh(p,new T.ConeGeometry(1,1,4),charcoal,0,14,0,11.4,5.5,14.2);roof.rotation.y=Math.PI/4;
   for(const side of [-1,1]){mesh(p,shaft,facade,side*6.5,6,8,1.6,12,1.6);mesh(p,new T.ConeGeometry(2.1,4,8),copper,side*6.5,14,8);for(let y=2.5;y<11;y+=2.6){for(const x of [-4,-2,2,4])windowBay(p,x,y,10.3,.9,1.65);windowBay(p,side*6.5,y,9.65,.8,1.5);}}
   box(p,brass,0,3.35,11.1,6,.18,3);box(p,velvet,0,.035,0,3.3,.05,20);
   box(p,charcoal,-4,.6,-5,4,1.2,1.4);box(p,brass,-4,1.25,-5,4.3,.1,1.6);
   for(const side of [-1,1])for(const z of [-4,2]){box(p,marble,side*5,.35,z,3.5,.7,2);box(p,velvet,side*5,.78,z,3.3,.15,1.8);}
   // A canopy of ivy grows on the wings but leaves the entrances clear.
   const ivy=leafMat.clone();ivy.color.set(0x758f65);ivy.emissiveIntensity=.08;const leaf=new T.PlaneGeometry(1,1);for(let i=0;i<160;i++){const side=i%2?1:-1;const m=mesh(p,leaf,ivy,side*(6.6+Math.sin(i*3.1)),.5+(i%24)*.4,10.5+Math.sin(i)*.12,.9,1.1,1);m.rotation.z=Math.sin(i*2.3)*.7;}
  }else{
   box(p,charcoal,0,.02,0,7,.05,8);box(p,water,0,.07,0,6.5,.025,7.5);
   for(const side of [-1,1]){box(p,marble,side*3.5,.12,0,.35,.25,8.4);for(let z=-5;z<=5;z+=2.5){column(p,side*8,z,3.7,.26);}box(p,marble,side*8,3.95,0,.9,.35,12);}
   for(const z of [-4.2,4.2])box(p,marble,0,.12,z,7.4,.25,.35);
   for(const side of [-1,1]){column(p,side*5.8,-4,1.2,.5);mesh(p,shaft,marble,side*5.8,2,-4,.24,1.4,.42);mesh(p,orb,marble,side*5.8,2.95,-4,.25,.35,.25);}
  }
  // A pale approach is visible from the road and doubles as an escape route.
  const tx=11.7-s.x;box(p,marble,tx/2,-.012,s.d/2+3,Math.abs(tx),.04,1.8);
 }
 // Collapse repeated architecture to instanced batches, preserving real geometry at low draw cost.
 staticRoot.updateMatrixWorld(true);const batches=new Map();staticRoot.traverse(o=>{if(!o.isMesh)return;const key=o.geometry.uuid+o.material.uuid;if(!batches.has(key))batches.set(key,{geometry:o.geometry,material:o.material,matrices:[]});batches.get(key).matrices.push(o.matrixWorld.clone());});
 root.remove(staticRoot);for(const batch of batches.values()){const m=new T.InstancedMesh(batch.geometry,batch.material,batch.matrices.length);batch.matrices.forEach((matrix,i)=>m.setMatrixAt(i,matrix));m.receiveShadow=true;m.computeBoundingSphere?.();root.add(m);}
 const lightPool=[0,1,2].map(()=>{const l=new T.PointLight(0xffc68c,0,13,1.7);root.add(l);return l;});
 const pageRoot=new T.Group();root.add(pageRoot);const pages=new Map();
 const paper=document.createElement('canvas');paper.width=256;paper.height=384;const ctx=paper.getContext('2d');ctx.fillStyle='#dfd5b5';ctx.fillRect(0,0,256,384);ctx.strokeStyle='#85764f';ctx.lineWidth=2;ctx.strokeRect(15,15,226,354);ctx.beginPath();ctx.arc(128,98,37,0,Math.PI*2);ctx.moveTo(89,124);ctx.lineTo(128,51);ctx.lineTo(167,124);ctx.closePath();ctx.stroke();for(let y=169;y<325;y+=15){ctx.fillStyle=y%3?'#746851':'#afa083';ctx.fillRect(36,y,184-((y*7)%50),2);}const pageMap=new T.CanvasTexture(paper);pageMap.colorSpace=T.SRGBColorSpace;
 const pageMat=new T.MeshStandardMaterial({map:pageMap,roughness:1,side:T.DoubleSide,emissive:0xffd295,emissiveIntensity:.22});
 function setPages(list,collected){for(const item of list){let p=pages.get(item.id);if(!p){p=new T.Group();p.name='Lost page '+(item.id+1);const sheet=mesh(p,new T.PlaneGeometry(.48,.68),pageMat,0,1.25,0);sheet.rotation.x=-.17;box(p,charcoal,0,.45,0,.5,.9,.5);box(p,brass,0,.93,0,.65,.06,.65);pageRoot.add(p);pages.set(item.id,p);}p.position.set(item.x,0,item.z);p.visible=!collected.includes(item.id);}}
 const watcher=new T.Group();watcher.name='The Attendant';scene.add(watcher);watcher.visible=false;
 const robe=new T.MeshStandardMaterial({color:0x10151a,roughness:.87}),mask=new T.MeshStandardMaterial({color:0xe0dccc,roughness:.45});
 mesh(watcher,new T.CylinderGeometry(.21,.38,2.3,16),robe,0,1.48,0);mesh(watcher,orb,robe,0,2.72,0,.36,.25,.2);
 mesh(watcher,orb,mask,0,3.22,.02,.16,.3,.13);for(const side of [-1,1]){mesh(watcher,orb,charcoal,side*.065,3.26,.14,.035,.052,.016);mesh(watcher,shaft,robe,side*.16,.32,0,.065,.6,.075);}
 const arms=[];for(const side of [-1,1]){const arm=new T.Group();arm.position.set(side*.31,2.74,0);mesh(arm,shaft,robe,side*.08,-.75,0,.065,1.6,.065);mesh(arm,orb,mask,side*.08,-1.6,0,.055,.18,.055);arm.rotation.z=side*.10;watcher.add(arm);arms.push(arm);}
 box(watcher,brass,0,2.3,.245,.04,.75,.035);const sigil=mesh(watcher,new T.TorusGeometry(.12,.018,6,24),brass,0,2.61,.24);
 let snapshot=null;
 return {root,watcher,walls,setPages,setState(value){if(value&&value.code!==snapshot?.code)watcher.position.set(value.watcher.x,0,value.watcher.z);snapshot=value;watcher.visible=!!value&&value.phase==='playing';if(value)setPages(value.pages,value.collected);else pageRoot.visible=false;},
  blocks(p){return walls.some(([x,z,w,d])=>Math.abs(p.x-x)<w/2+.3&&Math.abs(p.z-z)<d/2+.3);},
  clearGround(x,z){return layout.landmarks.some(s=>Math.abs(x-s.x)<s.w/2+3&&Math.abs(z-s.z)<s.d/2+4)||layout.landmarks.some(s=>Math.abs(z-(s.z+s.d/2+3))<1.8&&x>Math.min(s.x,11.7)-1&&x<Math.max(s.x,11.7)+1);},
  update(time,viewer,night){root.visible=viewer.position.z<0;pageRoot.visible=!!snapshot;const nearest=lamps.map(p=>({p,d:p.distanceToSquared(viewer.position)})).sort((a,b)=>a.d-b.d);lightPool.forEach((l,i)=>{l.position.copy(nearest[i].p);l.intensity=night*10;});if(snapshot){const w=snapshot.watcher;watcher.position.lerp(new T.Vector3(w.x,0,w.z),.3);watcher.rotation.y=w.yaw;arms.forEach((a,i)=>{a.rotation.x=reduced?0:Math.sin(time*2+i*Math.PI)*.06;});sigil.material.emissive.set(0x503c22);sigil.material.emissiveIntensity=.2;}},
  inspect:()=>({landmarks:layout.landmarks.map(s=>({name:s.name,x:s.x,z:s.z})),batches:batches.size,pages:pages.size,watcher:watcher.position.toArray()})
 };
};
