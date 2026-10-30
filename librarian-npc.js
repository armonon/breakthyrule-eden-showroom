'use strict';
window.createLibrarianNPC=function(T,scene,{reduced=false,onLoad=()=>{}}={}){
 const root=new T.Group();root.name='Rigged 3D librarian';root.position.set(6.3,0,-5.3);root.rotation.y=-Math.PI/2;scene.add(root);
 const pickables=[],direction=new T.Vector3(),turn=new T.Quaternion(),up=new T.Vector3(0,1,0);
 const bounce=new T.PointLight(0xfff1dd,3.5,4,2);bounce.position.set(0,1.7,1.5);root.add(bounce);
 let mixer=null,head=null,talking=false,previous=null,headRest=null;
 function addBook(){
  const book=new T.Group();book.name='Open book on lap';book.position.set(-.015,.745,.35);book.rotation.x=-.13;root.add(book);
  const cover=new T.MeshStandardMaterial({color:0x543644,roughness:.85}),paper=new T.MeshStandardMaterial({color:0xece4cd,roughness:1}),ink=new T.MeshStandardMaterial({color:0x777466,roughness:1});
  for(const side of [-1,1]){
   const leaf=new T.Group();leaf.position.x=side*.075;leaf.rotation.z=side*.10;book.add(leaf);
   for(const [w,h,d,y,material]of[[.154,.014,.225,0,cover],[.145,.018,.215,.016,paper]]){
    const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);mesh.position.y=y;leaf.add(mesh);
   }
   for(let i=0;i<10;i++){const line=new T.Mesh(new T.BoxGeometry(.107,.001,.0017),ink);line.position.set(0,.026,-.083+i*.017);leaf.add(line);}
  }
 }
 let job=null,loaded=false,retryAt=0;
 function load(){
 if(loaded||Date.now()<retryAt)return Promise.resolve();if(job)return job;
 job=showroomAssets.model('/assets/librarian-seated.glb').then(gltf=>{
  const model=gltf.scene;model.name='Seated librarian model';model.scale.setScalar(.0105);model.position.z=.195;root.add(model);
  mixer=new T.AnimationMixer(model);
  if(gltf.animations.length){
   const clip=gltf.animations[0];
   // Some exporters retain the source timeline offset; normalize every track together.
   const start=Math.min(...clip.tracks.map(track=>track.times[0]));
   clip.tracks.forEach(track=>track.shift(-start));clip.resetDuration();
   mixer.clipAction(clip).setLoop(T.LoopPingPong,Infinity).play();mixer.update(0);
  }
  model.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(model,true);model.position.y+=.035-bounds.min.y;
  head=model.getObjectByName('head');if(head)headRest=head.quaternion.clone();
  addBook();
  root.traverse(object=>{
   if(!object.isMesh)return;
   object.userData.librarian=true;object.castShadow=true;object.receiveShadow=true;object.frustumCulled=false;pickables.push(object);
   for(const material of [].concat(object.material)){material.side=T.DoubleSide;if(material.map)material.map.anisotropy=8;}
  });
  loaded=true;onLoad();
 }).catch(()=>{retryAt=Date.now()+30000;}).finally(()=>{job=null;});return job;
 }
 return {root,pickables,marker:new T.Vector3(6.3,1.75,-5.3),load,setTalking(value){talking=value;if(value)load();},update(time,camera){
  if(!mixer)return;
  if(head&&headRest)head.quaternion.copy(headRest);
  const dt=previous===null?0:Math.min(Math.max(time-previous,0),.05);previous=time;
  if(!reduced)mixer.update(dt*(talking?.75:.35));
  if(head){
   headRest.copy(head.quaternion);
   if(camera&&talking){root.updateMatrixWorld(true);direction.copy(camera.position);root.worldToLocal(direction);const yaw=T.MathUtils.clamp(Math.atan2(direction.x,direction.z),-.38,.38);head.quaternion.multiply(turn.setFromAxisAngle(up,yaw));}
  }
 }};
};
