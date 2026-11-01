'use strict';
// The museum: a small white pavilion west of the library whose door opens onto a white gallery world, built like the
// black box's but hung with Break Thy Rule's own images. Hall A holds the art wall and the garment rack; a gallery
// corridor leads to Hall B, and from there a second gallery runs east until it fades into white.
// Laid out in the doorway's frame (+x through the door, which faces east toward the library).
window.createMuseum=function createMuseum(T,pockets,{onChange=()=>{}}={}){
 const width=2.2,height=3.4,m=.3,{rect}=pockets;
 const hallA={x0:.9,x1:9.6,z0:-4.45,z1:4.45,h:6},showroom=new T.Vector3(5.25,0,0); // the old pavilion layout, turned to face the door
 const galleryOne={x0:3.6,x1:6.6,z0:4.65,z1:44.65,h:4},hallB={x0:-4,x1:14,z0:44.85,z1:62.85,h:9},galleryTwo={x0:14.2,x1:150,z0:52.35,z1:55.35,h:4};
 const body=rect(-1.25-m,4.5+m,-3-m,3+m),tunnel=rect(-2.5,1-.25,-width/2+m,width/2-m);
 const columns=[-2.55,-1.75,1.75,2.55].map(z=>new T.Vector3(-2.35,0,z));
 const place=pockets.place({name:'Museum',caption:['THE MUSEUM','BREAKTHYRULE / THE GALLERY'],
  position:new T.Vector3(-9,0,-1),rotation:Math.PI,offset:new T.Vector3(-1000,0,0),width,height,beyond:1,behind:1.5,
  walk:[rect(-.7,1.2,-width/2+m,width/2-m),rect(hallA.x0+m,hallA.x1-m,hallA.z0+m,hallA.z1-m),
   rect(galleryOne.x0+m,galleryOne.x1-m,hallA.z1-.6,hallB.z0+.6),rect(hallB.x0+m,hallB.x1-m,hallB.z0+m,hallB.z1-m),
   rect(hallB.x1-.6,galleryTwo.x1-m,galleryTwo.z0+m,galleryTwo.z1-m)],
  // the art wall and the garment rack (see adopt)
  solid:[rect(showroom.x+3.1-.09-m,showroom.x+3.1+.09+m,-3.8-m,3.8+m),rect(showroom.x-4,showroom.x+3,hallA.z0,-2.6)],
  blocksOutside:q=>(q.x>body[0]&&q.x<body[1]&&q.z>body[2]&&q.z<body[3]&&!(q.x>tunnel[0]&&q.x<tunnel[1]&&q.z>tunnel[2]&&q.z<tunnel[3]))||columns.some(c=>Math.hypot(q.x-c.x,q.z-c.z)<.19+m),
  enclosedOutside:q=>q.x>-1.25&&q.x<1&&Math.abs(q.z)<width/2,
  update:(camera,inside)=>{if(inside)for(const frame of frames)if(!frame.loaded&&frame.world.distanceTo(camera)<26)load(frame);}});

 // Outside: plaster walls around a single doorway, a portico of four columns and a cornice.
 const plaster=new T.MeshStandardMaterial({color:0xffffff,roughness:1,emissive:0xffffff,emissiveIntensity:.35});
 const trim=new T.MeshStandardMaterial({color:0xe7e8e8,roughness:.85});
 function block(x0,x1,y0,y1,z0,z1,material=plaster){
  const mesh=new T.Mesh(new T.BoxGeometry(x1-x0,y1-y0,z1-z0),material);mesh.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);
  mesh.castShadow=mesh.receiveShadow=true;place.real.add(mesh);return mesh;
 }
 // The building is solid apart from the short tunnel to the threshold (its white lining sits inside these blocks).
 block(-1.25,4.5,0,4.6,-3,-1.3);block(-1.25,4.5,0,4.6,1.3,3);block(-1.25,4.5,3.6,4.6,-1.3,1.3);block(1.2,4.5,0,3.6,-1.3,1.3);
 block(-2.75,4.7,4.6,4.85,-3.2,3.2,trim);block(-2.75,-1.25,4.45,4.6,-3.2,3.2,trim);block(-3,-1.25,0,.06,-3.2,3.2,trim);
 block(-1.32,-1.25,0,3.72,-1.42,-1.1,trim);block(-1.32,-1.25,0,3.72,1.1,1.42,trim);block(-1.32,-1.25,3.4,3.72,-1.42,1.42,trim);
 for(const c of columns){
  const shaft=new T.Mesh(new T.CylinderGeometry(.17,.19,4.2,20),plaster);shaft.position.set(c.x,2.3,c.z);shaft.castShadow=true;place.real.add(shaft);
  block(c.x-.26,c.x+.26,4.33,4.45,c.z-.26,c.z+.26,trim);block(c.x-.25,c.x+.25,.06,.2,c.z-.25,c.z+.25,trim);
 }
 const sign=document.createElement('canvas');sign.width=1024;sign.height=128;
 const ink=sign.getContext('2d');ink.fillStyle='#4a4b48';ink.font='600 64px Georgia, serif';ink.textAlign='center';ink.textBaseline='middle';
 ink.letterSpacing='18px';ink.fillText('THE MUSEUM',512,66);
 const signTexture=new T.CanvasTexture(sign);signTexture.colorSpace=T.SRGBColorSpace;
 const plaque=new T.Mesh(new T.PlaneGeometry(3.6,.45),new T.MeshStandardMaterial({map:signTexture,transparent:true,roughness:1}));
 plaque.position.set(-1.33,4.08,0);plaque.rotation.y=-Math.PI/2;place.real.add(plaque);
 const here=pockets.white('Museum doorway',place.real);
 here.room(-1.05,1,-width/2,width/2,height,[{side:'w',from:-width/2,to:width/2}]);here.finish();

 // Inside: white rooms like the black box's.
 const there=place.white;
 there.room(-1,.7,-width/2,width/2,height,[{side:'e',from:-width/2,to:width/2}]);
 there.room(hallA.x0,hallA.x1,hallA.z0,hallA.z1,hallA.h,[{side:'w',from:-width/2,to:width/2,height},{side:'s',from:galleryOne.x0,to:galleryOne.x1,height:galleryOne.h}]);
 there.room(galleryOne.x0,galleryOne.x1,galleryOne.z0,galleryOne.z1,galleryOne.h,[{side:'n',from:galleryOne.x0,to:galleryOne.x1},{side:'s',from:galleryOne.x0,to:galleryOne.x1}]);
 there.room(hallB.x0,hallB.x1,hallB.z0,hallB.z1,hallB.h,[{side:'n',from:galleryOne.x0,to:galleryOne.x1,height:galleryOne.h},{side:'e',from:galleryTwo.z0,to:galleryTwo.z1,height:galleryTwo.h}]);
 there.room(galleryTwo.x0,galleryTwo.x1,galleryTwo.z0,galleryTwo.z1,galleryTwo.h,[{side:'w',from:galleryTwo.z0,to:galleryTwo.z1}]);
 there.finish();

 // Pictures: every product photograph and art-wall piece, framed in turn along the galleries (and around again).
 const seen=new Set(),pictures=[];
 const add=(name,file,alt)=>{if(!file||seen.has(file))return;seen.add(file);pictures.push({name,file,alt:alt||name});};
 for(const art of window.showroomArtwork.filter(a=>!a.lookbook))add(art.name,art.file,art.alt);
 for(const item of window.showroomCollection)item.images.forEach((file,i)=>add(item.images.length>1?item.name+' / '+(i+1):item.name,file,item.imageAlt));
 const frames=[],frameMaterial=new T.MeshBasicMaterial({color:0x1d1d1c,fog:false}),matMaterial=new T.MeshBasicMaterial({color:0xf7f6f2,toneMapped:false,fog:false}),blank=new T.PlaneGeometry(1,1),edgeBox=new T.BoxGeometry(1,1,1);
 const loader=new T.TextureLoader(),textures=new Map();
 function hang(x,z,turn,maxWidth,maxHeight,y){
  const picture=pictures[frames.length%pictures.length],normal=new T.Vector3(Math.sin(turn),0,Math.cos(turn));
  const group=new T.Group();group.position.set(x,y,z).addScaledVector(normal,.035);group.rotation.y=turn;place.far.add(group);
  const border=new T.Mesh(edgeBox,frameMaterial);border.position.z=-.03;group.add(border);
  // A white mat behind each picture, so product shots on transparent backgrounds sit on white.
  const backing=new T.Mesh(blank,matMaterial);backing.position.z=-.004;group.add(backing);
  const mesh=new T.Mesh(blank,new T.MeshBasicMaterial({color:0xdedede,transparent:true,toneMapped:false,fog:false}));mesh.userData.poster=picture;mesh.name=picture.name;group.add(mesh);
  const frame={picture,mesh,backing,border,maxWidth,maxHeight,loaded:false,world:new T.Vector3()};
  fit(frame,1);place.far.updateMatrixWorld();group.getWorldPosition(frame.world);frames.push(frame);
 }
 function fit(frame,aspect){
  const w=Math.min(frame.maxWidth,frame.maxHeight*aspect),h=w/aspect;
  frame.mesh.scale.set(w,h,1);frame.backing.scale.set(w,h,1);frame.border.scale.set(w+.07,h+.07,.04);
 }
 function load(frame){
  frame.loaded=true;const file=frame.picture.file;
  if(!textures.has(file))textures.set(file,new Promise(resolve=>loader.load(file,texture=>{texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;resolve(texture);},undefined,()=>resolve(null))));
  textures.get(file).then(texture=>{if(!texture)return;frame.mesh.material.map=texture;frame.mesh.material.color.set(0xffffff);frame.mesh.material.needsUpdate=true;
   fit(frame,texture.image.width/texture.image.height);onChange();});
 }
 for(let z=7;z<=43;z+=3){hang(galleryOne.x0,z,Math.PI/2,1.5,1.5,1.75);hang(galleryOne.x1,z,-Math.PI/2,1.5,1.5,1.75);}
 for(const z of [48.5,53.85,59.2])hang(hallB.x0,z,Math.PI/2,3.2,3.2,3.2);
 for(const x of [-.5,5,10.5])hang(x,hallB.z1,Math.PI,3.2,3.2,3.2);
 for(const x of [-1,11])hang(x,hallB.z0,0,3.2,3.2,3.2);
 for(const z of [48,59.5])hang(hallB.x1,z,-Math.PI/2,3.2,3.2,3.2);
 for(let x=17;x<=148;x+=3){hang(x,galleryTwo.z0,0,1.5,1.5,1.75);hang(x,galleryTwo.z1,Math.PI,1.5,1.5,1.75);}

 // The art wall and garment rack move in from the old pavilion: Hall A is that pavilion, turned so the art wall faces
 // the door and the rack lines the north wall. The pavilion's camera views follow them.
 function adopt(room,rack){
  place.far.add(room);room.position.copy(showroom);room.rotation.set(0,-Math.PI/2,0);
  if(rack){room.add(rack);rack.position.set(-3.12,0,.5);rack.rotation.set(0,Math.PI/2,0);}
  room.updateMatrixWorld(true);
 }
 const views=window.showroomCameraView,room=()=>place.far.getObjectByName('Break Thy Rule garden pavilion');
 window.showroomCameraView=function(aspect,view){
  const preset=views(aspect,view),hall=room();
  if(hall&&['approach','wall','lookbook','film'].includes(view)){const to=a=>hall.localToWorld(new T.Vector3(a[0]+10,a[1],a[2])).toArray();preset.position=to(preset.position);preset.aim=to(preset.aim);}
  return preset;
 };
 return Object.assign(place,{adopt,pickables:frames.map(f=>f.mesh)});
};
