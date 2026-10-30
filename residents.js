'use strict';
window.gardenResidentDefinitions = [
 {id:'violet-trickster',name:'Violet Trickster',region:'Pavilion path',assetVersion:4,offset:0,speed:.43,pause:5,points:[[-4.6,7.2],[-4.7,5.2],[-3.4,4.8],[-2.5,6.4]]}
];

window.createGardenResidents = function(T,scene,{reduced=false,onChange=()=>{},renderer,sky}={}) {
 const start=performance.now(),epoch=Date.now()/1000,entries=new Map();
 const point=new T.Vector3(),tangent=new T.Vector3();
 let environment;
 if(renderer&&sky){
  const backdrop=new T.Scene();backdrop.add(sky.clone());
  const generator=new T.PMREMGenerator(renderer);
  environment=generator.fromScene(backdrop,0,.1,400).texture;generator.dispose();
 }
 for(const def of window.gardenResidentDefinitions){
  const curve=new T.CatmullRomCurve3(def.points.map(([x,z])=>new T.Vector3(x,0,z)),true,'centripetal');
  curve.arcLengthDivisions=500;
  entries.set(def.id,{def,curve,length:curve.getLength(),root:null,mixer:null,status:'loading',error:null,job:null});
 }
 function updateEntry(entry,time){
  if(!entry.root)return;
  const duration=entry.length/entry.def.speed,cycle=duration+entry.def.pause;
  const phase=reduced?entry.def.offset%cycle:(time+entry.def.offset)%cycle;
  const walking=!reduced&&phase<duration,u=Math.min(phase/duration,1);
  entry.curve.getPointAt(u,point);entry.curve.getTangentAt(u,tangent);
  entry.root.position.copy(point);entry.root.rotation.y=Math.atan2(tangent.x,tangent.z);
  const weight=walking?Math.min(1,phase/.35,(duration-phase)/.35):0;
  entry.walk.setEffectiveWeight(weight);entry.idle.setEffectiveWeight(1-weight);
  entry.mixer.setTime(reduced?0:phase);
  entry.animation=walking?'Walk':'Idle';
 }
 async function load(id){
  const entry=entries.get(id);if(!entry||entry.root)return;if(entry.job)return entry.job;
  entry.status='loading';entry.error=null;onChange();
  entry.job=(async()=>{
   try{
    const gltf=await showroomAssets.model('/residents/'+id+'.glb?v='+(entry.def.assetVersion||3));
    const walk=gltf.animations.find(c=>c.name==='Walk'),idle=gltf.animations.find(c=>c.name==='Idle');
    let skins=0;gltf.scene.traverse(n=>{if(n.isSkinnedMesh)skins++;});
    if(!skins||!walk||!idle)throw new Error('Resident needs a skin and Walk / Idle clips.');
    entry.root=gltf.scene;entry.root.name=entry.def.name;
    entry.root.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;n.frustumCulled=false;n.userData.residentId=id;
     if(entry.def.assetVersion===4&&environment)for(const material of Array.isArray(n.material)?n.material:[n.material]){material.envMap=environment;material.envMapIntensity=.85;material.needsUpdate=true;}
    }});
    entry.mixer=new T.AnimationMixer(entry.root);
    entry.walk=entry.mixer.clipAction(walk).play();entry.idle=entry.mixer.clipAction(idle).play();
    scene.add(entry.root);updateEntry(entry,epoch+(performance.now()-start)/1000);entry.status='ready';
   }catch(error){entry.status='error';entry.error='Model unavailable';console.warn('Garden resident unavailable:',id,error);}
   finally{entry.job=null;onChange();}
  })();return entry.job;
 }
 return {
  ready:Promise.all([...entries.keys()].map(load)),retry:load,
  update(){const time=epoch+(performance.now()-start)/1000;for(const entry of entries.values())updateEntry(entry,time);},
  get(id){return entries.get(id);},
  pick(raycaster,maxDistance=Infinity){return raycaster.intersectObjects([...entries.values()].flatMap(e=>e.root?[e.root]:[]),true).find(hit=>hit.distance<maxDistance)?.object.userData.residentId;},
  inspect(){return [...entries.values()].map(e=>({id:e.def.id,name:e.def.name,region:e.def.region,assetVersion:e.def.assetVersion||3,status:e.status,error:e.error,animation:e.animation,position:e.root?.position.toArray(),yaw:e.root?.rotation.y}));}
 };
};
