'use strict';
window.createNightDistrict=function(T,scene,{stone,leafMat,layout,reduced,prepareModel=null}){
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
 const walls=[],lamps=[],staticRoot=new T.Group(),surfaces=[],climbs=[];
 let gridOf=null;function wallGrid(){if(gridOf&&gridOf.n===walls.length&&gridOf.a===walls[0]&&gridOf.b===walls[walls.length-1])return gridOf;const cells=new Map();for(const W of walls){const m=.3,x0=Math.floor((W[0]-W[2]/2-m)/4),x1=Math.floor((W[0]+W[2]/2+m)/4),z0=Math.floor((W[1]-W[3]/2-m)/4),z1=Math.floor((W[1]+W[3]/2+m)/4);for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const k=x+','+z;let c=cells.get(k);if(!c)cells.set(k,c=[]);c.push(W);}}return gridOf={n:walls.length,a:walls[0],b:walls[walls.length-1],cells};}
 const ROOFS=window.edenRoofs||{},eaveOf=s=>ROOFS[s.id]?.eave??s.h;root.add(staticRoot);
 function mesh(parent,geometry,material,x,y,z,sx=1,sy=1,sz=1){const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.receiveShadow=true;parent.add(m);return m;}
 const box=(p,m,x,y,z,w,h,d)=>mesh(p,cube,m,x,y,z,w,h,d);
 function column(p,x,z,h=4,r=.3){mesh(p,shaft,marble,x,h/2,z,r,h,r);box(p,marble,x,.12,z,r*3,.24,r*3);box(p,marble,x,h,z,r*3,.28,r*3);mesh(p,shaft,brass,x,h-.22,z,r*1.1,.09,r*1.1);}
 function arch(p,x,y,z,r,material=marble){const m=mesh(p,new T.TorusGeometry(r,.17,6,20,Math.PI),material,x,y,z);return m;}
 function windowBay(p,x,y,z,w=1,h=1.8){box(p,charcoal,x,y,z,w+.2,h+.2,.13);box(p,glow,x,y,z+.08,w,h,.06);box(p,brass,x,y,z+.13,.065,h,.09);box(p,brass,x,y,z+.13,w,.055,.09);box(p,marble,x,y-h/2-.1,z+.12,w+.45,.16,.35);}
 function lantern(p,x,z,y=2.4){mesh(p,shaft,brass,x,y/2,z,.055,y,.055);box(p,glow,x,y,z,.22,.38,.22);box(p,brass,x,y+.25,z,.4,.08,.4);const v=new T.Vector3(x,y,z);p.localToWorld(v);lamps.push(v);}
 function glyphTexture(label){const c=document.createElement('canvas');c.width=512;c.height=256;const g=c.getContext('2d');g.fillStyle='#122328';g.fillRect(0,0,512,256);g.strokeStyle='#ac9564';g.lineWidth=3;g.strokeRect(10,10,492,236);g.beginPath();g.arc(256,87,31,0,Math.PI*2);g.moveTo(224,111);g.lineTo(256,40);g.lineTo(288,111);g.closePath();g.stroke();g.fillStyle='#e6d8b4';g.font='22px Georgia';g.textAlign='center';g.fillText(label.toUpperCase(),256,183,470);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
 // Modelled landmarks (scripted Blender, CC0 scans, sculpted reliefs, Modly statues; atlas-derived, original designs)
 // replace their procedural buildings once the GLB loads; until then, or if it fails, the procedural version stands in.
 // Footprint walls are identical either way; `blocks` adds collision for new solid parts (local [x,z,w,d]), `lanterns`
 // moves the two approach lanterns, `glow` adds pooled-light points (no scene lights: each one costs every material).
 const MODELS={
  playhouse:{url:'/assets/night/mayan-theatre.glb',keepInterior:true,glow:[[0,4.4,10.6]]},
  temple:{url:'/assets/night/moon-temple.glb',glow:[[0,4,0]],blocks:[...[[-7.4,-7.4],[7.4,-7.4],[-7.4,7.4],[7.4,7.4]].map(([x,z])=>[x,z,2,2]),...[0,1,2,3,4,5,6,7].map(i=>[Math.cos(Math.PI/8+i*Math.PI/4)*6.3,Math.sin(Math.PI/8+i*Math.PI/4)*6.3,.8,.8])]},
  observatory:{url:'/assets/night/shrine-observatory.glb',glow:[[0,3.2,-1]],blocks:[[-7.8,7.8,2.6,2.6],[7.8,7.8,2.6,2.6],[0,-1,2.4,2.4]]},
  hotel:{url:'/assets/night/citadel-hotel.glb',lanterns:[[-5.85,11.7],[5.85,11.7]],blocks:[...[[-8.2,-10.2],[8.2,-10.2],[-8.2,10.2],[8.2,10.2]].map(([x,z])=>[x,z,2.4,2.4]),[-3,10.9,2.8,1.9],[3,10.9,2.8,1.9],[-3,13.1,2,2.6],[3,13.1,2,2.6],...[-6,-2,2,6].flatMap(z=>[[-5.6,z,.9,.9],[5.6,z,.9,.9]])]},
  gardens:{url:'/assets/night/egyptian-gardens.glb',lanterns:[[-3,11.2],[3,11.2]],blocks:[[-6.1,8.2,7.4,2.6],[6.1,8.2,7.4,2.6],[-2.12,8.2,.65,2.2],[2.12,8.2,.65,2.2],[-10.4,0,.6,12.4],[10.4,0,.6,12.4],[0,-7.4,12,1.4],...[-5,-2.5,0,2.5,5].flatMap(z=>[[-9,z,1.1,1.1],[9,z,1.1,1.1]]),...[4.6,-2.6].flatMap(z=>[[-5.2,z,1.6,3],[5.2,z,1.6,3]])]},
  // the remaining atlas buildings (original designs after each atlas reading; see assets/night/SOURCE.md)
  girard:{url:'/assets/night/girard-gate.glb',blocks:[[-8.4,5,3.6,3.6],[8.4,5,3.6,3.6]]},
  latheatre:{url:'/assets/night/palace-of-mirrors.glb',glow:[[0,4.2,12.6]]},
  stjames:{url:'/assets/night/redwood-chapel.glb',blocks:[[-6.2,8,3.6,3.6]]},
  vibiana:{url:'/assets/night/first-cathedral.glb',blocks:[[9.7,9,4,4]]},
  methodist:{url:'/assets/night/campanile.glb',blocks:[[-9.8,8.8,4.2,4.2]]},
  immanuel:{url:'/assets/night/high-tower.glb',blocks:[[5.8,8.8,4.6,4.6]]},
  baptist:{url:'/assets/night/three-arches.glb',blocks:[[-11.6,7.2,3.6,3.6],[11.6,7.2,3.6,3.6],[-4,12.15,1.6,2.6],[4,12.15,1.6,2.6]]},
  christian:{url:'/assets/night/rose-window.glb',blocks:[[-9.4,8,4,4]]},
  firstcong:{url:'/assets/night/organ-tower.glb',lanterns:[[-4.6,16.6],[4.6,16.6]],blocks:[[-2.5,12.5,1.4,6.4],[2.5,12.5,1.4,6.4]]}
 },modelState={},pendingModels=[];
 for(const s of layout.landmarks){
  const p=new T.Group();p.name=s.name;p.position.set(s.x,0,s.z);staticRoot.add(p);p.updateWorldMatrix(true,false);
  const facade=plaster.clone();facade.color.set(s.color);
  box(p,marble,0,-.07,0,s.w+3,.12,s.d+3);
  const model=MODELS[s.id];
  const shell=model?new T.Group():p,q=model&&!model.keepInterior?shell:p;
  if(model){shell.name=s.name+' (procedural fallback)';shell.userData.landmarkModel=true;shell.position.copy(p.position);root.add(shell);loadModel(s,model,shell);
   for(const [x,z,w,d] of model.blocks||[])walls.push([s.x+x,s.z+z,w,d,eaveOf(s)]);}
  // Physical walls and server collision use the same doorway dimensions.
  if(s.id!=='gardens'){
   for(const side of [-1,1]){
    box(shell,facade,side*s.w/2,s.h/2,0,.5,s.h,s.d);walls.push([s.x+side*s.w/2,s.z,.5,s.d,eaveOf(s)]);
    for(const end of [-1,1]){const x=side*(s.w/4+.9),z=end*s.d/2,w=s.w/2-1.8;box(shell,facade,x,s.h/2,z,w,s.h,.5);walls.push([s.x+x,s.z+z,w,.5,eaveOf(s)]);}
   }
   const spandrel=new T.Shape();spandrel.moveTo(-1.8,s.h);spandrel.lineTo(1.8,s.h);spandrel.lineTo(1.8,2.9);spandrel.lineTo(1.65,2.9);spandrel.absarc(0,2.9,1.65,0,Math.PI,false);spandrel.lineTo(-1.8,2.9);spandrel.closePath();const archWall=new T.ExtrudeGeometry(spandrel,{depth:.5,bevelEnabled:false,curveSegments:20});
   for(const end of [-1,1]){mesh(shell,archWall,facade,0,0,end*s.d/2-.25);arch(shell,0,2.9,end*(s.d/2+.28),1.65);}
   for(const y of [.35,s.h-.5,s.h]){box(shell,marble,0,y,s.d/2+.3,s.w+.7,.16,.5);box(shell,marble,0,y,-s.d/2-.3,s.w+.7,.16,.5);}
   for(let x=-s.w/2+.3;x<s.w/2;x+=.7)box(shell,marble,x,s.h-.24,s.d/2+.26,.23,.26,.34);
  }
  if(!model){const plaque=new T.Mesh(new T.PlaneGeometry(3.8,1.9),new T.MeshStandardMaterial({map:glyphTexture(s.name),roughness:.7,emissive:0x75654b,emissiveIntensity:.14}));plaque.position.set(-s.w/2+2.3,1.75,s.d/2+.32);p.add(plaque);}
  for(const [x,z] of model?.lanterns||[[-2.5,s.d/2+2],[2.5,s.d/2+2]])lantern(p,x,z);
  if(s.id==='temple'){
   mesh(q,shaft,marble,0,s.h+.9,0,5.7,1.8,5.7);mesh(q,dome,copper,0,s.h+1.8,0,5.6,5,5.6);mesh(q,shaft,brass,0,s.h+1.8,0,5.8,.2,5.8);
   mesh(q,orb,brass,0,14.5,0,.22,.22,.22);mesh(q,shaft,brass,0,14,0,.045,1.5,.045);
   for(const side of [-1,1]){const x=side*6.6;column(q,x,6.6,9,.55);mesh(q,dome,copper,x,9.2,6.6,.9,1.2,.9);for(let z=-5;z<=5;z+=5)column(q,side*5.7,z,4.1,.24);}
   for(let x=-6;x<=6;x+=3){if(Math.abs(x)<2)continue;arch(q,x,3.8,8.38,1);windowBay(q,x,2.75,8.3,1.2,1.8);}
   for(let x=-7.4;x<8;x+=.9){const m=box(q,brass,x,5.85,8.29,.42,.42,.06);m.rotation.z=Math.PI/4;}
   box(q,copper,0,.025,0,9,.05,10);for(let x=-4;x<=4;x+=2)for(let z=-4;z<=4;z+=2){const m=box(q,marble,x,.06,z,.75,.025,.75);m.rotation.y=Math.PI/4;}
  }else if(s.id==='observatory'){
   mesh(q,shaft,marble,0,s.h+1,-1,6.2,2,6.2);mesh(q,dome,copper,0,s.h+2,-1,6,4.8,6);mesh(q,shaft,brass,0,s.h+2,-1,6.25,.2,6.25);
   const slit=mesh(q,new T.TorusGeometry(5.95,.12,6,32,Math.PI/2),charcoal,0,s.h+2,-1);slit.rotation.y=Math.PI/2;
   for(const side of [-1,1]){column(q,side*6.3,7.6,6,.48);mesh(q,dome,copper,side*6.3,6.3,6,.95,1.2,.95);for(let x=3;x<=6;x+=3)windowBay(q,side*x,2.7,8.29,1.25,2.1);}
   column(q,0,-1,1.5,.45);const scope=mesh(q,shaft,brass,0,2.5,-1,.35,4,.35);scope.rotation.z=.9;
   for(const angle of [0,Math.PI/2]){const ring=mesh(q,new T.TorusGeometry(1.3,.055,8,48),brass,0,2.6,3);ring.rotation.y=angle;}mesh(q,orb,copper,0,2.6,3,.55,.55,.55);
   box(q,charcoal,0,.025,0,9,.04,10);for(let a=0;a<12;a++){const n=box(q,brass,Math.sin(a*Math.PI/6)*3,.065,Math.cos(a*Math.PI/6)*3,.08,.04,.4);n.rotation.y=a*Math.PI/6;}
  }else if(s.id==='playhouse'){
   for(const side of [-1,1])for(let z=-5;z<=5;z+=5){column(p,side*6.5,z,4.1,.24);arch(p,side*6.5,3.8,z,1.2);}
   for(let x=-7;x<=7;x+=2.8){if(Math.abs(x)<2)continue;windowBay(shell,x,4.8,8.3,1.3,1.6);}
   box(p,charcoal,0,.025,-4,12,.05,5);box(p,velvet,0,5.4,-6.6,12,1.4,.5);
   for(const side of [-1,1])for(let i=0;i<7;i++)mesh(p,shaft,velvet,side*(4.4+i*.23),2.7,-6.5,.22,5.4,.2);
   for(const side of [-1,1]){box(p,marble,side*5.8,3.6,-1,4,.25,8);for(let z=-4;z<=2;z+=1)mesh(p,shaft,brass,side*3.9,4.15,z,.035,1,.035);box(p,brass,side*3.9,4.65,-1,.09,.09,8);}
   for(const x of [-4,-2,2,4])for(const z of [-1,1.5,4]){box(p,velvet,x,.43,z,.85,.16,.8);box(p,velvet,x,.85,z+.38,.85,.9,.12);}
   box(shell,charcoal,0,6,8.7,10,.8,1.1);for(let x=-4.7;x<=4.7;x+=.4)mesh(shell,orb,glow,x,5.7,9.2,.065,.065,.065);
  }else if(s.id==='hotel'){
   box(q,charcoal,0,11.2,0,16.5,.5,20.5);
   const roof=mesh(q,new T.ConeGeometry(1,1,4),charcoal,0,14,0,11.4,5.5,14.2);roof.rotation.y=Math.PI/4;
   for(const side of [-1,1]){mesh(q,shaft,facade,side*6.5,6,8,1.6,12,1.6);mesh(q,new T.ConeGeometry(2.1,4,8),copper,side*6.5,14,8);for(let y=2.5;y<11;y+=2.6){for(const x of [-4,-2,2,4])windowBay(q,x,y,10.3,.9,1.65);windowBay(q,side*6.5,y,9.65,.8,1.5);}}
   box(q,brass,0,3.35,11.1,6,.18,3);box(q,velvet,0,.035,0,3.3,.05,20);
   box(q,charcoal,-4,.6,-5,4,1.2,1.4);box(q,brass,-4,1.25,-5,4.3,.1,1.6);
   for(const side of [-1,1])for(const z of [-4,2]){box(q,marble,side*5,.35,z,3.5,.7,2);box(q,velvet,side*5,.78,z,3.3,.15,1.8);}
   // A canopy of ivy grows on the wings but leaves the entrances clear.
   const ivy=leafMat.clone();ivy.color.set(0x758f65);ivy.emissiveIntensity=.08;const leaf=new T.PlaneGeometry(1,1);for(let i=0;i<160;i++){const side=i%2?1:-1;const m=mesh(q,leaf,ivy,side*(6.6+Math.sin(i*3.1)),.5+(i%24)*.4,10.5+Math.sin(i)*.12,.9,1.1,1);m.rotation.z=Math.sin(i*2.3)*.7;}
  }else if(s.id==='gardens'){
   box(q,charcoal,0,.02,0,7,.05,8);box(q,water,0,.07,0,6.5,.025,7.5);
   for(const side of [-1,1]){box(q,marble,side*3.5,.12,0,.35,.25,8.4);for(let z=-5;z<=5;z+=2.5){column(q,side*8,z,3.7,.26);}box(q,marble,side*8,3.95,0,.9,.35,12);}
   for(const z of [-4.2,4.2])box(q,marble,0,.12,z,7.4,.25,.35);
   for(const side of [-1,1]){column(q,side*5.8,-4,1.2,.5);mesh(q,shaft,marble,side*5.8,2,-4,.24,1.4,.42);mesh(q,orb,marble,side*5.8,2.95,-4,.25,.35,.25);}
  }
  // A pale approach is visible from the road and doubles as an escape route.
  const tx=11.7-s.x;box(p,marble,tx/2,-.012,s.d/2+3,Math.abs(tx),.04,1.8);
 }
 function loadModel(s,model,shell){
  // Glow points (the theatre marquee, lit interiors) join the lamp pool, so a pooled light washes them when near.
  for(const [x,y,z] of model.glow||[])lamps.push(new T.Vector3(s.x+x,y,s.z+z));
  modelState[s.id]='waiting';pendingModels.push({s,model,shell});
 }
 // Stream one GLB at a time. A prepared district retains its bounded model set;
 // distant landmarks use the original architectural shells instead of being
 // decoded again on every return. Unprepared streams can still release at 130 m.
 const loadedModels=new Map(),priorityModels=new Set();let modelInFlight=false,disposed=false,lodEnabled=true,retainPrepared=false;
 const renderer=window.breakThyRuleShowroom?.renderer?.(),camera=window.edenCamera;const warmup=!prepareModel&&renderer&&camera&&window.createRenderWarmup?.(renderer,camera,scene);
 function releaseModel(scene){window.edenBaked?.unregisterStatic(scene);scene.traverse(o=>{if(!o.isMesh)return;o.geometry.dispose();for(const m of [].concat(o.material)){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});}
 function streamModels(viewer){
  if(disposed)return;
  const distance=s=>Math.hypot(viewer.position.x-s.x,viewer.position.z-s.z);
  for(const [id,entry] of loadedModels)if(!retainPrepared&&distance(entry.s)>130){
   root.remove(entry.scene);releaseModel(entry.scene);entry.shell.visible=true;root.add(entry.shell);loadedModels.delete(id);modelState[id]='waiting';pendingModels.push(entry);}
  for(const entry of loadedModels.values()){const d=distance(entry.s),high=!lodEnabled||d<(entry.scene.visible?82:72);entry.scene.visible=high;entry.shell.visible=!high;}
  if(modelInFlight)return;
  let next=pendingModels.findIndex(p=>priorityModels.has(p.s.id)),nearest=75;
  if(next<0)pendingModels.forEach((p,i)=>{const d=distance(p.s);if(d<nearest){nearest=d;next=i;}});
  if(next<0)return;
  const [p]=pendingModels.splice(next,1);priorityModels.delete(p.s.id);fetchModel(p.s,p.model,p.shell);
 }
 function fetchModel(s,model,shell){
  modelState[s.id]='loading';modelInFlight=true;
  window.showroomAssets?.model(model.url).then(async gltf=>{
   if(disposed){releaseModel(gltf.scene);return;}
   const scene=gltf.scene;scene.name=s.name+' (modelled)';scene.userData.landmarkModel=true;scene.position.set(s.x,0,s.z);
   scene.traverse(o=>{if(!o.isMesh)return;o.receiveShadow=true;o.castShadow=!/bulb|sign|relief|glass/.test(o.name+o.material?.name);});
   window.edenBaked?.registerStatic(scene);if(prepareModel)await prepareModel(scene);else if(warmup)await warmup.prepare(scene);if(disposed){releaseModel(scene);return;}
   shell.visible=false;root.add(scene);modelState[s.id]='model';loadedModels.set(s.id,{s,model,shell,scene});
  }).catch(error=>{if(disposed)return;modelState[s.id]='fallback';console.warn(s.name+' model unavailable; keeping the procedural building',error);})
   .finally(()=>{modelInFlight=false;});
 }
 // Parkour: every roof is a walkable surface (parkour.js), and each building has a staircase of stacked crates against
 // one side wall, each tier within a climb of the last, so any roof can be reached. Walls carry their height so you are
 // only blocked by walls taller than where your feet are.
 {const cv=document.createElement('canvas');cv.width=cv.height=128;const g=cv.getContext('2d');g.fillStyle='#7a5634';g.fillRect(0,0,128,128);for(let i=0;i<6;i++){g.fillStyle=i%2?'#6d4a2b':'#835d38';g.fillRect(0,i*21+2,128,19);}g.strokeStyle='#3f2a17';g.lineWidth=10;g.strokeRect(5,5,118,118);g.beginPath();g.moveTo(10,10);g.lineTo(118,118);g.stroke();
  const tex=new T.CanvasTexture(cv);tex.colorSpace=T.SRGBColorSpace;const crate=new T.MeshStandardMaterial({map:tex,roughness:.88});
  for(const s of layout.landmarks){
   const F=ROOFS[s.id],eave=eaveOf(s);
   if(F)surfaces.push({field:F,id:s.id,foot:{minX:s.x-s.w/2,maxX:s.x+s.w/2,minZ:s.z-s.d/2,maxZ:s.z+s.d/2}});else if(s.id!=='gardens')surfaces.push({minX:s.x-s.w/2,maxX:s.x+s.w/2,minZ:s.z-s.d/2,maxZ:s.z+s.d/2,top:s.h,bottom:s.h-.4,roof:true,id:s.id});
   // Crates go against the model's real facade: scan in from outside along the row for the first cell near the eave.
   const side=s.x<12?-1:1,step=2.55;const tops=[];let t=0;do{t+=step;tops.push(+t.toFixed(2));}while(eave-t>3.1);
   const facadeX=z=>{const wall=s.x+side*s.w/2;if(!F)return wall;const r=Math.floor((z-F.minZ)/F.cell);if(r<0||r>=F.rows)return wall;for(let k=0;k<F.cols;k++){const c=side<0?k:F.cols-1-k,h=F.h[r*F.cols+c];if(h>3)return F.minX+(c+(side<0?0:1))*F.cell;}return wall;};
   const z0=F?F.minZ+2.2:s.z-s.d/2+1.6,zMax=F?F.minZ+F.rows*F.cell-2.2:s.z+s.d/2-1;
   tops.forEach((top,i)=>{const z=z0+i*2.05;if(z+1>zMax)return;const a=facadeX(z-.9),b=facadeX(z+.9);if(a==null||b==null)return;const fx=side<0?Math.min(a,b):Math.max(a,b);const x=fx+side*1.02;
    const p=new T.Group();p.position.set(x,0,z);staticRoot.add(p);
    for(let y=0;y<top-.01;y+=1.275){const h=Math.min(1.275,top-y);box(p,crate,0,y+h/2,0,2,h,2);}
    walls.push([x,z,2,2,top]);climbs.push({x,z,top,id:s.id});});
  }}
 // The expedition begins deliberately at this bell, in the existing temple approach.
 const templeBell=new T.Group();templeBell.name='Moon Temple hunt bell';templeBell.position.set(-12,0,-32.5);root.add(templeBell);
 for(const x of [-.72,.72])box(templeBell,charcoal,x,1.35,0,.11,2.7,.11);
 box(templeBell,brass,0,2.65,0,1.6,.12,.16);
 mesh(templeBell,new T.CylinderGeometry(.2,.48,.65,16,1,true),brass,0,2.12,0);
 mesh(templeBell,orb,brass,0,1.8,0,.095,.13,.095);
 const bellSign=new T.Mesh(new T.PlaneGeometry(1.7,.85),new T.MeshBasicMaterial({map:glyphTexture('RING TO BEGIN'),side:T.DoubleSide}));bellSign.position.set(0,1.05,.12);templeBell.add(bellSign);
 // Publish the same deterministic collision authority used by the expedition server.
 const authority=window.createExpeditionWorld?.({layout,roofs:ROOFS});
 if(authority){walls.splice(0,walls.length,...authority.walls);surfaces.splice(0,surfaces.length,...authority.surfaces);climbs.splice(0,climbs.length,...authority.climbs.map(c=>({x:c.x,z:c.z,top:c.y,id:c.id})));}
 // Visible route decks use the exact same dimensions as the shared collision source.
 for(const b of authority?.routeSurfaces||[]){box(staticRoot,b.id==='observatory-challenge'?charcoal:marble,(b.minX+b.maxX)/2,(b.top+b.bottom)/2,(b.minZ+b.maxZ)/2,b.maxX-b.minX,b.top-b.bottom,b.maxZ-b.minZ);}
 for(const cue of authority?.routeCues||[]){const sign=new T.Mesh(new T.PlaneGeometry(2.2,.85),new T.MeshBasicMaterial({map:glyphTexture(cue.label),side:T.DoubleSide}));sign.position.set(cue.x,cue.y+1.25,cue.z);staticRoot.add(sign);box(staticRoot,brass,cue.x,cue.y+.45,cue.z,.05,.9,.05);box(staticRoot,copper,cue.x,cue.y+.025,cue.z,.5,.05,.65);}
 // Collapse repeated architecture to instanced batches, preserving real geometry at low draw cost.
 staticRoot.updateMatrixWorld(true);const batches=new Map();staticRoot.traverse(o=>{if(!o.isMesh)return;const key=o.geometry.uuid+o.material.uuid;if(!batches.has(key))batches.set(key,{geometry:o.geometry,material:o.material,matrices:[]});batches.get(key).matrices.push(o.matrixWorld.clone());});
 root.remove(staticRoot);for(const batch of batches.values()){const m=new T.InstancedMesh(batch.geometry,batch.material,batch.matrices.length);batch.matrices.forEach((matrix,i)=>m.setMatrixAt(i,matrix));m.receiveShadow=true;m.computeBoundingSphere?.();root.add(m);}
 const nearest=[null,null,null],distances=[Infinity,Infinity,Infinity],watcherTarget=new T.Vector3();
 const lightPool=[0,1,2].map(()=>{const l=new T.PointLight(0xffc68c,0,13,1.7);l.name='District lamp';scene.add(l);return l;});
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
 // The host registers the static root after its geometry-merging pass.
 return {root,watcher,walls,lamps,routes:authority?.routes||[],setPages,setLOD(on){lodEnabled=!!on;},prepare(ids){if(disposed)return;if(ids.length>=layout.landmarks.length)retainPrepared=true;for(const id of ids)if(modelState[id]==='waiting')priorityModels.add(id);},dispose(){disposed=true;snapshot=null;pendingModels.length=0;priorityModels.clear();for(const entry of loadedModels.values())releaseModel(entry.scene);loadedModels.clear();window.edenBaked?.unregisterStatic(root);for(const light of lightPool)scene.remove(light);},setState(value){if(disposed)return;if(value&&value.code!==snapshot?.code)watcher.position.set(value.watcher.x,value.watcher.y||0,value.watcher.z);snapshot=value;watcher.visible=!!value&&value.phase==='playing'&&value.huntStarted!==false;if(value)setPages(value.pages,value.collected);else pageRoot.visible=false;},
  // feet: the height of the player's feet, when known: walls lower than a step up from there do not block.
  // Same answer as testing every wall, through a 4 m grid of them (rebuilt when walls are added): called for every step.
  blocks(p,feet=null){const g=wallGrid();const list=g.cells.get(Math.floor(p.x/4)+','+Math.floor(p.z/4));if(!list)return false;for(let i=0;i<list.length;i++){const W=list[i],h=W[4]??99;if(Math.abs(p.x-W[0])<W[2]/2+.3&&Math.abs(p.z-W[1])<W[3]/2+.3&&(feet==null||h>feet+.45))return true;}return false;},surfaces,climbs,
  clearGround(x,z){if(layout.arena&&Math.hypot(x-layout.arena.x,z-layout.arena.z)<layout.arena.r)return true;return layout.landmarks.some(s=>Math.abs(x-s.x)<s.w/2+3&&z-s.z>-s.d/2-4&&z-s.z<s.d/2+9)||layout.landmarks.some(s=>Math.abs(z-(s.z+s.d/2+3))<1.8&&x>Math.min(s.x,11.7)-1&&x<Math.max(s.x,11.7)+1);},
  update(time,viewer,night){if(disposed)return;root.visible=viewer.position.z<0;if(root.visible)streamModels(viewer);pageRoot.visible=!!snapshot;distances.fill(Infinity);nearest.fill(null);for(const p of lamps){const d=p.distanceToSquared(viewer.position);for(let i=0;i<3;i++)if(d<distances[i]){for(let j=2;j>i;j--){distances[j]=distances[j-1];nearest[j]=nearest[j-1];}distances[i]=d;nearest[i]=p;break;}}lightPool.forEach((l,i)=>{if(nearest[i])l.position.copy(nearest[i]);l.intensity=root.visible?night*10*(1-(window.edenBaked?.nightStrength()||0)):0;});if(snapshot){const w=snapshot.watcher;watcher.position.lerp(watcherTarget.set(w.x,w.y||0,w.z),.3);watcher.rotation.y=w.yaw;arms.forEach((a,i)=>{a.rotation.x=reduced?0:Math.sin(time*2+i*Math.PI)*.06;});sigil.material.emissive.set(0x503c22);sigil.material.emissiveIntensity=.2;}},
  inspect:()=>({lod:{enabled:lodEnabled,high:[...loadedModels.values()].filter(e=>e.scene.visible).length,low:[...loadedModels.values()].filter(e=>e.shell.visible).length},routes:(authority?.routes||[]).map(r=>({id:r.id,difficulty:r.difficulty,points:r.points.length})),routeDecks:authority?.routeSurfaces.length||0,landmarks:layout.landmarks.map(s=>({name:s.name,x:s.x,z:s.z})),batches:batches.size,theatre:modelState.playhouse==='model'?'model':'fallback',models:{...modelState},pages:pages.size,watcher:watcher.position.toArray()})
 };
};
