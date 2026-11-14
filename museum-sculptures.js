// Owner-supplied Meshy sculptures. Only nearby museum pieces occupy GPU memory.
export const exhibits = [
 {id:'ethereal-insight',title:'Ethereal Insight',x:2.15,z:2.25,height:1.15,w:1.35,d:1.35,base:1.0,turn:Math.PI/2,finish:'ivory'},
 {id:'neon-shamrock',title:'Neon Shamrock',x:7.05,z:2.5,height:1.35,w:1.35,d:1.1,base:.9,turn:-Math.PI/2,finish:'patina'},
 {id:'equine-reverie',title:'Equine Reverie',x:-.45,z:48.8,height:2.55,w:2.7,d:2.45,base:.75,turn:2.1,finish:'bronze'},
 {id:'lion-rampant',title:'Lion Rampant',x:10.45,z:48.8,height:2.2,w:2.55,d:2.25,base:.85,turn:-2.2,finish:'bronze'},
 {id:'absolute-darkness',title:'Absolute Darkness',x:-.45,z:58.3,height:2.75,w:2.7,d:2.5,base:.75,turn:2.5,finish:'pewter'},
 {id:'peaceful-flight',title:'Peaceful Flight',x:10.45,z:58.3,height:2.15,w:2.25,d:1.85,base:.95,turn:-2.5,finish:'ivory'},
 {id:'crimson-sentinel',title:'Crimson Sentinel',x:5,z:59.25,height:3.15,w:2.8,d:2.6,base:.8,turn:Math.PI,finish:'bronze'}
];

export function createMuseumSculptures(T,{place,solids,onChange=()=>{}}){
 const root=new T.Group();root.name='Museum sculpture collection';place.far.add(root);
 const ownedMaterials=new Set(),ownedTextures=new Set(),ownedGeometry=new Set();
 const keepG=g=>(ownedGeometry.add(g),g),keepM=m=>(ownedMaterials.add(m),m),keepT=t=>(ownedTextures.add(t),t);
 const colors={ivory:[.78,.75,.66],bronze:[.46,.29,.12],pewter:[.23,.27,.3],patina:[.19,.4,.32],plinth:[.77,.76,.71]};
 // A compact studio matcap gives the remote white gallery consistent sculptural lighting
 // without adding shadow maps or extra lights to every shader in the garden.
 function matcap(rgb){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(128,128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
   const nx=(x/127)*2-1,ny=1-(y/127)*2,r=nx*nx+ny*ny,nz=Math.sqrt(Math.max(0,1-r));
   const key=Math.max(0,-.42*nx+.64*ny+.64*nz),fill=Math.max(0,.72*nx+.25*ny+.65*nz);
   const highlight=.55*Math.pow(Math.max(0,-.27*nx+.43*ny+.86*nz),24)+.2*Math.pow(fill,32);
   const shade=.3+.64*key+.22*fill,edge=.78+.22*Math.pow(nz,.35),i=(y*128+x)*4;
   for(let c=0;c<3;c++)pixels.data[i+c]=Math.min(255,255*(rgb[c]*shade*edge+highlight));
   pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);const texture=keepT(new T.CanvasTexture(canvas));texture.colorSpace=T.SRGBColorSpace;
  return keepM(new T.MeshMatcapMaterial({matcap:texture,fog:false}));
 }
 const materials=Object.fromEntries(Object.entries(colors).map(([key,value])=>[key,matcap(value)]));
 const cube=keepG(new T.BoxGeometry(1,1,1)),plane=keepG(new T.PlaneGeometry(1,1));
 const trim=keepM(new T.MeshBasicMaterial({color:0x383936,fog:false}));
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
 const sc=shadowCanvas.getContext('2d'),gradient=sc.createRadialGradient(32,32,10,32,32,32);
 gradient.addColorStop(0,'rgba(0,0,0,.24)');gradient.addColorStop(1,'rgba(0,0,0,0)');sc.fillStyle=gradient;sc.fillRect(0,0,64,64);
 const shadow=keepM(new T.MeshBasicMaterial({map:keepT(new T.CanvasTexture(shadowCanvas)),transparent:true,depthWrite:false,fog:false}));
 function box(parent,w,h,d,y,material){const mesh=new T.Mesh(cube,material);mesh.scale.set(w,h,d);mesh.position.y=y;parent.add(mesh);return mesh;}
 const entries=exhibits.map((spec,index)=>{
  const mount=new T.Group();mount.name=spec.title+' plinth';mount.position.set(spec.x,0,spec.z);root.add(mount);
  box(mount,spec.w,.055,spec.d,.028,trim);
  box(mount,spec.w-.07,spec.base-.075,spec.d-.07,spec.base/2,materials.plinth);
  box(mount,spec.w,.035,spec.d,spec.base-.0175,materials.plinth);
  const contact=new T.Mesh(plane,shadow);contact.rotation.x=-Math.PI/2;contact.scale.set(spec.w+1,spec.d+1,1);contact.position.y=.004;mount.add(contact);
  const label=document.createElement('canvas');label.width=768;label.height=192;
  const texture=keepT(new T.CanvasTexture(label));texture.colorSpace=T.SRGBColorSpace;
  const plaque=new T.Mesh(plane,keepM(new T.MeshBasicMaterial({map:texture,fog:false,toneMapped:false})));
  plaque.scale.set(Math.min(spec.w-.2,1.35),Math.min(spec.w-.2,1.35)/4,1);plaque.rotation.y=Math.PI;
  plaque.position.set(0,spec.base*.55,-spec.d/2-.006);mount.add(plaque);
  const entry={spec,index,mount,label,texture,world:new T.Vector3(),model:null,controller:null,wanted:false,loading:false,retryAt:0,attempts:0,status:'idle'};
  const obstacle=[spec.x-spec.w/2-.3,spec.x+spec.w/2+.3,spec.z-spec.d/2-.3,spec.z+spec.d/2+.3];
  solids.push(obstacle);entry.obstacle=obstacle;
  setLabel(entry);return entry;
 });
 root.updateMatrixWorld(true);entries.forEach(e=>e.mount.getWorldPosition(e.world));
 let active=0,disposed=false;
 function setLabel(e){
  const ctx=e.label.getContext('2d');ctx.fillStyle='#242622';ctx.fillRect(0,0,768,192);
  ctx.textAlign='center';ctx.fillStyle='#f7f4ea';ctx.font='500 43px Georgia, serif';ctx.fillText(e.spec.title,384,78,704);
  ctx.fillStyle='#beb7a3';ctx.font='21px sans-serif';ctx.fillText(e.status==='failed'?'SCULPTURE UNAVAILABLE · RETRYING':e.loading?'LOADING SCULPTURE…':'BREAK THY RULE  /  '+String(e.index+1).padStart(2,'0'),384,133);
  e.texture.needsUpdate=true;
 }
 function disposeModel(model){
  const geometry=new Set(),mats=new Set();model.traverse(o=>{if(o.geometry)geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])if(!ownedMaterials.has(m))mats.add(m);});
  model.removeFromParent();geometry.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());
 }
 function release(e){
  e.controller?.abort();
  if(e.model){disposeModel(e.model);e.model=null;e.status='idle';}
 }
 async function load(e){
  active++;e.loading=true;e.status='loading';e.attempts++;const controller=new AbortController();e.controller=controller;setLabel(e);
  let model=null;const timeout=setTimeout(()=>controller.abort(),20000);
  try{
   const url='/assets/museum-sculptures/'+e.spec.id+'.glb';
   const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.arrayBuffer();if(controller.signal.aborted||disposed||!e.wanted)return;
   const gltf=await new window.ShowroomGLTFLoader().parseAsync(data,new URL('.',new URL(url,location.href)).href);model=gltf.scene;
   if(disposed||controller.signal.aborted||!e.wanted){disposeModel(model);model=null;return;}
   model.rotation.y=e.spec.turn;model.updateMatrixWorld(true);
   const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
   if(!Number.isFinite(size.y)||size.y<=0)throw Error('Empty sculpture');
   const scale=Math.min(e.spec.height/size.y,(e.spec.w-.16)/size.x,(e.spec.d-.16)/size.z);
   model.scale.setScalar(scale);model.position.set(-center.x*scale,e.spec.base+.015-bounds.min.y*scale,-center.z*scale);
   const originalMaterials=new Set();model.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)originalMaterials.add(m);o.material=materials[e.spec.finish];o.castShadow=false;o.receiveShadow=false;});
   originalMaterials.forEach(m=>m.dispose());model.name=e.spec.title+' sculpture';model.userData.museumSculpture=e.spec.id;
   e.mount.add(model);e.model=model;model=null;e.status='ready';onChange();
  }catch(error){
   if(model)disposeModel(model);
   if(!disposed&&e.wanted){e.status='failed';e.retryAt=performance.now()+15000;console.warn('Museum sculpture unavailable:',e.spec.id,error.message);}
  }finally{
   clearTimeout(timeout);active--;e.loading=false;if(e.controller===controller)e.controller=null;
   if(!disposed){if(!e.wanted&&!e.model)e.status='idle';setLabel(e);onChange();}
  }
 }
 return {
  update(cameraPosition,inside){
   if(disposed)return;
   for(const e of entries){const distance=inside?cameraPosition.distanceTo(e.world):Infinity;e.distance=distance;e.wanted=inside&&distance<(e.model||e.loading?34:24);if(!e.wanted)release(e);}
   for(const e of [...entries].sort((a,b)=>a.distance-b.distance)){
    if(active>=2)break;if(e.wanted&&!e.model&&!e.loading&&performance.now()>=e.retryAt)void load(e);
   }
  },
  inspect:()=>({active,loaded:entries.filter(e=>e.model).length,entries:entries.map(e=>({id:e.spec.id,status:e.status,attempts:e.attempts,world:e.world.toArray(),obstacle:[...e.obstacle]}))}),
  dispose(){
   if(disposed)return;disposed=true;entries.forEach(e=>{e.wanted=false;release(e);const i=solids.indexOf(e.obstacle);if(i>=0)solids.splice(i,1);});
   root.removeFromParent();ownedGeometry.forEach(g=>g.dispose());ownedMaterials.forEach(m=>m.dispose());ownedTextures.forEach(t=>t.dispose());
  }
 };
}
