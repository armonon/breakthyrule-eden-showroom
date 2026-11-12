'use strict';
// The museum: a small white pavilion west of the library whose door opens onto a white gallery world, built like the
// black box's but hung with Break Thy Rule's own images. Hall A holds the art wall and the garment rack; a gallery
// corridor leads to Hall B, and from there a second gallery runs east until it fades into white. Hall B's west door
// opens onto the Broadcast Room (broadcast.js): walls of analog TVs looping three YouTube channels.
// Laid out in the doorway's frame (+x through the door, which faces east toward the library).
window.createMuseum=function createMuseum(T,pockets,{onChange=()=>{},camera=null,stage=null}={}){
 const width=2.2,height=3.4,m=.3,{rect}=pockets;
 const hallA={x0:.9,x1:9.6,z0:-4.45,z1:4.45,h:6},showroom=new T.Vector3(5.25,0,0); // the old pavilion layout, turned to face the door
 const galleryOne={x0:3.6,x1:6.6,z0:4.65,z1:44.65,h:4},hallB={x0:-4,x1:14,z0:44.85,z1:62.85,h:9},galleryTwo={x0:14.2,x1:262,z0:52.35,z1:55.35,h:4};
 const broadcastRoom={x0:-14.2,x1:-4.2,z0:49.35,z1:58.35,h:5},broadcastDoor={z0:51.85,z1:55.85,h:4};
 let broadcast=null,sculptures=null,sculptureLoading=false,sculptureRetryAt=0,exhibition=null,exhibitionLoading=false,exhibitionRetryAt=0;
 const solids=[rect(showroom.x+3.1-.09-m,showroom.x+3.1+.09+m,-3.8-m,3.8+m),rect(showroom.x-4,showroom.x+3,hallA.z0,-2.6)];
 function loadSculptures(){
  if(sculptures||sculptureLoading||performance.now()<sculptureRetryAt)return;
  sculptureLoading=true;
  import('/museum-sculptures.js?v=1').then(module=>{sculptures=module.createMuseumSculptures(T,{place,solids,onChange});onChange();})
   .catch(error=>{sculptureRetryAt=performance.now()+5000;console.warn('Museum sculpture display unavailable:',error.message);})
   .finally(()=>{sculptureLoading=false;});
 }
 function loadExhibition(){
  if(exhibition||exhibitionLoading||performance.now()<exhibitionRetryAt)return;
  exhibitionLoading=true;
  import('/museum-exhibition.js?v=1').then(module=>module.createMuseumExhibition(T,{place,camera,stage,onChange}))
   .then(result=>{exhibition=result;onChange();})
   .catch(error=>{exhibitionRetryAt=performance.now()+5000;console.warn('Museum exhibition unavailable:',error.message);})
   .finally(()=>{exhibitionLoading=false;});
 }
 const body=rect(-1.25-m,4.5+m,-3-m,3+m),tunnel=rect(-2.5,1-.25,-width/2+m,width/2-m);
 const columns=[-2.55,-1.75,1.75,2.55].map(z=>new T.Vector3(-2.35,0,z));
 const place=pockets.place({name:'Museum',caption:['THE MUSEUM','BREAKTHYRULE / THE GALLERY'],
  position:new T.Vector3(-9,0,-1),rotation:Math.PI,offset:new T.Vector3(-1000,0,0),width,height,beyond:1,behind:1.5,
  walk:[rect(-.7,1.2,-width/2+m,width/2-m),rect(hallA.x0+m,hallA.x1-m,hallA.z0+m,hallA.z1-m),
   rect(galleryOne.x0+m,galleryOne.x1-m,hallA.z1-.6,hallB.z0+.6),rect(hallB.x0+m,hallB.x1-m,hallB.z0+m,hallB.z1-m),
   rect(hallB.x1-.6,galleryTwo.x1-m,galleryTwo.z0+m,galleryTwo.z1-m),
   rect(broadcastRoom.x0+m,broadcastRoom.x1-m,broadcastRoom.z0+m,broadcastRoom.z1-m),rect(broadcastRoom.x1-.6,hallB.x0+.6,broadcastDoor.z0+m,broadcastDoor.z1-m),rect(34.3,45.7,67.3,76.7)],
  // the art wall and the garment rack (see adopt)
  solid:solids,
  blocksOutside:q=>(q.x>body[0]&&q.x<body[1]&&q.z>body[2]&&q.z<body[3]&&!(q.x>tunnel[0]&&q.x<tunnel[1]&&q.z>tunnel[2]&&q.z<tunnel[3]))||columns.some(c=>Math.hypot(q.x-c.x,q.z-c.z)<.19+m),
  enclosedOutside:q=>q.x>-1.25&&q.x<1&&Math.abs(q.z)<width/2,
  update:(camPos,inside)=>{if(inside){loadSculptures();loadExhibition();}sculptures?.update(camPos,inside);exhibition?.update(camPos,inside);broadcast?.update(camPos,inside);}});

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
 there.room(hallB.x0,hallB.x1,hallB.z0,hallB.z1,hallB.h,[{side:'n',from:galleryOne.x0,to:galleryOne.x1,height:galleryOne.h},{side:'e',from:galleryTwo.z0,to:galleryTwo.z1,height:galleryTwo.h},{side:'w',from:broadcastDoor.z0,to:broadcastDoor.z1,height:broadcastDoor.h}]);
 there.room(galleryTwo.x0,galleryTwo.x1,galleryTwo.z0,galleryTwo.z1,galleryTwo.h,[{side:'w',from:galleryTwo.z0,to:galleryTwo.z1}]);
 there.finish(); // the Broadcast Room builds its own shell (broadcast.js), so it can go dark
 if(camera&&stage&&window.createBroadcastRoom)broadcast=window.createBroadcastRoom(T,{place,room:broadcastRoom,door:broadcastDoor,camera,stage,fade:pockets.surface.uniforms,onChange});

 // The art wall and garment rack move in from the old pavilion: Hall A is that pavilion, turned so the art wall faces
 // the door and the rack lines the north wall. The pavilion's camera views follow them.
 function adopt(room,rack){
  place.far.add(room);room.position.copy(showroom);room.rotation.set(0,-Math.PI/2,0);
  if(rack){room.add(rack);rack.position.set(-3.12,0,.5);rack.rotation.set(0,Math.PI/2,0);}
  room.updateMatrixWorld(true);
  // The new exhibition supplies this wall. Keep the garment rack and physical wall.
  room.traverse(node=>{if(node.userData.poster){node.parent.visible=false;node.raycast=()=>{};}});
 }
 const views=window.showroomCameraView,room=()=>place.far.getObjectByName('Break Thy Rule garden pavilion');
 window.showroomCameraView=function(aspect,view){
  const preset=views(aspect,view),hall=room();
  if(hall&&['approach','wall','lookbook','film'].includes(view)){const to=a=>hall.localToWorld(new T.Vector3(a[0]+10,a[1],a[2])).toArray();preset.position=to(preset.position);preset.aim=to(preset.aim);}
  return preset;
 };
 loadSculptures();
 loadExhibition();
 return Object.assign(place,{adopt,pickables:[...(broadcast?.pickables||[])],broadcast:()=>broadcast,sculptures:()=>sculptures,exhibition:()=>exhibition});
};
